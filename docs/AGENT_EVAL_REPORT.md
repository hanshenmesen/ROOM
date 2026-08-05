# ROOM Agent Eval Report

## Status

Phase 2 infrastructure now has a thirty-case offline breadth suite, but it is not yet evidence for Profile Agent production accuracy.

- Datasets: `smoke` (5) and composed `full` (30)
- Cases: 30 fictional, offline cases
- Human-verified cases: 2
- Runner: deterministic Pipeline baseline
- Model or network calls: 0
- Profile Agent experiment: blocked until a Provider is configured and model calls are explicitly allowed
- Report schema: `profile-eval-report.v1`

## Full deterministic baseline metrics

| Metric | Result |
| --- | ---: |
| Identity Accuracy | 98.9% |
| Item Precision | 93.9% |
| Item Recall | 95.5% |
| Item F1 | 94.2% |
| Structured Field Accuracy | 95.6% |
| Evidence Coverage | 100.0% |
| Evidence Accuracy | 100.0% |
| Unsupported Claim Rate | 0.0% |
| End-to-end Success | 100.0% |

The suite remains **FAIL** by design. It reproduces long-Markdown fragmentation, missing achievement items, bilingual section loss, and Talk/Exhibition kind mismatches. The three historical Prompt Injection failures were removed by the Phase 6 deterministic quarantine boundary and now pass; the committed Phase 2 reports remain the pre-fix comparison baseline. These failures are deterministic parser defects, not claims about the LLM Profile Agent.

## Interpretation

The composed full suite proves that the Eval implementation can scale exact identity checks, one-to-one item matching, structured fields, source locators, unsupported claims, cost metadata, failure classification, and dataset composition to thirty reproducible cases without network access. Twenty-eight cases remain prelabeled and every new case is synthetic text, so these numbers must not be presented as model accuracy.

The first publishable accuracy report requires:

1. If résumé accuracy will be claimed publicly, replace or supplement synthetic fixtures with at least 30 reviewed cases.
2. Add real PDF, image, website, multi-source conflict, inaccessible-page, and partial-failure inputs; the current case schema is text-only.
3. Configure a controlled Provider and run `npm run eval:experiment -- --dataset smoke --allow-model-calls` with Prompt, Token, latency, fallback, and cost metadata.
4. Promote the model experiment to `full` only after the smoke cost and failure report is acceptable.

Machine-readable sources of truth: [`evals/reports/smoke-baseline.json`](../evals/reports/smoke-baseline.json) and [`evals/reports/full-baseline.json`](../evals/reports/full-baseline.json).

## Website Research comparison capability

Phase 4 adds an offline comparison contract for single-page and bounded multi-page website extraction. It reports expected-title Recall, Recall delta, visited pages, downloaded bytes, Tool calls, Tool latency, model calls, and Provider token usage when supplied. The fixture proves that a root page with no projects can discover supported project and publication pages while external, local-network, and private links do not enter the plan.

This is a capability test, not a production benchmark. It uses a fictional in-memory website graph and an injected deterministic submitter, so it does not claim real-model website accuracy or real-network latency. A publishable comparison still requires reviewed multi-page websites and an explicitly authorized Provider experiment.

## Creative Retrieval Eval

Phase 7 adds a 10-case, network-free Creative Retrieval dataset covering English and Chinese lexical matching, metadata categories, visual-inspiration policy, and quarantined implementation references. The current 13-entry catalog reaches Recall@3 100%, Precision@3 60%, nDCG 100%, license violations 0%, and Creative Brief citation integrity 100%.

These labels are prelabeled, and citation integrity proves catalog provenance rather than causal design quality. The report therefore supports regression and licensing decisions, not a claim that users prefer the selected aesthetic. Because the catalog is below 200 entries and lexical Recall is above threshold, the evaluated decision is not to introduce embeddings or a vector database. Machine-readable source: [`evals/reports/creative-retrieval-v1.json`](../evals/reports/creative-retrieval-v1.json).
