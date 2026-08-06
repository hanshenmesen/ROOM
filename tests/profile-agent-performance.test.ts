import assert from "node:assert/strict";
import test from "node:test";
import { extractProfileWithAgent } from "../lib/agents/profile-agent.ts";

// Same pinning as profile-agent.test.ts: these mocks exercise the MAAS
// json-schema request path, not the repository-wide DeepSeek default.
process.env.MAAS_BASE_URL = "https://maas.devops.rednote.life/hackson";

const identity = {
  sourcePageCount: null,
  personalWebsite: null,
  identity: {
    name: { value: "林遥", evidenceLines: [1], evidenceExcerpt: "林遥" },
    headline: { value: "交互设计师", evidenceLines: [2], evidenceExcerpt: "交互设计师" },
    location: null,
    summary: { value: "设计可进入的数字空间。", evidenceLines: [3], evidenceExcerpt: "设计可进入的数字空间" },
  },
  contacts: [],
  foods: [{ value: "寿司", evidenceLines: [4], evidenceExcerpt: "喜欢寿司" }],
  hobbies: [{ value: "摄影", evidenceLines: [5], evidenceExcerpt: "爱好摄影" }],
  skills: [{ value: "Three.js", evidenceLines: [6], evidenceExcerpt: "Three.js" }],
};

function item(kind: "project" | "experience" | "education" | "achievement", title: string) {
  return {
    kind,
    contentFamily: null,
    title,
    subtitle: null,
    detail: `${title} 的简要事实。`,
    bullets: [],
    tags: [],
    timeRange: null,
    role: null,
    techStack: [],
    projectUrl: null,
    fieldEvidence: {},
    sourceUrl: null,
    mediaIndex: null,
    evidenceLines: [1],
    evidenceExcerpt: title,
  };
}

test("normal profile shards start concurrently with low effort", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.MAAS_API_KEY;
  process.env.MAAS_API_KEY = "performance-test-key";
  let calls = 0;
  const efforts: string[] = [];

  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    calls += 1;
    const body = JSON.parse(String(init?.body)) as {
      output_config: { effort: string; format: { schema: { properties: Record<string, unknown> } } };
    };
    efforts.push(body.output_config.effort);
    const properties = body.output_config.format.schema.properties;
    await new Promise((resolve) => setTimeout(resolve, 140));
    const result = properties.identity
        ? identity
        : { sourcePageCount: null, items: [item("project", "ROOM")] };
    return Response.json({ content: [{ type: "text", text: JSON.stringify(result) }] });
  }) as typeof fetch;

  try {
    const startedAt = performance.now();
    const profile = await extractProfileWithAgent([
      "林遥",
      "交互设计师",
      "设计可进入的数字空间。",
      "喜欢寿司",
      "爱好摄影",
      "Three.js",
      "ROOM 项目",
    ].join("\n"));
    const elapsed = performance.now() - startedAt;

    assert.equal(calls, 2, `expected two parallel provider requests, received ${calls}`);
    assert.deepEqual(efforts, ["low", "low"]);
    assert.ok(elapsed < 220, `expected <220ms, received ${elapsed.toFixed(1)}ms`);
    assert.equal(profile.items.some((entry) => entry.title === "ROOM"), true);
    assert.deepEqual(profile.foods, ["寿司"]);
    assert.deepEqual(profile.hobbies, ["摄影"]);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.MAAS_API_KEY;
    else process.env.MAAS_API_KEY = originalKey;
  }
});

test("dense resumes retain parallel research and career completeness shards", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.MAAS_API_KEY;
  process.env.MAAS_API_KEY = "performance-test-key";
  const shards: string[] = [];

  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as {
      system: string;
      output_config: { format: { schema: { properties: Record<string, unknown> } } };
    };
    if (body.output_config.format.schema.properties.identity) {
      shards.push("identity");
      return Response.json({ content: [{ type: "text", text: JSON.stringify(identity) }] });
    }
    const research = body.system.includes("research, publication, and project inventory");
    shards.push(research ? "research" : "career");
    const items = research
      ? Array.from({ length: 7 }, (_, index) => item("project", `论文 ${index + 1}`))
      : [
        item("education", "学校 A"),
        item("education", "学校 B"),
        item("experience", "公司 A"),
        item("experience", "公司 B"),
        item("experience", "公司 C"),
        item("achievement", "荣誉奖励"),
        item("achievement", "学生工作"),
      ];
    return Response.json({ content: [{ type: "text", text: JSON.stringify({ sourcePageCount: null, items }) }] });
  }) as typeof fetch;

  const denseSource = [
    "林遥",
    "交互设计师",
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
  ].join("\n");

  try {
    const profile = await extractProfileWithAgent(denseSource);
    assert.deepEqual(shards.sort(), ["career", "identity", "research"]);
    assert.equal(profile.items.length, 15);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.MAAS_API_KEY;
    else process.env.MAAS_API_KEY = originalKey;
  }
});
