import assert from "node:assert/strict";
import test from "node:test";
import {
  buildToolCallRequest,
  isXhsMaasGatewayProvider,
  providerProtocolForBaseUrl,
  XHS_MAAS_APP_ID,
} from "../lib/agents/provider-request.ts";

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: { answer: { type: "string" } },
  required: ["answer"],
} as const;

test("isXhsMaasGatewayProvider matches only the internal gateway host", () => {
  assert.equal(isXhsMaasGatewayProvider("https://maas.devops.xiaohongshu.com"), true);
  assert.equal(isXhsMaasGatewayProvider("maas.devops.xiaohongshu.com"), true);
  assert.equal(isXhsMaasGatewayProvider("https://maas.devops.xiaohongshu.com/v1"), true);
  assert.equal(isXhsMaasGatewayProvider("https://api.deepseek.com/anthropic"), false);
  assert.equal(isXhsMaasGatewayProvider("https://maas.devops.rednote.life/hackson"), false);
  assert.equal(isXhsMaasGatewayProvider("not a url"), false);
});

test("providerProtocolForBaseUrl routes only the xhs-maas host to the openai protocol", () => {
  assert.equal(providerProtocolForBaseUrl("https://maas.devops.xiaohongshu.com"), "xhs-maas");
  assert.equal(providerProtocolForBaseUrl("https://api.deepseek.com/anthropic"), "anthropic");
  assert.equal(providerProtocolForBaseUrl("https://maas.devops.rednote.life/hackson"), "anthropic");
});

test("buildToolCallRequest builds the xhs-maas OpenAI Chat Completions request", () => {
  const request = buildToolCallRequest({
    protocol: "xhs-maas",
    baseUrl: "https://maas.devops.xiaohongshu.com",
    apiKey: "sk-internal-test-key",
    userEmail: "someone@xiaohongshu.com",
    model: "deepseek-v4-pro",
    system: "You are a helpful assistant.",
    userContent: "帮我制定一份五天四夜的旅游攻略",
    temperature: 0.9,
    maxOutputTokens: 4_096,
    toolName: "submit_answer",
    toolDescription: "Submit the answer.",
    toolSchema: SCHEMA,
  });

  assert.equal(request.url, "https://maas.devops.xiaohongshu.com/v1/chat/completions");
  assert.equal(request.headers["api-key"], "sk-internal-test-key");
  assert.equal(request.headers["x-maas-user-email"], "someone@xiaohongshu.com");
  assert.equal(request.headers["x-maas-app-id"], XHS_MAAS_APP_ID);
  assert.equal(request.headers.authorization, undefined);
  assert.equal(request.headers["x-api-key"], undefined);

  assert.equal(request.body.model, "deepseek-v4-pro");
  assert.equal(request.body.stream, false);
  assert.equal(request.body.temperature, 0.9);
  assert.equal(request.body.max_tokens, 4_096);
  assert.deepEqual(request.body.messages, [
    { role: "system", content: "You are a helpful assistant." },
    { role: "user", content: "帮我制定一份五天四夜的旅游攻略" },
  ]);
  const tools = request.body.tools as Array<{ type: string; function: { name: string; parameters: unknown } }>;
  assert.equal(tools[0].type, "function");
  assert.equal(tools[0].function.name, "submit_answer");
  assert.deepEqual(tools[0].function.parameters, SCHEMA);
  assert.deepEqual(request.body.tool_choice, { type: "function", function: { name: "submit_answer" } });
  assert.equal("thinking" in request.body, false);
  assert.equal("output_config" in request.body, false);
});

test("buildToolCallRequest defaults a missing user email to an empty header rather than throwing", () => {
  const request = buildToolCallRequest({
    protocol: "xhs-maas",
    baseUrl: "https://maas.devops.xiaohongshu.com",
    apiKey: "sk-internal-test-key",
    model: "deepseek-v4-pro",
    system: "sys",
    userContent: "hi",
    temperature: 0,
    maxOutputTokens: 100,
    toolName: "t",
    toolDescription: "d",
    toolSchema: SCHEMA,
  });
  assert.equal(request.headers["x-maas-user-email"], "");
});

test("buildToolCallRequest converts Anthropic-style image content blocks to OpenAI image_url parts", () => {
  const request = buildToolCallRequest({
    protocol: "xhs-maas",
    baseUrl: "https://maas.devops.xiaohongshu.com",
    apiKey: "k",
    model: "deepseek-v4-pro",
    system: "sys",
    userContent: [
      { type: "text", text: "describe this" },
      { type: "image", source: { type: "base64", media_type: "image/png", data: "AAAA" } },
    ],
    temperature: 0,
    maxOutputTokens: 100,
    toolName: "t",
    toolDescription: "d",
    toolSchema: SCHEMA,
  });
  const content = (request.body.messages as Array<{ role: string; content: unknown }>)[1].content as Array<Record<string, unknown>>;
  assert.deepEqual(content[0], { type: "text", text: "describe this" });
  assert.deepEqual(content[1], { type: "image_url", image_url: { url: "data:image/png;base64,AAAA" } });
});

test("buildToolCallRequest refuses PDF document blocks on the xhs-maas protocol", () => {
  assert.throws(
    () => buildToolCallRequest({
      protocol: "xhs-maas",
      baseUrl: "https://maas.devops.xiaohongshu.com",
      apiKey: "k",
      model: "deepseek-v4-pro",
      system: "sys",
      userContent: [{ type: "document", source: { type: "base64", media_type: "application/pdf", data: "AAAA" } }],
      temperature: 0,
      maxOutputTokens: 100,
      toolName: "t",
      toolDescription: "d",
      toolSchema: SCHEMA,
    }),
    /does not support PDF/,
  );
});

test("buildToolCallRequest builds the Anthropic Messages request with tool mode", () => {
  const request = buildToolCallRequest({
    protocol: "anthropic",
    baseUrl: "https://api.deepseek.com/anthropic",
    apiKey: "sk-deepseek-test",
    model: "deepseek-v4-pro",
    system: "sys",
    userContent: "hello",
    temperature: 0,
    maxOutputTokens: 8_000,
    toolName: "submit_answer",
    toolDescription: "Submit the answer.",
    toolSchema: SCHEMA,
    disableThinking: true,
  });

  assert.equal(request.url, "https://api.deepseek.com/anthropic/v1/messages");
  assert.equal(request.headers.authorization, "Bearer sk-deepseek-test");
  assert.equal(request.headers["x-api-key"], "sk-deepseek-test");
  assert.equal(request.headers["anthropic-version"], "2023-06-01");
  assert.equal("api-key" in request.headers, false);
  assert.equal("x-maas-user-email" in request.headers, false);

  assert.equal(request.body.system, "sys");
  assert.deepEqual(request.body.messages, [{ role: "user", content: "hello" }]);
  assert.deepEqual(request.body.thinking, { type: "disabled" });
  const tools = request.body.tools as Array<{ name: string; input_schema: unknown }>;
  assert.equal(tools[0].name, "submit_answer");
  assert.deepEqual(tools[0].input_schema, SCHEMA);
  assert.deepEqual(request.body.tool_choice, { type: "any" });
  assert.equal("output_config" in request.body, false);
});

test("buildToolCallRequest builds the Anthropic json-schema request without thinking by default", () => {
  const request = buildToolCallRequest({
    protocol: "anthropic",
    baseUrl: "https://maas.devops.rednote.life/hackson",
    apiKey: "k",
    model: "vertex-claude-sonnet-5/claude-sonnet-5",
    system: "sys",
    userContent: "hello",
    temperature: 0,
    maxOutputTokens: 8_000,
    toolName: "submit_answer",
    toolDescription: "Submit the answer.",
    toolSchema: SCHEMA,
    jsonSchemaMode: true,
    jsonSchemaEffort: "low",
  });

  assert.equal(request.url, "https://maas.devops.rednote.life/hackson/v1/messages");
  assert.deepEqual(request.body.output_config, { effort: "low", format: { type: "json_schema", schema: SCHEMA } });
  assert.equal("tools" in request.body, false);
  assert.equal("tool_choice" in request.body, false);
  assert.equal("thinking" in request.body, false);
});
