import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BROWSER_AGENT_PROVIDER_PRESETS,
  DEFAULT_BROWSER_AGENT_CONFIG,
  browserAgentProviderPreset,
  browserAgentConfigHeaders,
  browserPetQaConfigHeaders,
  browserPortraitArtConfigHeaders,
  normalizeBrowserAgentConfig,
  readBrowserAgentConfigHeaders,
  readBrowserPetQaConfigHeaders,
  readBrowserPortraitArtConfigHeaders,
} from "../lib/browser-agent-config.ts";

test("browser Agent config ships with the requested MAAS defaults", () => {
  assert.equal(DEFAULT_BROWSER_AGENT_CONFIG.maas.baseUrl, "https://maas.devops.rednote.life/hackson");
  assert.equal(DEFAULT_BROWSER_AGENT_CONFIG.maas.model, "vertex-claude-sonnet-5/claude-sonnet-5");
});

test("browser Agent config crosses the parsing boundary without using a URL query", () => {
  const headers = new Headers(browserAgentConfigHeaders({
    maas: {
      apiKey: "browser-session-key",
      baseUrl: DEFAULT_BROWSER_AGENT_CONFIG.maas.baseUrl,
      model: DEFAULT_BROWSER_AGENT_CONFIG.maas.model,
      mode: DEFAULT_BROWSER_AGENT_CONFIG.maas.mode,
    },
    website: {
      apiKey: "website-session-key",
      baseUrl: DEFAULT_BROWSER_AGENT_CONFIG.website.baseUrl,
      model: DEFAULT_BROWSER_AGENT_CONFIG.website.model,
      mode: DEFAULT_BROWSER_AGENT_CONFIG.website.mode,
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
    },
  }));
  const parsed = readBrowserAgentConfigHeaders(headers);

  assert.equal(parsed?.maasApiKey, "browser-session-key");
  assert.equal(parsed?.websiteApiKey, "website-session-key");
  assert.equal(parsed?.maasBaseUrl, DEFAULT_BROWSER_AGENT_CONFIG.maas.baseUrl);
  assert.equal(parsed?.websiteModel, DEFAULT_BROWSER_AGENT_CONFIG.website.model);
  assert.equal(parsed?.maasMode, "json-schema");
  assert.equal(parsed?.websiteMode, "tool");
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
    },
  }));
  const parsed = readBrowserPetQaConfigHeaders(headers);

  assert.deepEqual(parsed, {
    petQaApiKey: "pet-key",
    petQaBaseUrl: "https://pet.example.test/v1",
    petQaModel: "pet-model",
    petQaMode: "tool",
  });
  assert.equal(headers.has("x-room-maas-api-key"), false);
  assert.equal(headers.has("x-room-image-api-key"), false);
});

test("pet QA requests reuse the primary session key when no dedicated key is set", () => {
  const headers = new Headers(browserPetQaConfigHeaders({
    ...DEFAULT_BROWSER_AGENT_CONFIG,
    maas: { ...DEFAULT_BROWSER_AGENT_CONFIG.maas, apiKey: "shared-key" },
  }));

  assert.equal(readBrowserPetQaConfigHeaders(headers)?.petQaApiKey, "shared-key");
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

test("empty browser keys preserve the server-environment fallback", () => {
  const headers = new Headers(browserAgentConfigHeaders(DEFAULT_BROWSER_AGENT_CONFIG));
  assert.equal(readBrowserAgentConfigHeaders(headers), undefined);
});

test("the provider dropdown maps both Base URLs to their compatible request modes", () => {
  assert.equal(BROWSER_AGENT_PROVIDER_PRESETS.length, 2);
  assert.deepEqual(browserAgentProviderPreset("maas"), {
    id: "maas",
    label: "MAAS",
    baseUrl: "https://maas.devops.rednote.life/hackson",
    model: "vertex-claude-sonnet-5/claude-sonnet-5",
    mode: "json-schema",
  });
  assert.equal(browserAgentProviderPreset("zhizengzeng").baseUrl, "https://api.zhizengzeng.com/v1");
  assert.equal(browserAgentProviderPreset("zhizengzeng").mode, "tool");
});
