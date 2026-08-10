import assert from "node:assert/strict";
import test from "node:test";
import { compileProfile } from "../lib/agents/pipeline.ts";
import { displayStandTitle, normalizeDisplayProfile, sanitizeDisplayText } from "../lib/display-copy.ts";
import type { ParsedProfile, SourceEvidence } from "../lib/types.ts";

function evidence(locator: string, excerpt: string): SourceEvidence {
  return { sourceId: "source-1", locator, excerpt };
}

function noisyProfile(): ParsedProfile {
  const contactEvidence = evidence("line:8", "Email: ada@example.com source: page");
  const skillEvidence = evidence("lines:9-10", "Three.js evidence");
  return {
    id: "profile-noisy",
    name: "Ada Lovelace line:1",
    headline: "Creative technologist (lines:2-3)",
    location: "London - source: resume",
    summary: "Builds spatial interfaces. evidence",
    personalWebsite: "https://ada.example.com line:4",
    contacts: ["Email: ada@example.com source: portfolio line:8"],
    media: [],
    identityEvidence: {
      name: [evidence("line:1", "Ada Lovelace line:1")],
      headline: [evidence("lines:2-3", "Creative technologist")],
      summary: [evidence("line:5", "Builds spatial interfaces")],
    },
    contactEvidence: {
      "Email: ada@example.com source: portfolio line:8": [contactEvidence],
    },
    foods: ["Sushi line:10 evidence"],
    foodEvidence: {
      "Sushi line:10 evidence": [evidence("line:10", "Sushi")],
    },
    hobbies: ["Street photography line:11 evidence"],
    hobbyEvidence: {
      "Street photography line:11 evidence": [evidence("line:11", "Street photography")],
    },
    skills: ["Three.js - lines:9-10 evidence"],
    skillEvidence: {
      "Three.js - lines:9-10 evidence": [skillEvidence],
    },
    items: [
      {
        id: "item-1",
        kind: "project",
        title: "Room System line:12",
        subtitle: "Interactive world locator: section-3",
        summary: "A concise project summary. source: portfolio",
        bullets: ["Built a browser showroom. lines:13-14"],
        tags: ["WebGL line:15"],
        timeRange: "2025 line:16",
        role: "Lead engineer evidence",
        techStack: ["Three.js line:17"],
        evidence: [evidence("lines:12-17", "Room System source annotation")],
      },
    ],
    source: {
      id: "source-1",
      type: "text",
      label: "Portfolio text line:99",
      lineCount: 99,
      locatorUnit: "line",
    },
  };
}

test("sanitizeDisplayText removes trailing source and locator noise only from display copy", () => {
  assert.equal(sanitizeDisplayText("Room System line:12"), "Room System");
  assert.equal(sanitizeDisplayText("Three.js - lines:9-10 evidence"), "Three.js");
  assert.equal(sanitizeDisplayText("Email: ada@example.com source: portfolio line:8"), "Email: ada@example.com");
  assert.equal(sanitizeDisplayText("A source-aware retrieval system"), "A source-aware retrieval system");
});

test("display stand titles omit aggregate counts without altering numbered names", () => {
  assert.equal(displayStandTitle("教育背景 · 2"), "教育背景");
  assert.equal(displayStandTitle("技能工具 • 12"), "技能工具");
  assert.equal(displayStandTitle("Project 2"), "Project 2");
  assert.equal(displayStandTitle("Museum 2025"), "Museum 2025");
});

test("normalizeDisplayProfile cleans presentation fields and remaps evidence map keys", () => {
  const profile = noisyProfile();
  const normalized = normalizeDisplayProfile(profile);

  assert.equal(normalized.name, "Ada Lovelace");
  assert.equal(normalized.headline, "Creative technologist");
  assert.equal(normalized.location, "London");
  assert.equal(normalized.summary, "Builds spatial interfaces.");
  assert.deepEqual(normalized.contacts, ["Email: ada@example.com"]);
  assert.deepEqual(normalized.foods, ["Sushi"]);
  assert.deepEqual(normalized.hobbies, ["Street photography"]);
  assert.deepEqual(normalized.skills, ["Three.js"]);
  assert.equal(normalized.items[0]?.title, "Room System");
  assert.equal(normalized.items[0]?.subtitle, "Interactive world");
  assert.deepEqual(normalized.items[0]?.bullets, ["Built a browser showroom."]);
  assert.deepEqual(normalized.items[0]?.tags, ["WebGL"]);
  assert.deepEqual(normalized.items[0]?.techStack, ["Three.js"]);

  assert.equal(normalized.contactEvidence["Email: ada@example.com"]?.[0]?.locator, "line:8");
  assert.equal(normalized.foodEvidence?.Sushi?.[0]?.locator, "line:10");
  assert.equal(normalized.hobbyEvidence?.["Street photography"]?.[0]?.locator, "line:11");
  assert.equal(normalized.skillEvidence["Three.js"]?.[0]?.locator, "lines:9-10");
  assert.equal(normalized.identityEvidence.name?.[0]?.locator, "line:1");
  assert.equal(normalized.identityEvidence.name?.[0]?.excerpt, "Ada Lovelace line:1");
  assert.equal(normalized.items[0]?.evidence[0]?.locator, "lines:12-17");
});

test("compileProfile uses display-ready copy for world text while preserving evidence structures", () => {
  const result = compileProfile(noisyProfile());
  const exhibit = result.world.exhibits.find((item) => item.sourceItemId === "item-1");
  const skillExhibit = result.world.exhibits.find((item) => item.sourceItemId === "skill:Three.js");

  assert.equal(result.profile.name, "Ada Lovelace");
  assert.equal(result.world.profile.name, "Ada Lovelace");
  assert.equal(exhibit?.title, "Room System");
  assert.equal(exhibit?.body, "A concise project summary.");
  assert.deepEqual(exhibit?.tags, ["WebGL"]);
  assert.equal(skillExhibit?.title, "Three.js");
  assert.equal(skillExhibit?.evidence[0]?.locator, "lines:9-10");
  assert.equal(exhibit?.evidence[0]?.locator, "lines:12-17");
  assert.equal(result.report.passed, true);
});
