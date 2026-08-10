import type { ExtractedMedia } from "../../../extract-webpage.ts";
import type { WebsiteInspectedPage } from "../state.ts";

export function extractMediaTool(page: WebsiteInspectedPage): ExtractedMedia[] {
  return page.media
    .filter((item) => item.sourcePage === page.url && item.category !== "decorative")
    .slice(0, 80)
    .map((item) => structuredClone(item));
}
