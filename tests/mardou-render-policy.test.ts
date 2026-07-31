import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sceneSource = await readFile(
  new URL("../components/MardouMuseumScene.tsx", import.meta.url),
  "utf8",
);

test("museum shell avoids blanket shadow casting and double-sided materials", () => {
  assert.doesNotMatch(sceneSource, /object\.castShadow\s*=\s*true/);
  assert.doesNotMatch(sceneSource, /material\.side\s*=\s*THREE\.DoubleSide/);
  assert.match(sceneSource, /object\.castShadow\s*=\s*false/);
  assert.match(sceneSource, /MARDOU_SHADOW_RECEIVER_NAMES\.has\(object\.name\)/);
  assert.match(sceneSource, /MARDOU_DOUBLE_SIDED_MESH_NAMES\.has\(object\.name\)/);
});

test("unused baked pictures and Bix parts are removed from the runtime clone", () => {
  assert.match(sceneSource, /hiddenMeshes\.push\(object\)/);
  assert.match(sceneSource, /object\.removeFromParent\(\)/);
});

test("the pillar blocking the food focus route is locally removed from Walls", () => {
  assert.match(sceneSource, /const FOOD_FOCUS_PILLAR_CUT = \{/);
  assert.match(sceneSource, /minX: -28\.55/);
  assert.match(sceneSource, /maxZ: -26\.68/);
  assert.match(sceneSource, /const belongsToFoodFocusPillar = triangleCenterX/);
  assert.match(sceneSource, /!intersectsDoorway && !belongsToFoodFocusPillar/);
});
