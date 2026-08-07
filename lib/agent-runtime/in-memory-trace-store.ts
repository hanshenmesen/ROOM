import type { AgentRunEvent, AgentRunSnapshot } from "./run-types.ts";

const MAX_RUNS = 100;
const STORE_KEY = Symbol.for("room.agent-runtime.trace-store.v1");

type StoreState = Map<string, AgentRunEvent[]>;

function sharedState() {
  const root = globalThis as typeof globalThis & { [STORE_KEY]?: StoreState };
  root[STORE_KEY] ||= new Map<string, AgentRunEvent[]>();
  return root[STORE_KEY];
}

function statusFor(events: AgentRunEvent[]) {
  if (events.some((event) => event.type === "run.completed")) return "completed" as const;
  if (events.some((event) => event.type === "run.failed")) return "failed" as const;
  return "running" as const;
}

// A run whose server handler died without emitting a terminal event
// (dev-server HMR reloads and process restarts kill in-flight handlers;
// pre-cancellation-era runs never got one either) would otherwise report
// "running" forever and inflate the fleet panel's in-progress count. The
// longest a live run can stay silent is bounded by the run budget
// (40 min), so anything quiet for longer is declared stale on read and
// closed with a terminal event exactly once.
const STALE_RUN_TTL_MS = 45 * 60_000;

function sweepStaleRuns(state: StoreState) {
  const now = Date.now();
  for (const [runId, events] of state) {
    if (statusFor(events) !== "running") continue;
    const last = events.at(-1);
    if (!last || now - Date.parse(last.occurredAt) < STALE_RUN_TTL_MS) continue;
    events.push({
      type: "run.failed",
      errorCode: "stale",
      eventId: `event-${crypto.randomUUID()}`,
      occurredAt: new Date(now).toISOString(),
      runId,
    });
  }
}

export class InMemoryTraceStore {
  append(event: AgentRunEvent) {
    const state = sharedState();
    const events = state.get(event.runId) || [];
    events.push(structuredClone(event));
    state.delete(event.runId);
    state.set(event.runId, events);
    while (state.size > MAX_RUNS) {
      const oldest = state.keys().next().value;
      if (!oldest) break;
      state.delete(oldest);
    }
  }

  get(runId: string): AgentRunSnapshot | undefined {
    const state = sharedState();
    sweepStaleRuns(state);
    const events = state.get(runId);
    if (!events) return undefined;
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

  /** Bounded snapshot window (most recent runs first) for cross-run aggregation. */
  list(): AgentRunSnapshot[] {
    const state = sharedState();
    sweepStaleRuns(state);
    return [...state.entries()].reverse().map(([runId, events]) => {
      const started = events.find((event) => event.type === "run.started");
      const completed = [...events].reverse().find((event) => event.type === "run.completed" || event.type === "run.failed");
      return {
        runId,
        status: statusFor(events),
        startedAt: started?.occurredAt,
        completedAt: completed?.occurredAt,
        events: structuredClone(events),
      };
    });
  }

  clear() {
    sharedState().clear();
  }
}

export const inMemoryTraceStore = new InMemoryTraceStore();
