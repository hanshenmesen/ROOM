import type { AgentRunEvent } from "../agent-runtime/run-types.ts";
import type { ContentFamily, ParsedProfile, PipelineResult, SectionKind } from "../types.ts";

export type EvalReviewStatus = "prelabeled" | "human-verified";

export type ExpectedText = string | {
  value: string;
  aliases?: string[];
};

export type GoldProfileItem = {
  id: string;
  kind: Exclude<SectionKind, "summary">;
  canonicalTitle: string;
  aliases?: string[];
  contentFamily?: ContentFamily;
  timeRange?: ExpectedText;
  role?: ExpectedText;
  techStack?: string[];
  projectUrl?: ExpectedText;
  expectedEvidence?: string[];
};

export type GoldProfileCase = {
  schemaVersion: "profile-eval-case.v1";
  id: string;
  dataset: string;
  reviewStatus: EvalReviewStatus;
  tags: string[];
  source: {
    type: "text";
    path: string;
    label: string;
  };
  expected: {
    identity: {
      name: ExpectedText;
      headline?: ExpectedText;
      location?: ExpectedText;
      personalWebsite?: ExpectedText;
    };
    items: GoldProfileItem[];
    skills?: string[];
    forbiddenClaims?: string[];
  };
};

export type EvalFailureCategory =
  | "identity_mismatch"
  | "missed_item"
  | "unexpected_item"
  | "field_mismatch"
  | "missing_evidence"
  | "invalid_evidence"
  | "forbidden_claim"
  | "pipeline_failure";

export type EvalFailure = {
  category: EvalFailureCategory;
  path: string;
  message: string;
  expected?: unknown;
  actual?: unknown;
};

export type ProfileEvalMetrics = {
  identityAccuracy: number;
  itemPrecision: number;
  itemRecall: number;
  itemF1: number;
  fieldAccuracy: number;
  skillPrecision: number;
  skillRecall: number;
  evidenceCoverage: number;
  evidenceAccuracy: number;
  unsupportedClaimRate: number;
  schemaFirstPassRate: number | null;
  repairSuccessRate: number | null;
  endToEndSuccess: number;
  modelCalls: number;
  latencyMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  estimatedCost: number | null;
};

export type ProfileEvalCaseResult = {
  caseId: string;
  reviewStatus: EvalReviewStatus;
  passed: boolean;
  metrics: ProfileEvalMetrics;
  failures: EvalFailure[];
  matchedItems: Array<{
    goldItemId: string;
    candidateItemId: string;
    score: number;
  }>;
};

export type ProfileEvalThresholds = Partial<Record<
  | "identityAccuracy"
  | "itemPrecision"
  | "itemRecall"
  | "itemF1"
  | "fieldAccuracy"
  | "evidenceCoverage"
  | "evidenceAccuracy"
  | "endToEndSuccess",
  number
>> & {
  unsupportedClaimRateMax?: number;
};

export type ProfileEvalReport = {
  schemaVersion: "profile-eval-report.v1";
  dataset: string;
  runner: string;
  generatedAt: string;
  caseCount: number;
  humanVerifiedCaseCount: number;
  passed: boolean;
  thresholds: ProfileEvalThresholds;
  summary: ProfileEvalMetrics;
  failureCounts: Partial<Record<EvalFailureCategory, number>>;
  cases: ProfileEvalCaseResult[];
};

export type ProfileEvalInput = {
  gold: GoldProfileCase;
  sourceText: string;
  profile: ParsedProfile;
  pipeline?: Pick<PipelineResult, "report">;
  events?: AgentRunEvent[];
};
