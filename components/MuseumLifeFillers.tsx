"use client";

import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useRef } from "react";
import * as THREE from "three";
import { MARDOU_LIFE_FILLER_PLACEMENTS } from "./MardouMuseumLayout";

const WOOD = "#3f2b25";
const BRASS = "#bd9252";

function Ball({ position, color, pattern = "plain", scale = 1 }: {
  position: [number, number, number];
  color: string;
  pattern?: "plain" | "basketball" | "football" | "tennis";
  scale?: number;
}) {
  const footballPatches = [
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0, -1, 0),
    new THREE.Vector3(1, 0.15, 0).normalize(),
    new THREE.Vector3(-1, 0.15, 0).normalize(),
    new THREE.Vector3(0, 0.15, 1).normalize(),
    new THREE.Vector3(0, 0.15, -1).normalize(),
  ];
  return <group position={position} scale={scale}>
    <mesh castShadow>
      <sphereGeometry args={[0.24, 18, 12]} />
      <meshStandardMaterial color={color} roughness={0.72} />
    </mesh>
    {pattern === "basketball" ? [
      [0, 0, 0],
      [0, Math.PI / 2, 0],
      [Math.PI / 2, 0, 0],
    ].map((rotation) => (
      <mesh key={rotation.join(":")} rotation={rotation as [number, number, number]}>
        <torusGeometry args={[0.242, 0.009, 4, 28]} />
        <meshBasicMaterial color="#40251c" />
      </mesh>
    )) : null}
    {pattern === "football" ? footballPatches.map((direction, index) => (
      <mesh
        key={index}
        position={direction.clone().multiplyScalar(0.236).toArray()}
        quaternion={new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction).toArray()}
      >
        <circleGeometry args={[0.052, 5]} />
        <meshBasicMaterial color="#27252a" side={THREE.DoubleSide} />
      </mesh>
    )) : null}
    {pattern === "tennis" ? [-0.72, 0.72].map((rotation) => (
      <mesh key={rotation} rotation={[rotation, Math.PI / 2, 0]}>
        <torusGeometry args={[0.205, 0.008, 5, 28, Math.PI * 1.55]} />
        <meshBasicMaterial color="#fff8dd" />
      </mesh>
    )) : null}
  </group>;
}

function SportsDisplay() {
  const ball = useRef<THREE.Group>(null);
  useFrame((state, delta) => {
    if (!ball.current) return;
    ball.current.rotation.y += delta * 0.3;
    ball.current.position.y = 0.9 + Math.sin(state.clock.elapsedTime * 1.4) * 0.018;
  });
  const placement = MARDOU_LIFE_FILLER_PLACEMENTS.sports;
  return <group name="sports-life-display" position={placement.position} rotation={placement.rotation} scale={0.72}>
    <mesh receiveShadow position={[0, 0.09, 0]}>
      <cylinderGeometry args={[1.05, 1.15, 0.18, 24]} />
      <meshStandardMaterial color={WOOD} roughness={0.72} metalness={0.08} />
    </mesh>
    <mesh castShadow position={[0, 0.68, 0]}>
      <boxGeometry args={[1.82, 0.09, 0.72]} />
      <meshStandardMaterial color="#d5c2a4" roughness={0.7} />
    </mesh>
    {[-0.72, 0.72].map((x) => <mesh key={x} castShadow position={[x, 0.38, 0]}>
      <cylinderGeometry args={[0.035, 0.05, 0.62, 8]} />
      <meshStandardMaterial color={BRASS} metalness={0.58} roughness={0.34} />
    </mesh>)}
    <group ref={ball}><Ball position={[0, 0, 0]} color="#d86f37" pattern="basketball" scale={1.1} /></group>
    <Ball position={[-0.62, 0.94, 0]} color="#f1eee5" pattern="football" scale={0.92} />
    <Ball position={[0.62, 0.91, 0.02]} color="#dce84b" pattern="tennis" scale={0.78} />
    <mesh castShadow position={[0.63, 1.34, -0.02]} rotation={[0, 0, 0.22]}>
      <cylinderGeometry args={[0.035, 0.035, 0.86, 8]} />
      <meshStandardMaterial color="#3a5366" roughness={0.55} />
    </mesh>
    <mesh position={[0.82, 1.7, -0.02]} rotation={[0, 0, -0.2]}>
      <torusGeometry args={[0.2, 0.025, 7, 24]} />
      <meshStandardMaterial color="#6fd6c9" roughness={0.46} />
    </mesh>
  </group>;
}

function Cup({ position, color }: { position: [number, number, number]; color: string }) {
  return <group position={position}>
    <mesh castShadow><cylinderGeometry args={[0.12, 0.1, 0.26, 14]} /><meshStandardMaterial color={color} roughness={0.62} /></mesh>
    <mesh position={[0.14, 0.02, 0]} rotation={[Math.PI / 2, 0, 0]}>
      <torusGeometry args={[0.07, 0.018, 6, 14]} /><meshStandardMaterial color={color} roughness={0.62} />
    </mesh>
  </group>;
}

function RefreshmentDisplay() {
  const placement = MARDOU_LIFE_FILLER_PLACEMENTS.refreshments;
  return <group name="refreshment-life-display" position={placement.position} rotation={placement.rotation} scale={0.84}>
    <mesh receiveShadow position={[0, 0.42, 0]} castShadow>
      <cylinderGeometry args={[0.88, 0.72, 0.84, 18]} />
      <meshStandardMaterial color="#5b4035" roughness={0.78} />
    </mesh>
    <mesh castShadow position={[0, 0.88, 0]}><cylinderGeometry args={[1, 1, 0.1, 24]} /><meshStandardMaterial color="#ddc8aa" roughness={0.68} /></mesh>
    <Cup position={[-0.44, 1.1, 0.08]} color="#7ab8b1" />
    <Cup position={[0.42, 1.08, -0.08]} color="#c96f55" />
    <mesh castShadow position={[0, 1.05, 0.1]} rotation={[0.1, 0.2, -0.08]}>
      <torusGeometry args={[0.27, 0.09, 7, 18, Math.PI * 1.55]} />
      <meshStandardMaterial color="#d9a45c" roughness={0.8} />
    </mesh>
    <group position={[0.08, 1.08, -0.32]}>
      <mesh castShadow><sphereGeometry args={[0.16, 12, 8]} /><meshStandardMaterial color="#c95448" roughness={0.76} /></mesh>
      <mesh position={[0.03, 0.16, 0]} rotation={[0, 0, -0.35]}><coneGeometry args={[0.05, 0.15, 7]} /><meshStandardMaterial color="#517848" /></mesh>
    </group>
    <mesh castShadow position={[0.65, 1.36, 0]}><cylinderGeometry args={[0.1, 0.12, 0.62, 12]} /><meshStandardMaterial color="#6da3b6" transparent opacity={0.78} roughness={0.25} /></mesh>
    <mesh position={[0.65, 1.72, 0]}><cylinderGeometry args={[0.045, 0.045, 0.18, 8]} /><meshStandardMaterial color="#eee4cd" /></mesh>
    <group position={[-0.15, 1.11, -0.28]} rotation={[Math.PI / 2, 0.15, 0.15]}>
      <mesh castShadow><cylinderGeometry args={[0.2, 0.2, 0.14, 3]} /><meshStandardMaterial color="#f2d5a6" roughness={0.78} /></mesh>
      <mesh position={[0, 0.075, 0]}><cylinderGeometry args={[0.19, 0.19, 0.018, 3]} /><meshStandardMaterial color="#f4f0e7" roughness={0.7} /></mesh>
    </group>
    <group position={[-0.7, 1.26, -0.12]}>
      <mesh castShadow><cylinderGeometry args={[0.09, 0.09, 0.34, 12]} /><meshStandardMaterial color="#e7bb58" metalness={0.4} roughness={0.38} /></mesh>
      <mesh position={[0, 0.02, 0.091]}><boxGeometry args={[0.11, 0.08, 0.006]} /><meshBasicMaterial color="#f5efe1" /></mesh>
    </group>
  </group>;
}

type GlassPanelSpec = {
  position: [number, number, number];
  width: number;
  height: number;
  rotationY: number;
};

const CURVED_GLASS_FACADE_POINTS: ReadonlyArray<readonly [number, number]> = [
  [1.55, 13.35],
  [0.55, 11.85],
  [-0.7, 10.1],
  [-1.95, 8.3],
  [-3.25, 6.45],
  [-4.55, 4.6],
  [-5.8, 2.7],
  [-7, 0.65],
  [-8.1, -1.45],
  [-9.05, -3.7],
  [-9.85, -6],
] as const;

function curvedGlassBand(y: number, height: number, skip = 0): GlassPanelSpec[] {
  return CURVED_GLASS_FACADE_POINTS.slice(0, -1).flatMap(([x1, z1], index) => {
    if (index < skip) return [];
    const [x2, z2] = CURVED_GLASS_FACADE_POINTS[index + 1];
    const dx = x2 - x1;
    const dz = z2 - z1;
    return [{
      position: [(x1 + x2) / 2, y, (z1 + z2) / 2],
      width: Math.max(0.4, Math.hypot(dx, dz) - 0.035),
      height,
      rotationY: Math.atan2(-dz, dx),
    }];
  });
}

function straightGlassWing(y: number, height: number): GlassPanelSpec[] {
  return [3.1, 5.25, 7.4, 9.55].map((x) => ({
    position: [x, y, -7.58],
    width: 2.04,
    height,
    rotationY: 0,
  }));
}

const EXTERIOR_GLASS_PANELS: GlassPanelSpec[] = [
  // Glass belongs only to the ground-floor exterior. The upper-storey walls
  // remain exactly as authored in the museum GLB, including the whole level
  // around source point (-48.6612, -0.4787, -491.7025).
  ...curvedGlassBand(1.9, 3.08, 2),
  ...straightGlassWing(1.9, 3.08),
];

function InstancedGlassFacade() {
  const glass = useRef<THREE.InstancedMesh>(null);
  const tint = useRef<THREE.InstancedMesh>(null);
  const reflections = useRef<THREE.InstancedMesh>(null);
  const frames = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const transform = new THREE.Object3D();
    const setMatrix = (
      mesh: THREE.InstancedMesh,
      index: number,
      position: [number, number, number],
      rotationY: number,
      scale: [number, number, number],
      rotationZ = 0,
    ) => {
      transform.position.set(...position);
      transform.rotation.set(0, rotationY, rotationZ);
      transform.scale.set(...scale);
      transform.updateMatrix();
      mesh.setMatrixAt(index, transform.matrix);
    };

    let frameIndex = 0;
    let reflectionIndex = 0;
    EXTERIOR_GLASS_PANELS.forEach((panel, panelIndex) => {
      const [x, y, z] = panel.position;
      const cos = Math.cos(panel.rotationY);
      const sin = Math.sin(panel.rotationY);
      setMatrix(glass.current!, panelIndex, panel.position, panel.rotationY, [panel.width, panel.height, 1]);
      setMatrix(
        tint.current!,
        panelIndex,
        [x + sin * 0.009, y, z + cos * 0.009],
        panel.rotationY,
        [Math.max(0.1, panel.width - 0.04), Math.max(0.1, panel.height - 0.04), 1],
      );
      // One softly staggered ribbon per pane gives the glass depth without
      // forming a regular stripe pattern across the complete facade. Its small
      // forward offset avoids z-fighting with the pane and cyan backing tint.
      const reflectionOffset = 0.018;
      const reflectionX = (localX: number) => x + cos * localX + sin * reflectionOffset;
      const reflectionZ = (localX: number) => z - sin * localX + cos * reflectionOffset;
      const reflectionPhase = (panelIndex % 5) - 2;
      const reflectionLocalX = reflectionPhase * panel.width * 0.035;
      setMatrix(
        reflections.current!,
        reflectionIndex++,
        [
          reflectionX(reflectionLocalX),
          y + panel.height * (0.08 + reflectionPhase * 0.055),
          reflectionZ(reflectionLocalX),
        ],
        panel.rotationY,
        [panel.width * 0.58, Math.max(0.04, panel.height * 0.04), 1],
        -0.14 + (panelIndex % 4) * 0.055,
      );
      for (const side of [-1, 1]) {
        const localX = side * panel.width / 2;
        setMatrix(
          frames.current!,
          frameIndex++,
          [x + cos * localX, y, z - sin * localX],
          panel.rotationY,
          [0.032, panel.height + 0.04, 0.028],
        );
        setMatrix(
          frames.current!,
          frameIndex++,
          [x, y + side * panel.height / 2, z],
          panel.rotationY,
          [panel.width + 0.04, 0.032, 0.028],
        );
      }
      setMatrix(frames.current!, frameIndex++, [x, y, z], panel.rotationY, [panel.width, 0.02, 0.022]);
    });

    for (const mesh of [glass.current, tint.current, reflections.current, frames.current]) {
      if (!mesh) continue;
      mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
  }, []);

  return <>
    <instancedMesh
      ref={glass}
      args={[undefined, undefined, EXTERIOR_GLASS_PANELS.length]}
      userData={{ ignoreCameraCollision: true }}
      renderOrder={2}
    >
      <planeGeometry args={[1, 1]} />
      <meshPhysicalMaterial
        color="#a9d8df"
        metalness={0}
        roughness={0.075}
        transmission={0.8}
        thickness={0.1}
        ior={1.45}
        clearcoat={0.72}
        clearcoatRoughness={0.08}
        specularIntensity={1}
        specularColor="#f1ffff"
        envMapIntensity={0.92}
        transparent
        opacity={0.55}
        depthWrite={false}
        side={THREE.DoubleSide}
      />
    </instancedMesh>
    <instancedMesh
      ref={tint}
      args={[undefined, undefined, EXTERIOR_GLASS_PANELS.length]}
      userData={{ ignoreCameraCollision: true }}
      renderOrder={3}
    >
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial color="#75b9c5" transparent opacity={0.12} depthWrite={false} side={THREE.DoubleSide} />
    </instancedMesh>
    <instancedMesh
      ref={reflections}
      args={[undefined, undefined, EXTERIOR_GLASS_PANELS.length]}
      userData={{ ignoreCameraCollision: true }}
      renderOrder={4}
    >
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial
        color="#efffff"
        transparent
        opacity={0.075}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        side={THREE.DoubleSide}
        toneMapped={false}
      />
    </instancedMesh>
    <instancedMesh ref={frames} args={[undefined, undefined, EXTERIOR_GLASS_PANELS.length * 5]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="#667779" metalness={0.68} roughness={0.22} />
    </instancedMesh>
  </>;
}

export function MardouExteriorGlassFacade() {
  return <group name="mardou-exterior-glass-facade">
    <InstancedGlassFacade />
  </group>;
}

export function MuseumLifeFillers({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return <group name="museum-life-fillers">
    <SportsDisplay />
    <RefreshmentDisplay />
  </group>;
}
