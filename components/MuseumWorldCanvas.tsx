"use client";

/* eslint-disable react-hooks/immutability -- Three.js camera routes and cloned scene nodes are animated in place. */

import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import { Component, Suspense, useEffect, useMemo, useRef, useState, type ErrorInfo, type ReactNode } from "react";
import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MUSEUM_LAYOUT, isMuseumStage, type CameraPose, type MuseumStage } from "@/lib/museum-layout";
import type { ExhibitPlan, Vec3, WorldPlan } from "@/lib/types";

const INK = "#19171b";
const PAPER = "#efe4d2";
const WOOD = "#5b382a";
const BRASS = "#d4a15c";
const TEAL = "#65d7c3";
const CORAL = "#ff8b61";

type CameraRoute = {
  position: THREE.CatmullRomCurve3;
  target: THREE.CatmullRomCurve3;
  duration: number;
  elapsed: number;
  fromFov: number;
  toFov: number;
};

type WorldCanvasProps = {
  world: WorldPlan;
  activeRoom: string;
  selectedExhibit?: string;
  guestbookMessages?: string[];
  onSelect: (id: string) => void;
  onRoomChange: (roomId: string) => void;
};

function poseForStage(stage: MuseumStage): CameraPose {
  if (stage === "museum-ground") return MUSEUM_LAYOUT.camera.ground;
  if (stage === "private-landing") return MUSEUM_LAYOUT.camera.landing;
  if (stage === "private-room") return MUSEUM_LAYOUT.camera.privateRoom;
  return MUSEUM_LAYOUT.camera.exterior;
}

function CameraDirector({ stage, selectedId, world }: { stage: MuseumStage; selectedId?: string; world: WorldPlan }) {
  const { camera, pointer } = useThree();
  const previousStage = useRef(stage);
  const previousSelection = useRef(selectedId);
  const route = useRef<CameraRoute | null>(null);
  const lookAt = useMemo(() => new THREE.Vector3(...MUSEUM_LAYOUT.camera.exterior.target), []);
  const desiredPosition = useMemo(() => new THREE.Vector3(...MUSEUM_LAYOUT.camera.exterior.position), []);
  const desiredTarget = useMemo(() => new THREE.Vector3(...MUSEUM_LAYOUT.camera.exterior.target), []);
  const mouseTarget = useMemo(() => new THREE.Vector3(), []);
  const direction = useMemo(() => new THREE.Vector3(), []);
  const right = useMemo(() => new THREE.Vector3(), []);
  const up = useMemo(() => new THREE.Vector3(), []);
  const desiredFov = useRef(MUSEUM_LAYOUT.camera.exterior.fov);

  useEffect(() => {
    const authored = selectedId
      ? MUSEUM_LAYOUT.authored[selectedId as keyof typeof MUSEUM_LAYOUT.authored]
      : undefined;
    const exhibit = selectedId ? world.exhibits.find((item) => item.id === selectedId) : undefined;
    const stagePose = poseForStage(stage);

    if (authored) {
      desiredPosition.set(...authored.camera);
      desiredTarget.set(...authored.target);
      desiredFov.current = 48;
    } else if (exhibit) {
      desiredTarget.set(exhibit.position[0], exhibit.position[1] + 0.9, exhibit.position[2]);
      desiredPosition.set(exhibit.position[0], Math.max(1.55, exhibit.position[1] + 1.25), exhibit.position[2] + 3.2);
      desiredFov.current = 48;
    } else {
      desiredPosition.set(...stagePose.position);
      desiredTarget.set(...stagePose.target);
      desiredFov.current = stagePose.fov;
    }

    const stageChanged = previousStage.current !== stage;
    const selectionChanged = previousSelection.current !== selectedId;
    if (!stageChanged && !selectionChanged) return;

    const startPosition = camera.position.clone();
    const startTarget = lookAt.clone();
    let positions = [startPosition, desiredPosition.clone()];
    let targets = [startTarget, desiredTarget.clone()];
    let duration = selectedId ? 1.35 : 1.9;

    if (previousStage.current === "exterior" && stage === "museum-ground") {
      positions = [startPosition, new THREE.Vector3(0, 1.35, 14), desiredPosition.clone()];
      targets = [startTarget, new THREE.Vector3(0, 1.8, 3), desiredTarget.clone()];
      duration = 1.7;
    } else if (previousStage.current === "museum-ground" && stage === "private-landing") {
      positions = [
        startPosition,
        new THREE.Vector3(...MUSEUM_LAYOUT.camera.stairStart),
        new THREE.Vector3(...MUSEUM_LAYOUT.camera.stairMid),
        desiredPosition.clone(),
      ];
      targets = [startTarget, new THREE.Vector3(0, 2.2, -2), new THREE.Vector3(2.5, 3.2, -4.5), desiredTarget.clone()];
      duration = 2.8;
    } else if (previousStage.current === "private-landing" && stage === "private-room") {
      positions = [startPosition, new THREE.Vector3(5, 3.65, -5.55), desiredPosition.clone()];
      targets = [startTarget, new THREE.Vector3(5, 3.7, -7), desiredTarget.clone()];
      duration = 1.8;
    } else if (
      (previousStage.current === "private-room" || previousStage.current === "private-landing") &&
      stage === "museum-ground"
    ) {
      positions = [
        startPosition,
        new THREE.Vector3(...MUSEUM_LAYOUT.camera.landing.position),
        new THREE.Vector3(...MUSEUM_LAYOUT.camera.stairMid),
        new THREE.Vector3(...MUSEUM_LAYOUT.camera.stairStart),
        desiredPosition.clone(),
      ];
      targets = [startTarget, new THREE.Vector3(2.5, 3.2, -4.5), new THREE.Vector3(0, 2.1, -1.7), new THREE.Vector3(0, 1.7, 3), desiredTarget.clone()];
      duration = 2.9;
    }

    route.current = {
      position: new THREE.CatmullRomCurve3(positions, false, "centripetal"),
      target: new THREE.CatmullRomCurve3(targets, false, "centripetal"),
      duration,
      elapsed: 0,
      fromFov: camera instanceof THREE.PerspectiveCamera ? camera.fov : desiredFov.current,
      toFov: desiredFov.current,
    };
    previousStage.current = stage;
    previousSelection.current = selectedId;
  }, [camera, desiredPosition, desiredTarget, lookAt, selectedId, stage, world]);

  useFrame((_, delta) => {
    if (route.current) {
      route.current.elapsed = Math.min(route.current.duration, route.current.elapsed + delta);
      const progress = route.current.elapsed / route.current.duration;
      const eased = progress * progress * (3 - 2 * progress);
      route.current.position.getPoint(eased, camera.position);
      route.current.target.getPoint(eased, lookAt);
      camera.lookAt(lookAt);
      if (camera instanceof THREE.PerspectiveCamera) {
        camera.fov = THREE.MathUtils.lerp(route.current.fromFov, route.current.toFov, eased);
        camera.updateProjectionMatrix();
      }
      if (progress >= 1) route.current = null;
      return;
    }

    const alpha = 1 - Math.exp(-delta * 3.2);
    camera.position.lerp(desiredPosition, alpha);
    direction.copy(desiredTarget).sub(camera.position);
    const distance = Math.max(1, direction.length());
    direction.normalize();
    right.crossVectors(direction, camera.up).normalize();
    up.crossVectors(right, direction).normalize();
    const focused = Boolean(selectedId);
    const yaw = THREE.MathUtils.degToRad(focused ? 4 : stage === "exterior" ? 5 : 18);
    const pitch = THREE.MathUtils.degToRad(focused ? 3 : 9);
    mouseTarget
      .copy(desiredTarget)
      .addScaledVector(right, Math.tan(yaw) * distance * pointer.x)
      .addScaledVector(up, Math.tan(pitch) * distance * pointer.y);
    lookAt.lerp(mouseTarget, alpha);
    camera.lookAt(lookAt);
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = THREE.MathUtils.lerp(camera.fov, desiredFov.current, alpha);
      camera.updateProjectionMatrix();
    }
  });

  return null;
}

function RendererLook() {
  const { gl } = useThree();
  useEffect(() => {
    gl.outputColorSpace = THREE.SRGBColorSpace;
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = 1.08;
    gl.shadowMap.type = THREE.PCFShadowMap;
  }, [gl]);
  return null;
}

function MuseumBuilding() {
  const gltf = useLoader(GLTFLoader, MUSEUM_LAYOUT.model.url) as GLTF;
  const model = useMemo(() => {
    const clone = gltf.scene.clone(true);
    clone.traverse((object) => {
      const hidden = object.name === "Picture" || object.name.startsWith("bix_") || object.name === "Bix_Hair";
      if (hidden) object.visible = false;
      if (object instanceof THREE.Mesh) {
        object.castShadow = object.name === "Chrome";
        object.receiveShadow = object.name === "Floor" || object.name === "Walls";
      }
    });
    return clone;
  }, [gltf.scene]);

  return (
    <primitive
      object={model}
      position={MUSEUM_LAYOUT.model.position}
      rotation={MUSEUM_LAYOUT.model.rotation}
      scale={MUSEUM_LAYOUT.model.scale}
    />
  );
}

function ProceduralMuseumFallback() {
  return (
    <group>
      <mesh receiveShadow position={[0, -0.08, 0]}><boxGeometry args={[16.7, 0.16, 32]} /><meshStandardMaterial color="#b38f69" roughness={0.9} /></mesh>
      <mesh receiveShadow position={[0, 2.6, -15.8]}><boxGeometry args={[16.7, 5.2, 0.3]} /><meshStandardMaterial color="#dfd8cb" roughness={0.95} /></mesh>
      {[-8.2, 8.2].map((x) => <mesh key={x} receiveShadow position={[x, 2.6, 0]}><boxGeometry args={[0.3, 5.2, 32]} /><meshStandardMaterial color="#dfd8cb" roughness={0.95} /></mesh>)}
      <mesh position={[0, 2.65, -2]} rotation={[0.42, 0, 0]}><boxGeometry args={[3.2, 0.22, 8]} /><meshStandardMaterial color="#d8d3ca" roughness={0.72} /></mesh>
    </group>
  );
}

class MuseumErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Mardou museum failed to load; using procedural fallback.", error, info.componentStack);
  }
  render() { return this.state.failed ? <ProceduralMuseumFallback /> : this.props.children; }
}

function LoadingMuseum() {
  return (
    <group position={[0, 1.4, 0]}>
      <mesh rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.5, 0.06, 12, 48]} /><meshBasicMaterial color={TEAL} toneMapped={false} /></mesh>
    </group>
  );
}

function VillaExterior({ interactive, onEnter }: { interactive: boolean; onEnter: () => void }) {
  const [hovered, setHovered] = useState(false);
  const [opening, setOpening] = useState(false);
  const door = useRef<THREE.Group>(null);
  useFrame(() => {
    if (door.current) door.current.rotation.y = THREE.MathUtils.lerp(door.current.rotation.y, opening ? -1.45 : 0, 0.08);
  });

  function enter() {
    if (!interactive || opening) return;
    setOpening(true);
    window.setTimeout(onEnter, 700);
  }

  return (
    <group>
      <mesh receiveShadow position={[0, -0.6, 7]}><boxGeometry args={[27, 0.9, 15]} /><meshStandardMaterial color="#302720" roughness={0.96} /></mesh>
      <mesh receiveShadow position={[0, 1.9, 7.2]}><boxGeometry args={[25.4, 4.8, 0.48]} /><meshStandardMaterial color="#d39a6e" roughness={0.92} /></mesh>
      {[-7.7, 7.7].map((x) => (
        <group key={x} position={[x, 2.05, 7.51]}>
          <mesh><boxGeometry args={[4.4, 2.45, 0.18]} /><meshStandardMaterial color="#34231f" /></mesh>
          <mesh position={[0, 0, 0.12]}><planeGeometry args={[3.95, 2.02]} /><meshStandardMaterial color="#315365" roughness={0.24} /></mesh>
          <mesh position={[0, 0, 0.22]}><boxGeometry args={[0.12, 2.05, 0.08]} /><meshStandardMaterial color={BRASS} /></mesh>
          <mesh position={[0, 0, 0.22]}><boxGeometry args={[3.98, 0.12, 0.08]} /><meshStandardMaterial color={BRASS} /></mesh>
        </group>
      ))}
      <group
        position={[0, 0, 7.58]}
        onClick={(event) => { event.stopPropagation(); enter(); }}
        onPointerOver={(event) => { if (!interactive) return; event.stopPropagation(); setHovered(true); document.body.style.cursor = "pointer"; }}
        onPointerOut={() => { setHovered(false); document.body.style.cursor = "default"; }}
      >
        <group ref={door}>
          <mesh castShadow position={[1.2, 1.45, 0]}><boxGeometry args={[2.4, 3, 0.28]} /><meshStandardMaterial color={hovered ? CORAL : "#34231f"} roughness={0.72} /></mesh>
          <mesh position={[1.2, 1.58, 0.17]}><boxGeometry args={[1.7, 1.78, 0.06]} /><meshStandardMaterial color="#4c756f" /></mesh>
          <mesh position={[2, 1.4, 0.25]}><sphereGeometry args={[0.12, 12, 8]} /><meshStandardMaterial color={BRASS} metalness={0.45} /></mesh>
        </group>
        <mesh position={[0, 3.45, 0]}><boxGeometry args={[4.5, 0.32, 0.7]} /><meshStandardMaterial color="#34231f" /></mesh>
        {[[-1.15, CORAL], [0, BRASS], [1.15, TEAL]].map(([x, color]) => <mesh key={String(x)} position={[Number(x), 3.9, 0]}><boxGeometry args={[0.72, 0.16, 0.12]} /><meshStandardMaterial color={String(color)} emissive={String(color)} emissiveIntensity={0.2} /></mesh>)}
      </group>
      <mesh position={[-6.2, 5.1, 0.15]} rotation={[0, 0, 0.32]}><boxGeometry args={[13.8, 0.38, 15.2]} /><meshStandardMaterial color="#6b3e36" /></mesh>
      <mesh position={[6.2, 5.1, 0.15]} rotation={[0, 0, -0.32]}><boxGeometry args={[13.8, 0.38, 15.2]} /><meshStandardMaterial color="#76463b" /></mesh>
      <mesh position={[0, 7.25, 0.1]}><boxGeometry args={[0.38, 0.38, 15.4]} /><meshStandardMaterial color={BRASS} /></mesh>
    </group>
  );
}

function Hoverable({ children, position, selected, interactive, onSelect }: {
  children: ReactNode;
  position: Vec3;
  selected: boolean;
  interactive: boolean;
  onSelect: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const group = useRef<THREE.Group>(null);
  useFrame(() => {
    if (!group.current) return;
    const target = selected ? 1.12 : hovered ? 1.06 : 1;
    group.current.scale.setScalar(THREE.MathUtils.lerp(group.current.scale.x, target, 0.12));
  });
  return (
    <group
      ref={group}
      position={position}
      onClick={interactive ? (event) => { event.stopPropagation(); onSelect(); } : undefined}
      onPointerOver={interactive ? (event) => { event.stopPropagation(); setHovered(true); document.body.style.cursor = "pointer"; } : undefined}
      onPointerOut={interactive ? () => { setHovered(false); document.body.style.cursor = "default"; } : undefined}
    >
      {children}
      <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[0.62, selected ? 0.78 : 0.7, 32]} /><meshBasicMaterial color={selected ? CORAL : TEAL} transparent opacity={selected ? 0.95 : hovered ? 0.7 : 0.18} side={THREE.DoubleSide} toneMapped={false} /></mesh>
    </group>
  );
}

function AuthoredStation({ id, selected, interactive, onSelect }: { id: keyof typeof MUSEUM_LAYOUT.authored; selected: boolean; interactive: boolean; onSelect: (id: string) => void }) {
  const { position } = MUSEUM_LAYOUT.authored[id];
  const index = ["showroom-profile", "showroom-journey", "showroom-skills", "showroom-contact", "showroom-highlights", "showroom-guestbook"].indexOf(id);
  const color = [CORAL, BRASS, TEAL, "#7088d4", "#d3aa54", "#83568d"][Math.max(0, index)];
  return (
    <Hoverable position={position} selected={selected} interactive={interactive} onSelect={() => onSelect(id)}>
      <mesh castShadow position={[0, 0.42, 0]}><cylinderGeometry args={[0.62, 0.78, 0.84, 8]} /><meshStandardMaterial color={INK} roughness={0.72} /></mesh>
      <mesh castShadow position={[0, 1.1, 0]} rotation={[0.15, index * 0.45, 0.12]}>
        {index % 3 === 0 ? <icosahedronGeometry args={[0.42, 0]} /> : index % 3 === 1 ? <torusKnotGeometry args={[0.28, 0.08, 48, 8]} /> : <octahedronGeometry args={[0.48, 0]} />}
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={selected ? 0.38 : 0.12} metalness={0.22} roughness={0.4} />
      </mesh>
    </Hoverable>
  );
}

function ProjectArtifact({ exhibit, index, selected, interactive, onSelect }: { exhibit: ExhibitPlan; index: number; selected: boolean; interactive: boolean; onSelect: (id: string) => void }) {
  const spin = useRef<THREE.Group>(null);
  useFrame((state) => { if (spin.current) spin.current.rotation.y = state.clock.elapsedTime * (0.14 + (index % 3) * 0.04); });
  return (
    <Hoverable position={exhibit.position} selected={selected} interactive={interactive} onSelect={() => onSelect(exhibit.id)}>
      <mesh castShadow position={[0, 0.3, 0]}><cylinderGeometry args={[0.68, 0.82, 0.6, 10]} /><meshStandardMaterial color={PAPER} roughness={0.72} /></mesh>
      <group ref={spin} position={[0, 1.05, 0]}>
        {index % 3 === 0 ? (
          <><mesh rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.43, 0.07, 10, 36]} /><meshStandardMaterial color={TEAL} metalness={0.25} /></mesh><mesh rotation={[0.3, 0.8, 0]}><octahedronGeometry args={[0.28, 0]} /><meshStandardMaterial color={CORAL} /></mesh></>
        ) : index % 3 === 1 ? (
          <><mesh><boxGeometry args={[0.72, 0.5, 0.72]} /><meshStandardMaterial color={exhibit.color} /></mesh><mesh position={[0.46, 0.18, 0]}><sphereGeometry args={[0.22, 16, 10]} /><meshStandardMaterial color={BRASS} /></mesh></>
        ) : (
          <><mesh rotation={[0.22, 0.5, 0.1]}><torusKnotGeometry args={[0.31, 0.09, 56, 8]} /><meshStandardMaterial color={exhibit.color} /></mesh><mesh><sphereGeometry args={[0.16, 12, 8]} /><meshStandardMaterial color={CORAL} emissive={CORAL} emissiveIntensity={0.25} /></mesh></>
        )}
      </group>
    </Hoverable>
  );
}

function ResumeMarker({ exhibit, index, selected, interactive, onSelect }: { exhibit: ExhibitPlan; index: number; selected: boolean; interactive: boolean; onSelect: (id: string) => void }) {
  return (
    <Hoverable position={exhibit.position} selected={selected} interactive={interactive} onSelect={() => onSelect(exhibit.id)}>
      <mesh castShadow position={[0, 0.28, 0]}><boxGeometry args={[0.62, 0.56, 0.62]} /><meshStandardMaterial color={INK} roughness={0.74} /></mesh>
      <mesh position={[0, 0.66, 0]} rotation={[0.2, index * 0.31, 0.08]}>
        {exhibit.kind === "timeline" ? <cylinderGeometry args={[0.22, 0.22, 0.52, 12]} /> : exhibit.kind === "terminal" ? <boxGeometry args={[0.45, 0.35, 0.12]} /> : <octahedronGeometry args={[0.3, 0]} />}
        <meshStandardMaterial color={exhibit.color} emissive={exhibit.color} emissiveIntensity={selected ? 0.3 : 0.08} />
      </mesh>
    </Hoverable>
  );
}

function MuseumExhibits({ world, stage, selectedId, onSelect }: { world: WorldPlan; stage: MuseumStage; selectedId?: string; onSelect: (id: string) => void }) {
  const interactive = stage === "museum-ground";
  const authoredIds = Object.keys(MUSEUM_LAYOUT.authored).filter((id) => id !== "bedroom-diary") as Array<keyof typeof MUSEUM_LAYOUT.authored>;
  return (
    <group visible={stage !== "exterior"}>
      {authoredIds.map((id) => <AuthoredStation key={id} id={id} selected={selectedId === id} interactive={interactive} onSelect={onSelect} />)}
      {world.exhibits.map((exhibit, index) => exhibit.eyebrow === "PROJECT"
        ? <ProjectArtifact key={exhibit.id} exhibit={exhibit} index={index} selected={selectedId === exhibit.id} interactive={interactive} onSelect={onSelect} />
        : <ResumeMarker key={exhibit.id} exhibit={exhibit} index={index} selected={selectedId === exhibit.id} interactive={interactive} onSelect={onSelect} />)}
    </group>
  );
}

function PrivateBedroom({ stage, selected, onSelect }: { stage: MuseumStage; selected: boolean; onSelect: () => void }) {
  const door = useRef<THREE.Group>(null);
  const open = stage === "private-room";
  useFrame(() => { if (door.current) door.current.rotation.y = THREE.MathUtils.lerp(door.current.rotation.y, open ? -1.45 : 0, 0.08); });
  const active = stage === "private-landing" || stage === "private-room";
  return (
    <group visible={active}>
      <mesh receiveShadow position={[5, 2.58, -9.5]}><boxGeometry args={[6, 0.18, 7]} /><meshStandardMaterial color="#665044" roughness={0.92} /></mesh>
      <mesh receiveShadow position={[5, 5.25, -9.5]}><boxGeometry args={[6, 0.18, 7]} /><meshStandardMaterial color="#d8c9b6" roughness={0.95} /></mesh>
      <mesh receiveShadow position={[2.05, 3.9, -9.5]}><boxGeometry args={[0.18, 2.7, 7]} /><meshStandardMaterial color="#b88d75" roughness={0.92} /></mesh>
      <mesh receiveShadow position={[7.95, 3.9, -9.5]}><boxGeometry args={[0.18, 2.7, 7]} /><meshStandardMaterial color="#b88d75" roughness={0.92} /></mesh>
      <mesh receiveShadow position={[5, 3.9, -12.95]}><boxGeometry args={[6, 2.7, 0.18]} /><meshStandardMaterial color="#b88d75" roughness={0.92} /></mesh>
      {[-1.95, 1.95].map((offset) => <mesh key={offset} receiveShadow position={[5 + offset, 3.9, -6.05]}><boxGeometry args={[2.1, 2.7, 0.18]} /><meshStandardMaterial color="#b88d75" roughness={0.92} /></mesh>)}
      <mesh receiveShadow position={[5, 4.92, -6.05]}><boxGeometry args={[1.8, 0.66, 0.18]} /><meshStandardMaterial color="#b88d75" roughness={0.92} /></mesh>
      <group ref={door} position={[4.15, 2.65, -5.94]}>
        <mesh castShadow position={[0.85, 1.05, 0]}><boxGeometry args={[1.7, 2.1, 0.16]} /><meshStandardMaterial color="#34231f" roughness={0.68} /></mesh>
        <mesh position={[1.45, 1.02, 0.12]}><sphereGeometry args={[0.08, 12, 8]} /><meshStandardMaterial color={BRASS} /></mesh>
      </group>
      <group
        position={MUSEUM_LAYOUT.authored["bedroom-diary"].position}
        onClick={stage === "private-room" ? (event) => { event.stopPropagation(); onSelect(); } : undefined}
        onPointerOver={stage === "private-room" ? () => { document.body.style.cursor = "pointer"; } : undefined}
        onPointerOut={stage === "private-room" ? () => { document.body.style.cursor = "default"; } : undefined}
      >
        <mesh castShadow position={[0, 0.74, 0]}><boxGeometry args={[2.7, 0.16, 1.25]} /><meshStandardMaterial color={WOOD} roughness={0.7} /></mesh>
        {[[-1.08, -0.43], [-1.08, 0.43], [1.08, -0.43], [1.08, 0.43]].map(([x, z]) => <mesh key={`${x}-${z}`} position={[x, 0.36, z]}><boxGeometry args={[0.13, 0.72, 0.13]} /><meshStandardMaterial color={WOOD} /></mesh>)}
        <group position={[0, 0.94, 0]} rotation={[0.18, 0, 0]}>
          <mesh position={[-0.38, 0, 0]} rotation={[0, 0, 0.09]}><boxGeometry args={[0.76, 0.07, 0.92]} /><meshStandardMaterial color={PAPER} /></mesh>
          <mesh position={[0.38, 0, 0]} rotation={[0, 0, -0.09]}><boxGeometry args={[0.76, 0.07, 0.92]} /><meshStandardMaterial color={PAPER} /></mesh>
          <mesh position={[0, 0.06, 0]}><boxGeometry args={[0.05, 0.05, 0.92]} /><meshStandardMaterial color={selected ? CORAL : TEAL} emissive={selected ? CORAL : TEAL} emissiveIntensity={0.3} /></mesh>
        </group>
      </group>
    </group>
  );
}

function StairAccess({ stage, onEnter }: { stage: MuseumStage; onEnter: () => void }) {
  if (stage !== "museum-ground") return null;
  return (
    <group
      position={[0, 0.08, 0.2]}
      onClick={(event) => { event.stopPropagation(); onEnter(); }}
      onPointerOver={() => { document.body.style.cursor = "pointer"; }}
      onPointerOut={() => { document.body.style.cursor = "default"; }}
    >
      <mesh rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[0.72, 0.9, 32]} /><meshBasicMaterial color={BRASS} transparent opacity={0.72} side={THREE.DoubleSide} toneMapped={false} /></mesh>
      <mesh position={[0, 0.08, 0]}><cylinderGeometry args={[0.22, 0.3, 0.16, 8]} /><meshStandardMaterial color={BRASS} emissive={BRASS} emissiveIntensity={0.25} /></mesh>
    </group>
  );
}

export function WorldCanvas({ world, activeRoom, selectedExhibit, onSelect, onRoomChange }: WorldCanvasProps) {
  const stage: MuseumStage = isMuseumStage(activeRoom)
    ? activeRoom
    : activeRoom === "room-private"
      ? "private-room"
      : activeRoom === "room-lobby"
        ? "museum-ground"
        : "exterior";
  const exterior = stage === "exterior";
  return (
    <Canvas shadows dpr={[1, 1.35]} camera={{ position: MUSEUM_LAYOUT.camera.exterior.position, fov: 45, near: 0.08, far: 140 }} gl={{ antialias: true, powerPreference: "high-performance" }} onPointerMissed={() => onSelect("")}>
      <color attach="background" args={[exterior ? "#91adbd" : "#20252a"]} />
      <fog attach="fog" args={[exterior ? "#91adbd" : "#20252a", 34, 82]} />
      <ambientLight intensity={0.72} color="#ead9c4" />
      <hemisphereLight intensity={0.82} color="#c9deef" groundColor="#49372e" />
      <directionalLight castShadow position={[12, 18, 10]} intensity={2.2} color="#ffe0b9" shadow-mapSize={[1536, 1536]} shadow-camera-left={-20} shadow-camera-right={20} shadow-camera-top={18} shadow-camera-bottom={-18} />
      <pointLight position={[0, 5, -4]} intensity={12} distance={28} decay={2} color={TEAL} />
      <RendererLook />
      <CameraDirector stage={stage} selectedId={selectedExhibit} world={world} />
      {exterior ? <VillaExterior interactive onEnter={() => onRoomChange("museum-ground")} /> : null}
      <group visible={!exterior}>
        <MuseumErrorBoundary>
          <Suspense fallback={<LoadingMuseum />}><MuseumBuilding /></Suspense>
        </MuseumErrorBoundary>
        <MuseumExhibits world={world} stage={stage} selectedId={selectedExhibit} onSelect={onSelect} />
        <PrivateBedroom stage={stage} selected={selectedExhibit === "bedroom-diary"} onSelect={() => onSelect("bedroom-diary")} />
        <StairAccess stage={stage} onEnter={() => onRoomChange("private-landing")} />
        <mesh position={[0, -0.18, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[70, 70]} /><meshStandardMaterial color="#26312b" roughness={1} /></mesh>
      </group>
    </Canvas>
  );
}
