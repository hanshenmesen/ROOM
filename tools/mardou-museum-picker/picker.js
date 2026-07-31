/* ============================================================
   The Mardou Museum — Coordinate Picker (first-person / WASD)
   ------------------------------------------------------------
   First-person free-fly navigation over MardouMuseumResult.glb: WASD (or
   arrow keys) to walk, mouse to look around a full 360°/180°
   (yaw/pitch) via the browser Pointer Lock API — no mouse button
   needs to be held down — Space/Shift to rise/descend, and a left
   click drops a marker at whatever the center crosshair is aimed
   at, reading off its local (model-space) XYZ coordinate. Points
   are listed in a side panel, individually copyable, and
   exportable as one JSON blob.

   WHY POINTER LOCK INSTEAD OF ORBITCONTROLS
   -------------------------------------------
   OrbitControls (drag to orbit a fixed target, right-drag to pan)
   is natural for inspecting an object from outside, but wrong for
   walking through an interior: there's no "orbit target" to circle
   — you want to walk freely and look in any direction independent
   of movement. Pointer Lock hides and re-centers the OS cursor so
   raw mouse deltas (`movementX`/`movementY`) can drive yaw/pitch
   without ever hitting the edge of the browser window, which is
   what makes 360°-look-while-walking possible at all, with no
   mouse button held.

   GENERIC / SELF-CALIBRATING
   ---------------------------
   This picker does NOT hardcode the model's bounding box, scale,
   or units. After the glb loads, it computes a world-space
   THREE.Box3 from the loaded scene graph (which already accounts
   for every node's transform — TRS or baked matrix, nested any
   number of levels deep, whatever the exporter produced). Starting
   camera position/look direction, near/far planes, fog density,
   walk speed, marker size, and the room-containment box are all
   derived from that box and its diagonal length. This means the
   same file works unmodified on a building-scale museum (hundreds
   of arbitrary units) or a room-scale, meter-unit interior — no
   manual coordinate surgery required per model.

   ROOM CONTAINMENT
   -----------------
   ROOM_MIN/ROOM_MAX provide the outer safety box, while a radius-
   aware 3×3 ray sweep checks the model's visible structural meshes
   before every move. Blocked diagonal motion is retried per axis,
   which keeps the camera out of interior walls while allowing it
   to slide naturally along them.
   ============================================================ */

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

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
scene.background = new THREE.Color(0x0d0f10);

// placeholder camera; real near/far/position are set once the
// model's bounding box is known (see calibrateToBoundingBox)
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 1.6, 5);

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

/* ---------------- first-person look (pointer lock) ---------------- */

let yaw = Math.PI;
let pitch = 0;
const PITCH_LIMIT = Math.PI / 2 - 0.02;
const LOOK_SENSITIVITY = 0.0022;

function applyLook() {
  const euler = new THREE.Euler(pitch, yaw, 0, "YXZ");
  camera.quaternion.setFromEuler(euler);
}
applyLook();

const canvas = renderer.domElement;
let isLocked = false;

const lockOverlay = document.getElementById("lockOverlay");
const lockEyebrow = document.getElementById("lockEyebrow");

function requestLock() {
  canvas.requestPointerLock =
    canvas.requestPointerLock || canvas.mozRequestPointerLock;
  canvas.requestPointerLock();
}

document.addEventListener("pointerlockchange", () => {
  isLocked = document.pointerLockElement === canvas;
  lockOverlay.classList.toggle("hidden", isLocked);
  if (isLocked) resetMovementKeys();
});
document.addEventListener("pointerlockerror", () => {
  showToast("无法锁定鼠标指针，请重试点击");
});

// The overlay sits visually on top of the canvas (so its "click to
// enter" hint is readable), which means it also intercepts the
// click event before it would reach the canvas beneath. Both need
// their own listener so the very first click — whichever element
// happens to receive it — engages pointer lock.
canvas.addEventListener("click", () => {
  if (!isLocked && modelReady) requestLock();
});
lockOverlay.addEventListener("click", () => {
  if (!isLocked && modelReady) requestLock();
});

document.addEventListener("mousemove", (e) => {
  if (!isLocked) return;
  yaw -= e.movementX * LOOK_SENSITIVITY;
  pitch -= e.movementY * LOOK_SENSITIVITY;
  pitch = THREE.MathUtils.clamp(pitch, -PITCH_LIMIT, PITCH_LIMIT);
  applyLook();
});

/* ---------------- WASD + Space/Shift movement ---------------- */

const keys = { forward: false, back: false, left: false, right: false, up: false, down: false };

function resetMovementKeys() {
  for (const k in keys) keys[k] = false;
}

const KEYMAP = {
  KeyW: "forward",
  ArrowUp: "forward",
  KeyS: "back",
  ArrowDown: "back",
  KeyA: "left",
  ArrowLeft: "left",
  KeyD: "right",
  ArrowRight: "right",
  Space: "up",
  ShiftLeft: "down",
  ShiftRight: "down",
};

window.addEventListener("keydown", (e) => {
  const bind = KEYMAP[e.code];
  if (bind) {
    if (isLocked) e.preventDefault(); // stop Space from scrolling the page, etc.
    keys[bind] = true;
  }
  if ((e.key === "Delete" || e.key === "Backspace") && points.length && !isTypingTarget(e.target)) {
    e.preventDefault();
    removePoint(points[points.length - 1].id);
  }
});
window.addEventListener("keyup", (e) => {
  const bind = KEYMAP[e.code];
  if (bind) keys[bind] = false;
});
function isTypingTarget(el) {
  return el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
}
// if the user alt-tabs or the browser force-releases the lock,
// stuck-key movement would otherwise continue forever
window.addEventListener("blur", resetMovementKeys);

let moveSpeed = 2; // overwritten once the model's scale is known
let cameraRadius = 0.35;
const forwardVec = new THREE.Vector3();
const rightVec = new THREE.Vector3();
const moveVec = new THREE.Vector3();
const safeMoveVec = new THREE.Vector3();
const collisionRaycaster = new THREE.Raycaster();
const collisionOrigin = new THREE.Vector3();
const collisionLateral = new THREE.Vector3();
let colliders = [];

function movementBlocked(origin, movement) {
  const distance = movement.length();
  if (!colliders.length || distance < 0.000001) return false;
  const direction = movement.clone().normalize();
  collisionLateral.set(-direction.z, 0, direction.x);
  for (const height of [-cameraRadius * 1.4, 0, cameraRadius * 1.1]) {
    for (const lateralFactor of [-1, 0, 1]) {
      collisionOrigin
        .copy(origin)
        .addScaledVector(collisionLateral, cameraRadius * lateralFactor)
        .addScaledVector(THREE.Object3D.DEFAULT_UP, height);
      collisionRaycaster.set(collisionOrigin, direction);
      collisionRaycaster.near = 0;
      collisionRaycaster.far = distance + cameraRadius;
      if (collisionRaycaster.intersectObjects(colliders, false).length) return true;
    }
  }
  return false;
}

function resolveMovement(origin, movement, out) {
  if (!movementBlocked(origin, movement)) return out.copy(movement);
  out.set(0, 0, 0);
  const axes = [
    new THREE.Vector3(movement.x, 0, 0),
    new THREE.Vector3(0, 0, movement.z),
    new THREE.Vector3(0, movement.y, 0),
  ].sort((left, right) => right.lengthSq() - left.lengthSq());
  for (const axis of axes) {
    if (axis.lengthSq() < 0.000001) continue;
    collisionOrigin.copy(origin).add(out);
    if (!movementBlocked(collisionOrigin, axis)) out.add(axis);
  }
  return out;
}

function applyMovement(dt) {
  if (!isLocked) return;
  // horizontal-only forward/right (classic FPS walk: looking up/down
  // doesn't make W fly you into the ceiling/floor); Space/Shift give
  // dedicated vertical control for reaching upper areas.
  forwardVec.set(-Math.sin(yaw), 0, -Math.cos(yaw));
  rightVec.set(Math.cos(yaw), 0, -Math.sin(yaw));

  moveVec.set(0, 0, 0);
  if (keys.forward) moveVec.add(forwardVec);
  if (keys.back) moveVec.sub(forwardVec);
  if (keys.right) moveVec.add(rightVec);
  if (keys.left) moveVec.sub(rightVec);
  if (moveVec.lengthSq() > 0) moveVec.normalize();
  if (keys.up) moveVec.y += 1;
  if (keys.down) moveVec.y -= 1;

  if (moveVec.lengthSq() > 0) {
    moveVec.multiplyScalar(moveSpeed * dt);
    resolveMovement(camera.position, moveVec, safeMoveVec);
    camera.position.add(safeMoveVec);
  }
}

/* ---------------- room containment (filled in after load) ---------------- */

let ROOM_MIN = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
let ROOM_MAX = new THREE.Vector3(Infinity, Infinity, Infinity);

/* keep the camera inside the model's volume, every frame, after
   movement is applied — see ROOM CONTAINMENT above */
function keepCameraIndoors() {
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

  const margin = Math.max(diagonal * 0.04, 0.05);
  ROOM_MIN = box.min.clone().addScalar(margin);
  ROOM_MAX = box.max.clone().subScalar(margin);
  ROOM_MIN.min(ROOM_MAX.clone().subScalar(0.01)); // guard degenerate/flat models

  camera.near = Math.max(diagonal * 0.001, 0.01);
  camera.far = diagonal * 8;
  camera.updateProjectionMatrix();

  scene.fog = new THREE.FogExp2(0x0d0f10, 1.2 / diagonal);

  // walking speed: cross the room's diagonal in ~9 seconds by default
  moveSpeed = diagonal / 9;
  cameraRadius = Math.max(diagonal * 0.006, 0.05);

  // start roughly at "eye height" inside the volume: near one side,
  // a third of the way up from the floor, facing toward the center
  const eyeY = box.min.y + size.y * 0.35;
  const startPos = new THREE.Vector3(
    center.x - size.x * 0.28,
    eyeY,
    center.z - size.z * 0.28
  );
  camera.position.copy(startPos);

  const lookTarget = new THREE.Vector3(center.x, eyeY, center.z);
  const dir = lookTarget.clone().sub(startPos).normalize();
  yaw = Math.atan2(-dir.x, -dir.z);
  pitch = Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1));
  applyLook();

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

/* ---------------- lighting ---------------- */

scene.add(new THREE.HemisphereLight(0x8fb3c9, 0x1a1712, 0.6));

const keyLight = new THREE.DirectionalLight(0xfff2df, 1.15);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
scene.add(keyLight);

const fillLight = new THREE.PointLight(0xffd8a8, 1, 0, 2);
scene.add(fillLight);

/* ---------------- load model ---------------- */

const loadWrap = document.getElementById("loadWrap");
const loadFill = document.getElementById("loadFill");
const loadLabel = document.getElementById("loadLabel");

let pickables = []; // meshes we allow raycasting against
let modelReady = false;
let modelScale = 1; // used to size markers proportionally to the model

const loader = new GLTFLoader();
loader.load(
  MODEL_URL,
  (gltf) => {
    const root = gltf.scene;
    root.traverse((obj) => {
      if (obj.isMesh) {
        if (obj.name === "Picture_1") {
          obj.visible = false;
          return;
        }
        obj.castShadow = true;
        obj.receiveShadow = true;
        if (obj.material) obj.material.side = THREE.DoubleSide;
        pickables.push(obj);
        if (!/^(Floor|Ceiling|Picture)/.test(obj.name)) colliders.push(obj);
      }
    });
    scene.add(root);

    const { diagonal } = calibrateToBoundingBox(root);
    modelScale = diagonal;

    modelReady = true;
    loadLabel.textContent = "模型已就绪 · 点击画面进入";
    loadFill.style.width = "100%";
    setTimeout(() => loadWrap.classList.add("hidden"), 700);
    lockOverlay.classList.add("ready");
    lockEyebrow.textContent = "点击进入";
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

/* ---------------- picking (always from the center crosshair) ---------------- */

const raycaster = new THREE.Raycaster();
const CENTER_NDC = new THREE.Vector2(0, 0);
const hoverBadge = document.getElementById("hoverBadge");

function updateHover() {
  if (!pickables.length || !isLocked) {
    hoverBadge.classList.remove("show");
    return;
  }
  raycaster.setFromCamera(CENTER_NDC, camera);
  const hits = raycaster.intersectObjects(pickables, false);
  if (hits.length) {
    const p = hits[0].point;
    hoverBadge.textContent = `X ${p.x.toFixed(2)}  Y ${p.y.toFixed(2)}  Z ${p.z.toFixed(2)}`;
    hoverBadge.classList.add("show");
  } else {
    hoverBadge.classList.remove("show");
  }
}

function tryPickCenter() {
  if (!pickables.length) return;
  raycaster.setFromCamera(CENTER_NDC, camera);
  const hits = raycaster.intersectObjects(pickables, false);
  if (!hits.length) return;
  const hit = hits[0];
  const worldNormal = hit.face
    ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld)
    : null;
  addPoint(hit.point.clone(), worldNormal, hit.object.name || "Mesh");
}

// left-click while locked = take a point at the crosshair. The very
// first click (while unlocked) is consumed by the canvas/overlay
// "click" listeners above to engage pointer lock instead, so there's
// no double-fire on the click that locks the pointer: mousedown fires
// before pointer lock is granted, so isLocked is still false then.
document.addEventListener("mousedown", (e) => {
  if (isLocked && e.button === 0) tryPickCenter();
});

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
  showToast("已到边界 — 无法再往前走");
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
    copyBtn.addEventListener("click", async (evt) => {
      evt.stopPropagation();
      const ok = await copyText(formatCoord(p.position));
      showToast(ok ? `已复制点 #${i + 1} 坐标` : "复制失败，请手动选择文本");
    });

    const delBtn = document.createElement("button");
    delBtn.textContent = "删除";
    delBtn.addEventListener("click", (evt) => {
      evt.stopPropagation();
      removePoint(p.id);
    });

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

/* ---------------- render loop ---------------- */

const clock = new THREE.Clock();
let wallFlashTimer = 0;

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.1); // clamp so an alt-tab pause doesn't teleport you

  applyMovement(dt);
  const hitWall = keepCameraIndoors();
  if (hitWall) {
    wallFlashTimer = 0.3;
    showWallHint();
  }
  if (wallFlashTimer > 0) {
    wallFlashTimer -= dt;
    wallVignette.style.opacity = Math.max(0, wallFlashTimer / 0.3) * 0.5;
  } else {
    wallVignette.style.opacity = 0;
  }

  updateHover();

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

  renderer.render(scene, camera);
}

animate();
