import type { ParsedProfile, ProfileItem, ProfileMedia, SourceEvidence } from "./types.ts";
import { validateProfile } from "./validate.ts";

function canonical(value: string) {
  return value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

function sameItem(left: ProfileItem, right: ProfileItem) {
  if (left.kind !== right.kind) return false;
  const leftTitle = canonical(left.title);
  const rightTitle = canonical(right.title);
  return leftTitle === rightTitle || (
    Math.min(leftTitle.length, rightTitle.length) >= 18 &&
    (leftTitle.includes(rightTitle) || rightTitle.includes(leftTitle))
  );
}

function uniqueEvidence(entries: SourceEvidence[]) {
  return [...new Map(entries.map((entry) => [
    `${entry.sourceId}:${entry.locator}:${entry.excerpt}`,
    entry,
  ])).values()];
}

function uniqueMedia(entries: ProfileMedia[]) {
  return [...new Map(entries.map((entry) => [entry.url, entry])).values()];
}

function mergeItem(primary: ProfileItem, supplement: ProfileItem): ProfileItem {
  return {
    ...primary,
    ...(primary.contentFamily ? {} : supplement.contentFamily ? { contentFamily: supplement.contentFamily } : {}),
    ...(primary.subtitle ? {} : supplement.subtitle ? { subtitle: supplement.subtitle } : {}),
    summary: primary.summary.length >= supplement.summary.length ? primary.summary : supplement.summary,
    bullets: [...new Set([...primary.bullets, ...supplement.bullets])],
    tags: [...new Set([...primary.tags, ...supplement.tags])],
    ...(primary.imageUrl ? {} : supplement.imageUrl ? { imageUrl: supplement.imageUrl } : {}),
    ...(primary.sourceUrl ? {} : supplement.sourceUrl ? { sourceUrl: supplement.sourceUrl } : {}),
    ...(primary.timeRange ? {} : supplement.timeRange ? { timeRange: supplement.timeRange } : {}),
    ...(primary.role ? {} : supplement.role ? { role: supplement.role } : {}),
    ...(primary.techStack?.length ? {} : supplement.techStack?.length ? { techStack: supplement.techStack } : {}),
    ...(primary.projectUrl ? {} : supplement.projectUrl ? { projectUrl: supplement.projectUrl } : {}),
    fieldEvidence: { ...supplement.fieldEvidence, ...primary.fieldEvidence },
    ...(primary.mediaProvenance ? {} : supplement.mediaProvenance ? { mediaProvenance: supplement.mediaProvenance } : {}),
    evidence: uniqueEvidence([...primary.evidence, ...supplement.evidence]),
  };
}

export function mergeProfiles(primary: ParsedProfile, supplement: ParsedProfile, label: string): ParsedProfile {
  const items = primary.items.map((item) => ({ ...item }));
  for (const candidate of supplement.items) {
    const index = items.findIndex((item) => sameItem(item, candidate));
    if (index >= 0) items[index] = mergeItem(items[index], candidate);
    else items.push(candidate);
  }
  const skills = [...new Map([...primary.skills, ...supplement.skills]
    .map((skill) => [canonical(skill), skill])).values()];
  const foods = [...new Map([...(primary.foods || []), ...(supplement.foods || [])]
    .map((food) => [canonical(food), food])).values()];
  const hobbies = [...new Map([...(primary.hobbies || []), ...(supplement.hobbies || [])]
    .map((hobby) => [canonical(hobby), hobby])).values()];
  const contacts = [...new Set([...primary.contacts, ...supplement.contacts])];
  const useSupplementSummary = supplement.summary.length > primary.summary.length;
  const merged: ParsedProfile = {
    ...primary,
    summary: useSupplementSummary ? supplement.summary : primary.summary,
    contacts,
    media: uniqueMedia([...primary.media, ...supplement.media]),
    identityEvidence: {
      ...primary.identityEvidence,
      ...(useSupplementSummary ? { summary: supplement.identityEvidence.summary } : {}),
    },
    contactEvidence: { ...supplement.contactEvidence, ...primary.contactEvidence },
    foods,
    foodEvidence: { ...supplement.foodEvidence, ...primary.foodEvidence },
    hobbies,
    hobbyEvidence: { ...supplement.hobbyEvidence, ...primary.hobbyEvidence },
    skills,
    skillEvidence: { ...supplement.skillEvidence, ...primary.skillEvidence },
    items,
    source: { ...primary.source, label },
  };
  const errors = validateProfile(merged);
  if (errors.length) throw new Error(`整合后的 Profile 未通过验证：${errors.join("；")}`);
  return merged;
}
