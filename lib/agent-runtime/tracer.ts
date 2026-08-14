import { newEventId, newRunId } from "../ids.ts";
import { inMemoryTraceStore } from "./in-memory-trace-store.ts";
import { redactTraceValue } from "./redaction.ts";
import type { AgentRunEvent, AgentRunSnapshot } from "./run-types.ts";
import type { TraceStore } from "./trace-store.ts";

type AgentRunEventDraft = AgentRunEvent extends infer Event
  ? Event extends AgentRunEvent
    ? Omit<Event, "eventId" | "occurredAt" | "runId">
    : never
  : never;

export class AgentTracer {
  readonly runId: string;
  private readonly store: TraceStore;
  // `snapshot()`/`start()`/`complete()`/`fail()` need synchronous
  // "has this event already been emitted" checks, but `TraceStore.get()` is
  // allowed to be async (the durable implementation reads from object
  // storage). Tracking the terminal/started state locally keeps those checks
  // synchronous without requiring every store to be memory-backed.
  private started = false;
  private terminal = false;

  /**
   * The store a Run's events are appended to is an explicit constructor
   * argument, never an implicit default: callers resolve it once (see
   * `RoomRunContext`/`createAgentTracer`) so a Run's trace destination is a
   * visible decision, not a hidden dependency on a `globalThis` singleton.
   */
  constructor(runId: string = newRunId(), store: TraceStore = inMemoryTraceStore) {
    this.runId = runId;
    this.store = store;
  }

  emit(draft: AgentRunEventDraft) {
    const raw = {
      ...draft,
      eventId: newEventId(),
      occurredAt: new Date().toISOString(),
      runId: this.runId,
    } as AgentRunEvent;
    const event = redactTraceValue(raw) as AgentRunEvent;
    if (event.type === "run.started") this.started = true;
    if (event.type === "run.completed" || event.type === "run.failed") this.terminal = true;
    void this.store.append(event);
    return event;
  }

  // Dedup prefers a fresh read from the store (matches the exact
  // cross-instance dedup behavior tracers had before this class depended on
  // an interface instead of the concrete in-memory store): a new
  // `AgentTracer` for a runId that already has a terminal/started event in
  // the store -- e.g. one created per resume attempt -- must not re-emit
  // it. Only an async store (whose `get()` can't be read synchronously)
  // falls back to this instance's local flags.
  start() {
    const snapshot = this.snapshot();
    const alreadyStarted = snapshot ? snapshot.events.some((event) => event.type === "run.started") : this.started;
    if (!alreadyStarted) this.emit({ type: "run.started" });
    return this;
  }

  complete() {
    const snapshot = this.snapshot();
    const alreadyTerminal = snapshot
      ? snapshot.events.some((event) => event.type === "run.completed" || event.type === "run.failed")
      : this.terminal;
    if (!alreadyTerminal) this.emit({ type: "run.completed" });
  }

  fail(errorCode: string) {
    const snapshot = this.snapshot();
    const alreadyTerminal = snapshot
      ? snapshot.events.some((event) => event.type === "run.completed" || event.type === "run.failed")
      : this.terminal;
    if (!alreadyTerminal) this.emit({ type: "run.failed", errorCode });
  }

  /**
   * Best-effort synchronous snapshot from the underlying store. Durable
   * stores that resolve asynchronously return `undefined` here; use
   * `snapshotAsync()` for a reliable read against any store.
   */
  snapshot(): AgentRunSnapshot | undefined {
    const result = this.store.get(this.runId);
    return result instanceof Promise ? undefined : result;
  }

  async snapshotAsync(): Promise<AgentRunSnapshot | undefined> {
    return this.store.get(this.runId);
  }
}

export function createAgentTracer(runId?: string, store?: TraceStore) {
  return new AgentTracer(runId, store).start();
}
