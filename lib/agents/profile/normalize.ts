import { diagnosticDump, summarizeDiagnosticValue, type DiagnosticNode } from "../../agent-runtime/diagnostics.ts";
import type { ContentFamily, ParsedProfile, ProfileItem, ProfileMedia, SourceEvidence } from "../../types.ts";
import { validateProfile } from "../../validate.ts";
import { inventoryExpectations } from "./shard-planner.ts";
import type { AgentProfileDraft, ProfileAgentSource } from "./types.ts";
import { ProfileAgentError } from "./types.ts";
import { cleanLineNumbers, cleanString, cleanStringList, safeHttpUrl, sourceLines, stableId } from "./utils.ts";

const ITEM_KINDS = new Set(["summary", "project", "experience", "education", "achievement"]);
const CONTENT_FAMILIES = new Set<ContentFamily>([
  "publication",
  "talk",
  "exhibition",
  "open-source",
  "media-coverage",
]);

function evidenceForLines(sourceId: string, lines: string[], requested: unknown): SourceEvidence[] {
  const numbers = cleanLineNumbers(requested, lines.length);
  if (!numbers.length) return [];
  const ranges: Array<[number, number]> = [];
  for (const line of numbers) {
    const last = ranges.at(-1);
    if (last && last[1] + 1 === line) last[1] = line;
    else ranges.push([line, line]);
  }
  return ranges.map(([start, end]) => ({
    sourceId,
    locator: start === end ? `line:${start}` : `lines:${start}-${end}`,
    excerpt: lines.slice(start - 1, end).join("\n").trim().slice(0, 800),
    origin: "source",
  }));
}
function draftErrors(
  value: unknown,
  sourceCount: number,
  format: ProfileAgentSource["format"] = "text",
  sourceText = "",
) {
  const errors: string[] = [];
  if (!value || typeof value !== "object") return ["response must be a JSON object"];
  const draft = value as Partial<AgentProfileDraft>;
  if (format === "pdf" && (!Number.isInteger(draft.sourcePageCount) || Number(draft.sourcePageCount) < 1)) {
    errors.push("sourcePageCount must report the PDF page count");
  }
  if (!draft.identity || typeof draft.identity !== "object") errors.push("identity is required");
  if (draft.personalWebsite?.value) {
    if (!safeHttpUrl(draft.personalWebsite.value)) errors.push("personalWebsite.value must be an HTTP(S) URL");
    if (!cleanLineNumbers(draft.personalWebsite.evidenceLines, sourceCount).length) {
      errors.push("personalWebsite.evidenceLines must reference the source");
    }
    if (format !== "text" && !cleanString(draft.personalWebsite.evidenceExcerpt)) {
      errors.push("personalWebsite.evidenceExcerpt must quote the source");
    }
  }
  for (const field of ["name", "headline", "summary"] as const) {
    const entry = draft.identity?.[field];
    if (!cleanString(entry?.value)) errors.push(`identity.${field}.value is required`);
    if (!cleanLineNumbers(entry?.evidenceLines, sourceCount).length) {
      errors.push(`identity.${field}.evidenceLines must reference the source`);
    }
    if (format !== "text" && !cleanString(entry?.evidenceExcerpt)) {
      errors.push(`identity.${field}.evidenceExcerpt must quote the source`);
    }
  }
  if (!Array.isArray(draft.items) || !draft.items.length) errors.push("at least one item is required");
  const expectations = inventoryExpectations(sourceText);
  const items = (draft.items || []).filter((item) => item?.kind !== "summary");
  if (expectations.minimumItems && items.length < expectations.minimumItems) {
    errors.push(`items must preserve the visible resume inventory: expected at least ${expectations.minimumItems}, received ${items.length}`);
  }
  if (expectations.requireEducation && !items.some((item) => item?.kind === "education")) {
    errors.push("education section is present but no education item was returned");
  }
  if (expectations.requireExperience && !items.some((item) => item?.kind === "experience")) {
    errors.push("experience section is present but no experience item was returned");
  }
  if (expectations.requireResearch && !items.some((item) => ["project", "achievement"].includes(item?.kind || ""))) {
    errors.push("research/publication section is present but no project or achievement item was returned");
  }
  for (const [index, item] of (draft.items || []).entries()) {
    if (!ITEM_KINDS.has(item?.kind)) errors.push(`items[${index}].kind is invalid`);
    if (!cleanString(item?.title)) errors.push(`items[${index}].title is required`);
    if (!cleanString(item?.summary)) errors.push(`items[${index}].summary is required`);
    if (!cleanLineNumbers(item?.evidenceLines, sourceCount).length) {
      errors.push(`items[${index}].evidenceLines must reference the source`);
    }
    if (format !== "text" && !cleanString(item?.evidenceExcerpt)) {
      errors.push(`items[${index}].evidenceExcerpt must quote the source`);
    }
    // fieldEvidence falls back to the item-level evidenceLines. A subtle bug
    // bit in production: `fieldEvidence?.[field] || evidenceLines` treats an
    // EMPTY array as truthy, so a model returning `fieldEvidence.techStack:
    // []` alongside valid item-level evidenceLines was rejected. Check each
    // source for actual valid lines instead of relying on truthiness.
    for (const field of ["timeRange", "role", "projectUrl"] as const) {
      if (
        cleanString(item?.[field])
        && !cleanLineNumbers(item?.fieldEvidence?.[field], sourceCount).length
        && !cleanLineNumbers(item?.evidenceLines, sourceCount).length
      ) {
        errors.push(`items[${index}].fieldEvidence.${field} is required when ${field} is present`);
      }
    }
    if (
      cleanStringList(item?.techStack).length
      && !cleanLineNumbers(item?.fieldEvidence?.techStack, sourceCount).length
      && !cleanLineNumbers(item?.evidenceLines, sourceCount).length
    ) {
      errors.push(`items[${index}].fieldEvidence.techStack is required when techStack is present`);
    }
  }
  for (const [collection, entries] of [["contacts", draft.contacts], ["foods", draft.foods], ["hobbies", draft.hobbies], ["skills", draft.skills]] as const) {
    if (!Array.isArray(entries)) {
      errors.push(`${collection} must be an array`);
      continue;
    }
    entries.forEach((entry, index) => {
      if (!cleanString(entry?.value)) errors.push(`${collection}[${index}].value is required`);
      if (!cleanLineNumbers(entry?.evidenceLines, sourceCount).length) {
        errors.push(`${collection}[${index}].evidenceLines must reference the source`);
      }
      if (format !== "text" && !cleanString(entry?.evidenceExcerpt)) {
        errors.push(`${collection}[${index}].evidenceExcerpt must quote the source`);
      }
    });
  }
  return errors.slice(0, 30);
}

function mediaForDraftIndex(media: ProfileMedia[], value: unknown) {
  return Number.isInteger(value) && Number(value) >= 0 ? media[Number(value)] : undefined;
}

export function normalizeProfileDraft(value: unknown, text: string, source: ProfileAgentSource): ParsedProfile {
  const lines = sourceLines(text);
  const rawDraft = value as Partial<AgentProfileDraft>;
  const sourceCount = source.format === "pdf"
    ? source.pageCount || Number(rawDraft?.sourcePageCount) || 0
    : source.format === "image"
      ? 1
      : lines.length;
  const validationErrors = draftErrors(value, sourceCount, source.format, text);
  if (validationErrors.length) {
    // The structural summary rides on the error so run-profile-agent can
    // attach it to the validation.failed trace event; the server log keeps
    // the same PII-free summary for quick grepping.
    const items = Array.isArray(rawDraft?.items) ? rawDraft.items : [];
    const evidenceShapes = items.slice(0, 3).map((item: Record<string, unknown>) => ({
      title: item?.title,
      timeRange: item?.timeRange,
      role: item?.role,
      techStack: item?.techStack,
      evidenceLines: item?.evidenceLines,
      fieldEvidence: item?.fieldEvidence,
    }));
    diagnosticDump(
      `[profile-agent] draft failed evidence validation (sourceCount=${sourceCount}): ${validationErrors.slice(0, 3).join("; ")}`,
      evidenceShapes,
    );
    const diagnostic: DiagnosticNode = summarizeDiagnosticValue({ sourceCount, items: evidenceShapes });
    throw new ProfileAgentError("Agent 返回的数据未通过验证。", 502, validationErrors, diagnostic);
  }
  const draft = value as AgentProfileDraft;
  const sourceId = source.id || `source-${stableId(text)}`;
  const sourceMedia = (source.media || []).slice(0, 80);
  const evidenceFor = (requested: unknown, excerpt?: unknown) => {
    if (!source.format || source.format === "text") return evidenceForLines(sourceId, lines, requested);
    const numbers = cleanLineNumbers(requested, sourceCount);
    if (!numbers.length) return [];
    const prefix = source.format === "pdf" ? "page" : "image";
    return [{
      sourceId,
      locator: numbers.length === 1
        ? `${prefix}:${numbers[0]}`
        : `${prefix === "page" ? "pages" : prefix}:${numbers[0]}-${numbers.at(-1)}`,
      excerpt: cleanString(excerpt).slice(0, 800),
      origin: "source" as const,
    }];
  };
  const identityEvidence = {
    name: evidenceFor(draft.identity.name.evidenceLines, draft.identity.name.evidenceExcerpt),
    headline: evidenceFor(draft.identity.headline.evidenceLines, draft.identity.headline.evidenceExcerpt),
    ...(draft.identity.location?.value
      ? { location: evidenceFor(draft.identity.location.evidenceLines, draft.identity.location.evidenceExcerpt) }
      : {}),
    summary: evidenceFor(draft.identity.summary.evidenceLines, draft.identity.summary.evidenceExcerpt),
  };
  const name = cleanString(draft.identity.name.value);
  const headline = cleanString(draft.identity.headline.value);
  const summary = cleanString(draft.identity.summary.value);
  const personalWebsite = safeHttpUrl(draft.personalWebsite?.value);
  const items = draft.items.slice(0, 80).map((item, index): ProfileItem => {
    const media = mediaForDraftIndex(sourceMedia, item.mediaIndex);
    // Prefer fieldEvidence only when it actually yields valid lines; an empty
    // array is truthy, so a plain `||` would shadow the item-level
    // evidenceLines fallback (see draftErrors above).
    const evidenceLinesFor = (fieldLines: unknown) =>
      cleanLineNumbers(fieldLines, sourceCount).length ? fieldLines : item.evidenceLines;
    const fieldEvidence = {
      ...(item.timeRange ? { timeRange: evidenceFor(evidenceLinesFor(item.fieldEvidence?.timeRange), item.evidenceExcerpt) } : {}),
      ...(item.role ? { role: evidenceFor(evidenceLinesFor(item.fieldEvidence?.role), item.evidenceExcerpt) } : {}),
      ...(item.techStack?.length ? { techStack: evidenceFor(evidenceLinesFor(item.fieldEvidence?.techStack), item.evidenceExcerpt) } : {}),
      ...(item.projectUrl ? { projectUrl: evidenceFor(evidenceLinesFor(item.fieldEvidence?.projectUrl), item.evidenceExcerpt) } : {}),
    };
    const contentFamily = item.contentFamily && CONTENT_FAMILIES.has(item.contentFamily)
      ? item.contentFamily
      : undefined;
    return {
      id: `${item.kind}-${stableId(`${sourceId}:${index}:${item.title}`)}`,
      kind: item.kind,
      ...(contentFamily ? { contentFamily } : {}),
      title: cleanString(item.title),
      ...(cleanString(item.subtitle) ? { subtitle: cleanString(item.subtitle) } : {}),
      summary: cleanString(item.summary),
      bullets: cleanStringList(item.bullets, 12),
      tags: cleanStringList(item.tags, 16),
      ...(media ? { imageUrl: media.url } : {}),
      ...(safeHttpUrl(item.sourceUrl) || media?.linkUrl ? { sourceUrl: safeHttpUrl(item.sourceUrl) || media?.linkUrl } : {}),
      ...(cleanString(item.timeRange) ? { timeRange: cleanString(item.timeRange) } : {}),
      ...(cleanString(item.role) ? { role: cleanString(item.role) } : {}),
      ...(cleanStringList(item.techStack).length ? { techStack: cleanStringList(item.techStack) } : {}),
      ...(safeHttpUrl(item.projectUrl) ? { projectUrl: safeHttpUrl(item.projectUrl) } : {}),
      ...(Object.keys(fieldEvidence).length ? { fieldEvidence } : {}),
      ...(media ? {
        mediaProvenance: {
          originalUrl: media.originalUrl,
          sourcePage: media.sourcePage,
          locator: media.locator,
          category: media.category,
          categoryConfidence: media.categoryConfidence,
          categoryReason: media.categoryReason,
        },
      } : {}),
      evidence: evidenceFor(item.evidenceLines, item.evidenceExcerpt),
    };
  });
  const contacts = draft.contacts.map((entry) => cleanString(entry.value)).filter(Boolean).slice(0, 30);
  const contactEvidence = Object.fromEntries(draft.contacts
    .map((entry) => [cleanString(entry.value), evidenceFor(entry.evidenceLines, entry.evidenceExcerpt)] as const)
    .filter(([contact]) => Boolean(contact)));
  if (personalWebsite && !contacts.some((contact) => contact.includes(new URL(personalWebsite).hostname))) {
    const websiteContact = `个人网站: ${personalWebsite}`;
    contacts.push(websiteContact);
    contactEvidence[websiteContact] = evidenceFor(
      draft.personalWebsite?.evidenceLines,
      draft.personalWebsite?.evidenceExcerpt,
    );
  }
  const skills = [...new Map(draft.skills
    .map((entry) => cleanString(entry.value))
    .filter(Boolean)
    .map((skill) => [skill.toLocaleLowerCase(), skill])).values()].slice(0, 80);
  const skillDrafts = new Map(draft.skills.map((entry) => [cleanString(entry.value).toLocaleLowerCase(), entry]));
  const skillEvidence = Object.fromEntries(skills.map((skill) => [
    skill,
    evidenceFor(skillDrafts.get(skill.toLocaleLowerCase())?.evidenceLines, skillDrafts.get(skill.toLocaleLowerCase())?.evidenceExcerpt),
  ]));
  const foods = [...new Map(draft.foods
    .map((entry) => cleanString(entry.value))
    .filter(Boolean)
    .map((food) => [food.toLocaleLowerCase(), food])).values()].slice(0, 40);
  const foodDrafts = new Map(draft.foods.map((entry) => [cleanString(entry.value).toLocaleLowerCase(), entry]));
  const foodEvidence = Object.fromEntries(foods.map((food) => [
    food,
    evidenceFor(foodDrafts.get(food.toLocaleLowerCase())?.evidenceLines, foodDrafts.get(food.toLocaleLowerCase())?.evidenceExcerpt),
  ]));
  const hobbies = [...new Map(draft.hobbies
    .map((entry) => cleanString(entry.value))
    .filter(Boolean)
    .map((hobby) => [hobby.toLocaleLowerCase(), hobby])).values()].slice(0, 40);
  const hobbyDrafts = new Map(draft.hobbies.map((entry) => [cleanString(entry.value).toLocaleLowerCase(), entry]));
  const hobbyEvidence = Object.fromEntries(hobbies.map((hobby) => [
    hobby,
    evidenceFor(hobbyDrafts.get(hobby.toLocaleLowerCase())?.evidenceLines, hobbyDrafts.get(hobby.toLocaleLowerCase())?.evidenceExcerpt),
  ]));
  const profile: ParsedProfile = {
    id: `profile-${stableId(`${sourceId}:${name}:${headline}`)}`,
    name,
    headline,
    ...(draft.identity.location?.value ? { location: cleanString(draft.identity.location.value) } : {}),
    summary,
    ...(personalWebsite ? {
      personalWebsite,
      personalWebsiteEvidence: evidenceFor(draft.personalWebsite?.evidenceLines, draft.personalWebsite?.evidenceExcerpt),
    } : {}),
    contacts,
    identityEvidence,
    contactEvidence,
    media: sourceMedia,
    foods,
    foodEvidence,
    hobbies,
    hobbyEvidence,
    skills,
    skillEvidence,
    items,
    source: {
      id: sourceId,
      type: source.type || "text",
      label: source.label || "Uploaded source",
      lineCount: sourceCount,
      format: source.format || "text",
      locatorUnit: source.format === "pdf" ? "page" : source.format === "image" ? "image" : "line",
    },
  };
  const profileErrors = validateProfile(profile);
  if (profileErrors.length) throw new ProfileAgentError("Agent 结果不符合 ROOM Profile 合约。", 502, profileErrors);
  return profile;
}
