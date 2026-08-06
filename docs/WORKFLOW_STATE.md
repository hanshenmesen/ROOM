# Recoverable Workflow State

## Scope

Phase 3 introduced a framework-neutral Workflow boundary around the existing `PipelineResult`; Phase 5 adds Profile review interrupts. The Run API executes the deterministic Profile → Creative Brief → World → Check path and proves checkpoint, retry, cancellation, review, and observability contracts offline. The existing `/api/parse` success shape remains compatible and may now include an optional Merge Report.

It does not yet replace the production parse request or split the live LLM Profile Agent into Identity, Research, and Career Workflow nodes. That migration should happen after durable storage is enabled so an expensive model call is never presented as recoverable while its checkpoint exists only in memory.

## State and nodes

Runs use `room-workflow-state.v2` and move through:

```text
queued → running → completed
            ├──→ failed → running (resume)
            ├──→ waiting_for_review → running (review + resume)
            └──→ cancelled
queued ─────────→ cancelled
```

The initial graph is linear and explicit:

```text
prepare_source
  → extract_profile
  → direct_world
  → compile_world
  → check_world
  → complete
```

After every completed node the engine records a checkpoint containing the completed node, the next node, and every available Artifact schema version. A resume finds the first node absent from `completedNodes`; completed handlers are not invoked again. Node attempts and latency are recorded independently.

## Run API

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/api/runs` | Create a Run; accepts an `Idempotency-Key` header or body field |
| `GET` | `/api/runs/:runId` | Read a redacted public snapshot |
| `GET` | `/api/runs/:runId/events?after=N` | Read ordered events after a sequence cursor |
| `POST` | `/api/runs/:runId/cancel` | Cancel queued, running, or failed work |
| `POST` | `/api/runs/:runId/resume` | Continue queued or failed work from the first incomplete node |
| `POST` | `/api/runs/:runId/review` | Apply all required Profile conflict decisions and continue from the checkpoint |

`POST /api/runs` currently accepts non-empty text up to 1 MiB. Reusing an Idempotency Key with the same source returns the original Run; reusing it with different input returns HTTP 409.

The SHA-256 source hash binds that idempotency decision only. It is not a global résumé cache key: cross-user Artifact reuse is intentionally disabled to avoid membership disclosure and private-data crossover.

Run snapshots expose source type, label, byte/line counts, SHA-256 hash, status, attempts, checkpoints, metrics, failure code, and Artifact type/version metadata. They exclude the résumé body and full Artifact bodies. While a Run is waiting, its snapshot also exposes the bounded candidate values and evidence excerpts needed for that review. Events contain lifecycle metadata only.

## Human review boundary

An extraction or merge node can return both Artifacts and a `profile_conflict` Review Request. The engine first completes and checkpoints that node, then emits `review.requested` and moves to `waiting_for_review`. A normal resume is rejected until every required conflict has exactly one decision.

`POST /api/runs/:runId/review` accepts `primary`, `supplement`, `edit`, or `reject`. Accepted and edited values receive `user-confirmed` evidence, become the new `profile.v1` Artifact, and retain highest priority in later merges. The engine emits `review.completed`, then resumes at the first incomplete node; the extraction node is not called twice.

The live `/api/parse` path uses the same Merge Report and Review UI, but it is still a request-scoped path rather than a durable Run. It holds the provisional Profile in the browser and compiles only after review. Moving expensive live model shards fully behind durable D1/R2 Workflow handlers remains part of production enablement.

## Persistence boundary

`WorkflowStore` isolates orchestration from persistence. Two implementations now exist behind the same contract:

- **`InMemoryWorkflowStore`** (default): a bounded, process-global store for at most 100 Runs. It supports multiple requests in one local process or Worker isolate, but it cannot recover after a process restart, isolate replacement, or deployment.
- **`DurableWorkflowStore`**: composes a `WorkflowMetadataStore` (D1) with a `WorkflowObjectStore` (private R2). It is selected automatically by `resolveWorkflowStore()` when the runtime provides both a `DB` D1 binding and a `WORKFLOW_OBJECTS` R2 binding; API routes resolve the engine through `getRoomWorkflowEngine()`.

The durable layout mirrors the generated D1 migration:

- `agent_runs` for status, source hashes, idempotency, and lifecycle timestamps.
- `agent_steps` for attempts, checkpoints, latency, and error codes.
- `agent_events` for ordered redacted lifecycle payloads.
- `agent_artifacts` for schema versions and opaque private-object references.
- `eval_runs` for reproducible Eval report references.

D1 intentionally has no source-body, prompt-body, secret, or inline Artifact JSON columns. The full run state (including Artifact bodies), source input, and event log live as three private objects per Run (`state.json`, `input.json`, `events.json`) under a dedicated `workflow/v1/` prefix. `get()` rebuilds the record from these bodies; a missing body fails explicitly as corruption rather than returning a partial record. The ordered event log is the source of truth: `agent_steps`, `agent_events`, and `agent_artifacts` rows are event-sourced projections rebuilt on every save, so they can be regenerated after a schema review without replaying model calls.

Store selection is honest about durability: each store exposes a `persistence` descriptor that flows into the public Run snapshot, so `survivesProcessRestart` only becomes `true` when the D1/R2-backed store is actually active. Conflict semantics (duplicate Run, duplicate Idempotency Key) are identical on both stores, and recovery across a restart is covered by automated tests that resume a failed Run from a brand-new store instance over the same backends.

The D1 metadata path is verified against real SQL: `lib/workflow/node-sqlite-d1.ts` adapts `node:sqlite` to the D1 subset ROOM uses, and integration tests apply the checked-in migration and exercise conflict mapping, event-sourced projections, cascade deletes, cross-instance resume, and metadata-only privacy. These tests run on Node 23.4+ (CI matrix includes Node 24) and skip automatically on older runtimes. Binding real D1/R2 resources remains a deploy-time step.

## Production enablement checklist

Before `survivesProcessRestart` can become true in a deployed environment:

1. Provision and bind D1 and private R2 (`.openai/hosting.json` `d1` / `r2` fields).
2. ~~Implement a D1/R2 `WorkflowStore`, including atomic Idempotency Key creation.~~ Done: `DurableWorkflowStore` + `D1WorkflowMetadataStore` + `R2ObjectStore`, with identical conflict errors on both backends.
3. Encrypt or strictly authorize private object access and enforce Run ownership.
4. ~~Add 24-hour temporary-source cleanup, 30-day metadata retention, and deletion tests.~~ Done: `lib/workflow/retention.ts` plans and applies the policy (terminal runs lose source bodies after 24h, full records after 30 days, active runs never touched), with deletion and resume-rejection tests. Scheduling (Cron Trigger) remains a deploy-time step.
5. Recover a Run after a real Worker restart and verify completed model nodes are not called twice.
6. Move the live Profile Agent shards behind Workflow handlers, with bounded timeout/retry policy.

LangGraph remains deferred. The local typed engine now covers the current linear graph and Profile review interrupt; adoption is reconsidered when multiple interacting interrupts, durable branching repair loops, or replay materially reduce implementation complexity.
