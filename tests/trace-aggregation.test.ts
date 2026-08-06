import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";
import {
  clearConcurrencyLeasesForTests,
  concurrencyLeaseMetrics,
  tryAcquireConcurrencyLease,
} from "../lib/agent-runtime/concurrency-limiter.ts";
import { inMemoryTraceStore } from "../lib/agent-runtime/in-memory-trace-store.ts";
import {
  aggregateTraceMetrics,
  percentile,
  traceEventsToJsonl,
} from "../lib/agent-runtime/trace-aggregation.ts";
import type { AgentRunEvent, AgentRunSnapshot } from "../lib/agent-runtime/run-types.ts";

const routeAliases: Record<string, string> = {
  "@/lib/agent-runtime/concurrency-limiter": new URL("../lib/agent-runtime/concurrency-limiter.ts", import.meta.url).href,
  "@/lib/agent-runtime/in-memory-trace-store": new URL("../lib/agent-runtime/in-memory-trace-store.ts", import.meta.url).href,
  "@/lib/agent-runtime/trace-aggregation": new URL("../lib/agent-runtime/trace-aggregation.ts", import.meta.url).href,
};

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/server") return nextResolve("next/server.js", context);
    if (routeAliases[specifier]) return { url: routeAliases[specifier], shortCircuit: true };
    return nextResolve(specifier, context);
  },
});

const metricsRoute = await import(new URL("../app/api/agent-runs/metrics/route.ts", import.meta.url).href);
const metricsResetRoute = await import(new URL("../app/api/agent-runs/metrics/reset/route.ts", import.meta.url).href);
const eventsRoute = await import(new URL("../app/api/agent-runs/[runId]/events/route.ts", import.meta.url).href);

let sequence = 0;

function event<K extends AgentRunEvent["type"]>(
  runId: string,
  type: K,
  extra: Record<string, unknown> = {},
): AgentRunEvent {
  sequence += 1;
  return {
    eventId: `event-${sequence}`,
    occurredAt: new Date(Date.UTC(2026, 7, 5, 0, 0, sequence)).toISOString(),
    runId,
    type,
    ...extra,
  } as AgentRunEvent;
}

function modelMeta(overrides: Record<string, unknown> = {}) {
  return {
    callId: `call-${sequence}`,
    agent: "profile",
    provider: "maas",
    model: "claude-sonnet-5",
    mode: "tool" as const,
    promptVersion: "profile.v3",
    startedAt: new Date().toISOString(),
    latencyMs: 100,
    attempt: 1,
    fallbackCount: 0,
    ...overrides,
  };
}

test.beforeEach(() => {
  inMemoryTraceStore.clear();
  clearConcurrencyLeasesForTests();
});

test("percentile uses nearest-rank semantics and handles edge cases", () => {
  assert.equal(percentile([], 50), undefined);
  assert.equal(percentile([42], 50), 42);
  assert.equal(percentile([42], 95), 42);
  assert.equal(percentile([10, 20, 30, 40], 50), 20);
  assert.equal(percentile([40, 10, 30, 20], 50), 20);
  assert.equal(percentile([10, 20, 30, 40], 95), 40);
  assert.equal(percentile(Array.from({ length: 100 }, (_, i) => i + 1), 95), 95);
  assert.equal(percentile(Array.from({ length: 20 }, (_, i) => (i + 1) * 5), 50), 50);
});

test("aggregateTraceMetrics computes completion, latency, usage, and planner rates", () => {
  const snapshots: AgentRunSnapshot[] = [
    {
      runId: "run-complete",
      status: "completed",
      events: [
        event("run-complete", "run.started"),
        event("run-complete", "model.completed", {
          step: "profile",
          meta: modelMeta({ latencyMs: 120, inputTokens: 1000, outputTokens: 200, estimatedCost: 0.01 }),
        }),
        event("run-complete", "model.completed", {
          step: "profile",
          meta: modelMeta({ latencyMs: 80, provider: "zhizengzeng", model: "gpt-5-mini" }),
        }),
        event("run-complete", "tool.completed", {
          step: "website",
          meta: { toolCallId: "tool-1", tool: "fetch_page", startedAt: new Date().toISOString(), latencyMs: 300, inputSummary: {} },
        }),
        event("run-complete", "planner.decision", { step: "website", action: "continue", reason: "缺项目", source: "model" }),
        event("run-complete", "planner.decision", { step: "website", action: "submit", reason: "证据充分", source: "deterministic-fallback" }),
        event("run-complete", "artifact.created", { step: "profile", name: "profile", schemaVersion: "profile.v1" }),
        event("run-complete", "run.completed"),
      ],
    },
    {
      runId: "run-failed",
      status: "failed",
      events: [
        event("run-failed", "run.started"),
        event("run-failed", "model.failed", {
          step: "profile",
          meta: modelMeta({ latencyMs: 500, inputTokens: 500, outputTokens: 0, estimatedCost: 0.002 }),
          errorCode: "provider_timeout",
        }),
        event("run-failed", "step.retried", { step: "profile", attempt: 2, reason: "provider_timeout" }),
        event("run-failed", "run.failed", { errorCode: "provider_timeout" }),
      ],
    },
    {
      runId: "run-running",
      status: "running",
      events: [event("run-running", "run.started")],
    },
  ];

  const metrics = aggregateTraceMetrics(snapshots);

  assert.equal(metrics.runs.total, 3);
  assert.equal(metrics.runs.completed, 1);
  assert.equal(metrics.runs.failed, 1);
  assert.equal(metrics.runs.running, 1);
  assert.equal(metrics.runs.successRate, 0.5);

  assert.equal(metrics.modelCalls.total, 3);
  assert.equal(metrics.modelCalls.failed, 1);
  assert.equal(metrics.modelCalls.latencyMs.samples, 3);
  assert.equal(metrics.modelCalls.latencyMs.p50, 120);
  assert.equal(metrics.modelCalls.latencyMs.p95, 500);
  assert.equal(metrics.modelCalls.latencyMs.max, 500);
  assert.equal(metrics.modelCalls.inputTokens, 1500);
  assert.equal(metrics.modelCalls.outputTokens, 200);
  assert.equal(metrics.modelCalls.measuredUsageCalls, 2);
  assert.equal(metrics.modelCalls.estimatedCost, 0.012);

  assert.equal(metrics.toolCalls.total, 1);
  assert.equal(metrics.toolCalls.failed, 0);
  assert.equal(metrics.toolCalls.latencyMs.p50, 300);

  assert.equal(metrics.retries, 1);
  assert.equal(metrics.artifacts, 1);

  assert.equal(metrics.plannerDecisions.total, 2);
  assert.equal(metrics.plannerDecisions.model, 1);
  assert.equal(metrics.plannerDecisions.deterministicFallback, 1);
  assert.equal(metrics.plannerDecisions.fallbackRate, 0.5);

  assert.equal(metrics.providers.length, 2);
  assert.equal(metrics.providers[0].provider, "maas");
  assert.equal(metrics.providers[0].calls, 2);
  assert.equal(metrics.providers[0].failures, 1);
  assert.equal(metrics.providers[0].latencyMs.p50, 120);
  assert.equal(metrics.providers[0].measuredUsageCalls, 2);
  assert.equal(metrics.providers[1].provider, "zhizengzeng");
  assert.equal(metrics.providers[1].measuredUsageCalls, 0);
});

test("aggregateTraceMetrics keeps empty and running-only windows honest", () => {
  const empty = aggregateTraceMetrics([]);
  assert.equal(empty.runs.total, 0);
  assert.equal(empty.runs.successRate, undefined);
  assert.equal(empty.modelCalls.latencyMs.p50, undefined);
  assert.equal(empty.plannerDecisions.fallbackRate, undefined);
  assert.deepEqual(empty.providers, []);

  const runningOnly = aggregateTraceMetrics([
    { runId: "run-1", status: "running", events: [event("run-1", "run.started")] },
  ]);
  assert.equal(runningOnly.runs.successRate, undefined);
  assert.equal(runningOnly.runs.running, 1);
});

test("traceEventsToJsonl emits one JSON document per line in order", () => {
  const events = [
    event("run-jsonl", "run.started"),
    event("run-jsonl", "run.completed"),
  ];
  const jsonl = traceEventsToJsonl(events);
  const lines = jsonl.trim().split("\n");
  assert.equal(lines.length, 2);
  assert.deepEqual(lines.map((line) => JSON.parse(line)), JSON.parse(JSON.stringify(events)));
  assert.equal(traceEventsToJsonl([]), "");
});

test("metrics route aggregates the bounded in-memory window", async () => {
  inMemoryTraceStore.append(event("route-run-1", "run.started"));
  inMemoryTraceStore.append(event("route-run-1", "model.completed", {
    step: "profile",
    meta: modelMeta({ latencyMs: 200, inputTokens: 10, outputTokens: 5 }),
  }));
  inMemoryTraceStore.append(event("route-run-1", "run.completed"));
  inMemoryTraceStore.append(event("route-run-2", "run.started"));

  const response = await metricsRoute.GET();
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.runs.total, 2);
  assert.equal(body.runs.completed, 1);
  assert.equal(body.runs.successRate, 1);
  assert.equal(body.modelCalls.total, 1);
  assert.equal(body.modelCalls.latencyMs.mean, 200);
  assert.equal(body.modelCalls.latencyMs.p50, 200);
  assert.equal(body.modelCalls.measuredUsageCalls, 1);
  assert.equal(body.store.mode, "in-memory");
  assert.equal(body.store.maxRuns, 100);

  const serialized = JSON.stringify(body);
  assert.doesNotMatch(serialized, /authorization|api[-_]?key|cookie/i);
});

test("metrics reset route clears the in-memory window", async () => {
  inMemoryTraceStore.append(event("reset-run-1", "run.started"));
  inMemoryTraceStore.append(event("reset-run-1", "run.completed"));

  const before = await (await metricsRoute.GET()).json();
  assert.equal(before.runs.total, 1);

  const response = await metricsResetRoute.POST();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, windowRuns: 0 });

  const after = await (await metricsRoute.GET()).json();
  assert.equal(after.runs.total, 0);
});

test("metrics route exposes aggregate concurrency counters without client keys", async () => {
  const releaseFirst = tryAcquireConcurrencyLease("parse:test-client-a", 2);
  assert.ok(releaseFirst);
  assert.ok(tryAcquireConcurrencyLease("parse:test-client-a", 2));
  assert.equal(tryAcquireConcurrencyLease("parse:test-client-a", 2), undefined);
  assert.ok(tryAcquireConcurrencyLease("parse:test-client-b", 2));

  const response = await metricsRoute.GET();
  const body = await response.json();
  assert.equal(body.concurrency.activeLeases, 3);
  assert.equal(body.concurrency.distinctClients, 2);
  assert.equal(body.concurrency.acquiredTotal, 3);
  assert.equal(body.concurrency.rejectedTotal, 1);
  assert.doesNotMatch(JSON.stringify(body.concurrency), /test-client/);

  releaseFirst!();
  const afterRelease = concurrencyLeaseMetrics();
  assert.equal(afterRelease.activeLeases, 2);
});

test("events route exports JSONL and rejects unsupported formats", async () => {
  inMemoryTraceStore.append(event("export-run-1", "run.started"));
  inMemoryTraceStore.append(event("export-run-1", "run.completed"));

  const context = { params: Promise.resolve({ runId: "export-run-1" }) };
  const jsonlResponse = await eventsRoute.GET(new Request("https://room.test/api/agent-runs/export-run-1/events?format=jsonl"), context);
  assert.equal(jsonlResponse.status, 200);
  assert.match(jsonlResponse.headers.get("content-type") || "", /application\/x-ndjson/);
  const lines = (await jsonlResponse.text()).trim().split("\n");
  assert.equal(lines.length, 2);
  assert.equal(JSON.parse(lines[0]).type, "run.started");
  assert.equal(JSON.parse(lines[1]).type, "run.completed");

  const jsonResponse = await eventsRoute.GET(new Request("https://room.test/api/agent-runs/export-run-1/events"), context);
  assert.equal(jsonResponse.status, 200);
  const snapshot = await jsonResponse.json();
  assert.equal(snapshot.runId, "export-run-1");
  assert.equal(snapshot.events.length, 2);

  const badFormat = await eventsRoute.GET(new Request("https://room.test/api/agent-runs/export-run-1/events?format=xml"), context);
  assert.equal(badFormat.status, 400);

  const missing = await eventsRoute.GET(new Request("https://room.test/api/agent-runs/export-run-2/events?format=jsonl"), {
    params: Promise.resolve({ runId: "export-run-2" }),
  });
  assert.equal(missing.status, 404);
});

test("trace store list returns bounded snapshots newest first", () => {
  for (let index = 0; index < 105; index += 1) {
    const runId = `bounded-run-${String(index).padStart(3, "0")}`;
    inMemoryTraceStore.append(event(runId, "run.started"));
  }
  const snapshots = inMemoryTraceStore.list();
  assert.equal(snapshots.length, 100);
  assert.equal(snapshots[0].runId, "bounded-run-104");
  assert.ok(!snapshots.some((snapshot) => snapshot.runId === "bounded-run-000"));
});
