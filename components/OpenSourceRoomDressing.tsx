"use client";

/* eslint-disable react-hooks/immutability -- Cloned Three.js objects are normalized and animated in place. */

import { useFrame, useLoader, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { RoomPlan, Vec3 } from "@/lib/types";

const DRACO_PATH = "/vendor/three/draco/";

type ObjectPlacement = {
  name: string;
  position: Vec3;
  size: Vec3;
  rotation?: Vec3;
  instance?: string;
};

function configureGltfLoader(loader: GLTFLoader) {
  const draco = new DRACOLoader();
  draco.setDecoderPath(DRACO_PATH);
  loader.setDRACOLoader(draco);
}

const livingRoomObjects: ObjectPlacement[] = [
  { name: "floormat", position: [0, 0.015, -1.1], size: [6.4, 0.08, 4.2] },
  { name: "bed", position: [0, 0, -5.05], size: [4.7, 1.2, 2.15], rotation: [0, Math.PI, 0] },
  { name: "chair", position: [-2.25, 0, -1.15], size: [1.75, 2.05, 1.75], rotation: [0, 0.52, 0] },
  { name: "night table", position: [1.05, 0, -1.55], size: [1.65, 0.78, 1.35], instance: "coffee-table" },
  { name: "cofee-cup", position: [1.05, 0.78, -1.55], size: [0.42, 0.52, 0.42] },
  { name: "shelve", position: [-3.85, 0, -4.75], size: [2.25, 3.15, 1.05] },
  { name: "book", position: [-4.22, 0.82, -4.22], size: [0.38, 0.72, 0.45], rotation: [0, 0, -0.06], instance: "living-book-1" },
  { name: "book2", position: [-3.76, 1.42, -4.22], size: [0.42, 0.75, 0.46], rotation: [0, 0, 0.08], instance: "living-book-2" },
  { name: "book5", position: [-3.35, 2.05, -4.22], size: [0.44, 0.7, 0.44], rotation: [0, 0, -0.08], instance: "living-book-3" },
  { name: "owl", position: [-4.05, 2.34, -4.18], size: [0.7, 0.78, 0.62] },
  { name: "lamp", position: [3.65, 0, -4.65], size: [1.35, 2.25, 1.35] },
  { name: "night table", position: [2.65, 0, -4.45], size: [1.35, 1.08, 1.3], instance: "side-table" },
  { name: "flower", position: [2.65, 1.08, -4.45], size: [0.8, 1.02, 0.8] },
  { name: "radio", position: [2.55, 1.08, -3.75], size: [0.95, 0.72, 0.52] },
  { name: "globe", position: [3.65, 0, -1.9], size: [1.25, 1.7, 1.25] },
];

const portfolioRoomObjects: ObjectPlacement[] = [
  { name: "table", position: [-0.45, 0, -2.35], size: [5.65, 1.12, 2.15] },
  { name: "screen", position: [-0.7, 1.12, -2.7], size: [2.25, 1.45, 0.34] },
  { name: "keyboard", position: [-0.55, 1.12, -1.68], size: [1.85, 0.24, 0.72] },
  { name: "mousepad", position: [1.15, 1.12, -1.75], size: [1.25, 0.1, 0.88] },
  { name: "mouse", position: [1.15, 1.22, -1.72], size: [0.42, 0.22, 0.56] },
  { name: "desk lamp", position: [-2.35, 1.12, -2.25], size: [1.05, 1.48, 1.05] },
  { name: "cofee-cup", position: [2.1, 1.12, -2.2], size: [0.46, 0.55, 0.46] },
  { name: "rubik cubes", position: [2.2, 1.12, -1.55], size: [0.86, 0.82, 0.82] },
  { name: "chair", position: [0.25, 0, 0.15], size: [1.85, 2.25, 1.85], rotation: [0, Math.PI, 0] },
  { name: "floormat", position: [0.35, 0.015, 0.2], size: [5.4, 0.08, 4] },
  { name: "shelve", position: [-5.15, 0, -4.65], size: [2.35, 3.35, 1.05] },
  { name: "book", position: [-5.58, 0.86, -4.1], size: [0.4, 0.72, 0.45], rotation: [0, 0, -0.08], instance: "portfolio-book-1" },
  { name: "book3", position: [-5.06, 1.52, -4.1], size: [0.42, 0.75, 0.44], rotation: [0, 0, 0.07], instance: "portfolio-book-2" },
  { name: "book6", position: [-4.58, 2.2, -4.1], size: [0.42, 0.72, 0.45], rotation: [0, 0, -0.06], instance: "portfolio-book-3" },
  { name: "radio", position: [-5.22, 2.5, -4.05], size: [0.9, 0.68, 0.52] },
  { name: "backpack", position: [5.05, 0, -2.65], size: [1.45, 2.05, 1.2] },
  { name: "helmet", position: [4.85, 0, -4.7], size: [1.35, 1.42, 1.35] },
  { name: "globe", position: [4.75, 1.1, -4.25], size: [1.25, 1.68, 1.25], instance: "portfolio-globe" },
  { name: "gopro", position: [3.75, 0.45, -4.55], size: [0.58, 0.56, 0.55] },
  { name: "paraglider", position: [4.75, 2.45, -5.1], size: [2.45, 1.4, 0.72], rotation: [0, -0.18, 0] },
];

function normalizeObject(source: THREE.Object3D, targetSize: Vec3) {
  const clone = source.clone(true);
  clone.position.set(0, 0, 0);
  clone.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  const content = new THREE.Group();
  content.add(clone);
  content.updateWorldMatrix(true, true);
  const bounds = new THREE.Box3().setFromObject(content);
  if (bounds.isEmpty()) return content;
  const size = bounds.getSize(new THREE.Vector3());
  const scale = Math.min(
    targetSize[0] / Math.max(size.x, 0.001),
    targetSize[1] / Math.max(size.y, 0.001),
    targetSize[2] / Math.max(size.z, 0.001),
  );
  const center = bounds.getCenter(new THREE.Vector3());
  content.scale.setScalar(scale);
  content.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
  content.updateWorldMatrix(true, true);
  return content;
}

function composeObjectSet(scene: THREE.Group, placements: ObjectPlacement[]) {
  const roomSet = new THREE.Group();
  placements.forEach((placement) => {
    const source = scene.getObjectByName(placement.name);
    if (!source) return;
    const object = new THREE.Group();
    object.name = `asset:${placement.instance || placement.name}`;
    object.position.set(...placement.position);
    object.rotation.set(...(placement.rotation || [0, 0, 0]));
    object.add(normalizeObject(source, placement.size));
    roomSet.add(object);
  });
  return roomSet;
}

export function PortfolioEnvironment() {
  const { scene } = useThree();
  useEffect(() => {
    const previous = scene.environment;
    const texture = new THREE.CubeTextureLoader()
      .setPath("/vendor/joan/environment/")
      .load(["nx.jpg", "ny.jpg", "nz.jpg", "px.jpg", "py.jpg", "pz.jpg"]);
    texture.colorSpace = THREE.SRGBColorSpace;
    scene.environment = texture;
    scene.environmentIntensity = 0.62;
    return () => {
      scene.environment = previous;
      texture.dispose();
    };
  }, [scene]);
  return null;
}

export function RendererLook() {
  const { gl } = useThree();
  useEffect(() => {
    gl.outputColorSpace = THREE.SRGBColorSpace;
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = 1.12;
    gl.shadowMap.type = THREE.PCFSoftShadowMap;
  }, [gl]);
  return null;
}

function MaximeObjectSet({ room }: { room: RoomPlan }) {
  const gltf = useLoader(GLTFLoader, "/vendor/maxime/scene-final.gltf", configureGltfLoader) as GLTF;
  const placements = room.kind === "lobby" ? livingRoomObjects : portfolioRoomObjects;
  const model = useMemo(() => composeObjectSet(gltf.scene, placements), [gltf.scene, placements]);

  useFrame((state) => {
    const elapsed = state.clock.elapsedTime;
    const globe = model.getObjectByName(room.kind === "lobby" ? "asset:globe" : "asset:portfolio-globe");
    if (globe) globe.rotation.y = elapsed * 0.16;
  });

  return (
    <group position={room.center}>
      <primitive object={model} />
    </group>
  );
}

export function OpenSourceRoomDressing({ room }: { room: RoomPlan }) {
  return <MaximeObjectSet room={room} />;
}

export function ModelLoadingStage({ room }: { room: RoomPlan }) {
  const [x, , z] = room.center;
  return (
    <group position={[x, 1.35, z]}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.46, 0.045, 10, 48]} />
        <meshBasicMaterial color="#65d7c3" toneMapped={false} />
      </mesh>
      <pointLight intensity={7} distance={4} color="#65d7c3" />
    </group>
  );
}
