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
export type MardouPrivateFrameSlot = "private-frame-11" | "private-frame-12" | "private-frame-13";

export const MARDOU_PICTURE_SLOTS: ReadonlyArray<{
  name: MardouPictureSlotName;
  defaultVisible: boolean;
  replaceable: boolean;
}> = [
  { name: "Picture", defaultVisible: true, replaceable: true },
  { name: "Picture_1", defaultVisible: false, replaceable: false },
  { name: "Picture_2", defaultVisible: true, replaceable: true },
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

// The supplied point X -9.238, Y -15.647, Z -551.199 lands on the center
// jamb of this double door. The outer frame bounds were measured from the
// adjacent Walls triangles in source space.
export const MARDOU_AUTO_DOOR = {
  position: mardouSourcePointToWorld([-9.2042236328125, -16.28961181640625, -551.1992950439453]),
  width: (-4.937145233154297 - -13.471298217773438) * MARDOU_SCALE,
  height: (-7.9461669921875 - -16.28961181640625) * MARDOU_SCALE,
  sensorRadius: 2.2,
  releaseRadius: 2.6,
} as const;

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
  frame11: [37.9883, 7.0115, -524.9566] as Vec3,
  frame12: [28.5801, 6.7098, -541.2597] as Vec3,
  frame13: [-49.9476, 5.7021, -517.8082] as Vec3,
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

export const MARDOU_EDUCATION_PLACEMENT = placement(
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

export const MARDOU_PRIVATE_SURFACE_PLACEMENTS: MuseumPlacement[] = [
  placement(privateSurfacePoints[0], [0, -Math.PI / 2, 0], [privateSurfacePoints[0][0] - 3, 4.8, privateSurfacePoints[0][2]]),
  placement(privateSurfacePoints[1], [0, 0, 0], [privateSurfacePoints[1][0], 4.8, privateSurfacePoints[1][2] + 3]),
  placement(privateSurfacePoints[2], [0, Math.PI / 2, 0], [privateSurfacePoints[2][0] + 3, 4.8, privateSurfacePoints[2][2]]),
  placement(privateSurfacePoints[3], [0, Math.PI / 2, 0], [privateSurfacePoints[3][0] + 3, 4.8, privateSurfacePoints[3][2] - 1.5]),
];

export const MARDOU_SURFACE_PLACEMENTS: MuseumPlacement[] = [
  MARDOU_PROFILE_PLACEMENT,
  MARDOU_EDUCATION_PLACEMENT,
  ...MARDOU_PRIVATE_SURFACE_PLACEMENTS,
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
  wallFramePlacement("private-frame-11", MARDOU_CONTENT_SOURCE_POINTS.frame11, [-0.8661, 0, 0.4998]),
  wallFramePlacement("private-frame-12", MARDOU_CONTENT_SOURCE_POINTS.frame12, [-0.8661, 0, 0.4998]),
  wallFramePlacement("private-frame-13", MARDOU_CONTENT_SOURCE_POINTS.frame13, [0.9926, 0, 0.1214]),
] as const;

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
