import assert from "node:assert/strict";
import test from "node:test";
import { checkWorld } from "../lib/agents/checker.ts";
import { runPipeline } from "../lib/agents/pipeline.ts";
import { sampleResume } from "../lib/data/sample-resume.ts";
import { validateProfile, validateReport, validateWorld } from "../lib/validate.ts";

test("parser keeps line-level evidence for every content item", () => {
  const result = runPipeline(sampleResume);
  assert.equal(validateProfile(result.profile).length, 0);
  assert.ok(result.profile.items.every((item) => item.evidence[0]?.locator.startsWith("line")));
  assert.equal(result.profile.items.filter((item) => item.kind === "project").length, 4);
  assert.equal(result.profile.skills.length, 12);
});

test("orchestrator maps every source item exactly once into five connected rooms", () => {
  const result = runPipeline(sampleResume);
  const expected = result.profile.items.length + result.profile.skills.length;
  assert.equal(result.world.rooms.length, 5);
  assert.equal(result.world.exhibits.length, expected);
  assert.equal(new Set(result.world.exhibits.map((item) => item.sourceItemId)).size, expected);
  assert.equal(validateWorld(result.world).length, 0);
  assert.equal(result.report.checks.find((item) => item.name === "Room graph")?.passed, true);
});

test("default world passes the deterministic checker", () => {
  const result = runPipeline(sampleResume);
  assert.equal(result.report.passed, true);
  assert.equal(result.report.score, 100);
  assert.equal(validateReport(result.report).length, 0);
});

test("checker catches overlap, dead interaction, omissions, and mobile budget", () => {
  const result = runPipeline(sampleResume);
  const world = structuredClone(result.world);
  world.exhibits[2].position = [...world.exhibits[1].position];
  world.exhibits[1].interaction.clickable = false;
  world.exhibits.pop();
  world.metrics.estimatedDrawCalls = 120;
  const report = checkWorld(world);
  assert.equal(report.passed, false);
  assert.ok(report.issues.some((item) => item.category === "overlap"));
  assert.ok(report.issues.some((item) => item.category === "interaction"));
  assert.ok(report.issues.some((item) => item.category === "content"));
  assert.ok(report.issues.some((item) => item.category === "performance"));
});
