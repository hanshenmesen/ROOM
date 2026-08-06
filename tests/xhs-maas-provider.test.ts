import assert from "node:assert/strict";
import test from "node:test";
import { extractProfileWithAgentRun } from "../lib/agents/profile-agent.ts";
import { createWebsiteResearchModelPlanner } from "../lib/agents/website/planner.ts";
import { createAgentTracer } from "../lib/agent-runtime/tracer.ts";
import { answerPetQaQuestion } from "../lib/agents/pet-qa.ts";
import type { ParsedProfile } from "../lib/types.ts";

// Xiaohongshu's internal MAAS gateway (maas.devops.xiaohongshu.com) proxies
// deepseek-v4-pro over OpenAI Chat Completions with a bespoke header set,
// not Anthropic Messages. These tests pin that wire contract across all
// three model call sites so a protocol regression cannot slip into only one
// of them (see the earlier petQa thinking-disable drift for why this needs
// dedicated coverage per call site instead of one shared test).
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

function openAiToolResponse(toolName: string, args: unknown, usage = { prompt_tokens: 100, completion_tokens: 50 }) {
  return Response.json({
    choices: [{
      message: {
        role: "assistant",
        // The real xhs-maas gateway sends an empty string here on a
        // tool-call response, not null. Matching that exact shape pins the
        // regression where responseText() checked content before
        // tool_calls and returned "" instead of the tool arguments.
        content: "",
        reasoning_content: null,
        tool_calls: [{
          id: "call_1",
          type: "function",
          function: { name: toolName, arguments: JSON.stringify(args) },
        }],
      },
      finish_reason: "tool_calls",
    }],
    usage,
  });
}

test("profile extraction on the xhs-maas gateway calls /v1/chat/completions with the internal header set", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.MAAS_API_KEY;
  const originalEmail = process.env.MAAS_USER_EMAIL;
  process.env.MAAS_API_KEY = "sk-internal-test-key";
  process.env.MAAS_USER_EMAIL = "zhanghanshuo@xiaohongshu.com";
  const requests: Array<{ url: string; headers: Headers; body: Record<string, unknown> }> = [];

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    const body = JSON.parse(String(init?.body)) as Record<string, unknown> & {
      tools?: Array<{ function?: { name?: string; parameters?: { properties?: Record<string, unknown> } } }>;
    };
    requests.push({ url, headers, body });
    const isIdentity = Boolean(body.tools?.[0]?.function?.parameters?.properties?.identity);
    return openAiToolResponse("submit_profile_result", isIdentity ? identityResult : itemsResult);
  }) as typeof fetch;

  try {
    const run = await extractProfileWithAgentRun(
      ["林遥", "Agent 工程师", "构建可信 Agent。", "TypeScript", "ROOM"].join("\n"),
      undefined,
      {
        providerConfig: {
          maasApiKey: "sk-internal-test-key",
          maasBaseUrl: "https://maas.devops.xiaohongshu.com",
          maasUserEmail: "zhanghanshuo@xiaohongshu.com",
        },
      },
    );

    assert.equal(run.profile.name, "林遥");
    assert.ok(requests.length >= 2, "identity and inventory shards should both call the gateway");
    for (const request of requests) {
      assert.equal(request.url, "https://maas.devops.xiaohongshu.com/v1/chat/completions");
      assert.equal(request.headers.get("api-key"), "sk-internal-test-key");
      assert.equal(request.headers.get("x-maas-user-email"), "zhanghanshuo@xiaohongshu.com");
      assert.equal(request.headers.get("x-maas-app-id"), "qs-api");
      assert.equal(request.headers.get("authorization"), null);
      assert.equal(request.body.stream, false);
      // The internal gateway proxies the same deepseek-v4-pro model as the
      // Anthropic-format endpoints and was observed in production also
      // defaulting to thinking mode on, exhausting the entire max_tokens
      // budget on reasoning for the dense "items" shard. Thinking must be
      // disabled here too, not just on the Anthropic protocol.
      assert.deepEqual(request.body.thinking, { type: "disabled" });
      assert.equal("output_config" in request.body, false);
      const tools = request.body.tools as Array<{ type: string }>;
      assert.equal(tools[0].type, "function");
      assert.deepEqual(request.body.tool_choice, { type: "function", function: { name: "submit_profile_result" } });
    }

    const completed = run.run.events.filter((event) => event.type === "model.completed");
    assert.ok(completed.length >= 2);
    for (const event of completed) {
      assert.equal(event.meta.mode, "tool");
      assert.equal(event.meta.provider, "maas.devops.xiaohongshu.com");
      assert.equal(event.meta.inputTokens, 100);
      assert.equal(event.meta.outputTokens, 50);
    }
    assert.doesNotMatch(JSON.stringify(run.run), /sk-internal-test-key/);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.MAAS_API_KEY;
    else process.env.MAAS_API_KEY = originalKey;
    if (originalEmail === undefined) delete process.env.MAAS_USER_EMAIL;
    else process.env.MAAS_USER_EMAIL = originalEmail;
  }
});

test("the website planner on the xhs-maas gateway uses OpenAI function calling", async () => {
  const originalFetch = globalThis.fetch;
  const tracer = createAgentTracer(`xhs-maas-planner-${crypto.randomUUID()}`);
  const requests: Array<{ url: string; headers: Headers; body: Record<string, unknown> }> = [];

  globalThis.fetch = (async (input, init) => {
    const headers = new Headers(init?.headers);
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    requests.push({ url: String(input), headers, body });
    return openAiToolResponse("choose_website_research_action", {
      action: "submit",
      nextUrl: null,
      reason: "当前证据已经足够",
      targetFields: [],
    });
  }) as typeof fetch;

  try {
    const planner = createWebsiteResearchModelPlanner({
      tracer,
      providerConfig: {
        maasApiKey: "sk-internal-test-key",
        maasBaseUrl: "https://maas.devops.xiaohongshu.com",
        maasUserEmail: "zhanghanshuo@xiaohongshu.com",
      },
    });
    assert.ok(planner);
    const decision = await planner({
      iteration: 1,
      rootUrl: "https://portfolio.example.com",
      missingFields: [],
      visitedPages: [{ url: "https://portfolio.example.com", title: "Avery Chen", depth: 0 }],
      candidates: [],
      budgetRemaining: { pages: 4, steps: 70, bytes: 2_900_000 },
    });
    assert.equal(decision.action, "submit");
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, "https://maas.devops.xiaohongshu.com/v1/chat/completions");
    assert.equal(requests[0].headers.get("api-key"), "sk-internal-test-key");
    assert.equal(requests[0].headers.get("x-maas-user-email"), "zhanghanshuo@xiaohongshu.com");
    assert.equal(requests[0].headers.get("x-maas-app-id"), "qs-api");
    assert.deepEqual(requests[0].body.thinking, { type: "disabled" });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

const petProfile: ParsedProfile = {
  id: "profile-1",
  name: "韩晨",
  headline: "LLM-Agent 实习生",
  summary: "研究多智能体与可信信息系统。",
  contacts: [],
  skills: ["Multi-Agent Systems"],
  media: [],
  identityEvidence: {},
  contactEvidence: {},
  skillEvidence: {},
  items: [],
  source: { id: "resume", type: "text", label: "resume.md", lineCount: 1 },
} as unknown as ParsedProfile;

test("pet QA on the xhs-maas gateway uses OpenAI function calling with the internal header set", async () => {
  const originalFetch = globalThis.fetch;
  let request: { url: string; headers: Headers; body: Record<string, unknown> } | undefined;

  globalThis.fetch = (async (input, init) => {
    request = { url: String(input), headers: new Headers(init?.headers), body: JSON.parse(String(init?.body)) };
    return openAiToolResponse("submit_pet_qa_answer", { answer: "主人在研究多智能体系统。", citations: [] });
  }) as typeof fetch;

  try {
    const answer = await answerPetQaQuestion(
      petProfile,
      "主人在研究什么？",
      [],
      {
        maasApiKey: "sk-internal-test-key",
        maasBaseUrl: "https://maas.devops.xiaohongshu.com",
        maasUserEmail: "zhanghanshuo@xiaohongshu.com",
      },
    );
    assert.match(answer.answer, /多智能体/);
    assert.ok(request);
    assert.equal(request!.url, "https://maas.devops.xiaohongshu.com/v1/chat/completions");
    assert.equal(request!.headers.get("api-key"), "sk-internal-test-key");
    assert.equal(request!.headers.get("x-maas-user-email"), "zhanghanshuo@xiaohongshu.com");
    assert.equal(request!.headers.get("x-maas-app-id"), "qs-api");
    assert.deepEqual(request!.body.thinking, { type: "disabled" });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
