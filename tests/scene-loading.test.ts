import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  SceneGltfLoader,
  sceneLoadingManager,
} from "../components/SceneAssetLoaders.ts";
import {
  beginSceneLoading,
  getSceneLoadingSnapshot,
  subscribeSceneLoading,
} from "../components/SceneLoadingStore.ts";

const worldCanvasSource = readFileSync(new URL("../components/WorldCanvas.tsx", import.meta.url), "utf8");

if (typeof ProgressEvent === "undefined") {
  class NodeProgressEvent extends Event {
    lengthComputable: boolean;
    loaded: number;
    total: number;

    constructor(type: string, init: ProgressEventInit = {}) {
      super(type);
      this.lengthComputable = Boolean(init.lengthComputable);
      this.loaded = init.loaded || 0;
      this.total = init.total || 0;
    }
  }

  globalThis.ProgressEvent = NodeProgressEvent as typeof ProgressEvent;
}

test("scene loading snapshot keeps stable references until published changes", () => {
  beginSceneLoading();
  const first = getSceneLoadingSnapshot();
  const second = getSceneLoadingSnapshot();
  assert.equal(first, second);

  beginSceneLoading();
  assert.equal(getSceneLoadingSnapshot(), first);
});

test("world canvas isolates loading subscription from the heavy scene tree", () => {
  assert.match(worldCanvasSource, /function SceneLoadingReporter[\s\S]*useSyncExternalStore/);
  assert.match(worldCanvasSource, /function WorldCanvasImpl/);
  assert.match(worldCanvasSource, /export const WorldCanvas = memo\(WorldCanvasImpl, areWorldCanvasPropsEqual\)/);

  const implementationStart = worldCanvasSource.indexOf("function WorldCanvasImpl");
  const implementationEnd = worldCanvasSource.indexOf("export const WorldCanvas");
  assert.ok(implementationStart > 0);
  assert.ok(implementationEnd > implementationStart);
  assert.doesNotMatch(
    worldCanvasSource.slice(implementationStart, implementationEnd),
    /useSyncExternalStore/,
  );
});

test("scene loading manager records failed URLs and keeps errored loads degraded", () => {
  beginSceneLoading();
  const notifications: Array<ReturnType<typeof getSceneLoadingSnapshot>> = [];
  const unsubscribe = subscribeSceneLoading(() => {
    notifications.push(getSceneLoadingSnapshot());
  });

  sceneLoadingManager.onStart?.("/asset.glb", 0, 2);
  sceneLoadingManager.onProgress?.("/texture.webp", 1, 2);
  sceneLoadingManager.onError?.("/asset.glb");
  sceneLoadingManager.onLoad?.();
  unsubscribe();

  const snapshot = getSceneLoadingSnapshot();
  assert.equal(snapshot.loaded, 2);
  assert.equal(snapshot.total, 2);
  assert.equal(snapshot.progress, 100);
  assert.equal(snapshot.errors, 1);
  assert.equal(snapshot.status, "degraded");
  assert.deepEqual(snapshot.failedUrls, ["/asset.glb"]);
  assert.equal(snapshot.lastError, "/asset.glb");
  assert.equal(notifications.length, 4);
});

test("scene GLTF loader marks parse failures as failed instead of successful", async () => {
  beginSceneLoading();
  const loader = new SceneGltfLoader();
  await new Promise<void>((resolve) => {
    loader.load("data:application/json,{bad", () => {
      assert.fail("malformed GLTF should not load successfully");
    }, undefined, () => {
      resolve();
    });
  });

  const snapshot = getSceneLoadingSnapshot();
  assert.equal(snapshot.status, "failed");
  assert.equal(snapshot.errors, 1);
  assert.deepEqual(snapshot.failedUrls, ["data:application/json,{bad"]);
});
