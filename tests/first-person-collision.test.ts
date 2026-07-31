import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { resolvePlanarMovement, sceneMovementBlocked } from "../components/FirstPersonCollision.ts";

test("collision sweep accounts for camera radius instead of probing only the center", () => {
  const scene = new THREE.Scene();
  const wall = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 3, 0.3),
    new THREE.MeshBasicMaterial(),
  );
  wall.position.set(0.42, 1.5, -0.6);
  scene.add(wall);
  scene.updateMatrixWorld(true);

  assert.equal(
    sceneMovementBlocked(
      scene,
      new THREE.Vector3(0, 1.5, 0),
      new THREE.Vector3(0, 0, -0.5),
      0.42,
      new THREE.Raycaster(),
    ),
    true,
  );
});

test("collision sweep ignores interactive sprites that require a camera raycaster", () => {
  const scene = new THREE.Scene();
  const navigationSign = new THREE.Sprite(new THREE.SpriteMaterial());
  navigationSign.position.set(0, 1.5, -0.3);
  scene.add(navigationSign);
  scene.updateMatrixWorld(true);

  assert.doesNotThrow(() => {
    assert.equal(
      sceneMovementBlocked(
        scene,
        new THREE.Vector3(0, 1.5, 0),
        new THREE.Vector3(0, 0, -0.5),
        0.42,
        new THREE.Raycaster(),
      ),
      false,
    );
  });
});

test("blocked diagonal movement falls back to an unblocked sliding axis", () => {
  const origin = new THREE.Vector3();
  const movement = new THREE.Vector3(1, 0, -1);
  const resolved = resolvePlanarMovement(origin, movement, (_probeOrigin, probeMovement) => (
    Math.abs(probeMovement.x) > 0.001
  ));

  assert.deepEqual(resolved.toArray(), [0, 0, -1]);
});
