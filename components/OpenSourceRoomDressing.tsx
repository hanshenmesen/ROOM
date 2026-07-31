"use client";

/* eslint-disable react-hooks/immutability -- Cloned Three.js objects are normalized and animated in place. */

import { useLoader, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { RoomPlan, Vec3 } from "@/lib/types";
import {
  configureSceneGltfLoader,
  SceneEnvironmentLoader,
  SceneGltfLoader,
} from "./SceneAssetLoaders";

type ObjectPlacement = {
  name: string;
  position: Vec3;
  size: Vec3;
  rotation?: Vec3;
  instance?: string;
  tint?: string;
  tintAmount?: number;
};

type ProceduralObjectKind = "plant" | "floor-lamp" | "book-stack" | "photo-frame" | "storage-basket";

const IMPORTED_MATERIAL_PRESET = {
  minRoughness: 0.32,
  maxRoughness: 0.94,
  envMapIntensity: 0.78,
  maxEmissiveIntensity: 0.25,
  maxMetalness: 0.82,
};

const missingNodeWarnings = new Set<string>();

type NormalizedResources = {
  materials: THREE.Material[];
  textures: THREE.Texture[];
  geometries: THREE.BufferGeometry[];
};

function cloneTexture(texture: THREE.Texture | null, resources: NormalizedResources): THREE.Texture | null {
  if (!texture) return null;
  const cloned = texture.clone();
  cloned.needsUpdate = true;
  resources.textures.push(cloned);
  return cloned;
}

function cloneMaterial(material: THREE.Material, resources: NormalizedResources) {
  const cloned = material.clone();
  resources.materials.push(cloned);

  if (cloned instanceof THREE.MeshStandardMaterial) {
    cloned.map = cloneTexture(cloned.map, resources);
    cloned.emissiveMap = cloneTexture(cloned.emissiveMap, resources);
    cloned.roughnessMap = cloneTexture(cloned.roughnessMap, resources);
    cloned.metalnessMap = cloneTexture(cloned.metalnessMap, resources);
    cloned.normalMap = cloneTexture(cloned.normalMap, resources);
    cloned.aoMap = cloneTexture(cloned.aoMap, resources);
    cloned.displacementMap = cloneTexture(cloned.displacementMap, resources);
    cloned.bumpMap = cloneTexture(cloned.bumpMap, resources);
    cloned.alphaMap = cloneTexture(cloned.alphaMap, resources);
  }

  if (cloned instanceof THREE.MeshPhysicalMaterial) {
    cloned.clearcoatMap = cloneTexture(cloned.clearcoatMap, resources);
    cloned.clearcoatNormalMap = cloneTexture(cloned.clearcoatNormalMap, resources);
    cloned.clearcoatRoughnessMap = cloneTexture(cloned.clearcoatRoughnessMap, resources);
    cloned.transmissionMap = cloneTexture(cloned.transmissionMap, resources);
    cloned.thicknessMap = cloneTexture(cloned.thicknessMap, resources);
  }

  cloned.needsUpdate = true;
  return cloned;
}

function disposeNormalizedObject(object: THREE.Object3D | null) {
  if (!object) return;
  object.traverse((child) => {
    const resources = child.userData.__normalizedResources as NormalizedResources | undefined;
    if (!resources) return;

    resources.textures.forEach((texture) => texture.dispose());
    resources.materials.forEach((material) => material.dispose());
    resources.geometries.forEach((geometry) => geometry.dispose());
    child.userData.__normalizedResources = undefined;
  });
}

const showroomObjects: ObjectPlacement[] = [
  { name: "shelve", position: [-8.6, 0, 11.1], size: [2.1, 3.1, 1.05], rotation: [0, Math.PI / 2, 0], instance: "showroom-open-archive" },
  { name: "book2", position: [-8.3, 0.82, 10.66], size: [0.42, 0.7, 0.44], rotation: [0, Math.PI / 2, 0.06], instance: "showroom-book-1" },
  { name: "book5", position: [-8.3, 1.52, 11.08], size: [0.42, 0.72, 0.44], rotation: [0, Math.PI / 2, -0.05], instance: "showroom-book-2" },
  { name: "book6", position: [-8.3, 2.18, 11.48], size: [0.44, 0.74, 0.44], rotation: [0, Math.PI / 2, 0.04], instance: "showroom-book-3" },
  { name: "radio", position: [-8.28, 2.34, 10.78], size: [0.78, 0.6, 0.5], rotation: [0, Math.PI / 2, 0], instance: "showroom-audio-story" },
  { name: "owl", position: [-8.28, 2.28, 11.54], size: [0.68, 0.76, 0.64], rotation: [0, Math.PI / 2, 0], instance: "showroom-observer" },
  { name: "globe", position: [5.4, 0, 11.15], size: [1.35, 1.85, 1.35], instance: "showroom-world-view" },
  { name: "table", position: [8, 0, 10.85], size: [3.1, 1, 1.55], rotation: [0, Math.PI, 0], instance: "showroom-media-table", tint: "#6a4c3f", tintAmount: 0.48 },
  { name: "screen", position: [8, 0.88, 10.62], size: [1.3, 0.94, 0.34], rotation: [0, Math.PI, 0], instance: "showroom-media-screen", tint: "#355c5d", tintAmount: 0.22 },
  { name: "keyboard", position: [7.78, 0.91, 11.26], size: [0.86, 0.12, 0.34], rotation: [0, Math.PI, 0], instance: "showroom-media-keyboard" },
  { name: "mouse", position: [8.48, 0.91, 11.25], size: [0.22, 0.12, 0.28], rotation: [0, Math.PI, 0], instance: "showroom-media-mouse" },
  { name: "chair", position: [8, 0, 12.25], size: [1.05, 1.45, 1.05], rotation: [0, Math.PI, 0], instance: "showroom-media-chair", tint: "#6b4e42", tintAmount: 0.44 },
  { name: "procedural:plant", position: [-10.15, 0, -12.3], size: [0.92, 1.5, 0.92], rotation: [0, 0.22, 0], instance: "showroom-back-left-plant" },
  { name: "procedural:plant", position: [10.1, 0, -12.2], size: [0.82, 1.28, 0.82], rotation: [0, -0.36, 0], instance: "showroom-back-right-plant" },
  { name: "procedural:floor-lamp", position: [-9.75, 0, -9.2], size: [0.72, 1.9, 0.72], rotation: [0, 0.15, 0], instance: "showroom-reading-floor-lamp" },
  { name: "procedural:storage-basket", position: [-9.25, 0, 6.85], size: [0.78, 0.58, 0.68], rotation: [0, -0.2, 0], instance: "showroom-visitor-throw-basket" },
  { name: "procedural:book-stack", position: [-9.35, 0.52, 6.92], size: [0.56, 0.22, 0.48], rotation: [0, 0.35, 0.02], instance: "showroom-visitor-books" },
  { name: "procedural:photo-frame", position: [7.2, 1.02, 10.22], size: [0.55, 0.56, 0.16], rotation: [0, Math.PI + 0.12, -0.04], instance: "showroom-desk-family-frame" },
  { name: "cofee-cup", position: [8.92, 0.96, 10.88], size: [0.28, 0.24, 0.28], rotation: [0, Math.PI, 0], instance: "showroom-desk-coffee", tint: "#d8c3a8", tintAmount: 0.28 },
  { name: "pens", position: [7.42, 0.98, 11.48], size: [0.34, 0.38, 0.28], rotation: [0, Math.PI, 0], instance: "showroom-desk-pens", tint: "#5d6f73", tintAmount: 0.32 },
  { name: "rubik cubes", position: [5.8, 0.32, 9.95], size: [0.46, 0.46, 0.46], rotation: [0, -0.45, 0], instance: "showroom-playful-cube" },
];

const bedroomObjects: ObjectPlacement[] = [
  { name: "book", position: [-0.92, 0.88, -1.05], size: [0.52, 0.1, 0.72], rotation: [0, -0.18, 0], instance: "bedroom-archive-book" },
  { name: "desk_lamp", position: [0.92, 0.82, -1.27], size: [0.62, 0.84, 0.62], instance: "bedroom-diary-light" },
  { name: "bed", position: [-3.55, 0, 3.2], size: [3.4, 1.42, 5.1], rotation: [0, Math.PI / 2, 0], instance: "bedroom-bed", tint: "#92796e", tintAmount: 0.6 },
  { name: "night table", position: [-5.65, 0, 3.2], size: [1.12, 0.86, 1], rotation: [0, Math.PI / 2, 0], instance: "bedroom-night-table", tint: "#6a4b3f", tintAmount: 0.58 },
  { name: "lamp", position: [-5.65, 0.84, 3.2], size: [0.52, 0.86, 0.52], instance: "bedroom-bedside-lamp", tint: "#d2ad73", tintAmount: 0.44 },
  { name: "bed-book", position: [-3.55, 1.02, 2.55], size: [0.72, 0.16, 0.92], rotation: [0, -0.32, 0.08], instance: "bedroom-reading-book" },
  { name: "chair", position: [0, 0, 0.05], size: [1.1, 1.45, 1.1], rotation: [0, Math.PI, 0], instance: "bedroom-diary-chair", tint: "#4f706b", tintAmount: 0.62 },
  { name: "backpack", position: [4.9, 0, -2.8], size: [0.92, 1.28, 0.72], rotation: [0, -0.38, 0], instance: "bedroom-travel-archive", tint: "#70574c", tintAmount: 0.5 },
  { name: "procedural:plant", position: [5.9, 0, 6.7], size: [0.74, 1.18, 0.74], rotation: [0, -0.45, 0], instance: "bedroom-window-plant" },
  { name: "procedural:floor-lamp", position: [-6.7, 0, 5.95], size: [0.62, 1.62, 0.62], rotation: [0, 0.36, 0], instance: "bedroom-bed-floor-lamp" },
  { name: "procedural:photo-frame", position: [-5.65, 0.92, 2.72], size: [0.42, 0.44, 0.14], rotation: [0, Math.PI / 2 - 0.2, -0.02], instance: "bedroom-nightstand-frame" },
  { name: "headphones", position: [0.38, 0.92, -1.28], size: [0.44, 0.24, 0.36], rotation: [0, -0.28, 0.04], instance: "bedroom-desk-headphones", tint: "#4b4a48", tintAmount: 0.35 },
  { name: "procedural:book-stack", position: [1.28, 0.9, -1.02], size: [0.48, 0.2, 0.42], rotation: [0, -0.32, 0], instance: "bedroom-desk-books" },
];

const exteriorObjects: ObjectPlacement[] = [
  { name: "floormat", position: [0, -0.84, 9.15], size: [2.25, 0.06, 1.18], instance: "villa-entry-mat" },
  { name: "flower", position: [-3.6, -0.78, 8.25], size: [0.8, 1.16, 0.8], instance: "villa-entry-flower-left" },
  { name: "flower", position: [3.6, -0.78, 8.25], size: [0.8, 1.16, 0.8], rotation: [0, 0.55, 0], instance: "villa-entry-flower-right" },
];

const brunoBenchObjects: ObjectPlacement[] = [
  { name: "benchPhysicalDynamic", position: [-9.55, 0, 9.45], size: [2.15, 1, 1], rotation: [0, Math.PI / 2, 0], instance: "visitor-bench" },
];

const brunoLanternObjects: ObjectPlacement[] = [
  { name: "lantern", position: [-7.45, 0, 2.3], size: [0.44, 1.08, 0.44], instance: "project-lantern-left" },
  { name: "lantern", position: [7.45, 0, 2.3], size: [0.44, 1.08, 0.44], instance: "project-lantern-right" },
  { name: "lantern", position: [-10, 0, 8.7], size: [0.4, 0.98, 0.4], instance: "guestbook-lantern" },
];

function buildDeskLampFallback(size: Vec3) {
  const [sizeX, sizeY, sizeZ] = size;
  const lampGroup = new THREE.Group();
  const width = Math.min(sizeX, sizeZ);
  const height = Math.max(sizeY, 0.4);
  const resources: NormalizedResources = { materials: [], textures: [], geometries: [] };

  const baseGeo = new THREE.CylinderGeometry(width * 0.32, width * 0.36, Math.max(height * 0.08, 0.04), 24);
  const poleGeo = new THREE.CylinderGeometry(width * 0.05, width * 0.055, Math.max(height * 0.56, 0.2), 20);
  const shadeGeo = new THREE.CylinderGeometry(width * 0.34, width * 0.14, Math.max(height * 0.34, 0.22), 24, 1, true);
  const bulbGeo = new THREE.SphereGeometry(Math.max(width * 0.15, 0.04), 24, 16);
  resources.geometries.push(baseGeo, poleGeo, shadeGeo, bulbGeo);

  const baseMat = new THREE.MeshStandardMaterial({
    color: "#9a7357",
    roughness: 0.5,
    metalness: 0.15,
    envMapIntensity: 0.45,
  });
  const poleMat = new THREE.MeshStandardMaterial({
    color: "#b88a5a",
    roughness: 0.42,
    metalness: 0.2,
    envMapIntensity: 0.4,
  });
  const shadeMat = new THREE.MeshStandardMaterial({
    color: "#efd8a8",
    roughness: 0.82,
    metalness: 0.02,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.92,
  });
  const bulbMat = new THREE.MeshStandardMaterial({
    color: "#ffd98e",
    emissive: "#ffcf72",
    emissiveIntensity: 0.7,
    roughness: 0.2,
    metalness: 0,
  });

  const base = new THREE.Mesh(baseGeo, baseMat);
  const pole = new THREE.Mesh(poleGeo, poleMat);
  const shade = new THREE.Mesh(shadeGeo, shadeMat);
  const bulb = new THREE.Mesh(bulbGeo, bulbMat);
  resources.materials.push(baseMat, poleMat, shadeMat, bulbMat);

  base.position.y = Math.max(height * 0.04, 0.02);
  pole.position.y = Math.max(height * 0.36, 0.3);
  shade.position.y = Math.max(height * 0.74, 0.56);
  bulb.position.y = shade.position.y + Math.max(height * 0.18, 0.1);

  base.castShadow = true;
  pole.castShadow = true;
  shade.castShadow = true;
  bulb.castShadow = true;

  base.receiveShadow = true;
  pole.receiveShadow = true;
  shade.receiveShadow = true;
  bulb.receiveShadow = true;

  lampGroup.add(base, pole, shade, bulb);
  lampGroup.userData.__normalizedResources = resources;
  return lampGroup;
}

function makeProceduralMesh(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  resources: NormalizedResources,
) {
  resources.geometries.push(geometry);
  resources.materials.push(material);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function makeStandardMaterial(color: string, options: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.78,
    metalness: 0.02,
    envMapIntensity: 0.35,
    ...options,
  });
}

function buildProceduralPlant(size: Vec3) {
  const [sizeX, sizeY, sizeZ] = size;
  const resources: NormalizedResources = { materials: [], textures: [], geometries: [] };
  const group = new THREE.Group();
  const width = Math.max(Math.min(sizeX, sizeZ), 0.32);
  const height = Math.max(sizeY, 0.72);

  const pot = makeProceduralMesh(
    new THREE.CylinderGeometry(width * 0.24, width * 0.32, height * 0.3, 9),
    makeStandardMaterial("#b66b4e", { roughness: 0.88 }),
    resources,
  );
  pot.position.y = height * 0.15;
  group.add(pot);

  const soil = makeProceduralMesh(
    new THREE.CylinderGeometry(width * 0.25, width * 0.25, height * 0.025, 16),
    makeStandardMaterial("#4a3328", { roughness: 0.95 }),
    resources,
  );
  soil.position.y = height * 0.31;
  group.add(soil);

  [
    [-0.18, 0.62, -0.06, -0.55, "#386f51"],
    [0.12, 0.78, 0.08, 0.38, "#5f9865"],
    [0.22, 0.55, -0.12, 0.72, "#2f694a"],
    [-0.28, 0.48, 0.1, -0.82, "#6ca472"],
    [0.02, 0.9, 0.02, 0.04, "#467f58"],
  ].forEach(([x, y, z, angle, color], index) => {
    const leaf = makeProceduralMesh(
      new THREE.OctahedronGeometry(width * (index === 4 ? 0.26 : 0.22), 0),
      makeStandardMaterial(String(color), { roughness: 0.82 }),
      resources,
    );
    leaf.position.set(Number(x) * width, Number(y) * height, Number(z) * width);
    leaf.rotation.set(0.35, Number(angle), Number(angle) * 0.5);
    leaf.scale.set(0.7, 1.55, 0.48);
    group.add(leaf);
  });

  group.userData.__normalizedResources = resources;
  return group;
}

function buildProceduralFloorLamp(size: Vec3) {
  const [sizeX, sizeY, sizeZ] = size;
  const resources: NormalizedResources = { materials: [], textures: [], geometries: [] };
  const group = new THREE.Group();
  const width = Math.max(Math.min(sizeX, sizeZ), 0.36);
  const height = Math.max(sizeY, 1.2);

  const brass = makeStandardMaterial("#b88a5a", { roughness: 0.45, metalness: 0.18, envMapIntensity: 0.5 });
  const shade = makeStandardMaterial("#ecd5aa", { roughness: 0.86, metalness: 0, transparent: true, opacity: 0.92, side: THREE.DoubleSide });
  const glow = makeStandardMaterial("#ffd89b", { emissive: "#ffcc82", emissiveIntensity: 0.42, roughness: 0.58 });

  const base = makeProceduralMesh(new THREE.CylinderGeometry(width * 0.34, width * 0.4, height * 0.045, 24), brass, resources);
  base.position.y = height * 0.022;
  const pole = makeProceduralMesh(new THREE.CylinderGeometry(width * 0.035, width * 0.04, height * 0.72, 18), brass.clone(), resources);
  pole.position.y = height * 0.39;
  const lampShade = makeProceduralMesh(new THREE.CylinderGeometry(width * 0.34, width * 0.21, height * 0.22, 28, 1, true), shade, resources);
  lampShade.position.y = height * 0.8;
  const bulb = makeProceduralMesh(new THREE.SphereGeometry(width * 0.13, 18, 12), glow, resources);
  bulb.position.y = height * 0.78;

  group.add(base, pole, lampShade, bulb);
  group.userData.__normalizedResources = resources;
  return group;
}

function buildProceduralBookStack(size: Vec3) {
  const [sizeX, sizeY, sizeZ] = size;
  const resources: NormalizedResources = { materials: [], textures: [], geometries: [] };
  const group = new THREE.Group();
  const colors = ["#6d7d82", "#c28262", "#6b5f83", "#d8c7a4"];
  const bookCount = 4;
  const bookHeight = Math.max(sizeY / bookCount, 0.025);

  colors.forEach((color, index) => {
    const book = makeProceduralMesh(
      new THREE.BoxGeometry(sizeX * (0.9 + (index % 2) * 0.08), bookHeight * 0.78, sizeZ * (0.82 + (index % 3) * 0.06)),
      makeStandardMaterial(color, { roughness: 0.82 }),
      resources,
    );
    book.position.y = index * bookHeight + bookHeight * 0.39;
    book.position.x = (index - 1.5) * sizeX * 0.025;
    book.rotation.y = (index - 1.5) * 0.035;
    group.add(book);
  });

  group.userData.__normalizedResources = resources;
  return group;
}

function buildProceduralPhotoFrame(size: Vec3) {
  const [sizeX, sizeY, sizeZ] = size;
  const resources: NormalizedResources = { materials: [], textures: [], geometries: [] };
  const group = new THREE.Group();
  const frame = makeStandardMaterial("#7b5a45", { roughness: 0.62, metalness: 0.04 });
  const matBoard = makeStandardMaterial("#efe3cf", { roughness: 0.9 });
  const artwork = makeStandardMaterial("#6c8790", { roughness: 0.74, emissive: "#24373b", emissiveIntensity: 0.04 });

  const back = makeProceduralMesh(new THREE.BoxGeometry(sizeX, sizeY, sizeZ * 0.18), frame, resources);
  back.position.y = sizeY * 0.5;
  const mat = makeProceduralMesh(new THREE.BoxGeometry(sizeX * 0.78, sizeY * 0.72, sizeZ * 0.2), matBoard, resources);
  mat.position.set(0, sizeY * 0.52, sizeZ * 0.12);
  const image = makeProceduralMesh(new THREE.BoxGeometry(sizeX * 0.5, sizeY * 0.48, sizeZ * 0.22), artwork, resources);
  image.position.set(0, sizeY * 0.52, sizeZ * 0.22);
  const stand = makeProceduralMesh(new THREE.BoxGeometry(sizeX * 0.08, sizeY * 0.7, sizeZ * 0.16), frame.clone(), resources);
  stand.position.set(0, sizeY * 0.32, -sizeZ * 0.42);
  stand.rotation.x = -0.38;

  group.add(back, mat, image, stand);
  group.userData.__normalizedResources = resources;
  return group;
}

function buildProceduralStorageBasket(size: Vec3) {
  const [sizeX, sizeY, sizeZ] = size;
  const resources: NormalizedResources = { materials: [], textures: [], geometries: [] };
  const group = new THREE.Group();
  const wicker = makeStandardMaterial("#9b7654", { roughness: 0.92 });
  const fabric = makeStandardMaterial("#d7c2a6", { roughness: 0.96 });

  const body = makeProceduralMesh(new THREE.CylinderGeometry(sizeX * 0.42, sizeX * 0.5, sizeY * 0.78, 14, 1, true), wicker, resources);
  body.position.y = sizeY * 0.39;
  body.scale.z = Math.max(sizeZ / Math.max(sizeX, 0.001), 0.55);
  const liner = makeProceduralMesh(new THREE.CylinderGeometry(sizeX * 0.36, sizeX * 0.42, sizeY * 0.34, 14), fabric, resources);
  liner.position.y = sizeY * 0.72;
  liner.scale.z = Math.max(sizeZ / Math.max(sizeX, 0.001), 0.55);
  const throwBlanket = makeProceduralMesh(new THREE.BoxGeometry(sizeX * 0.56, sizeY * 0.14, sizeZ * 0.5), fabric.clone(), resources);
  throwBlanket.position.set(0.02, sizeY * 0.88, 0.02);
  throwBlanket.rotation.set(0.08, -0.18, 0.05);

  group.add(body, liner, throwBlanket);
  group.userData.__normalizedResources = resources;
  return group;
}

function buildProceduralObject(kind: ProceduralObjectKind, size: Vec3) {
  switch (kind) {
    case "plant":
      return buildProceduralPlant(size);
    case "floor-lamp":
      return buildProceduralFloorLamp(size);
    case "book-stack":
      return buildProceduralBookStack(size);
    case "photo-frame":
      return buildProceduralPhotoFrame(size);
    case "storage-basket":
      return buildProceduralStorageBasket(size);
  }
}

function normalizeObject(source: THREE.Object3D, targetSize: Vec3, tint?: string, tintAmount = 0) {
  const clone = source.clone(true);
  clone.position.set(0, 0, 0);
  const resources: NormalizedResources = { materials: [], textures: [], geometries: [] };

  clone.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
      child.material = Array.isArray(child.material)
        ? child.material.map((material) => cloneMaterial(material, resources))
        : cloneMaterial(child.material, resources);
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => {
        material.toneMapped = true;
        if (material instanceof THREE.MeshStandardMaterial) {
          if (tint && tintAmount > 0) material.color.lerp(new THREE.Color(tint), tintAmount);
          material.roughness = THREE.MathUtils.clamp(material.roughness, IMPORTED_MATERIAL_PRESET.minRoughness, IMPORTED_MATERIAL_PRESET.maxRoughness);
          material.metalness = THREE.MathUtils.clamp(material.metalness, 0, IMPORTED_MATERIAL_PRESET.maxMetalness);
          material.envMapIntensity = Math.min(material.envMapIntensity, IMPORTED_MATERIAL_PRESET.envMapIntensity);
          material.emissiveIntensity = Math.min(material.emissiveIntensity, IMPORTED_MATERIAL_PRESET.maxEmissiveIntensity);
          material.needsUpdate = true;
        }
      });
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
  content.userData.__normalizedResources = resources;
  return content;
}

function composeObjectSet(scene: THREE.Group, placements: ObjectPlacement[]) {
  const roomSet = new THREE.Group();
  placements.forEach((placement) => {
    const proceduralKind = placement.name.startsWith("procedural:")
      ? placement.name.replace("procedural:", "") as ProceduralObjectKind
      : undefined;
    if (proceduralKind) {
      const object = new THREE.Group();
      object.name = `asset:${placement.instance || placement.name}`;
      object.position.set(...placement.position);
      object.rotation.set(...(placement.rotation || [0, 0, 0]));
      object.add(buildProceduralObject(proceduralKind, placement.size));
      roomSet.add(object);
      return;
    }

    if (placement.instance === "bedroom-diary-light") {
      const object = new THREE.Group();
      object.name = `asset:${placement.instance || placement.name}`;
      object.position.set(...placement.position);
      object.rotation.set(...(placement.rotation || [0, 0, 0]));
      object.add(buildDeskLampFallback(placement.size));
      roomSet.add(object);
      return;
    }

    const source = scene.getObjectByName(placement.name);
    if (!source) {
      const warningKey = `${scene.uuid}:${placement.name}`;
      if (process.env.NODE_ENV !== "production" && !missingNodeWarnings.has(warningKey)) {
        missingNodeWarnings.add(warningKey);
        console.warn(`[RoomDressing] Missing source node "${placement.name}" from ${scene.name || "GLTF"}`);
      }
      return;
    }
    const object = new THREE.Group();
    object.name = `asset:${placement.instance || placement.name}`;
    object.position.set(...placement.position);
    object.rotation.set(...(placement.rotation || [0, 0, 0]));

    const normalizedObject = normalizeObject(source, placement.size, placement.tint, placement.tintAmount);
    object.add(normalizedObject);

    roomSet.add(object);
  });
  return roomSet;
}

export function PortfolioEnvironment() {
  const { scene } = useThree();
  const texture = useLoader(SceneEnvironmentLoader, "portfolio-environment");
  useEffect(() => {
    const previous = scene.environment;
    texture.colorSpace = THREE.SRGBColorSpace;
    scene.environment = texture;
    scene.environmentIntensity = 0.62;
    return () => {
      scene.environment = previous;
    };
  }, [scene, texture]);
  return null;
}

export function RendererLook() {
  const { gl } = useThree();
  useEffect(() => {
    gl.outputColorSpace = THREE.SRGBColorSpace;
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = 1.02;
    gl.shadowMap.type = THREE.PCFShadowMap;
  }, [gl]);
  return null;
}

function MaximeObjectSet({ room }: { room: RoomPlan }) {
  const gltf = useLoader(SceneGltfLoader, "/vendor/maxime/scene-final.gltf", configureSceneGltfLoader) as GLTF;
  const placements = room.kind === "lobby" ? showroomObjects : bedroomObjects;
  const model = useMemo(() => composeObjectSet(gltf.scene, placements), [gltf.scene, placements]);

  useEffect(() => () => {
    disposeNormalizedObject(model);
  }, [model]);

  return (
    <group position={room.center}>
      <primitive object={model} />
    </group>
  );
}

export function OpenSourceExteriorDressing() {
  const gltf = useLoader(SceneGltfLoader, "/vendor/maxime/scene-final.gltf", configureSceneGltfLoader) as GLTF;
  const model = useMemo(() => composeObjectSet(gltf.scene, exteriorObjects), [gltf.scene]);

  useEffect(() => () => {
    disposeNormalizedObject(model);
  }, [model]);
  return <primitive object={model} />;
}

function BrunoObjectSet({ room }: { room: RoomPlan }) {
  const benchGltf = useLoader(SceneGltfLoader, "/vendor/bruno/benches.glb") as GLTF;
  const lanternGltf = useLoader(SceneGltfLoader, "/vendor/bruno/lanterns.glb") as GLTF;
  const bench = useMemo(() => composeObjectSet(benchGltf.scene, brunoBenchObjects), [benchGltf.scene]);
  const lanterns = useMemo(() => composeObjectSet(lanternGltf.scene, brunoLanternObjects), [lanternGltf.scene]);

  useEffect(() => () => {
    disposeNormalizedObject(bench);
    disposeNormalizedObject(lanterns);
  }, [bench, lanterns]);

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
