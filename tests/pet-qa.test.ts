import assert from "node:assert/strict";
import test from "node:test";
import {
  answerPetQaQuestion,
  MAX_PET_QA_HISTORY_MESSAGES,
  PetQaError,
} from "../lib/agents/pet-qa.ts";
import type { ParsedProfile } from "../lib/types.ts";

const profile: ParsedProfile = {
  id: "profile-1",
  name: "韩晨",
  headline: "LLM-Agent 实习生",
  summary: "研究多智能体与可信信息系统。",
  contacts: ["han@example.com"],
  skills: ["Multi-Agent Systems", "RAG"],
  media: [],
  identityEvidence: {
    name: [{ sourceId: "resume", locator: "line:1", excerpt: "韩晨" }],
    headline: [{ sourceId: "resume", locator: "line:2", excerpt: "LLM-Agent 实习生" }],
    summary: [{ sourceId: "resume", locator: "line:3", excerpt: "多智能体与可信信息系统" }],
  },
  contactEvidence: {},
  skillEvidence: {},
  items: [{
    id: "project-beyond-detection",
    kind: "project",
    title: "Beyond Detection",
    summary: "提出基于证据的辩论框架。",
    bullets: ["AAAI 2026 Oral"],
    tags: ["AI Safety"],
    evidence: [{ sourceId: "resume", locator: "line:8", excerpt: "Beyond Detection, AAAI 2026 Oral" }],
  }],
  source: {
    id: "resume",
    type: "text",
    label: "resume.md",
    lineCount: 12,
  },
};

test("pet QA answers from ParsedProfile with citations and no pet-name inference", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.PET_QA_API_KEY;
  const originalBase = process.env.PET_QA_BASE_URL;
  const originalModel = process.env.PET_QA_MODEL;
  process.env.PET_QA_API_KEY = "pet-secret";
  process.env.PET_QA_BASE_URL = "https://pet.example.test/hackson";
  process.env.PET_QA_MODEL = "pet-model";
  let requestBody: {
    model: string;
    system: string;
    messages: Array<{ content: string }>;
    output_config?: unknown;
  } | undefined;
  globalThis.fetch = (async (input, init) => {
    assert.equal(String(input), "https://pet.example.test/hackson/v1/messages");
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer pet-secret");
    requestBody = JSON.parse(String(init?.body));
    return Response.json({
      content: [{
        type: "text",
        text: JSON.stringify({
          answer: "主人做过 Beyond Detection，资料里写到它提出基于证据的辩论框架。",
          citations: [{
            itemId: "project-beyond-detection",
            title: "Beyond Detection",
            excerpt: "Beyond Detection, AAAI 2026 Oral",
          }],
        }),
      }],
    });
  }) as typeof fetch;

  try {
    const answer = await answerPetQaQuestion(profile, "主人做过什么项目？", Array.from({ length: 12 }, (_, index) => ({
      role: index % 2 ? "assistant" : "user",
      content: `history ${index}`,
    })));

    assert.equal(answer.citations[0]?.itemId, "project-beyond-detection");
    assert.match(answer.answer, /Beyond Detection/);
    assert.equal(requestBody?.model, "pet-model");
    assert.ok(requestBody?.output_config);
    assert.match(requestBody?.system || "", /Do not infer or adopt a pet name/);
    assert.match(requestBody?.messages[0]?.content || "", /ParsedProfile JSON/);
    const historyMatch = requestBody?.messages[0]?.content.match(/Recent chat history JSON:\n([\s\S]+)\n\nUser question:/);
    assert.ok(historyMatch);
    const history = JSON.parse(historyMatch[1] || "[]") as unknown[];
    assert.equal(history.length, MAX_PET_QA_HISTORY_MESSAGES);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.PET_QA_API_KEY;
    else process.env.PET_QA_API_KEY = originalKey;
    if (originalBase === undefined) delete process.env.PET_QA_BASE_URL;
    else process.env.PET_QA_BASE_URL = originalBase;
    if (originalModel === undefined) delete process.env.PET_QA_MODEL;
    else process.env.PET_QA_MODEL = originalModel;
  }
});

test("pet QA falls back to MAAS key and returns a recoverable configuration error when missing", async () => {
  const originalFetch = globalThis.fetch;
  const originalPetKey = process.env.PET_QA_API_KEY;
  const originalMaasKey = process.env.MAAS_API_KEY;
  const calls: string[] = [];
  delete process.env.PET_QA_API_KEY;
  process.env.MAAS_API_KEY = "shared-maas-key";
  globalThis.fetch = (async (input) => {
    calls.push(String(input));
    return Response.json({
      content: [{
        type: "text",
        text: JSON.stringify({ answer: "资料里没有提到。", citations: [] }),
      }],
    });
  }) as typeof fetch;

  try {
    const answer = await answerPetQaQuestion(profile, "主人养宠物了吗？");
    assert.equal(answer.answer, "资料里没有提到。");
    assert.equal(calls.length, 1);

    delete process.env.MAAS_API_KEY;
    await assert.rejects(
      () => answerPetQaQuestion(profile, "还有资料吗？"),
      (error) => error instanceof PetQaError && error.status === 503,
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (originalPetKey === undefined) delete process.env.PET_QA_API_KEY;
    else process.env.PET_QA_API_KEY = originalPetKey;
    if (originalMaasKey === undefined) delete process.env.MAAS_API_KEY;
    else process.env.MAAS_API_KEY = originalMaasKey;
  }
});
