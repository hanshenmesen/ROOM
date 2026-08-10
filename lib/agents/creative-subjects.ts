import type { ParsedProfile, ProfileMedia, SourceEvidence } from "../types.ts";

export type CreativeSubjectKind = "person" | "pet";

export type CreativeSubjectStatus =
  | "proposed"
  | "approved"
  | "rendering"
  | "ready"
  | "fallback"
  | "omitted";

export type CreativeSubjectMode = "2.5d-standee" | "procedural-lowpoly" | "offline-gltf";

export type CreativeSubjectSourceKind =
  | "profile-photo"
  | "pet-photo"
  | "contextual-text"
  | "source-less-system";

export type CreativeSubjectFallbackKind =
  | "none"
  | "source-less-system"
  | "provider-failed"
  | "evidence-insufficient";

export type CreativeSubjectAssetKind =
  | "procedural-standee"
  | "procedural-lowpoly"
  | "offline-gltf"
  | "reference-image";

export type CreativeSubjectMediaCandidate = ProfileMedia;

export interface CreativeSubjectSource {
  kind: CreativeSubjectSourceKind;
  label: string;
  confidence: number;
  evidence: SourceEvidence[];
  media?: CreativeSubjectMediaCandidate;
}

export interface CreativeSubjectAsset {
  kind: CreativeSubjectAssetKind;
  description: string;
  sourceUrl?: string;
  license?: string;
  hash?: string;
}

export interface CreativeSubjectFallback {
  kind: CreativeSubjectFallbackKind;
  reason: string;
  recoveryMode: CreativeSubjectMode;
}

export interface CreativeSubjectGeneration {
  mode: CreativeSubjectMode;
  provider: "deterministic-planner" | string;
  similarityDisclosure: string;
}

export interface CreativeSubject {
  id: string;
  kind: CreativeSubjectKind;
  label: string;
  status: CreativeSubjectStatus;
  confidence: number;
  similarityDisclosure: string;
  source: CreativeSubjectSource;
  generation: CreativeSubjectGeneration;
  asset?: CreativeSubjectAsset;
  fallback: CreativeSubjectFallback;
  evidence: SourceEvidence[];
}

export interface CreativeSubjectSceneDisclosure {
  title: string;
  subtitle: string;
}

export type CreativeSubjectProviderResult =
  | {
      ok: true;
      asset: CreativeSubjectAsset;
    }
  | {
      ok: false;
      reason: string;
      fallbackMode?: CreativeSubjectMode;
    };

export interface CreativeSubjectProvider {
  id: string;
  render(subject: CreativeSubject): CreativeSubjectProviderResult;
}

type ProfileLike = ParsedProfile;

const PERSON_THRESHOLD = 0.78;
const PET_THRESHOLD = 0.76;
const PET_TEXT_THRESHOLD = 0.6;

const PET_KEYWORDS = [
  "cat",
  "dog",
  "pet",
  "kitten",
  "puppy",
  "kitty",
  "猫",
  "狗",
  "宠物",
  "喵",
  "汪",
];

const PERSON_HINTS = [
  "profile",
  "portrait",
  "avatar",
  "headshot",
  "photo",
  "self",
  "个人",
  "头像",
  "照片",
  "肖像",
];

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function stableId(value: string) {
  let hash = 2166136261;
  for (const char of value) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function clean(value: string | undefined) {
  return (value || "").replace(/\s+/g, " ").trim();
}

function shortLabel(value: string, maxLength = 28) {
  const normalized = clean(value);
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1).trimEnd()}…` : normalized;
}

function evidenceSnippet(evidence: SourceEvidence[]) {
  return evidence.map((item) => item.excerpt).join(" ").trim();
}

function keywordHit(text: string, keyword: string) {
  const normalized = text.toLowerCase();
  if (/^[\u4e00-\u9fff]+$/.test(keyword)) return normalized.includes(keyword);
  return new RegExp(`(^|[^a-z0-9])${keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=$|[^a-z0-9])`, "i").test(normalized);
}

function hasAnyKeyword(text: string, keywords: string[]) {
  return keywords.some((keyword) => keywordHit(text, keyword));
}

function keywordIsNegated(text: string, keyword: string) {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b(?:no|not|without|never)\\b(?:\\W+\\w+){0,2}\\W+${escaped}\\b`, "i").test(text);
}

function countPositivePetHits(text: string) {
  return PET_KEYWORDS.reduce((count, keyword) => {
    return count + (keywordHit(text, keyword) && !keywordIsNegated(text, keyword) ? 1 : 0);
  }, 0);
}

function gatherEvidence(profile: ProfileLike, matcher: (text: string) => boolean): SourceEvidence[] {
  const evidence: SourceEvidence[] = [];
  for (const item of profile.items) {
    const rows = item.evidence.filter((row) => matcher(`${item.title} ${item.subtitle || ""} ${item.summary} ${evidenceSnippet(item.evidence)} ${row.excerpt}`));
    evidence.push(...rows);
  }
  for (const media of profile.media) {
    if (matcher(`${media.alt || ""} ${media.title || ""} ${media.originalUrl || ""} ${media.categoryReason || ""}`)) {
      evidence.push(mediaEvidence(profile.source.id, media));
    }
  }
  return evidence.slice(0, 6);
}

function mediaEvidence(sourceId: string, media: ProfileMedia): SourceEvidence {
  return {
    sourceId,
    locator: media.locator,
    excerpt: clean([media.alt, media.title, media.originalUrl].join(" ")),
  };
}

function scoreMediaForPerson(media: ProfileMedia, profile: ProfileLike) {
  const text = clean([media.alt, media.title, media.kind, media.linkUrl, media.sourcePage, profile.name, profile.headline].join(" "));
  let score = media.category === "profile-photo" ? 0.74 : 0.46;
  if (hasAnyKeyword(text, PERSON_HINTS)) score += 0.12;
  if (profile.name && text.includes(profile.name.toLowerCase())) score += 0.1;
  score += media.categoryConfidence * 0.08;
  return clamp(score, 0, 0.98);
}

function selectPersonMedia(profile: ProfileLike) {
  if (!profile.media.length) return undefined;
  return profile.media
    .filter((item) => item.category === "profile-photo")
    .map((item) => ({ item, score: scoreMediaForPerson(item, profile) }))
    .sort((a, b) => b.score - a.score)[0];
}

function inferPetLabel(text: string) {
  if (keywordHit(text, "cat") || keywordHit(text, "猫") || keywordHit(text, "kitten") || keywordHit(text, "kitty")) return "Cat";
  if (keywordHit(text, "dog") || keywordHit(text, "狗") || keywordHit(text, "puppy")) return "Dog";
  return "Pet";
}

function scorePetCandidate(text: string, media?: ProfileMedia) {
  const directHits = countPositivePetHits(text);
  if (!directHits) return 0;
  let score = 0.42 + directHits * 0.18;
  if (media?.category === "content" || media?.category === "other") score += 0.12;
  score += media?.categoryConfidence ? media.categoryConfidence * 0.08 : 0;
  return clamp(score, 0, 0.98);
}

function selectPetCandidate(profile: ProfileLike) {
  const candidates = [
    ...profile.media.map((item) => ({
      source: item,
      text: clean([item.alt, item.title, item.categoryReason].join(" ")),
    })),
    ...profile.items.map((item) => ({
      source: undefined as ProfileMedia | undefined,
      text: clean([item.summary, ...item.bullets, ...item.tags, ...item.evidence.map((row) => row.excerpt)].join(" ")),
    })),
  ];
  return candidates
    .map((candidate) => ({
      ...candidate,
      score: scorePetCandidate(candidate.text, candidate.source),
    }))
    .sort((a, b) => b.score - a.score)[0];
}

function buildSubjectId(kind: CreativeSubjectKind, label: string, source: string) {
  return `${kind}-${stableId(`${kind}:${label}:${source}`)}`;
}

function basePersonDisclosure() {
  return "Stylized collectible reinterpretation, not an identity copy.";
}

function disclosureSourceLabel(kind: CreativeSubjectSourceKind) {
  switch (kind) {
    case "profile-photo":
      return "PHOTO REF";
    case "pet-photo":
      return "PET PHOTO";
    case "contextual-text":
      return "TEXT EVIDENCE";
    case "source-less-system":
      return "NO PHOTO";
  }
}

function disclosureModeLabel(mode: CreativeSubjectMode) {
  switch (mode) {
    case "2.5d-standee":
      return "2.5D";
    case "procedural-lowpoly":
      return "LOW-POLY";
    case "offline-gltf":
      return "GLTF";
  }
}

function disclosureStatusLabel(status: CreativeSubjectStatus) {
  switch (status) {
    case "proposed":
      return "PROPOSED";
    case "approved":
      return "APPROVED";
    case "rendering":
      return "RENDERING";
    case "ready":
      return "READY";
    case "fallback":
      return "FALLBACK";
    case "omitted":
      return "OMITTED";
  }
}

function disclosureFallbackLabel(subject: CreativeSubject) {
  if (subject.fallback.kind === "none") return "NO COPY";
  const reason = shortLabel(subject.fallback.reason).toUpperCase();
  if (subject.fallback.kind === "source-less-system") return "SOURCELESS";
  if (subject.fallback.kind === "provider-failed") return reason ? `FAILED: ${reason}` : "PROVIDER FAILED";
  if (subject.fallback.kind === "evidence-insufficient") return "LOW EVIDENCE";
  return "FALLBACK";
}

export function buildCreativeSubjectSceneDisclosure(subject: CreativeSubject): CreativeSubjectSceneDisclosure {
  const role = subject.kind === "person" ? "CARTOON HOST" : "CARTOON PET";
  const state = subject.status === "fallback"
    ? subject.kind === "person" ? "FALLBACK HOST" : "FALLBACK PET"
    : role;
  const title = subject.kind === "person" ? state : `${state} ${subject.label.toUpperCase()}`;
  const subtitle = [
    disclosureSourceLabel(subject.source.kind),
    disclosureModeLabel(subject.generation.mode),
    disclosureStatusLabel(subject.status),
    disclosureFallbackLabel(subject),
  ].join(" · ");
  return { title, subtitle };
}

function buildApprovedPerson(profile: ProfileLike, media: ProfileMedia, confidence: number): CreativeSubject {
  const evidence = [mediaEvidence(profile.source.id, media)];
  return {
    id: buildSubjectId("person", profile.name, media.url),
    kind: "person",
    label: profile.name,
    status: "approved",
    confidence,
    similarityDisclosure: basePersonDisclosure(),
    source: {
      kind: "profile-photo",
      label: clean(media.title || media.alt || profile.name),
      confidence,
      evidence,
      media,
    },
    generation: {
      mode: "2.5d-standee",
      provider: "deterministic-planner",
      similarityDisclosure: basePersonDisclosure(),
    },
    asset: {
      kind: "procedural-standee",
      description: "Stylized 2.5D standee derived from a profile photo; no likeness copy.",
      sourceUrl: media.url,
    },
    fallback: {
      kind: "none",
      reason: "Profile photo exceeded the person threshold.",
      recoveryMode: "2.5d-standee",
    },
    evidence,
  };
}

function buildPersonFallback(profile: ProfileLike): CreativeSubject {
  const evidence: SourceEvidence[] = [];
  const confidence = 0.22;
  return {
    id: buildSubjectId("person", profile.name, profile.source.id),
    kind: "person",
    label: profile.name,
    status: "fallback",
    confidence,
    similarityDisclosure: "Source-less system fallback; no appearance details were inferred.",
    source: {
      kind: "source-less-system",
      label: profile.name,
      confidence,
      evidence,
    },
    generation: {
      mode: "procedural-lowpoly",
      provider: "deterministic-planner",
      similarityDisclosure: "Source-less system fallback; no appearance details were inferred.",
    },
    asset: {
      kind: "procedural-lowpoly",
      description: "Source-less placeholder figure with no inferred face, hairstyle, or outfit details.",
    },
    fallback: {
      kind: "source-less-system",
      reason: "No profile photo was available.",
      recoveryMode: "procedural-lowpoly",
    },
    evidence,
  };
}

function buildPetSubject(profile: ProfileLike, text: string, media?: ProfileMedia, confidence = 0): CreativeSubject {
  const evidence = [
    ...(media ? [mediaEvidence(profile.source.id, media)] : []),
    ...gatherEvidence(profile, (value) => hasAnyKeyword(value, PET_KEYWORDS)),
  ];
  const label = inferPetLabel(text);
  const sourceKind: CreativeSubjectSourceKind = media ? "pet-photo" : "contextual-text";
  return {
    id: buildSubjectId("pet", label, media?.url || profile.source.id),
    kind: "pet",
    label,
    status: "approved",
    confidence,
    similarityDisclosure: "Stylized collectible reinterpretation, not an identity copy.",
    source: {
      kind: sourceKind,
      label: clean(media?.title || media?.alt || label),
      confidence,
      evidence,
      media,
    },
    generation: {
      mode: media ? "2.5d-standee" : "procedural-lowpoly",
      provider: "deterministic-planner",
      similarityDisclosure: "Stylized collectible reinterpretation, not an identity copy.",
    },
    asset: {
      kind: media ? "procedural-standee" : "procedural-lowpoly",
      description: media
        ? "Stylized 2.5D standee for a clearly evidenced pet."
        : "Procedural low-poly pet fallback driven by explicit text evidence.",
      sourceUrl: media?.url,
    },
    fallback: {
      kind: "none",
      reason: "Explicit pet evidence met the threshold.",
      recoveryMode: media ? "2.5d-standee" : "procedural-lowpoly",
    },
    evidence,
  };
}

export function transitionCreativeSubject(
  subject: CreativeSubject,
  status: CreativeSubjectStatus,
  patch: Partial<Omit<CreativeSubject, "id" | "kind">> = {},
): CreativeSubject {
  return {
    ...subject,
    ...patch,
    status,
  };
}

export function downgradeCreativeSubject(
  subject: CreativeSubject,
  reason: string,
  fallbackMode: CreativeSubjectMode = "procedural-lowpoly",
): CreativeSubject {
  return transitionCreativeSubject(subject, "fallback", {
    generation: {
      ...subject.generation,
      mode: fallbackMode,
      provider: "deterministic-planner",
    },
    asset: {
      kind: fallbackMode === "2.5d-standee" ? "procedural-standee" : "procedural-lowpoly",
      description: subject.kind === "person"
        ? "Fallback figure with no additional identity claims."
        : "Fallback pet figure with no additional breed claims.",
    },
    fallback: {
      kind: "provider-failed",
      reason,
      recoveryMode: fallbackMode,
    },
  });
}

export function applyCreativeSubjectProviderResult(
  subject: CreativeSubject,
  result: CreativeSubjectProviderResult,
): CreativeSubject {
  if (result.ok) {
    return transitionCreativeSubject(subject, "ready", {
      asset: result.asset,
      fallback: {
        kind: "none",
        reason: "Provider completed successfully.",
        recoveryMode: subject.generation.mode,
      },
    });
  }
  return downgradeCreativeSubject(subject, result.reason, result.fallbackMode || "procedural-lowpoly");
}

export function findRenderableCreativeSubject(
  subjects: CreativeSubject[],
  kind: CreativeSubjectKind,
) {
  return subjects.find((subject) => subject.kind === kind && subject.status !== "omitted");
}

export function planCreativeSubjects(profile: ParsedProfile): CreativeSubject[] {
  const input = profile as ProfileLike;
  const subjects: CreativeSubject[] = [];
  const personMedia = selectPersonMedia(input);
  if (personMedia && personMedia.score >= PERSON_THRESHOLD) {
    subjects.push(buildApprovedPerson(input, personMedia.item, personMedia.score));
  } else {
    subjects.push(buildPersonFallback(input));
  }

  const petCandidate = selectPetCandidate(input);
  if (petCandidate && petCandidate.score >= (petCandidate.source ? PET_THRESHOLD : PET_TEXT_THRESHOLD)) {
    const evidenceText = petCandidate.text;
    const media = petCandidate.source;
    subjects.push(buildPetSubject(input, evidenceText, media, petCandidate.score));
  }

  return subjects;
}
