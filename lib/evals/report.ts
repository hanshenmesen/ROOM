import type {
  EvalFailureCategory,
  ProfileEvalCaseResult,
  ProfileEvalMetrics,
  ProfileEvalReport,
  ProfileEvalThresholds,
} from "./types.ts";

const RATE_KEYS = [
  "identityAccuracy",
  "itemPrecision",
  "itemRecall",
  "itemF1",
  "fieldAccuracy",
  "skillPrecision",
  "skillRecall",
  "evidenceCoverage",
  "evidenceAccuracy",
  "unsupportedClaimRate",
  "schemaFirstPassRate",
  "repairSuccessRate",
  "endToEndSuccess",
] as const;

const TOTAL_KEYS = ["modelCalls", "latencyMs", "inputTokens", "outputTokens", "estimatedCost"] as const;

function round(value: number) {
  return Math.round(value * 10_000) / 10_000;
}

function average(values: Array<number | null>) {
  const available = values.filter((value): value is number => value !== null);
  return available.length ? round(available.reduce((total, value) => total + value, 0) / available.length) : null;
}

export function summarizeProfileEval(results: ProfileEvalCaseResult[]): ProfileEvalMetrics {
  const summary = {} as ProfileEvalMetrics;
  for (const key of RATE_KEYS) {
    summary[key] = average(results.map((result) => result.metrics[key])) as never;
  }
  for (const key of TOTAL_KEYS) {
    const values = results.map((result) => result.metrics[key]).filter((value): value is number => value !== null);
    summary[key] = (values.length ? round(values.reduce((total, value) => total + value, 0)) : null) as never;
  }
  summary.modelCalls ||= 0;
  summary.latencyMs ||= 0;
  return summary;
}

export function metricsPassThresholds(metrics: ProfileEvalMetrics, thresholds: ProfileEvalThresholds) {
  for (const [key, minimum] of Object.entries(thresholds)) {
    if (key === "unsupportedClaimRateMax" || minimum === undefined) continue;
    const value = metrics[key as keyof ProfileEvalMetrics];
    if (typeof value !== "number" || value < minimum) return false;
  }
  return thresholds.unsupportedClaimRateMax === undefined
    || metrics.unsupportedClaimRate <= thresholds.unsupportedClaimRateMax;
}

export function buildProfileEvalReport(input: {
  dataset: string;
  runner: string;
  generatedAt?: string;
  thresholds: ProfileEvalThresholds;
  results: ProfileEvalCaseResult[];
}): ProfileEvalReport {
  const summary = summarizeProfileEval(input.results);
  const failureCounts: Partial<Record<EvalFailureCategory, number>> = {};
  for (const failure of input.results.flatMap((result) => result.failures)) {
    failureCounts[failure.category] = (failureCounts[failure.category] || 0) + 1;
  }
  return {
    schemaVersion: "profile-eval-report.v1",
    dataset: input.dataset,
    runner: input.runner,
    generatedAt: input.generatedAt || new Date().toISOString(),
    caseCount: input.results.length,
    humanVerifiedCaseCount: input.results.filter((result) => result.reviewStatus === "human-verified").length,
    passed: input.results.length > 0
      && metricsPassThresholds(summary, input.thresholds)
      && !input.results.some((result) => result.failures.some((failure) => (
        failure.category === "forbidden_claim" || failure.category === "pipeline_failure"
      ))),
    thresholds: input.thresholds,
    summary,
    failureCounts,
    cases: input.results,
  };
}

function percent(value: number | null) {
  return value === null ? "N/A" : `${(value * 100).toFixed(1)}%`;
}

export function profileEvalReportMarkdown(report: ProfileEvalReport) {
  const rows = [
    ["Identity Accuracy", percent(report.summary.identityAccuracy)],
    ["Item Precision", percent(report.summary.itemPrecision)],
    ["Item Recall", percent(report.summary.itemRecall)],
    ["Item F1", percent(report.summary.itemF1)],
    ["Field Accuracy", percent(report.summary.fieldAccuracy)],
    ["Evidence Coverage", percent(report.summary.evidenceCoverage)],
    ["Evidence Accuracy", percent(report.summary.evidenceAccuracy)],
    ["Unsupported Claim Rate", percent(report.summary.unsupportedClaimRate)],
    ["End-to-end Success", percent(report.summary.endToEndSuccess)],
    ["Model Calls", String(report.summary.modelCalls)],
    ["Latency", `${report.summary.latencyMs} ms`],
  ];
  const failures = report.cases.flatMap((result) => result.failures.map((failure) => (
    `- \`${result.caseId}\` · **${failure.category}** · ${failure.message}`
  )));
  return [
    `# Profile Eval Report: ${report.dataset}`,
    "",
    `- Status: **${report.passed ? "PASS" : "FAIL"}**`,
    `- Runner: \`${report.runner}\``,
    `- Generated: ${report.generatedAt}`,
    `- Cases: ${report.caseCount} (${report.humanVerifiedCaseCount} human-verified)`,
    "",
    "## Metrics",
    "",
    "| Metric | Value |",
    "| --- | ---: |",
    ...rows.map(([label, value]) => `| ${label} | ${value} |`),
    "",
    "## Failure classification",
    "",
    ...(failures.length ? failures : ["No failures."]),
    "",
    "## Case results",
    "",
    "| Case | Review | Status | Item P/R | Evidence Accuracy | Unsupported |",
    "| --- | --- | --- | ---: | ---: | ---: |",
    ...report.cases.map((result) => (
      `| ${result.caseId} | ${result.reviewStatus} | ${result.passed ? "PASS" : "FAIL"} | `
      + `${percent(result.metrics.itemPrecision)} / ${percent(result.metrics.itemRecall)} | `
      + `${percent(result.metrics.evidenceAccuracy)} | ${percent(result.metrics.unsupportedClaimRate)} |`
    )),
    "",
  ].join("\n");
}

export function compareProfileEvalReports(baseline: ProfileEvalReport, candidate: ProfileEvalReport) {
  const keys = [
    "identityAccuracy",
    "itemPrecision",
    "itemRecall",
    "itemF1",
    "fieldAccuracy",
    "evidenceCoverage",
    "evidenceAccuracy",
    "unsupportedClaimRate",
    "endToEndSuccess",
  ] as const;
  const deltas = Object.fromEntries(keys.map((key) => [
    key,
    round((candidate.summary[key] || 0) - (baseline.summary[key] || 0)),
  ])) as Record<(typeof keys)[number], number>;
  const metricRegressions = keys.filter((key) => (
    key === "unsupportedClaimRate" ? deltas[key] > 0 : deltas[key] < 0
  ));
  const failureRegressions = Object.keys(candidate.failureCounts).filter((category) => (
    (candidate.failureCounts[category as EvalFailureCategory] || 0)
    > (baseline.failureCounts[category as EvalFailureCategory] || 0)
  )).map((category) => `failure:${category}`);
  const regressions = [
    ...metricRegressions,
    ...failureRegressions,
    ...(candidate.caseCount < baseline.caseCount ? ["caseCount"] : []),
  ];
  return {
    schemaVersion: "profile-eval-comparison.v1" as const,
    baseline: { dataset: baseline.dataset, generatedAt: baseline.generatedAt },
    candidate: { dataset: candidate.dataset, generatedAt: candidate.generatedAt },
    deltas,
    regressions,
    passed: regressions.length === 0,
  };
}
