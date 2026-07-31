import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../components/WorldCanvas.tsx", import.meta.url), "utf8");

test("first-person mouse look accumulates a full horizontal rotation", () => {
  assert.match(source, /event\.clientX - previousLookPointer\.current\.x/);
  assert.match(source, /movementX \* FIRST_PERSON_LOOK_SENSITIVITY/);
  assert.match(source, /Math\.PI \* 2/);
  assert.match(source, /viewDirection\.applyAxisAngle\(camera\.up, firstPersonYaw\.current\)/);
});

test("first-person mouse look keeps vertical rotation bounded", () => {
  assert.match(source, /FIRST_PERSON_MAX_PITCH = THREE\.MathUtils\.degToRad\(75\)/);
  assert.match(source, /THREE\.MathUtils\.clamp\([\s\S]*-FIRST_PERSON_MAX_PITCH,[\s\S]*FIRST_PERSON_MAX_PITCH/);
});
