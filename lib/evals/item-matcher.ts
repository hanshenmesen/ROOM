import type { ProfileItem } from "../types.ts";
import { titleSimilarity } from "./canonicalize.ts";
import type { GoldProfileItem } from "./types.ts";

export type ItemMatch = {
  gold: GoldProfileItem;
  candidate: ProfileItem;
  score: number;
};

function matchScore(gold: GoldProfileItem, candidate: ProfileItem) {
  const titleScore = Math.max(
    titleSimilarity(gold.canonicalTitle, candidate.title),
    ...(gold.aliases || []).map((alias) => titleSimilarity(alias, candidate.title)),
  );
  const kindScore = gold.kind === candidate.kind ? 1 : 0;
  const familyScore = gold.contentFamily
    ? gold.contentFamily === candidate.contentFamily ? 1 : 0
    : 1;
  return titleScore * 0.75 + kindScore * 0.2 + familyScore * 0.05;
}

export function matchProfileItems(
  goldItems: GoldProfileItem[],
  candidateItems: ProfileItem[],
  threshold = 0.72,
) {
  const candidates = candidateItems.filter((item) => item.kind !== "summary");
  const scored = goldItems.flatMap((gold) => candidates.map((candidate) => ({
    gold,
    candidate,
    score: matchScore(gold, candidate),
  }))).filter((entry) => entry.score >= threshold)
    .sort((left, right) => right.score - left.score
      || left.gold.id.localeCompare(right.gold.id)
      || left.candidate.id.localeCompare(right.candidate.id));
  const usedGold = new Set<string>();
  const usedCandidates = new Set<string>();
  const matches: ItemMatch[] = [];
  for (const entry of scored) {
    if (usedGold.has(entry.gold.id) || usedCandidates.has(entry.candidate.id)) continue;
    usedGold.add(entry.gold.id);
    usedCandidates.add(entry.candidate.id);
    matches.push(entry);
  }
  return {
    matches,
    missed: goldItems.filter((item) => !usedGold.has(item.id)),
    unexpected: candidates.filter((item) => !usedCandidates.has(item.id)),
  };
}
