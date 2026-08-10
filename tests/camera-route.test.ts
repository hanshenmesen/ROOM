import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { sampleCameraCurve } from "../lib/camera-route.ts";

test("camera routes stay valid when the camera is already at the destination", () => {
  const destination = new THREE.Vector3(1, 2, 3);
  const curve = new THREE.CatmullRomCurve3(
    [destination.clone(), destination.clone()],
    false,
    "centripetal",
    0.42,
  );
  const target = new THREE.Vector3();

  assert.doesNotThrow(() => sampleCameraCurve(curve, 0.5, target));
  assert.deepEqual(target.toArray(), destination.toArray());
});

test("camera routes retain arc-length sampling while the camera is moving", () => {
  const curve = new THREE.CatmullRomCurve3(
    [new THREE.Vector3(0, 0, 0), new THREE.Vector3(2, 1, -4)],
    false,
    "centripetal",
    0.42,
  );
  const target = new THREE.Vector3();

  assert.equal(sampleCameraCurve(curve, 0.5, target), target);
  assert.ok(target.distanceTo(new THREE.Vector3(1, 0.5, -2)) < 1e-6);
});

test("camera routes fall back to direct sampling when arc-length mapping is invalid", () => {
  const curve = new THREE.CatmullRomCurve3(
    [new THREE.Vector3(0, 0, 0), new THREE.Vector3(4, 0, 0)],
    false,
    "centripetal",
    0.42,
  );
  curve.getUtoTmapping = () => Number.NaN;
  const target = new THREE.Vector3();

  assert.doesNotThrow(() => sampleCameraCurve(curve, 0.5, target));
  assert.deepEqual(target.toArray(), [2, 0, 0]);
});
