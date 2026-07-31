import * as THREE from "three";

const HEIGHT_OFFSETS = [-0.72, 0, 0.58] as const;
const LATERAL_FACTORS = [-1, 0, 1] as const;

function visibleCollisionMaterial(object: THREE.Mesh) {
  if (!object.visible || object.userData.ignoreCameraCollision) return false;
  const materials = Array.isArray(object.material) ? object.material : [object.material];
  return materials.some((material) => material.visible && (!material.transparent || material.opacity >= 0.05));
}

export function sceneMovementBlocked(
  scene: THREE.Scene,
  origin: THREE.Vector3,
  movement: THREE.Vector3,
  radius: number,
  raycaster: THREE.Raycaster,
) {
  const distance = movement.length();
  if (distance < 0.000001) return false;

  const direction = movement.clone().normalize();
  const lateral = new THREE.Vector3(-direction.z, 0, direction.x);
  const probeOrigin = new THREE.Vector3();
  const collisionMeshes: THREE.Mesh[] = [];
  scene.traverseVisible((object) => {
    if (object instanceof THREE.Mesh && visibleCollisionMaterial(object)) {
      collisionMeshes.push(object);
    }
  });
  if (!collisionMeshes.length) return false;

  for (const height of HEIGHT_OFFSETS) {
    for (const lateralFactor of LATERAL_FACTORS) {
      probeOrigin
        .copy(origin)
        .addScaledVector(lateral, radius * lateralFactor)
        .addScaledVector(THREE.Object3D.DEFAULT_UP, height);
      raycaster.set(probeOrigin, direction);
      raycaster.near = 0;
      raycaster.far = distance + radius;
      if (raycaster.intersectObjects(collisionMeshes, false).length) return true;
    }
  }
  return false;
}

export function resolvePlanarMovement(
  origin: THREE.Vector3,
  movement: THREE.Vector3,
  blocked: (probeOrigin: THREE.Vector3, probeMovement: THREE.Vector3) => boolean,
) {
  if (!blocked(origin, movement)) return movement.clone();

  const resolved = new THREE.Vector3();
  const axes = [
    new THREE.Vector3(movement.x, 0, 0),
    new THREE.Vector3(0, 0, movement.z),
  ].sort((left, right) => right.lengthSq() - left.lengthSq());

  for (const axis of axes) {
    if (axis.lengthSq() < 0.000001) continue;
    const probeOrigin = origin.clone().add(resolved);
    if (!blocked(probeOrigin, axis)) resolved.add(axis);
  }
  return resolved;
}
