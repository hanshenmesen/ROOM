import type { AgentRunEvent, AgentRunSnapshot } from "./run-types.ts";

/**
 * Cross-run Trace aggregation.
 *
 * Single-run inspection (`trace-inspector.ts`) answers "what happened in this
 * run"; aggregation answers "how the Agent fleet behaves across runs": task
 * completion rate, model/tool latency percentiles, measured Token usage, and
 * estimated cost, broken down per provider/model.
 *
 * Honesty boundaries kept deliberately:
 * - Token totals only accumulate calls where the Provider returned usage;
 *   `measuredUsageCalls` exposes how many calls that covers.
 * - `estimatedCost` stays labelled as an estimate.
 * - `successRate` only counts finished runs (running runs are excluded).
 * - The window is the in-memory store's bounded run set, not all-time data.
 */

export type LatencyPercentiles = {
  samples: number;
  p50?: number;
  p95?: number;
  max?: number;
};

export type ProviderModelMetrics = {
  provider: string;
  model: string;
  calls: number;
  failures: number;
  latencyMs: LatencyPercentiles;
  inputTokens: number;
  outputTokens: number;
  measuredUsageCalls: number;
  estimatedCost: number;
};

export type TraceAggregateMetrics = {
  runs: {
    total: number;
    completed: number;
    failed: number;
    running: number;
    successRate?: number;
  };
  modelCalls: {
    total: number;
    failed: number;
    latencyMs: LatencyPercentiles;
    inputTokens: number;
    outputTokens: number;
    measuredUsageCalls: number;
    estimatedCost: number;
  };
  toolCalls: {
    total: number;
    failed: number;
    latencyMs: LatencyPercentiles;
  };
  retries: number;
  artifacts: number;
  plannerDecisions: {
    total: number;
    model: number;
    deterministic: number;
    deterministicFallback: number;
    fallbackRate?: number;
  };
  providers: ProviderModelMetrics[];
};

/** Nearest-rank percentile. Returns `undefined` for empty samples. */
export function percentile(values: number[], p: number): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.min(Math.max(Math.ceil((p / 100) * sorted.length), 1), sorted.length);
  return sorted[rank - 1];
}

function latencyPercentiles(latencies: number[]): LatencyPercentiles {
  return {
    samples: latencies.length,
    p50: percentile(latencies, 50),
    p95: percentile(latencies, 95),
    max: latencies.length ? Math.max(...latencies) : undefined,
  };
}

function round6(value: number) {
  return Number(value.toFixed(6));
}

export function aggregateTraceMetrics(snapshots: AgentRunSnapshot[]): TraceAggregateMetrics {
  const events = snapshots.flatMap((snapshot) => snapshot.events);

  const completedRuns = snapshots.filter((snapshot) => snapshot.status === "completed").length;
  const failedRuns = snapshots.filter((snapshot) => snapshot.status === "failed").length;
  const runningRuns = snapshots.length - completedRuns - failedRuns;
  const finishedRuns = completedRuns + failedRuns;

  const modelEvents = events.filter((event) => event.type === "model.completed" || event.type === "model.failed");
  const failedModelEvents = modelEvents.filter((event) => event.type === "model.failed");
  const toolEvents = events.filter((event) => event.type === "tool.completed" || event.type === "tool.failed");
  const failedToolEvents = toolEvents.filter((event) => event.type === "tool.failed");
  const plannerEvents = events.filter((event) => event.type === "planner.decision");

  const measuredUsage = modelEvents.filter((event) => event.meta.inputTokens !== undefined || event.meta.outputTokens !== undefined);

  const providersByKey = new Map<string, ProviderModelMetrics & { latencies: number[] }>();
  for (const event of modelEvents) {
    const key = `${event.meta.provider}/${event.meta.model}`;
    let bucket = providersByKey.get(key);
    if (!bucket) {
      bucket = {
        provider: event.meta.provider,
        model: event.meta.model,
        calls: 0,
        failures: 0,
        latencyMs: { samples: 0 },
        latencies: [],
        inputTokens: 0,
        outputTokens: 0,
        measuredUsageCalls: 0,
        estimatedCost: 0,
      };
      providersByKey.set(key, bucket);
    }
    bucket.calls += 1;
    if (event.type === "model.failed") bucket.failures += 1;
    bucket.latencies.push(event.meta.latencyMs);
    if (event.meta.inputTokens !== undefined || event.meta.outputTokens !== undefined) bucket.measuredUsageCalls += 1;
    bucket.inputTokens += event.meta.inputTokens ?? 0;
    bucket.outputTokens += event.meta.outputTokens ?? 0;
    bucket.estimatedCost += event.meta.estimatedCost ?? 0;
  }

  const providers = [...providersByKey.values()]
    .map(({ latencies, ...bucket }) => ({
      ...bucket,
      latencyMs: latencyPercentiles(latencies),
      estimatedCost: round6(bucket.estimatedCost),
    }))
    .sort((a, b) => b.calls - a.calls || `${a.provider}/${a.model}`.localeCompare(`${b.provider}/${b.model}`));

  const deterministicFallback = plannerEvents.filter((event) => event.source === "deterministic-fallback").length;

  return {
    runs: {
      total: snapshots.length,
      completed: completedRuns,
      failed: failedRuns,
      running: runningRuns,
      successRate: finishedRuns > 0 ? round6(completedRuns / finishedRuns) : undefined,
    },
    modelCalls: {
      total: modelEvents.length,
      failed: failedModelEvents.length,
      latencyMs: latencyPercentiles(modelEvents.map((event) => event.meta.latencyMs)),
      inputTokens: modelEvents.reduce((total, event) => total + (event.meta.inputTokens ?? 0), 0),
      outputTokens: modelEvents.reduce((total, event) => total + (event.meta.outputTokens ?? 0), 0),
      measuredUsageCalls: measuredUsage.length,
      estimatedCost: round6(modelEvents.reduce((total, event) => total + (event.meta.estimatedCost ?? 0), 0)),
    },
    toolCalls: {
      total: toolEvents.length,
      failed: failedToolEvents.length,
      latencyMs: latencyPercentiles(toolEvents.map((event) => event.meta.latencyMs)),
    },
    retries: events.filter((event) => event.type === "step.retried").length,
    artifacts: events.filter((event) => event.type === "artifact.created").length,
    plannerDecisions: {
      total: plannerEvents.length,
      model: plannerEvents.filter((event) => event.source === "model").length,
      deterministic: plannerEvents.filter((event) => event.source === "deterministic").length,
      deterministicFallback,
      fallbackRate: plannerEvents.length > 0 ? round6(deterministicFallback / plannerEvents.length) : undefined,
    },
    providers,
  };
}

/** Serializes a run's redacted events as newline-delimited JSON for offline analysis. */
export function traceEventsToJsonl(events: AgentRunEvent[]): string {
  return events.map((event) => JSON.stringify(event)).join("\n") + (events.length ? "\n" : "");
}
