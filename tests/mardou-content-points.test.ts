import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  MARDOU_ACHIEVEMENT_PLACEMENT,
  MARDOU_EDUCATION_PLACEMENT,
  MARDOU_GRAMOPHONE_PLACEMENT,
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
const skillsBookcase = await readFile(new URL("../public/vendor/mardou/skills-bookcase.glb", import.meta.url));
const exhibitPedestal = await readFile(new URL("../public/vendor/mardou/exhibit-pedestal-2.glb", import.meta.url));
const blankArtFrame = await readFile(new URL("../public/vendor/mardou/blank-art-frame.glb", import.meta.url));
const gramophone = await readFile(new URL("../public/vendor/mardou/gramophone.glb", import.meta.url));

function rounded(point: readonly number[]) {
  return point.map((value) => Number(value.toFixed(4)));
}

test("provided source points map to the authored profile, swapped education/achievement, project and skills positions", () => {
  assert.deepEqual(rounded(MARDOU_PROFILE_PLACEMENT.position), rounded(mardouSourcePointToWorld([-31.7103, -9.8659, -550.6032])));

  const educationFloor = mardouSourcePointToWorld([-22.3637, -16.2896, -498.6037]);
  assert.deepEqual(rounded(MARDOU_ACHIEVEMENT_PLACEMENT.position), rounded([educationFloor[0], educationFloor[1] + 1.39, educationFloor[2]]));
  assert.deepEqual(rounded(MARDOU_EDUCATION_PLACEMENT.position), rounded(MARDOU_PRIVATE_SURFACE_PLACEMENTS[1].position));
  assert.match(worldSource, /surface\.semanticRole === "achievement"\) return MARDOU_ACHIEVEMENT_PLACEMENT/);

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

test("the skills point uses the supplied bookcase model instead of the generated drawer cabinet", () => {
  assert.equal(skillsBookcase.subarray(0, 4).toString("utf8"), "glTF");
  assert.match(worldSource, /SKILLS_BOOKCASE_URL = "\/vendor\/mardou\/skills-bookcase\.glb"/);
  assert.match(worldSource, /function LoadedSkillsBookcase/);
  assert.match(worldSource, /<LoadedSkillsBookcase \/>/);
  assert.doesNotMatch(worldSource, /\[-0\.92, -0\.56, -0\.2, 0\.16\]\.map/);
});

test("project islands use 4, then 4+5, then 3+4+5 and hide unused islands", () => {
  assert.deepEqual(mardouProjectPlacementsForCount(1), [MARDOU_PROJECT_PLACEMENTS[1]]);
  assert.deepEqual(mardouProjectPlacementsForCount(2), [MARDOU_PROJECT_PLACEMENTS[1], MARDOU_PROJECT_PLACEMENTS[2]]);
  assert.deepEqual(mardouProjectPlacementsForCount(3), MARDOU_PROJECT_PLACEMENTS);
  assert.match(worldSource, /const PROJECTS_PER_PAGE = 3/);
  assert.match(worldSource, /projectExhibits\.slice\(0, PROJECTS_PER_PAGE\)/);
  assert.doesNotMatch(worldSource, /EmptyProjectPedestal/);
});

test("all remaining information surfaces use the four supplied upper-floor points", () => {
  assert.equal(MARDOU_PRIVATE_SURFACE_PLACEMENTS.length, 4);
  assert.ok(MARDOU_PRIVATE_SURFACE_PLACEMENTS.every((placement) => placement.position[1] > 4.8));
  assert.match(worldSource, /surfaceRoom = isLobbySurface\(surface\) \? "room-lobby" : "room-private"/);
});

test("the six supplied wall points are empty uploadable picture frames", () => {
  assert.deepEqual(MARDOU_PRIVATE_PICTURE_FRAMES.map((frame) => frame.slot), [
    "private-frame-1",
    "private-frame-2",
    "private-frame-3",
    "private-frame-4",
    "private-frame-5",
    "private-frame-6",
  ]);
  assert.deepEqual(MARDOU_PRIVATE_PICTURE_FRAMES.map((frame) => rounded(frame.normal)), [
    [0.7818, 0, -0.6235],
    [0.8615, 0, -0.5078],
    [0.9239, 0, -0.3827],
    [0.9484, 0, -0.3172],
    [0.9834, 0, -0.1816],
    [0.9991, 0, -0.0413],
  ]);
  assert.equal(blankArtFrame.subarray(0, 4).toString("utf8"), "glTF");
  assert.match(worldSource, /BLANK_ART_FRAME_URL = "\/vendor\/mardou\/blank-art-frame\.glb"/);
  assert.match(worldSource, /private-upload-picture-frames/);
  assert.match(worldSource, /color="#ffffff"/);
  assert.match(studioSource, /恢复为空相框/);
  assert.match(studioSource, /readPrivateFrameImage/);
});

test("projects and the interactive gramophone use the supplied pedestal assets", () => {
  assert.equal(exhibitPedestal.subarray(0, 4).toString("utf8"), "glTF");
  assert.equal(gramophone.subarray(0, 4).toString("utf8"), "glTF");
  assert.deepEqual(
    rounded(MARDOU_GRAMOPHONE_PLACEMENT.position),
    rounded(mardouSourcePointToWorld([33.0739, -16.2896, -509.7867])),
  );
  assert.match(worldSource, /EXHIBIT_PEDESTAL_URL = "\/vendor\/mardou\/exhibit-pedestal-2\.glb"/);
  assert.match(worldSource, /GRAMOPHONE_URL = "\/vendor\/mardou\/gramophone\.glb"/);
  assert.match(worldSource, /name="showroom-gramophone"/);
  assert.match(studioSource, /当前未设置音乐，请先选择本地音频/);
});

test("project screens use a higher reading angle on all three islands", () => {
  assert.match(worldSource, /const PROJECT_CARD_TILT = -0\.82/);
  assert.match(worldSource, /rotation=\{\[PROJECT_CARD_TILT, 0, 0\]\}/);
});
