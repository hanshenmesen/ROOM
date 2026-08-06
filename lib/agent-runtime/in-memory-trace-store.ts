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
    const events = sharedState().get(runId);
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
    return [...sharedState().entries()].reverse().map(([runId, events]) => {
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
