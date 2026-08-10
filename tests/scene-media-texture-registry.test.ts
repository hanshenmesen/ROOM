import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import {
  getSceneMediaTextureRegistrySize,
  retainSceneMediaTexture,
  SCENE_MEDIA_TEXTURE_RELEASE_DELAY_MS,
} from "../components/SceneMediaTextureRegistry.ts";

function createTrackedTexture() {
  return {
    disposeCalls: 0,
    dispose() {
      this.disposeCalls += 1;
    },
  };
}

function releaseTimer(context: TestContext) {
  context.mock.timers.tick(SCENE_MEDIA_TEXTURE_RELEASE_DELAY_MS);
}

test("scene media texture registry keeps shared URL references alive", (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const texture = createTrackedTexture();
  const cleared: string[] = [];
  const releasePanel = retainSceneMediaTexture("/api/media?url=avatar", texture, (cacheKey) => {
    cleared.push(cacheKey);
  });
  const releaseHost = retainSceneMediaTexture("/api/media?url=avatar", texture, (cacheKey) => {
    cleared.push(cacheKey);
  });

  releasePanel();
  releaseTimer(context);

  assert.equal(texture.disposeCalls, 0);
  assert.deepEqual(cleared, []);
  assert.equal(getSceneMediaTextureRegistrySize(), 1);

  releaseHost();
  releaseTimer(context);

  assert.equal(texture.disposeCalls, 1);
  assert.deepEqual(cleared, ["/api/media?url=avatar"]);
  assert.equal(getSceneMediaTextureRegistrySize(), 0);
});

test("scene media texture registry disposes and clears after the final release", (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const texture = createTrackedTexture();
  const cleared: string[] = [];
  const release = retainSceneMediaTexture("/api/media?url=project", texture, (cacheKey) => {
    cleared.push(cacheKey);
  });

  release();
  releaseTimer(context);

  assert.equal(texture.disposeCalls, 1);
  assert.deepEqual(cleared, ["/api/media?url=project"]);
  assert.equal(getSceneMediaTextureRegistrySize(), 0);
});

test("scene media texture registry cancels delayed release when texture is retained again", (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const texture = createTrackedTexture();
  const cleared: string[] = [];
  const releaseFirst = retainSceneMediaTexture("/api/media?url=strict", texture, (cacheKey) => {
    cleared.push(cacheKey);
  });

  releaseFirst();
  const releaseSecond = retainSceneMediaTexture("/api/media?url=strict", texture, (cacheKey) => {
    cleared.push(cacheKey);
  });
  releaseTimer(context);

  assert.equal(texture.disposeCalls, 0);
  assert.deepEqual(cleared, []);
  assert.equal(getSceneMediaTextureRegistrySize(), 1);

  releaseSecond();
  releaseTimer(context);

  assert.equal(texture.disposeCalls, 1);
  assert.deepEqual(cleared, ["/api/media?url=strict"]);
  assert.equal(getSceneMediaTextureRegistrySize(), 0);
});

test("scene media texture registry release is idempotent", (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const texture = createTrackedTexture();
  const cleared: string[] = [];
  const release = retainSceneMediaTexture("/api/media?url=once", texture, (cacheKey) => {
    cleared.push(cacheKey);
  });

  release();
  release();
  releaseTimer(context);

  assert.equal(texture.disposeCalls, 1);
  assert.deepEqual(cleared, ["/api/media?url=once"]);
  assert.equal(getSceneMediaTextureRegistrySize(), 0);
});
