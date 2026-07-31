"use client";

/* eslint-disable react-hooks/immutability -- Three.js render loops intentionally mutate refs and object transforms. */

import { useFrame } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { ThreeEvent } from "@react-three/fiber";
import {
  normalizePetCustomization,
  type PetCustomization,
  type PetEarStyle,
} from "@/lib/profile-space-customization";
import { MARDOU_COMPANION_SAFE_ZONE, MARDOU_COMPANION_SPEED } from "./MardouMuseumLayout";

const INK_COLOR = "#17151a";
const SHADOW_COLOR = "#7a6b58";
const TURN_SPEED = 8;
const TWO_PI = Math.PI * 2;
const COMPANION_COLLISION_RADIUS = 0.24;

export type RoomCompanionProps = {
  activeRoom: string;
  sceneReady?: boolean;
  qaOpen?: boolean;
  customization?: PetCustomization;
  seed?: string;
  visible?: boolean;
  onOpenQa: () => void;
};

function CompanionEar({ side, style, color }: { side: -1 | 1; style: PetEarStyle; color: string }) {
  const position: [number, number, number] = [side * 0.18, style === "droop" ? 0.18 : 0.26, -0.03];
  const rotation: [number, number, number] = style === "droop"
    ? [0.12, 0, side * 0.74]
    : [0.08, 0, side * -0.24];
  return (
    <mesh castShadow position={position} rotation={rotation}>
      {style === "pointed" ? <coneGeometry args={[0.12, 0.24, 4]} /> : null}
      {style === "round" ? <sphereGeometry args={[0.12, 8, 6]} /> : null}
      {style === "droop" ? <capsuleGeometry args={[0.055, 0.16, 3, 6]} /> : null}
      <meshStandardMaterial color={color} roughness={0.82} />
    </mesh>
  );
}

function hashSeed(seed: string) {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function waypointVector(index: number) {
  const waypoint = MARDOU_COMPANION_SAFE_ZONE.waypoints[index % MARDOU_COMPANION_SAFE_ZONE.waypoints.length];
  return new THREE.Vector3(waypoint[0], waypoint[1], waypoint[2]);
}

function belongsToCompanion(object: THREE.Object3D | null) {
  let candidate = object;
  while (candidate) {
    if (candidate.name === "room-companion-xiaobai") return true;
    candidate = candidate.parent;
  }
  return false;
}

function visibleCompanionCollisionMesh(object: THREE.Object3D): object is THREE.Mesh {
  if (!(object instanceof THREE.Mesh) || belongsToCompanion(object) || object.userData.ignoreCameraCollision) {
    return false;
  }
  const materials = Array.isArray(object.material) ? object.material : [object.material];
  return materials.some((material) => (
    material.visible && (!material.transparent || material.opacity >= 0.05)
  ));
}

function companionMovementBlocked(
  scene: THREE.Scene,
  position: THREE.Vector3,
  movement: THREE.Vector3,
  raycaster: THREE.Raycaster,
) {
  const distance = movement.length();
  if (distance < 0.0001) return false;
  const forward = movement.clone().normalize();
  const side = new THREE.Vector3(-forward.z, 0, forward.x);
  const origin = position.clone();
  origin.y = MARDOU_COMPANION_SAFE_ZONE.floorY + 0.28;
  const collisionMeshes: THREE.Mesh[] = [];
  scene.traverseVisible((object) => {
    if (visibleCompanionCollisionMesh(object)) collisionMeshes.push(object);
  });
  if (!collisionMeshes.length) return false;
  return [-COMPANION_COLLISION_RADIUS, 0, COMPANION_COLLISION_RADIUS].some((offset) => {
    raycaster.set(origin.clone().addScaledVector(side, offset), forward);
    raycaster.near = 0.01;
    raycaster.far = distance + COMPANION_COLLISION_RADIUS;
    // Intersect concrete meshes only. Recursive scene raycasting also invokes
    // Sprite.raycast, which expects raycaster.camera to be set and crashes
    // during companion movement with `camera.matrixWorld` on a null camera.
    return raycaster.intersectObjects(collisionMeshes, false).length > 0;
  });
}

export function RoomCompanion({
  activeRoom,
  sceneReady = true,
  qaOpen = false,
  customization,
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
  const collisionRaycaster = useRef(new THREE.Raycaster());
  const clock = useRef(0);
  const pauseUntil = useRef(0);
  const entranceGreetingUntil = useRef(0);
  const welcoming = useRef(true);
  const randomState = useRef(hashSeed(seed) || 1);
  // Point 52 is immediately beside patrol point 55, so the logical route must
  // begin at waypoint 0. Randomness controls direction only after that; a
  // random logical start could make the first segment cut across the ring.
  const startIndex = 0;
  const currentIndex = useRef(startIndex);
  const targetIndex = useRef((startIndex + 1) % MARDOU_COMPANION_SAFE_ZONE.waypoints.length);
  const target = useMemo(() => new THREE.Vector3(...MARDOU_COMPANION_SAFE_ZONE.entranceWelcome), []);
  const direction = useMemo(() => new THREE.Vector3(), []);
  const firstPosition = MARDOU_COMPANION_SAFE_ZONE.entranceSpawn;
  const appearance = useMemo(() => normalizePetCustomization(customization), [customization]);

  const nextRandom = useCallback(() => {
    let value = randomState.current;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    randomState.current = value >>> 0;
    return randomState.current / 0x1_0000_0000;
  }, []);

  const chooseNextWaypoint = useCallback((excludedIndex?: number) => {
    const count = MARDOU_COMPANION_SAFE_ZONE.waypoints.length;
    if (count <= 1) return 0;
    const clockwise = (currentIndex.current + 1) % count;
    const counterclockwise = (currentIndex.current - 1 + count) % count;
    if (clockwise === excludedIndex) return counterclockwise;
    if (counterclockwise === excludedIndex) return clockwise;
    return nextRandom() < 0.5 ? clockwise : counterclockwise;
  }, [nextRandom]);

  const setPatrolTarget = useCallback((index: number) => {
    target.copy(waypointVector(index));
  }, [target]);

  useEffect(() => {
    randomState.current = hashSeed(seed) || 1;
    currentIndex.current = startIndex;
    targetIndex.current = (startIndex + 1) % MARDOU_COMPANION_SAFE_ZONE.waypoints.length;
    welcoming.current = true;
    entranceGreetingUntil.current = 0;
    target.set(...MARDOU_COMPANION_SAFE_ZONE.entranceWelcome);
    if (root.current) {
      root.current.position.set(firstPosition[0], firstPosition[1], firstPosition[2]);
    }
  }, [firstPosition, seed, target]);

  useEffect(() => {
    if (qaOpen) {
      pauseUntil.current = 0;
    } else if (welcoming.current) {
      target.set(...MARDOU_COMPANION_SAFE_ZONE.entranceWelcome);
      pauseUntil.current = clock.current + 0.25;
    } else if (!welcoming.current) {
      setPatrolTarget(targetIndex.current);
      pauseUntil.current = clock.current + 0.75;
    }
  }, [qaOpen, setPatrolTarget, target]);

  useFrame((state, delta) => {
    if (!root.current || activeRoom !== "room-lobby" || !visible || !sceneReady) return;

    const stepDelta = Math.min(delta, 1 / 24);
    clock.current += stepDelta;
    const paused = !qaOpen && clock.current < pauseUntil.current;
    const greetingAtEntrance = !qaOpen && clock.current < entranceGreetingUntil.current;

    let walking = false;
    if (qaOpen || greetingAtEntrance) {
      direction.copy(state.camera.position).sub(root.current.position);
      direction.y = 0;
      if (direction.lengthSq() > 1e-6) {
        const yaw = Math.atan2(direction.x, direction.z);
        root.current.rotation.y = THREE.MathUtils.damp(root.current.rotation.y, yaw, TURN_SPEED, stepDelta);
      }
    } else if (!paused) {
      direction.copy(target).sub(root.current.position);
      direction.y = 0;
      const distance = direction.length();

      if (distance <= MARDOU_COMPANION_SAFE_ZONE.stoppingRadius && welcoming.current) {
        welcoming.current = false;
        currentIndex.current = startIndex;
        targetIndex.current = chooseNextWaypoint();
        setPatrolTarget(targetIndex.current);
        pauseUntil.current = clock.current + MARDOU_COMPANION_SAFE_ZONE.entrancePauseSeconds;
        entranceGreetingUntil.current = pauseUntil.current;
      } else if (distance <= MARDOU_COMPANION_SAFE_ZONE.stoppingRadius) {
        currentIndex.current = targetIndex.current;
        targetIndex.current = chooseNextWaypoint();
        setPatrolTarget(targetIndex.current);
        pauseUntil.current = clock.current + 0.65;
      } else {
        direction.normalize();
        const step = Math.min(distance, MARDOU_COMPANION_SPEED * stepDelta);
        const movement = direction.clone().multiplyScalar(step);
        if (companionMovementBlocked(
          state.scene,
          root.current.position,
          movement,
          collisionRaycaster.current,
        )) {
          const blockedTarget = targetIndex.current;
          targetIndex.current = chooseNextWaypoint(blockedTarget);
          setPatrolTarget(targetIndex.current);
          pauseUntil.current = clock.current + 0.35;
        } else {
          walking = true;
          root.current.position.add(movement);
          const yaw = Math.atan2(direction.x, direction.z);
          root.current.rotation.y = THREE.MathUtils.damp(root.current.rotation.y, yaw, TURN_SPEED, stepDelta);
        }
      }
    }

    const gait = walking ? Math.sin(clock.current * 12) * 0.28 : 0;
    root.current.position.y = MARDOU_COMPANION_SAFE_ZONE.floorY + (qaOpen ? 0 : Math.sin(clock.current * 3.2) * 0.018);
    if (head.current) head.current.rotation.x = qaOpen ? 0 : walking ? -0.04 : Math.sin(clock.current * 2.4) * 0.08;
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
      name="room-companion-xiaobai"
      userData={{ companionName: appearance.name, personality: appearance.personality }}
      position={[firstPosition[0], firstPosition[1], firstPosition[2]]}
      scale={0.52}
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
        <meshStandardMaterial color={appearance.bodyColor} roughness={0.82} metalness={0.02} />
      </mesh>

      <group ref={head} position={[0, 0.95, 0.38]}>
        <mesh castShadow>
          <icosahedronGeometry args={[0.34, 1]} />
          <meshStandardMaterial color={appearance.bodyColor} roughness={0.78} />
        </mesh>
        <CompanionEar side={-1} style={appearance.earStyle} color={appearance.bodyColor} />
        <CompanionEar side={1} style={appearance.earStyle} color={appearance.bodyColor} />
        {appearance.markingStyle === "mask" ? [-1, 1].map((side) => (
          <mesh key={`mask-${side}`} position={[side * 0.12, 0.06, 0.285]} scale={[1.8, 1.05, 0.45]}>
            <sphereGeometry args={[0.075, 8, 6]} />
            <meshBasicMaterial color={appearance.accentColor} />
          </mesh>
        )) : null}
        {appearance.markingStyle === "star" ? (
          <mesh position={[0, 0.18, 0.295]} scale={[0.72, 1, 0.32]} rotation={[0, 0, Math.PI / 4]}>
            <octahedronGeometry args={[0.075, 0]} />
            <meshBasicMaterial color={appearance.accentColor} />
          </mesh>
        ) : null}
        {[-1, 1].map((side) => (
          <mesh key={side} position={[side * 0.12, 0.05, 0.3]}>
            <sphereGeometry args={[0.036, 8, 6]} />
            <meshBasicMaterial color={INK_COLOR} />
          </mesh>
        ))}
        <mesh position={[0, -0.04, 0.32]}>
          <sphereGeometry args={[0.035, 8, 6]} />
          <meshBasicMaterial color={appearance.accentColor} />
        </mesh>
      </group>

      <group ref={tail} position={[0, 0.72, -0.43]} rotation={[0.16, 0, 0]}>
        <mesh castShadow position={[0, 0.05, -0.2]} rotation={[Math.PI / 2, 0, 0]}>
          <coneGeometry args={[0.08, 0.42, 5]} />
          <meshStandardMaterial color={appearance.bodyColor} roughness={0.82} />
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
          <meshStandardMaterial color={appearance.bodyColor} roughness={0.84} />
        </mesh>
      ))}

      <mesh ref={signalRing} position={[0, 1.34, 0.04]}>
        <torusGeometry args={[0.24, 0.012, 5, 18]} />
        <meshBasicMaterial color={appearance.accentColor} transparent opacity={0.58} />
      </mesh>
    </group>
  );
}
