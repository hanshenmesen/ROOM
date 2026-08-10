import { useLoader } from "@react-three/fiber";
import { SceneGltfLoader } from "./SceneAssetLoaders";

const MUSEUM_URL = "/vendor/mardou/MardouMuseumResult.glb";

export function preloadMardouMuseum() {
  useLoader.preload(SceneGltfLoader, MUSEUM_URL);
}
