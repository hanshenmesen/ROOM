import assert from "node:assert/strict";
import test from "node:test";
import { extractProfileFromAttachmentWithAgent } from "../lib/agents/profile-agent.ts";
import { compileProfile } from "../lib/agents/pipeline.ts";
import { formatPdfEvidence } from "../lib/pdf-preparse.ts";
import { mergeProfiles } from "../lib/profile-merge.ts";
import { validatePublicUrl } from "../lib/public-web.ts";

// These tests exercise the MAAS json-schema request path (output_config and
// the Bedrock fallback model). Pinning the base URL keeps that path the
// default here even though the repository-wide default provider is DeepSeek.
process.env.MAAS_BASE_URL = "https://maas.devops.rednote.life/hackson";

const identityResult = {
  sourcePageCount: 1,
  personalWebsite: {
    value: "portfolio.example.com",
    evidenceLines: [1],
    evidenceExcerpt: "portfolio.example.com",
  },
  identity: {
    name: { value: "韩晨", evidenceLines: [1], evidenceExcerpt: "韩晨" },
    headline: { value: "LLM-Agent 实习生", evidenceLines: [1], evidenceExcerpt: "意向：LLM-Agent实习生" },
    location: null,
    summary: { value: "研究多智能体与可信信息系统。", evidenceLines: [1], evidenceExcerpt: "多智能体与可信信息系统" },
  },
  contacts: [{ value: "han@example.com", evidenceLines: [1], evidenceExcerpt: "han@example.com" }],
  foods: [
    { value: "寿司", evidenceLines: [1], evidenceExcerpt: "喜欢的食物：寿司" },
  ],
  hobbies: [
    { value: "摄影", evidenceLines: [1], evidenceExcerpt: "爱好：摄影、爵士乐" },
    { value: "爵士乐", evidenceLines: [1], evidenceExcerpt: "爱好：摄影、爵士乐" },
  ],
  skills: [{ value: "Multi-Agent Systems", evidenceLines: [1], evidenceExcerpt: "Multi-Agent Systems" }],
};

const itemsResult = {
  sourcePageCount: 1,
  items: [
    {
      kind: "project",
      contentFamily: "publication",
      title: "Beyond Detection",
      subtitle: "AAAI 2026 Oral",
      detail: "提出基于证据的辩论框架。",
      bullets: ["构建证据辩论框架", "入选 AAAI 2026 Oral"],
      tags: ["AI Safety", "RAG"],
      sourceUrl: "https://example.com/paper",
      mediaIndex: null,
      timeRange: null,
      role: "First Author",
      techStack: ["Multi-Agent Systems", "Evidence Retrieval"],
      projectUrl: "https://example.com/demo",
      fieldEvidence: {
        role: [1],
        techStack: [1],
        projectUrl: [1],
      },
      evidenceLines: [1],
      evidenceExcerpt: "Beyond Detection, AAAI 2026 Oral, First Author, Multi-Agent Systems, https://example.com/demo",
    },
  ],
};

function resultForProperties(
  properties: Record<string, unknown>,
  inventory: { sourcePageCount: number | null; items: Array<Record<string, unknown>> } = itemsResult,
) {
  if (properties.identity && properties.items) return { ...identityResult, items: inventory.items };
  return properties.identity ? identityResult : inventory;
}

test("profile Agent extracts a normal PDF with parallel evidence-backed shards", async () => {
  type MaasRequestBody = {
    output_config: { format: { schema: { properties: Record<string, unknown> } } };
    messages: Array<{ content: unknown }>;
  };
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.MAAS_API_KEY;
  const calls: MaasRequestBody[] = [];
  process.env.MAAS_API_KEY = "test-key";
  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as MaasRequestBody;
    calls.push(body);
    const schema = body.output_config.format.schema;
    const result = resultForProperties(schema.properties);
    return Response.json({ content: [{ type: "text", text: JSON.stringify(result) }] });
  }) as typeof fetch;

  try {
    const profile = await extractProfileFromAttachmentWithAgent(
      { mediaType: "application/pdf", data: "cGRm" },
      { label: "resume.pdf", type: "text", format: "pdf" },
    );
    assert.equal(calls.length, 2);
    const itemCall = calls.find((call) => call.output_config.format.schema.properties.items);
    const itemSchema = itemCall?.output_config.format.schema.properties.items as { items?: { properties?: Record<string, unknown> } } | undefined;
    assert.ok(itemSchema?.items?.properties?.subtitle);
    assert.ok(itemSchema?.items?.properties?.bullets);
    assert.ok(itemSchema?.items?.properties?.tags);
    assert.ok(itemSchema?.items?.properties?.role);
    assert.ok(itemSchema?.items?.properties?.techStack);
    assert.ok(itemSchema?.items?.properties?.projectUrl);
    assert.ok(itemSchema?.items?.properties?.fieldEvidence);
    assert.ok(calls.every((call) => Array.isArray(call.messages[0]?.content)));
    assert.ok(calls.every((call) => {
      const content = call.messages[0]?.content as Array<{ type?: string }>;
      return content[0]?.type === "document";
    }));
    assert.equal(profile.name, "韩晨");
    assert.equal(profile.personalWebsite, "https://portfolio.example.com/");
    assert.equal(profile.source.locatorUnit, "page");
    assert.deepEqual(profile.foods, ["寿司"]);
    assert.equal(profile.foodEvidence?.寿司?.[0]?.locator, "page:1");
    assert.deepEqual(profile.hobbies, ["摄影", "爵士乐"]);
    assert.equal(profile.hobbyEvidence?.摄影?.[0]?.locator, "page:1");
    assert.equal(profile.items.length, 2);
    assert.ok(profile.items.every((item) => item.evidence[0]?.locator === "page:1"));
    assert.equal(profile.items[1]?.contentFamily, "publication");
    assert.equal(profile.items[1]?.subtitle, "AAAI 2026 Oral");
    assert.deepEqual(profile.items[1]?.bullets, ["构建证据辩论框架", "入选 AAAI 2026 Oral"]);
    assert.deepEqual(profile.items[1]?.tags, ["AI Safety", "RAG"]);
    assert.equal(profile.items[1]?.role, "First Author");
    assert.deepEqual(profile.items[1]?.techStack, ["Multi-Agent Systems", "Evidence Retrieval"]);
    assert.equal(profile.items[1]?.projectUrl, "https://example.com/demo");
    assert.equal(profile.items[1]?.fieldEvidence?.role?.[0]?.locator, "page:1");
    assert.equal(profile.items[1]?.fieldEvidence?.techStack?.[0]?.locator, "page:1");
    assert.equal(profile.items[1]?.fieldEvidence?.projectUrl?.[0]?.locator, "page:1");
    const compiled = compileProfile(profile);
    assert.equal(compiled.report.passed, true);
    assert.equal(compiled.world.profile.id, profile.id);

    const websiteProfile = structuredClone(profile);
    websiteProfile.source = { ...websiteProfile.source, id: "website-source", type: "url", format: "text", locatorUnit: "line" };
    websiteProfile.summary = `${profile.summary} 网站补充了更完整的研究介绍。`;
    websiteProfile.identityEvidence.summary = [{ sourceId: "website-source", locator: "line:2", excerpt: "更完整的研究介绍" }];
    websiteProfile.skills.push("RAG");
    websiteProfile.skillEvidence.RAG = [{ sourceId: "website-source", locator: "line:3", excerpt: "RAG" }];
    websiteProfile.foods = ["寿司", "意面"];
    websiteProfile.foodEvidence = {
      ...websiteProfile.foodEvidence,
      意面: [{ sourceId: "website-source", locator: "line:3", excerpt: "喜欢意面" }],
    };
    websiteProfile.hobbies = ["摄影", "爵士乐", "徒步"];
    websiteProfile.hobbyEvidence = {
      ...websiteProfile.hobbyEvidence,
      徒步: [{ sourceId: "website-source", locator: "line:3", excerpt: "周末徒步" }],
    };
    websiteProfile.items[1] = {
      ...websiteProfile.items[1],
      summary: "网站给出了更完整的论文介绍与图片。",
      evidence: [{ sourceId: "website-source", locator: "line:4", excerpt: "Beyond Detection" }],
    };
    websiteProfile.items.push({
      ...websiteProfile.items[1],
      id: "website-only-project",
      title: "Website-only Project",
    });
    const merged = mergeProfiles(profile, websiteProfile, "resume.pdf + website");
    assert.equal(merged.items.length, 3);
    assert.equal(merged.skills.includes("RAG"), true);
    assert.deepEqual(merged.foods, ["寿司", "意面"]);
    assert.deepEqual(merged.hobbies, ["摄影", "爵士乐", "徒步"]);
    assert.equal(merged.summary, profile.summary);
    assert.equal(merged.items.find((item) => item.title === "Beyond Detection")?.evidence.length, 2);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.MAAS_API_KEY;
    else process.env.MAAS_API_KEY = originalKey;
  }
});

test("profile Agent keeps legacy detail-only item shards compatible", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.MAAS_API_KEY;
  process.env.MAAS_API_KEY = "test-key";
  const legacyItemsResult = {
    sourcePageCount: 1,
    items: [
      {
        kind: "project",
        contentFamily: null,
        title: "Legacy Project",
        detail: "旧响应只提供 detail 与通用 evidence。",
        timeRange: null,
        sourceUrl: null,
        mediaIndex: null,
        evidenceLines: [1],
        evidenceExcerpt: "Legacy Project",
      },
    ],
  };
  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as {
      output_config: { format: { schema: { properties: Record<string, unknown> } } };
    };
    const result = resultForProperties(body.output_config.format.schema.properties, legacyItemsResult);
    return Response.json({ content: [{ type: "text", text: JSON.stringify(result) }] });
  }) as typeof fetch;

  try {
    const profile = await extractProfileFromAttachmentWithAgent(
      { mediaType: "application/pdf", data: "cGRm" },
      { label: "resume.pdf", type: "text", format: "pdf", pageCount: 1 },
    );
    const project = profile.items.find((item) => item.title === "Legacy Project");
    assert.equal(project?.summary, "旧响应只提供 detail 与通用 evidence。");
    assert.deepEqual(project?.bullets, []);
    assert.deepEqual(project?.tags, []);
    assert.equal(project?.role, undefined);
    assert.equal(project?.techStack, undefined);
    assert.equal(project?.projectUrl, undefined);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.MAAS_API_KEY;
    else process.env.MAAS_API_KEY = originalKey;
  }
});

test("personal website fetch guard rejects local and credential-bearing URLs", () => {
  assert.throws(() => validatePublicUrl("http://127.0.0.1/profile"));
  assert.throws(() => validatePublicUrl("https://user:secret@example.com/profile"));
  assert.equal(validatePublicUrl("https://portfolio.example.com/profile").hostname, "portfolio.example.com");
});

test("PDF evidence keeps page boundaries and deduplicates embedded links", () => {
  const evidence = formatPdfEvidence(
    ["第一页  文本\n\n\n教育经历", "第二页项目"],
    ["https://example.com", "https://example.com"],
  );
  assert.match(evidence, /\[PDF page 1\]\n第一页 文本\n\n教育经历/);
  assert.match(evidence, /\[PDF page 2\]\n第二页项目/);
  assert.equal(evidence.match(/https:\/\/example\.com/g)?.length, 1);
});

test("profile Agent switches to Bedrock Sonnet when the configured route returns empty", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.MAAS_API_KEY;
  const originalModel = process.env.MAAS_MODEL;
  const models: string[] = [];
  process.env.MAAS_API_KEY = "test-key";
  process.env.MAAS_MODEL = "vertex-claude-sonnet-5/claude-sonnet-5";
  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as {
      model: string;
      output_config: { format: { schema: { properties: Record<string, unknown> } } };
    };
    models.push(body.model);
    if (body.model.startsWith("vertex-")) return Response.json({ content: [] });
    const result = resultForProperties(body.output_config.format.schema.properties);
    return Response.json({ content: [{ type: "text", text: JSON.stringify(result) }] });
  }) as typeof fetch;

  try {
    const profile = await extractProfileFromAttachmentWithAgent(
      { mediaType: "application/pdf", data: "cGRm" },
      { label: "resume.pdf", format: "pdf", pageCount: 1 },
    );
    assert.equal(profile.name, "韩晨");
    assert.ok(models.some((model) => model.startsWith("bedrock-")));
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.MAAS_API_KEY;
    else process.env.MAAS_API_KEY = originalKey;
    if (originalModel === undefined) delete process.env.MAAS_MODEL;
    else process.env.MAAS_MODEL = originalModel;
  }
});

test("profile Agent falls back after truncated JSON and gives complete profiles enough output budget", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.MAAS_API_KEY;
  const originalModel = process.env.MAAS_MODEL;
  const requests: Array<{ model: string; max_tokens: number; system: string; hasItems: boolean }> = [];
  process.env.MAAS_API_KEY = "test-key";
  process.env.MAAS_MODEL = "vertex-claude-sonnet-5/claude-sonnet-5";
  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as {
      model: string;
      max_tokens: number;
      system: string;
      output_config: { format: { schema: { properties: Record<string, unknown> } } };
    };
    const properties = body.output_config.format.schema.properties;
    const hasItems = Boolean(properties.items);
    requests.push({ model: body.model, max_tokens: body.max_tokens, system: body.system, hasItems });
    if (body.model.startsWith("vertex-")) {
      return Response.json({
        stop_reason: "max_tokens",
        content: [{ type: "text", text: '{"sourcePageCount":1,"items":[' }],
      });
    }
    const result = resultForProperties(properties);
    return Response.json({ stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(result) }] });
  }) as typeof fetch;

  try {
    const profile = await extractProfileFromAttachmentWithAgent(
      { mediaType: "application/pdf", data: "cGRm" },
      { label: "dense-resume.pdf", format: "pdf", pageCount: 1 },
    );
    assert.equal(profile.name, "韩晨");
    assert.ok(requests.some((request) => request.model.startsWith("bedrock-")));
    assert.equal(requests.find((request) => request.hasItems)?.max_tokens, 12_000);
    assert.ok(requests.every((request) => request.system.includes("Return exactly one complete JSON object")));
    assert.ok(requests.every((request) => request.system.includes("last non-whitespace character must be }")));
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.MAAS_API_KEY;
    else process.env.MAAS_API_KEY = originalKey;
    if (originalModel === undefined) delete process.env.MAAS_MODEL;
    else process.env.MAAS_MODEL = originalModel;
  }
});

test("profile Agent falls back from a valid but incomplete resume inventory", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.MAAS_API_KEY;
  process.env.MAAS_API_KEY = "test-key";
  let inventoryCalls = 0;
  const inventoryPrompts: string[] = [];
  const item = (kind: "project" | "experience" | "education" | "achievement", title: string) => ({
    kind,
    contentFamily: kind === "achievement" ? "publication" : null,
    title,
    detail: `${title} 的简要事实。`,
    timeRange: null,
    sourceUrl: null,
    mediaIndex: null,
    evidenceLines: [1],
    evidenceExcerpt: title,
  });
  const completeItems = {
    sourcePageCount: 1,
    items: [
      item("education", "学校 A"),
      item("education", "学校 B"),
      item("achievement", "论文 A"),
      item("achievement", "论文 B"),
      item("experience", "公司 A"),
    ],
  };
  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as {
      messages: Array<{ content: Array<{ type: string; text?: string }> }>;
      output_config: { format: { schema: { properties: Record<string, unknown> } } };
    };
    const properties = body.output_config.format.schema.properties;
    if (properties.identity) {
      return Response.json({ content: [{ type: "text", text: JSON.stringify(identityResult) }] });
    }
    inventoryCalls += 1;
    inventoryPrompts.push(body.messages[0]?.content.find((part) => part.type === "text")?.text || "");
    const inventory = inventoryCalls === 1
      ? { sourcePageCount: 1, items: [item("achievement", "只有一个条目的不完整结果")] }
      : completeItems;
    return Response.json({ content: [{ type: "text", text: JSON.stringify(inventory) }] });
  }) as typeof fetch;

  const preparsedText = [
    "教育经历",
    "学校 A 2020.01 - 2022.01",
    "学校 B 2022.02 - 2024.02",
    "科研成果",
    "1. 论文 A",
    "2. 论文 B",
    "工作实习",
    "公司 A 2024.03 - 至今",
  ].join("\n");

  try {
    const profile = await extractProfileFromAttachmentWithAgent(
      { mediaType: "application/pdf", data: "cGRm" },
      { label: "dense-resume.pdf", format: "pdf", pageCount: 1 },
      preparsedText,
    );
    assert.equal(inventoryCalls, 2);
    assert.equal(profile.items.length, 6);
    assert.match(inventoryPrompts[0] || "", /must return at least 5 items/);
    assert.match(inventoryPrompts[1] || "", /must return at least 5 items/);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.MAAS_API_KEY;
    else process.env.MAAS_API_KEY = originalKey;
  }
});

test("profile Agent splits a high-density resume into research and career inventory shards", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.MAAS_API_KEY;
  process.env.MAAS_API_KEY = "test-key";
  const shards: string[] = [];
  const item = (kind: "project" | "experience" | "education" | "achievement", title: string) => ({
    kind,
    contentFamily: kind === "achievement" ? "publication" : null,
    title,
    detail: `${title} 的简要事实。`,
    timeRange: null,
    sourceUrl: null,
    mediaIndex: null,
    evidenceLines: [1],
    evidenceExcerpt: title,
  });
  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as {
      system: string;
      output_config: { format: { schema: { properties: Record<string, unknown> } } };
    };
    if (body.output_config.format.schema.properties.identity) {
      shards.push("identity");
      return Response.json({ content: [{ type: "text", text: JSON.stringify(identityResult) }] });
    }
    const research = body.system.includes("research, publication, and project inventory");
    shards.push(research ? "research" : "career");
    const items = research
      ? Array.from({ length: 7 }, (_, index) => item("achievement", `论文 ${index + 1}`))
      : [
        item("education", "学校 A"),
        item("education", "学校 B"),
        item("experience", "公司 A"),
        item("experience", "公司 B"),
        item("experience", "公司 C"),
        { ...item("achievement", "荣誉奖励"), contentFamily: null },
        { ...item("achievement", "学生工作"), contentFamily: null },
      ];
    return Response.json({ content: [{ type: "text", text: JSON.stringify({ sourcePageCount: 1, items }) }] });
  }) as typeof fetch;

  const preparsedText = [
    "教育经历",
    "学校 A 2020.01 - 2022.01",
    "学校 B 2022.02 - 2024.02",
    "荣誉奖励：奖项 A",
    "科研成果",
    ...Array.from({ length: 7 }, (_, index) => `${index + 1}. 论文 ${index + 1}`),
    "工作实习",
    "公司 A 2024.01 - 2024.03",
    "公司 B 2024.04 - 2024.06",
    "公司 C 2024.07 - 至今",
    "课外活动",
    "学生工作 2021.01 - 2022.01",
  ].join("\n");

  try {
    const profile = await extractProfileFromAttachmentWithAgent(
      { mediaType: "application/pdf", data: "cGRm" },
      { label: "high-density-resume.pdf", format: "pdf", pageCount: 1 },
      preparsedText,
    );
    assert.deepEqual(shards.sort(), ["career", "identity", "research"]);
    assert.equal(profile.items.length, 15);
    assert.equal(profile.items.filter((entry) => entry.contentFamily === "publication").length, 7);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.MAAS_API_KEY;
    else process.env.MAAS_API_KEY = originalKey;
  }
});

test("profile Agent accepts OpenAI-compatible tool call arguments", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as {
      tools: Array<{ input_schema: { properties: Record<string, unknown> } }>;
    };
    const result = resultForProperties(body.tools[0]?.input_schema.properties || {});
    return Response.json({
      choices: [{
        finish_reason: "tool_calls",
        message: {
          tool_calls: [{
            type: "function",
            function: { name: "submit_profile_result", arguments: JSON.stringify(result) },
          }],
        },
      }],
    });
  }) as typeof fetch;

  try {
    const profile = await extractProfileFromAttachmentWithAgent(
      { mediaType: "application/pdf", data: "cGRm" },
      { label: "resume.pdf", format: "pdf", pageCount: 1 },
      "",
      {
        providerConfig: {
          maasApiKey: "browser-tool-key",
          maasBaseUrl: "https://api.zhizengzeng.com/v1",
          maasModel: "claude-sonnet-5",
          maasMode: "tool",
        },
      },
    );
    assert.equal(profile.name, "韩晨");
    assert.equal(profile.items.length, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("profile Agent uses forced tool output for the primary compatible provider", async () => {
  const originalFetch = globalThis.fetch;
  const originalPrimaryKey = process.env.WEBSITE_AGENT_API_KEY;
  const originalPrimaryBase = process.env.WEBSITE_AGENT_BASE_URL;
  const originalPrimaryModel = process.env.WEBSITE_AGENT_MODEL;
  process.env.WEBSITE_AGENT_API_KEY = "primary-test-key";
  process.env.WEBSITE_AGENT_BASE_URL = "https://provider.example/v1";
  process.env.WEBSITE_AGENT_MODEL = "claude-sonnet-5";
  let calls = 0;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    assert.equal(String(input), "https://provider.example/v1/messages");
    const body = JSON.parse(String(init?.body)) as {
      tools?: Array<{ input_schema: { properties: Record<string, unknown> } }>;
      tool_choice?: { name?: string };
    };
    calls += 1;
    assert.equal(body.tool_choice?.name, "submit_profile_result");
    const result = resultForProperties(body.tools?.[0]?.input_schema.properties || {});
    return Response.json({
      content: [{ type: "tool_use", name: "submit_profile_result", input: result }],
    });
  }) as typeof fetch;

  try {
    const profile = await extractProfileFromAttachmentWithAgent(
      { mediaType: "application/pdf", data: "cGRm" },
      { label: "resume.pdf", format: "pdf", pageCount: 1 },
      "",
      { providerScope: "website" },
    );
    assert.equal(calls, 2);
    assert.equal(profile.items.length, 2);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalPrimaryKey === undefined) delete process.env.WEBSITE_AGENT_API_KEY;
    else process.env.WEBSITE_AGENT_API_KEY = originalPrimaryKey;
    if (originalPrimaryBase === undefined) delete process.env.WEBSITE_AGENT_BASE_URL;
    else process.env.WEBSITE_AGENT_BASE_URL = originalPrimaryBase;
    if (originalPrimaryModel === undefined) delete process.env.WEBSITE_AGENT_MODEL;
    else process.env.WEBSITE_AGENT_MODEL = originalPrimaryModel;
  }
});

test("profile Agent uses a browser session provider without mixing server credentials", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.MAAS_API_KEY;
  process.env.MAAS_API_KEY = "server-key-that-must-not-be-used";
  let calls = 0;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    assert.equal(String(input), "https://browser-provider.example/v1/messages");
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("authorization"), "Bearer browser-session-key");
    const body = JSON.parse(String(init?.body)) as {
      model: string;
      output_config: { format: { schema: { properties: Record<string, unknown> } } };
    };
    assert.equal(body.model, "browser-session-model");
    calls += 1;
    const result = resultForProperties(body.output_config.format.schema.properties);
    return Response.json({ content: [{ type: "text", text: JSON.stringify(result) }] });
  }) as typeof fetch;

  try {
    const profile = await extractProfileFromAttachmentWithAgent(
      { mediaType: "application/pdf", data: "cGRm" },
      { label: "resume.pdf", format: "pdf", pageCount: 1 },
      "",
      {
        providerConfig: {
          maasApiKey: "browser-session-key",
          maasBaseUrl: "https://browser-provider.example/v1",
          maasModel: "browser-session-model",
        },
      },
    );
    assert.equal(calls, 2);
    assert.equal(profile.name, "韩晨");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.MAAS_API_KEY;
    else process.env.MAAS_API_KEY = originalKey;
  }
});

test("profile Agent supports the tool-compatible provider as the primary dropdown choice", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    assert.equal(String(input), "https://api.zhizengzeng.com/v1/messages");
    const body = JSON.parse(String(init?.body)) as {
      model: string;
      tools?: Array<{ input_schema: { properties: Record<string, unknown> } }>;
      tool_choice?: { name: string };
      output_config?: unknown;
    };
    assert.equal(body.model, "claude-sonnet-5");
    assert.equal(body.tool_choice?.name, "submit_profile_result");
    assert.equal(body.output_config, undefined);
    calls += 1;
    const result = resultForProperties(body.tools?.[0]?.input_schema.properties || {});
    return Response.json({ content: [{ type: "tool_use", name: "submit_profile_result", input: result }] });
  }) as typeof fetch;

  try {
    const profile = await extractProfileFromAttachmentWithAgent(
      { mediaType: "application/pdf", data: "cGRm" },
      { label: "resume.pdf", format: "pdf", pageCount: 1 },
      "",
      {
        providerConfig: {
          maasApiKey: "browser-tool-key",
          maasBaseUrl: "https://api.zhizengzeng.com/v1",
          maasModel: "claude-sonnet-5",
          maasMode: "tool",
        },
      },
    );
    assert.equal(calls, 2);
    assert.equal(profile.name, "韩晨");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("personal website callback starts before dense resume inventory shards complete", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.MAAS_API_KEY;
  process.env.MAAS_API_KEY = "test-key";
  let releaseItems: (() => void) | undefined;
  const itemsGate = new Promise<void>((resolve) => { releaseItems = resolve; });
  let websiteFromIdentity = "";
  let notifyWebsite: (() => void) | undefined;
  const websiteSeen = new Promise<void>((resolve) => { notifyWebsite = resolve; });

  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as {
      system: string;
      output_config: { format: { schema: { properties: Record<string, unknown> } } };
    };
    const isIdentity = Boolean(body.output_config.format.schema.properties.identity);
    if (isIdentity) {
      return Response.json({ content: [{ type: "text", text: JSON.stringify(identityResult) }] });
    }
    await itemsGate;
    const research = Array.from({ length: 7 }, (_, index) => ({
      ...itemsResult.items[0],
      title: `论文 ${index + 1}`,
    }));
    const career = Array.from({ length: 7 }, (_, index) => ({
      ...itemsResult.items[0],
      kind: index < 2 ? "education" : index < 5 ? "experience" : "achievement",
      contentFamily: null,
      title: `经历 ${index + 1}`,
    }));
    const result = body.system?.includes("research, publication, and project inventory") ? research : career;
    return Response.json({ content: [{ type: "text", text: JSON.stringify({ sourcePageCount: 1, items: result }) }] });
  }) as typeof fetch;

  try {
    const extraction = extractProfileFromAttachmentWithAgent(
      { mediaType: "application/pdf", data: "cGRm" },
      { label: "resume.pdf", format: "pdf", pageCount: 1 },
      [
        "教育经历",
        "学校 A 2020.01 - 2022.01",
        "学校 B 2022.02 - 2024.02",
        "科研成果",
        ...Array.from({ length: 7 }, (_, index) => `${index + 1}. 论文 ${index + 1}`),
        "工作实习",
        "公司 A 2024.01 - 2024.03",
        "公司 B 2024.04 - 2024.06",
        "公司 C 2024.07 - 至今",
        "课外活动",
        "学生工作 2021.01 - 2022.01",
      ].join("\n"),
      {
        onPersonalWebsite: (website) => {
          websiteFromIdentity = website;
          notifyWebsite?.();
        },
      },
    );
    await websiteSeen;
    assert.equal(websiteFromIdentity, "https://portfolio.example.com/");
    releaseItems?.();
    const profile = await extraction;
    assert.equal(profile.items.length, 15);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.MAAS_API_KEY;
    else process.env.MAAS_API_KEY = originalKey;
  }
});
