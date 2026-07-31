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
import {
  PortfolioEnvironment,
  RendererLook,
} from "./OpenSourceRoomDressing";
import {
  MARDOU_CREATIVE_CORNER_POSITION,
  MARDOU_DIARY_FOCUS,
  MARDOU_DIARY_POSITION,
  MARDOU_ENTRANCE_ROUTE,
  MARDOU_EXTERIOR_FOCUS,
  MARDOU_GUESTBOOK_PLACEMENT,
  MARDOU_LOBBY_FOCUS,
  MARDOU_LOBBY_INTRO_ROUTE,
  MARDOU_PRIVATE_FOCUS,
  MARDOU_PRIVATE_ROUTE,
  MARDOU_PROJECT_PLACEMENTS,
  MARDOU_SOURCE_ARCHIVE_PLACEMENT,
  MARDOU_SURFACE_PLACEMENTS,
} from "./MardouMuseumLayout";
import { MardouMuseumScene } from "./MardouMuseumScene";
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
const TEAL = "#65d7c3";
const CORAL = "#ff8b61";
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

const PROJECT_CARD_SIZE = [1.68, 1.12, 0.09] as const;
const PROJECT_CARD_SURFACE_SIZE = [1.56, 1] as const;
const PROJECT_ISLAND_RADIUS = 0.92;
const FIRST_PERSON_SPEED = 2.7;
const FIRST_PERSON_COLLISION_RADIUS = 0.42;
const FIRST_PERSON_BOUNDS = {
  "room-lobby": { minX: -9.2, maxX: 7, minZ: -25.5, maxZ: 4 },
  "room-private": { minX: -5.5, maxX: 5.5, minZ: -25.5, maxZ: -14.5 },
} as const;

const localFeatureFocusTargets: Record<string, { target: Vec3; camera: Vec3; fov: number }> = {
  "showroom-guestbook": MARDOU_GUESTBOOK_PLACEMENT.focus,
  "showroom-source-browser": MARDOU_SOURCE_ARCHIVE_PLACEMENT.focus,
  "bedroom-diary": MARDOU_DIARY_FOCUS,
};

type CameraRoute = {
  position: THREE.Curve<THREE.Vector3>;
  target: THREE.Curve<THREE.Vector3>;
  duration: number;
  elapsed: number;
  fromFov: number;
  toFov: number;
};

function CameraRig({ activeRoom, selectedExhibit, sceneReady, world }: { activeRoom: string; selectedExhibit?: string; sceneReady: boolean; world: WorldPlan }) {
  const { camera, pointer, scene } = useThree();
  const lookAt = useMemo(() => new THREE.Vector3(...MARDOU_LOBBY_INTRO_ROUTE.turn), []);
  const lookAtTarget = useMemo(() => new THREE.Vector3(...MARDOU_LOBBY_INTRO_ROUTE.turn), []);
  const mouseLookTarget = useMemo(() => new THREE.Vector3(...MARDOU_LOBBY_INTRO_ROUTE.turn), []);
  const destination = useMemo(() => new THREE.Vector3(...MARDOU_LOBBY_INTRO_ROUTE.spawn), []);
  const frameDestination = useMemo(() => new THREE.Vector3(), []);
  const viewDirection = useMemo(() => new THREE.Vector3(), []);
  const viewRight = useMemo(() => new THREE.Vector3(), []);
  const viewUp = useMemo(() => new THREE.Vector3(), []);
  const movement = useMemo(() => new THREE.Vector3(), []);
  const movementForward = useMemo(() => new THREE.Vector3(), []);
  const movementRight = useMemo(() => new THREE.Vector3(), []);
  const movementProbe = useMemo(() => new THREE.Vector3(), []);
  const movementRaycaster = useMemo(() => new THREE.Raycaster(), []);
  const desiredFov = useRef(activeRoom === "room-lobby" ? MARDOU_LOBBY_FOCUS.fov : MARDOU_EXTERIOR_FOCUS.fov);
  const previousRoom = useRef(activeRoom);
  const previousExhibit = useRef(selectedExhibit);
  const lobbyIntroPending = useRef(activeRoom === "room-lobby");
  const pressedMovementKeys = useRef(new Set<string>());
  const route = useRef<CameraRoute | null>(null);

  useEffect(() => {
    function isTypingTarget(target: EventTarget | null) {
      return target instanceof HTMLElement
        && (target.isContentEditable || target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT");
    }

    function handleKeyDown(event: KeyboardEvent) {
      const key = event.key.toLowerCase();
      if (!FIRST_PERSON_BOUNDS[activeRoom as keyof typeof FIRST_PERSON_BOUNDS] || !["w", "a", "s", "d"].includes(key) || isTypingTarget(event.target)) return;
      event.preventDefault();
      pressedMovementKeys.current.add(key);
    }

    function handleKeyUp(event: KeyboardEvent) {
      pressedMovementKeys.current.delete(event.key.toLowerCase());
    }

    function clearKeys() {
      pressedMovementKeys.current.clear();
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", clearKeys);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", clearKeys);
      clearKeys();
    };
  }, [activeRoom]);

  useEffect(() => {
    if (lobbyIntroPending.current && activeRoom === "room-lobby" && !selectedExhibit && !sceneReady) return;

    const room = world.rooms.find((item) => item.id === activeRoom);
    const exhibit = world.exhibits.find((item) => item.id === selectedExhibit);
    const exhibitRoom = exhibit ? world.rooms.find((item) => item.id === exhibit.roomId) : undefined;
    const surfaceIndex = selectedExhibit
      ? world.displaySurfaces.findIndex((surface) => surface.id === selectedExhibit)
      : -1;
    const authoredFocus = selectedExhibit
      ? (surfaceIndex >= 0 ? MARDOU_SURFACE_PLACEMENTS[surfaceIndex]?.focus : undefined)
        || localFeatureFocusTargets[selectedExhibit]
      : undefined;
    const projectIndex = exhibit?.eyebrow === "PROJECT"
      ? world.exhibits.filter((item) => item.eyebrow === "PROJECT").findIndex((item) => item.id === exhibit.id)
      : -1;
    const displayedProjectPlacement = projectIndex >= 0
      ? MARDOU_PROJECT_PLACEMENTS[projectIndex % PROJECTS_PER_PAGE]
      : undefined;
    if (authoredFocus) {
      lookAtTarget.set(...authoredFocus.target);
      destination.set(...authoredFocus.camera);
      desiredFov.current = authoredFocus.fov;
    } else if (exhibit) {
      if (displayedProjectPlacement) {
        lookAtTarget.set(...displayedProjectPlacement.focus.target);
        destination.set(...displayedProjectPlacement.focus.camera);
        desiredFov.current = displayedProjectPlacement.focus.fov;
      } else {
        lookAtTarget.set(exhibit.position[0], Math.max(1, exhibit.position[1]), exhibit.position[2]);
        const centralSide = exhibitRoom && exhibitRoom.center[0] < 0 ? 1 : -1;
        destination.set(exhibit.position[0] + centralSide * 3.9, 1.66, exhibit.position[2]);
        desiredFov.current = 48;
      }
    } else if (room?.kind === "lobby") {
      lookAtTarget.set(...MARDOU_LOBBY_FOCUS.target);
      destination.set(...MARDOU_LOBBY_FOCUS.camera);
      desiredFov.current = MARDOU_LOBBY_FOCUS.fov;
    } else if (room?.kind === "bedroom") {
      lookAtTarget.set(...MARDOU_PRIVATE_FOCUS.target);
      destination.set(...MARDOU_PRIVATE_FOCUS.camera);
      desiredFov.current = MARDOU_PRIVATE_FOCUS.fov;
    } else if (room) {
      lookAtTarget.set(room.center[0] - room.size[0] * 0.12, 1.52, room.center[2]);
      destination.set(room.center[0] + room.size[0] * 0.32, 1.66, room.center[2]);
      desiredFov.current = 64;
    } else {
      lookAtTarget.set(...MARDOU_EXTERIOR_FOCUS.target);
      destination.set(...MARDOU_EXTERIOR_FOCUS.camera);
      desiredFov.current = MARDOU_EXTERIOR_FOCUS.fov;
    }

    const roomChanged = previousRoom.current !== activeRoom;
    const exhibitChanged = previousExhibit.current !== selectedExhibit;
    const shouldPlayLobbyIntro = lobbyIntroPending.current && activeRoom === "room-lobby" && !selectedExhibit;
    if (!roomChanged && !exhibitChanged && !shouldPlayLobbyIntro) return;

    const startPosition = camera.position.clone();
    const startTarget = lookAt.clone();
    const fromFov = camera instanceof THREE.PerspectiveCamera ? camera.fov : desiredFov.current;
    let positionPoints = [startPosition, destination.clone()];
    let targetPoints = [startTarget, lookAtTarget.clone()];
    let positionCurve: THREE.Curve<THREE.Vector3> | undefined;
    let duration = exhibit || authoredFocus ? 1.7 : 2.2;

    if (shouldPlayLobbyIntro) {
      positionPoints = [
        new THREE.Vector3(...MARDOU_LOBBY_INTRO_ROUTE.spawn),
        new THREE.Vector3(...MARDOU_LOBBY_INTRO_ROUTE.turn),
        new THREE.Vector3(...MARDOU_LOBBY_INTRO_ROUTE.waypoint),
        new THREE.Vector3(...MARDOU_LOBBY_INTRO_ROUTE.galleryTurn),
        destination.clone(),
      ];
      targetPoints = [
        new THREE.Vector3(...MARDOU_LOBBY_INTRO_ROUTE.turn),
        new THREE.Vector3(...MARDOU_LOBBY_INTRO_ROUTE.waypoint),
        new THREE.Vector3(...MARDOU_LOBBY_INTRO_ROUTE.galleryTurn),
        new THREE.Vector3(...MARDOU_LOBBY_INTRO_ROUTE.galleryLook),
        lookAtTarget.clone(),
      ];
      positionCurve = new THREE.CatmullRomCurve3(positionPoints, false, "centripetal");
      duration = MARDOU_LOBBY_INTRO_ROUTE.duration;
      lobbyIntroPending.current = false;
    } else if (previousRoom.current === "exterior" && activeRoom === "room-lobby") {
      positionPoints = [
        startPosition,
        new THREE.Vector3(...MARDOU_ENTRANCE_ROUTE.outside),
        new THREE.Vector3(...MARDOU_ENTRANCE_ROUTE.threshold),
        new THREE.Vector3(...MARDOU_ENTRANCE_ROUTE.gallery),
        destination.clone(),
      ];
      targetPoints = [
        startTarget,
        new THREE.Vector3(2, 2, 8),
        new THREE.Vector3(2, 1.6, -2),
        new THREE.Vector3(0, 1.5, -10),
        lookAtTarget.clone(),
      ];
      duration = 3;
    } else if (previousRoom.current === "room-lobby" && activeRoom === "room-private") {
      positionPoints = [
        startPosition,
        new THREE.Vector3(...MARDOU_PRIVATE_ROUTE.lobbyApproach),
        new THREE.Vector3(...MARDOU_PRIVATE_ROUTE.ground),
        new THREE.Vector3(...MARDOU_PRIVATE_ROUTE.stairs),
        new THREE.Vector3(...MARDOU_PRIVATE_ROUTE.landing),
        destination.clone(),
      ];
      targetPoints = [
        startTarget,
        new THREE.Vector3(2.5, 1.85, -13),
        new THREE.Vector3(2.5, 3.4, -15),
        new THREE.Vector3(0, 4.2, -18),
        lookAtTarget.clone(),
      ];
      duration = 3;
    } else if (previousRoom.current === "room-private" && activeRoom === "room-lobby") {
      positionPoints = [
        startPosition,
        new THREE.Vector3(...MARDOU_PRIVATE_ROUTE.landing),
        new THREE.Vector3(...MARDOU_PRIVATE_ROUTE.stairs),
        new THREE.Vector3(...MARDOU_PRIVATE_ROUTE.ground),
        new THREE.Vector3(...MARDOU_PRIVATE_ROUTE.lobbyApproach),
        destination.clone(),
      ];
      targetPoints = [
        startTarget,
        new THREE.Vector3(2.5, 3.4, -15),
        new THREE.Vector3(2.5, 1.85, -13),
        new THREE.Vector3(0, 1.5, -10),
        lookAtTarget.clone(),
      ];
      duration = 3;
    } else if (previousRoom.current === "room-lobby" && activeRoom === "exterior") {
      positionPoints = [
        startPosition,
        new THREE.Vector3(...MARDOU_ENTRANCE_ROUTE.gallery),
        new THREE.Vector3(...MARDOU_ENTRANCE_ROUTE.threshold),
        new THREE.Vector3(...MARDOU_ENTRANCE_ROUTE.outside),
        destination.clone(),
      ];
      targetPoints = [
        startTarget,
        new THREE.Vector3(0, 1.5, -10),
        new THREE.Vector3(2, 1.6, -2),
        new THREE.Vector3(2, 2, 8),
        lookAtTarget.clone(),
      ];
      duration = 3;
    }

    route.current = {
      position: positionCurve || new THREE.CatmullRomCurve3(positionPoints, false, "centripetal"),
      target: new THREE.CatmullRomCurve3(targetPoints, false, "centripetal"),
      duration,
      elapsed: 0,
      fromFov,
      toFov: desiredFov.current,
    };
    previousRoom.current = activeRoom;
    previousExhibit.current = selectedExhibit;
  }, [activeRoom, camera, destination, lookAt, lookAtTarget, sceneReady, selectedExhibit, world]);

  useFrame((_, delta) => {
    if (lobbyIntroPending.current) {
      camera.position.set(...MARDOU_LOBBY_INTRO_ROUTE.spawn);
      lookAt.set(...MARDOU_LOBBY_INTRO_ROUTE.turn);
      camera.lookAt(lookAt);
      return;
    }

    if (route.current) {
      route.current.elapsed = Math.min(route.current.duration, route.current.elapsed + Math.min(delta, 1 / 24));
      const progress = route.current.elapsed / route.current.duration;
      const eased = progress * progress * (3 - 2 * progress);
      route.current.position.getPointAt(eased, camera.position);
      route.current.target.getPointAt(eased, lookAt);
      camera.lookAt(lookAt);
      if (camera instanceof THREE.PerspectiveCamera) {
        camera.fov = THREE.MathUtils.lerp(route.current.fromFov, route.current.toFov, eased);
        camera.updateProjectionMatrix();
      }
      if (progress >= 1) route.current = null;
      return;
    }

    const walkBounds = FIRST_PERSON_BOUNDS[activeRoom as keyof typeof FIRST_PERSON_BOUNDS];
    if (walkBounds && !selectedExhibit && pressedMovementKeys.current.size) {
      const forwardInput = Number(pressedMovementKeys.current.has("w")) - Number(pressedMovementKeys.current.has("s"));
      const rightInput = Number(pressedMovementKeys.current.has("d")) - Number(pressedMovementKeys.current.has("a"));
      movementForward.copy(lookAt).sub(camera.position).setY(0);
      if (movementForward.lengthSq() < 0.0001) movementForward.set(0, 0, -1);
      else movementForward.normalize();
      movementRight.crossVectors(movementForward, camera.up).normalize();
      movement
        .copy(movementForward)
        .multiplyScalar(forwardInput)
        .addScaledVector(movementRight, rightInput);

      if (movement.lengthSq() > 0) {
        movement.normalize().multiplyScalar(FIRST_PERSON_SPEED * Math.min(delta, 0.05));
        const nextX = destination.x + movement.x;
        const nextZ = destination.z + movement.z;
        const insideFloorBounds = nextX >= walkBounds.minX
          && nextX <= walkBounds.maxX
          && nextZ >= walkBounds.minZ
          && nextZ <= walkBounds.maxZ;
        movementProbe.copy(movement).normalize();
        movementRaycaster.set(camera.position, movementProbe);
        movementRaycaster.near = 0;
        movementRaycaster.far = movement.length() + FIRST_PERSON_COLLISION_RADIUS;
        const blocked = movementRaycaster.intersectObjects(scene.children, true).some((hit) => {
          if (!(hit.object instanceof THREE.Mesh) || hit.object.userData.ignoreCameraCollision) return false;
          const materials = Array.isArray(hit.object.material) ? hit.object.material : [hit.object.material];
          return materials.some((material) => material.visible && (!material.transparent || material.opacity >= 0.05));
        });

        if (insideFloorBounds && !blocked) {
          destination.add(movement);
          lookAtTarget.add(movement);
          mouseLookTarget.add(movement);
          lookAt.add(movement);
        }
      }
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

function StairwayClickTarget({ interactive, onGoUpstairs }: { interactive: boolean; onGoUpstairs: () => void }) {
  const [hovered, setHovered] = useState(false);
  if (!interactive) return null;
  return (
    <group position={[2.5, 2.5, -12]}>
      <mesh
        userData={{ ignoreCameraCollision: true }}
        onClick={(event) => {
          event.stopPropagation();
          onGoUpstairs();
        }}
        onPointerOver={(event) => {
          event.stopPropagation();
          setHovered(true);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          setHovered(false);
          document.body.style.cursor = "default";
        }}
      >
        <boxGeometry args={[3, 4, 6]} />
        <meshBasicMaterial color="#65d7c3" transparent opacity={hovered ? 0.035 : 0.001} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
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

function MuseumObjectLabel({ texture, accent, position, width = 1.2, height = 0.58 }: {
  texture: THREE.Texture;
  accent: string;
  position: Vec3;
  width?: number;
  height?: number;
}) {
  return (
    <group position={position}>
      <mesh castShadow>
        <boxGeometry args={[width + 0.08, height + 0.08, 0.07]} />
        <meshStandardMaterial color={DARK_WOOD} roughness={0.58} metalness={0.1} />
      </mesh>
      <mesh position={[0, 0, 0.041]}>
        <planeGeometry args={[width, height]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
      <mesh position={[0, -height / 2 + 0.025, 0.078]}>
        <boxGeometry args={[width, 0.05, 0.035]} />
        <meshBasicMaterial color={accent} toneMapped={false} />
      </mesh>
    </group>
  );
}

function InformationObjectGeometry({
  semanticRole,
  texture,
  accent,
  portraitUrl,
}: {
  semanticRole?: DisplaySurfacePlan["semanticRole"];
  texture: THREE.Texture;
  accent: string;
  portraitUrl?: string;
}) {
  const role = semanticRole || "experience";
  const roundBase = (
    <mesh castShadow receiveShadow position={[0, -1.31, 0]} scale={[1, 1, 0.62]}>
      <cylinderGeometry args={[0.58, 0.66, 0.18, 18]} />
      <meshStandardMaterial color={DARK_WOOD} roughness={0.68} metalness={0.12} />
    </mesh>
  );

  if (role === "profile") {
    return (
      <group>
        {roundBase}
        <mesh castShadow position={[0, -0.88, 0]}>
          <cylinderGeometry args={[0.18, 0.24, 0.76, 14]} />
          <meshStandardMaterial color="#d3aa54" roughness={0.52} metalness={0.42} />
        </mesh>
        {portraitUrl ? (
          <TextureAssetBoundary fallback={null} resetKey={portraitUrl}>
            <Suspense fallback={null}>
              <LoadedProfilePortrait url={portraitUrl} position={[0, -0.14, 0.05]} stylized />
            </Suspense>
          </TextureAssetBoundary>
        ) : (
          <group>
            <mesh castShadow position={[0, -0.18, 0]}>
              <capsuleGeometry args={[0.3, 0.38, 5, 10]} />
              <meshStandardMaterial color={accent} roughness={0.7} />
            </mesh>
            <mesh castShadow position={[0, 0.38, 0]}>
              <icosahedronGeometry args={[0.32, 1]} />
              <meshStandardMaterial color="#d4a07e" roughness={0.78} />
            </mesh>
          </group>
        )}
        <MuseumObjectLabel texture={texture} accent={accent} position={[0, -0.82, 0.38]} width={1.08} height={0.34} />
      </group>
    );
  }

  if (role === "education") {
    return (
      <group>
        {roundBase}
        {[0, 1, 2, 3].map((index) => (
          <mesh key={index} castShadow position={[index % 2 ? 0.05 : -0.04, -1.12 + index * 0.16, 0]} rotation={[0, index % 2 ? 0.08 : -0.08, 0]}>
            <boxGeometry args={[1.05 - index * 0.06, 0.13, 0.56]} />
            <meshStandardMaterial color={index % 2 ? accent : "#e6d5bd"} roughness={0.78} />
          </mesh>
        ))}
        <mesh castShadow position={[0, -0.22, 0]}>
          <cylinderGeometry args={[0.1, 0.13, 1.25, 10]} />
          <meshStandardMaterial color="#b98a4c" roughness={0.44} metalness={0.5} />
        </mesh>
        <MuseumObjectLabel texture={texture} accent={accent} position={[0, 0.34, 0.12]} width={1.18} height={0.58} />
      </group>
    );
  }

  if (role === "skills") {
    return (
      <group>
        {roundBase}
        <mesh castShadow receiveShadow position={[0, -0.48, 0]}>
          <boxGeometry args={[1.18, 1.55, 0.56]} />
          <meshStandardMaterial color="#736255" roughness={0.76} />
        </mesh>
        {[-0.92, -0.56, -0.2, 0.16].map((y, index) => (
          <group key={y}>
            <mesh castShadow position={[0, y, 0.3]}>
              <boxGeometry args={[1.03, 0.27, 0.08]} />
              <meshStandardMaterial color={index % 2 ? "#c9b89f" : "#ddcfbb"} roughness={0.72} />
            </mesh>
            <mesh position={[0, y, 0.355]}>
              <sphereGeometry args={[0.045, 10, 8]} />
              <meshStandardMaterial color="#b98a4c" metalness={0.62} roughness={0.34} />
            </mesh>
          </group>
        ))}
        <MuseumObjectLabel texture={texture} accent={accent} position={[0, 0.46, 0.08]} width={1.12} height={0.48} />
      </group>
    );
  }

  if (role === "achievement") {
    return (
      <group>
        {roundBase}
        <mesh castShadow position={[0, -0.88, 0]}>
          <boxGeometry args={[1.12, 0.72, 0.7]} />
          <meshStandardMaterial color="#6d5547" roughness={0.7} />
        </mesh>
        <mesh castShadow position={[0, -0.16, 0]}>
          <boxGeometry args={[1.02, 0.74, 0.62]} />
          <GlassMaterial />
        </mesh>
        {[-0.28, 0, 0.28].map((x, index) => (
          <mesh key={x} castShadow position={[x, -0.16 + (index % 2) * 0.12, 0.33]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.13, 0.13, 0.035, 18]} />
            <meshStandardMaterial color={index === 1 ? accent : "#d3aa54"} roughness={0.36} metalness={0.58} />
          </mesh>
        ))}
        <MuseumObjectLabel texture={texture} accent={accent} position={[0, -0.82, 0.39]} width={1.02} height={0.34} />
      </group>
    );
  }

  if (role === "contact") {
    return (
      <group>
        {roundBase}
        <mesh castShadow position={[0, -0.72, 0]}>
          <cylinderGeometry args={[0.12, 0.16, 1.08, 12]} />
          <meshStandardMaterial color="#b98a4c" roughness={0.46} metalness={0.5} />
        </mesh>
        <mesh castShadow position={[0, 0, 0]}>
          <boxGeometry args={[1.18, 0.64, 0.58]} />
          <meshStandardMaterial color={accent} roughness={0.62} />
        </mesh>
        <mesh position={[0, 0.04, 0.305]}>
          <boxGeometry args={[0.78, 0.08, 0.025]} />
          <meshStandardMaterial color={DARK_WOOD} roughness={0.6} />
        </mesh>
        <MuseumObjectLabel texture={texture} accent={accent} position={[0, 0, 0.34]} width={1.02} height={0.5} />
      </group>
    );
  }

  if (role === "works") {
    return (
      <group>
        {roundBase}
        <mesh castShadow position={[0, -0.55, 0]}>
          <cylinderGeometry args={[0.11, 0.14, 1.45, 12]} />
          <meshStandardMaterial color="#b98a4c" roughness={0.42} metalness={0.52} />
        </mesh>
        {[-0.62, -0.17, 0.28].map((y, index) => (
          <mesh key={y} castShadow position={[index % 2 ? 0.18 : -0.16, y, 0]} rotation={[0, index * 0.48 - 0.35, index % 2 ? 0.08 : -0.08]}>
            <boxGeometry args={[1.02, 0.24, 0.62]} />
            <meshStandardMaterial color={index === 1 ? accent : index ? "#d7c3a8" : "#8d77bf"} roughness={0.72} />
          </mesh>
        ))}
        <MuseumObjectLabel texture={texture} accent={accent} position={[0, 0.58, 0.04]} width={1.14} height={0.48} />
      </group>
    );
  }

  return (
    <group>
      {roundBase}
      <mesh castShadow position={[0, -0.47, 0]}>
        <cylinderGeometry args={[0.1, 0.14, 1.58, 10]} />
        <meshStandardMaterial color="#b98a4c" roughness={0.42} metalness={0.52} />
      </mesh>
      {[-0.78, -0.25, 0.28].map((y, index) => (
        <group key={y} position={[0, y, 0]}>
          <mesh position={[0, 0, 0]}>
            <sphereGeometry args={[0.1, 12, 8]} />
            <meshStandardMaterial color={accent} roughness={0.42} metalness={0.28} />
          </mesh>
          <mesh castShadow position={[index % 2 ? -0.34 : 0.34, 0, 0]}>
            <boxGeometry args={[0.52, 0.14, 0.34]} />
            <meshStandardMaterial color={index % 2 ? "#d7c3a8" : "#877061"} roughness={0.72} />
          </mesh>
        </group>
      ))}
      <MuseumObjectLabel texture={texture} accent={accent} position={[0, 0.56, 0]} width={1.14} height={0.5} />
    </group>
  );
}

function InformationFrame({
  kicker,
  title,
  position,
  rotation = [0, 0, 0],
  accent = TEAL,
  interactive = false,
  selected = false,
  onSelect,
  portraitUrl,
  semanticRole,
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
  semanticRole?: DisplaySurfacePlan["semanticRole"];
}) {
  const [hovered, setHovered] = useState(false);
  const group = useRef<THREE.Group>(null);
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 768;
    canvas.height = 384;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#f4eadb";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = accent;
    context.fillRect(0, 0, 22, canvas.height);
    context.fillStyle = "#6e5c51";
    context.font = "700 25px Arial";
    context.fillText(kicker.toUpperCase(), 56, 62, 660);
    context.fillStyle = INK;
    context.font = "700 50px Arial";
    drawWrappedText(context, title, 56, 138, 660, 56, 2);
    context.strokeStyle = "#c9b9a4";
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(56, 300);
    context.lineTo(712, 300);
    context.stroke();
    context.fillStyle = "#75685f";
    context.font = "700 20px Arial";
    context.fillText("CLICK TO EXPLORE", 56, 344, 660);
    const result = new THREE.CanvasTexture(canvas);
    result.colorSpace = THREE.SRGBColorSpace;
    result.anisotropy = 8;
    return result;
  }, [accent, kicker, title]);

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
      <InformationObjectGeometry semanticRole={semanticRole} texture={texture} accent={accent} portraitUrl={portraitUrl} />
      <mesh position={[0, -0.35, 0]}>
        <cylinderGeometry args={[0.82, 0.82, 2.15, 18]} />
        <meshBasicMaterial color={accent} transparent opacity={0.001} depthWrite={false} toneMapped={false} />
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
  const accent = subject.source.kind === "profile-photo" ? TEAL : "#8d77bf";
  return (
    <group>
      {[-0.18, 0.18].map((x) => (
        <mesh key={x} castShadow position={[x, 0.38, 0]}>
          <capsuleGeometry args={[0.12, 0.5, 4, 8]} />
          <meshStandardMaterial color="#4d4039" roughness={0.78} />
        </mesh>
      ))}
      <mesh castShadow position={[0, 1.08, 0]}>
        <capsuleGeometry args={[0.38, 0.88, 5, 10]} />
        <meshStandardMaterial color={accent} roughness={0.74} metalness={0.02} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} castShadow position={[side * 0.5, 1.08, 0]} rotation={[0, 0, side * -0.2]}>
          <capsuleGeometry args={[0.11, 0.62, 4, 8]} />
          <meshStandardMaterial color="#d4a07e" roughness={0.78} />
        </mesh>
      ))}
      <mesh castShadow position={[0, 1.96, 0]}>
        <icosahedronGeometry args={[0.43, 1]} />
        <meshStandardMaterial color="#d4a07e" roughness={0.78} />
      </mesh>
      <mesh position={[-0.14, 2.03, 0.39]}><sphereGeometry args={[0.035, 8, 6]} /><meshBasicMaterial color={INK} /></mesh>
      <mesh position={[0.14, 2.03, 0.39]}><sphereGeometry args={[0.035, 8, 6]} /><meshBasicMaterial color={INK} /></mesh>
    </group>
  );
}

function CreativePetFigure({ subject }: { subject: CreativeSubject }) {
  return (
    <group position={[1.2, 0, 0.25]} scale={0.62}>
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
  const rug = useRugTextures(undefined, 1.35);
  if (!person) return null;
  const disclosure = buildCreativeSubjectSceneDisclosure(person);
  return (
    <group position={MARDOU_CREATIVE_CORNER_POSITION} rotation={[0, -0.35, 0]}>
      <mesh receiveShadow position={[0.15, 0.015, 0.05]} rotation={[-Math.PI / 2, 0, 0]} scale={[1.25, 0.88, 1]}>
        <circleGeometry args={[1.55, 32]} />
        <meshStandardMaterial map={rug.map} bumpMap={rug.bumpMap} bumpScale={0.035} color="#a88978" roughness={0.96} />
      </mesh>
      <group position={[-0.35, 0, 0]}><CreativePersonFigure subject={person} /></group>
      {pet ? <CreativePetFigure subject={pet} /> : null}
      <LowPolyPlant position={[-1.25, 0, 0.35]} scale={0.58} />
      <TextPanel title="人物角" subtitle={disclosure.title} position={[0.15, 0.16, 1.12]} rotation={[-0.92, 0, 0]} width={1.42} height={0.3} />
    </group>
  );
}

function LivingInformationWall({ world, interactive, selectedId, onSelect }: { world: WorldPlan; interactive: boolean; selectedId?: string; onSelect: (id: string) => void }) {
  const portraitUrl = world.profile.media.find((media) => media.category === "profile-photo")?.url;
  return (
    <group>
      {world.displaySurfaces.map((surface, index) => {
        const authoredLayout = surface.layout || fallbackSurfaceLayout(surface, index);
        const pickedPlacement = MARDOU_SURFACE_PLACEMENTS[index];
        const layout = pickedPlacement
          ? { ...authoredLayout, position: pickedPlacement.position, rotation: pickedPlacement.rotation }
          : authoredLayout;
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
            semanticRole={surface.semanticRole}
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
      <pointLight position={[0, 3, -19.4]} intensity={interactive ? 14 : 0} distance={13} decay={2} color="#ffe3bd" />
    </group>
  );
}

function ShowroomDetails({ lit }: { lit: boolean }) {
  return <group>
    <pointLight position={[-2, 3.2, -12]} intensity={lit ? 7 : 0} distance={12} decay={2} color="#ffe2b2" />
    <pointLight position={[1, 5.4, -19]} intensity={lit ? 3 : 0} distance={9} decay={2} color="#9fc6b8" />
  </group>;
}

function GuestbookBoard({ messages, interactive, selected, onSelect }: { messages: string[]; interactive: boolean; selected: boolean; onSelect: () => void }) {
  const [hovered, setHovered] = useState(false);
  const recentMessages = messages.slice(-3);
  return (
    <group
      position={MARDOU_GUESTBOOK_PLACEMENT.position}
      rotation={MARDOU_GUESTBOOK_PLACEMENT.rotation}
      onClick={interactive ? (event) => { event.stopPropagation(); onSelect(); } : undefined}
      onPointerOver={interactive ? (event) => { event.stopPropagation(); setHovered(true); document.body.style.cursor = "pointer"; } : undefined}
      onPointerOut={interactive ? () => { setHovered(false); document.body.style.cursor = "default"; } : undefined}
    >
      <mesh castShadow receiveShadow position={[0, -1.03, 0]}>
        <cylinderGeometry args={[0.5, 0.58, 0.18, 18]} />
        <meshStandardMaterial color={DARK_WOOD} roughness={0.68} metalness={0.1} />
      </mesh>
      <mesh castShadow position={[0, -0.58, 0]}>
        <cylinderGeometry args={[0.17, 0.23, 0.78, 14]} />
        <meshStandardMaterial color="#b98a4c" roughness={0.46} metalness={0.48} />
      </mesh>
      <group position={[0, -0.06, 0]} rotation={[-0.3, 0, 0]}>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[1.38, 0.1, 0.78]} />
          <meshStandardMaterial color={DARK_WOOD} emissive={selected ? "#7088d4" : INK} emissiveIntensity={selected ? 0.22 : hovered ? 0.08 : 0} roughness={0.62} />
        </mesh>
        <mesh castShadow position={[-0.29, 0.1, 0]} rotation={[0, 0, 0.07]}>
          <boxGeometry args={[0.56, 0.055, 0.58]} />
          <meshStandardMaterial color="#f4eadb" roughness={0.88} />
        </mesh>
        <mesh castShadow position={[0.29, 0.1, 0]} rotation={[0, 0, -0.07]}>
          <boxGeometry args={[0.56, 0.055, 0.58]} />
          <meshStandardMaterial color="#f4eadb" roughness={0.88} />
        </mesh>
        <mesh position={[0, 0.135, 0]}>
          <boxGeometry args={[0.04, 0.035, 0.58]} />
          <meshStandardMaterial color="#7088d4" roughness={0.5} />
        </mesh>
        <mesh position={[0.5, 0.17, 0.12]} rotation={[0, 0, 0.38]}>
          <cylinderGeometry args={[0.025, 0.025, 0.52, 10]} />
          <meshStandardMaterial color="#d3aa54" roughness={0.35} metalness={0.58} />
        </mesh>
        {recentMessages.map((message, index) => (
          <mesh key={`${message}-${index}`} castShadow position={[-0.42 + index * 0.42, 0.17, -0.43]} rotation={[-0.08, 0, (index - 1) * 0.08]}>
            <boxGeometry args={[0.3, 0.018, 0.24]} />
            <meshStandardMaterial color={["#f1c36f", "#8fd1bf", "#caa8df"][index]} roughness={0.86} />
          </mesh>
        ))}
      </group>
      <TextPanel title="VISITOR LOG" subtitle={messages.length ? `${messages.length} MESSAGES · CLICK TO SIGN` : "OPEN BOOK · CLICK TO SIGN"} position={[0, -0.4, 0.48]} width={1.18} height={0.28} />
      {interactive ? (
        <>
          <mesh position={[0, -0.42, 0]}>
            <cylinderGeometry args={[0.78, 0.78, 1.45, 18]} />
            <meshBasicMaterial color="#7088d4" transparent opacity={0.001} depthWrite={false} toneMapped={false} />
          </mesh>
        </>
      ) : null}
      <pointLight position={[0.65, 0.55, 0.2]} intensity={interactive ? selected ? 4.5 : hovered ? 3 : 1.2 : 0} distance={3} color="#b6c4ff" />
    </group>
  );
}

function SourceArchiveTerminal({ interactive, selected, onSelect }: { interactive: boolean; selected: boolean; onSelect: () => void }) {
  const [hovered, setHovered] = useState(false);
  const archive = useRef<THREE.Group>(null);
  const archiveTexture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 768;
    canvas.height = 420;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#e9e0d1";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#283b38";
    context.fillRect(0, 0, canvas.width, 82);
    context.fillStyle = "#f7f1e7";
    context.font = "700 28px Arial";
    context.fillText("ROOM / SOURCE ARCHIVE", 38, 52);
    context.fillStyle = "#21302e";
    context.font = "700 46px Arial";
    context.fillText("PROJECT FILES", 38, 154);
    context.fillStyle = "#60726d";
    context.font = "24px Arial";
    context.fillText("VERIFIED LINKS · ORIGINAL EVIDENCE", 38, 198);
    [252, 310, 368].forEach((y, index) => {
      context.fillStyle = index === 0 ? "#fffaf0" : "#d3c7b6";
      context.fillRect(38, y, 692, 38);
      context.fillStyle = index === 0 ? "#547c74" : "#847564";
      context.fillRect(58, y + 13, 430 - index * 58, 10);
      context.fillStyle = "#c87955";
      context.fillRect(676, y + 10, 28, 16);
    });
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
  }, []);

  useEffect(() => () => archiveTexture.dispose(), [archiveTexture]);
  useFrame(() => {
    if (!archive.current) return;
    const targetScale = selected ? 1.06 : hovered ? 1.035 : 1;
    const scale = THREE.MathUtils.lerp(archive.current.scale.x, targetScale, 0.14);
    archive.current.scale.setScalar(scale);
  });

  return (
    <group
      ref={archive}
      position={MARDOU_SOURCE_ARCHIVE_PLACEMENT.position}
      rotation={MARDOU_SOURCE_ARCHIVE_PLACEMENT.rotation}
      onClick={interactive ? (event) => { event.stopPropagation(); onSelect(); } : undefined}
      onPointerOver={interactive ? (event) => { event.stopPropagation(); setHovered(true); document.body.style.cursor = "pointer"; } : undefined}
      onPointerOut={interactive ? () => { setHovered(false); document.body.style.cursor = "default"; } : undefined}
    >
      <mesh castShadow receiveShadow position={[0, 0.08, 0]}>
        <cylinderGeometry args={[0.52, 0.58, 0.16, 20]} />
        <meshStandardMaterial color={DARK_WOOD} roughness={0.68} metalness={0.08} />
      </mesh>
      <mesh castShadow position={[0, 0.42, 0]}>
        <cylinderGeometry args={[0.17, 0.23, 0.62, 16]} />
        <meshStandardMaterial color="#b98a4c" roughness={0.44} metalness={0.5} />
      </mesh>
      <group position={[0, 0.88, 0]} rotation={[-0.42, 0, 0]}>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[1.22, 0.08, 0.76]} />
          <meshStandardMaterial color={DARK_WOOD} emissive={selected ? TEAL : hovered ? "#385e57" : INK} emissiveIntensity={selected ? 0.2 : hovered ? 0.08 : 0} roughness={0.58} metalness={0.12} />
        </mesh>
        <mesh position={[0, 0.048, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[1.08, 0.62]} />
          <meshBasicMaterial map={archiveTexture} toneMapped={false} />
        </mesh>
        <mesh position={[0, 0.054, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={4}>
          <planeGeometry args={[1.08, 0.62]} />
          <meshPhysicalMaterial color="#fffaf0" transparent opacity={0.055} roughness={0.1} clearcoat={1} clearcoatRoughness={0.08} depthWrite={false} />
        </mesh>
      </group>
      {[[-0.44, "#d7ab62"], [0, "#86bcae"], [0.44, "#b99ccc"]].map(([x, color], index) => (
        <mesh key={String(x)} castShadow position={[x as number, 0.56 + index * 0.015, -0.48]} rotation={[-0.08, 0, (index - 1) * 0.06]}>
          <boxGeometry args={[0.3, 0.025, 0.22]} />
          <meshStandardMaterial color={color as string} roughness={0.82} />
        </mesh>
      ))}
      <TextPanel title="SOURCE ARCHIVE" subtitle="PROJECT FILES · CLICK TO OPEN" position={[0, 0.55, 0.56]} width={1.28} height={0.28} />
      {interactive ? (
        <>
          <mesh position={[0, 0.66, 0]}>
            <cylinderGeometry args={[0.82, 0.82, 1.5, 18]} />
            <meshBasicMaterial color={TEAL} transparent opacity={0.001} depthWrite={false} toneMapped={false} />
          </mesh>
        </>
      ) : null}
      <pointLight position={[0.65, 1.15, 0.3]} intensity={interactive ? selected ? 4.2 : hovered ? 2.8 : 1.1 : 0} distance={3} color={selected ? CORAL : TEAL} />
    </group>
  );
}

function BedroomDiary({ interactive, selected, onSelect }: { interactive: boolean; selected: boolean; onSelect: () => void }) {
  const [hovered, setHovered] = useState(false);
  const rug = useRugTextures(undefined, 4.6 / 3.2);
  return (
    <group
      position={MARDOU_DIARY_POSITION}
      rotation={[0, Math.PI / 2, 0]}
      onClick={interactive ? (event) => { event.stopPropagation(); onSelect(); } : undefined}
      onPointerOver={interactive ? (event) => { event.stopPropagation(); setHovered(true); document.body.style.cursor = "pointer"; } : undefined}
      onPointerOut={interactive ? () => { setHovered(false); document.body.style.cursor = "default"; } : undefined}
    >
      <mesh receiveShadow position={[0, 0.015, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[1.25, 0.85, 1]}>
        <circleGeometry args={[1.55, 32]} />
        <meshStandardMaterial map={rug.map} bumpMap={rug.bumpMap} bumpScale={0.045} color="#c6a790" roughness={0.95} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, 0.1, 0]}>
        <cylinderGeometry args={[0.48, 0.56, 0.18, 20]} />
        <meshStandardMaterial color={DARK_WOOD} roughness={0.68} metalness={0.08} />
      </mesh>
      <mesh castShadow position={[0, 0.42, 0]}>
        <cylinderGeometry args={[0.18, 0.24, 0.62, 16]} />
        <meshStandardMaterial color="#b98a4c" roughness={0.44} metalness={0.52} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, 0.76, 0]}>
        <cylinderGeometry args={[0.88, 0.82, 0.14, 24]} />
        <meshStandardMaterial color={DARK_WOOD} emissive={selected ? CORAL : hovered ? TEAL : INK} emissiveIntensity={selected ? 0.22 : hovered ? 0.08 : 0} roughness={0.64} metalness={0.08} />
      </mesh>
      <mesh castShadow position={[0, 0.68, 0.67]}>
        <boxGeometry args={[0.72, 0.2, 0.22]} />
        <meshStandardMaterial color="#6f5041" roughness={0.72} />
      </mesh>
      <mesh position={[0, 0.68, 0.79]}>
        <sphereGeometry args={[0.045, 10, 8]} />
        <meshStandardMaterial color="#d3aa54" roughness={0.34} metalness={0.6} />
      </mesh>
      <group position={[0, 0.9, 0.04]} rotation={[0.18, -0.08, 0]}>
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
      <mesh position={[0, 0.55, 0]}>
        <cylinderGeometry args={[1.05, 1.05, 1.1, 22]} />
        <meshBasicMaterial color={selected ? CORAL : TEAL} transparent opacity={0.001} depthWrite={false} toneMapped={false} />
      </mesh>
      <TextPanel title="PRIVATE DIARY" subtitle="CLICK THE OPEN BOOK" position={[0, 0.5, 0.9]} width={1.34} height={0.3} />
      <pointLight position={[0.8, 1.45, 0.3]} intensity={interactive ? selected ? 5 : 2.8 : 0} distance={3.5} color="#ffcc91" />
    </group>
  );
}

export function VillaExterior({ name, open, interactive, onEnter }: { name: string; open: boolean; interactive: boolean; onEnter: () => void }) {
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
    artwork.current.position.y = 0.72 + Math.sin(state.clock.elapsedTime * 1.05 + index) * 0.018;
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
    <group ref={artwork} position={[0, 0.72, 0]} rotation={[-1.12, 0, 0]}>
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
      <mesh castShadow receiveShadow position={[0, 0.12, 0]}>
        <cylinderGeometry args={[PROJECT_ISLAND_RADIUS, PROJECT_ISLAND_RADIUS + 0.08, 0.24, 24]} />
        <meshStandardMaterial color={DARK_WOOD} emissive={selected ? projectAccent(exhibit.title) : INK} emissiveIntensity={selected ? 0.24 : hovered ? 0.1 : 0} roughness={0.62} metalness={0.08} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, 0.3, 0]}>
        <cylinderGeometry args={[0.76, 0.82, 0.14, 24]} />
        <meshStandardMaterial color="#e6d5bd" roughness={0.76} />
      </mesh>
      <mesh position={[0, 0.38, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.73, 0.025, 8, 32]} />
        <meshStandardMaterial color={projectAccent(exhibit.title)} emissive={projectAccent(exhibit.title)} emissiveIntensity={selected ? 0.8 : 0.22} roughness={0.45} />
      </mesh>
      <ProjectImageCard exhibit={exhibit} index={displayIndex - 1} selected={selected} />
      <TextPanel
        title={`PROJECT ${String(displayIndex).padStart(2, "0")}`}
        subtitle={exhibit.title}
        position={[0, 0.43, 0.74]}
        width={1.12}
        height={0.26}
      />
      {interactive ? (
        <>
          <mesh position={[0, 0.55, 0]}>
            <cylinderGeometry args={[1.02, 1.02, 1.1, 20]} />
            <meshBasicMaterial color={projectAccent(exhibit.title)} transparent opacity={0.001} depthWrite={false} toneMapped={false} />
          </mesh>
        </>
      ) : null}
      <pointLight position={[0, 1.15, 0.35]} intensity={interactive ? selected ? 3.2 : hovered ? 2 : 0.65 : 0} distance={2.5} color={selected ? CORAL : projectAccent(exhibit.title)} />
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
    <group position={[0, 0.72, 0]} rotation={[-1.12, 0, 0]}>
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
      <mesh castShadow receiveShadow position={[0, 0.12, 0]}>
        <cylinderGeometry args={[PROJECT_ISLAND_RADIUS, PROJECT_ISLAND_RADIUS + 0.08, 0.24, 24]} />
        <meshStandardMaterial color="#443d38" roughness={0.84} metalness={0.02} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, 0.3, 0]}>
        <cylinderGeometry args={[0.76, 0.82, 0.14, 24]} />
        <meshStandardMaterial color="#b8afa4" roughness={0.92} />
      </mesh>
      <mesh position={[0, 0.38, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.73, 0.025, 8, 32]} />
        <meshBasicMaterial color="#8a8178" transparent opacity={0.55} toneMapped={false} />
      </mesh>
      <EmptySlotCard slot={slot} />
      <TextPanel
        title="COMING SOON"
        subtitle={`EMPTY SLOT ${String(slot + 1).padStart(2, "0")} · NOT A SOURCED IMAGE`}
        position={[0, 0.43, 0.74]}
        width={1.18}
        height={0.28}
      />
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
  const { camera, gl, scene } = useThree();
  useEffect(() => {
    let cancelled = false;
    let firstFrame = 0;
    let secondFrame = 0;
    async function warmScene() {
      try {
        await gl.compileAsync(scene, camera);
      } catch {
        // A normal render remains the fallback when parallel shader compilation is unavailable.
      }
      if (cancelled) return;
      firstFrame = window.requestAnimationFrame(() => {
        secondFrame = window.requestAnimationFrame(onReady);
      });
    }
    void warmScene();
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame) window.cancelAnimationFrame(secondFrame);
    };
  }, [camera, gl, onReady, scene]);
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
  sceneReady: boolean;
  projectPage?: number;
  selectedExhibit?: string;
  guestbookMessages?: string[];
  onSelect: (id: string) => void;
  onRoomChange: (roomId: string) => void;
  onLoadProgress: (progress: number) => void;
  onLoadState: (snapshot: SceneLoadingSnapshot) => void;
  onReady: () => void;
};

function sameStringItems(left: string[] = [], right: string[] = []) {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

function areWorldCanvasPropsEqual(previous: WorldCanvasProps, next: WorldCanvasProps) {
  return (
    previous.world === next.world &&
    previous.activeRoom === next.activeRoom &&
    previous.sceneReady === next.sceneReady &&
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

function WorldCanvasImpl({ world, activeRoom, sceneReady, projectPage = 0, selectedExhibit, guestbookMessages = [], onSelect, onRoomChange, onLoadProgress, onLoadState, onReady }: WorldCanvasProps) {
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
      <Canvas dpr={[1, 1.35]} shadows={{ type: THREE.PCFShadowMap }} camera={{ position: activeRoom === "room-lobby" ? MARDOU_LOBBY_INTRO_ROUTE.spawn : MARDOU_EXTERIOR_FOCUS.camera, fov: activeRoom === "room-lobby" ? MARDOU_LOBBY_FOCUS.fov : MARDOU_EXTERIOR_FOCUS.fov, near: 0.08, far: 120 }} gl={{ antialias: true, powerPreference: "high-performance" }} onPointerMissed={() => onSelect("")}>
        <color attach="background" args={["#91adbd"]} />
        <fog attach="fog" args={["#91adbd", 32, 74]} />
        <ambientLight intensity={0.5} color="#ead9c4" />
        <hemisphereLight intensity={0.65} color="#bfd6e8" groundColor="#432f2a" />
        <directionalLight castShadow position={[14, 22, 12]} intensity={2.35} color="#ffd8ad" shadow-mapSize={[2048, 2048]} shadow-camera-left={-26} shadow-camera-right={26} shadow-camera-top={24} shadow-camera-bottom={-24} />
        <pointLight position={[-7, 5, 5]} intensity={activeRoom !== "room-private" ? 12 : 0} distance={12} decay={2} color={CORAL} />
        <pointLight position={[6, 4, -3]} intensity={activeRoom !== "room-private" ? 3.8 : 0} distance={9} decay={2} color="#9fc6b8" />
        <RendererLook />
        <CameraRig activeRoom={activeRoom} selectedExhibit={selectedExhibit} sceneReady={sceneReady} world={world} />
        <Suspense fallback={null}>
          <MardouMuseumScene
            activeRoom={activeRoom}
            onEnter={() => onRoomChange("room-lobby")}
            onGoUpstairs={() => onRoomChange("room-private")}
            onBackgroundClick={() => onSelect("")}
          />
          <StairwayClickTarget
            interactive={activeRoom === "room-lobby" && !selectedExhibit}
            onGoUpstairs={() => onRoomChange("room-private")}
          />
          <OptionalAssetBoundary key={world.id}>
            <Suspense fallback={null}>
              <PortfolioEnvironment />
            </Suspense>
          </OptionalAssetBoundary>
          <LivingInformationWall
            world={world}
            interactive={activeRoom === "room-lobby"}
            selectedId={selectedExhibit}
            onSelect={onSelect}
          />
          <ShowroomDetails lit={activeRoom === "room-lobby"} />
          <SourceArchiveTerminal
            interactive={activeRoom === "room-lobby"}
            selected={selectedExhibit === "showroom-source-browser"}
            onSelect={() => onSelect("showroom-source-browser")}
          />
          <CreativeSubjectCorner subjects={creativeSubjects} />
          <GuestbookBoard
            messages={guestbookMessages}
            interactive={activeRoom !== "exterior"}
            selected={selectedExhibit === "showroom-guestbook"}
            onSelect={() => onSelect("showroom-guestbook")}
          />
          <BedroomDiary
            interactive={activeRoom === "room-private"}
            selected={selectedExhibit === "bedroom-diary"}
            onSelect={() => onSelect("bedroom-diary")}
          />
          {MARDOU_PROJECT_PLACEMENTS.map((placement, slot) => {
            const exhibit = visibleProjectExhibits[slot];
            return exhibit ? (
              <ProjectPedestal
                key={exhibit.id}
                exhibit={exhibit}
                position={placement.position}
                displayIndex={projectStart + slot + 1}
                selected={selectedExhibit === exhibit.id}
                interactive={activeRoom === "room-lobby"}
                onSelect={onSelect}
              />
            ) : (
              <EmptyProjectPedestal key={`empty-project-${slot}`} position={placement.position} slot={slot} />
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
