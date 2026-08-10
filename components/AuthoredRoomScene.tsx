"use client";

import { useMemo } from "react";
import * as THREE from "three";
import type { RoomPlan, Vec3 } from "@/lib/types";
import {
  BrassMaterial,
  GlassMaterial,
  usePlasterTextures,
  useWalnutTextures,
} from "./SceneMaterials";

const DARK_WOOD = "#34231f";

function Window({ position, rotation = [0, 0, 0], width = 1.7, lit = true }: { position: Vec3; rotation?: Vec3; width?: number; lit?: boolean }) {
  return (
    <group position={position} rotation={rotation}>
      <mesh castShadow><boxGeometry args={[width + 0.16, 1.76, 0.18]} /><meshStandardMaterial color={DARK_WOOD} roughness={0.48} metalness={0.08} /></mesh>
      <mesh position={[0, 0, 0.055]}><planeGeometry args={[width - 0.08, 1.48]} /><meshStandardMaterial color="#4a3429" emissive="#bd7448" emissiveIntensity={0.16} roughness={0.74} /></mesh>
      <mesh position={[0, 0, 0.12]}><planeGeometry args={[width - 0.15, 1.4]} /><GlassMaterial warm /></mesh>
      <mesh position={[0, 0, 0.17]}><boxGeometry args={[0.065, 1.44, 0.045]} /><BrassMaterial /></mesh>
      <mesh position={[0, 0, 0.17]}><boxGeometry args={[width - 0.14, 0.065, 0.045]} /><BrassMaterial /></mesh>
      <mesh position={[0, -0.92, 0.04]}><boxGeometry args={[width + 0.34, 0.14, 0.34]} /><meshStandardMaterial color="#6e4635" roughness={0.68} /></mesh>
      {lit ? <pointLight position={[0, 0, -0.34]} intensity={2.5} distance={4.2} decay={1.8} color="#ffce9a" /> : null}
    </group>
  );
}

function RoomEnvelope({ room, lit }: { room: RoomPlan; lit: boolean }) {
  const [width, , depth] = room.size;
  const halfWidth = width / 2;
  const halfDepth = depth / 2;
  const wallHeight = 4.55;
  const wallY = wallHeight / 2 - 0.08;
  const plaster = usePlasterTextures(room.kind === "lobby" ? 6 : 4.2, room.kind === "lobby" ? 3.2 : 2.6);
  const walnut = useWalnutTextures(
    room.kind === "lobby" ? Math.max(4, Math.round(width * 0.9)) : Math.max(3, Math.round(width * 0.68)),
    room.kind === "lobby" ? Math.max(4, Math.round(depth * 0.7)) : Math.max(3, Math.round(depth * 0.58)),
  );
  const wallColor = useMemo(() => {
    const color = new THREE.Color(room.color);
    color.lerp(new THREE.Color("#f0d6bd"), room.kind === "lobby" ? 0.72 : 0.62);
    return color.getStyle();
  }, [room.color, room.kind]);
  const floorColor = useMemo(() => new THREE.Color(room.color).lerp(new THREE.Color("#b99b8e"), 0.52).getStyle(), [room.color]);
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
      <mesh receiveShadow position={[0, -0.16, 0]}><boxGeometry args={[width, 0.34, depth]} /><meshStandardMaterial {...walnut} color={floorColor} bumpScale={0.022} roughness={0.78} metalness={0.02} emissive={floorColor} emissiveIntensity={0.04} /></mesh>
      <mesh receiveShadow position={[0, 4.45, 0]}><boxGeometry args={[width, 0.2, depth]} /><meshStandardMaterial {...plaster} color="#e2cdb5" bumpScale={0.02} roughness={0.94} /></mesh>
      <mesh receiveShadow position={[0, wallY, -halfDepth + 0.11]}><boxGeometry args={[width, wallHeight, 0.22]} /><meshStandardMaterial {...plaster} color={wallColor} bumpScale={0.04} roughness={0.9} /></mesh>
      {room.kind !== "lobby" ? <mesh receiveShadow position={[0, wallY, halfDepth - 0.11]}><boxGeometry args={[width, wallHeight, 0.22]} /><meshStandardMaterial {...plaster} color={wallColor} bumpScale={0.04} roughness={0.9} /></mesh> : null}

      {room.kind === "lobby" ? (
        <>
          {lobbyLeftSegments.map((segment) => (
            <mesh key={segment.z} receiveShadow position={[-halfWidth + 0.11, wallY, segment.z]}><boxGeometry args={[0.22, wallHeight, segment.depth]} /><meshStandardMaterial {...plaster} color={wallColor} bumpScale={0.04} roughness={0.9} /></mesh>
          ))}
          <mesh receiveShadow position={[-halfWidth + 0.11, 4, lobbyDoorLocalZ]}><boxGeometry args={[0.22, 0.92, 2.6]} /><meshStandardMaterial {...plaster} color={wallColor} bumpScale={0.04} roughness={0.9} /></mesh>
          <mesh receiveShadow position={[halfWidth - 0.11, wallY, 0]}><boxGeometry args={[0.22, wallHeight, depth]} /><meshStandardMaterial {...plaster} color={wallColor} bumpScale={0.04} roughness={0.9} /></mesh>
        </>
      ) : (
        <>
          <mesh receiveShadow position={[-halfWidth + 0.11, wallY, 0]}><boxGeometry args={[0.22, wallHeight, depth]} /><meshStandardMaterial {...plaster} color={wallColor} bumpScale={0.04} roughness={0.9} /></mesh>
          {bedroomRightSegments.map((segment) => (
            <mesh key={segment.z} receiveShadow position={[halfWidth - 0.11, wallY, segment.z]}><boxGeometry args={[0.22, wallHeight, segment.depth]} /><meshStandardMaterial {...plaster} color={wallColor} bumpScale={0.04} roughness={0.9} /></mesh>
          ))}
          <mesh receiveShadow position={[halfWidth - 0.11, 4, 0]}><boxGeometry args={[0.22, 0.92, 2.6]} /><meshStandardMaterial {...plaster} color={wallColor} bumpScale={0.04} roughness={0.9} /></mesh>
        </>
      )}

      <mesh position={[0, 0.16, -halfDepth + 0.24]}><boxGeometry args={[width - 0.24, 0.18, 0.14]} /><meshStandardMaterial {...walnut} color="#6b5147" roughness={0.52} /></mesh>
      <mesh position={[0, 4.16, -halfDepth + 0.24]}><boxGeometry args={[width, 0.2, 0.18]} /><BrassMaterial /></mesh>
      {[-0.42, -0.21, 0, 0.21, 0.42].map((ratio) => (
        <mesh key={ratio} castShadow position={[ratio * width, 4.18, 0]}>
          <boxGeometry args={[ratio === 0 ? 0.2 : 0.13, 0.2, depth]} />
          {ratio === 0 ? <meshStandardMaterial {...walnut} color="#5b4036" roughness={0.46} /> : <BrassMaterial />}
        </mesh>
      ))}

      {room.kind !== "lobby" ? (
        <>
          <Window position={[-2.75, 1.55, -halfDepth + 0.24]} width={1.9} lit={lit} />
          <Window position={[2.75, 1.55, -halfDepth + 0.24]} width={1.9} lit={lit} />
        </>
      ) : null}
    </group>
  );
}

export function AuthoredRoomScene({ room, active, onBackgroundClick }: { room: RoomPlan; active: boolean; onBackgroundClick?: () => void }) {
  const washLightColor = useMemo(() => {
    const base = new THREE.Color(room.color);
    base.lerp(new THREE.Color("#f3d3aa"), room.kind === "lobby" ? 0.45 : 0.5);
    return base.getStyle();
  }, [room.color, room.kind]);

  return (
    <group position={room.center} onClick={onBackgroundClick}>
      <RoomEnvelope room={room} lit={active} />
      {active ? <pointLight
        position={[0, 3.2, room.kind === "lobby" ? 1 : 0]}
        intensity={room.kind === "lobby" ? 6.6 : 5.2}
        distance={room.kind === "lobby" ? 20 : 16}
        decay={1.8}
        color={washLightColor}
      /> : null}
    </group>
  );
}
