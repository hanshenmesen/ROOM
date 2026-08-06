import assert from "node:assert/strict";
import test from "node:test";
import { extractProfileWithAgentRun } from "../lib/agents/profile-agent.ts";

// The repository-wide default provider is DeepSeek's Anthropic-compatible
// endpoint. These tests pin the exact request contract ROOM relies on:
// /anthropic/v1/messages URL, tools + tool_choice structured output, no
// output_config, and tool-mode trace metadata.
delete process.env.MAAS_BASE_URL;
delete process.env.MAAS_MODEL;

const identityResult = {
  sourcePageCount: null,
  personalWebsite: null,
  identity: {
    name: { value: "林遥", evidenceLines: [1], evidenceExcerpt: "林遥" },
    headline: { value: "Agent 工程师", evidenceLines: [2], evidenceExcerpt: "Agent 工程师" },
    location: null,
    summary: { value: "构建可信 Agent。", evidenceLines: [3], evidenceExcerpt: "构建可信 Agent。" },
  },
  contacts: [],
  foods: [],
  hobbies: [],
  skills: [{ value: "TypeScript", evidenceLines: [4], evidenceExcerpt: "TypeScript" }],
};

const itemsResult = {
  sourcePageCount: null,
  items: [{
    kind: "project",
    contentFamily: null,
    title: "ROOM",
    subtitle: null,
    detail: "Agent 驱动的 3D 个人世界。",
    bullets: [],
    tags: [],
    timeRange: null,
    role: null,
    techStack: [],
    projectUrl: null,
    fieldEvidence: {},
    sourceUrl: null,
    mediaIndex: null,
    evidenceLines: [5],
    evidenceExcerpt: "ROOM",
  }],
};

test("the default DeepSeek route calls /anthropic/v1/messages with tool-mode structured output", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.MAAS_API_KEY;
  process.env.MAAS_API_KEY = "sk-deepseek-test-key";
  const requests: Array<{ url: string; body: Record<string, unknown> }> = [];

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const body = JSON.parse(String(init?.body)) as Record<string, unknown> & {
      tools?: Array<{ input_schema?: { properties?: Record<string, unknown> } }>;
    };
    requests.push({ url, body });
    const isIdentity = Boolean(body.tools?.[0]?.input_schema?.properties?.identity);
    return Response.json({
      content: [{
        type: "tool_use",
        id: "toolu_deepseek_1",
        name: "submit_profile_result",
        input: isIdentity ? identityResult : itemsResult,
      }],
      stop_reason: "tool_use",
      usage: { input_tokens: 100, output_tokens: 50 },
    });
  }) as typeof fetch;

  try {
    const run = await extractProfileWithAgentRun(["林遥", "Agent 工程师", "构建可信 Agent。", "TypeScript", "ROOM"].join("\n"));

    assert.equal(run.profile.name, "林遥");
    assert.ok(requests.length >= 2, "identity and inventory shards should both call the provider");
    for (const request of requests) {
      assert.equal(request.url, "https://api.deepseek.com/anthropic/v1/messages");
      const tools = request.body.tools as Array<Record<string, unknown>>;
      assert.equal(tools[0].name, "submit_profile_result");
      assert.deepEqual(request.body.tool_choice, { type: "tool", name: "submit_profile_result" });
      assert.equal("output_config" in request.body, false);
    }

    const completed = run.run.events.filter((event) => event.type === "model.completed");
    assert.ok(completed.length >= 2);
    for (const event of completed) {
      assert.equal(event.meta.mode, "tool");
      assert.equal(event.meta.provider, "api.deepseek.com");
      assert.equal(event.meta.model, "deepseek-v4-pro");
    }
    assert.doesNotMatch(JSON.stringify(run.run), /sk-deepseek-test-key/);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.MAAS_API_KEY;
    else process.env.MAAS_API_KEY = originalKey;
  }
});
