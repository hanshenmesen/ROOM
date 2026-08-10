import assert from "node:assert/strict";
import test from "node:test";
import { summarizeCaseCostDistribution } from "../lib/evals/cost-metrics.ts";
import type { ProfileEvalCaseResult, ProfileEvalMetrics } from "../lib/evals/types.ts";

function caseResult(caseId: string, overrides: Partial<ProfileEvalMetrics>): ProfileEvalCaseResult {
  return {
    caseId,
    reviewStatus: "prelabeled",
    passed: true,
    metrics: {
      identityAccuracy: 1,
      itemPrecision: 1,
      itemRecall: 1,
      itemF1: 1,
      fieldAccuracy: 1,
      skillPrecision: 1,
      skillRecall: 1,
      evidenceCoverage: 1,
      evidenceAccuracy: 1,
      unsupportedClaimRate: 0,
      schemaFirstPassRate: 1,
      repairSuccessRate: null,
      endToEndSuccess: 1,
      modelCalls: 2,
      latencyMs: 100,
      inputTokens: null,
      outputTokens: null,
      estimatedCost: null,
      ...overrides,
    },
    failures: [],
    matchedItems: [],
  };
}

test("case cost distribution computes per-case percentiles and totals", () => {
  const results = [
    caseResult("case-1", { latencyMs: 100, modelCalls: 1, inputTokens: 500, outputTokens: 100, estimatedCost: 0.001 }),
    caseResult("case-2", { latencyMs: 200, modelCalls: 2, inputTokens: 1500, outputTokens: 300, estimatedCost: 0.003 }),
    caseResult("case-3", { latencyMs: 900, modelCalls: 5, inputTokens: 3000, outputTokens: 600, estimatedCost: 0.02 }),
    caseResult("case-4", { latencyMs: 400, modelCalls: 3 }),
  ];

  const distribution = summarizeCaseCostDistribution(results);
  assert.equal(distribution.caseCount, 4);

  assert.deepEqual(distribution.perCaseLatencyMs, {
    samples: 4,
    p50: 200,
    p95: 900,
    max: 900,
    total: 1600,
  });
  assert.equal(distribution.perCaseModelCalls.p50, 2);
  assert.equal(distribution.perCaseModelCalls.p95, 5);
  assert.equal(distribution.perCaseModelCalls.total, 11);

  // Token and cost percentiles only cover the three cases with measured usage.
  assert.equal(distribution.perCaseInputTokens.measuredCases, 3);
  assert.equal(distribution.perCaseInputTokens.samples, 3);
  assert.equal(distribution.perCaseInputTokens.p50, 1500);
  assert.equal(distribution.perCaseInputTokens.p95, 3000);
  assert.equal(distribution.perCaseInputTokens.total, 5000);

  assert.equal(distribution.perCaseOutputTokens.measuredCases, 3);
  assert.equal(distribution.perCaseEstimatedCost.measuredCases, 3);
  assert.equal(distribution.perCaseEstimatedCost.p95, 0.02);
  assert.equal(distribution.perCaseEstimatedCost.total, 0.024);
});

test("case cost distribution stays honest when no usage was returned", () => {
  const distribution = summarizeCaseCostDistribution([
    caseResult("case-1", { latencyMs: 50 }),
    caseResult("case-2", { latencyMs: 150 }),
  ]);
  // Nearest-rank p50 over two samples is the smaller one.
  assert.equal(distribution.perCaseLatencyMs.p50, 50);
  assert.equal(distribution.perCaseInputTokens.measuredCases, 0);
  assert.equal(distribution.perCaseInputTokens.samples, 0);
  assert.equal(distribution.perCaseInputTokens.p50, undefined);
  assert.equal(distribution.perCaseInputTokens.total, 0);
  assert.equal(distribution.perCaseEstimatedCost.measuredCases, 0);

  const empty = summarizeCaseCostDistribution([]);
  assert.equal(empty.caseCount, 0);
  assert.equal(empty.perCaseLatencyMs.p50, undefined);
  assert.equal(empty.perCaseModelCalls.total, 0);
});
