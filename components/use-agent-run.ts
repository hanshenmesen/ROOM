"use client";

import { useRef, useState } from "react";
import type { AgentRunEvent, AgentRunSnapshot } from "@/lib/agent-runtime/run-types";

const TRACE_POLL_INTERVAL_MS = 500;
// A 429 means this client's earlier Agent task is still running (slow
// providers can hold a slot for a minute or two). Back off and retry
// instead of failing the click outright.
const MAX_CONCURRENCY_RETRIES = 3;

function abortableBackoffSleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolvePromise, reject) => {
    const timer = window.setTimeout(() => resolvePromise(), ms);
    signal.addEventListener("abort", () => {
      window.clearTimeout(timer);
      reject(new DOMException("已取消", "AbortError"));
    }, { once: true });
  });
}

/**
 * Transport layer for one tracked Agent run at a time: posts the request
 * with a client-generated run id, polls the redacted event timeline while
 * it runs, backs off on concurrency 429s, and supports user cancellation
 * on both sides -- the client fetch aborts, and the cancel endpoint stops
 * the server-side run so its concurrency lease is released immediately
 * instead of at the model timeout.
 */
export function useAgentRun(options: { onMessage: (message: string) => void }) {
  const [agentRunEvents, setAgentRunEvents] = useState<AgentRunEvent[]>([]);
  const abortController = useRef<AbortController | null>(null);
  const activeRunId = useRef("");
  const onMessage = options.onMessage;

  function resetAgentRunEvents() {
    setAgentRunEvents([]);
  }

  function cancelAgentRun() {
    abortController.current?.abort();
    const runId = activeRunId.current;
    if (runId) {
      void fetch(`/api/agent-runs/${encodeURIComponent(runId)}/cancel`, { method: "POST" }).catch(() => {});
    }
  }

  async function requestTrackedAgentRun<T extends { run?: AgentRunSnapshot }>(
    input: string,
    init: RequestInit,
  ) {
    const runId = crypto.randomUUID();
    const headers = new Headers(init.headers);
    headers.set("x-room-agent-run-id", runId);
    abortController.current?.abort();
    const controller = new AbortController();
    abortController.current = controller;
    activeRunId.current = runId;
    setAgentRunEvents([]);
    const poll = async () => {
      try {
        const response = await fetch(`/api/agent-runs/${encodeURIComponent(runId)}/events`, { cache: "no-store" });
        if (!response.ok) return;
        const run = await response.json() as AgentRunSnapshot;
        setAgentRunEvents(run.events);
      } catch {
        // The final POST response remains the fallback when polling is unavailable.
      }
    };
    const pollTimer = window.setInterval(() => void poll(), TRACE_POLL_INTERVAL_MS);
    try {
      for (let attempt = 0; ; attempt += 1) {
        const response = await fetch(input, { ...init, headers, signal: controller.signal });
        if (response.status !== 429 || attempt >= MAX_CONCURRENCY_RETRIES) {
          const data = await response.json() as T;
          if (data.run) setAgentRunEvents(data.run.events);
          else await poll();
          return { response, data };
        }
        const retryAfterSeconds = Number(response.headers.get("retry-after")) || 2 * (attempt + 1);
        onMessage(`上一个 Agent 任务仍在运行，${retryAfterSeconds} 秒后自动重试（${attempt + 1}/${MAX_CONCURRENCY_RETRIES}）…`);
        await abortableBackoffSleep(retryAfterSeconds * 1_000, controller.signal);
      }
    } finally {
      window.clearInterval(pollTimer);
      if (abortController.current === controller) abortController.current = null;
      if (activeRunId.current === runId) activeRunId.current = "";
    }
  }

  return {
    agentRunEvents,
    resetAgentRunEvents,
    requestTrackedAgentRun,
    cancelAgentRun,
  };
}
