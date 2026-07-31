import fs from "node:fs";
import path from "node:path";
import * as THREE from "three";
import {
  MARDOU_CREATIVE_CORNER_POSITION,
  MARDOU_DIARY_FOCUS,
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
} from "../components/MardouMuseumLayout.ts";

const MODEL_PATH = path.resolve("public/vendor/mardou/MardouMuseumResult.glb");
const MODEL_WIDTH = 104.61412811279297;
const MODEL_MIN_Y = -17.48150634765625;
const MODEL_CENTER_Z = -500;
const SCALE = 21.6 / MODEL_WIDTH;
const MODEL_MATRIX = new THREE.Matrix4().compose(
  new THREE.Vector3(0, -MODEL_MIN_Y * SCALE, -7 - MODEL_CENTER_Z * SCALE),
  new THREE.Quaternion(),
  new THREE.Vector3(SCALE, SCALE, SCALE),
);

function readGlb(file) {
  const data = fs.readFileSync(file);
  let offset = 12;
  let document;
  let binary;
  while (offset < data.length) {
    const length = data.readUInt32LE(offset);
    const type = data.readUInt32LE(offset + 4);
    const chunk = data.subarray(offset + 8, offset + 8 + length);
    if (type === 0x4e4f534a) document = JSON.parse(chunk.toString("utf8"));
    if (type === 0x004e4942) binary = chunk;
    offset += 8 + length;
  }
  if (!document || !binary) throw new Error("GLB is missing JSON or BIN data");
  return { document, binary };
}

function accessorArray(document, binary, accessorIndex) {
  const accessor = document.accessors[accessorIndex];
  const view = document.bufferViews[accessor.bufferView];
  const itemSize = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[accessor.type];
  const component = {
    5121: { bytes: 1, Array: Uint8Array, read: "getUint8" },
    5123: { bytes: 2, Array: Uint16Array, read: "getUint16" },
    5125: { bytes: 4, Array: Uint32Array, read: "getUint32" },
    5126: { bytes: 4, Array: Float32Array, read: "getFloat32" },
  }[accessor.componentType];
  if (!itemSize || !component) throw new Error(`Unsupported accessor ${accessorIndex}`);
  const array = new component.Array(accessor.count * itemSize);
  const byteOffset = (view.byteOffset || 0) + (accessor.byteOffset || 0);
  const byteStride = view.byteStride || component.bytes * itemSize;
  const dataView = new DataView(binary.buffer, binary.byteOffset, binary.byteLength);
  for (let row = 0; row < accessor.count; row += 1) {
    for (let column = 0; column < itemSize; column += 1) {
      array[row * itemSize + column] = dataView[component.read](
        byteOffset + row * byteStride + column * component.bytes,
        true,
      );
    }
  }
  return { array, itemSize };
}

function nodeMatrix(node) {
  if (node.matrix) return new THREE.Matrix4().fromArray(node.matrix);
  return new THREE.Matrix4().compose(
    new THREE.Vector3(...(node.translation || [0, 0, 0])),
    new THREE.Quaternion(...(node.rotation || [0, 0, 0, 1])),
    new THREE.Vector3(...(node.scale || [1, 1, 1])),
  );
}

function buildMeshes(document, binary) {
  const meshes = [];
  function visit(nodeIndex, parentMatrix) {
    const node = document.nodes[nodeIndex];
    const worldMatrix = parentMatrix.clone().multiply(nodeMatrix(node));
    if (node.mesh !== undefined) {
      const sourceMesh = document.meshes[node.mesh];
      sourceMesh.primitives.forEach((primitive, primitiveIndex) => {
        const position = accessorArray(document, binary, primitive.attributes.POSITION);
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.BufferAttribute(position.array, position.itemSize));
        if (primitive.indices !== undefined) {
          const indices = accessorArray(document, binary, primitive.indices);
          geometry.setIndex(new THREE.BufferAttribute(indices.array, indices.itemSize));
        }
        const mesh = new THREE.Mesh(
          geometry,
          new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
        );
        mesh.name = `${node.name || sourceMesh.name || `mesh-${node.mesh}`}:${primitiveIndex}`;
        mesh.applyMatrix4(MODEL_MATRIX.clone().multiply(worldMatrix));
        mesh.updateMatrixWorld(true);
        meshes.push(mesh);
      });
    }
    (node.children || []).forEach((child) => visit(child, worldMatrix));
  }
  const identity = new THREE.Matrix4();
  document.scenes[document.scene || 0].nodes.forEach((node) => visit(node, identity));
  return meshes;
}

const { document, binary } = readGlb(MODEL_PATH);
const meshes = buildMeshes(document, binary);
const floorMeshes = meshes.filter((mesh) => mesh.name.startsWith("Floor:"));
const obstacleMeshes = meshes.filter((mesh) => !/^(Floor|Ceiling):/.test(mesh.name));
const raycaster = new THREE.Raycaster();
const MIN_CLEARANCE = 1.2;
const ROUTE_SAMPLE_STEPS = 10;

function intersections(origin, direction, targets) {
  raycaster.set(origin, direction.clone().normalize());
  return raycaster.intersectObjects(targets, false);
}

function floorAt(x, z, maxY = 8) {
  const hits = intersections(new THREE.Vector3(x, maxY, z), new THREE.Vector3(0, -1, 0), floorMeshes);
  return hits.find((hit) => hit.point.y > -0.2)?.point.y;
}

function horizontalClearance(x, y, z) {
  const origin = new THREE.Vector3(x, y, z);
  const directions = [
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(-1, 0, 0),
    new THREE.Vector3(0, 0, 1),
    new THREE.Vector3(0, 0, -1),
  ];
  return Math.min(...directions.map((direction) => {
    const hit = intersections(origin, direction, obstacleMeshes)[0];
    return hit?.distance ?? Infinity;
  }));
}

function describePoint([x, y, z]) {
  const floor = floorAt(x, z, y + 0.05);
  const clearance = horizontalClearance(x, y, z);
  return {
    point: [x, y, z],
    floor: floor === undefined ? null : Number(floor.toFixed(3)),
    clearance: Number.isFinite(clearance) ? Number(clearance.toFixed(3)) : null,
  };
}

function cameraCurve(points) {
  return new THREE.CatmullRomCurve3(
    points.map((point) => new THREE.Vector3(...point)),
    false,
    "centripetal",
  );
}

function lobbyIntroCurve(points) {
  const curve = new THREE.CurvePath();
  curve.add(cameraCurve(points.slice(0, 3)));
  curve.add(cameraCurve(points.slice(2)));
  return curve;
}

const authoredRoutes = [
  {
    name: "lobby intro 1 -> 2 -> 3",
    requiresFloor: () => true,
    curve: lobbyIntroCurve,
    points: [
      MARDOU_LOBBY_INTRO_ROUTE.spawn,
      MARDOU_LOBBY_INTRO_ROUTE.turn,
      MARDOU_LOBBY_INTRO_ROUTE.waypoint,
      MARDOU_LOBBY_INTRO_ROUTE.galleryTurn,
      MARDOU_LOBBY_FOCUS.camera,
    ],
  },
  {
    name: "exterior -> lobby",
    // The supplied GLB has no exterior ground mesh. Require floor support
    // once this route reaches the modeled gallery, while still checking
    // horizontal clearance for every exterior sample.
    requiresFloor: (point) => point[2] <= MARDOU_ENTRANCE_ROUTE.gallery[2],
    points: [
      MARDOU_EXTERIOR_FOCUS.camera,
      MARDOU_ENTRANCE_ROUTE.outside,
      MARDOU_ENTRANCE_ROUTE.threshold,
      MARDOU_ENTRANCE_ROUTE.gallery,
      MARDOU_LOBBY_FOCUS.camera,
    ],
  },
  {
    name: "lobby -> exterior",
    requiresFloor: (point) => point[2] <= MARDOU_ENTRANCE_ROUTE.gallery[2],
    points: [
      MARDOU_LOBBY_FOCUS.camera,
      MARDOU_ENTRANCE_ROUTE.gallery,
      MARDOU_ENTRANCE_ROUTE.threshold,
      MARDOU_ENTRANCE_ROUTE.outside,
      MARDOU_EXTERIOR_FOCUS.camera,
    ],
  },
  {
    name: "lobby -> private",
    requiresFloor: () => true,
    points: [
      MARDOU_LOBBY_FOCUS.camera,
      MARDOU_PRIVATE_ROUTE.lobbyApproach,
      MARDOU_PRIVATE_ROUTE.ground,
      MARDOU_PRIVATE_ROUTE.stairs,
      MARDOU_PRIVATE_ROUTE.landing,
      MARDOU_PRIVATE_FOCUS.camera,
    ],
  },
  {
    name: "private -> lobby",
    requiresFloor: () => true,
    points: [
      MARDOU_PRIVATE_FOCUS.camera,
      MARDOU_PRIVATE_ROUTE.landing,
      MARDOU_PRIVATE_ROUTE.stairs,
      MARDOU_PRIVATE_ROUTE.ground,
      MARDOU_PRIVATE_ROUTE.lobbyApproach,
      MARDOU_LOBBY_FOCUS.camera,
    ],
  },
];

const routeSamples = authoredRoutes.flatMap(({ name, points, requiresFloor, minimumClearance = MIN_CLEARANCE, curve: curveFactory }) => {
  const curve = curveFactory ? curveFactory(points) : cameraCurve(points);
  const curveSamples = Array.from({ length: ROUTE_SAMPLE_STEPS + 1 }, (_, index) => index / ROUTE_SAMPLE_STEPS).map((t) => {
    const point = curve.getPoint(t).toArray();
    return { name, t, point, requiresFloor: requiresFloor(point), minimumClearance };
  });
  const waypointSamples = points.map((point, index) => ({
    name,
    t: index / (points.length - 1),
    point: [...point],
    requiresFloor: requiresFloor(point),
    minimumClearance,
    waypoint: index + 1,
  }));
  return [...curveSamples, ...waypointSamples];
});

const candidates = [
  [-4.408, 1.5, -11.169],
  [0, 1.66, 2.7],
  [-3.7, 1.5, -3.35],
  [3.7, 1.5, -3.35],
  [-3.7, 1.5, -7.85],
  [3.7, 1.5, -7.85],
  [-10.58, 1.7, 2.5],
  [8.45, 1.5, -16.5],
  [-7, 1.5, -10],
  [-4.5, 1.5, -8],
  [0, 1.5, -8],
  [5, 1.5, -10],
  [-7, 1.5, -14],
  [-3.5, 1.5, -15],
  [0.5, 1.5, -15],
  [4, 1.5, -14],
  [-7, 1.5, -20],
  [-3, 1.5, -20],
  [1, 1.5, -20],
  [-8.5, 2, -10],
  [-8.5, 2, -16],
  [-7, 2, -22],
  [2, 2, -12],
  [2, 2, -17],
  [2, 2, -22],
  [5, 2, -10],
  [-6, 2, -10],
  [-6, 2, -15],
  [-6, 2, -20],
  [-5, 2, -24],
  [0, 2, -25],
  [6, 2, -10],
  [-3, 2, -23],
  [-3, 2, -24],
  [-1, 2, -24],
  [-7, 1.5, -8],
  [-3.5, 1.5, -8],
  [1, 1.5, -8],
  [5.5, 1.5, -10],
  [0.5, 1.5, -13],
  [5, 1.5, -13],
  [0.5, 1.5, -10.2],
  [5, 1.5, -10.2],
  [0, 4.8, -16],
  [0, 4.8, -20],
  [-5, 4.8, -18],
  [0, 1.5, -10],
  [2.5, 2.5, -12],
  [2.5, 4.8, -15],
  [-5, 1.5, -8],
  [-1.5, 1.5, -8],
  [-8.5, 1.65, -10],
  [6, 1.65, -10],
  [-7, 1.65, -16],
  [2, 1.65, -16],
  [-7, 1.65, -22],
  [2, 1.65, -22],
  [-1, 1.65, -25],
  [6, 1.65, -16],
  [3, 1.5, -16],
  [4, 1.65, -18],
  [1, 1.5, -18],
  [2, 1.65, -25],
  [2, 1.5, -21.8],
  [5, 1.65, -16],
  [2, 1.5, -16],
  [3.5, 1.65, -20],
  [0.5, 1.5, -20],
  [-5, 1.5, -5.2],
  [-1.5, 1.5, -5.2],
  [-3, 1.5, -5.5],
  [5, 4.8, -18],
  [4, 4.8, -16],
  [-5, 4.8, -22],
  [2, 1.5, 13.8],
  [2, 1.5, 8],
  [2, 1.5, -2],
  [0, 1.5, -8],
];

console.log("candidate clearance");
console.table(candidates.map(describePoint));
console.log("\nground-floor plan: '.' clear ground, 'x' within 1m of structure, blank no floor below y=1.55");
for (let z = -26; z <= 12; z += 2) {
  let row = `${String(z).padStart(3)} `;
  for (let x = -10; x <= 10; x += 1) {
    const floor = floorAt(x, z, 1.55);
    if (floor === undefined) row += " ";
    else row += horizontalClearance(x, 1.5, z) < 1 ? "x" : ".";
  }
  console.log(row);
}
console.log("    " + Array.from({ length: 21 }, (_, index) => Math.abs(index - 10) % 5 === 0 ? "|" : " ").join(""));
console.log("    x=-10          0         10");
console.log("\nupper-floor plan: '.' clear floor below y=5.2, 'x' within 1m of structure");
for (let z = -26; z <= 12; z += 2) {
  let row = `${String(z).padStart(3)} `;
  for (let x = -10; x <= 10; x += 1) {
    const floor = floorAt(x, z, 5.2);
    if (floor === undefined || floor < 2.5) row += " ";
    else row += horizontalClearance(x, 4.8, z) < 1 ? "x" : ".";
  }
  console.log(row);
}

const verifiedPoints = [
  { name: "lobby camera", point: MARDOU_LOBBY_FOCUS.camera },
  { name: "private camera", point: MARDOU_PRIVATE_FOCUS.camera },
  { name: "private route ground", point: MARDOU_PRIVATE_ROUTE.ground },
  { name: "private route stairs", point: MARDOU_PRIVATE_ROUTE.stairs },
  { name: "private route landing", point: MARDOU_PRIVATE_ROUTE.landing },
  { name: "guestbook", point: MARDOU_GUESTBOOK_PLACEMENT.position },
  { name: "guestbook camera", point: MARDOU_GUESTBOOK_PLACEMENT.focus.camera },
  { name: "source archive", point: MARDOU_SOURCE_ARCHIVE_PLACEMENT.focus.target },
  { name: "source archive camera", point: MARDOU_SOURCE_ARCHIVE_PLACEMENT.focus.camera },
  { name: "diary camera", point: MARDOU_DIARY_FOCUS.camera },
  { name: "creative corner", point: [MARDOU_CREATIVE_CORNER_POSITION[0], 4.8, MARDOU_CREATIVE_CORNER_POSITION[2]] },
  ...MARDOU_PROJECT_PLACEMENTS.flatMap((placement, index) => [
    { name: `project ${index + 1}`, point: [placement.position[0], 1.5, placement.position[2]] },
    { name: `project camera ${index + 1}`, point: placement.focus.camera },
  ]),
  ...MARDOU_SURFACE_PLACEMENTS.flatMap((placement, index) => [
    { name: `surface ${index + 1}`, point: placement.position },
    { name: `surface camera ${index + 1}`, point: placement.focus.camera },
  ]),
];

const pointFailures = verifiedPoints.flatMap(({ name, point }) => {
  const floor = floorAt(point[0], point[2], point[1] + 0.05);
  const clearance = horizontalClearance(...point);
  const reasons = [];
  if (floor === undefined) reasons.push("no supporting floor below point");
  if (clearance < MIN_CLEARANCE) reasons.push(`structure clearance ${clearance.toFixed(3)} < ${MIN_CLEARANCE}`);
  return reasons.map((reason) => `${name}: ${reason}`);
});

const routeFailures = routeSamples.flatMap(({ name, t, point, requiresFloor, minimumClearance, waypoint }) => {
  const floor = floorAt(point[0], point[2], point[1] + 0.05);
  const clearance = horizontalClearance(...point);
  const reasons = [];
  if (requiresFloor && floor === undefined) reasons.push("no supporting floor below point");
  if (clearance < minimumClearance) reasons.push(`structure clearance ${clearance.toFixed(3)} < ${minimumClearance}`);
  const location = waypoint ? `waypoint ${waypoint}` : `at t=${t.toFixed(1)}`;
  return reasons.map((reason) => `${name} ${location} [${point.map((value) => value.toFixed(3)).join(", ")}]: ${reason}`);
});

const failures = [...pointFailures, ...routeFailures];

if (failures.length) {
  throw new Error(`Mardou placement audit failed:\n${failures.join("\n")}`);
}
console.log(`\nverified ${verifiedPoints.length} authored points with floor support and >= ${MIN_CLEARANCE} structure clearance`);
console.log(`verified ${authoredRoutes.length} authored camera routes against their clearance limits at t=0.0..1.0 in 0.1 steps plus every named waypoint`);
console.table(authoredRoutes.map(({ name }) => {
  const samples = routeSamples.filter((sample) => sample.name === name);
  const minimum = samples.reduce((lowest, sample) => {
    const clearance = horizontalClearance(...sample.point);
    return clearance < lowest.clearance ? { t: sample.t, clearance } : lowest;
  }, { t: 0, clearance: Infinity });
  return {
    route: name,
    minimumClearance: Number.isFinite(minimum.clearance) ? Number(minimum.clearance.toFixed(3)) : null,
    atT: minimum.t.toFixed(1),
  };
}));

console.log("\nfront approach first obstacle at eye height (larger negative Z means a deeper opening)");
console.table(Array.from({ length: 21 }, (_, index) => {
  const x = index - 10;
  const hit = intersections(new THREE.Vector3(x, 1.5, 15), new THREE.Vector3(0, 0, -1), obstacleMeshes)[0];
  return { x, firstHitZ: hit ? Number(hit.point.z.toFixed(3)) : null };
}));
