"use client";

import { useLoader } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  MARDOU_HIDDEN_MESH_NAMES,
  MARDOU_POSITION,
  MARDOU_SCALE,
} from "./MardouMuseumLayout";
import { SceneGltfLoader } from "./SceneAssetLoaders";

const MUSEUM_URL = "/vendor/mardou/MardouMuseumResult.glb";

export function preloadMardouMuseum() {
  useLoader.preload(SceneGltfLoader, MUSEUM_URL);
}

// Source coordinates around point 1 from 入场门.txt. This wall faces -X, so
// the opening is thin on X and spans Z. The baked wall triangles are removed
// before the independent animated door is inserted in WorldCanvas.
const AUTO_DOOR_CUTS = [
  { minX: -4.55, maxX: -4.05, minY: -16.35, maxY: -5.9, minZ: 6.35, maxZ: 14.65 },
  // Point 45 lies on the opposite X-facing wall at local z ~= 10.59. Reuse
  // the entrance opening dimensions so the matching double door fits cleanly.
  { minX: 7.5, maxX: 8.1, minY: -16.35, maxY: -5.9, minZ: 6.35, maxZ: 14.65 },
  { minX: -13.55, maxX: -4.85, minY: -16.35, maxY: -7.8, minZ: -51.48, maxZ: -50.92 },
] as const;

function cutAutoDoorOpening(mesh: THREE.Mesh) {
  const source = mesh.geometry;
  const index = source.getIndex();
  const position = source.getAttribute("position");
  if (!index || !position) return;

  const geometry = source.clone();
  const keptIndices: number[] = [];
  for (let offset = 0; offset < index.count; offset += 3) {
    const a = index.getX(offset);
    const b = index.getX(offset + 1);
    const c = index.getX(offset + 2);
    const triangleMinX = Math.min(position.getX(a), position.getX(b), position.getX(c));
    const triangleMaxX = Math.max(position.getX(a), position.getX(b), position.getX(c));
    const triangleMinY = Math.min(position.getY(a), position.getY(b), position.getY(c));
    const triangleMaxY = Math.max(position.getY(a), position.getY(b), position.getY(c));
    const triangleMinZ = Math.min(position.getZ(a), position.getZ(b), position.getZ(c));
    const triangleMaxZ = Math.max(position.getZ(a), position.getZ(b), position.getZ(c));
    const intersectsDoorway = AUTO_DOOR_CUTS.some((cut) => triangleMaxX >= cut.minX
      && triangleMinX <= cut.maxX
      && triangleMaxY >= cut.minY
      && triangleMinY <= cut.maxY
      && triangleMaxZ >= cut.minZ
      && triangleMinZ <= cut.maxZ);
    if (!intersectsDoorway) keptIndices.push(a, b, c);
  }
  geometry.setIndex(keptIndices);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  mesh.geometry = geometry;
}

function prepareMuseum(root: THREE.Object3D) {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    if (object.name === "Walls") cutAutoDoorOpening(object);
    if ((MARDOU_HIDDEN_MESH_NAMES as readonly string[]).includes(object.name)) object.visible = false;
    object.castShadow = true;
    object.receiveShadow = true;
    object.material = Array.isArray(object.material)
      ? object.material.map((material) => material.clone())
      : object.material.clone();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => {
      material.side = THREE.DoubleSide;
    });
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
  const museum = useMemo(() => prepareMuseum(gltf.scene.clone(true)), [gltf.scene]);

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
        } else {
          onBackgroundClick();
        }
      }}
      onPointerOut={() => {
        document.body.style.cursor = "default";
      }}
    >
      <primitive object={museum} />
    </group>
  );
}
