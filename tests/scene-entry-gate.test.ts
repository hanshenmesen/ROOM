import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const roomStudioSource = readFileSync(new URL("../components/RoomStudio.tsx", import.meta.url), "utf8");

test("the world stays covered until resources, portrait generation, and scene commit are ready", () => {
  assert.match(roomStudioSource, /const SCENE_READY_HOLD_MS = 1200;/);
  assert.match(roomStudioSource, /const sceneCanReveal = sceneCommitted && sceneResourcesReady && portraitGenerationSettled;/);
  assert.match(roomStudioSource, /const displayedSceneProgress = sceneCanReveal \? 100 : sceneProgress;/);
  assert.match(roomStudioSource, /sceneLoadState\.progress >= 100/);
  assert.match(roomStudioSource, /\["ready", "degraded", "failed"\]\.includes\(sceneLoadState\.status\)/);
  assert.match(roomStudioSource, /setSceneReady\(true\);[\s\S]*SCENE_READY_HOLD_MS/);
  assert.match(roomStudioSource, /加载完成，正在稳定画面，即将进入/);
});
