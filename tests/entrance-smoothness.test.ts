import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import * as THREE from "three";
import {
  MARDOU_AUTO_DOOR,
  MARDOU_INNER_GALLERY_DOOR,
  MARDOU_ENTRANCE_ROUTE,
  MARDOU_EXTERIOR_FOCUS,
  MARDOU_LOBBY_FOCUS,
  MARDOU_LOBBY_INTRO_ROUTE,
  MARDOU_LOBBY_WIDE_FOCUS,
  MARDOU_PRIVATE_ROUTE,
  responsiveMuseumCamera,
  responsiveMuseumFov,
  responsiveMuseumTarget,
} from "../components/MardouMuseumLayout.ts";

const worldSource = readFileSync(new URL("../components/WorldCanvas.tsx", import.meta.url), "utf8");
const auditSource = readFileSync(new URL("../scripts/audit-mardou-layout.mjs", import.meta.url), "utf8");

test("the first entrance uses one continuous arc-length camera curve", () => {
  assert.doesNotMatch(worldSource, /new THREE\.CurvePath/);
  assert.match(worldSource, /positionCurve = silkyCameraCurve\(positionPoints\)/);
  assert.match(worldSource, /new THREE\.CatmullRomCurve3\(points, false, "centripetal", 0\.42\)/);
  assert.match(worldSource, /curve\.arcLengthDivisions = 1200/);
  assert.match(worldSource, /curve\.updateArcLengths\(\)/);
  assert.match(worldSource, /sampleCameraCurve\(activeRoute\.position, eased, camera\.position\)/);
  assert.match(worldSource, /Math\.min\(delta, 1 \/ 24\)/);
});

test("the entrance follows supplied points 1, 2 and 3 then turns right 90 degrees", () => {
  assert.ok(Math.abs(MARDOU_LOBBY_INTRO_ROUTE.spawn[0] - 1.6508) < 0.002);
  assert.ok(Math.abs(MARDOU_LOBBY_INTRO_ROUTE.spawn[2] - -4.8466) < 0.002);
  assert.ok(Math.abs(MARDOU_LOBBY_INTRO_ROUTE.waypoint[0] - -0.5306) < 0.002);
  assert.ok(Math.abs(MARDOU_LOBBY_INTRO_ROUTE.waypoint[2] - -4.8703) < 0.002);
  assert.ok(Math.abs(MARDOU_LOBBY_INTRO_ROUTE.arrival[0] - -1.9558) < 0.002);
  assert.ok(Math.abs(MARDOU_LOBBY_INTRO_ROUTE.arrival[2] - -5.106) < 0.002);
  assert.deepEqual(MARDOU_LOBBY_INTRO_ROUTE.points, [
    MARDOU_LOBBY_INTRO_ROUTE.spawn,
    MARDOU_LOBBY_INTRO_ROUTE.waypoint,
    MARDOU_LOBBY_INTRO_ROUTE.arrival,
  ]);
  const travelDirection = new THREE.Vector3(...MARDOU_LOBBY_INTRO_ROUTE.arrival)
    .sub(new THREE.Vector3(...MARDOU_LOBBY_INTRO_ROUTE.waypoint))
    .setY(0)
    .normalize();
  const finalViewDirection = new THREE.Vector3(...MARDOU_LOBBY_INTRO_ROUTE.mainTarget)
    .sub(new THREE.Vector3(...MARDOU_LOBBY_INTRO_ROUTE.arrival))
    .setY(0)
    .normalize();
  assert.ok(Math.abs(travelDirection.dot(finalViewDirection)) < 0.001, "the final view is perpendicular to the point 2 to point 3 travel direction");
  const travelRight = new THREE.Vector3(-travelDirection.z, 0, travelDirection.x);
  assert.ok(travelRight.dot(finalViewDirection) > 0.999, "the final view turns to the camera's right, not its left");
  assert.match(worldSource, /MARDOU_LOBBY_INTRO_ROUTE\.points\.map/);
  assert.match(worldSource, /MARDOU_LOBBY_INTRO_ROUTE\.targets\.map/);
});

test("the entrance leaves swing toward the corridor and clear the moving camera", () => {
  assert.equal(MARDOU_AUTO_DOOR.swingDirection, -1);
  assert.equal(MARDOU_INNER_GALLERY_DOOR.swingDirection, 1);
  assert.match(worldSource, /1\.48 \* door\.swingDirection/);
});

test("the unselected lobby settles exactly at point 3 with a wide lens", () => {
  assert.equal(MARDOU_LOBBY_FOCUS.fov, 86);
  assert.deepEqual(MARDOU_LOBBY_FOCUS.camera, MARDOU_LOBBY_INTRO_ROUTE.arrival);
  assert.deepEqual(MARDOU_LOBBY_FOCUS.target, MARDOU_LOBBY_INTRO_ROUTE.mainTarget);
  assert.match(worldSource, /room\?\.kind === "lobby"[\s\S]*MARDOU_LOBBY_FOCUS/);
  assert.match(
    worldSource,
    /focusTransition[\s\S]*Math\.max\(distance \* 0\.62, turnSeconds\), 2\.8, 6\.4/,
    "exhibit approach and return transitions budget time for both travel and lateral turn",
  );
});

test("the R-key wide view remains inside the clear gallery band", () => {
  assert.ok(MARDOU_LOBBY_WIDE_FOCUS.fov > MARDOU_LOBBY_FOCUS.fov);
  assert.equal(MARDOU_LOBBY_WIDE_FOCUS.fov, 88);
  assert.ok(MARDOU_LOBBY_WIDE_FOCUS.camera[0] < MARDOU_LOBBY_FOCUS.camera[0]);
  assert.ok(MARDOU_LOBBY_WIDE_FOCUS.camera[1] > MARDOU_LOBBY_FOCUS.camera[1]);
  assert.ok(MARDOU_LOBBY_WIDE_FOCUS.camera[2] <= -9.53, "the R-key overview also keeps the stairs behind the lens");
});

test("the authored entrance remains wide while responsive reframing stays bounded", () => {
  assert.equal(responsiveMuseumFov(MARDOU_LOBBY_FOCUS.fov, 16 / 9), MARDOU_LOBBY_FOCUS.fov);
  assert.ok(responsiveMuseumFov(MARDOU_LOBBY_FOCUS.fov, 0.7) > MARDOU_LOBBY_FOCUS.fov);
  assert.equal(responsiveMuseumFov(MARDOU_LOBBY_FOCUS.fov, 0.46), 96);
  assert.equal(responsiveMuseumFov(MARDOU_LOBBY_FOCUS.fov, 0.36), 108);
  assert.ok(
    responsiveMuseumFov(MARDOU_LOBBY_FOCUS.fov, 2.33) < 78,
    "ultrawide canvases cap horizontal field of view instead of shrinking the museum",
  );
  assert.equal(responsiveMuseumFov(48, 0.7), 48, "exhibit close-ups keep their authored lens");
  assert.deepEqual(responsiveMuseumTarget(MARDOU_LOBBY_FOCUS.target, 16 / 9), MARDOU_LOBBY_FOCUS.target);
  assert.deepEqual(
    responsiveMuseumTarget(MARDOU_LOBBY_FOCUS.target, 0.46),
    MARDOU_LOBBY_FOCUS.target,
    "the authored forward view at point 3 remains exact on portrait screens",
  );
  const portraitCamera = responsiveMuseumCamera(MARDOU_LOBBY_FOCUS.camera, 0.46);
  assert.deepEqual(portraitCamera, MARDOU_LOBBY_FOCUS.camera);
  assert.notDeepEqual(
    responsiveMuseumCamera(MARDOU_LOBBY_WIDE_FOCUS.camera, 0.46),
    portraitCamera,
    "R remains an independent responsive museum overview",
  );
  assert.match(
    worldSource,
    /MARDOU_LOBBY_INTRO_ROUTE\.points\.map/,
    "the first entrance must use the exact authored 1 -> 2 -> 3 route",
  );
  assert.match(worldSource, /responsiveMuseumCamera\(wideFocus\.camera, camera\.aspect\)/);
  assert.match(worldSource, /Math\.abs\(camera\.aspect - responsiveAspect\.current\) > 0\.015/);
  assert.match(worldSource, /!userAdjustedView\.current/);
  assert.match(worldSource, /responsiveReframeDuration\(camera\.position\.distanceTo\(destination\)\)/);
  assert.match(worldSource, /lobbyOverviewMode\.current === "wide"/);
  assert.match(auditSource, /portraitWideProjectVisibilityFailures/);
  assert.match(auditSource, /overviewResponsiveCompositionFailures/);
  assert.match(auditSource, /focusRouteClearanceFailures/);
  assert.match(auditSource, /introStairForegroundFailures/);
  assert.match(worldSource, /finalPosition: positionPoints\[positionPoints\.length - 1\]\.clone\(\)/);
  assert.match(worldSource, /if \(completed\) \{[\s\S]*camera\.position\.copy\(activeRoute\.finalPosition\);[\s\S]*lookAt\.copy\(activeRoute\.finalTarget\);/);
  assert.match(
    worldSource,
    /if \(lobbyIntroPending\.current\)[\s\S]*responsiveMuseumFov\(MARDOU_LOBBY_FOCUS\.fov, camera\.aspect\)/,
    "the responsive lens must be locked before the intro route starts",
  );
});

test("the loading cover waits for shader precompilation", () => {
  assert.match(worldSource, /Promise\.race\(\[/);
  assert.match(worldSource, /gl\.compileAsync\(scene, camera\)/);
  assert.match(worldSource, /SCENE_COMPILE_TIMEOUT_MS/);
  assert.match(worldSource, /secondFrame = window\.requestAnimationFrame\(onReady\)/);
});

test("the upstairs route looks along the stairs and stays above the treads", () => {
  assert.ok(MARDOU_LOBBY_INTRO_ROUTE.arrival[1] < MARDOU_PRIVATE_ROUTE.lowerFlight[1]);
  assert.ok(MARDOU_PRIVATE_ROUTE.lowerFlight[1] >= 2.7);
  assert.equal(MARDOU_PRIVATE_ROUTE.ascentTargets.length, 5);
  assert.equal(MARDOU_PRIVATE_ROUTE.descentTargets.length, 5);
  assert.ok(MARDOU_PRIVATE_ROUTE.duration >= 11.5, "the staircase reads as a deliberate walking ascent");
  assert.match(worldSource, /targetUsesControlTiming/);
  assert.match(worldSource, /MARDOU_PRIVATE_ROUTE\.ascentTargets\.map/);
  assert.match(worldSource, /MARDOU_PRIVATE_ROUTE\.descentTargets\.map/);
});

test("room navigation stays locked until its camera route settles", () => {
  assert.match(worldSource, /roomTransition\?: boolean/);
  assert.match(worldSource, /if \(completedRoomTransition\) onTransitionStateChange\(false\)/);
  assert.match(worldSource, /if \(roomTransition\) onTransitionStateChange\(true\)/);
  assert.match(
    worldSource,
    /position\.getUtoTmapping\(eased, 0\)[\s\S]*target\.getPoint\(THREE\.MathUtils\.clamp\(pairedCurveProgress, 0, 1\), lookAt\)/,
    "paired room routes must turn toward each landmark when the camera actually reaches it",
  );
});

test("the exterior route uses a frontal glass-facade view with synchronized look points", () => {
  assert.ok(MARDOU_EXTERIOR_FOCUS.camera[2] <= 21.2, "the exterior facade must not recede into a sky-heavy long shot");
  assert.ok(MARDOU_EXTERIOR_FOCUS.camera[0] <= 10);
  assert.ok(MARDOU_EXTERIOR_FOCUS.camera[2] >= 20);
  assert.ok(MARDOU_EXTERIOR_FOCUS.target[0] > 2, "the final frame favors the glass wing");
  assert.equal(MARDOU_ENTRANCE_ROUTE.exitTargets.length, 4);
  assert.equal(MARDOU_ENTRANCE_ROUTE.entryTargets.length, 3);
  assert.ok(MARDOU_ENTRANCE_ROUTE.duration >= 7.2, "the 36m exterior flight stays comfortably paced");
  assert.ok(
    MARDOU_ENTRANCE_ROUTE.exitTargets[0][2] < MARDOU_ENTRANCE_ROUTE.gallery[2],
    "the exit camera keeps looking back into the gallery",
  );
  assert.ok(
    MARDOU_ENTRANCE_ROUTE.exitTargets[1][2] < MARDOU_ENTRANCE_ROUTE.threshold[2],
    "the threshold shot keeps the doorway in view instead of empty sky",
  );
  assert.ok(
    MARDOU_ENTRANCE_ROUTE.exitTargets[2][2] < MARDOU_ENTRANCE_ROUTE.outside[2],
    "the exterior reveal begins while the camera still faces the facade",
  );
  assert.match(worldSource, /MARDOU_ENTRANCE_ROUTE\.exitTargets\.map/);
  assert.match(worldSource, /MARDOU_ENTRANCE_ROUTE\.entryTargets\.map/);
});
