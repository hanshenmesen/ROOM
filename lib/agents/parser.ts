import type {
  ParsedProfile,
  ProfileItem,
  SectionKind,
  SourceEvidence,
} from "../types.ts";
import type { ExtractedMedia } from "../extract-webpage.ts";

export interface ParseSource {
  id?: string;
  type?: "text" | "url";
  label?: string;
  media?: ExtractedMedia[];
}

const headings: Array<{ pattern: RegExp; key: string }> = [
  { pattern: /^(简介|关于我|个人简介|summary|about)$/i, key: "summary" },
  { pattern: /^(项目|项目经历|projects?|work|latest publications?|selected publications?|research)$/i, key: "project" },
  { pattern: /^(经历|工作经历|experience|employment|internships?)$/i, key: "experience" },
  { pattern: /^(教育|教育经历|educations?)$/i, key: "education" },
  { pattern: /^(技能|skills?|toolbox)$/i, key: "skills" },
  { pattern: /^(成就|荣誉|获奖|achievements?|awards?|honou?rs?( and awards?)?)$/i, key: "achievement" },
  { pattern: /^(联系|联系方式|contact)$/i, key: "contact" },
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

function findHeading(line: string) {
  const normalized = headingText(line);
  return headings.find(({ pattern }) => pattern.test(normalized));
}

function evidence(
  sourceId: string,
  lines: string[],
  start: number,
  end = start,
): SourceEvidence {
  return {
    sourceId,
    locator: start === end ? `line:${start + 1}` : `lines:${start + 1}-${end + 1}`,
    excerpt: lines.slice(start, end + 1).join(" ").slice(0, 280),
  };
}

function splitTitle(line: string) {
  const parts = line.split(/\s+[|｜—–]\s+|\s*—\s*/).map(cleanLine).filter(Boolean);
  return { title: parts[0] || line, subtitle: parts.slice(1).join(" · ") };
}

function makeItem(
  kind: SectionKind,
  header: { text: string; line: number },
  body: Array<{ text: string; line: number }>,
  sourceId: string,
  index: number,
): ProfileItem {
  const { title, subtitle } = splitTitle(header.text);
  const bullets = body
    .map(({ text }) => text.replace(/^[-•·]\s*/, ""))
    .filter(Boolean);
  const summary = bullets.join(" ") || subtitle || title;
  const tags = Array.from(
    new Set(
      `${title} ${summary}`
        .split(/[，,、/]|\s{2,}/)
        .map(cleanLine)
        .filter((value) => value.length > 1 && value.length < 28),
    ),
  ).slice(0, 6);
  const endLine = body.at(-1)?.line ?? header.line;

  return {
    id: `${kind}-${stableId(`${sourceId}:${header.line}:${title}:${index}`)}`,
    kind,
    title,
    subtitle: subtitle || undefined,
    summary,
    bullets,
    tags,
    evidence: [evidence(sourceId, [header.text, ...body.map((row) => row.text)], 0, body.length)].map(
      (item) => ({
        ...item,
        locator:
          header.line === endLine
            ? `line:${header.line + 1}`
            : `lines:${header.line + 1}-${endLine + 1}`,
      }),
    ),
  };
}

function groupedItems(
  kind: SectionKind,
  rows: Array<{ text: string; line: number }>,
  sourceId: string,
) {
  if (kind === "achievement") {
    return rows
      .filter(({ text }) => !/^[-•·]\s*/.test(text))
      .map((row, index) => makeItem(kind, row, [], sourceId, index));
  }

  const groups: Array<{
    header: { text: string; line: number };
    body: Array<{ text: string; line: number }>;
  }> = [];
  for (const row of rows) {
    if (!/^[-•·]\s*/.test(row.text)) {
      groups.push({ header: row, body: [] });
    } else if (groups.length) {
      groups.at(-1)!.body.push(row);
    }
  }
  return groups.map((group, index) =>
    makeItem(kind, group.header, group.body, sourceId, index),
  );
}

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
  const headline = identityRows[1]?.text || "Creative professional";
  const sections = new Map<string, Array<{ text: string; line: number }>>();
  let active = "summary";

  for (const row of rows.slice(firstHeadingIndex < 0 ? identityRows.length : firstHeadingIndex)) {
    const heading = findHeading(row.text);
    if (heading) {
      active = heading.key;
      if (!sections.has(active)) sections.set(active, []);
      continue;
    }
    const sectionRows = sections.get(active) || [];
    sectionRows.push(row);
    sections.set(active, sectionRows);
  }

  const summaryRows = sections.get("summary") || [];
  const summary = summaryRows.map(({ text }) => text).join(" ") || headline;
  const summaryItem: ProfileItem = {
    id: `summary-${stableId(`${sourceId}:${summary}`)}`,
    kind: "summary",
    title: "About",
    summary,
    bullets: [],
    tags: [],
    evidence: summaryRows.length
      ? [evidence(sourceId, allLines, summaryRows[0].line, summaryRows.at(-1)!.line)]
      : [evidence(sourceId, allLines, identityRows[1]?.line || 0)],
  };
  const rawItems = [
    summaryItem,
    ...groupedItems("project", sections.get("project") || [], sourceId),
    ...groupedItems("experience", sections.get("experience") || [], sourceId),
    ...groupedItems("education", sections.get("education") || [], sourceId),
    ...groupedItems("achievement", sections.get("achievement") || [], sourceId),
  ];
  const projectMedia = (source.media || []).filter((item) => item.kind === "project");
  let projectIndex = 0;
  const items = rawItems.map((item) => {
    if (item.kind !== "project") return item;
    const media = projectMedia.find((entry) => entry.title === item.title) || projectMedia[projectIndex];
    projectIndex += 1;
    return media ? { ...item, imageUrl: media.url, sourceUrl: media.linkUrl } : item;
  });
  const skillRows = sections.get("skills") || [];
  const skillEvidence = skillRows.length
    ? [evidence(sourceId, allLines, skillRows[0].line, skillRows.at(-1)!.line)]
    : [];
  const skills = skillRows
    .flatMap(({ text }) => text.replace(/^[-•·]\s*/, "").split(/[,，、|]/))
    .map(cleanLine)
    .filter(Boolean);

  return {
    id: `profile-${stableId(`${name}:${headline}`)}`,
    name,
    headline,
    summary,
    contacts: (sections.get("contact") || []).map(({ text }) => text),
    skills,
    skillEvidence: Object.fromEntries(skills.map((skill) => [skill, skillEvidence])),
    items,
    source: {
      id: sourceId,
      type: source.type || "text",
      label: source.label || "Pasted resume",
      lineCount: allLines.length,
    },
  };
}
