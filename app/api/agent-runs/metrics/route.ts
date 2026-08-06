import { NextResponse } from "next/server";
import { concurrencyLeaseMetrics } from "@/lib/agent-runtime/concurrency-limiter";
import { inMemoryTraceStore } from "@/lib/agent-runtime/in-memory-trace-store";
import { aggregateTraceMetrics } from "@/lib/agent-runtime/trace-aggregation";

export const runtime = "edge";

/**
 * Cross-run Agent observability: task completion rate, model/tool latency
 * percentiles, measured Token usage, estimated cost, per-provider/model
 * breakdowns, and concurrency lease counters over the bounded in-memory
 * Trace window. Aggregates contain no prompts, source bodies, claim values,
 * headers, or per-client identifiers.
 */
export async function GET() {
  const snapshots = inMemoryTraceStore.list();
  const metrics = aggregateTraceMetrics(snapshots);
  return NextResponse.json({
    ...metrics,
    concurrency: concurrencyLeaseMetrics(),
    store: {
      mode: "in-memory",
      windowRuns: snapshots.length,
      maxRuns: 100,
      note: "进程内 Trace 窗口的聚合视图；不代表全量历史数据。Token 仅统计 Provider 返回 usage 的调用，成本为估算值。",
    },
  }, {
    headers: { "cache-control": "no-store" },
  });
}
