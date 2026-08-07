import assert from "node:assert/strict";
import test from "node:test";
import {
  providerCapabilitiesFor,
  type ProviderCapabilities,
} from "../lib/agents/provider-capabilities.ts";
import { buildToolCallRequest } from "../lib/agents/provider-request.ts";
import { shouldDisableThinking } from "../lib/agents/provider-config.ts";

/**
 * Contract suite for the provider capability matrix. Every row pins the
 * facts that were previously discovered by production failures: wire
 * protocol, document/image support, thinking-mode handling, and the
 * resulting request shape. Adding a provider means adding a row here --
 * the matrix times call-site combinations are asserted exhaustively so a
 * mismatch cannot reach production again unnoticed.
 */

type ProviderRow = {
  name: string;
  baseUrl: string;
  model: string;
  expected: ProviderCapabilities;
};

const PROVIDER_ROWS: ProviderRow[] = [
  {
    name: "DeepSeek official Anthropic endpoint",
    baseUrl: "https://api.deepseek.com/anthropic",
    model: "deepseek-v4-pro",
    expected: {
      protocol: "anthropic",
      supportsDocumentBlocks: false,
      supportsImageBlocks: false,
      disableThinking: true,
    },
  },
  {
    name: "xhs-maas gateway with DeepSeek V4 Pro",
    baseUrl: "https://maas.devops.xiaohongshu.com",
    model: "deepseek-v4-pro",
    expected: {
      protocol: "xhs-maas",
      supportsDocumentBlocks: false,
      supportsImageBlocks: false,
      disableThinking: true,
    },
  },
  {
    name: "xhs-maas gateway with Qwen 3.5",
    baseUrl: "https://maas.devops.xiaohongshu.com",
    model: "qwen3.5-397b-a17b",
    expected: {
      protocol: "xhs-maas",
      supportsDocumentBlocks: false,
      supportsImageBlocks: false,
      disableThinking: false,
    },
  },
  {
    name: "external MAAS Claude route",
    baseUrl: "https://maas.devops.rednote.life/hackson",
    model: "vertex-claude-sonnet-5/claude-sonnet-5",
    expected: {
      protocol: "anthropic",
      supportsDocumentBlocks: true,
      supportsImageBlocks: true,
      disableThinking: false,
    },
  },
  {
    name: "Zhizengzeng Claude route",
    baseUrl: "https://api.zhizengzeng.com/v1",
    model: "claude-sonnet-5",
    expected: {
      protocol: "anthropic",
      supportsDocumentBlocks: true,
      supportsImageBlocks: true,
      disableThinking: false,
    },
  },
];

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: { answer: { type: "string" } },
  required: ["answer"],
} as const;

for (const row of PROVIDER_ROWS) {
  test(`capability matrix: ${row.name}`, () => {
    assert.deepEqual(providerCapabilitiesFor(row.baseUrl, row.model), row.expected);
    assert.equal(shouldDisableThinking(row.baseUrl, row.model), row.expected.disableThinking);
  });

  test(`wire contract: ${row.name}`, () => {
    const capabilities = providerCapabilitiesFor(row.baseUrl, row.model);
    const request = buildToolCallRequest({
      protocol: capabilities.protocol,
      baseUrl: row.baseUrl,
      apiKey: "contract-test-key",
      userEmail: "contract@xiaohongshu.com",
      model: row.model,
      system: "sys",
      userContent: "hello",
      temperature: 0,
      maxOutputTokens: 1_024,
      toolName: "submit_result",
      toolDescription: "Submit the result.",
      toolSchema: SCHEMA,
      disableThinking: capabilities.disableThinking,
    });

    if (capabilities.protocol === "xhs-maas") {
      assert.equal(request.url, `${row.baseUrl}/v1/chat/completions`);
      assert.equal(request.headers["api-key"], "contract-test-key");
      assert.equal(request.headers["x-maas-user-email"], "contract@xiaohongshu.com");
      assert.equal(request.headers["x-maas-app-id"], "qs-api");
      assert.deepEqual(request.body.tool_choice, {
        type: "function",
        function: { name: "submit_result" },
      });
    } else {
      assert.match(request.url, /\/v1\/messages$/);
      assert.equal(request.headers.authorization, "Bearer contract-test-key");
      assert.deepEqual(request.body.tool_choice, { type: "any" });
    }

    // The thinking field must be present exactly when the matrix says the
    // model needs it disabled -- never for Qwen or Claude routes.
    if (capabilities.disableThinking) {
      assert.deepEqual(request.body.thinking, { type: "disabled" });
    } else {
      assert.equal("thinking" in request.body, false);
    }
  });
}

test("DeepSeek base URL variants all resolve to the official capability row", () => {
  for (const baseUrl of [
    "https://api.deepseek.com",
    "https://api.deepseek.com/v1",
    "https://api.deepseek.com/anthropic",
  ]) {
    assert.deepEqual(providerCapabilitiesFor(baseUrl, "deepseek-v4-pro"), PROVIDER_ROWS[0].expected);
  }
});

test("unknown future DeepSeek models on the internal gateway still get thinking disabled", () => {
  assert.equal(providerCapabilitiesFor("https://maas.devops.xiaohongshu.com", "deepseek-v5-pro").disableThinking, true);
});
