import type { ParsedProfile } from "../../types.ts";
import { validatePublicUrl } from "../../public-web.ts";
import {
  WEBSITE_RESEARCH_MISSING_FIELDS,
  type WebsiteResearchBudget,
  type WebsiteResearchCandidate,
  type WebsiteResearchMissingField,
} from "./state.ts";

export const DEFAULT_WEBSITE_RESEARCH_BUDGET: WebsiteResearchBudget = {
  maxPages: 5,
  maxDepth: 2,
  maxSteps: 80,
  maxTotalBytes: 3_000_000,
  maxPageBytes: 1_000_000,
  maxDurationMs: 24_000,
  maxModelInputCharacters: 140_000,
};

const FIELD_KEYWORDS: Record<WebsiteResearchMissingField, string[]> = {
  summary: ["about", "bio", "profile", "简介", "关于"],
  location: ["about", "contact", "bio", "联系", "关于"],
  contacts: ["contact", "about", "links", "联系", "关于"],
  skills: ["skills", "stack", "about", "能力", "技能"],
  projects: ["project", "work", "portfolio", "case", "作品", "项目"],
  research: ["research", "publication", "paper", "talk", "研究", "论文", "发表"],
  experience: ["experience", "career", "resume", "cv", "经历", "工作"],
  education: ["education", "resume", "cv", "学校", "教育"],
  achievements: ["award", "honor", "news", "achievement", "获奖", "荣誉"],
  media: ["project", "work", "portfolio", "gallery", "作品", "项目"],
};

export function missingProfileFields(profile?: ParsedProfile): WebsiteResearchMissingField[] {
  if (!profile) return [...WEBSITE_RESEARCH_MISSING_FIELDS];
  const fields: WebsiteResearchMissingField[] = [];
  if (profile.summary.trim().length < 100) fields.push("summary");
  if (!profile.location) fields.push("location");
  if (!profile.contacts.length) fields.push("contacts");
  if (profile.skills.length < 4) fields.push("skills");
  if (!profile.items.some((item) => item.kind === "project")) fields.push("projects");
  if (!profile.items.some((item) => item.contentFamily === "publication")) fields.push("research");
  if (!profile.items.some((item) => item.kind === "experience")) fields.push("experience");
  if (!profile.items.some((item) => item.kind === "education")) fields.push("education");
  if (!profile.items.some((item) => item.kind === "achievement")) fields.push("achievements");
  if (!profile.media.some((item) => item.category === "profile-photo" || item.category === "project-cover")) {
    fields.push("media");
  }
  return fields;
}

export function normalizeWebsiteResearchUrl(value: string | URL) {
  const url = validatePublicUrl(value);
  url.hash = "";
  return url;
}

export function assertAllowedResearchUrl(value: string | URL, allowedHosts: Iterable<string>) {
  const url = normalizeWebsiteResearchUrl(value);
  const hosts = new Set([...allowedHosts].map((host) => host.toLowerCase()));
  if (!hosts.has(url.hostname.toLowerCase())) {
    throw new Error("Website Research Agent blocked a URL outside its approved hosts.");
  }
  return url;
}

export function scoreWebsiteCandidate(input: {
  url: string;
  label: string;
  depth: number;
  discoveredFrom: string;
  missingFields: WebsiteResearchMissingField[];
}): WebsiteResearchCandidate {
  const parsed = new URL(input.url);
  const haystack = `${parsed.pathname} ${parsed.search} ${input.label}`.toLocaleLowerCase();
  const reasons: string[] = [];
  let score = Math.max(0, 20 - input.depth * 4);
  for (const field of input.missingFields) {
    if (!FIELD_KEYWORDS[field].some((keyword) => haystack.includes(keyword))) continue;
    score += field === "projects" || field === "research" ? 18 : 10;
    reasons.push(field);
  }
  if (/\.(?:pdf|zip|png|jpe?g|gif|webp|svg|mp4|mp3)(?:$|[?#])/i.test(input.url)) score -= 100;
  if (/(?:logout|signout|login|admin|wp-admin|feed|rss|calendar|archive|private|account)/i.test(haystack)) score -= 100;
  return {
    url: input.url,
    depth: input.depth,
    discoveredFrom: input.discoveredFrom,
    score,
    reasons,
  };
}

export function selectNextCandidate(candidates: WebsiteResearchCandidate[]) {
  return [...candidates].sort((left, right) => (
    right.score - left.score || left.depth - right.depth || left.url.localeCompare(right.url)
  ))[0];
}
