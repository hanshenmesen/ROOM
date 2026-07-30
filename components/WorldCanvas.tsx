"use client";

/* eslint-disable react-hooks/immutability -- Three.js camera and scene objects are animated imperatively. */

import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const DRAWING_ROOM_MODEL_URL = "/models/the-great-drawing-room.glb";
const MODEL_SIZE = 10;

type CameraShot = {
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
};

// Deliberately authored camera stances: each one is a composition, not a free-orbit preset.
const CAMERA_SHOTS: CameraShot[] = [
  { position: [0, 0, -0.7], target: [4, 0, -0.7], fov: 58 },
  { position: [0.55, -0.16, 0.28], target: [4.45, -0.08, 0.58], fov: 48 },
  { position: [0.42, 0.08, -1.42], target: [4.2, 0.1, -2.18], fov: 46 },
  { position: [0.18, -0.12, -0.62], target: [3.65, 2.15, -0.62], fov: 51 },
  { position: [0.72, -0.78, -0.28], target: [4.15, -0.66, -0.12], fov: 44 },
];

function DrawingRoomModel() {
  const gltf = useLoader(GLTFLoader, DRAWING_ROOM_MODEL_URL);
  const { gl } = useThree();
  const scene = useMemo(() => {
    const clone = gltf.scene.clone(true);
    const bounds = new THREE.Box3().setFromObject(clone);
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const scale = MODEL_SIZE / Math.max(size.x, size.y, size.z);

    clone.scale.setScalar(scale);
    clone.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
    return clone;
  }, [gltf.scene]);

  useEffect(() => {
    const anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());

    scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.castShadow = false;
      object.receiveShadow = false;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        const textured = material as THREE.Material & { map?: THREE.Texture };
        if (!textured.map) continue;
        textured.map.colorSpace = THREE.SRGBColorSpace;
        textured.map.anisotropy = anisotropy;
        textured.map.needsUpdate = true;
      }
    });
  }, [gl, scene]);

  return <primitive object={scene} />;
}

function CinematicCamera({ activeShot }: { activeShot: number }) {
  const { camera, pointer } = useThree();
  const lookAt = useRef(new THREE.Vector3(...CAMERA_SHOTS[0].target));
  const destination = useMemo(() => new THREE.Vector3(), []);
  const target = useMemo(() => new THREE.Vector3(), []);
  const reducedMotion = useRef(false);

  useEffect(() => {
    reducedMotion.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  useFrame((_, delta) => {
    const shot = CAMERA_SHOTS[activeShot] ?? CAMERA_SHOTS[0];
    destination.set(...shot.position);
    target.set(...shot.target);

    // A restrained cursor drift keeps the frame alive without giving up the art-directed shot.
    destination.x += pointer.x * 0.055;
    destination.y += pointer.y * 0.035;
    target.z -= pointer.x * 0.045;
    target.y += pointer.y * 0.025;

    const smoothTime = reducedMotion.current ? 0.01 : 0.72;
    camera.position.x = THREE.MathUtils.damp(camera.position.x, destination.x, 1 / smoothTime, delta);
    camera.position.y = THREE.MathUtils.damp(camera.position.y, destination.y, 1 / smoothTime, delta);
    camera.position.z = THREE.MathUtils.damp(camera.position.z, destination.z, 1 / smoothTime, delta);
    lookAt.current.x = THREE.MathUtils.damp(lookAt.current.x, target.x, 1 / smoothTime, delta);
    lookAt.current.y = THREE.MathUtils.damp(lookAt.current.y, target.y, 1 / smoothTime, delta);
    lookAt.current.z = THREE.MathUtils.damp(lookAt.current.z, target.z, 1 / smoothTime, delta);
    camera.lookAt(lookAt.current);

    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = THREE.MathUtils.damp(camera.fov, shot.fov, 1 / smoothTime, delta);
      camera.updateProjectionMatrix();
    }
  });

  return null;
}

export function WorldCanvas({ activeShot = 0 }: { activeShot?: number }) {
  return (
    <Canvas
      dpr={[1, 1.35]}
      camera={{ position: CAMERA_SHOTS[0].position, fov: CAMERA_SHOTS[0].fov, near: 0.05, far: 100 }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
    >
      <color attach="background" args={["#171614"]} />
      <ambientLight intensity={1.35} color="#fff7ea" />
      <directionalLight position={[5, -7, 12]} intensity={2.05} color="#fff1dc" />
      <directionalLight position={[-6, 5, 8]} intensity={0.78} color="#e8efff" />
      <CinematicCamera activeShot={activeShot} />
      <Suspense fallback={null}>
        <DrawingRoomModel />
      </Suspense>
    </Canvas>
  );
}
