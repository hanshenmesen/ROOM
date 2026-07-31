import type { Vec3 } from "@/lib/types";

export type MuseumFocus = {
  target: Vec3;
  camera: Vec3;
  fov: number;
};

export type MuseumPlacement = {
  position: Vec3;
  rotation: Vec3;
  focus: MuseumFocus;
};

// Source-space bounds measured from MardouMuseumResult.glb. These constants
// keep the model transform and every picked application-space point in one
// place so they cannot drift independently.
export const MARDOU_SOURCE_BOUNDS = {
  minY: -17.48150634765625,
  centerZ: -500,
  width: 104.61412811279297,
} as const;

export const MARDOU_LOBBY_WIDTH = 21.6;
export const MARDOU_SCALE = MARDOU_LOBBY_WIDTH / MARDOU_SOURCE_BOUNDS.width;
export const MARDOU_POSITION: Vec3 = [
  0,
  -MARDOU_SOURCE_BOUNDS.minY * MARDOU_SCALE,
  -7 - MARDOU_SOURCE_BOUNDS.centerZ * MARDOU_SCALE,
];

function mardouSourcePointToWorld([x, y, z]: Vec3): Vec3 {
  return [
    x * MARDOU_SCALE + MARDOU_POSITION[0],
    y * MARDOU_SCALE + MARDOU_POSITION[1],
    z * MARDOU_SCALE + MARDOU_POSITION[2],
  ];
}

const LOBBY_INTRO_SOURCE_POINTS = {
  spawnFloor: [-32.244, -16.2896, -452.0684] as Vec3,
  turnFloor: [-36.32435, -16.2896, -475.783767] as Vec3,
  waypointFloor: [-38.745973, -16.2896, -497.578377] as Vec3,
  galleryTurnFloor: [-33.902727, -16.2896, -512.108117] as Vec3,
};
const LOBBY_CAMERA_HEIGHT_ABOVE_FLOOR = 1.5 - mardouSourcePointToWorld(LOBBY_INTRO_SOURCE_POINTS.spawnFloor)[1];
const lobbyIntroSpawnFloor = mardouSourcePointToWorld(LOBBY_INTRO_SOURCE_POINTS.spawnFloor);
const lobbyIntroTurnFloor = mardouSourcePointToWorld(LOBBY_INTRO_SOURCE_POINTS.turnFloor);
const lobbyIntroWaypointFloor = mardouSourcePointToWorld(LOBBY_INTRO_SOURCE_POINTS.waypointFloor);
const lobbyIntroGalleryTurnFloor = mardouSourcePointToWorld(LOBBY_INTRO_SOURCE_POINTS.galleryTurnFloor);

// The three anchors were ray-picked from the supplied GLB in source space.
// All three sit on the Floor mesh along the long west corridor and receive
// the same eye-height lift before the camera follows 1 -> 2 -> 3.
export const MARDOU_LOBBY_INTRO_ROUTE = {
  spawn: [
    lobbyIntroSpawnFloor[0],
    lobbyIntroSpawnFloor[1] + LOBBY_CAMERA_HEIGHT_ABOVE_FLOOR,
    lobbyIntroSpawnFloor[2],
  ] as Vec3,
  turn: [
    lobbyIntroTurnFloor[0],
    lobbyIntroTurnFloor[1] + LOBBY_CAMERA_HEIGHT_ABOVE_FLOOR,
    lobbyIntroTurnFloor[2],
  ] as Vec3,
  waypoint: [
    lobbyIntroWaypointFloor[0],
    lobbyIntroWaypointFloor[1] + LOBBY_CAMERA_HEIGHT_ABOVE_FLOOR,
    lobbyIntroWaypointFloor[2],
  ] as Vec3,
  galleryTurn: [
    lobbyIntroGalleryTurnFloor[0],
    lobbyIntroGalleryTurnFloor[1] + LOBBY_CAMERA_HEIGHT_ABOVE_FLOOR,
    lobbyIntroGalleryTurnFloor[2],
  ] as Vec3,
  galleryLook: [-2, 1.5, -10] as Vec3,
  duration: 7,
};

// Points below were ray-picked against the supplied GLB and checked by
// scripts/audit-mardou-layout.mjs. Ground-floor surfaces are y ~= 0.246 and
// the upper gallery surface is y ~= 3.527 in application coordinates.
export const MARDOU_LOBBY_FOCUS: MuseumFocus = {
  target: [-0.506, 1.5, -9.819],
  camera: [-4.408, 1.5, -11.169],
  fov: 60,
};

export const MARDOU_EXTERIOR_FOCUS: MuseumFocus = {
  target: [1, 3, -2],
  camera: [16, 6, 24],
  fov: 46,
};

// At eye height x=2 is the only clear front-to-back opening in the facade.
// The old x=0 route intersected the curved wall at z~=12.7.
export const MARDOU_ENTRANCE_ROUTE = {
  outside: [2.5, 1.5, 13.8] as Vec3,
  threshold: [2, 1.5, 8] as Vec3,
  gallery: [-1.5, 1.5, -8] as Vec3,
};

export const MARDOU_PRIVATE_FOCUS: MuseumFocus = {
  target: [0, 4.25, -20],
  camera: [0, 4.8, -16],
  fov: 54,
};

export const MARDOU_PRIVATE_ROUTE = {
  lobbyApproach: [-1.5, 1.5, -10] as Vec3,
  ground: [0, 1.5, -10] as Vec3,
  stairs: [2.5, 2.5, -12] as Vec3,
  landing: [2.5, 4.8, -15] as Vec3,
};

export const MARDOU_PROJECT_PLACEMENTS: Array<{
  position: Vec3;
  focus: MuseumFocus;
}> = [
  { position: [-5, 0.25, -8], focus: { target: [-5, 1.05, -8], camera: [-3, 1.5, -5.5], fov: 48 } },
  { position: [-1.5, 0.25, -8], focus: { target: [-1.5, 1.05, -8], camera: [-1.5, 1.5, -5.2], fov: 48 } },
  { position: [0.5, 0.25, -13], focus: { target: [0.5, 1.05, -13], camera: [0.5, 1.5, -10.2], fov: 48 } },
  { position: [5, 0.25, -13], focus: { target: [5, 1.05, -13], camera: [5, 1.5, -10.2], fov: 48 } },
];

// The planes face into clear central aisles. Width runs along local X, so the
// side-facing frames extend along Z rather than into the museum structure.
export const MARDOU_SURFACE_PLACEMENTS: MuseumPlacement[] = [
  { position: [-8.5, 1.65, -10], rotation: [0, Math.PI / 2, 0], focus: { target: [-8.5, 1.65, -10], camera: [-5.5, 1.5, -10], fov: 46 } },
  { position: [6, 1.65, -10], rotation: [0, -Math.PI / 2, 0], focus: { target: [6, 1.65, -10], camera: [3, 1.5, -10], fov: 46 } },
  { position: [-7, 1.65, -16], rotation: [0, Math.PI / 2, 0], focus: { target: [-7, 1.65, -16], camera: [-4, 1.5, -16], fov: 46 } },
  { position: [2, 1.65, -16], rotation: [0, -Math.PI / 2, 0], focus: { target: [2, 1.65, -16], camera: [-1, 1.5, -16], fov: 46 } },
  { position: [-7, 1.65, -20.5], rotation: [0, Math.PI / 2, 0], focus: { target: [-7, 1.65, -20.5], camera: [-4, 1.5, -20.5], fov: 46 } },
  { position: [2, 1.65, -20.5], rotation: [0, -Math.PI / 2, 0], focus: { target: [2, 1.65, -20.5], camera: [-1, 1.5, -20.5], fov: 46 } },
  { position: [-1, 1.65, -25], rotation: [0, 0, 0], focus: { target: [-1, 1.65, -25], camera: [-1, 1.5, -21.3], fov: 46 } },
];

export const MARDOU_GUESTBOOK_PLACEMENT: MuseumPlacement = {
  position: [-5, 4.65, -18],
  rotation: [0, Math.PI / 2, 0],
  focus: { target: [-5, 4.65, -18], camera: [-2, 4.8, -18], fov: 46 },
};

export const MARDOU_SOURCE_ARCHIVE_PLACEMENT: MuseumPlacement = {
  position: [3.5, 0.25, -20],
  rotation: [0, -Math.PI / 2, 0],
  focus: { target: [3.5, 1.65, -20], camera: [0.5, 1.5, -20], fov: 46 },
};

export const MARDOU_DIARY_POSITION: Vec3 = [0, 3.53, -20];
export const MARDOU_DIARY_FOCUS: MuseumFocus = {
  target: [0, 4.5, -20],
  camera: [0, 4.8, -16],
  fov: 48,
};

export const MARDOU_CREATIVE_CORNER_POSITION: Vec3 = [4, 3.53, -16];
