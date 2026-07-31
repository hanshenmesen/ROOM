import assert from "node:assert/strict";
import test from "node:test";
import { MARDOU_AUTO_DOOR } from "../components/MardouMuseumLayout.ts";

test("picked source point maps to the authored automatic door", () => {
  assert.ok(Math.abs(MARDOU_AUTO_DOOR.position[0] - -1.9004) < 0.002);
  assert.ok(Math.abs(MARDOU_AUTO_DOOR.position[1] - 0.2461) < 0.002);
  assert.ok(Math.abs(MARDOU_AUTO_DOOR.position[2] - -17.5713) < 0.002);
  assert.ok(MARDOU_AUTO_DOOR.width > 1.7);
  assert.ok(MARDOU_AUTO_DOOR.height > 1.7);
});

test("automatic door uses proximity hysteresis", () => {
  assert.ok(MARDOU_AUTO_DOOR.sensorRadius < MARDOU_AUTO_DOOR.releaseRadius);
});
