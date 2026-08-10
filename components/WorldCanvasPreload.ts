import { useLoader } from "@react-three/fiber";
import { SceneGltfLoader } from "./SceneAssetLoaders";

const WORLD_PRELOAD_ASSETS = [
  "/vendor/mardou/skills-bookcase.glb",
  "/vendor/mardou/exhibit-pedestal-2.glb",
  "/vendor/mardou/blank-art-frame.glb",
  "/vendor/mardou/gramophone.glb",
  "/vendor/mardou/cartoon-character-statue.glb",
  "/vendor/mardou/fruit-collection.glb",
  "/vendor/mardou/drink-1.glb",
  "/vendor/mardou/private-info-column.glb",
  "/vendor/mardou/private-diary-column-round.glb",
  "/vendor/mardou/private-diary-book.glb",
] as const;

export function preloadWorldCanvasAssets() {
  WORLD_PRELOAD_ASSETS.forEach((url) => useLoader.preload(SceneGltfLoader, url));
}
