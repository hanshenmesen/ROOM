import { NextResponse } from "next/server";
import {
  extractProfileFromAttachmentWithAgent,
  extractProfileWithAgent,
  ProfileAgentError,
  type AgentAttachment,
  type ProfileAgentSource,
} from "@/lib/agents/profile-agent";
import { extractWebPage, type ExtractedMedia } from "@/lib/extract-webpage";
import { fetchPublicWebPage, validatePublicUrl } from "@/lib/public-web";
import { preparsePdf } from "@/lib/pdf-preparse";
import { mergeProfiles } from "@/lib/profile-merge";
import { readBrowserAgentConfigHeaders } from "@/lib/browser-agent-config";
import type { AgentProviderOverride } from "@/lib/agents/provider-config";
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
  error?: string;
};

type WebsiteAgentTask = {
  website: string;
  result: Promise<WebsiteAgentResult>;
};

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

function startWebsiteAgent(website: string, providerConfig?: AgentProviderOverride): WebsiteAgentTask {
  const result = (async (): Promise<WebsiteAgentResult> => {
    const page = await fetchPublicWebPage(website);
    const extracted = page.contentType.includes("text/html")
      ? extractWebPage(page.text, page.url)
      : { title: new URL(page.url).hostname, text: page.text, media: [] };
    const websiteProfile = await extractProfileWithAgent(extracted.text, {
      type: "url",
      label: extracted.title || page.url,
      media: extracted.media,
      format: "text",
    }, { providerScope: "website", providerConfig });
    return { profile: websiteProfile, pageUrl: page.url };
  })().catch((error): WebsiteAgentResult => ({
    error: error instanceof Error ? error.message : "个人网站补充失败。",
  }));
  return { website, result };
}

async function enrichFromPersonalWebsite(
  profile: ParsedProfile,
  originalLabel: string,
  pendingTask?: WebsiteAgentTask,
  providerConfig?: AgentProviderOverride,
) {
  const website = profile.personalWebsite;
  if (!website) return { profile, enrichment: { attempted: false, succeeded: false } };
  const task = pendingTask?.website === website ? pendingTask : startWebsiteAgent(website, providerConfig);
  const websiteResult = await task.result;
  if (websiteResult.profile && websiteResult.pageUrl) {
    const enriched = mergeProfiles(profile, websiteResult.profile, `${originalLabel} + ${websiteResult.pageUrl}`);
    return {
      profile: enriched,
      enrichment: { attempted: true, succeeded: true, website: websiteResult.pageUrl },
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

async function parseJson(request: Request, providerConfig?: AgentProviderOverride) {
  const body = await request.json() as ParseJsonBody;
  const source: ProfileAgentSource = {
    id: body.sourceId,
    type: body.sourceType || "text",
    label: body.label || "Pasted source",
    media: body.media || [],
    format: "text",
  };
  const shouldFollowWebsite = body.followWebsite !== false && source.type !== "url";
  let websiteTask: WebsiteAgentTask | undefined;
  const profile = await extractProfileWithAgent(body.text || "", source, {
    providerScope: source.type === "url" ? "website" : "resume",
    providerConfig,
    ...(shouldFollowWebsite ? {
      onPersonalWebsite: (website: string) => {
        websiteTask ||= startWebsiteAgent(website, providerConfig);
      },
    } : {}),
  });
  if (!shouldFollowWebsite) {
    return { profile, enrichment: { attempted: false, succeeded: false } };
  }
  return enrichFromPersonalWebsite(profile, source.label || "Uploaded source", websiteTask, providerConfig);
}

async function parseFile(request: Request, providerConfig?: AgentProviderOverride) {
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new ProfileAgentError("请选择要解析的文件。", 400);
  if (!file.size) throw new ProfileAgentError("上传的文件为空。", 400);
  if (file.size > MAX_UPLOAD_BYTES) throw new ProfileAgentError("文件不能超过 15 MB。", 413);
  const extension = fileExtension(file.name);
  const baseSource: ProfileAgentSource = { type: "text", label: file.name };
  const shouldFollowWebsite = form.get("followWebsite") !== "false";
  let websiteTask: WebsiteAgentTask | undefined;
  const agentOptions = {
    providerScope: "resume" as const,
    providerConfig,
    ...(shouldFollowWebsite ? {
      onPersonalWebsite: (website: string) => {
        websiteTask ||= startWebsiteAgent(website, providerConfig);
      },
    } : {}),
  };
  let profile: ParsedProfile;
  if (file.type === "application/pdf" || extension === "pdf") {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const data = bytesToBase64(bytes);
    const preparsed = await preparsePdf(bytes).catch(() => null);
    profile = await extractProfileFromAttachmentWithAgent(
      { mediaType: "application/pdf", data },
      { ...baseSource, format: "pdf", pageCount: preparsed?.pageCount },
      preparsed?.text || "",
      agentOptions,
    );
  } else if (IMAGE_TYPES.has(file.type as AgentAttachment["mediaType"])) {
    const data = bytesToBase64(new Uint8Array(await file.arrayBuffer()));
    profile = await extractProfileFromAttachmentWithAgent(
      { mediaType: file.type as Exclude<AgentAttachment["mediaType"], "application/pdf">, data },
      { ...baseSource, format: "image" },
      "",
      agentOptions,
    );
  } else if (file.type.startsWith("text/") || TEXT_EXTENSIONS.has(extension)) {
    profile = await extractProfileWithAgent(await file.text(), { ...baseSource, format: "text" }, agentOptions);
  } else {
    throw new ProfileAgentError("当前支持 PDF、JPG、PNG、GIF、WebP 和常见文本/网页数据文件。", 415);
  }
  return !shouldFollowWebsite
    ? { profile, enrichment: { attempted: false, succeeded: false } }
    : enrichFromPersonalWebsite(profile, file.name, websiteTask, providerConfig);
}

export async function POST(request: Request) {
  try {
    const providerConfig = requestProviderConfig(request);
    const contentType = request.headers.get("content-type") || "";
    const result = contentType.includes("multipart/form-data")
      ? await parseFile(request, providerConfig)
      : await parseJson(request, providerConfig);
    return NextResponse.json(result);
  } catch (error) {
    const timedOut = error instanceof DOMException && ["TimeoutError", "AbortError"].includes(error.name);
    const status = error instanceof ProfileAgentError ? error.status : timedOut ? 504 : 500;
    const message = timedOut
      ? "Claude Profile Agent 解析超时，请重试。"
      : error instanceof Error ? error.message : "Agent 解析失败。";
    return NextResponse.json(
      { error: message, details: error instanceof ProfileAgentError ? error.details : [] },
      { status },
    );
  }
}
