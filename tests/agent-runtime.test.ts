import assert from "node:assert/strict";
import test from "node:test";
import { summarizeAgentRun } from "../lib/agent-runtime/trace-summary.ts";
import { createAgentTracer } from "../lib/agent-runtime/tracer.ts";
import { inMemoryTraceStore } from "../lib/agent-runtime/in-memory-trace-store.ts";
import { extractProfileWithAgentRun } from "../lib/agents/profile-agent.ts";

const identity = {
  sourcePageCount: null,
  personalWebsite: null,
  identity: {
    name: { value: "林遥", evidenceLines: [1], evidenceExcerpt: "林遥" },
    headline: { value: "Agent 工程师", evidenceLines: [2], evidenceExcerpt: "Agent 工程师" },
    location: null,
    summary: { value: "构建可信 Agent。", evidenceLines: [3], evidenceExcerpt: "构建可信 Agent" },
  },
  contacts: [],
  foods: [],
  hobbies: [],
  skills: [{ value: "TypeScript", evidenceLines: [4], evidenceExcerpt: "TypeScript" }],
};

const inventory = {
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

test("profile model calls emit unique, redacted, real metadata with fallback details", async () => {
  inMemoryTraceStore.clear();
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.MAAS_API_KEY;
  const originalModel = process.env.MAAS_MODEL;
  process.env.MAAS_API_KEY = "sk-super-secret-test-key";
  process.env.MAAS_MODEL = "vertex-claude-sonnet-5/claude-sonnet-5";
  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as {
      model: string;
      output_config?: { format?: { schema?: { properties?: Record<string, unknown> } } };
      tools?: Array<{ input_schema?: { properties?: Record<string, unknown> } }>;
    };
    if (body.model.startsWith("vertex-")) return Response.json({ content: [], usage: { input_tokens: 10, output_tokens: 0 } });
    const properties = body.output_config?.format?.schema?.properties || body.tools?.[0]?.input_schema?.properties || {};
    const result = properties.identity ? identity : inventory;
    return Response.json({
      content: [{ type: "text", text: JSON.stringify(result) }],
      stop_reason: "end_turn",
      usage: { input_tokens: 123, output_tokens: 45 },
    });
  }) as typeof fetch;

  try {
    const run = await extractProfileWithAgentRun([
      "林遥",
      "Agent 工程师",
      "构建可信 Agent。",
      "TypeScript",
      "ROOM",
    ].join("\n"));
    assert.equal(run.profile.name, "林遥");
    assert.equal(run.run.status, "completed");
    const failedCalls = run.run.events.filter((event) => event.type === "model.failed");
    const completedCalls = run.run.events.filter((event) => event.type === "model.completed");
    assert.equal(failedCalls.length, 2);
    assert.equal(completedCalls.length, 2);
    const callIds = [...failedCalls, ...completedCalls].map((event) => event.meta.callId);
    assert.equal(new Set(callIds).size, callIds.length);
    assert.ok(completedCalls.every((event) => event.meta.model.startsWith("bedrock-")));
    assert.ok(completedCalls.every((event) => event.meta.mode === "json-schema"));
    assert.ok(completedCalls.every((event) => event.meta.fallbackCount === 1));
    assert.ok(completedCalls.every((event) => event.meta.inputTokens === 123));
    assert.ok(completedCalls.every((event) => event.meta.outputTokens === 45));
    assert.ok(completedCalls.every((event) => event.meta.promptVersion.startsWith("profile.")));
    assert.doesNotMatch(JSON.stringify(run.run), /super-secret|authorization|x-api-key/i);
    const summary = summarizeAgentRun(run.run.events);
    assert.ok(summary.some((step) => step.id === "profile.identity" && step.status === "warning"));
    assert.ok(summary.some((step) => step.id === "profile.items" && step.calls?.length === 2));
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.MAAS_API_KEY;
    else process.env.MAAS_API_KEY = originalKey;
    if (originalModel === undefined) delete process.env.MAAS_MODEL;
    else process.env.MAAS_MODEL = originalModel;
  }
});
test("trace redaction removes secrets from validation and failure events", () => {
  inMemoryTraceStore.clear();
  const tracer = createAgentTracer("redaction-test-run");
  tracer.emit({
    type: "validation.failed",
    step: "profile.validate",
    errors: ["authorization: Bearer abcdefghijk", "apiKey=sk-secretvalue123"],
  });
  tracer.fail("provider_failed");
  const serialized = JSON.stringify(tracer.snapshot());
  assert.doesNotMatch(serialized, /abcdefghijk|secretvalue123/);
  assert.match(serialized, /REDACTED/);
});
