import type { WorldPlan } from "./types";

export const EXHIBIT_HEAT_STORAGE_PREFIX = "room:exhibit-heat:v1:";

export type ExhibitHeatTarget = {
  id: string;
  label: string;
  eyebrow: string;
  kind: "information-stand" | "project-pedestal";
  projectPage?: number;
};

export type ExhibitHeatLedger = {
  version: 1;
  profileId: string;
  entries: Record<string, {
    seed: number;
    localViews: number;
    lastFocusedAt?: string;
  }>;
};

export type ExhibitHeatItem = ExhibitHeatTarget & {
  seed: number;
  localViews: number;
  total: number;
};

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededViews(profileId: string, targetId: string, index: number) {
  return 34 + stableHash(`${profileId}:${targetId}`) % 143 + index * 2;
}

export function publicHeatTargets(world: WorldPlan, projectsPerPage = 3): ExhibitHeatTarget[] {
  const surfaces = world.displaySurfaces
    .filter((surface) => surface.roomId === "room-lobby" && surface.interaction.clickable)
    .map((surface) => ({
      id: surface.id,
      label: surface.title || surface.kicker || surface.semanticRole || "个人资料",
      eyebrow: surface.semanticRole?.toUpperCase() || "SHOWROOM",
      kind: "information-stand" as const,
    }));
  let projectIndex = 0;
  const exhibits = world.exhibits
    // The Mardou scene renders aggregate semantic surfaces plus at most one
    // visible page of project islands. Raw résumé rows (individual skills,
    // jobs, awards, etc.) have no independent mesh; routing the camera to
    // their pipeline coordinates can point through the ceiling or into empty
    // space. Keep the heat navigator aligned with actual clickable 3D props.
    .filter((exhibit) => (
      exhibit.roomId === "room-lobby"
      && exhibit.interaction.clickable
      && exhibit.eyebrow === "PROJECT"
      && exhibit.kind === "pedestal"
    ))
    .slice(0, projectsPerPage)
    .map((exhibit) => {
      const currentProjectIndex = projectIndex++;
      return {
        id: exhibit.id,
        label: exhibit.title,
        eyebrow: exhibit.eyebrow,
        kind: "project-pedestal" as const,
        projectPage: Math.floor(currentProjectIndex / projectsPerPage),
      };
    });
  return [...surfaces, ...exhibits];
}

export function createHeatLedger(
  profileId: string,
  targets: ExhibitHeatTarget[],
  stored?: ExhibitHeatLedger | null,
): ExhibitHeatLedger {
  const reusable = stored?.version === 1 && stored.profileId === profileId ? stored.entries : {};
  return {
    version: 1,
    profileId,
    entries: Object.fromEntries(targets.map((target, index) => {
      const existing = reusable[target.id];
      return [target.id, {
        seed: Number.isFinite(existing?.seed) ? Math.max(0, Math.round(existing.seed)) : seededViews(profileId, target.id, index),
        localViews: Number.isFinite(existing?.localViews) ? Math.max(0, Math.round(existing.localViews)) : 0,
        ...(typeof existing?.lastFocusedAt === "string" ? { lastFocusedAt: existing.lastFocusedAt } : {}),
      }];
    })),
  };
}

export function parseHeatLedger(value: unknown): ExhibitHeatLedger | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<ExhibitHeatLedger>;
  if (candidate.version !== 1 || typeof candidate.profileId !== "string" || !candidate.entries || typeof candidate.entries !== "object") return null;
  return candidate as ExhibitHeatLedger;
}

export function incrementHeatLedger(ledger: ExhibitHeatLedger, targetId: string, focusedAt = new Date().toISOString()) {
  const current = ledger.entries[targetId];
  if (!current) return ledger;
  return {
    ...ledger,
    entries: {
      ...ledger.entries,
      [targetId]: {
        ...current,
        localViews: current.localViews + 1,
        lastFocusedAt: focusedAt,
      },
    },
  };
}

export function heatItems(targets: ExhibitHeatTarget[], ledger: ExhibitHeatLedger): ExhibitHeatItem[] {
  return targets.map((target) => {
    const entry = ledger.entries[target.id] || { seed: 0, localViews: 0 };
    return { ...target, ...entry, total: entry.seed + entry.localViews };
  }).sort((left, right) => right.total - left.total || left.id.localeCompare(right.id));
}

export function heatStorageKey(profileId: string) {
  return `${EXHIBIT_HEAT_STORAGE_PREFIX}${profileId}`;
}
