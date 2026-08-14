# Recoverable Workflow State

## Scope

Phase 3 introduced a framework-neutral Workflow boundary around the existing `PipelineResult`; Phase 5 adds Profile review interrupts; Phase 6 makes the Run API the product's actual generation path and turns on anonymous local Run recovery. The Run API executes the deterministic Profile → Creative Brief → World → Check path and proves checkpoint, retry, cancellation, review, and observability contracts offline.

The Run API supports the live text/URL/PDF/image LLM path with checkpointed Prepare Source, Identity, Inventory, Website Research, Merge, and Review nodes. `RoomStudio.tsx` drives generation through this API end to end: it creates a Run with `autoStart: false`, saves the returned `runId` to this browser's `localStorage` *before* calling `POST /api/runs/:runId/start`, and on mount checks that saved id against `GET /api/runs/:runId` to resume, restore the review panel, or restore the finished Profile without asking the user anything. There is no user account behind this — an unguessable `runId` saved in one browser is the only "session" anonymous local recovery needs. The legacy `/api/parse` route is unchanged and still used by nothing in the product UI; it remains only as a documented compatibility shape for any external caller that has not migrated. See "Anonymous local Run recovery" below.

## State and nodes

Runs use `room-workflow-state.v3` and move through:

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
  → extract_identity
  → extract_inventory
  → research_website
  → merge_profile
  → review_profile
  → direct_world
  → compile_world
  → check_world
  → complete
```

After every completed node the engine records a checkpoint containing the completed node, the next node, and every available Artifact schema version. A resume finds the first node absent from `completedNodes`; completed handlers are not invoked again. Node attempts and latency are recorded independently.

`prepare_source` is a no-op for text/URL sources. For a PDF or image source it checkpoints the (potentially slow) local file read/extraction: a PDF whose provider lacks document-block support gets ROOM's local `preparsePdf()` text extraction as a `prepared-source` Artifact (so `extract_identity`/`extract_inventory` can run their normal sharded checkpoints against it); a PDF the provider must see rendered, or an image, gets the original attachment carried forward as that same Artifact, and `extract_inventory` makes one un-sharded multimodal call against it. Either way, a later node failure retries without re-uploading or re-parsing the original file.

## Run API

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/api/runs` | Create a Run (JSON text/URL body, or `multipart/form-data` with a `file` field for PDF/image); accepts an `Idempotency-Key` header or body/form field |
| `POST` | `/api/runs/:runId/start` | Start a Run created with `autoStart: false` |
| `GET` | `/api/runs/:runId` | Read a redacted public snapshot |
| `GET` | `/api/runs/:runId/result` | Read the Profile/Merge Report/World Artifact bodies a client needs to actually show a Run's result |
| `GET` | `/api/runs/:runId/events?after=N` | Read ordered events after a sequence cursor |
| `POST` | `/api/runs/:runId/cancel` | Cancel queued, running, or failed work |
| `POST` | `/api/runs/:runId/resume` | Continue queued or failed work from the first incomplete node |
| `POST` | `/api/runs/:runId/review` | Apply all required Profile conflict decisions and continue from the checkpoint |

`POST /api/runs` accepts non-empty text or a public HTTP(S) URL up to 1 MiB (JSON body), or a PDF/JPEG/PNG/GIF/WebP file up to 15 MB (`multipart/form-data`); PDF/image sources always run in `mode: "agent"` since there is no deterministic (LLM-free) way to read a file. `POST /api/runs`'s own `autoStart` defaults to `true` for backward compatibility, but the product UI always passes `autoStart: false` and calls `/start` next, specifically so it can persist `runId` to `localStorage` between the two calls -- see "Anonymous local Run recovery" below. Reusing an Idempotency Key with the same source returns the original Run; reusing it with different input returns HTTP 409.

`GET /api/runs/:runId/result` has no separate ownership check beyond the `runId` format: in this anonymous, single-user deployment the unguessable runId itself is the capability, exactly like every other Run route. It only returns Artifact bodies that already exist on the Run (e.g. `mergeReport` while `waiting_for_review`, `profile`/`world`/`checkReport` once `completed`).

The SHA-256 source hash binds that idempotency decision only. It is not a global résumé cache key: cross-user Artifact reuse is intentionally disabled to avoid membership disclosure and private-data crossover.

Run snapshots expose source type, label, byte/line counts, SHA-256 hash, status, attempts, checkpoints, metrics, failure code, and Artifact type/version metadata. They exclude the résumé body and full Artifact bodies. While a Run is waiting, its snapshot also exposes the bounded candidate values and evidence excerpts needed for that review. Events contain lifecycle metadata only.

## Human review boundary

An extraction or merge node can return both Artifacts and a `profile_conflict` Review Request. The engine first completes and checkpoints that node, then emits `review.requested` and moves to `waiting_for_review`. A normal resume is rejected until every required conflict has exactly one decision.

`POST /api/runs/:runId/review` accepts `primary`, `supplement`, `edit`, or `reject`. Accepted and edited values receive `user-confirmed` evidence, become the new `profile.v1` Artifact, and retain highest priority in later merges. The engine emits `review.completed`, then resumes at the first incomplete node; the extraction node is not called twice.

`POST /api/runs` can opt into `mode: "agent"` (the product UI always does). Identity, Inventory, Website Research, Merge, and Review are separate checkpointed nodes. A failed Inventory call resumes from Inventory without rerunning a completed Identity call; a completed Website Research result is likewise reused by Merge and Review. The legacy `/api/parse` request still exists for compatibility, but the product UI no longer calls it -- both text/URL and PDF/image sources now go through the Run API.

## Anonymous local Run recovery

The product intentionally has no multi-tenant identity: recovery is a transport/storage concern, not an account system. `components/use-workflow-run.ts` implements the minimal contract this requires, and `RoomStudio.tsx` drives it:

1. `createTextRun()`/`createFileRun()` call `POST /api/runs` with `autoStart: false`, then save the returned `runId` to `localStorage` (`room-studio:workflow-run-id:v1`) *before* execution starts. A browser refresh mid-generation loses the in-flight request, not the pointer needed to find the Run again.
2. `startRun()` then calls `POST /api/runs/:runId/start`.
3. On mount (once the provider-config check settles), `RoomStudio.tsx` reads that stored `runId` and calls `GET /api/runs/:runId`:
   - `queued` / `failed` / `running` (execution lease expired) → `resumeRun()` continues from the first incomplete node.
   - `waiting_for_review` → `GET /api/runs/:runId/result` supplies the full Merge Report and the review panel reopens with no re-extraction.
   - `completed` → `GET /api/runs/:runId/result` supplies the finished Profile directly; no Agent call happens.
   - `cancelled` → the stored pointer is cleared and nothing auto-resumes, matching the product decision that a user's cancel must stay cancelled.
4. Any terminal outcome (`completed`, `cancelled`) clears the stored pointer; every other outcome keeps it so a second refresh can try again.

This needs no Run ownership check beyond the `runId` format: in a single-user anonymous deployment, the unguessable id saved in one browser already is the capability. Multi-tenant ownership, if ever needed, is a separate concern layered on top of this same Run API -- see the "not this" boundary in `docs/adr/0002-agent-run-persistence.md`.

## Persistence boundary

`WorkflowStore` isolates orchestration from persistence. Two implementations exist behind the same contract:

- **`InMemoryWorkflowStore`** (default fallback): a bounded, process-global store for at most 100 Runs. It supports multiple requests in one local process or Worker isolate, but it cannot recover after a process restart, isolate replacement, or deployment.
- **`DurableWorkflowStore`**: composes a `WorkflowMetadataStore` (D1) with a `WorkflowObjectStore` (private R2). It is selected automatically by `resolveWorkflowStore()` when the runtime provides both a `DB` D1 binding and a `WORKFLOW_OBJECTS` R2 binding; API routes resolve the engine through `getRoomWorkflowEngine()`. `.openai/hosting.json` now sets `d1: "DB"` and `r2: "WORKFLOW_OBJECTS"`, so `vite.config.ts`'s local binding config gives `vinext dev` a real (miniflare-simulated) D1 database and R2 bucket with no Cloudflare account needed -- Run state now survives a local dev-server restart, not just an in-process refresh. `resolveWorkflowStore()` also runs `lib/workflow/schema-bootstrap.ts`'s `CREATE TABLE IF NOT EXISTS` statements once per process before handing back the durable store, so a freshly bound (including freshly local) D1 needs no separate migration command.

The durable layout mirrors the generated D1 migration:

- `agent_runs` for status, source hashes, idempotency, and lifecycle timestamps.
- `agent_steps` for attempts, checkpoints, latency, and error codes.
- `agent_events` for ordered redacted lifecycle payloads.
- `agent_artifacts` for schema versions and opaque private-object references.
- `eval_runs` for reproducible Eval report references.

D1 intentionally has no source-body, prompt-body, secret, or inline Artifact JSON columns. The full run state (including Artifact bodies), source input, and event log live as three private objects per Run (`state.json`, `input.json`, `events.json`) under a dedicated `workflow/v1/` prefix. `get()` rebuilds the record from these bodies; a missing body fails explicitly as corruption rather than returning a partial record. The ordered event log is the source of truth: `agent_steps`, `agent_events`, and `agent_artifacts` rows are event-sourced projections rebuilt on every save, so they can be regenerated after a schema review without replaying model calls.

Store selection is honest about durability: each store exposes a `persistence` descriptor that flows into the public Run snapshot, so `survivesProcessRestart` only becomes `true` when the D1/R2-backed store is actually active. Conflict semantics (duplicate Run, duplicate Idempotency Key) are identical on both stores, and recovery across a restart is covered by automated tests that resume a failed Run from a brand-new store instance over the same backends. A Run left in `running` by a dead Worker is protected from duplicate execution until its execution lease expires; after expiry, resume takes over at the first incomplete node.

The D1 metadata path is verified against real SQL: `lib/workflow/node-sqlite-d1.ts` adapts `node:sqlite` to the D1 subset ROOM uses, and integration tests apply the checked-in migration and exercise conflict mapping, event-sourced projections, cascade deletes, cross-instance resume, and metadata-only privacy. These tests run on Node 23.4+ (CI matrix includes Node 24) and skip automatically on older runtimes.

Only short-lived Runs are kept: `worker/index.ts` exposes a `scheduled()` Cron Trigger handler that runs `lib/workflow/retention.ts` against the durable store (no-op when D1/R2 are not bound), and `vite.config.ts` registers an hourly local Cron Trigger (`triggers.crons`) once both bindings are active. `wrangler dev --test-scheduled` fires it manually in local dev; a real Cloudflare deployment fires it on schedule automatically.

## Production enablement checklist

Local anonymous Run recovery (this browser, across a `vinext dev` restart) is done: `.openai/hosting.json` binds `d1`/`r2`, `resolveWorkflowStore()` bootstraps the schema and returns a `DurableWorkflowStore`, and `worker/index.ts`'s `scheduled()` handler keeps only short-lived Runs. Before `survivesProcessRestart` can mean the same thing against a *real* Cloudflare deployment (multi-instance, multi-tenant-ready):

1. ~~Provision and bind D1 and private R2 (`.openai/hosting.json` `d1` / `r2` fields).~~ Done locally; provisioning real Cloudflare D1/R2 resources (not the miniflare simulation) for a deployed environment remains a deploy-time step.
2. ~~Implement a D1/R2 `WorkflowStore`, including atomic Idempotency Key creation.~~ Done: `DurableWorkflowStore` + `D1WorkflowMetadataStore` + `R2ObjectStore`, with identical conflict errors on both backends.
3. Encrypt or strictly authorize private object access and enforce Run ownership -- **only needed if/when this becomes a multi-tenant product**; the current anonymous single-user contract deliberately uses the unguessable `runId` itself as the capability instead.
4. ~~Add 24-hour temporary-source cleanup, 30-day metadata retention, and deletion tests.~~ Done: `lib/workflow/retention.ts` plans and applies the policy (terminal runs lose source bodies after 24h, full records after 30 days, active runs never touched), with deletion and resume-rejection tests. ~~Scheduling (Cron Trigger) remains a deploy-time step.~~ Done: `worker/index.ts`'s `scheduled()` handler + `vite.config.ts`'s `triggers.crons`; only binding a *real* Cron Trigger in a deployed environment remains a deploy-time step.
5. Recover a Run after a real Worker restart and verify completed model nodes are not called twice.
6. ~~Move the live Profile Agent shards behind Workflow handlers, with bounded timeout/retry policy.~~ Done for text, URL, PDF, and image Run inputs; `prepare_source` checkpoints PDF/image local extraction, so a later node failure never re-reads or re-parses the original file. `/api/parse` is no longer called by the product UI.

LangGraph remains deferred. The local typed engine now covers the current linear graph and Profile review interrupt; adoption is reconsidered when multiple interacting interrupts, durable branching repair loops, or replay materially reduce implementation complexity.
