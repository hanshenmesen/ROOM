import assert from "node:assert/strict";
import test from "node:test";
import {
  getSceneMediaTextureRegistrySize,
  retainSceneMediaTexture,
} from "../components/SceneMediaTextureRegistry.ts";

function createTrackedTexture() {
  return {
    disposeCalls: 0,
    dispose() {
      this.disposeCalls += 1;
    },
  };
}

async function waitForReleaseTimer() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

test("scene media texture registry keeps shared URL references alive", async () => {
  const texture = createTrackedTexture();
  const cleared: string[] = [];
  const releasePanel = retainSceneMediaTexture("/api/media?url=avatar", texture, (cacheKey) => {
    cleared.push(cacheKey);
  });
  const releaseHost = retainSceneMediaTexture("/api/media?url=avatar", texture, (cacheKey) => {
    cleared.push(cacheKey);
  });

  releasePanel();
  await waitForReleaseTimer();

  assert.equal(texture.disposeCalls, 0);
  assert.deepEqual(cleared, []);
  assert.equal(getSceneMediaTextureRegistrySize(), 1);

  releaseHost();
  await waitForReleaseTimer();

  assert.equal(texture.disposeCalls, 1);
  assert.deepEqual(cleared, ["/api/media?url=avatar"]);
  assert.equal(getSceneMediaTextureRegistrySize(), 0);
});

test("scene media texture registry disposes and clears after the final release", async () => {
  const texture = createTrackedTexture();
  const cleared: string[] = [];
  const release = retainSceneMediaTexture("/api/media?url=project", texture, (cacheKey) => {
    cleared.push(cacheKey);
  });

  release();
  await waitForReleaseTimer();

  assert.equal(texture.disposeCalls, 1);
  assert.deepEqual(cleared, ["/api/media?url=project"]);
  assert.equal(getSceneMediaTextureRegistrySize(), 0);
});

test("scene media texture registry cancels same tick release when texture is retained again", async () => {
  const texture = createTrackedTexture();
  const cleared: string[] = [];
  const releaseFirst = retainSceneMediaTexture("/api/media?url=strict", texture, (cacheKey) => {
    cleared.push(cacheKey);
  });

  releaseFirst();
  const releaseSecond = retainSceneMediaTexture("/api/media?url=strict", texture, (cacheKey) => {
    cleared.push(cacheKey);
  });
  await waitForReleaseTimer();

  assert.equal(texture.disposeCalls, 0);
  assert.deepEqual(cleared, []);
  assert.equal(getSceneMediaTextureRegistrySize(), 1);

  releaseSecond();
  await waitForReleaseTimer();

  assert.equal(texture.disposeCalls, 1);
  assert.deepEqual(cleared, ["/api/media?url=strict"]);
  assert.equal(getSceneMediaTextureRegistrySize(), 0);
});

test("scene media texture registry release is idempotent", async () => {
  const texture = createTrackedTexture();
  const cleared: string[] = [];
  const release = retainSceneMediaTexture("/api/media?url=once", texture, (cacheKey) => {
    cleared.push(cacheKey);
  });

  release();
  release();
  await waitForReleaseTimer();

  assert.equal(texture.disposeCalls, 1);
  assert.deepEqual(cleared, ["/api/media?url=once"]);
  assert.equal(getSceneMediaTextureRegistrySize(), 0);
});
