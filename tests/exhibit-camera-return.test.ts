import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../components/WorldCanvas.tsx", import.meta.url), "utf8");

test("closing exhibit focus restores the exact camera view from before selection", () => {
  assert.match(source, /const preFocusView = useRef</);
  assert.match(source, /exhibitChanged && selectedExhibit && !previousExhibit\.current/);
  assert.match(source, /position: camera\.position\.clone\(\)/);
  assert.match(source, /target: lookAt\.clone\(\)/);
  assert.match(source, /fov: camera instanceof THREE\.PerspectiveCamera \? camera\.fov/);
  assert.match(source, /const returningToPreFocus = Boolean/);
  assert.match(source, /destination\.copy\(preFocusView\.current\.position\)/);
  assert.match(source, /lookAtTarget\.copy\(preFocusView\.current\.target\)/);
  assert.match(source, /desiredFov\.current = preFocusView\.current\.fov/);
  assert.match(source, /preserveFov: returningToPreFocus/);
  assert.match(source, /activeRoute\.preserveFov[\s\S]{0,100}activeRoute\.toFov/);
  assert.match(source, /userAdjustedView\.current = returningToPreFocus/);
  assert.match(source, /if \(returningToPreFocus\) preFocusView\.current = null/);
});
