"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

const SHAFT_SPECS = [
  { position: [3.1, 3.4, -4.2] as const, rotation: [0.24, 0, -0.46] as const, width: 2.6, height: 7.5, opacity: 0.09, phase: 0 },
  { position: [4.4, 3.1, -3.4] as const, rotation: [0.2, 0, -0.52] as const, width: 1.3, height: 6.4, opacity: 0.065, phase: 1.7 },
  { position: [-4.8, 3.6, -2.6] as const, rotation: [0.22, 0, 0.5] as const, width: 1.9, height: 7.2, opacity: 0.075, phase: 3.4 },
];

const CLOUD_SPECS = [
  { x: -26, y: 17, z: -38, scale: [16, 6.5] as const, speed: 0.24, opacity: 0.8 },
  { x: 4, y: 22, z: -44, scale: [21, 8] as const, speed: 0.16, opacity: 0.65 },
  { x: 24, y: 14.5, z: -34, scale: [12, 5] as const, speed: 0.32, opacity: 0.72 },
  { x: -6, y: 26, z: -50, scale: [26, 9] as const, speed: 0.12, opacity: 0.5 },
];

function makeShaftTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  if (!context) return null;
  // Bright core fading to the sides…
  const horizontal = context.createLinearGradient(0, 0, 128, 0);
  horizontal.addColorStop(0, "rgba(255, 236, 200, 0)");
  horizontal.addColorStop(0.5, "rgba(255, 236, 200, .9)");
  horizontal.addColorStop(1, "rgba(255, 236, 200, 0)");
  context.fillStyle = horizontal;
  context.fillRect(0, 0, 128, 256);
  // …and dissolving towards the floor.
  const vertical = context.createLinearGradient(0, 0, 0, 256);
  vertical.addColorStop(0, "rgba(0, 0, 0, 0)");
  vertical.addColorStop(0.75, "rgba(0, 0, 0, .55)");
  vertical.addColorStop(1, "rgba(0, 0, 0, 1)");
  context.globalCompositeOperation = "destination-out";
  context.fillStyle = vertical;
  context.fillRect(0, 0, 128, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeCloudTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  if (!context) return null;
  const puffs: [number, number, number][] = [
    [128, 78, 74],
    [78, 84, 52],
    [178, 86, 56],
    [108, 58, 48],
    [152, 56, 44],
  ];
  for (const [cx, cy, radius] of puffs) {
    const gradient = context.createRadialGradient(cx, cy, 0, cx, cy, radius);
    gradient.addColorStop(0, "rgba(246, 249, 251, .95)");
    gradient.addColorStop(0.62, "rgba(246, 249, 251, .55)");
    gradient.addColorStop(1, "rgba(246, 249, 251, 0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 256, 128);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Window light shafts slanting through the lobby plus slow clouds drifting
 * behind the museum exterior. Both are single-quad sprites with procedural
 * textures — negligible GPU cost, and hidden when not in view.
 */
export function SceneSkyEffects({ activeRoom }: { activeRoom: string }) {
  const shaftRefs = useRef<(THREE.Mesh | null)[]>([]);
  const cloudRefs = useRef<(THREE.Mesh | null)[]>([]);

  const enabled = useMemo(() => (
    typeof window !== "undefined"
    && !window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ), []);

  const shaftTexture = useMemo(() => (enabled ? makeShaftTexture() : null), [enabled]);
  const cloudTexture = useMemo(() => (enabled ? makeCloudTexture() : null), [enabled]);

  useEffect(() => () => {
    shaftTexture?.dispose();
    cloudTexture?.dispose();
  }, [shaftTexture, cloudTexture]);

  useFrame((state, delta) => {
    if (!enabled) return;
    const time = state.clock.elapsedTime;
    for (let index = 0; index < SHAFT_SPECS.length; index += 1) {
      const mesh = shaftRefs.current[index];
      if (!mesh || !mesh.visible) continue;
      const material = mesh.material as THREE.MeshBasicMaterial;
      const spec = SHAFT_SPECS[index];
      material.opacity = spec.opacity * (1 + Math.sin(time * 0.32 + spec.phase) * 0.28);
    }
    const step = Math.min(delta, 0.05);
    for (let index = 0; index < CLOUD_SPECS.length; index += 1) {
      const mesh = cloudRefs.current[index];
      if (!mesh || !mesh.visible) continue;
      mesh.position.x += CLOUD_SPECS[index].speed * step;
      if (mesh.position.x > 46) mesh.position.x = -46;
    }
  });

  if (!enabled) return null;

  const indoors = activeRoom === "room-lobby";
  const outdoors = activeRoom === "exterior";

  return (
    <>
      <group visible={indoors}>
        {SHAFT_SPECS.map((spec, index) => (
          <mesh
            key={`shaft-${index}`}
            ref={(mesh) => { shaftRefs.current[index] = mesh; }}
            position={[spec.position[0], spec.position[1], spec.position[2]]}
            rotation={[spec.rotation[0], spec.rotation[1], spec.rotation[2]]}
            renderOrder={1}
          >
            <planeGeometry args={[spec.width, spec.height]} />
            <meshBasicMaterial
              map={shaftTexture}
              transparent
              opacity={spec.opacity}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
              side={THREE.DoubleSide}
              toneMapped={false}
            />
          </mesh>
        ))}
      </group>
      <group visible={outdoors}>
        {CLOUD_SPECS.map((spec, index) => (
          <mesh
            key={`cloud-${index}`}
            ref={(mesh) => { cloudRefs.current[index] = mesh; }}
            position={[spec.x, spec.y, spec.z]}
            scale={[spec.scale[0], spec.scale[1], 1]}
          >
            <planeGeometry args={[1, 1]} />
            <meshBasicMaterial
              map={cloudTexture}
              transparent
              opacity={spec.opacity}
              depthWrite={false}
              side={THREE.DoubleSide}
            />
          </mesh>
        ))}
      </group>
    </>
  );
}
