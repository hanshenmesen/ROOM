import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { MARDOU_STAIR_CLICK_TARGETS } from "../components/MardouMuseumLayout.ts";

const sceneSource = await readFile(new URL("../components/MardouMuseumScene.tsx", import.meta.url), "utf8");
const worldSource = await readFile(new URL("../components/WorldCanvas.tsx", import.meta.url), "utf8");
const studioSource = await readFile(new URL("../components/RoomStudio.tsx", import.meta.url), "utf8");

test("stair targets follow every real tread and the intermediate landing", () => {
  assert.equal(MARDOU_STAIR_CLICK_TARGETS.length, 21);
  assert.deepEqual(
    MARDOU_STAIR_CLICK_TARGETS.map((target) => Number(target.position[2].toFixed(3))),
    Array(21).fill(-8.753),
  );

  for (const target of MARDOU_STAIR_CLICK_TARGETS) {
    assert.ok(target.position[0] >= -0.98 && target.position[0] <= 3.64);
    assert.ok(target.position[1] >= 0.39 && target.position[1] <= 3.42);
    assert.ok(target.size[0] <= 0.96);
    assert.ok(target.size[1] <= 0.04);
    assert.ok(target.size[2] >= 1.45 && target.size[2] <= 1.56);
  }

  for (let index = 1; index < MARDOU_STAIR_CLICK_TARGETS.length; index += 1) {
    assert.ok(MARDOU_STAIR_CLICK_TARGETS[index].position[1] > MARDOU_STAIR_CLICK_TARGETS[index - 1].position[1]);
  }
});

test("stairs expose one translucent floor-aware navigation sign", () => {
  assert.match(worldSource, /function StairwayNavigation/);
  assert.match(worldSource, /activeRoom === "room-private" \? "点击下楼" : "点击上楼"/);
  assert.match(worldSource, /stairNavigationSign: true/);
  assert.match(worldSource, /rgba\(11, 18, 23, \.58\)/);
  assert.match(worldSource, /onRoomChange\(activeRoom === "room-private" \? "room-lobby" : "room-private"\)/);
});

test("floor navigation stays hidden until the camera is close to the stairs", () => {
  assert.match(worldSource, /const LOBBY_STAIR_PROXIMITY_RADIUS = 3\.15/);
  assert.match(worldSource, /const PRIVATE_STAIR_PROXIMITY_RADIUS = 3\.65/);
  assert.match(worldSource, /function StairProximityReporter/);
  assert.match(worldSource, /camera\.position\.distanceTo\(proximityPoint\) <= proximityRadius/);
  assert.match(worldSource, /\{nearby \? <sprite/);
  assert.match(worldSource, /nearby=\{stairNearby\}/);
  assert.match(studioSource, /const \[stairNavigationNearby, setStairNavigationNearby\] = useState\(false\)/);
  assert.match(studioSource, /onStairProximityChange=\{setStairNavigationNearby\}/);
  assert.match(studioSource, /activeRoom === "room-lobby" && stairNavigationNearby && !cameraTransitioning/);
  assert.match(studioSource, /\) : stairNavigationNearby && !cameraTransitioning \? \(/);
});

test("museum background no longer promotes a broad coordinate region to stairs", () => {
  assert.doesNotMatch(sceneSource, /isStairwayPoint/);
  assert.doesNotMatch(sceneSource, /point\.x >= 3\.5/);
});
