import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { MARDOU_COMPANION_SAFE_ZONE } from "../components/MardouMuseumLayout.ts";

const companionSource = await readFile(new URL("../components/RoomCompanion.tsx", import.meta.url), "utf8");
const studioSource = await readFile(new URL("../components/RoomStudio.tsx", import.meta.url), "utf8");

test("room companion patrol points stay on the lobby floor and away from blocked transitions", () => {
  assert.equal(MARDOU_COMPANION_SAFE_ZONE.floorY, 0.25);
  assert.ok(MARDOU_COMPANION_SAFE_ZONE.waypoints.length >= 4);
  assert.equal(MARDOU_COMPANION_SAFE_ZONE.dialoguePoint[1], MARDOU_COMPANION_SAFE_ZONE.floorY);

  for (const waypoint of MARDOU_COMPANION_SAFE_ZONE.waypoints) {
    assert.equal(waypoint[1], MARDOU_COMPANION_SAFE_ZONE.floorY);
    assert.ok(waypoint[1] < 1, "companion must never route to the upper floor");
    assert.ok(waypoint[2] < -10, "companion must stay clear of the entry threshold");

    const inStairBand = waypoint[0] > -1.1
      && waypoint[0] < 3.8
      && waypoint[2] > -10
      && waypoint[2] < -7.6;
    assert.equal(inStairBand, false, "companion waypoint must not sit on the stair treads");
  }
});

test("room companion is neutral, procedural, and does not consume parsed pet material", () => {
  assert.match(companionSource, /name="room-neutral-companion"/);
  assert.match(companionSource, /icosahedronGeometry/);
  assert.match(companionSource, /capsuleGeometry/);
  assert.match(companionSource, /coneGeometry/);

  assert.doesNotMatch(companionSource, /useLoader/);
  assert.doesNotMatch(companionSource, /\.glb|\.gltf|imageUrl|profile\.media|CreativePetFigure/);
  assert.doesNotMatch(companionSource, /petName|petAsset|parsedPet|sourcePet/i);
});

test("room companion pauses for QA and resumes through frame refs instead of per-frame React state", () => {
  assert.match(companionSource, /qaOpen/);
  assert.match(companionSource, /dialoguePoint/);
  assert.match(companionSource, /onOpenQa\(\)/);
  assert.match(companionSource, /pauseUntil\.current/);
  assert.match(companionSource, /useFrame/);
  assert.doesNotMatch(companionSource, /useState/);
  assert.match(companionSource, /root\.current\.position\.addScaledVector/);
  assert.match(studioSource, /className="companion-qa-launch"/);
  assert.match(studioSource, /aria-controls="pet-qa-panel"/);
});
