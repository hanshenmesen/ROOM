import assert from "node:assert/strict";
import test from "node:test";
import { normalizeProfileDraft } from "../lib/agents/profile/normalize.ts";

// Regression coverage for a production failure observed with Qwen 3.5 on the
// xhs-maas gateway: the model returned `fieldEvidence: {techStack: [], ...}`
// (empty arrays) alongside valid item-level evidenceLines. An empty array is
// truthy in JavaScript, so `fieldEvidence?.[field] || evidenceLines` never
// fell back and every optional structured field failed validation.

const SOURCE_TEXT = [
  "张三",
  "后端工程师，专注分布式系统",
  "2020.09-2024.06 某大学 计算机科学",
  "Signal Room：3D 个人世界项目",
  "Role: Lead developer",
  "Tech Stack: TypeScript, Three.js",
].join("\n");

function draftWith(fieldEvidence: Record<string, unknown>) {
  return {
    sourcePageCount: null,
    personalWebsite: null,
    identity: {
      name: { value: "张三", evidenceLines: [1], evidenceExcerpt: "张三" },
      headline: { value: "后端工程师", evidenceLines: [2], evidenceExcerpt: "后端工程师" },
      location: null,
      summary: { value: "专注分布式系统。", evidenceLines: [2], evidenceExcerpt: "专注分布式系统" },
    },
    contacts: [],
    foods: [],
    hobbies: [],
    skills: [{ value: "TypeScript", evidenceLines: [6], evidenceExcerpt: "TypeScript" }],
    items: [{
      kind: "project",
      contentFamily: null,
      title: "Signal Room",
      subtitle: null,
      summary: "3D 个人世界项目。",
      bullets: [],
      tags: [],
      timeRange: "2020.09-2024.06",
      role: "Lead developer",
      techStack: ["TypeScript", "Three.js"],
      projectUrl: null,
      fieldEvidence,
      sourceUrl: null,
      mediaIndex: null,
      evidenceLines: [4, 5, 6],
      evidenceExcerpt: "Signal Room",
    }],
  };
}

const SOURCE = { type: "text" as const, format: "text" as const, label: "resume.txt" };

test("empty fieldEvidence arrays fall back to item-level evidenceLines", () => {
  const profile = normalizeProfileDraft(
    draftWith({ timeRange: [], role: [], techStack: [] }),
    SOURCE_TEXT,
    SOURCE,
  );
  const item = profile.items[0];
  assert.equal(item?.timeRange, "2020.09-2024.06");
  assert.equal(item?.role, "Lead developer");
  assert.deepEqual(item?.techStack, ["TypeScript", "Three.js"]);
  // The field evidence is sourced from the item-level lines [4,5,6], which
  // collapse into one contiguous range.
  assert.equal(item?.fieldEvidence?.timeRange?.[0]?.locator, "lines:4-6");
  assert.equal(item?.fieldEvidence?.role?.[0]?.locator, "lines:4-6");
  assert.equal(item?.fieldEvidence?.techStack?.[0]?.locator, "lines:4-6");
  assert.ok(item?.fieldEvidence?.techStack?.[0]?.excerpt.includes("TypeScript"));
});

test("valid fieldEvidence lines still take precedence over item-level lines", () => {
  const profile = normalizeProfileDraft(
    draftWith({ timeRange: [3], role: [5], techStack: [6] }),
    SOURCE_TEXT,
    SOURCE,
  );
  const item = profile.items[0];
  assert.equal(item?.fieldEvidence?.timeRange?.[0]?.locator, "line:3");
  assert.equal(item?.fieldEvidence?.role?.[0]?.locator, "line:5");
  assert.equal(item?.fieldEvidence?.techStack?.[0]?.locator, "line:6");
});
