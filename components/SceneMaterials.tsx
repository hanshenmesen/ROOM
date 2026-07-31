"use client";

import { useLoader } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { SceneTextureLoader } from "./SceneAssetLoaders";

const MATERIAL_ROOT = "/assets/materials";

type SurfaceKind = "lime-plaster" | "walnut-herringbone" | "terracotta-roof" | "showroom-rug";

export type SurfaceTextures = {
  map: THREE.Texture;
  bumpMap: THREE.Texture;
};

const BRASS_PBR = {
  roughness: 0.28,
  metalness: 0.78,
  envMapIntensity: 0.72,
};

const GLASS_PBR = {
  roughness: 0.18,
  transmission: 0.72,
  thickness: 0.18,
  ior: 1.46,
  clearcoat: 0.46,
  clearcoatRoughness: 0.22,
  envMapIntensity: 0.64,
};

function useSurfaceTextures(
  kind: SurfaceKind,
  repeatX?: number,
  repeatY?: number,
  offsetX = 0,
  offsetY = 0,
  surfaceAspect?: number,
  wrap: THREE.Wrapping = THREE.MirroredRepeatWrapping,
) {
  const [sourceMap, sourceBump] = useLoader(SceneTextureLoader, [
    `${MATERIAL_ROOT}/${kind}.webp`,
    `${MATERIAL_ROOT}/${kind}-height.webp`,
  ]);

  const [resolvedRepeatX, resolvedRepeatY, resolvedOffsetX, resolvedOffsetY] = useMemo(() => {
    if (kind === "showroom-rug" && (typeof repeatX !== "number" || typeof repeatY !== "number")) {
      const image = sourceMap.image as HTMLImageElement | null;
      const imageAspect = image?.width && image?.height ? image.width / image.height : 1.5;
      const resolvedSurfaceAspect = surfaceAspect ?? imageAspect;
      const { repeat: resolvedRepeat, offset: resolvedOffset } = computeRugCoverUV(imageAspect, resolvedSurfaceAspect);

      if (repeatX === undefined && repeatY === undefined && resolvedSurfaceAspect === imageAspect) {
        return [1, 1, 0, 0];
      }

      return [...resolvedRepeat, ...resolvedOffset];
    }

    return [repeatX ?? 1, repeatY ?? 1, offsetX, offsetY];
  }, [kind, offsetX, offsetY, repeatX, repeatY, sourceMap.image, surfaceAspect]);

  const textures = useMemo<SurfaceTextures>(() => {
    const map = sourceMap.clone();
    const bumpMap = sourceBump.clone();
    map.colorSpace = THREE.SRGBColorSpace;
    bumpMap.colorSpace = THREE.NoColorSpace;
    map.wrapS = map.wrapT = wrap;
    bumpMap.wrapS = bumpMap.wrapT = wrap;
    map.repeat.set(resolvedRepeatX, resolvedRepeatY);
    bumpMap.repeat.set(resolvedRepeatX, resolvedRepeatY);
    map.offset.set(resolvedOffsetX, resolvedOffsetY);
    bumpMap.offset.set(resolvedOffsetX, resolvedOffsetY);
    map.anisotropy = 8;
    bumpMap.anisotropy = 4;
    map.needsUpdate = true;
    bumpMap.needsUpdate = true;
    return { map, bumpMap };
  }, [resolvedRepeatX, resolvedRepeatY, resolvedOffsetX, resolvedOffsetY, sourceBump, sourceMap, wrap]);

  useEffect(() => () => {
    textures.map.dispose();
    textures.bumpMap.dispose();
  }, [textures]);

  return textures;
}

export function usePlasterTextures(repeatX = 3, repeatY = 2) {
  return useSurfaceTextures("lime-plaster", repeatX, repeatY);
}

export function useWalnutTextures(repeatX = 3, repeatY = 3) {
  return useSurfaceTextures("walnut-herringbone", repeatX, repeatY);
}

export function useRoofTextures(repeatX = 4, repeatY = 3) {
  return useSurfaceTextures("terracotta-roof", repeatX, repeatY);
}

type RugUV = {
  repeat: [number, number];
  offset: [number, number];
};

function computeRugCoverUV(sourceAspect = 1.5, surfaceAspect = 1.5): RugUV {
  const source = Number.isFinite(sourceAspect) && sourceAspect > 0 ? sourceAspect : 1;
  const surface = Number.isFinite(surfaceAspect) && surfaceAspect > 0 ? surfaceAspect : source;
  const repeat: [number, number] = [1, 1];
  const offset: [number, number] = [0, 0];

  if (Math.abs(source - surface) < Number.EPSILON) {
    return { repeat, offset };
  }

  if (source > surface) {
    repeat[0] = Number((surface / source).toFixed(4));
    offset[0] = Number(((1 - repeat[0]) / 2).toFixed(4));
  } else {
    repeat[1] = Number((source / surface).toFixed(4));
    offset[1] = Number(((1 - repeat[1]) / 2).toFixed(4));
  }

  return {
    repeat: [Number(Math.max(0.01, repeat[0]).toFixed(4)), Number(Math.max(0.01, repeat[1]).toFixed(4))],
    offset: [Number(Math.max(0, Math.min(0.9999, offset[0])).toFixed(4)), Number(Math.max(0, Math.min(0.9999, offset[1])).toFixed(4))],
  };
}

export function useRugTextures(repeat?: [number, number], surfaceAspect?: number) {
  const explicitRepeatX = typeof repeat?.[0] === "number" ? repeat?.[0] : undefined;
  const explicitRepeatY = typeof repeat?.[1] === "number" ? repeat?.[1] : undefined;
  const applySurfaceAspect = explicitRepeatX === undefined && explicitRepeatY === undefined;

  return useSurfaceTextures(
    "showroom-rug",
    explicitRepeatX,
    explicitRepeatY,
    0,
    0,
    applySurfaceAspect ? surfaceAspect : undefined,
    THREE.ClampToEdgeWrapping,
  );
}

export function BrassMaterial({ emissive = false }: { emissive?: boolean }) {
  return (
    <meshStandardMaterial
      color="#c89b56"
      metalness={BRASS_PBR.metalness}
      roughness={BRASS_PBR.roughness}
      envMapIntensity={BRASS_PBR.envMapIntensity}
      emissive={emissive ? "#8b5a2b" : "#000000"}
      emissiveIntensity={emissive ? 0.12 : 0}
    />
  );
}

export function GlassMaterial({ warm = false }: { warm?: boolean }) {
  return (
    <meshPhysicalMaterial
      color={warm ? "#ffd4a1" : "#8eb8bd"}
      metalness={0}
      roughness={GLASS_PBR.roughness}
      transmission={GLASS_PBR.transmission}
      thickness={GLASS_PBR.thickness}
      ior={GLASS_PBR.ior}
      clearcoat={GLASS_PBR.clearcoat}
      clearcoatRoughness={GLASS_PBR.clearcoatRoughness}
      envMapIntensity={GLASS_PBR.envMapIntensity}
      transparent
      opacity={0.9}
      side={THREE.DoubleSide}
    />
  );
}
