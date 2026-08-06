import { providerProtocolForBaseUrl, type ProviderProtocol } from "./provider-request.ts";

// The primary provider slot defaults to DeepSeek's official Anthropic-
// compatible endpoint: every ROOM model path (profile shards, website
// planner, pet QA) speaks Anthropic Messages there, and DeepSeek fully
// supports the fields ROOM uses (system, tools/input_schema,
// tool_choice=any, max_tokens). This keeps the public demo path usable
// without any internal-network access.
// Boundary: DeepSeek does not support image/document content blocks, so
// PDF-vision and image inputs need a multimodal provider (e.g. MAAS).
//
// Xiaohongshu's internal MAAS gateway (maas.devops.xiaohongshu.com) is a
// second, OpenAI Chat Completions-compatible way to reach the same
// deepseek-v4-pro model from inside the corporate network. It requires a
// distinct header set (api-key / x-maas-user-email / x-maas-app-id) instead
// of Authorization: Bearer, and is available as the "小红书内网 MAAS"
// browser preset rather than the default, since it is not reachable from
// outside the internal network.
export const DEFAULT_MAAS_BASE_URL = "https://api.deepseek.com/anthropic";
export const DEFAULT_MAAS_MODEL = "deepseek-v4-pro";
export const FALLBACK_MAAS_MODEL = "bedrock-claude-sonnet-5/claude-sonnet-5";
export const DEFAULT_WEBSITE_AGENT_BASE_URL = "https://api.zhizengzeng.com/v1";
export const DEFAULT_WEBSITE_AGENT_MODEL = "claude-sonnet-5";
export const DEFAULT_PET_QA_BASE_URL = DEFAULT_MAAS_BASE_URL;
export const DEFAULT_PET_QA_MODEL = DEFAULT_MAAS_MODEL;

export type AgentProviderOverride = {
  maasApiKey?: string;
  maasBaseUrl?: string;
  maasModel?: string;
  maasMode?: "json-schema" | "tool";
  maasUserEmail?: string;
  websiteApiKey?: string;
  websiteBaseUrl?: string;
  websiteModel?: string;
  websiteMode?: "json-schema" | "tool";
  websiteUserEmail?: string;
  petQaApiKey?: string;
  petQaBaseUrl?: string;
  petQaModel?: string;
  petQaMode?: "json-schema" | "tool";
  petQaUserEmail?: string;
};

function configuredValues(...values: Array<string | undefined>) {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))];
}

export function isDeepSeekProvider(value: string) {
  try {
    const candidate = value.includes("://") ? value : `https://${value}`;
    return new URL(candidate).hostname === "api.deepseek.com";
  } catch {
    return false;
  }
}

export { isXhsMaasGatewayProvider } from "./provider-request.ts";

/**
 * Normalizes a base URL and picks the default request protocol/mode. Users
 * frequently paste DeepSeek's OpenAI-style base URL (https://api.deepseek.com
 * or .../v1); on that host ROOM must always call /anthropic (the only
 * format it speaks) and default to tool mode (its output_config.format is
 * unsupported). The Xiaohongshu internal MAAS gateway host is detected as
 * its own protocol and passed through unchanged (its URL is already
 * correct as typed). All other hosts pass through unchanged on the
 * Anthropic protocol.
 */
function normalizeProviderBaseUrl(rawBaseUrl: string, explicitMode: "json-schema" | "tool" | undefined, jsonSchemaDefault: "json-schema" | "tool") {
  const trimmed = rawBaseUrl.replace(/\/$/, "");
  const deepSeek = isDeepSeekProvider(trimmed);
  const baseUrl = deepSeek && !trimmed.startsWith(DEFAULT_MAAS_BASE_URL) ? DEFAULT_MAAS_BASE_URL : trimmed;
  const protocol = providerProtocolForBaseUrl(baseUrl);
  // The xhs-maas protocol always uses OpenAI function calling; "mode" (tool
  // vs json-schema) only meaningfully distinguishes Anthropic request
  // shapes, so it is fixed to "tool" there for callers that still read it.
  const mode = protocol === "xhs-maas" ? "tool" as const : explicitMode || (deepSeek ? "tool" as const : jsonSchemaDefault);
  return { baseUrl, mode, protocol };
}

export function getAgentProviderConfig(override?: AgentProviderOverride) {
  const maasApiKeys = override
    ? configuredValues(override.maasApiKey)
    : configuredValues(process.env.MAAS_API_KEY, process.env.MAAS_API_KEY_FALLBACK);
  const websiteApiKeys = override
    ? configuredValues(override.websiteApiKey)
    : configuredValues(process.env.WEBSITE_AGENT_API_KEY, process.env.WEBSITE_AGENT_API_KEY_FALLBACK);
  const petQaApiKeys = override
    ? configuredValues(override.petQaApiKey, override.maasApiKey)
    : configuredValues(
      process.env.PET_QA_API_KEY,
      process.env.PET_QA_API_KEY_FALLBACK,
      process.env.MAAS_API_KEY,
      process.env.MAAS_API_KEY_FALLBACK,
    );

  const maasUserEmail = override?.maasUserEmail?.trim() || process.env.MAAS_USER_EMAIL?.trim() || "";
  const websiteUserEmail = override?.websiteUserEmail?.trim() || process.env.WEBSITE_AGENT_USER_EMAIL?.trim() || maasUserEmail;
  const petQaUserEmail = override?.petQaUserEmail?.trim() || process.env.PET_QA_USER_EMAIL?.trim() || maasUserEmail;

  const maasNormalized = normalizeProviderBaseUrl(
    override?.maasBaseUrl || process.env.MAAS_BASE_URL || DEFAULT_MAAS_BASE_URL,
    override?.maasMode,
    "json-schema",
  );
  // Falls back to the already-normalized maas base URL (not the raw
  // override/env value): otherwise a normalized maas config would silently
  // un-normalize once it reached the petQa slot.
  const petQaNormalized = normalizeProviderBaseUrl(
    override?.petQaBaseUrl || process.env.PET_QA_BASE_URL || maasNormalized.baseUrl || DEFAULT_PET_QA_BASE_URL,
    override?.petQaMode || override?.maasMode,
    "json-schema",
  );
  const websiteBaseUrl = (override?.websiteBaseUrl || process.env.WEBSITE_AGENT_BASE_URL || DEFAULT_WEBSITE_AGENT_BASE_URL).replace(/\/$/, "");
  return {
    maas: {
      apiKeys: maasApiKeys,
      baseUrl: maasNormalized.baseUrl,
      model: override?.maasModel || process.env.MAAS_MODEL || DEFAULT_MAAS_MODEL,
      mode: maasNormalized.mode,
      protocol: maasNormalized.protocol,
      userEmail: maasUserEmail,
    },
    website: {
      apiKeys: websiteApiKeys,
      baseUrl: websiteBaseUrl,
      model: override?.websiteModel || process.env.WEBSITE_AGENT_MODEL || DEFAULT_WEBSITE_AGENT_MODEL,
      mode: override?.websiteMode || "tool" as const,
      protocol: providerProtocolForBaseUrl(websiteBaseUrl),
      userEmail: websiteUserEmail,
    },
    petQa: {
      apiKeys: petQaApiKeys,
      baseUrl: petQaNormalized.baseUrl,
      model: override?.petQaModel || process.env.PET_QA_MODEL || override?.maasModel || process.env.MAAS_MODEL || DEFAULT_PET_QA_MODEL,
      mode: petQaNormalized.mode,
      protocol: petQaNormalized.protocol,
      userEmail: petQaUserEmail,
    },
  };
}

export type AgentProviderSlot = ReturnType<typeof getAgentProviderConfig>["maas"];
export type { ProviderProtocol };

export type PublicAgentConfigStatus = ReturnType<typeof getPublicAgentConfigStatus>;

export function getPublicAgentConfigStatus() {
  const config = getAgentProviderConfig();
  const ready = config.maas.apiKeys.length > 0 || config.website.apiKeys.length > 0;
  const resumeProvider = config.maas.apiKeys.length > 0
    ? config.maas
    : config.website.apiKeys.length > 0 ? config.website : config.maas;
  const websiteProvider = config.website.apiKeys.length > 0
    ? config.website
    : config.maas.apiKeys.length > 0 ? config.maas : config.website;
  const petQaDedicated = configuredValues(process.env.PET_QA_API_KEY, process.env.PET_QA_API_KEY_FALLBACK).length > 0;
  const petQaReady = config.petQa.apiKeys.length > 0;

  return {
    ready,
    demoAvailable: true,
    secretsExposed: false,
    resume: {
      ready,
      provider: config.maas.apiKeys.length ? "MAAS" : config.website.apiKeys.length ? "Website fallback" : "未配置",
      baseUrl: resumeProvider.baseUrl,
      model: resumeProvider.model,
    },
    website: {
      ready,
      dedicatedProviderConfigured: config.website.apiKeys.length > 0,
      provider: config.website.apiKeys.length ? "Website Agent" : config.maas.apiKeys.length ? "MAAS fallback" : "未配置",
      baseUrl: websiteProvider.baseUrl,
      model: websiteProvider.model,
    },
    petQa: {
      ready: petQaReady,
      dedicatedProviderConfigured: petQaDedicated,
      provider: petQaDedicated ? "Pet QA Agent" : config.maas.apiKeys.length ? "MAAS fallback" : "未配置",
      baseUrl: config.petQa.baseUrl,
      model: config.petQa.model,
    },
  };
}
