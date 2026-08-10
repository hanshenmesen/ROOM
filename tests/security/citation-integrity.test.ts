import assert from "node:assert/strict";
import test from "node:test";
import { answerPetQaQuestion, validatePetQaCitations } from "../../lib/agents/pet-qa.ts";
import type { ParsedProfile } from "../../lib/types.ts";

const profile = {
  id: "p1", name: "Lin", headline: "Agent Engineer", summary: "Builds agents.",
  contacts: [], skills: [], media: [], identityEvidence: {}, contactEvidence: {}, skillEvidence: {},
  items: [{
    id: "room", kind: "project", title: "ROOM", summary: "A portfolio Agent.", bullets: [], tags: [],
    evidence: [{ sourceId: "resume", locator: "line:8", excerpt: "ROOM — evidence-backed portfolio Agent" }],
  }],
  source: { id: "resume", type: "text", label: "resume.md", lineCount: 10 },
} satisfies ParsedProfile;

test("Companion keeps only citations whose id, title, and excerpt match Profile evidence", () => {
  const valid = { itemId: "room", title: "ROOM", excerpt: "evidence-backed portfolio Agent" };
  const result = validatePetQaCitations(profile, [
    valid,
    { itemId: "invented", title: "Secret Project", excerpt: "not real" },
    { itemId: "room", title: "Wrong title", excerpt: valid.excerpt },
    { itemId: "room", title: "ROOM", excerpt: "hallucinated evidence" },
  ]);
  assert.deepEqual(result, [valid]);
});

test("post-model citation validation removes a nonexistent item from the final answer", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => Response.json({
    content: [{
      type: "text",
      text: JSON.stringify({
        answer: "还有一个秘密项目。",
        citations: [{ itemId: "invented", title: "Secret Project", excerpt: "not real" }],
      }),
    }],
  })) as typeof fetch;
  try {
    const answer = await answerPetQaQuestion(profile, "还有哪些项目？", [], {
      petQaApiKey: "test-key",
      petQaBaseUrl: "https://pet.example.test",
    });
    assert.deepEqual(answer.citations, []);
    assert.match(answer.answer, /无法通过公开 Profile 验证/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
