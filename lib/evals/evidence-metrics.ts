import type { ParsedProfile, SourceEvidence } from "../types.ts";
import { canonicalizeText } from "./canonicalize.ts";

type Claim = {
  path: string;
  evidence: SourceEvidence[];
};

function locatorText(sourceText: string, locator: string) {
  const lines = sourceText.replace(/\r\n?/g, "\n").split("\n");
  const match = locator.match(/^lines?:(\d+)(?:-(\d+))?$/i);
  if (!match) return "";
  const start = Number(match[1]) - 1;
  const end = Number(match[2] || match[1]);
  if (start < 0 || end > lines.length || start >= end) return "";
  return lines.slice(start, end).join(" ");
}

export function evidenceIsValid(evidence: SourceEvidence, sourceText: string) {
  if (evidence.origin === "system-generated") {
    return evidence.locator.startsWith("system:");
  }
  const excerpt = canonicalizeText(evidence.excerpt);
  if (!excerpt || !canonicalizeText(sourceText).includes(excerpt)) return false;
  const located = locatorText(sourceText, evidence.locator);
  return Boolean(located) && canonicalizeText(located).includes(excerpt);
}

function factualClaims(profile: ParsedProfile): Claim[] {
  const claims: Claim[] = [];
  const add = (path: string, value: unknown, evidence: SourceEvidence[] | undefined) => {
    if (value === undefined || value === null || value === "") return;
    if (typeof value === "string" && [
      "Profile summary unavailable",
      "Profile details unavailable",
      "Untitled profile",
    ].includes(value)) return;
    if (evidence?.length && evidence.every((entry) => entry.origin === "system-generated")) return;
    claims.push({ path, evidence: evidence || [] });
  };
  add("identity.name", profile.name, profile.identityEvidence.name);
  add("identity.headline", profile.headline, profile.identityEvidence.headline);
  add("identity.location", profile.location, profile.identityEvidence.location);
  add("identity.summary", profile.summary, profile.identityEvidence.summary);
  add("identity.personalWebsite", profile.personalWebsite, profile.personalWebsiteEvidence);
  profile.contacts.forEach((contact) => add(`contacts.${contact}`, contact, profile.contactEvidence[contact]));
  (profile.foods || []).forEach((food) => add(`foods.${food}`, food, profile.foodEvidence?.[food]));
  (profile.hobbies || []).forEach((hobby) => add(`hobbies.${hobby}`, hobby, profile.hobbyEvidence?.[hobby]));
  profile.skills.forEach((skill) => add(`skills.${skill}`, skill, profile.skillEvidence[skill]));
  profile.items.filter((item) => item.kind !== "summary").forEach((item) => {
    add(`items.${item.id}`, `${item.title} ${item.summary}`, item.evidence);
    add(`items.${item.id}.timeRange`, item.timeRange, item.fieldEvidence?.timeRange);
    add(`items.${item.id}.role`, item.role, item.fieldEvidence?.role);
    add(`items.${item.id}.techStack`, item.techStack?.join(", "), item.fieldEvidence?.techStack);
    add(`items.${item.id}.projectUrl`, item.projectUrl, item.fieldEvidence?.projectUrl);
  });
  return claims;
}

export function profileEvidenceMetrics(profile: ParsedProfile, sourceText: string) {
  const claims = factualClaims(profile);
  const evidence = claims.flatMap((claim) => claim.evidence);
  const claimsWithEvidence = claims.filter((claim) => claim.evidence.length > 0).length;
  const validEvidence = evidence.filter((entry) => evidenceIsValid(entry, sourceText)).length;
  const supportedClaims = claims.filter((claim) => claim.evidence.some((entry) => evidenceIsValid(entry, sourceText))).length;
  return {
    evidenceCoverage: claims.length ? claimsWithEvidence / claims.length : 1,
    evidenceAccuracy: evidence.length ? validEvidence / evidence.length : claims.length ? 0 : 1,
    unsupportedClaimRate: claims.length ? (claims.length - supportedClaims) / claims.length : 0,
    missingEvidencePaths: claims.filter((claim) => !claim.evidence.length).map((claim) => claim.path),
    invalidEvidencePaths: claims
      .filter((claim) => claim.evidence.length && !claim.evidence.some((entry) => evidenceIsValid(entry, sourceText)))
      .map((claim) => claim.path),
  };
}
