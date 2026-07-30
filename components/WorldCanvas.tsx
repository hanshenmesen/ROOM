"use client";

/* eslint-disable react-hooks/immutability -- Three.js render loops intentionally mutate scene objects. */

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { ExhibitPlan, RoomPlan, WorldPlan } from "@/lib/types";

const INK = "#11110f";
const PAPER = "#f2f2ed";
const MID = "#8b8b85";

function CameraRig({ activeRoom, world }: { activeRoom: string; world: WorldPlan }) {
  const { camera, pointer } = useThree();
  const lookAt = useMemo(() => new THREE.Vector3(), []);
  const lookAtTarget = useMemo(() => new THREE.Vector3(), []);
  const destination = useMemo(() => new THREE.Vector3(18, 20, 24), []);
  const frameDestination = useMemo(() => new THREE.Vector3(), []);
  const desiredZoom = useRef(28);

  useEffect(() => {
    const room = world.rooms.find((item) => item.id === activeRoom);
    if (room) {
      lookAtTarget.set(room.center[0], 0.4, room.center[2]);
      destination.set(room.center[0] + 8, 9, room.center[2] + 10);
      desiredZoom.current = 46;
    } else {
      lookAtTarget.set(0, 0, 0);
      destination.set(18, 20, 24);
      desiredZoom.current = 28;
    }
  }, [activeRoom, destination, lookAtTarget, world]);

  useFrame(() => {
    frameDestination.copy(destination);
    frameDestination.x += pointer.x * 0.55;
    frameDestination.y += pointer.y * 0.24;
    camera.position.lerp(frameDestination, 0.045);
    lookAt.lerp(lookAtTarget, 0.07);
    camera.lookAt(lookAt);
    if (camera instanceof THREE.OrthographicCamera) {
      camera.zoom = THREE.MathUtils.lerp(camera.zoom, desiredZoom.current, 0.055);
      camera.updateProjectionMatrix();
    }
  });
  return null;
}

function TextPanel({
  title,
  subtitle,
  position,
}: {
  title: string;
  subtitle: string;
  position: [number, number, number];
}) {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 256;
    const context = canvas.getContext("2d")!;
    context.fillStyle = PAPER;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = INK;
    context.lineWidth = 5;
    context.strokeRect(3, 3, canvas.width - 6, canvas.height - 6);
    context.fillStyle = INK;
    context.font = "700 76px Arial";
    context.textAlign = "left";
    context.fillText(title.toUpperCase(), 48, 112, 910);
    context.font = "28px Arial";
    context.fillStyle = "#5d5d58";
    context.fillText(subtitle, 50, 175, 900);
    const result = new THREE.CanvasTexture(canvas);
    result.colorSpace = THREE.SRGBColorSpace;
    result.anisotropy = 4;
    return result;
  }, [subtitle, title]);

  useEffect(() => () => texture.dispose(), [texture]);

  return (
    <mesh position={position}>
      <planeGeometry args={[4.25, 1.06]} />
      <meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>
  );
}

function WallPanel({ position, size }: { position: [number, number, number]; size: [number, number, number] }) {
  return (
    <mesh position={position} receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color="#e6e6e1" roughness={0.95} />
    </mesh>
  );
}

function RoomShell({ room, active }: { room: RoomPlan; active: boolean }) {
  const [x, , z] = room.center;
  const opacity = active ? 1 : 0.9;
  return (
    <group position={[x, 0, z]}>
      <mesh receiveShadow position={[0, -0.2, 0]}>
        <boxGeometry args={[8, 0.36, 8]} />
        <meshStandardMaterial color={room.color} roughness={0.86} transparent opacity={opacity} />
      </mesh>
      <mesh receiveShadow position={[0, 1.65, -3.9]}>
        <boxGeometry args={[8, 3.7, 0.2]} />
        <meshStandardMaterial color="#d2d2cd" roughness={0.94} />
      </mesh>
      <mesh receiveShadow position={[-3.9, 1.35, 0]}>
        <boxGeometry args={[0.2, 3.1, 8]} />
        <meshStandardMaterial color="#c8c8c3" roughness={0.94} />
      </mesh>

      <WallPanel position={[-2.8, 1.35, -3.76]} size={[0.05, 2.25, 0.06]} />
      <WallPanel position={[2.8, 1.35, -3.76]} size={[0.05, 2.25, 0.06]} />
      <WallPanel position={[-3.76, 1.05, -2.65]} size={[0.06, 1.7, 0.05]} />
      <WallPanel position={[-3.76, 1.05, 2.65]} size={[0.06, 1.7, 0.05]} />

      <TextPanel title={room.title} subtitle={room.subtitle} position={[0.35, 2.55, -3.76]} />

      <mesh position={[0, -0.005, 0]}>
        <boxGeometry args={[7.35, 0.025, 7.35]} />
        <meshBasicMaterial color={active ? INK : MID} transparent opacity={active ? 0.1 : 0.025} />
      </mesh>
      {[-2.6, 0, 2.6].map((offset) => (
        <mesh key={offset} position={[offset, 0.02, 0]}>
          <boxGeometry args={[0.022, 0.018, 7.15]} />
          <meshBasicMaterial color={INK} transparent opacity={0.11} />
        </mesh>
      ))}

      <mesh castShadow position={[2.95, 2.9, -3.32]} rotation={[0.25, 0, 0]}>
        <cylinderGeometry args={[0.11, 0.18, 0.36, 12]} />
        <meshStandardMaterial color={INK} roughness={0.72} />
      </mesh>
      <mesh position={[2.95, 2.72, -3.18]} rotation={[0.25, 0, 0]}>
        <coneGeometry args={[0.18, 0.2, 18]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.74} />
      </mesh>
    </group>
  );
}

function HouseCorridors() {
  const corridors: Array<{ position: [number, number, number]; size: [number, number, number] }> = [
    { position: [0, -0.18, -4.75], size: [2.5, 0.26, 1.8] },
    { position: [4.75, -0.18, 0], size: [1.8, 0.26, 2.5] },
    { position: [-4.75, -0.18, 0], size: [1.8, 0.26, 2.5] },
    { position: [0, -0.18, 4.75], size: [2.5, 0.26, 1.8] },
  ];
  return (
    <group>
      {corridors.map((corridor, index) => (
        <mesh key={index} position={corridor.position} receiveShadow>
          <boxGeometry args={corridor.size} />
          <meshStandardMaterial color="#bcbcb6" roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

function SculpturePlant({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh castShadow position={[0, 0.26, 0]}>
        <cylinderGeometry args={[0.29, 0.22, 0.52, 7]} />
        <meshStandardMaterial color={INK} roughness={0.85} />
      </mesh>
      <mesh castShadow position={[0, 0.76, 0]} rotation={[0.3, 0, -0.25]}>
        <octahedronGeometry args={[0.42, 0]} />
        <meshStandardMaterial color="#a9a9a3" roughness={0.78} />
      </mesh>
      <mesh castShadow position={[0.16, 1.08, -0.02]} rotation={[0, 0.2, 0.55]}>
        <octahedronGeometry args={[0.3, 0]} />
        <meshStandardMaterial color="#c7c7c1" roughness={0.78} />
      </mesh>
    </group>
  );
}

function RoomDecor({ room }: { room: RoomPlan }) {
  const [x, , z] = room.center;
  if (room.kind === "lobby") {
    return (
      <group position={[x, 0, z]}>
        <mesh castShadow position={[0, 0.2, 0]}>
          <cylinderGeometry args={[1.35, 1.55, 0.38, 24]} />
          <meshStandardMaterial color="#bdbdb7" roughness={0.74} />
        </mesh>
        <mesh position={[0, 0.41, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.7, 1.08, 48]} />
          <meshBasicMaterial color={INK} side={THREE.DoubleSide} />
        </mesh>
        <SculpturePlant position={[2.9, 0, 2.75]} />
        <SculpturePlant position={[-2.8, 0, -2.45]} />
      </group>
    );
  }
  if (room.kind === "projects") {
    return (
      <group position={[x, 0, z]}>
        <mesh position={[0.25, 1.45, -3.66]}>
          <planeGeometry args={[5.6, 1.35]} />
          <meshStandardMaterial color="#1a1a18" roughness={0.75} />
        </mesh>
        {[-2.25, -0.75, 0.75, 2.25].map((offset) => (
          <mesh key={offset} position={[offset, 1.45, -3.61]}>
            <boxGeometry args={[0.05, 0.62, 0.04]} />
            <meshBasicMaterial color="#d6d6cf" />
          </mesh>
        ))}
        <mesh castShadow position={[2.85, 0.46, 2.75]}>
          <boxGeometry args={[1.15, 0.9, 1.15]} />
          <meshStandardMaterial color="#dadad4" roughness={0.84} />
        </mesh>
      </group>
    );
  }
  if (room.kind === "experience") {
    return (
      <group position={[x, 0, z]}>
        <mesh position={[0, 0.08, 0]}>
          <boxGeometry args={[6.25, 0.08, 0.09]} />
          <meshStandardMaterial color={INK} roughness={0.7} />
        </mesh>
        {[-2.6, -1.3, 0, 1.3, 2.6].map((offset, index) => (
          <group key={offset} position={[offset, 0, 0]}>
            <mesh position={[0, 0.14, 0]}>
              <cylinderGeometry args={[0.13, 0.13, 0.24, 16]} />
              <meshStandardMaterial color={index % 2 ? "#777772" : INK} />
            </mesh>
            <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[0.22, 0.27, 20]} />
              <meshBasicMaterial color={INK} side={THREE.DoubleSide} />
            </mesh>
          </group>
        ))}
        <SculpturePlant position={[2.9, 0, -2.6]} />
      </group>
    );
  }
  if (room.kind === "skills") {
    return (
      <group position={[x, 0, z]}>
        {[-2.5, -1.25, 0, 1.25, 2.5].map((offset) => (
          <group key={offset} position={[offset, 1.4, -3.52]}>
            <mesh>
              <boxGeometry args={[0.88, 1.2, 0.2]} />
              <meshStandardMaterial color="#b6b6b0" roughness={0.9} />
            </mesh>
            {[0.35, 0, -0.35].map((y) => (
              <mesh key={y} position={[0, y, 0.12]}>
                <boxGeometry args={[0.52, 0.045, 0.03]} />
                <meshBasicMaterial color={INK} />
              </mesh>
            ))}
          </group>
        ))}
      </group>
    );
  }
  return (
    <group position={[x, 0, z]}>
      {[0, 1, 2].map((step) => (
        <mesh key={step} receiveShadow position={[0, 0.12 + step * 0.15, -2.85 + step * 0.28]}>
          <boxGeometry args={[5.5 - step * 0.65, 0.24, 0.72]} />
          <meshStandardMaterial color={step % 2 ? "#bcbcb6" : "#d3d3ce"} roughness={0.82} />
        </mesh>
      ))}
      <SculpturePlant position={[-2.9, 0, 2.55]} />
    </group>
  );
}

function ProjectArtifact({ variant }: { variant: number }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (ref.current) ref.current.rotation.y = state.clock.elapsedTime * (variant === 0 ? 0.32 : 0.12);
  });

  if (variant === 0) {
    return (
      <group ref={ref} position={[0, 1.05, 0]}>
        <mesh rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.4, 0.025, 8, 32]} /><meshStandardMaterial color={INK} /></mesh>
        <mesh rotation={[0.35, 0.8, 0]}><torusGeometry args={[0.31, 0.025, 8, 32]} /><meshStandardMaterial color={MID} /></mesh>
        <mesh><octahedronGeometry args={[0.16, 0]} /><meshStandardMaterial color={INK} roughness={0.4} /></mesh>
      </group>
    );
  }
  if (variant === 1) {
    return (
      <group ref={ref} position={[0, 0.92, 0]}>
        <mesh position={[0, 0.12, 0]}><boxGeometry args={[0.62, 0.34, 0.62]} /><meshStandardMaterial color={PAPER} /></mesh>
        <mesh position={[0.47, 0.04, 0]}><boxGeometry args={[0.28, 0.25, 0.42]} /><meshStandardMaterial color={INK} /></mesh>
        <mesh position={[-0.47, 0.04, 0]}><boxGeometry args={[0.28, 0.25, 0.42]} /><meshStandardMaterial color={MID} /></mesh>
        <mesh position={[0, 0.04, 0.47]}><boxGeometry args={[0.42, 0.25, 0.28]} /><meshStandardMaterial color="#4b4b48" /></mesh>
      </group>
    );
  }
  if (variant === 2) {
    return (
      <group ref={ref} position={[0, 0.95, 0]}>
        <mesh position={[-0.32, 0, 0]}><sphereGeometry args={[0.2, 12, 8]} /><meshStandardMaterial color={INK} /></mesh>
        <mesh position={[0.03, 0.02, 0]}><coneGeometry args={[0.2, 0.44, 6]} /><meshStandardMaterial color="#7f7f79" /></mesh>
        <mesh position={[0.36, 0, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.18, 0.06, 8, 18]} /><meshStandardMaterial color="#d8d8d2" /></mesh>
      </group>
    );
  }
  return (
    <group ref={ref} position={[0, 0.9, 0]}>
      <mesh><boxGeometry args={[0.9, 0.48, 0.34]} /><meshStandardMaterial color={INK} roughness={0.7} /></mesh>
      <mesh position={[0, 0.04, 0.18]}><planeGeometry args={[0.4, 0.18]} /><meshBasicMaterial color="#d8d8d2" /></mesh>
      <mesh position={[0.33, -0.11, 0.19]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.08, 0.025, 8, 18]} /><meshBasicMaterial color={PAPER} /></mesh>
      <mesh position={[-0.45, 0.12, 0]}><cylinderGeometry args={[0.025, 0.025, 0.55, 8]} /><meshStandardMaterial color={MID} /></mesh>
    </group>
  );
}

function ExhibitVisual({ exhibit }: { exhibit: ExhibitPlan }) {
  const numericId = Number(exhibit.id.replace(/\D/g, "")) || 0;
  if (exhibit.kind === "panel") {
    return (
      <group>
        <mesh castShadow position={[0, 0.72, 0]}><boxGeometry args={[1.15, 1.55, 0.22]} /><meshStandardMaterial color={INK} roughness={0.75} /></mesh>
        <mesh position={[0, 0.77, 0.121]}><planeGeometry args={[0.82, 1.08]} /><meshBasicMaterial color={PAPER} /></mesh>
        <mesh position={[0, 0.28, 0.13]}><planeGeometry args={[0.52, 0.035]} /><meshBasicMaterial color={INK} /></mesh>
      </group>
    );
  }
  if (exhibit.kind === "pedestal") {
    const normalizedTitle = exhibit.title.toLowerCase();
    const variant = normalizedTitle.includes("echo")
      ? 0
      : normalizedTitle.includes("room")
        ? 1
        : normalizedTitle.includes("museum")
          ? 2
          : 3;
    return (
      <group>
        <mesh castShadow position={[0, 0.34, 0]}><cylinderGeometry args={[0.56, 0.68, 0.68, 8]} /><meshStandardMaterial color="#b7b7b1" roughness={0.72} /></mesh>
        <mesh position={[0, 0.7, 0]}><cylinderGeometry args={[0.59, 0.59, 0.06, 8]} /><meshStandardMaterial color={INK} /></mesh>
        <ProjectArtifact variant={variant} />
      </group>
    );
  }
  if (exhibit.kind === "timeline") {
    return (
      <group>
        <mesh castShadow position={[0, 0.72, 0]}><boxGeometry args={[0.16, 1.44, 0.16]} /><meshStandardMaterial color={INK} /></mesh>
        <mesh castShadow position={[0, 1.34, 0.02]}><cylinderGeometry args={[0.3, 0.3, 0.12, 20]} /><meshStandardMaterial color={numericId % 2 ? "#777772" : PAPER} /></mesh>
        <mesh position={[0.38, 1.06, 0]}><boxGeometry args={[0.56, 0.32, 0.12]} /><meshStandardMaterial color="#d5d5cf" /></mesh>
        <mesh position={[0.38, 1.06, 0.065]}><planeGeometry args={[0.32, 0.035]} /><meshBasicMaterial color={INK} /></mesh>
      </group>
    );
  }
  if (exhibit.kind === "terminal") {
    return (
      <group>
        <mesh castShadow position={[0, 0.32, 0]} rotation={[-0.22, 0, 0]}><boxGeometry args={[1.05, 0.52, 0.65]} /><meshStandardMaterial color="#a7a7a1" roughness={0.76} /></mesh>
        <mesh position={[0, 0.42, 0.31]} rotation={[-0.22, 0, 0]}><planeGeometry args={[0.68, 0.23]} /><meshBasicMaterial color={numericId % 3 === 0 ? PAPER : INK} /></mesh>
        {[-0.24, 0, 0.24].map((offset) => (
          <mesh key={offset} position={[offset, 0.18, 0.34]}><sphereGeometry args={[0.035, 8, 6]} /><meshBasicMaterial color={INK} /></mesh>
        ))}
      </group>
    );
  }
  return (
    <group>
      <mesh castShadow position={[0, 0.34, 0]}><cylinderGeometry args={[0.5, 0.62, 0.68, 8]} /><meshStandardMaterial color="#b8b8b2" /></mesh>
      <mesh castShadow position={[0, 1, 0]} rotation={[0.2, numericId * 0.4, 0.1]}>
        {numericId % 2 ? <octahedronGeometry args={[0.43, 0]} /> : <torusKnotGeometry args={[0.28, 0.085, 48, 7]} />}
        <meshStandardMaterial color={INK} metalness={0.15} roughness={0.4} />
      </mesh>
    </group>
  );
}

function Exhibit({
  exhibit,
  selected,
  onSelect,
}: {
  exhibit: ExhibitPlan;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const group = useRef<THREE.Group>(null);
  const baseY = exhibit.position[1] - 0.62;
  useFrame((state) => {
    if (!group.current) return;
    const targetScale = selected ? 1.12 : hovered ? 1.07 : 1;
    const nextScale = THREE.MathUtils.lerp(group.current.scale.x, targetScale, 0.14);
    group.current.scale.setScalar(nextScale);
    if (exhibit.kind === "pedestal" || exhibit.kind === "trophy") {
      group.current.position.y = baseY + Math.sin(state.clock.elapsedTime * 1.5 + exhibit.position[0]) * 0.025;
    }
  });

  return (
    <group
      ref={group}
      position={[exhibit.position[0], baseY, exhibit.position[2]]}
      onClick={(event) => { event.stopPropagation(); onSelect(exhibit.id); }}
      onPointerOver={(event) => { event.stopPropagation(); setHovered(true); document.body.style.cursor = "pointer"; }}
      onPointerOut={() => { setHovered(false); document.body.style.cursor = "default"; }}
    >
      <ExhibitVisual exhibit={exhibit} />
      <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.68, selected ? 0.78 : hovered ? 0.75 : 0.7, 32]} />
        <meshBasicMaterial color={INK} transparent opacity={selected ? 0.95 : hovered ? 0.65 : 0.12} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

function Portal({ position }: { position: [number, number, number] }) {
  const ring = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    if (ring.current) ring.current.rotation.z = state.clock.elapsedTime * 0.16;
  });
  return (
    <group position={position}>
      <mesh position={[0, -0.92, 0]}>
        <cylinderGeometry args={[0.5, 0.65, 0.08, 24]} />
        <meshBasicMaterial color={INK} transparent opacity={0.12} />
      </mesh>
      <mesh ref={ring} position={[0, -0.85, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.48, 0.55, 8]} />
        <meshBasicMaterial color={INK} transparent opacity={0.72} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

export function WorldCanvas({
  world,
  activeRoom,
  selectedExhibit,
  onSelect,
}: {
  world: WorldPlan;
  activeRoom: string;
  selectedExhibit?: string;
  onSelect: (id: string) => void;
}) {
  return (
    <Canvas
      orthographic
      dpr={[1, 1.35]}
      shadows
      camera={{ position: [18, 20, 24], zoom: 28, near: 0.1, far: 120 }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      onPointerMissed={() => onSelect("")}
    >
      <color attach="background" args={[world.brief.palette.background]} />
      <fog attach="fog" args={[world.brief.palette.background, 38, 70]} />
      <ambientLight intensity={1.75} color="#ffffff" />
      <hemisphereLight intensity={0.72} color="#ffffff" groundColor="#85857e" />
      <directionalLight
        castShadow
        position={[14, 22, 12]}
        intensity={2.25}
        color="#ffffff"
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-25}
        shadow-camera-right={25}
        shadow-camera-top={25}
        shadow-camera-bottom={-25}
      />
      <CameraRig activeRoom={activeRoom} world={world} />
      <HouseCorridors />
      {world.rooms.map((room) => (
        <group key={room.id}>
          <RoomShell room={room} active={activeRoom === room.id} />
          <RoomDecor room={room} />
        </group>
      ))}
      {world.portals.map((portal) => <Portal key={portal.id} position={portal.position} />)}
      {world.exhibits.map((exhibit) => (
        <Exhibit key={exhibit.id} exhibit={exhibit} selected={selectedExhibit === exhibit.id} onSelect={onSelect} />
      ))}
      <gridHelper args={[46, 46, "#a5a59f", "#d7d7d1"]} position={[0, -0.41, 0]} />
    </Canvas>
  );
}
