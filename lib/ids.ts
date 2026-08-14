/**
 * Branded (nominally-typed) IDs, plus the single factory for every ID
 * ROOM generates. Before this existed, the same three-line `uniqueId`
 * helper (`` `${prefix}-${crypto.randomUUID()}` ``) was defined twice
 * (`agent-runtime/tracer.ts` and `workflow/room-workflow.ts`), and every ID
 * -- `runId`, `eventId`, `checkpointId`, `artifactId`, `toolCallId` -- was
 * a plain `string`, so a Workflow `runId` could be passed anywhere an
 * Agent Trace `eventId` was expected without `tsc` ever noticing.
 *
 * A `Branded<B>` is a `string` at runtime (zero overhead: `JSON.stringify`
 * /`===`/DB storage all see a plain string) but a *distinct* type at
 * compile time. Adoption is deliberately incremental: factories produce
 * Branded values, which are always assignable to
 * a plain `string`-typed field (a `RunId` *is* a `string`), so call sites
 * can switch to them without any consuming signature changing yet.
 * Widening a specific field's declared type from `string` to `RunId`
 * (etc.) is a separate, per-field follow-up.
 *
 * ROOM has two independent Run-ID namespaces that must keep their
 * existing wire prefixes exactly (`app/api/runs/*` routes regex-validate
 * `workflow-...`; nothing currently validates the Agent Trace `run-...`
 * fallback, but changing it would still be a needless behavior change):
 * `newWorkflowRunId()`/`newWorkflowEventId()` for `RoomWorkflowEngine`,
 * `newRunId()`/`newEventId()` for `AgentTracer`. Both go through the same
 * `uniqueId()` factory below.
 */
declare const brand: unique symbol;

export type Branded<B extends string> = string & { readonly [brand]: B };

export type RunId = Branded<"RunId">;
export type EventId = Branded<"EventId">;
export type WorkflowRunId = Branded<"WorkflowRunId">;
export type WorkflowEventId = Branded<"WorkflowEventId">;
export type CheckpointId = Branded<"CheckpointId">;
export type ArtifactId = Branded<"ArtifactId">;
export type ToolCallId = Branded<"ToolCallId">;
export type CallId = Branded<"CallId">;

/** The one place `${prefix}-${crypto.randomUUID()}` is written. */
export function uniqueId<B extends string>(prefix: string): Branded<B> {
  return `${prefix}-${crypto.randomUUID()}` as Branded<B>;
}

// Agent Trace namespace (`lib/agent-runtime/tracer.ts`).
export const newRunId = (): RunId => uniqueId("run");
export const newEventId = (): EventId => uniqueId("event");

// Workflow namespace (`lib/workflow/room-workflow.ts`) -- distinct
// prefixes, matching the regex `app/api/runs/*` routes validate.
export const newWorkflowRunId = (): WorkflowRunId => uniqueId("workflow");
export const newWorkflowEventId = (): WorkflowEventId => uniqueId("workflow-event");
export const newCheckpointId = (): CheckpointId => uniqueId("checkpoint");

// Shared by both namespaces' inner call/tool-call bookkeeping.
export const newArtifactId = (): ArtifactId => uniqueId("artifact");
export const newToolCallId = (): ToolCallId => uniqueId("tool-call");
export const newCallId = (): CallId => uniqueId("call");

/**
 * Asserts a value read back across a serialization boundary (D1/R2/wire)
 * actually looks like the branded ID it is cast to, instead of silently
 * trusting an arbitrary string. Intended for the exact points data crosses
 * back in (`WorkflowMetadataStore.getRun`, `TraceStore.get`, ...), not for
 * routine in-process passing.
 */
export function assertBrandedId<B extends string>(
  value: string,
  prefix: string,
  brandName: B,
): Branded<B> {
  if (!value.startsWith(`${prefix}-`)) {
    throw new Error(`Expected a ${brandName} (prefix "${prefix}-"), received: ${value.slice(0, 40)}`);
  }
  return value as Branded<B>;
}
