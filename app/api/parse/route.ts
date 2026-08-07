import { NextResponse } from "next/server";
import {
  extractProfileFromAttachmentWithAgentRun,
  extractProfileWithAgentRun,
  MAX_SOURCE_CHARACTERS,
  ProfileAgentError,
  type AgentAttachment,
  type ProfileAgentSource,
} from "@/lib/agents/profile-agent";
import { summarizeAgentRun } from "@/lib/agent-runtime/trace-summary";
import { AgentBudgetExceededError } from "@/lib/agent-runtime/run-controls";
import { createAgentTracer, type AgentTracer } from "@/lib/agent-runtime/tracer";
import type { ExtractedMedia } from "@/lib/extract-webpage";
import { PublicWebError, validatePublicUrl, validatePublicUrlResolution } from "@/lib/public-web";
import { preparsePdf } from "@/lib/pdf-preparse";
import { mergeProfilesWithReport } from "@/lib/profile-merge";
import { readBrowserAgentConfigHeaders } from "@/lib/browser-agent-config";
import { providerCapabilitiesFor } from "@/lib/agents/provider-capabilities";
import { getAgentProviderConfig, type AgentProviderOverride } from "@/lib/agents/provider-config";
import {
  prefetchWebsiteResearchRoot,
  publicWebsiteResearchSnapshot,
  runWebsiteResearchAgent,
  type WebsiteResearchPrefetch,
} from "@/lib/agents/website/agent";
import type { ParsedProfile } from "@/lib/types";
import { privacySafeRequestKey, tryAcquireConcurrencyLease } from "@/lib/agent-runtime/concurrency-limiter";
import { createWebsiteResearchModelPlanner } from "@/lib/agents/website/planner";

export const runtime = "edge";

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const MAX_JSON_BYTES = 1_000_000;
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
  signal: AbortSignal;
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

async function requestProviderConfig(request: Request): Promise<AgentProviderOverride | undefined> {
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
  const safeConfig = {
    ...config,
    maasBaseUrl: safeBaseUrl(config.maasBaseUrl, "MAAS Base URL"),
    websiteBaseUrl: safeBaseUrl(config.websiteBaseUrl, "Website Agent Base URL"),
  };
  try {
    await Promise.all([
      ...(safeConfig.maasApiKey
        ? [validatePublicUrlResolution(safeConfig.maasBaseUrl, { signal: request.signal })]
        : []),
      ...(safeConfig.websiteApiKey
        ? [validatePublicUrlResolution(safeConfig.websiteBaseUrl, { signal: request.signal })]
        : []),
    ]);
  } catch (error) {
    console.error("[parse] provider DNS validation failed:", error instanceof Error ? `${error.name}: ${error.message}` : error);
    // Distinguish an unavailable DNS validator (transient, retryable) from a
    // provider URL that genuinely resolves to a non-public network.
    if (error instanceof PublicWebError && error.status >= 500) {
      throw new ProfileAgentError("Provider Base URL 的 DNS 校验服务暂时不可用，请稍后重试。", 502);
    }
    throw new ProfileAgentError("Provider Base URL 的 DNS 地址不是可验证的公开网络。", 400);
  }
  return safeConfig;
}

function startWebsiteAgent(
  website: string,
  providerConfig: AgentProviderOverride | undefined,
  tracer: AgentTracer,
  signal: AbortSignal,
): WebsiteAgentTask {
  const prefetch = prefetchWebsiteResearchRoot({ rootUrl: website, tracer, signal }).then(
    (value) => ({ value }),
    (error) => ({
      error: error instanceof Error ? error.message : "个人网站补充失败。",
      errorStatus: publicErrorStatus(error),
    }),
  );
  return { website, providerConfig, prefetch, signal };
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
      signal: task.signal,
      planner: createWebsiteResearchModelPlanner({
        providerConfig: task.providerConfig,
        tracer,
        signal: task.signal,
      }),
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
        signal: task.signal,
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
  signal?: AbortSignal,
) {
  if (!tracer) throw new ProfileAgentError("Agent Trace 未初始化。", 500);
  const task = pendingTask?.website === website
    ? pendingTask
    : startWebsiteAgent(website, providerConfig, tracer, signal || AbortSignal.timeout(24_000));
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
  signal?: AbortSignal,
) {
  const website = profile.personalWebsite;
  if (!website) return { profile, enrichment: { attempted: false, succeeded: false } };
  return enrichFromWebsite(profile, originalLabel, website, pendingTask, providerConfig, tracer, signal);
}

async function parseJson(request: Request, tracer: AgentTracer, providerConfig?: AgentProviderOverride) {
  const body = await request.json() as ParseJsonBody;
  if (body.text !== undefined && typeof body.text !== "string") {
    throw new ProfileAgentError("text 必须是字符串。", 400);
  }
  if ((body.text || "").length > MAX_SOURCE_CHARACTERS) {
    throw new ProfileAgentError(`来源内容过长，当前上限为 ${MAX_SOURCE_CHARACTERS.toLocaleString()} 个字符。`, 413);
  }
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
      const result = await runWebsiteAgent(startWebsiteAgent(website, providerConfig, tracer, request.signal), undefined, tracer);
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
    signal: request.signal,
    ...(shouldFollowWebsite ? {
      onPersonalWebsite: (website: string) => {
        websiteTask ||= startWebsiteAgent(website, providerConfig, tracer, request.signal);
      },
    } : {}),
  });
  const profile = profileRun.profile;
  if (!shouldFollowWebsite) {
    return { profile, enrichment: { attempted: false, succeeded: false } };
  }
  return enrichFromPersonalWebsite(profile, source.label || "Uploaded source", websiteTask, providerConfig, tracer, request.signal);
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
    ? startWebsiteAgent(explicitWebsite, providerConfig, tracer, request.signal)
    : undefined;
  const agentOptions = {
    providerScope: "resume" as const,
    providerConfig,
    tracer,
    stepPrefix: "profile" as const,
    signal: request.signal,
    ...(shouldFollowWebsite && !explicitWebsite ? {
      onPersonalWebsite: (website: string) => {
        websiteTask ||= startWebsiteAgent(website, providerConfig, tracer, request.signal);
      },
    } : {}),
  };
  tracer.emit({ type: "artifact.created", step: "source.prepare", name: "prepared-source.json", schemaVersion: "source.v1" });
  tracer.emit({ type: "step.completed", step: "source.prepare" });
  let profile: ParsedProfile;
  const maasSlot = getAgentProviderConfig(providerConfig).maas;
  const capabilities = providerCapabilitiesFor(maasSlot.baseUrl, maasSlot.model);
  if (file.type === "application/pdf" || extension === "pdf") {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const preparsed = await preparsePdf(bytes).catch(() => null);
    // Providers without document-block support (the OpenAI-protocol xhs-maas
    // gateway, DeepSeek's official endpoint) receive ROOM's local PDF text
    // extraction instead of an unsupported `document` message. Providers
    // that can inspect the PDF keep the original attachment path.
    if (!capabilities.supportsDocumentBlocks) {
      if (!preparsed?.text.trim()) {
        throw new ProfileAgentError("该 PDF 无法提取文本，当前 Provider 不支持直接读取 PDF 文件。请上传可复制文字的 PDF，或改用支持 PDF 的多模态 Provider。", 422);
      }
      // Present the extracted PDF text as a line-numbered text source, not a
      // page-referenced PDF. Page semantics only work when the model can see
      // the rendered PDF; a text-only model just counts lines (observed with
      // Qwen 3.5 returning evidenceLines [4], [10] against a 1-page source),
      // which the page-range validator then rejects. Line numbering also
      // gives the model explicit [N] markers to cite, improving compliance.
      profile = (await extractProfileWithAgentRun(
        preparsed.text,
        { ...baseSource, format: "text" },
        agentOptions,
      )).profile;
    } else {
      const data = bytesToBase64(bytes);
      profile = (await extractProfileFromAttachmentWithAgentRun(
        { mediaType: "application/pdf", data },
        { ...baseSource, format: "pdf", pageCount: preparsed?.pageCount },
        preparsed?.text || "",
        agentOptions,
      )).profile;
    }
  } else if (IMAGE_TYPES.has(file.type as AgentAttachment["mediaType"])) {
    if (!capabilities.supportsImageBlocks) {
      throw new ProfileAgentError("当前 Provider 不支持图片输入。请改用支持图片的多模态 Provider（如 MAAS Claude 路由），或上传文本简历。", 422);
    }
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
    return enrichFromWebsite(profile, file.name, explicitWebsite, websiteTask, providerConfig, tracer, request.signal);
  }
  return !shouldFollowWebsite
    ? { profile, enrichment: { attempted: false, succeeded: false } }
    : enrichFromPersonalWebsite(profile, file.name, websiteTask, providerConfig, tracer, request.signal);
}

function requestedRunId(request: Request) {
  const value = request.headers.get("x-room-agent-run-id")?.trim() || "";
  return /^[a-zA-Z0-9_-]{8,100}$/.test(value) ? value : undefined;
}

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") || "";
  const declaredBytes = Number(request.headers.get("content-length") || 0);
  if (!contentType.includes("multipart/form-data") && declaredBytes > MAX_JSON_BYTES) {
    return NextResponse.json({ error: "请求内容过大。" }, { status: 413 });
  }
  const requestKey = await privacySafeRequestKey(request);
  const releaseLease = tryAcquireConcurrencyLease(`parse:${requestKey}`, 2);
  if (!releaseLease) {
    return NextResponse.json({ error: "当前 Agent 任务较多，请稍后重试。" }, {
      status: 429,
      headers: { "retry-after": "3" },
    });
  }
  const tracer = createAgentTracer(requestedRunId(request));
  try {
    const providerConfig = await requestProviderConfig(request);
    const result = contentType.includes("multipart/form-data")
      ? await parseFile(request, tracer, providerConfig)
      : await parseJson(request, tracer, providerConfig);
    tracer.complete();
    const run = tracer.snapshot()!;
    return NextResponse.json({ ...result, run, trace: summarizeAgentRun(run.events) });
  } catch (error) {
    tracer.fail(error instanceof ProfileAgentError ? `profile_agent_${error.status}` : "profile_agent_failed");
    const timedOut = error instanceof DOMException && ["TimeoutError", "AbortError"].includes(error.name);
    const status = error instanceof ProfileAgentError ? error.status : timedOut ? 504 : publicErrorStatus(error) || 500;
    const message = timedOut
      ? "Profile Agent 解析超时，请重试。"
      : error instanceof AgentBudgetExceededError
        ? "本次解析超出资源预算。请精简输入内容，或稍后重试。"
        : error instanceof Error ? error.message : "Agent 解析失败。";
    return NextResponse.json(
      {
        error: message,
        details: error instanceof ProfileAgentError ? error.details : [],
        run: tracer.snapshot(),
      },
      { status },
    );
  } finally {
    releaseLease();
  }
}
