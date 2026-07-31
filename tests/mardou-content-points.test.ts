import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  MARDOU_EDUCATION_PLACEMENT,
  MARDOU_PRIVATE_PICTURE_FRAMES,
  MARDOU_PRIVATE_SURFACE_PLACEMENTS,
  MARDOU_PROFILE_PLACEMENT,
  MARDOU_PROJECT_PLACEMENTS,
  MARDOU_SKILLS_PLACEMENT,
  mardouProjectPlacementsForCount,
  mardouSourcePointToWorld,
} from "../components/MardouMuseumLayout.ts";

const worldSource = await readFile(new URL("../components/WorldCanvas.tsx", import.meta.url), "utf8");
const studioSource = await readFile(new URL("../components/RoomStudio.tsx", import.meta.url), "utf8");

function rounded(point: readonly number[]) {
  return point.map((value) => Number(value.toFixed(4)));
}

test("provided source points map to the authored profile, education, project and skills positions", () => {
  assert.deepEqual(rounded(MARDOU_PROFILE_PLACEMENT.position), rounded(mardouSourcePointToWorld([-31.7103, -9.8659, -550.6032])));

  const educationFloor = mardouSourcePointToWorld([-22.3637, -16.2896, -498.6037]);
  assert.deepEqual(rounded(MARDOU_EDUCATION_PLACEMENT.position), rounded([educationFloor[0], educationFloor[1] + 1.39, educationFloor[2]]));

  const skillFloor = mardouSourcePointToWorld([-3.346, -16.2896, -568.1041]);
  assert.deepEqual(rounded(MARDOU_SKILLS_PLACEMENT.position), rounded([skillFloor[0], skillFloor[1] + 1.39, skillFloor[2]]));

  assert.deepEqual(
    MARDOU_PROJECT_PLACEMENTS.map((placement) => rounded(placement.position)),
    [
      [-19.6876, -16.2896, -542.8366],
      [0.7233, -16.2896, -542.925],
      [15.7013, -16.2896, -542.6077],
    ].map((point) => rounded(mardouSourcePointToWorld(point as [number, number, number]))),
  );
});

test("project islands use 4, then 4+5, then 3+4+5 and hide unused islands", () => {
  assert.deepEqual(mardouProjectPlacementsForCount(1), [MARDOU_PROJECT_PLACEMENTS[1]]);
  assert.deepEqual(mardouProjectPlacementsForCount(2), [MARDOU_PROJECT_PLACEMENTS[1], MARDOU_PROJECT_PLACEMENTS[2]]);
  assert.deepEqual(mardouProjectPlacementsForCount(3), MARDOU_PROJECT_PLACEMENTS);
  assert.match(worldSource, /const PROJECTS_PER_PAGE = 3/);
  assert.match(studioSource, /const PROJECTS_PER_PAGE = 3/);
  assert.doesNotMatch(worldSource, /EmptyProjectPedestal/);
});

test("all remaining information surfaces use the four supplied upper-floor points", () => {
  assert.equal(MARDOU_PRIVATE_SURFACE_PLACEMENTS.length, 4);
  assert.ok(MARDOU_PRIVATE_SURFACE_PLACEMENTS.every((placement) => placement.position[1] > 4.8));
  assert.match(worldSource, /surfaceRoom = isLobbySurface\(surface\) \? "room-lobby" : "room-private"/);
});

test("upper-floor wall points 11-13 are empty uploadable picture frames", () => {
  assert.deepEqual(MARDOU_PRIVATE_PICTURE_FRAMES.map((frame) => frame.slot), [
    "private-frame-11",
    "private-frame-12",
    "private-frame-13",
  ]);
  assert.deepEqual(MARDOU_PRIVATE_PICTURE_FRAMES.map((frame) => rounded(frame.normal)), [
    [-0.8661, 0, 0.4998],
    [-0.8661, 0, 0.4998],
    [0.9926, 0, 0.1214],
  ]);
  assert.match(worldSource, /private-upload-picture-frames/);
  assert.match(studioSource, /恢复为空相框/);
  assert.match(studioSource, /readPrivateFrameImage/);
});
