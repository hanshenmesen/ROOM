import type { WebsiteClaimEvidence, WebsiteSourceRange } from "../state.ts";

function normalized(value: string) {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim().toLocaleLowerCase();
}

export function validateClaimTool(evidence: WebsiteClaimEvidence, ranges: WebsiteSourceRange[]) {
  const range = ranges.find((candidate) => candidate.pageUrl === evidence.pageUrl);
  if (!range || !/^line:\d+$/.test(evidence.locator) || !evidence.excerpt.trim()) return false;
  const line = Number(evidence.locator.slice("line:".length));
  if (!Number.isSafeInteger(line) || line < range.startLine || line > range.endLine) return false;
  return normalized(range.searchableText).includes(normalized(evidence.excerpt));
}
