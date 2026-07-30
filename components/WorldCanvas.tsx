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
const PROJECT_WALL_PREFIX = "project-wall:";

type ProjectWallPlacement = {
  position: Vec3;
  rotation: Vec3;
  camera: Vec3;
};

const projectWallPlacements: ProjectWallPlacement[] = [
  { position: [-10.62, 2.1, -4.4], rotation: [0, Math.PI / 2, 0], camera: [-6.25, 1.66, -4.4] },
  { position: [-10.62, 2.1, -10.6], rotation: [0, Math.PI / 2, 0], camera: [-6.25, 1.66, -10.6] },
  { position: [10.62, 2.1, -10.6], rotation: [0, -Math.PI / 2, 0], camera: [6.25, 1.66, -10.6] },
  { position: [10.62, 2.1, -4.4], rotation: [0, -Math.PI / 2, 0], camera: [6.25, 1.66, -4.4] },
];

const authoredFocusTargets: Record<string, { target: Vec3; camera: Vec3; fov: number }> = {
  "showroom-profile": { target: [-5.8, 2.5, -20.82], camera: [-5.8, 1.66, -16.65], fov: 46 },
  "showroom-journey": { target: [0, 2.5, -20.82], camera: [0, 1.66, -16.65], fov: 46 },
  "showroom-skills": { target: [5.8, 2.5, -20.82], camera: [5.8, 1.66, -16.65], fov: 46 },
  "showroom-contact": { target: [-5.3, 0.76, -20.82], camera: [-5.3, 1.35, -16.85], fov: 48 },
  "showroom-highlights": { target: [3.6, 0.76, -20.82], camera: [3.6, 1.35, -16.85], fov: 48 },
  "showroom-guestbook": { target: [-10.58, 1.7, 2.5], camera: [-7.35, 1.66, 2.5], fov: 46 },
  "bedroom-diary": { target: [-20.2, 0.96, -16.25], camera: [-16.55, 1.56, -16.25], fov: 48 },
};

type CameraRoute = {
  position: THREE.CatmullRomCurve3;
  target: THREE.CatmullRomCurve3;
  duration: number;
  elapsed: number;
  fromFov: number;
  toFov: number;
};

function CameraRig({ activeRoom, selectedExhibit, world }: { activeRoom: string; selectedExhibit?: string; world: WorldPlan }) {
  const { camera, pointer } = useThree();
  const lookAt = useMemo(() => new THREE.Vector3(0, 3.1, 5.6), []);
  const lookAtTarget = useMemo(() => new THREE.Vector3(0, 3.1, 5.6), []);
  const mouseLookTarget = useMemo(() => new THREE.Vector3(0, 3.1, 5.6), []);
  const destination = useMemo(() => new THREE.Vector3(0, 1.05, 23.5), []);
  const frameDestination = useMemo(() => new THREE.Vector3(), []);
  const viewDirection = useMemo(() => new THREE.Vector3(), []);
  const viewRight = useMemo(() => new THREE.Vector3(), []);
  const viewUp = useMemo(() => new THREE.Vector3(), []);
  const desiredFov = useRef(48);
  const previousRoom = useRef(activeRoom);
  const previousExhibit = useRef(selectedExhibit);
  const route = useRef<CameraRoute | null>(null);

  useEffect(() => {
    const room = world.rooms.find((item) => item.id === activeRoom);
    const wallProjectId = selectedExhibit?.startsWith(PROJECT_WALL_PREFIX)
      ? selectedExhibit.slice(PROJECT_WALL_PREFIX.length)
      : undefined;
    const exhibit = world.exhibits.find((item) => item.id === (wallProjectId || selectedExhibit));
    const exhibitRoom = exhibit ? world.rooms.find((item) => item.id === exhibit.roomId) : undefined;
    const authoredFocus = selectedExhibit ? authoredFocusTargets[selectedExhibit] : undefined;
    const projectIndex = exhibit?.eyebrow === "PROJECT"
      ? world.exhibits.filter((item) => item.eyebrow === "PROJECT").findIndex((item) => item.id === exhibit.id)
      : -1;
    const wallFocus = wallProjectId && projectIndex >= 0 ? projectWallPlacements[projectIndex] : undefined;
    if (authoredFocus) {
      lookAtTarget.set(...authoredFocus.target);
      destination.set(...authoredFocus.camera);
      desiredFov.current = authoredFocus.fov;
    } else if (wallFocus) {
      lookAtTarget.set(...wallFocus.position);
      destination.set(...wallFocus.camera);
      desiredFov.current = 50;
    } else if (exhibit) {
      lookAtTarget.set(exhibit.position[0], Math.max(1, exhibit.position[1]), exhibit.position[2]);
      if (exhibit.eyebrow === "PROJECT") {
        destination.set(exhibit.position[0], 1.66, exhibit.position[2] + 3.8);
        desiredFov.current = 50;
      } else {
        const centralSide = exhibitRoom && exhibitRoom.center[0] < 0 ? 1 : -1;
        destination.set(exhibit.position[0] + centralSide * 3.9, 1.66, exhibit.position[2]);
        desiredFov.current = 48;
      }
    } else if (room?.kind === "lobby") {
      lookAtTarget.set(0, 2.05, -16.3);
      destination.set(0, 1.66, 2.7);
      desiredFov.current = 62;
    } else if (room?.kind === "bedroom") {
      lookAtTarget.set(-20.2, 1.02, -16.25);
      destination.set(-13.85, 1.66, -16.25);
      desiredFov.current = 58;
    } else if (room) {
      lookAtTarget.set(room.center[0] - room.size[0] * 0.12, 1.52, room.center[2]);
      destination.set(room.center[0] + room.size[0] * 0.32, 1.66, room.center[2]);
      desiredFov.current = 64;
    } else {
      lookAtTarget.set(0, 3.1, 5.6);
      destination.set(0, 1.08, 22.5);
      desiredFov.current = 45;
    }

    const roomChanged = previousRoom.current !== activeRoom;
    const exhibitChanged = previousExhibit.current !== selectedExhibit;
    if (!roomChanged && !exhibitChanged) return;

    const startPosition = camera.position.clone();
    const startTarget = lookAt.clone();
    const fromFov = camera instanceof THREE.PerspectiveCamera ? camera.fov : desiredFov.current;
    let positionPoints = [startPosition, destination.clone()];
    let targetPoints = [startTarget, lookAtTarget.clone()];
    let duration = exhibit || authoredFocus || wallFocus ? 1.7 : 2.2;

    if (previousRoom.current === "exterior" && activeRoom === "room-lobby") {
      positionPoints = [
        startPosition,
        new THREE.Vector3(0, 1.45, 11.8),
        new THREE.Vector3(0, 1.64, 6.9),
        destination.clone(),
      ];
      targetPoints = [
        startTarget,
        new THREE.Vector3(0, 2.05, 7.3),
        new THREE.Vector3(0, 1.55, -2.8),
        lookAtTarget.clone(),
      ];
      duration = 2.7;
    } else if (previousRoom.current === "room-lobby" && activeRoom === "room-private") {
      positionPoints = [
        startPosition,
        new THREE.Vector3(-6.2, 1.66, -11.8),
        new THREE.Vector3(-10.15, 1.66, -16.25),
        destination.clone(),
      ];
      targetPoints = [
        startTarget,
        new THREE.Vector3(-10.8, 1.42, -16.25),
        new THREE.Vector3(-14.4, 1.4, -16.25),
        lookAtTarget.clone(),
      ];
      duration = 2.8;
    } else if (previousRoom.current === "room-private" && activeRoom === "room-lobby") {
      positionPoints = [
        startPosition,
        new THREE.Vector3(-11.45, 1.66, -16.25),
        new THREE.Vector3(-7.1, 1.66, -11.8),
        destination.clone(),
      ];
      targetPoints = [
        startTarget,
        new THREE.Vector3(-10.2, 1.52, -16.25),
        new THREE.Vector3(-3.4, 1.55, -7),
        lookAtTarget.clone(),
      ];
      duration = 2.6;
    } else if (previousRoom.current === "room-lobby" && activeRoom === "exterior") {
      positionPoints = [
        startPosition,
        new THREE.Vector3(0, 1.66, 7.85),
        new THREE.Vector3(0, 1.48, 11.2),
        destination.clone(),
      ];
      targetPoints = [
        startTarget,
        new THREE.Vector3(0, 1.55, 8.8),
        new THREE.Vector3(0, 2.3, 16),
        lookAtTarget.clone(),
      ];
      duration = 2.7;
    }

    route.current = {
      position: new THREE.CatmullRomCurve3(positionPoints, false, "centripetal"),
      target: new THREE.CatmullRomCurve3(targetPoints, false, "centripetal"),
      duration,
      elapsed: 0,
      fromFov,
      toFov: desiredFov.current,
    };
    previousRoom.current = activeRoom;
    previousExhibit.current = selectedExhibit;
  }, [activeRoom, camera, destination, lookAt, lookAtTarget, selectedExhibit, world]);

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

    frameDestination.copy(destination);
    const positionAlpha = 1 - Math.exp(-delta * 2.1);
    const targetAlpha = 1 - Math.exp(-delta * 4.2);
    camera.position.lerp(frameDestination, positionAlpha);

    viewDirection.copy(lookAtTarget).sub(camera.position);
    const lookDistance = Math.max(1, viewDirection.length());
    viewDirection.normalize();
    viewRight.crossVectors(viewDirection, camera.up).normalize();
    viewUp.crossVectors(viewRight, viewDirection).normalize();

    const focused = Boolean(selectedExhibit);
    const maxYaw = THREE.MathUtils.degToRad(
      focused ? 5 : activeRoom === "room-lobby" ? 32 : activeRoom === "room-private" ? 28 : 7,
    );
    const maxPitch = THREE.MathUtils.degToRad(
      focused ? 3 : activeRoom === "room-lobby" ? 14 : activeRoom === "room-private" ? 12 : 4,
    );
    mouseLookTarget
      .copy(lookAtTarget)
      .addScaledVector(viewRight, Math.tan(maxYaw) * lookDistance * pointer.x)
      .addScaledVector(viewUp, Math.tan(maxPitch) * lookDistance * pointer.y);

    lookAt.lerp(mouseLookTarget, targetAlpha);
    camera.lookAt(lookAt);
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = THREE.MathUtils.lerp(camera.fov, desiredFov.current, targetAlpha);
      camera.updateProjectionMatrix();
    }
  });
  return null;
}

function TextPanel({ title, subtitle, position, width = 4.4, height = 1.08, rotation = [0, 0, 0] }: {
  title: string;
  subtitle: string;
  position: Vec3;
  width?: number;
  height?: number;
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
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>
  );
}

function drawWrappedText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  startY: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number,
) {
  const characters = Array.from(text.replace(/\s+/g, " ").trim());
  let line = "";
  let y = startY;
  let lines = 0;
  for (const character of characters) {
    const next = line + character;
    if (context.measureText(next).width > maxWidth && line) {
      context.fillText(line, x, y);
      lines += 1;
      if (lines >= maxLines) return y;
      line = character.trimStart();
      y += lineHeight;
    } else {
      line = next;
    }
  }
  if (line && lines < maxLines) context.fillText(line, x, y);
  return y;
}

type InformationFrameVariant = "text" | "profile" | "timeline" | "skills" | "project";

function projectAccent(title: string) {
  const normalized = title.toLowerCase();
  if (normalized.includes("echo")) return "#7088d4";
  if (normalized === "room") return CORAL;
  if (normalized.includes("museum")) return "#d3aa54";
  if (normalized.includes("field")) return TEAL;
  return "#8d77bf";
}

function drawProjectArtwork(context: CanvasRenderingContext2D, title: string, accent: string) {
  const normalized = title.toLowerCase();
  context.fillStyle = "#20212d";
  context.fillRect(0, 0, 1024, 348);
  context.strokeStyle = accent;
  context.fillStyle = accent;
  context.lineWidth = 6;

  if (normalized.includes("echo")) {
    const stars = [[150, 235], [265, 105], [390, 205], [520, 82], [685, 188], [842, 104], [910, 252]];
    context.beginPath();
    stars.forEach(([x, y], index) => index ? context.lineTo(x, y) : context.moveTo(x, y));
    context.stroke();
    stars.forEach(([x, y], index) => {
      context.beginPath();
      context.arc(x, y, index % 2 ? 16 : 10, 0, Math.PI * 2);
      context.fill();
    });
    context.strokeStyle = "#f4eadb";
    context.lineWidth = 2;
    [105, 190, 275].forEach((radius) => {
      context.beginPath();
      context.arc(520, 175, radius, 0.15, Math.PI + 0.45);
      context.stroke();
    });
  } else if (normalized === "room") {
    context.strokeStyle = accent;
    context.lineWidth = 14;
    context.strokeRect(150, 68, 724, 220);
    context.beginPath();
    context.moveTo(430, 68);
    context.lineTo(430, 288);
    context.moveTo(660, 68);
    context.lineTo(660, 288);
    context.moveTo(150, 182);
    context.lineTo(430, 182);
    context.stroke();
    context.fillStyle = "#f4eadb";
    [[240, 125], [535, 175], [765, 175], [290, 238]].forEach(([x, y]) => context.fillRect(x - 18, y - 18, 36, 36));
    context.fillStyle = accent;
    context.fillRect(408, 142, 44, 78);
  } else if (normalized.includes("museum")) {
    const displays = [[230, 232, "circle"], [510, 210, "square"], [790, 232, "triangle"]] as const;
    displays.forEach(([x, y, shape], index) => {
      context.fillStyle = index === 1 ? "#f4eadb" : accent;
      context.fillRect(x - 72, y + 32, 144, 28);
      context.fillRect(x - 44, y + 60, 88, 34);
      context.beginPath();
      if (shape === "circle") context.arc(x, y, 48, 0, Math.PI * 2);
      if (shape === "square") context.rect(x - 42, y - 42, 84, 84);
      if (shape === "triangle") {
        context.moveTo(x, y - 55);
        context.lineTo(x - 58, y + 45);
        context.lineTo(x + 58, y + 45);
        context.closePath();
      }
      context.fill();
    });
  } else {
    context.strokeStyle = "#f4eadb";
    context.lineWidth = 4;
    context.beginPath();
    context.moveTo(95, 196);
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].forEach((index) => {
      const x = 95 + index * 82;
      const y = 196 + Math.sin(index * 1.6) * 72;
      context.lineTo(x, y);
    });
    context.stroke();
    context.strokeStyle = accent;
    context.lineWidth = 18;
    context.beginPath();
    context.moveTo(120, 86);
    context.bezierCurveTo(310, 280, 590, 20, 910, 258);
    context.stroke();
    [210, 420, 640, 835].forEach((x, index) => {
      context.fillStyle = index % 2 ? "#f4eadb" : accent;
      context.beginPath();
      context.arc(x, 115 + index * 38, 17, 0, Math.PI * 2);
      context.fill();
    });
  }
}

function InformationFrame({
  kicker,
  title,
  body,
  position,
  rotation = [0, 0, 0],
  width = 2.65,
  height = 1.78,
  accent = TEAL,
  footer = "FROM THE ORIGINAL RESUME",
  variant = "text",
  details = [],
  interactive = false,
  selected = false,
  onSelect,
}: {
  kicker: string;
  title: string;
  body: string;
  position: Vec3;
  rotation?: Vec3;
  width?: number;
  height?: number;
  accent?: string;
  footer?: string;
  variant?: InformationFrameVariant;
  details?: string[];
  interactive?: boolean;
  selected?: boolean;
  onSelect?: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const group = useRef<THREE.Group>(null);
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 680;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#f4eadb";
    context.fillRect(0, 0, canvas.width, canvas.height);
    if (variant === "project") {
      drawProjectArtwork(context, title, accent);
      context.fillStyle = "rgba(244,234,219,0.9)";
      context.font = "700 28px Arial";
      context.fillText(kicker.toUpperCase(), 56, 56, 880);
      context.fillStyle = INK;
      context.font = "700 58px Arial";
      context.fillText(title, 56, 435, 900);
      context.fillStyle = "#5a5049";
      context.font = "28px Arial";
      const projectSummary = details.filter(Boolean).join(" · ") || body;
      drawWrappedText(context, projectSummary, 56, 492, 900, 38, 3);
    } else {
      context.fillStyle = accent;
      context.fillRect(0, 0, 28, canvas.height);
      context.fillStyle = "#6e5c51";
      context.font = "700 30px Arial";
      context.fillText(kicker.toUpperCase(), 72, 78, 860);
      context.fillStyle = INK;
      context.font = "700 58px Arial";
      const titleBottom = drawWrappedText(context, title, 72, 160, 860, 65, 2);

      if (variant === "profile") {
        context.fillStyle = accent;
        context.beginPath();
        context.arc(190, 355, 108, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = "#f4eadb";
        context.font = "700 88px Arial";
        context.textAlign = "center";
        context.fillText(Array.from(title).at(-1) || title.slice(0, 1), 190, 387, 160);
        context.textAlign = "start";
        context.fillStyle = "#514640";
        context.font = "29px Arial";
        drawWrappedText(context, body, 340, titleBottom + 78, 610, 40, 6);
      } else if (variant === "timeline") {
        context.strokeStyle = accent;
        context.lineWidth = 7;
        context.beginPath();
        context.moveTo(105, titleBottom + 74);
        context.lineTo(105, 555);
        context.stroke();
        context.font = "26px Arial";
        details.slice(0, 5).forEach((detail, index) => {
          const y = titleBottom + 83 + index * 78;
          context.fillStyle = accent;
          context.beginPath();
          context.arc(105, y - 8, 13, 0, Math.PI * 2);
          context.fill();
          context.fillStyle = "#514640";
          context.fillText(detail, 145, y, 790);
        });
      } else if (variant === "skills") {
        context.font = "700 25px Arial";
        details.slice(0, 10).forEach((detail, index) => {
          const column = index % 2;
          const row = Math.floor(index / 2);
          const x = 72 + column * 445;
          const y = titleBottom + 68 + row * 76;
          context.fillStyle = index % 3 === 0 ? accent : "#ded1bf";
          context.fillRect(x, y, 405, 52);
          context.fillStyle = INK;
          context.fillText(detail, x + 20, y + 35, 365);
        });
      } else {
        context.fillStyle = "#514640";
        context.font = "31px Arial";
        drawWrappedText(context, body, 72, titleBottom + 74, 860, 43, 5);
      }
    }
    context.strokeStyle = "#c9b9a4";
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(56, 596);
    context.lineTo(952, 596);
    context.stroke();
    context.fillStyle = "#75685f";
    context.font = "700 23px Arial";
    context.fillText(footer.toUpperCase(), 56, 640, 880);
    const result = new THREE.CanvasTexture(canvas);
    result.colorSpace = THREE.SRGBColorSpace;
    result.anisotropy = 8;
    return result;
  }, [accent, body, details, footer, kicker, title, variant]);

  useEffect(() => () => texture.dispose(), [texture]);
  useFrame(() => {
    if (!group.current) return;
    const targetScale = selected ? 1.045 : hovered ? 1.025 : 1;
    const scale = THREE.MathUtils.lerp(group.current.scale.x, targetScale, 0.15);
    group.current.scale.setScalar(scale);
  });

  return (
    <group
      ref={group}
      position={position}
      rotation={rotation}
      onClick={interactive && onSelect ? (event) => { event.stopPropagation(); onSelect(); } : undefined}
      onPointerOver={interactive ? (event) => { event.stopPropagation(); setHovered(true); document.body.style.cursor = "pointer"; } : undefined}
      onPointerOut={interactive ? () => { setHovered(false); document.body.style.cursor = "default"; } : undefined}
    >
      <mesh castShadow>
        <boxGeometry args={[width + 0.16, height + 0.16, 0.1]} />
        <meshStandardMaterial color={DARK_WOOD} emissive={selected ? accent : INK} emissiveIntensity={selected ? 0.22 : hovered ? 0.1 : 0} metalness={0.12} roughness={0.52} />
      </mesh>
      <mesh position={[0, 0, 0.061]}>
        <planeGeometry args={[width, height]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
      <mesh position={[0, -height / 2 + 0.035, 0.095]}>
        <boxGeometry args={[width, 0.07, 0.045]} />
        <meshBasicMaterial color={accent} toneMapped={false} />
      </mesh>
    </group>
  );
}

function InformationPlaque({ kicker, title, items, position, width, accent, interactive = false, selected = false, onSelect }: {
  kicker: string;
  title: string;
  items: string[];
  position: Vec3;
  width: number;
  accent: string;
  interactive?: boolean;
  selected?: boolean;
  onSelect?: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const group = useRef<THREE.Group>(null);
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1400;
    canvas.height = 360;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#f4eadb";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = accent;
    context.fillRect(0, 0, 22, canvas.height);
    context.fillStyle = "#6e5c51";
    context.font = "700 27px Arial";
    context.fillText(kicker.toUpperCase(), 58, 64, 500);
    context.fillStyle = INK;
    context.font = "700 48px Arial";
    context.fillText(title, 58, 132, 540);
    context.fillStyle = "#5b5048";
    context.font = "27px Arial";
    items.slice(0, 3).forEach((item, index) => {
      const x = 58 + index * 440;
      context.fillStyle = index === 0 ? accent : "#d8c9b5";
      context.fillRect(x, 194, 398, 8);
      context.fillStyle = "#5b5048";
      drawWrappedText(context, item, x, 246, 398, 34, 2);
    });
    const result = new THREE.CanvasTexture(canvas);
    result.colorSpace = THREE.SRGBColorSpace;
    result.anisotropy = 8;
    return result;
  }, [accent, items, kicker, title]);

  useEffect(() => () => texture.dispose(), [texture]);
  useFrame(() => {
    if (!group.current) return;
    const targetScale = selected ? 1.04 : hovered ? 1.025 : 1;
    const scale = THREE.MathUtils.lerp(group.current.scale.x, targetScale, 0.15);
    group.current.scale.setScalar(scale);
  });

  return (
    <group
      ref={group}
      position={position}
      onClick={interactive && onSelect ? (event) => { event.stopPropagation(); onSelect(); } : undefined}
      onPointerOver={interactive ? (event) => { event.stopPropagation(); setHovered(true); document.body.style.cursor = "pointer"; } : undefined}
      onPointerOut={interactive ? () => { setHovered(false); document.body.style.cursor = "default"; } : undefined}
    >
      <mesh castShadow><boxGeometry args={[width + 0.12, 0.86, 0.09]} /><meshStandardMaterial color={DARK_WOOD} emissive={selected ? accent : INK} emissiveIntensity={selected ? 0.24 : hovered ? 0.1 : 0} roughness={0.55} /></mesh>
      <mesh position={[0, 0, 0.055]}><planeGeometry args={[width, 0.76]} /><meshBasicMaterial map={texture} toneMapped={false} /></mesh>
    </group>
  );
}

function LivingInformationWall({ world, interactive, selectedId, onSelect }: { world: WorldPlan; interactive: boolean; selectedId?: string; onSelect: (id: string) => void }) {
  const timelineItems = world.profile.items.filter(
    (item) => item.kind === "experience" || item.kind === "education",
  ).map((item) => `${item.title}${item.subtitle ? ` · ${item.subtitle}` : ""}`);
  const achievementItems = world.profile.items
    .filter((item) => item.kind === "achievement")
    .map((item) => item.title);
  const panels = [
    {
      id: "showroom-profile",
      kicker: "PROFILE 01",
      title: world.profile.name,
      body: `${world.profile.headline}。${world.profile.summary}`,
      accent: CORAL,
      variant: "profile" as const,
      details: [] as string[],
    },
    {
      id: "showroom-journey",
      kicker: "JOURNEY 02",
      title: "经历与教育",
      body: "",
      accent: "#d3aa54",
      variant: "timeline" as const,
      details: timelineItems,
    },
    {
      id: "showroom-skills",
      kicker: "TOOLBOX 03",
      title: `${world.profile.skills.length} 项能力`,
      body: "",
      accent: TEAL,
      variant: "skills" as const,
      details: world.profile.skills,
    },
  ];
  return (
    <group>
      {panels.map((panel, index) => {
        const { id, ...frame } = panel;
        return (
          <InformationFrame
            key={id}
            {...frame}
            position={[(index - 1) * 5.8, 2.5, -20.82]}
            width={4.4}
            height={2.1}
            footer={index === 2 ? "TOOLS FOUND IN THE RESUME" : "RESUME-SOURCED INFORMATION"}
            interactive={interactive}
            selected={selectedId === id}
            onSelect={() => onSelect(id)}
          />
        );
      })}
      <InformationPlaque
        kicker="CONTACT 04"
        title="保持联系"
        items={world.profile.contacts.slice(0, 3)}
        position={[-5.3, 0.76, -20.82]}
        width={5}
        accent="#7088d4"
        interactive={interactive}
        selected={selectedId === "showroom-contact"}
        onSelect={() => onSelect("showroom-contact")}
      />
      <InformationPlaque
        kicker="HIGHLIGHTS 05"
        title="成就与影响"
        items={achievementItems}
        position={[3.6, 0.76, -20.82]}
        width={9}
        accent="#d3aa54"
        interactive={interactive}
        selected={selectedId === "showroom-highlights"}
        onSelect={() => onSelect("showroom-highlights")}
      />
      <pointLight position={[0, 3, -19.4]} intensity={14} distance={13} decay={2} color="#ffe3bd" />
    </group>
  );
}

function ShowroomDetails() {
  return (
    <group>
      <TextPanel
        title="OPEN ARCHIVE"
        subtitle="NOTES · BOOKS · AUDIO"
        position={[-8.55, 3.55, 4.85]}
        rotation={[0, Math.PI, 0]}
        width={3}
      />
      <mesh receiveShadow position={[0, -0.055, -8]}>
        <boxGeometry args={[13.8, 0.07, 11.2]} />
        <meshStandardMaterial color="#6e4337" roughness={0.94} />
      </mesh>
      <mesh receiveShadow position={[8.5, 0.12, 4.1]}>
        <cylinderGeometry args={[0.9, 1.02, 0.24, 20]} />
        <meshStandardMaterial color={DARK_WOOD} roughness={0.7} metalness={0.08} />
      </mesh>
      <mesh position={[8.5, 0.25, 4.1]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.7, 0.88, 32]} />
        <meshBasicMaterial color={BRASS} toneMapped={false} />
      </mesh>
      <pointLight position={[0, 3.35, -6]} intensity={12} distance={12} decay={2} color="#ffe2b2" />
      <pointLight position={[8.5, 2.6, 4.1]} intensity={5.2} distance={6.5} decay={2} color={TEAL} />
    </group>
  );
}

function GuestbookBoard({ messages, interactive, selected, onSelect }: { messages: string[]; interactive: boolean; selected: boolean; onSelect: () => void }) {
  const body = messages.length
    ? messages.slice(-3).map((message) => `“${message}”`).join("  ·  ")
    : "还没有留言。成为第一个在这栋房子里留下文字的人。";
  return (
    <InformationFrame
      kicker="VISITOR CORNER"
      title="访客留言板"
      body={body}
      position={[-10.58, 1.7, 2.5]}
      rotation={[0, Math.PI / 2, 0]}
      width={2.45}
      height={1.52}
      accent="#7088d4"
      footer="CLICK TO LEAVE A MESSAGE"
      interactive={interactive}
      selected={selected}
      onSelect={onSelect}
    />
  );
}

function BedroomDiary({ interactive, selected, onSelect }: { interactive: boolean; selected: boolean; onSelect: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <group
      position={[-20.2, 0, -16.25]}
      rotation={[0, Math.PI / 2, 0]}
      onClick={interactive ? (event) => { event.stopPropagation(); onSelect(); } : undefined}
      onPointerOver={interactive ? (event) => { event.stopPropagation(); setHovered(true); document.body.style.cursor = "pointer"; } : undefined}
      onPointerOut={interactive ? () => { setHovered(false); document.body.style.cursor = "default"; } : undefined}
    >
      <mesh castShadow receiveShadow position={[0, 0.78, 0]}>
        <boxGeometry args={[2.85, 0.16, 1.38]} />
        <meshStandardMaterial color={DARK_WOOD} roughness={0.68} metalness={0.08} />
      </mesh>
      {[[-1.12, -0.48], [-1.12, 0.48], [1.12, -0.48], [1.12, 0.48]].map(([x, z]) => (
        <mesh key={`${x}-${z}`} castShadow position={[x, 0.38, z]}>
          <boxGeometry args={[0.14, 0.78, 0.14]} />
          <meshStandardMaterial color={DARK_WOOD} roughness={0.72} />
        </mesh>
      ))}
      <group position={[0, 1, 0.08]} rotation={[0.24, -0.08, 0]}>
        <mesh castShadow position={[-0.39, 0.04, 0]} rotation={[0, 0, 0.08]}>
          <boxGeometry args={[0.76, 0.07, 0.92]} />
          <meshStandardMaterial color="#f4eadb" roughness={0.86} />
        </mesh>
        <mesh castShadow position={[0.39, 0.04, 0]} rotation={[0, 0, -0.08]}>
          <boxGeometry args={[0.76, 0.07, 0.92]} />
          <meshStandardMaterial color="#f4eadb" roughness={0.86} />
        </mesh>
        <mesh position={[0, 0.09, 0]}><boxGeometry args={[0.06, 0.06, 0.92]} /><meshStandardMaterial color={CORAL} /></mesh>
        {[-0.54, -0.32, 0.3, 0.52].map((x) => (
          <mesh key={x} position={[x, 0.085, 0]}><boxGeometry args={[0.025, 0.012, 0.7]} /><meshBasicMaterial color="#c7bba9" toneMapped={false} /></mesh>
        ))}
      </group>
      <mesh position={[0, 0.78, 0]}>
        <boxGeometry args={[3.05, 1.48, 1.58]} />
        <meshBasicMaterial color={selected ? CORAL : TEAL} transparent opacity={selected ? 0.14 : hovered ? 0.08 : 0.01} toneMapped={false} />
      </mesh>
      <TextPanel title="PRIVATE DIARY" subtitle="CLICK THE OPEN BOOK" position={[0, 1.62, -0.55]} width={1.82} />
      <pointLight position={[0.85, 1.7, 0.3]} intensity={selected ? 5 : 2.8} distance={3.5} color="#ffcc91" />
    </group>
  );
}

function VillaExterior({ open, interactive, onEnter }: { open: boolean; interactive: boolean; onEnter: () => void }) {
  const [hovered, setHovered] = useState(false);
  const [doorOpen, setDoorOpen] = useState(open);
  const [showExterior, setShowExterior] = useState(true);
  const door = useRef<THREE.Group>(null);
  useEffect(() => {
    const syncTimer = window.setTimeout(() => setDoorOpen(open), open ? 0 : 2100);
    return () => window.clearTimeout(syncTimer);
  }, [open]);
  useEffect(() => {
    const visibilityTimer = window.setTimeout(() => setShowExterior(!open), open ? 3000 : 0);
    return () => window.clearTimeout(visibilityTimer);
  }, [open]);
  useFrame(() => {
    if (door.current) door.current.rotation.y = THREE.MathUtils.lerp(door.current.rotation.y, doorOpen ? -1.52 : 0, 0.08);
  });

  function enterVilla() {
    if (!interactive || open) return;
    onEnter();
  }

  return (
    <group visible={showExterior}>
      <mesh receiveShadow position={[0, -0.62, 0]}><boxGeometry args={[26.4, 0.9, 15.3]} /><meshStandardMaterial color="#302720" roughness={0.96} /></mesh>
      <mesh receiveShadow position={[0, -1.08, 4.1]}><boxGeometry args={[30, 0.18, 15]} /><meshStandardMaterial color="#596b52" roughness={1} /></mesh>
      {[-7, 7].map((x) => <mesh key={`facade-${x}`} receiveShadow position={[x, 1.9, 7.2]}><boxGeometry args={[11.4, 4.8, 0.48]} /><meshStandardMaterial color="#d39a6e" roughness={0.92} /></mesh>)}
      <mesh receiveShadow position={[0, 3.65, 7.2]}><boxGeometry args={[2.6, 1.3, 0.48]} /><meshStandardMaterial color="#d39a6e" roughness={0.92} /></mesh>
      {[-7, 7].map((x) => <mesh key={`trim-${x}`} position={[x, 0.05, 7.5]}><boxGeometry args={[11.4, 0.75, 0.24]} /><meshStandardMaterial color="#6a4636" roughness={0.86} /></mesh>)}
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
        onPointerOver={(event) => { event.stopPropagation(); if (interactive) { setHovered(true); document.body.style.cursor = "pointer"; } }}
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

const roomDoorSpecs: Array<{ roomId: string; position: Vec3; side: "left" | "right"; color: string }> = [
  { roomId: "room-private", position: [-10.71, 0, -16.25], side: "left", color: "#4b466f" },
];

function RoomDoor({ spec, open, interactive, onEnter }: { spec: (typeof roomDoorSpecs)[number]; open: boolean; interactive: boolean; onEnter: (roomId: string) => void }) {
  const [hovered, setHovered] = useState(false);
  const [doorOpen, setDoorOpen] = useState(open);
  const door = useRef<THREE.Group>(null);
  const rotationY = spec.side === "left" ? Math.PI / 2 : -Math.PI / 2;
  useEffect(() => {
    const syncTimer = window.setTimeout(() => setDoorOpen(open), open ? 0 : 2100);
    return () => window.clearTimeout(syncTimer);
  }, [open]);
  useFrame(() => {
    if (door.current) door.current.rotation.y = THREE.MathUtils.lerp(door.current.rotation.y, doorOpen ? 1.48 : 0, 0.1);
  });

  function enterRoom() {
    if (!interactive || open) return;
    onEnter(spec.roomId);
  }

  return (
    <group
      position={spec.position}
      rotation={[0, rotationY, 0]}
      onClick={(event) => { event.stopPropagation(); enterRoom(); }}
      onPointerOver={(event) => { event.stopPropagation(); if (interactive) { setHovered(true); document.body.style.cursor = "pointer"; } }}
      onPointerOut={() => { setHovered(false); document.body.style.cursor = "default"; }}
    >
      {[-1, 1].map((x) => <mesh key={x} position={[x, 1.6, 0]}><boxGeometry args={[0.16, 3.2, 0.28]} /><meshStandardMaterial color={BRASS} /></mesh>)}
      <mesh position={[0, 3.17, 0]}><boxGeometry args={[2.15, 0.18, 0.3]} /><meshStandardMaterial color={DARK_WOOD} /></mesh>
      <group ref={door} position={[-0.9, 0, 0.04]}>
        <mesh position={[0.9, 1.5, 0]}><planeGeometry args={[1.8, 2.9]} /><meshStandardMaterial color={spec.color} emissive={hovered ? spec.color : INK} emissiveIntensity={hovered ? 0.38 : 0.05} roughness={0.82} side={THREE.DoubleSide} /></mesh>
        <mesh position={[1.62, 1.35, 0.07]}><sphereGeometry args={[0.1, 10, 8]} /><meshStandardMaterial color={BRASS} /></mesh>
      </group>
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

function ProjectImageCard({ exhibit, index, selected }: { exhibit: ExhibitPlan; index: number; selected: boolean }) {
  const artwork = useRef<THREE.Group>(null);
  useFrame((state, delta) => {
    if (!artwork.current) return;
    if (selected) {
      artwork.current.rotation.y = THREE.MathUtils.lerp(artwork.current.rotation.y, 0, 0.16);
    } else {
      artwork.current.rotation.y += delta * (0.24 + index * 0.025);
      artwork.current.rotation.y = THREE.MathUtils.euclideanModulo(artwork.current.rotation.y + Math.PI, Math.PI * 2) - Math.PI;
    }
    artwork.current.position.y = 1.02 + Math.sin(state.clock.elapsedTime * 1.05 + index) * 0.025;
  });
  const accent = projectAccent(exhibit.title);
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 680;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#f4eadb";
    context.fillRect(0, 0, canvas.width, canvas.height);
    drawProjectArtwork(context, exhibit.title, accent);
    context.fillStyle = accent;
    context.fillRect(0, 348, canvas.width, 16);
    context.fillStyle = "#6e5c51";
    context.font = "700 25px Arial";
    context.fillText(`PROJECT IMAGE ${String(index + 1).padStart(2, "0")}`, 48, 416, 920);
    context.fillStyle = INK;
    context.font = "700 54px Arial";
    const titleBottom = drawWrappedText(context, exhibit.title, 48, 486, 920, 60, 2);
    context.fillStyle = "#514640";
    context.font = "27px Arial";
    drawWrappedText(context, exhibit.body, 48, titleBottom + 42, 920, 36, 3);
    const result = new THREE.CanvasTexture(canvas);
    result.colorSpace = THREE.SRGBColorSpace;
    result.anisotropy = 4;
    return result;
  }, [accent, exhibit.body, exhibit.title, index]);

  useEffect(() => () => texture.dispose(), [texture]);

  return (
    <group ref={artwork} position={[0, 1.02, 0]}>
      <mesh castShadow>
        <boxGeometry args={[1.68, 1.12, 0.09]} />
        <meshStandardMaterial color={DARK_WOOD} roughness={0.54} metalness={0.12} />
      </mesh>
      <mesh position={[0, 0, 0.051]}>
        <planeGeometry args={[1.56, 1]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0, -0.051]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[1.56, 1]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
    </group>
  );
}

function ProjectPedestal({ exhibit, displayIndex, selected, interactive, onSelect }: { exhibit: ExhibitPlan; displayIndex: number; selected: boolean; interactive: boolean; onSelect: (id: string) => void }) {
  const [hovered, setHovered] = useState(false);
  const group = useRef<THREE.Group>(null);
  useFrame(() => {
    if (!group.current) return;
    const targetScale = selected ? 1.055 : hovered ? 1.035 : 1;
    const nextScale = THREE.MathUtils.lerp(group.current.scale.x, targetScale, 0.14);
    group.current.scale.setScalar(nextScale);
  });
  return (
    <group
      ref={group}
      position={exhibit.position}
      onClick={interactive ? (event) => { event.stopPropagation(); onSelect(exhibit.id); } : undefined}
      onPointerOver={interactive ? (event) => { event.stopPropagation(); setHovered(true); document.body.style.cursor = "pointer"; } : undefined}
      onPointerOut={interactive ? () => { setHovered(false); document.body.style.cursor = "default"; } : undefined}
    >
      <mesh castShadow receiveShadow position={[0, 0.13, 0]}>
        <boxGeometry args={[1.72, 0.26, 1.5]} />
        <meshStandardMaterial color={DARK_WOOD} emissive={selected ? projectAccent(exhibit.title) : INK} emissiveIntensity={selected ? 0.24 : hovered ? 0.1 : 0} roughness={0.62} metalness={0.08} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, 0.34, 0]}>
        <boxGeometry args={[1.46, 0.16, 1.24]} />
        <meshStandardMaterial color="#e6d5bd" roughness={0.76} />
      </mesh>
      <ProjectImageCard exhibit={exhibit} index={displayIndex - 1} selected={selected} />
      <TextPanel
        title={`PROJECT ${String(displayIndex).padStart(2, "0")}`}
        subtitle={exhibit.title}
        position={[0, 0.44, 0.77]}
        width={1.36}
        height={0.32}
      />
      <pointLight position={[0, 1.45, 0.35]} intensity={selected ? 3.2 : hovered ? 2 : 0.65} distance={2.5} color={selected ? CORAL : projectAccent(exhibit.title)} />
    </group>
  );
}

function ProjectWallArchive({ exhibits, world, selectedId, interactive, onSelect }: { exhibits: ExhibitPlan[]; world: WorldPlan; selectedId?: string; interactive: boolean; onSelect: (id: string) => void }) {
  return (
    <group>
      {exhibits.slice(0, 4).map((exhibit, index) => {
        const placement = projectWallPlacements[index];
        const sourceItem = world.profile.items.find((item) => item.id === exhibit.sourceItemId);
        const wallId = `${PROJECT_WALL_PREFIX}${exhibit.id}`;
        return (
          <InformationFrame
            key={wallId}
            kicker={`PROJECT ${String(index + 1).padStart(2, "0")}`}
            title={exhibit.title}
            body={exhibit.body}
            details={[sourceItem?.subtitle || "", exhibit.body.slice(0, 86)]}
            position={placement.position}
            rotation={placement.rotation}
            width={2.65}
            height={1.7}
            accent={projectAccent(exhibit.title)}
            footer="WALL ARCHIVE · CLICK TO INSPECT"
            variant="project"
            interactive={interactive}
            selected={selectedId === wallId}
            onSelect={() => onSelect(wallId)}
          />
        );
      })}
    </group>
  );
}

export function WorldCanvas({ world, activeRoom, selectedExhibit, guestbookMessages = [], onSelect, onRoomChange }: { world: WorldPlan; activeRoom: string; selectedExhibit?: string; guestbookMessages?: string[]; onSelect: (id: string) => void; onRoomChange: (roomId: string) => void }) {
  const projectExhibits = world.exhibits.filter((exhibit) => exhibit.eyebrow === "PROJECT");
  return (
    <Canvas dpr={[1, 1.35]} shadows camera={{ position: [0, 1.08, 22.5], fov: 45, near: 0.08, far: 120 }} gl={{ antialias: true, powerPreference: "high-performance" }} onPointerMissed={() => onSelect("")}>
      <color attach="background" args={["#91adbd"]} />
      <fog attach="fog" args={["#91adbd", 32, 74]} />
      <ambientLight intensity={0.62} color="#ead9c4" />
      <hemisphereLight intensity={0.78} color="#bfd6e8" groundColor="#432f2a" />
      <directionalLight castShadow position={[14, 22, 12]} intensity={2.7} color="#ffd8ad" shadow-mapSize={[2048, 2048]} shadow-camera-left={-26} shadow-camera-right={26} shadow-camera-top={24} shadow-camera-bottom={-24} />
      <pointLight position={[-7, 5, 5]} intensity={18} distance={13} decay={2} color={CORAL} />
      <pointLight position={[6, 4, -3]} intensity={14} distance={12} decay={2} color={TEAL} />
      <RendererLook />
      <PortfolioEnvironment />
      <CameraRig activeRoom={activeRoom} selectedExhibit={selectedExhibit} world={world} />
      <VillaExterior open={activeRoom !== "exterior"} interactive={activeRoom === "exterior"} onEnter={() => onRoomChange("room-lobby")} />
      {world.rooms.map((room) => <AuthoredRoomScene key={`architecture-${room.id}`} room={room} />)}
      <Suspense fallback={world.rooms.map((room) => <ModelLoadingStage key={`loading-${room.id}`} room={room} />)}>
        {world.rooms.map((room) => <OpenSourceRoomDressing key={`dressing-${room.id}`} room={room} />)}
      </Suspense>
      <LivingInformationWall
        world={world}
        interactive={activeRoom === "room-lobby"}
        selectedId={selectedExhibit}
        onSelect={onSelect}
      />
      <ShowroomDetails />
      <ProjectWallArchive
        exhibits={projectExhibits}
        world={world}
        interactive={activeRoom === "room-lobby"}
        selectedId={selectedExhibit}
        onSelect={onSelect}
      />
      <GuestbookBoard
        messages={guestbookMessages}
        interactive={activeRoom === "room-lobby"}
        selected={selectedExhibit === "showroom-guestbook"}
        onSelect={() => onSelect("showroom-guestbook")}
      />
      <BedroomDiary
        interactive={activeRoom === "room-private"}
        selected={selectedExhibit === "bedroom-diary"}
        onSelect={() => onSelect("bedroom-diary")}
      />
      {roomDoorSpecs.map((spec) => (
        <RoomDoor
          key={spec.roomId}
          spec={spec}
          open={activeRoom === spec.roomId}
          interactive={activeRoom === "room-lobby"}
          onEnter={onRoomChange}
        />
      ))}
      {projectExhibits.map((exhibit, index) => {
        return (
          <ProjectPedestal
            key={exhibit.id}
            exhibit={exhibit}
            displayIndex={index + 1}
            selected={selectedExhibit === exhibit.id || selectedExhibit === `${PROJECT_WALL_PREFIX}${exhibit.id}`}
            interactive={activeRoom === "room-lobby"}
            onSelect={onSelect}
          />
        );
      })}
      <mesh position={[0, -1.13, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[90, 90]} /><meshStandardMaterial color="#596b52" roughness={1} /></mesh>
    </Canvas>
  );
}
