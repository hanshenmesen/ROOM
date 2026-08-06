import { percentile } from "../agent-runtime/trace-aggregation.ts";
import type { AgentRunEvent } from "../agent-runtime/run-types.ts";
import type { ProfileEvalCaseResult } from "./types.ts";

export function agentCostMetrics(events: AgentRunEvent[] = []) {
  const calls = events.filter((event) => event.type === "model.completed" || event.type === "model.failed");
  const completed = calls.filter((event) => event.type === "model.completed");
  const inputTokens = calls.map((event) => event.meta.inputTokens).filter((value): value is number => value !== undefined);
  const outputTokens = calls.map((event) => event.meta.outputTokens).filter((value): value is number => value !== undefined);
  const costs = calls.map((event) => event.meta.estimatedCost).filter((value): value is number => value !== undefined);
  const retries = events.filter((event) => event.type === "step.retried");
  const repaired = completed.some((event) => event.meta.attempt > 1);
  return {
    schemaFirstPassRate: completed.length ? retries.length ? 0 : 1 : null,
    repairSuccessRate: retries.length ? repaired ? 1 : 0 : null,
    modelCalls: calls.length,
    latencyMs: calls.reduce((total, event) => total + event.meta.latencyMs, 0),
    inputTokens: inputTokens.length ? inputTokens.reduce((total, value) => total + value, 0) : null,
    outputTokens: outputTokens.length ? outputTokens.reduce((total, value) => total + value, 0) : null,
    estimatedCost: costs.length ? costs.reduce((total, value) => total + value, 0) : null,
  };
}

export type CaseMetricDistribution = {
  samples: number;
  p50?: number;
  p95?: number;
  max?: number;
  total: number;
};

export type MeasuredCaseDistribution = CaseMetricDistribution & {
  /** Cases where the Provider returned usage; percentiles only cover those. */
  measuredCases: number;
};

export type CaseCostDistribution = {
  caseCount: number;
  perCaseLatencyMs: CaseMetricDistribution;
  perCaseModelCalls: CaseMetricDistribution;
  perCaseInputTokens: MeasuredCaseDistribution;
  perCaseOutputTokens: MeasuredCaseDistribution;
  perCaseEstimatedCost: MeasuredCaseDistribution;
};

function distribution(values: number[]): CaseMetricDistribution {
  return {
    samples: values.length,
    p50: percentile(values, 50),
    p95: percentile(values, 95),
    max: values.length ? Math.max(...values) : undefined,
    total: values.reduce((total, value) => total + value, 0),
  };
}

function measuredDistribution(results: ProfileEvalCaseResult[], pick: (result: ProfileEvalCaseResult) => number | null): MeasuredCaseDistribution {
  const values = results.flatMap((result) => {
    const value = pick(result);
    return value === null ? [] : [value];
  });
  return {
    ...distribution(values),
    measuredCases: values.length,
  };
}

/**
 * Per-case cost/latency distribution across an Eval report. Aggregate totals
 * hide tail behaviour; percentiles over per-case values answer "what does a
 * typical case cost, and how bad is the tail" — the numbers needed before
 * tightening production budgets. Token and cost percentiles only cover cases
 * where the Provider returned usage (`measuredCases`).
 */
export function summarizeCaseCostDistribution(results: ProfileEvalCaseResult[]): CaseCostDistribution {
  return {
    caseCount: results.length,
    perCaseLatencyMs: distribution(results.map((result) => result.metrics.latencyMs)),
    perCaseModelCalls: distribution(results.map((result) => result.metrics.modelCalls)),
    perCaseInputTokens: measuredDistribution(results, (result) => result.metrics.inputTokens),
    perCaseOutputTokens: measuredDistribution(results, (result) => result.metrics.outputTokens),
    perCaseEstimatedCost: measuredDistribution(results, (result) => result.metrics.estimatedCost),
  };
}
