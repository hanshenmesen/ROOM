"use client";

/* eslint-disable react-hooks/immutability -- Three.js render loops intentionally mutate refs and object transforms. */

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { ThreeEvent } from "@react-three/fiber";
import { MARDOU_COMPANION_SAFE_ZONE } from "./MardouMuseumLayout";

const BODY_COLOR = "#d8c7a7";
const ACCENT_COLOR = "#6fd6c9";
const INK_COLOR = "#17151a";
const SHADOW_COLOR = "#7a6b58";
const COMPANION_SPEED = 0.72;
const TURN_SPEED = 8;
const TWO_PI = Math.PI * 2;

export type RoomCompanionProps = {
  activeRoom: string;
  qaOpen?: boolean;
  seed?: string;
  visible?: boolean;
  onOpenQa: () => void;
};

function hashSeed(seed: string) {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededStartIndex(seed: string, count: number) {
  if (count <= 0) return 0;
  return hashSeed(seed) % count;
}

function waypointVector(index: number) {
  const waypoint = MARDOU_COMPANION_SAFE_ZONE.waypoints[index % MARDOU_COMPANION_SAFE_ZONE.waypoints.length];
  return new THREE.Vector3(waypoint[0], waypoint[1], waypoint[2]);
}

export function RoomCompanion({
  activeRoom,
  qaOpen = false,
  seed = "room-neutral-companion",
  visible = true,
  onOpenQa,
}: RoomCompanionProps) {
  const root = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const tail = useRef<THREE.Group>(null);
  const leftFrontLeg = useRef<THREE.Mesh>(null);
  const rightFrontLeg = useRef<THREE.Mesh>(null);
  const leftBackLeg = useRef<THREE.Mesh>(null);
  const rightBackLeg = useRef<THREE.Mesh>(null);
  const signalRing = useRef<THREE.Mesh>(null);
  const clock = useRef(0);
  const pauseUntil = useRef(0);
  const startIndex = useMemo(
    () => seededStartIndex(seed, MARDOU_COMPANION_SAFE_ZONE.waypoints.length),
    [seed],
  );
  const currentIndex = useRef(startIndex);
  const targetIndex = useRef((startIndex + 1) % MARDOU_COMPANION_SAFE_ZONE.waypoints.length);
  const target = useMemo(
    () => waypointVector((startIndex + 1) % MARDOU_COMPANION_SAFE_ZONE.waypoints.length),
    [startIndex],
  );
  const direction = useMemo(() => new THREE.Vector3(), []);
  const firstPosition = MARDOU_COMPANION_SAFE_ZONE.waypoints[startIndex];

  useEffect(() => {
    currentIndex.current = startIndex;
    targetIndex.current = (startIndex + 1) % MARDOU_COMPANION_SAFE_ZONE.waypoints.length;
    target.copy(waypointVector(targetIndex.current));
    if (root.current) {
      root.current.position.set(firstPosition[0], firstPosition[1], firstPosition[2]);
    }
  }, [firstPosition, startIndex, target]);

  useEffect(() => {
    if (qaOpen) {
      target.set(...MARDOU_COMPANION_SAFE_ZONE.dialoguePoint);
      pauseUntil.current = 0;
    } else {
      target.copy(waypointVector(targetIndex.current));
      pauseUntil.current = clock.current + 0.75;
    }
  }, [qaOpen, target]);

  useFrame((state, delta) => {
    if (!root.current || activeRoom !== "room-lobby" || !visible) return;

    const stepDelta = Math.min(delta, 1 / 24);
    clock.current += stepDelta;
    const paused = !qaOpen && clock.current < pauseUntil.current;

    let walking = false;
    if (!paused) {
      direction.copy(target).sub(root.current.position);
      direction.y = 0;
      const distance = direction.length();

      if (distance <= MARDOU_COMPANION_SAFE_ZONE.stoppingRadius && qaOpen) {
        direction.copy(state.camera.position).sub(root.current.position);
        const yaw = Math.atan2(direction.x, direction.z);
        root.current.rotation.y = THREE.MathUtils.damp(root.current.rotation.y, yaw, TURN_SPEED, stepDelta);
      } else if (distance <= MARDOU_COMPANION_SAFE_ZONE.stoppingRadius) {
        currentIndex.current = targetIndex.current;
        targetIndex.current = (targetIndex.current + 2) % MARDOU_COMPANION_SAFE_ZONE.waypoints.length;
        if (targetIndex.current === currentIndex.current) {
          targetIndex.current = (targetIndex.current + 1) % MARDOU_COMPANION_SAFE_ZONE.waypoints.length;
        }
        target.copy(waypointVector(targetIndex.current));
        pauseUntil.current = clock.current + 0.65;
      } else {
        walking = true;
        direction.normalize();
        root.current.position.addScaledVector(direction, Math.min(distance, COMPANION_SPEED * stepDelta));
        const yaw = Math.atan2(direction.x, direction.z);
        root.current.rotation.y = THREE.MathUtils.damp(root.current.rotation.y, yaw, TURN_SPEED, stepDelta);
      }
    }

    const gait = walking ? Math.sin(clock.current * 12) * 0.28 : 0;
    root.current.position.y = MARDOU_COMPANION_SAFE_ZONE.floorY + Math.sin(clock.current * 3.2) * 0.018;
    if (head.current) head.current.rotation.x = walking ? -0.04 : Math.sin(clock.current * 2.4) * 0.08;
    if (tail.current) tail.current.rotation.y = Math.sin(clock.current * 7.5) * 0.34;
    if (leftFrontLeg.current) leftFrontLeg.current.rotation.x = gait;
    if (rightBackLeg.current) rightBackLeg.current.rotation.x = gait;
    if (rightFrontLeg.current) rightFrontLeg.current.rotation.x = -gait;
    if (leftBackLeg.current) leftBackLeg.current.rotation.x = -gait;
    if (signalRing.current) signalRing.current.rotation.y = clock.current % TWO_PI;
  });

  function handleClick(event: ThreeEvent<PointerEvent>) {
    event.stopPropagation();
    pauseUntil.current = clock.current + MARDOU_COMPANION_SAFE_ZONE.clickPauseSeconds;
    onOpenQa();
  }

  if (activeRoom !== "room-lobby" || !visible) return null;

  return (
    <group
      ref={root}
      name="room-neutral-companion"
      position={[firstPosition[0], firstPosition[1], firstPosition[2]]}
      scale={0.74}
      onClick={handleClick}
      onPointerOver={(event) => {
        event.stopPropagation();
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        document.body.style.cursor = "default";
      }}
    >
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.018, 0]}>
        <circleGeometry args={[0.56, 16]} />
        <meshBasicMaterial color={SHADOW_COLOR} transparent opacity={0.16} depthWrite={false} />
      </mesh>

      <mesh castShadow position={[0, MARDOU_COMPANION_SAFE_ZONE.bodyHeight, 0]}>
        <icosahedronGeometry args={[0.45, 1]} />
        <meshStandardMaterial color={BODY_COLOR} roughness={0.82} metalness={0.02} />
      </mesh>

      <group ref={head} position={[0, 0.95, 0.38]}>
        <mesh castShadow>
          <icosahedronGeometry args={[0.34, 1]} />
          <meshStandardMaterial color="#ead8b9" roughness={0.78} />
        </mesh>
        {[-1, 1].map((side) => (
          <mesh
            key={side}
            castShadow
            position={[side * 0.18, 0.26, -0.03]}
            rotation={[0.08, 0, side * -0.24]}
          >
            <coneGeometry args={[0.12, 0.24, 4]} />
            <meshStandardMaterial color={BODY_COLOR} roughness={0.82} />
          </mesh>
        ))}
        {[-1, 1].map((side) => (
          <mesh key={side} position={[side * 0.12, 0.05, 0.3]}>
            <sphereGeometry args={[0.036, 8, 6]} />
            <meshBasicMaterial color={INK_COLOR} />
          </mesh>
        ))}
        <mesh position={[0, -0.04, 0.32]}>
          <sphereGeometry args={[0.035, 8, 6]} />
          <meshBasicMaterial color={ACCENT_COLOR} />
        </mesh>
      </group>

      <group ref={tail} position={[0, 0.72, -0.43]} rotation={[0.16, 0, 0]}>
        <mesh castShadow position={[0, 0.05, -0.2]} rotation={[Math.PI / 2, 0, 0]}>
          <coneGeometry args={[0.08, 0.42, 5]} />
          <meshStandardMaterial color={BODY_COLOR} roughness={0.82} />
        </mesh>
      </group>

      {[
        { ref: leftFrontLeg, x: -0.24, z: 0.22 },
        { ref: rightFrontLeg, x: 0.24, z: 0.22 },
        { ref: leftBackLeg, x: -0.24, z: -0.22 },
        { ref: rightBackLeg, x: 0.24, z: -0.22 },
      ].map((leg) => (
        <mesh
          key={`${leg.x}:${leg.z}`}
          ref={leg.ref}
          castShadow
          position={[leg.x, 0.34, leg.z]}
        >
          <capsuleGeometry args={[0.07, 0.32, 3, 6]} />
          <meshStandardMaterial color={BODY_COLOR} roughness={0.84} />
        </mesh>
      ))}

      <mesh ref={signalRing} position={[0, 1.34, 0.04]}>
        <torusGeometry args={[0.24, 0.012, 5, 18]} />
        <meshBasicMaterial color={ACCENT_COLOR} transparent opacity={0.58} />
      </mesh>
    </group>
  );
}
