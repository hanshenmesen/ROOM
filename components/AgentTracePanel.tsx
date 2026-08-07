"use client";

import { useEffect, useState } from "react";
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

/**
 * Single-run trace as a one-line summary bar. The bar shows status,
 * wall-clock elapsed (ticking while live), and the event count; clicking it
 * opens the full metrics grid and timeline in a modal, so the creation page
 * itself never grows or scrolls to accommodate run details.
 */
export function AgentTracePanel({ events }: { events: AgentRunEvent[] }) {
  const overview = events.length ? inspectAgentTrace(events) : undefined;
  const running = overview?.status === "running";
  const [now, setNow] = useState(0);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [running]);
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);
  if (!events.length || !overview) return null;
  const statusLabel = overview.status === "completed" ? "已完成" : overview.status === "failed" ? "失败" : "运行中";
  // Wall-clock everywhere: while running, tick from the interval clock;
  // once finished, the inspector's first-to-last-event span is the same
  // metric, so the number no longer jumps at completion.
  const elapsedMs = running
    ? Math.max(overview.latencyMs, now - Date.parse(events[0].occurredAt))
    : overview.latencyMs;
  const elapsedLabel = elapsedMs >= 1_000 ? `${(elapsedMs / 1_000).toFixed(1)}s` : `${elapsedMs}ms`;
  const summaryLine = (
    <>
      <span>AGENT TRACE / LIVE</span>
      <strong>{statusLabel}</strong>
      <small>{elapsedLabel} · {events.length} EVENTS</small>
    </>
  );
  return (
    <>
      <button
        type="button"
        className={`agent-trace-panel is-${overview.status}`}
        aria-label="Agent 运行轨迹，点击查看详情"
        onClick={() => setOpen(true)}
      >
        {summaryLine}
      </button>
      {open ? (
        <div className="agent-detail-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setOpen(false);
        }}>
          <section className="agent-detail-dialog" role="dialog" aria-modal="true" aria-label="Agent 运行轨迹详情">
            <header>
              {summaryLine}
              <button type="button" onClick={() => setOpen(false)} aria-label="关闭运行轨迹详情">×</button>
            </header>
            <dl className="agent-trace-metrics">
              <div><dt>模型</dt><dd>{overview.modelCalls}</dd></div>
              <div><dt>工具</dt><dd>{overview.toolCalls}</dd></div>
              <div><dt>重试</dt><dd>{overview.retries}</dd></div>
              <div><dt>产物</dt><dd>{overview.artifacts}</dd></div>
              <div><dt>耗时</dt><dd>{elapsedLabel}</dd></div>
              <div><dt>Token</dt><dd>{overview.inputTokens + overview.outputTokens || "—"}</dd></div>
              <div><dt>成本</dt><dd>{overview.estimatedCost ? `$${overview.estimatedCost.toFixed(4)}` : "—"}</dd></div>
            </dl>
            <ol className="agent-trace-timeline">
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
          </section>
        </div>
      ) : null}
    </>
  );
}
