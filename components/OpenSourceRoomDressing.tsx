"use client";

/* eslint-disable react-hooks/immutability -- Cloned Three.js objects are normalized and animated in place. */

import { useLoader, useThree } from "@react-three/fiber";
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

const showroomObjects: ObjectPlacement[] = [
  { name: "shelve", position: [-8.6, 0, 11.1], size: [2.1, 3.1, 1.05], rotation: [0, Math.PI / 2, 0], instance: "showroom-open-archive" },
  { name: "book2", position: [-8.3, 0.82, 10.66], size: [0.42, 0.7, 0.44], rotation: [0, Math.PI / 2, 0.06], instance: "showroom-book-1" },
  { name: "book5", position: [-8.3, 1.52, 11.08], size: [0.42, 0.72, 0.44], rotation: [0, Math.PI / 2, -0.05], instance: "showroom-book-2" },
  { name: "book6", position: [-8.3, 2.18, 11.48], size: [0.44, 0.74, 0.44], rotation: [0, Math.PI / 2, 0.04], instance: "showroom-book-3" },
  { name: "radio", position: [-8.28, 2.34, 10.78], size: [0.78, 0.6, 0.5], rotation: [0, Math.PI / 2, 0], instance: "showroom-audio-story" },
  { name: "owl", position: [-8.28, 2.28, 11.54], size: [0.68, 0.76, 0.64], rotation: [0, Math.PI / 2, 0], instance: "showroom-observer" },
  { name: "globe", position: [8.5, 0, 11.1], size: [1.45, 1.95, 1.45], instance: "showroom-world-view" },
];

const bedroomObjects: ObjectPlacement[] = [
  { name: "book", position: [-1.08, 0.88, 0.86], size: [0.52, 0.1, 0.72], rotation: [0, Math.PI / 2 - 0.18, 0], instance: "bedroom-archive-book" },
  { name: "desk lamp", position: [-1.08, 0.82, -0.88], size: [0.62, 0.84, 0.62], rotation: [0, Math.PI / 2, 0], instance: "bedroom-diary-light" },
];

const brunoBenchObjects: ObjectPlacement[] = [
  { name: "benchPhysicalDynamic", position: [-9.55, 0, 9.45], size: [2.15, 1, 1], rotation: [0, Math.PI / 2, 0], instance: "visitor-bench" },
];

const brunoLanternObjects: ObjectPlacement[] = [
  { name: "lantern", position: [-7.45, 0, 2.3], size: [0.44, 1.08, 0.44], instance: "project-lantern-left" },
  { name: "lantern", position: [7.45, 0, 2.3], size: [0.44, 1.08, 0.44], instance: "project-lantern-right" },
  { name: "lantern", position: [-10, 0, 8.7], size: [0.4, 0.98, 0.4], instance: "guestbook-lantern" },
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
  const placements = room.kind === "lobby" ? showroomObjects : bedroomObjects;
  const model = useMemo(() => composeObjectSet(gltf.scene, placements), [gltf.scene, placements]);

  return (
    <group position={room.center}>
      <primitive object={model} />
    </group>
  );
}

function BrunoObjectSet({ room }: { room: RoomPlan }) {
  const benchGltf = useLoader(GLTFLoader, "/vendor/bruno/benches.glb") as GLTF;
  const lanternGltf = useLoader(GLTFLoader, "/vendor/bruno/lanterns.glb") as GLTF;
  const bench = useMemo(() => composeObjectSet(benchGltf.scene, brunoBenchObjects), [benchGltf.scene]);
  const lanterns = useMemo(() => composeObjectSet(lanternGltf.scene, brunoLanternObjects), [lanternGltf.scene]);

  return (
    <group position={room.center}>
      <primitive object={bench} />
      <primitive object={lanterns} />
    </group>
  );
}

export function OpenSourceRoomDressing({ room }: { room: RoomPlan }) {
  return (
    <>
      <MaximeObjectSet room={room} />
      {room.kind === "lobby" ? <BrunoObjectSet room={room} /> : null}
    </>
  );
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
