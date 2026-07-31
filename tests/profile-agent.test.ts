import assert from "node:assert/strict";
import test from "node:test";
import { extractProfileFromAttachmentWithAgent } from "../lib/agents/profile-agent.ts";
import { compileProfile } from "../lib/agents/pipeline.ts";
import { formatPdfEvidence } from "../lib/pdf-preparse.ts";
import { mergeProfiles } from "../lib/profile-merge.ts";
import { validatePublicUrl } from "../lib/public-web.ts";

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
  skills: [{ value: "Multi-Agent Systems", evidenceLines: [1], evidenceExcerpt: "Multi-Agent Systems" }],
};

const itemsResult = {
  sourcePageCount: 1,
  items: [
    {
      kind: "project",
      contentFamily: "publication",
      title: "Beyond Detection",
      detail: "提出基于证据的辩论框架。",
      sourceUrl: "https://example.com/paper",
      mediaIndex: null,
      timeRange: null,
      evidenceLines: [1],
      evidenceExcerpt: "Beyond Detection, AAAI 2026 Oral",
    },
  ],
};

test("profile Agent merges parallel PDF shards into an evidence-backed display profile", async () => {
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
    const result = schema.properties.identity ? identityResult : itemsResult;
    return Response.json({ content: [{ type: "text", text: JSON.stringify(result) }] });
  }) as typeof fetch;

  try {
    const profile = await extractProfileFromAttachmentWithAgent(
      { mediaType: "application/pdf", data: "cGRm" },
      { label: "resume.pdf", type: "text", format: "pdf" },
    );
    assert.equal(calls.length, 2);
    assert.ok(calls.every((call) => Array.isArray(call.messages[0]?.content)));
    assert.ok(calls.every((call) => {
      const content = call.messages[0]?.content as Array<{ type?: string }>;
      return content[0]?.type === "document";
    }));
    assert.equal(profile.name, "韩晨");
    assert.equal(profile.personalWebsite, "https://portfolio.example.com/");
    assert.equal(profile.source.locatorUnit, "page");
    assert.equal(profile.items.length, 2);
    assert.ok(profile.items.every((item) => item.evidence[0]?.locator === "page:1"));
    assert.equal(profile.items[1]?.contentFamily, "publication");
    const compiled = compileProfile(profile);
    assert.equal(compiled.report.passed, true);
    assert.equal(compiled.world.profile.id, profile.id);

    const websiteProfile = structuredClone(profile);
    websiteProfile.source = { ...websiteProfile.source, id: "website-source", type: "url", format: "text", locatorUnit: "line" };
    websiteProfile.summary = `${profile.summary} 网站补充了更完整的研究介绍。`;
    websiteProfile.identityEvidence.summary = [{ sourceId: "website-source", locator: "line:2", excerpt: "更完整的研究介绍" }];
    websiteProfile.skills.push("RAG");
    websiteProfile.skillEvidence.RAG = [{ sourceId: "website-source", locator: "line:3", excerpt: "RAG" }];
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
    assert.equal(merged.summary, websiteProfile.summary);
    assert.equal(merged.items.find((item) => item.title === "Beyond Detection")?.evidence.length, 2);
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
    const result = body.output_config.format.schema.properties.identity ? identityResult : itemsResult;
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
    const result = body.tools?.[0]?.input_schema.properties.identity ? identityResult : itemsResult;
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
    const result = body.output_config.format.schema.properties.identity ? identityResult : itemsResult;
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
    const result = body.tools?.[0]?.input_schema.properties.identity ? identityResult : itemsResult;
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

test("personal website callback starts before the resume items shard completes", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.MAAS_API_KEY;
  process.env.MAAS_API_KEY = "test-key";
  let releaseItems: (() => void) | undefined;
  let websiteFromIdentity = "";
  let notifyWebsite: (() => void) | undefined;
  const websiteSeen = new Promise<void>((resolve) => { notifyWebsite = resolve; });

  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as {
      output_config: { format: { schema: { properties: Record<string, unknown> } } };
    };
    const isIdentity = Boolean(body.output_config.format.schema.properties.identity);
    if (isIdentity) {
      return Response.json({ content: [{ type: "text", text: JSON.stringify(identityResult) }] });
    }
    await new Promise<void>((resolve) => { releaseItems = resolve; });
    return Response.json({ content: [{ type: "text", text: JSON.stringify(itemsResult) }] });
  }) as typeof fetch;

  try {
    const extraction = extractProfileFromAttachmentWithAgent(
      { mediaType: "application/pdf", data: "cGRm" },
      { label: "resume.pdf", format: "pdf", pageCount: 1 },
      "",
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
    assert.equal(profile.items.length, 2);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.MAAS_API_KEY;
    else process.env.MAAS_API_KEY = originalKey;
  }
});
