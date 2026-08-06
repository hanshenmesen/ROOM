import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  DEFAULT_MAAS_BASE_URL,
  DEFAULT_MAAS_MODEL,
  DEFAULT_PET_QA_BASE_URL,
  DEFAULT_PET_QA_MODEL,
  DEFAULT_WEBSITE_AGENT_BASE_URL,
  DEFAULT_WEBSITE_AGENT_MODEL,
  getAgentProviderConfig,
  getPublicAgentConfigStatus,
  shouldDisableThinking,
} from "../lib/agents/provider-config.ts";

const ENV_NAMES = [
  "MAAS_API_KEY",
  "MAAS_API_KEY_FALLBACK",
  "MAAS_BASE_URL",
  "MAAS_MODEL",
  "WEBSITE_AGENT_API_KEY",
  "WEBSITE_AGENT_API_KEY_FALLBACK",
  "WEBSITE_AGENT_BASE_URL",
  "WEBSITE_AGENT_MODEL",
  "PET_QA_API_KEY",
  "PET_QA_API_KEY_FALLBACK",
  "PET_QA_BASE_URL",
  "PET_QA_MODEL",
] as const;

const originalEnvironment = Object.fromEntries(ENV_NAMES.map((name) => [name, process.env[name]]));

function clearAgentEnvironment() {
  for (const name of ENV_NAMES) delete process.env[name];
}

afterEach(() => {
  for (const name of ENV_NAMES) {
    const value = originalEnvironment[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

test("provider config uses documented defaults without claiming readiness", () => {
  clearAgentEnvironment();
  const config = getAgentProviderConfig();
  const status = getPublicAgentConfigStatus();

  assert.equal(config.maas.baseUrl, DEFAULT_MAAS_BASE_URL);
  assert.equal(config.maas.model, DEFAULT_MAAS_MODEL);
  assert.equal(config.website.baseUrl, DEFAULT_WEBSITE_AGENT_BASE_URL);
  assert.equal(config.website.model, DEFAULT_WEBSITE_AGENT_MODEL);
  assert.equal(config.petQa.baseUrl, DEFAULT_PET_QA_BASE_URL);
  assert.equal(config.petQa.model, DEFAULT_PET_QA_MODEL);
  assert.equal(status.ready, false);
  assert.equal(status.petQa.ready, false);
  assert.equal(status.demoAvailable, true);
  assert.equal(status.secretsExposed, false);
});

test("deepseek base url variants normalize to the anthropic endpoint with tool mode", () => {
  clearAgentEnvironment();
  for (const baseUrl of [
    "https://api.deepseek.com",
    "https://api.deepseek.com/",
    "https://api.deepseek.com/v1",
    "https://api.deepseek.com/anthropic",
  ]) {
    const config = getAgentProviderConfig({ maasApiKey: "k", maasBaseUrl: baseUrl });
    assert.equal(config.maas.baseUrl, "https://api.deepseek.com/anthropic", `normalizing ${baseUrl}`);
    assert.equal(config.maas.mode, "tool", `mode for ${baseUrl}`);
  }
  // An explicit mode still wins over the DeepSeek default.
  assert.equal(
    getAgentProviderConfig({ maasApiKey: "k", maasBaseUrl: "https://api.deepseek.com/v1", maasMode: "json-schema" }).maas.mode,
    "json-schema",
  );
});

test("primary provider mode follows the endpoint unless explicitly overridden", () => {
  clearAgentEnvironment();
  // DeepSeek's Anthropic endpoint ignores output_config.format, so the
  // portable default there is tool mode.
  assert.equal(DEFAULT_MAAS_BASE_URL, "https://api.deepseek.com/anthropic");
  assert.equal(DEFAULT_MAAS_MODEL, "deepseek-v4-pro");
  assert.equal(getAgentProviderConfig().maas.mode, "tool");

  // Providers that support output_config keep the json-schema default.
  process.env.MAAS_BASE_URL = "https://maas.devops.rednote.life/hackson";
  assert.equal(getAgentProviderConfig().maas.mode, "json-schema");

  // An explicit mode always wins.
  assert.equal(getAgentProviderConfig({ maasMode: "json-schema" }).maas.mode, "json-schema");
  assert.equal(getAgentProviderConfig({ maasMode: "tool" }).maas.mode, "tool");
});

test("public status reports provider readiness without exposing API keys", () => {
  clearAgentEnvironment();
  process.env.MAAS_API_KEY = "server-only-primary-secret";
  process.env.MAAS_API_KEY_FALLBACK = "server-only-fallback-secret";
  const status = getPublicAgentConfigStatus();
  const serialized = JSON.stringify(status);

  assert.equal(status.ready, true);
  assert.equal(status.resume.provider, "MAAS");
  assert.equal(status.website.provider, "MAAS fallback");
  assert.equal(status.petQa.provider, "MAAS fallback");
  assert.equal(status.petQa.ready, true);
  assert.equal(status.website.dedicatedProviderConfigured, false);
  assert.equal(status.petQa.dedicatedProviderConfigured, false);
  assert.doesNotMatch(serialized, /server-only-(primary|fallback)-secret/);
  assert.doesNotMatch(serialized, /apiKeys/);
});

test("dedicated website provider is surfaced without revealing its key", () => {
  clearAgentEnvironment();
  process.env.WEBSITE_AGENT_API_KEY = "server-only-website-secret";
  process.env.WEBSITE_AGENT_MODEL = "custom-website-model";
  const status = getPublicAgentConfigStatus();

  assert.equal(status.ready, true);
  assert.equal(status.resume.provider, "Website fallback");
  assert.equal(status.resume.model, "custom-website-model");
  assert.equal(status.website.provider, "Website Agent");
  assert.equal(status.website.model, "custom-website-model");
  assert.equal(JSON.stringify(status).includes("server-only-website-secret"), false);
});

test("dedicated pet QA provider is surfaced without revealing its key", () => {
  clearAgentEnvironment();
  process.env.PET_QA_API_KEY = "server-only-pet-secret";
  process.env.PET_QA_BASE_URL = "https://pet.example.test/root";
  process.env.PET_QA_MODEL = "pet-model";
  const status = getPublicAgentConfigStatus();

  assert.equal(status.petQa.ready, true);
  assert.equal(status.petQa.provider, "Pet QA Agent");
  assert.equal(status.petQa.dedicatedProviderConfigured, true);
  assert.equal(status.petQa.baseUrl, "https://pet.example.test/root");
  assert.equal(status.petQa.model, "pet-model");
  assert.equal(JSON.stringify(status).includes("server-only-pet-secret"), false);
});

test("a browser override never mixes with server-side provider keys", () => {
  clearAgentEnvironment();
  process.env.MAAS_API_KEY = "server-maas-secret";
  process.env.WEBSITE_AGENT_API_KEY = "server-website-secret";
  const config = getAgentProviderConfig({
    maasApiKey: "browser-maas-secret",
    maasBaseUrl: "https://browser-provider.example/v1",
    maasModel: "browser-model",
    maasMode: "tool",
  });

  assert.deepEqual(config.maas.apiKeys, ["browser-maas-secret"]);
  assert.deepEqual(config.website.apiKeys, []);
  assert.equal(config.maas.baseUrl, "https://browser-provider.example/v1");
  assert.equal(config.maas.model, "browser-model");
  assert.equal(config.maas.mode, "tool");
});

test("thinking is disabled only for DeepSeek routes, not Qwen on the same internal gateway", () => {
  assert.equal(shouldDisableThinking("https://api.deepseek.com/anthropic", "deepseek-v4-pro"), true);
  assert.equal(shouldDisableThinking("https://maas.devops.xiaohongshu.com", "deepseek-v4-pro"), true);
  assert.equal(shouldDisableThinking("https://maas.devops.xiaohongshu.com", "qwen3.5-397b-a17b"), false);
});

test("a browser pet QA override falls back to the browser MAAS key when no dedicated QA key is set", () => {
  clearAgentEnvironment();
  process.env.MAAS_API_KEY = "server-maas-secret";
  const config = getAgentProviderConfig({
    maasApiKey: "browser-maas-secret",
    maasBaseUrl: "https://browser-maas.example/v1",
    maasModel: "browser-maas-model",
    petQaBaseUrl: "https://browser-pet.example/v1",
    petQaModel: "browser-pet-model",
  });

  assert.deepEqual(config.petQa.apiKeys, ["browser-maas-secret"]);
  assert.equal(config.petQa.baseUrl, "https://browser-pet.example/v1");
  assert.equal(config.petQa.model, "browser-pet-model");
});
