"use client";

import { useLoader } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MARDOU_POSITION, MARDOU_SCALE } from "./MardouMuseumLayout";
import { SceneGltfLoader } from "./SceneAssetLoaders";

const MUSEUM_URL = "/vendor/mardou/MardouMuseumResult.glb";

function prepareMuseum(root: THREE.Object3D) {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.castShadow = true;
    object.receiveShadow = true;
  });
  return root;
}

export function MardouMuseumScene({
  activeRoom,
  onEnter,
  onBackgroundClick,
}: {
  activeRoom: string;
  onEnter: () => void;
  onBackgroundClick: () => void;
}) {
  const gltf = useLoader(SceneGltfLoader, MUSEUM_URL) as GLTF;
  const museum = useMemo(() => prepareMuseum(gltf.scene), [gltf.scene]);

  useEffect(() => {
    museum.updateWorldMatrix(true, true);
  }, [museum]);

  return (
    <group
      name="mardou-museum"
      scale={MARDOU_SCALE}
      position={MARDOU_POSITION}
      onClick={(event) => {
        event.stopPropagation();
        if (activeRoom === "exterior") onEnter();
        else onBackgroundClick();
      }}
    >
      <primitive object={museum} />
    </group>
  );
}
