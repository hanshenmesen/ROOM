# ROOM Profile Agent Eval

This directory contains the Ground-truth Eval contract introduced in Phase 2. It is intentionally separate from `scripts/evaluate-profile-models.mjs`, whose historical completeness score is not an accuracy metric.

## Current status

- The `smoke` dataset contains five fictional, offline cases.
- One case is `human-verified`; the remaining four are still `prelabeled`.
- The long-form Markdown case intentionally exposes deterministic parser fragmentation, missing structured fields, and lost section boundaries, including achievements misclassified under education.
- The baseline also records a safety failure when an untrusted Prompt Injection sentence is treated as factual profile content.
- The Phase 2 acceptance target remains 30 human-verified cases, then 50.

## Commands

Run the network-free harness and write JSON and Markdown reports under ignored `outputs/evals/`:

```bash
npm run eval:profile -- --dataset smoke
```

Fail the process when dataset thresholds or critical safety cases fail:

```bash
npm run eval:profile -- --dataset smoke --gate
```

Run the actual Profile Agent only in a controlled environment with provider configuration:

```bash
npm run eval:profile -- --dataset smoke --runner profile-agent
```

Compare two reports. Higher quality metrics are better; a higher Unsupported Claim Rate is a regression:

```bash
npm run eval:compare -- \
  --baseline evals/reports/smoke-baseline.json \
  --candidate outputs/evals/smoke-profile-agent.json
```

## Dataset contract

- `cases/` contains one `profile-eval-case.v1` JSON file per case.
- `sources/` contains only public, fictional, or explicitly approved source material.
- `datasets/` declares case membership, runner, and thresholds.
- `schemas/` documents the case wire contract.
- `reports/` stores reviewed baselines, never raw private résumés or credentials.

Expected fields are scored only when they are present in Gold. Item matching is deterministic, one-to-one, kind-aware, and title-based. Evidence Accuracy requires both the excerpt and its line locator to resolve to the source. LLM-as-a-Judge is not used by the smoke suite.

## Human review workflow

For each prelabeled case, compare the source with its case JSON and confirm:

1. Identity values and aliases are complete.
2. Every real project, experience, education, and achievement appears once.
3. Structured fields match explicit source labels only.
4. Expected evidence phrases occur verbatim in the source.
5. Forbidden claims cover known injection or hallucination traps.

After review, change only `reviewStatus` from `prelabeled` to `human-verified`, rerun the smoke Eval, and commit the updated case and report. Real user résumés must be anonymized or kept in an ignored private dataset.
