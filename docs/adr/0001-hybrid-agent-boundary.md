# ADR 0001: Hybrid Agent Boundary

- Status: Accepted
- Date: 2026-08-05

## Context

ROOM combines model calls, parsing, reference selection, world construction, rendering, and product interactions. Labeling every stage as an Agent makes the system difficult to evaluate and hides which behavior is probabilistic.

## Decision

LLM Agents are limited to ambiguous semantic work:

- Profile extraction shards and bounded repair.
- Website profile extraction, and a future policy-bounded research loop.

Portrait generation and companion Q&A are bounded generative features, not workflow-planning Agents. Source preparation, normalization, profile merge, Creative Retrieval, world orchestration, world checking, storage, and rendering remain deterministic services.

An LLM result becomes usable only after structural validation and normalization. Agents cannot emit renderer coordinates, bypass license policy, mutate another step's artifact, or publish unvalidated claims.

## Consequences

- Eval metrics can target the probabilistic Profile and Website boundaries directly.
- Geometry, safety, and performance remain reproducible.
- Resume descriptions must call deterministic stages services or workflow nodes, not independent Agents.
- A future framework may orchestrate nodes but does not change their ownership or contracts.
