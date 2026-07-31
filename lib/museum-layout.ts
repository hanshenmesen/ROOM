import type { Vec3 } from "./types";

export const MUSEUM_MODEL_URL = "/vendor/conference-room/conference_room1.glb";
export const FLOOR_HEIGHT = 4.5;
export const EYE_HEIGHT = 1.62;

export type MuseumRoomId = "room-lobby" | "room-private-entry" | "room-private";

export type MuseumAnchor = {
  id: string;
  position: Vec3;
  rotation: Vec3;
  focusCamera: Vec3;
  focusTarget: Vec3;
};

// Derived from conference_room1.glb with transformed accessor bounds and
// downward raycasts. The main hall floor is y=0, ceiling is y=4.25, and its
// enclosing walls sit at x=+/-5.875 and z=+/-3.875. The inset below keeps the
// camera body and generated objects away from wall thickness.
export const WALK_BOUNDS = {
  minX: -5.3,
  maxX: 5.3,
  minZ: -3.3,
  maxZ: 3.3,
};

export const PUBLIC_START: Vec3 = [0, EYE_HEIGHT, 3.05];
export const PUBLIC_START_TARGET: Vec3 = [0, 1.45, -1.1];
export const SECOND_FLOOR_ENTRY: Vec3 = [1.6, FLOOR_HEIGHT + EYE_HEIGHT, 2.9];
export const SECOND_FLOOR_ENTRY_TARGET: Vec3 = [3.8, FLOOR_HEIGHT + 1.7, 0.82];
export const PRIVATE_START: Vec3 = [3.75, FLOOR_HEIGHT + EYE_HEIGHT, 0.05];
export const PRIVATE_START_TARGET: Vec3 = [0, FLOOR_HEIGHT + 1.35, -1.2];

export const PUBLIC_ANCHORS: MuseumAnchor[] = [
  {
    id: "showroom-profile",
    position: [-4.2, 1.8, -3.66],
    rotation: [0, 0, 0],
    focusCamera: [-4.2, 1.62, -0.82],
    focusTarget: [-4.2, 1.8, -3.66],
  },
  {
    id: "showroom-journey",
    position: [-1.4, 1.8, -3.66],
    rotation: [0, 0, 0],
    focusCamera: [-1.4, 1.62, -0.82],
    focusTarget: [-1.4, 1.8, -3.66],
  },
  {
    id: "showroom-skills",
    position: [1.4, 1.8, -3.66],
    rotation: [0, 0, 0],
    focusCamera: [1.4, 1.62, -0.82],
    focusTarget: [1.4, 1.8, -3.66],
  },
  {
    id: "showroom-contact",
    position: [4.2, 1.8, -3.66],
    rotation: [0, 0, 0],
    focusCamera: [4.2, 1.62, -0.82],
    focusTarget: [4.2, 1.8, -3.66],
  },
  {
    id: "showroom-highlights",
    position: [5.66, 1.75, -1.35],
    rotation: [0, -Math.PI / 2, 0],
    focusCamera: [3.42, 1.62, -1.35],
    focusTarget: [5.66, 1.75, -1.35],
  },
  {
    id: "showroom-guestbook",
    position: [5.66, 1.75, 1.35],
    rotation: [0, -Math.PI / 2, 0],
    focusCamera: [3.42, 1.62, 1.35],
    focusTarget: [5.66, 1.75, 1.35],
  },
];

export const PROJECT_ANCHORS: Array<{ position: Vec3; focusCamera: Vec3; focusTarget: Vec3 }> = [
  { position: [-3.3, 0, 0.45], focusCamera: [-3.3, 1.58, 2.45], focusTarget: [-3.3, 1.05, 0.45] },
  { position: [-1.1, 0, 0.45], focusCamera: [-1.1, 1.58, 2.45], focusTarget: [-1.1, 1.05, 0.45] },
  { position: [1.1, 0, 0.45], focusCamera: [1.1, 1.58, 2.45], focusTarget: [1.1, 1.05, 0.45] },
  { position: [3.3, 0, 0.45], focusCamera: [3.3, 1.58, 2.45], focusTarget: [3.3, 1.05, 0.45] },
];

export const FLOOR_PORTAL_POSITION: Vec3 = [4.72, 0, 2.65];
export const PRIVATE_GATE_POSITION: Vec3 = [3.8, FLOOR_HEIGHT, 0.92];
export const DIARY_DESK_POSITION: Vec3 = [-0.35, FLOOR_HEIGHT, -1.45];

export const PUBLIC_COLLIDERS = PROJECT_ANCHORS.map(({ position }) => ({
  minX: position[0] - 0.78,
  maxX: position[0] + 0.78,
  minZ: position[2] - 0.72,
  maxZ: position[2] + 0.72,
}));

export const PRIVATE_COLLIDERS = [
  { minX: -1.95, maxX: 1.25, minZ: -2.25, maxZ: -0.65 },
];

export function floorOffsetFor(roomId: string) {
  return roomId === "room-lobby" ? 0 : FLOOR_HEIGHT;
}
