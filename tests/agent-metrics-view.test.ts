import assert from "node:assert/strict";
import test from "node:test";
import { buildAgentMetricsView, type AgentMetricsResponse } from "../lib/agent-runtime/metrics-view.ts";

function metricsResponse(overrides: Partial<AgentMetricsResponse> = {}): AgentMetricsResponse {
  return {
    runs: { total: 8, completed: 7, failed: 1, running: 0, successRate: 0.875 },
    modelCalls: {
      total: 10,
      failed: 1,
      latencyMs: { samples: 10, p50: 320, p95: 1200, max: 2400 },
      inputTokens: 9000,
      outputTokens: 3400,
      measuredUsageCalls: 8,
      estimatedCost: 0.0123,
    },
    toolCalls: { total: 20, failed: 0, latencyMs: { samples: 20, p50: 200, p95: 800 } },
    retries: 2,
    artifacts: 5,
    plannerDecisions: { total: 8, model: 6, deterministic: 1, deterministicFallback: 1, fallbackRate: 0.125 },
    providers: [
      {
        provider: "maas",
        model: "claude-sonnet-5",
        calls: 8,
        failures: 1,
        latencyMs: { samples: 8, p50: 300, p95: 1100 },
        inputTokens: 7000,
        outputTokens: 2400,
        measuredUsageCalls: 7,
        estimatedCost: 0.01,
      },
      {
        provider: "zhizengzeng",
        model: "gpt-5-mini",
        calls: 2,
        failures: 0,
        latencyMs: { samples: 2, p50: 400, p95: 500 },
        inputTokens: 2000,
        outputTokens: 1000,
        measuredUsageCalls: 1,
        estimatedCost: 0.0023,
      },
    ],
    concurrency: { activeLeases: 3, distinctClients: 2, acquiredTotal: 15, rejectedTotal: 1 },
    store: {
      mode: "in-memory",
      windowRuns: 8,
      maxRuns: 100,
      note: "进程内 Trace 窗口的聚合视图。",
    },
    ...overrides,
  };
}

test("agent metrics view formats completion, latency, usage, and concurrency cells", () => {
  const view = buildAgentMetricsView(metricsResponse());

  assert.equal(view.statusLabel, "87.5% 完成率");
  assert.equal(view.statusTone, "warn");
  assert.equal(view.windowLabel, "8/100 RUNS");

  const cells = Object.fromEntries(view.cells.map((cell) => [cell.label, cell]));
  assert.equal(cells["任务完成率"].value, "87.5%");
  assert.equal(cells["任务完成率"].hint, "7/8 完结");
  assert.equal(cells["模型 p50"].value, "320ms");
  assert.equal(cells["模型 p95"].value, "1.2s");
  assert.equal(cells["工具 p95"].value, "800ms");
  assert.equal(cells["实测 Token"].value, "12.4k");
  assert.equal(cells["实测 Token"].hint, "8/10 次返回 usage");
  assert.equal(cells["预估成本"].value, "$0.0123");
  assert.equal(cells["Planner 降级"].value, "12.5%");
  assert.equal(cells["Planner 降级"].hint, "1/8 次决策");
  assert.equal(cells["并发租约"].value, "3 活跃");
  assert.equal(cells["并发租约"].hint, "1 次拒绝");

  assert.equal(view.providers.length, 2);
  assert.equal(view.providers[0].label, "maas/claude-sonnet-5");
  assert.match(view.providers[0].value, /8 次 · p95 1\.1s · 1 失败/);
  assert.equal(view.providers[1].value.includes("失败"), false);
  assert.equal(view.footerNote, "进程内 Trace 窗口的聚合视图。");
});

test("agent metrics view degrades gracefully without finished runs or usage", () => {
  const view = buildAgentMetricsView(metricsResponse({
    runs: { total: 2, completed: 0, failed: 0, running: 2, successRate: undefined },
    modelCalls: {
      total: 0,
      failed: 0,
      latencyMs: { samples: 0 },
      inputTokens: 0,
      outputTokens: 0,
      measuredUsageCalls: 0,
      estimatedCost: 0,
    },
    plannerDecisions: { total: 0, model: 0, deterministic: 0, deterministicFallback: 0, fallbackRate: undefined },
    providers: [],
  }));

  assert.equal(view.statusLabel, "运行中");
  assert.equal(view.statusTone, "muted");
  const cells = Object.fromEntries(view.cells.map((cell) => [cell.label, cell]));
  assert.equal(cells["任务完成率"].value, "—");
  assert.equal(cells["模型 p50"].value, "—");
  assert.equal(cells["实测 Token"].value, "—");
  assert.equal(cells["预估成本"].value, "—");
  assert.equal(cells["Planner 降级"].value, "—");
  assert.deepEqual(view.providers, []);
});

test("agent metrics view marks high completion as good tone", () => {
  const view = buildAgentMetricsView(metricsResponse({
    runs: { total: 10, completed: 10, failed: 0, running: 0, successRate: 1 },
  }));
  assert.equal(view.statusTone, "good");
  assert.equal(view.statusLabel, "100.0% 完成率");
});
