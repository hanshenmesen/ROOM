import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createHeatLedger, heatItems, incrementHeatLedger, parseHeatLedger, publicHeatTargets } from "../lib/exhibit-heat.ts";
import { compileProfile } from "../lib/agents/pipeline.ts";
import { fictionalDemoProfile } from "../lib/data/fictional-demo-profile.ts";

const heatPanelSource = await readFile(new URL("../components/ExhibitHeatPanel.tsx", import.meta.url), "utf8");
const roomStudioSource = await readFile(new URL("../components/RoomStudio.tsx", import.meta.url), "utf8");

test("heat targets contain only physical lobby stands and visible project pedestals", () => {
  const world = compileProfile(fictionalDemoProfile).world;
  const targets = publicHeatTargets(world);
  assert.ok(targets.length > 0);
  assert.equal(targets.some((target) => target.id.includes("diary") || target.id.includes("private-frame")), false);
  assert.equal(targets.every((target) => target.id && target.label), true);
  assert.equal(targets.filter((target) => target.eyebrow === "PROJECT").length, 3);
  assert.equal(
    targets.some((target) => target.id === "exhibit-19"),
    false,
    "raw skill rows without an independent 3D mesh must not drive the camera",
  );
  assert.ok(targets.some((target) => target.id === "showroom-skills"));
  assert.equal(targets.length, world.displaySurfaces.filter((surface) => surface.roomId === "room-lobby").length + 3);
  assert.equal(targets.every((target) => target.kind === "information-stand" || target.eyebrow === "PROJECT"), true);
  assert.equal(targets.every((target) => target.kind !== "project-pedestal" || target.projectPage !== undefined), true);
  assert.deepEqual(
    targets.filter((target) => target.kind === "project-pedestal").map((target) => target.id),
    world.exhibits
      .filter((exhibit) => exhibit.roomId === "room-lobby" && exhibit.interaction.clickable && exhibit.eyebrow === "PROJECT" && exhibit.kind === "pedestal")
      .slice(0, 3)
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

test("heat-panel controls do not bubble into the 3D canvas miss handler", () => {
  assert.match(heatPanelSource, /onClick=\{\(\) => onSelect\(item\)\}/);
  assert.match(roomStudioSource, /setHeatPanelOpen\(false\);\s*window\.requestAnimationFrame\(\(\) => routeToWorldObject\(item\.id\)\)/);
});
