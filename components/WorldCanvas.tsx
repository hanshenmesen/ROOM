"use client";

// Component-only module: keep non-React preload exports in WorldCanvasPreload.

/* eslint-disable react-hooks/immutability -- Three.js render loops intentionally mutate scene objects. */

import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import {
  Component,
  memo,
  Suspense,
  useEffect,
  useCallback,
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
import { materialFrameCopy } from "@/lib/exhibit-presentation";
import { displayStandTitle } from "@/lib/display-copy";
import { sampleCameraCurve } from "@/lib/camera-route";
import type { PetCustomization } from "@/lib/profile-space-customization";
import { normalizeRoomCompanionName } from "@/lib/room-companion";
import { SCENE_COMPILE_TIMEOUT_MS } from "@/lib/scene-entry";
import type {
  ContentFamily,
  DisplaySurfacePlan,
  ExhibitPlan,
  ProfileItem,
  Vec3,
  WorldPlan,
} from "@/lib/types";
import {
  PortfolioEnvironment,
  RendererLook,
} from "./OpenSourceRoomDressing";
import {
  MARDOU_AUTO_DOOR,
  MARDOU_ACHIEVEMENT_PLACEMENT,
  MARDOU_CARTOON_STATUE_PLACEMENT,
  MARDOU_COUCH_PLACEMENT,
  MARDOU_PET_BED_PLACEMENT,
  MARDOU_DIARY_FOCUS,
  MARDOU_DIARY_POSITION,
  MARDOU_DIARY_ROTATION,
  MARDOU_ENTRANCE_ROUTE,
  MARDOU_EXTERIOR_FOCUS,
  MARDOU_GUESTBOOK_WALL_PLACEMENT,
  MARDOU_GRAMOPHONE_PLACEMENT,
  MARDOU_INNER_GALLERY_DOOR,
  MARDOU_LIFE_FILLER_PLACEMENTS,
  MARDOU_LOBBY_FOCUS,
  MARDOU_LOBBY_INTRO_ROUTE,
  MARDOU_LOBBY_WIDE_FOCUS,
  MARDOU_PRIVATE_FOCUS,
  MARDOU_PRIVATE_PICTURE_FRAMES,
  MARDOU_PRIVATE_ROUTE,
  MARDOU_PRIVATE_WIDE_FOCUS,
  MARDOU_PRIVATE_SURFACE_PLACEMENTS,
  MARDOU_PROFILE_PLACEMENT,
  MARDOU_PROJECT_SKILLS_DOOR_ROUTE,
  MARDOU_SKILLS_PLACEMENT,
  MARDOU_SIDE_ENTRANCE_DOOR,
  MARDOU_STAIR_CLICK_TARGETS,
  MARDOU_FAR_PROJECT_FOCUS_ROUTE,
  mardouCreativeCornerPlacementForPrivateCount,
  mardouProjectPlacementsForCount,
  responsiveMuseumCamera,
  responsiveMuseumFov,
  responsiveMuseumTarget,
  type MuseumPlacement,
  type MardouPrivateFrameSlot,
} from "./MardouMuseumLayout";
import { MardouMuseumScene } from "./MardouMuseumScene";
import { MuseumLifeFillers } from "./MuseumLifeFillers";
import { RoomCompanion } from "./RoomCompanion";
import { resolvePlanarMovement, sceneMovementBlocked } from "./FirstPersonCollision";
import {
  SceneGltfLoader,
  SceneTextureLoader,
} from "./SceneAssetLoaders";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
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
const PROJECTS_PER_PAGE = 3;
const SKILLS_BOOKCASE_URL = "/vendor/mardou/skills-bookcase.glb";
const EXHIBIT_PEDESTAL_URL = "/vendor/mardou/exhibit-pedestal-2.glb";
const BLANK_ART_FRAME_URL = "/vendor/mardou/blank-art-frame.glb";
const GRAMOPHONE_URL = "/vendor/mardou/gramophone.glb";
const DAMAGED_COUCH_URL = "/vendor/mardou/damaged-couch.glb";
const PET_BED_URL = "/vendor/mardou/pet-bed.glb";
const CARTOON_STATUE_URL = "/vendor/mardou/cartoon-character-statue.glb";
const PRIVATE_INFO_COLUMN_URL = "/vendor/mardou/private-info-column.glb";
const PRIVATE_DIARY_COLUMN_URL = "/vendor/mardou/private-diary-column-round.glb";
const PRIVATE_DIARY_BOOK_URL = "/vendor/mardou/private-diary-book.glb";
const SKILLS_BOOKCASE_SIZE: Vec3 = [1.75, 2.2, 0.8];
const PROJECT_PEDESTAL_SIZE: Vec3 = [1.3, 0.62, 1.3];
const PRIVATE_FRAME_SIZE: Vec3 = [1.22, 2, 0.12];
const GRAMOPHONE_SIZE: Vec3 = [1, 1.05, 1];
const DAMAGED_COUCH_SIZE: Vec3 = [2.2, 1.05, 0.95];
const PET_BED_SIZE: Vec3 = [1.25, 0.72, 1.2];
const CARTOON_STATUE_SIZE: Vec3 = [1.56, PROJECT_PEDESTAL_SIZE[1] * 3, 1.56];
const PRIVATE_INFO_COLUMN_SIZE: Vec3 = [1.08, 1.72, 0.92];
const PRIVATE_DIARY_COLUMN_SIZE: Vec3 = [1.45, 0.78, 1.45];
const PRIVATE_DIARY_BOOK_SIZE: Vec3 = [1.12, 0.22, 0.82];
const INFORMATION_OBJECT_FLOOR_OFFSET = -1.39;
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

// CanvasRenderingContext2D.roundRect is unavailable before Chrome 99 / Safari 16 / Firefox 112;
// tracing the path manually keeps the 3D render loop alive on older browsers.
function traceRoundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  if (typeof context.roundRect === "function") {
    context.roundRect(x, y, width, height, radius);
    return;
  }
  const r = Math.min(radius, width / 2, height / 2);
  context.moveTo(x + r, y);
  context.arcTo(x + width, y, x + width, y + height, r);
  context.arcTo(x + width, y + height, x, y + height, r);
  context.arcTo(x, y + height, x, y, r);
  context.arcTo(x, y, x + width, y, r);
  context.closePath();
}

const GUESTBOOK_LANE_COLORS = ["#ffad87", "#8de0d2", "#d2b4ef", "#f3cf7a", "#91bdf2"];
const GUESTBOOK_BORDER_SEGMENTS: { position: Vec3; size: Vec3 }[] = [
  { position: [0, 0.89, 0], size: [3.2, 0.09, 0.08] },
  { position: [0, -0.89, 0], size: [3.2, 0.09, 0.08] },
  { position: [-1.56, 0, 0], size: [0.09, 1.82, 0.08] },
  { position: [1.56, 0, 0], size: [0.09, 1.82, 0.08] },
];

const PROJECT_CARD_SIZE = [1.68, 1.12, 0.09] as const;
const PROJECT_CARD_SURFACE_SIZE = [1.56, 1] as const;
const PROJECT_CARD_TILT = -0.82;
const PROJECT_CARD_HEIGHT = 1.08;
const FIRST_PERSON_SPEED = 2.7;
const FIRST_PERSON_COLLISION_RADIUS = 0.42;
const FIRST_PERSON_MAX_PITCH = THREE.MathUtils.degToRad(75);
const FIRST_PERSON_KEY_TURN_ANGLE = THREE.MathUtils.degToRad(45);
const FIRST_PERSON_KEY_TURN_DURATION = 0.55;
const FIRST_PERSON_POINTER_DEAD_ZONE = 0.08;
const FIRST_PERSON_EDGE_YAW_SPEED = THREE.MathUtils.degToRad(78);
const FIRST_PERSON_EDGE_PITCH_SPEED = THREE.MathUtils.degToRad(52);
const FIRST_PERSON_BOUNDS = {
  "room-lobby": { minX: -9.2, maxX: 7, minZ: -25.5, maxZ: 4 },
  "room-private": { minX: -10.4, maxX: 9.2, minZ: -26.5, maxZ: -8.5 },
} as const;

const localFeatureFocusTargets: Record<string, { target: Vec3; camera: Vec3; fov: number }> = {
  "showroom-guestbook": MARDOU_GUESTBOOK_WALL_PLACEMENT.focus,
  "showroom-hobbies": {
    target: [MARDOU_LIFE_FILLER_PLACEMENTS.sports.position[0], 1.15, MARDOU_LIFE_FILLER_PLACEMENTS.sports.position[2]],
    camera: [MARDOU_LIFE_FILLER_PLACEMENTS.sports.position[0] - 3, 1.6, MARDOU_LIFE_FILLER_PLACEMENTS.sports.position[2] + 1],
    fov: 49,
  },
  "showroom-snacks": {
    target: [MARDOU_LIFE_FILLER_PLACEMENTS.refreshments.position[0], 1.05, MARDOU_LIFE_FILLER_PLACEMENTS.refreshments.position[2]],
    camera: [MARDOU_LIFE_FILLER_PLACEMENTS.refreshments.position[0] + 2.6, 1.55, MARDOU_LIFE_FILLER_PLACEMENTS.refreshments.position[2] + 1.4],
    fov: 49,
  },
  "showroom-gramophone": MARDOU_GRAMOPHONE_PLACEMENT.focus,
  "bedroom-diary": MARDOU_DIARY_FOCUS,
  ...Object.fromEntries(MARDOU_PRIVATE_PICTURE_FRAMES.map((frame) => [frame.slot, frame.focus])),
};

function isLobbySurface(surface: DisplaySurfacePlan) {
  return surface.semanticRole === "profile"
    || surface.semanticRole === "achievement"
    || surface.semanticRole === "skills";
}

function surfacePlacementFor(world: WorldPlan, surface: DisplaySurfacePlan) {
  if (surface.semanticRole === "profile") return MARDOU_PROFILE_PLACEMENT;
  if (surface.semanticRole === "achievement") return MARDOU_ACHIEVEMENT_PLACEMENT;
  if (surface.semanticRole === "skills") return MARDOU_SKILLS_PLACEMENT;
  const privateSurfaces = world.displaySurfaces.filter((candidate) => !isLobbySurface(candidate));
  return MARDOU_PRIVATE_SURFACE_PLACEMENTS[privateSurfaces.findIndex((candidate) => candidate.id === surface.id)];
}

type CameraRoute = {
  position: THREE.Curve<THREE.Vector3>;
  target: THREE.Curve<THREE.Vector3>;
  finalPosition: THREE.Vector3;
  finalTarget: THREE.Vector3;
  duration: number;
  elapsed: number;
  fromFov: number;
  toFov: number;
  preserveFov?: boolean;
  focusId?: string;
  focusView?: {
    fromDirection: THREE.Vector3;
    midDirection?: THREE.Vector3;
    toDirection: THREE.Vector3;
    fromDistance: number;
    toDistance: number;
  };
  targetUsesControlTiming?: boolean;
  targetUsesUniformControlTiming?: boolean;
  lookForwardAlongRoute?: boolean;
  roomTransition?: boolean;
  lobbyIntro?: boolean;
};

function silkyCameraEase(progress: number) {
  const t = THREE.MathUtils.clamp(progress, 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function silkyCameraCurve(points: THREE.Vector3[]) {
  const curve = new THREE.CatmullRomCurve3(points, false, "centripetal", 0.42);
  curve.arcLengthDivisions = 1200;
  curve.updateArcLengths();
  return curve;
}

function cameraTurnAngle(
  fromPosition: THREE.Vector3,
  fromTarget: THREE.Vector3,
  toPosition: THREE.Vector3,
  toTarget: THREE.Vector3,
) {
  return fromTarget.clone().sub(fromPosition).angleTo(toTarget.clone().sub(toPosition));
}

function silkyTransitionDuration(distance: number, focusTransition: boolean, turnAngle = 0) {
  if (!focusTransition) return THREE.MathUtils.clamp(distance * 0.38, 2.8, 4.2);
  // A side island can require a much larger turn than its travel distance
  // suggests. Budget roughly one second per 14.5 degrees so the lens never
  // whips sideways, while nearby forward-facing exhibits keep the 2.8s floor.
  const turnSeconds = THREE.MathUtils.radToDeg(turnAngle) / 14.5;
  return THREE.MathUtils.clamp(Math.max(distance * 0.62, turnSeconds), 2.8, 6.4);
}

function responsiveReframeDuration(distance: number) {
  return THREE.MathUtils.clamp(0.85 + distance * 0.22, 0.85, 1.8);
}

function pointerEdgeIntent(normalizedCoordinate: number) {
  const magnitude = Math.abs(THREE.MathUtils.clamp(normalizedCoordinate, -1, 1));
  if (magnitude <= FIRST_PERSON_POINTER_DEAD_ZONE) return 0;
  const edgeProgress = (magnitude - FIRST_PERSON_POINTER_DEAD_ZONE) / (1 - FIRST_PERSON_POINTER_DEAD_ZONE);
  // A smooth cubic response leaves a calm aiming area around the centre but
  // reaches full continuous turn speed at the screen edge.
  const eased = edgeProgress * edgeProgress * (3 - 2 * edgeProgress);
  return Math.sign(normalizedCoordinate) * eased;
}

function CameraRig({ activeRoom, selectedExhibit, sceneReady, world, onFocusSettled, onTransitionStateChange, onLobbyIntroStart, onLobbyIntroComplete, onWideAngleRequested }: { activeRoom: string; selectedExhibit?: string; sceneReady: boolean; world: WorldPlan; onFocusSettled: (id: string) => void; onTransitionStateChange: (transitioning: boolean) => void; onLobbyIntroStart: () => void; onLobbyIntroComplete: () => void; onWideAngleRequested: () => void }) {
  const { camera, gl, scene, size } = useThree();
  const viewportAspect = size.width / Math.max(1, size.height);
  const lookAt = useMemo(() => new THREE.Vector3(...MARDOU_LOBBY_INTRO_ROUTE.lookAt), []);
  const lookAtTarget = useMemo(() => new THREE.Vector3(...MARDOU_LOBBY_INTRO_ROUTE.lookAt), []);
  const mouseLookTarget = useMemo(() => new THREE.Vector3(...MARDOU_LOBBY_INTRO_ROUTE.lookAt), []);
  const destination = useMemo(() => new THREE.Vector3(...MARDOU_LOBBY_INTRO_ROUTE.spawn), []);
  const frameDestination = useMemo(() => new THREE.Vector3(), []);
  const routeAhead = useMemo(() => new THREE.Vector3(), []);
  const viewDirection = useMemo(() => new THREE.Vector3(), []);
  const viewRight = useMemo(() => new THREE.Vector3(), []);
  const movement = useMemo(() => new THREE.Vector3(), []);
  const movementForward = useMemo(() => new THREE.Vector3(), []);
  const movementRight = useMemo(() => new THREE.Vector3(), []);
  const safeMovement = useMemo(() => new THREE.Vector3(), []);
  const movementRaycaster = useMemo(() => new THREE.Raycaster(), []);
  const desiredFov = useRef(activeRoom === "room-lobby" ? MARDOU_LOBBY_FOCUS.fov : MARDOU_EXTERIOR_FOCUS.fov);
  const previousRoom = useRef(activeRoom);
  const previousExhibit = useRef(selectedExhibit);
  const lobbyIntroPending = useRef(activeRoom === "room-lobby");
  const pressedMovementKeys = useRef(new Set<string>());
  const firstPersonYaw = useRef(0);
  const firstPersonPitch = useRef(0);
  const keyboardTurnRemaining = useRef(0);
  const keyboardTurnElapsed = useRef(0);
  const keyboardTurnHeld = useRef(0);
  const keyboardTurnQueuedSteps = useRef(0);
  const pointerLookIntent = useRef({ x: 0, y: 0 });
  const pointerLookLocked = useRef(false);
  const wideAngleRequested = useRef(false);
  const wideAfterSelectionClears = useRef(false);
  const lobbyOverviewMode = useRef<"default" | "wide">("default");
  const responsiveAspect = useRef(viewportAspect);
  const userAdjustedView = useRef(false);
  const route = useRef<CameraRoute | null>(null);
  const preFocusView = useRef<{
    room: string;
    position: THREE.Vector3;
    target: THREE.Vector3;
    fov: number;
  } | null>(null);

  useEffect(() => {
    function isTypingTarget(target: EventTarget | null) {
      return target instanceof HTMLElement
        && (target.isContentEditable || target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT");
    }

    function handleKeyDown(event: KeyboardEvent) {
      const key = event.key.toLowerCase();
      if (!FIRST_PERSON_BOUNDS[activeRoom as keyof typeof FIRST_PERSON_BOUNDS] || isTypingTarget(event.target)) return;
      if (key === "r") {
        if (event.repeat) return;
        event.preventDefault();
        if (selectedExhibit) {
          // R is the explicit escape hatch from every close-up. Clear the
          // selected exhibit first so the detail screen and camera cannot
          // disagree, then start the authored wide route on the next frame.
          wideAfterSelectionClears.current = true;
          onWideAngleRequested();
        } else {
          wideAngleRequested.current = true;
        }
        return;
      }
      if (["q", "e"].includes(key)) {
        if (selectedExhibit || route.current) return;
        event.preventDefault();
        userAdjustedView.current = true;
        const direction = key === "q" ? 1 : -1;
        keyboardTurnHeld.current = direction;
        if (!event.repeat) {
          if (Math.abs(keyboardTurnRemaining.current) <= 0.001) {
            keyboardTurnRemaining.current = direction * FIRST_PERSON_KEY_TURN_ANGLE;
            keyboardTurnElapsed.current = 0;
          } else {
            keyboardTurnQueuedSteps.current = THREE.MathUtils.clamp(
              keyboardTurnQueuedSteps.current + direction,
              -12,
              12,
            );
          }
        }
        return;
      }
      if (!["w", "a", "s", "d"].includes(key)) return;
      event.preventDefault();
      if (!selectedExhibit && !route.current) userAdjustedView.current = true;
      pressedMovementKeys.current.add(key);
    }

    function handleKeyUp(event: KeyboardEvent) {
      const key = event.key.toLowerCase();
      pressedMovementKeys.current.delete(key);
      if ((key === "q" && keyboardTurnHeld.current > 0) || (key === "e" && keyboardTurnHeld.current < 0)) {
        keyboardTurnHeld.current = 0;
      }
    }

    function clearKeys() {
      pressedMovementKeys.current.clear();
      keyboardTurnHeld.current = 0;
      keyboardTurnQueuedSteps.current = 0;
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
  }, [activeRoom, onWideAngleRequested, selectedExhibit]);

  useEffect(() => {
    const canvas = gl.domElement;
    const canLookAround = Boolean(FIRST_PERSON_BOUNDS[activeRoom as keyof typeof FIRST_PERSON_BOUNDS]) && !selectedExhibit;

    function updatePointerLookIntent(clientX: number, clientY: number) {
      const bounds = canvas.getBoundingClientRect();
      if (bounds.width <= 0 || bounds.height <= 0) return;
      const normalizedX = THREE.MathUtils.clamp(((clientX - bounds.left) / bounds.width) * 2 - 1, -1, 1);
      const normalizedY = THREE.MathUtils.clamp(((clientY - bounds.top) / bounds.height) * 2 - 1, -1, 1);
      pointerLookIntent.current = {
        x: pointerEdgeIntent(normalizedX),
        y: pointerEdgeIntent(normalizedY),
      };
    }

    function handlePointerMove(event: PointerEvent) {
      if (!canLookAround || route.current || pointerLookLocked.current) {
        pointerLookIntent.current = { x: 0, y: 0 };
        return;
      }
      updatePointerLookIntent(event.clientX, event.clientY);
      if (pointerLookIntent.current.x || pointerLookIntent.current.y) userAdjustedView.current = true;
    }

    function clearPointerLookIntent() {
      pointerLookIntent.current = { x: 0, y: 0 };
    }

    function togglePointerLookLock(event: MouseEvent) {
      event.preventDefault();
      if (!canLookAround || route.current) return;
      pointerLookLocked.current = !pointerLookLocked.current;
      if (pointerLookLocked.current) clearPointerLookIntent();
      else updatePointerLookIntent(event.clientX, event.clientY);
      canvas.dataset.viewLocked = pointerLookLocked.current ? "true" : "false";
      canvas.title = pointerLookLocked.current ? "视角已锁定 · 右键解除" : "鼠标靠近边缘持续旋转 · 右键锁定";
    }

    canvas.addEventListener("pointerenter", handlePointerMove);
    canvas.addEventListener("pointermove", handlePointerMove);
    canvas.addEventListener("contextmenu", togglePointerLookLock);
    window.addEventListener("blur", clearPointerLookIntent);
    return () => {
      canvas.removeEventListener("pointerenter", handlePointerMove);
      canvas.removeEventListener("pointermove", handlePointerMove);
      canvas.removeEventListener("contextmenu", togglePointerLookLock);
      window.removeEventListener("blur", clearPointerLookIntent);
      delete canvas.dataset.viewLocked;
      canvas.removeAttribute("title");
      clearPointerLookIntent();
    };
  }, [activeRoom, gl, selectedExhibit]);

  useEffect(() => {
    if (lobbyIntroPending.current && activeRoom === "room-lobby" && !selectedExhibit && !sceneReady) return;

    const room = world.rooms.find((item) => item.id === activeRoom);
    const exhibit = world.exhibits.find((item) => item.id === selectedExhibit);
    const exhibitRoom = exhibit ? world.rooms.find((item) => item.id === exhibit.roomId) : undefined;
    const selectedSurface = selectedExhibit
      ? world.displaySurfaces.find((surface) => surface.id === selectedExhibit)
      : undefined;
    const roomChanged = previousRoom.current !== activeRoom;
    const exhibitChanged = previousExhibit.current !== selectedExhibit;
    const shouldPlayLobbyIntro = lobbyIntroPending.current && activeRoom === "room-lobby" && !selectedExhibit;
    // Viewport-only updates are handled inside the frame loop. Returning here
    // before mutating destination/lookAtTarget is essential: otherwise merely
    // rotating a phone would silently pull a manually explored camera back to
    // the authored overview even when no responsive reframe was requested.
    if (!roomChanged && !exhibitChanged && !shouldPlayLobbyIntro) return;
    if (exhibitChanged && selectedExhibit && !previousExhibit.current) {
      preFocusView.current = {
        room: activeRoom,
        position: camera.position.clone(),
        target: lookAt.clone(),
        fov: camera instanceof THREE.PerspectiveCamera ? camera.fov : desiredFov.current,
      };
    }
    const returningToPreFocus = Boolean(
      exhibitChanged
      && !selectedExhibit
      && previousExhibit.current
      && preFocusView.current?.room === activeRoom,
    );
    const authoredFocus = selectedExhibit
      ? (selectedSurface ? surfacePlacementFor(world, selectedSurface)?.focus : undefined)
        || localFeatureFocusTargets[selectedExhibit]
      : undefined;
    const projectIndex = exhibit?.eyebrow === "PROJECT"
      ? world.exhibits.filter((item) => item.eyebrow === "PROJECT").findIndex((item) => item.id === exhibit.id)
      : -1;
    const projectExhibits = world.exhibits.filter((item) => item.eyebrow === "PROJECT");
    const previousProjectIndex = projectExhibits.findIndex((item) => item.id === previousExhibit.current);
    const projectPageStart = Math.floor(Math.max(0, projectIndex) / PROJECTS_PER_PAGE) * PROJECTS_PER_PAGE;
    const projectPageCount = Math.min(PROJECTS_PER_PAGE, projectExhibits.length - projectPageStart);
    const displayedProjectPlacement = projectIndex >= 0
      ? mardouProjectPlacementsForCount(projectPageCount)[projectIndex % PROJECTS_PER_PAGE]
      : undefined;
    if (returningToPreFocus && preFocusView.current) {
      destination.copy(preFocusView.current.position);
      lookAtTarget.copy(preFocusView.current.target);
      desiredFov.current = preFocusView.current.fov;
    } else if (authoredFocus) {
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
      lookAtTarget.set(...responsiveMuseumTarget(MARDOU_LOBBY_FOCUS.target, viewportAspect));
      destination.set(...responsiveMuseumCamera(MARDOU_LOBBY_FOCUS.camera, viewportAspect));
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

    firstPersonYaw.current = 0;
    firstPersonPitch.current = 0;
    keyboardTurnRemaining.current = 0;
    keyboardTurnElapsed.current = 0;
    pointerLookIntent.current = { x: 0, y: 0 };

    const startPosition = camera.position.clone();
    const startTarget = lookAt.clone();
    const fromFov = camera instanceof THREE.PerspectiveCamera ? camera.fov : desiredFov.current;
    let positionPoints = [startPosition, destination.clone()];
    let targetPoints = [startTarget, lookAtTarget.clone()];
    let positionCurve: THREE.Curve<THREE.Vector3> | undefined;
    const focusTransition = Boolean(selectedExhibit || previousExhibit.current);
    const switchingBetweenProjects = projectIndex >= 0 && previousProjectIndex >= 0;
    const enteringSkillsFromProjectThree = selectedSurface?.semanticRole === "skills" && previousProjectIndex === 2;
    const leavingSkillsForProjectThree = projectIndex === 2 && previousExhibit.current === "showroom-skills";
    let usesFarProjectRoute = false;
    const turnAngle = cameraTurnAngle(startPosition, startTarget, destination, lookAtTarget);
    let duration = silkyTransitionDuration(startPosition.distanceTo(destination), focusTransition, turnAngle);

    if (shouldPlayLobbyIntro) {
      positionPoints = MARDOU_LOBBY_INTRO_ROUTE.points.map((point) => new THREE.Vector3(...point));
      targetPoints = MARDOU_LOBBY_INTRO_ROUTE.targets.map((point) => new THREE.Vector3(...point));
      positionCurve = silkyCameraCurve(positionPoints);
      duration = MARDOU_LOBBY_INTRO_ROUTE.duration;
      lobbyIntroPending.current = false;
      onLobbyIntroStart();
    } else if (previousRoom.current === "exterior" && activeRoom === "room-lobby") {
      positionPoints = [
        startPosition,
        new THREE.Vector3(...MARDOU_ENTRANCE_ROUTE.outside),
        new THREE.Vector3(...MARDOU_ENTRANCE_ROUTE.threshold),
        new THREE.Vector3(...MARDOU_ENTRANCE_ROUTE.gallery),
        ...MARDOU_LOBBY_INTRO_ROUTE.points.slice(0, -1).map((point) => new THREE.Vector3(...point)),
        destination.clone(),
      ];
      targetPoints = [
        startTarget,
        ...MARDOU_ENTRANCE_ROUTE.entryTargets.map((point) => new THREE.Vector3(...point)),
        ...MARDOU_LOBBY_INTRO_ROUTE.targets.map((point) => new THREE.Vector3(...point)),
      ];
      duration = MARDOU_ENTRANCE_ROUTE.duration;
    } else if (previousRoom.current === "room-lobby" && activeRoom === "room-private") {
      positionPoints = [
        startPosition,
        new THREE.Vector3(...MARDOU_PRIVATE_ROUTE.approach),
        new THREE.Vector3(...MARDOU_PRIVATE_ROUTE.lowerFlight),
        new THREE.Vector3(...MARDOU_PRIVATE_ROUTE.landing),
        new THREE.Vector3(...MARDOU_PRIVATE_ROUTE.upperFlight),
        new THREE.Vector3(...MARDOU_PRIVATE_ROUTE.galleryEntry),
        destination.clone(),
      ];
      targetPoints = [
        startTarget,
        ...MARDOU_PRIVATE_ROUTE.ascentTargets.map((point) => new THREE.Vector3(...point)),
        lookAtTarget.clone(),
      ];
      duration = MARDOU_PRIVATE_ROUTE.duration;
    } else if (previousRoom.current === "room-private" && activeRoom === "room-lobby") {
      positionPoints = [
        startPosition,
        new THREE.Vector3(...MARDOU_PRIVATE_ROUTE.galleryEntry),
        new THREE.Vector3(...MARDOU_PRIVATE_ROUTE.upperFlight),
        new THREE.Vector3(...MARDOU_PRIVATE_ROUTE.landing),
        new THREE.Vector3(...MARDOU_PRIVATE_ROUTE.lowerFlight),
        new THREE.Vector3(...MARDOU_PRIVATE_ROUTE.approach),
        destination.clone(),
      ];
      targetPoints = [
        startTarget,
        ...MARDOU_PRIVATE_ROUTE.descentTargets.map((point) => new THREE.Vector3(...point)),
        lookAtTarget.clone(),
      ];
      duration = MARDOU_PRIVATE_ROUTE.descentDuration;
    } else if (previousRoom.current === "room-lobby" && activeRoom === "exterior") {
      positionPoints = [
        startPosition,
        ...MARDOU_LOBBY_INTRO_ROUTE.points.slice(0, -1).reverse().map((point) => new THREE.Vector3(...point)),
        new THREE.Vector3(...MARDOU_ENTRANCE_ROUTE.gallery),
        new THREE.Vector3(...MARDOU_ENTRANCE_ROUTE.threshold),
        new THREE.Vector3(...MARDOU_ENTRANCE_ROUTE.outside),
        destination.clone(),
      ];
      targetPoints = [
        startTarget,
        ...MARDOU_LOBBY_INTRO_ROUTE.targets.slice(0, -1).reverse().map((point) => new THREE.Vector3(...point)),
        ...MARDOU_ENTRANCE_ROUTE.exitTargets.map((point) => new THREE.Vector3(...point)),
      ];
      duration = MARDOU_ENTRANCE_ROUTE.duration;
    }

    if (!roomChanged && switchingBetweenProjects) {
      // All three project cameras sit in the same clear front aisle. Moving
      // directly along that aisle keeps the selected screens facing the lens.
      // Reusing the lobby-to-far-project detour here made 4→5 arc backward
      // and made 5→6 travel left before crossing to the right-hand island.
      positionPoints = [startPosition, destination.clone()];
      positionCurve = silkyCameraCurve(positionPoints);
      duration = THREE.MathUtils.clamp(positionCurve.getLength() * 0.58, 2.6, 3.8);
    } else if (!roomChanged && (enteringSkillsFromProjectThree || leavingSkillsForProjectThree)) {
      const doorwayPoints = [
        MARDOU_PROJECT_SKILLS_DOOR_ROUTE.projectSide,
        MARDOU_PROJECT_SKILLS_DOOR_ROUTE.threshold,
        MARDOU_PROJECT_SKILLS_DOOR_ROUTE.skillsSide,
      ];
      positionPoints = [
        startPosition,
        ...(enteringSkillsFromProjectThree ? doorwayPoints : doorwayPoints.reverse())
          .map((point) => new THREE.Vector3(...point)),
        destination.clone(),
      ];
      positionCurve = silkyCameraCurve(positionPoints);
      duration = THREE.MathUtils.clamp(positionCurve.getLength() * 0.68, 4.2, 6.4);
    } else if (!roomChanged && projectIndex >= 1) {
      positionPoints = [
        startPosition,
        ...MARDOU_FAR_PROJECT_FOCUS_ROUTE.map((point) => new THREE.Vector3(...point)),
        destination.clone(),
      ];
      positionCurve = silkyCameraCurve(positionPoints);
      usesFarProjectRoute = true;
      duration = silkyTransitionDuration(positionCurve.getLength(), true, turnAngle);
      if (projectIndex === 2) duration = Math.max(duration, 7.2);
    } else if (!roomChanged && projectIndex < 0 && previousProjectIndex >= 1) {
      positionPoints = [
        startPosition,
        ...[...MARDOU_FAR_PROJECT_FOCUS_ROUTE].reverse().map((point) => new THREE.Vector3(...point)),
        destination.clone(),
      ];
      positionCurve = silkyCameraCurve(positionPoints);
      usesFarProjectRoute = true;
      duration = silkyTransitionDuration(positionCurve.getLength(), true, turnAngle);
      if (previousProjectIndex === 2) duration = Math.max(duration, 7.2);
    }

    const focusStartDirection = startTarget.clone().sub(startPosition).normalize();
    const focusAttentionOrigin = usesFarProjectRoute
      ? positionCurve?.getPointAt(0.5)
      : undefined;
    const focusAttentionDirection = focusAttentionOrigin
      ? lookAtTarget.clone().sub(focusAttentionOrigin).normalize()
      : undefined;
    // Pull the selected island into the right/left visual third during the
    // traverse without forcing it dead-centre while the camera is still near
    // neighboring screens. The final half gently recentres the chosen screen.
    const focusMidDirection = focusAttentionDirection
      ? focusStartDirection.clone().lerp(
          focusAttentionDirection,
          projectIndex === 2 ? 0.9 : 0.75,
        ).normalize()
      : undefined;
    const focusView = focusTransition && !roomChanged
      ? {
          // Interpolate view directions, not world-space target positions.
          // A world target can pass beside the moving camera on a long lateral
          // route and create a sudden whip-pan even though both endpoint views
          // face forward. Direction interpolation keeps the horizon composed
          // while the body follows the clear aisle.
          fromDirection: focusStartDirection,
          midDirection: focusMidDirection,
          toDirection: lookAtTarget.clone().sub(destination).normalize(),
          fromDistance: Math.max(2.75, startTarget.distanceTo(startPosition)),
          toDistance: Math.max(2.75, lookAtTarget.distanceTo(destination)),
        }
      : undefined;

    const roomTransition = roomChanged || shouldPlayLobbyIntro;
    if (route.current?.roomTransition && !roomTransition) onTransitionStateChange(false);
    route.current = {
      position: positionCurve || silkyCameraCurve(positionPoints),
      target: silkyCameraCurve(targetPoints),
      finalPosition: positionPoints[positionPoints.length - 1].clone(),
      finalTarget: targetPoints[targetPoints.length - 1].clone(),
      duration,
      elapsed: 0,
      fromFov,
      toFov: desiredFov.current,
      preserveFov: returningToPreFocus,
      focusId: exhibit || selectedSurface || authoredFocus ? selectedExhibit : undefined,
      focusView,
      targetUsesControlTiming: roomChanged && (
        activeRoom === "room-private" || previousRoom.current === "room-private"
      ),
      targetUsesUniformControlTiming: roomChanged && (
        activeRoom === "exterior" || previousRoom.current === "exterior"
      ),
      lookForwardAlongRoute: previousRoom.current === "room-lobby" && activeRoom === "room-private",
      roomTransition,
      lobbyIntro: shouldPlayLobbyIntro,
    };
    userAdjustedView.current = returningToPreFocus;
    if (activeRoom === "room-lobby" && !selectedExhibit && !returningToPreFocus) {
      lobbyOverviewMode.current = "default";
      responsiveAspect.current = viewportAspect;
    }
    if (returningToPreFocus) preFocusView.current = null;
    if (roomChanged) preFocusView.current = null;
    if (roomTransition) onTransitionStateChange(true);
    previousRoom.current = activeRoom;
    previousExhibit.current = selectedExhibit;
  }, [activeRoom, camera, destination, lookAt, lookAtTarget, onFocusSettled, onLobbyIntroComplete, onLobbyIntroStart, onTransitionStateChange, sceneReady, selectedExhibit, viewportAspect, world]);

  useEffect(() => () => onTransitionStateChange(false), [onTransitionStateChange]);

  useEffect(() => {
    if (selectedExhibit || !wideAfterSelectionClears.current) return;
    wideAfterSelectionClears.current = false;
    wideAngleRequested.current = true;
  }, [selectedExhibit]);

  useFrame((_, delta) => {
    const cameraAspect = camera instanceof THREE.PerspectiveCamera ? camera.aspect : viewportAspect;
    if (lobbyIntroPending.current) {
      camera.position.set(...MARDOU_LOBBY_INTRO_ROUTE.spawn);
      lookAt.set(...MARDOU_LOBBY_INTRO_ROUTE.lookAt);
      camera.lookAt(lookAt);
      if (camera instanceof THREE.PerspectiveCamera) {
        const introFov = responsiveMuseumFov(MARDOU_LOBBY_FOCUS.fov, camera.aspect);
        if (Math.abs(camera.fov - introFov) > 0.001) {
          camera.fov = introFov;
          camera.updateProjectionMatrix();
        }
      }
      return;
    }

    if (wideAngleRequested.current) {
      const wideFocus = activeRoom === "room-private" ? MARDOU_PRIVATE_WIDE_FOCUS : MARDOU_LOBBY_WIDE_FOCUS;
      destination.set(...(
        activeRoom === "room-lobby"
          ? responsiveMuseumCamera(wideFocus.camera, cameraAspect)
          : wideFocus.camera
      ));
      lookAtTarget.set(...(
        activeRoom === "room-lobby"
          ? responsiveMuseumTarget(wideFocus.target, cameraAspect)
          : wideFocus.target
      ));
      desiredFov.current = wideFocus.fov;
      lobbyOverviewMode.current = activeRoom === "room-lobby" ? "wide" : "default";
      responsiveAspect.current = cameraAspect;
      route.current = {
        position: silkyCameraCurve([camera.position.clone(), destination.clone()]),
        target: silkyCameraCurve([lookAt.clone(), lookAtTarget.clone()]),
        finalPosition: destination.clone(),
        finalTarget: lookAtTarget.clone(),
        duration: silkyTransitionDuration(camera.position.distanceTo(destination), false),
        elapsed: 0,
        fromFov: camera instanceof THREE.PerspectiveCamera ? camera.fov : wideFocus.fov,
        toFov: wideFocus.fov,
      };
      firstPersonYaw.current = 0;
      firstPersonPitch.current = 0;
      keyboardTurnRemaining.current = 0;
      keyboardTurnElapsed.current = 0;
      keyboardTurnHeld.current = 0;
      keyboardTurnQueuedSteps.current = 0;
      userAdjustedView.current = false;
      wideAngleRequested.current = false;
    }

    if (
      !route.current
      && activeRoom === "room-lobby"
      && !selectedExhibit
      && !userAdjustedView.current
      && Math.abs(cameraAspect - responsiveAspect.current) > 0.015
    ) {
      const overview = lobbyOverviewMode.current === "wide"
        ? MARDOU_LOBBY_WIDE_FOCUS
        : MARDOU_LOBBY_FOCUS;
      destination.set(...responsiveMuseumCamera(overview.camera, cameraAspect));
      lookAtTarget.set(...responsiveMuseumTarget(overview.target, cameraAspect));
      desiredFov.current = overview.fov;
      responsiveAspect.current = cameraAspect;
      route.current = {
        position: silkyCameraCurve([camera.position.clone(), destination.clone()]),
        target: silkyCameraCurve([lookAt.clone(), lookAtTarget.clone()]),
        finalPosition: destination.clone(),
        finalTarget: lookAtTarget.clone(),
        duration: responsiveReframeDuration(camera.position.distanceTo(destination)),
        elapsed: 0,
        fromFov: camera instanceof THREE.PerspectiveCamera ? camera.fov : overview.fov,
        toFov: overview.fov,
      };
    }

    if (route.current) {
      const activeRoute = route.current;
      activeRoute.elapsed = Math.min(activeRoute.duration, activeRoute.elapsed + Math.min(delta, 1 / 24));
      const progress = activeRoute.elapsed / activeRoute.duration;
      const eased = silkyCameraEase(progress);
      const completed = progress >= 1;
      if (completed) {
        // CatmullRomCurve3.getPointAt(1) can resolve one index beyond the
        // final control point when its arc-length table contains repeated
        // terminal values. Land on the authored endpoints directly so every
        // route finishes exactly and never throws on its last frame.
        camera.position.copy(activeRoute.finalPosition);
        lookAt.copy(activeRoute.finalTarget);
      } else if (activeRoute.focusView) {
        sampleCameraCurve(activeRoute.position, eased, camera.position);
        const focusMidpoint = 0.5;
        if (activeRoute.focusView.midDirection && progress < focusMidpoint) {
          viewDirection.lerpVectors(
            activeRoute.focusView.fromDirection,
            activeRoute.focusView.midDirection,
            silkyCameraEase(progress / focusMidpoint),
          );
        } else if (activeRoute.focusView.midDirection) {
          viewDirection.lerpVectors(
            activeRoute.focusView.midDirection,
            activeRoute.focusView.toDirection,
            silkyCameraEase((progress - focusMidpoint) / (1 - focusMidpoint)),
          );
        } else {
          viewDirection.lerpVectors(
            activeRoute.focusView.fromDirection,
            activeRoute.focusView.toDirection,
            eased,
          );
        }
        viewDirection.normalize();
        const focusDistance = THREE.MathUtils.lerp(
          activeRoute.focusView.fromDistance,
          activeRoute.focusView.toDistance,
          eased,
        );
        lookAt.copy(camera.position).addScaledVector(viewDirection, focusDistance);
      } else if (activeRoute.lookForwardAlongRoute) {
        sampleCameraCurve(activeRoute.position, eased, camera.position);
        const routeLookAhead = 0.34;
        const forwardProgress = Math.min(1, eased + routeLookAhead);
        sampleCameraCurve(activeRoute.position, forwardProgress, routeAhead);
        // Keep the stair climb level and aligned with the direction of travel.
        // The former authored targets sat several metres beside the stair run,
        // which made the camera climb diagonally while its body moved forward.
        routeAhead.y = camera.position.y;
        viewDirection.copy(routeAhead).sub(camera.position);
        if (viewDirection.lengthSq() < 0.0001) {
          viewDirection.copy(activeRoute.finalTarget).sub(camera.position);
          viewDirection.y = 0;
        }
        viewDirection.normalize();
        const arrivalTurnStart = 0.45;
        const arrivalTurn = THREE.MathUtils.smoothstep(progress, arrivalTurnStart, 1);
        if (arrivalTurn > 0) {
          viewRight.copy(activeRoute.finalTarget).sub(activeRoute.finalPosition).normalize();
          const turnAngle = Math.acos(THREE.MathUtils.clamp(viewDirection.dot(viewRight), -1, 1));
          routeAhead.crossVectors(viewDirection, viewRight);
          if (routeAhead.lengthSq() < 0.0001) routeAhead.copy(camera.up);
          viewDirection.applyAxisAngle(routeAhead.normalize(), turnAngle * arrivalTurn).normalize();
        }
        lookAt.copy(camera.position).addScaledVector(viewDirection, 4);
      } else if (activeRoute.targetUsesUniformControlTiming) {
        sampleCameraCurve(activeRoute.position, eased, camera.position);
        activeRoute.target.getPoint(eased, lookAt);
      } else if (activeRoute.targetUsesControlTiming) {
        // Position is sampled by arc length for constant apparent speed. Map
        // that same travelled distance back to the position curve's control
        // parameter before sampling the paired look curve, so both curves
        // reach the doorway / landing / reveal control points together.
        sampleCameraCurve(activeRoute.position, eased, camera.position);
        const pairedCurveProgress = activeRoute.position.getUtoTmapping(eased, 0);
        if (Number.isFinite(pairedCurveProgress)) {
          activeRoute.target.getPoint(THREE.MathUtils.clamp(pairedCurveProgress, 0, 1), lookAt);
        } else {
          sampleCameraCurve(activeRoute.target, eased, lookAt);
        }
      } else {
        sampleCameraCurve(activeRoute.position, eased, camera.position);
        sampleCameraCurve(activeRoute.target, eased, lookAt);
      }
      camera.lookAt(lookAt);
      if (camera instanceof THREE.PerspectiveCamera) {
        const finalFov = activeRoute.preserveFov
          ? activeRoute.toFov
          : responsiveMuseumFov(activeRoute.toFov, camera.aspect);
        camera.fov = completed
          ? finalFov
          : THREE.MathUtils.lerp(activeRoute.fromFov, finalFov, eased);
        camera.updateProjectionMatrix();
      }
      if (completed) {
        const completedFocusId = activeRoute.focusId;
        const completedRoomTransition = activeRoute.roomTransition;
        const completedLobbyIntro = activeRoute.lobbyIntro;
        route.current = null;
        if (completedRoomTransition) onTransitionStateChange(false);
        if (completedLobbyIntro) onLobbyIntroComplete();
        if (completedFocusId) onFocusSettled(completedFocusId);
      }
      return;
    }

    const walkBounds = FIRST_PERSON_BOUNDS[activeRoom as keyof typeof FIRST_PERSON_BOUNDS];
    if (walkBounds && !selectedExhibit && !pointerLookLocked.current) {
      const frameDelta = Math.min(delta, 0.05);
      firstPersonYaw.current = THREE.MathUtils.euclideanModulo(
        firstPersonYaw.current - pointerLookIntent.current.x * FIRST_PERSON_EDGE_YAW_SPEED * frameDelta + Math.PI,
        Math.PI * 2,
      ) - Math.PI;
      firstPersonPitch.current = THREE.MathUtils.clamp(
        firstPersonPitch.current - pointerLookIntent.current.y * FIRST_PERSON_EDGE_PITCH_SPEED * frameDelta,
        -FIRST_PERSON_MAX_PITCH,
        FIRST_PERSON_MAX_PITCH,
      );
    }
    if (walkBounds && !selectedExhibit && Math.abs(keyboardTurnRemaining.current) > 0.001) {
      const previousProgress = keyboardTurnElapsed.current / FIRST_PERSON_KEY_TURN_DURATION;
      keyboardTurnElapsed.current = Math.min(
        FIRST_PERSON_KEY_TURN_DURATION,
        keyboardTurnElapsed.current + Math.min(delta, 0.05),
      );
      const nextProgress = keyboardTurnElapsed.current / FIRST_PERSON_KEY_TURN_DURATION;
      const easedStep = silkyCameraEase(nextProgress) - silkyCameraEase(previousProgress);
      const yawStep = Math.sign(keyboardTurnRemaining.current)
        * Math.min(Math.abs(keyboardTurnRemaining.current), FIRST_PERSON_KEY_TURN_ANGLE * easedStep);
      firstPersonYaw.current += yawStep;
      keyboardTurnRemaining.current -= yawStep;
      if (keyboardTurnElapsed.current >= FIRST_PERSON_KEY_TURN_DURATION) {
        firstPersonYaw.current += keyboardTurnRemaining.current;
        if (keyboardTurnQueuedSteps.current !== 0) {
          const direction = Math.sign(keyboardTurnQueuedSteps.current);
          keyboardTurnQueuedSteps.current -= direction;
          keyboardTurnRemaining.current = direction * FIRST_PERSON_KEY_TURN_ANGLE;
        } else if (keyboardTurnHeld.current !== 0) {
          keyboardTurnRemaining.current = keyboardTurnHeld.current * FIRST_PERSON_KEY_TURN_ANGLE;
        } else {
          keyboardTurnRemaining.current = 0;
        }
        keyboardTurnElapsed.current = 0;
      }
    }
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
        safeMovement.copy(resolvePlanarMovement(
          destination,
          movement,
          (probeOrigin, probeMovement) => sceneMovementBlocked(
            scene,
            probeOrigin,
            probeMovement,
            FIRST_PERSON_COLLISION_RADIUS,
            movementRaycaster,
          ),
        ));
        const nextX = destination.x + safeMovement.x;
        const nextZ = destination.z + safeMovement.z;
        const insideFloorBounds = nextX >= walkBounds.minX
          && nextX <= walkBounds.maxX
          && nextZ >= walkBounds.minZ
          && nextZ <= walkBounds.maxZ;

        if (insideFloorBounds && safeMovement.lengthSq() > 0) {
          destination.add(safeMovement);
          lookAtTarget.add(safeMovement);
          mouseLookTarget.add(safeMovement);
          lookAt.add(safeMovement);
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

    viewDirection.applyAxisAngle(camera.up, firstPersonYaw.current);
    viewRight.crossVectors(viewDirection, camera.up).normalize();
    viewDirection.applyAxisAngle(viewRight, firstPersonPitch.current).normalize();
    mouseLookTarget.copy(camera.position).addScaledVector(viewDirection, lookDistance);

    lookAt.lerp(mouseLookTarget, targetAlpha);
    camera.lookAt(lookAt);
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = THREE.MathUtils.lerp(
        camera.fov,
        responsiveMuseumFov(desiredFov.current, camera.aspect),
        targetAlpha,
      );
      camera.updateProjectionMatrix();
    }
  });
  return null;
}

type MardouDoorConfig = typeof MARDOU_AUTO_DOOR | typeof MARDOU_INNER_GALLERY_DOOR | typeof MARDOU_SIDE_ENTRANCE_DOOR;

function AutoOpeningMuseumDoor({ interactive, door }: { interactive: boolean; door: MardouDoorConfig }) {
  const { camera } = useThree();
  const leftLeaf = useRef<THREE.Group>(null);
  const rightLeaf = useRef<THREE.Group>(null);
  const proximityOpen = useRef(false);
  const [nearby, setNearby] = useState(false);
  const [latchedOpen, setLatchedOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const sensor = useMemo(
    () => new THREE.Vector3(
      door.position[0],
      door.position[1] + door.height * 0.5,
      door.position[2],
    ),
    [door],
  );
  const open = interactive && (nearby || latchedOpen);
  const leafWidth = (door.width - 0.06) / 2;

  useFrame((_, delta) => {
    const distance = camera.position.distanceTo(sensor);
    const shouldOpenForProximity = interactive && (
      proximityOpen.current
        ? distance < door.releaseRadius
        : distance < door.sensorRadius
    );
    if (shouldOpenForProximity !== proximityOpen.current) {
      proximityOpen.current = shouldOpenForProximity;
      setNearby(shouldOpenForProximity);
    }
    if (leftLeaf.current) {
      leftLeaf.current.rotation.y = THREE.MathUtils.damp(
        leftLeaf.current.rotation.y,
        open ? 1.48 * door.swingDirection : 0,
        7,
        delta,
      );
    }
    if (rightLeaf.current) {
      rightLeaf.current.rotation.y = THREE.MathUtils.damp(
        rightLeaf.current.rotation.y,
        open ? -1.48 * door.swingDirection : 0,
        7,
        delta,
      );
    }
  });

  function toggleDoor(event: THREE.Event & { stopPropagation: () => void }) {
    event.stopPropagation();
    setLatchedOpen((value) => !value);
  }

  const leafMaterial = (
    <meshStandardMaterial
      color={hovered ? "#bfe4eb" : "#d5e8ea"}
      emissive={hovered ? TEAL : INK}
      emissiveIntensity={hovered ? 0.16 : 0}
      metalness={0.2}
      roughness={0.24}
      transparent
      opacity={0.62}
    />
  );

  return (
    <group
      position={[
        door.position[0] + door.normal[0] * 0.06,
        door.position[1],
        door.position[2] + door.normal[2] * 0.06,
      ]}
      rotation={door.rotation}
      onClick={toggleDoor}
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
      <mesh castShadow position={[-door.width / 2 - 0.045, door.height / 2, 0]}>
        <boxGeometry args={[0.09, door.height + 0.14, 0.11]} />
        <meshStandardMaterial color="#25282a" metalness={0.55} roughness={0.38} />
      </mesh>
      <mesh castShadow position={[door.width / 2 + 0.045, door.height / 2, 0]}>
        <boxGeometry args={[0.09, door.height + 0.14, 0.11]} />
        <meshStandardMaterial color="#25282a" metalness={0.55} roughness={0.38} />
      </mesh>
      <mesh castShadow position={[0, door.height + 0.045, 0]}>
        <boxGeometry args={[door.width + 0.18, 0.09, 0.11]} />
        <meshStandardMaterial color="#25282a" metalness={0.55} roughness={0.38} />
      </mesh>

      <group ref={leftLeaf} position={[-door.width / 2, 0, 0.015]}>
        <group position={[leafWidth / 2, door.height / 2, 0]}>
          <mesh castShadow userData={{ ignoreCameraCollision: open }}>
            <boxGeometry args={[leafWidth, door.height, 0.055]} />
            {leafMaterial}
          </mesh>
          <mesh position={[0, 0, 0.035]} userData={{ ignoreCameraCollision: true }}>
            <boxGeometry args={[0.035, door.height, 0.025]} />
            <meshStandardMaterial color="#303537" metalness={0.6} roughness={0.32} />
          </mesh>
          <mesh position={[leafWidth * 0.38, 0, 0.052]} userData={{ ignoreCameraCollision: true }}>
            <boxGeometry args={[0.035, 0.34, 0.035]} />
            <meshStandardMaterial color="#ba9b62" metalness={0.75} roughness={0.25} />
          </mesh>
        </group>
      </group>

      <group ref={rightLeaf} position={[door.width / 2, 0, 0.015]}>
        <group position={[-leafWidth / 2, door.height / 2, 0]}>
          <mesh castShadow userData={{ ignoreCameraCollision: open }}>
            <boxGeometry args={[leafWidth, door.height, 0.055]} />
            {leafMaterial}
          </mesh>
          <mesh position={[0, 0, 0.035]} userData={{ ignoreCameraCollision: true }}>
            <boxGeometry args={[0.035, door.height, 0.025]} />
            <meshStandardMaterial color="#303537" metalness={0.6} roughness={0.32} />
          </mesh>
          <mesh position={[-leafWidth * 0.38, 0, 0.052]} userData={{ ignoreCameraCollision: true }}>
            <boxGeometry args={[0.035, 0.34, 0.035]} />
            <meshStandardMaterial color="#ba9b62" metalness={0.75} roughness={0.25} />
          </mesh>
        </group>
      </group>
    </group>
  );
}

const LOBBY_STAIR_PROXIMITY_POINT = new THREE.Vector3(1.35, 1.5, -8.753);
const PRIVATE_STAIR_PROXIMITY_POINT = new THREE.Vector3(3.25, 4.48, -8.753);
const LOBBY_STAIR_PROXIMITY_RADIUS = 3.15;
const PRIVATE_STAIR_PROXIMITY_RADIUS = 3.65;

function StairProximityReporter({ activeRoom, onChange }: {
  activeRoom: string;
  onChange: (nearby: boolean) => void;
}) {
  const { camera } = useThree();
  const previous = useRef(false);
  useFrame(() => {
    const proximityPoint = activeRoom === "room-private"
      ? PRIVATE_STAIR_PROXIMITY_POINT
      : LOBBY_STAIR_PROXIMITY_POINT;
    const proximityRadius = activeRoom === "room-private"
      ? PRIVATE_STAIR_PROXIMITY_RADIUS
      : LOBBY_STAIR_PROXIMITY_RADIUS;
    const nearby = (activeRoom === "room-lobby" || activeRoom === "room-private")
      && camera.position.distanceTo(proximityPoint) <= proximityRadius;
    if (nearby === previous.current) return;
    previous.current = nearby;
    onChange(nearby);
  });
  return null;
}

function StairwayNavigation({ activeRoom, interactive, nearby, onNavigate }: {
  activeRoom: string;
  interactive: boolean;
  nearby: boolean;
  onNavigate: () => void;
}) {
  const [hoveredStep, setHoveredStep] = useState<number | null>(null);
  const label = activeRoom === "room-private" ? "点击下楼" : "点击上楼";
  const signTexture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 768;
    canvas.height = 224;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "rgba(11, 18, 23, .58)";
    context.beginPath();
    traceRoundedRect(context, 8, 8, 752, 208, 30);
    context.fill();
    context.strokeStyle = "rgba(161, 229, 216, .78)";
    context.lineWidth = 4;
    context.stroke();
    context.fillStyle = "rgba(255, 255, 255, .78)";
    context.font = "500 34px Arial";
    context.textAlign = "center";
    context.fillText("STAIR / FLOOR NAVIGATION", 384, 68);
    context.fillStyle = "#ffffff";
    context.font = "700 64px Arial";
    context.fillText(label, 384, 151);
    context.fillStyle = "#65d7c3";
    context.font = "700 34px Arial";
    context.fillText(activeRoom === "room-private" ? "↓" : "↑", 384, 194);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
  }, [activeRoom, label]);

  useEffect(() => () => signTexture.dispose(), [signTexture]);
  if (!interactive) return null;
  return <group name="stairway-click-surfaces">
    {nearby ? <sprite
      position={[1, 4.3, -8.68]}
      scale={[1.45, .43, 1]}
      renderOrder={30}
      userData={{ ignoreCameraCollision: true, stairNavigationSign: true }}
      onClick={(event) => {
        event.stopPropagation();
        onNavigate();
      }}
      onPointerOver={(event) => {
        event.stopPropagation();
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        document.body.style.cursor = "default";
      }}
    >
      <spriteMaterial map={signTexture} transparent depthTest={false} depthWrite={false} toneMapped={false} />
    </sprite> : null}
    {MARDOU_STAIR_CLICK_TARGETS.map((target, index) => (
      <mesh
        key={index}
        position={target.position}
        userData={{ ignoreCameraCollision: true, stairClickSurface: true }}
        onClick={(event) => {
          event.stopPropagation();
          onNavigate();
        }}
        onPointerOver={(event) => {
          event.stopPropagation();
          setHoveredStep(index);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          setHoveredStep(null);
          document.body.style.cursor = "default";
        }}
      >
        <boxGeometry args={target.size} />
        <meshBasicMaterial color="#65d7c3" transparent opacity={hoveredStep === index ? 0.14 : 0} depthWrite={false} toneMapped={false} />
      </mesh>
    ))}
  </group>;
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

function prepareImportedAsset(
  source: THREE.Object3D,
  targetSize: Vec3,
  anchor: "bottom" | "center",
  anchorY: number,
) {
  const model = source.clone(true);
  const materials = new Set<THREE.Material>();
  model.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.castShadow = true;
    object.receiveShadow = true;
    object.material = Array.isArray(object.material)
      ? object.material.map((material) => material.clone())
      : object.material.clone();
    const meshMaterials = Array.isArray(object.material) ? object.material : [object.material];
    meshMaterials.forEach((material) => materials.add(material));
  });

  model.updateWorldMatrix(true, true);
  const bounds = new THREE.Box3().setFromObject(model);
  if (!bounds.isEmpty()) {
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const scale = Math.min(
      targetSize[0] / Math.max(size.x, 0.001),
      targetSize[1] / Math.max(size.y, 0.001),
      targetSize[2] / Math.max(size.z, 0.001),
    );
    model.scale.multiplyScalar(scale);
    model.position.set(
      -center.x * scale,
      anchor === "center" ? anchorY - center.y * scale : anchorY - bounds.min.y * scale,
      -center.z * scale,
    );
  }
  return { model, materials };
}

function ImportedGltfAsset({
  url,
  targetSize,
  anchor = "bottom",
  anchorY = 0,
}: {
  url: string;
  targetSize: Vec3;
  anchor?: "bottom" | "center";
  anchorY?: number;
}) {
  const gltf = useLoader(SceneGltfLoader, url) as GLTF;
  const prepared = useMemo(
    () => prepareImportedAsset(gltf.scene, targetSize, anchor, anchorY),
    [anchor, anchorY, gltf.scene, targetSize],
  );
  useEffect(() => () => {
    prepared.materials.forEach((material) => material.dispose());
  }, [prepared]);
  return <primitive object={prepared.model} />;
}

function LoadedSkillsBookcase() {
  return (
    <ImportedGltfAsset
      url={SKILLS_BOOKCASE_URL}
      targetSize={SKILLS_BOOKCASE_SIZE}
      anchorY={INFORMATION_OBJECT_FLOOR_OFFSET}
    />
  );
}

function WallCouch() {
  return (
    <group
      name="wall-couch"
      position={MARDOU_COUCH_PLACEMENT.position}
      rotation={MARDOU_COUCH_PLACEMENT.rotation}
    >
      <OptionalAssetBoundary>
        <Suspense fallback={null}>
          <ImportedGltfAsset url={DAMAGED_COUCH_URL} targetSize={DAMAGED_COUCH_SIZE} />
        </Suspense>
      </OptionalAssetBoundary>
    </group>
  );
}

function PetBed({ companionName }: { companionName: string }) {
  return (
    <group
      name="pet-bed"
      position={MARDOU_PET_BED_PLACEMENT.position}
      rotation={MARDOU_PET_BED_PLACEMENT.rotation}
    >
      <OptionalAssetBoundary>
        <Suspense fallback={null}>
          <ImportedGltfAsset url={PET_BED_URL} targetSize={PET_BED_SIZE} />
        </Suspense>
      </OptionalAssetBoundary>
      <TextPanel
        title={companionName}
        subtitle="ROOM COMPANION"
        position={[0, 0.42, 0.58]}
        width={0.92}
        height={0.22}
      />
    </group>
  );
}

function EntranceCartoonStatue() {
  return (
    <group
      name="entrance-cartoon-statue"
      position={MARDOU_CARTOON_STATUE_PLACEMENT.position}
      rotation={MARDOU_CARTOON_STATUE_PLACEMENT.rotation}
    >
      <OptionalAssetBoundary>
        <Suspense fallback={null}>
          <ImportedGltfAsset url={CARTOON_STATUE_URL} targetSize={CARTOON_STATUE_SIZE} />
        </Suspense>
      </OptionalAssetBoundary>
    </group>
  );
}

function SkillsBookcaseFallback() {
  return (
    <mesh castShadow receiveShadow position={[0, -0.29, 0]}>
      <boxGeometry args={[1.35, 2.2, 0.62]} />
      <meshStandardMaterial color="#4d3526" roughness={0.78} />
    </mesh>
  );
}

function InformationObjectGeometry({
  semanticRole,
  texture,
  accent,
  portraitUrl,
  privatePedestal = false,
}: {
  semanticRole?: DisplaySurfacePlan["semanticRole"];
  texture: THREE.Texture;
  accent: string;
  portraitUrl?: string;
  privatePedestal?: boolean;
}) {
  const role = semanticRole || "experience";
  const roundBase = (
    <mesh castShadow receiveShadow position={[0, -1.31, 0]} scale={[1, 1, 0.62]}>
      <cylinderGeometry args={[0.58, 0.66, 0.18, 18]} />
      <meshStandardMaterial color={DARK_WOOD} roughness={0.68} metalness={0.12} />
    </mesh>
  );

  if (privatePedestal) {
    return (
      <group name="private-information-column-display">
        <OptionalAssetBoundary>
          <Suspense fallback={roundBase}>
            <ImportedGltfAsset
              url={PRIVATE_INFO_COLUMN_URL}
              targetSize={PRIVATE_INFO_COLUMN_SIZE}
              anchorY={INFORMATION_OBJECT_FLOOR_OFFSET}
            />
          </Suspense>
        </OptionalAssetBoundary>
        <mesh castShadow position={[0, 0.62, -0.035]}>
          <boxGeometry args={[1.34, 0.78, 0.09]} />
          <meshStandardMaterial color={DARK_WOOD} roughness={0.52} metalness={0.12} />
        </mesh>
        <MuseumObjectLabel texture={texture} accent={accent} position={[0, 0.62, 0.02]} width={1.22} height={0.66} />
      </group>
    );
  }

  if (role === "profile") {
    return (
      <group>
        <mesh castShadow position={[0, 0, 0.055]}>
          <boxGeometry args={[1.26, 1.58, 0.1]} />
          <meshStandardMaterial color={DARK_WOOD} roughness={0.54} metalness={0.12} />
        </mesh>
        {portraitUrl ? (
          <TextureAssetBoundary fallback={null} resetKey={portraitUrl}>
            <Suspense fallback={null}>
              <LoadedProfilePortrait url={portraitUrl} position={[0, 0.2, 0.115]} stylized />
            </Suspense>
          </TextureAssetBoundary>
        ) : (
          <group>
            <mesh castShadow position={[0, 0.02, 0.12]}>
              <capsuleGeometry args={[0.27, 0.32, 5, 10]} />
              <meshStandardMaterial color={accent} roughness={0.7} />
            </mesh>
            <mesh castShadow position={[0, 0.48, 0.12]}>
              <icosahedronGeometry args={[0.28, 1]} />
              <meshStandardMaterial color="#d4a07e" roughness={0.78} />
            </mesh>
          </group>
        )}
        <MuseumObjectLabel texture={texture} accent={accent} position={[0, -0.56, 0.13]} width={1.08} height={0.32} />
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
        <OptionalAssetBoundary>
          <Suspense fallback={<SkillsBookcaseFallback />}>
            <LoadedSkillsBookcase />
          </Suspense>
        </OptionalAssetBoundary>
        <MuseumObjectLabel texture={texture} accent={accent} position={[0, 0.95, 0.12]} width={1.24} height={0.34} />
      </group>
    );
  }

  if (role === "achievement") {
    return (
      <group name="achievement-trophy">
        <mesh castShadow receiveShadow position={[0, -1.31, 0]}>
          <cylinderGeometry args={[0.62, 0.7, 0.18, 24]} />
          <meshStandardMaterial color={DARK_WOOD} roughness={0.66} metalness={0.12} />
        </mesh>
        <mesh castShadow position={[0, -1.13, 0]}>
          <boxGeometry args={[0.76, 0.2, 0.58]} />
          <meshStandardMaterial color="#3d2b25" roughness={0.6} metalness={0.16} />
        </mesh>
        <mesh castShadow position={[0, -0.92, 0]}>
          <cylinderGeometry args={[0.11, 0.16, 0.36, 16]} />
          <meshStandardMaterial color="#d8aa42" roughness={0.24} metalness={0.82} />
        </mesh>
        <mesh castShadow position={[0, -0.47, 0]}>
          <cylinderGeometry args={[0.3, 0.18, 0.58, 24, 1, true]} />
          <meshStandardMaterial color="#e0b84f" roughness={0.2} metalness={0.88} side={THREE.DoubleSide} />
        </mesh>
        <mesh position={[0, -0.17, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.29, 0.045, 10, 32]} />
          <meshStandardMaterial color="#f0cc69" roughness={0.18} metalness={0.9} />
        </mesh>
        {[-1, 1].map((side) => (
          <mesh key={side} castShadow position={[side * 0.39, -0.49, 0]} rotation={[0, 0, side * 0.08]}>
            <torusGeometry args={[0.21, 0.045, 9, 24, Math.PI * 1.55]} />
            <meshStandardMaterial color="#d8aa42" roughness={0.22} metalness={0.86} />
          </mesh>
        ))}
        <MuseumObjectLabel texture={texture} accent={accent} position={[0, -1.1, 0.31]} width={0.68} height={0.25} />
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
  privatePedestal = false,
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
  privatePedestal?: boolean;
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
      <InformationObjectGeometry
        semanticRole={semanticRole}
        texture={texture}
        accent={accent}
        portraitUrl={portraitUrl}
        privatePedestal={privatePedestal}
      />
      <mesh position={semanticRole === "profile" ? [0, 0, 0.14] : [0, -0.35, 0]}>
        {semanticRole === "profile"
          ? <boxGeometry args={[1.42, 1.78, 0.34]} />
          : <cylinderGeometry args={[0.82, 0.82, 2.15, 18]} />}
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

function LoadedPrivateFrameImage({ url }: { url: string }) {
  const mediaUrl = sceneMediaUrl(url);
  const sourceTexture = useLoader(SceneTextureLoader, mediaUrl);
  const { displayTexture, displaySize } = useMemo(() => {
    const texture = sourceTexture.clone();
    const image = sourceTexture.image as { width?: number; height?: number } | undefined;
    const sourceAspect = image?.width && image?.height ? image.width / image.height : 0.59;
    const frameAspect = 0.59;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.anisotropy = 4;
    texture.needsUpdate = true;
    return {
      displayTexture: texture,
      displaySize: sourceAspect >= frameAspect
        ? [1.02, 1.02 / sourceAspect] as const
        : [1.72 * sourceAspect, 1.72] as const,
    };
  }, [sourceTexture]);

  useEffect(() => retainSceneMediaTexture(mediaUrl, sourceTexture, (cacheKey) => {
    useLoader.clear(SceneTextureLoader, cacheKey);
  }), [mediaUrl, sourceTexture]);
  useEffect(() => () => displayTexture.dispose(), [displayTexture]);
  return <mesh position={[0, 0, 0.071]}>
    <planeGeometry args={displaySize} />
    <meshBasicMaterial map={displayTexture} toneMapped={false} />
  </mesh>;
}

function PrivateFrameFallback() {
  return <mesh castShadow>
    <boxGeometry args={[1.22, 2, 0.1]} />
    <meshStandardMaterial color={DARK_WOOD} roughness={0.52} metalness={0.12} />
  </mesh>;
}

function PrivatePictureFrame({
  slot,
  position,
  rotation,
  imageUrl,
  interactive,
  selected,
  onSelect,
}: {
  slot: MardouPrivateFrameSlot;
  position: Vec3;
  rotation: Vec3;
  imageUrl?: string;
  interactive: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const group = useRef<THREE.Group>(null);
  useFrame(() => {
    if (!group.current) return;
    const target = selected ? 1.035 : hovered ? 1.018 : 1;
    group.current.scale.setScalar(THREE.MathUtils.lerp(group.current.scale.x, target, 0.14));
  });
  return <group
    ref={group}
    name={slot}
    position={position}
    rotation={rotation}
    onClick={interactive ? (event) => { event.stopPropagation(); onSelect(); } : undefined}
    onPointerOver={interactive ? (event) => { event.stopPropagation(); setHovered(true); document.body.style.cursor = "pointer"; } : undefined}
    onPointerOut={interactive ? () => { setHovered(false); document.body.style.cursor = "default"; } : undefined}
  >
    <OptionalAssetBoundary fallback={<PrivateFrameFallback />}>
      <Suspense fallback={<PrivateFrameFallback />}>
        <ImportedGltfAsset url={BLANK_ART_FRAME_URL} targetSize={PRIVATE_FRAME_SIZE} anchor="center" />
      </Suspense>
    </OptionalAssetBoundary>
    <mesh position={[0, 0, 0.061]}>
      <planeGeometry args={[1.02, 1.72]} />
      <meshBasicMaterial color="#ffffff" toneMapped={false} />
    </mesh>
    {imageUrl ? (
      <TextureAssetBoundary fallback={null} resetKey={imageUrl}>
        <Suspense fallback={null}><LoadedPrivateFrameImage url={imageUrl} /></Suspense>
      </TextureAssetBoundary>
    ) : null}
    <mesh position={[0, 0, 0.02]}>
      <boxGeometry args={[1.28, 2.06, 0.18]} />
      <meshBasicMaterial color={selected ? CORAL : hovered ? TEAL : "#ffffff"} transparent opacity={0.001} depthWrite={false} toneMapped={false} />
    </mesh>
  </group>;
}

function PrivatePictureFrames({
  images,
  activeRoom,
  selectedId,
  onSelect,
}: {
  images: Partial<Record<MardouPrivateFrameSlot, string>>;
  activeRoom: string;
  selectedId?: string;
  onSelect: (id: string) => void;
}) {
  return <group name="private-upload-picture-frames">
    {MARDOU_PRIVATE_PICTURE_FRAMES.map((frame) => (
      <PrivatePictureFrame
        key={frame.slot}
        slot={frame.slot}
        position={frame.position}
        rotation={frame.rotation}
        imageUrl={images[frame.slot]}
        interactive={activeRoom !== "exterior"}
        selected={selectedId === frame.slot}
        onSelect={() => onSelect(frame.slot)}
      />
    ))}
  </group>;
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

function CreativeSubjectCorner({ subjects, placement }: { subjects: CreativeSubject[]; placement?: MuseumPlacement }) {
  const person = findRenderableCreativeSubject(subjects, "person");
  const rug = useRugTextures(undefined, 1.35);
  if (!person || !placement) return null;
  const disclosure = buildCreativeSubjectSceneDisclosure(person);
  const floorPosition: Vec3 = [
    placement.position[0],
    placement.position[1] - 1.39,
    placement.position[2],
  ];
  return (
    <group position={floorPosition} rotation={placement.rotation}>
      <mesh receiveShadow position={[0.15, 0.015, 0.05]} rotation={[-Math.PI / 2, 0, 0]} scale={[1.25, 0.88, 1]}>
        <circleGeometry args={[1.55, 32]} />
        <meshStandardMaterial map={rug.map} bumpMap={rug.bumpMap} bumpScale={0.035} color="#a88978" roughness={0.96} />
      </mesh>
      <group position={[-0.35, 0, 0]}><CreativePersonFigure subject={person} /></group>
      <LowPolyPlant position={[-1.25, 0, 0.35]} scale={0.58} />
      <TextPanel title="人物角" subtitle={disclosure.title} position={[0.15, 0.16, 1.12]} rotation={[-0.92, 0, 0]} width={1.42} height={0.3} />
    </group>
  );
}

function LivingInformationWall({ world, activeRoom, selectedId, onSelect }: { world: WorldPlan; activeRoom: string; selectedId?: string; onSelect: (id: string) => void }) {
  const portraitUrl = world.profile.media.find((media) => media.category === "profile-photo")?.url;
  return (
    <group>
      {world.displaySurfaces.map((surface, index) => {
        const authoredLayout = surface.layout || fallbackSurfaceLayout(surface, index);
        const pickedPlacement = surfacePlacementFor(world, surface);
        const surfaceRoom = isLobbySurface(surface) ? "room-lobby" : "room-private";
        // The five authored upper-floor slots are content-driven. Never fall
        // back to a legacy coordinate or render an empty/overflow pedestal.
        if (surfaceRoom === "room-private" && !pickedPlacement) return null;
        const layout = pickedPlacement
          ? { ...authoredLayout, position: pickedPlacement.position, rotation: pickedPlacement.rotation }
          : authoredLayout;
        const details = detailLinesForSurface(world, surface);
        return (
          <InformationFrame
            key={surface.id}
            kicker={surface.kicker || `SHOWROOM ${String(index + 1).padStart(2, "0")}`}
            title={displayStandTitle(surface.title || surface.id)}
            body={bodyForSurface(world, surface)}
            accent={surface.accent || TEAL}
            variant={layout.variant}
            details={details}
            portraitUrl={surface.semanticRole === "profile" ? portraitUrl : undefined}
            semanticRole={surface.semanticRole}
            privatePedestal={surfaceRoom === "room-private"}
            position={layout.position}
            rotation={layout.rotation}
            width={layout.width}
            height={layout.height}
            footer={surface.presentationMode === "paged" ? `显示 ${surface.pageSize || details.length} / ${surface.sourceItemIds.length} · 点击查看全部` : "RESUME-SOURCED INFORMATION"}
            interactive={activeRoom === surfaceRoom}
            selected={selectedId === surface.id}
            onSelect={() => onSelect(surface.id)}
          />
        );
      })}
      <pointLight position={[0, 3, -19.4]} intensity={activeRoom === "room-lobby" ? 14 : 0} distance={13} decay={2} color="#ffe3bd" />
    </group>
  );
}

function ShowroomDetails({ lit }: { lit: boolean }) {
  return <group>
    <pointLight position={[-2, 3.2, -12]} intensity={lit ? 7 : 0} distance={12} decay={2} color="#ffe2b2" />
    <pointLight position={[1, 5.4, -19]} intensity={lit ? 3 : 0} distance={9} decay={2} color="#9fc6b8" />
  </group>;
}

function GuestbookMessageTicker({ messages, selected }: { messages: string[]; selected: boolean }) {
  const lastDraw = useRef(-1);
  // Derive ticker lanes only when the message list changes instead of on every 24fps redraw.
  const tickerLanes = useMemo(() => {
    const sourceMessages = messages.length
      ? messages.slice(-10).map((message) => message.length > 30 ? `${message.slice(0, 30)}…` : message)
      : ["还没有留言，点击这里写下第一句吧"];
    const lanes = [
      sourceMessages.filter((_, index) => index % 2 === 0),
      sourceMessages.filter((_, index) => index % 2 === 1),
    ];
    if (!lanes[1].length) lanes[1] = [...lanes[0]];
    return lanes;
  }, [messages]);
  const tickerLanesRef = useRef(tickerLanes);
  useEffect(() => {
    tickerLanesRef.current = tickerLanes;
  }, [tickerLanes]);
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 560;
    const result = new THREE.CanvasTexture(canvas);
    result.colorSpace = THREE.SRGBColorSpace;
    result.anisotropy = 8;
    return result;
  }, []);

  useFrame((state) => {
    const elapsed = state.clock.elapsedTime;
    if (elapsed - lastDraw.current < 1 / 24) return;
    lastDraw.current = elapsed;
    const canvas = texture.image as HTMLCanvasElement;
    const context = canvas.getContext("2d")!;
    const width = canvas.width;
    const height = canvas.height;
    context.clearRect(0, 0, width, height);

    const background = context.createLinearGradient(0, 0, width, height);
    background.addColorStop(0, "rgba(16, 20, 27, .96)");
    background.addColorStop(0.55, "rgba(31, 37, 48, .94)");
    background.addColorStop(1, "rgba(14, 25, 28, .96)");
    context.fillStyle = background;
    context.fillRect(0, 0, width, height);

    const accent = selected ? "#ff9b72" : "#72dccb";
    context.fillStyle = accent;
    context.fillRect(0, 0, 12, height);
    context.font = "600 24px Arial, sans-serif";
    context.fillStyle = "rgba(255,255,255,.58)";
    context.fillText(`VISITOR WALL  ·  ${messages.length} NOTES`, 54, 56);
    context.font = "700 54px Arial, sans-serif";
    context.fillStyle = "#fff8eb";
    context.fillText("在展厅留句话", 52, 122);
    context.font = "500 23px Arial, sans-serif";
    context.fillStyle = "rgba(255,255,255,.62)";
    context.fillText("留言将在框内缓慢流动", 54, 160);

    context.beginPath();
    traceRoundedRect(context, 774, 72, 198, 64, 32);
    context.fillStyle = selected ? "rgba(255,155,114,.24)" : "rgba(114,220,203,.18)";
    context.fill();
    context.strokeStyle = accent;
    context.lineWidth = 2;
    context.stroke();
    context.font = "600 25px Arial, sans-serif";
    context.fillStyle = "#ffffff";
    context.textAlign = "center";
    context.fillText("点击留言  +", 873, 113);
    context.textAlign = "left";

    const lanes = tickerLanesRef.current;

    context.save();
    context.beginPath();
    context.rect(42, 190, 940, 326);
    context.clip();
    lanes.forEach((lane, laneIndex) => {
      context.font = "500 31px Arial, sans-serif";
      const itemWidths = lane.map((message) => Math.min(590, Math.max(260, context.measureText(message).width + 92)));
      const gap = 28;
      const cycleWidth = itemWidths.reduce((sum, itemWidth) => sum + itemWidth + gap, 0);
      const direction = laneIndex === 0 ? 1 : -1;
      const speed = laneIndex === 0 ? 38 : 30;
      const shift = (elapsed * speed) % cycleWidth;
      let x = direction > 0 ? -shift - cycleWidth : shift - cycleWidth;
      const y = laneIndex === 0 ? 222 : 372;
      let sequenceIndex = 0;
      while (x < width + cycleWidth) {
        const itemIndex = sequenceIndex % lane.length;
        const message = lane[itemIndex];
        const itemWidth = itemWidths[itemIndex];
        const drawX = direction > 0 ? x : width - x - itemWidth;
        context.beginPath();
        traceRoundedRect(context, drawX, y, itemWidth, 106, 28);
        context.fillStyle = "rgba(255,255,255,.075)";
        context.fill();
        context.strokeStyle = `${GUESTBOOK_LANE_COLORS[(itemIndex + laneIndex * 2) % GUESTBOOK_LANE_COLORS.length]}aa`;
        context.lineWidth = 2;
        context.stroke();
        context.beginPath();
        context.arc(drawX + 34, y + 53, 7, 0, Math.PI * 2);
        context.fillStyle = GUESTBOOK_LANE_COLORS[(itemIndex + laneIndex * 2) % GUESTBOOK_LANE_COLORS.length];
        context.fill();
        context.fillStyle = "rgba(255,255,255,.9)";
        context.textBaseline = "middle";
        context.fillText(message, drawX + 58, y + 53, itemWidth - 80);
        x += itemWidth + gap;
        sequenceIndex += 1;
      }
    });
    context.restore();
    texture.needsUpdate = true;
  });

  useEffect(() => () => texture.dispose(), [texture]);
  return <mesh position={[0, 0, 0.025]} renderOrder={21} userData={{ ignoreCameraCollision: true, guestbookTicker: true }}>
    <planeGeometry args={[3.02, 1.7]} />
    <meshBasicMaterial map={texture} transparent depthWrite={false} toneMapped={false} side={THREE.DoubleSide} />
  </mesh>;
}

function GuestbookWallFrame({ messages, interactive, selected, onSelect }: {
  messages: string[];
  interactive: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const frame = useRef<THREE.Group>(null);
  const borderMaterials = useRef<THREE.MeshStandardMaterial[]>([]);
  const animatedColor = useRef(new THREE.Color());
  useFrame((state) => {
    // Collect border materials once; the border meshes never change after mount.
    if (!borderMaterials.current.length && frame.current) {
      frame.current.traverse((object) => {
        if (object instanceof THREE.Mesh && object.userData.animatedGuestbookBorder) {
          borderMaterials.current.push(object.material as THREE.MeshStandardMaterial);
        }
      });
    }
    const color = animatedColor.current.setHSL((state.clock.elapsedTime * 0.12) % 1, 0.82, 0.62);
    const emissiveIntensity = selected ? 0.9 : 0.48 + Math.sin(state.clock.elapsedTime * 3) * 0.16;
    for (const material of borderMaterials.current) {
      material.color.copy(color);
      material.emissive.copy(color);
      material.emissiveIntensity = emissiveIntensity;
    }
  });
  return <group
    ref={frame}
    name="guestbook-wall-frame"
    position={MARDOU_GUESTBOOK_WALL_PLACEMENT.position}
    rotation={MARDOU_GUESTBOOK_WALL_PLACEMENT.rotation}
    onClick={interactive ? (event) => { event.stopPropagation(); onSelect(); } : undefined}
    onPointerOver={interactive ? (event) => { event.stopPropagation(); document.body.style.cursor = "pointer"; } : undefined}
    onPointerOut={interactive ? () => { document.body.style.cursor = "default"; } : undefined}
  >
    <GuestbookMessageTicker messages={messages} selected={selected} />
    {GUESTBOOK_BORDER_SEGMENTS.map((border, index) => <mesh key={index} position={border.position} userData={{ animatedGuestbookBorder: true, ignoreCameraCollision: true }}>
      <boxGeometry args={border.size} />
      <meshStandardMaterial color="#6fd6c9" emissive="#6fd6c9" emissiveIntensity={0.5} roughness={0.28} metalness={0.3} />
    </mesh>)}
    <mesh position={[0, 0, 0.06]} userData={{ ignoreCameraCollision: true, guestbookWallHitTarget: true }}>
      <planeGeometry args={[3.4, 2.1]} />
      <meshBasicMaterial color="#ffffff" transparent opacity={0.001} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  </group>;
}

function BedroomDiary({ interactive, selected, onSelect }: { interactive: boolean; selected: boolean; onSelect: () => void }) {
  return (
    <group
      position={MARDOU_DIARY_POSITION}
      rotation={MARDOU_DIARY_ROTATION}
      onClick={interactive ? (event) => { event.stopPropagation(); onSelect(); } : undefined}
      onPointerOver={interactive ? (event) => { event.stopPropagation(); document.body.style.cursor = "pointer"; } : undefined}
      onPointerOut={interactive ? () => { document.body.style.cursor = "default"; } : undefined}
    >
      <group name="private-diary-column-and-book">
        <OptionalAssetBoundary>
          <Suspense fallback={null}>
            <ImportedGltfAsset url={PRIVATE_DIARY_COLUMN_URL} targetSize={PRIVATE_DIARY_COLUMN_SIZE} />
          </Suspense>
        </OptionalAssetBoundary>
        <group position={[0, 0, 0]} rotation={[0, -0.08, 0]}>
          <OptionalAssetBoundary>
            <Suspense fallback={null}>
              <ImportedGltfAsset
                url={PRIVATE_DIARY_BOOK_URL}
                targetSize={PRIVATE_DIARY_BOOK_SIZE}
                anchorY={PRIVATE_DIARY_COLUMN_SIZE[1]}
              />
            </Suspense>
          </OptionalAssetBoundary>
        </group>
      </group>
      <mesh position={[0, 0.55, 0]}>
        <cylinderGeometry args={[1.05, 1.05, 1.1, 22]} />
        <meshBasicMaterial color={selected ? CORAL : TEAL} transparent opacity={0.001} depthWrite={false} toneMapped={false} />
      </mesh>
      <TextPanel
        title="PRIVATE DIARY"
        subtitle="CLICK THE OPEN BOOK"
        position={[0, 0.48, -0.78]}
        rotation={[0, Math.PI, 0]}
        width={1.34}
        height={0.3}
      />
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
  const frameCopy = useMemo(() => materialFrameCopy(exhibit, index + 1), [exhibit, index]);
  useFrame((state, delta) => {
    if (!artwork.current) return;
    const baseYaw = index % 2 === 0 ? 0.05 : -0.05;
    const idleYaw = baseYaw + Math.sin(state.clock.elapsedTime * 0.75 + index * 1.1) * 0.045;
    const targetYaw = selected ? 0 : idleYaw;
    artwork.current.rotation.y = THREE.MathUtils.damp(artwork.current.rotation.y, targetYaw, 7.5, delta);
    artwork.current.position.y = PROJECT_CARD_HEIGHT + Math.sin(state.clock.elapsedTime * 1.05 + index) * 0.018;
  });
  const accent = projectAccent(exhibit.title);
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 680;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#f4eadb";
    context.fillRect(0, 0, canvas.width, canvas.height);
    drawProjectArtwork(context, frameCopy.title, accent);
    context.fillStyle = accent;
    context.fillRect(0, 348, canvas.width, 16);
    context.fillStyle = "#6e5c51";
    context.font = "700 25px Arial";
    context.fillText(frameCopy.marker, 48, 416, 920);
    context.fillStyle = INK;
    context.font = "700 54px Arial";
    const titleBottom = drawWrappedText(context, frameCopy.title, 48, 486, 920, 60, 2);
    const metaY = titleBottom + 38;
    context.fillStyle = accent;
    context.font = "700 24px Arial";
    context.fillText(frameCopy.meta, 48, metaY, 920);
    context.fillStyle = "#514640";
    context.font = "26px Arial";
    drawWrappedText(context, frameCopy.takeaway, 48, metaY + 40, 920, 34, 2);
    const result = new THREE.CanvasTexture(canvas);
    result.colorSpace = THREE.SRGBColorSpace;
    result.anisotropy = 4;
    return result;
  }, [accent, frameCopy]);

  useEffect(() => () => texture.dispose(), [texture]);
  const placeholderFaces = <ProjectTextureFaces texture={texture} />;

  return (
    <group ref={artwork} position={[0, PROJECT_CARD_HEIGHT, 0]} rotation={[PROJECT_CARD_TILT, 0, 0]}>
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

function GramophoneExhibit({
  interactive,
  selected,
  onSelect,
}: {
  interactive: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const group = useRef<THREE.Group>(null);
  useFrame(() => {
    if (!group.current) return;
    const targetScale = selected ? 1.04 : hovered ? 1.025 : 1;
    group.current.scale.setScalar(THREE.MathUtils.lerp(group.current.scale.x, targetScale, 0.14));
  });
  return (
    <group
      ref={group}
      name="showroom-gramophone"
      position={MARDOU_GRAMOPHONE_PLACEMENT.position}
      rotation={MARDOU_GRAMOPHONE_PLACEMENT.rotation}
      onClick={interactive ? (event) => { event.stopPropagation(); onSelect(); } : undefined}
      onPointerOver={interactive ? (event) => { event.stopPropagation(); setHovered(true); document.body.style.cursor = "pointer"; } : undefined}
      onPointerOut={interactive ? () => { setHovered(false); document.body.style.cursor = "default"; } : undefined}
    >
      <OptionalAssetBoundary fallback={<ProjectPedestalFallback accent={CORAL} selected={selected} />}>
        <Suspense fallback={<ProjectPedestalFallback accent={CORAL} selected={selected} />}>
          <ImportedGltfAsset url={EXHIBIT_PEDESTAL_URL} targetSize={PROJECT_PEDESTAL_SIZE} />
        </Suspense>
      </OptionalAssetBoundary>
      <OptionalAssetBoundary>
        <Suspense fallback={null}>
          <ImportedGltfAsset url={GRAMOPHONE_URL} targetSize={GRAMOPHONE_SIZE} anchorY={PROJECT_PEDESTAL_SIZE[1]} />
        </Suspense>
      </OptionalAssetBoundary>
      <TextPanel title="音乐留声机" subtitle="点击选择与调整音乐" position={[0, 0.42, 0.68]} width={1.2} height={0.28} />
      <mesh position={[0, 0.95, 0]}>
        <cylinderGeometry args={[0.82, 0.82, 1.9, 18]} />
        <meshBasicMaterial color={selected ? CORAL : TEAL} transparent opacity={0.001} depthWrite={false} toneMapped={false} />
      </mesh>
      <pointLight position={[0, 1.55, 0.35]} intensity={interactive ? selected ? 2.8 : hovered ? 1.6 : 0.35 : 0} distance={2.8} color={selected ? CORAL : "#d3aa54"} />
    </group>
  );
}

function ProjectPedestal({ exhibit, position, displayIndex, selected, interactive, onSelect }: { exhibit: ExhibitPlan; position: Vec3; displayIndex: number; selected: boolean; interactive: boolean; onSelect: (id: string) => void }) {
  const [hovered, setHovered] = useState(false);
  const group = useRef<THREE.Group>(null);
  const frameCopy = useMemo(() => materialFrameCopy(exhibit, displayIndex), [displayIndex, exhibit]);
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
      <OptionalAssetBoundary fallback={<ProjectPedestalFallback accent={projectAccent(exhibit.title)} selected={selected} />}>
        <Suspense fallback={<ProjectPedestalFallback accent={projectAccent(exhibit.title)} selected={selected} />}>
          <ImportedGltfAsset url={EXHIBIT_PEDESTAL_URL} targetSize={PROJECT_PEDESTAL_SIZE} />
        </Suspense>
      </OptionalAssetBoundary>
      <ProjectImageCard exhibit={exhibit} index={displayIndex - 1} selected={selected} />
      <TextPanel
        title={frameCopy.marker}
        subtitle={frameCopy.title}
        position={[0, 0.43, 0.74]}
        width={1.12}
        height={0.26}
      />
      {interactive ? (
        <>
          <mesh position={[0, 0.72, 0]}>
            <cylinderGeometry args={[1.02, 1.02, 1.44, 20]} />
            <meshBasicMaterial color={projectAccent(exhibit.title)} transparent opacity={0.001} depthWrite={false} toneMapped={false} />
          </mesh>
        </>
      ) : null}
      <pointLight position={[0, 1.42, 0.35]} intensity={interactive ? selected ? 3.2 : hovered ? 2 : 0.65 : 0} distance={2.5} color={selected ? CORAL : projectAccent(exhibit.title)} />
    </group>
  );
}

function ProjectPedestalFallback({ accent, selected }: { accent: string; selected: boolean }) {
  return <mesh castShadow receiveShadow position={[0, 0.31, 0]}>
    <cylinderGeometry args={[0.5, 0.58, 0.62, 24]} />
    <meshStandardMaterial color="#e6d5bd" emissive={accent} emissiveIntensity={selected ? 0.24 : 0} roughness={0.76} />
  </mesh>;
}

class OptionalAssetBoundary extends Component<
  { children: ReactNode; fallback?: ReactNode },
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
    return this.state.failed ? this.props.fallback ?? null : this.props.children;
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
    let compileWatchdog = 0;
    async function warmScene() {
      await Promise.race([
        gl.compileAsync(scene, camera).catch(() => undefined),
        new Promise<void>((resolve) => {
          compileWatchdog = window.setTimeout(resolve, SCENE_COMPILE_TIMEOUT_MS);
        }),
      ]);
      if (compileWatchdog) window.clearTimeout(compileWatchdog);
      if (cancelled) return;
      firstFrame = window.requestAnimationFrame(() => {
        secondFrame = window.requestAnimationFrame(onReady);
      });
    }
    void warmScene();
    return () => {
      cancelled = true;
      if (compileWatchdog) window.clearTimeout(compileWatchdog);
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
  selectedExhibit?: string;
  guestbookMessages?: string[];
  privateFrameImages?: Partial<Record<MardouPrivateFrameSlot, string>>;
  petCustomization?: PetCustomization;
  petQaOpen?: boolean;
  onSelect: (id: string) => void;
  onRoomChange: (roomId: string) => void;
  onLoadProgress: (progress: number) => void;
  onLoadState: (snapshot: SceneLoadingSnapshot) => void;
  onReady: () => void;
  onFocusSettled: (id: string) => void;
  onTransitionStateChange: (transitioning: boolean) => void;
  onOpenPetQa: () => void;
  onStairProximityChange: (nearby: boolean) => void;
};

function sameStringItems(left: string[] = [], right: string[] = []) {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

function areWorldCanvasPropsEqual(previous: WorldCanvasProps, next: WorldCanvasProps) {
  return (
    previous.world === next.world &&
    previous.activeRoom === next.activeRoom &&
    previous.sceneReady === next.sceneReady &&
    previous.selectedExhibit === next.selectedExhibit &&
    sameStringItems(previous.guestbookMessages, next.guestbookMessages) &&
    previous.privateFrameImages === next.privateFrameImages &&
    previous.petCustomization === next.petCustomization &&
    previous.petQaOpen === next.petQaOpen &&
    previous.onSelect === next.onSelect &&
    previous.onRoomChange === next.onRoomChange &&
    previous.onLoadProgress === next.onLoadProgress &&
    previous.onLoadState === next.onLoadState &&
    previous.onReady === next.onReady &&
    previous.onFocusSettled === next.onFocusSettled &&
    previous.onTransitionStateChange === next.onTransitionStateChange &&
    previous.onOpenPetQa === next.onOpenPetQa &&
    previous.onStairProximityChange === next.onStairProximityChange
  );
}

function WorldCanvasImpl({
  world,
  activeRoom,
  sceneReady,
  selectedExhibit,
  guestbookMessages = [],
  privateFrameImages = {},
  petCustomization,
  petQaOpen = false,
  onSelect,
  onRoomChange,
  onLoadProgress,
  onLoadState,
  onReady,
  onFocusSettled,
  onTransitionStateChange,
  onOpenPetQa,
  onStairProximityChange,
}: WorldCanvasProps) {
  const [stairNearby, setStairNearby] = useState(false);
  const [entranceGreetingStarted, setEntranceGreetingStarted] = useState(false);
  const [entranceGreetingArrived, setEntranceGreetingArrived] = useState(false);
  const projectExhibits = world.exhibits.filter((exhibit) => exhibit.eyebrow === "PROJECT");
  const visibleProjectExhibits = projectExhibits.slice(0, PROJECTS_PER_PAGE);
  const visibleProjectPlacements = mardouProjectPlacementsForCount(visibleProjectExhibits.length);
  const creativeSubjects = useMemo(() => planCreativeSubjects(world.profile), [world.profile]);
  const companionName = normalizeRoomCompanionName(petCustomization?.name);

  useEffect(() => {
    document.body.style.cursor = "default";
    return () => {
      document.body.style.cursor = "default";
    };
  }, [activeRoom, selectedExhibit]);

  const reportStairProximity = useCallback((nearby: boolean) => {
    setStairNearby(nearby);
    onStairProximityChange(nearby);
  }, [onStairProximityChange]);

  useEffect(() => () => onStairProximityChange(false), [onStairProximityChange]);

  const startEntranceGreeting = useCallback(() => {
    setEntranceGreetingStarted(true);
  }, []);

  const finishEntranceGreeting = useCallback(() => {
    setEntranceGreetingArrived(true);
  }, []);

  return (
    <>
      <SceneLoadingReporter onLoadProgress={onLoadProgress} onLoadState={onLoadState} />
      <Canvas dpr={[1, 1.2]} shadows={{ type: THREE.PCFShadowMap }} camera={{ position: activeRoom === "room-lobby" ? MARDOU_LOBBY_INTRO_ROUTE.spawn : MARDOU_EXTERIOR_FOCUS.camera, fov: activeRoom === "room-lobby" ? MARDOU_LOBBY_FOCUS.fov : MARDOU_EXTERIOR_FOCUS.fov, near: 0.08, far: 120 }} gl={{ antialias: true, powerPreference: "high-performance" }} onPointerMissed={() => onSelect("")}>
        <color attach="background" args={["#91adbd"]} />
        <fog attach="fog" args={["#91adbd", 32, 74]} />
        <ambientLight intensity={0.5} color="#ead9c4" />
        <hemisphereLight intensity={0.65} color="#bfd6e8" groundColor="#432f2a" />
        <directionalLight castShadow position={[14, 22, 12]} intensity={2.35} color="#ffd8ad" shadow-mapSize={[1024, 1024]} shadow-camera-left={-26} shadow-camera-right={26} shadow-camera-top={24} shadow-camera-bottom={-24} />
        <pointLight position={[-7, 5, 5]} intensity={activeRoom !== "room-private" ? 12 : 0} distance={12} decay={2} color={CORAL} />
        <pointLight position={[6, 4, -3]} intensity={activeRoom !== "room-private" ? 3.8 : 0} distance={9} decay={2} color="#9fc6b8" />
        <RendererLook />
        <CameraRig
          activeRoom={activeRoom}
          selectedExhibit={selectedExhibit}
          sceneReady={sceneReady}
          world={world}
          onFocusSettled={onFocusSettled}
          onTransitionStateChange={onTransitionStateChange}
          onLobbyIntroStart={startEntranceGreeting}
          onLobbyIntroComplete={finishEntranceGreeting}
          onWideAngleRequested={() => onSelect("")}
        />
        <StairProximityReporter activeRoom={activeRoom} onChange={reportStairProximity} />
        <Suspense fallback={null}>
          <MardouMuseumScene
            activeRoom={activeRoom}
            onEnter={() => onRoomChange("room-lobby")}
            onBackgroundClick={() => onSelect("")}
          />
          <StairwayNavigation
            activeRoom={activeRoom}
            interactive={(activeRoom === "room-lobby" || activeRoom === "room-private") && !selectedExhibit}
            nearby={stairNearby}
            onNavigate={() => onRoomChange(activeRoom === "room-private" ? "room-lobby" : "room-private")}
          />
          <AutoOpeningMuseumDoor door={MARDOU_AUTO_DOOR} interactive={activeRoom === "room-lobby" && !selectedExhibit} />
          <AutoOpeningMuseumDoor door={MARDOU_SIDE_ENTRANCE_DOOR} interactive={activeRoom === "room-lobby" && !selectedExhibit} />
          <AutoOpeningMuseumDoor door={MARDOU_INNER_GALLERY_DOOR} interactive={activeRoom === "room-lobby"} />
          <OptionalAssetBoundary key={world.id}>
            <Suspense fallback={null}>
              <PortfolioEnvironment />
            </Suspense>
          </OptionalAssetBoundary>
          <LivingInformationWall
            world={world}
            activeRoom={activeRoom}
            selectedId={selectedExhibit}
            onSelect={onSelect}
          />
          <PrivatePictureFrames
            images={privateFrameImages}
            activeRoom={activeRoom}
            selectedId={selectedExhibit}
            onSelect={onSelect}
          />
          <ShowroomDetails lit={activeRoom === "room-lobby"} />
          {activeRoom === "room-lobby" ? <WallCouch /> : null}
          {activeRoom === "room-lobby" ? <PetBed companionName={companionName} /> : null}
          {activeRoom === "room-lobby" ? <EntranceCartoonStatue /> : null}
          <GramophoneExhibit
            interactive={activeRoom === "room-lobby"}
            selected={selectedExhibit === "showroom-gramophone"}
            onSelect={() => onSelect("showroom-gramophone")}
          />
          <CreativeSubjectCorner
            subjects={creativeSubjects}
            placement={mardouCreativeCornerPlacementForPrivateCount(
              world.displaySurfaces.filter((surface) => !isLobbySurface(surface)).length,
            )}
          />
          <RoomCompanion
            activeRoom={activeRoom}
            sceneReady={sceneReady}
            entranceGreetingStarted={entranceGreetingStarted}
            entranceGreetingArrived={entranceGreetingArrived}
            qaOpen={petQaOpen}
            customization={petCustomization}
            onOpenQa={onOpenPetQa}
          />
          <MuseumLifeFillers
            visible={activeRoom === "room-lobby"}
            selectedId={selectedExhibit || ""}
            onSelect={onSelect}
          />
          <GuestbookWallFrame
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
          {visibleProjectExhibits.map((exhibit, slot) => {
            const placement = visibleProjectPlacements[slot];
            return placement ? (
              <ProjectPedestal
                key={exhibit.id}
                exhibit={exhibit}
                position={placement.position}
                displayIndex={slot + 1}
                selected={selectedExhibit === exhibit.id}
                interactive={activeRoom === "room-lobby"}
                onSelect={onSelect}
              />
            ) : null;
          })}
          <mesh position={[0, -1.13, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[90, 90]} /><meshStandardMaterial color="#596b52" roughness={1} /></mesh>
          <SceneReadyNotifier onReady={onReady} />
        </Suspense>
      </Canvas>
    </>
  );
}

export const WorldCanvas = memo(WorldCanvasImpl, areWorldCanvasPropsEqual);
