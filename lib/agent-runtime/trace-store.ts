import type { AgentRunEvent, AgentRunSnapshot } from "./run-types.ts";
import type { WorkflowObjectStore } from "../workflow/object-store.ts";

/**
 * Storage boundary for Agent Run trace events.
 *
 * `AgentTracer` depends on this interface, not on a concrete store, so a
 * Run's trace destination is an explicit injection point (via
 * `RoomRunContext`) instead of an implicit `globalThis` singleton. Three
 * implementations exist:
 *
 * - `InMemoryTraceStore` (`in-memory-trace-store.ts`): the shared,
 *   process-local store used by default so cross-request surfaces (the
 *   fleet metrics panel, `/api/agent-runs/[runId]/events`) keep working
 *   without a durable binding. Still a deliberate global for those
 *   surfaces, no longer an implicit default baked into `AgentTracer` itself.
 * - `DurableTraceStore` (below): persists events per run to object storage
 *   (the same private-bucket boundary Workflow bodies use), for deployments
 *   that need traces to survive a process restart.
 * - `TestTraceStore` (below): a throwaway, per-instance store for tests that
 *   want trace isolation without touching the shared global state.
 */
export type TraceStore = {
  append(event: AgentRunEvent): void | Promise<void>;
  get(runId: string): AgentRunSnapshot | undefined | Promise<AgentRunSnapshot | undefined>;
  /** Events for one run after (exclusive) a given index, in emission order. */
  eventsAfter(runId: string, index: number): AgentRunEvent[] | Promise<AgentRunEvent[]>;
};

function statusFor(events: AgentRunEvent[]) {
  if (events.some((event) => event.type === "run.completed")) return "completed" as const;
  if (events.some((event) => event.type === "run.failed")) return "failed" as const;
  return "running" as const;
}

function snapshotFrom(runId: string, events: AgentRunEvent[]): AgentRunSnapshot {
  const started = events.find((event) => event.type === "run.started");
  const completed = [...events].reverse().find((event) => event.type === "run.completed" || event.type === "run.failed");
  return {
    runId,
    status: statusFor(events),
    startedAt: started?.occurredAt,
    completedAt: completed?.occurredAt,
    events: structuredClone(events),
  };
}

const TRACE_OBJECT_KEY_PREFIX = "traces/v1/runs/";

function traceObjectKey(runId: string) {
  return `${TRACE_OBJECT_KEY_PREFIX}${runId}/events.json`;
}

/**
 * Durable `TraceStore` backed by the same object-storage boundary Workflow
 * bodies use (private R2 in production). Each run's events live at one key,
 * rewritten wholesale on every `append` -- trace volume per run is small and
 * bounded by the run budget, so this stays simple instead of requiring a
 * separate compaction path.
 */
export class DurableTraceStore implements TraceStore {
  private readonly objects: WorkflowObjectStore;

  constructor(objects: WorkflowObjectStore) {
    this.objects = objects;
  }

  async append(event: AgentRunEvent) {
    const events = await this.readEvents(event.runId);
    events.push(event);
    await this.objects.put(traceObjectKey(event.runId), JSON.stringify(events));
  }

  async get(runId: string): Promise<AgentRunSnapshot | undefined> {
    const events = await this.readEvents(runId);
    if (!events.length) return undefined;
    return snapshotFrom(runId, events);
  }

  async eventsAfter(runId: string, index: number) {
    const events = await this.readEvents(runId);
    return events.slice(Math.max(0, index));
  }

  private async readEvents(runId: string): Promise<AgentRunEvent[]> {
    const body = await this.objects.get(traceObjectKey(runId));
    return body ? JSON.parse(body) as AgentRunEvent[] : [];
  }
}

/**
 * Deterministic, per-instance `TraceStore` for tests that want trace
 * isolation without clearing (or being polluted by) the shared
 * `inMemoryTraceStore` global. Not wired in anywhere by default; existing
 * tests keep using the shared singleton unless they explicitly opt in.
 */
export class TestTraceStore implements TraceStore {
  private readonly runs = new Map<string, AgentRunEvent[]>();

  append(event: AgentRunEvent) {
    const events = this.runs.get(event.runId) || [];
    events.push(structuredClone(event));
    this.runs.set(event.runId, events);
  }

  get(runId: string): AgentRunSnapshot | undefined {
    const events = this.runs.get(runId);
    return events ? snapshotFrom(runId, events) : undefined;
  }

  eventsAfter(runId: string, index: number) {
    return (this.runs.get(runId) || []).slice(Math.max(0, index));
  }

  clear() {
    this.runs.clear();
  }
}
