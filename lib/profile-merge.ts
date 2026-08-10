import type {
  ParsedProfile,
  ProfileItem,
  ProfileItemField,
  ProfileMedia,
  SourceEvidence,
} from "./types.ts";
import { validateProfile } from "./validate.ts";
import { validatePublicUrl } from "./public-web.ts";

export const PROFILE_MERGE_REPORT_SCHEMA_VERSION = "profile-merge-report.v1" as const;

export type ClaimExtractionMethod = "agent" | "deterministic" | "user";
export type MergeResolution = "primary" | "supplement" | "user_required" | "user" | "rejected";
export type ProfileReviewAction = "primary" | "supplement" | "edit" | "reject";
export type ProfileMergeProfileField = "name" | "headline" | "location" | "summary" | "personalWebsite";
export type ProfileMergeItemField = ProfileItemField | "summary";

export type EvidenceBackedClaim<T> = {
  value: T;
  confidence: number;
  evidence: SourceEvidence[];
  sourcePriority: number;
  extractionMethod: ClaimExtractionMethod;
};

export type ProfileMergeTarget =
  | {
    scope: "profile";
    field: ProfileMergeProfileField;
  }
  | {
    scope: "item";
    itemId: string;
    field: ProfileMergeItemField;
  }
  | {
    scope: "contact";
    contact: string;
  }
  | {
    scope: "media";
    url: string;
  };

export type ProfileMergeDecision = {
  decisionId: string;
  target: ProfileMergeTarget;
  label: string;
  resolution: Exclude<MergeResolution, "user_required">;
  reason: string;
  selected?: EvidenceBackedClaim<string | string[]>;
};

export type ProfileConflict = {
  conflictId: string;
  target: ProfileMergeTarget;
  label: string;
  kind: "source_conflict" | "missing_evidence" | "sensitive_publication" | "low_confidence";
  required: boolean;
  primary?: EvidenceBackedClaim<string | string[]>;
  supplement?: EvidenceBackedClaim<string | string[]>;
  resolution: "user_required";
  reason: string;
};

export type ProfileMergeReport = {
  schemaVersion: typeof PROFILE_MERGE_REPORT_SCHEMA_VERSION;
  primarySource: string;
  supplementSource: string;
  merged: ParsedProfile;
  decisions: ProfileMergeDecision[];
  conflicts: ProfileConflict[];
  reviewRequired: boolean;
};

export type ProfileReviewResolution = {
  conflictId: string;
  action: ProfileReviewAction;
  value?: string | string[];
};

export type UserConfirmedClaim = {
  target: ProfileMergeTarget;
  value?: string | string[];
  action: ProfileReviewAction;
  evidence: SourceEvidence[];
  confidence: 1;
  sourcePriority: 1_000;
  extractionMethod: "user";
};

export type ProfileReviewResult = {
  profile: ParsedProfile;
  userClaims: UserConfirmedClaim[];
};

const PROFILE_FIELD_LABELS = {
  name: "姓名",
  headline: "职业标题",
  location: "所在地",
  summary: "个人摘要",
  personalWebsite: "个人网站",
} as const;

const ITEM_FIELD_LABELS: Record<ProfileMergeItemField, string> = {
  summary: "摘要",
  timeRange: "时间范围",
  role: "项目角色",
  techStack: "技术栈",
  projectUrl: "项目链接",
};

const HIGH_RISK_PROFILE_FIELDS = new Set<ProfileMergeProfileField>([
  "name",
  "headline",
  "location",
  "personalWebsite",
]);
const HIGH_RISK_ITEM_FIELDS = new Set<ProfileItemField>(["timeRange", "role", "projectUrl"]);

function canonical(value: string) {
  return value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

function stableToken(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function canonicalValue(value: string | string[]) {
  return Array.isArray(value)
    ? [...value].map(canonical).filter(Boolean).sort().join("|")
    : canonical(value);
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
    `${entry.sourceId}:${entry.locator}:${entry.excerpt}:${entry.origin || "source"}`,
    entry,
  ])).values()];
}

function uniqueMedia(entries: ProfileMedia[]) {
  return [...new Map(entries.map((entry) => [entry.url, entry])).values()];
}

function hasUserConfirmation(evidence: SourceEvidence[]) {
  return evidence.some((entry) => entry.origin === "user-confirmed");
}

function hasDirectEvidence(evidence: SourceEvidence[]) {
  return evidence.some((entry) => entry.origin !== "system-generated");
}

function makeClaim<T extends string | string[]>(
  value: T | undefined,
  evidence: SourceEvidence[] | undefined,
  sourcePriority: number,
  extractionMethod: Exclude<ClaimExtractionMethod, "user">,
): EvidenceBackedClaim<T> | undefined {
  if (value === undefined || (typeof value === "string" && !value.trim()) || (Array.isArray(value) && !value.length)) {
    return undefined;
  }
  const normalizedEvidence = uniqueEvidence(evidence || []);
  const userConfirmed = hasUserConfirmation(normalizedEvidence);
  return {
    value,
    confidence: userConfirmed ? 1 : hasDirectEvidence(normalizedEvidence) ? 0.92 : 0.35,
    evidence: normalizedEvidence,
    sourcePriority: userConfirmed ? 1_000 : sourcePriority,
    extractionMethod: userConfirmed ? "user" : extractionMethod,
  };
}

function targetKey(target: ProfileMergeTarget) {
  if (target.scope === "profile") return `profile.${target.field}`;
  if (target.scope === "item") {
    const readableId = canonical(target.itemId).slice(0, 32) || "item";
    return `item.${readableId}-${stableToken(target.itemId)}.${target.field}`;
  }
  if (target.scope === "contact") return `contact.${stableToken(target.contact)}`;
  return `media.${stableToken(target.url)}`;
}

function stableId(prefix: "decision" | "conflict", target: ProfileMergeTarget) {
  return `${prefix}-${targetKey(target).replace(/[^a-zA-Z0-9_-]+/g, "-")}`;
}

function targetLabel(target: ProfileMergeTarget, item?: ProfileItem) {
  if (target.scope === "profile") return PROFILE_FIELD_LABELS[target.field];
  if (target.scope === "item") return `${item?.title || target.itemId} · ${ITEM_FIELD_LABELS[target.field]}`;
  return target.scope === "contact" ? "公开联系方式" : "低置信度媒体";
}

function isPlaceholderValue(value: string | string[]) {
  if (Array.isArray(value)) return false;
  return ["untitledprofile", "profiledetailsunavailable", "profilesummaryunavailable"].includes(canonical(value));
}

function claimsEqual(
  primary?: EvidenceBackedClaim<string | string[]>,
  supplement?: EvidenceBackedClaim<string | string[]>,
) {
  return primary && supplement && canonicalValue(primary.value) === canonicalValue(supplement.value);
}

function selectClaim(
  target: ProfileMergeTarget,
  primary: EvidenceBackedClaim<string | string[]> | undefined,
  supplement: EvidenceBackedClaim<string | string[]> | undefined,
  label: string,
  highRisk: boolean,
  decisions: ProfileMergeDecision[],
  conflicts: ProfileConflict[],
) {
  if (!primary && !supplement) return undefined;
  if (!primary || !supplement) {
    const selected = primary || supplement;
    if (!selected) return undefined;
    if (highRisk && !hasDirectEvidence(selected.evidence) && !isPlaceholderValue(selected.value)) {
      conflicts.push({
        conflictId: stableId("conflict", target),
        target,
        label,
        kind: "missing_evidence",
        required: true,
        ...(primary ? { primary } : { supplement }),
        resolution: "user_required",
        reason: "关键字段只有低置信度推断，缺少可验证的直接证据，需要用户确认。",
      });
      return selected;
    }
    decisions.push({
      decisionId: stableId("decision", target),
      target,
      label,
      resolution: primary ? "primary" : "supplement",
      reason: primary ? "仅主来源提供了该字段。" : "主来源缺少该字段，使用补充来源。",
      selected,
    });
    return selected;
  }
  if (claimsEqual(primary, supplement)) {
    const selected = {
      ...primary,
      confidence: Math.max(primary.confidence, supplement.confidence),
      evidence: uniqueEvidence([...primary.evidence, ...supplement.evidence]),
      sourcePriority: Math.max(primary.sourcePriority, supplement.sourcePriority),
      extractionMethod: primary.extractionMethod === "user" || supplement.extractionMethod === "user"
        ? "user" as const
        : primary.extractionMethod,
    };
    if (highRisk && !hasDirectEvidence(selected.evidence) && !isPlaceholderValue(selected.value)) {
      conflicts.push({
        conflictId: stableId("conflict", target),
        target,
        label,
        kind: "missing_evidence",
        required: true,
        primary,
        supplement,
        resolution: "user_required",
        reason: "两个来源给出了相同值，但关键字段仍缺少可验证的直接证据。",
      });
      return selected;
    }
    decisions.push({
      decisionId: stableId("decision", target),
      target,
      label,
      resolution: selected.extractionMethod === "user" ? "user" : "primary",
      reason: "两个来源的规范化值一致，合并双方证据。",
      selected,
    });
    return selected;
  }
  if (primary.extractionMethod === "user" || supplement.extractionMethod === "user") {
    const selected = primary.extractionMethod === "user" ? primary : supplement;
    decisions.push({
      decisionId: stableId("decision", target),
      target,
      label,
      resolution: "user",
      reason: "保留用户已确认的值，Agent 与自动规则均不能覆盖。",
      selected,
    });
    return selected;
  }
  const primaryDirect = hasDirectEvidence(primary.evidence);
  const supplementDirect = hasDirectEvidence(supplement.evidence);
  if (primaryDirect !== supplementDirect) {
    const selected = primaryDirect ? primary : supplement;
    decisions.push({
      decisionId: stableId("decision", target),
      target,
      label,
      resolution: primaryDirect ? "primary" : "supplement",
      reason: "优先采用具有直接来源证据的值。",
      selected,
    });
    return selected;
  }
  if (highRisk) {
    conflicts.push({
      conflictId: stableId("conflict", target),
      target,
      label,
      kind: primaryDirect || supplementDirect ? "source_conflict" : "missing_evidence",
      required: true,
      primary,
      supplement,
      resolution: "user_required",
      reason: primaryDirect || supplementDirect
        ? "两个来源为高风险字段提供了不同值，需要用户结合证据确认。"
        : "高风险字段缺少可验证的直接证据，需要用户确认。",
    });
    return primary.sourcePriority >= supplement.sourcePriority ? primary : supplement;
  }
  const selected = primary.sourcePriority >= supplement.sourcePriority ? primary : supplement;
  decisions.push({
    decisionId: stableId("decision", target),
    target,
    label,
    resolution: selected === primary ? "primary" : "supplement",
    reason: "低风险差异按来源优先级选择；未使用字符串长度作为可信度。",
    selected,
  });
  return selected;
}

function profileEvidence(profile: ParsedProfile, field: ProfileMergeProfileField) {
  if (field === "personalWebsite") return profile.personalWebsiteEvidence;
  return profile.identityEvidence[field];
}

function setProfileClaim(
  profile: ParsedProfile,
  field: ProfileMergeProfileField,
  claim: EvidenceBackedClaim<string | string[]> | undefined,
) {
  const value = typeof claim?.value === "string" ? claim.value : undefined;
  if (field === "personalWebsite") {
    if (value) profile.personalWebsite = value;
    else delete profile.personalWebsite;
    if (claim?.evidence.length) profile.personalWebsiteEvidence = claim.evidence;
    else delete profile.personalWebsiteEvidence;
    return;
  }
  if (field === "location") {
    if (value) profile.location = value;
    else delete profile.location;
  } else {
    profile[field] = value || "";
  }
  if (claim?.evidence.length) profile.identityEvidence[field] = claim.evidence;
  else delete profile.identityEvidence[field];
}

function mergeItem(
  primary: ProfileItem,
  supplement: ProfileItem,
  decisions: ProfileMergeDecision[],
  conflicts: ProfileConflict[],
): ProfileItem {
  const merged: ProfileItem = {
    ...primary,
    ...(primary.contentFamily ? {} : supplement.contentFamily ? { contentFamily: supplement.contentFamily } : {}),
    ...(primary.subtitle ? {} : supplement.subtitle ? { subtitle: supplement.subtitle } : {}),
    bullets: [...new Set([...primary.bullets, ...supplement.bullets])],
    tags: [...new Set([...primary.tags, ...supplement.tags])],
    ...(primary.imageUrl ? {} : supplement.imageUrl ? { imageUrl: supplement.imageUrl } : {}),
    ...(primary.sourceUrl ? {} : supplement.sourceUrl ? { sourceUrl: supplement.sourceUrl } : {}),
    ...(primary.mediaProvenance ? {} : supplement.mediaProvenance ? { mediaProvenance: supplement.mediaProvenance } : {}),
    fieldEvidence: { ...supplement.fieldEvidence, ...primary.fieldEvidence },
    evidence: uniqueEvidence([...primary.evidence, ...supplement.evidence]),
  };
  const primarySummaryEvidence = primary.evidence.filter((entry) => entry.origin !== "system-generated");
  const supplementSummaryEvidence = supplement.evidence.filter((entry) => entry.origin !== "system-generated");
  const summary = selectClaim(
    { scope: "item", itemId: primary.id, field: "summary" },
    makeClaim(primary.summary, primarySummaryEvidence, 100, "agent"),
    makeClaim(supplement.summary, supplementSummaryEvidence, 80, "agent"),
    `${primary.title} · 摘要`,
    false,
    decisions,
    conflicts,
  );
  merged.summary = typeof summary?.value === "string" ? summary.value : primary.summary;

  for (const field of ["timeRange", "role", "projectUrl"] as const) {
    const target: ProfileMergeTarget = { scope: "item", itemId: primary.id, field };
    const claim = selectClaim(
      target,
      makeClaim(primary[field], primary.fieldEvidence?.[field], 100, "agent"),
      makeClaim(supplement[field], supplement.fieldEvidence?.[field], 80, "agent"),
      targetLabel(target, primary),
      HIGH_RISK_ITEM_FIELDS.has(field),
      decisions,
      conflicts,
    );
    const value = typeof claim?.value === "string" ? claim.value : undefined;
    if (value) merged[field] = value;
    else delete merged[field];
    if (claim?.evidence.length) merged.fieldEvidence = { ...merged.fieldEvidence, [field]: claim.evidence };
    else if (merged.fieldEvidence) delete merged.fieldEvidence[field];
  }

  const techStack = [...new Map([...(primary.techStack || []), ...(supplement.techStack || [])]
    .map((value) => [canonical(value), value])).values()];
  if (techStack.length) {
    merged.techStack = techStack;
    merged.fieldEvidence = {
      ...merged.fieldEvidence,
      techStack: uniqueEvidence([
        ...(primary.fieldEvidence?.techStack || []),
        ...(supplement.fieldEvidence?.techStack || []),
      ]),
    };
    if (!hasDirectEvidence(merged.fieldEvidence.techStack || [])) {
      const target: ProfileMergeTarget = { scope: "item", itemId: primary.id, field: "techStack" };
      conflicts.push({
        conflictId: stableId("conflict", target),
        target,
        label: targetLabel(target, primary),
        kind: "missing_evidence",
        required: true,
        primary: makeClaim(primary.techStack, primary.fieldEvidence?.techStack, 100, "agent"),
        supplement: makeClaim(supplement.techStack, supplement.fieldEvidence?.techStack, 80, "agent"),
        resolution: "user_required",
        reason: "技术栈缺少可验证的直接证据，需要用户确认。",
      });
    }
  } else {
    delete merged.techStack;
    if (merged.fieldEvidence) delete merged.fieldEvidence.techStack;
  }
  if (merged.fieldEvidence && !Object.keys(merged.fieldEvidence).length) delete merged.fieldEvidence;
  return merged;
}

function deferredByRequiredReview(error: string, conflicts: ProfileConflict[]) {
  return conflicts.some((conflict) => {
    if (conflict.kind !== "missing_evidence") return false;
    const target = conflict.target;
    if (target.scope === "profile") {
      if (target.field === "name") return error === "profile name needs source evidence";
      if (target.field === "headline") return error === "profile headline needs source evidence";
      if (target.field === "location") return error === "profile location needs source evidence";
      if (target.field === "personalWebsite") return error === "personal website needs source evidence";
      return false;
    }
    if (target.scope !== "item" || target.field === "summary") return false;
    return error === `${target.itemId} ${target.field} needs field evidence`;
  });
}

export function mergeProfilesWithReport(
  primary: ParsedProfile,
  supplement: ParsedProfile,
  label: string,
): ProfileMergeReport {
  const decisions: ProfileMergeDecision[] = [];
  const conflicts: ProfileConflict[] = [];
  const merged = structuredClone(primary);

  for (const field of ["name", "headline", "location", "summary", "personalWebsite"] as const) {
    const target: ProfileMergeTarget = { scope: "profile", field };
    const claim = selectClaim(
      target,
      makeClaim(primary[field], profileEvidence(primary, field), 100, "agent"),
      makeClaim(supplement[field], profileEvidence(supplement, field), 80, "agent"),
      targetLabel(target),
      HIGH_RISK_PROFILE_FIELDS.has(field),
      decisions,
      conflicts,
    );
    setProfileClaim(merged, field, claim);
  }

  const items = primary.items.map((item) => structuredClone(item));
  for (const candidate of supplement.items) {
    const index = items.findIndex((item) => sameItem(item, candidate));
    if (index >= 0) items[index] = mergeItem(items[index], candidate, decisions, conflicts);
    else items.push(structuredClone(candidate));
  }
  const mergeUnique = (left: string[], right: string[]) => [...new Map([...left, ...right]
    .map((value) => [canonical(value), value])).values()];
  merged.contacts = [...new Set([...primary.contacts, ...supplement.contacts])];
  merged.media = uniqueMedia([...primary.media, ...supplement.media]);
  merged.foods = mergeUnique(primary.foods || [], supplement.foods || []);
  merged.foodEvidence = { ...supplement.foodEvidence, ...primary.foodEvidence };
  merged.hobbies = mergeUnique(primary.hobbies || [], supplement.hobbies || []);
  merged.hobbyEvidence = { ...supplement.hobbyEvidence, ...primary.hobbyEvidence };
  merged.skills = mergeUnique(primary.skills, supplement.skills);
  merged.skillEvidence = { ...supplement.skillEvidence, ...primary.skillEvidence };
  merged.contactEvidence = { ...supplement.contactEvidence, ...primary.contactEvidence };
  merged.items = items;
  merged.source = { ...primary.source, label };

  for (const contact of merged.contacts.filter((value) => /(?:\+?\d[\d ()-]{7,}\d)/.test(value))) {
    const target: ProfileMergeTarget = { scope: "contact", contact };
    const evidence = merged.contactEvidence[contact] || [];
    conflicts.push({
      conflictId: stableId("conflict", target),
      target,
      label: targetLabel(target),
      kind: "sensitive_publication",
      required: true,
      primary: makeClaim(contact, evidence, 100, "agent"),
      resolution: "user_required",
      reason: "该字段看起来包含电话号码，公开到 3D 空间前需要你确认。",
    });
  }
  merged.media.forEach((media, index) => {
    if (!["profile-photo", "project-cover"].includes(media.category) || media.categoryConfidence >= 0.55) return;
    const target: ProfileMergeTarget = { scope: "media", url: media.url };
    const locator = /^(?:line|lines|page|pages|image|char|media|img|paper-box|meta-image|profile-img|system|user):/.test(media.locator)
      ? media.locator
      : `media:${index + 1}`;
    const mediaClaim = makeClaim(media.url, [{
      sourceId: media.sourcePage,
      locator,
      excerpt: [media.alt, media.title, media.originalUrl].filter(Boolean).join(" · ").slice(0, 500),
      origin: "source",
    }], 100, "deterministic");
    conflicts.push({
      conflictId: stableId("conflict", target),
      target,
      label: targetLabel(target),
      kind: "low_confidence",
      required: true,
      primary: mediaClaim ? { ...mediaClaim, confidence: media.categoryConfidence } : undefined,
      resolution: "user_required",
      reason: `该图片被映射为${media.category === "profile-photo" ? "头像" : "项目封面"}，但分类置信度只有 ${Math.round(media.categoryConfidence * 100)}%。`,
    });
  });

  const errors = validateProfile(merged).filter((error) => !deferredByRequiredReview(error, conflicts));
  if (errors.length) throw new Error(`整合后的 Profile 未通过验证：${errors.join("；")}`);
  return {
    schemaVersion: PROFILE_MERGE_REPORT_SCHEMA_VERSION,
    primarySource: primary.source.label,
    supplementSource: supplement.source.label,
    merged,
    decisions,
    conflicts,
    reviewRequired: conflicts.some((conflict) => conflict.required),
  };
}

function userEvidence(conflict: ProfileConflict, value: string | string[], sourceEvidence: SourceEvidence[] = []) {
  const excerpt = Array.isArray(value) ? value.join(", ") : value;
  return uniqueEvidence([
    ...sourceEvidence,
    {
      sourceId: "user-review",
      locator: `user:${conflict.conflictId}`,
      excerpt: excerpt.slice(0, 500),
      origin: "user-confirmed" as const,
    },
  ]);
}

function applyResolvedClaim(
  profile: ParsedProfile,
  conflict: ProfileConflict,
  value: string | string[] | undefined,
  evidence: SourceEvidence[],
) {
  const { target } = conflict;
  if (target.scope === "profile") {
    setProfileClaim(profile, target.field, value === undefined ? undefined : {
      value,
      confidence: 1,
      evidence,
      sourcePriority: 1_000,
      extractionMethod: "user",
    });
    return;
  }
  if (target.scope === "contact") {
    const index = profile.contacts.indexOf(target.contact);
    if (index < 0) throw new Error(`无法定位待确认联系方式：${target.contact}`);
    delete profile.contactEvidence[target.contact];
    if (value === undefined) profile.contacts.splice(index, 1);
    else {
      const nextValue = Array.isArray(value) ? value.join(", ") : value;
      profile.contacts[index] = nextValue;
      profile.contactEvidence[nextValue] = evidence;
    }
    return;
  }
  if (target.scope === "media") {
    const index = profile.media.findIndex((media) => media.url === target.url);
    if (index < 0) throw new Error(`无法定位待确认媒体：${target.url}`);
    if (value === undefined) profile.media.splice(index, 1);
    else profile.media[index] = {
      ...profile.media[index],
      url: Array.isArray(value) ? value[0] || profile.media[index].url : value,
      categoryConfidence: 1,
      categoryReason: "user-confirmed",
    };
    return;
  }
  const item = profile.items.find((candidate) => candidate.id === target.itemId);
  if (!item) throw new Error(`无法定位待确认项目：${target.itemId}`);
  if (target.field === "summary") {
    if (typeof value !== "string" || !value.trim()) throw new Error(`${conflict.label}不能为空。`);
    item.summary = value;
  } else if (value === undefined) delete item[target.field];
  else if (target.field === "techStack") item.techStack = Array.isArray(value) ? value : value.split(/[,，]/).map((part) => part.trim()).filter(Boolean);
  else item[target.field] = Array.isArray(value) ? value.join(", ") : value;
  if (value === undefined) {
    if (item.fieldEvidence && target.field !== "summary") delete item.fieldEvidence[target.field];
  } else {
    if (target.field !== "summary") item.fieldEvidence = { ...item.fieldEvidence, [target.field]: evidence };
  }
}

function validateEditedValue(conflict: ProfileConflict, value: string | string[]) {
  const urlField = conflict.target.scope === "media"
    || conflict.target.scope === "profile" && conflict.target.field === "personalWebsite"
    || conflict.target.scope === "item" && conflict.target.field === "projectUrl";
  if (!urlField) return;
  if (typeof value !== "string") throw new Error(`${conflict.label}必须是一个公开网页地址。`);
  try {
    validatePublicUrl(value);
  } catch {
    throw new Error(`${conflict.label}必须是安全、公开的 HTTP(S) 地址。`);
  }
}

export function resolveProfileMergeReview(
  report: ProfileMergeReport,
  resolutions: ProfileReviewResolution[],
): ProfileReviewResult {
  if (report.schemaVersion !== PROFILE_MERGE_REPORT_SCHEMA_VERSION) {
    throw new Error(`不支持的 Profile Merge Report 版本：${String(report.schemaVersion)}`);
  }
  const byId = new Map(resolutions.map((resolution) => [resolution.conflictId, resolution]));
  const duplicateCount = resolutions.length - byId.size;
  if (duplicateCount) throw new Error("同一冲突不能提交多个决议。");
  const profile = structuredClone(report.merged);
  const userClaims: UserConfirmedClaim[] = [];
  for (const conflict of report.conflicts.filter((entry) => entry.required)) {
    const resolution = byId.get(conflict.conflictId);
    if (!resolution) throw new Error(`冲突尚未确认：${conflict.label}`);
    if (resolution.action === "reject" && conflict.target.scope === "profile" && ["name", "headline"].includes(conflict.target.field)) {
      throw new Error(`${conflict.label}是必填字段，不能拒绝。`);
    }
    let value: string | string[] | undefined;
    let sourceEvidence: SourceEvidence[] = [];
    if (resolution.action === "primary") {
      if (!conflict.primary) throw new Error(`${conflict.label}没有主来源候选值。`);
      value = conflict.primary.value;
      sourceEvidence = conflict.primary.evidence;
    } else if (resolution.action === "supplement") {
      if (!conflict.supplement) throw new Error(`${conflict.label}没有补充来源候选值。`);
      value = conflict.supplement.value;
      sourceEvidence = conflict.supplement.evidence;
    } else if (resolution.action === "edit") {
      value = resolution.value;
      if (value === undefined || (typeof value === "string" && !value.trim()) || (Array.isArray(value) && !value.length)) {
        throw new Error(`${conflict.label}的编辑值不能为空。`);
      }
      validateEditedValue(conflict, value);
    }
    const evidence = value === undefined ? [] : userEvidence(conflict, value, sourceEvidence);
    applyResolvedClaim(profile, conflict, value, evidence);
    userClaims.push({
      target: conflict.target,
      value,
      action: resolution.action,
      evidence,
      confidence: 1,
      sourcePriority: 1_000,
      extractionMethod: "user",
    });
  }
  const errors = validateProfile(profile);
  if (errors.length) throw new Error(`确认后的 Profile 未通过验证：${errors.join("；")}`);
  return { profile, userClaims };
}

export class ProfileReviewRequiredError extends Error {
  readonly report: ProfileMergeReport;

  constructor(report: ProfileMergeReport) {
    super(`Profile merge requires review for ${report.conflicts.filter((conflict) => conflict.required).length} conflict(s).`);
    this.name = "ProfileReviewRequiredError";
    this.report = report;
  }
}

/** Compatibility helper for callers that only need the provisional merged Profile. */
export function mergeProfiles(primary: ParsedProfile, supplement: ParsedProfile, label: string): ParsedProfile {
  const report = mergeProfilesWithReport(primary, supplement, label);
  if (report.reviewRequired) throw new ProfileReviewRequiredError(report);
  return report.merged;
}
