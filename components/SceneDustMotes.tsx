"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

const MOTE_COUNT = 150;
const BOUNDS = {
  x: 7.2,
  yMin: 0.25,
  yMax: 5.4,
  zMin: -9,
  zMax: 6,
};
const SPAN_Y = BOUNDS.yMax - BOUNDS.yMin;

type MoteSeed = {
  x: number;
  y: number;
  z: number;
  speed: number;
  sway: number;
  phase: number;
};

// Generated once at module load (this component mounts at most once per
// scene); kept out of hooks so render purity rules stay satisfied.
const MOTE_SEEDS: MoteSeed[] = Array.from({ length: MOTE_COUNT }, () => ({
  x: (Math.random() * 2 - 1) * BOUNDS.x,
  y: BOUNDS.yMin + Math.random() * SPAN_Y,
  z: BOUNDS.zMin + Math.random() * (BOUNDS.zMax - BOUNDS.zMin),
  speed: 0.08 + Math.random() * 0.16,
  sway: 0.25 + Math.random() * 0.5,
  phase: Math.random() * Math.PI * 2,
}));

/**
 * Sunlit dust drifting through the museum air. A single THREE.Points draw
 * call; positions are recomputed each frame from analytic sway, so there is
 * no physics cost. Hidden for exterior views and reduced-motion users.
 */
export function SceneDustMotes({ activeRoom }: { activeRoom: string }) {
  const pointsRef = useRef<THREE.Points>(null);

  const enabled = useMemo(() => (
    typeof window !== "undefined"
    && !window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ), []);

  const geometry = useMemo(() => {
    if (!enabled) return null;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(MOTE_COUNT * 3);
    MOTE_SEEDS.forEach((seed, index) => {
      positions[index * 3] = seed.x;
      positions[index * 3 + 1] = seed.y;
      positions[index * 3 + 2] = seed.z;
    });
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return geo;
  }, [enabled]);

  const texture = useMemo(() => {
    if (!enabled || typeof document === "undefined") return null;
    const size = 64;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    if (!context) return null;
    const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, "rgba(255, 250, 238, 1)");
    gradient.addColorStop(0.35, "rgba(255, 240, 214, .8)");
    gradient.addColorStop(1, "rgba(255, 240, 214, 0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    return map;
  }, [enabled]);

  useEffect(() => () => {
    geometry?.dispose();
    texture?.dispose();
  }, [geometry, texture]);

  useFrame((state, delta) => {
    if (!geometry) return;
    const points = pointsRef.current;
    if (!points || !points.visible) return;
    const attribute = geometry.getAttribute("position") as THREE.BufferAttribute;
    const array = attribute.array as Float32Array;
    const time = state.clock.elapsedTime;
    const step = Math.min(delta, 0.05);
    for (let index = 0; index < MOTE_COUNT; index += 1) {
      const seed = MOTE_SEEDS[index];
      seed.y += seed.speed * step;
      if (seed.y > BOUNDS.yMax) seed.y = BOUNDS.yMin;
      array[index * 3] = seed.x + Math.sin(time * seed.sway + seed.phase) * 0.35;
      array[index * 3 + 1] = seed.y;
      array[index * 3 + 2] = seed.z + Math.cos(time * seed.sway * 0.8 + seed.phase) * 0.35;
    }
    attribute.needsUpdate = true;
  });

  if (!enabled || !geometry) return null;

  const indoors = activeRoom === "room-lobby" || activeRoom === "room-private";

  return (
    <points ref={pointsRef} geometry={geometry} visible={indoors} frustumCulled={false}>
      <pointsMaterial
        size={0.055}
        sizeAttenuation
        map={texture}
        alphaMap={texture || undefined}
        transparent
        opacity={0.5}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        color="#ffe8c4"
      />
    </points>
  );
}
