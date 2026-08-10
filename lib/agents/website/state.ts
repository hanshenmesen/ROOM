import type { ExtractedMedia } from "../../extract-webpage.ts";
import type { ParsedProfile } from "../../types.ts";

export const WEBSITE_RESEARCH_SCHEMA_VERSION = "website-research-state.v2" as const;

export const WEBSITE_RESEARCH_MISSING_FIELDS = [
  "summary",
  "location",
  "contacts",
  "skills",
  "projects",
  "research",
  "experience",
  "education",
  "achievements",
  "media",
] as const;

export type WebsiteResearchMissingField = (typeof WEBSITE_RESEARCH_MISSING_FIELDS)[number];

export type WebsiteResearchBudget = {
  maxPages: number;
  maxDepth: number;
  maxSteps: number;
  maxTotalBytes: number;
  maxPageBytes: number;
  maxDurationMs: number;
  maxModelInputCharacters: number;
};

export type WebsiteResearchCandidate = {
  url: string;
  depth: number;
  discoveredFrom: string;
  score: number;
  reasons: string[];
};

export type WebsiteResearchPageRecord = {
  url: string;
  depth: number;
  title: string;
  byteLength: number;
  lineCount: number;
  linkCount: number;
  mediaCount: number;
};

export type WebsiteClaimEvidence = {
  pageUrl: string;
  locator: string;
  excerpt: string;
};

export type WebsiteResearchClaim = {
  claimId: string;
  field: string;
  value: string;
  evidence: WebsiteClaimEvidence[];
};

export type WebsiteResearchStopReason =
  | "submitted"
  | "sufficient_evidence"
  | "page_budget"
  | "step_budget"
  | "byte_budget"
  | "time_budget"
  | "input_budget"
  | "no_candidates"
  | "planner_submitted"
  | "fetch_failed";

export type WebsiteResearchPlannerSource = "model" | "deterministic" | "deterministic-fallback";

export type WebsiteResearchPlannerDecision = {
  iteration: number;
  action: "continue" | "submit";
  nextUrl?: string;
  reason: string;
  targetFields: WebsiteResearchMissingField[];
  source: WebsiteResearchPlannerSource;
};

export type WebsiteResearchPlannerObservation = {
  iteration: number;
  rootUrl: string;
  missingFields: WebsiteResearchMissingField[];
  visitedPages: Array<{ url: string; title: string; depth: number }>;
  candidates: WebsiteResearchCandidate[];
  budgetRemaining: {
    pages: number;
    steps: number;
    bytes: number;
  };
};

export type WebsiteResearchState = {
  schemaVersion: typeof WEBSITE_RESEARCH_SCHEMA_VERSION;
  rootUrl: string;
  allowedHosts: string[];
  missingFields: WebsiteResearchMissingField[];
  visitedUrls: string[];
  pendingUrls: WebsiteResearchCandidate[];
  pages: WebsiteResearchPageRecord[];
  claims: WebsiteResearchClaim[];
  plannerMode: "model" | "deterministic" | "mixed";
  plannerDecisions: WebsiteResearchPlannerDecision[];
  steps: number;
  downloadedBytes: number;
  modelInputCharacters: number;
  budget: WebsiteResearchBudget;
  startedAt: string;
  completedAt?: string;
  stopReason?: WebsiteResearchStopReason;
};

export type WebsiteFetchedPage = {
  url: string;
  contentType: string;
  html: string;
  byteLength: number;
  depth: number;
};

export type WebsiteInspectedPage = {
  url: string;
  depth: number;
  title: string;
  text: string;
  media: ExtractedMedia[];
};

export type WebsiteSourceRange = {
  pageUrl: string;
  startLine: number;
  endLine: number;
  searchableText: string;
};

export type WebsiteResearchResult = {
  profile: ParsedProfile;
  state: WebsiteResearchState;
};

export class WebsiteResearchError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "WebsiteResearchError";
    this.code = code;
  }
}
