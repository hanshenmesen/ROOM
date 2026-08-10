import * as THREE from "three";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import {
  completeSceneAssetLoad,
  getSceneLoadingGeneration,
  markSceneLoadingComplete,
  markSceneLoadingProgress,
  markSceneLoadingStarted,
  recordSceneAssetLoadError,
  recordSceneLoadError,
  startSceneAssetLoad,
} from "./SceneLoadingStore.ts";

export {
  beginSceneLoading,
  getSceneLoadingSnapshot,
  subscribeSceneLoading,
  type SceneLoadingSnapshot,
} from "./SceneLoadingStore.ts";

const ENVIRONMENT_PATH = "/vendor/joan/environment/";
const ENVIRONMENT_FACES = ["nx.jpg", "ny.jpg", "nz.jpg", "px.jpg", "py.jpg", "pz.jpg"];
const DRACO_PATH = "/vendor/three/draco/";

export const sceneLoadingManager = new THREE.LoadingManager();
const assetLoadingManager = new THREE.LoadingManager();

sceneLoadingManager.onStart = (_url, loaded, total) => {
  markSceneLoadingStarted(getSceneLoadingGeneration(), loaded, total);
};

sceneLoadingManager.onProgress = (_url, loaded, total) => {
  markSceneLoadingProgress(getSceneLoadingGeneration(), loaded, total);
};

sceneLoadingManager.onLoad = () => {
  markSceneLoadingComplete(getSceneLoadingGeneration());
};

sceneLoadingManager.onError = (url) => {
  recordSceneLoadError(getSceneLoadingGeneration(), url, "degraded");
};

export class SceneTextureLoader extends THREE.TextureLoader {
  constructor() {
    super(assetLoadingManager);
  }

  load(
    url: string,
    onLoad?: (texture: THREE.Texture<HTMLImageElement>) => void,
    onProgress?: (event: ProgressEvent) => void,
  ) {
    const token = startSceneAssetLoad(url);
    return super.load(url, (texture) => {
      completeSceneAssetLoad(token);
      onLoad?.(texture);
    }, onProgress, (error) => {
      recordSceneAssetLoadError(token, "degraded", error);
      const pixels = new Uint8Array([
        244, 234, 219, 255,
        218, 198, 180, 255,
        218, 198, 180, 255,
        244, 234, 219, 255,
      ]);
      const fallback = new THREE.DataTexture(pixels, 2, 2, THREE.RGBAFormat);
      fallback.colorSpace = THREE.SRGBColorSpace;
      fallback.needsUpdate = true;
      completeSceneAssetLoad(token);
      onLoad?.(fallback as unknown as THREE.Texture<HTMLImageElement>);
    });
  }
}

export class SceneGltfLoader extends GLTFLoader {
  constructor() {
    super(assetLoadingManager);
    this.setMeshoptDecoder(MeshoptDecoder);
  }

  load(
    url: string,
    onLoad: (gltf: GLTF) => void,
    onProgress?: (event: ProgressEvent) => void,
    onError?: (event: unknown) => void,
  ) {
    const token = startSceneAssetLoad(url);
    return super.load(url, (gltf) => {
      completeSceneAssetLoad(token);
      onLoad(gltf);
    }, onProgress, (event) => {
      recordSceneAssetLoadError(token, "failed", event);
      completeSceneAssetLoad(token);
      onError?.(event);
    });
  }
}

export function configureSceneGltfLoader(loader: SceneGltfLoader) {
  const draco = new DRACOLoader(assetLoadingManager);
  draco.setDecoderPath(DRACO_PATH);
  loader.setDRACOLoader(draco);
}

export class SceneEnvironmentLoader extends THREE.Loader<THREE.CubeTexture> {
  constructor() {
    super(assetLoadingManager);
  }

  load(
    _url: string,
    onLoad: (texture: THREE.CubeTexture) => void,
    _onProgress?: (event: ProgressEvent) => void,
    onError?: (error: unknown) => void,
  ) {
    const token = startSceneAssetLoad(_url);
    new THREE.CubeTextureLoader(this.manager)
      .setPath(ENVIRONMENT_PATH)
      .load(ENVIRONMENT_FACES, (texture) => {
        completeSceneAssetLoad(token);
        onLoad(texture);
      }, undefined, (error) => {
        recordSceneAssetLoadError(token, "failed", error);
        completeSceneAssetLoad(token);
        onError?.(error);
      });
  }
}
