import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { sceneReadinessProgress } from "../lib/scene-entry.ts";

const roomStudioSource = readFileSync(new URL("../components/RoomStudio.tsx", import.meta.url), "utf8");

test("the world stays covered until resources, portrait generation, and scene commit are ready", () => {
  assert.match(roomStudioSource, /const sceneCanReveal = sceneCommitted && sceneResourcesReady && portraitGenerationSettled;/);
  assert.match(roomStudioSource, /sceneReadinessProgress\(\{/);
  assert.match(roomStudioSource, /sceneLoadState\.progress >= 100/);
  assert.match(roomStudioSource, /\["ready", "degraded", "failed"\]\.includes\(sceneLoadState\.status\)/);
  assert.match(roomStudioSource, /sceneReady[\s\S]*scene-loading-complete/);
  assert.match(roomStudioSource, /进入小家/);
  assert.doesNotMatch(roomStudioSource, /进入我的博物馆/);
});

test("progress is never 100 until the reveal state is actually ready", () => {
  assert.equal(sceneReadinessProgress({ resourceProgress: 100, portraitSettled: false, sceneCommitted: false, ready: false }), 85);
  assert.equal(sceneReadinessProgress({ resourceProgress: 100, portraitSettled: true, sceneCommitted: false, ready: false }), 92);
  assert.equal(sceneReadinessProgress({ resourceProgress: 100, portraitSettled: true, sceneCommitted: true, ready: false }), 99);
  assert.equal(sceneReadinessProgress({ resourceProgress: 100, portraitSettled: true, sceneCommitted: true, ready: true }), 100);
});
