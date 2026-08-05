import { inMemoryTraceStore, type InMemoryTraceStore } from "./in-memory-trace-store.ts";
import { redactTraceValue } from "./redaction.ts";
import type { AgentRunEvent, AgentRunSnapshot } from "./run-types.ts";

type AgentRunEventDraft = AgentRunEvent extends infer Event
  ? Event extends AgentRunEvent
    ? Omit<Event, "eventId" | "occurredAt" | "runId">
    : never
  : never;

function uniqueId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}
export class AgentTracer {
  readonly runId: string;
  private readonly store: InMemoryTraceStore;

  constructor(runId = uniqueId("run"), store = inMemoryTraceStore) {
    this.runId = runId;
    this.store = store;
  }

  emit(draft: AgentRunEventDraft) {
    const raw = {
      ...draft,
      eventId: uniqueId("event"),
      occurredAt: new Date().toISOString(),
      runId: this.runId,
    } as AgentRunEvent;
    const event = redactTraceValue(raw) as AgentRunEvent;
    this.store.append(event);
    return event;
  }

  start() {
    if (!this.snapshot()?.events.some((event) => event.type === "run.started")) {
      this.emit({ type: "run.started" });
    }
    return this;
  }

  complete() {
    if (!this.snapshot()?.events.some((event) => event.type === "run.completed")) {
      this.emit({ type: "run.completed" });
    }
  }

  fail(errorCode: string) {
    if (!this.snapshot()?.events.some((event) => event.type === "run.failed")) {
      this.emit({ type: "run.failed", errorCode });
    }
  }

  snapshot(): AgentRunSnapshot | undefined {
    return this.store.get(this.runId);
  }
}

export function createAgentTracer(runId?: string) {
  return new AgentTracer(runId).start();
}
