import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../components/WorldCanvas.tsx", import.meta.url), "utf8");

test("first-person mouse look keeps rotating while the pointer rests near an edge", () => {
  assert.match(source, /canvas\.addEventListener\("pointermove", handlePointerMove\)/);
  assert.doesNotMatch(source, /canvas\.addEventListener\("pointerdown"/);
  assert.doesNotMatch(source, /event\.buttons & 1/);
  assert.match(source, /canvas\.getBoundingClientRect\(\)/);
  assert.match(source, /pointerLookIntent\.current = \{[\s\S]*x: pointerEdgeIntent\(normalizedX\),[\s\S]*y: pointerEdgeIntent\(normalizedY\)/);
  assert.match(source, /FIRST_PERSON_EDGE_YAW_SPEED \* frameDelta/);
  assert.match(source, /FIRST_PERSON_EDGE_PITCH_SPEED \* frameDelta/);
  assert.doesNotMatch(source, /pointerleave/);
  assert.match(source, /edgeProgress \* edgeProgress \* \(3 - 2 \* edgeProgress\)/);
  assert.match(source, /Math\.PI \* 2/);
  assert.match(source, /viewDirection\.applyAxisAngle\(camera\.up, firstPersonYaw\.current\)/);
});

test("first-person mouse look keeps vertical rotation bounded", () => {
  assert.match(source, /FIRST_PERSON_MAX_PITCH = THREE\.MathUtils\.degToRad\(75\)/);
  assert.match(source, /THREE\.MathUtils\.clamp\([\s\S]*-FIRST_PERSON_MAX_PITCH,[\s\S]*FIRST_PERSON_MAX_PITCH/);
});

test("right click toggles mouse-look locking without opening the context menu", () => {
  assert.match(source, /canvas\.addEventListener\("contextmenu", togglePointerLookLock\)/);
  assert.match(source, /event\.preventDefault\(\)/);
  assert.match(source, /pointerLookLocked\.current = !pointerLookLocked\.current/);
  assert.match(source, /route\.current \|\| pointerLookLocked\.current/);
  assert.match(source, /canvas\.dataset\.viewLocked/);
});

test("Q and E turn 90 degrees per tap and keep rotating while held", () => {
  assert.match(source, /\["q", "e"\]\.includes\(key\)/);
  assert.match(source, /FIRST_PERSON_KEY_TURN_ANGLE = THREE\.MathUtils\.degToRad\(90\)/);
  assert.match(source, /keyboardTurnHeld\.current = direction/);
  assert.match(source, /keyboardTurnRemaining\.current = direction \* FIRST_PERSON_KEY_TURN_ANGLE/);
  assert.match(source, /keyboardTurnRemaining\.current = keyboardTurnHeld\.current \* FIRST_PERSON_KEY_TURN_ANGLE/);
  assert.match(source, /FIRST_PERSON_KEY_TURN_DURATION = 0\.55/);
  assert.match(source, /silkyCameraEase\(nextProgress\) - silkyCameraEase\(previousProgress\)/);
  assert.match(source, /firstPersonYaw\.current \+= yawStep/);
});

test("R eases back to an authored wide-angle view", () => {
  assert.match(source, /key === "r"/);
  assert.match(source, /if \(selectedExhibit\) \{[\s\S]*wideAfterSelectionClears\.current = true;[\s\S]*onWideAngleRequested\(\)/);
  assert.match(source, /if \(selectedExhibit \|\| !wideAfterSelectionClears\.current\) return;[\s\S]*wideAngleRequested\.current = true/);
  assert.match(source, /onWideAngleRequested=\{\(\) => onSelect\(""\)\}/);
  assert.match(source, /wideAngleRequested\.current = true/);
  assert.match(source, /MARDOU_PRIVATE_WIDE_FOCUS : MARDOU_LOBBY_WIDE_FOCUS/);
  assert.match(source, /silkyTransitionDuration\(camera\.position\.distanceTo\(destination\), false\)/);
  assert.match(source, /toFov: wideFocus\.fov/);
});

test("camera transitions use quintic easing and centripetal curves", () => {
  assert.match(source, /t \* t \* t \* \(t \* \(t \* 6 - 15\) \+ 10\)/);
  assert.match(source, /new THREE\.CatmullRomCurve3\(points, false, "centripetal", 0\.42\)/);
  assert.match(source, /MARDOU_PRIVATE_ROUTE\.duration/);
  assert.match(source, /function silkyTransitionDuration\(distance: number, focusTransition: boolean, turnAngle = 0\)/);
  assert.match(source, /Math\.max\(distance \* 0\.62, turnSeconds\), 2\.8, 6\.4/);
  assert.match(source, /cameraTurnAngle\(startPosition, startTarget, destination, lookAtTarget\)/);
  assert.match(source, /const focusStartDirection = startTarget\.clone\(\)\.sub\(startPosition\)\.normalize\(\)/);
  assert.match(source, /const focusView = focusTransition && !roomChanged[\s\S]*fromDirection: focusStartDirection/);
  assert.match(source, /activeRoute\.focusView[\s\S]*lerpVectors\([\s\S]*activeRoute\.focusView\.fromDirection,[\s\S]*activeRoute\.focusView\.toDirection/);
  assert.match(source, /focusAttentionOrigin = \(projectIndex >= 1 \|\| previousProjectIndex >= 1\)[\s\S]*positionCurve\?\.getPointAt\(0\.5\)/);
  assert.match(source, /focusStartDirection\.clone\(\)\.lerp\([\s\S]*focusAttentionDirection,[\s\S]*projectIndex === 2 \? 0\.9 : 0\.75/);
  assert.match(source, /projectIndex >= 1[\s\S]*MARDOU_FAR_PROJECT_FOCUS_ROUTE\.map/);
  assert.match(source, /positionCurve\.getLength\(\), true, turnAngle/);
  assert.match(source, /startPosition\.distanceTo\(destination\)/);
  assert.doesNotMatch(source, /duration = exhibit \|\| authoredFocus \? 2\.4 : 2\.8/);
});
