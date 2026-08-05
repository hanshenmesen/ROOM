import type { ParsedProfile, ProfileMedia } from "../../../types.ts";
import type { WebsiteInspectedPage, WebsiteSourceRange } from "../state.ts";

export type WebsiteProfileSubmitter = (input: {
  text: string;
  label: string;
  sourceId: string;
  media: ProfileMedia[];
}) => Promise<ParsedProfile>;

export function composeWebsiteSource(pages: WebsiteInspectedPage[]) {
  const lines: string[] = [];
  const ranges: WebsiteSourceRange[] = [];
  for (const [index, page] of pages.entries()) {
    const pageLines = [
      `[Website page ${index + 1}]`,
      `URL: ${page.url}`,
      `Title: ${page.title}`,
      ...page.text.split(/\r?\n/),
    ];
    const startLine = lines.length + 1;
    lines.push(...pageLines);
    const endLine = lines.length;
    ranges.push({
      pageUrl: page.url,
      startLine,
      endLine,
      searchableText: [page.url, page.title, page.text].join("\n"),
    });
  }
  return { text: lines.join("\n"), ranges };
}

export async function submitProfileTool(input: {
  pages: WebsiteInspectedPage[];
  media: ProfileMedia[];
  submitter: WebsiteProfileSubmitter;
}) {
  if (!input.pages.length) throw new Error("Website Research Agent has no inspected page to submit.");
  const source = composeWebsiteSource(input.pages);
  const root = input.pages[0];
  const profile = await input.submitter({
    text: source.text,
    label: `${root.title} · ${input.pages.length} researched page${input.pages.length === 1 ? "" : "s"}`,
    sourceId: root.url,
    media: input.media,
  });
  return { profile, ...source };
}
