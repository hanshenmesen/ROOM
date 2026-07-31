import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BROWSER_AGENT_PROVIDER_PRESETS,
  DEFAULT_BROWSER_AGENT_CONFIG,
  browserAgentProviderPreset,
  browserAgentConfigHeaders,
  readBrowserAgentConfigHeaders,
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
  }));
  const parsed = readBrowserAgentConfigHeaders(headers);

  assert.equal(parsed?.maasApiKey, "browser-session-key");
  assert.equal(parsed?.websiteApiKey, "website-session-key");
  assert.equal(parsed?.maasBaseUrl, DEFAULT_BROWSER_AGENT_CONFIG.maas.baseUrl);
  assert.equal(parsed?.websiteModel, DEFAULT_BROWSER_AGENT_CONFIG.website.model);
  assert.equal(parsed?.maasMode, "json-schema");
  assert.equal(parsed?.websiteMode, "tool");
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
