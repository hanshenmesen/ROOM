import { extractWebPage } from "../../../extract-webpage.ts";
import { quarantineSourceInstructions } from "../../source-security.ts";
import type { WebsiteFetchedPage, WebsiteInspectedPage } from "../state.ts";

export function inspectPageTool(page: WebsiteFetchedPage): WebsiteInspectedPage {
  if (page.contentType.includes("text/html")) {
    const extracted = extractWebPage(page.html, page.url);
    return {
      url: page.url,
      depth: page.depth,
      ...extracted,
      text: quarantineSourceInstructions(extracted.text).text,
    };
  }
  return {
    url: page.url,
    depth: page.depth,
    title: new URL(page.url).hostname,
    text: quarantineSourceInstructions(page.html.slice(0, 80_000)).text,
    media: [],
  };
}
