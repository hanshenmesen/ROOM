// The primary provider slot defaults to DeepSeek's Anthropic-compatible
// endpoint: every ROOM model path (profile shards, website planner, pet QA)
// speaks Anthropic Messages, and DeepSeek fully supports the fields ROOM
// uses (system, tools/input_schema, tool_choice=tool, max_tokens).
// Boundary: DeepSeek does not support image/document content blocks, so
// PDF-vision and image inputs need a multimodal provider (e.g. MAAS).
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
  websiteApiKey?: string;
  websiteBaseUrl?: string;
  websiteModel?: string;
  websiteMode?: "json-schema" | "tool";
  petQaApiKey?: string;
  petQaBaseUrl?: string;
  petQaModel?: string;
  petQaMode?: "json-schema" | "tool";
};

function configuredValues(...values: Array<string | undefined>) {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))];
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

  const rawMaasBaseUrl = (override?.maasBaseUrl || process.env.MAAS_BASE_URL || DEFAULT_MAAS_BASE_URL).replace(/\/$/, "");
  // DeepSeek exposes both OpenAI-style and Anthropic-style endpoints, but
  // ROOM only speaks Anthropic Messages. Users frequently paste the OpenAI
  // base URL from DeepSeek's docs (https://api.deepseek.com or .../v1);
  // normalize every DeepSeek host to the Anthropic endpoint and force tool
  // mode (its output_config.format is unsupported), instead of failing with
  // a bare http_400 and a misleading Bedrock fallback model.
  const deepseekHost = (() => {
    try {
      return new URL(rawMaasBaseUrl).hostname === "api.deepseek.com";
    } catch {
      return false;
    }
  })();
  const maasBaseUrl = deepseekHost && !rawMaasBaseUrl.startsWith(DEFAULT_MAAS_BASE_URL)
    ? DEFAULT_MAAS_BASE_URL
    : rawMaasBaseUrl;
  return {
    maas: {
      apiKeys: maasApiKeys,
      baseUrl: maasBaseUrl,
      model: override?.maasModel || process.env.MAAS_MODEL || DEFAULT_MAAS_MODEL,
      // DeepSeek only honours `output_config.effort`, not the json-schema
      // `format` field, so tool mode is the portable default; providers that
      // do support output_config can still opt into "json-schema" explicitly.
      mode: override?.maasMode || (maasBaseUrl === DEFAULT_MAAS_BASE_URL || deepseekHost ? "tool" as const : "json-schema" as const),
    },
    website: {
      apiKeys: websiteApiKeys,
      baseUrl: (override?.websiteBaseUrl || process.env.WEBSITE_AGENT_BASE_URL || DEFAULT_WEBSITE_AGENT_BASE_URL).replace(/\/$/, ""),
      model: override?.websiteModel || process.env.WEBSITE_AGENT_MODEL || DEFAULT_WEBSITE_AGENT_MODEL,
      mode: override?.websiteMode || "tool" as const,
    },
    petQa: {
      apiKeys: petQaApiKeys,
      baseUrl: (
        override?.petQaBaseUrl
        || process.env.PET_QA_BASE_URL
        || override?.maasBaseUrl
        || process.env.MAAS_BASE_URL
        || DEFAULT_PET_QA_BASE_URL
      ).replace(/\/$/, ""),
      model: override?.petQaModel || process.env.PET_QA_MODEL || override?.maasModel || process.env.MAAS_MODEL || DEFAULT_PET_QA_MODEL,
      mode: override?.petQaMode || override?.maasMode || "json-schema" as const,
    },
  };
}

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
