"use client";

/* eslint-disable react-hooks/immutability -- Three.js render loops intentionally mutate scene objects. */

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  DIARY_DESK_POSITION,
  EYE_HEIGHT,
  FLOOR_HEIGHT,
  FLOOR_PORTAL_POSITION,
  MUSEUM_MODEL_URL,
  PRIVATE_COLLIDERS,
  PRIVATE_GATE_POSITION,
  PRIVATE_START,
  PRIVATE_START_TARGET,
  PROJECT_ANCHORS,
  PUBLIC_ANCHORS,
  PUBLIC_COLLIDERS,
  PUBLIC_START,
  PUBLIC_START_TARGET,
  SECOND_FLOOR_ENTRY,
  SECOND_FLOOR_ENTRY_TARGET,
  WALK_BOUNDS,
} from "@/lib/museum-layout";
import type { ExhibitPlan, Vec3, WorldPlan } from "@/lib/types";

const INK = "#16191b";
const PAPER = "#f0e8d8";
const BRASS = "#d4a15c";
const TEAL = "#65d7c3";
const CORAL = "#ff8b61";

type CameraPose = { camera: Vec3; target: Vec3; fov?: number };
type CameraRoute = {
  position: THREE.CatmullRomCurve3;
  target: THREE.CatmullRomCurve3;
  elapsed: number;
  duration: number;
  fromFov: number;
  toFov: number;
};

function isTypingTarget(target: EventTarget | null) {
  return target instanceof HTMLElement
    && (target.matches("input, textarea, select") || target.isContentEditable);
}

function clampAndCollide(position: THREE.Vector3, activeRoom: string) {
  const radius = 0.24;
  position.x = THREE.MathUtils.clamp(position.x, WALK_BOUNDS.minX + radius, WALK_BOUNDS.maxX - radius);
  position.z = THREE.MathUtils.clamp(position.z, WALK_BOUNDS.minZ + radius, WALK_BOUNDS.maxZ - radius);
  if (activeRoom === "room-private-entry") position.z = Math.max(position.z, 1.34);
  if (activeRoom === "room-private") position.z = Math.min(position.z, 0.52);
  const colliders = activeRoom === "room-lobby" ? PUBLIC_COLLIDERS : activeRoom === "room-private" ? PRIVATE_COLLIDERS : [];
  for (const box of colliders) {
    const minX = box.minX - radius;
    const maxX = box.maxX + radius;
    const minZ = box.minZ - radius;
    const maxZ = box.maxZ + radius;
    if (position.x <= minX || position.x >= maxX || position.z <= minZ || position.z >= maxZ) continue;
    const distances = [
      { axis: "x" as const, value: minX, distance: Math.abs(position.x - minX) },
      { axis: "x" as const, value: maxX, distance: Math.abs(position.x - maxX) },
      { axis: "z" as const, value: minZ, distance: Math.abs(position.z - minZ) },
      { axis: "z" as const, value: maxZ, distance: Math.abs(position.z - maxZ) },
    ].sort((a, b) => a.distance - b.distance);
    position[distances[0].axis] = distances[0].value;
  }
  position.y = (activeRoom === "room-lobby" ? 0 : FLOOR_HEIGHT) + EYE_HEIGHT;
}

function poseForSelection(selected: string | undefined, world: WorldPlan): CameraPose | undefined {
  if (!selected) return undefined;
  const anchor = PUBLIC_ANCHORS.find((item) => item.id === selected);
  if (anchor) return { camera: anchor.focusCamera, target: anchor.focusTarget, fov: 52 };
  if (selected === "bedroom-diary") {
    return {
      camera: [2.2, FLOOR_HEIGHT + 1.55, -0.2],
      target: [-0.35, FLOOR_HEIGHT + 1.0, -1.45],
      fov: 48,
    };
  }
  const exhibitId = selected.startsWith("project-wall:") ? selected.slice("project-wall:".length) : selected;
  const projectIndex = world.exhibits.filter((item) => item.eyebrow === "PROJECT").findIndex((item) => item.id === exhibitId);
  const project = PROJECT_ANCHORS[projectIndex];
  return project ? { camera: project.focusCamera, target: project.focusTarget, fov: 50 } : undefined;
}

function roomPose(activeRoom: string): CameraPose {
  if (activeRoom === "room-private-entry") {
    return { camera: SECOND_FLOOR_ENTRY, target: SECOND_FLOOR_ENTRY_TARGET, fov: 58 };
  }
  if (activeRoom === "room-private") {
    return { camera: PRIVATE_START, target: PRIVATE_START_TARGET, fov: 58 };
  }
  return { camera: PUBLIC_START, target: PUBLIC_START_TARGET, fov: 61 };
}

function CameraRig({ activeRoom, selectedExhibit, world }: { activeRoom: string; selectedExhibit?: string; world: WorldPlan }) {
  const { camera, pointer } = useThree();
  const keys = useRef(new Set<string>());
  const keyImpulse = useRef(new Set<string>());
  const route = useRef<CameraRoute | null>(null);
  const previousRoom = useRef(activeRoom);
  const previousSelected = useRef(selectedExhibit);
  const lookAt = useRef(new THREE.Vector3(...PUBLIC_START_TARGET));
  const freePositions = useRef<Record<string, THREE.Vector3>>({
    "room-lobby": new THREE.Vector3(...PUBLIC_START),
    "room-private-entry": new THREE.Vector3(...SECOND_FLOOR_ENTRY),
    "room-private": new THREE.Vector3(...PRIVATE_START),
  });
  const baseYaw = useRef(0);
  const basePitch = useRef(0);

  useEffect(() => {
    const keyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target) || isTypingTarget(document.activeElement)) return;
      const key = event.key.toLowerCase();
      if (["w", "a", "s", "d"].includes(key)) {
        event.preventDefault();
        keys.current.add(key);
        keyImpulse.current.add(key);
      }
    };
    const keyUp = (event: KeyboardEvent) => keys.current.delete(event.key.toLowerCase());
    const clear = () => { keys.current.clear(); keyImpulse.current.clear(); };
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    window.addEventListener("blur", clear);
    return () => {
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
      window.removeEventListener("blur", clear);
    };
  }, []);

  useEffect(() => {
    const roomChanged = previousRoom.current !== activeRoom;
    const selectionChanged = previousSelected.current !== selectedExhibit;
    if (!roomChanged && !selectionChanged) {
      camera.position.set(...PUBLIC_START);
      camera.lookAt(new THREE.Vector3(...PUBLIC_START_TARGET));
      return;
    }

    const selectedPose = poseForSelection(selectedExhibit, world);
    const fallbackPose = roomPose(activeRoom);
    const destination = selectedPose
      ? new THREE.Vector3(...selectedPose.camera)
      : roomChanged
        ? new THREE.Vector3(...fallbackPose.camera)
        : freePositions.current[activeRoom]?.clone() || new THREE.Vector3(...fallbackPose.camera);
    const target = new THREE.Vector3(...(selectedPose?.target || fallbackPose.target));
    const positionPoints = [camera.position.clone()];
    const targetPoints = [lookAt.current.clone()];

    if (roomChanged && activeRoom === "room-private") {
      positionPoints.push(
        new THREE.Vector3(3.8, FLOOR_HEIGHT + EYE_HEIGHT, 1.3),
        new THREE.Vector3(3.8, FLOOR_HEIGHT + EYE_HEIGHT, 0.48),
      );
      targetPoints.push(
        new THREE.Vector3(3.8, FLOOR_HEIGHT + 1.45, 0.65),
        new THREE.Vector3(2.5, FLOOR_HEIGHT + 1.4, -0.3),
      );
    } else if (roomChanged && previousRoom.current === "room-private") {
      positionPoints.push(new THREE.Vector3(3.8, FLOOR_HEIGHT + EYE_HEIGHT, 0.48));
      targetPoints.push(new THREE.Vector3(3.8, FLOOR_HEIGHT + 1.45, 1.15));
    } else if (roomChanged && activeRoom !== "room-lobby") {
      positionPoints.push(new THREE.Vector3(4.72, camera.position.y, 2.65));
      targetPoints.push(new THREE.Vector3(3.8, camera.position.y - 0.15, 1.2));
    } else if (roomChanged && activeRoom === "room-lobby") {
      positionPoints.push(new THREE.Vector3(4.72, EYE_HEIGHT, 2.65));
      targetPoints.push(new THREE.Vector3(3.4, 1.45, 1.4));
    }

    positionPoints.push(destination);
    targetPoints.push(target);
    route.current = {
      position: new THREE.CatmullRomCurve3(positionPoints, false, "centripetal"),
      target: new THREE.CatmullRomCurve3(targetPoints, false, "centripetal"),
      elapsed: 0,
      duration: roomChanged ? 2.35 : 1.25,
      fromFov: camera instanceof THREE.PerspectiveCamera ? camera.fov : 58,
      toFov: selectedPose?.fov || fallbackPose.fov || 58,
    };
    if (!selectedPose) freePositions.current[activeRoom] = destination.clone();
    previousRoom.current = activeRoom;
    previousSelected.current = selectedExhibit;
  }, [activeRoom, camera, selectedExhibit, world]);

  useFrame((_, delta) => {
    if (route.current) {
      const current = route.current;
      current.elapsed = Math.min(current.duration, current.elapsed + delta);
      const linear = current.elapsed / current.duration;
      const eased = linear * linear * (3 - 2 * linear);
      current.position.getPoint(eased, camera.position);
      current.target.getPoint(eased, lookAt.current);
      camera.lookAt(lookAt.current);
      if (camera instanceof THREE.PerspectiveCamera) {
        camera.fov = THREE.MathUtils.lerp(current.fromFov, current.toFov, eased);
        camera.updateProjectionMatrix();
      }
      if (linear >= 1) {
        const direction = lookAt.current.clone().sub(camera.position).normalize();
        baseYaw.current = Math.atan2(-direction.x, -direction.z);
        basePitch.current = Math.asin(THREE.MathUtils.clamp(direction.y, -0.72, 0.72));
        route.current = null;
      }
      const direction = camera.getWorldDirection(new THREE.Vector3());
      const wrap = document.querySelector<HTMLElement>(".museum-canvas-wrap");
      if (wrap) {
        wrap.dataset.cameraPosition = camera.position.toArray().map((value) => value.toFixed(3)).join(",");
        wrap.dataset.cameraDirection = direction.toArray().map((value) => value.toFixed(3)).join(",");
      }
      return;
    }

    const focused = Boolean(selectedExhibit);
    const typing = isTypingTarget(document.activeElement);
    if (!focused && !typing && (keys.current.size || keyImpulse.current.size)) {
      const speed = keys.current.size ? 2.35 * delta : 0;
      const impulse = keyImpulse.current.size ? 0.16 : 0;
      const yaw = baseYaw.current + pointer.x * THREE.MathUtils.degToRad(42);
      const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
      const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
      const candidate = camera.position.clone();
      if (keys.current.has("w") || keyImpulse.current.has("w")) candidate.addScaledVector(forward, speed + impulse);
      if (keys.current.has("s") || keyImpulse.current.has("s")) candidate.addScaledVector(forward, -speed - impulse);
      if (keys.current.has("a") || keyImpulse.current.has("a")) candidate.addScaledVector(right, -speed - impulse);
      if (keys.current.has("d") || keyImpulse.current.has("d")) candidate.addScaledVector(right, speed + impulse);
      clampAndCollide(candidate, activeRoom);
      camera.position.copy(candidate);
      freePositions.current[activeRoom] = candidate.clone();
      keyImpulse.current.clear();
    }

    const yawLimit = focused ? 4 : 44;
    const pitchLimit = focused ? 3 : 18;
    const yaw = baseYaw.current + pointer.x * THREE.MathUtils.degToRad(yawLimit);
    const pitch = THREE.MathUtils.clamp(
      basePitch.current - pointer.y * THREE.MathUtils.degToRad(pitchLimit),
      THREE.MathUtils.degToRad(-28),
      THREE.MathUtils.degToRad(28),
    );
    const direction = new THREE.Vector3(
      -Math.sin(yaw) * Math.cos(pitch),
      Math.sin(pitch),
      -Math.cos(yaw) * Math.cos(pitch),
    );
    lookAt.current.copy(camera.position).addScaledVector(direction, 4);
    camera.lookAt(lookAt.current);
    const wrap = document.querySelector<HTMLElement>(".museum-canvas-wrap");
    if (wrap) {
      wrap.dataset.cameraPosition = camera.position.toArray().map((value) => value.toFixed(3)).join(",");
      wrap.dataset.cameraDirection = direction.toArray().map((value) => value.toFixed(3)).join(",");
    }
  });

  return null;
}

function makeLabelTexture(kicker: string, title: string, body: string, accent: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 640;
  const context = canvas.getContext("2d")!;
  context.fillStyle = PAPER;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = accent;
  context.fillRect(0, 0, 24, canvas.height);
  context.fillStyle = "#61574d";
  context.font = "700 26px Arial";
  context.fillText(kicker, 68, 82);
  context.fillStyle = INK;
  context.font = "700 56px Arial";
  context.fillText(title.slice(0, 20), 68, 164);
  context.fillStyle = "#4b4540";
  context.font = "30px Arial";
  const words = body.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (context.measureText(next).width > 870 && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  lines.slice(0, 5).forEach((value, index) => context.fillText(value, 68, 235 + index * 46));
  context.fillStyle = accent;
  context.fillRect(68, 546, 888, 2);
  context.fillStyle = "#61574d";
  context.font = "700 24px Arial";
  context.fillText("CLICK / ENTER TO EXPLORE", 68, 594);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function ExhibitPanel({ anchor, kicker, title, body, accent, selected, interactive, onSelect }: {
  anchor: (typeof PUBLIC_ANCHORS)[number];
  kicker: string;
  title: string;
  body: string;
  accent: string;
  selected: boolean;
  interactive: boolean;
  onSelect: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const texture = useMemo(() => makeLabelTexture(kicker, title, body, accent), [accent, body, kicker, title]);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <group
      position={anchor.position}
      rotation={anchor.rotation}
      onClick={interactive ? (event) => { event.stopPropagation(); onSelect(); } : undefined}
      onPointerOver={interactive ? (event) => { event.stopPropagation(); setHovered(true); document.body.style.cursor = "pointer"; } : undefined}
      onPointerOut={interactive ? () => { setHovered(false); document.body.style.cursor = "default"; } : undefined}
    >
      <mesh position={[0, 0, -0.04]} castShadow>
        <boxGeometry args={[2.42, 1.52, 0.12]} />
        <meshStandardMaterial color={selected ? accent : "#382d28"} roughness={0.64} metalness={0.08} />
      </mesh>
      <mesh position={[0, 0, 0.03]} scale={hovered || selected ? 1.025 : 1}>
        <planeGeometry args={[2.28, 1.38]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
      <pointLight position={[0, 0, 0.55]} intensity={selected ? 1.8 : hovered ? 0.9 : 0.15} distance={2.4} color={accent} />
    </group>
  );
}

function ProjectPedestal({ exhibit, anchor, index, selected, interactive, onSelect }: {
  exhibit: ExhibitPlan;
  anchor: (typeof PROJECT_ANCHORS)[number];
  index: number;
  selected: boolean;
  interactive: boolean;
  onSelect: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const accent = [CORAL, TEAL, "#d7b458", "#8d9fe8"][index % 4];
  const texture = useMemo(
    () => makeLabelTexture(`PROJECT ${String(index + 1).padStart(2, "0")}`, exhibit.title, exhibit.body, accent),
    [accent, exhibit.body, exhibit.title, index],
  );
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <group
      position={anchor.position}
      onClick={interactive ? (event) => { event.stopPropagation(); onSelect(); } : undefined}
      onPointerOver={interactive ? (event) => { event.stopPropagation(); setHovered(true); document.body.style.cursor = "pointer"; } : undefined}
      onPointerOut={interactive ? () => { setHovered(false); document.body.style.cursor = "default"; } : undefined}
    >
      <mesh castShadow receiveShadow position={[0, 0.32, 0]}>
        <boxGeometry args={[1.35, 0.64, 1.1]} />
        <meshStandardMaterial color="#332925" roughness={0.66} />
      </mesh>
      <mesh castShadow position={[0, 1.06, 0]} rotation={[0, hovered || selected ? 0 : index % 2 ? -0.13 : 0.13, 0]}>
        <boxGeometry args={[1.26, 0.86, 0.08]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={selected ? 0.22 : 0.04} />
      </mesh>
      <mesh position={[0, 1.06, 0.046]}>
        <planeGeometry args={[1.17, 0.77]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0.05, 0]}>
        <cylinderGeometry args={[0.72, 0.78, 0.1, 24]} />
        <meshStandardMaterial color={selected ? accent : BRASS} roughness={0.42} metalness={0.42} />
      </mesh>
    </group>
  );
}

function FloorPortal({ active, onEnter }: { active: boolean; onEnter: () => void }) {
  const [hovered, setHovered] = useState(false);
  const texture = useMemo(() => makeLabelTexture("LIFT", "2F", "PRIVATE AREA", TEAL), []);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <group
      position={FLOOR_PORTAL_POSITION}
      onClick={active ? (event) => { event.stopPropagation(); onEnter(); } : undefined}
      onPointerOver={active ? (event) => { event.stopPropagation(); setHovered(true); document.body.style.cursor = "pointer"; } : undefined}
      onPointerOut={active ? () => { setHovered(false); document.body.style.cursor = "default"; } : undefined}
    >
      <mesh position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.36, 0.58, 32]} />
        <meshBasicMaterial color={hovered ? CORAL : TEAL} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0.62, 0]}>
        <cylinderGeometry args={[0.025, 0.025, 1.15, 12]} />
        <meshStandardMaterial color={BRASS} />
      </mesh>
      <mesh position={[0, 1.26, 0]}>
        <boxGeometry args={[1.15, 0.4, 0.08]} />
        <meshStandardMaterial color="#312925" emissive={hovered ? TEAL : INK} emissiveIntensity={hovered ? 0.3 : 0} />
      </mesh>
      <mesh position={[0, 1.26, 0.046]}>
        <planeGeometry args={[1.05, 0.31]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
    </group>
  );
}

function PrivateSuite({ activeRoom, selected, onEnter, onSelect }: {
  activeRoom: string;
  selected: boolean;
  onEnter: () => void;
  onSelect: () => void;
}) {
  const [gateHovered, setGateHovered] = useState(false);
  const [deskHovered, setDeskHovered] = useState(false);
  const gateTexture = useMemo(() => makeLabelTexture("PRIVATE AREA", "PASSWORD", "CLICK TO UNLOCK", "#8d9fe8"), []);
  useEffect(() => () => gateTexture.dispose(), [gateTexture]);
  return (
    <group>
      <group position={[-1.15, FLOOR_HEIGHT + 2.0, 0.88]}>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[8.1, 3.95, 0.14]} />
          <meshStandardMaterial color="#3c384e" roughness={0.88} />
        </mesh>
        <mesh position={[0, 0, 0.08]}>
          <planeGeometry args={[7.55, 3.35]} />
          <meshStandardMaterial color="#24243a" roughness={0.9} />
        </mesh>
      </group>
      <group
        position={PRIVATE_GATE_POSITION}
        onClick={activeRoom === "room-private-entry" ? (event) => { event.stopPropagation(); onEnter(); } : undefined}
        onPointerOver={activeRoom === "room-private-entry" ? (event) => { event.stopPropagation(); setGateHovered(true); document.body.style.cursor = "pointer"; } : undefined}
        onPointerOut={activeRoom === "room-private-entry" ? () => { setGateHovered(false); document.body.style.cursor = "default"; } : undefined}
      >
        <mesh position={[0, 1.45, 0]}>
          <boxGeometry args={[1.48, 2.9, 0.14]} />
          <meshStandardMaterial color={gateHovered ? "#8579be" : "#625a91"} emissive={gateHovered ? TEAL : "#302a58"} emissiveIntensity={gateHovered ? 0.22 : 0.08} />
        </mesh>
        <mesh position={[-0.52, 1.4, 0.12]}><sphereGeometry args={[0.08, 14, 10]} /><meshStandardMaterial color={BRASS} metalness={0.55} /></mesh>
        <mesh position={[0, 2.45, 0.08]}><planeGeometry args={[1.25, 0.42]} /><meshBasicMaterial map={gateTexture} toneMapped={false} /></mesh>
      </group>
      <group
        position={DIARY_DESK_POSITION}
        onClick={activeRoom === "room-private" ? (event) => { event.stopPropagation(); onSelect(); } : undefined}
        onPointerOver={activeRoom === "room-private" ? (event) => { event.stopPropagation(); setDeskHovered(true); document.body.style.cursor = "pointer"; } : undefined}
        onPointerOut={activeRoom === "room-private" ? () => { setDeskHovered(false); document.body.style.cursor = "default"; } : undefined}
      >
        <mesh castShadow receiveShadow position={[0, 0.78, 0]}><boxGeometry args={[2.7, 0.16, 1.25]} /><meshStandardMaterial color="#34231f" /></mesh>
        {[[-1.05, -0.43], [-1.05, 0.43], [1.05, -0.43], [1.05, 0.43]].map(([x, z]) => (
          <mesh key={`${x}-${z}`} castShadow position={[x, 0.38, z]}><boxGeometry args={[0.13, 0.76, 0.13]} /><meshStandardMaterial color="#34231f" /></mesh>
        ))}
        <group position={[0, 0.96, 0]} rotation={[0.18, 0, 0]}>
          <mesh position={[-0.36, 0, 0]} rotation={[0, 0, 0.08]}><boxGeometry args={[0.72, 0.06, 0.82]} /><meshStandardMaterial color="#f5ebda" emissive={deskHovered || selected ? CORAL : INK} emissiveIntensity={deskHovered || selected ? 0.16 : 0} /></mesh>
          <mesh position={[0.36, 0, 0]} rotation={[0, 0, -0.08]}><boxGeometry args={[0.72, 0.06, 0.82]} /><meshStandardMaterial color="#f5ebda" /></mesh>
        </group>
        <pointLight position={[0.8, 1.8, 0.2]} intensity={deskHovered || selected ? 2.2 : 0.8} distance={3} color="#ffd09a" />
      </group>
    </group>
  );
}

function FallbackFloor({ offset }: { offset: number }) {
  return (
    <group position={[0, offset, 0]}>
      <mesh receiveShadow position={[0, -0.08, 0]}><boxGeometry args={[11.8, 0.16, 7.8]} /><meshStandardMaterial color="#6d5c4d" /></mesh>
      <mesh receiveShadow position={[0, 2.1, -3.82]}><boxGeometry args={[11.8, 4.2, 0.16]} /><meshStandardMaterial color="#5b5048" /></mesh>
      <mesh receiveShadow position={[-5.82, 2.1, 0]}><boxGeometry args={[0.16, 4.2, 7.8]} /><meshStandardMaterial color="#5b5048" /></mesh>
      <mesh receiveShadow position={[5.82, 2.1, 0]}><boxGeometry args={[0.16, 4.2, 7.8]} /><meshStandardMaterial color="#5b5048" /></mesh>
      <mesh receiveShadow position={[0, 4.2, 0]}><boxGeometry args={[11.8, 0.12, 7.8]} /><meshStandardMaterial color="#75685d" side={THREE.DoubleSide} /></mesh>
    </group>
  );
}

function MuseumStructure({ onStatus }: { onStatus: (status: "loading" | "ready" | "fallback") => void }) {
  const [source, setSource] = useState<THREE.Group | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    onStatus("loading");
    new GLTFLoader().load(
      MUSEUM_MODEL_URL,
      (gltf) => {
        if (!active) return;
        gltf.scene.traverse((object) => {
          if (object instanceof THREE.Mesh) {
            object.castShadow = true;
            object.receiveShadow = true;
          }
        });
        setSource(gltf.scene);
        onStatus("ready");
      },
      undefined,
      () => {
        if (!active) return;
        setFailed(true);
        onStatus("fallback");
      },
    );
    return () => { active = false; };
  }, [onStatus]);
  const floors = useMemo(() => source ? [source.clone(true), source.clone(true)] : [], [source]);
  if (failed) return <><FallbackFloor offset={0} /><FallbackFloor offset={FLOOR_HEIGHT} /></>;
  if (!floors.length) return null;
  return <>{floors.map((floor, index) => <primitive key={index} object={floor} position={[0, index * FLOOR_HEIGHT, 0]} />)}</>;
}

function Scene({ world, activeRoom, selectedExhibit, guestbookMessages, onSelect, onRoomChange, onModelStatus }: {
  world: WorldPlan;
  activeRoom: string;
  selectedExhibit?: string;
  guestbookMessages: string[];
  onSelect: (id: string) => void;
  onRoomChange: (roomId: string) => void;
  onModelStatus: (status: "loading" | "ready" | "fallback") => void;
}) {
  const projects = world.exhibits.filter((item) => item.eyebrow === "PROJECT").slice(0, 4);
  const journey = world.profile.items.filter((item) => item.kind === "experience" || item.kind === "education");
  const achievements = world.profile.items.filter((item) => item.kind === "achievement");
  const content = [
    { kicker: "PROFILE 01", title: world.profile.name, body: world.profile.headline, accent: CORAL },
    { kicker: "JOURNEY 02", title: "经历与教育", body: journey.map((item) => item.title).join(" · "), accent: "#d7b458" },
    { kicker: "TOOLBOX 03", title: `${world.profile.skills.length} 项能力`, body: world.profile.skills.join(" · "), accent: TEAL },
    { kicker: "CONTACT 04", title: "保持联系", body: world.profile.contacts.join(" · "), accent: "#8d9fe8" },
    { kicker: "HIGHLIGHTS 05", title: "成就与影响", body: achievements.map((item) => item.title).join(" · "), accent: "#d7b458" },
    { kicker: "VISITOR 06", title: "访客留言", body: guestbookMessages.slice(-2).join(" · ") || "点击留下你的文字", accent: "#8d9fe8" },
  ];
  return (
    <>
      <color attach="background" args={["#10171a"]} />
      <fog attach="fog" args={["#10171a", 13, 25]} />
      <ambientLight intensity={0.72} color="#ddd7ca" />
      <hemisphereLight intensity={0.82} color="#bfd7e2" groundColor="#33241d" />
      <directionalLight castShadow position={[4, 10, 5]} intensity={2.2} color="#ffe0b3" shadow-mapSize={[1536, 1536]} />
      <pointLight position={[0, 3.5, 1]} intensity={5} distance={10} color="#ffd7ad" />
      <pointLight position={[0, FLOOR_HEIGHT + 3.5, 1]} intensity={4} distance={10} color="#c7d8ff" />
      <MuseumStructure onStatus={onModelStatus} />
      <CameraRig activeRoom={activeRoom} selectedExhibit={selectedExhibit} world={world} />
      {PUBLIC_ANCHORS.map((anchor, index) => {
        const item = content[index];
        return <ExhibitPanel key={anchor.id} anchor={anchor} {...item} selected={selectedExhibit === anchor.id} interactive={activeRoom === "room-lobby"} onSelect={() => onSelect(anchor.id)} />;
      })}
      {projects.map((exhibit, index) => (
        <ProjectPedestal
          key={exhibit.id}
          exhibit={exhibit}
          anchor={PROJECT_ANCHORS[index]}
          index={index}
          selected={selectedExhibit === exhibit.id}
          interactive={activeRoom === "room-lobby"}
          onSelect={() => onSelect(exhibit.id)}
        />
      ))}
      <FloorPortal active={activeRoom === "room-lobby"} onEnter={() => onRoomChange("room-private-entry")} />
      <PrivateSuite
        activeRoom={activeRoom}
        selected={selectedExhibit === "bedroom-diary"}
        onEnter={() => onRoomChange("room-private")}
        onSelect={() => onSelect("bedroom-diary")}
      />
    </>
  );
}

export function WorldCanvas({ world, activeRoom, selectedExhibit, guestbookMessages = [], onSelect, onRoomChange }: {
  world: WorldPlan;
  activeRoom: string;
  selectedExhibit?: string;
  guestbookMessages?: string[];
  onSelect: (id: string) => void;
  onRoomChange: (roomId: string) => void;
}) {
  const [modelStatus, setModelStatus] = useState<"loading" | "ready" | "fallback">("loading");
  const [floorTransition, setFloorTransition] = useState(false);
  const previousFloor = useRef(activeRoom === "room-lobby" ? 1 : 2);
  useEffect(() => {
    const nextFloor = activeRoom === "room-lobby" ? 1 : 2;
    if (nextFloor === previousFloor.current) return;
    previousFloor.current = nextFloor;
    setFloorTransition(true);
    const timer = window.setTimeout(() => setFloorTransition(false), 1500);
    return () => window.clearTimeout(timer);
  }, [activeRoom]);
  return (
    <div className="museum-canvas-wrap" data-model-status={modelStatus} data-active-room={activeRoom}>
      <Canvas
        dpr={[1, 1.35]}
        shadows
        camera={{ position: PUBLIC_START, fov: 61, near: 0.05, far: 45 }}
        gl={{ antialias: true, powerPreference: "high-performance" }}
        onPointerMissed={() => onSelect("")}
      >
        <Scene
          world={world}
          activeRoom={activeRoom}
          selectedExhibit={selectedExhibit}
          guestbookMessages={guestbookMessages}
          onSelect={onSelect}
          onRoomChange={onRoomChange}
          onModelStatus={setModelStatus}
        />
      </Canvas>
      <div className={`floor-transition ${floorTransition ? "is-active" : ""}`} aria-hidden="true" />
      <div className={`model-status ${modelStatus === "loading" ? "is-visible" : ""}`} role="status" aria-hidden={modelStatus !== "loading"}>
        正在载入 GLB 博物馆…
      </div>
      {modelStatus === "fallback" ? <div className="model-fallback-note" role="status">GLB 加载失败，已启用可探索的安全回退空间。</div> : null}
    </div>
  );
}
