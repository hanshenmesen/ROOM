import * as THREE from "three";

export function sampleCameraCurve(
  curve: THREE.Curve<THREE.Vector3>,
  progress: number,
  target: THREE.Vector3,
) {
  const safeProgress = Number.isFinite(progress)
    ? THREE.MathUtils.clamp(progress, 0, 1)
    : 1;
  const mappedProgress = curve.getUtoTmapping(safeProgress, 0);
  const curveProgress = Number.isFinite(mappedProgress)
    ? THREE.MathUtils.clamp(mappedProgress, 0, 1)
    : safeProgress;
  return curve.getPoint(curveProgress, target);
}
