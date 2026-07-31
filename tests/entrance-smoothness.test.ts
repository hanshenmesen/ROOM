import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const worldSource = readFileSync(new URL("../components/WorldCanvas.tsx", import.meta.url), "utf8");

test("the first entrance uses one continuous arc-length camera curve", () => {
  assert.doesNotMatch(worldSource, /new THREE\.CurvePath/);
  assert.match(worldSource, /positionCurve = new THREE\.CatmullRomCurve3\(positionPoints, false, "centripetal"\)/);
  assert.match(worldSource, /position\.getPointAt\(eased, camera\.position\)/);
  assert.match(worldSource, /Math\.min\(delta, 1 \/ 24\)/);
});

test("the loading cover waits for shader precompilation", () => {
  assert.match(worldSource, /await gl\.compileAsync\(scene, camera\)/);
  assert.match(worldSource, /secondFrame = window\.requestAnimationFrame\(onReady\)/);
});
