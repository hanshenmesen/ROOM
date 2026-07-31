import assert from "node:assert/strict";
import test from "node:test";
import { createHeatLedger, heatItems, incrementHeatLedger, parseHeatLedger, publicHeatTargets } from "../lib/exhibit-heat.ts";
import { compileProfile } from "../lib/agents/pipeline.ts";
import { fictionalDemoProfile } from "../lib/data/fictional-demo-profile.ts";

test("heat targets contain only physical lobby stands and visible project pedestals", () => {
  const world = compileProfile(fictionalDemoProfile).world;
  const targets = publicHeatTargets(world);
  assert.ok(targets.length > 0);
  assert.equal(targets.some((target) => target.id.includes("diary") || target.id.includes("private-frame")), false);
  assert.equal(targets.every((target) => target.id && target.label), true);
  assert.equal(targets.every((target) => target.kind === "information-stand" || target.eyebrow === "PROJECT"), true);
  assert.equal(targets.every((target) => target.kind !== "project-pedestal" || target.projectPage !== undefined), true);
  assert.deepEqual(
    targets.filter((target) => target.kind === "project-pedestal").map((target) => target.id),
    world.exhibits
      .filter((exhibit) => exhibit.roomId === "room-lobby" && exhibit.interaction.clickable && exhibit.eyebrow === "PROJECT" && exhibit.kind === "pedestal")
      .map((exhibit) => exhibit.id),
  );
});

test("heat uses stable seeded values and increments only the focused target", () => {
  const targets = [
    { id: "a", label: "A", eyebrow: "PROFILE", kind: "information-stand" as const },
    { id: "b", label: "B", eyebrow: "PROJECT", kind: "project-pedestal" as const, projectPage: 1 },
  ];
  const initial = createHeatLedger("profile-1", targets);
  const repeated = createHeatLedger("profile-1", targets);
  assert.deepEqual(initial, repeated);
  const next = incrementHeatLedger(initial, "b", "2026-07-31T00:00:00.000Z");
  assert.equal(next.entries.a.localViews, 0);
  assert.equal(next.entries.b.localViews, 1);
  assert.equal(heatItems(targets, next).find((item) => item.id === "b")?.total, next.entries.b.seed + 1);
});

test("stored heat is profile-scoped and malformed storage is ignored", () => {
  const targets = [{ id: "a", label: "A", eyebrow: "PROFILE", kind: "information-stand" as const }];
  const stored = incrementHeatLedger(createHeatLedger("profile-1", targets), "a");
  assert.deepEqual(parseHeatLedger(stored), stored);
  assert.equal(parseHeatLedger({ version: 2, profileId: "profile-1", entries: {} }), null);
  assert.equal(createHeatLedger("profile-2", targets, stored).entries.a.localViews, 0);
});
