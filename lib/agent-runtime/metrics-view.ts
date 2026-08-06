import type { TraceAggregateMetrics } from "./trace-aggregation.ts";

/**
 * Presentation model for the cross-run Agent metrics panel. Pure formatting
 * so the view logic is testable without rendering, and the API payload stays
 * the single source of truth.
 */

export type AgentMetricsResponse = TraceAggregateMetrics & {
  concurrency: {
    activeLeases: number;
    distinctClients: number;
    acquiredTotal: number;
    rejectedTotal: number;
  };
  store: {
    mode: string;
    windowRuns: number;
    maxRuns: number;
    note: string;
  };
};

export type AgentMetricCell = {
  label: string;
  value: string;
  hint?: string;
};

export type AgentMetricsView = {
  statusLabel: string;
  statusTone: "good" | "warn" | "muted";
  windowLabel: string;
  cells: AgentMetricCell[];
  providers: Array<{ label: string; value: string }>;
  footerNote: string;
};

function formatLatency(ms?: number) {
  if (ms === undefined) return "—";
  return ms >= 1_000 ? `${(ms / 1_000).toFixed(1)}s` : `${Math.round(ms)}ms`;
}

function formatTokens(value: number) {
  if (value <= 0) return "—";
  return value >= 1_000 ? `${(value / 1_000).toFixed(1)}k` : String(value);
}

function formatPercent(value?: number) {
  return value === undefined ? "—" : `${(value * 100).toFixed(1)}%`;
}

export function buildAgentMetricsView(metrics: AgentMetricsResponse): AgentMetricsView {
  const finished = metrics.runs.completed + metrics.runs.failed;
  // The panel deliberately reports run counts and averages only -- no
  // completion-rate judgement. Debugging sessions otherwise dominate the
  // window and the rate keeps punishing the viewer long after a fix lands.
  const statusTone = "muted" as const;
  const statusLabel = metrics.runs.running > 0
    ? `${metrics.runs.total} 轮 · ${metrics.runs.running} 运行中`
    : `${metrics.runs.total} 轮`;

  const measuredTotal = metrics.modelCalls.measuredUsageCalls;
  const measuredTokens = metrics.modelCalls.inputTokens + metrics.modelCalls.outputTokens;
  const tokenHint = metrics.modelCalls.total > 0
    ? `${measuredTotal}/${metrics.modelCalls.total} 次返回 usage`
    : undefined;

  const cells: AgentMetricCell[] = [
    {
      label: "运行轮数",
      value: String(metrics.runs.total),
      hint: [
        `${metrics.runs.completed} 完成`,
        `${metrics.runs.failed} 失败`,
        metrics.runs.running > 0 ? `${metrics.runs.running} 运行中` : "",
      ].filter(Boolean).join(" · "),
    },
    {
      label: "模型平均耗时",
      value: formatLatency(metrics.modelCalls.latencyMs.mean),
      hint: metrics.modelCalls.total > 0 ? `${metrics.modelCalls.total} 次调用` : undefined,
    },
    {
      label: "工具平均耗时",
      value: formatLatency(metrics.toolCalls.latencyMs.mean),
      hint: metrics.toolCalls.total > 0 ? `${metrics.toolCalls.total} 次调用` : undefined,
    },
    {
      label: "平均 Token/轮",
      value: finished > 0 ? formatTokens(Math.round(measuredTokens / finished)) : "—",
      hint: finished > 0 ? `按 ${finished} 个完结 Run` : "暂无完结 Run",
    },
    {
      label: "实测 Token",
      value: formatTokens(measuredTokens),
      hint: tokenHint,
    },
    {
      label: "预估成本",
      value: metrics.modelCalls.estimatedCost > 0 ? `$${metrics.modelCalls.estimatedCost.toFixed(4)}` : "—",
    },
    {
      label: "Planner 降级",
      value: formatPercent(metrics.plannerDecisions.fallbackRate),
      hint: metrics.plannerDecisions.total > 0 ? `${metrics.plannerDecisions.deterministicFallback}/${metrics.plannerDecisions.total} 次决策` : undefined,
    },
    {
      label: "并发租约",
      value: `${metrics.concurrency.activeLeases} 活跃`,
      hint: metrics.concurrency.rejectedTotal > 0 ? `${metrics.concurrency.rejectedTotal} 次拒绝` : "无拒绝",
    },
  ];

  return {
    statusLabel,
    statusTone,
    windowLabel: `${metrics.store.windowRuns}/${metrics.store.maxRuns} RUNS`,
    cells,
    providers: metrics.providers.slice(0, 3).map((provider) => ({
      label: `${provider.provider}/${provider.model}`,
      value: `${provider.calls} 次 · p95 ${formatLatency(provider.latencyMs.p95)}${provider.failures ? ` · ${provider.failures} 失败` : ""}`,
    })),
    footerNote: metrics.store.note,
  };
}
