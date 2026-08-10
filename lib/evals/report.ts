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
  const failureLabels: Record<EvalFailureCategory, string> = {
    identity_mismatch: "身份信息不匹配",
    missed_item: "经历条目漏提",
    unexpected_item: "非预期条目",
    field_mismatch: "字段不匹配",
    missing_evidence: "缺少证据",
    invalid_evidence: "证据无效",
    forbidden_claim: "禁止声明",
    pipeline_failure: "Pipeline 失败",
  };
  const rows = [
    ["身份信息准确率", percent(report.summary.identityAccuracy)],
    ["条目精确率", percent(report.summary.itemPrecision)],
    ["条目召回率", percent(report.summary.itemRecall)],
    ["条目 F1", percent(report.summary.itemF1)],
    ["结构化字段准确率", percent(report.summary.fieldAccuracy)],
    ["证据覆盖率", percent(report.summary.evidenceCoverage)],
    ["证据准确率", percent(report.summary.evidenceAccuracy)],
    ["无证据声明率", percent(report.summary.unsupportedClaimRate)],
    ["端到端成功率", percent(report.summary.endToEndSuccess)],
    ["模型调用次数", String(report.summary.modelCalls)],
    ["模型总延迟", `${report.summary.latencyMs} ms`],
    ["Input Token", report.summary.inputTokens === null ? "N/A" : String(report.summary.inputTokens)],
    ["Output Token", report.summary.outputTokens === null ? "N/A" : String(report.summary.outputTokens)],
    ["预估成本", report.summary.estimatedCost === null ? "N/A" : `$${report.summary.estimatedCost.toFixed(6)}`],
  ];
  const failures = report.cases.flatMap((result) => result.failures.map((failure) => (
    `- \`${result.caseId}\` · **${failureLabels[failure.category]}**（\`${failure.category}\`） · ${failure.message}`
  )));
  return [
    `# Profile Agent 评测报告：${report.dataset}`,
    "",
    `- 评测结果：**${report.passed ? "通过" : "未通过"}**`,
    `- 执行器：\`${report.runner}\``,
    `- 生成时间：${report.generatedAt}`,
    `- 用例数：${report.caseCount}（${report.humanVerifiedCaseCount} 个已人工复核）`,
    "",
    "## 总体指标",
    "",
    "| 指标 | 结果 |",
    "| --- | ---: |",
    ...rows.map(([label, value]) => `| ${label} | ${value} |`),
    "",
    "## 失败分类",
    "",
    ...(failures.length ? failures : ["无失败用例。"]),
    "",
    "## 分用例结果",
    "",
    "| 用例 | 复核状态 | 结果 | 条目 P/R | 证据准确率 | 无证据声明 |",
    "| --- | --- | --- | ---: | ---: | ---: |",
    ...report.cases.map((result) => (
      `| ${result.caseId} | ${result.reviewStatus === "human-verified" ? "已人工复核" : "预标注"} | ${result.passed ? "通过" : "未通过"} | `
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
