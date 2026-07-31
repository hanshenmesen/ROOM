import assert from "node:assert/strict";
import test from "node:test";
import { compileProfile } from "../lib/agents/pipeline.ts";
import { hanchenDemoProfile } from "../lib/data/hanchen-demo-profile.ts";

test("the default Han Chen demo is a complete precompiled world", () => {
  const result = compileProfile(hanchenDemoProfile);
  assert.equal(hanchenDemoProfile.name, "韩晨");
  assert.equal(hanchenDemoProfile.personalWebsite, "https://hanshenmesen.github.io/");
  assert.equal(hanchenDemoProfile.items.length, 17);
  assert.equal(hanchenDemoProfile.skills.length, 15);
  assert.equal(hanchenDemoProfile.media.length, 4);
  assert.equal(hanchenDemoProfile.source.label.includes("hanshenmesen.github.io"), true);
  assert.equal(result.report.passed, true);
  assert.equal(result.report.score, 100);
  assert.equal(result.world.exhibits.length, 32);
});

test("Beyond Detection has one project island and one works-index reference", () => {
  const result = compileProfile(hanchenDemoProfile);
  const matchingProjects = result.world.exhibits.filter((exhibit) =>
    exhibit.eyebrow === "PROJECT" && /beyond detection/i.test(exhibit.title),
  );

  assert.equal(matchingProjects.length, 1);
  const matchingIndexSurfaces = result.world.displaySurfaces.filter((surface) =>
    surface.semanticRole === "works"
      && surface.sourceItemIds.includes(matchingProjects[0]?.sourceItemId || ""),
  );
  assert.equal(matchingIndexSurfaces.length, 1);
});
