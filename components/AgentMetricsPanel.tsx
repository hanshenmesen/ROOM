"use client";

import { useEffect, useState } from "react";
import { buildAgentMetricsView, type AgentMetricsResponse } from "@/lib/agent-runtime/metrics-view";

const POLL_INTERVAL_MS = 5_000;

/**
 * Cross-run Agent metrics (run counts, average latencies, measured tokens,
 * estimated cost, planner fallback rate, concurrency leases) over the
 * process-local Trace window. Renders as a one-line summary bar; clicking
 * opens the full grid in a modal so the page layout never shifts. The reset
 * action clears the in-memory window (e.g. before a demo).
 */
export function AgentMetricsPanel() {
  const [metrics, setMetrics] = useState<AgentMetricsResponse | null>(null);
  const [resetting, setResetting] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const response = await fetch("/api/agent-runs/metrics", { cache: "no-store" });
        if (!response.ok) return;
        const body = await response.json() as AgentMetricsResponse;
        if (!cancelled) setMetrics(body);
      } catch {
        // The panel is auxiliary: keep the last good snapshot on failure.
      }
    }
    void poll();
    const timer = setInterval(() => void poll(), POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  async function resetMetrics() {
    if (resetting) return;
    setResetting(true);
    try {
      const response = await fetch("/api/agent-runs/metrics/reset", { method: "POST" });
      // The window is empty now; hide the panel until the next run instead of
      // waiting up to one poll interval for the empty snapshot to arrive.
      if (response.ok) {
        setOpen(false);
        setMetrics(null);
      }
    } catch {
      // A failed reset leaves the window untouched; the next poll re-syncs.
    } finally {
      setResetting(false);
    }
  }

  if (!metrics || metrics.runs.total === 0) return null;
  const view = buildAgentMetricsView(metrics);
  const summaryLine = (
    <>
      <span>AGENT METRICS / FLEET</span>
      <strong className={`is-${view.statusTone}`}>{view.statusLabel}</strong>
      <small>{view.windowLabel}</small>
    </>
  );

  return (
    <>
      <button
        type="button"
        className="agent-metrics-panel"
        aria-label="Agent 跨运行指标，点击查看详情"
        onClick={() => setOpen(true)}
      >
        {summaryLine}
      </button>
      {open ? (
        <div className="agent-detail-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setOpen(false);
        }}>
          <section className="agent-detail-dialog" role="dialog" aria-modal="true" aria-label="Agent 跨运行指标详情">
            <header>
              {summaryLine}
              <button type="button" onClick={() => setOpen(false)} aria-label="关闭指标详情">×</button>
            </header>
            <dl className="agent-metrics-grid">
              {view.cells.map((cell) => (
                <div key={cell.label}>
                  <dt>{cell.label}</dt>
                  <dd>{cell.value}</dd>
                  {cell.hint ? <small>{cell.hint}</small> : null}
                </div>
              ))}
            </dl>
            {view.providers.length > 0 ? (
              <ul className="agent-metrics-providers">
                {view.providers.map((provider) => (
                  <li key={provider.label}>
                    <span>{provider.label}</span>
                    <small>{provider.value}</small>
                  </li>
                ))}
              </ul>
            ) : null}
            <footer className="agent-metrics-footer">
              <span>{view.footerNote}</span>
              <button
                type="button"
                className="agent-metrics-reset"
                onClick={resetMetrics}
                disabled={resetting}
              >
                {resetting ? "重置中…" : "重置统计"}
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </>
  );
}
