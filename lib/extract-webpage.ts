export interface ExtractedMedia {
  url: string;
  alt?: string;
  title?: string;
  linkUrl?: string;
  kind: "project" | "profile" | "other";
}

export interface ExtractedWebPage {
  title: string;
  text: string;
  media: ExtractedMedia[];
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

function attribute(tag: string, name: string) {
  const match = tag.match(new RegExp(`${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return decodeHtml(match?.[1] ?? match?.[2] ?? match?.[3] ?? "").trim();
}

function absoluteUrl(value: string, baseUrl: string) {
  if (!value || /^(data|javascript):/i.test(value)) return undefined;
  try {
    return new URL(value, baseUrl).href;
  } catch {
    return undefined;
  }
}

function firstClassText(html: string, className: string) {
  const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return cleanText(
    html.match(new RegExp(`<([a-z\\d]+)[^>]*class=["'][^"']*\\b${escaped}\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/\\1>`, "i"))?.[2] ?? "",
  );
}

function sectionAfterHeading(html: string, labels: RegExp) {
  const headings = [...html.matchAll(/<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/gi)];
  const headingIndex = headings.findIndex((match) => labels.test(cleanText(match[1])));
  if (headingIndex < 0) return "";
  const start = (headings[headingIndex].index ?? 0) + headings[headingIndex][0].length;
  const end = headings[headingIndex + 1]?.index ?? html.length;
  return html.slice(start, end);
}

function blockRows(block: string) {
  const listItems = [...block.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)]
    .map((match) => cleanText(match[1]))
    .filter(Boolean);
  if (listItems.length) return listItems;
  return [...block.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((match) => cleanText(match[1]))
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
    const links = [...block.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)];
    const imageTag = block.match(/<img\b[^>]*>/i)?.[0] ?? "";
    const badge = firstClassText(block, "badge");
    const title = cleanText(links[0]?.[2] ?? paragraphs[0] ?? `Project ${index + 1}`);
    const bullets = [...block.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)]
      .map((match) => cleanText(match[1]))
      .filter(Boolean);
    return {
      title,
      subtitle: badge,
      authorLine: paragraphs.find((value) => value !== title) ?? "",
      bullets,
      imageUrl: absoluteUrl(attribute(imageTag, "src"), baseUrl),
      imageAlt: attribute(imageTag, "alt"),
      linkUrl: absoluteUrl(links[0]?.[1] ?? "", baseUrl),
    };
  });
}

export function extractWebPage(html: string, baseUrl: string): ExtractedWebPage {
  const title = cleanText(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "") || new URL(baseUrl).hostname;
  const name = firstClassText(html, "author__name")
    || cleanText(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? "")
    || title.replace(/\s*[-|｜].*$/, "");
  const organization = firstClassText(html, "author__bio");
  const profileBlock = html.match(/<div\b[^>]*class=["'][^"']*\bprofile_box\b[^"']*["'][^>]*>([\s\S]*?)<article\b/i)?.[1] ?? html;
  const role = cleanText(
    html.match(/<ul\b[^>]*class=["'][^"']*\bauthor__urls\b[^"']*["'][^>]*>[\s\S]*?<li\b[^>]*>\s*<div\b[^>]*>([\s\S]*?)<\/div>/i)?.[1] ?? "",
  );

  const firstContentHeading = html.search(/<h1\b/i);
  const contentStart = html.search(/<section\b[^>]*class=["'][^"']*\bpage__content\b/i);
  const aboutBlock = contentStart >= 0
    ? html.slice(contentStart, firstContentHeading > contentStart ? firstContentHeading : html.length)
    : sectionAfterHeading(html, /about( me)?|关于我/i);
  const about = [...aboutBlock.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((match) => cleanText(match[1]))
    .filter((row) => row.length > 30 && !/^about( me)?$/i.test(row))
    .join(" ");

  const projects = extractPaperBoxes(html, baseUrl);
  const achievements = blockRows(sectionAfterHeading(html, /honou?rs?( and awards?)?|awards?|荣誉|获奖/i));
  const education = blockRows(sectionAfterHeading(html, /educations?|教育/i));
  const experience = blockRows(sectionAfterHeading(html, /internships?|experience|employment|工作经历|实习/i));
  const skillTerms = [...aboutBlock.matchAll(/<strong\b[^>]*>([\s\S]*?)<\/strong>/gi)]
    .map((match) => cleanText(match[1]))
    .filter((value) => value.length > 1 && value.length < 60);

  const contacts = new Set<string>();
  for (const match of html.matchAll(/<a\b[^>]*href=["']mailto:([^"'?]+)[^"']*["'][^>]*>/gi)) {
    contacts.add(`Email: ${decodeHtml(match[1])}`);
  }
  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const label = cleanText(match[2]);
    const url = absoluteUrl(match[1], baseUrl);
    if (url && /google scholar|github|linkedin|orcid/i.test(label)) contacts.add(`${label}: ${url}`);
  }

  const lines: string[] = [name];
  const headline = [role, organization].filter(Boolean).join(" · ");
  if (headline) lines.push(headline);
  if (about) lines.push("About", about);
  if (projects.length) {
    lines.push("Projects");
    for (const project of projects) {
      lines.push([project.title, project.subtitle].filter(Boolean).join(" — "));
      if (project.authorLine) lines.push(`- ${project.authorLine}`);
      lines.push(...project.bullets.map((bullet) => `- ${bullet}`));
    }
  }
  if (experience.length) lines.push("Experience", ...experience);
  if (education.length) lines.push("Education", ...education);
  if (skillTerms.length) lines.push("Skills", skillTerms.join(", "));
  if (achievements.length) lines.push("Achievements", ...achievements);
  if (contacts.size) lines.push("Contact", ...contacts);

  const avatarTag = profileBlock.match(/<img\b[^>]*>/i)?.[0] ?? "";
  const avatarUrl = absoluteUrl(attribute(avatarTag, "src"), baseUrl);
  const media: ExtractedMedia[] = [
    ...(avatarUrl ? [{ url: avatarUrl, alt: attribute(avatarTag, "alt") || name, title: name, kind: "profile" as const }] : []),
    ...projects.flatMap((project) => project.imageUrl ? [{
      url: project.imageUrl,
      alt: project.imageAlt || project.title,
      title: project.title,
      linkUrl: project.linkUrl,
      kind: "project" as const,
    }] : []),
  ];
  const canonicalText = lines.length >= 4 ? lines.join("\n") : readableFallback(html);

  return { title, text: canonicalText.slice(0, 80_000), media };
}
