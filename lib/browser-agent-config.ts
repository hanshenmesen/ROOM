// Browser-entered Agent config persists in localStorage so users do not have
// to re-enter keys on every visit; the pre-rename sessionStorage entry with
// the same key string is migrated on first read.
export const BROWSER_AGENT_STORAGE_KEY = "room:agent-config:v1";
export const CUSTOM_BROWSER_AGENT_PROVIDER_ID = "custom";

export type BrowserAgentProviderMode = "json-schema" | "tool";
export type BrowserAgentProviderProtocol = "anthropic" | "openai";
export type BrowserAgentProviderAuthMode = "bearer" | "api-key";

export type BrowserAgentProviderPreset = {
  id: string;
  label: string;
  baseUrl: string;
  model: string;
  mode: BrowserAgentProviderMode;
  protocol?: BrowserAgentProviderProtocol;
  authMode?: BrowserAgentProviderAuthMode;
  /** Whether the provider requires an enterprise-email header (shown as a form field). */
  requiresUserEmail?: boolean;
};

// Only public providers are listed in the tracked repository. Internal
// MAAS gateways (their hostnames, app ids, and model names) are injected at
// runtime from environment variables via /api/config -- see provider-env.ts
// -- so a fresh git clone shows just these public options.
export const BROWSER_AGENT_PROVIDER_PRESETS: readonly BrowserAgentProviderPreset[] = [
  {
    id: "deepseek",
    label: "DeepSeek",
    baseUrl: "https://api.deepseek.com/anthropic",
    model: "deepseek-v4-pro",
    mode: "tool",
  },
];

export type BrowserAgentProviderPresetId = string;

/** True when `baseUrl` belongs to a preset that requires the enterprise-email field. */
export function presetListRequiresUserEmail(presets: readonly BrowserAgentProviderPreset[], baseUrl: string) {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  return presets.some((preset) => preset.requiresUserEmail && preset.baseUrl === trimmed);
}

type BrowserAgentProviderConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
  mode: BrowserAgentProviderMode;
  protocol: BrowserAgentProviderProtocol;
  authMode: BrowserAgentProviderAuthMode;
  /** Required by internal MAAS gateways that audit calls by enterprise email. */
  userEmail: string;
  /** Optional fixed x-maas-app-id value for visitor-configured OpenAI gateways. */
  appId: string;
};

type BrowserPortraitArtProviderConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
};

type BrowserPetQaProviderConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
  mode: BrowserAgentProviderMode;
  protocol: BrowserAgentProviderProtocol;
  authMode: BrowserAgentProviderAuthMode;
  userEmail: string;
  appId: string;
};

export const DEFAULT_BROWSER_AGENT_CONFIG: BrowserAgentConfig = {
  maas: {
    apiKey: "",
    baseUrl: BROWSER_AGENT_PROVIDER_PRESETS[0].baseUrl,
    model: BROWSER_AGENT_PROVIDER_PRESETS[0].model,
    mode: BROWSER_AGENT_PROVIDER_PRESETS[0].mode,
    protocol: BROWSER_AGENT_PROVIDER_PRESETS[0].protocol || "anthropic",
    authMode: BROWSER_AGENT_PROVIDER_PRESETS[0].authMode || "bearer",
    userEmail: "",
    appId: "",
  },
  website: {
    apiKey: "",
    baseUrl: "https://dashscope.aliyuncs.com/apps/anthropic",
    model: "qwen3.5-plus",
    mode: "tool",
    protocol: "anthropic",
    authMode: "bearer",
    userEmail: "",
    appId: "",
  },
  image: {
    apiKey: "",
    // No default endpoint in the tracked repo: the image service is a
    // deployment detail configured server-side (IMAGE_MAAS_* envs).
    baseUrl: "",
    model: "gpt-image-2",
  },
  petQa: {
    apiKey: "",
    baseUrl: BROWSER_AGENT_PROVIDER_PRESETS[0].baseUrl,
    model: BROWSER_AGENT_PROVIDER_PRESETS[0].model,
    mode: BROWSER_AGENT_PROVIDER_PRESETS[0].mode,
    protocol: BROWSER_AGENT_PROVIDER_PRESETS[0].protocol || "anthropic",
    authMode: BROWSER_AGENT_PROVIDER_PRESETS[0].authMode || "bearer",
    userEmail: "",
    appId: "",
  },
};

export type BrowserAgentConfig = {
  maas: BrowserAgentProviderConfig;
  website: BrowserAgentProviderConfig;
  image: BrowserPortraitArtProviderConfig;
  petQa: BrowserPetQaProviderConfig;
};

export function browserAgentProviderPreset(
  id: BrowserAgentProviderPresetId,
  presets: readonly BrowserAgentProviderPreset[] = BROWSER_AGENT_PROVIDER_PRESETS,
) {
  return presets.find((preset) => preset.id === id) || presets[0];
}

export function browserAgentProviderPresetId(
  provider: Pick<BrowserAgentProviderConfig, "baseUrl" | "model">,
  presets: readonly BrowserAgentProviderPreset[] = BROWSER_AGENT_PROVIDER_PRESETS,
): BrowserAgentProviderPresetId {
  const exact = presets.find(
    (preset) => preset.baseUrl === provider.baseUrl && preset.model === provider.model,
  );
  if (exact) return exact.id;
  return CUSTOM_BROWSER_AGENT_PROVIDER_ID;
}

export function normalizeBrowserAgentConfig(value: unknown): BrowserAgentConfig | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<BrowserAgentConfig>;
  const normalizeProvider = (
    provider: Partial<BrowserAgentProviderConfig> | undefined,
    fallback: BrowserAgentProviderConfig,
  ): BrowserAgentProviderConfig => {
    const baseUrl = typeof provider?.baseUrl === "string" && provider.baseUrl ? provider.baseUrl : fallback.baseUrl;
    const model = typeof provider?.model === "string" && provider.model ? provider.model : fallback.model;
    const inferredPreset = browserAgentProviderPreset(browserAgentProviderPresetId({ baseUrl, model }));
    return {
      apiKey: typeof provider?.apiKey === "string" ? provider.apiKey : "",
      baseUrl,
      model: typeof provider?.model === "string" && provider.model ? provider.model : inferredPreset.model,
      mode: provider?.mode === "tool" || provider?.mode === "json-schema" ? provider.mode : inferredPreset.mode,
      protocol: provider?.protocol === "openai" || provider?.protocol === "anthropic"
        ? provider.protocol
        : inferredPreset.protocol || "anthropic",
      authMode: provider?.authMode === "api-key" || provider?.authMode === "bearer"
        ? provider.authMode
        : inferredPreset.authMode || "bearer",
      userEmail: typeof provider?.userEmail === "string" ? provider.userEmail : "",
      appId: typeof provider?.appId === "string" ? provider.appId : "",
    };
  };
  const normalized = {
    maas: normalizeProvider(candidate.maas, DEFAULT_BROWSER_AGENT_CONFIG.maas),
    website: normalizeProvider(candidate.website, DEFAULT_BROWSER_AGENT_CONFIG.website),
    image: {
      apiKey: typeof candidate.image?.apiKey === "string" ? candidate.image.apiKey : "",
      baseUrl: typeof candidate.image?.baseUrl === "string" && candidate.image.baseUrl
        ? candidate.image.baseUrl
        : DEFAULT_BROWSER_AGENT_CONFIG.image.baseUrl,
      model: typeof candidate.image?.model === "string" && candidate.image.model
        ? candidate.image.model
        : DEFAULT_BROWSER_AGENT_CONFIG.image.model,
    },
    petQa: normalizeProvider(candidate.petQa, DEFAULT_BROWSER_AGENT_CONFIG.petQa),
  };
  return normalized.maas.apiKey || normalized.website.apiKey || normalized.image.apiKey || normalized.petQa.apiKey
    ? normalized
    : null;
}

const HEADERS = {
  maasApiKey: "x-room-maas-api-key",
  maasBaseUrl: "x-room-maas-base-url",
  maasModel: "x-room-maas-model",
  maasMode: "x-room-maas-mode",
  maasUserEmail: "x-room-maas-user-email",
  maasProtocol: "x-room-maas-protocol",
  maasAuthMode: "x-room-maas-auth-mode",
  maasAppId: "x-room-maas-app-id",
  websiteApiKey: "x-room-website-api-key",
  websiteBaseUrl: "x-room-website-base-url",
  websiteModel: "x-room-website-model",
  websiteMode: "x-room-website-mode",
  websiteUserEmail: "x-room-website-user-email",
  websiteProtocol: "x-room-website-protocol",
  websiteAuthMode: "x-room-website-auth-mode",
  websiteAppId: "x-room-website-app-id",
} as const;

const PORTRAIT_ART_HEADERS = {
  apiKey: "x-room-image-api-key",
  baseUrl: "x-room-image-base-url",
  model: "x-room-image-model",
} as const;

const PET_QA_HEADERS = {
  apiKey: "x-room-pet-qa-api-key",
  baseUrl: "x-room-pet-qa-base-url",
  model: "x-room-pet-qa-model",
  mode: "x-room-pet-qa-mode",
  userEmail: "x-room-pet-qa-user-email",
  protocol: "x-room-pet-qa-protocol",
  authMode: "x-room-pet-qa-auth-mode",
  appId: "x-room-pet-qa-app-id",
} as const;

export function browserAgentConfigHeaders(config: BrowserAgentConfig | null): Record<string, string> {
  if (!config) return {};
  return {
    [HEADERS.maasApiKey]: config.maas.apiKey.trim(),
    [HEADERS.maasBaseUrl]: config.maas.baseUrl.trim(),
    [HEADERS.maasModel]: config.maas.model.trim(),
    [HEADERS.maasMode]: config.maas.mode,
    [HEADERS.maasUserEmail]: config.maas.userEmail.trim(),
    [HEADERS.maasProtocol]: config.maas.protocol,
    [HEADERS.maasAuthMode]: config.maas.authMode,
    [HEADERS.maasAppId]: config.maas.appId.trim(),
    [HEADERS.websiteApiKey]: config.website.apiKey.trim(),
    [HEADERS.websiteBaseUrl]: config.website.baseUrl.trim(),
    [HEADERS.websiteModel]: config.website.model.trim(),
    [HEADERS.websiteMode]: config.website.mode,
    [HEADERS.websiteUserEmail]: config.website.userEmail.trim(),
    [HEADERS.websiteProtocol]: config.website.protocol,
    [HEADERS.websiteAuthMode]: config.website.authMode,
    [HEADERS.websiteAppId]: config.website.appId.trim(),
  };
}

export function readBrowserAgentConfigHeaders(headers: Headers) {
  const maasApiKey = headers.get(HEADERS.maasApiKey)?.trim() || "";
  const websiteApiKey = headers.get(HEADERS.websiteApiKey)?.trim() || "";
  if (!maasApiKey && !websiteApiKey) return undefined;
  return {
    maasApiKey,
    maasBaseUrl: headers.get(HEADERS.maasBaseUrl)?.trim() || DEFAULT_BROWSER_AGENT_CONFIG.maas.baseUrl,
    maasModel: headers.get(HEADERS.maasModel)?.trim() || DEFAULT_BROWSER_AGENT_CONFIG.maas.model,
    maasMode: headers.get(HEADERS.maasMode) === "tool" ? "tool" as const : "json-schema" as const,
    maasUserEmail: headers.get(HEADERS.maasUserEmail)?.trim() || "",
    maasProtocol: headers.get(HEADERS.maasProtocol) === "openai" ? "openai" as const : "anthropic" as const,
    maasAuthMode: headers.get(HEADERS.maasAuthMode) === "api-key" ? "api-key" as const : "bearer" as const,
    maasAppId: headers.get(HEADERS.maasAppId)?.trim() || "",
    websiteApiKey,
    websiteBaseUrl: headers.get(HEADERS.websiteBaseUrl)?.trim() || DEFAULT_BROWSER_AGENT_CONFIG.website.baseUrl,
    websiteModel: headers.get(HEADERS.websiteModel)?.trim() || DEFAULT_BROWSER_AGENT_CONFIG.website.model,
    websiteMode: headers.get(HEADERS.websiteMode) === "json-schema" ? "json-schema" as const : "tool" as const,
    websiteUserEmail: headers.get(HEADERS.websiteUserEmail)?.trim() || "",
    websiteProtocol: headers.get(HEADERS.websiteProtocol) === "openai" ? "openai" as const : "anthropic" as const,
    websiteAuthMode: headers.get(HEADERS.websiteAuthMode) === "api-key" ? "api-key" as const : "bearer" as const,
    websiteAppId: headers.get(HEADERS.websiteAppId)?.trim() || "",
  };
}

export function browserPortraitArtConfigHeaders(config: BrowserAgentConfig | null): Record<string, string> {
  if (!config) return {};
  return {
    [PORTRAIT_ART_HEADERS.apiKey]: (config.image.apiKey || config.maas.apiKey).trim(),
    [PORTRAIT_ART_HEADERS.baseUrl]: config.image.baseUrl.trim(),
    [PORTRAIT_ART_HEADERS.model]: config.image.model.trim(),
  };
}

export function browserPetQaConfigHeaders(config: BrowserAgentConfig | null): Record<string, string> {
  if (!config) return {};
  return {
    [PET_QA_HEADERS.apiKey]: (config.petQa.apiKey || config.maas.apiKey).trim(),
    [PET_QA_HEADERS.baseUrl]: (config.petQa.baseUrl || config.maas.baseUrl).trim(),
    [PET_QA_HEADERS.model]: (config.petQa.model || config.maas.model).trim(),
    [PET_QA_HEADERS.mode]: config.petQa.mode || config.maas.mode,
    [PET_QA_HEADERS.userEmail]: (config.petQa.userEmail || config.maas.userEmail).trim(),
    [PET_QA_HEADERS.protocol]: config.petQa.protocol || config.maas.protocol,
    [PET_QA_HEADERS.authMode]: config.petQa.authMode || config.maas.authMode,
    [PET_QA_HEADERS.appId]: (config.petQa.appId || config.maas.appId).trim(),
  };
}

export function readBrowserPortraitArtConfigHeaders(headers: Headers) {
  const apiKey = headers.get(PORTRAIT_ART_HEADERS.apiKey)?.trim() || "";
  if (!apiKey) return undefined;
  return {
    apiKey,
    baseUrl: headers.get(PORTRAIT_ART_HEADERS.baseUrl)?.trim() || DEFAULT_BROWSER_AGENT_CONFIG.image.baseUrl,
    model: headers.get(PORTRAIT_ART_HEADERS.model)?.trim() || DEFAULT_BROWSER_AGENT_CONFIG.image.model,
  };
}

export function readBrowserPetQaConfigHeaders(headers: Headers) {
  const apiKey = headers.get(PET_QA_HEADERS.apiKey)?.trim() || "";
  if (!apiKey) return undefined;
  return {
    petQaApiKey: apiKey,
    petQaBaseUrl: headers.get(PET_QA_HEADERS.baseUrl)?.trim() || DEFAULT_BROWSER_AGENT_CONFIG.petQa.baseUrl,
    petQaModel: headers.get(PET_QA_HEADERS.model)?.trim() || DEFAULT_BROWSER_AGENT_CONFIG.petQa.model,
    petQaMode: headers.get(PET_QA_HEADERS.mode) === "tool" ? "tool" as const : "json-schema" as const,
    petQaUserEmail: headers.get(PET_QA_HEADERS.userEmail)?.trim() || "",
    petQaProtocol: headers.get(PET_QA_HEADERS.protocol) === "openai" ? "openai" as const : "anthropic" as const,
    petQaAuthMode: headers.get(PET_QA_HEADERS.authMode) === "api-key" ? "api-key" as const : "bearer" as const,
    petQaAppId: headers.get(PET_QA_HEADERS.appId)?.trim() || "",
  };
}
