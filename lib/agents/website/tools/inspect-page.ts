import { extractWebPage } from "../../../extract-webpage.ts";
import type { WebsiteFetchedPage, WebsiteInspectedPage } from "../state.ts";

export function inspectPageTool(page: WebsiteFetchedPage): WebsiteInspectedPage {
  if (page.contentType.includes("text/html")) {
    const extracted = extractWebPage(page.html, page.url);
    return { url: page.url, depth: page.depth, ...extracted };
  }
  return {
    url: page.url,
    depth: page.depth,
    title: new URL(page.url).hostname,
    text: page.html.slice(0, 80_000),
    media: [],
  };
}
