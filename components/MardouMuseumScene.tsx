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
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => {
      material.side = THREE.DoubleSide;
    });
  });
  return root;
}

function isStairwayPoint(point: THREE.Vector3) {
  return point.x >= 3.5
    && point.x <= 8.5
    && point.y >= 0.3
    && point.y <= 5.6
    && point.z >= -18.5
    && point.z <= -11;
}

export function MardouMuseumScene({
  activeRoom,
  onEnter,
  onGoUpstairs,
  onBackgroundClick,
}: {
  activeRoom: string;
  onEnter: () => void;
  onGoUpstairs: () => void;
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
        if (activeRoom === "exterior") {
          event.stopPropagation();
          onEnter();
        } else if (activeRoom === "room-lobby" && isStairwayPoint(event.point)) {
          event.stopPropagation();
          onGoUpstairs();
        } else {
          onBackgroundClick();
        }
      }}
      onPointerMove={(event) => {
        document.body.style.cursor = activeRoom === "room-lobby" && isStairwayPoint(event.point)
          ? "pointer"
          : "default";
      }}
      onPointerOut={() => {
        document.body.style.cursor = "default";
      }}
    >
      <primitive object={museum} />
    </group>
  );
}
