import type { ParsedProfile, SourceEvidence } from "./types.ts";

const TRAILING_COPY_NOISE = [
  /(?:[\s,;|/-]*[\[(（]?\s*(?:line|lines|page|pages)\s*:\s*\d+(?:\s*[-–]\s*\d+)?\s*[\])）]?)+\s*$/i,
  /(?:[\s,;|/-]*[\[(（]?\s*(?:locator|source|evidence)\s*:\s*[^()[\]{}|,;]+[\])）]?)+\s*$/i,
  /(?:[\s,;|/-]+(?:evidence|source|locator)\s*)+$/i,
];

function compactDisplayWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function sanitizeDisplayText(value: string): string {
  let current = compactDisplayWhitespace(value);
  let previous = "";

  while (current && current !== previous) {
    previous = current;
    for (const pattern of TRAILING_COPY_NOISE) {
      current = compactDisplayWhitespace(current.replace(pattern, ""));
    }
    current = compactDisplayWhitespace(current.replace(/[\s,;|/-]+$/, ""));
  }

  return current || compactDisplayWhitespace(value);
}

function cleanOptional(value: string | undefined) {
  return value === undefined ? undefined : sanitizeDisplayText(value);
}

function mergeEvidenceMap(
  values: string[],
  evidenceMap: Record<string, SourceEvidence[]>,
): Record<string, SourceEvidence[]> {
  const next: Record<string, SourceEvidence[]> = {};
  for (const value of values) {
    const cleaned = sanitizeDisplayText(value);
    const rows = evidenceMap[value] || evidenceMap[cleaned] || [];
    if (!rows.length) continue;
    next[cleaned] = [...(next[cleaned] || []), ...rows];
  }
  return next;
}

function uniqueCleanValues(values: string[]) {
  const seen = new Set<string>();
  const cleaned: string[] = [];
  for (const value of values) {
    const next = sanitizeDisplayText(value);
    if (!next || seen.has(next)) continue;
    seen.add(next);
    cleaned.push(next);
  }
  return cleaned;
}

export function normalizeDisplayProfile(profile: ParsedProfile): ParsedProfile {
  const contacts = uniqueCleanValues(profile.contacts);
  const skills = uniqueCleanValues(profile.skills);

  return {
    ...profile,
    name: sanitizeDisplayText(profile.name),
    headline: sanitizeDisplayText(profile.headline),
    location: cleanOptional(profile.location),
    summary: sanitizeDisplayText(profile.summary),
    personalWebsite: cleanOptional(profile.personalWebsite),
    contacts,
    contactEvidence: mergeEvidenceMap(profile.contacts, profile.contactEvidence),
    skills,
    skillEvidence: mergeEvidenceMap(profile.skills, profile.skillEvidence),
    media: profile.media.map((media) => ({
      ...media,
      alt: cleanOptional(media.alt),
      title: cleanOptional(media.title),
    })),
    items: profile.items.map((item) => ({
      ...item,
      title: sanitizeDisplayText(item.title),
      subtitle: cleanOptional(item.subtitle),
      summary: sanitizeDisplayText(item.summary),
      bullets: item.bullets.map(sanitizeDisplayText).filter(Boolean),
      tags: uniqueCleanValues(item.tags),
      timeRange: cleanOptional(item.timeRange),
      role: cleanOptional(item.role),
      techStack: item.techStack ? uniqueCleanValues(item.techStack) : undefined,
      mediaProvenance: item.mediaProvenance
        ? {
            ...item.mediaProvenance,
            categoryReason: sanitizeDisplayText(item.mediaProvenance.categoryReason),
          }
        : undefined,
    })),
    source: {
      ...profile.source,
      label: sanitizeDisplayText(profile.source.label),
    },
  };
}
