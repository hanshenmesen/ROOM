"use client";

import { useRef, useState } from "react";
import type { AgentRunEvent, AgentRunSnapshot } from "@/lib/agent-runtime/run-types";
import type { ProfileMergeReport, ProfileReviewResolution } from "@/lib/profile-merge";
import type { ParsedProfile } from "@/lib/types";

// Anonymous local Run recovery does not need a user account: the runId
// itself, saved in this browser's localStorage right after the Run is
// created (before the possibly-slow, possibly-refresh-interrupted LLM work
// starts), is the only "session" this product needs today. See
// docs/adr/0002-agent-run-persistence.md and docs/WORKFLOW_STATE.md.
const ACTIVE_RUN_STORAGE_KEY = "room-studio:workflow-run-id:v1";
const TRACE_POLL_INTERVAL_MS = 500;
// A 429 means this client's earlier Agent task is still running (slow
// providers can hold a slot for a minute or two). Back off and retry
// instead of failing the click outright.
const MAX_CONCURRENCY_RETRIES = 3;

export type WorkflowRunStatus =
  | "queued"
  | "running"
  | "waiting_for_review"
  | "completed"
  | "failed"
  | "cancelled";

export type WorkflowReviewSnapshot = {
  type: "profile_conflict";
  node: string;
  requestedAt: string;
  schemaVersion: string;
  primarySource: string;
  supplementSource: string;
  conflicts: ProfileMergeReport["conflicts"];
};

export type WorkflowRunSnapshot = {
  schemaVersion: string;
  runId: string;
  status: WorkflowRunStatus;
  source: { type: string; label: string; lineCount: number; byteLength: number };
  currentNode?: string;
  completedNodes: string[];
  review?: WorkflowReviewSnapshot;
  failure?: { node: string; code: string };
  persistence: { mode: string; survivesProcessRestart: boolean };
};

export type WorkflowRunResult = {
  status: WorkflowRunStatus;
  profile?: ParsedProfile;
  mergeReport?: ProfileMergeReport;
  world?: unknown;
  creativeBrief?: unknown;
  checkReport?: unknown;
};

function readStoredRunId() {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(ACTIVE_RUN_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

function storeRunId(runId: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ACTIVE_RUN_STORAGE_KEY, runId);
  } catch {
    // Best-effort; browser storage may be unavailable or full. Losing the
    // recovery pointer just means a refresh can't resume -- it does not
    // block generation itself.
  }
}

function clearStoredRunId() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(ACTIVE_RUN_STORAGE_KEY);
  } catch {
    // ignore
  }
}

function abortableBackoffSleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolvePromise, reject) => {
    const timer = window.setTimeout(() => resolvePromise(), ms);
    signal.addEventListener("abort", () => {
      window.clearTimeout(timer);
      reject(new DOMException("已取消", "AbortError"));
    }, { once: true });
  });
}

type RunEnvelope = { run?: WorkflowRunSnapshot; error?: string; reused?: boolean };

/**
 * Transport layer for the anonymous local Run recovery contract: creating a
 * Run persists its id to this browser immediately (step 1 of the plan),
 * starting/resuming it polls the same Agent trace store the legacy
 * /api/parse path uses (by workflow runId instead of a client-generated
 * one), and every entry point that can finish a Run clears the stored id
 * only when it reaches a terminal state that should not auto-resume.
 */
export function useWorkflowRun(options: { onMessage: (message: string) => void }) {
  const [agentRunEvents, setAgentRunEvents] = useState<AgentRunEvent[]>([]);
  const abortController = useRef<AbortController | null>(null);
  const onMessage = options.onMessage;

  function resetAgentRunEvents() {
    setAgentRunEvents([]);
  }

  function abortActiveRequest() {
    abortController.current?.abort();
  }

  function startTracePolling(runId: string) {
    const poll = () => {
      void fetch(`/api/agent-runs/${encodeURIComponent(runId)}/events`, { cache: "no-store" })
        .then((response) => (response.ok ? response.json() as Promise<AgentRunSnapshot> : null))
        .then((run) => { if (run) setAgentRunEvents(run.events); })
        .catch(() => {
          // The final response body remains the fallback when polling fails.
        });
    };
    poll();
    return window.setInterval(poll, TRACE_POLL_INTERVAL_MS);
  }

  /** Runs one Workflow request with 429 backoff retry and Agent trace polling by workflow runId. */
  async function requestWorkflow<T extends RunEnvelope>(runId: string, input: string, init: RequestInit) {
    abortController.current?.abort();
    const controller = new AbortController();
    abortController.current = controller;
    setAgentRunEvents([]);
    const pollTimer = startTracePolling(runId);
    try {
      for (let attempt = 0; ; attempt += 1) {
        const response = await fetch(input, { ...init, signal: controller.signal });
        if (response.status !== 429 || attempt >= MAX_CONCURRENCY_RETRIES) {
          const data = await response.json() as T;
          return { response, data };
        }
        const retryAfterSeconds = Number(response.headers.get("retry-after")) || 2 * (attempt + 1);
        onMessage(`上一个 Agent 任务仍在运行，${retryAfterSeconds} 秒后自动重试（${attempt + 1}/${MAX_CONCURRENCY_RETRIES}）…`);
        await abortableBackoffSleep(retryAfterSeconds * 1_000, controller.signal);
      }
    } finally {
      window.clearInterval(pollTimer);
      if (abortController.current === controller) abortController.current = null;
    }
  }

  /**
   * Step 1 of the recovery plan: create the Run with autoStart disabled and
   * persist its runId *before* any slow/interruptible execution begins.
   */
  async function createTextRun(input: {
    text: string;
    label: string;
    sourceType: "text" | "url";
    followWebsite: boolean;
    headers: HeadersInit;
    /** Explicit personal website URL, overriding auto-detection from the parsed Profile. */
    website?: string;
  }) {
    const response = await fetch("/api/runs", {
      method: "POST",
      headers: { "content-type": "application/json", ...input.headers },
      body: JSON.stringify({
        source: { type: input.sourceType, label: input.label, text: input.text },
        mode: "agent",
        autoStart: false,
        followWebsite: input.followWebsite,
        ...(input.website ? { website: input.website } : {}),
      }),
    });
    const data = await response.json() as RunEnvelope;
    if (!response.ok || !data.run) return { error: data.error || "创建生成任务失败。" };
    storeRunId(data.run.runId);
    return { runId: data.run.runId, snapshot: data.run };
  }

  async function createFileRun(input: {
    file: File;
    followWebsite: boolean;
    website?: string;
    headers: HeadersInit;
  }) {
    const form = new FormData();
    form.set("file", input.file);
    form.set("followWebsite", input.followWebsite ? "true" : "false");
    form.set("autoStart", "false");
    if (input.website) form.set("website", input.website);
    const response = await fetch("/api/runs", { method: "POST", headers: input.headers, body: form });
    const data = await response.json() as RunEnvelope;
    if (!response.ok || !data.run) return { error: data.error || "创建生成任务失败。" };
    storeRunId(data.run.runId);
    return { runId: data.run.runId, snapshot: data.run };
  }

  /** Step 2: begin the just-created Run's execution. */
  async function startRun(runId: string, headers: HeadersInit) {
    const { data } = await requestWorkflow<RunEnvelope>(runId, `/api/runs/${encodeURIComponent(runId)}/start`, {
      method: "POST",
      headers,
    });
    return afterTerminalState(runId, data);
  }

  /** Continues a queued/failed/running (lease-expired) Run from its first incomplete node. */
  async function resumeRun(runId: string, headers: HeadersInit) {
    const { data } = await requestWorkflow<RunEnvelope>(runId, `/api/runs/${encodeURIComponent(runId)}/resume`, {
      method: "POST",
      headers,
    });
    return afterTerminalState(runId, data);
  }

  /** Applies review decisions and resumes at the first incomplete node. */
  async function submitReview(runId: string, resolutions: ProfileReviewResolution[]) {
    const { data } = await requestWorkflow<RunEnvelope>(runId, `/api/runs/${encodeURIComponent(runId)}/review`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ resolutions }),
    });
    return afterTerminalState(runId, data);
  }

  /**
   * Cancellation is the one transition the plan says must *not* auto-resume:
   * clear the stored pointer so a refresh starts a fresh Run instead of
   * silently reviving a cancelled one.
   */
  async function cancelWorkflowRun(runId: string) {
    abortActiveRequest();
    try {
      await fetch(`/api/runs/${encodeURIComponent(runId)}/cancel`, { method: "POST" });
    } catch {
      // Best-effort: the server-side cancel registry also stops the run.
    } finally {
      if (readStoredRunId() === runId) clearStoredRunId();
    }
  }

  function afterTerminalState(runId: string, data: RunEnvelope) {
    if (data.run && (data.run.status === "completed" || data.run.status === "cancelled")) {
      if (readStoredRunId() === runId) clearStoredRunId();
    }
    return data;
  }

  async function fetchSnapshot(runId: string): Promise<
    { notFound: true } | { error: string } | { snapshot: WorkflowRunSnapshot }
  > {
    const response = await fetch(`/api/runs/${encodeURIComponent(runId)}`, { cache: "no-store" });
    if (response.status === 404) return { notFound: true };
    const data = await response.json() as RunEnvelope;
    if (!response.ok || !data.run) return { error: data.error || "无法读取生成任务状态。" };
    return { snapshot: data.run };
  }

  async function fetchResult(runId: string): Promise<
    { notFound: true } | { error: string } | { result: WorkflowRunResult }
  > {
    const response = await fetch(`/api/runs/${encodeURIComponent(runId)}/result`, { cache: "no-store" });
    if (response.status === 404) return { notFound: true };
    const data = await response.json() as WorkflowRunResult & { error?: string };
    if (!response.ok) return { error: data.error || "无法读取生成结果。" };
    return { result: data };
  }

  return {
    agentRunEvents,
    resetAgentRunEvents,
    abortActiveRequest,
    createTextRun,
    createFileRun,
    startRun,
    resumeRun,
    submitReview,
    cancelWorkflowRun,
    fetchSnapshot,
    fetchResult,
    getStoredRunId: readStoredRunId,
    clearStoredRun: clearStoredRunId,
  };
}
