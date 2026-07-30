"use client";

import { useMemo } from "react";
import * as THREE from "three";
import type { RoomPlan, Vec3 } from "@/lib/types";

const DARK_WOOD = "#34231f";
const BRASS = "#d4a15c";

function Window({ position, rotation = [0, 0, 0], width = 1.7 }: { position: Vec3; rotation?: Vec3; width?: number }) {
  return (
    <group position={position} rotation={rotation}>
      <mesh><boxGeometry args={[width, 1.6, 0.1]} /><meshStandardMaterial color={DARK_WOOD} roughness={0.85} /></mesh>
      <mesh position={[0, 0, 0.065]}><planeGeometry args={[width - 0.2, 1.38]} /><meshStandardMaterial color="#294a5b" emissive="#315f70" emissiveIntensity={0.32} roughness={0.24} /></mesh>
      <mesh position={[0, 0, 0.12]}><boxGeometry args={[0.07, 1.4, 0.04]} /><meshStandardMaterial color={BRASS} /></mesh>
      <mesh position={[0, 0, 0.12]}><boxGeometry args={[width - 0.16, 0.07, 0.04]} /><meshStandardMaterial color={BRASS} /></mesh>
    </group>
  );
}

function RoomEnvelope({ room }: { room: RoomPlan }) {
  const [width, , depth] = room.size;
  const halfWidth = width / 2;
  const halfDepth = depth / 2;
  const wallHeight = 4.55;
  const wallY = wallHeight / 2 - 0.08;
  const wallColor = useMemo(() => {
    const color = new THREE.Color(room.color);
    color.lerp(new THREE.Color("#d7b79d"), room.kind === "lobby" ? 0.34 : 0.18);
    return color.getStyle();
  }, [room.color, room.kind]);
  const floorColor = useMemo(() => new THREE.Color(room.color).multiplyScalar(0.72).getStyle(), [room.color]);
  const lobbyDoorLocalZ = -9.25;
  const lobbyDoorHalfWidth = 1.3;
  const lobbyLeftSegments = [
    {
      z: (-halfDepth + lobbyDoorLocalZ - lobbyDoorHalfWidth) / 2,
      depth: lobbyDoorLocalZ - lobbyDoorHalfWidth + halfDepth,
    },
    {
      z: (lobbyDoorLocalZ + lobbyDoorHalfWidth + halfDepth) / 2,
      depth: halfDepth - lobbyDoorLocalZ - lobbyDoorHalfWidth,
    },
  ];
  const bedroomWallSegmentDepth = (depth - 2.6) / 2;
  const bedroomRightSegments = [
    { z: 1.3 + bedroomWallSegmentDepth / 2, depth: bedroomWallSegmentDepth },
    { z: -1.3 - bedroomWallSegmentDepth / 2, depth: bedroomWallSegmentDepth },
  ];

  return (
    <group>
      <mesh receiveShadow position={[0, -0.16, 0]}><boxGeometry args={[width, 0.34, depth]} /><meshStandardMaterial color={floorColor} roughness={0.92} /></mesh>
      <mesh receiveShadow position={[0, 4.45, 0]}><boxGeometry args={[width, 0.2, depth]} /><meshStandardMaterial color="#d9c5aa" roughness={0.98} /></mesh>
      <mesh receiveShadow position={[0, wallY, -halfDepth + 0.11]}><boxGeometry args={[width, wallHeight, 0.22]} /><meshStandardMaterial color={wallColor} roughness={0.96} /></mesh>
      {room.kind !== "lobby" ? <mesh receiveShadow position={[0, wallY, halfDepth - 0.11]}><boxGeometry args={[width, wallHeight, 0.22]} /><meshStandardMaterial color={wallColor} roughness={0.96} /></mesh> : null}

      {room.kind === "lobby" ? (
        <>
          {lobbyLeftSegments.map((segment) => (
            <mesh key={segment.z} receiveShadow position={[-halfWidth + 0.11, wallY, segment.z]}><boxGeometry args={[0.22, wallHeight, segment.depth]} /><meshStandardMaterial color={wallColor} roughness={0.96} /></mesh>
          ))}
          <mesh receiveShadow position={[-halfWidth + 0.11, 4, lobbyDoorLocalZ]}><boxGeometry args={[0.22, 0.92, 2.6]} /><meshStandardMaterial color={wallColor} roughness={0.96} /></mesh>
          <mesh receiveShadow position={[halfWidth - 0.11, wallY, 0]}><boxGeometry args={[0.22, wallHeight, depth]} /><meshStandardMaterial color={wallColor} roughness={0.96} /></mesh>
        </>
      ) : (
        <>
          <mesh receiveShadow position={[-halfWidth + 0.11, wallY, 0]}><boxGeometry args={[0.22, wallHeight, depth]} /><meshStandardMaterial color={wallColor} roughness={0.96} /></mesh>
          {bedroomRightSegments.map((segment) => (
            <mesh key={segment.z} receiveShadow position={[halfWidth - 0.11, wallY, segment.z]}><boxGeometry args={[0.22, wallHeight, segment.depth]} /><meshStandardMaterial color={wallColor} roughness={0.96} /></mesh>
          ))}
          <mesh receiveShadow position={[halfWidth - 0.11, 4, 0]}><boxGeometry args={[0.22, 0.92, 2.6]} /><meshStandardMaterial color={wallColor} roughness={0.96} /></mesh>
        </>
      )}

      <mesh position={[0, 0.16, -halfDepth + 0.24]}><boxGeometry args={[width - 0.24, 0.18, 0.14]} /><meshStandardMaterial color={DARK_WOOD} /></mesh>
      <mesh position={[0, 4.16, -halfDepth + 0.24]}><boxGeometry args={[width, 0.2, 0.18]} /><meshStandardMaterial color={BRASS} /></mesh>
      {[-0.32, 0, 0.32].map((ratio) => <mesh key={ratio} position={[ratio * width, 4.2, 0]}><boxGeometry args={[0.16, 0.18, depth]} /><meshStandardMaterial color={ratio === 0 ? DARK_WOOD : BRASS} roughness={0.6} /></mesh>)}

      {room.kind !== "lobby" ? (
        <>
          <Window position={[-2.75, 1.55, -halfDepth + 0.24]} width={1.9} />
          <Window position={[2.75, 1.55, -halfDepth + 0.24]} width={1.9} />
        </>
      ) : null}
    </group>
  );
}

export function AuthoredRoomScene({ room }: { room: RoomPlan }) {
  return (
    <group position={room.center}>
      <RoomEnvelope room={room} />
      <pointLight
        position={[0, 3.2, room.kind === "lobby" ? 1 : 0]}
        intensity={room.kind === "lobby" ? 16 : 9}
        distance={room.kind === "lobby" ? 28 : 18}
        decay={2}
        color={room.color}
      />
    </group>
  );
}
