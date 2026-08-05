import { runTracedTool } from "../../agent-runtime/tool-call.ts";
import type { AgentTracer } from "../../agent-runtime/tracer.ts";
import type { ParsedProfile, SourceEvidence } from "../../types.ts";
import {
  assertAllowedResearchUrl,
  DEFAULT_WEBSITE_RESEARCH_BUDGET,
  missingProfileFields,
  normalizeWebsiteResearchUrl,
  selectNextCandidate,
} from "./policy.ts";
import {
  WEBSITE_RESEARCH_SCHEMA_VERSION,
  WebsiteResearchError,
  type WebsiteClaimEvidence,
  type WebsiteFetchedPage,
  type WebsiteInspectedPage,
  type WebsiteResearchBudget,
  type WebsiteResearchCandidate,
  type WebsiteResearchClaim,
  type WebsiteResearchResult,
  type WebsiteResearchState,
  type WebsiteSourceRange,
} from "./state.ts";
import { extractMediaTool } from "./tools/extract-media.ts";
import { fetchPageTool, type WebsitePageFetcher } from "./tools/fetch-page.ts";
import { inspectPageTool } from "./tools/inspect-page.ts";
import { listLinksTool } from "./tools/list-links.ts";
import { composeWebsiteSource, submitProfileTool, type WebsiteProfileSubmitter } from "./tools/submit-profile.ts";
import { validateClaimTool } from "./tools/validate-claim.ts";

const RESEARCH_STEP = "website.tool-research";

export type WebsiteResearchPrefetch = {
  page: WebsiteFetchedPage;
  allowedHosts: string[];
  budget: WebsiteResearchBudget;
};

export type WebsiteResearchOptions = {
  rootUrl: string;
  currentProfile?: ParsedProfile;
  tracer: AgentTracer;
  submitter: WebsiteProfileSubmitter;
  fetcher?: WebsitePageFetcher;
  prefetchedRoot?: WebsiteResearchPrefetch;
  approvedHosts?: string[];
  budget?: Partial<WebsiteResearchBudget>;
};

function positiveInteger(value: number | undefined, fallback: number, maximum: number) {
  return Math.min(maximum, Math.max(1, Math.floor(value || fallback)));
}

function resolvedBudget(input: Partial<WebsiteResearchBudget> = {}): WebsiteResearchBudget {
  const defaults = DEFAULT_WEBSITE_RESEARCH_BUDGET;
  return {
    maxPages: positiveInteger(input.maxPages, defaults.maxPages, defaults.maxPages),
    maxDepth: positiveInteger(input.maxDepth, defaults.maxDepth, defaults.maxDepth),
    maxSteps: positiveInteger(input.maxSteps, defaults.maxSteps, defaults.maxSteps),
    maxTotalBytes: positiveInteger(input.maxTotalBytes, defaults.maxTotalBytes, defaults.maxTotalBytes),
    maxPageBytes: positiveInteger(input.maxPageBytes, defaults.maxPageBytes, defaults.maxPageBytes),
    maxDurationMs: positiveInteger(input.maxDurationMs, defaults.maxDurationMs, defaults.maxDurationMs),
    maxModelInputCharacters: positiveInteger(
      input.maxModelInputCharacters,
      defaults.maxModelInputCharacters,
      defaults.maxModelInputCharacters,
    ),
  };
}

function researchHosts(root: URL, approvedHosts: string[] = []) {
  const rootHost = root.hostname.toLowerCase();
  const hosts = new Set([
    rootHost,
    rootHost.startsWith("www.") ? rootHost.slice(4) : `www.${rootHost}`,
  ]);
  for (const host of approvedHosts) {
    const normalized = host.trim().toLowerCase();
    if (normalized && /^[a-z0-9.-]+$/.test(normalized)) hosts.add(normalized);
  }
  return [...hosts];
}

function elapsed(state: WebsiteResearchState) {
  return Date.now() - Date.parse(state.startedAt);
}

function canCallTool(state: WebsiteResearchState, ignoreNavigationTime = false) {
  if (!ignoreNavigationTime && elapsed(state) >= state.budget.maxDurationMs) {
    state.stopReason ||= "time_budget";
    return false;
  }
  if (state.steps >= state.budget.maxSteps) {
    state.stopReason ||= "step_budget";
    return false;
  }
  return true;
}

async function callTool<T>(
  state: WebsiteResearchState,
  tracer: AgentTracer,
  tool: string,
  inputSummary: Record<string, string | number | boolean | null>,
  call: () => Promise<T> | T,
  summarizeOutput: (output: T) => Record<string, string | number | boolean | null>,
  options: { ignoreNavigationTime?: boolean } = {},
) {
  if (!canCallTool(state, options.ignoreNavigationTime)) {
    throw new WebsiteResearchError("research_budget_exhausted", "Website research budget exhausted.");
  }
  state.steps += 1;
  return runTracedTool({ tracer, step: RESEARCH_STEP, tool, inputSummary, call, summarizeOutput });
}

export async function prefetchWebsiteResearchRoot(input: {
  rootUrl: string;
  tracer: AgentTracer;
  fetcher?: WebsitePageFetcher;
  approvedHosts?: string[];
  budget?: Partial<WebsiteResearchBudget>;
}): Promise<WebsiteResearchPrefetch> {
  const root = normalizeWebsiteResearchUrl(input.rootUrl);
  const budget = resolvedBudget(input.budget);
  const allowedHosts = researchHosts(root, input.approvedHosts);
  const page = await runTracedTool({
    tracer: input.tracer,
    step: RESEARCH_STEP,
    tool: "fetch_page",
    inputSummary: { url: root.href, depth: 0 },
    call: () => fetchPageTool({
      url: root.href,
      depth: 0,
      allowedHosts,
      budget,
      fetcher: input.fetcher,
    }),
    summarizeOutput: (output) => ({
      url: output.url,
      contentType: output.contentType,
      byteLength: output.byteLength,
    }),
  });
  return { page, allowedHosts, budget };
}

function addCandidates(state: WebsiteResearchState, candidates: WebsiteResearchCandidate[]) {
  const known = new Set([...state.visitedUrls, ...state.pendingUrls.map((candidate) => candidate.url)]);
  for (const candidate of candidates) {
    if (known.has(candidate.url)) continue;
    state.pendingUrls.push(candidate);
    known.add(candidate.url);
  }
}

function fitInputBudget(page: WebsiteInspectedPage, existing: WebsiteInspectedPage[], budget: number) {
  const used = composeWebsiteSource(existing).text.length;
  const reserved = page.url.length + page.title.length + 80;
  const remaining = Math.max(0, budget - used - reserved);
  if (page.text.length <= remaining) return page;
  return { ...page, text: page.text.slice(0, remaining) };
}

type ClaimDraft = {
  field: string;
  value: string;
  evidence: SourceEvidence[];
};

function profileClaimDrafts(profile: ParsedProfile): ClaimDraft[] {
  const drafts: ClaimDraft[] = [];
  const add = (field: string, value: string | undefined, evidence: SourceEvidence[] | undefined) => {
    if (value?.trim() && evidence?.length) drafts.push({ field, value, evidence });
  };
  add("identity.name", profile.name, profile.identityEvidence.name);
  add("identity.headline", profile.headline, profile.identityEvidence.headline);
  add("identity.location", profile.location, profile.identityEvidence.location);
  add("identity.summary", profile.summary, profile.identityEvidence.summary);
  add("personalWebsite", profile.personalWebsite, profile.personalWebsiteEvidence);
  for (const value of profile.contacts) add("contacts", value, profile.contactEvidence[value]);
  for (const value of profile.skills) add("skills", value, profile.skillEvidence[value]);
  for (const value of profile.foods || []) add("foods", value, profile.foodEvidence?.[value]);
  for (const value of profile.hobbies || []) add("hobbies", value, profile.hobbyEvidence?.[value]);
  for (const item of profile.items) {
    add(`items.${item.kind}`, item.title, item.evidence);
    add("items.timeRange", item.timeRange, item.fieldEvidence?.timeRange);
    add("items.role", item.role, item.fieldEvidence?.role);
    add("items.projectUrl", item.projectUrl, item.fieldEvidence?.projectUrl);
    if (item.techStack?.length && item.fieldEvidence?.techStack?.length) {
      add("items.techStack", item.techStack.join(", "), item.fieldEvidence.techStack);
    }
  }
  return drafts;
}

function mappedEvidence(evidence: SourceEvidence[], ranges: WebsiteSourceRange[]): WebsiteClaimEvidence[] {
  const mapped: WebsiteClaimEvidence[] = [];
  for (const entry of evidence) {
    const line = /^line:(\d+)$/.exec(entry.locator)?.[1];
    if (!line) continue;
    const lineNumber = Number(line);
    const range = ranges.find((candidate) => lineNumber >= candidate.startLine && lineNumber <= candidate.endLine);
    if (!range) continue;
    mapped.push({ pageUrl: range.pageUrl, locator: entry.locator, excerpt: entry.excerpt });
  }
  return mapped;
}

async function collectValidatedClaims(
  profile: ParsedProfile,
  ranges: WebsiteSourceRange[],
  state: WebsiteResearchState,
  tracer: AgentTracer,
) {
  const claims: WebsiteResearchClaim[] = [];
  for (const draft of profileClaimDrafts(profile)) {
    if (!canCallTool(state, true)) break;
    const evidence = mappedEvidence(draft.evidence, ranges);
    if (!evidence.length) continue;
    const supported = await callTool(
      state,
      tracer,
      "validate_claim",
      {
        field: draft.field,
        pageUrl: evidence[0].pageUrl,
        locator: evidence[0].locator,
        evidenceCount: evidence.length,
      },
      () => evidence.every((entry) => validateClaimTool(entry, ranges)),
      (result) => ({ supported: result }),
      { ignoreNavigationTime: true },
    ).catch(() => false);
    if (supported) claims.push({
      claimId: `website-claim-${claims.length + 1}`,
      field: draft.field,
      value: draft.value,
      evidence,
    });
  }
  return claims;
}

export async function runWebsiteResearchAgent(options: WebsiteResearchOptions): Promise<WebsiteResearchResult> {
  const root = normalizeWebsiteResearchUrl(options.rootUrl);
  const budget = options.prefetchedRoot?.budget || resolvedBudget(options.budget);
  const allowedHosts = options.prefetchedRoot?.allowedHosts || researchHosts(root, options.approvedHosts);
  assertAllowedResearchUrl(root, allowedHosts);
  const state: WebsiteResearchState = {
    schemaVersion: WEBSITE_RESEARCH_SCHEMA_VERSION,
    rootUrl: root.href,
    allowedHosts,
    missingFields: missingProfileFields(options.currentProfile),
    visitedUrls: [],
    pendingUrls: [{ url: root.href, depth: 0, discoveredFrom: root.href, score: 100, reasons: ["root"] }],
    pages: [],
    claims: [],
    steps: options.prefetchedRoot ? 1 : 0,
    downloadedBytes: 0,
    modelInputCharacters: 0,
    budget,
    startedAt: new Date().toISOString(),
  };
  const inspectedPages: WebsiteInspectedPage[] = [];
  const collectedMedia = new Map<string, ReturnType<typeof extractMediaTool>[number]>();
  options.tracer.emit({ type: "step.started", step: RESEARCH_STEP, attempt: 1 });

  while (state.pendingUrls.length && state.visitedUrls.length < budget.maxPages) {
    if (!canCallTool(state)) break;
    const candidate = selectNextCandidate(state.pendingUrls);
    if (!candidate) break;
    state.pendingUrls = state.pendingUrls.filter((entry) => entry.url !== candidate.url);
    let page: WebsiteFetchedPage;
    try {
      if (candidate.depth === 0 && options.prefetchedRoot) {
        page = options.prefetchedRoot.page;
      } else {
        const remainingBytes = budget.maxTotalBytes - state.downloadedBytes;
        if (remainingBytes <= 0) {
          state.stopReason ||= "byte_budget";
          break;
        }
        page = await callTool(
          state,
          options.tracer,
          "fetch_page",
          { url: candidate.url, depth: candidate.depth },
          () => fetchPageTool({
            url: candidate.url,
            depth: candidate.depth,
            allowedHosts,
            budget: { ...budget, maxPageBytes: Math.min(budget.maxPageBytes, remainingBytes) },
            fetcher: options.fetcher,
          }),
          (output) => ({ url: output.url, contentType: output.contentType, byteLength: output.byteLength }),
        );
      }
    } catch {
      if (candidate.depth === 0) {
        state.stopReason = "fetch_failed";
        throw new WebsiteResearchError("root_fetch_failed", "Website Research Agent could not read the root page.");
      }
      continue;
    }
    if (state.visitedUrls.includes(page.url)) continue;
    if (state.downloadedBytes + page.byteLength > budget.maxTotalBytes) {
      state.stopReason ||= "byte_budget";
      break;
    }
    state.downloadedBytes += page.byteLength;
    state.visitedUrls.push(page.url);

    const candidates = await callTool(
      state,
      options.tracer,
      "list_links",
      { pageUrl: page.url, depth: page.depth },
      () => listLinksTool({ page, allowedHosts, missingFields: state.missingFields, maxDepth: budget.maxDepth }),
      (output) => ({ candidateCount: output.length }),
      { ignoreNavigationTime: true },
    ).catch(() => []);
    addCandidates(state, candidates);

    const inspected = await callTool(
      state,
      options.tracer,
      "inspect_page",
      { pageUrl: page.url, depth: page.depth },
      () => inspectPageTool(page),
      (output) => ({ title: output.title, lineCount: output.text.split(/\r?\n/).length }),
      { ignoreNavigationTime: true },
    );
    const fitted = fitInputBudget(inspected, inspectedPages, budget.maxModelInputCharacters);
    if (!fitted.text && inspectedPages.length) {
      state.stopReason ||= "input_budget";
      break;
    }
    if (fitted.text.length < inspected.text.length) state.stopReason ||= "input_budget";
    inspectedPages.push(fitted);

    const media = await callTool(
      state,
      options.tracer,
      "extract_media",
      { pageUrl: page.url },
      () => extractMediaTool(inspected),
      (output) => ({ mediaCount: output.length }),
      { ignoreNavigationTime: true },
    ).catch(() => []);
    for (const item of media) if (!collectedMedia.has(item.url)) collectedMedia.set(item.url, item);
    state.pages.push({
      url: page.url,
      depth: page.depth,
      title: inspected.title,
      byteLength: page.byteLength,
      lineCount: fitted.text.split(/\r?\n/).length,
      linkCount: candidates.length,
      mediaCount: media.length,
    });
    if (!state.missingFields.length) {
      state.stopReason ||= "sufficient_evidence";
      break;
    }
  }

  if (!inspectedPages.length) throw new WebsiteResearchError("no_pages", "Website Research Agent found no inspectable page.");
  if (!state.stopReason) {
    state.stopReason = state.visitedUrls.length >= budget.maxPages && state.pendingUrls.length
      ? "page_budget"
      : state.pendingUrls.length
        ? "step_budget"
        : "no_candidates";
  }
  const composed = composeWebsiteSource(inspectedPages);
  state.modelInputCharacters = composed.text.length;
  // Finalization is reserved after navigation stops, including when its time budget is exhausted.
  state.steps += 1;
  const submitted = await runTracedTool({
    tracer: options.tracer,
    step: RESEARCH_STEP,
    tool: "submit_profile",
    inputSummary: { pageCount: inspectedPages.length, characterCount: composed.text.length },
    call: () => submitProfileTool({
      pages: inspectedPages,
      media: [...collectedMedia.values()],
      submitter: options.submitter,
    }),
    summarizeOutput: (output) => ({ profileId: output.profile.id, itemCount: output.profile.items.length }),
  });
  state.claims = await collectValidatedClaims(submitted.profile, submitted.ranges, state, options.tracer);
  state.completedAt = new Date().toISOString();
  if (state.stopReason === "no_candidates") state.stopReason = "submitted";
  options.tracer.emit({
    type: "artifact.created",
    step: RESEARCH_STEP,
    name: "website-research-state.json",
    schemaVersion: WEBSITE_RESEARCH_SCHEMA_VERSION,
  });
  options.tracer.emit({ type: "step.completed", step: RESEARCH_STEP });
  return { profile: submitted.profile, state };
}

export function publicWebsiteResearchSnapshot(state: WebsiteResearchState) {
  return {
    schemaVersion: state.schemaVersion,
    rootUrl: state.rootUrl,
    missingFields: state.missingFields,
    visitedUrls: state.visitedUrls,
    pages: state.pages,
    claimCount: state.claims.length,
    steps: state.steps,
    downloadedBytes: state.downloadedBytes,
    modelInputCharacters: state.modelInputCharacters,
    stopReason: state.stopReason,
    startedAt: state.startedAt,
    completedAt: state.completedAt,
  };
}
