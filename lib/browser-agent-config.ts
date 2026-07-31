export const BROWSER_AGENT_SESSION_KEY = "room:agent-config:v1";

export type BrowserAgentProviderMode = "json-schema" | "tool";

export const BROWSER_AGENT_PROVIDER_PRESETS = [
  {
    id: "maas",
    label: "MAAS",
    baseUrl: "https://maas.devops.rednote.life/hackson",
    model: "vertex-claude-sonnet-5/claude-sonnet-5",
    mode: "json-schema" as const,
  },
  {
    id: "zhizengzeng",
    label: "智增增 API",
    baseUrl: "https://api.zhizengzeng.com/v1",
    model: "claude-sonnet-5",
    mode: "tool" as const,
  },
] as const;

export type BrowserAgentProviderPresetId = (typeof BROWSER_AGENT_PROVIDER_PRESETS)[number]["id"];

type BrowserAgentProviderConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
  mode: BrowserAgentProviderMode;
};

export const DEFAULT_BROWSER_AGENT_CONFIG: BrowserAgentConfig = {
  maas: {
    apiKey: "",
    baseUrl: BROWSER_AGENT_PROVIDER_PRESETS[0].baseUrl,
    model: BROWSER_AGENT_PROVIDER_PRESETS[0].model,
    mode: BROWSER_AGENT_PROVIDER_PRESETS[0].mode,
  },
  website: {
    apiKey: "",
    baseUrl: BROWSER_AGENT_PROVIDER_PRESETS[1].baseUrl,
    model: BROWSER_AGENT_PROVIDER_PRESETS[1].model,
    mode: BROWSER_AGENT_PROVIDER_PRESETS[1].mode,
  },
};

export type BrowserAgentConfig = {
  maas: BrowserAgentProviderConfig;
  website: BrowserAgentProviderConfig;
};

export function browserAgentProviderPreset(id: BrowserAgentProviderPresetId) {
  return BROWSER_AGENT_PROVIDER_PRESETS.find((preset) => preset.id === id) || BROWSER_AGENT_PROVIDER_PRESETS[0];
}

export function browserAgentProviderPresetId(provider: Pick<BrowserAgentProviderConfig, "baseUrl">): BrowserAgentProviderPresetId {
  return provider.baseUrl.includes("api.zhizengzeng.com") ? "zhizengzeng" : "maas";
}

export function normalizeBrowserAgentConfig(value: unknown): BrowserAgentConfig | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<BrowserAgentConfig>;
  const normalizeProvider = (
    provider: Partial<BrowserAgentProviderConfig> | undefined,
    fallback: BrowserAgentProviderConfig,
  ): BrowserAgentProviderConfig => {
    const baseUrl = typeof provider?.baseUrl === "string" && provider.baseUrl ? provider.baseUrl : fallback.baseUrl;
    const inferredPreset = browserAgentProviderPreset(baseUrl.includes("api.zhizengzeng.com") ? "zhizengzeng" : "maas");
    return {
      apiKey: typeof provider?.apiKey === "string" ? provider.apiKey : "",
      baseUrl,
      model: typeof provider?.model === "string" && provider.model ? provider.model : inferredPreset.model,
      mode: provider?.mode === "tool" || provider?.mode === "json-schema" ? provider.mode : inferredPreset.mode,
    };
  };
  const normalized = {
    maas: normalizeProvider(candidate.maas, DEFAULT_BROWSER_AGENT_CONFIG.maas),
    website: normalizeProvider(candidate.website, DEFAULT_BROWSER_AGENT_CONFIG.website),
  };
  return normalized.maas.apiKey || normalized.website.apiKey ? normalized : null;
}

const HEADERS = {
  maasApiKey: "x-room-maas-api-key",
  maasBaseUrl: "x-room-maas-base-url",
  maasModel: "x-room-maas-model",
  maasMode: "x-room-maas-mode",
  websiteApiKey: "x-room-website-api-key",
  websiteBaseUrl: "x-room-website-base-url",
  websiteModel: "x-room-website-model",
  websiteMode: "x-room-website-mode",
} as const;

export function browserAgentConfigHeaders(config: BrowserAgentConfig | null): Record<string, string> {
  if (!config) return {};
  return {
    [HEADERS.maasApiKey]: config.maas.apiKey.trim(),
    [HEADERS.maasBaseUrl]: config.maas.baseUrl.trim(),
    [HEADERS.maasModel]: config.maas.model.trim(),
    [HEADERS.maasMode]: config.maas.mode,
    [HEADERS.websiteApiKey]: config.website.apiKey.trim(),
    [HEADERS.websiteBaseUrl]: config.website.baseUrl.trim(),
    [HEADERS.websiteModel]: config.website.model.trim(),
    [HEADERS.websiteMode]: config.website.mode,
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
    websiteApiKey,
    websiteBaseUrl: headers.get(HEADERS.websiteBaseUrl)?.trim() || DEFAULT_BROWSER_AGENT_CONFIG.website.baseUrl,
    websiteModel: headers.get(HEADERS.websiteModel)?.trim() || DEFAULT_BROWSER_AGENT_CONFIG.website.model,
    websiteMode: headers.get(HEADERS.websiteMode) === "json-schema" ? "json-schema" as const : "tool" as const,
  };
}
