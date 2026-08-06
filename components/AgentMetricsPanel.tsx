"use client";

import { useEffect, useState } from "react";
import { buildAgentMetricsView, type AgentMetricsResponse } from "@/lib/agent-runtime/metrics-view";

const POLL_INTERVAL_MS = 5_000;

/**
 * Cross-run Agent metrics (latency percentiles, measured tokens, estimated
 * cost, planner fallback rate, concurrency leases) over the process-local
 * Trace window. Hidden until at least one run exists; renders as a collapsed
 * details block so it stays an opt-in operational view.
 */
export function AgentMetricsPanel() {
  const [metrics, setMetrics] = useState<AgentMetricsResponse | null>(null);

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

  if (!metrics || metrics.runs.total === 0) return null;
  const view = buildAgentMetricsView(metrics);

  return (
    <details className="agent-metrics-panel">
      <summary>
        <span>AGENT METRICS / FLEET</span>
        <strong className={`is-${view.statusTone}`}>{view.statusLabel}</strong>
        <small>{view.windowLabel}</small>
      </summary>
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
      <footer>{view.footerNote}</footer>
    </details>
  );
}
