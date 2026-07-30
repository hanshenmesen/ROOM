"use client";

/* eslint-disable react-hooks/immutability -- Three.js render loops intentionally mutate scene objects. */

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { ExhibitPlan, Vec3, WorldPlan } from "@/lib/types";
import { AuthoredRoomScene } from "./AuthoredRoomScene";
import {
  ModelLoadingStage,
  OpenSourceRoomDressing,
  PortfolioEnvironment,
  RendererLook,
} from "./OpenSourceRoomDressing";

const INK = "#19171b";
const DARK_WOOD = "#34231f";
const BRASS = "#d4a15c";
const TEAL = "#65d7c3";
const CORAL = "#ff8b61";

function CameraRig({ activeRoom, selectedExhibit, world }: { activeRoom: string; selectedExhibit?: string; world: WorldPlan }) {
  const { camera, pointer } = useThree();
  const lookAt = useMemo(() => new THREE.Vector3(), []);
  const lookAtTarget = useMemo(() => new THREE.Vector3(), []);
  const destination = useMemo(() => new THREE.Vector3(0, 1.05, 23.5), []);
  const frameDestination = useMemo(() => new THREE.Vector3(), []);
  const desiredFov = useRef(48);
  const previousRoom = useRef(activeRoom);

  useEffect(() => {
    const room = world.rooms.find((item) => item.id === activeRoom);
    const exhibit = world.exhibits.find((item) => item.id === selectedExhibit);
    const exhibitRoom = exhibit ? world.rooms.find((item) => item.id === exhibit.roomId) : undefined;
    const roomPortal = room ? world.portals.find((item) => item.toRoomId === room.id) : undefined;
    if (exhibit) {
      lookAtTarget.set(exhibit.position[0], 1, exhibit.position[2]);
      const centralSide = exhibitRoom && exhibitRoom.center[0] < 0 ? 1 : -1;
      destination.set(exhibit.position[0] + centralSide * 2.15, 1.66, exhibit.position[2] + 0.55);
      desiredFov.current = 42;
    } else if (room?.kind === "lobby") {
      lookAtTarget.set(0, 1.28, -1.45);
      destination.set(0, 1.66, 5.85);
      desiredFov.current = 62;
    } else if (room) {
      lookAtTarget.set(room.center[0], 1.25, room.center[2] - 0.35);
      const inwardStep = room.center[0] < 0 ? -1.5 : 1.5;
      destination.set(
        (roomPortal?.position[0] ?? room.center[0]) + inwardStep,
        1.66,
        roomPortal?.position[2] ?? room.center[2],
      );
      desiredFov.current = 54;
    } else {
      lookAtTarget.set(0, 3.1, 5.6);
      destination.set(0, 1.08, 22.5);
      desiredFov.current = 45;
    }

    if (previousRoom.current !== activeRoom) {
      camera.position.copy(destination);
      lookAt.copy(lookAtTarget);
      camera.lookAt(lookAt);
      if (camera instanceof THREE.PerspectiveCamera) {
        camera.fov = desiredFov.current;
        camera.updateProjectionMatrix();
      }
      previousRoom.current = activeRoom;
    }
  }, [activeRoom, camera, destination, lookAt, lookAtTarget, selectedExhibit, world]);

  useFrame(() => {
    frameDestination.copy(destination);
    if (activeRoom === "exterior") {
      frameDestination.x += pointer.x * 0.16;
      frameDestination.y += pointer.y * 0.05;
    }
    camera.position.lerp(frameDestination, 0.032);
    lookAt.lerp(lookAtTarget, 0.045);
    camera.lookAt(lookAt);
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = THREE.MathUtils.lerp(camera.fov, desiredFov.current, 0.045);
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
  const [opening, setOpening] = useState(false);
  const door = useRef<THREE.Group>(null);
  useFrame(() => {
    if (door.current) door.current.rotation.y = THREE.MathUtils.lerp(door.current.rotation.y, opening ? -1.22 : 0, 0.08);
  });

  function enterVilla() {
    if (opening) return;
    setOpening(true);
    window.setTimeout(onEnter, 720);
  }

  return (
    <group>
      <mesh receiveShadow position={[0, -0.62, 0]}><boxGeometry args={[26.4, 0.9, 15.3]} /><meshStandardMaterial color="#302720" roughness={0.96} /></mesh>
      <mesh receiveShadow position={[0, -1.08, 4.1]}><boxGeometry args={[30, 0.18, 15]} /><meshStandardMaterial color="#596b52" roughness={1} /></mesh>
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
        onClick={(event) => { event.stopPropagation(); enterVilla(); }}
        onPointerOver={(event) => { event.stopPropagation(); setHovered(true); document.body.style.cursor = "pointer"; }}
        onPointerOut={() => { setHovered(false); document.body.style.cursor = "default"; }}
      >
        <group ref={door} position={[-1.22, 0, 0]}>
          <mesh castShadow position={[1.22, 1.42, 0]} scale={hovered ? 1.025 : 1}><boxGeometry args={[2.45, 2.95, 0.28]} /><meshStandardMaterial color={hovered ? "#704a3c" : DARK_WOOD} roughness={0.72} emissive={hovered ? CORAL : INK} emissiveIntensity={hovered ? 0.18 : 0} /></mesh>
          <mesh position={[1.22, 1.55, 0.17]}><boxGeometry args={[1.72, 1.78, 0.06]} /><meshStandardMaterial color="#4c756f" roughness={0.7} /></mesh>
          <mesh position={[2.04, 1.38, 0.23]}><sphereGeometry args={[0.12, 12, 8]} /><meshStandardMaterial color={BRASS} metalness={0.45} roughness={0.3} /></mesh>
        </group>
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

const roomDoorSpecs: Array<{ roomId: string; title: string; subtitle: string; position: Vec3; side: "left" | "right"; color: string }> = [
  { roomId: "room-projects", title: "PORTFOLIO", subtitle: "进入作品房", position: [-5.41, 0, -1], side: "left", color: "#6678bd" },
];

function RoomDoor({ spec, onEnter }: { spec: (typeof roomDoorSpecs)[number]; onEnter: (roomId: string) => void }) {
  const [hovered, setHovered] = useState(false);
  const [opening, setOpening] = useState(false);
  const door = useRef<THREE.Group>(null);
  const rotationY = spec.side === "left" ? Math.PI / 2 : -Math.PI / 2;
  useFrame(() => {
    if (door.current) door.current.rotation.y = THREE.MathUtils.lerp(door.current.rotation.y, opening ? -1.28 : 0, 0.1);
  });

  function enterRoom() {
    if (opening) return;
    setOpening(true);
    window.setTimeout(() => onEnter(spec.roomId), 680);
  }

  return (
    <group
      position={spec.position}
      rotation={[0, rotationY, 0]}
      onClick={(event) => { event.stopPropagation(); enterRoom(); }}
      onPointerOver={(event) => { event.stopPropagation(); setHovered(true); document.body.style.cursor = "pointer"; }}
      onPointerOut={() => { setHovered(false); document.body.style.cursor = "default"; }}
    >
      {[-1, 1].map((x) => <mesh key={x} position={[x, 1.25, 0]}><boxGeometry args={[0.16, 2.5, 0.28]} /><meshStandardMaterial color={BRASS} /></mesh>)}
      <mesh position={[0, 2.47, 0]}><boxGeometry args={[2.15, 0.18, 0.3]} /><meshStandardMaterial color={DARK_WOOD} /></mesh>
      <group ref={door} position={[-0.9, 0, 0.04]}>
        <mesh position={[0.9, 1.2, 0]}><planeGeometry args={[1.8, 2.2]} /><meshStandardMaterial color={spec.color} emissive={hovered ? spec.color : INK} emissiveIntensity={hovered ? 0.38 : 0.05} roughness={0.82} side={THREE.DoubleSide} /></mesh>
        <mesh position={[1.62, 1.18, 0.07]}><sphereGeometry args={[0.1, 10, 8]} /><meshStandardMaterial color={BRASS} /></mesh>
      </group>
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

function ExhibitVisual({ exhibit }: { exhibit: ExhibitPlan }) {
  const numericId = Number(exhibit.id.replace(/\D/g, "")) || 0;
  const glyph = exhibit.kind === "panel"
    ? <boxGeometry args={[0.34, 0.5, 0.1]} />
    : exhibit.kind === "timeline"
      ? <octahedronGeometry args={[0.27, 0]} />
      : exhibit.kind === "terminal"
        ? <dodecahedronGeometry args={[0.27, 0]} />
        : exhibit.kind === "trophy"
          ? <torusKnotGeometry args={[0.2, 0.055, 36, 7]} />
          : <icosahedronGeometry args={[0.27, 1]} />;
  return (
    <group>
      <mesh castShadow position={[0, 0.08, 0]}>
        <cylinderGeometry args={[0.34, 0.4, 0.16, 24]} />
        <meshPhysicalMaterial color="#d9eef0" transparent opacity={0.38} transmission={0.55} roughness={0.18} metalness={0.1} />
      </mesh>
      <mesh position={[0, 0.19, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.27, 0.018, 8, 32]} />
        <meshBasicMaterial color={numericId % 2 ? TEAL : CORAL} toneMapped={false} />
      </mesh>
      <mesh castShadow position={[0, 0.52, 0]} rotation={[0.16, numericId * 0.52, 0.08]}>
        {glyph}
        <meshPhysicalMaterial color={exhibit.color} emissive={numericId % 2 ? TEAL : CORAL} emissiveIntensity={0.32} metalness={0.48} roughness={0.2} clearcoat={0.7} />
      </mesh>
      <pointLight position={[0, 0.58, 0]} intensity={1.5} distance={1.6} color={numericId % 2 ? TEAL : CORAL} />
    </group>
  );
}

function Exhibit({ exhibit, selected, onSelect }: { exhibit: ExhibitPlan; selected: boolean; onSelect: (id: string) => void }) {
  const [hovered, setHovered] = useState(false);
  const group = useRef<THREE.Group>(null);
  const baseY = exhibit.position[1] - 0.7;
  useFrame((state) => {
    if (!group.current) return;
    const targetScale = selected ? 1.12 : hovered ? 1.07 : 1;
    const nextScale = THREE.MathUtils.lerp(group.current.scale.x, targetScale, 0.14);
    group.current.scale.setScalar(nextScale);
    group.current.position.y = baseY + Math.sin(state.clock.elapsedTime * 1.35 + exhibit.position[0]) * 0.012;
  });
  return (
    <group ref={group} position={[exhibit.position[0], baseY, exhibit.position[2]]} onClick={(event) => { event.stopPropagation(); onSelect(exhibit.id); }} onPointerOver={(event) => { event.stopPropagation(); setHovered(true); document.body.style.cursor = "pointer"; }} onPointerOut={() => { setHovered(false); document.body.style.cursor = "default"; }}>
      <ExhibitVisual exhibit={exhibit} />
      <mesh position={[0, 0.025, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[0.38, selected ? 0.5 : hovered ? 0.47 : 0.43, 32]} /><meshBasicMaterial color={selected ? CORAL : TEAL} transparent opacity={selected ? 0.95 : hovered ? 0.7 : 0.18} side={THREE.DoubleSide} toneMapped={false} /></mesh>
    </group>
  );
}

export function WorldCanvas({ world, activeRoom, selectedExhibit, onSelect, onRoomChange }: { world: WorldPlan; activeRoom: string; selectedExhibit?: string; onSelect: (id: string) => void; onRoomChange: (roomId: string) => void }) {
  const exterior = activeRoom === "exterior";
  const currentRoom = world.rooms.find((room) => room.id === activeRoom);
  const activeExhibits = world.exhibits.filter(
    (exhibit) => exhibit.roomId === activeRoom && exhibit.eyebrow === "PROJECT",
  );
  const sceneBackground = exterior ? "#91adbd" : currentRoom?.color || "#c58c65";
  return (
    <Canvas dpr={[1, 1.35]} shadows camera={{ position: [0, 1.08, 22.5], fov: 45, near: 0.08, far: 120 }} gl={{ antialias: true, powerPreference: "high-performance" }} onPointerMissed={() => onSelect("")}>
      <color attach="background" args={[sceneBackground]} />
      <fog attach="fog" args={[sceneBackground, exterior ? 30 : 18, exterior ? 74 : 44]} />
      <ambientLight intensity={0.62} color="#ead9c4" />
      <hemisphereLight intensity={0.78} color="#bfd6e8" groundColor="#432f2a" />
      <directionalLight castShadow position={[14, 22, 12]} intensity={2.7} color="#ffd8ad" shadow-mapSize={[2048, 2048]} shadow-camera-left={-26} shadow-camera-right={26} shadow-camera-top={24} shadow-camera-bottom={-24} />
      <pointLight position={[-7, 5, 5]} intensity={18} distance={13} decay={2} color={CORAL} />
      <pointLight position={[6, 4, -3]} intensity={14} distance={12} decay={2} color={TEAL} />
      <RendererLook />
      <PortfolioEnvironment />
      <CameraRig activeRoom={activeRoom} selectedExhibit={selectedExhibit} world={world} />
      {exterior ? <VillaExterior onEnter={() => onRoomChange("room-lobby")} /> : (
        <>
          {currentRoom ? (
            <>
              <AuthoredRoomScene key={`architecture-${currentRoom.id}`} room={currentRoom} />
              <Suspense fallback={<ModelLoadingStage room={currentRoom} />}>
                <OpenSourceRoomDressing key={`dressing-${currentRoom.id}`} room={currentRoom} />
              </Suspense>
            </>
          ) : null}
          {currentRoom?.kind === "lobby" ? (
            <>
              {roomDoorSpecs.map((spec) => <RoomDoor key={spec.roomId} spec={spec} onEnter={onRoomChange} />)}
            </>
          ) : null}
          {activeExhibits.map((exhibit) => <Exhibit key={exhibit.id} exhibit={exhibit} selected={selectedExhibit === exhibit.id} onSelect={onSelect} />)}
        </>
      )}
      {exterior ? <mesh position={[0, -1.13, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[90, 90]} /><meshStandardMaterial color="#596b52" roughness={1} /></mesh> : null}
    </Canvas>
  );
}
