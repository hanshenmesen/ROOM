import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { MARDOU_LOBBY_FOCUS, MARDOU_LOBBY_INTRO_ROUTE } from "../components/MardouMuseumLayout.ts";

const worldSource = readFileSync(new URL("../components/WorldCanvas.tsx", import.meta.url), "utf8");

test("the first entrance uses one continuous arc-length camera curve", () => {
  assert.doesNotMatch(worldSource, /new THREE\.CurvePath/);
  assert.match(worldSource, /positionCurve = silkyCameraCurve\(positionPoints\)/);
  assert.match(worldSource, /new THREE\.CatmullRomCurve3\(points, false, "centripetal", 0\.42\)/);
  assert.match(worldSource, /sampleCameraCurve\(route\.current\.position, eased, camera\.position\)/);
  assert.match(worldSource, /Math\.min\(delta, 1 \/ 24\)/);
});

test("the entrance starts at the supplied floor point and turns toward the supplied main-view target", () => {
  assert.ok(Math.abs(MARDOU_LOBBY_INTRO_ROUTE.spawn[0] - 0.6881) < 0.002);
  assert.ok(Math.abs(MARDOU_LOBBY_INTRO_ROUTE.spawn[2] - -4.7804) < 0.002);
  assert.deepEqual(MARDOU_LOBBY_FOCUS.target, MARDOU_LOBBY_INTRO_ROUTE.mainTarget);
  assert.ok(Math.abs(MARDOU_LOBBY_FOCUS.target[0] - -2.7283) < 0.002);
  assert.ok(Math.abs(MARDOU_LOBBY_FOCUS.target[2] - -17.5713) < 0.002);
  assert.match(worldSource, /MARDOU_LOBBY_INTRO_ROUTE\.approach/);
  assert.match(worldSource, /MARDOU_LOBBY_INTRO_ROUTE\.threshold/);
  assert.match(worldSource, /MARDOU_LOBBY_INTRO_ROUTE\.mainTarget/);
});

test("the loading cover waits for shader precompilation", () => {
  assert.match(worldSource, /Promise\.race\(\[/);
  assert.match(worldSource, /gl\.compileAsync\(scene, camera\)/);
  assert.match(worldSource, /SCENE_COMPILE_TIMEOUT_MS/);
  assert.match(worldSource, /secondFrame = window\.requestAnimationFrame\(onReady\)/);
});
