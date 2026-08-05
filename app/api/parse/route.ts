import { NextResponse } from "next/server";
import {
  extractProfileFromAttachmentWithAgentRun,
  extractProfileWithAgentRun,
  ProfileAgentError,
  type AgentAttachment,
  type ProfileAgentSource,
} from "@/lib/agents/profile-agent";
import { summarizeAgentRun } from "@/lib/agent-runtime/trace-summary";
import { createAgentTracer, type AgentTracer } from "@/lib/agent-runtime/tracer";
import type { ExtractedMedia } from "@/lib/extract-webpage";
import { validatePublicUrl } from "@/lib/public-web";
import { preparsePdf } from "@/lib/pdf-preparse";
import { mergeProfilesWithReport } from "@/lib/profile-merge";
import { readBrowserAgentConfigHeaders } from "@/lib/browser-agent-config";
import type { AgentProviderOverride } from "@/lib/agents/provider-config";
import {
  prefetchWebsiteResearchRoot,
  publicWebsiteResearchSnapshot,
  runWebsiteResearchAgent,
  type WebsiteResearchPrefetch,
} from "@/lib/agents/website/agent";
import type { ParsedProfile } from "@/lib/types";

export const runtime = "edge";

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const TEXT_EXTENSIONS = new Set([
  "txt", "md", "markdown", "html", "htm", "json", "csv", "tsv", "xml", "yaml", "yml", "rtf", "log",
]);
const IMAGE_TYPES = new Set<AgentAttachment["mediaType"]>([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

type ParseJsonBody = {
  text?: string;
  label?: string;
  sourceType?: "text" | "url";
  sourceId?: string;
  media?: ExtractedMedia[];
  followWebsite?: boolean;
};

type WebsiteAgentResult = {
  profile?: ParsedProfile;
  pageUrl?: string;
  research?: ReturnType<typeof publicWebsiteResearchSnapshot>;
  error?: string;
  errorStatus?: number;
};

type WebsiteAgentTask = {
  website: string;
  providerConfig?: AgentProviderOverride;
  prefetch: Promise<{ value?: WebsiteResearchPrefetch; error?: string; errorStatus?: number }>;
};

function publicErrorStatus(error: unknown) {
  if (!error || typeof error !== "object" || !("status" in error) || typeof error.status !== "number") return undefined;
  return error.status >= 400 && error.status <= 599 ? error.status : undefined;
}

function fileExtension(name: string) {
  return name.split(".").pop()?.toLowerCase() || "";
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function requestProviderConfig(request: Request): AgentProviderOverride | undefined {
  const config = readBrowserAgentConfigHeaders(request.headers);
  if (!config) return undefined;
  if (config.maasApiKey.length > 1_024 || config.websiteApiKey.length > 1_024) {
    throw new ProfileAgentError("API Key 长度不合法。", 400);
  }
  if (config.maasModel.length > 200 || config.websiteModel.length > 200) {
    throw new ProfileAgentError("模型名称过长。", 400);
  }
  const safeBaseUrl = (value: string, label: string) => {
    try {
      const url = validatePublicUrl(value);
      if (url.protocol !== "https:" || url.search || url.hash) throw new Error("unsafe provider URL");
      return url.href.replace(/\/$/, "");
    } catch {
      throw new ProfileAgentError(`${label} 必须是公开的 HTTPS 地址。`, 400);
    }
  };
  return {
    ...config,
    maasBaseUrl: safeBaseUrl(config.maasBaseUrl, "MAAS Base URL"),
    websiteBaseUrl: safeBaseUrl(config.websiteBaseUrl, "Website Agent Base URL"),
  };
}

function startWebsiteAgent(
  website: string,
  providerConfig: AgentProviderOverride | undefined,
  tracer: AgentTracer,
): WebsiteAgentTask {
  const prefetch = prefetchWebsiteResearchRoot({ rootUrl: website, tracer }).then(
    (value) => ({ value }),
    (error) => ({
      error: error instanceof Error ? error.message : "个人网站补充失败。",
      errorStatus: publicErrorStatus(error),
    }),
  );
  return { website, providerConfig, prefetch };
}

async function runWebsiteAgent(task: WebsiteAgentTask, profile: ParsedProfile | undefined, tracer: AgentTracer): Promise<WebsiteAgentResult> {
  const prefetched = await task.prefetch;
  if (!prefetched.value) return {
    error: prefetched.error || "个人网站补充失败。",
    errorStatus: prefetched.errorStatus,
  };
  try {
    const result = await runWebsiteResearchAgent({
      rootUrl: task.website,
      currentProfile: profile,
      tracer,
      prefetchedRoot: prefetched.value,
      submitter: async ({ text, label, sourceId, media }) => (await extractProfileWithAgentRun(text, {
        id: sourceId,
        type: "url",
        label,
        media,
        format: "text",
      }, {
        providerScope: "website",
        providerConfig: task.providerConfig,
        tracer,
        stepPrefix: "website",
      })).profile,
    });
    return {
      profile: result.profile,
      pageUrl: result.state.rootUrl,
      research: publicWebsiteResearchSnapshot(result.state),
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "个人网站补充失败。",
      errorStatus: publicErrorStatus(error),
    };
  }
}

async function enrichFromWebsite(
  profile: ParsedProfile,
  originalLabel: string,
  website: string,
  pendingTask?: WebsiteAgentTask,
  providerConfig?: AgentProviderOverride,
  tracer?: AgentTracer,
) {
  if (!tracer) throw new ProfileAgentError("Agent Trace 未初始化。", 500);
  const task = pendingTask?.website === website ? pendingTask : startWebsiteAgent(website, providerConfig, tracer);
  const websiteResult = await runWebsiteAgent(task, profile, tracer);
  if (websiteResult.profile && websiteResult.pageUrl) {
    tracer.emit({ type: "step.started", step: "profile.merge", attempt: 1 });
    const mergeReport = mergeProfilesWithReport(profile, websiteResult.profile, `${originalLabel} + ${websiteResult.pageUrl}`);
    tracer.emit({ type: "artifact.created", step: "profile.merge", name: "merged-profile.json", schemaVersion: "profile.v1" });
    tracer.emit({
      type: "artifact.created",
      step: "profile.merge",
      name: "profile-merge-report.json",
      schemaVersion: mergeReport.schemaVersion,
    });
    tracer.emit({ type: "step.completed", step: "profile.merge" });
    return {
      profile: mergeReport.merged,
      ...(mergeReport.reviewRequired ? { mergeReport } : {}),
      enrichment: {
        attempted: true,
        succeeded: true,
        website: websiteResult.pageUrl,
        research: websiteResult.research,
      },
    };
  }
  return {
    profile,
    enrichment: {
      attempted: true,
      succeeded: false,
      website,
      error: websiteResult.error || "个人网站补充失败。",
    },
  };
}

async function enrichFromPersonalWebsite(
  profile: ParsedProfile,
  originalLabel: string,
  pendingTask?: WebsiteAgentTask,
  providerConfig?: AgentProviderOverride,
  tracer?: AgentTracer,
) {
  const website = profile.personalWebsite;
  if (!website) return { profile, enrichment: { attempted: false, succeeded: false } };
  return enrichFromWebsite(profile, originalLabel, website, pendingTask, providerConfig, tracer);
}

async function parseJson(request: Request, tracer: AgentTracer, providerConfig?: AgentProviderOverride) {
  const body = await request.json() as ParseJsonBody;
  tracer.emit({ type: "step.started", step: "source.prepare", attempt: 1 });
  const source: ProfileAgentSource = {
    id: body.sourceId,
    type: body.sourceType || "text",
    label: body.label || "Pasted source",
    media: body.media || [],
    format: "text",
  };
  if (source.type === "url" && source.id) {
    let website: string | undefined;
    try {
      website = validatePublicUrl(source.id).href;
    } catch {
      // Compatibility path: callers may supply extracted page text with a non-URL source id.
    }
    if (website) {
      tracer.emit({ type: "artifact.created", step: "source.prepare", name: "website-root.json", schemaVersion: "website-root.v1" });
      tracer.emit({ type: "step.completed", step: "source.prepare" });
      const result = await runWebsiteAgent(startWebsiteAgent(website, providerConfig, tracer), undefined, tracer);
      if (!result.profile) throw new ProfileAgentError(result.error || "个人网站研究失败。", result.errorStatus || 502);
      return {
        profile: result.profile,
        enrichment: {
          attempted: true,
          succeeded: true,
          website: result.pageUrl,
          research: result.research,
        },
      };
    }
  }
  const shouldFollowWebsite = body.followWebsite !== false && source.type !== "url";
  let websiteTask: WebsiteAgentTask | undefined;
  tracer.emit({ type: "artifact.created", step: "source.prepare", name: "prepared-source.json", schemaVersion: "source.v1" });
  tracer.emit({ type: "step.completed", step: "source.prepare" });
  const profileRun = await extractProfileWithAgentRun(body.text || "", source, {
    providerScope: source.type === "url" ? "website" : "resume",
    providerConfig,
    tracer,
    stepPrefix: source.type === "url" ? "website" : "profile",
    ...(shouldFollowWebsite ? {
      onPersonalWebsite: (website: string) => {
        websiteTask ||= startWebsiteAgent(website, providerConfig, tracer);
      },
    } : {}),
  });
  const profile = profileRun.profile;
  if (!shouldFollowWebsite) {
    return { profile, enrichment: { attempted: false, succeeded: false } };
  }
  return enrichFromPersonalWebsite(profile, source.label || "Uploaded source", websiteTask, providerConfig, tracer);
}

async function parseFile(request: Request, tracer: AgentTracer, providerConfig?: AgentProviderOverride) {
  tracer.emit({ type: "step.started", step: "source.prepare", attempt: 1 });
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new ProfileAgentError("请选择要解析的文件。", 400);
  if (!file.size) throw new ProfileAgentError("上传的文件为空。", 400);
  if (file.size > MAX_UPLOAD_BYTES) throw new ProfileAgentError("文件不能超过 15 MB。", 413);
  const extension = fileExtension(file.name);
  const baseSource: ProfileAgentSource = { type: "text", label: file.name };
  const shouldFollowWebsite = form.get("followWebsite") !== "false";
  const explicitWebsiteValue = form.get("website");
  let explicitWebsite = "";
  if (typeof explicitWebsiteValue === "string" && explicitWebsiteValue.trim()) {
    try {
      explicitWebsite = validatePublicUrl(explicitWebsiteValue.trim()).href;
    } catch {
      throw new ProfileAgentError("请输入可公开访问的个人网站地址。", 400);
    }
  }
  let websiteTask: WebsiteAgentTask | undefined = explicitWebsite
    ? startWebsiteAgent(explicitWebsite, providerConfig, tracer)
    : undefined;
  const agentOptions = {
    providerScope: "resume" as const,
    providerConfig,
    tracer,
    stepPrefix: "profile" as const,
    ...(shouldFollowWebsite && !explicitWebsite ? {
      onPersonalWebsite: (website: string) => {
        websiteTask ||= startWebsiteAgent(website, providerConfig, tracer);
      },
    } : {}),
  };
  tracer.emit({ type: "artifact.created", step: "source.prepare", name: "prepared-source.json", schemaVersion: "source.v1" });
  tracer.emit({ type: "step.completed", step: "source.prepare" });
  let profile: ParsedProfile;
  if (file.type === "application/pdf" || extension === "pdf") {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const data = bytesToBase64(bytes);
    const preparsed = await preparsePdf(bytes).catch(() => null);
    profile = (await extractProfileFromAttachmentWithAgentRun(
      { mediaType: "application/pdf", data },
      { ...baseSource, format: "pdf", pageCount: preparsed?.pageCount },
      preparsed?.text || "",
      agentOptions,
    )).profile;
  } else if (IMAGE_TYPES.has(file.type as AgentAttachment["mediaType"])) {
    const data = bytesToBase64(new Uint8Array(await file.arrayBuffer()));
    profile = (await extractProfileFromAttachmentWithAgentRun(
      { mediaType: file.type as Exclude<AgentAttachment["mediaType"], "application/pdf">, data },
      { ...baseSource, format: "image" },
      "",
      agentOptions,
    )).profile;
  } else if (file.type.startsWith("text/") || TEXT_EXTENSIONS.has(extension)) {
    profile = (await extractProfileWithAgentRun(await file.text(), { ...baseSource, format: "text" }, agentOptions)).profile;
  } else {
    throw new ProfileAgentError("当前支持 PDF、JPG、PNG、GIF、WebP 和常见文本/网页数据文件。", 415);
  }
  if (explicitWebsite) {
    return enrichFromWebsite(profile, file.name, explicitWebsite, websiteTask, providerConfig, tracer);
  }
  return !shouldFollowWebsite
    ? { profile, enrichment: { attempted: false, succeeded: false } }
    : enrichFromPersonalWebsite(profile, file.name, websiteTask, providerConfig, tracer);
}

function requestedRunId(request: Request) {
  const value = request.headers.get("x-room-agent-run-id")?.trim() || "";
  return /^[a-zA-Z0-9_-]{8,100}$/.test(value) ? value : undefined;
}

export async function POST(request: Request) {
  const tracer = createAgentTracer(requestedRunId(request));
  try {
    const providerConfig = requestProviderConfig(request);
    const contentType = request.headers.get("content-type") || "";
    const result = contentType.includes("multipart/form-data")
      ? await parseFile(request, tracer, providerConfig)
      : await parseJson(request, tracer, providerConfig);
    tracer.complete();
    const run = tracer.snapshot()!;
    return NextResponse.json({ ...result, run, trace: summarizeAgentRun(run.events) });
  } catch (error) {
    tracer.fail(error instanceof ProfileAgentError ? `profile_agent_${error.status}` : "profile_agent_failed");
    const timedOut = error instanceof DOMException && ["TimeoutError", "AbortError"].includes(error.name);
    const status = error instanceof ProfileAgentError ? error.status : timedOut ? 504 : 500;
    const message = timedOut
      ? "Claude Profile Agent 解析超时，请重试。"
      : error instanceof Error ? error.message : "Agent 解析失败。";
    return NextResponse.json(
      {
        error: message,
        details: error instanceof ProfileAgentError ? error.details : [],
        run: tracer.snapshot(),
      },
      { status },
    );
  }
}
