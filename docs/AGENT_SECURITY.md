# Agent Security, Reliability, and Cost Boundary

## Threat model

ROOM treats résumé text, uploaded documents, portfolio HTML, links, model responses, Tool output, chat questions, and browser-supplied Provider settings as untrusted. The protected assets are server-side credentials, internal network services, private Room content, public Profile integrity, bounded compute spend, and recoverable Agent execution.

The Phase 6 red-team suite lives in `tests/security/` and runs without API keys or real model calls. Each scenario must fail closed and terminate deterministically.

| Threat | Deterministic control |
| --- | --- |
| Source or page Prompt Injection | Instruction-like textual lines are quarantined before deterministic parsing or textual LLM submission; line count is preserved for evidence locators. System prompts still mark every text, PDF, and image source as untrusted. |
| Arbitrary Tool name or arguments | Website tools are selected by a deterministic allowlisted loop, use closed schemas, and never dispatch names from page or model text. Malformed Profile tool output must pass shard validation. |
| SSRF and unsafe redirects | Scheme, credentials, ports, literal addresses, every redirect target, and DNS A/AAAA answers are checked before fetch. Website research remains same-host. |
| Oversized or slow input | JSON, upload, source-character, per-page, total-byte, model-input, output-token, and timeout limits stop processing. |
| Secret leakage | Trace fields are allowlisted summaries and recursively redacted before storage. Prompt bodies, source bodies, request headers, and credentials are not Trace fields. |
| Hallucinated Companion citation | `itemId`, normalized title, and excerpt are verified against the cited Profile Item's Evidence after the model response. Invalid citations are removed; an answer whose cited support is entirely invalid becomes a refusal. |
| Private-data inference | Companion context is a field allowlist built only from public `ParsedProfile`; explicit diary, guestbook, password, private-message, and private-photo requests are refused before a Provider call. |
| Runaway Provider failure | Each Profile Run has a shared call/token/output/cost/time budget, a three-failure circuit breaker, bounded exponential backoff, and request cancellation. |
| Duplicate execution | Workflow creation supports Idempotency Keys bound to a source hash; reuse with different source input is rejected. |
| Resource exhaustion by one client | Parse and Companion routes use privacy-preserving, process-local per-client concurrency leases and return HTTP 429 when full. |

## Default model budget

A Profile Agent Run reserves budget before every Provider call. Reservation is conservative: textual input uses a character-based token estimate; document/image blocks receive a fixed estimate; output tokens use the request maximum. Provider-reported usage remains the measured value in Trace.

- 16 model calls.
- 600,000 estimated input tokens.
- 160,000 reserved output tokens.
- USD 20 conservative estimated maximum.
- 240 seconds wall-clock duration.
- Three consecutive transient failures before the per-Run Provider circuit opens.
- Exponential retry delay starts at 50 ms and is capped at 400 ms.

Tests may lower limits but callers cannot bypass the shared reservation within a Run. A budget stop emits `budget.exhausted` with aggregate counts, not prompts or source content.

Website research has an independent navigation budget documented in [Website Research Agent](./WEBSITE_RESEARCH_AGENT.md). Companion QA allows at most three model calls and reserves at most 1,000 output tokens per attempt.

## Abort, timeout, and partial failure

The incoming request signal is combined with Provider and public-web timeouts. A client disconnect or explicit abort cancels pending model/network work. Profile shards run concurrently but share one budget and one circuit breaker, so parallel retries cannot create an unbounded fan-out. Website research may return an already-inspected partial Profile when a navigation budget is reached; root-page failure still fails the research step.

## DNS boundary

The public-web fetcher performs A and AAAA preflight resolution through DNS-over-HTTPS and rejects any private, loopback, link-local, reserved, multicast, or documentation-range answer. It repeats URL authorization and DNS checks after every redirect.

This closes deterministic DNS-to-private cases but does not cryptographically pin the later Edge `fetch` connection to the preflight answer. A DNS response can change between validation and connection. High-assurance deployment for arbitrary domains still requires a controlled egress proxy that resolves, validates, and pins the destination. This residual risk is explicit rather than represented as fully solved.

## Source hash and privacy policy

Workflow source hashes exist only to bind Idempotency Keys and expose reproducible metadata. ROOM does not use a global cross-user résumé cache: doing so could leak document membership or return one user's private Artifact to another. Source bodies and Artifact bodies remain private, are excluded from public snapshots, and will require ownership checks plus bounded retention before D1/R2 persistence is enabled.

Process-local concurrency hashes are derived from network/client headers, truncated, and discarded when the last request finishes. Raw IP addresses and user-agent strings are not stored by the limiter.

## Verification

`npm test` includes these offline red-team classes:

- Prompt Injection and Tool-output injection.
- Literal/DNS SSRF and redirect chains.
- Oversized text, PDF preparse, and HTML response metadata.
- Trace secret redaction.
- Companion citation integrity and private-data isolation.
- Model call/Token budget exhaustion and Provider circuit breaking.

These are implementation guarantees, not claims that arbitrary model behavior or arbitrary Internet content is safe. New Provider, Tool, persistence, or private-data integrations must add a red-team case before entering the public Agent context.
