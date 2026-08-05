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

Run snapshots expose source type, label, byte/line counts, SHA-256 hash, status, attempts, checkpoints, metrics, failure code, and Artifact type/version metadata. They exclude the résumé body and full Artifact bodies. While a Run is waiting, its snapshot also exposes the bounded candidate values and evidence excerpts needed for that review. Events contain lifecycle metadata only.

## Human review boundary

An extraction or merge node can return both Artifacts and a `profile_conflict` Review Request. The engine first completes and checkpoints that node, then emits `review.requested` and moves to `waiting_for_review`. A normal resume is rejected until every required conflict has exactly one decision.

`POST /api/runs/:runId/review` accepts `primary`, `supplement`, `edit`, or `reject`. Accepted and edited values receive `user-confirmed` evidence, become the new `profile.v1` Artifact, and retain highest priority in later merges. The engine emits `review.completed`, then resumes at the first incomplete node; the extraction node is not called twice.

The live `/api/parse` path uses the same Merge Report and Review UI, but it is still a request-scoped path rather than a durable Run. It holds the provisional Profile in the browser and compiles only after review. Moving expensive live model shards fully behind durable D1/R2 Workflow handlers remains part of production enablement.

## Persistence boundary

`WorkflowStore` isolates orchestration from persistence. The active implementation is a bounded, process-global in-memory store for at most 100 Runs. It supports multiple requests in one local process or Worker isolate, but it cannot recover after a process restart, isolate replacement, or deployment.

The generated D1 migration defines:

- `agent_runs` for status, source hashes, idempotency, and lifecycle timestamps.
- `agent_steps` for attempts, checkpoints, latency, and error codes.
- `agent_events` for ordered redacted lifecycle payloads.
- `agent_artifacts` for schema versions and opaque private-object references.
- `eval_runs` for reproducible Eval report references.

D1 intentionally has no source-body, prompt-body, secret, or inline Artifact JSON columns. Large or sensitive bodies belong in private R2 objects with bounded retention. Because this repository currently has neither D1 nor R2 bound, the schema is a contract rather than an active claim of durability.

## Production enablement checklist

Before `survivesProcessRestart` can become true:

1. Provision and bind D1 and private R2.
2. Implement a D1/R2 `WorkflowStore`, including atomic Idempotency Key creation.
3. Encrypt or strictly authorize private object access and enforce Run ownership.
4. Add 24-hour temporary-source cleanup, 30-day metadata retention, and deletion tests.
5. Recover a Run after a real Worker restart and verify completed model nodes are not called twice.
6. Move the live Profile Agent shards behind Workflow handlers, with bounded timeout/retry policy.

LangGraph remains deferred. The local typed engine now covers the current linear graph and Profile review interrupt; adoption is reconsidered when multiple interacting interrupts, durable branching repair loops, or replay materially reduce implementation complexity.
