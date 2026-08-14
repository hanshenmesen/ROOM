import { newRunId } from "../ids.ts";
import { AgentRunControls, type AgentRunBudgetLimits } from "./run-controls.ts";
import { AgentTracer, createAgentTracer } from "./tracer.ts";
import { inMemoryTraceStore } from "./in-memory-trace-store.ts";
import type { TraceStore } from "./trace-store.ts";
import type { AgentProviderOverride } from "../agents/provider-config.ts";

export type RoomRunContextInput = {
  runId?: string;
  tracer?: AgentTracer;
  controls?: AgentRunControls;
  signal?: AbortSignal;
  providerConfig?: AgentProviderOverride;
  traceStore?: TraceStore;
  budget?: Partial<AgentRunBudgetLimits>;
};

/**
 * Run-scoped context aggregating everything a model/tool call site needs:
 * tracer, budget/cancellation controls, and provider configuration.
 *
 * This replaces the ad hoc `{ providerConfig?, tracer?, runtimeControls?,
 * signal? }` bags that were threaded through `WorkflowExecutionOptions` and
 * several agent option types. Notably, `signal` is no longer a field
 * independent from `runtimeControls.signal` -- `RoomRunContext.signal` is a
 * read-only accessor onto `controls.signal`, so there is exactly one source
 * of truth and no way for the two to disagree.
 *
 * Construct one per Run via `createRoomRunContext()`/`RoomRunContext.create`.
 * Call sites that need a narrower scope (e.g. the website planner's smaller
 * model-call budget) derive a `child()` context instead of hand-assembling
 * a second `AgentRunControls`.
 */
export class RoomRunContext {
  readonly runId: string;
  readonly tracer: AgentTracer;
  readonly controls: AgentRunControls;
  readonly providerConfig?: AgentProviderOverride;

  constructor(input: {
    runId: string;
    tracer: AgentTracer;
    controls: AgentRunControls;
    providerConfig?: AgentProviderOverride;
  }) {
    this.runId = input.runId;
    this.tracer = input.tracer;
    this.controls = input.controls;
    this.providerConfig = input.providerConfig;
  }

  /** Single source of truth for this Run's cancellation signal. */
  get signal(): AbortSignal | undefined {
    return this.controls.signal;
  }

  static create(input: RoomRunContextInput = {}): RoomRunContext {
    const runId = input.runId || newRunId();
    const controls = input.controls || new AgentRunControls({ signal: input.signal, budget: input.budget });
    const tracer = input.tracer || createAgentTracer(runId, input.traceStore || inMemoryTraceStore);
    return new RoomRunContext({ runId, tracer, controls, providerConfig: input.providerConfig });
  }

  /**
   * Derives a child context for a narrower-scoped caller (e.g. a planner
   * capped at a handful of model calls). It shares this Run's tracer and
   * `providerConfig` -- events still land on the same Run's trace, and the
   * same provider override applies -- but gets its own `AgentRunControls`,
   * so a tighter budget or an additionally-derived abort signal never
   * leaks back into the parent Run's usage accounting.
   */
  child(overrides: { budget?: Partial<AgentRunBudgetLimits>; signal?: AbortSignal } = {}): RoomRunContext {
    const controls = new AgentRunControls({
      signal: overrides.signal || this.signal,
      budget: overrides.budget || this.controls.budget.limits,
    });
    return new RoomRunContext({ runId: this.runId, tracer: this.tracer, controls, providerConfig: this.providerConfig });
  }
}

export function createRoomRunContext(input: RoomRunContextInput = {}): RoomRunContext {
  return RoomRunContext.create(input);
}
