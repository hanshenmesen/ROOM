import type { ProfileMedia as ExtractedProfileMedia } from "./types.ts";

export type MediaCategory = ExtractedProfileMedia["category"];
export type ExtractedMedia = ExtractedProfileMedia;

export interface ExtractedWebPage {
  title: string;
  text: string;
  media: ExtractedMedia[];
}

interface ImageTagMeta {
  raw: string;
  src?: string;
  alt?: string;
  title?: string;
  className?: string;
  id?: string;
  width?: number;
  height?: number;
  linkUrl?: string;
  hasWrappedAnchor?: boolean;
  hasPlaceholderWrappedAnchor?: boolean;
  index: number;
  context: string;
}

function enclosingAnchorHref(html: string, imageIndex: number) {
  let searchIndex = imageIndex;
  while (true) {
    const openIndex = html.lastIndexOf("<a", searchIndex);
    if (openIndex < 0) return undefined;
    const openEnd = html.indexOf(">", openIndex);
    if (openEnd < 0 || openEnd >= imageIndex) return undefined;
    const closeIndex = html.indexOf("</a>", openEnd);
    if (closeIndex < 0) return undefined;
    if (closeIndex >= imageIndex) {
      const anchorTag = html.slice(openIndex, openEnd + 1);
      const href = attribute(anchorTag, "href");
      if (href) return href;
    }
    searchIndex = openIndex - 1;
  }
}

function decodeHtml(value: string) {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    hellip: "…",
    ldquo: "“",
    lt: "<",
    middot: "·",
    nbsp: " ",
    ndash: "–",
    quot: '"',
    rdquo: "”",
  };
  return value.replace(/&(#x?[\da-f]+|[a-z]+);/gi, (entity, token: string) => {
    if (token.startsWith("#x")) return String.fromCodePoint(Number.parseInt(token.slice(2), 16));
    if (token.startsWith("#")) return String.fromCodePoint(Number.parseInt(token.slice(1), 10));
    return named[token.toLowerCase()] ?? entity;
  });
}

function cleanText(value: string) {
  return decodeHtml(
    value
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

function maskHtmlComments(value: string) {
  return value.replace(/<!--[\s\S]*?-->/g, (comment) => " ".repeat(comment.length));
}

function attribute(tag: string, name: string) {
  const match = tag.match(new RegExp(`${name}\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)'|([^\\s>]+))`, "i"));
  return decodeHtml(match?.[1] ?? match?.[2] ?? match?.[3] ?? "").trim();
}

function isPlaceholderImageLink(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return true;
  if (normalized === "#" || /^#/.test(normalized) || /^\/?#/.test(normalized)) return true;
  if (/^(javascript|mailto|tel|fax|smsto):/i.test(normalized)) return true;
  return false;
}

function sanitizeImageLink(raw: string, baseUrl: string) {
  if (isPlaceholderImageLink(raw)) return undefined;
  const absolute = absoluteUrl(raw, baseUrl);
  if (!absolute) return undefined;
  const parsed = new URL(absolute);
  if (!/^https?:$/i.test(parsed.protocol)) return undefined;
  return absolute;
}

function absoluteUrl(value: string, baseUrl: string) {
  if (!value || /^(data|javascript):/i.test(value)) return undefined;
  try {
    return new URL(value, baseUrl).href;
  } catch {
    return undefined;
  }
}

function socialContactLabel(value: string) {
  try {
    const host = new URL(value).hostname.replace(/^www\./i, "").toLowerCase();
    if (host === "linkedin.com" || host.endsWith(".linkedin.com")) return "LinkedIn";
    if (host === "instagram.com" || host.endsWith(".instagram.com")) return "Instagram";
    if (host === "facebook.com" || host.endsWith(".facebook.com")) return "Facebook";
    if (host === "twitter.com" || host.endsWith(".twitter.com") || host === "x.com" || host.endsWith(".x.com")) {
      return "Twitter";
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function firstClassText(html: string, className: string) {
  const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return cleanText(
    html.match(new RegExp(`<([a-z\\d]+)[^>]*class=[\"'][^\"']*\\b${escaped}\\b[^\"']*[\"'][^>]*>([\\s\\S]*?)<\\/\\1>`, "i"))?.[2] ?? "",
  );
}

function sectionAfterHeading(html: string, labels: RegExp) {
  const headings = [...html.matchAll(/<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/gi)];
  const headingIndex = headings.findIndex((match) => labels.test(
    cleanText(match[1]).replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""),
  ));
  if (headingIndex < 0) return "";
  const start = (headings[headingIndex].index ?? 0) + headings[headingIndex][0].length;
  const end = headings[headingIndex + 1]?.index ?? html.length;
  return html.slice(start, end);
}

function rowTextWithSources(htmlBlock: string, baseUrl: string) {
  const rows: string[] = [];
  const text = cleanText(htmlBlock);
  if (text) rows.push(text);

  const links = [...htmlBlock.matchAll(/<a\b[^>]*href=[\"']([^\"']+)[\"'][^>]*>/gi)];
  for (const link of links) {
    const url = absoluteUrl(link[1], baseUrl);
    if (url) rows.push(`Source: ${url}`);
  }
  return rows;
}

function blockRows(block: string, baseUrl: string) {
  return [...block.matchAll(/<(?:li|p)\b[^>]*>([\s\S]*?)<\/(?:li|p)>/gi)]
    .flatMap((match) => rowTextWithSources(match[1] ?? "", baseUrl))
    .filter(Boolean);
}

function readableFallback(html: string) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, " ")
    .replace(/<\/(h[1-6]|p|li|section|article|div)>|<br\s*\/?\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .split("\n")
    .map(cleanText)
    .filter(Boolean)
    .join("\n");
}

function withLocator(_text: string, index: number) {
  return `char:${index + 1}`;
}

function inferImageTitle(
  attrs: Pick<ImageTagMeta, "alt" | "title">,
  snippet: string,
  imageTag = "",
) {
  const nearest = inferNearestNearbyTitle(snippet, imageTag);
  if (nearest) return nearest;

  const altTitle = cleanText(attrs.title || attrs.alt || "");
  if (altTitle && isLikelyProjectTitleText(altTitle)) return altTitle;

  const anchorText = snippet.match(/<a\b[^>]*>([\s\S]*?)<\/a>/i)?.[1];
  const anchorTitle = cleanText(anchorText || "");
  if (anchorTitle && isLikelyProjectTitleText(anchorTitle)) return anchorTitle;

  const headingTextMatch = snippet.match(/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/i)?.[1];
  const headingTitle = cleanText(headingTextMatch || "");
  if (headingTitle && isLikelyProjectTitleText(headingTitle)) return headingTitle;

  const parentHeading = snippet.match(/<strong\b[^>]*>([\s\S]*?)<\/strong>/i)?.[1];
  const strongTitle = cleanText(parentHeading || "");
  if (strongTitle && isLikelyProjectTitleText(strongTitle)) return strongTitle;

  return undefined;
}

function inferNearestNearbyTitle(snippet: string, imageTag: string) {
  const imageIndex = imageTag ? snippet.indexOf(imageTag) : -1;
  if (imageIndex < 0) return undefined;

  const candidatePatterns = [
    /<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/gi,
    /<a\b[^>]*>([\s\S]*?)<\/a>/gi,
    /<figcaption\b[^>]*>([\s\S]*?)<\/figcaption>/gi,
    /<strong\b[^>]*>([\s\S]*?)<\/strong>/gi,
  ];

  const candidates: Array<{ text: string; distance: number }> = [];

  for (const pattern of candidatePatterns) {
    const localPattern = new RegExp(pattern.source, pattern.flags);
    for (const match of snippet.matchAll(localPattern)) {
      const rawText = match[1] ?? "";
      const text = cleanText(rawText);
      if (!isLikelyProjectTitleText(text)) continue;
      const start = match.index ?? 0;
      const distance = Math.abs(start - imageIndex);
      candidates.push({ text, distance });
    }
  }

  if (!candidates.length) return undefined;
  candidates.sort((a, b) => a.distance - b.distance);
  return candidates[0]?.text;
}

function isLikelyProjectTitleText(value: string) {
  const normalized = cleanText(value);
  if (normalized.length < 3) return false;
  if (/^(?:image|photo|avatar|logo|icon|screenshot|cover|thumbnail)(?:\s*\d+)?$/i.test(normalized)) return false;
  return true;
}

const genericProjectCardClasses = new Set([
  "portfolio-item",
  "portfolio-card",
  "portfolio-tile",
  "project-item",
  "project-card",
  "project-tile",
  "project-box",
  "work-item",
  "work-card",
  "work-tile",
  "cbp-item",
]);

const projectTitleClasses = [
  "portfolio-title",
  "project-title",
  "work-title",
  "card-title",
  "cbp-l-grid-projects-title",
];

const cubePortfolioLinkClasses = new Set([
  "cbp-l-grid-projects-title",
  "cbp-lightbox",
  "cbp-singlepage",
  "cbp-l-caption-buttonleft",
  "cbp-l-caption-buttonright",
]);

type ExtractedProjectBlock = ReturnType<typeof projectBlockShape>;

function exactClassTokens(tag: string) {
  return attribute(tag, "class").split(/\s+/).filter(Boolean);
}

function hasExactClassToken(tag: string, tokens: ReadonlySet<string>) {
  return exactClassTokens(tag).some((token) => tokens.has(token.toLowerCase()));
}

function matchingElementEnd(html: string, begin: number, openingTag: string) {
  const tagName = openingTag.match(/^<([a-z][\w:-]*)\b/i)?.[1];
  if (!tagName || /\/\s*>$/.test(openingTag)) return begin + openingTag.length;
  const elementPattern = new RegExp(`<\\/?${tagName}\\b[^>]*>`, "gi");
  elementPattern.lastIndex = begin;
  let depth = 0;
  let match: RegExpExecArray | null;
  while ((match = elementPattern.exec(html))) {
    const tag = match[0];
    if (/^<\//.test(tag)) {
      depth -= 1;
      if (depth === 0) return elementPattern.lastIndex;
    } else if (!/\/\s*>$/.test(tag)) {
      depth += 1;
    }
  }
  return html.length;
}

function firstExactClassText(html: string, classNames: string[]) {
  const wanted = new Set(classNames.map((value) => value.toLowerCase()));
  for (const match of html.matchAll(/<([a-z][\w:-]*)\b[^>]*class=(?:"[^"]*"|'[^']*')[^>]*>/gi)) {
    if (!hasExactClassToken(match[0], wanted)) continue;
    const begin = match.index ?? 0;
    const text = cleanText(html.slice(begin, matchingElementEnd(html, begin, match[0])));
    if (text) return text;
  }
  return "";
}

function normalizeCardMetadataLabel(label: string) {
  const normalized = cleanText(label).replace(/\s+/g, " ").trim();
  if (/^(created|date)$/i.test(normalized)) return "Created";
  if (/^(role|my role)$/i.test(normalized)) return "Role";
  if (/^(tech(?:nology|nologies)?(?: used)?|tech stack|stack|tools|tooling)$/i.test(normalized)) {
    return /technologies used/i.test(normalized) ? "Technologies used" : "Tech stack";
  }
  if (/^(view online|live(?: demo)?|demo)$/i.test(normalized)) return "View Online";
  if (/^(project link|project url|view project|learn more|read more|website)$/i.test(normalized)) return "Project Link";
  if (/^(source code|code|github|repo|repository)$/i.test(normalized)) return "Source Code";
  return undefined;
}

function splitCardMetadataRow(text: string) {
  const cleaned = cleanText(text).replace(/^[-•·]\s*/, "");
  const match = cleaned.match(/^(.{1,40}?)(?:\s*[:：]\s*|\s+[-–—]\s+)(.+)$/);
  if (!match) return undefined;
  const label = normalizeCardMetadataLabel(match[1] ?? "");
  const value = cleanText(match[2] ?? "");
  return label && value ? { label, value } : undefined;
}

function isProjectLinkLabel(label: string) {
  return /^(View Online|Project Link|Source Code)$/i.test(label);
}

function projectLinkPriority(label: string) {
  if (/^View Online$/i.test(label)) return 3;
  if (/^Project Link$/i.test(label)) return 2;
  if (/^Source Code$/i.test(label)) return 1;
  return 0;
}

function isDirectImageUrl(value: string) {
  return /\.(?:avif|gif|jpe?g|png|webp)(?:[?#].*)?$/i.test(value);
}

function cardRows(block: string) {
  const rows = [...block.matchAll(/<(?:p|li|dd)\b[^>]*>([\s\S]*?)<\/(?:p|li|dd)>/gi)]
    .map((match) => ({ html: match[1] ?? "", text: cleanText(match[1] ?? "") }))
    .filter((row) => row.text);
  if (rows.length) return rows;
  return block
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .split("\n")
    .map((row) => ({ html: row, text: cleanText(row) }))
    .filter((row) => row.text);
}

function linkFromRow(rowHtml: string, rawValue: string, baseUrl: string) {
  const href = rowHtml.match(/<a\b[^>]*href=["']([^"']+)["'][^>]*>/i)?.[1];
  return sanitizeImageLink(href ?? rawValue.match(/https?:\/\/[^\s<]+/i)?.[0] ?? "", baseUrl);
}

function cardLinks(block: string, baseUrl: string) {
  return [...block.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
    .map((match) => {
      const openingTag = match[0].slice(0, match[0].indexOf(">") + 1);
      const label = normalizeCardMetadataLabel(cleanText(match[2] ?? ""))
        ?? (hasExactClassToken(openingTag, cubePortfolioLinkClasses) || /<img\b/i.test(match[2] ?? "")
          ? "Project Link"
          : undefined);
      const url = sanitizeImageLink(match[1] ?? "", baseUrl);
      return label && isProjectLinkLabel(label) && url && !isDirectImageUrl(url) ? { label, url } : undefined;
    })
    .filter(Boolean) as Array<{ label: string; url: string }>;
}

function cardProjectImage(block: string, baseUrl: string) {
  const imageTag = block.match(/<img\b[^>]*>/i)?.[0] ?? "";
  const imageUrl = absoluteUrl(attribute(imageTag, "src"), baseUrl);
  if (imageUrl) return { imageTag, imageUrl };

  const iframeSrc = block.match(/<iframe\b[^>]*src=["']([^"']+)["'][^>]*>/i)?.[1] ?? "";
  const iframeUrl = absoluteUrl(iframeSrc, baseUrl);
  if (iframeUrl) {
    try {
      const parsed = new URL(iframeUrl);
      const driveId = /\/file\/d\/([^/?#]+)\/preview/i.exec(parsed.pathname)?.[1];
      if (driveId && /(?:^|\.)drive\.google\.com$/i.test(parsed.hostname)) {
        const previewUrl = `https://drive.google.com/thumbnail?id=${encodeURIComponent(driveId)}&sz=w1200`;
        return {
          imageTag: `<img src="${previewUrl.replace(/&/g, "&amp;")}" alt="">`,
          imageUrl: previewUrl,
        };
      }
    } catch {
      // Continue to author-provided stills and other supported video providers.
    }
  }

  const imageHref = [...block.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi)]
    .map((match) => match[1] ?? "")
    .find(isDirectImageUrl);
  const linkedImageUrl = absoluteUrl(imageHref ?? "", baseUrl);
  if (linkedImageUrl) {
    return {
      imageTag: `<img src="${linkedImageUrl.replace(/"/g, "&quot;")}" alt="">`,
      imageUrl: linkedImageUrl,
    };
  }

  if (!iframeUrl) return { imageTag: "", imageUrl: undefined };
  try {
    const parsed = new URL(iframeUrl);
    const videoId = /(?:^|\/)embed\/([^/?#]+)/i.exec(parsed.pathname)?.[1];
    if (!videoId || !/(?:^|\.)youtube(?:-nocookie)?\.com$/i.test(parsed.hostname)) {
      return { imageTag: "", imageUrl: undefined };
    }
    const previewUrl = `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg`;
    return {
      imageTag: `<img src="${previewUrl}" alt="">`,
      imageUrl: previewUrl,
    };
  } catch {
    return { imageTag: "", imageUrl: undefined };
  }
}

function isObviousTemplateProject(
  title: string,
  description: string,
  metadataRows: Array<{ label: string; value: string }>,
  block: string,
) {
  if (/\blorem ipsum\b/i.test(`${description} ${cleanText(block)}`)) return true;
  if (/^(?:project(?: title)?(?: \d+)?|your project(?: name)?|untitled project|placeholder)$/i.test(title)) return true;
  const placeholderDate = metadataRows.some(
    (row) => row.label === "Created" && /^(?:date|tbd|coming soon|n\/?a|-+)$/i.test(row.value),
  );
  const linkHrefs = [...block.matchAll(/<a\b[^>]*href=["']([^"']*)["'][^>]*>/gi)]
    .map((match) => match[1] ?? "");
  const onlyPlaceholderLinks = linkHrefs.length > 0 && linkHrefs.every(isPlaceholderImageLink);
  return placeholderDate && onlyPlaceholderLinks;
}

function projectBlockShape(input: {
  title: string;
  description: string;
  metadataRows: Array<{ label: string; value: string }>;
  imageTag: string;
  imageUrl?: string;
  linkUrl?: string;
  locator: string;
  documentIndex: number;
}) {
  return {
    title: input.title,
    subtitle: "",
    contentFamily: undefined,
    imageSrc: attribute(input.imageTag, "src"),
    authorLine: input.description,
    bullets: input.metadataRows.map((row) => `${row.label}: ${row.value}`),
    imageUrl: input.imageUrl,
    imageAlt: attribute(input.imageTag, "alt"),
    linkUrl: input.linkUrl,
    imageLocator: input.locator,
    imageTitle: input.title,
    imageSourceTag: input.imageTag,
    documentIndex: input.documentIndex,
  };
}

function projectSectionRanges(html: string) {
  const headings = [...html.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi)]
    .map((match) => ({
      level: Number.parseInt(match[1] ?? "6", 10),
      label: cleanText(match[2] ?? "").replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""),
      begin: match.index ?? 0,
      contentBegin: (match.index ?? 0) + match[0].length,
    }));
  return headings
    .map((heading, index) => {
      if (!/^(?:(?:featured|selected|recent)\s+)?(?:projects?|portfolio|works?|case studies)$/i.test(heading.label)) {
        return undefined;
      }
      const nextPeer = headings.slice(index + 1).find((candidate) => candidate.level <= heading.level);
      return { begin: heading.contentBegin, end: nextPeer?.begin ?? html.length };
    })
    .filter(Boolean) as Array<{ begin: number; end: number }>;
}

function extractGenericProjectCards(html: string, baseUrl: string) {
  const sectionRanges = projectSectionRanges(html);
  const starts = [...html.matchAll(/<([a-z][\w:-]*)\b[^>]*class=(?:"[^"]*"|'[^']*')[^>]*>/gi)]
    .filter((match) => {
      if (/^<(?:area|base|br|col|embed|hr|img|input|link|meta|source|track|wbr)\b/i.test(match[0])) return false;
      if (hasExactClassToken(match[0], genericProjectCardClasses)) return true;
      if (!exactClassTokens(match[0]).some((token) => token.toLowerCase() === "card")) return false;
      const begin = match.index ?? 0;
      return sectionRanges.some((range) => begin >= range.begin && begin < range.end);
    })
    .map((match) => {
      const begin = match.index ?? 0;
      const strongCard = hasExactClassToken(match[0], genericProjectCardClasses);
      return {
        begin,
        end: matchingElementEnd(html, begin, match[0]),
        openingTag: match[0],
        strongCard,
        sectionScopedCard: exactClassTokens(match[0]).some((token) => token.toLowerCase() === "card"),
      };
    })
    .sort((a, b) => a.begin - b.begin);
  const leafCandidates = starts.filter((candidate) =>
    !starts.some(
      (child) =>
        child.strongCard &&
        child.begin > candidate.begin &&
        child.end <= candidate.end,
    ),
  );
  const outerCards = leafCandidates.filter((candidate, index) =>
    !leafCandidates.slice(0, index).some(
      (parent) => parent.begin < candidate.begin && parent.end >= candidate.end,
    ),
  );
  const projects: ExtractedProjectBlock[] = [];
  const rejectedImageUrls = new Set<string>();

  for (const [index, card] of outerCards.entries()) {
    const block = html.slice(card.begin, card.end);
    const { imageTag, imageUrl } = cardProjectImage(block, baseUrl);
    const headingTitle = cleanText(block.match(/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/i)?.[1] ?? "");
    const classTitle = firstExactClassText(block, projectTitleClasses);
    const captionTitle = cleanText(block.match(/<figcaption\b[^>]*>([\s\S]*?)<\/figcaption>/i)?.[1] ?? "");
    const imageTitle = cleanText(attribute(imageTag, "title") || attribute(imageTag, "alt"));
    const explicitTitle = [headingTitle, classTitle, captionTitle, imageTitle]
      .find((candidate) => isLikelyProjectTitleText(candidate));
    const title = explicitTitle ?? `Project ${index + 1}`;
    const rows = cardRows(block);
    const metadataRows: Array<{ label: string; value: string }> = [];
    const linkCandidates = cardLinks(block, baseUrl);
    const descriptions: string[] = [];

    for (const row of rows) {
      const metadata = splitCardMetadataRow(row.text);
      if (!metadata) {
        if (row.text !== title && !normalizeCardMetadataLabel(row.text)) descriptions.push(row.text);
        continue;
      }
      if (isProjectLinkLabel(metadata.label)) {
        const url = linkFromRow(row.html, metadata.value, baseUrl);
        if (url) linkCandidates.push({ label: metadata.label, url });
        continue;
      }
      metadataRows.push(metadata);
    }

    const uniqueLinks = [...new Map(linkCandidates.map((link) => [`${link.label}:${link.url}`, link])).values()]
      .sort((a, b) => projectLinkPriority(b.label) - projectLinkPriority(a.label));
    metadataRows.push(...uniqueLinks.map((link) => ({ label: link.label, value: link.url })));
    const description = descriptions.find((value) => value.length > 20) ?? descriptions[0] ?? "";

    if (card.sectionScopedCard && (!explicitTitle || (!description && !uniqueLinks.length))) continue;
    if (/^<a\b/i.test(card.openingTag) && isPlaceholderImageLink(attribute(card.openingTag, "href")) && !uniqueLinks.length) {
      continue;
    }
    if (!uniqueLinks.length && !metadataRows.length && description.length < 40) continue;

    if (isObviousTemplateProject(title, description, metadataRows, block)) {
      if (imageUrl) rejectedImageUrls.add(imageUrl);
      continue;
    }

    projects.push(projectBlockShape({
      title,
      description,
      metadataRows,
      imageTag,
      imageUrl,
      linkUrl: uniqueLinks[0]?.url,
      locator: withLocator(html, card.begin),
      documentIndex: card.begin,
    }));
  }

  return { projects, rejectedImageUrls };
}

function extractPaperBoxes(html: string, baseUrl: string) {
  const startPattern = /<div\b[^>]*class=["'][^"']*\bpaper-box\b(?!-)[^"']*["'][^>]*>/gi;
  const starts = [...html.matchAll(startPattern)];
  return starts.map((start, index) => {
    const begin = start.index ?? 0;
    const end = starts[index + 1]?.index ?? html.indexOf("<h1", begin + start[0].length);
    const block = html.slice(begin, end > begin ? end : html.length);
    const paragraphs = [...block.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
      .map((match) => cleanText(match[1]))
      .filter(Boolean);
    const links = [...block.matchAll(/<a\b[^>]*href=[\"']([^\"']+)[\"'][^>]*>([\s\S]*?)<\/a>/gi)];
    const imageTag = block.match(/<img\b[^>]*>/i)?.[0] ?? "";
    const imageSrc = attribute(imageTag, "src");
    const imageUrl = absoluteUrl(imageSrc, baseUrl);
    const badge = firstClassText(block, "badge");
  const inferredTitle = inferImageTitle(
    { title: "", alt: attribute(imageTag, "alt") },
    block,
    imageTag,
  );
  const title =
    inferredTitle ??
    cleanText(links[0]?.[2] ?? paragraphs[0] ?? `Project ${index + 1}`);
    const bullets = [...block.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)]
      .map((match) => cleanText(match[1]))
      .filter(Boolean);
    const precedingHeading = [...html
      .slice(0, start.index ?? 0)
      .matchAll(/<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/gi)]
      .at(-1);
    const heading = cleanText(precedingHeading?.[1] ?? "")
      .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
    return {
      title,
      subtitle: badge,
      contentFamily: /^(?:(?:latest|selected|research)\s+)?(?:papers?|publications?)$|^研究成果$/i.test(heading)
        ? "publication" as const
        : undefined,
      imageSrc,
      authorLine: paragraphs.find((value) => value !== title) ?? "",
      bullets,
      imageUrl,
      imageAlt: attribute(imageTag, "alt"),
      linkUrl: sanitizeImageLink(links[0]?.[1] ?? "", baseUrl),
      imageLocator: start.index === undefined ? `paper-box:${index}` : withLocator(html, start.index),
      imageTitle: title,
      imageSourceTag: imageTag,
      documentIndex: begin,
    };
  });
}

function classifyImage(
  absolute: string,
  attrs: Pick<
    ImageTagMeta,
    "src" | "alt" | "title" | "className" | "id" | "width" | "height" | "linkUrl" | "hasWrappedAnchor" | "hasPlaceholderWrappedAnchor"
  >,
  snippet: string,
) {
  const normalizedSrc = absolute.toLowerCase();
  const isIconPath = /(?:^|\/)(?:icon|icons)(?:[./]|$)/i.test(normalizedSrc);
  if (isIconPath) {
    return {
      category: "logo" as MediaCategory,
      confidence: 0.97,
      reason: "Image path explicitly indicates icon asset.",
    };
  }
  const cleanSnippet = cleanText(snippet).toLowerCase();
  const lowSrc = `${absolute} ${attrs.src ?? ""} ${attrs.alt ?? ""} ${attrs.title ?? ""} ${attrs.className ?? ""} ${attrs.id ?? ""} ${cleanSnippet}`.toLowerCase();
  const hasProject = !isIconPath && /paper[-_ ]?box|project|publication|portfolio/i.test(lowSrc);
  const hasProjectLink = !!attrs.linkUrl;
  const hasWrappedPlaceholder = !!attrs.hasWrappedAnchor && !!attrs.hasPlaceholderWrappedAnchor;
  const hasProjectSignal = hasProject || hasProjectLink;
  const hasOnlyProjectClassSignal = hasProject && !hasProjectLink;
  const isDiminishedProjectSignal = hasOnlyProjectClassSignal && hasWrappedPlaceholder;
  const hasProfile = /author__|profile[_-]?box|avatar|profile[_-]?photo|headshot|portrait/i.test(lowSrc);
  const hasLogo = /\blogo\b|\bicon\b|favicon|brand|apple-touch-icon|\bmask-icon\b/i.test(lowSrc);
  const hasScreenshot = /\bog:image|twitter:image|share.?image|social.?image|screenshot/i.test(lowSrc);
  const tiny = (attrs.width && attrs.width <= 96) || (attrs.height && attrs.height <= 96);

  const candidates: Array<{ category: MediaCategory; score: number; reason: string }> = [
    {
      category: "project-cover",
      score: isDiminishedProjectSignal ? 0.64 : (hasProjectSignal ? 0.95 : 0.2),
      reason: isDiminishedProjectSignal
        ? "Found generic project/card context with placeholder anchor; cannot trust as real project evidence."
        : hasProjectSignal
          ? "Found near project context"
          : "No project marker",
    },
    {
      category: "profile-photo",
      score: hasProfile ? 0.95 : 0.2,
      reason: hasProfile ? "Found near profile metadata" : "No profile marker",
    },
    {
      category: "logo",
      score: hasLogo ? 0.9 : 0,
      reason: hasLogo ? "Contains logo/icon identifiers" : "No logo marker",
    },
    {
      category: "screenshot",
      score: hasScreenshot ? 0.86 : 0.3,
      reason: hasScreenshot ? "Matches social/share/screenshot signature" : "No share signature",
    },
    {
      category: "content",
      score: 0.55,
      reason: "Default content image fallback",
    },
    {
      category: "other",
      score: 0.1,
      reason: "No strong category evidence",
    },
  ];

  const sorted = candidates
    .map((entry) => ({
      ...entry,
      score: entry.category === "logo" && tiny ? Math.min(1, entry.score + 0.12) : entry.score,
    }))
    .sort((a, b) => b.score - a.score);

  const selected = sorted[0];
  const confidence = Number.parseFloat(Math.min(1, Math.max(0, selected.score)).toFixed(2));
  if (confidence < 0.5 && tiny) {
    return {
      category: "decorative" as MediaCategory,
      confidence: 0.56,
      reason: "Small image likely decorative/logo-like; avoid incorrect profile or project mapping.",
    };
  }
  return {
    category: confidence >= 0.3 ? selected.category : "other" as MediaCategory,
    confidence,
    reason: selected.reason,
  };
}

function canonicalKind(category: MediaCategory) {
  if (category === "project-cover") return "project" as const;
  if (category === "profile-photo") return "profile" as const;
  return "other" as const;
}

function gatherImageTags(html: string): ImageTagMeta[] {
  const matches = [...html.matchAll(/<img\b([^>]*)>/gi)];
  return matches.map((match) => {
    const raw = match[0];
    const attrs: Record<string, string> = {
      src: attribute(raw, "src"),
      alt: attribute(raw, "alt"),
      title: attribute(raw, "title"),
      className: attribute(raw, "class"),
      id: attribute(raw, "id"),
    };
    const width = Number.parseInt(attribute(raw, "width"), 10);
    const height = Number.parseInt(attribute(raw, "height"), 10);
    const rawLink = enclosingAnchorHref(html, match.index ?? 0);
    const hasWrappedAnchor = rawLink !== undefined;
    const hasPlaceholderWrappedAnchor = rawLink ? isPlaceholderImageLink(rawLink) : false;
    return {
      raw,
      src: attrs.src || undefined,
      alt: attrs.alt || undefined,
      title: attrs.title || undefined,
      className: attrs.className || undefined,
      id: attrs.id || undefined,
      width: Number.isFinite(width) ? width : undefined,
      height: Number.isFinite(height) ? height : undefined,
      linkUrl: rawLink,
      hasWrappedAnchor,
      hasPlaceholderWrappedAnchor,
      index: match.index ?? 0,
      context: html.slice(Math.max(0, (match.index ?? 0) - 200), Math.min(html.length, (match.index ?? 0) + 200)),
    };
  }).filter((item) => item.src);
}

function parseMetaImage(html: string, baseUrl: string) {
  const social = [...html.matchAll(/<meta\b[^>]*>/gi)]
    .map((match) => {
      const tag = match[0];
      const isImageMeta =
        /property\s*=\s*("|')(og:image|og:image:url|og:image:secure_url)/i.test(tag) ||
        /name\s*=\s*("|')(twitter:image)/i.test(tag);
      if (!isImageMeta) return null;
      const raw = attribute(tag, "content");
      return {
        raw,
        absolute: absoluteUrl(raw, baseUrl),
        locator: `meta-image:${match.index ?? 0}`,
      };
    })
    .filter(Boolean) as Array<{ raw: string; absolute: string | undefined; locator: string }>;
  return social;
}

function dedupeByUrl(media: ExtractedMedia[]) {
  const map = new Map<string, ExtractedMedia>();
  for (const item of media) {
    const key = `${item.sourcePage}::${item.url}`;
    const existing = map.get(key);
    if (!existing || isBetterMedia(item, existing)) {
      map.set(key, item);
    }
  }
  return [...map.values()];
}

function kindPriority(kind: ExtractedMedia["kind"]) {
  if (kind === "project") return 3;
  if (kind === "profile") return 2;
  return 1;
}

function isBetterMedia(candidate: ExtractedMedia, current: ExtractedMedia) {
  if (candidate.categoryConfidence !== current.categoryConfidence) {
    return candidate.categoryConfidence > current.categoryConfidence;
  }
  const candidatePriority = kindPriority(candidate.kind);
  const currentPriority = kindPriority(current.kind);
  if (candidatePriority !== currentPriority) return candidatePriority > currentPriority;
  return false;
}

function enrichFromMetadata(html: string, baseUrl: string) {
  const images = gatherImageTags(html);
  const metaImages = parseMetaImage(html, baseUrl);

  const fromImages = images
    .map((image) => {
      const absolute = absoluteUrl(image.src ?? "", baseUrl);
      if (!absolute) return null;
      const linkedUrl = sanitizeImageLink(image.linkUrl ?? "", baseUrl);
      const classification = classifyImage(absolute, { ...image, linkUrl: linkedUrl }, image.context);
      return {
        url: absolute,
        originalUrl: image.src ?? "",
        sourcePage: baseUrl,
        locator: `img:${image.index}`,
        alt: image.alt,
        title: inferImageTitle(image, image.context, image.raw),
        linkUrl: linkedUrl,
        kind: canonicalKind(classification.category),
        category: classification.category,
        categoryConfidence: classification.confidence,
        categoryReason: classification.reason,
      } as ExtractedMedia;
    })
    .filter(Boolean) as ExtractedMedia[];

  const fromMeta = metaImages
    .map((item) => {
      if (!item.absolute) return null;
      const source = item.absolute;
      const fakeTag = `og:image ${item.raw}`;
      const classification = classifyImage(source, { src: item.raw }, fakeTag);
      return {
        url: source,
        originalUrl: item.raw,
        sourcePage: baseUrl,
        locator: item.locator,
        kind: canonicalKind(classification.category),
        category: classification.category,
        categoryConfidence: classification.confidence,
        categoryReason: `${classification.reason} (from meta tag)`,
      } as ExtractedMedia;
    })
    .filter(Boolean) as ExtractedMedia[];

  return [...fromImages, ...fromMeta];
}

export function extractWebPage(html: string, baseUrl: string): ExtractedWebPage {
  html = maskHtmlComments(html);
  const safeBase = new URL(baseUrl).href;
  const title = cleanText(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "") || new URL(baseUrl).hostname;
  const name = firstClassText(html, "author__name")
    || cleanText(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? "")
    || title.replace(/\s*[-|｜].*$/, "");
  const organization = firstClassText(html, "author__bio");
  const profileMatch = html.match(/<div\b[^>]*class=[\"'][^\"']*\bprofile_box\b[^\"']*[\"'][^>]*>([\s\S]*?)<article\b/i);
  const profileContent = profileMatch?.[1] ?? html;
  const role = cleanText(
    html.match(/<ul\b[^>]*class=[\"'][^\"']*\bauthor__urls\b[^\"']*[\"'][^>]*>[\s\S]*?<li\b[^>]*>\s*<div\b[^>]*>([\s\S]*?)<\/div>/i)?.[1] ?? "",
  );

  const firstContentHeading = html.search(/<h1\b/i);
  const contentStart = html.search(/<section\b[^>]*class=[\"'][^\"']*\bpage__content\b[^\"']*[\"'][^>]*>/i);
  const aboutBlock = contentStart >= 0
    ? html.slice(contentStart, firstContentHeading > contentStart ? firstContentHeading : html.length)
    : sectionAfterHeading(html, /about( me)?|关于我/i);
  const about = [...aboutBlock.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((match) => cleanText(match[1]))
    .filter((row) => row.length > 30 && !/^about( me)?$/i.test(row))
    .join(" ");

  const genericProjects = extractGenericProjectCards(html, baseUrl);
  const projects = [...extractPaperBoxes(html, baseUrl), ...genericProjects.projects]
    .sort((a, b) => a.documentIndex - b.documentIndex);
  const publications = projects.length
    ? []
    : blockRows(
      sectionAfterHeading(html, /^(?:(?:latest|selected|research)\s+)?(?:papers?|publications?)$|^研究成果$/i),
      baseUrl,
    );
  const openSource = blockRows(
    sectionAfterHeading(html, /^(开源|开源项目|开源作品|open[- ]?source|opensource|open-source)$/i),
    baseUrl,
  );
  const talks = blockRows(sectionAfterHeading(html, /^(talks?|invited talks?|speaking|演讲|讲座)$/i), baseUrl);
  const exhibitions = blockRows(sectionAfterHeading(html, /^(exhibitions?|展览|展会|展示)$/i), baseUrl);
  const newsRows = blockRows(
    sectionAfterHeading(html, /^(news|updates?|动态|新闻动态|最新动态)$/i),
    baseUrl,
  );
  const mediaCoverageRows = blockRows(
    sectionAfterHeading(html, /^(media|media coverage|press|interviews?|媒体报道|媒体采访|媒体)$/i),
    baseUrl,
  );
  const achievements = blockRows(sectionAfterHeading(html, /honou?rs?( and awards?)?|awards?|荣誉|获奖/i), baseUrl);
  const education = blockRows(sectionAfterHeading(html, /educations?|教育/i), baseUrl);
  const experience = blockRows(sectionAfterHeading(html, /internships?|experience|employment|工作经历|实习/i), baseUrl);
  const svgSkillList = html.match(
    /<ul\b[^>]*class=["'][^"']*\bsvg-list\b[^"']*["'][^>]*>([\s\S]*?)<\/ul>/i,
  )?.[1] ?? "";
  const skillTerms = Array.from(new Set([
    ...[...aboutBlock.matchAll(/<strong\b[^>]*>([\s\S]*?)<\/strong>/gi)]
      .map((match) => cleanText(match[1])),
    ...[...svgSkillList.matchAll(/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/gi)]
      .map((match) => cleanText(match[1])),
    ...[...svgSkillList.matchAll(/<svg\b[^>]*aria-label=["']([^"']+)["'][^>]*>/gi)]
      .map((match) => cleanText(match[1]).replace(/\s+icon$/i, "")),
  ].filter((value) => value.length > 1 && value.length < 60)));

  const contacts = new Set<string>();
  for (const match of html.matchAll(/<a\b[^>]*href=[\"']mailto:([^\"'?]+)[^\"']*[\"'][^>]*>/gi)) {
    contacts.add(`Email: ${decodeHtml(match[1])}`);
  }
  for (const match of html.matchAll(/<a\b[^>]*href=[\"']([^\"']+)[\"'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const label = cleanText(match[2]);
    const url = absoluteUrl(match[1], baseUrl);
    if (!url) continue;
    if (/google scholar|github|linkedin|orcid/i.test(label)) {
      contacts.add(`${label}: ${url}`);
      continue;
    }
    const socialLabel = socialContactLabel(url);
    if (socialLabel) contacts.add(`${socialLabel}: ${url}`);
  }

  const lines: string[] = [name];
  const headline = [role, organization].filter(Boolean).join(" · ");
  if (headline) lines.push(headline);
  if (about) lines.push("About", about);
  if (projects.length) {
    let activeProjectHeading = "";
    for (const project of projects) {
      const projectHeading = project.contentFamily === "publication" ? "Publications" : "Projects";
      if (projectHeading !== activeProjectHeading) {
        lines.push(projectHeading);
        activeProjectHeading = projectHeading;
      }
      lines.push([project.title, project.subtitle].filter(Boolean).join(" — "));
      if (project.authorLine) lines.push(`- ${project.authorLine}`);
      if (project.linkUrl) lines.push(`Source: ${project.linkUrl}`);
      lines.push(...project.bullets.map((bullet) => `- ${bullet}`));
    }
  }
  if (experience.length) lines.push("Experience", ...experience);
  if (education.length) lines.push("Education", ...education);
  if (skillTerms.length) lines.push("Skills", skillTerms.join(", "));
  if (publications.length) lines.push("Publications", ...publications);
  if (openSource.length) lines.push("Open Source", ...openSource);
  if (talks.length) lines.push("Talks", ...talks);
  if (exhibitions.length) lines.push("Exhibitions", ...exhibitions);
  if (newsRows.length) lines.push("Achievements", ...newsRows);
  if (mediaCoverageRows.length) lines.push("Media", ...mediaCoverageRows);
  if (achievements.length) lines.push("Achievements", ...achievements);
  if (contacts.size) lines.push("Contact", ...contacts);

  const avatarMatch = profileContent.match(/<img\b[^>]*>/i);
  const avatarTag = avatarMatch?.[0] ?? "";
  const avatarUrl = absoluteUrl(attribute(avatarTag, "src"), baseUrl);
  const avatarLocator = avatarMatch
    ? withLocator(
      html,
      Math.max(0, html.indexOf(avatarTag)),
    )
    : "profile-img:0";

  const explicitMedia = [
    ...(avatarUrl
        ? [{
          url: avatarUrl,
          originalUrl: attribute(avatarTag, "src") || avatarUrl,
          sourcePage: safeBase,
          locator: avatarLocator,
          alt: attribute(avatarTag, "alt") || name,
        title: name,
        kind: "profile" as const,
        category: "profile-photo" as const,
        categoryConfidence: 0.99,
        categoryReason: "Explicit profile avatar candidate in profile container.",
      }]
      : []),
    ...projects.flatMap((project) =>
      project.imageUrl
        ? [{
          url: project.imageUrl,
          originalUrl: project.imageSrc || project.imageUrl,
          sourcePage: safeBase,
          locator: project.imageLocator,
          alt: project.imageAlt || project.title,
          title: project.title,
          linkUrl: project.linkUrl,
          kind: "project" as const,
          category: "project-cover" as const,
          categoryConfidence: 0.98,
          categoryReason: "Project block image.",
        }]
        : [],
    ),
  ];

  const inferredMedia = enrichFromMetadata(html, safeBase).map((item) =>
    genericProjects.rejectedImageUrls.has(item.url) && item.kind === "project"
      ? {
        ...item,
        kind: "other" as const,
        category: "content" as const,
        categoryConfidence: 0.45,
        categoryReason: "Image belongs to an explicitly rejected template project card.",
      }
      : item,
  );
  const extractedMedia = dedupeByUrl([...explicitMedia, ...inferredMedia]);
  const hasExtractedRows = Boolean(
    about ||
      projects.length ||
      publications.length ||
      openSource.length ||
      talks.length ||
      exhibitions.length ||
      newsRows.length ||
      mediaCoverageRows.length ||
      achievements.length ||
      education.length ||
      experience.length ||
      skillTerms.length ||
      contacts.size,
  );
  const canonicalText = hasExtractedRows ? lines.join("\n") : readableFallback(html);

  return { title, text: canonicalText.slice(0, 80_000), media: extractedMedia };
}
