"use client";

/* eslint-disable react-hooks/immutability -- Three.js render loops intentionally mutate scene objects. */

import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import {
  Component,
  memo,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import * as THREE from "three";
import {
  buildCreativeSubjectSceneDisclosure,
  findRenderableCreativeSubject,
  planCreativeSubjects,
  type CreativeSubject,
} from "@/lib/agents/creative-subjects";
import type { ContentFamily, DisplaySurfacePlan, ExhibitPlan, ProfileItem, Vec3, WorldPlan } from "@/lib/types";
import { AuthoredRoomScene } from "./AuthoredRoomScene";
import {
  OpenSourceExteriorDressing,
  OpenSourceRoomDressing,
  PortfolioEnvironment,
  RendererLook,
} from "./OpenSourceRoomDressing";
import {
  SceneTextureLoader,
} from "./SceneAssetLoaders";
import {
  retainSceneMediaTexture,
} from "./SceneMediaTextureRegistry";
import {
  getSceneLoadingSnapshot,
  subscribeSceneLoading,
  type SceneLoadingSnapshot,
} from "./SceneLoadingStore";
import {
  BrassMaterial,
  GlassMaterial,
  usePlasterTextures,
  useRoofTextures,
  useRugTextures,
  useWalnutTextures,
} from "./SceneMaterials";

const INK = "#19171b";
const DARK_WOOD = "#34231f";
const BRASS = "#d4a15c";
const TEAL = "#65d7c3";
const CORAL = "#ff8b61";
const PROJECT_WALL_PREFIX = "project-wall:";
const EMPTY_INFORMATION_DETAILS: string[] = [];
const PROJECTS_PER_PAGE = 4;
const CONTENT_FAMILY_LABELS: Record<ContentFamily, string> = {
  publication: "论文",
  talk: "演讲",
  exhibition: "展览",
  "open-source": "开源",
  "media-coverage": "报道",
};

function sceneMediaUrl(url: string) {
  return /^https?:\/\//i.test(url)
    ? `/api/media?url=${encodeURIComponent(url)}`
    : url;
}

const PROJECT_STAND_SPACING_X = 7.4;
const PROJECT_STAND_FRONT_Z = -3.35;
const PROJECT_STAND_REAR_Z = -7.85;
const PROJECT_STAND_BASE_SIZE = [1.88, 0.26, 1.56] as const;
const PROJECT_STAND_TOP_SIZE = [1.54, 0.16, 1.28] as const;
const PROJECT_CARD_SIZE = [1.68, 1.12, 0.09] as const;
const PROJECT_CARD_SURFACE_SIZE = [1.56, 1] as const;

const projectDisplayPositions: Vec3[] = [
  [-PROJECT_STAND_SPACING_X / 2, 0, PROJECT_STAND_FRONT_Z],
  [PROJECT_STAND_SPACING_X / 2, 0, PROJECT_STAND_FRONT_Z],
  [-PROJECT_STAND_SPACING_X / 2, 0, PROJECT_STAND_REAR_Z],
  [PROJECT_STAND_SPACING_X / 2, 0, PROJECT_STAND_REAR_Z],
];

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

const localFeatureFocusTargets: Record<string, { target: Vec3; camera: Vec3; fov: number }> = {
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
    const authoredFocus = selectedExhibit
      ? world.displaySurfaces.find((surface) => surface.id === selectedExhibit)?.focusTarget
        || localFeatureFocusTargets[selectedExhibit]
      : undefined;
    const projectIndex = exhibit?.eyebrow === "PROJECT"
      ? world.exhibits.filter((item) => item.eyebrow === "PROJECT").findIndex((item) => item.id === exhibit.id)
      : -1;
    const displayedProjectPosition = projectIndex >= 0
      ? projectDisplayPositions[projectIndex % PROJECTS_PER_PAGE]
      : undefined;
    const wallFocus = wallProjectId && projectIndex >= 0
      ? projectWallPlacements[projectIndex % PROJECTS_PER_PAGE]
      : undefined;
    if (authoredFocus) {
      lookAtTarget.set(...authoredFocus.target);
      destination.set(...authoredFocus.camera);
      desiredFov.current = authoredFocus.fov;
    } else if (wallFocus) {
      lookAtTarget.set(...wallFocus.position);
      destination.set(...wallFocus.camera);
      desiredFov.current = 50;
    } else if (exhibit) {
      const exhibitPosition = displayedProjectPosition || exhibit.position;
      lookAtTarget.set(exhibitPosition[0], Math.max(1, exhibitPosition[1]), exhibitPosition[2]);
      if (displayedProjectPosition) {
        destination.set(exhibitPosition[0], 1.66, exhibitPosition[2] + 3.8);
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
      if (lines + 1 >= maxLines) {
        let truncated = line.trimEnd();
        while (truncated && context.measureText(`${truncated}…`).width > maxWidth) {
          truncated = truncated.slice(0, -1).trimEnd();
        }
        context.fillText(`${truncated}…`, x, y);
        return y;
      }
      context.fillText(line, x, y);
      lines += 1;
      line = character.trimStart();
      y += lineHeight;
    } else {
      line = next;
    }
  }
  if (line && lines < maxLines) context.fillText(line, x, y);
  return y;
}

function capacityAwareItems(items: string[], capacity: number) {
  if (items.length <= capacity) return items;
  const visibleCount = Math.max(0, capacity - 1);
  return [
    ...items.slice(0, visibleCount),
    `+${items.length - visibleCount} 项 · 点击查看全部`,
  ];
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
  details = EMPTY_INFORMATION_DETAILS,
  interactive = false,
  selected = false,
  onSelect,
  portraitUrl,
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
  portraitUrl?: string;
}) {
  const [hovered, setHovered] = useState(false);
  const group = useRef<THREE.Group>(null);
  const detailsKey = details.join("\u001f");
  const texture = useMemo(() => {
    const stableDetails = detailsKey ? detailsKey.split("\u001f") : EMPTY_INFORMATION_DETAILS;
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
      const projectSummary = stableDetails.filter(Boolean).join(" · ") || body;
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
        capacityAwareItems(stableDetails, 5).forEach((detail, index) => {
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
        capacityAwareItems(stableDetails, 10).forEach((detail, index) => {
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
  }, [accent, body, detailsKey, footer, kicker, title, variant]);

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
      {variant === "profile" && portraitUrl ? (
        <TextureAssetBoundary fallback={null} resetKey={portraitUrl}>
          <Suspense fallback={null}>
            <LoadedProfilePortrait url={portraitUrl} position={[-width * 0.314, -height * 0.02, 0.074]} />
          </Suspense>
        </TextureAssetBoundary>
      ) : null}
      <mesh position={[0, -height / 2 + 0.035, 0.095]}>
        <boxGeometry args={[width, 0.07, 0.045]} />
        <meshBasicMaterial color={accent} toneMapped={false} />
      </mesh>
    </group>
  );
}

function LoadedProfilePortrait({ url, position, stylized = false }: { url: string; position: Vec3; stylized?: boolean }) {
  const mediaUrl = sceneMediaUrl(url);
  const sourceTexture = useLoader(SceneTextureLoader, mediaUrl);
  const displayTexture = useMemo(() => {
    const texture = sourceTexture.clone();
    const image = sourceTexture.image as { width?: number; height?: number } | undefined;
    const sourceAspect = image?.width && image?.height ? image.width / image.height : 1;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
    if (sourceAspect > 1) {
      texture.repeat.x = 1 / sourceAspect;
      texture.offset.x = (1 - texture.repeat.x) / 2;
    } else if (sourceAspect < 1) {
      texture.repeat.y = sourceAspect;
      texture.offset.y = (1 - texture.repeat.y) / 2;
    }
    texture.anisotropy = 4;
    texture.needsUpdate = true;
    return texture;
  }, [sourceTexture]);

  useEffect(() => retainSceneMediaTexture(mediaUrl, sourceTexture, (cacheKey) => {
    useLoader.clear(SceneTextureLoader, cacheKey);
  }), [mediaUrl, sourceTexture]);
  useEffect(() => () => displayTexture.dispose(), [displayTexture]);
  return (
    <group position={position}>
      <mesh castShadow>
        <boxGeometry args={[0.94, 0.94, 0.035]} />
        <meshStandardMaterial color={DARK_WOOD} roughness={0.58} metalness={0.08} />
      </mesh>
      <mesh position={[0, 0, 0.021]}>
        <planeGeometry args={[0.86, 0.86]} />
        <meshBasicMaterial
          map={displayTexture}
          toneMapped={false}
          onBeforeCompile={stylized ? (shader) => {
            shader.fragmentShader = shader.fragmentShader.replace(
              "#include <map_fragment>",
              "#include <map_fragment>\ndiffuseColor.rgb = floor(diffuseColor.rgb * 5.0 + 0.5) / 5.0;",
            );
          } : undefined}
          customProgramCacheKey={() => stylized ? "profile-posterize-v1" : "profile-photo-v1"}
        />
      </mesh>
    </group>
  );
}

function CreativePersonFigure({ subject }: { subject: CreativeSubject }) {
  const photoUrl = subject.source.kind === "profile-photo"
    ? subject.source.media?.url
    : undefined;
  const disclosure = buildCreativeSubjectSceneDisclosure(subject);
  return (
    <group>
      <mesh castShadow receiveShadow position={[0, 0.12, 0]}>
        <cylinderGeometry args={[0.62, 0.72, 0.24, 20]} />
        <meshStandardMaterial color={DARK_WOOD} roughness={0.62} metalness={0.14} />
      </mesh>
      <mesh castShadow position={[0, 1.08, 0]}>
        <capsuleGeometry args={[0.38, 0.88, 5, 10]} />
        <meshStandardMaterial color={TEAL} roughness={0.74} metalness={0.02} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} castShadow position={[side * 0.5, 1.08, 0]} rotation={[0, 0, side * -0.2]}>
          <capsuleGeometry args={[0.11, 0.62, 4, 8]} />
          <meshStandardMaterial color="#d4a07e" roughness={0.78} />
        </mesh>
      ))}
      {photoUrl ? (
        <TextureAssetBoundary fallback={null} resetKey={photoUrl}>
          <Suspense fallback={null}>
            <LoadedProfilePortrait url={photoUrl} position={[0, 2.05, 0]} stylized />
          </Suspense>
        </TextureAssetBoundary>
      ) : (
        <mesh castShadow position={[0, 1.96, 0]}>
          <icosahedronGeometry args={[0.43, 1]} />
          <meshStandardMaterial color="#d4a07e" roughness={0.78} />
        </mesh>
      )}
      <TextPanel
        title={disclosure.title}
        subtitle={disclosure.subtitle}
        position={[0, 0.54, 0.62]}
        rotation={[0, 0.35, 0]}
        width={2.28}
        height={0.54}
      />
    </group>
  );
}

function CreativePetFigure({ subject }: { subject: CreativeSubject }) {
  const disclosure = buildCreativeSubjectSceneDisclosure(subject);
  return (
    <group position={[1.2, 0, 0.25]} scale={0.62}>
      <mesh castShadow receiveShadow position={[0, 0.14, 0]}>
        <cylinderGeometry args={[0.48, 0.55, 0.22, 16]} />
        <meshStandardMaterial color={DARK_WOOD} roughness={0.66} />
      </mesh>
      <mesh castShadow position={[0, 0.66, 0]}>
        <sphereGeometry args={[0.43, 12, 9]} />
        <meshStandardMaterial color="#c98757" roughness={0.82} />
      </mesh>
      <mesh castShadow position={[0.28, 1.02, 0]}>
        <icosahedronGeometry args={[0.34, 1]} />
        <meshStandardMaterial color="#d89a68" roughness={0.82} />
      </mesh>
      {subject.label === "Cat" ? [-1, 1].map((side) => (
        <mesh key={side} castShadow position={[0.28 + side * 0.18, 1.32, 0]} rotation={[0, 0, side * -0.18]}>
          <coneGeometry args={[0.13, 0.28, 4]} />
          <meshStandardMaterial color="#d89a68" roughness={0.82} />
        </mesh>
      )) : null}
      <TextPanel
        title={disclosure.title}
        subtitle={disclosure.subtitle}
        position={[0.15, 0.28, 0.65]}
        rotation={[0, 0.24, 0]}
        width={2.18}
        height={0.52}
      />
    </group>
  );
}

function appendProfileLocation(headline: string, location?: string) {
  if (!location || headline.toLocaleLowerCase().includes(location.toLocaleLowerCase())) return headline;
  return `${headline} · ${location}`;
}

function surfaceItems(world: WorldPlan, surface: DisplaySurfacePlan) {
  return surface.sourceItemIds
    .map((sourceId) => world.profile.items.find((item) => item.id === sourceId))
    .filter((item): item is ProfileItem => Boolean(item));
}

function surfaceSkillItems(world: WorldPlan, surface: DisplaySurfacePlan) {
  return surface.sourceItemIds
    .filter((sourceId) => sourceId.startsWith("skill:"))
    .map((sourceId) => sourceId.slice("skill:".length));
}

function surfaceContactItems(world: WorldPlan, surface: DisplaySurfacePlan) {
  return surface.sourceItemIds
    .filter((sourceId) => sourceId.startsWith("contact:"))
    .map((sourceId) => {
      const index = Number(sourceId.slice("contact:".length)) - 1;
      return world.profile.contacts[index];
    })
    .filter((item): item is string => Boolean(item));
}

function displayLineForItem(item: ProfileItem) {
  const prefix = item.contentFamily ? `[${CONTENT_FAMILY_LABELS[item.contentFamily]}] ` : "";
  return `${prefix}${item.title}${item.subtitle ? ` · ${item.subtitle}` : ""}`;
}

function detailLinesForSurface(world: WorldPlan, surface: DisplaySurfacePlan) {
  if (surface.semanticRole === "profile") return [] as string[];
  if (surface.semanticRole === "skills") return surfaceSkillItems(world, surface);
  if (surface.semanticRole === "contact") return surfaceContactItems(world, surface);
  return surfaceItems(world, surface).map(displayLineForItem);
}

function bodyForSurface(world: WorldPlan, surface: DisplaySurfacePlan) {
  if (surface.semanticRole === "profile") {
    return `${appendProfileLocation(world.profile.headline, world.profile.location)}。${world.profile.summary}`;
  }
  const lines = detailLinesForSurface(world, surface);
  return lines.length ? lines.join(" · ") : "该展示区会随解析出的个人资料自动生成。";
}

function fallbackSurfaceLayout(surface: DisplaySurfacePlan, index: number) {
  const topRow = index < 3;
  return {
    position: [(index % 3 - 1) * 5.2, topRow ? 2.58 : 0.92, -20.82] as Vec3,
    rotation: [0, 0, 0] as Vec3,
    width: topRow ? 4.2 : 3.8,
    height: topRow ? 2.05 : 1.68,
    variant: surface.semanticRole === "profile" ? "profile" as const : surface.semanticRole === "skills" ? "skills" as const : "timeline" as const,
  };
}

function CreativeSubjectCorner({ subjects }: { subjects: CreativeSubject[] }) {
  const person = findRenderableCreativeSubject(subjects, "person");
  const pet = findRenderableCreativeSubject(subjects, "pet");
  if (!person) return null;
  return (
    <group position={[8.45, 0, -16.5]} rotation={[0, -0.35, 0]}>
      <CreativePersonFigure subject={person} />
      {pet ? <CreativePetFigure subject={pet} /> : null}
    </group>
  );
}

function LivingInformationWall({ world, interactive, selectedId, onSelect }: { world: WorldPlan; interactive: boolean; selectedId?: string; onSelect: (id: string) => void }) {
  const portraitUrl = world.profile.media.find((media) => media.category === "profile-photo")?.url;
  return (
    <group>
      {world.displaySurfaces.map((surface, index) => {
        const layout = surface.layout || fallbackSurfaceLayout(surface, index);
        const details = detailLinesForSurface(world, surface);
        return (
          <InformationFrame
            key={surface.id}
            kicker={surface.kicker || `SHOWROOM ${String(index + 1).padStart(2, "0")}`}
            title={surface.title || surface.id}
            body={bodyForSurface(world, surface)}
            accent={surface.accent || TEAL}
            variant={layout.variant}
            details={details}
            portraitUrl={surface.semanticRole === "profile" ? portraitUrl : undefined}
            position={layout.position}
            rotation={layout.rotation}
            width={layout.width}
            height={layout.height}
            footer={surface.presentationMode === "paged" ? `显示 ${surface.pageSize || details.length} / ${surface.sourceItemIds.length} · 点击查看全部` : "RESUME-SOURCED INFORMATION"}
            interactive={interactive}
            selected={selectedId === surface.id}
            onSelect={() => onSelect(surface.id)}
          />
        );
      })}
      {interactive ? <pointLight position={[0, 3, -19.4]} intensity={14} distance={13} decay={2} color="#ffe3bd" /> : null}
    </group>
  );
}

function ShowroomDetails({ lit }: { lit: boolean }) {
  const rug = useRugTextures(undefined, 13.8 / 11.2);
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
        <meshStandardMaterial map={rug.map} bumpMap={rug.bumpMap} bumpScale={0.055} color="#d8bba4" roughness={0.94} />
      </mesh>
      <mesh receiveShadow position={[8.5, 0.12, 4.1]}>
        <cylinderGeometry args={[0.9, 1.02, 0.24, 20]} />
        <meshStandardMaterial color={DARK_WOOD} roughness={0.7} metalness={0.08} />
      </mesh>
      <mesh position={[8.5, 0.25, 4.1]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.7, 0.88, 32]} />
        <meshBasicMaterial color={BRASS} toneMapped={false} />
      </mesh>
      {lit ? <pointLight position={[0, 3.35, -6]} intensity={8} distance={11} decay={2} color="#ffe2b2" /> : null}
      {lit ? <pointLight position={[8.5, 2.6, 4.1]} intensity={2.6} distance={5.2} decay={2} color="#9fc6b8" /> : null}
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
  const rug = useRugTextures(undefined, 4.6 / 3.2);
  return (
    <group
      position={[-20.2, 0, -16.25]}
      rotation={[0, Math.PI / 2, 0]}
      onClick={interactive ? (event) => { event.stopPropagation(); onSelect(); } : undefined}
      onPointerOver={interactive ? (event) => { event.stopPropagation(); setHovered(true); document.body.style.cursor = "pointer"; } : undefined}
      onPointerOut={interactive ? () => { setHovered(false); document.body.style.cursor = "default"; } : undefined}
    >
      <mesh receiveShadow position={[0, 0.015, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[4.6, 3.2]} />
        <meshStandardMaterial map={rug.map} bumpMap={rug.bumpMap} bumpScale={0.045} color="#c6a790" roughness={0.95} />
      </mesh>
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
      {interactive ? <pointLight position={[0.85, 1.7, 0.3]} intensity={selected ? 5 : 2.8} distance={3.5} color="#ffcc91" /> : null}
    </group>
  );
}

function VillaExterior({ name, open, interactive, onEnter }: { name: string; open: boolean; interactive: boolean; onEnter: () => void }) {
  const [hovered, setHovered] = useState(false);
  const [doorOpen, setDoorOpen] = useState(open);
  const [showExterior, setShowExterior] = useState(true);
  const door = useRef<THREE.Group>(null);
  const plaster = usePlasterTextures(5, 2.4);
  const walnut = useWalnutTextures(3, 4);
  const roof = useRoofTextures(4.4, 3.4);
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
      {[-7, 7].map((x) => <mesh key={`facade-${x}`} receiveShadow position={[x, 1.9, 7.2]}><boxGeometry args={[11.4, 4.8, 0.48]} /><meshStandardMaterial map={plaster.map} bumpMap={plaster.bumpMap} bumpScale={0.075} color="#d7aa87" roughness={0.9} /></mesh>)}
      <mesh receiveShadow position={[0, 3.65, 7.2]}><boxGeometry args={[2.6, 1.3, 0.48]} /><meshStandardMaterial map={plaster.map} bumpMap={plaster.bumpMap} bumpScale={0.075} color="#d7aa87" roughness={0.9} /></mesh>
      {[-7, 7].map((x) => <mesh key={`trim-${x}`} position={[x, 0.05, 7.5]}><boxGeometry args={[11.4, 0.75, 0.24]} /><meshStandardMaterial map={walnut.map} bumpMap={walnut.bumpMap} bumpScale={0.045} color="#795243" roughness={0.82} /></mesh>)}
      {[-12.25, 12.25].map((x) => <mesh key={x} position={[x, 2.15, 7.48]}><boxGeometry args={[0.5, 5.2, 0.5]} /><meshStandardMaterial color={DARK_WOOD} /></mesh>)}

      {[-7.7, 7.7].map((x) => (
        <group key={x} position={[x, 2.05, 7.51]}>
          <mesh position={[0, 0, -0.02]}>
            <planeGeometry args={[4.08, 2.12]} />
            <meshStandardMaterial color="#20383d" emissive="#31565d" emissiveIntensity={0.14} roughness={0.4} metalness={0.12} />
          </mesh>
          {[-1, 1].map((side) => (
            <mesh key={`window-side-${side}`} castShadow position={[side * 2.12, 0, 0.08]}>
              <boxGeometry args={[0.18, 2.45, 0.2]} />
              <meshStandardMaterial color={DARK_WOOD} roughness={0.58} />
            </mesh>
          ))}
          {[-1, 1].map((side) => (
            <mesh key={`window-edge-${side}`} castShadow position={[0, side * 1.14, 0.08]}>
              <boxGeometry args={[4.42, 0.18, 0.2]} />
              <meshStandardMaterial color={DARK_WOOD} roughness={0.58} />
            </mesh>
          ))}
          <mesh position={[0, 0, 0.12]}><planeGeometry args={[4.02, 2.06]} /><GlassMaterial /></mesh>
          <mesh position={[0, 0, 0.22]}><boxGeometry args={[0.1, 2.08, 0.08]} /><BrassMaterial /></mesh>
          <mesh position={[0, 0, 0.22]}><boxGeometry args={[4.02, 0.1, 0.08]} /><BrassMaterial /></mesh>
          <mesh position={[0, -1.42, 0.26]}><boxGeometry args={[4.8, 0.28, 0.56]} /><meshStandardMaterial color="#8c5e48" /></mesh>
        </group>
      ))}

      <group
        position={[0, 0, 7.58]}
        onClick={interactive && !open ? (event) => { event.stopPropagation(); enterVilla(); } : undefined}
        onPointerOver={interactive && !open ? (event) => { event.stopPropagation(); setHovered(true); document.body.style.cursor = "pointer"; } : undefined}
        onPointerOut={interactive && !open ? () => { setHovered(false); document.body.style.cursor = "default"; } : undefined}
      >
        <group ref={door} position={[-1.22, 0, 0]}>
          <mesh castShadow position={[1.22, 1.42, 0]} scale={hovered ? 1.025 : 1}><boxGeometry args={[2.45, 2.95, 0.28]} /><meshStandardMaterial map={walnut.map} bumpMap={walnut.bumpMap} bumpScale={0.035} color={hovered ? "#704a3c" : DARK_WOOD} roughness={0.72} emissive={hovered ? CORAL : INK} emissiveIntensity={hovered ? 0.18 : 0} /></mesh>
          <mesh position={[1.22, 1.55, 0.17]}><boxGeometry args={[1.72, 1.78, 0.06]} /><meshStandardMaterial color="#4c756f" roughness={0.7} /></mesh>
          <mesh position={[2.04, 1.38, 0.23]}><sphereGeometry args={[0.12, 12, 8]} /><BrassMaterial /></mesh>
        </group>
        <mesh position={[0, 3.35, -0.06]}><boxGeometry args={[4.8, 0.28, 1.25]} /><meshStandardMaterial color={DARK_WOOD} /></mesh>
        {[-2.05, 2.05].map((x) => <mesh key={x} position={[x, 1.75, -0.05]}><boxGeometry args={[0.18, 3.15, 0.18]} /><BrassMaterial /></mesh>)}
        <TextPanel title={name} subtitle="OPEN THE DOOR" position={[0, 4.02, 0.03]} width={3.5} />
        {hovered ? <mesh position={[0, 1.4, 0.35]}><planeGeometry args={[3, 3.45]} /><meshBasicMaterial color={CORAL} transparent opacity={0.12} toneMapped={false} /></mesh> : null}
      </group>

      <mesh position={[-6.2, 5.1, 0.15]} rotation={[0, 0, 0.32]}><boxGeometry args={[13.8, 0.38, 15.2]} /><meshStandardMaterial map={roof.map} bumpMap={roof.bumpMap} bumpScale={0.055} color="#995b49" roughness={0.8} /></mesh>
      <mesh position={[6.2, 5.1, 0.15]} rotation={[0, 0, -0.32]}><boxGeometry args={[13.8, 0.38, 15.2]} /><meshStandardMaterial map={roof.map} bumpMap={roof.bumpMap} bumpScale={0.055} color="#a5624e" roughness={0.8} /></mesh>
      <mesh position={[0, 7.25, 0.1]}><boxGeometry args={[0.38, 0.38, 15.4]} /><BrassMaterial /></mesh>
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
      onClick={interactive && !open ? (event) => { event.stopPropagation(); enterRoom(); } : undefined}
      onPointerOver={interactive && !open ? (event) => { event.stopPropagation(); setHovered(true); document.body.style.cursor = "pointer"; } : undefined}
      onPointerOut={interactive && !open ? () => { setHovered(false); document.body.style.cursor = "default"; } : undefined}
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

function ProjectTextureFaces({ texture }: { texture: THREE.Texture }) {
  return (
    <>
      <mesh position={[0, 0, 0.051]}>
        <planeGeometry args={PROJECT_CARD_SURFACE_SIZE} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0, -0.051]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={PROJECT_CARD_SURFACE_SIZE} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
    </>
  );
}

function LoadedProjectTextureFaces({ url }: { url: string }) {
  const mediaUrl = sceneMediaUrl(url);
  const sourceTexture = useLoader(SceneTextureLoader, mediaUrl);
  const displayTexture = useMemo(() => {
    const texture = sourceTexture.clone();
    const image = sourceTexture.image as { width?: number; height?: number } | undefined;
    const sourceAspect = image?.width && image?.height ? image.width / image.height : 1.56;
    const surfaceAspect = 1.56;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
    if (sourceAspect > surfaceAspect) {
      texture.repeat.x = surfaceAspect / sourceAspect;
      texture.offset.x = (1 - texture.repeat.x) / 2;
    } else if (sourceAspect < surfaceAspect) {
      texture.repeat.y = sourceAspect / surfaceAspect;
      texture.offset.y = (1 - texture.repeat.y) / 2;
    }
    texture.anisotropy = 4;
    texture.needsUpdate = true;
    return texture;
  }, [sourceTexture]);

  useEffect(() => retainSceneMediaTexture(mediaUrl, sourceTexture, (cacheKey) => {
    useLoader.clear(SceneTextureLoader, cacheKey);
  }), [mediaUrl, sourceTexture]);
  useEffect(() => () => displayTexture.dispose(), [displayTexture]);
  return <ProjectTextureFaces texture={displayTexture} />;
}

function ProjectImageCard({ exhibit, index, selected }: { exhibit: ExhibitPlan; index: number; selected: boolean }) {
  const artwork = useRef<THREE.Group>(null);
  const fallbackLabel = exhibit.imageUrl ? "SOURCED IMAGE LOADING" : "SYSTEM PLACEHOLDER";
  useFrame((state, delta) => {
    if (!artwork.current) return;
    const baseYaw = index % 2 === 0 ? 0.05 : -0.05;
    const idleYaw = baseYaw + Math.sin(state.clock.elapsedTime * 0.75 + index * 1.1) * 0.045;
    const targetYaw = selected ? 0 : idleYaw;
    artwork.current.rotation.y = THREE.MathUtils.damp(artwork.current.rotation.y, targetYaw, 7.5, delta);
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
    context.fillText(`${fallbackLabel} ${String(index + 1).padStart(2, "0")}`, 48, 416, 920);
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
  }, [accent, exhibit.body, exhibit.title, fallbackLabel, index]);

  useEffect(() => () => texture.dispose(), [texture]);
  const placeholderFaces = <ProjectTextureFaces texture={texture} />;

  return (
    <group ref={artwork} position={[0, 1.02, 0]}>
      {[-0.62, 0.62].map((x) => (
        <mesh key={`project-display-rear-support-${x}`} castShadow position={[x * 1.18, -0.43, -0.38]}>
          <boxGeometry args={[0.055, 0.82, 0.055]} />
          <meshStandardMaterial color={DARK_WOOD} roughness={0.64} metalness={0.08} />
        </mesh>
      ))}
      <mesh castShadow>
        <boxGeometry args={PROJECT_CARD_SIZE} />
        <meshStandardMaterial color={DARK_WOOD} roughness={0.54} metalness={0.12} />
      </mesh>
      {exhibit.imageUrl
        ? (
          <TextureAssetBoundary fallback={placeholderFaces} resetKey={exhibit.imageUrl}>
            <Suspense fallback={placeholderFaces}>
              <LoadedProjectTextureFaces url={exhibit.imageUrl} />
            </Suspense>
          </TextureAssetBoundary>
        )
        : placeholderFaces}
    </group>
  );
}

function ProjectPedestal({ exhibit, position, displayIndex, selected, interactive, onSelect }: { exhibit: ExhibitPlan; position: Vec3; displayIndex: number; selected: boolean; interactive: boolean; onSelect: (id: string) => void }) {
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
      position={position}
      onClick={interactive ? (event) => { event.stopPropagation(); onSelect(exhibit.id); } : undefined}
      onPointerOver={interactive ? (event) => { event.stopPropagation(); setHovered(true); document.body.style.cursor = "pointer"; } : undefined}
      onPointerOut={interactive ? () => { setHovered(false); document.body.style.cursor = "default"; } : undefined}
    >
      <mesh castShadow receiveShadow position={[0, 0.13, 0]}>
        <boxGeometry args={PROJECT_STAND_BASE_SIZE} />
        <meshStandardMaterial color={DARK_WOOD} emissive={selected ? projectAccent(exhibit.title) : INK} emissiveIntensity={selected ? 0.24 : hovered ? 0.1 : 0} roughness={0.62} metalness={0.08} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, 0.34, 0]}>
        <boxGeometry args={PROJECT_STAND_TOP_SIZE} />
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
      {interactive ? <pointLight position={[0, 1.45, 0.35]} intensity={selected ? 3.2 : hovered ? 2 : 0.65} distance={2.5} color={selected ? CORAL : projectAccent(exhibit.title)} /> : null}
    </group>
  );
}

function EmptySlotCard({ slot }: { slot: number }) {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 680;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#ece5d8";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#d9d0c2";
    context.fillRect(38, 38, 948, 604);
    context.strokeStyle = "#8a8178";
    context.lineWidth = 12;
    context.setLineDash([34, 24]);
    context.strokeRect(64, 64, 896, 552);
    context.setLineDash([]);
    context.fillStyle = "#8a8178";
    context.font = "700 32px Arial";
    context.fillText(`EMPTY SLOT ${String(slot + 1).padStart(2, "0")}`, 112, 160, 800);
    context.fillStyle = "#514b46";
    context.font = "700 82px Arial";
    context.fillText("COMING", 112, 322, 800);
    context.fillText("SOON", 112, 420, 800);
    context.fillStyle = "#7f766e";
    context.font = "30px Arial";
    drawWrappedText(context, "No sourced project is available for this page position.", 112, 505, 800, 40, 2);
    const result = new THREE.CanvasTexture(canvas);
    result.colorSpace = THREE.SRGBColorSpace;
    result.anisotropy = 4;
    return result;
  }, [slot]);

  useEffect(() => () => texture.dispose(), [texture]);

  return (
    <group position={[0, 1.02, 0]}>
      <mesh castShadow>
        <boxGeometry args={PROJECT_CARD_SIZE} />
        <meshStandardMaterial color="#8c8278" roughness={0.86} metalness={0.02} transparent opacity={0.62} />
      </mesh>
      <ProjectTextureFaces texture={texture} />
      <mesh position={[0, 0, 0.07]}>
        <planeGeometry args={[1.72, 1.16]} />
        <meshBasicMaterial color="#f5eee2" transparent opacity={0.16} toneMapped={false} wireframe />
      </mesh>
    </group>
  );
}

function EmptyProjectPedestal({ position, slot }: { position: Vec3; slot: number }) {
  return (
    <group position={position}>
      <mesh castShadow receiveShadow position={[0, 0.13, 0]}>
        <boxGeometry args={PROJECT_STAND_BASE_SIZE} />
        <meshStandardMaterial color="#443d38" roughness={0.84} metalness={0.02} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, 0.34, 0]}>
        <boxGeometry args={PROJECT_STAND_TOP_SIZE} />
        <meshStandardMaterial color="#b8afa4" roughness={0.92} />
      </mesh>
      <mesh position={[0, 0.445, 0]}>
        <boxGeometry args={[1.66, 0.025, 1.38]} />
        <meshBasicMaterial color="#ece5d8" transparent opacity={0.22} wireframe toneMapped={false} />
      </mesh>
      <EmptySlotCard slot={slot} />
      <TextPanel
        title="COMING SOON"
        subtitle={`EMPTY SLOT ${String(slot + 1).padStart(2, "0")} · NOT A SOURCED IMAGE`}
        position={[0, 0.44, 0.77]}
        width={1.48}
        height={0.36}
      />
    </group>
  );
}

function ProjectWallArchive({ exhibits, world, displayStart, selectedId, interactive, onSelect }: { exhibits: ExhibitPlan[]; world: WorldPlan; displayStart: number; selectedId?: string; interactive: boolean; onSelect: (id: string) => void }) {
  return (
    <group>
      {exhibits.map((exhibit, index) => {
        const placement = projectWallPlacements[index];
        const sourceItem = world.profile.items.find((item) => item.id === exhibit.sourceItemId);
        const wallId = `${PROJECT_WALL_PREFIX}${exhibit.id}`;
        return (
          <InformationFrame
            key={wallId}
            kicker={`PROJECT ${String(displayStart + index + 1).padStart(2, "0")}`}
            title={exhibit.title}
            body={exhibit.body}
            details={[sourceItem?.subtitle || "", exhibit.body]}
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

class OptionalAssetBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    // Loading-manager state carries the actionable URL; the base room stays usable.
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

class TextureAssetBoundary extends Component<
  { children: ReactNode; fallback: ReactNode; resetKey: string },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidUpdate(previousProps: { resetKey: string }) {
    if (previousProps.resetKey !== this.props.resetKey && this.state.failed) {
      this.setState({ failed: false });
    }
  }

  componentDidCatch() {
    // Keep the individual display readable if a sourced image cannot decode.
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function SceneReadyNotifier({ onReady }: { onReady: () => void }) {
  useEffect(() => {
    let secondFrame = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(onReady);
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame) window.cancelAnimationFrame(secondFrame);
    };
  }, [onReady]);
  return null;
}

function SceneLoadingReporter({ onLoadProgress, onLoadState }: {
  onLoadProgress: (progress: number) => void;
  onLoadState: (snapshot: SceneLoadingSnapshot) => void;
}) {
  const loadingSnapshot = useSyncExternalStore(
    subscribeSceneLoading,
    getSceneLoadingSnapshot,
    getSceneLoadingSnapshot,
  );
  useEffect(() => {
    onLoadProgress(loadingSnapshot.progress);
    onLoadState(loadingSnapshot);
  }, [loadingSnapshot, onLoadProgress, onLoadState]);
  return null;
}

type WorldCanvasProps = {
  world: WorldPlan;
  activeRoom: string;
  projectPage?: number;
  selectedExhibit?: string;
  guestbookMessages?: string[];
  onSelect: (id: string) => void;
  onRoomChange: (roomId: string) => void;
  onLoadProgress: (progress: number) => void;
  onLoadState: (snapshot: SceneLoadingSnapshot) => void;
  onReady: () => void;
};

function sameStringItems(left: string[] = EMPTY_INFORMATION_DETAILS, right: string[] = EMPTY_INFORMATION_DETAILS) {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

function areWorldCanvasPropsEqual(previous: WorldCanvasProps, next: WorldCanvasProps) {
  return (
    previous.world === next.world &&
    previous.activeRoom === next.activeRoom &&
    (previous.projectPage ?? 0) === (next.projectPage ?? 0) &&
    previous.selectedExhibit === next.selectedExhibit &&
    sameStringItems(previous.guestbookMessages, next.guestbookMessages) &&
    previous.onSelect === next.onSelect &&
    previous.onRoomChange === next.onRoomChange &&
    previous.onLoadProgress === next.onLoadProgress &&
    previous.onLoadState === next.onLoadState &&
    previous.onReady === next.onReady
  );
}

function WorldCanvasImpl({ world, activeRoom, projectPage = 0, selectedExhibit, guestbookMessages = [], onSelect, onRoomChange, onLoadProgress, onLoadState, onReady }: WorldCanvasProps) {
  const projectExhibits = world.exhibits.filter((exhibit) => exhibit.eyebrow === "PROJECT");
  const maxProjectPage = Math.max(0, Math.ceil(projectExhibits.length / PROJECTS_PER_PAGE) - 1);
  const visibleProjectPage = Math.min(projectPage, maxProjectPage);
  const projectStart = visibleProjectPage * PROJECTS_PER_PAGE;
  const visibleProjectExhibits = projectExhibits.slice(projectStart, projectStart + PROJECTS_PER_PAGE);
  const creativeSubjects = useMemo(() => planCreativeSubjects(world.profile), [world.profile]);

  useEffect(() => {
    document.body.style.cursor = "default";
    return () => {
      document.body.style.cursor = "default";
    };
  }, [activeRoom, selectedExhibit, visibleProjectPage]);

  return (
    <>
      <SceneLoadingReporter onLoadProgress={onLoadProgress} onLoadState={onLoadState} />
      <Canvas dpr={[1, 1.35]} shadows={{ type: THREE.PCFShadowMap }} camera={{ position: [0, 1.08, 22.5], fov: 45, near: 0.08, far: 120 }} gl={{ antialias: true, powerPreference: "high-performance" }} onPointerMissed={() => onSelect("")}>
        <color attach="background" args={["#91adbd"]} />
        <fog attach="fog" args={["#91adbd", 32, 74]} />
        <ambientLight intensity={0.5} color="#ead9c4" />
        <hemisphereLight intensity={0.65} color="#bfd6e8" groundColor="#432f2a" />
        <directionalLight castShadow position={[14, 22, 12]} intensity={2.35} color="#ffd8ad" shadow-mapSize={[2048, 2048]} shadow-camera-left={-26} shadow-camera-right={26} shadow-camera-top={24} shadow-camera-bottom={-24} />
        {activeRoom !== "room-private" ? <pointLight position={[-7, 5, 5]} intensity={12} distance={12} decay={2} color={CORAL} /> : null}
        {activeRoom !== "room-private" ? <pointLight position={[6, 4, -3]} intensity={3.8} distance={9} decay={2} color="#9fc6b8" /> : null}
        <RendererLook />
        <CameraRig activeRoom={activeRoom} selectedExhibit={selectedExhibit} world={world} />
        <Suspense fallback={null}>
          <VillaExterior name={world.profile.name} open={activeRoom !== "exterior"} interactive={activeRoom === "exterior"} onEnter={() => onRoomChange("room-lobby")} />
          {world.rooms.map((room) => <AuthoredRoomScene key={`architecture-${room.id}`} room={room} active={activeRoom === room.id} onBackgroundClick={() => onSelect("")} />)}
          <OptionalAssetBoundary key={world.id}>
            <Suspense fallback={null}>
              <PortfolioEnvironment />
              <OpenSourceExteriorDressing />
              {world.rooms.map((room) => <OpenSourceRoomDressing key={`dressing-${room.id}`} room={room} />)}
            </Suspense>
          </OptionalAssetBoundary>
          <LivingInformationWall
            world={world}
            interactive={activeRoom === "room-lobby"}
            selectedId={selectedExhibit}
            onSelect={onSelect}
          />
          <ShowroomDetails lit={activeRoom === "room-lobby"} />
          <CreativeSubjectCorner subjects={creativeSubjects} />
          <ProjectWallArchive
            exhibits={visibleProjectExhibits}
            world={world}
            displayStart={projectStart}
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
          {projectDisplayPositions.map((position, slot) => {
            const exhibit = visibleProjectExhibits[slot];
            return exhibit ? (
              <ProjectPedestal
                key={exhibit.id}
                exhibit={exhibit}
                position={position}
                displayIndex={projectStart + slot + 1}
                selected={selectedExhibit === exhibit.id || selectedExhibit === `${PROJECT_WALL_PREFIX}${exhibit.id}`}
                interactive={activeRoom === "room-lobby"}
                onSelect={onSelect}
              />
            ) : (
              <EmptyProjectPedestal key={`empty-project-${slot}`} position={position} slot={slot} />
            );
          })}
          <mesh position={[0, -1.13, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[90, 90]} /><meshStandardMaterial color="#596b52" roughness={1} /></mesh>
          <SceneReadyNotifier onReady={onReady} />
        </Suspense>
      </Canvas>
    </>
  );
}

export const WorldCanvas = memo(WorldCanvasImpl, areWorldCanvasPropsEqual);
