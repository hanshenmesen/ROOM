import { assertAllowedResearchUrl, scoreWebsiteCandidate } from "../policy.ts";
import type { WebsiteFetchedPage, WebsiteResearchCandidate, WebsiteResearchMissingField } from "../state.ts";

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function cleanLabel(value: string) {
  return decodeHtml(value.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim().slice(0, 200);
}

export function listLinksTool(input: {
  page: WebsiteFetchedPage;
  allowedHosts: string[];
  missingFields: WebsiteResearchMissingField[];
  maxDepth: number;
}): WebsiteResearchCandidate[] {
  const nextDepth = input.page.depth + 1;
  if (!input.page.contentType.includes("text/html") || nextDepth > input.maxDepth) return [];
  const candidates = new Map<string, WebsiteResearchCandidate>();
  for (const match of input.page.html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const attributes = match[1] || "";
    const hrefMatch = attributes.match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const href = decodeHtml(hrefMatch?.[1] || hrefMatch?.[2] || hrefMatch?.[3] || "").trim();
    if (!href || /^(?:#|mailto:|tel:|javascript:|data:)/i.test(href)) continue;
    try {
      const url = assertAllowedResearchUrl(new URL(href, input.page.url), input.allowedHosts);
      if (url.href === input.page.url || candidates.has(url.href)) continue;
      const candidate = scoreWebsiteCandidate({
        url: url.href,
        label: cleanLabel(match[2] || ""),
        depth: nextDepth,
        discoveredFrom: input.page.url,
        missingFields: input.missingFields,
      });
      if (!candidate.reasons.length || candidate.score < 0) continue;
      candidates.set(url.href, candidate);
    } catch {
      // Untrusted page links outside the approved host or URL policy are ignored.
    }
  }
  return [...candidates.values()].sort((left, right) => right.score - left.score || left.url.localeCompare(right.url));
}
