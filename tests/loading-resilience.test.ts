import assert from "node:assert/strict";
import test from "node:test";
import {
  SceneGltfLoader,
  sceneLoadingManager,
} from "../components/SceneAssetLoaders.ts";
import {
  beginSceneLoading,
  completeSceneAssetLoad,
  getSceneLoadingSnapshot,
  recordSceneAssetLoadError,
  startSceneAssetLoad,
} from "../components/SceneLoadingStore.ts";

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

test("scene loading manager reaches ready when all assets finish", () => {
  beginSceneLoading();

  sceneLoadingManager.onStart?.("/room.glb", 0, 2);
  sceneLoadingManager.onProgress?.("/wood.webp", 1, 2);
  sceneLoadingManager.onProgress?.("/lamp.webp", 2, 2);
  sceneLoadingManager.onLoad?.();

  const snapshot = getSceneLoadingSnapshot();
  assert.equal(snapshot.loaded, 2);
  assert.equal(snapshot.total, 2);
  assert.equal(snapshot.progress, 100);
  assert.equal(snapshot.status, "ready");
  assert.deepEqual(snapshot.failedUrls, []);
});

test("scene loading manager completes degraded when one media asset fails", () => {
  beginSceneLoading();

  sceneLoadingManager.onStart?.("/room.glb", 0, 3);
  sceneLoadingManager.onProgress?.("/room.glb", 1, 3);
  sceneLoadingManager.onError?.("/api/media?url=portrait");
  sceneLoadingManager.onProgress?.("/project.webp", 3, 3);
  sceneLoadingManager.onLoad?.();

  const snapshot = getSceneLoadingSnapshot();
  assert.equal(snapshot.loaded, 3);
  assert.equal(snapshot.total, 3);
  assert.equal(snapshot.progress, 100);
  assert.equal(snapshot.status, "degraded");
  assert.equal(snapshot.errors, 1);
  assert.deepEqual(snapshot.failedUrls, ["/api/media?url=portrait"]);
});

test("scene loading manager completes degraded when every media asset fails", () => {
  beginSceneLoading();

  sceneLoadingManager.onStart?.("/api/media?url=portrait", 0, 2);
  sceneLoadingManager.onError?.("/api/media?url=portrait");
  sceneLoadingManager.onError?.("/api/media?url=project");
  sceneLoadingManager.onProgress?.("/api/media?url=project", 2, 2);
  sceneLoadingManager.onLoad?.();

  const snapshot = getSceneLoadingSnapshot();
  assert.equal(snapshot.progress, 100);
  assert.equal(snapshot.status, "degraded");
  assert.equal(snapshot.errors, 2);
  assert.deepEqual(snapshot.failedUrls, ["/api/media?url=portrait", "/api/media?url=project"]);
});

test("scene loading manager counts repeated failures for the same media once", () => {
  beginSceneLoading();

  sceneLoadingManager.onStart?.("/api/media?url=portrait", 0, 1);
  sceneLoadingManager.onError?.("/api/media?url=portrait");
  sceneLoadingManager.onError?.("/api/media?url=portrait");
  sceneLoadingManager.onLoad?.();

  const snapshot = getSceneLoadingSnapshot();
  assert.equal(snapshot.errors, 1);
  assert.deepEqual(snapshot.failedUrls, ["/api/media?url=portrait"]);
  assert.equal(snapshot.lastError, "/api/media?url=portrait");
});

test("beginSceneLoading clears failed URLs before a cached second load starts", () => {
  beginSceneLoading();
  sceneLoadingManager.onStart?.("/api/media?url=first", 0, 1);
  sceneLoadingManager.onError?.("/api/media?url=first");
  sceneLoadingManager.onLoad?.();

  beginSceneLoading();
  sceneLoadingManager.onStart?.("/api/media?url=first", 0, 1);
  sceneLoadingManager.onProgress?.("/api/media?url=first", 1, 1);
  sceneLoadingManager.onLoad?.();

  const snapshot = getSceneLoadingSnapshot();
  assert.equal(snapshot.progress, 100);
  assert.equal(snapshot.status, "ready");
  assert.equal(snapshot.errors, 0);
  assert.deepEqual(snapshot.failedUrls, []);
});

test("cached scene load can become ready even when no progress events fire", () => {
  beginSceneLoading();

  sceneLoadingManager.onLoad?.();

  const snapshot = getSceneLoadingSnapshot();
  assert.equal(snapshot.loaded, 0);
  assert.equal(snapshot.total, 0);
  assert.equal(snapshot.progress, 100);
  assert.equal(snapshot.status, "ready");
});

test("late callbacks from an old world do not change the active loading snapshot", () => {
  beginSceneLoading();
  const oldWorldAsset = startSceneAssetLoad("/world-a-project.webp");

  beginSceneLoading();
  const activeWorldAsset = startSceneAssetLoad("/world-b-project.webp");
  recordSceneAssetLoadError(oldWorldAsset, "degraded");
  completeSceneAssetLoad(oldWorldAsset);

  assert.deepEqual(getSceneLoadingSnapshot(), {
    loaded: 0,
    total: 1,
    progress: 0,
    errors: 0,
    status: "loading",
    failedUrls: [],
  });

  completeSceneAssetLoad(activeWorldAsset);
  assert.deepEqual(getSceneLoadingSnapshot(), {
    loaded: 1,
    total: 1,
    progress: 100,
    errors: 0,
    status: "ready",
    failedUrls: [],
  });
});

test("same URL concurrent loads remain correct when the current world finishes first", () => {
  beginSceneLoading();
  const oldWorldAsset = startSceneAssetLoad("/shared-texture.webp");

  beginSceneLoading();
  const activeWorldAsset = startSceneAssetLoad("/shared-texture.webp");
  recordSceneAssetLoadError(activeWorldAsset, "degraded", new Error("current request failed"));
  completeSceneAssetLoad(activeWorldAsset);

  const currentSnapshot = getSceneLoadingSnapshot();
  assert.equal(currentSnapshot.loaded, 1);
  assert.equal(currentSnapshot.total, 1);
  assert.equal(currentSnapshot.progress, 100);
  assert.equal(currentSnapshot.status, "degraded");
  assert.deepEqual(currentSnapshot.failedUrls, ["/shared-texture.webp"]);

  completeSceneAssetLoad(oldWorldAsset);
  const snapshot = getSceneLoadingSnapshot();
  assert.equal(snapshot.loaded, 1);
  assert.equal(snapshot.total, 1);
  assert.equal(snapshot.progress, 100);
  assert.equal(snapshot.status, "degraded");
  assert.deepEqual(snapshot.failedUrls, ["/shared-texture.webp"]);
});

test("scene GLTF parse failures mark the load failed instead of leaving it loading", async () => {
  beginSceneLoading();
  const loader = new SceneGltfLoader();
  let errorCallbackCalled = false;

  await new Promise<void>((resolve) => {
    loader.load("data:application/json,{bad", () => {
      assert.fail("malformed GLTF should not load successfully");
    }, undefined, () => {
      errorCallbackCalled = true;
      resolve();
    });
  });

  const snapshot = getSceneLoadingSnapshot();
  assert.equal(errorCallbackCalled, true);
  assert.equal(snapshot.status, "failed");
  assert.equal(snapshot.errors, 1);
  assert.deepEqual(snapshot.failedUrls, ["data:application/json,{bad"]);
});
