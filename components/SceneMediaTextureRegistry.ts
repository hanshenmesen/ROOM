type DisposableTexture = {
  dispose: () => void;
};

type ClearTextureCache = (cacheKey: string) => void;

type TextureRegistryEntry = {
  clearCache: ClearTextureCache;
  references: number;
  releaseTimer?: ReturnType<typeof setTimeout>;
  texture: DisposableTexture;
};

const mediaTextures = new Map<string, TextureRegistryEntry>();
export const SCENE_MEDIA_TEXTURE_RELEASE_DELAY_MS = 3_000;

function cancelRelease(entry: TextureRegistryEntry) {
  if (!entry.releaseTimer) return;
  clearTimeout(entry.releaseTimer);
  entry.releaseTimer = undefined;
}

export function retainSceneMediaTexture(
  cacheKey: string,
  texture: DisposableTexture,
  clearCache: ClearTextureCache,
) {
  let entry = mediaTextures.get(cacheKey);
  if (entry) {
    cancelRelease(entry);
    entry.clearCache = clearCache;
    entry.texture = texture;
    entry.references += 1;
  } else {
    entry = {
      clearCache,
      references: 1,
      texture,
    };
    mediaTextures.set(cacheKey, entry);
  }

  let released = false;
  return () => {
    if (released) return;
    released = true;

    const current = mediaTextures.get(cacheKey);
    if (!current) return;
    current.references = Math.max(0, current.references - 1);
    if (current.references > 0) return;

    cancelRelease(current);
    const releaseTimer = setTimeout(() => {
      const latest = mediaTextures.get(cacheKey);
      if (!latest || latest.references > 0 || latest.releaseTimer !== releaseTimer) return;

      mediaTextures.delete(cacheKey);
      latest.texture.dispose();
      latest.clearCache(cacheKey);
    }, SCENE_MEDIA_TEXTURE_RELEASE_DELAY_MS);
    current.releaseTimer = releaseTimer;
  };
}

export function getSceneMediaTextureRegistrySize() {
  return mediaTextures.size;
}
