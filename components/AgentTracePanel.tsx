"use client";

import { agentTraceEventView, inspectAgentTrace, traceEventMetadata } from "@/lib/agent-runtime/trace-inspector";
import type { AgentRunEvent } from "@/lib/agent-runtime/run-types";

function relativeTime(event: AgentRunEvent, events: AgentRunEvent[]) {
  const origin = Date.parse(events[0]?.occurredAt || event.occurredAt);
  const current = Date.parse(event.occurredAt);
  if (!Number.isFinite(origin) || !Number.isFinite(current)) return "";
  return `+${Math.max(0, current - origin)} ms`;
}

function readableMetadata(value: unknown) {
  if (typeof value === "string" || typeof value === "number") return String(value);
  return JSON.stringify(value);
}

export function AgentTracePanel({ events }: { events: AgentRunEvent[] }) {
  if (!events.length) return null;
  const overview = inspectAgentTrace(events);
  const statusLabel = overview.status === "completed" ? "已完成" : overview.status === "failed" ? "失败" : "运行中";
  return (
    <section className={`agent-trace-panel is-${overview.status}`} aria-label="Agent 运行轨迹">
      <header>
        <div><span>AGENT TRACE / LIVE</span><strong>{statusLabel}</strong></div>
        <small>{events.length} EVENTS</small>
      </header>
      <dl className="agent-trace-metrics">
        <div><dt>模型</dt><dd>{overview.modelCalls}</dd></div>
        <div><dt>工具</dt><dd>{overview.toolCalls}</dd></div>
        <div><dt>重试</dt><dd>{overview.retries}</dd></div>
        <div><dt>产物</dt><dd>{overview.artifacts}</dd></div>
        <div><dt>耗时</dt><dd>{overview.latencyMs >= 1_000 ? `${(overview.latencyMs / 1_000).toFixed(1)}s` : `${overview.latencyMs}ms`}</dd></div>
        <div><dt>Token</dt><dd>{overview.inputTokens + overview.outputTokens || "—"}</dd></div>
        <div><dt>成本</dt><dd>{overview.estimatedCost ? `$${overview.estimatedCost.toFixed(4)}` : "—"}</dd></div>
      </dl>
      <details className="agent-trace-details">
        <summary><span>查看完整运行时间线</span><b aria-hidden="true">＋</b></summary>
        <ol>
          {events.map((event) => {
            const view = agentTraceEventView(event);
            const metadata = traceEventMetadata(event);
            return (
              <li className={`is-${view.tone}`} key={event.eventId}>
                <i aria-hidden="true" />
                <div>
                  <time>{relativeTime(event, events)}</time>
                  <strong>{view.title}</strong>
                  <p>{view.detail}</p>
                  {metadata ? (
                    <details>
                      <summary>调用详情</summary>
                      <dl>{Object.entries(metadata).map(([key, value]) => (
                        <div key={key}><dt>{key}</dt><dd>{readableMetadata(value)}</dd></div>
                      ))}</dl>
                    </details>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      </details>
    </section>
  );
}
