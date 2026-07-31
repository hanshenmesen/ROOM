import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { MARDOU_AUTO_DOOR, MARDOU_INNER_GALLERY_DOOR, MARDOU_SIDE_ENTRANCE_DOOR } from "../components/MardouMuseumLayout.ts";

const sceneSource = readFileSync(new URL("../components/MardouMuseumScene.tsx", import.meta.url), "utf8");
const worldSource = readFileSync(new URL("../components/WorldCanvas.tsx", import.meta.url), "utf8");

test("picked source point maps to the authored automatic door", () => {
  assert.ok(Math.abs(MARDOU_AUTO_DOOR.position[0] - -0.8922) < 0.002);
  assert.ok(Math.abs(MARDOU_AUTO_DOOR.position[1] - 0.2461) < 0.002);
  assert.ok(Math.abs(MARDOU_AUTO_DOOR.position[2] - -4.8193) < 0.002);
  assert.deepEqual(MARDOU_AUTO_DOOR.normal, [-1, 0, 0]);
  assert.deepEqual(MARDOU_AUTO_DOOR.rotation, [0, Math.PI / 2, 0]);
  assert.ok(MARDOU_AUTO_DOOR.width > 1.7);
  assert.ok(MARDOU_AUTO_DOOR.height > 1.7);
});

test("the original wall is removed across the complete door opening", () => {
  assert.match(sceneSource, /AUTO_DOOR_CUTS\.some/);
  assert.match(sceneSource, /triangleMaxX >= cut\.minX/);
  assert.match(sceneSource, /triangleMinY <= cut\.maxY/);
  assert.match(sceneSource, /triangleMaxZ >= cut\.minZ/);
  assert.doesNotMatch(sceneSource, /const centerX =/);
});

test("the supplied inner gallery wall point maps to a second automatic door", () => {
  assert.ok(Math.abs(MARDOU_INNER_GALLERY_DOOR.position[0] - -1.9098) < 0.002);
  assert.ok(Math.abs(MARDOU_INNER_GALLERY_DOOR.position[1] - 0.2461) < 0.002);
  assert.ok(Math.abs(MARDOU_INNER_GALLERY_DOOR.position[2] - -17.5713) < 0.002);
  assert.deepEqual(MARDOU_INNER_GALLERY_DOOR.normal, [0, 0, 1]);
  assert.deepEqual(MARDOU_INNER_GALLERY_DOOR.rotation, [0, 0, 0]);
  assert.match(sceneSource, /minZ: -51\.48, maxZ: -50\.92/);
});

test("point 45 maps to a matching automatic side entrance door", () => {
  assert.ok(Math.abs(MARDOU_SIDE_ENTRANCE_DOOR.position[0] - 1.6098) < 0.002);
  assert.ok(Math.abs(MARDOU_SIDE_ENTRANCE_DOOR.position[1] - 0.2461) < 0.002);
  assert.ok(Math.abs(MARDOU_SIDE_ENTRANCE_DOOR.position[2] - -4.8135) < 0.002);
  assert.deepEqual(MARDOU_SIDE_ENTRANCE_DOOR.normal, [1, 0, 0]);
  assert.deepEqual(MARDOU_SIDE_ENTRANCE_DOOR.rotation, [0, Math.PI / 2, 0]);
  assert.equal(MARDOU_SIDE_ENTRANCE_DOOR.width, MARDOU_AUTO_DOOR.width);
  assert.equal(MARDOU_SIDE_ENTRANCE_DOOR.height, MARDOU_AUTO_DOOR.height);
  assert.match(sceneSource, /minX: 7\.5, maxX: 8\.1/);
  assert.match(worldSource, /<AutoOpeningMuseumDoor door=\{MARDOU_SIDE_ENTRANCE_DOOR\}/);
});

test("automatic door uses proximity hysteresis", () => {
  assert.ok(MARDOU_AUTO_DOOR.sensorRadius < MARDOU_AUTO_DOOR.releaseRadius);
  assert.ok(MARDOU_INNER_GALLERY_DOOR.sensorRadius < MARDOU_INNER_GALLERY_DOOR.releaseRadius);
  assert.ok(MARDOU_SIDE_ENTRANCE_DOOR.sensorRadius < MARDOU_SIDE_ENTRANCE_DOOR.releaseRadius);
});
