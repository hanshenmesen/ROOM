# ROOM Agent Eval Report

## Status

Phase 2 infrastructure is active, but the dataset is not yet large enough for résumé claims about production accuracy.

- Dataset: `smoke`
- Cases: 5 fictional, offline cases
- Human-verified cases: 1
- Runner: deterministic Pipeline baseline
- Model or network calls: 0
- Report schema: `profile-eval-report.v1`

## Baseline metrics

| Metric | Result |
| --- | ---: |
| Identity Accuracy | 93.3% |
| Item Precision | 83.3% |
| Item Recall | 92.7% |
| Item F1 | 85.2% |
| Structured Field Accuracy | 83.9% |
| Evidence Coverage | 100.0% |
| Evidence Accuracy | 100.0% |
| Unsupported Claim Rate | 0.0% |
| End-to-end Success | 100.0% |

The suite remains **FAIL**. The human-verified Markdown case exposes parser fragmentation, missing structured fields, lost project section boundaries, and achievements misclassified under education. A separate security case also detects a forbidden Prompt Injection claim in the candidate profile.

## Interpretation

The smoke suite proves that the Eval implementation can measure exact identity fields, one-to-one item precision and recall, structured fields, source locators, unsupported claims, cost metadata, and regressions without network access. It now includes one human-verified case, but does not yet establish Profile Agent production accuracy because four cases remain prelabeled and the runner is deterministic.

The first publishable accuracy report requires:

1. Human review of the remaining four smoke cases.
2. Expansion to at least 30 reviewed cases across PDF, image, multilingual, research, engineering, portfolio, conflict, injection, and partial-failure sources.
3. A controlled `profile-agent` run with Provider, Prompt version, Token, latency, fallback, and cost metadata.
4. A baseline-versus-candidate comparison with failure-level evidence.

The machine-readable source of truth is [`evals/reports/smoke-baseline.json`](../evals/reports/smoke-baseline.json).
