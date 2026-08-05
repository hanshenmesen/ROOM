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
