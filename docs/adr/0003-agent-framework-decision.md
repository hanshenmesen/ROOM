# ADR 0003: Defer Agent Framework Adoption

- Status: Accepted
- Date: 2026-08-05

## Context

The current Profile Agent needs parallel shards, bounded retries, provider fallback, validation, and Trace. These capabilities are implemented with small typed modules and do not require a framework. Adding LangGraph now would increase runtime and migration complexity before Eval identifies workflow bottlenecks.

## Decision

ROOM will not introduce LangGraph or an equivalent framework during the Trace or Eval phases. Business nodes will remain framework-neutral behind a future `WorkflowEngine<State>` boundary.

The decision is revisited only after Ground-truth Eval exists and Phase 3 needs at least one of these capabilities in production:

- Cross-request checkpoints and node-level recovery.
- Human interrupts that resume from the prior checkpoint.
- Branching repair loops or workflow replay that are measurably simpler with a framework.

Any candidate must run in the Cloudflare Worker/Edge environment, preserve current artifact contracts, support D1/R2 persistence through adapters, and demonstrate a maintenance benefit over the local engine.

## Consequences

- Phase 2 measures the current architecture instead of combining a framework migration with Prompt changes.
- Framework vocabulary is not used to exaggerate deterministic services as Agents.
- Phase 3 can begin with a local workflow engine and adopt a framework later without rewriting business nodes.
