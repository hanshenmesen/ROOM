import type { Vec3 } from "./types.ts";

export type MuseumStage = "exterior" | "museum-ground" | "private-landing" | "private-room";

export type CameraPose = {
  position: Vec3;
  target: Vec3;
  fov: number;
};

export type MuseumRenderPoint = {
  id: number;
  mesh: "Floor" | "Walls";
  sourcePosition: Vec3;
  normal: Vec3;
  position: Vec3;
};

const MODEL_POSITION: Vec3 = [0, 2.606, 80];
const MODEL_SCALE = 0.16;

const SOURCE_RENDER_POINTS = [
  { id: 3, mesh: "Floor", sourcePosition: [-36.0462, -16.2896, -462.5818], normal: [0, 1, 0] },
  { id: 4, mesh: "Floor", sourcePosition: [-37.6473, -16.2896, -505.5981], normal: [0, 1, 0] },
  { id: 5, mesh: "Floor", sourcePosition: [-34.4245, -16.2896, -533.7077], normal: [0, 1, 0] },
  { id: 6, mesh: "Floor", sourcePosition: [-8.9845, -16.2896, -542.2193], normal: [0, 1, 0] },
  { id: 7, mesh: "Floor", sourcePosition: [7.8265, -16.2896, -535.9076], normal: [0, 1, 0] },
  { id: 8, mesh: "Floor", sourcePosition: [10.9201, -16.2896, -518.5245], normal: [0, 1, 0] },
  { id: 9, mesh: "Walls", sourcePosition: [-4.7073, -15.5844, -508.3875], normal: [-1, 0, 0] },
  { id: 10, mesh: "Floor", sourcePosition: [-13.8388, -0.3973, -556.7623], normal: [0, 1, 0] },
] as const;

export function museumModelPointToWorld([x, y, z]: Vec3): Vec3 {
  return [
    x * MODEL_SCALE + MODEL_POSITION[0],
    y * MODEL_SCALE + MODEL_POSITION[1],
    z * MODEL_SCALE + MODEL_POSITION[2],
  ];
}

export const MUSEUM_RENDER_POINTS: MuseumRenderPoint[] = SOURCE_RENDER_POINTS.map((point) => ({
  id: point.id,
  mesh: point.mesh,
  sourcePosition: [...point.sourcePosition] as Vec3,
  normal: [...point.normal] as Vec3,
  position: museumModelPointToWorld([...point.sourcePosition] as Vec3),
}));

const GROUND_RENDER_POINTS = MUSEUM_RENDER_POINTS.filter((point) => point.mesh === "Floor" && point.position[1] < 1);
const UPPER_RENDER_POINT = MUSEUM_RENDER_POINTS.find((point) => point.id === 10)!;
const GROUND_CAMERA_POINT = GROUND_RENDER_POINTS[0];
const GROUND_EXHIBIT_POINTS = GROUND_RENDER_POINTS.slice(1);
const GROUND_CAMERA_TARGET: Vec3 = [
  GROUND_EXHIBIT_POINTS[1].position[0],
  0.9,
  GROUND_EXHIBIT_POINTS[1].position[2],
];

export const MUSEUM_LAYOUT = {
  model: {
    url: "/vendor/mardou/MardouMuseumResult.glb",
    position: MODEL_POSITION,
    rotation: [0, 0, 0] as Vec3,
    scale: MODEL_SCALE,
  },
  bounds: {
    groundCenter: [0, 0, 0] as Vec3,
    groundSize: [16.7, 0.3, 32] as Vec3,
    privateCenter: [5, 2.65, -9.5] as Vec3,
    privateSize: [6, 2.6, 7] as Vec3,
  },
  portal: [5, 3.75, -6] as Vec3,
  camera: {
    exterior: { position: [0, 1.08, 22.5], target: [0, 3.1, 5.6], fov: 45 },
    ground: {
      position: [GROUND_CAMERA_POINT.position[0], 1.58, GROUND_CAMERA_POINT.position[2]],
      target: GROUND_CAMERA_TARGET,
      fov: 57,
    },
    landing: {
      position: [UPPER_RENDER_POINT.position[0], UPPER_RENDER_POINT.position[1] + 1.02, UPPER_RENDER_POINT.position[2] + 2.65],
      target: [5, 3.7, -6.35],
      fov: 57,
    },
    privateRoom: { position: [5, 3.7, -7.45], target: [5, 3.45, -11.1], fov: 52 },
    stairStart: [0, 1.66, 0.3] as Vec3,
    stairMid: [0.35, 2.45, -2.4] as Vec3,
  } satisfies Record<string, CameraPose | Vec3>,
  authored: {
    "showroom-profile": { position: [-6.3, 0, -11.8], camera: [-3.8, 1.6, -11.8], target: [-6.3, 1.35, -11.8] },
    "showroom-journey": { position: [-2.4, 0, -12.6], camera: [-2.4, 1.66, -9.4], target: [-2.4, 1.25, -12.6] },
    "showroom-skills": { position: [2.4, 0, -12.6], camera: [2.4, 1.66, -9.4], target: [2.4, 1.25, -12.6] },
    "showroom-contact": { position: [6.3, 0, -11.8], camera: [3.8, 1.6, -11.8], target: [6.3, 1.15, -11.8] },
    "showroom-highlights": { position: [6.5, 0, 11.6], camera: [4.1, 1.6, 11.6], target: [6.5, 1.2, 11.6] },
    "showroom-guestbook": { position: [-6.5, 0, 11.6], camera: [-4.1, 1.6, 11.6], target: [-6.5, 1.2, 11.6] },
    "bedroom-diary": { position: [5, 2.65, -11.2], camera: [5, 3.65, -8.2], target: [5, 3.45, -11.2] },
  },
} as const;

const PROJECT_SLOTS: Vec3[] = [
  ...GROUND_EXHIBIT_POINTS.map((point) => point.position),
  [UPPER_RENDER_POINT.position[0] - 2.2, UPPER_RENDER_POINT.position[1], UPPER_RENDER_POINT.position[2]],
  [UPPER_RENDER_POINT.position[0] + 2.2, UPPER_RENDER_POINT.position[1], UPPER_RENDER_POINT.position[2]],
  GROUND_CAMERA_POINT.position,
];

export function museumProjectPosition(index: number): Vec3 {
  return PROJECT_SLOTS[index] || [((index % 7) - 3) * 1.8, 2.65, 5.5 + Math.floor(index / 7) * 2.3];
}

export function museumExhibitPosition(index: number): Vec3 {
  const columns = 9;
  const column = index % columns;
  const row = Math.floor(index / columns);
  return [(column - 4) * 1.55, 0.42, 8.4 + row * 2.55];
}

export function isMuseumStage(value: string): value is MuseumStage {
  return value === "exterior" || value === "museum-ground" || value === "private-landing" || value === "private-room";
}
