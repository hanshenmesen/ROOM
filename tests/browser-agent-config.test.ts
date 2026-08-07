import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BROWSER_AGENT_PROVIDER_PRESETS,
  DEFAULT_BROWSER_AGENT_CONFIG,
  browserAgentProviderPreset,
  browserAgentProviderPresetId,
  browserAgentConfigHeaders,
  browserPetQaConfigHeaders,
  browserPortraitArtConfigHeaders,
  normalizeBrowserAgentConfig,
  readBrowserAgentConfigHeaders,
  readBrowserPetQaConfigHeaders,
  readBrowserPortraitArtConfigHeaders,
  presetListRequiresUserEmail,
  type BrowserAgentProviderPreset,
} from "../lib/browser-agent-config.ts";

// Placeholder identifiers only: real internal hosts/models come from env at
// runtime and must never appear in tracked sources.
const INTERNAL_PRESET: BrowserAgentProviderPreset = {
  id: "internal-maas-0",
  label: "内部 MAAS 网关 · deepseek-v4-pro",
  baseUrl: "https://internal-maas.example",
  model: "deepseek-v4-pro",
  mode: "tool",
  requiresUserEmail: true,
};
const INTERNAL_QWEN_PRESET: BrowserAgentProviderPreset = {
  ...INTERNAL_PRESET,
  id: "internal-maas-1",
  label: "内部 MAAS 网关 · qwen-internal",
  model: "qwen-internal",
};
const EXTERNAL_PRESET: BrowserAgentProviderPreset = {
  id: "external-maas",
  label: "MAAS 外部网关",
  baseUrl: "https://external-maas.example/hackson",
  model: "vertex-claude/claude",
  mode: "json-schema",
};
const ALL_PRESETS = [...BROWSER_AGENT_PROVIDER_PRESETS, INTERNAL_PRESET, INTERNAL_QWEN_PRESET, EXTERNAL_PRESET];

test("browser Agent config ships with the DeepSeek defaults", () => {
  assert.equal(DEFAULT_BROWSER_AGENT_CONFIG.maas.baseUrl, "https://api.deepseek.com/anthropic");
  assert.equal(DEFAULT_BROWSER_AGENT_CONFIG.maas.model, "deepseek-v4-pro");
  assert.equal(DEFAULT_BROWSER_AGENT_CONFIG.maas.mode, "tool");
  // The website slot keeps its own preset instead of inheriting the primary one.
  assert.equal(DEFAULT_BROWSER_AGENT_CONFIG.website.baseUrl, "https://api.zhizengzeng.com/v1");
  assert.equal(DEFAULT_BROWSER_AGENT_CONFIG.website.model, "claude-sonnet-5");
  // The pet QA slot follows the primary provider.
  assert.equal(DEFAULT_BROWSER_AGENT_CONFIG.petQa.baseUrl, "https://api.deepseek.com/anthropic");
  assert.equal(DEFAULT_BROWSER_AGENT_CONFIG.petQa.model, "deepseek-v4-pro");
});

test("tracked presets are public only; runtime presets resolve ids from base urls and models", () => {
  assert.equal(BROWSER_AGENT_PROVIDER_PRESETS.length, 2);
  assert.deepEqual(BROWSER_AGENT_PROVIDER_PRESETS.map((preset) => preset.id), ["deepseek", "zhizengzeng"]);
  assert.equal(browserAgentProviderPresetId({ baseUrl: "https://internal-maas.example", model: "deepseek-v4-pro" }, ALL_PRESETS), "internal-maas-0");
  assert.equal(browserAgentProviderPresetId({ baseUrl: "https://internal-maas.example", model: "qwen-internal" }, ALL_PRESETS), "internal-maas-1");
  assert.equal(browserAgentProviderPresetId({ baseUrl: "https://api.deepseek.com/anthropic", model: "deepseek-v4-pro" }, ALL_PRESETS), "deepseek");
  assert.equal(browserAgentProviderPresetId({ baseUrl: "https://api.zhizengzeng.com/v1", model: "claude-sonnet-5" }, ALL_PRESETS), "zhizengzeng");
  assert.equal(browserAgentProviderPresetId({ baseUrl: "https://external-maas.example/hackson", model: "vertex-claude/claude" }, ALL_PRESETS), "external-maas");
});

test("presetListRequiresUserEmail follows the preset flag, not a hardcoded host", () => {
  assert.equal(presetListRequiresUserEmail(ALL_PRESETS, "https://internal-maas.example"), true);
  assert.equal(presetListRequiresUserEmail(ALL_PRESETS, "https://internal-maas.example/"), true);
  assert.equal(presetListRequiresUserEmail(ALL_PRESETS, "https://api.deepseek.com/anthropic"), false);
  assert.equal(presetListRequiresUserEmail(ALL_PRESETS, "https://external-maas.example/hackson"), false);
});

test("browser Agent config crosses the parsing boundary without using a URL query", () => {
  const headers = new Headers(browserAgentConfigHeaders({
    maas: {
      apiKey: "browser-session-key",
      baseUrl: DEFAULT_BROWSER_AGENT_CONFIG.maas.baseUrl,
      model: DEFAULT_BROWSER_AGENT_CONFIG.maas.model,
      mode: DEFAULT_BROWSER_AGENT_CONFIG.maas.mode,
      userEmail: "",
    },
    website: {
      apiKey: "website-session-key",
      baseUrl: DEFAULT_BROWSER_AGENT_CONFIG.website.baseUrl,
      model: DEFAULT_BROWSER_AGENT_CONFIG.website.model,
      mode: DEFAULT_BROWSER_AGENT_CONFIG.website.mode,
      userEmail: "",
    },
    image: {
      apiKey: "image-session-key",
      baseUrl: DEFAULT_BROWSER_AGENT_CONFIG.image.baseUrl,
      model: DEFAULT_BROWSER_AGENT_CONFIG.image.model,
    },
    petQa: {
      apiKey: "pet-session-key",
      baseUrl: DEFAULT_BROWSER_AGENT_CONFIG.petQa.baseUrl,
      model: DEFAULT_BROWSER_AGENT_CONFIG.petQa.model,
      mode: DEFAULT_BROWSER_AGENT_CONFIG.petQa.mode,
      userEmail: "",
    },
  }));
  const parsed = readBrowserAgentConfigHeaders(headers);

  assert.equal(parsed?.maasApiKey, "browser-session-key");
  assert.equal(parsed?.websiteApiKey, "website-session-key");
  assert.equal(parsed?.maasBaseUrl, DEFAULT_BROWSER_AGENT_CONFIG.maas.baseUrl);
  assert.equal(parsed?.websiteModel, DEFAULT_BROWSER_AGENT_CONFIG.website.model);
  assert.equal(parsed?.maasMode, "tool");
  assert.equal(parsed?.websiteMode, "tool");
  assert.equal(parsed?.maasUserEmail, "");
});

test("an internal gateway's user email crosses the parsing boundary alongside the key", () => {
  const headers = new Headers(browserAgentConfigHeaders({
    ...DEFAULT_BROWSER_AGENT_CONFIG,
    maas: {
      apiKey: "sk-internal-test-key",
      baseUrl: "https://internal-maas.example",
      model: "deepseek-v4-pro",
      mode: "tool",
      userEmail: "someone@example.com",
    },
  }));
  const parsed = readBrowserAgentConfigHeaders(headers);
  assert.equal(parsed?.maasBaseUrl, "https://internal-maas.example");
  assert.equal(parsed?.maasUserEmail, "someone@example.com");
});

test("browser pet QA config crosses only the pet request boundary", () => {
  const headers = new Headers(browserPetQaConfigHeaders({
    ...DEFAULT_BROWSER_AGENT_CONFIG,
    maas: { ...DEFAULT_BROWSER_AGENT_CONFIG.maas, apiKey: "parser-key" },
    petQa: {
      apiKey: "pet-key",
      baseUrl: "https://pet.example.test/v1",
      model: "pet-model",
      mode: "tool",
      userEmail: "",
    },
  }));
  const parsed = readBrowserPetQaConfigHeaders(headers);

  assert.deepEqual(parsed, {
    petQaApiKey: "pet-key",
    petQaBaseUrl: "https://pet.example.test/v1",
    petQaModel: "pet-model",
    petQaMode: "tool",
    petQaUserEmail: "",
  });
  assert.equal(headers.has("x-room-maas-api-key"), false);
  assert.equal(headers.has("x-room-image-api-key"), false);
});

test("pet QA requests reuse the primary session key and user email when no dedicated ones are set", () => {
  const headers = new Headers(browserPetQaConfigHeaders({
    ...DEFAULT_BROWSER_AGENT_CONFIG,
    maas: { ...DEFAULT_BROWSER_AGENT_CONFIG.maas, apiKey: "shared-key", userEmail: "shared@example.com" },
  }));

  const parsed = readBrowserPetQaConfigHeaders(headers);
  assert.equal(parsed?.petQaApiKey, "shared-key");
  assert.equal(parsed?.petQaUserEmail, "shared@example.com");
});

test("browser portrait-art config crosses only the image request boundary", () => {
  const headers = new Headers(browserPortraitArtConfigHeaders({
    ...DEFAULT_BROWSER_AGENT_CONFIG,
    maas: { ...DEFAULT_BROWSER_AGENT_CONFIG.maas, apiKey: "parser-key" },
    image: {
      apiKey: "image-key",
      baseUrl: "https://images.example.test/v1",
      model: "image-model",
    },
  }));
  const parsed = readBrowserPortraitArtConfigHeaders(headers);

  assert.deepEqual(parsed, {
    apiKey: "image-key",
    baseUrl: "https://images.example.test/v1",
    model: "image-model",
  });
  assert.equal(headers.has("x-room-maas-api-key"), false);
  assert.equal(headers.has("x-room-website-api-key"), false);
});

test("portrait-art requests reuse the primary session key when no dedicated image key is set", () => {
  const headers = new Headers(browserPortraitArtConfigHeaders({
    ...DEFAULT_BROWSER_AGENT_CONFIG,
    maas: { ...DEFAULT_BROWSER_AGENT_CONFIG.maas, apiKey: "shared-key" },
  }));

  assert.equal(readBrowserPortraitArtConfigHeaders(headers)?.apiKey, "shared-key");
});

test("stored v1 browser config gains safe portrait-art defaults", () => {
  const normalized = normalizeBrowserAgentConfig({
    maas: { ...DEFAULT_BROWSER_AGENT_CONFIG.maas, apiKey: "legacy-key" },
    website: DEFAULT_BROWSER_AGENT_CONFIG.website,
  });

  assert.deepEqual(normalized?.image, DEFAULT_BROWSER_AGENT_CONFIG.image);
  assert.deepEqual(normalized?.petQa, DEFAULT_BROWSER_AGENT_CONFIG.petQa);
});

test("a stored config missing userEmail (pre-xhs-maas schema) normalizes to an empty string", () => {
  const normalized = normalizeBrowserAgentConfig({
    maas: { apiKey: "legacy-key", baseUrl: "https://api.deepseek.com/anthropic", model: "deepseek-v4-pro", mode: "tool" },
  });
  assert.equal(normalized?.maas.userEmail, "");
});

test("empty browser keys preserve the server-environment fallback", () => {
  const headers = new Headers(browserAgentConfigHeaders(DEFAULT_BROWSER_AGENT_CONFIG));
  assert.equal(readBrowserAgentConfigHeaders(headers), undefined);
});

test("the provider dropdown maps every Base URL and model to its compatible request mode", () => {
  assert.deepEqual(browserAgentProviderPreset("deepseek", ALL_PRESETS), {
    id: "deepseek",
    label: "DeepSeek",
    baseUrl: "https://api.deepseek.com/anthropic",
    model: "deepseek-v4-pro",
    mode: "tool",
  });
  assert.equal(browserAgentProviderPreset("internal-maas-0", ALL_PRESETS).requiresUserEmail, true);
  assert.equal(browserAgentProviderPreset("internal-maas-1", ALL_PRESETS).model, "qwen-internal");
  assert.equal(browserAgentProviderPreset("external-maas", ALL_PRESETS).mode, "json-schema");
  assert.equal(browserAgentProviderPreset("zhizengzeng", ALL_PRESETS).baseUrl, "https://api.zhizengzeng.com/v1");
  assert.equal(browserAgentProviderPreset("zhizengzeng", ALL_PRESETS).mode, "tool");
});
