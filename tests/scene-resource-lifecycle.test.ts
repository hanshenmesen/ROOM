import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import {
  SceneGltfLoader,
  SceneTextureLoader,
  sceneLoadingManager,
} from "../components/SceneAssetLoaders.ts";
import {
  beginSceneLoading,
  getSceneLoadingSnapshot,
  subscribeSceneLoading,
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

test("scene loading transitions through first load and cached second load without stale errors", () => {
  beginSceneLoading();
  sceneLoadingManager.onStart?.("/first.webp", 0, 1);
  sceneLoadingManager.onProgress?.("/first.webp", 1, 1);
  sceneLoadingManager.onLoad?.();

  assert.deepEqual(getSceneLoadingSnapshot(), {
    loaded: 1,
    total: 1,
    progress: 100,
    errors: 0,
    status: "ready",
    failedUrls: [],
  });

  beginSceneLoading();
  sceneLoadingManager.onStart?.("/first.webp", 0, 1);
  sceneLoadingManager.onProgress?.("/first.webp", 1, 1);
  sceneLoadingManager.onLoad?.();

  assert.deepEqual(getSceneLoadingSnapshot(), {
    loaded: 1,
    total: 1,
    progress: 100,
    errors: 0,
    status: "ready",
    failedUrls: [],
  });
});

test("scene loading subscriptions can unsubscribe and duplicate subscriptions do not multiply listeners", () => {
  beginSceneLoading();
  let calls = 0;
  const listener = () => {
    calls += 1;
  };

  const unsubscribeA = subscribeSceneLoading(listener);
  const unsubscribeB = subscribeSceneLoading(listener);
  sceneLoadingManager.onStart?.("/asset.webp", 0, 1);
  assert.equal(calls, 1);

  unsubscribeA();
  sceneLoadingManager.onProgress?.("/asset.webp", 1, 1);
  assert.equal(calls, 1);

  unsubscribeB();
  sceneLoadingManager.onLoad?.();
  assert.equal(calls, 1);
});

test("scene loading records repeated errors once and keeps snapshot stable for identical repeats", () => {
  beginSceneLoading();
  sceneLoadingManager.onStart?.("/broken.webp", 0, 1);
  sceneLoadingManager.onError?.("/broken.webp");
  const firstError = getSceneLoadingSnapshot();

  sceneLoadingManager.onError?.("/broken.webp");
  const repeatedError = getSceneLoadingSnapshot();

  assert.equal(repeatedError, firstError);
  assert.equal(repeatedError.errors, 1);
  assert.deepEqual(repeatedError.failedUrls, ["/broken.webp"]);
  assert.equal(repeatedError.status, "degraded");
});

test("beginSceneLoading clears failed state so errors do not leak across worlds", () => {
  beginSceneLoading();
  sceneLoadingManager.onStart?.("/world-a.glb", 0, 1);
  sceneLoadingManager.onError?.("/world-a.glb");
  assert.equal(getSceneLoadingSnapshot().status, "degraded");

  beginSceneLoading();
  const reset = getSceneLoadingSnapshot();
  assert.deepEqual(reset, {
    loaded: 0,
    total: 0,
    progress: 0,
    errors: 0,
    status: "idle",
    failedUrls: [],
  });

  sceneLoadingManager.onStart?.("/world-b.webp", 0, 1);
  assert.equal(getSceneLoadingSnapshot().status, "loading");
  assert.equal(getSceneLoadingSnapshot().errors, 0);
});

test("scene texture loader supplies a DataTexture fallback when image loading fails", async () => {
  beginSceneLoading();
  const originalLoad = THREE.TextureLoader.prototype.load;
  THREE.TextureLoader.prototype.load = function load(
    _url,
    _onLoad,
    _onProgress,
    onError,
  ) {
    onError?.(new Error("missing texture"));
    return new THREE.Texture();
  };

  try {
    const fallback = await new Promise<THREE.Texture>((resolve) => {
      new SceneTextureLoader().load("/missing.webp", resolve);
    });
    assert.ok(fallback instanceof THREE.DataTexture);
    assert.equal(fallback.image.width, 2);
    assert.equal(fallback.image.height, 2);
    assert.equal(fallback.colorSpace, THREE.SRGBColorSpace);
    assert.equal(fallback.version, 1);
  } finally {
    THREE.TextureLoader.prototype.load = originalLoad;
  }
});

test("scene GLTF loader failure does not accumulate duplicate manager and loader errors", async () => {
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
