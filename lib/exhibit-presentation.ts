import type { ContentFamily, SourceEvidence } from "./types.ts";

export type MaterialFrameSource = {
  title: string;
  body?: string;
  summary?: string;
  contentFamily?: ContentFamily;
  subtitle?: string;
  timeRange?: string;
  role?: string;
  evidence?: readonly SourceEvidence[];
};

export type MaterialFrameCopy = {
  category: string;
  marker: string;
  title: string;
  meta: string;
  takeaway: string;
};

const CONTENT_FAMILY_LABELS: Record<ContentFamily, string> = {
  publication: "论文",
  talk: "演讲",
  exhibition: "展览",
  "open-source": "开源",
  "media-coverage": "报道",
};

const PUBLICATION_VENUE_PATTERN = /\b(?:AAAI|ACL|EMNLP|CIKM|KSS|NeurIPS|ICLR|ICML|KDD|IJCAI|COLING|NAACL|EACL|SIGIR|WSDM|CVPR|ICCV|ECCV|CHI|UIST)\s*[-–—]?\s*(?:19|20)\d{2}(?:\s+(?:Oral|Spotlight|Poster|在投))?(?:\s*\([^)]{1,24}\))?/i;
const LEADING_PUBLICATION_META = /^(?:(?:独立|共同)?(?:一作|第一作者|作者)|(?:发表于|刊于|收录于)|(?:published|accepted)\s+(?:at|by|in)|(?:19|20)\d{2}\s*年?发表于|\b(?:AAAI|ACL|EMNLP|CIKM|KSS|NeurIPS|ICLR|ICML|KDD|IJCAI|COLING|NAACL|EACL|SIGIR|WSDM|CVPR|ICCV|ECCV|CHI|UIST)\b)/i;

function normalizeText(value: string | undefined) {
  return (value || "").replace(/\s+/g, " ").trim();
}

function visualUnits(value: string) {
  return Array.from(value).reduce((total, character) => total + (/^[\x00-\x7F]$/.test(character) ? 0.55 : 1), 0);
}

export function truncateMaterialText(value: string, maxUnits: number) {
  const normalized = normalizeText(value);
  if (visualUnits(normalized) <= maxUnits) return normalized;
  let result = "";
  let units = 0;
  for (const character of normalized) {
    const nextUnits = /^[\x00-\x7F]$/.test(character) ? 0.55 : 1;
    if (units + nextUnits > maxUnits) break;
    result += character;
    units += nextUnits;
  }
  return `${result.replace(/[\s,，:：;；.。!！?？\-–—]+$/u, "").trimEnd()}…`;
}

function conciseTitle(source: MaterialFrameSource) {
  const title = normalizeText(source.title) || "未命名素材";
  if (source.contentFamily === "publication" && visualUnits(title) > 36) {
    const lead = title.split(/[:：]/, 1)[0]?.trim();
    if (lead && visualUnits(lead) >= 5 && visualUnits(lead) <= 32) return lead;
  }
  return truncateMaterialText(title, 36);
}

function publicationMeta(source: MaterialFrameSource) {
  const evidenceText = (source.evidence || []).map((item) => item.excerpt).join(" ");
  const searchable = [source.subtitle, source.timeRange, source.body, source.summary, evidenceText]
    .map(normalizeText)
    .filter(Boolean)
    .join(" · ");
  const venue = searchable.match(PUBLICATION_VENUE_PATTERN)?.[0];
  if (venue) return truncateMaterialText(venue.replace(/\s+/g, " "), 24);
  return truncateMaterialText(source.timeRange || source.subtitle || "研究成果", 24);
}

function materialMeta(source: MaterialFrameSource) {
  if (source.contentFamily === "publication") return publicationMeta(source);
  return truncateMaterialText(source.timeRange || source.role || source.subtitle || "完整内容可展开", 24);
}

function conciseTakeaway(source: MaterialFrameSource) {
  const summary = normalizeText(source.body || source.summary);
  if (!summary) return "点击查看完整内容与来源";

  const majorClause = summary.split(/[；;。！？!?]/, 1)[0]?.trim() || summary;
  const commaClauses = majorClause.split(/[，,]\s*/).map((item) => item.trim()).filter(Boolean);
  let startIndex = 0;
  while (startIndex < commaClauses.length - 1 && LEADING_PUBLICATION_META.test(commaClauses[startIndex] || "")) {
    startIndex += 1;
  }
  const withoutMetaPrefix = startIndex > 0 ? commaClauses.slice(startIndex).join("，") : majorClause;
  return truncateMaterialText(withoutMetaPrefix, 42);
}

export function materialFrameCopy(source: MaterialFrameSource, displayIndex: number): MaterialFrameCopy {
  const category = source.contentFamily ? CONTENT_FAMILY_LABELS[source.contentFamily] : "项目";
  return {
    category,
    marker: `${category} ${String(displayIndex).padStart(2, "0")}`,
    title: conciseTitle(source),
    meta: materialMeta(source),
    takeaway: conciseTakeaway(source),
  };
}
