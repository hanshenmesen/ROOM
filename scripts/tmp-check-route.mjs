import fs from "node:fs";
import path from "node:path";
import * as THREE from "three";

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
        const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
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
    new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0),
    new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1),
  ];
  return Math.min(...directions.map((direction) => {
    const hit = intersections(origin, direction, obstacleMeshes)[0];
    return hit?.distance ?? Infinity;
  }));
}

// Camera route waypoints from WorldCanvas.tsx CameraRig (exterior -> room-lobby transition)
// and MardouMuseumLayout.ts MARDOU_ENTRANCE_ROUTE / MARDOU_EXTERIOR_FOCUS
const points = [
  { name: "exterior focus camera", point: [16, 6, 24] },
  { name: "entrance route: outside", point: [2, 1.5, 13.8] },
  { name: "entrance route: threshold", point: [2, 1.5, 8] },
  { name: "entrance route: gallery", point: [0, 1.5, -8] },
  { name: "lobby focus camera", point: [-4.408, 1.5, -11.169] },
];

for (const { name, point } of points) {
  const floor = floorAt(point[0], point[2], point[1] + 0.1);
  const clearance = horizontalClearance(...point);
  console.log(`${name}: point=${JSON.stringify(point)} floor=${floor?.toFixed(3) ?? "NONE"} clearance=${Number.isFinite(clearance) ? clearance.toFixed(3) : "inf"}`);
}

// sample along a straight-line interpolation between waypoints (not the actual Catmull-Rom
// curve, but a good proxy) to see if a naive straight path would clip
console.log("\n--- sampling straight segments between consecutive waypoints ---");
for (let i = 0; i < points.length - 1; i += 1) {
  const a = points[i].point;
  const b = points[i + 1].point;
  console.log(`segment ${points[i].name} -> ${points[i+1].name}`);
  for (let t = 0; t <= 1; t += 0.2) {
    const p = [a[0] + (b[0]-a[0])*t, a[1] + (b[1]-a[1])*t, a[2] + (b[2]-a[2])*t];
    const clearance = horizontalClearance(...p);
    const floor = floorAt(p[0], p[2], p[1] + 0.1);
    const flag = (!Number.isFinite(clearance) ? "" : clearance < 0.35 ? "  <-- CLIP RISK" : "");
    console.log(`  t=${t.toFixed(1)} p=${p.map(v=>v.toFixed(2))} floor=${floor?.toFixed(2) ?? "none"} clearance=${Number.isFinite(clearance)?clearance.toFixed(3):"inf"}${flag}`);
  }
}
