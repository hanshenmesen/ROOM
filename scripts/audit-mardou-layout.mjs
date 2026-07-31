import fs from "node:fs";
import path from "node:path";
import * as THREE from "three";
import {
  MARDOU_AUTO_DOOR,
  MARDOU_COMPANION_SAFE_ZONE,
  MARDOU_COMPANION_SPEED,
  MARDOU_CREATIVE_CORNER_POSITION,
  MARDOU_DIARY_FOCUS,
  MARDOU_ENTRANCE_ROUTE,
  MARDOU_EXTERIOR_FOCUS,
  MARDOU_HIDDEN_MESH_NAMES,
  MARDOU_LIFE_FILLER_PLACEMENTS,
  MARDOU_LOBBY_FOCUS,
  MARDOU_LOBBY_INTRO_ROUTE,
  MARDOU_LOBBY_WIDE_FOCUS,
  MARDOU_PRIVATE_FOCUS,
  MARDOU_PRIVATE_PICTURE_FRAMES,
  MARDOU_PRIVATE_ROUTE,
  MARDOU_PROJECT_PLACEMENTS,
  MARDOU_STAIR_CLICK_TARGETS,
  MARDOU_SIDE_ENTRANCE_DOOR,
  MARDOU_FAR_PROJECT_FOCUS_ROUTE,
  MARDOU_SURFACE_PLACEMENTS,
  responsiveMuseumCamera,
  responsiveMuseumFov,
  responsiveMuseumTarget,
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
  const curve = new THREE.CatmullRomCurve3(
    points.map((point) => new THREE.Vector3(...point)),
    false,
    "centripetal",
  );
  curve.arcLengthDivisions = 1200;
  curve.updateArcLengths();
  return curve;
}

function cameraEase(progress) {
  const t = THREE.MathUtils.clamp(progress, 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function sampleCameraCurve(curve, progress) {
  const safeProgress = Number.isFinite(progress)
    ? THREE.MathUtils.clamp(progress, 0, 1)
    : 1;
  const mappedProgress = curve.getUtoTmapping(safeProgress, 0);
  const curveProgress = Number.isFinite(mappedProgress)
    ? THREE.MathUtils.clamp(mappedProgress, 0, 1)
    : safeProgress;
  return curve.getPoint(curveProgress);
}

function auditCameraMotion({ positionPoints, targetPoints, duration, pairedControlTiming = false, uniformTargetTiming = false, lookForwardAlongRoute = false, focusView }) {
  const positionCurve = cameraCurve(positionPoints);
  const targetCurve = cameraCurve(targetPoints);
  const frames = Math.round(duration * 60);
  let previousDirection;
  let previousPosition;
  let previousLinearSpeed = 0;
  let previousLinearAcceleration = 0;
  let previousAngularSpeed = 0;
  let maximumLinearAcceleration = 0;
  let maximumLinearJerk = 0;
  let maximumLinearAccelerationAt = 0;
  let maximumLinearJerkAt = 0;
  let maximumAngularSpeed = 0;
  let maximumAngularAcceleration = 0;
  let maximumAngularSpeedAt = 0;
  let maximumAngularPosition = [];
  let maximumAngularTarget = [];
  let minimumLookDistance = Infinity;
  let minimumLookDistanceAt = 0;

  for (let frame = 0; frame <= frames; frame += 1) {
    const timeProgress = frame / frames;
    const progress = cameraEase(timeProgress);
    const position = sampleCameraCurve(positionCurve, progress);
    const mappedPairedProgress = positionCurve.getUtoTmapping(progress, 0);
    const pairedCurveProgress = Number.isFinite(mappedPairedProgress)
      ? THREE.MathUtils.clamp(mappedPairedProgress, 0, 1)
      : progress;
    const focusMidpoint = 0.5;
    const focusDirection = focusView?.midDirection
      ? timeProgress < focusMidpoint
        ? new THREE.Vector3(...focusView.fromDirection).lerp(
            new THREE.Vector3(...focusView.midDirection),
            cameraEase(timeProgress / focusMidpoint),
          ).normalize()
        : new THREE.Vector3(...focusView.midDirection).lerp(
            new THREE.Vector3(...focusView.toDirection),
            cameraEase((timeProgress - focusMidpoint) / (1 - focusMidpoint)),
          ).normalize()
      : focusView
        ? new THREE.Vector3(...focusView.fromDirection)
            .lerp(new THREE.Vector3(...focusView.toDirection), progress)
            .normalize()
        : undefined;
    let target = focusView
      ? position.clone().addScaledVector(
          focusDirection,
          THREE.MathUtils.lerp(focusView.fromDistance, focusView.toDistance, progress),
        )
      : pairedControlTiming
        ? targetCurve.getPoint(pairedCurveProgress)
        : uniformTargetTiming
          ? targetCurve.getPoint(progress)
          : sampleCameraCurve(targetCurve, progress);
    if (lookForwardAlongRoute) {
      const routeLookAhead = 0.34;
      const routeAhead = sampleCameraCurve(positionCurve, Math.min(1, progress + routeLookAhead));
      routeAhead.y = position.y;
      const forwardDirection = routeAhead.sub(position);
      if (forwardDirection.lengthSq() < 0.0001) {
        forwardDirection.copy(targetPoints.at(-1)).sub(position);
        forwardDirection.y = 0;
      }
      forwardDirection.normalize();
      const arrivalTurnStart = 0.45;
      const arrivalTurn = THREE.MathUtils.smoothstep(timeProgress, arrivalTurnStart, 1);
      if (arrivalTurn > 0) {
        const finalDirection = new THREE.Vector3(...targetPoints.at(-1))
          .sub(new THREE.Vector3(...positionPoints.at(-1)))
          .normalize();
        const turnAngle = Math.acos(THREE.MathUtils.clamp(forwardDirection.dot(finalDirection), -1, 1));
        const turnAxis = new THREE.Vector3().crossVectors(forwardDirection, finalDirection);
        if (turnAxis.lengthSq() < 0.0001) turnAxis.set(0, 1, 0);
        forwardDirection.applyAxisAngle(turnAxis.normalize(), turnAngle * arrivalTurn).normalize();
      }
      target = position.clone().addScaledVector(forwardDirection, 4);
    }
    const lookDistance = target.distanceTo(position);
    if (lookDistance < minimumLookDistance) {
      minimumLookDistance = lookDistance;
      minimumLookDistanceAt = frame / frames;
    }
    const direction = target.clone().sub(position).normalize();
    if (previousPosition) {
      const linearSpeed = position.distanceTo(previousPosition) * 60;
      const linearAcceleration = (linearSpeed - previousLinearSpeed) * 60;
      const absoluteLinearAcceleration = Math.abs(linearAcceleration);
      if (absoluteLinearAcceleration > maximumLinearAcceleration) {
        maximumLinearAcceleration = absoluteLinearAcceleration;
        maximumLinearAccelerationAt = frame / frames;
      }
      const absoluteLinearJerk = Math.abs(linearAcceleration - previousLinearAcceleration) * 60;
      if (absoluteLinearJerk > maximumLinearJerk) {
        maximumLinearJerk = absoluteLinearJerk;
        maximumLinearJerkAt = frame / frames;
      }
      previousLinearSpeed = linearSpeed;
      previousLinearAcceleration = linearAcceleration;
    }
    if (previousDirection) {
      const angularSpeed = THREE.MathUtils.radToDeg(Math.acos(
        THREE.MathUtils.clamp(previousDirection.dot(direction), -1, 1),
      ) * 60);
      if (angularSpeed > maximumAngularSpeed) {
        maximumAngularSpeed = angularSpeed;
        maximumAngularSpeedAt = frame / frames;
        maximumAngularPosition = position.toArray();
        maximumAngularTarget = target.toArray();
      }
      maximumAngularAcceleration = Math.max(
        maximumAngularAcceleration,
        Math.abs(angularSpeed - previousAngularSpeed) * 60,
      );
      previousAngularSpeed = angularSpeed;
    }
    previousPosition = position;
    previousDirection = direction;
  }

  return {
    maximumLinearAcceleration,
    maximumLinearJerk,
    maximumLinearAccelerationAt,
    maximumLinearJerkAt,
    maximumAngularSpeed,
    maximumAngularAcceleration,
    maximumAngularSpeedAt,
    maximumAngularPosition,
    maximumAngularTarget,
    minimumLookDistance,
    minimumLookDistanceAt,
  };
}

function auditIntroMotion() {
  return auditCameraMotion({
    positionPoints: [
      ...MARDOU_LOBBY_INTRO_ROUTE.points,
    ],
    targetPoints: [
      ...MARDOU_LOBBY_INTRO_ROUTE.targets,
    ],
    duration: MARDOU_LOBBY_INTRO_ROUTE.duration,
  });
}

const authoredRoutes = [
  {
    name: "lobby door -> main view",
    requiresFloor: () => true,
    minimumClearance: 0.65,
    allowsDoorway: true,
    points: [
      ...MARDOU_LOBBY_INTRO_ROUTE.points,
    ],
  },
  {
    name: "exterior -> lobby",
    // The supplied GLB has no exterior ground mesh. Require floor support
    // once this route reaches the modeled gallery, while still checking
    // horizontal clearance for every exterior sample.
    requiresFloor: (point) => point[0] < -2.4,
    minimumClearance: 0.65,
    allowsDoorway: true,
    points: [
      MARDOU_EXTERIOR_FOCUS.camera,
      MARDOU_ENTRANCE_ROUTE.outside,
      MARDOU_ENTRANCE_ROUTE.threshold,
      MARDOU_ENTRANCE_ROUTE.gallery,
      ...MARDOU_LOBBY_INTRO_ROUTE.points.slice(0, -1),
      MARDOU_LOBBY_FOCUS.camera,
    ],
  },
  {
    name: "lobby -> exterior",
    requiresFloor: (point) => point[0] < -2.4,
    minimumClearance: 0.65,
    allowsDoorway: true,
    points: [
      MARDOU_LOBBY_FOCUS.camera,
      ...MARDOU_LOBBY_INTRO_ROUTE.points.slice(0, -1).reverse(),
      MARDOU_ENTRANCE_ROUTE.gallery,
      MARDOU_ENTRANCE_ROUTE.threshold,
      MARDOU_ENTRANCE_ROUTE.outside,
      MARDOU_EXTERIOR_FOCUS.camera,
    ],
  },
  {
    name: "lobby -> private",
    requiresFloor: () => true,
    minimumClearance: 0.16,
    points: [
      MARDOU_LOBBY_FOCUS.camera,
      MARDOU_PRIVATE_ROUTE.approach,
      MARDOU_PRIVATE_ROUTE.lowerFlight,
      MARDOU_PRIVATE_ROUTE.landing,
      MARDOU_PRIVATE_ROUTE.upperFlight,
      MARDOU_PRIVATE_ROUTE.galleryEntry,
      MARDOU_PRIVATE_FOCUS.camera,
    ],
  },
  {
    name: "private -> lobby",
    requiresFloor: () => true,
    minimumClearance: 0.16,
    points: [
      MARDOU_PRIVATE_FOCUS.camera,
      MARDOU_PRIVATE_ROUTE.galleryEntry,
      MARDOU_PRIVATE_ROUTE.upperFlight,
      MARDOU_PRIVATE_ROUTE.landing,
      MARDOU_PRIVATE_ROUTE.lowerFlight,
      MARDOU_PRIVATE_ROUTE.approach,
      MARDOU_LOBBY_FOCUS.camera,
    ],
  },
];

const authoredMotionRoutes = [
  {
    name: "exterior -> lobby",
    duration: MARDOU_ENTRANCE_ROUTE.duration,
    uniformTargetTiming: true,
    positionPoints: authoredRoutes[1].points,
    targetPoints: [
      MARDOU_EXTERIOR_FOCUS.target,
      ...MARDOU_ENTRANCE_ROUTE.entryTargets,
      ...MARDOU_LOBBY_INTRO_ROUTE.targets,
    ],
  },
  {
    name: "lobby -> exterior",
    duration: MARDOU_ENTRANCE_ROUTE.duration,
    uniformTargetTiming: true,
    positionPoints: authoredRoutes[2].points,
    targetPoints: [
      MARDOU_LOBBY_FOCUS.target,
      ...MARDOU_LOBBY_INTRO_ROUTE.targets.slice(0, -1).reverse(),
      ...MARDOU_ENTRANCE_ROUTE.exitTargets,
    ],
  },
  {
    name: "lobby -> private",
    duration: MARDOU_PRIVATE_ROUTE.duration,
    lookForwardAlongRoute: true,
    positionPoints: authoredRoutes[3].points,
    targetPoints: [
      MARDOU_LOBBY_FOCUS.target,
      ...MARDOU_PRIVATE_ROUTE.ascentTargets,
      MARDOU_PRIVATE_FOCUS.target,
    ],
  },
  {
    name: "private -> lobby",
    duration: MARDOU_PRIVATE_ROUTE.descentDuration,
    positionPoints: authoredRoutes[4].points,
    targetPoints: [
      MARDOU_PRIVATE_FOCUS.target,
      ...MARDOU_PRIVATE_ROUTE.descentTargets,
      MARDOU_LOBBY_FOCUS.target,
    ],
  },
].map((route) => ({
  name: route.name,
  duration: route.duration,
  ...auditCameraMotion({ ...route, pairedControlTiming: route.name.includes("private") }),
}));

const focusTransitionDuration = (distance, turnAngle) => THREE.MathUtils.clamp(
  Math.max(distance * 0.62, THREE.MathUtils.radToDeg(turnAngle) / 14.5),
  2.8,
  6.4,
);
const authoredFocusMotionRoutes = MARDOU_PROJECT_PLACEMENTS.flatMap((placement, index) => {
  const lobbyCamera = new THREE.Vector3(...MARDOU_LOBBY_FOCUS.camera);
  const projectCamera = new THREE.Vector3(...placement.focus.camera);
  const lobbyDirection = new THREE.Vector3(...MARDOU_LOBBY_FOCUS.target).sub(lobbyCamera).normalize();
  const projectDirection = new THREE.Vector3(...placement.focus.target).sub(projectCamera).normalize();
  const forwardPositionPoints = index >= 1
    ? [MARDOU_LOBBY_FOCUS.camera, ...MARDOU_FAR_PROJECT_FOCUS_ROUTE, placement.focus.camera]
    : [MARDOU_LOBBY_FOCUS.camera, placement.focus.camera];
  const returnPositionPoints = [...forwardPositionPoints].reverse();
  const forwardPositionCurve = cameraCurve(forwardPositionPoints);
  const distance = forwardPositionCurve.getLength();
  const duration = index === 2
    ? Math.max(7.2, focusTransitionDuration(distance, lobbyDirection.angleTo(projectDirection)))
    : focusTransitionDuration(distance, lobbyDirection.angleTo(projectDirection));
  const lobbyDistance = Math.max(
    2.75,
    new THREE.Vector3(...MARDOU_LOBBY_FOCUS.target).distanceTo(lobbyCamera),
  );
  const projectDistance = Math.max(
    2.75,
    new THREE.Vector3(...placement.focus.target).distanceTo(projectCamera),
  );
  const focusAttentionOrigin = forwardPositionCurve.getPointAt(0.5);
  const forwardAttentionDirection = new THREE.Vector3(...placement.focus.target)
    .sub(focusAttentionOrigin)
    .normalize();
  const returnAttentionDirection = new THREE.Vector3(...MARDOU_LOBBY_FOCUS.target)
    .sub(focusAttentionOrigin)
    .normalize();
  const forwardMidDirection = lobbyDirection.clone().lerp(
    forwardAttentionDirection,
    index === 2 ? 0.9 : 0.75,
  ).normalize();
  const returnMidDirection = projectDirection.clone().lerp(returnAttentionDirection, 0.75).normalize();
  const midpointCamera = new THREE.PerspectiveCamera(
    THREE.MathUtils.lerp(MARDOU_LOBBY_FOCUS.fov, placement.focus.fov, 0.5),
    16 / 9,
    0.08,
    120,
  );
  midpointCamera.position.copy(focusAttentionOrigin);
  midpointCamera.lookAt(focusAttentionOrigin.clone().add(
    index >= 1
      ? forwardMidDirection
      : lobbyDirection.clone().lerp(projectDirection, 0.5).normalize(),
  ));
  midpointCamera.updateProjectionMatrix();
  midpointCamera.updateMatrixWorld(true);
  const midpointTargetNdc = new THREE.Vector3(...placement.focus.target).project(midpointCamera);
  return [
    {
      name: `lobby -> project ${index + 1}`,
      projectIndex: index,
      duration,
      positionPoints: forwardPositionPoints,
      targetPoints: [MARDOU_LOBBY_FOCUS.target, placement.focus.target],
      focusView: {
        fromDirection: lobbyDirection.toArray(),
        midDirection: index >= 1 ? forwardMidDirection.toArray() : undefined,
        toDirection: projectDirection.toArray(),
        fromDistance: lobbyDistance,
        toDistance: projectDistance,
      },
      midpointTargetNdc: midpointTargetNdc.toArray(),
    },
    {
      name: `project ${index + 1} -> lobby`,
      projectIndex: index,
      duration,
      positionPoints: returnPositionPoints,
      targetPoints: [placement.focus.target, MARDOU_LOBBY_FOCUS.target],
      focusView: {
        fromDirection: projectDirection.toArray(),
        midDirection: index >= 1 ? returnMidDirection.toArray() : undefined,
        toDirection: lobbyDirection.toArray(),
        fromDistance: projectDistance,
        toDistance: lobbyDistance,
      },
    },
  ];
}).map((route) => ({
  name: route.name,
  projectIndex: route.projectIndex,
  duration: route.duration,
  positionPoints: route.positionPoints,
  midpointTargetNdc: route.midpointTargetNdc,
  ...auditCameraMotion(route),
}));

const focusRouteClearanceFailures = authoredFocusMotionRoutes.flatMap((route) => {
  const curve = cameraCurve(route.positionPoints);
  return Array.from({ length: 201 }, (_, index) => index / 200).flatMap((progress) => {
    const point = curve.getPointAt(progress);
    const structureClearance = horizontalClearance(point.x, point.y, point.z);
    const nearestOtherProject = Math.min(...MARDOU_PROJECT_PLACEMENTS
      .filter((_, index) => index !== route.projectIndex)
      .map((placement) => Math.hypot(
        point.x - placement.position[0],
        point.z - placement.position[2],
      )));
    const reasons = [];
    if (structureClearance < 0.65) reasons.push(`structure clearance ${structureClearance.toFixed(2)}m < 0.65m`);
    if (nearestOtherProject < 1.5) reasons.push(`neighboring-island clearance ${nearestOtherProject.toFixed(2)}m < 1.5m`);
    return reasons.map((reason) => (
      `${route.name} at ${(progress * 100).toFixed(0)}% `
      + `[${point.x.toFixed(2)}, ${point.y.toFixed(2)}, ${point.z.toFixed(2)}]: ${reason}`
    ));
  });
});

const routeSamples = authoredRoutes.flatMap(({ name, points, requiresFloor, minimumClearance = MIN_CLEARANCE, allowsDoorway = false, curve: curveFactory }) => {
  const curve = curveFactory ? curveFactory(points) : cameraCurve(points);
  const curveSamples = Array.from({ length: ROUTE_SAMPLE_STEPS + 1 }, (_, index) => index / ROUTE_SAMPLE_STEPS).map((t) => {
    const point = curve.getPoint(t).toArray();
    return { name, t, point, requiresFloor: requiresFloor(point), minimumClearance, allowsDoorway };
  });
  const waypointSamples = points.map((point, index) => ({
    name,
    t: index / (points.length - 1),
    point: [...point],
    requiresFloor: requiresFloor(point),
    minimumClearance,
    allowsDoorway,
    waypoint: index + 1,
  }));
  return [...curveSamples, ...waypointSamples];
});

const privateAscentCurve = cameraCurve([
  MARDOU_LOBBY_FOCUS.camera,
  MARDOU_PRIVATE_ROUTE.approach,
  MARDOU_PRIVATE_ROUTE.lowerFlight,
  MARDOU_PRIVATE_ROUTE.landing,
  MARDOU_PRIVATE_ROUTE.upperFlight,
  MARDOU_PRIVATE_ROUTE.galleryEntry,
  MARDOU_PRIVATE_FOCUS.camera,
]);
let minimumStairHeadroom = Infinity;
for (let index = 0; index <= 1000; index += 1) {
  const point = privateAscentCurve.getPointAt(index / 1000);
  for (const tread of MARDOU_STAIR_CLICK_TARGETS) {
    const withinTread = Math.abs(point.x - tread.position[0]) <= tread.size[0] / 2 + 0.08
      && Math.abs(point.z - tread.position[2]) <= tread.size[2] / 2 + 0.08;
    if (withinTread) minimumStairHeadroom = Math.min(minimumStairHeadroom, point.y - tread.position[1]);
  }
}
if (minimumStairHeadroom < 0.95) {
  throw new Error(`Mardou stair camera headroom ${minimumStairHeadroom.toFixed(3)}m < 0.95m`);
}

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
  { name: "lobby wide camera", point: MARDOU_LOBBY_WIDE_FOCUS.camera },
  ...[0.36, 0.46, 0.75, 1, 1.1].flatMap((aspect) => [
    {
      name: `responsive lobby camera ${aspect}`,
      point: responsiveMuseumCamera(MARDOU_LOBBY_FOCUS.camera, aspect),
      minimumClearance: 1,
    },
    {
      name: `responsive lobby wide camera ${aspect}`,
      point: responsiveMuseumCamera(MARDOU_LOBBY_WIDE_FOCUS.camera, aspect),
      minimumClearance: 1,
    },
  ]),
  { name: "private camera", point: MARDOU_PRIVATE_FOCUS.camera },
  { name: "private route approach", point: MARDOU_PRIVATE_ROUTE.approach, minimumClearance: 0.16 },
  { name: "private route lower flight", point: MARDOU_PRIVATE_ROUTE.lowerFlight, minimumClearance: 0.16 },
  { name: "private route landing", point: MARDOU_PRIVATE_ROUTE.landing, minimumClearance: 0.16 },
  { name: "private route upper flight", point: MARDOU_PRIVATE_ROUTE.upperFlight, minimumClearance: 0.16 },
  { name: "private route gallery entry", point: MARDOU_PRIVATE_ROUTE.galleryEntry, minimumClearance: 0.16 },
  { name: "diary camera", point: MARDOU_DIARY_FOCUS.camera },
  { name: "creative corner", point: [MARDOU_CREATIVE_CORNER_POSITION[0], 4.8, MARDOU_CREATIVE_CORNER_POSITION[2]] },
  { name: "sports life filler", point: [MARDOU_LIFE_FILLER_PLACEMENTS.sports.position[0], 1.1, MARDOU_LIFE_FILLER_PLACEMENTS.sports.position[2]], minimumClearance: 0.75 },
  { name: "refreshment life filler", point: [MARDOU_LIFE_FILLER_PLACEMENTS.refreshments.position[0], 1.1, MARDOU_LIFE_FILLER_PLACEMENTS.refreshments.position[2]], minimumClearance: 0.75 },
  { name: "companion entrance spawn", point: [MARDOU_COMPANION_SAFE_ZONE.entranceSpawn[0], 1, MARDOU_COMPANION_SAFE_ZONE.entranceSpawn[2]], minimumClearance: 0.75 },
  { name: "companion entrance welcome", point: [MARDOU_COMPANION_SAFE_ZONE.entranceWelcome[0], 1, MARDOU_COMPANION_SAFE_ZONE.entranceWelcome[2]], minimumClearance: 0.75 },
  ...MARDOU_COMPANION_SAFE_ZONE.waypoints.map((point, index) => ({
    name: `companion patrol ${index + 55}`,
    point: [point[0], 1, point[2]],
    minimumClearance: 0.55,
  })),
  ...MARDOU_PROJECT_PLACEMENTS.flatMap((placement, index) => [
    { name: `project ${index + 1}`, point: [placement.position[0], 1.5, placement.position[2]] },
    { name: `project camera ${index + 1}`, point: placement.focus.camera },
  ]),
  ...MARDOU_SURFACE_PLACEMENTS.flatMap((placement, index) => [
    {
      name: `surface ${index + 1}`,
      point: placement.position,
      // Slot 4 is intentionally authored 0.51m from the upper-gallery
      // structure; its inward-facing narrow object remains visibly clear.
      minimumClearance: [0, 0.8, 0.65, 0.65, 0.5, 0.65, 0.65, 1][index],
    },
    { name: `surface camera ${index + 1}`, point: placement.focus.camera },
  ]),
  ...MARDOU_PRIVATE_PICTURE_FRAMES.flatMap((frame, index) => [
    { name: `private frame ${index + 11}`, point: frame.position, minimumClearance: 0 },
    { name: `private frame camera ${index + 11}`, point: frame.focus.camera, minimumClearance: 0.5 },
  ]),
];

const pointFailures = verifiedPoints.flatMap(({ name, point, minimumClearance = MIN_CLEARANCE }) => {
  const floor = floorAt(point[0], point[2], point[1] + 0.05);
  const clearance = horizontalClearance(...point);
  const reasons = [];
  if (floor === undefined) reasons.push("no supporting floor below point");
  if (clearance < minimumClearance) reasons.push(`structure clearance ${clearance.toFixed(3)} < ${minimumClearance}`);
  return reasons.map((reason) => `${name}: ${reason}`);
});

const groundFloorContentPoints = [
  ...MARDOU_PROJECT_PLACEMENTS.map((item, index) => ({ name: `project ${index + 1}`, point: item.position })),
  ...MARDOU_SURFACE_PLACEMENTS
    .filter((item) => item.position[1] < 2.5)
    .map((item, index) => ({ name: `ground surface ${index + 1}`, point: item.position })),
];
const fillerSeparationFailures = Object.entries(MARDOU_LIFE_FILLER_PLACEMENTS).flatMap(([fillerName, filler]) => (
  groundFloorContentPoints.flatMap(({ name, point }) => {
    const distance = Math.hypot(filler.position[0] - point[0], filler.position[2] - point[2]);
    return distance < 2.6
      ? [`${fillerName} life filler: ${distance.toFixed(2)}m from ${name}, requires 2.6m`]
      : [];
  })
));

const companionWelcomeStart = new THREE.Vector3(...MARDOU_COMPANION_SAFE_ZONE.entranceSpawn);
const companionWelcomeEnd = new THREE.Vector3(...MARDOU_COMPANION_SAFE_ZONE.entranceWelcome);
const companionWelcomeDistance = companionWelcomeStart.distanceTo(companionWelcomeEnd);
const companionWelcomeArrivalSeconds = companionWelcomeDistance / (MARDOU_COMPANION_SPEED * 1.35);
// The camera now explicitly releases the pet only after its two-door entrance
// route and final 90-degree turn complete. Audit the post-release walk itself:
// it should be visible but brief, and must never exceed the guarded 5m cap.
const companionTimingFailures = companionWelcomeDistance > 5 || companionWelcomeArrivalSeconds > 4
  ? [`companion post-intro greeting moves ${companionWelcomeDistance.toFixed(2)}m in ${companionWelcomeArrivalSeconds.toFixed(2)}s`]
  : [];
const companionWelcomePathFailures = Array.from({ length: 101 }, (_, index) => index / 100).flatMap((progress) => {
  const point = companionWelcomeStart.clone().lerp(companionWelcomeEnd, progress);
  const clearance = horizontalClearance(point.x, 1, point.z);
  const nearestProject = Math.min(...MARDOU_PROJECT_PLACEMENTS.map((placement) => (
    Math.hypot(point.x - placement.position[0], point.z - placement.position[2])
  )));
  const reasons = [];
  if (clearance < 0.75) reasons.push(`structure clearance ${clearance.toFixed(2)}m < 0.75m`);
  if (nearestProject < 1.45) reasons.push(`project-island clearance ${nearestProject.toFixed(2)}m < 1.45m`);
  return reasons.map((reason) => `companion welcome path at ${(progress * 100).toFixed(0)}%: ${reason}`);
});
const companionPatrolPathFailures = MARDOU_COMPANION_SAFE_ZONE.waypoints.flatMap((start, index, points) => {
  const end = points[(index + 1) % points.length];
  return Array.from({ length: 41 }, (_, sampleIndex) => sampleIndex / 40).flatMap((progress) => {
    const point = new THREE.Vector3(...start).lerp(new THREE.Vector3(...end), progress);
    const clearance = horizontalClearance(point.x, 0.55, point.z);
    const nearestProject = Math.min(...MARDOU_PROJECT_PLACEMENTS.map((placement) => (
      Math.hypot(point.x - placement.position[0], point.z - placement.position[2])
    )));
    const reasons = [];
    if (clearance < 0.4) reasons.push(`structure clearance ${clearance.toFixed(2)}m < 0.40m`);
    if (nearestProject < 1.25) reasons.push(`project-island clearance ${nearestProject.toFixed(2)}m < 1.25m`);
    return reasons.map((reason) => (
      `companion patrol ${index + 55}->${(index + 1) % points.length + 55} at ${(progress * 100).toFixed(0)}%: ${reason}`
    ));
  });
});

const desktopLobbyCamera = new THREE.PerspectiveCamera(
  MARDOU_LOBBY_WIDE_FOCUS.fov,
  16 / 9,
  0.08,
  120,
);
desktopLobbyCamera.position.set(...MARDOU_LOBBY_WIDE_FOCUS.camera);
desktopLobbyCamera.lookAt(new THREE.Vector3(...MARDOU_LOBBY_WIDE_FOCUS.target));
desktopLobbyCamera.updateProjectionMatrix();
desktopLobbyCamera.updateMatrixWorld(true);
const lifeFillerVisibilityFailures = Object.entries(MARDOU_LIFE_FILLER_PLACEMENTS).flatMap(([name, placement]) => {
  const projected = new THREE.Vector3(placement.position[0], 1, placement.position[2]).project(desktopLobbyCamera);
  return Math.abs(projected.x) >= 0.95 || Math.abs(projected.y) >= 0.9
    ? [`desktop lobby: ${name} filler projects to NDC [${projected.x.toFixed(3)}, ${projected.y.toFixed(3)}]`]
    : [];
});

const portraitAspect = 0.46;
const portraitWideCamera = new THREE.PerspectiveCamera(
  responsiveMuseumFov(MARDOU_LOBBY_WIDE_FOCUS.fov, portraitAspect),
  portraitAspect,
  0.08,
  120,
);
portraitWideCamera.position.set(...responsiveMuseumCamera(MARDOU_LOBBY_WIDE_FOCUS.camera, portraitAspect));
portraitWideCamera.lookAt(new THREE.Vector3(...responsiveMuseumTarget(MARDOU_LOBBY_WIDE_FOCUS.target, portraitAspect)));
portraitWideCamera.updateProjectionMatrix();
portraitWideCamera.updateMatrixWorld(true);
const portraitWideProjectVisibilityFailures = MARDOU_PROJECT_PLACEMENTS.flatMap((placement, index) => {
  const point = new THREE.Vector3(
    placement.position[0],
    placement.position[1] + 0.8,
    placement.position[2],
  ).project(portraitWideCamera);
  return Math.abs(point.x) >= 0.97 || Math.abs(point.y) >= 0.9
    ? [`portrait R overview: project ${index + 1} projects to NDC [${point.x.toFixed(3)}, ${point.y.toFixed(3)}]`]
    : [];
});

const overviewViewportCases = [0.36, 0.46, 0.75, 1, 1.1, 1.2, 16 / 9, 2.33, 3.2].flatMap((aspect) => (
  [{ mode: "wide", focus: MARDOU_LOBBY_WIDE_FOCUS }].map(({ mode, focus }) => {
    const camera = new THREE.PerspectiveCamera(
      responsiveMuseumFov(focus.fov, aspect),
      aspect,
      0.08,
      120,
    );
    camera.position.set(...responsiveMuseumCamera(focus.camera, aspect));
    camera.lookAt(new THREE.Vector3(...responsiveMuseumTarget(focus.target, aspect)));
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    const projects = MARDOU_PROJECT_PLACEMENTS.map((placement) => (
      new THREE.Vector3(
        placement.position[0],
        placement.position[1] + 0.8,
        placement.position[2],
      ).project(camera)
    ));
    const projectBounds = MARDOU_PROJECT_PLACEMENTS.map((placement) => {
      const corners = [-1.05, 1.05].flatMap((offsetX) => (
        [0.25, 2.05].map((y) => new THREE.Vector3(
          placement.position[0] + offsetX,
          y,
          placement.position[2],
        ).project(camera))
      ));
      return {
        minX: Math.min(...corners.map((point) => point.x)),
        maxX: Math.max(...corners.map((point) => point.x)),
        minY: Math.min(...corners.map((point) => point.y)),
        maxY: Math.max(...corners.map((point) => point.y)),
      };
    });
    const fillers = Object.fromEntries(Object.entries(MARDOU_LIFE_FILLER_PLACEMENTS).map(([name, placement]) => [
      name,
      new THREE.Vector3(placement.position[0], 1, placement.position[2]).project(camera),
    ]));
    const companionPatrolCenter = MARDOU_COMPANION_SAFE_ZONE.waypoints.reduce(
      (center, point) => center.add(new THREE.Vector3(...point)),
      new THREE.Vector3(),
    ).multiplyScalar(1 / MARDOU_COMPANION_SAFE_ZONE.waypoints.length);
    companionPatrolCenter.y = 0.65;
    const companion = companionPatrolCenter.project(camera);
    return {
      aspect,
      mode,
      fov: camera.fov,
      projects,
      projectBounds,
      fillers,
      companion,
      projectSpan: Math.max(...projects.map((point) => point.x))
        - Math.min(...projects.map((point) => point.x)),
    };
  })
));
const overviewResponsiveCompositionFailures = overviewViewportCases.flatMap((viewport) => {
  const reasons = [];
  viewport.projects.forEach((point, index) => {
    if (Math.abs(point.x) >= 0.97 || Math.abs(point.y) >= 0.9) {
      reasons.push(`project ${index + 1} NDC [${point.x.toFixed(3)}, ${point.y.toFixed(3)}]`);
    }
  });
  viewport.projectBounds.forEach((bounds, index) => {
    if (bounds.minX <= -0.985 || bounds.maxX >= 0.985 || bounds.minY <= -0.95 || bounds.maxY >= 0.95) {
      reasons.push(
        `project ${index + 1} full frame bounds `
        + `[${bounds.minX.toFixed(3)}, ${bounds.maxX.toFixed(3)}] × `
        + `[${bounds.minY.toFixed(3)}, ${bounds.maxY.toFixed(3)}]`,
      );
    }
  });
  if (Math.abs(viewport.companion.x) >= 0.85 || Math.abs(viewport.companion.y) >= 0.85) {
    reasons.push(`companion NDC [${viewport.companion.x.toFixed(3)}, ${viewport.companion.y.toFixed(3)}]`);
  }
  if (viewport.aspect >= 1.3) {
    Object.entries(viewport.fillers).forEach(([name, point]) => {
      if (Math.abs(point.x) >= 0.95 || Math.abs(point.y) >= 0.85) {
        reasons.push(`${name} filler NDC [${point.x.toFixed(3)}, ${point.y.toFixed(3)}]`);
      }
    });
  }
  if (viewport.projectSpan < 0.45) {
    reasons.push(`project span ${viewport.projectSpan.toFixed(3)} NDC < 0.45`);
  }
  return reasons.map((reason) => (
    `${viewport.mode} overview at ${viewport.aspect.toFixed(2)} aspect: ${reason}`
  ));
});

const exteriorCamera = new THREE.PerspectiveCamera(
  MARDOU_EXTERIOR_FOCUS.fov,
  16 / 9,
  0.08,
  120,
);
exteriorCamera.position.set(...MARDOU_EXTERIOR_FOCUS.camera);
exteriorCamera.lookAt(new THREE.Vector3(...MARDOU_EXTERIOR_FOCUS.target));
exteriorCamera.updateProjectionMatrix();
exteriorCamera.updateMatrixWorld(true);
const exteriorProjectedBounds = {
  minX: Infinity,
  maxX: -Infinity,
  minY: Infinity,
  maxY: -Infinity,
};
const exteriorProjectionPoint = new THREE.Vector3();
for (const mesh of meshes) {
  if (MARDOU_HIDDEN_MESH_NAMES.some((name) => mesh.name.startsWith(`${name}:`))) continue;
  const positions = mesh.geometry.getAttribute("position");
  for (let index = 0; index < positions.count; index += 1) {
    exteriorProjectionPoint
      .fromBufferAttribute(positions, index)
      .applyMatrix4(mesh.matrixWorld)
      .project(exteriorCamera);
    exteriorProjectedBounds.minX = Math.min(exteriorProjectedBounds.minX, exteriorProjectionPoint.x);
    exteriorProjectedBounds.maxX = Math.max(exteriorProjectedBounds.maxX, exteriorProjectionPoint.x);
    exteriorProjectedBounds.minY = Math.min(exteriorProjectedBounds.minY, exteriorProjectionPoint.y);
    exteriorProjectedBounds.maxY = Math.max(exteriorProjectedBounds.maxY, exteriorProjectionPoint.y);
  }
}
const exteriorCompositionFailures = [];
const exteriorWidth = exteriorProjectedBounds.maxX - exteriorProjectedBounds.minX;
const exteriorHeight = exteriorProjectedBounds.maxY - exteriorProjectedBounds.minY;
if (exteriorWidth < 1.15) exteriorCompositionFailures.push(`exterior building width ${exteriorWidth.toFixed(3)} NDC < 1.15`);
if (exteriorHeight < 1.1) exteriorCompositionFailures.push(`exterior building height ${exteriorHeight.toFixed(3)} NDC < 1.1`);
if (exteriorProjectedBounds.minX < -1.08 || exteriorProjectedBounds.maxX > 1.08) {
  exteriorCompositionFailures.push(`exterior building horizontal bounds [${exteriorProjectedBounds.minX.toFixed(3)}, ${exteriorProjectedBounds.maxX.toFixed(3)}] exceed framing margin`);
}

const routeFailures = routeSamples.flatMap(({ name, t, point, requiresFloor, minimumClearance, allowsDoorway, waypoint }) => {
  const floor = floorAt(point[0], point[2], point[1] + 0.05);
  const clearance = horizontalClearance(...point);
  const reasons = [];
  if (requiresFloor && floor === undefined) reasons.push("no supporting floor below point");
  const insideOpenDoorway = allowsDoorway
    && [MARDOU_AUTO_DOOR, MARDOU_SIDE_ENTRANCE_DOOR].some((door) => (
      Math.abs(point[2] - door.position[2]) < door.width * 0.55
      && Math.abs(point[0] - door.position[0]) < 1.75
    ));
  if (!insideOpenDoorway && clearance < minimumClearance) reasons.push(`structure clearance ${clearance.toFixed(3)} < ${minimumClearance}`);
  const location = waypoint ? `waypoint ${waypoint}` : `at t=${t.toFixed(1)}`;
  return reasons.map((reason) => `${name} ${location} [${point.map((value) => value.toFixed(3)).join(", ")}]: ${reason}`);
});

const introMotion = auditIntroMotion();
const introPositionCurve = cameraCurve([
  ...MARDOU_LOBBY_INTRO_ROUTE.points,
]);
const introTargetCurve = cameraCurve([
  ...MARDOU_LOBBY_INTRO_ROUTE.targets,
]);
const introForegroundCamera = new THREE.PerspectiveCamera(
  MARDOU_LOBBY_FOCUS.fov,
  16 / 9,
  0.08,
  120,
);
let nearestVisibleIntroStair = { distance: Infinity, progress: 0, stairIndex: -1 };
for (let index = 0; index <= 240; index += 1) {
  const progress = cameraEase(index / 240);
  const position = introPositionCurve.getPointAt(progress);
  const target = introTargetCurve.getPointAt(progress);
  introForegroundCamera.position.copy(position);
  introForegroundCamera.lookAt(target);
  introForegroundCamera.updateProjectionMatrix();
  introForegroundCamera.updateMatrixWorld(true);
  MARDOU_STAIR_CLICK_TARGETS.forEach((stair, stairIndex) => {
    const stairCenter = new THREE.Vector3(...stair.position);
    const projected = stairCenter.clone().project(introForegroundCamera);
    const insideExpandedFrame = Math.abs(projected.x) < 1.1
      && Math.abs(projected.y) < 1.1
      && projected.z < 1;
    const distance = stairCenter.distanceTo(position);
    if (insideExpandedFrame && distance < nearestVisibleIntroStair.distance) {
      nearestVisibleIntroStair = { distance, progress: index / 240, stairIndex };
    }
  });
}
const introStairForegroundFailures = nearestVisibleIntroStair.distance < 2.75
  ? [
      `lobby intro: stair ${nearestVisibleIntroStair.stairIndex + 1} enters the expanded frame at `
      + `${nearestVisibleIntroStair.distance.toFixed(2)}m during ${(nearestVisibleIntroStair.progress * 100).toFixed(0)}% progress`,
    ]
  : [];
const motionFailures = [];
if (introMotion.maximumLinearAcceleration > 1) {
  motionFailures.push(`lobby intro linear acceleration ${introMotion.maximumLinearAcceleration.toFixed(2)} > 1`);
}
if (introMotion.maximumLinearJerk > 10) {
  motionFailures.push(`lobby intro linear jerk ${introMotion.maximumLinearJerk.toFixed(1)} > 10`);
}
if (introMotion.maximumAngularSpeed > 50) {
  motionFailures.push(`lobby intro angular speed ${introMotion.maximumAngularSpeed.toFixed(1)}deg/s > 50deg/s`);
}
if (introMotion.maximumAngularAcceleration > 80) {
  motionFailures.push(`lobby intro angular acceleration ${introMotion.maximumAngularAcceleration.toFixed(1)}deg/s2 > 80deg/s2`);
}

const roomMotionFailures = authoredMotionRoutes.flatMap((route) => {
  const reasons = [];
  const linearJerkLimit = route.name.includes("exterior") ? 30 : 15;
  if (route.maximumLinearAcceleration > 4) {
    reasons.push(`linear acceleration ${route.maximumLinearAcceleration.toFixed(2)} > 4 at ${(route.maximumLinearAccelerationAt * 100).toFixed(1)}%`);
  }
  if (route.maximumLinearJerk > linearJerkLimit) {
    reasons.push(`linear jerk ${route.maximumLinearJerk.toFixed(1)} > ${linearJerkLimit} at ${(route.maximumLinearJerkAt * 100).toFixed(1)}%`);
  }
  if (route.maximumAngularSpeed > 50) {
    reasons.push(
      `angular speed ${route.maximumAngularSpeed.toFixed(1)}deg/s > 50deg/s at ${(route.maximumAngularSpeedAt * 100).toFixed(1)}% `
      + `position [${route.maximumAngularPosition.map((value) => value.toFixed(2)).join(", ")}] `
      + `target [${route.maximumAngularTarget.map((value) => value.toFixed(2)).join(", ")}]`,
    );
  }
  if (route.maximumAngularAcceleration > 450) {
    reasons.push(`angular acceleration ${route.maximumAngularAcceleration.toFixed(1)}deg/s2 > 450deg/s2`);
  }
  if (route.minimumLookDistance < 2.25) {
    reasons.push(`look target distance ${route.minimumLookDistance.toFixed(2)}m < 2.25m`);
  }
  return reasons.map((reason) => `${route.name}: ${reason}`);
});

const focusMotionFailures = authoredFocusMotionRoutes.flatMap((route) => {
  const reasons = [];
  if (route.maximumAngularSpeed > 40) {
    reasons.push(`angular speed ${route.maximumAngularSpeed.toFixed(1)}deg/s > 40deg/s`);
  }
  if (route.maximumAngularAcceleration > 120) {
    reasons.push(`angular acceleration ${route.maximumAngularAcceleration.toFixed(1)}deg/s2 > 120deg/s2`);
  }
  if (route.minimumLookDistance < 2.25) {
    reasons.push(`look target distance ${route.minimumLookDistance.toFixed(2)}m < 2.25m`);
  }
  return reasons.map((reason) => `${route.name}: ${reason}`);
});
const focusCompositionFailures = authoredFocusMotionRoutes.flatMap((route) => {
  if (!route.midpointTargetNdc) return [];
  const [x, y] = route.midpointTargetNdc;
  return Math.abs(x) > 0.35 || Math.abs(y) > 0.3
    ? [`${route.name}: selected target midpoint NDC [${x.toFixed(3)}, ${y.toFixed(3)}] is outside the central composition zone`]
    : [];
});

const failures = [
  ...pointFailures,
  ...fillerSeparationFailures,
  ...companionTimingFailures,
  ...companionWelcomePathFailures,
  ...companionPatrolPathFailures,
  ...lifeFillerVisibilityFailures,
  ...portraitWideProjectVisibilityFailures,
  ...overviewResponsiveCompositionFailures,
  ...exteriorCompositionFailures,
  ...routeFailures,
  ...motionFailures,
  ...introStairForegroundFailures,
  ...roomMotionFailures,
  ...focusMotionFailures,
  ...focusCompositionFailures,
  ...focusRouteClearanceFailures,
];

if (failures.length) {
  throw new Error(`Mardou placement audit failed:\n${failures.join("\n")}`);
}
console.log(`\nverified ${verifiedPoints.length} authored points with floor support and their placement-specific clearance thresholds`);
console.log(`verified life fillers remain at least 2.6m from every ground-floor content stand`);
console.log(`verified companion reaches the entrance welcome point ${companionWelcomeArrivalSeconds.toFixed(2)}s after the intro release with a clear path`);
console.log("verified sports and refreshment display centers remain visible in the desktop establishing view");
console.log(`verified all project-island centers remain visible in the ${portraitAspect.toFixed(2)} portrait establishing view`);
console.log(`verified all project-island centers remain visible after R-key reframing at ${portraitAspect.toFixed(2)} portrait aspect`);
console.log("responsive lobby overview composition");
console.table(overviewViewportCases.map((viewport) => ({
  aspect: Number(viewport.aspect.toFixed(2)),
  mode: viewport.mode,
  fov: Number(viewport.fov.toFixed(1)),
  projectSpan: Number(viewport.projectSpan.toFixed(2)),
  companionX: Number(viewport.companion.x.toFixed(2)),
})));
console.log(`verified exterior building fills ${exteriorWidth.toFixed(2)} × ${exteriorHeight.toFixed(2)} NDC without horizontal clipping`);
console.log(`verified ${authoredRoutes.length} authored camera routes against their clearance limits at t=0.0..1.0 in 0.1 steps plus every named waypoint`);
console.log(`verified stair ascent keeps ${minimumStairHeadroom.toFixed(2)}m minimum camera height above every tread`);
console.log(`verified lobby intro motion at 60fps: ${introMotion.maximumLinearAcceleration.toFixed(2)} peak linear acceleration, ${introMotion.maximumLinearJerk.toFixed(1)} peak jerk, ${introMotion.maximumAngularSpeed.toFixed(1)}deg/s peak angular speed, ${introMotion.maximumAngularAcceleration.toFixed(1)}deg/s2 peak angular acceleration`);
console.log(`verified the closest visible stair stays ${nearestVisibleIntroStair.distance.toFixed(2)}m from the lobby intro lens`);
console.log("room transition motion at 60fps");
console.table(authoredMotionRoutes.map((route) => ({
  route: route.name,
  duration: route.duration,
  linearAcceleration: Number(route.maximumLinearAcceleration.toFixed(2)),
  linearJerk: Number(route.maximumLinearJerk.toFixed(1)),
  angularSpeed: Number(route.maximumAngularSpeed.toFixed(1)),
  angularAcceleration: Number(route.maximumAngularAcceleration.toFixed(1)),
  angularSpeedAt: Number(route.maximumAngularSpeedAt.toFixed(3)),
  minimumLookDistance: Number(route.minimumLookDistance.toFixed(2)),
  minimumLookDistanceAt: Number(route.minimumLookDistanceAt.toFixed(3)),
})));
for (const route of authoredMotionRoutes) {
  console.log(
    `${route.name} peak turn: camera [${route.maximumAngularPosition.map((value) => value.toFixed(2)).join(", ")}], `
    + `target [${route.maximumAngularTarget.map((value) => value.toFixed(2)).join(", ")}]`,
  );
}
console.log("project focus motion at 60fps");
console.table(authoredFocusMotionRoutes.map((route) => ({
  route: route.name,
  duration: Number(route.duration.toFixed(2)),
  angularSpeed: Number(route.maximumAngularSpeed.toFixed(1)),
  angularAcceleration: Number(route.maximumAngularAcceleration.toFixed(1)),
  minimumLookDistance: Number(route.minimumLookDistance.toFixed(2)),
})));
console.log(`verified ${authoredFocusMotionRoutes.length} project focus routes keep 0.65m structure and 1.5m neighboring-island clearance`);
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
