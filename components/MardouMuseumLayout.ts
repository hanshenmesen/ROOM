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

export function responsiveMuseumFov(baseFov: number, aspect: number) {
  if (baseFov < 70) return baseFov;
  if (aspect >= 1.2) {
    // On ultrawide canvases, keeping an 86° *vertical* lens produces an
    // extreme horizontal field of view and makes the museum read like a tiny
    // strip in the middle. Preserve a generous 122° horizontal overview while
    // allowing the vertical lens to tighten continuously as the canvas widens.
    const horizontalFov = 2 * Math.atan(
      Math.tan((baseFov * Math.PI) / 360) * aspect,
    );
    const maximumHorizontalFov = (122 * Math.PI) / 180;
    if (horizontalFov <= maximumHorizontalFov) return baseFov;
    return (2 * Math.atan(Math.tan(maximumHorizontalFov / 2) / aspect) * 180) / Math.PI;
  }
  const portraitAmount = Math.max(0, Math.min(1, (1.2 - aspect) / 0.4));
  // A portrait viewport has much less horizontal field of view. Preserve the
  // establishing-shot intent instead of narrowing the lens and cropping the
  // third project island. Give the already-wide establishing lenses another
  // two degrees rather than collapsing them to a narrower portrait value.
  const portraitFov = baseFov >= 88 ? 98 : baseFov >= 86 ? 96 : baseFov >= 84 ? 94 : baseFov >= 80 ? 90 : 88;
  const portraitAdjusted = baseFov + (portraitFov - baseFov) * portraitAmount;
  // Very narrow split-screen phones (roughly 0.36 aspect) need a little more
  // vertical angle to recover horizontal framing. This only affects overview
  // lenses; exhibit close-ups remain at their authored FOV above.
  const ultraPortraitAmount = Math.max(0, Math.min(1, (0.45 - aspect) / 0.09));
  return portraitAdjusted + ultraPortraitAmount * 12;
}

export function responsiveMuseumTarget(baseTarget: Vec3, aspect: number): Vec3 {
  if (baseTarget === MARDOU_LOBBY_INTRO_ROUTE.mainTarget) return [...baseTarget];
  if (aspect >= 1.2) return [...baseTarget];
  const portraitAmount = Math.max(0, Math.min(1, (1.2 - aspect) / 0.4));
  return [
    baseTarget[0] + portraitAmount * 2.23,
    baseTarget[1] - portraitAmount * 0.3,
    baseTarget[2],
  ];
}

export function responsiveMuseumCamera(baseCamera: Vec3, aspect: number): Vec3 {
  // The newly picked entrance must finish at point 3 on every viewport. Its
  // forward-facing composition is authored by the route, not by overview
  // recentering. R remains the explicit responsive museum overview.
  if (baseCamera === MARDOU_LOBBY_INTRO_ROUTE.arrival) return [...baseCamera];
  if (aspect >= 1.2) return [...baseCamera];
  const portraitAmount = Math.max(0, Math.min(1, (1.2 - aspect) / 0.4));
  return [
    // Stay in the clear band between the low stair parapet on the left and
    // the lower flight on the right. The old 2.35m shift hugged the stairs;
    // no shift at all put the lens behind the white parapet.
    baseCamera[0] + portraitAmount * (-2.7 - baseCamera[0]),
    baseCamera[1] - portraitAmount * 0.2,
    baseCamera[2] + portraitAmount * 3.4,
  ];
}

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
  swingDirection: -1,
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
  swingDirection: 1,
} as const;

const sideEntranceDoorWallPoint = mardouSourcePointToWorld([7.7966, -11.7118, -489.4102]);
export const MARDOU_SIDE_ENTRANCE_DOOR = {
  id: "side-entrance-door",
  position: [sideEntranceDoorWallPoint[0], MARDOU_GROUND_FLOOR_Y, sideEntranceDoorWallPoint[2]] as Vec3,
  normal: [1, 0, 0] as Vec3,
  rotation: [0, Math.PI / 2, 0] as Vec3,
  width: 1.72,
  height: 2.12,
  sensorRadius: 2.2,
  releaseRadius: 2.6,
  swingDirection: 1,
} as const;

const LOBBY_INTRO_SOURCE_POINTS = {
  point1: [7.9952, -17.0988, -489.5705] as Vec3,
  point2: [-2.5697, -16.2896, -489.6854] as Vec3,
  point3: [-9.4724, -16.2896, -490.8271] as Vec3,
};
const introEyeY = MARDOU_GROUND_FLOOR_Y + MARDOU_CAMERA_EYE_HEIGHT;
function introCameraPoint(sourcePoint: Vec3): Vec3 {
  const worldPoint = mardouSourcePointToWorld(sourcePoint);
  return [worldPoint[0], introEyeY, worldPoint[2]];
}
function forwardLookTarget(from: Vec3, toward: Vec3, distance = 8): Vec3 {
  const deltaX = toward[0] - from[0];
  const deltaZ = toward[2] - from[2];
  const length = Math.max(0.001, Math.hypot(deltaX, deltaZ));
  return [
    from[0] + deltaX / length * distance,
    1.55,
    from[2] + deltaZ / length * distance,
  ];
}
function rightTurnLookTarget(from: Vec3, toward: Vec3, distance = 8): Vec3 {
  const deltaX = toward[0] - from[0];
  const deltaZ = toward[2] - from[2];
  const length = Math.max(0.001, Math.hypot(deltaX, deltaZ));
  // In the museum's Y-up coordinate system, (-forwardZ, forwardX) is the
  // horizontal direction 90 degrees to the camera's right.
  return [
    toward[0] - deltaZ / length * distance,
    1.55,
    toward[2] + deltaX / length * distance,
  ];
}
const lobbyIntroPoint1 = introCameraPoint(LOBBY_INTRO_SOURCE_POINTS.point1);
const lobbyIntroPoint2 = introCameraPoint(LOBBY_INTRO_SOURCE_POINTS.point2);
const lobbyIntroPoint3 = introCameraPoint(LOBBY_INTRO_SOURCE_POINTS.point3);
const lobbyMainGalleryTarget = mardouSourcePointToWorld([-13.2137, -9.3034, -551.1993]);
const lobbyIntroTargets: ReadonlyArray<Vec3> = [
  forwardLookTarget(lobbyIntroPoint1, lobbyIntroPoint2),
  forwardLookTarget(lobbyIntroPoint2, lobbyIntroPoint3),
  rightTurnLookTarget(lobbyIntroPoint2, lobbyIntroPoint3),
];

// Enter through the new side door in the exact picked 1 -> 2 -> 3 order.
// Keep looking along the route through both doors, then finish at point 3 with
// a smooth 90-degree turn to the right without changing the camera trajectory.
export const MARDOU_LOBBY_INTRO_ROUTE = {
  points: [lobbyIntroPoint1, lobbyIntroPoint2, lobbyIntroPoint3] as ReadonlyArray<Vec3>,
  targets: lobbyIntroTargets,
  spawn: lobbyIntroPoint1,
  waypoint: lobbyIntroPoint2,
  arrival: lobbyIntroPoint3,
  lookAt: lobbyIntroTargets[0],
  mainTarget: lobbyIntroTargets[2],
  duration: 7.8,
};

// Ground-floor safe patrol area for the neutral ROOM companion. These points
// stay in the lobby circulation band, away from the entrance threshold and the
// stair treads, and keep y at floor height so the companion never routes
// upstairs.
const companionEntranceFloorPoint = mardouSourcePointToWorld([-10.018, -16.2896, -510.6123]);
const companionPatrolSourcePoints: ReadonlyArray<Vec3> = [
  [-10.2734, -16.2896, -513.2173],
  [-15.9923, -16.2896, -517.8265],
  [-17.6125, -16.2896, -528.2268],
  [-8.709, -16.2896, -533.9021],
  [0.5097, -16.2896, -532.5879],
  [2.7494, -16.2896, -526.8054],
  [0.2899, -16.2896, -520.4543],
];
const companionPatrolPoints = companionPatrolSourcePoints.map((sourcePoint) => {
  const point = mardouSourcePointToWorld(sourcePoint);
  return [point[0], MARDOU_GROUND_FLOOR_Y, point[2]] as Vec3;
});
export const MARDOU_COMPANION_SAFE_ZONE = {
  floorY: MARDOU_GROUND_FLOOR_Y,
  bodyHeight: 0.62,
  stoppingRadius: 0.32,
  clickPauseSeconds: 8,
  // Begin at the supplied entrance point and greet the arriving camera there.
  // Keeping the welcome point coincident avoids cutting through the nearby
  // structure before the normal patrol begins.
  entranceSpawn: [
    companionEntranceFloorPoint[0],
    MARDOU_GROUND_FLOOR_Y,
    companionEntranceFloorPoint[2],
  ] as Vec3,
  entranceWelcome: [
    companionEntranceFloorPoint[0],
    MARDOU_GROUND_FLOOR_Y,
    companionEntranceFloorPoint[2],
  ] as Vec3,
  entrancePauseSeconds: 6,
  dialoguePoint: companionPatrolPoints[0],
  waypoints: companionPatrolPoints,
} as const;

export const MARDOU_COMPANION_SPEED = 0.72;

// Points below were ray-picked against the supplied GLB and checked by
// scripts/audit-mardou-layout.mjs. Ground-floor surfaces are y ~= 0.246 and
// the upper gallery surface is y ~= 3.527 in application coordinates.
export const MARDOU_LOBBY_FOCUS: MuseumFocus = {
  target: MARDOU_LOBBY_INTRO_ROUTE.mainTarget,
  camera: MARDOU_LOBBY_INTRO_ROUTE.arrival,
  fov: 86,
};

export const MARDOU_LOBBY_WIDE_FOCUS: MuseumFocus = {
  target: lobbyMainGalleryTarget,
  // Widen and drift slightly left, but remain beyond the lowest tread's z
  // plane so R always returns to a clean overview rather than a stair close-up.
  camera: [-4.4, 1.98, -9.65],
  fov: 88,
};

export const MARDOU_LIFE_FILLER_PLACEMENTS = {
  sports: { position: [5.35, MARDOU_GROUND_FLOOR_Y, -14.2] as Vec3, rotation: [0, -0.38, 0] as Vec3 },
  refreshments: { position: [-6.5, MARDOU_GROUND_FLOOR_Y, -13.5] as Vec3, rotation: [0, 0.34, 0] as Vec3 },
} as const;

const couchFloorPoint = mardouSourcePointToWorld([33.0497, -16.2896, -522.3357]);
export const MARDOU_COUCH_PLACEMENT = {
  position: couchFloorPoint,
  // Turn the supplied asset around so its back, rather than its seat, faces
  // the wall while retaining the exact picked position.
  rotation: [0, -Math.PI / 2, 0] as Vec3,
} as const;

const petBedFloorPoint = mardouSourcePointToWorld([-5.3113, -16.2896, -525.4833]);
export const MARDOU_PET_BED_PLACEMENT = {
  position: petBedFloorPoint,
  rotation: [0, 0, 0] as Vec3,
} as const;

export const MARDOU_EXTERIOR_FOCUS: MuseumFocus = {
  // Bias the composition toward the two-storey glass facade and entrance.
  // Keep the curved masonry wing as context, but let the building fill more
  // of the frame than the old distant view, which was mostly sky and lawn.
  target: [2.2, 2.25, -4.3],
  camera: [8.7, 5, 21.2],
  fov: 46,
};

// At eye height x=2 is the only clear front-to-back opening in the facade.
// The old x=0 route intersected the curved wall at z~=12.7.
export const MARDOU_ENTRANCE_ROUTE = {
  outside: [2.5, 1.5, 13.8] as Vec3,
  threshold: [2, 1.5, 8] as Vec3,
  gallery: [2, 1.5, -2] as Vec3,
  introApproach: MARDOU_LOBBY_INTRO_ROUTE.arrival,
  exitTargets: [
    [-2.5, 1.5, -14],
    [1.5, 1.5, -6],
    [2, 1.6, 1.7],
    [2, 1.8, 7.2],
    MARDOU_EXTERIOR_FOCUS.target,
  ] as ReadonlyArray<Vec3>,
  entryTargets: [
    [2, 1.7, 8],
    [2, 1.55, -2],
    [-1, 1.5, -7],
    [-2.5, 1.55, -14],
  ] as ReadonlyArray<Vec3>,
  // This route travels more than 36m from the exterior establishing camera.
  // The former 5.2s pass peaked at a drone-like speed and made the doorway
  // turn feel abrupt; 7.4s keeps the reveal responsive while remaining calm.
  duration: 7.4,
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
  // Keep the camera roughly at standing eye height above the corresponding
  // tread. The previous 2.05m waypoint left less than 0.6m of vertical room
  // and visually drove the lens through the white steps.
  lowerFlight: [0.45, 2.9, -8.753] as Vec3,
  landing: [1.9, 3.58, -8.753] as Vec3,
  upperFlight: [3.25, 4.48, -8.753] as Vec3,
  galleryEntry: [4.55, 4.8, -9.05] as Vec3,
  arrival: MARDOU_PRIVATE_FOCUS.camera,
  ascentTargets: [
    [0.3, 2.4, -13],
    [3.2, 3.7, -12],
    [4.8, 4.5, -13],
    [4.2, 4.4, -13.5],
    [2.4, 4.5, -13.8],
  ] as ReadonlyArray<Vec3>,
  descentTargets: [
    [0.5, 3.7, -8.753],
    [-0.8, 2.8, -8.753],
    [-2.5, 1.8, -10],
    [-2.8, 1.7, -12],
    [-1.5, 1.5, -14],
  ] as ReadonlyArray<Vec3>,
  duration: 11.6,
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
const skillsPoint = floorObjectPoint(MARDOU_CONTENT_SOURCE_POINTS.skills);
const achievementTrophyPoint = floorObjectPoint([-22.6004, -16.2896, -507.135]);

export const MARDOU_PROFILE_PLACEMENT = placement(
  profilePoint,
  [0, 0, 0],
  [profilePoint[0], profilePoint[1], profilePoint[2] + 3],
);

export const MARDOU_ACHIEVEMENT_PLACEMENT: MuseumPlacement = {
  position: achievementTrophyPoint,
  rotation: [0, 0, 0],
  focus: {
    // The placement point is the center of the whole object group, while the
    // visible cup sits lower. Aim at the trophy body so the base and handles
    // remain in frame instead of cropping against the bottom edge.
    target: [achievementTrophyPoint[0], 1.12, achievementTrophyPoint[2]],
    // This clear front aisle gives a straight three-quarter view. The former
    // left-side camera was too close and placed a wall across half the frame.
    camera: [-3, 1.68, -5.5],
    fov: 52,
  },
};

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
      // Every project is viewed from its own front aisle. The third island
      // uses the nearest audited clear point (x=3, 2.8m forward): matching its
      // exact x would leave only 0.8m to structure, while the old side camera
      // made project 2 dominate the foreground.
      camera: (sourcePoint === MARDOU_CONTENT_SOURCE_POINTS.project5
        ? [3, 1.5, position[2] + 2.8]
        : [position[0], 1.5, position[2] + 3]) as Vec3,
      fov: 48,
    },
  };
});

// The third island sits across the lobby from the default camera. A direct
// diagonal cuts behind the central column and brushes the neighboring screen;
// these clear aisle points keep the entire approach in front of the islands.
export const MARDOU_FAR_PROJECT_FOCUS_ROUTE = [
  [-3.5, 1.65, -14] as Vec3,
  [0.5, 1.65, -14] as Vec3,
] as const;

export function mardouProjectPlacementsForCount(count: number) {
  if (count <= 0) return [];
  if (count === 1) return [MARDOU_PROJECT_PLACEMENTS[1]];
  if (count === 2) return [MARDOU_PROJECT_PLACEMENTS[1], MARDOU_PROJECT_PLACEMENTS[2]];
  return MARDOU_PROJECT_PLACEMENTS;
}

const privateDisplaySourcePoints: ReadonlyArray<Vec3> = [
  [-1.0515, -0.3973, -548.776],
  [-2.5128, -0.3973, -572.8986],
  [-24.6604, -0.3973, -550.994],
  [-18.4265, -0.3973, -567.9006],
  [9.6064, -0.3973, -561.8214],
];
const privateGalleryCenter: Vec3 = [-1.45, 4.8, -19.55];

function inwardFacingPrivatePlacement(sourcePoint: Vec3): MuseumPlacement {
  const position = floorObjectPoint(sourcePoint);
  const deltaX = privateGalleryCenter[0] - position[0];
  const deltaZ = privateGalleryCenter[2] - position[2];
  const length = Math.max(0.001, Math.hypot(deltaX, deltaZ));
  const normalX = deltaX / length;
  const normalZ = deltaZ / length;
  return placement(
    position,
    [0, Math.atan2(normalX, normalZ), 0],
    [position[0] + normalX * 3, 4.8, position[2] + normalZ * 3],
  );
}

// Education remains on the upper gallery. Achievements are represented by a
// dedicated trophy at the separately supplied ground-floor point above.
export const MARDOU_PRIVATE_SURFACE_PLACEMENTS: MuseumPlacement[] = privateDisplaySourcePoints.map(
  inwardFacingPrivatePlacement,
);

export function mardouCreativeCornerPlacementForPrivateCount(privateSurfaceCount: number): MuseumPlacement | undefined {
  return MARDOU_PRIVATE_SURFACE_PLACEMENTS[privateSurfaceCount];
}

export const MARDOU_EDUCATION_PLACEMENT = MARDOU_PRIVATE_SURFACE_PLACEMENTS[0];

export const MARDOU_SURFACE_PLACEMENTS: MuseumPlacement[] = [
  MARDOU_PROFILE_PLACEMENT,
  MARDOU_ACHIEVEMENT_PLACEMENT,
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

const privateDiaryFloorPoint = mardouSourcePointToWorld([21.6668, -0.3973, -546.3062]);
const privateDiaryFacingX = privateGalleryCenter[0] - privateDiaryFloorPoint[0];
const privateDiaryFacingZ = privateGalleryCenter[2] - privateDiaryFloorPoint[2];
const privateDiaryFacingLength = Math.max(0.001, Math.hypot(privateDiaryFacingX, privateDiaryFacingZ));
const privateDiaryNormal: Vec3 = [
  privateDiaryFacingX / privateDiaryFacingLength,
  0,
  privateDiaryFacingZ / privateDiaryFacingLength,
];
export const MARDOU_DIARY_POSITION: Vec3 = privateDiaryFloorPoint;
export const MARDOU_DIARY_ROTATION: Vec3 = [0, Math.atan2(privateDiaryNormal[0], privateDiaryNormal[2]), 0];
export const MARDOU_DIARY_FOCUS: MuseumFocus = {
  target: [privateDiaryFloorPoint[0], privateDiaryFloorPoint[1] + 0.85, privateDiaryFloorPoint[2]],
  camera: [
    privateDiaryFloorPoint[0] + privateDiaryNormal[0] * 3.2,
    4.8,
    privateDiaryFloorPoint[2] + privateDiaryNormal[2] * 3.2,
  ],
  fov: 48,
};

const defaultCreativeCornerSlot = MARDOU_PRIVATE_SURFACE_PLACEMENTS[4];
export const MARDOU_CREATIVE_CORNER_POSITION: Vec3 = [
  defaultCreativeCornerSlot.position[0],
  defaultCreativeCornerSlot.position[1] - FLOOR_OBJECT_CENTER_LIFT,
  defaultCreativeCornerSlot.position[2],
];
