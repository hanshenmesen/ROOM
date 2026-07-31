import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const museumSource = readFileSync(new URL("../components/MardouMuseumScene.tsx", import.meta.url), "utf8");
const studioSource = readFileSync(new URL("../components/RoomStudio.tsx", import.meta.url), "utf8");
const worldSource = readFileSync(new URL("../components/WorldCanvas.tsx", import.meta.url), "utf8");

test("the museum GLB starts preloading when the user advances to intake", () => {
  assert.match(museumSource, /useLoader\.preload\(SceneGltfLoader, MUSEUM_URL\)/);
  assert.match(studioSource, /function prewarmMuseum\(\)/);
  assert.match(studioSource, /prewarmMuseum\(\);[\s\S]*setIntroComplete\(true\)/);
});

test("upstairs keeps the light graph stable instead of compiling a new variant", () => {
  assert.doesNotMatch(worldSource, /activeRoom !== "room-private" \? <pointLight/);
  assert.match(worldSource, /intensity=\{activeRoom !== "room-private" \? 12 : 0\}/);
  assert.match(worldSource, /intensity=\{interactive \? selected \? 5 : 2\.8 : 0\}/);
  assert.match(worldSource, /function ShowroomDetails[\s\S]*intensity=\{lit \? 7 : 0\}/);
});
