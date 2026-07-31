import assert from "node:assert/strict";
import test from "node:test";
import { applyProjectEdits, projectEditFromItem, updateProjectEdit } from "../lib/project-edits.ts";
import type { ParsedProfile, ProfileItem } from "../lib/types.ts";

const project: ProfileItem = {
  id: "project-1",
  kind: "project",
  title: "Parsed title",
  summary: "Parsed summary",
  bullets: [],
  tags: ["agent"],
  imageUrl: "https://example.com/parsed.png",
  sourceUrl: "https://example.com/evidence",
  evidence: [{ sourceId: "cv", locator: "page:1", excerpt: "Parsed project" }],
};

const profile: ParsedProfile = {
  id: "profile-1",
  name: "Demo",
  headline: "Builder",
  summary: "Profile summary",
  contacts: [],
  media: [],
  identityEvidence: {},
  contactEvidence: {},
  skills: [],
  skillEvidence: {},
  items: [project, { ...project, id: "experience-1", kind: "experience", title: "Untouched" }],
  source: { id: "cv", type: "text", label: "CV", lineCount: 1 },
};

test("project edits override presentation fields without deleting source evidence", () => {
  const edits = updateProjectEdit({}, project.id, {
    title: "  Edited title  ",
    summary: "Edited summary",
    imageUrl: "data:image/png;base64,edited",
    projectUrl: "https://example.com/source-code",
  });
  const edited = applyProjectEdits(profile, edits);
  const editedProject = edited.items[0];

  assert.equal(editedProject?.title, "Edited title");
  assert.equal(editedProject?.summary, "Edited summary");
  assert.equal(editedProject?.imageUrl, "data:image/png;base64,edited");
  assert.equal(editedProject?.projectUrl, "https://example.com/source-code");
  assert.equal(editedProject?.sourceUrl, project.sourceUrl);
  assert.deepEqual(editedProject?.evidence, project.evidence);
  assert.equal(edited.items[1]?.title, "Untouched");
});

test("project edit drafts prefer a project URL while retaining source fallback", () => {
  assert.equal(projectEditFromItem(project).projectUrl, project.sourceUrl);
  assert.equal(projectEditFromItem({ ...project, projectUrl: "https://example.com/repo" }).projectUrl, "https://example.com/repo");
});
