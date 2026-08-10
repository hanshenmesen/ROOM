import assert from "node:assert/strict";
import test from "node:test";
import { compileProfile } from "../lib/agents/pipeline.ts";
import { fictionalDemoProfile } from "../lib/data/fictional-demo-profile.ts";

test("the default fictional demo is a complete precompiled world", () => {
  const result = compileProfile(fictionalDemoProfile);
  assert.equal(fictionalDemoProfile.name, "林澈");
  assert.equal(fictionalDemoProfile.personalWebsite, "https://linche.example");
  assert.equal(fictionalDemoProfile.items.length, 13);
  assert.equal(fictionalDemoProfile.skills.length, 12);
  assert.equal(fictionalDemoProfile.media.length, 1);
  assert.equal(fictionalDemoProfile.source.label.includes("虚构人物 Demo"), true);
  assert.equal(fictionalDemoProfile.media[0]?.url, "./assets/demo/lin-che-portrait.png");
  assert.equal(result.report.passed, true);
  assert.equal(result.report.score, 100);
  assert.equal(result.world.exhibits.length > 0, true);
});

test("Echo Atlas has one project island and one works-index reference", () => {
  const result = compileProfile(fictionalDemoProfile);
  const matchingProjects = result.world.exhibits.filter((exhibit) =>
    exhibit.eyebrow === "PROJECT" && /echo atlas/i.test(exhibit.title),
  );

  assert.equal(matchingProjects.length, 1);
  const matchingIndexSurfaces = result.world.displaySurfaces.filter((surface) =>
    surface.semanticRole === "works"
      && surface.sourceItemIds.includes(matchingProjects[0]?.sourceItemId || ""),
  );
  assert.equal(matchingIndexSurfaces.length, 1);
});
