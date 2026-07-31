import type {
  ProfileMedia,
  ParsedProfile,
  ProfileItem,
  ProfileItemField,
  SectionKind,
  ContentFamily,
  SourceEvidence,
} from "../types.ts";

export interface ParseSource {
  id?: string;
  type?: "text" | "url";
  label?: string;
  media?: ProfileMedia[];
}

type SectionKey = SectionKind | "skills" | "foods" | "hobbies" | "contact";
type ContentSection = { key: SectionKey; family?: ContentFamily };

const headings: Array<{ pattern: RegExp; key: ContentSection }> = [
  { pattern: /^(简介|关于我|个人简介|summary|about)$/i, key: { key: "summary" } },
  {
    pattern: /^(项目|项目经历|projects?|work)$/i,
    key: { key: "project" },
  },
  {
    pattern: /^(latest publications?|selected publications?|research)$/i,
    key: { key: "project", family: "publication" },
  },
  {
    pattern: /^(research publications?|papers?|publications?)$/i,
    key: { key: "project", family: "publication" },
  },
  {
    pattern: /^(开源|开源作品|开源项目|open[- ]?source|opensource|open-source)$/i,
    key: { key: "project", family: "open-source" },
  },
  { pattern: /^(经历|工作经历|experience|employment|internships?)$/i, key: { key: "experience" } },
  { pattern: /^(教育|教育经历|educations?)$/i, key: { key: "education" } },
  { pattern: /^(技能|skills?|toolbox)$/i, key: { key: "skills" } },
  { pattern: /^(喜欢的食物|食物|饮食偏好|favorite foods?|food preferences?)$/i, key: { key: "foods" } },
  { pattern: /^(兴趣爱好|个人爱好|兴趣|爱好|interests?|hobbies|personal interests?)$/i, key: { key: "hobbies" } },
  { pattern: /^(成就|荣誉|获奖|achievements?|awards?|honou?rs?( and awards?)?)$/i, key: { key: "achievement" } },
  { pattern: /^(news|updates?|动态|新闻动态|最新动态)$/i, key: { key: "achievement" } },
  { pattern: /^(演讲|讲座|talks?|invited talks?)$/i, key: { key: "achievement", family: "talk" } },
  { pattern: /^(展览|展会|展示|exhibitions?|showcase|gallery)$/i, key: { key: "achievement", family: "exhibition" } },
  {
    pattern: /^(媒体报道|媒体|媒体报道与采访|media coverage|media|press|interviews?)$/i,
    key: { key: "achievement", family: "media-coverage" },
  },
  { pattern: /^(联系|联系方式|contact)$/i, key: { key: "contact" } },
];

function stableId(value: string) {
  let hash = 2166136261;
  for (const char of value) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function cleanLine(line: string) {
  return line.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function headingText(line: string) {
  return line
    .replace(/^[^\p{L}\p{N}\u4e00-\u9fff]+/u, "")
    .replace(/[:：]+$/, "")
    .trim();
}

function findHeading(line: string): { pattern: RegExp; key: ContentSection } | undefined {
  const normalized = headingText(line);
  return headings.find(({ pattern }) => pattern.test(normalized));
}

function evidence(sourceId: string, lines: string[], start: number, end = start): SourceEvidence {
  return {
    sourceId,
    locator: start === end ? `line:${start + 1}` : `lines:${start + 1}-${end + 1}`,
    excerpt: lines.slice(start, end + 1).join(" ").slice(0, 280),
  };
}

function systemEvidence(sourceId: string, locator: string, excerpt: string): SourceEvidence {
  return {
    sourceId,
    locator: `system:${locator}`,
    excerpt,
    origin: "system-generated",
  };
}

function isLikelyProjectTitle(value = "") {
  const normalized = cleanLine(value);
  if (!normalized) return false;
  if (/^project\s*cover$/i.test(normalized)) return false;
  if (/\b(logo|icon|screenshot|avatar|cover|thumbnail|badge)\b/i.test(normalized)) return false;
  if (normalized.length < 3) return false;
  if (/^\d+$/.test(normalized)) return false;
  if (/^(image|photo|photo gallery|cover|thumbnail|screenshot)$/i.test(normalized)) return false;
  if (/[a-z]{1,3}\.(png|jpe?g|gif|webp|svg)$/i.test(normalized)) return false;
  return true;
}

function projectTitleFromMedia(media: ProfileMedia) {
  if (isLikelyProjectTitle(media.title)) return media.title;
  if (isLikelyProjectTitle(media.alt)) return media.alt;
  return undefined;
}

function syntheticProjectTitle(index: number) {
  return `Untitled sourced project ${String(index + 1).padStart(2, "0")}`;
}

function makeSyntheticProjectFromMedia(
  media: ProfileMedia,
  sourceId: string,
  rank: number,
  contentFamily?: ContentFamily,
): ProfileItem {
  const title = projectTitleFromMedia(media) || `Project ${rank + 1}`;
  const evidenceRows = [mediaEvidence(sourceId, media)];
  return {
    id: `project-${stableId(`${sourceId}:${media.url}:${rank}`)}`,
    kind: "project",
    contentFamily,
    title,
    summary: media.title || media.alt || title,
    bullets: [],
    tags: Array.from(
      new Set(
        `${title} ${media.title ?? ""} ${media.alt ?? ""}`
          .split(/[，,、/]|\s{2,}/)
          .map(cleanLine)
          .filter((value) => value.length > 1 && value.length < 28),
      ),
    ).slice(0, 6),
    imageUrl: media.url,
    sourceUrl: media.linkUrl,
    projectUrl: media.linkUrl,
    fieldEvidence: media.linkUrl ? { projectUrl: evidenceRows } : undefined,
    mediaProvenance: {
      originalUrl: media.originalUrl,
      sourcePage: media.sourcePage,
      locator: media.locator,
      category: media.category,
      categoryConfidence: media.categoryConfidence,
      categoryReason: media.categoryReason,
    },
    evidence: evidenceRows,
  };
}

function syntheticProjectsFromMedia(media: ProfileMedia[], sourceId: string) {
  return media
    .filter((item, index, arr) => {
      if (item.kind !== "project") return false;
      if (item.category !== "project-cover") return false;
      if (item.categoryConfidence < 0.65) return false;
      return arr.findIndex((entry) => entry.url === item.url && entry.kind === item.kind) === index;
    })
    .map((item, index) => {
      const synthetic = makeSyntheticProjectFromMedia(item, sourceId, index, undefined);
      if (!projectTitleFromMedia(item)) {
        synthetic.title = syntheticProjectTitle(index);
        synthetic.summary = synthetic.title;
      }
      return synthetic;
    });
}

function normalizeUrlValue(value: string) {
  try {
    const parsed = new URL(value);
    parsed.hash = "";
    for (const key of [...parsed.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|mc_eid|igsh|ref|source)/i.test(key)) {
        parsed.searchParams.delete(key);
      }
    }
    if (parsed.protocol === "mailto:") {
      return decodeURIComponent(parsed.pathname.toLowerCase());
    }
    return (
      `${parsed.protocol}//${parsed.host.toLowerCase()}${decodeURIComponent(parsed.pathname)}`
      + (parsed.search ? `?${parsed.searchParams.toString()}` : "")
    );
  } catch {
    return value.trim().toLowerCase();
  }
}

const CONTACT_PRIORITY: Array<{ key: string; patterns: RegExp; label: string; score: number }> = [
  { key: "email", patterns: /^email$/i, label: "Email", score: 100 },
  { key: "github", patterns: /^github$/i, label: "GitHub", score: 90 },
  { key: "linkedin", patterns: /^linkedin$/i, label: "LinkedIn", score: 80 },
  { key: "scholar", patterns: /^(google scholar|scholar)$/i, label: "Google Scholar", score: 78 },
  { key: "works", patterns: /^(作品|work|portfolio|projects?)$/i, label: "作品", score: 70 },
  { key: "social", patterns: /^(社媒|social|twitter|x|facebook|instagram|weibo|reddit|youtube|bilibili|知乎|wechat|微信|抖音)$/i, label: "社媒", score: 60 },
];

const CONTACT_PLATFORM_PATTERNS = [
  { key: "email", label: "Email", regex: /^mailto:/i },
  { key: "github", label: "GitHub", regex: /github\.com/i },
  { key: "linkedin", label: "LinkedIn", regex: /linkedin\.com/i },
  { key: "scholar", label: "Google Scholar", regex: /scholar\.google\.com\/citations/i },
  { key: "orcid", label: "ORCID", regex: /orcid\.org/i },
  { key: "works", label: "作品", regex: /(作品|portfolio|zhihu\.com|juejin\.cn|leetcode\.com|github\.io|behance\.net|dribbble\.com)/i },
  { key: "social", label: "社媒", regex: /(twitter\.com|x\.com|weibo\.com|wechat|微信|instagram\.com|facebook\.com|youtube\.com|bilibili\.com|zhihu\.com|reddit\.com|tiktok\.com)/i },
];

function labelForContactLine(line: string) {
  const normalized = cleanLine(line.toLowerCase());
  for (const item of CONTACT_PLATFORM_PATTERNS) {
    if (item.regex.test(normalized)) return { key: item.key, label: item.label };
  }
  return { key: "other", label: "Other" };
}

function contactPriority(key: string, normalized: string) {
  const platform = CONTACT_PRIORITY.find((item) => item.key === key);
  if (platform) return platform.score;
  const exact = CONTACT_PRIORITY.find((item) => item.patterns.test(normalized));
  return exact?.score ?? 30;
}

function parseContactLine(
  line: string,
  lineIndex: number,
): {
  platformKey: string;
  raw: string;
  normalized: string;
  priority: number;
  evidenceRange: [number, number];
  value: string;
} | null {
  const cleaned = line.replace(/^[-•·]\s*/, "").trim();
  if (!cleaned) return null;

  const separatorIndex = cleaned.search(/[:：]/);
  const rawLabel = cleanLine(separatorIndex >= 0 ? cleaned.slice(0, separatorIndex) : cleaned);
  const rawValue = separatorIndex >= 0 ? cleanLine(cleaned.slice(separatorIndex + 1)) : "";
  const matchEmail = rawLabel.match(/([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/i);
  if (matchEmail && !rawValue) {
    const email = matchEmail[0].toLowerCase();
    return {
      platformKey: "email",
      raw: `Email: ${email}`,
      normalized: normalizeUrlValue(`mailto:${email}`),
      priority: contactPriority("email", "email"),
      evidenceRange: [lineIndex, lineIndex],
      value: email,
    };
  }

  const labelPlatform = CONTACT_PRIORITY.find((item) => item.patterns.test(rawLabel));
  if (rawValue) {
    const hasUrl = /^https?:\/\//i.test(rawValue);
    const isEmailValue = /@/.test(rawValue);
    if (labelPlatform || hasUrl || isEmailValue) {
      const valuePlatform = labelPlatform
        ? { key: labelPlatform.key, label: labelPlatform.label }
        : hasUrl
          ? labelForContactLine(rawValue)
          : { key: "email", label: "Email" };
      const url = isEmailValue ? rawValue.toLowerCase() : normalizeUrlValue(rawValue);
      const platformKey = valuePlatform.key === "other" ? (isEmailValue ? "email" : "other") : valuePlatform.key;
      return {
        platformKey: platformKey,
        raw: `${valuePlatform.label}: ${url}`,
        normalized: `${platformKey}:${url}`,
        priority: contactPriority(platformKey, valuePlatform.label),
        evidenceRange: [lineIndex, lineIndex],
        value: url,
      };
    }
  }

  const matchedHref = cleaned.match(/(https?:\/\/\S+)/i);
  const detected = labelForContactLine(cleaned);
  if (!matchedHref) {
    return null;
  }

  const url = normalizeUrlValue(matchedHref[1]);
  const label = detected.label;
  const platformKey = detected.key;
  return {
    platformKey,
    raw: `${label}: ${url}`,
    normalized: `${platformKey}:${url}`,
    priority: contactPriority(platformKey, label),
    evidenceRange: [lineIndex, lineIndex],
    value: url,
  };
}

const KNOWN_LOCATIONS = [
  "美国", "中國", "中国", "北京", "上海", "天津", "杭州", "深圳", "广州", "成都", "重庆", "武汉", "南京", "西安", "香港", "新加坡", "湾区", "硅谷", "加州",
  "California", "New York", "NY", "Boston", "Cambridge", "Cambridge, MA", "London", "Paris", "Berlin", "Tokyo", "Singapore", "Toronto", "Ottawa", "Sydney",
  "US", "USA", "United States", "Shenzhen", "Hangzhou", "Beijing", "Shanghai",
];
const ORGANIZATION_LOCATION_SUFFIX = /\b(?:university|college|school|institute|labs?|group|dynamics|inc\.?|llc|ltd\.?|corp\.?|company|studio)\b|公司|有限|科技|大学|学院|研究院/i;

function cleanLocationCandidate(value: string) {
  return cleanLine(value)
    .replace(/\s+(?:and|working|building|specializing|focused)\b.*$/i, "")
    .replace(/[.,，。;；:：!?！？]+$/g, "")
    .trim();
}

function isKnownLocation(value: string) {
  const normalized = value.toLocaleLowerCase();
  return KNOWN_LOCATIONS.some((location) => {
    const known = location.toLocaleLowerCase();
    return normalized === known || normalized.startsWith(`${known}, `);
  });
}

function inferLocation(value: string, allowAt = true) {
  const normalized = cleanLine(value);
  if (!normalized) return undefined;

  const explicitLocationLine = normalized.match(/^(?:location|loc|所在地|位置|address|based\s+in|located\s+in|来自)\s*[:：]?\s*(.+)$/i);
  if (explicitLocationLine) {
    const candidate = cleanLocationCandidate(explicitLocationLine[1]);
    return candidate && !ORGANIZATION_LOCATION_SUFFIX.test(candidate) ? candidate : undefined;
  }

  const inMatch = normalized.match(/\b(?:based\s+in|located\s+in|from)\s+([^,，\n]{1,36})/i);
  if (inMatch) {
    const candidate = cleanLocationCandidate(inMatch[1]);
    return candidate && !ORGANIZATION_LOCATION_SUFFIX.test(candidate) ? candidate : undefined;
  }

  const chineseFromMatch = normalized.match(/来自\s*([^,，\n]{1,36})/);
  if (chineseFromMatch) {
    const candidate = cleanLocationCandidate(chineseFromMatch[1]);
    return candidate && !ORGANIZATION_LOCATION_SUFFIX.test(candidate) ? candidate : undefined;
  }

  const atMatch = allowAt
    ? normalized.match(/[@＠]\s*([^,，；;。!！:?？]{1,48})/)
    : null;
  if (atMatch) {
    const candidate = cleanLocationCandidate(atMatch[1]);
    return candidate && !ORGANIZATION_LOCATION_SUFFIX.test(candidate) && isKnownLocation(candidate) ? candidate : undefined;
  }

  const parenthesized = normalized.match(/[（(]([^（）()]+)[）)]/);
  if (parenthesized) {
    const candidate = cleanLocationCandidate(parenthesized[1]);
    return candidate && !ORGANIZATION_LOCATION_SUFFIX.test(candidate) && isKnownLocation(candidate) ? candidate : undefined;
  }

  return undefined;
}

function dedupeContacts(rows: Array<{ text: string; line: number }>) {
  type ContactEntry = {
    text: string;
    normalized: string;
    priority: number;
    evidenceRange: [number, number];
    line: number;
    rawValue: string;
  };

  const entries: ContactEntry[] = [];
  for (const row of rows) {
    const parsed = parseContactLine(row.text, row.line);
    if (!parsed) continue;
    entries.push({
      text: parsed.raw,
      normalized: parsed.normalized,
      priority: parsed.priority,
      evidenceRange: parsed.evidenceRange,
      line: row.line,
      rawValue: parsed.value,
    });
  }

  const selected = new Map<string, ContactEntry>();
  for (const entry of entries) {
    const existing = selected.get(entry.normalized);
    if (!existing || entry.priority > existing.priority || (entry.priority === existing.priority && entry.line < existing.line)) {
      selected.set(entry.normalized, entry);
    }
  }

  return [...selected.values()]
    .sort((a, b) => b.priority - a.priority || a.line - b.line)
    .map((entry) => entry.text);
}

function dedupeContactEvidence(
  rows: Array<{ text: string; line: number }>,
  sourceId: string,
  allLines: string[],
) {
  const unique = new Map<string, { text: string; ranges: Array<[number, number]>; priority: number }>();
  for (const row of rows) {
    const parsed = parseContactLine(row.text, row.line);
    if (!parsed) continue;
    const existing = unique.get(parsed.raw);
    if (!existing || parsed.priority > existing.priority) {
      unique.set(parsed.raw, {
        text: parsed.raw,
        ranges: [parsed.evidenceRange],
        priority: parsed.priority,
      });
    }
  }
  return [...unique.entries()].reduce((acc, [text, entry]) => {
    acc[text] = entry.ranges.map(([start, end]) => {
      const from = start + 1;
      const to = end + 1;
      return {
        sourceId,
        locator: from === to ? `lines:${from}` : `lines:${from}-${to}`,
        excerpt: allLines.slice(start, end + 1).join(" ").slice(0, 280),
      };
    });
    return acc;
  }, {} as Record<string, SourceEvidence[]>);
}

function mediaEvidence(sourceId: string, media: ProfileMedia): SourceEvidence {
  return {
    sourceId,
    locator: media.locator,
    excerpt: `${media.category} · ${media.url}`,
  };
}

function splitTitle(line: string) {
  const parts = line.split(/\s+[|｜—]\s+|\s*—\s*/).map(cleanLine).filter(Boolean);
  return { title: parts[0] || line, subtitle: parts.slice(1).join(" · ") };
}

function extractSourceUrl(text: string) {
  return text.match(/https?:\/\/[^\s]+/i)?.[0];
}

function fieldEvidence(sourceId: string, allLines: string[], line: number): SourceEvidence[] {
  return [evidence(sourceId, allLines, line)];
}

function stripBulletPrefix(text: string) {
  return text.replace(/^[-•·]\s*/, "").trim();
}

const metadataLabels: Array<{ field: ProfileItemField; pattern: RegExp }> = [
  { field: "timeRange", pattern: /^(time|date|dates|created|period|duration|timeline|year|时间|日期|时间范围|周期)$/i },
  { field: "role", pattern: /^(role|my role|responsibility|responsibilities|职责|角色|担任角色)$/i },
  { field: "techStack", pattern: /^(tech|stack|tech stack|technology|technologies|technologies used|tools|tooling|技术|技术栈|工具)$/i },
  { field: "projectUrl", pattern: /^(link|url|project url|project link|view online|demo|website|github|code|source code|repo|repository|链接|项目链接|演示|代码|仓库)$/i },
];

const monthToken = String.raw`(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?`;
const dateToken = String.raw`(?:\d{4}(?:[./-]\d{1,2})?(?:[./-]\d{1,2})?|(?:\d{1,2}\s+)?${monthToken}(?:\s*(?:['’]\s*)?\d{4})?)`;
const dateRangePattern = new RegExp(
  String.raw`^\s*${dateToken}(?:\s*(?:-|–|—|to|至|到)\s*(?:${dateToken}|present|current|now|至今|现在|(?:['’]\s*)?\d{4}))?\s*$`,
  "i",
);

function isDateRangeValue(value: string) {
  const cleaned = cleanLine(value);
  return /\b(?:19|20)\d{2}\b/.test(cleaned) && dateRangePattern.test(cleaned);
}

function parseMetadataRow(text: string):
  | { field: ProfileItemField; value: string; priority?: number }
  | null {
  const cleaned = stripBulletPrefix(text);
  const separator = cleaned.match(/\s*[:：]\s*|\s+[-–—]\s+/);
  if (!separator || separator.index === undefined) return null;
  const label = cleanLine(cleaned.slice(0, separator.index));
  const value = cleanLine(cleaned.slice(separator.index + separator[0].length));
  if (!label || !value) return null;
  const matched = metadataLabels.find((entry) => entry.pattern.test(label));
  if (!matched) return null;
  if (matched.field === "projectUrl") {
    const url = extractSourceUrl(value);
    const priority = /^view online$/i.test(label)
      ? 3
      : /^project (?:link|url)$/i.test(label)
        ? 2
        : /^(?:source code|code|github|repo|repository)$/i.test(label)
          ? 1
          : 2;
    return url ? { field: matched.field, value: url, priority } : null;
  }
  if (matched.field === "timeRange") {
    return isDateRangeValue(value) ? { field: matched.field, value } : null;
  }
  return { field: matched.field, value };
}

function techStackFromValue(value: string) {
  return value
    .split(/[,，、;；|/]/)
    .map(cleanLine)
    .filter((item) => item.length > 1)
    .slice(0, 12);
}

function applyStructuredField(
  item: ProfileItem,
  field: ProfileItemField,
  value: string,
  evidenceRows: SourceEvidence[],
) {
  const nextEvidence = { ...(item.fieldEvidence || {}) };
  if (field === "techStack") {
    const stack = techStackFromValue(value);
    if (!stack.length) return item;
    item.techStack = stack;
    nextEvidence.techStack = evidenceRows;
  } else if (field === "timeRange") {
    item.timeRange = value;
    nextEvidence.timeRange = evidenceRows;
  } else if (field === "role") {
    item.role = value;
    nextEvidence.role = evidenceRows;
  } else if (field === "projectUrl") {
    item.projectUrl = value;
    nextEvidence.projectUrl = evidenceRows;
  }
  item.fieldEvidence = nextEvidence;
  return item;
}

function applyProjectMetadata(
  item: ProfileItem,
  header: { text: string; line: number },
  body: Array<{ text: string; line: number }>,
  sourceId: string,
  allLines: string[],
) {
  if (item.kind !== "project") return item;
  if (item.subtitle && isDateRangeValue(item.subtitle)) {
    applyStructuredField(item, "timeRange", item.subtitle, fieldEvidence(sourceId, allLines, header.line));
  }
  let preferredProjectUrl: { value: string; priority: number; line: number } | undefined;
  for (const row of body) {
    const metadata = parseMetadataRow(row.text);
    if (!metadata) continue;
    if (metadata.field === "projectUrl") {
      const candidate = { value: metadata.value, priority: metadata.priority ?? 0, line: row.line };
      if (!preferredProjectUrl || candidate.priority > preferredProjectUrl.priority) preferredProjectUrl = candidate;
      continue;
    }
    applyStructuredField(item, metadata.field, metadata.value, fieldEvidence(sourceId, allLines, row.line));
  }
  if (preferredProjectUrl) {
    applyStructuredField(
      item,
      "projectUrl",
      preferredProjectUrl.value,
      fieldEvidence(sourceId, allLines, preferredProjectUrl.line),
    );
  }
  if (item.projectUrl) item.sourceUrl = item.projectUrl;
  return item;
}

function isDisplayBullet(row: { text: string }) {
  return !/^source:/i.test(row.text) && !parseMetadataRow(row.text);
}

function makeItem(
  kind: SectionKind,
  header: { text: string; line: number },
  body: Array<{ text: string; line: number }>,
  sourceId: string,
  index: number,
  allLines: string[],
  contentFamily?: ContentFamily,
): ProfileItem {
  const { title, subtitle } = splitTitle(header.text);
  const bullets = body
    .filter(isDisplayBullet)
    .map(({ text }) => stripBulletPrefix(text))
    .filter(Boolean);
  const summary = bullets.join(" ") || subtitle || title;
  const sourceUrl =
    extractSourceUrl(header.text) || body.map((row) => extractSourceUrl(row.text)).find(Boolean);
  const tags = Array.from(
    new Set(
      `${title} ${summary}`
        .split(/[，,、/]|\s{2,}/)
        .map(cleanLine)
        .filter((value) => value.length > 1 && value.length < 28),
    ),
  ).slice(0, 6);
  const endLine = body.at(-1)?.line ?? header.line;

  return applyProjectMetadata({
    id: `${kind}-${stableId(`${sourceId}:${header.line}:${title}:${index}`)}`,
    kind,
    contentFamily,
    title,
    subtitle: subtitle || undefined,
    summary,
    bullets,
    tags,
    sourceUrl,
    evidence: [evidence(sourceId, allLines, header.line, endLine)],
  }, header, body, sourceId, allLines);
}

function groupedItems(
  kind: SectionKind,
  rows: Array<{ text: string; line: number }>,
  sourceId: string,
  allLines: string[],
  contentFamily?: ContentFamily,
) {
  const groups: Array<{
    header: { text: string; line: number };
    body: Array<{ text: string; line: number }>;
  }> = [];
  for (const row of rows) {
    const isBullet = /^[-•·]\s*/.test(row.text);
    if (/^source:/i.test(row.text)) {
      if (groups.length) {
        groups.at(-1)!.body.push(row);
      }
      continue;
    }
    if (isBullet) {
      if (groups.length) {
        groups.at(-1)!.body.push(row);
      }
      continue;
    }
    if (!/^(source|headline):/i.test(row.text)) {
      groups.push({ header: row, body: [] });
      continue;
    }
  }
  return groups.map((group, index) =>
    makeItem(kind, group.header, group.body, sourceId, index, allLines, contentFamily),
  );
}

function dedupeProfileMedia(media: ProfileMedia[]) {
  const seen = new Map<string, ProfileMedia>();
  for (const item of media) {
    const key = `${item.sourcePage}::${item.url}`;
    if (!seen.has(key)) seen.set(key, item);
  }
  return [...seen.values()];
}

function normalizedProjectMatchText(value = "") {
  return cleanLine(value)
    .toLowerCase()
    .replace(/[‐‑‒–—−]/g, "-")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function projectMediaMatchesItem(media: ProfileMedia, item: ProfileItem) {
  const candidates = new Set([
    normalizedProjectMatchText(item.title),
    item.subtitle ? normalizedProjectMatchText(`${item.title} ${item.subtitle}`) : "",
  ].filter(Boolean));
  return [media.title, media.alt]
    .map((value) => normalizedProjectMatchText(value))
    .some((value) => value && candidates.has(value));
}

type ActiveSection = { kind: SectionKey; family?: ContentFamily };
type ParsedSection = {
  kind: SectionKey;
  family?: ContentFamily;
  rows: Array<{ text: string; line: number }>;
};

export function parseProfile(text: string, source: ParseSource = {}): ParsedProfile {
  const normalized = text.replace(/\r\n?/g, "\n");
  const allLines = normalized.split("\n").map(cleanLine);
  const rows = allLines
    .map((line, index) => ({ text: line, line: index }))
    .filter(({ text }) => Boolean(text));
  const sourceId = source.id || `source-${stableId(normalized)}`;
  const firstHeadingIndex = rows.findIndex(({ text }) => Boolean(findHeading(text)));
  const identityRows = rows.slice(0, firstHeadingIndex < 0 ? Math.min(2, rows.length) : firstHeadingIndex);
  const name = identityRows[0]?.text || "Untitled profile";
  const headline = identityRows[1]?.text || "Profile details unavailable";
  const locationRow = rows
    .slice(0, firstHeadingIndex < 0 ? Math.min(4, rows.length) : firstHeadingIndex)
    .map((row) => ({ ...row, location: inferLocation(row.text, row !== identityRows[0]) }))
    .find((row) => row.location);
  const location = locationRow?.location;
  const locationEvidence = locationRow
    ? [evidence(sourceId, allLines, locationRow.line)]
    : [];
  const sections: Array<ParsedSection> = [{ kind: "summary", rows: [] }];
  let active: ActiveSection = { kind: "summary" };

  const ensureActiveSection = (kind: SectionKey, family?: ContentFamily) => {
    const last = sections.at(-1);
    if (!last || last.kind !== kind || last.family !== family) {
      sections.push({ kind, family, rows: [] });
    }
    return sections.at(-1)!;
  };

  for (const row of rows.slice(firstHeadingIndex < 0 ? identityRows.length : firstHeadingIndex)) {
    if (locationRow && row.line === locationRow.line) continue;
    const heading = findHeading(row.text);
    if (heading) {
      active = { kind: heading.key.key, family: heading.key.family };
      ensureActiveSection(active.kind, active.family);
      continue;
    }
    const section = sections[sections.length - 1];
    if (section) {
      if (section.kind !== active.kind || section.family !== active.family) {
        ensureActiveSection(active.kind, active.family);
      } else {
        section.rows.push(row);
      }
    }
  }

  const summaryRows = sections.find((section) => section.kind === "summary")?.rows || [];
  const summary = summaryRows.map(({ text }) => text).join(" ") || "Profile summary unavailable";
  const identityEvidence: ParsedProfile["identityEvidence"] = {
    ...(identityRows[0] ? { name: [evidence(sourceId, allLines, identityRows[0].line)] } : {}),
    ...(identityRows[1] ? { headline: [evidence(sourceId, allLines, identityRows[1].line)] } : {}),
    ...(locationEvidence.length ? { location: locationEvidence } : {}),
    ...(summaryRows.length
      ? { summary: [evidence(sourceId, allLines, summaryRows[0].line, summaryRows.at(-1)!.line)] }
      : {}),
  };
  const summaryItem: ProfileItem = {
    id: `summary-${stableId(`${sourceId}:${summary}`)}`,
    kind: "summary",
    title: "About",
    summary,
    bullets: [],
    tags: [],
    evidence: summaryRows.length
      ? [evidence(sourceId, allLines, summaryRows[0].line, summaryRows.at(-1)!.line)]
      : [systemEvidence(sourceId, "summary-unavailable", summary)],
  };
  const sourceMedia = dedupeProfileMedia(source.media || []);
  const sectionProjects = sections
    .filter((section) => section.kind === "project")
    .flatMap((section) =>
      groupedItems(
        "project",
        section.rows,
        sourceId,
        allLines,
        section.family,
      ));
  const mediaProjectRows = sourceMedia.filter(
    (item) =>
      item.category === "project-cover" &&
      item.kind === "project" &&
      item.categoryConfidence >= 0.65,
  );
  const syntheticProjectItems =
    sectionProjects.length === 0 ? syntheticProjectsFromMedia(mediaProjectRows, sourceId) : [];
  const rowsForKind = (kind: SectionKey) =>
    sections.filter((section) => section.kind === kind).flatMap((section) => section.rows);
  const rawItems = [
    summaryItem,
    ...sectionProjects,
    ...syntheticProjectItems,
    ...groupedItems("experience", rowsForKind("experience"), sourceId, allLines),
    ...groupedItems("education", rowsForKind("education"), sourceId, allLines),
  ];
  const achievementSections = sections.filter((section) => section.kind === "achievement");
  const achievementItems = achievementSections.flatMap((section) =>
    groupedItems("achievement", section.rows, sourceId, allLines, section.family),
  );
  rawItems.push(...achievementItems);
  const contactRows = sections.find((section) => section.kind === "contact")?.rows || [];
  const contactCandidates = dedupeContacts(contactRows);
  const contacts = contactCandidates;
  const contactEvidence = dedupeContactEvidence(contactRows, sourceId, allLines);
  const projectCandidates = sourceMedia
    .map((item, index) => ({ media: item, index }))
    .filter((entry) => entry.media.kind === "project");

  const usedProjectIndexes = new Set<number>();
  const items = rawItems.map((item) => {
    if (item.kind !== "project") return item;
    if (item.imageUrl) return item;
    let mediaEntry:
      | { media: ProfileMedia; index: number }
      | undefined;

    const candidateByTitle = projectCandidates.find(
      (entry) => !usedProjectIndexes.has(entry.index) && projectMediaMatchesItem(entry.media, item),
    );
    if (candidateByTitle) mediaEntry = candidateByTitle;

    if (mediaEntry) usedProjectIndexes.add(mediaEntry.index);
    const media = mediaEntry?.media as ProfileMedia | undefined;
    if (!media) return item;
    const fieldEvidence = { ...(item.fieldEvidence || {}) };
    if (!item.projectUrl && media.linkUrl) {
      fieldEvidence.projectUrl = [mediaEvidence(sourceId, media)];
    }
    return {
      ...item,
      imageUrl: item.imageUrl || media.url,
      sourceUrl: item.sourceUrl || media.linkUrl,
      projectUrl: item.projectUrl || media.linkUrl,
      fieldEvidence: Object.keys(fieldEvidence).length ? fieldEvidence : undefined,
      mediaProvenance: {
        originalUrl: media.originalUrl,
        sourcePage: media.sourcePage,
        locator: media.locator,
        category: media.category,
        categoryConfidence: media.categoryConfidence,
        categoryReason: media.categoryReason,
      },
      evidence: [...item.evidence, mediaEvidence(sourceId, media)],
    };
  });
  const skillRows = sections.find((section) => section.kind === "skills")?.rows || [];
  const explicitSkillEvidence = skillRows.length
    ? [evidence(sourceId, allLines, skillRows[0].line, skillRows.at(-1)!.line)]
    : [];
  const explicitSkills = skillRows
    .flatMap(({ text }) => text.replace(/^[-•·]\s*/, "").split(/[,，、|]/))
    .map(cleanLine)
    .filter(Boolean);
  const projectSkillFallback = new Map<string, { value: string; evidence: SourceEvidence[] }>();
  for (const item of items) {
    if (item.kind !== "project") continue;
    for (const skill of item.techStack || []) {
      const value = cleanLine(skill);
      const key = value.toLowerCase();
      if (!value || projectSkillFallback.has(key)) continue;
      projectSkillFallback.set(key, {
        value,
        evidence: item.fieldEvidence?.techStack || item.evidence,
      });
    }
  }
  const skills = explicitSkills.length
    ? Array.from(new Map(explicitSkills.map((skill) => [skill.toLowerCase(), skill])).values())
    : [...projectSkillFallback.values()].map((entry) => entry.value);
  const skillEvidence = explicitSkills.length
    ? Object.fromEntries(skills.map((skill) => [skill, explicitSkillEvidence]))
    : Object.fromEntries(
      [...projectSkillFallback.values()].map((entry) => [entry.value, entry.evidence]),
    );
  const sectionValues = (kind: "foods" | "hobbies") => {
    const valueRows = sections.find((section) => section.kind === kind)?.rows || [];
    const values = valueRows
      .flatMap(({ text }) => text.replace(/^[-•·]\s*/, "").split(/[,，、|]/))
      .map(cleanLine)
      .filter(Boolean);
    const uniqueValues = Array.from(new Map(values.map((value) => [value.toLocaleLowerCase(), value])).values());
    const valueEvidence = valueRows.length
      ? Object.fromEntries(uniqueValues.map((value) => [
        value,
        [evidence(sourceId, allLines, valueRows[0].line, valueRows.at(-1)!.line)],
      ]))
      : {};
    return { values: uniqueValues, evidence: valueEvidence };
  };
  const foods = sectionValues("foods");
  const hobbies = sectionValues("hobbies");

  return {
    id: `profile-${stableId(`${name}:${headline}`)}`,
    name,
    headline,
    location,
    summary,
    contacts,
    identityEvidence,
    contactEvidence,
    media: sourceMedia,
    foods: foods.values,
    foodEvidence: foods.evidence,
    hobbies: hobbies.values,
    hobbyEvidence: hobbies.evidence,
    skills,
    skillEvidence,
    items,
    source: {
      id: sourceId,
      type: source.type || "text",
      label: source.label || "Pasted resume",
      lineCount: allLines.length,
    },
  };
}
