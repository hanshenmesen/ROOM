# ADR 0002: Agent Run Persistence

- Status: Accepted for Phase 3 implementation
- Date: 2026-08-05

## Context

Phase 1 uses an in-memory Trace Store. This supports local progress and debugging but cannot guarantee cross-isolate reads, refresh recovery, cancellation, or replay in an Edge deployment.

## Decision

Phase 3 will store run metadata, steps, redacted events, metrics, and artifact references in Cloudflare D1. Large PDFs, images, and large JSON artifacts will use private R2 objects referenced by opaque IDs; they will not be stored directly in D1.

Defaults:

- Raw source files are not persisted unless a recoverable run requires them.
- Temporary source objects expire within 24 hours.
- Redacted run metadata and events expire after 30 days unless the user deletes them earlier.
- Public fictional Eval fixtures and aggregate reports may be retained in Git.
- API keys and browser-session credentials are never persisted.
- Prompt and résumé bodies are excluded from events; artifacts use versioned envelopes.

Access to temporary objects uses short-lived signed or worker-authorized URLs. Deletion removes both the D1 reference and the corresponding object.

## Consequences

- Page refresh and cross-request recovery become possible without storing secrets in checkpoints.
- D1 remains queryable and small; R2 handles bounded binary retention.
- Phase 3 must implement cleanup, authorization, idempotency, and deletion tests before durable storage is enabled.

## Implementation note — 2026-08-05

The repository now contains the D1 schema and generated migration for `agent_runs`, `agent_steps`, `agent_events`, `agent_artifacts`, and `eval_runs`. The schema stores source hashes, redacted event payloads, metrics, schema versions, and opaque storage references; it has no columns for résumé bodies, prompt bodies, API keys, Authorization headers, or inline artifact JSON.

Durable storage is not active yet. `.openai/hosting.json` still declares `d1: null` and `r2: null`, so the current Workflow API uses a bounded in-memory adapter and reports `survivesProcessRestart: false`. A D1/R2 adapter, object cleanup, authentication, and ownership checks remain required before changing that flag.

## Implementation note — anonymous local Run recovery

Recovery capability and multi-tenant identity are separate concerns; this repository only needs the former today. `.openai/hosting.json` now sets `d1: "DB"` and `r2: "WORKFLOW_OBJECTS"`, so `vite.config.ts`'s local binding config gives every `vinext dev` run a real (miniflare-simulated) D1 database and R2 bucket — no Cloudflare account required. `resolveWorkflowStore()` bootstraps the four Workflow tables (`lib/workflow/schema-bootstrap.ts`, idempotent `CREATE TABLE IF NOT EXISTS`) before handing back a `DurableWorkflowStore`, so a freshly bound D1 needs no separate migration command.

`RoomStudio.tsx` now drives generation entirely through the Run API (`components/use-workflow-run.ts`): it creates a Run with `autoStart: false`, saves the returned `runId` to this browser's `localStorage` *before* calling `/start`, and on mount resolves a stored `runId` against `GET /api/runs/:runId` — resuming `queued`/`failed`/`running`, reopening the review panel for `waiting_for_review`, or restoring the finished Profile for `completed` without ever asking who the user is. The legacy `/api/parse` route is untouched but is no longer called by the product UI; both text/URL and PDF/image sources go through the Run API, with PDF/image local extraction now checkpointed by a `prepare_source` node so a later failure never re-reads or re-parses the uploaded file. `worker/index.ts` exposes a `scheduled()` Cron Trigger handler (paired with `vite.config.ts`'s hourly `triggers.crons`) that runs `lib/workflow/retention.ts`, so only short-lived Runs are kept.

This remains anonymous by design: there is no Run ownership check beyond the `runId` format, because the unguessable id saved in one browser already is the capability in a single-user deployment. Encrypting/authorizing private object access and enforcing Run ownership (checklist item 3 in `docs/WORKFLOW_STATE.md`) stays deferred until — if ever — this becomes a multi-tenant product; it is not required for local recovery to work.
