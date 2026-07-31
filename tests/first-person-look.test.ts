import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../components/WorldCanvas.tsx", import.meta.url), "utf8");

test("first-person mouse look accumulates a full horizontal rotation", () => {
  assert.match(source, /canvas\.addEventListener\("pointermove", handlePointerMove\)/);
  assert.doesNotMatch(source, /canvas\.addEventListener\("pointerdown"/);
  assert.doesNotMatch(source, /event\.buttons & 1/);
  assert.match(source, /event\.clientX - previousLookPointer\.current\.x/);
  assert.match(source, /movementX \* FIRST_PERSON_LOOK_SENSITIVITY/);
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

test("Q and E turn 10 degrees per tap and keep rotating while held", () => {
  assert.match(source, /\["q", "e"\]\.includes\(key\)/);
  assert.match(source, /FIRST_PERSON_KEY_TURN_ANGLE = THREE\.MathUtils\.degToRad\(10\)/);
  assert.match(source, /keyboardTurnHeld\.current = direction/);
  assert.match(source, /keyboardTurnRemaining\.current = direction \* FIRST_PERSON_KEY_TURN_ANGLE/);
  assert.match(source, /keyboardTurnRemaining\.current = keyboardTurnHeld\.current \* FIRST_PERSON_KEY_TURN_ANGLE/);
  assert.match(source, /FIRST_PERSON_KEY_TURN_DURATION = 0\.55/);
  assert.match(source, /silkyCameraEase\(nextProgress\) - silkyCameraEase\(previousProgress\)/);
  assert.match(source, /firstPersonYaw\.current \+= yawStep/);
});

test("R eases back to an authored wide-angle view", () => {
  assert.match(source, /key === "r"/);
  assert.match(source, /wideAngleRequested\.current = true/);
  assert.match(source, /MARDOU_PRIVATE_WIDE_FOCUS : MARDOU_LOBBY_WIDE_FOCUS/);
  assert.match(source, /toFov: wideFocus\.fov/);
});

test("camera transitions use quintic easing and centripetal curves", () => {
  assert.match(source, /t \* t \* t \* \(t \* \(t \* 6 - 15\) \+ 10\)/);
  assert.match(source, /new THREE\.CatmullRomCurve3\(points, false, "centripetal", 0\.42\)/);
  assert.match(source, /MARDOU_PRIVATE_ROUTE\.duration/);
});
