"use client";

/* eslint-disable react-hooks/immutability -- Three.js render loops intentionally mutate scene objects. */

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { ExhibitPlan, RoomPlan, Vec3, WorldPlan } from "@/lib/types";

const INK = "#19171b";
const PAPER = "#f3e8d7";
const WOOD = "#5b382a";
const DARK_WOOD = "#34231f";
const BRASS = "#d4a15c";
const TEAL = "#65d7c3";
const CORAL = "#ff8b61";
const NIGHT = "#171720";

function CameraRig({ activeRoom, selectedExhibit, world }: { activeRoom: string; selectedExhibit?: string; world: WorldPlan }) {
  const { camera, pointer } = useThree();
  const lookAt = useMemo(() => new THREE.Vector3(), []);
  const lookAtTarget = useMemo(() => new THREE.Vector3(), []);
  const destination = useMemo(() => new THREE.Vector3(0, 5.6, 28), []);
  const frameDestination = useMemo(() => new THREE.Vector3(), []);
  const desiredZoom = useRef(38);

  useEffect(() => {
    const room = world.rooms.find((item) => item.id === activeRoom);
    const exhibit = world.exhibits.find((item) => item.id === selectedExhibit);
    if (exhibit) {
      lookAtTarget.set(exhibit.position[0], 0.85, exhibit.position[2]);
      destination.set(exhibit.position[0] + 3.2, 3.8, exhibit.position[2] + 5.2);
      desiredZoom.current = 75;
    } else if (room?.kind === "lobby") {
      lookAtTarget.set(0, 0.8, 1.4);
      destination.set(0, 6.5, 14.5);
      desiredZoom.current = 51;
    } else if (room) {
      lookAtTarget.set(room.center[0], 0.7, room.center[2]);
      destination.set(room.center[0] + (room.center[0] < 0 ? 3.8 : -3.8), 5.3, room.center[2] + 8.2);
      desiredZoom.current = 61;
    } else {
      lookAtTarget.set(0, 1.65, 2.2);
      destination.set(0, 5.6, 28);
      desiredZoom.current = 38;
    }
  }, [activeRoom, destination, lookAtTarget, selectedExhibit, world]);

  useFrame(() => {
    frameDestination.copy(destination);
    frameDestination.x += pointer.x * (activeRoom === "exterior" ? 0.4 : 0.7);
    frameDestination.y += pointer.y * 0.28;
    camera.position.lerp(frameDestination, 0.038);
    lookAt.lerp(lookAtTarget, 0.055);
    camera.lookAt(lookAt);
    if (camera instanceof THREE.OrthographicCamera) {
      camera.zoom = THREE.MathUtils.lerp(camera.zoom, desiredZoom.current, 0.055);
      camera.updateProjectionMatrix();
    }
  });
  return null;
}

function TextPanel({ title, subtitle, position, width = 4.4, rotation = [0, 0, 0] }: {
  title: string;
  subtitle: string;
  position: Vec3;
  width?: number;
  rotation?: Vec3;
}) {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 256;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#f3e8d7";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = INK;
    context.lineWidth = 7;
    context.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);
    context.fillStyle = INK;
    context.font = "700 72px Arial";
    context.fillText(title.toUpperCase(), 48, 108, 920);
    context.font = "30px Arial";
    context.fillStyle = "#6e5c51";
    context.fillText(subtitle, 50, 177, 900);
    const result = new THREE.CanvasTexture(canvas);
    result.colorSpace = THREE.SRGBColorSpace;
    result.anisotropy = 4;
    return result;
  }, [subtitle, title]);

  useEffect(() => () => texture.dispose(), [texture]);

  return (
    <mesh position={position} rotation={rotation}>
      <planeGeometry args={[width, 1.08]} />
      <meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>
  );
}

function VillaExterior({ onEnter }: { onEnter: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <group>
      <mesh receiveShadow position={[0, -0.62, 0]}><boxGeometry args={[26.4, 0.9, 15.3]} /><meshStandardMaterial color="#302720" roughness={0.96} /></mesh>
      <mesh receiveShadow position={[0, -1.08, 4.1]}><boxGeometry args={[30, 0.18, 15]} /><meshStandardMaterial color="#202027" roughness={1} /></mesh>
      <mesh receiveShadow position={[0, 1.9, 7.2]}><boxGeometry args={[25.4, 4.8, 0.48]} /><meshStandardMaterial color="#d39a6e" roughness={0.92} /></mesh>
      <mesh position={[0, 0.05, 7.5]}><boxGeometry args={[25.6, 0.75, 0.24]} /><meshStandardMaterial color="#6a4636" roughness={0.86} /></mesh>
      {[-12.25, 12.25].map((x) => <mesh key={x} position={[x, 2.15, 7.48]}><boxGeometry args={[0.5, 5.2, 0.5]} /><meshStandardMaterial color={DARK_WOOD} /></mesh>)}

      {[-7.7, 7.7].map((x) => (
        <group key={x} position={[x, 2.05, 7.51]}>
          <mesh><boxGeometry args={[4.4, 2.45, 0.18]} /><meshStandardMaterial color={DARK_WOOD} /></mesh>
          <mesh position={[0, 0, 0.12]}><planeGeometry args={[3.95, 2.02]} /><meshStandardMaterial color="#315365" emissive="#234657" emissiveIntensity={0.55} roughness={0.24} /></mesh>
          <mesh position={[0, 0, 0.22]}><boxGeometry args={[0.12, 2.05, 0.08]} /><meshStandardMaterial color={BRASS} /></mesh>
          <mesh position={[0, 0, 0.22]}><boxGeometry args={[3.98, 0.12, 0.08]} /><meshStandardMaterial color={BRASS} /></mesh>
          <mesh position={[0, -1.42, 0.26]}><boxGeometry args={[4.8, 0.28, 0.56]} /><meshStandardMaterial color="#8c5e48" /></mesh>
        </group>
      ))}

      <group
        position={[0, 0, 7.58]}
        onClick={(event) => { event.stopPropagation(); onEnter(); }}
        onPointerOver={(event) => { event.stopPropagation(); setHovered(true); document.body.style.cursor = "pointer"; }}
        onPointerOut={() => { setHovered(false); document.body.style.cursor = "default"; }}
      >
        <mesh castShadow position={[0, 1.42, 0]} scale={hovered ? 1.035 : 1}><boxGeometry args={[2.45, 2.95, 0.28]} /><meshStandardMaterial color={hovered ? "#704a3c" : DARK_WOOD} roughness={0.72} emissive={hovered ? CORAL : INK} emissiveIntensity={hovered ? 0.18 : 0} /></mesh>
        <mesh position={[0, 1.55, 0.17]}><boxGeometry args={[1.72, 1.78, 0.06]} /><meshStandardMaterial color="#4c756f" roughness={0.7} /></mesh>
        <mesh position={[0.82, 1.38, 0.23]}><sphereGeometry args={[0.12, 12, 8]} /><meshStandardMaterial color={BRASS} metalness={0.45} roughness={0.3} /></mesh>
        <mesh position={[0, 3.35, -0.06]}><boxGeometry args={[4.8, 0.28, 1.25]} /><meshStandardMaterial color={DARK_WOOD} /></mesh>
        {[-2.05, 2.05].map((x) => <mesh key={x} position={[x, 1.75, -0.05]}><boxGeometry args={[0.18, 3.15, 0.18]} /><meshStandardMaterial color={BRASS} /></mesh>)}
        <TextPanel title="LIN CHEN" subtitle="OPEN THE DOOR" position={[0, 4.02, 0.03]} width={3.5} />
        {hovered ? <mesh position={[0, 1.4, 0.35]}><planeGeometry args={[3, 3.45]} /><meshBasicMaterial color={CORAL} transparent opacity={0.12} toneMapped={false} /></mesh> : null}
      </group>

      <mesh position={[-6.2, 5.1, 0.15]} rotation={[0, 0, 0.32]}><boxGeometry args={[13.8, 0.38, 15.2]} /><meshStandardMaterial color="#6b3e36" roughness={0.88} /></mesh>
      <mesh position={[6.2, 5.1, 0.15]} rotation={[0, 0, -0.32]}><boxGeometry args={[13.8, 0.38, 15.2]} /><meshStandardMaterial color="#76463b" roughness={0.88} /></mesh>
      <mesh position={[0, 7.25, 0.1]}><boxGeometry args={[0.38, 0.38, 15.4]} /><meshStandardMaterial color={BRASS} /></mesh>
      <group position={[9.5, 0, 0.6]}><mesh position={[0, 5.3, 0]}><boxGeometry args={[1.25, 4.1, 1.25]} /><meshStandardMaterial color="#7b4437" /></mesh><mesh position={[0, 7.36, 0]}><boxGeometry args={[1.55, 0.22, 1.55]} /><meshStandardMaterial color={DARK_WOOD} /></mesh></group>

      {[-10.2, -5.4, 5.4, 10.2].map((x, index) => <LowPolyPlant key={x} position={[x, -0.14, 9]} scale={index % 2 ? 1.25 : 1.55} />)}
      {[0, 1, 2].map((step) => <mesh key={step} receiveShadow position={[0, -0.25 - step * 0.17, 8.45 + step * 0.55]}><boxGeometry args={[4.8 - step * 0.35, 0.18, 1.2]} /><meshStandardMaterial color={step % 2 ? "#a56e4f" : "#c58a61"} /></mesh>)}
      <mesh receiveShadow position={[0, -0.97, 15]}><boxGeometry args={[3.2, 0.05, 12]} /><meshStandardMaterial color="#92735e" roughness={1} /></mesh>
    </group>
  );
}

function WindowFrame({ position, width = 1.45 }: { position: Vec3; width?: number }) {
  return (
    <group position={position}>
      <mesh><boxGeometry args={[width, 1.45, 0.07]} /><meshStandardMaterial color={DARK_WOOD} roughness={0.8} /></mesh>
      <mesh position={[0, 0, 0.05]}><planeGeometry args={[width - 0.18, 1.27]} /><meshStandardMaterial color="#263d48" emissive="#275669" emissiveIntensity={0.45} roughness={0.25} /></mesh>
      <mesh position={[0, 0, 0.09]}><boxGeometry args={[0.06, 1.28, 0.04]} /><meshStandardMaterial color={BRASS} /></mesh>
      <mesh position={[0, 0, 0.09]}><boxGeometry args={[width - 0.14, 0.06, 0.04]} /><meshStandardMaterial color={BRASS} /></mesh>
    </group>
  );
}

function RoomShell({ room, active, canFocus, onFocus }: { room: RoomPlan; active: boolean; canFocus: boolean; onFocus: () => void }) {
  const [x, , z] = room.center;
  const [width, , depth] = room.size;
  const back = -depth / 2 + 0.11;
  const left = -width / 2 + 0.11;
  const signWidth = Math.min(4.5, width - 1.8);
  return (
    <group
      position={[x, 0, z]}
      onClick={(event) => { if (canFocus) { event.stopPropagation(); onFocus(); } }}
      onPointerOver={(event) => { if (canFocus) { event.stopPropagation(); document.body.style.cursor = "pointer"; } }}
      onPointerOut={() => { if (canFocus) document.body.style.cursor = "default"; }}
    >
      <mesh receiveShadow position={[0, -0.15, 0]}>
        <boxGeometry args={[width, 0.32, depth]} />
        <meshStandardMaterial color={room.color} roughness={0.83} metalness={0.02} />
      </mesh>
      <mesh receiveShadow position={[0, 1.78, back]}>
        <boxGeometry args={[width, 3.72, 0.22]} />
        <meshStandardMaterial color={room.color} roughness={0.96} />
      </mesh>
      {room.kind !== "lobby" ? <mesh receiveShadow position={[left, 1.48, 0]}><boxGeometry args={[0.22, 3.12, depth]} /><meshStandardMaterial color={room.color} roughness={0.96} /></mesh> : null}

      <mesh position={[0, 0.16, back + 0.13]}><boxGeometry args={[width - 0.25, 0.18, 0.12]} /><meshStandardMaterial color={DARK_WOOD} /></mesh>
      {room.kind !== "lobby" ? <mesh position={[left + 0.13, 0.16, 0]}><boxGeometry args={[0.12, 0.18, depth - 0.25]} /><meshStandardMaterial color={DARK_WOOD} /></mesh> : null}
      <mesh position={[0, 3.56, back + 0.13]}><boxGeometry args={[width, 0.18, 0.16]} /><meshStandardMaterial color={BRASS} roughness={0.55} /></mesh>
      {room.kind !== "lobby" ? <mesh position={[left + 0.13, 3.02, 0]}><boxGeometry args={[0.16, 0.18, depth]} /><meshStandardMaterial color={BRASS} roughness={0.55} /></mesh> : null}

      {width > 9 ? (
        <>
          <WindowFrame position={[-width * 0.29, 1.35, back + 0.15]} />
          <WindowFrame position={[width * 0.29, 1.35, back + 0.15]} />
        </>
      ) : <WindowFrame position={[width * 0.27, 1.35, back + 0.15]} />}
      <TextPanel title={room.title} subtitle={room.subtitle} position={[-width * 0.1, 2.62, back + 0.16]} width={signWidth} />

      <mesh position={[0, 0.025, 0]}>
        <boxGeometry args={[width - 0.38, 0.035, depth - 0.38]} />
        <meshBasicMaterial color={active ? CORAL : INK} transparent opacity={active ? 0.13 : 0.035} />
      </mesh>
      {[-0.28, 0.28].map((ratio) => (
        <mesh key={ratio} position={[ratio * width, 0.055, 0]}>
          <boxGeometry args={[0.025, 0.02, depth - 0.5]} />
          <meshBasicMaterial color={PAPER} transparent opacity={0.16} />
        </mesh>
      ))}
    </group>
  );
}

function InteriorArchitecture() {
  const rafters = [-12, -8, -4, 0, 4, 8, 12];
  const columns: Vec3[] = [[-12.45, 0, -6.95], [-12.45, 0, 7], [12.45, 0, -6.95], [12.45, 0, 7]];
  return (
    <group>
      <mesh receiveShadow position={[0, -0.55, 0]}><boxGeometry args={[25.5, 0.72, 14.6]} /><meshStandardMaterial color="#322923" roughness={0.95} /></mesh>
      <mesh receiveShadow position={[0, -0.98, 0.8]}><boxGeometry args={[27, 0.22, 16.4]} /><meshStandardMaterial color="#1f1d21" roughness={0.92} /></mesh>
      <mesh position={[0, -0.79, 7.35]}><boxGeometry args={[26.2, 0.38, 0.55]} /><meshStandardMaterial color={WOOD} roughness={0.84} /></mesh>

      {columns.map((position, index) => (
        <group key={index} position={position}>
          <mesh castShadow position={[0, 1.8, 0]}><boxGeometry args={[0.34, 3.9, 0.34]} /><meshStandardMaterial color={DARK_WOOD} roughness={0.75} /></mesh>
          <mesh position={[0, 3.75, 0]}><octahedronGeometry args={[0.3, 0]} /><meshStandardMaterial color={BRASS} metalness={0.35} roughness={0.4} /></mesh>
        </group>
      ))}
      <mesh position={[0, 3.92, -6.95]}><boxGeometry args={[25.2, 0.28, 0.28]} /><meshStandardMaterial color={DARK_WOOD} /></mesh>
      <mesh position={[0, 3.92, 7]}><boxGeometry args={[25.2, 0.28, 0.28]} /><meshStandardMaterial color={DARK_WOOD} /></mesh>
      <mesh position={[-12.45, 3.92, 0]}><boxGeometry args={[0.28, 0.28, 14]} /><meshStandardMaterial color={DARK_WOOD} /></mesh>
      <mesh position={[12.45, 3.92, 0]}><boxGeometry args={[0.28, 0.28, 14]} /><meshStandardMaterial color={DARK_WOOD} /></mesh>

      {rafters.map((x) => (
        <group key={x} position={[x, 0, 0]}>
          <mesh position={[0, 4.72, 2.05]} rotation={[0.48, 0, 0]}><boxGeometry args={[0.2, 0.2, 4.9]} /><meshStandardMaterial color={BRASS} roughness={0.58} /></mesh>
          <mesh position={[0, 4.72, -2.05]} rotation={[-0.48, 0, 0]}><boxGeometry args={[0.2, 0.2, 4.9]} /><meshStandardMaterial color={BRASS} roughness={0.58} /></mesh>
        </group>
      ))}
      <mesh position={[0, 5.8, 0]}><boxGeometry args={[25, 0.25, 0.25]} /><meshStandardMaterial color={DARK_WOOD} /></mesh>
      <group position={[10.7, 0, -5.55]}>
        <mesh position={[0, 2.05, 0]}><cylinderGeometry args={[0.48, 0.58, 4.2, 10]} /><meshStandardMaterial color="#7a4337" roughness={0.86} /></mesh>
        <mesh position={[0, 4.15, 0]}><cylinderGeometry args={[0.62, 0.44, 0.22, 10]} /><meshStandardMaterial color={DARK_WOOD} /></mesh>
      </group>
    </group>
  );
}

const roomDoorSpecs: Array<{ roomId: string; title: string; subtitle: string; position: Vec3; side: "left" | "right"; color: string }> = [
  { roomId: "room-projects", title: "PROJECTS", subtitle: "左前门", position: [-3.56, 0, 4.45], side: "left", color: "#6678bd" },
  { roomId: "room-skills", title: "TOOLS", subtitle: "左后门", position: [-3.56, 0, -1.15], side: "left", color: "#39766f" },
  { roomId: "room-experience", title: "TIMELINE", subtitle: "右前门", position: [3.56, 0, 4.45], side: "right", color: "#b76555" },
  { roomId: "room-achievements", title: "SIGNALS", subtitle: "右后门", position: [3.56, 0, -1.15], side: "right", color: "#83568d" },
];

function RoomDoor({ spec, onEnter }: { spec: (typeof roomDoorSpecs)[number]; onEnter: (roomId: string) => void }) {
  const [hovered, setHovered] = useState(false);
  const rotationY = spec.side === "left" ? Math.PI / 2 : -Math.PI / 2;
  return (
    <group
      position={spec.position}
      rotation={[0, rotationY, 0]}
      onClick={(event) => { event.stopPropagation(); onEnter(spec.roomId); }}
      onPointerOver={(event) => { event.stopPropagation(); setHovered(true); document.body.style.cursor = "pointer"; }}
      onPointerOut={() => { setHovered(false); document.body.style.cursor = "default"; }}
    >
      {[-1, 1].map((x) => <mesh key={x} position={[x, 1.25, 0]}><boxGeometry args={[0.16, 2.5, 0.28]} /><meshStandardMaterial color={BRASS} /></mesh>)}
      <mesh position={[0, 2.47, 0]}><boxGeometry args={[2.15, 0.18, 0.3]} /><meshStandardMaterial color={DARK_WOOD} /></mesh>
      <mesh position={[0, 1.2, 0.04]}><planeGeometry args={[1.8, 2.2]} /><meshStandardMaterial color={spec.color} emissive={hovered ? spec.color : INK} emissiveIntensity={hovered ? 0.38 : 0.05} roughness={0.82} /></mesh>
      <mesh position={[0.72, 1.18, 0.11]}><sphereGeometry args={[0.1, 10, 8]} /><meshStandardMaterial color={BRASS} /></mesh>
      <TextPanel title={spec.title} subtitle={spec.subtitle} position={[0, 2.95, 0.02]} width={2.5} />
      <mesh position={[0, 0.05, 0.58]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[2.15, 1]} /><meshBasicMaterial color={hovered ? CORAL : TEAL} transparent opacity={hovered ? 0.4 : 0.14} toneMapped={false} /></mesh>
    </group>
  );
}

function LowPolyPlant({ position, scale = 1 }: { position: Vec3; scale?: number }) {
  return (
    <group position={position} scale={scale}>
      <mesh castShadow position={[0, 0.25, 0]}><cylinderGeometry args={[0.28, 0.2, 0.5, 7]} /><meshStandardMaterial color="#b06145" roughness={0.85} /></mesh>
      <mesh castShadow position={[0, 0.7, 0]} rotation={[0.2, 0, -0.25]}><octahedronGeometry args={[0.4, 0]} /><meshStandardMaterial color="#3d7655" roughness={0.8} /></mesh>
      <mesh castShadow position={[0.18, 1.02, -0.02]} rotation={[0, 0.2, 0.55]}><octahedronGeometry args={[0.3, 0]} /><meshStandardMaterial color="#6a9d6f" roughness={0.8} /></mesh>
      <mesh castShadow position={[-0.2, 0.93, 0.03]} rotation={[0, -0.3, -0.45]}><octahedronGeometry args={[0.26, 0]} /><meshStandardMaterial color="#2d694c" roughness={0.8} /></mesh>
    </group>
  );
}

function Pendant({ position, color = CORAL }: { position: Vec3; color?: string }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.78, 0]}><cylinderGeometry args={[0.025, 0.025, 1.55, 8]} /><meshStandardMaterial color={DARK_WOOD} /></mesh>
      <mesh><coneGeometry args={[0.32, 0.38, 16, 1, true]} /><meshStandardMaterial color={BRASS} metalness={0.25} roughness={0.48} side={THREE.DoubleSide} /></mesh>
      <mesh position={[0, -0.12, 0]}><sphereGeometry args={[0.13, 12, 8]} /><meshBasicMaterial color={color} toneMapped={false} /></mesh>
    </group>
  );
}

function Shelf({ position, width = 2.6, color = DARK_WOOD }: { position: Vec3; width?: number; color?: string }) {
  return (
    <group position={position}>
      {[-width / 2, width / 2].map((x) => <mesh key={x} position={[x, 0.8, 0]}><boxGeometry args={[0.12, 1.75, 0.48]} /><meshStandardMaterial color={color} /></mesh>)}
      {[0, 0.55, 1.1, 1.65].map((y) => <mesh key={y} position={[0, y, 0]}><boxGeometry args={[width + 0.12, 0.11, 0.52]} /><meshStandardMaterial color={color} /></mesh>)}
      {[-0.85, -0.28, 0.25, 0.8].map((x, index) => (
        <mesh key={x} position={[x * (width / 2.6), 0.27 + (index % 3) * 0.55, 0.05]} rotation={[0, 0, index % 2 ? 0.06 : -0.04]}>
          <boxGeometry args={[0.25, 0.38, 0.38]} /><meshStandardMaterial color={[CORAL, TEAL, "#e8c06d", "#7c6ec2"][index]} />
        </mesh>
      ))}
    </group>
  );
}

function Table({ position, width = 2.4 }: { position: Vec3; width?: number }) {
  return (
    <group position={position}>
      <mesh castShadow position={[0, 0.72, 0]}><boxGeometry args={[width, 0.16, 1.05]} /><meshStandardMaterial color={WOOD} roughness={0.76} /></mesh>
      {[-0.85, 0.85].map((x) => <mesh key={x} position={[x * width / 2.4, 0.34, 0]}><boxGeometry args={[0.14, 0.72, 0.82]} /><meshStandardMaterial color={DARK_WOOD} /></mesh>)}
    </group>
  );
}

function RoomDecor({ room }: { room: RoomPlan }) {
  const [x, , z] = room.center;
  if (room.kind === "lobby") {
    return (
      <group position={[x, 0, z]}>
        <mesh position={[-0.4, 0.05, 0.7]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[1.65, 32]} /><meshStandardMaterial color="#d7ad70" roughness={0.98} /></mesh>
        <group position={[-1.45, 0, 1.25]}>
          <mesh castShadow position={[0, 0.55, 0]}><boxGeometry args={[2.1, 0.72, 0.82]} /><meshStandardMaterial color="#684f75" roughness={0.9} /></mesh>
          <mesh position={[0, 0.95, -0.28]}><boxGeometry args={[2.1, 0.72, 0.25]} /><meshStandardMaterial color="#7d618d" /></mesh>
          {[-0.86, 0.86].map((offset) => <mesh key={offset} position={[offset, 0.54, 0]}><boxGeometry args={[0.24, 0.78, 0.92]} /><meshStandardMaterial color="#523f5d" /></mesh>)}
        </group>
        <group position={[1.75, 0, -0.1]}>
          <mesh castShadow position={[0, 0.55, 0]}><cylinderGeometry args={[0.92, 1.04, 1.1, 16, 1, false, 0, Math.PI]} /><meshStandardMaterial color={WOOD} roughness={0.78} /></mesh>
          <mesh position={[0, 0.72, 0.58]}><boxGeometry args={[1.05, 0.32, 0.08]} /><meshBasicMaterial color={TEAL} toneMapped={false} /></mesh>
        </group>
        <LowPolyPlant position={[2.75, 0, 2.7]} scale={1.05} />
        <LowPolyPlant position={[-2.85, 0, -2.3]} scale={0.88} />
        <Pendant position={[0, 3.05, 0.6]} />
      </group>
    );
  }
  if (room.kind === "projects") {
    return (
      <group position={[x, 0, z]}>
        <Table position={[0.5, 0, 1.55]} width={3.8} />
        {[-0.85, 0, 0.85].map((offset, index) => (
          <mesh key={offset} position={[offset + 0.5, 0.98, 1.55]} rotation={[0.12, index * 0.45, 0]}><icosahedronGeometry args={[0.25 + index * 0.04, 0]} /><meshStandardMaterial color={[TEAL, CORAL, "#f1c86a"][index]} metalness={0.1} roughness={0.5} /></mesh>
        ))}
        <Shelf position={[-2.55, 0, -2.75]} width={1.6} />
        <group position={[2.65, 0, -2.5]}>
          {[0, 1, 2].map((n) => <mesh key={n} position={[0, 0.25 + n * 0.5, 0]} rotation={[0, n * 0.34, 0]}><boxGeometry args={[1.25 - n * 0.12, 0.42, 0.75]} /><meshStandardMaterial color={["#33475b", "#536e85", "#8f6b62"][n]} /></mesh>)}
        </group>
        <Pendant position={[-0.8, 3.05, 0.8]} color={TEAL} />
        <Pendant position={[1.7, 3.05, 0.8]} color="#f1c86a" />
      </group>
    );
  }
  if (room.kind === "experience") {
    return (
      <group position={[x, 0, z]}>
        <mesh position={[0, 0.06, 1.4]}><boxGeometry args={[5.8, 0.09, 0.14]} /><meshStandardMaterial color={BRASS} /></mesh>
        {[-2.4, -1.2, 0, 1.2, 2.4].map((offset, index) => (
          <group key={offset} position={[offset, 0, 1.4]}>
            <mesh position={[0, 0.23, 0]}><cylinderGeometry args={[0.13, 0.13, 0.42, 12]} /><meshStandardMaterial color={index % 2 ? TEAL : CORAL} /></mesh>
            <mesh position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[0.21, 0.27, 18]} /><meshBasicMaterial color={PAPER} side={THREE.DoubleSide} /></mesh>
          </group>
        ))}
        <Shelf position={[2.3, 0, -2.72]} width={2.15} color="#44343c" />
        <group position={[-2.45, 1.05, -2.7]}>
          <mesh><cylinderGeometry args={[0.72, 0.72, 0.16, 32]} /><meshStandardMaterial color={PAPER} /></mesh>
          {[0, Math.PI / 2, Math.PI, Math.PI * 1.5].map((angle) => <mesh key={angle} position={[Math.cos(angle) * 0.5, Math.sin(angle) * 0.5, 0.1]}><boxGeometry args={[0.05, 0.12, 0.04]} /><meshBasicMaterial color={INK} /></mesh>)}
          <mesh position={[0.14, 0.12, 0.11]} rotation={[0, 0, -0.65]}><boxGeometry args={[0.04, 0.48, 0.04]} /><meshBasicMaterial color={INK} /></mesh>
        </group>
        <LowPolyPlant position={[2.8, 0, 2.7]} scale={0.8} />
      </group>
    );
  }
  if (room.kind === "skills") {
    return (
      <group position={[x, 0, z]}>
        <Shelf position={[-3.1, 0, -2.35]} width={1.45} color="#243a3a" />
        <Shelf position={[3.05, 0, -2.35]} width={1.45} color="#243a3a" />
        {[-2.25, -0.75, 0.75, 2.25].map((offset, index) => (
          <group key={offset} position={[offset, 0, 1.7]}>
            <mesh castShadow position={[0, 0.62, 0]}><boxGeometry args={[1.05, 1.25, 0.72]} /><meshStandardMaterial color="#243137" roughness={0.72} /></mesh>
            {[0.32, 0.05, -0.22].map((y, light) => <mesh key={y} position={[0, 0.65 + y, 0.37]}><boxGeometry args={[0.62, 0.08, 0.04]} /><meshBasicMaterial color={light === index % 3 ? CORAL : TEAL} toneMapped={false} /></mesh>)}
          </group>
        ))}
        <mesh position={[0, 0.055, 0.1]} rotation={[-Math.PI / 2, 0, 0]}><torusGeometry args={[2.15, 0.055, 8, 48, Math.PI * 1.6]} /><meshBasicMaterial color={TEAL} toneMapped={false} /></mesh>
        <Pendant position={[0, 3.05, -0.25]} color={TEAL} />
        <LowPolyPlant position={[-3.35, 0, 2.5]} scale={0.82} />
      </group>
    );
  }
  return (
    <group position={[x, 0, z]}>
      {[0, 1, 2, 3].map((step) => (
        <mesh key={step} receiveShadow position={[0.9, 0.13 + step * 0.17, -2.6 + step * 0.3]}>
          <boxGeometry args={[6.2 - step * 0.58, 0.25, 0.78]} />
          <meshStandardMaterial color={step % 2 ? "#6c4876" : "#9f6b96"} roughness={0.8} />
        </mesh>
      ))}
      {[-2.5, 0.9, 3.2].map((offset, index) => (
        <group key={offset} position={[offset, 0, 1.65]}>
          <mesh position={[0, 0.42, 0]}><cylinderGeometry args={[0.42, 0.55, 0.84, 10]} /><meshStandardMaterial color={DARK_WOOD} /></mesh>
          <mesh position={[0, 1.05, 0]} rotation={[0.15, index, 0.12]}>{index === 1 ? <torusKnotGeometry args={[0.28, 0.075, 48, 7]} /> : <octahedronGeometry args={[0.4, 0]} />}<meshStandardMaterial color={index === 2 ? TEAL : BRASS} metalness={0.35} roughness={0.35} /></mesh>
        </group>
      ))}
      <Pendant position={[-1.2, 3.08, 0]} color="#f1c86a" />
      <Pendant position={[2.4, 3.08, 0]} color={CORAL} />
    </group>
  );
}

function ProjectArtifact({ variant, color }: { variant: number; color: string }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((state) => { if (ref.current) ref.current.rotation.y = state.clock.elapsedTime * (variant === 0 ? 0.32 : 0.12); });
  if (variant === 0) return <group ref={ref} position={[0, 1.05, 0]}><mesh rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.4, 0.04, 8, 32]} /><meshStandardMaterial color={TEAL} emissive={TEAL} emissiveIntensity={0.15} /></mesh><mesh rotation={[0.35, 0.8, 0]}><torusGeometry args={[0.31, 0.035, 8, 32]} /><meshStandardMaterial color={BRASS} /></mesh><mesh><octahedronGeometry args={[0.16, 0]} /><meshStandardMaterial color={CORAL} /></mesh></group>;
  if (variant === 1) return <group ref={ref} position={[0, 0.92, 0]}><mesh position={[0, 0.12, 0]}><boxGeometry args={[0.62, 0.34, 0.62]} /><meshStandardMaterial color={color} /></mesh><mesh position={[0.47, 0.04, 0]}><boxGeometry args={[0.28, 0.25, 0.42]} /><meshStandardMaterial color={CORAL} /></mesh><mesh position={[-0.47, 0.04, 0]}><boxGeometry args={[0.28, 0.25, 0.42]} /><meshStandardMaterial color={TEAL} /></mesh></group>;
  return <group ref={ref} position={[0, 0.95, 0]}><mesh position={[-0.32, 0, 0]}><sphereGeometry args={[0.2, 12, 8]} /><meshStandardMaterial color={BRASS} /></mesh><mesh position={[0.03, 0.02, 0]}><coneGeometry args={[0.2, 0.44, 6]} /><meshStandardMaterial color={color} /></mesh><mesh position={[0.36, 0, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.18, 0.06, 8, 18]} /><meshStandardMaterial color={TEAL} /></mesh></group>;
}

function ExhibitVisual({ exhibit }: { exhibit: ExhibitPlan }) {
  const numericId = Number(exhibit.id.replace(/\D/g, "")) || 0;
  if (exhibit.kind === "panel") return <group><mesh castShadow position={[0, 0.72, 0]}><boxGeometry args={[1.15, 1.55, 0.22]} /><meshStandardMaterial color={DARK_WOOD} /></mesh><mesh position={[0, 0.77, 0.121]}><planeGeometry args={[0.82, 1.08]} /><meshBasicMaterial color={PAPER} /></mesh><mesh position={[0, 0.28, 0.13]}><planeGeometry args={[0.52, 0.045]} /><meshBasicMaterial color={CORAL} /></mesh></group>;
  if (exhibit.kind === "pedestal") return <group><mesh castShadow position={[0, 0.34, 0]}><cylinderGeometry args={[0.56, 0.68, 0.68, 8]} /><meshStandardMaterial color="#d2b891" roughness={0.72} /></mesh><mesh position={[0, 0.7, 0]}><cylinderGeometry args={[0.59, 0.59, 0.06, 8]} /><meshStandardMaterial color={DARK_WOOD} /></mesh><ProjectArtifact variant={numericId % 3} color={exhibit.color} /></group>;
  if (exhibit.kind === "timeline") return <group><mesh castShadow position={[0, 0.72, 0]}><boxGeometry args={[0.16, 1.44, 0.16]} /><meshStandardMaterial color={DARK_WOOD} /></mesh><mesh castShadow position={[0, 1.34, 0.02]}><cylinderGeometry args={[0.3, 0.3, 0.12, 20]} /><meshStandardMaterial color={numericId % 2 ? TEAL : CORAL} /></mesh><mesh position={[0.38, 1.06, 0]}><boxGeometry args={[0.56, 0.32, 0.12]} /><meshStandardMaterial color={PAPER} /></mesh></group>;
  if (exhibit.kind === "terminal") return <group><mesh castShadow position={[0, 0.32, 0]} rotation={[-0.22, 0, 0]}><boxGeometry args={[1.05, 0.52, 0.65]} /><meshStandardMaterial color="#26383d" roughness={0.76} /></mesh><mesh position={[0, 0.42, 0.31]} rotation={[-0.22, 0, 0]}><planeGeometry args={[0.68, 0.23]} /><meshBasicMaterial color={numericId % 3 === 0 ? CORAL : TEAL} toneMapped={false} /></mesh></group>;
  return <group><mesh castShadow position={[0, 0.34, 0]}><cylinderGeometry args={[0.5, 0.62, 0.68, 8]} /><meshStandardMaterial color={DARK_WOOD} /></mesh><mesh castShadow position={[0, 1, 0]} rotation={[0.2, numericId * 0.4, 0.1]}>{numericId % 2 ? <octahedronGeometry args={[0.43, 0]} /> : <torusKnotGeometry args={[0.28, 0.085, 48, 7]} />}<meshStandardMaterial color={BRASS} metalness={0.35} roughness={0.35} /></mesh></group>;
}

function Exhibit({ exhibit, selected, onSelect }: { exhibit: ExhibitPlan; selected: boolean; onSelect: (id: string) => void }) {
  const [hovered, setHovered] = useState(false);
  const group = useRef<THREE.Group>(null);
  const baseY = exhibit.position[1] - 0.62;
  useFrame((state) => {
    if (!group.current) return;
    const targetScale = selected ? 1.12 : hovered ? 1.07 : 1;
    const nextScale = THREE.MathUtils.lerp(group.current.scale.x, targetScale, 0.14);
    group.current.scale.setScalar(nextScale);
    if (exhibit.kind === "pedestal" || exhibit.kind === "trophy") group.current.position.y = baseY + Math.sin(state.clock.elapsedTime * 1.5 + exhibit.position[0]) * 0.025;
  });
  return (
    <group ref={group} position={[exhibit.position[0], baseY, exhibit.position[2]]} onClick={(event) => { event.stopPropagation(); onSelect(exhibit.id); }} onPointerOver={(event) => { event.stopPropagation(); setHovered(true); document.body.style.cursor = "pointer"; }} onPointerOut={() => { setHovered(false); document.body.style.cursor = "default"; }}>
      <ExhibitVisual exhibit={exhibit} />
      <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[0.68, selected ? 0.8 : hovered ? 0.76 : 0.71, 32]} /><meshBasicMaterial color={selected ? CORAL : TEAL} transparent opacity={selected ? 0.95 : hovered ? 0.7 : 0.14} side={THREE.DoubleSide} toneMapped={false} /></mesh>
    </group>
  );
}

export function WorldCanvas({ world, activeRoom, selectedExhibit, onSelect, onRoomChange }: { world: WorldPlan; activeRoom: string; selectedExhibit?: string; onSelect: (id: string) => void; onRoomChange: (roomId: string) => void }) {
  const exterior = activeRoom === "exterior";
  return (
    <Canvas orthographic dpr={[1, 1.35]} shadows camera={{ position: [0, 5.6, 28], zoom: 38, near: 0.1, far: 120 }} gl={{ antialias: true, powerPreference: "high-performance" }} onPointerMissed={() => onSelect("")}>
      <color attach="background" args={[world.brief.palette.background]} />
      <fog attach="fog" args={[world.brief.palette.background, 42, 76]} />
      <ambientLight intensity={0.62} color="#ead9c4" />
      <hemisphereLight intensity={0.78} color="#bfd6e8" groundColor="#432f2a" />
      <directionalLight castShadow position={[14, 22, 12]} intensity={2.7} color="#ffd8ad" shadow-mapSize={[2048, 2048]} shadow-camera-left={-26} shadow-camera-right={26} shadow-camera-top={24} shadow-camera-bottom={-24} />
      <pointLight position={[-7, 5, 5]} intensity={18} distance={13} decay={2} color={CORAL} />
      <pointLight position={[6, 4, -3]} intensity={14} distance={12} decay={2} color={TEAL} />
      <CameraRig activeRoom={activeRoom} selectedExhibit={selectedExhibit} world={world} />
      {exterior ? <VillaExterior onEnter={() => onRoomChange("room-lobby")} /> : (
        <>
          <InteriorArchitecture />
          {world.rooms.map((room) => (
            <group key={room.id}>
              <RoomShell
                room={room}
                active={activeRoom === room.id}
                canFocus={activeRoom === "room-lobby" && room.kind !== "lobby"}
                onFocus={() => onRoomChange(room.id)}
              />
              <RoomDecor room={room} />
            </group>
          ))}
          {activeRoom === "room-lobby" ? roomDoorSpecs.map((spec) => <RoomDoor key={spec.roomId} spec={spec} onEnter={onRoomChange} />) : null}
          {world.exhibits.filter((exhibit) => exhibit.roomId === activeRoom).map((exhibit) => <Exhibit key={exhibit.id} exhibit={exhibit} selected={selectedExhibit === exhibit.id} onSelect={onSelect} />)}
        </>
      )}
      <gridHelper args={[52, 52, "#3c3440", "#25232b"]} position={[0, -1.11, 0]} />
      <mesh position={[0, -1.13, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[90, 90]} /><meshStandardMaterial color={NIGHT} roughness={1} /></mesh>
    </Canvas>
  );
}
