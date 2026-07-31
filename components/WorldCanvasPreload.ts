import { useLoader } from "@react-three/fiber";
import { SceneGltfLoader } from "./SceneAssetLoaders";

const WORLD_PRELOAD_ASSETS = [
  "/vendor/mardou/skills-bookcase.glb",
  "/vendor/mardou/exhibit-pedestal-2.glb",
  "/vendor/mardou/blank-art-frame.glb",
  "/vendor/mardou/gramophone.glb",
] as const;

export function preloadWorldCanvasAssets() {
  WORLD_PRELOAD_ASSETS.forEach((url) => useLoader.preload(SceneGltfLoader, url));
}
