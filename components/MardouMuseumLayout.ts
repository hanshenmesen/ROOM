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

export type MardouPictureSlotName = "Picture" | "Picture_1" | "Picture_2";
export type MardouPrivateFrameSlot =
  | "private-frame-1"
  | "private-frame-2"
  | "private-frame-3"
  | "private-frame-4"
  | "private-frame-5"
  | "private-frame-6";
export const MARDOU_HIDDEN_MESH_NAMES = [
  "Picture",
  "Picture_1",
  "Picture_2",
  "bix_body",
  "bix_eye_upper",
  "Bix_Hair",
  "bix_eye_lower",
] as const;

export const MARDOU_PICTURE_SLOTS: ReadonlyArray<{
  name: MardouPictureSlotName;
  defaultVisible: boolean;
  replaceable: boolean;
}> = [
  { name: "Picture", defaultVisible: false, replaceable: false },
  { name: "Picture_1", defaultVisible: false, replaceable: false },
  { name: "Picture_2", defaultVisible: false, replaceable: false },
] as const;

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

export function mardouSourcePointToWorld([x, y, z]: Vec3): Vec3 {
  return [
    x * MARDOU_SCALE + MARDOU_POSITION[0],
    y * MARDOU_SCALE + MARDOU_POSITION[1],
    z * MARDOU_SCALE + MARDOU_POSITION[2],
  ];
}

const MARDOU_GROUND_FLOOR_Y = mardouSourcePointToWorld([0, -16.2896, 0])[1];
const MARDOU_CAMERA_EYE_HEIGHT = 1.5 - MARDOU_GROUND_FLOOR_Y;
const entranceDoorWallPoint = mardouSourcePointToWorld([-4.3212, -11.6679, -489.4383]);

// Point 1 from 入场门.txt is on an X-facing wall. The independent door is
// therefore rotated into the YZ plane and begins at the authored floor.
export const MARDOU_AUTO_DOOR = {
  id: "entrance-door",
  position: [entranceDoorWallPoint[0], MARDOU_GROUND_FLOOR_Y, entranceDoorWallPoint[2]] as Vec3,
  normal: [-1, 0, 0] as Vec3,
  rotation: [0, Math.PI / 2, 0] as Vec3,
  width: 1.72,
  height: 2.12,
  sensorRadius: 2.2,
  releaseRadius: 2.6,
} as const;

const innerGalleryDoorWallPoint = mardouSourcePointToWorld([-9.2487, -11.6312, -551.1993]);
export const MARDOU_INNER_GALLERY_DOOR = {
  id: "inner-gallery-door",
  position: [innerGalleryDoorWallPoint[0], MARDOU_GROUND_FLOOR_Y, innerGalleryDoorWallPoint[2]] as Vec3,
  normal: [0, 0, 1] as Vec3,
  rotation: [0, 0, 0] as Vec3,
  width: 1.76,
  height: 1.74,
  sensorRadius: 2.2,
  releaseRadius: 2.6,
} as const;

const LOBBY_INTRO_SOURCE_POINTS = {
  spawnFloor: [3.3326, -16.2896, -489.2497] as Vec3,
  mainTarget: [-13.2137, -9.3034, -551.1993] as Vec3,
};
const lobbyIntroSpawnFloor = mardouSourcePointToWorld(LOBBY_INTRO_SOURCE_POINTS.spawnFloor);
const lobbyMainTarget = mardouSourcePointToWorld(LOBBY_INTRO_SOURCE_POINTS.mainTarget);
const lobbyDoorLook: Vec3 = [entranceDoorWallPoint[0], entranceDoorWallPoint[1], entranceDoorWallPoint[2]];

// The camera begins at the supplied floor point, approaches the door slowly
// enough for its proximity sensor to open both leaves, crosses the threshold,
// then turns into the authored main view facing the supplied wall point.
export const MARDOU_LOBBY_INTRO_ROUTE = {
  spawn: [
    lobbyIntroSpawnFloor[0],
    lobbyIntroSpawnFloor[1] + MARDOU_CAMERA_EYE_HEIGHT,
    lobbyIntroSpawnFloor[2],
  ] as Vec3,
  approach: [entranceDoorWallPoint[0] + 0.72, 1.5, entranceDoorWallPoint[2]] as Vec3,
  threshold: [entranceDoorWallPoint[0] - 0.82, 1.5, entranceDoorWallPoint[2]] as Vec3,
  galleryTurn: [-2.7, 1.5, -7.4] as Vec3,
  arrival: [-4.408, 1.5, -11.169] as Vec3,
  lookAt: lobbyDoorLook,
  mainTarget: lobbyMainTarget,
  duration: 7.8,
};

// Ground-floor safe patrol area for the neutral ROOM companion. These points
// stay in the lobby circulation band, away from the entrance threshold and the
// stair treads, and keep y at floor height so the companion never routes
// upstairs.
export const MARDOU_COMPANION_SAFE_ZONE = {
  floorY: 0.25,
  bodyHeight: 0.62,
  stoppingRadius: 0.32,
  clickPauseSeconds: 8,
  dialoguePoint: [-4.4, 0.25, -11.2] as Vec3,
  waypoints: [
    [-4.4, 0.25, -11.2],
    [-2.1, 0.25, -14.8],
    [1.7, 0.25, -13.4],
    [4.2, 0.25, -17.2],
    [0.5, 0.25, -20.2],
    [-3.8, 0.25, -18.4],
  ] as ReadonlyArray<Vec3>,
} as const;

// Points below were ray-picked against the supplied GLB and checked by
// scripts/audit-mardou-layout.mjs. Ground-floor surfaces are y ~= 0.246 and
// the upper gallery surface is y ~= 3.527 in application coordinates.
export const MARDOU_LOBBY_FOCUS: MuseumFocus = {
  target: MARDOU_LOBBY_INTRO_ROUTE.mainTarget,
  camera: MARDOU_LOBBY_INTRO_ROUTE.arrival,
  fov: 60,
};

export const MARDOU_LOBBY_WIDE_FOCUS: MuseumFocus = {
  target: [0, 1.5, -13],
  camera: [-7.2, 1.65, -10],
  fov: 82,
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
  gallery: [2, 1.5, -2] as Vec3,
  introApproach: MARDOU_LOBBY_INTRO_ROUTE.galleryTurn,
};

const privateArrivalFloor = mardouSourcePointToWorld([30.7634, -0.3973, -513.8498]);
export const MARDOU_PRIVATE_FOCUS: MuseumFocus = {
  target: [4.35, 4.45, -11.1],
  camera: [privateArrivalFloor[0], privateArrivalFloor[1] + MARDOU_CAMERA_EYE_HEIGHT, privateArrivalFloor[2]],
  fov: 58,
};

export const MARDOU_PRIVATE_WIDE_FOCUS: MuseumFocus = {
  target: [0, 4.25, -19],
  camera: [5.8, 4.95, -11.2],
  fov: 82,
};

export const MARDOU_PRIVATE_ROUTE = {
  approach: [-1.35, 1.5, -8.753] as Vec3,
  lowerFlight: [0.45, 2.05, -8.753] as Vec3,
  landing: [1.9, 3.58, -8.753] as Vec3,
  upperFlight: [3.25, 4.48, -8.753] as Vec3,
  galleryEntry: [4.55, 4.8, -9.05] as Vec3,
  arrival: MARDOU_PRIVATE_FOCUS.camera,
  duration: 8.6,
};

// The GLB merges the stairs into the shared Walls mesh, so there is no named
// stair object to reuse. These dimensions were measured from the horizontal
// tread triangles themselves: 13 lower treads, one landing, and 7 upper
// treads. Each hit surface sits just above its real tread and stays inside its
// edges, so the floor beside/below the stairs is never promoted to a stair.
const MARDOU_STAIR_Z_CENTER = (-9.532316835573674 + -7.973685162824371) / 2;
const MARDOU_STAIR_TREAD_SIZE: Vec3 = [0.205, 0.035, 1.5];
const MARDOU_STAIR_SURFACE_LIFT = 0.018;

const lowerStairTargets = Array.from({ length: 13 }, (_, index) => ({
  position: [
    -0.8652734910771112 + index * 0.180474,
    0.39525276540964205 + index * 0.149151 + MARDOU_STAIR_SURFACE_LIFT,
    MARDOU_STAIR_Z_CENTER,
  ] as Vec3,
  size: MARDOU_STAIR_TREAD_SIZE,
}));

const stairLandingTarget = {
  position: [1.874042550957072, 2.3342269312906825 + MARDOU_STAIR_SURFACE_LIFT, MARDOU_STAIR_Z_CENTER] as Vec3,
  size: [0.96, 0.035, 1.5] as Vec3,
};

const upperStairTargets = Array.from({ length: 7 }, (_, index) => ({
  position: [
    2.4476790556114316 + index * 0.180474,
    2.48337297384339 + index * 0.149151 + MARDOU_STAIR_SURFACE_LIFT,
    MARDOU_STAIR_Z_CENTER,
  ] as Vec3,
  size: MARDOU_STAIR_TREAD_SIZE,
}));

export const MARDOU_STAIR_CLICK_TARGETS: ReadonlyArray<{ position: Vec3; size: Vec3 }> = [
  ...lowerStairTargets,
  stairLandingTarget,
  ...upperStairTargets,
];

const MARDOU_CONTENT_SOURCE_POINTS = {
  profile: [-31.7103, -9.8659, -550.6032] as Vec3,
  education: [-22.3637, -16.2896, -498.6037] as Vec3,
  project3: [-19.6876, -16.2896, -542.8366] as Vec3,
  project4: [0.7233, -16.2896, -542.925] as Vec3,
  project5: [15.7013, -16.2896, -542.6077] as Vec3,
  private6: [12.1705, -0.3973, -563.4315] as Vec3,
  private7: [-10.0695, -0.3973, -571.6677] as Vec3,
  private8: [-20.9003, -0.3973, -550.2894] as Vec3,
  private9: [-27.8284, -0.3973, -533.54] as Vec3,
  skills: [-3.346, -16.2896, -568.1041] as Vec3,
  frame1: [-26.3949, -11.4074, -431.54] as Vec3,
  frame2: [-34.3672, -11.1549, -443.382] as Vec3,
  frame3: [-40.9912, -11.1117, -456.3047] as Vec3,
  frame4: [-45.7948, -10.8606, -469.2781] as Vec3,
  frame5: [-49.1467, -10.9222, -483.6486] as Vec3,
  frame6: [-50.6895, -10.7098, -497.7521] as Vec3,
  gramophone: [33.0739, -16.2896, -509.7867] as Vec3,
} as const;

const FLOOR_OBJECT_CENTER_LIFT = 1.39;

function floorObjectPoint(sourcePoint: Vec3): Vec3 {
  const point = mardouSourcePointToWorld(sourcePoint);
  return [point[0], point[1] + FLOOR_OBJECT_CENTER_LIFT, point[2]];
}

function placement(position: Vec3, rotation: Vec3, camera: Vec3, fov = 46): MuseumPlacement {
  return {
    position,
    rotation,
    focus: { target: position, camera, fov },
  };
}

const profilePoint = mardouSourcePointToWorld(MARDOU_CONTENT_SOURCE_POINTS.profile);
const educationPoint = floorObjectPoint(MARDOU_CONTENT_SOURCE_POINTS.education);
const skillsPoint = floorObjectPoint(MARDOU_CONTENT_SOURCE_POINTS.skills);

export const MARDOU_PROFILE_PLACEMENT = placement(
  profilePoint,
  [0, 0, 0],
  [profilePoint[0], profilePoint[1], profilePoint[2] + 3],
);

export const MARDOU_ACHIEVEMENT_PLACEMENT = placement(
  educationPoint,
  [0, 0, 0],
  [-3.7, 1.5, -3.35],
);

export const MARDOU_SKILLS_PLACEMENT = placement(
  skillsPoint,
  [0, 0, 0],
  [1, 1.5, -18],
);

export const MARDOU_PROJECT_PLACEMENTS: Array<{
  position: Vec3;
  focus: MuseumFocus;
}> = [
  MARDOU_CONTENT_SOURCE_POINTS.project3,
  MARDOU_CONTENT_SOURCE_POINTS.project4,
  MARDOU_CONTENT_SOURCE_POINTS.project5,
].map((sourcePoint) => {
  const position = mardouSourcePointToWorld(sourcePoint);
  return {
    position,
    focus: {
      target: [position[0], position[1] + 0.8, position[2]],
      camera: (sourcePoint === MARDOU_CONTENT_SOURCE_POINTS.project5
        ? [0.5, 1.5, position[2]]
        : [position[0], 1.5, position[2] + 3]) as Vec3,
      fov: 48,
    },
  };
});

export function mardouProjectPlacementsForCount(count: number) {
  if (count <= 0) return [];
  if (count === 1) return [MARDOU_PROJECT_PLACEMENTS[1]];
  if (count === 2) return [MARDOU_PROJECT_PLACEMENTS[1], MARDOU_PROJECT_PLACEMENTS[2]];
  return MARDOU_PROJECT_PLACEMENTS;
}

const privateSurfacePoints = [
  floorObjectPoint(MARDOU_CONTENT_SOURCE_POINTS.private6),
  floorObjectPoint(MARDOU_CONTENT_SOURCE_POINTS.private7),
  floorObjectPoint(MARDOU_CONTENT_SOURCE_POINTS.private8),
  floorObjectPoint(MARDOU_CONTENT_SOURCE_POINTS.private9),
];

// Education and achievements exchange their authored stands: achievements
// now use the former ground-floor education stand, while education uses the
// former upper-gallery achievement position (private point 7).
export const MARDOU_EDUCATION_PLACEMENT = placement(
  privateSurfacePoints[1],
  [0, 0, 0],
  [privateSurfacePoints[1][0], 4.8, privateSurfacePoints[1][2] + 3],
);

export const MARDOU_PRIVATE_SURFACE_PLACEMENTS: MuseumPlacement[] = [
  placement(privateSurfacePoints[0], [0, -Math.PI / 2, 0], [privateSurfacePoints[0][0] - 3, 4.8, privateSurfacePoints[0][2]]),
  placement(privateSurfacePoints[1], [0, 0, 0], [privateSurfacePoints[1][0], 4.8, privateSurfacePoints[1][2] + 3]),
  placement(privateSurfacePoints[2], [0, Math.PI / 2, 0], [privateSurfacePoints[2][0] + 3, 4.8, privateSurfacePoints[2][2]]),
  placement(privateSurfacePoints[3], [0, Math.PI / 2, 0], [privateSurfacePoints[3][0] + 3, 4.8, privateSurfacePoints[3][2] - 1.5]),
];

export const MARDOU_SURFACE_PLACEMENTS: MuseumPlacement[] = [
  MARDOU_PROFILE_PLACEMENT,
  MARDOU_ACHIEVEMENT_PLACEMENT,
  MARDOU_EDUCATION_PLACEMENT,
  MARDOU_PRIVATE_SURFACE_PLACEMENTS[0],
  MARDOU_PRIVATE_SURFACE_PLACEMENTS[2],
  MARDOU_PRIVATE_SURFACE_PLACEMENTS[3],
  MARDOU_SKILLS_PLACEMENT,
];

function wallFramePlacement(
  slot: MardouPrivateFrameSlot,
  sourcePoint: Vec3,
  normal: Vec3,
) {
  const point = mardouSourcePointToWorld(sourcePoint);
  const offset = 0.045;
  const position: Vec3 = [
    point[0] + normal[0] * offset,
    point[1],
    point[2] + normal[2] * offset,
  ];
  const yaw = Math.atan2(normal[0], normal[2]);
  return {
    slot,
    position,
    rotation: [0, yaw, 0] as Vec3,
    normal,
    focus: {
      target: position,
      camera: [position[0] + normal[0] * 3, position[1], position[2] + normal[2] * 3] as Vec3,
      fov: 45,
    },
  };
}

export const MARDOU_PRIVATE_PICTURE_FRAMES = [
  wallFramePlacement("private-frame-1", MARDOU_CONTENT_SOURCE_POINTS.frame1, [0.7818, 0, -0.6235]),
  wallFramePlacement("private-frame-2", MARDOU_CONTENT_SOURCE_POINTS.frame2, [0.8615, 0, -0.5078]),
  wallFramePlacement("private-frame-3", MARDOU_CONTENT_SOURCE_POINTS.frame3, [0.9239, 0, -0.3827]),
  wallFramePlacement("private-frame-4", MARDOU_CONTENT_SOURCE_POINTS.frame4, [0.9484, 0, -0.3172]),
  wallFramePlacement("private-frame-5", MARDOU_CONTENT_SOURCE_POINTS.frame5, [0.9834, 0, -0.1816]),
  wallFramePlacement("private-frame-6", MARDOU_CONTENT_SOURCE_POINTS.frame6, [0.9991, 0, -0.0413]),
] as const;

const gramophoneFloorPoint = mardouSourcePointToWorld(MARDOU_CONTENT_SOURCE_POINTS.gramophone);
export const MARDOU_GRAMOPHONE_PLACEMENT: MuseumPlacement = {
  position: gramophoneFloorPoint,
  rotation: [0, -Math.PI / 2, 0],
  focus: {
    target: [gramophoneFloorPoint[0], gramophoneFloorPoint[1] + 0.9, gramophoneFloorPoint[2]],
    camera: [gramophoneFloorPoint[0] - 3, 1.5, gramophoneFloorPoint[2]],
    fov: 46,
  },
};

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
