import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  MARDOU_ACHIEVEMENT_PLACEMENT,
  MARDOU_COUCH_PLACEMENT,
  MARDOU_CREATIVE_CORNER_POSITION,
  MARDOU_DIARY_POSITION,
  MARDOU_DIARY_ROTATION,
  MARDOU_PET_BED_PLACEMENT,
  MARDOU_EDUCATION_PLACEMENT,
  MARDOU_GRAMOPHONE_PLACEMENT,
  MARDOU_PRIVATE_PICTURE_FRAMES,
  MARDOU_PRIVATE_SURFACE_PLACEMENTS,
  MARDOU_PROFILE_PLACEMENT,
  MARDOU_PROJECT_PLACEMENTS,
  MARDOU_SKILLS_PLACEMENT,
  mardouProjectPlacementsForCount,
  mardouCreativeCornerPlacementForPrivateCount,
  mardouSourcePointToWorld,
} from "../components/MardouMuseumLayout.ts";

const worldSource = await readFile(new URL("../components/WorldCanvas.tsx", import.meta.url), "utf8");

test("the project source terminal stand is removed from the 3D gallery", () => {
  assert.doesNotMatch(worldSource, /SourceArchiveTerminal/);
  assert.doesNotMatch(worldSource, /SOURCE ARCHIVE/);
});
const studioSource = await readFile(new URL("../components/RoomStudio.tsx", import.meta.url), "utf8");
const skillsBookcase = await readFile(new URL("../public/vendor/mardou/skills-bookcase.glb", import.meta.url));
const exhibitPedestal = await readFile(new URL("../public/vendor/mardou/exhibit-pedestal-2.glb", import.meta.url));
const blankArtFrame = await readFile(new URL("../public/vendor/mardou/blank-art-frame.glb", import.meta.url));
const gramophone = await readFile(new URL("../public/vendor/mardou/gramophone.glb", import.meta.url));
const couch = await readFile(new URL("../public/vendor/mardou/damaged-couch.glb", import.meta.url));
const petBed = await readFile(new URL("../public/vendor/mardou/pet-bed.glb", import.meta.url));

function rounded(point: readonly number[]) {
  return point.map((value) => Number(value.toFixed(4)));
}

test("provided source points map to the authored profile, trophy, education, project and skills positions", () => {
  assert.deepEqual(rounded(MARDOU_PROFILE_PLACEMENT.position), rounded(mardouSourcePointToWorld([-31.7103, -9.8659, -550.6032])));

  const trophyFloor = mardouSourcePointToWorld([-22.6004, -16.2896, -507.135]);
  assert.deepEqual(rounded(MARDOU_ACHIEVEMENT_PLACEMENT.position), rounded([trophyFloor[0], trophyFloor[1] + 1.39, trophyFloor[2]]));
  assert.deepEqual(MARDOU_ACHIEVEMENT_PLACEMENT.focus.camera, [-3, 1.68, -5.5]);
  assert.equal(MARDOU_ACHIEVEMENT_PLACEMENT.focus.target[1], 1.12);
  assert.equal(MARDOU_ACHIEVEMENT_PLACEMENT.focus.fov, 52);
  assert.deepEqual(rounded(MARDOU_EDUCATION_PLACEMENT.position), rounded(MARDOU_PRIVATE_SURFACE_PLACEMENTS[0].position));
  assert.match(worldSource, /surface\.semanticRole === "achievement"\) return MARDOU_ACHIEVEMENT_PLACEMENT/);
  assert.match(worldSource, /name="achievement-trophy"/);
  const achievementGeometry = worldSource.slice(
    worldSource.indexOf('if (role === "achievement")'),
    worldSource.indexOf('if (role === "contact")'),
  );
  assert.doesNotMatch(achievementGeometry, /<GlassMaterial \/>/);

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
  for (const placement of MARDOU_PROJECT_PLACEMENTS.slice(0, 2)) {
    assert.equal(placement.focus.camera[0], placement.position[0]);
    assert.equal(placement.focus.camera[2], placement.position[2] + 3);
  }
  assert.deepEqual(
    rounded(MARDOU_PROJECT_PLACEMENTS[2].focus.camera),
    rounded([3, 1.5, MARDOU_PROJECT_PLACEMENTS[2].position[2] + 2.8]),
  );
});

test("upper-floor information surfaces use supplied slots 2 through 6", () => {
  const privateSourcePoints = [
    [-1.0515, -0.3973, -548.776],
    [-2.5128, -0.3973, -572.8986],
    [-24.6604, -0.3973, -550.994],
    [-18.4265, -0.3973, -567.9006],
    [9.6064, -0.3973, -561.8214],
  ];
  assert.equal(MARDOU_PRIVATE_SURFACE_PLACEMENTS.length, 5);
  assert.deepEqual(
    MARDOU_PRIVATE_SURFACE_PLACEMENTS.map((placement) => rounded(placement.position)),
    privateSourcePoints.map((point) => {
      const floor = mardouSourcePointToWorld(point as [number, number, number]);
      return rounded([floor[0], floor[1] + 1.39, floor[2]]);
    }),
  );
  assert.ok(MARDOU_PRIVATE_SURFACE_PLACEMENTS.every((placement) => placement.position[1] > 4.8));
  assert.match(worldSource, /surfaceRoom = isLobbySurface\(surface\) \? "room-lobby" : "room-private"/);
  assert.match(worldSource, /surfaceRoom === "room-private" && !pickedPlacement/);
  assert.doesNotMatch(worldSource, /surface\.semanticRole === "experience"\) return MARDOU_PRIVATE_SURFACE_PLACEMENTS/);
});

test("the private diary uses supplied upper-floor point 1", () => {
  assert.deepEqual(
    rounded(MARDOU_DIARY_POSITION),
    rounded(mardouSourcePointToWorld([21.6668, -0.3973, -546.3062])),
  );
  assert.equal(MARDOU_DIARY_ROTATION[1] !== Math.PI / 2, true);
  assert.match(worldSource, /position=\{MARDOU_DIARY_POSITION\}/);
  assert.match(worldSource, /rotation=\{MARDOU_DIARY_ROTATION\}/);
});

test("the character corner consumes the next free private slot and overflow stays hidden", () => {
  assert.deepEqual(
    rounded(MARDOU_CREATIVE_CORNER_POSITION),
    rounded(mardouSourcePointToWorld([9.6064, -0.3973, -561.8214])),
  );
  assert.deepEqual(
    mardouCreativeCornerPlacementForPrivateCount(4),
    MARDOU_PRIVATE_SURFACE_PLACEMENTS[4],
  );
  assert.equal(mardouCreativeCornerPlacementForPrivateCount(5), undefined);
  assert.match(worldSource, /placement=\{mardouCreativeCornerPlacementForPrivateCount/);
  assert.match(worldSource, /if \(!person \|\| !placement\) return null/);
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
  assert.match(studioSource, /MUSIC_BOX_TRACKS\.map/);
  assert.match(studioSource, /当前曲目暂时无法播放/);
});

test("the supplied couch asset is normalized and placed against the wall at point 50", () => {
  assert.ok(couch.byteLength > 100_000);
  assert.deepEqual(rounded(MARDOU_COUCH_PLACEMENT.position), rounded(mardouSourcePointToWorld([33.0497, -16.2896, -522.3357])));
  assert.deepEqual(MARDOU_COUCH_PLACEMENT.rotation, [0, -Math.PI / 2, 0]);
  assert.match(worldSource, /name="wall-couch"/);
  assert.match(worldSource, /url=\{DAMAGED_COUCH_URL\} targetSize=\{DAMAGED_COUCH_SIZE\}/);
});

test("the supplied pet bed is floor-aligned beside the pillar at point 54", () => {
  assert.ok(petBed.byteLength > 100_000);
  assert.deepEqual(
    rounded(MARDOU_PET_BED_PLACEMENT.position),
    rounded(mardouSourcePointToWorld([-5.3113, -16.2896, -525.4833])),
  );
  assert.deepEqual(MARDOU_PET_BED_PLACEMENT.rotation, [0, 0, 0]);
  assert.match(worldSource, /name="pet-bed"/);
  assert.match(worldSource, /url=\{PET_BED_URL\} targetSize=\{PET_BED_SIZE\}/);
  assert.match(
    worldSource,
    /activeRoom === "room-lobby" \? <PetBed companionName=\{companionName\} \/> : null/,
  );
});

test("project screens use a higher reading angle on all three islands", () => {
  assert.match(worldSource, /const PROJECT_CARD_TILT = -0\.82/);
  assert.match(worldSource, /rotation=\{\[PROJECT_CARD_TILT, 0, 0\]\}/);
});
