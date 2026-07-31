/* ============================================================
   The Mardou Museum — Coordinate Picker
   ------------------------------------------------------------
   Free-look OrbitControls over MardouMuseumResult.glb. Left-click any
   surface to drop a marker and read off its local (model-space)
   XYZ coordinate. Points are listed in a side panel, individually
   copyable, and exportable as one JSON blob.

   GENERIC / SELF-CALIBRATING
   ---------------------------
   This picker does NOT hardcode the model's bounding box, scale,
   or units. After the glb loads, it computes a world-space
   THREE.Box3 from the loaded scene graph (which already accounts
   for every node's transform — TRS or baked matrix, nested any
   number of levels deep, whatever the exporter produced). Camera
   start position, orbit target, near/far planes, fog density,
   marker size, and the room-containment box are all derived from
   that box and its diagonal length. This means the same file
   works unmodified on a building-scale museum (hundreds of units)
   or a room-scale, meter-unit interior — no manual coordinate
   surgery required per model.

   ROOM CONTAINMENT
   -----------------
   ROOM_MIN/ROOM_MAX (set once the model finishes loading) define
   an inset safety box derived from the real bounding box. Every
   frame, both the orbit target and the resulting camera position
   are clamped into that box — so dragging, panning, or scrolling
   can never push the camera through a wall or out into the void.
   ============================================================ */

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const MODEL_URL = "model/MardouMuseumResult.glb";

/* ---------------- renderer / scene ---------------- */

const host = document.getElementById("canvas-host");
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
host.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111417);

// placeholder camera; real near/far/position are set once the
// model's bounding box is known (see calibrateToBoundingBox)
const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 1.6, 5);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.screenSpacePanning = true;
controls.update();

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

/* ---------------- lighting ---------------- */

scene.add(new THREE.HemisphereLight(0xcfe0ea, 0x2a231c, 0.7));

const keyLight = new THREE.DirectionalLight(0xfff4e0, 1.2);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
scene.add(keyLight);

const fillLight = new THREE.PointLight(0xfff0d8, 1, 0, 2);
scene.add(fillLight);

/* ---------------- room containment (filled in after load) ---------------- */

let ROOM_MIN = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
let ROOM_MAX = new THREE.Vector3(Infinity, Infinity, Infinity);

/* Clamp both the orbit target and the resulting camera position into
   the room box, every frame, AFTER controls.update() has already
   applied this frame's rotate/pan/zoom deltas. OrbitControls
   recomputes its internal spherical offset from camera.position /
   target fresh on every update() call (it keeps no separate
   persistent state), so clamping here is safe: next frame simply
   treats the clamped position as the new baseline instead of
   fighting the controls' internal state. */
function keepCameraIndoors() {
  controls.target.clamp(ROOM_MIN, ROOM_MAX);
  const before = camera.position.clone();
  camera.position.clamp(ROOM_MIN, ROOM_MAX);
  return !camera.position.equals(before); // true if we just hit a boundary
}

/* Derive every scale-dependent setting from the model's own
   world-space bounding box, so nothing here is hand-tuned per model. */
function calibrateToBoundingBox(root) {
  const box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);
  const diagonal = size.length();

  // inset the containment box ~4% of the diagonal so the camera
  // settles just short of the walls rather than clipping into them
  const margin = Math.max(diagonal * 0.04, 0.05);
  ROOM_MIN = box.min.clone().addScalar(margin);
  ROOM_MAX = box.max.clone().subScalar(margin);
  // guard against inverted bounds on a very thin/flat model
  ROOM_MIN.min(ROOM_MAX.clone().subScalar(0.01));

  camera.near = Math.max(diagonal * 0.001, 0.01);
  camera.far = diagonal * 8;
  camera.updateProjectionMatrix();

  scene.fog = new THREE.FogExp2(0x111417, 1.4 / diagonal);

  controls.minDistance = diagonal * 0.01;
  controls.maxDistance = diagonal * 0.9;

  // start roughly at "eye height" inside the room: near one side,
  // a third of the way up from the floor, looking toward the center
  const eyeY = box.min.y + size.y * 0.35;
  camera.position.set(
    center.x - size.x * 0.28,
    eyeY,
    center.z - size.z * 0.28
  );
  controls.target.set(center.x, eyeY, center.z);
  controls.update();

  keyLight.position.set(center.x - size.x * 0.6, box.max.y + size.y * 0.6, center.z - size.z * 0.3);
  keyLight.shadow.camera.near = diagonal * 0.01;
  keyLight.shadow.camera.far = diagonal * 2;
  const shadowExtent = diagonal * 0.6;
  keyLight.shadow.camera.left = -shadowExtent;
  keyLight.shadow.camera.right = shadowExtent;
  keyLight.shadow.camera.top = shadowExtent;
  keyLight.shadow.camera.bottom = -shadowExtent;
  keyLight.shadow.bias = -0.0015;

  fillLight.position.set(center.x, box.max.y - size.y * 0.15, center.z);
  fillLight.distance = diagonal * 1.2;
  fillLight.intensity = diagonal * 0.6;

  return { size, center, diagonal };
}

/* ---------------- load model ---------------- */

const loadWrap = document.getElementById("loadWrap");
const loadFill = document.getElementById("loadFill");
const loadLabel = document.getElementById("loadLabel");

let pickables = []; // meshes we allow raycasting against
let modelScale = 1; // used to size markers proportionally to the model

const loader = new GLTFLoader();
loader.load(
  MODEL_URL,
  (gltf) => {
    const root = gltf.scene;
    root.traverse((obj) => {
      if (obj.isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
        if (obj.material) obj.material.side = THREE.DoubleSide;
        pickables.push(obj);
      }
    });
    scene.add(root);

    const { diagonal } = calibrateToBoundingBox(root);
    modelScale = diagonal;

    loadLabel.textContent = "模型已就绪 · Ready";
    loadFill.style.width = "100%";
    setTimeout(() => loadWrap.classList.add("hidden"), 700);
  },
  (xhr) => {
    if (xhr.total) {
      const pct = Math.min(100, Math.round((xhr.loaded / xhr.total) * 100));
      loadFill.style.width = pct + "%";
      loadLabel.textContent = `加载模型中… ${pct}%`;
    }
  },
  (err) => {
    console.error(err);
    loadLabel.textContent = "模型加载失败，请检查 model/ 目录及文件名";
  }
);

/* ---------------- picking ---------------- */

const raycaster = new THREE.Raycaster();
const pointerNDC = new THREE.Vector2();
const hoverBadge = document.getElementById("hoverBadge");

let lastClientX = 0,
  lastClientY = 0;
let hoverPoint = null;

// distinguish a click (drop a point) from a drag (orbit/pan)
let downX = 0,
  downY = 0,
  isDragSuspect = false;
const DRAG_THRESHOLD = 5;

renderer.domElement.addEventListener("pointerdown", (e) => {
  downX = e.clientX;
  downY = e.clientY;
  isDragSuspect = false;
});

renderer.domElement.addEventListener("pointermove", (e) => {
  lastClientX = e.clientX;
  lastClientY = e.clientY;
  if (
    Math.abs(e.clientX - downX) > DRAG_THRESHOLD ||
    Math.abs(e.clientY - downY) > DRAG_THRESHOLD
  ) {
    isDragSuspect = true;
  }
  updateHover(e.clientX, e.clientY);
});

renderer.domElement.addEventListener("pointerup", (e) => {
  if (isDragSuspect) return; // was an orbit/pan drag, not a pick
  if (e.button !== 0) return; // left click only
  tryPick(e.clientX, e.clientY);
});

function toNDC(clientX, clientY, out) {
  const rect = renderer.domElement.getBoundingClientRect();
  out.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  out.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  return out;
}

function updateHover(clientX, clientY) {
  if (!pickables.length) {
    hoverBadge.style.transform = "translate(-9999px,-9999px)";
    return;
  }
  toNDC(clientX, clientY, pointerNDC);
  raycaster.setFromCamera(pointerNDC, camera);
  const hits = raycaster.intersectObjects(pickables, false);
  if (hits.length) {
    const p = hits[0].point;
    hoverPoint = p;
    hoverBadge.textContent = `X ${p.x.toFixed(2)}  Y ${p.y.toFixed(2)}  Z ${p.z.toFixed(2)}`;
    hoverBadge.style.transform = `translate(${clientX + 16}px, ${clientY + 16}px)`;
  } else {
    hoverPoint = null;
    hoverBadge.style.transform = "translate(-9999px,-9999px)";
  }
}

function tryPick(clientX, clientY) {
  if (!pickables.length) return;
  toNDC(clientX, clientY, pointerNDC);
  raycaster.setFromCamera(pointerNDC, camera);
  const hits = raycaster.intersectObjects(pickables, false);
  if (!hits.length) return;
  const hit = hits[0];
  addPoint(hit.point.clone(), hit.face ? hit.face.normal.clone() : null, hit.object.name || "Mesh");
}

/* ---------------- markers in 3D ---------------- */

const markerGroup = new THREE.Group();
scene.add(markerGroup);

const PALETTE = [0xe3b878, 0x8fd3c9, 0xd98fae, 0x9fc4ff, 0xd9c98f, 0xc98fd9];

function colorForIndex(i) {
  return PALETTE[i % PALETTE.length];
}

function makeMarker(position, color) {
  // size markers relative to the model's own scale, so a marker
  // reads as "a dot" whether the model is measured in meters or
  // in hundreds of arbitrary units
  const radius = Math.max(modelScale * 0.006, 0.01);
  const group = new THREE.Group();

  const core = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 20, 20),
    new THREE.MeshBasicMaterial({ color })
  );
  group.add(core);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(radius * 1.7, radius * 2.0, 32),
    new THREE.MeshBasicMaterial({
      color,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    })
  );
  group.add(ring);

  group.position.copy(position);
  return group;
}

/* ---------------- point list state ---------------- */

let points = []; // { id, position: Vector3, normal, meshName, marker, color }
let nextId = 1;

const pointList = document.getElementById("pointList");
const ptCount = document.getElementById("ptCount");
const emptyNote = document.getElementById("emptyNote");
const toast = document.getElementById("toast");
const copyAllBtn = document.getElementById("copyAllBtn");
const clearBtn = document.getElementById("clearBtn");

function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add("show");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.remove("show"), 1600);
}

const wallVignette = document.getElementById("wallVignette");
let wallHintShownOnce = false;
function showWallHint() {
  if (wallHintShownOnce) return;
  wallHintShownOnce = true;
  showToast("已到边界 — 视角保持在模型内部");
}

function addPoint(position, normal, meshName) {
  const id = nextId++;
  const color = colorForIndex(points.length);
  const marker = makeMarker(position, color);
  markerGroup.add(marker);

  const record = { id, position, normal, meshName, marker, color };
  points.push(record);
  renderList();
  showToast(`已取点 #${id}`);
}

function removePoint(id) {
  const idx = points.findIndex((p) => p.id === id);
  if (idx === -1) return;
  markerGroup.remove(points[idx].marker);
  points.splice(idx, 1);
  renderList();
}

function clearAll() {
  points.forEach((p) => markerGroup.remove(p.marker));
  points = [];
  renderList();
}

function formatCoord(v) {
  return `X ${v.x.toFixed(3)}, Y ${v.y.toFixed(3)}, Z ${v.z.toFixed(3)}`;
}

function pointToJSON(p, i) {
  return {
    index: i + 1,
    id: p.id,
    mesh: p.meshName,
    position: { x: +p.position.x.toFixed(4), y: +p.position.y.toFixed(4), z: +p.position.z.toFixed(4) },
    normal: p.normal
      ? { x: +p.normal.x.toFixed(4), y: +p.normal.y.toFixed(4), z: +p.normal.z.toFixed(4) }
      : null,
  };
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    document.body.removeChild(ta);
    return ok;
  }
}

function renderList() {
  ptCount.textContent = points.length;
  emptyNote.style.display = points.length ? "none" : "block";
  pointList.innerHTML = "";

  points.forEach((p, i) => {
    const row = document.createElement("div");
    row.className = "pointRow";

    const head = document.createElement("div");
    head.className = "rowHead";

    const idx = document.createElement("span");
    idx.className = "idx";
    idx.innerHTML = `<span class="swatch" style="background:#${p.color.toString(16).padStart(6, "0")}"></span>POINT ${String(i + 1).padStart(2, "0")}`;

    const rowBtns = document.createElement("div");
    rowBtns.className = "rowBtns";

    const copyBtn = document.createElement("button");
    copyBtn.textContent = "复制";
    copyBtn.addEventListener("click", async () => {
      const ok = await copyText(formatCoord(p.position));
      showToast(ok ? `已复制点 #${i + 1} 坐标` : "复制失败，请手动选择文本");
    });

    const delBtn = document.createElement("button");
    delBtn.textContent = "删除";
    delBtn.addEventListener("click", () => removePoint(p.id));

    rowBtns.appendChild(copyBtn);
    rowBtns.appendChild(delBtn);
    head.appendChild(idx);
    head.appendChild(rowBtns);

    const coords = document.createElement("div");
    coords.className = "coords";
    coords.textContent = formatCoord(p.position);

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = `所在网格：${p.meshName}`;

    row.appendChild(head);
    row.appendChild(coords);
    row.appendChild(meta);
    pointList.appendChild(row);
  });
}

copyAllBtn.addEventListener("click", async () => {
  if (!points.length) {
    showToast("还没有采样点");
    return;
  }
  const payload = points.map((p, i) => pointToJSON(p, i));
  const ok = await copyText(JSON.stringify(payload, null, 2));
  showToast(ok ? `已复制全部 ${points.length} 个坐标（JSON）` : "复制失败，请手动选择文本");
});

clearBtn.addEventListener("click", () => {
  if (!points.length) return;
  clearAll();
  showToast("已清空全部采样点");
});

window.addEventListener("keydown", (e) => {
  if ((e.key === "Delete" || e.key === "Backspace") && points.length && !isTypingTarget(e.target)) {
    e.preventDefault();
    removePoint(points[points.length - 1].id);
  }
});
function isTypingTarget(el) {
  return el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
}

/* ---------------- render loop ---------------- */

const clock = new THREE.Clock();
let wallFlashTimer = 0;

function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();
  controls.update();

  const hitWall = keepCameraIndoors();
  if (hitWall) {
    wallFlashTimer = 0.35;
    showWallHint();
  }
  if (wallFlashTimer > 0) {
    wallFlashTimer -= dt;
    wallVignette.style.opacity = Math.max(0, wallFlashTimer / 0.35) * 0.55;
  } else {
    wallVignette.style.opacity = 0;
  }

  const t = performance.now() * 0.002;
  markerGroup.children.forEach((group, i) => {
    const ring = group.children[1];
    if (ring) {
      ring.quaternion.copy(camera.quaternion);
      const pulse = 1 + Math.sin(t * 2 + i) * 0.08;
      ring.scale.setScalar(pulse);
    }
    const dist = camera.position.distanceTo(group.position);
    const s = THREE.MathUtils.clamp(dist / Math.max(modelScale * 0.09, 0.3), 0.6, 4);
    group.scale.setScalar(s);
  });

  if (hoverPoint) updateHover(lastClientX, lastClientY);

  renderer.render(scene, camera);
}

animate();
