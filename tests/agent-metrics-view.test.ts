import assert from "node:assert/strict";
import test from "node:test";
import { buildAgentMetricsView, type AgentMetricsResponse } from "../lib/agent-runtime/metrics-view.ts";

function metricsResponse(overrides: Partial<AgentMetricsResponse> = {}): AgentMetricsResponse {
  return {
    runs: { total: 8, completed: 7, failed: 1, running: 0, successRate: 0.875 },
    modelCalls: {
      total: 10,
      failed: 1,
      latencyMs: { samples: 10, mean: 640, p50: 320, p95: 1200, max: 2400 },
      inputTokens: 9600,
      outputTokens: 3200,
      measuredUsageCalls: 8,
      estimatedCost: 0.0123,
    },
    toolCalls: { total: 20, failed: 0, latencyMs: { samples: 20, mean: 300, p50: 200, p95: 800 } },
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

test("agent metrics view reports run counts and averages without any completion-rate judgement", () => {
  const view = buildAgentMetricsView(metricsResponse());

  assert.equal(view.statusLabel, "8 轮");
  assert.equal(view.statusTone, "muted");
  assert.equal(view.windowLabel, "8/100 RUNS");
  assert.doesNotMatch(JSON.stringify(view), /完成率/);

  const cells = Object.fromEntries(view.cells.map((cell) => [cell.label, cell]));
  assert.equal(cells["运行轮数"].value, "8");
  assert.equal(cells["运行轮数"].hint, "7 完成 · 1 失败");
  assert.equal(cells["模型平均耗时"].value, "640ms");
  assert.equal(cells["模型平均耗时"].hint, "10 次调用");
  assert.equal(cells["工具平均耗时"].value, "300ms");
  assert.equal(cells["工具平均耗时"].hint, "20 次调用");
  // (9600 + 3200) measured tokens / 8 finished runs.
  assert.equal(cells["平均 Token/轮"].value, "1.6k");
  assert.equal(cells["平均 Token/轮"].hint, "按 8 个完结 Run");
  assert.equal(cells["实测 Token"].value, "12.8k");
  assert.equal(cells["实测 Token"].hint, "8/10 次返回 usage");
  assert.equal(cells["预估成本"].value, "$0.0123");
  assert.equal(cells["Planner 降级"].value, "12.5%");
  assert.equal(cells["并发租约"].value, "3 活跃");

  assert.equal(view.providers.length, 2);
  assert.equal(view.providers[0].label, "maas/claude-sonnet-5");
  assert.match(view.providers[0].value, /8 次 · p95 1\.1s · 1 失败/);
  assert.equal(view.footerNote, "进程内 Trace 窗口的聚合视图。");
});

test("agent metrics view surfaces in-progress runs in the headline", () => {
  const view = buildAgentMetricsView(metricsResponse({
    runs: { total: 10, completed: 7, failed: 1, running: 2, successRate: 0.875 },
  }));
  assert.equal(view.statusLabel, "10 轮 · 2 运行中");
  const cells = Object.fromEntries(view.cells.map((cell) => [cell.label, cell]));
  assert.equal(cells["运行轮数"].hint, "7 完成 · 1 失败 · 2 运行中");
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
    toolCalls: { total: 0, failed: 0, latencyMs: { samples: 0 } },
    plannerDecisions: { total: 0, model: 0, deterministic: 0, deterministicFallback: 0, fallbackRate: undefined },
    providers: [],
  }));

  assert.equal(view.statusLabel, "2 轮 · 2 运行中");
  assert.equal(view.statusTone, "muted");
  const cells = Object.fromEntries(view.cells.map((cell) => [cell.label, cell]));
  assert.equal(cells["运行轮数"].value, "2");
  assert.equal(cells["模型平均耗时"].value, "—");
  assert.equal(cells["工具平均耗时"].value, "—");
  assert.equal(cells["平均 Token/轮"].value, "—");
  assert.equal(cells["平均 Token/轮"].hint, "暂无完结 Run");
  assert.equal(cells["实测 Token"].value, "—");
  assert.equal(cells["预估成本"].value, "—");
  assert.equal(cells["Planner 降级"].value, "—");
  assert.deepEqual(view.providers, []);
});
