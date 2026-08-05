import { fetchPublicWebPage } from "../../../public-web.ts";
import { assertAllowedResearchUrl } from "../policy.ts";
import type { WebsiteFetchedPage, WebsiteResearchBudget } from "../state.ts";

export type WebsitePageFetcher = (url: string, options: {
  maxBytes: number;
  timeoutMs: number;
  allowedHosts: string[];
}) => Promise<{ url: string; contentType: string; text: string }>;

export const defaultWebsitePageFetcher: WebsitePageFetcher = async (url, options) => fetchPublicWebPage(url, {
  maxBytes: options.maxBytes,
  timeoutMs: options.timeoutMs,
  authorizeUrl: (candidate) => {
    assertAllowedResearchUrl(candidate, options.allowedHosts);
  },
});

export async function fetchPageTool(input: {
  url: string;
  depth: number;
  allowedHosts: string[];
  budget: WebsiteResearchBudget;
  fetcher?: WebsitePageFetcher;
}): Promise<WebsiteFetchedPage> {
  if (!Number.isInteger(input.depth) || input.depth < 0 || input.depth > input.budget.maxDepth) {
    throw new Error("Website page depth is outside the research policy.");
  }
  const url = assertAllowedResearchUrl(input.url, input.allowedHosts);
  const page = await (input.fetcher || defaultWebsitePageFetcher)(url.href, {
    maxBytes: input.budget.maxPageBytes,
    timeoutMs: Math.min(12_000, input.budget.maxDurationMs),
    allowedHosts: input.allowedHosts,
  });
  const finalUrl = assertAllowedResearchUrl(page.url, input.allowedHosts);
  if (!page.contentType.includes("text/html") && !page.contentType.includes("text/plain")) {
    throw new Error("Website Research Agent accepts only HTML or plain text pages.");
  }
  const byteLength = new TextEncoder().encode(page.text).byteLength;
  if (byteLength > input.budget.maxPageBytes) throw new Error("Website page exceeds the per-page byte budget.");
  return {
    url: finalUrl.href,
    contentType: page.contentType,
    html: page.text,
    byteLength,
    depth: input.depth,
  };
}
