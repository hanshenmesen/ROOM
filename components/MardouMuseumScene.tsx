"use client";

import { useLoader } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  MARDOU_PICTURE_SLOTS,
  MARDOU_POSITION,
  MARDOU_SCALE,
  type MardouPictureSlotName,
} from "./MardouMuseumLayout";
import { SceneGltfLoader, SceneTextureLoader } from "./SceneAssetLoaders";

const MUSEUM_URL = "/vendor/mardou/MardouMuseumResult.glb";

// Local coordinates inside the Walls mesh. The GLB authors baked both door
// leaves into that mesh, so these triangles are removed before independent
// animated leaves are inserted in WorldCanvas.
const AUTO_DOOR_CUT = {
  minX: -13.5,
  maxX: -4.9,
  minY: -16.35,
  maxY: -7.9,
  minZ: -51.5,
  maxZ: -51.1,
} as const;

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
    const centerX = (position.getX(a) + position.getX(b) + position.getX(c)) / 3;
    const centerY = (position.getY(a) + position.getY(b) + position.getY(c)) / 3;
    const centerZ = (position.getZ(a) + position.getZ(b) + position.getZ(c)) / 3;
    const insideDoorway = centerX >= AUTO_DOOR_CUT.minX
      && centerX <= AUTO_DOOR_CUT.maxX
      && centerY >= AUTO_DOOR_CUT.minY
      && centerY <= AUTO_DOOR_CUT.maxY
      && centerZ >= AUTO_DOOR_CUT.minZ
      && centerZ <= AUTO_DOOR_CUT.maxZ;
    if (!insideDoorway) keptIndices.push(a, b, c);
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
    const pictureSlot = MARDOU_PICTURE_SLOTS.find((slot) => slot.name === object.name);
    if (pictureSlot) object.visible = pictureSlot.defaultVisible;
    object.castShadow = true;
    object.receiveShadow = true;
    object.material = Array.isArray(object.material)
      ? object.material.map((material) => material.clone())
      : object.material.clone();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    object.userData.originalPictureMaps = materials.map((material) => (
      (material as THREE.MeshStandardMaterial).map || null
    ));
    materials.forEach((material) => {
      material.side = THREE.DoubleSide;
    });
  });
  return root;
}

function museumTextureUrl(url: string) {
  return /^https?:\/\//i.test(url)
    ? `/api/media?url=${encodeURIComponent(url)}`
    : url;
}

export function MardouMuseumScene({
  activeRoom,
  onEnter,
  onBackgroundClick,
  pictureOverrides = {},
}: {
  activeRoom: string;
  onEnter: () => void;
  onBackgroundClick: () => void;
  pictureOverrides?: Partial<Record<MardouPictureSlotName, string>>;
}) {
  const gltf = useLoader(SceneGltfLoader, MUSEUM_URL) as GLTF;
  const museum = useMemo(() => prepareMuseum(gltf.scene.clone(true)), [gltf.scene]);

  useEffect(() => {
    museum.updateWorldMatrix(true, true);
  }, [museum]);

  useEffect(() => {
    let cancelled = false;
    const loadedTextures: THREE.Texture[] = [];
    const touchedMeshes: THREE.Mesh[] = [];

    MARDOU_PICTURE_SLOTS.filter((slot) => slot.replaceable).forEach((slot) => {
      const url = pictureOverrides[slot.name];
      const object = museum.getObjectByName(slot.name);
      if (!url || !(object instanceof THREE.Mesh)) return;
      touchedMeshes.push(object);
      new SceneTextureLoader().load(
        museumTextureUrl(url),
        (texture) => {
          if (cancelled) {
            texture.dispose();
            return;
          }
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.flipY = false;
          loadedTextures.push(texture);
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => {
            const mappedMaterial = material as THREE.MeshStandardMaterial;
            mappedMaterial.map = texture;
            mappedMaterial.needsUpdate = true;
          });
        },
      );
    });

    return () => {
      cancelled = true;
      touchedMeshes.forEach((object) => {
        const originals = object.userData.originalPictureMaps as Array<THREE.Texture | null> | undefined;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material, index) => {
          const mappedMaterial = material as THREE.MeshStandardMaterial;
          mappedMaterial.map = originals?.[index] || null;
          mappedMaterial.needsUpdate = true;
        });
      });
      loadedTextures.forEach((texture) => texture.dispose());
    };
  }, [museum, pictureOverrides]);

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
