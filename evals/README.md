# ROOM Profile Agent Eval

This directory contains the Ground-truth Eval contract introduced in Phase 2. It is intentionally separate from `scripts/evaluate-profile-models.mjs`, whose historical completeness score is not an accuracy metric.

## Current status

- The `smoke` dataset contains five fictional, offline cases.
- The `full` dataset composes `smoke` with twenty-five deterministic fictional fixtures, for thirty cases total.
- Two cases are `human-verified`; the remaining three are still `prelabeled`.
- The twenty-five generated breadth and adversarial cases are `prelabeled` and do not count as human-reviewed accuracy data.
- The long-form Markdown case intentionally exposes deterministic parser fragmentation, missing structured fields, and lost section boundaries, including achievements misclassified under education.
- The committed Phase 2 baseline records the historical Prompt Injection failure; Phase 6 quarantine tests and current generated Eval runs verify that the same cases now pass.
- The Phase 2 acceptance target remains 30 human-verified cases, then 50.

## Commands

Run the network-free harness and write JSON and Markdown reports under ignored `outputs/evals/`:

```bash
npm run eval:profile -- --dataset smoke
npm run eval:full
npm run eval:creative
```

Verify that the generated full-dataset fixtures have not drifted, or deliberately regenerate them:

```bash
npm run eval:fixtures
npm run eval:fixtures:update
```

Fail the process when dataset thresholds or critical safety cases fail:

```bash
npm run eval:profile -- --dataset smoke --gate
```

Preflight the controlled baseline-versus-Profile-Agent experiment without making a model call and write a Chinese readiness report:

```bash
npm run eval:experiment:preflight
```

The experiment refuses to spend by default. After reviewing the preflight and configuring a Provider, explicitly allow model calls:

```bash
npm run eval:experiment -- --dataset smoke --allow-model-calls
```

Compare two reports. Higher quality metrics are better; a higher Unsupported Claim Rate is a regression:

```bash
npm run eval:compare -- \
  --baseline evals/reports/smoke-baseline.json \
  --candidate outputs/evals/smoke-profile-agent.json
```

Run the regression gate used by CI. Because both datasets intentionally fail their 100% thresholds today, the gate compares against the reviewed baselines instead: any metric regression, increased failure-category count, or reduced case count fails the run. Improvements require explicit review before `npm run eval:regression:update` promotes new baselines (it refuses while regressions exist):

```bash
npm run eval:regression
```

Check LLM-as-a-Judge calibration (zero model calls). Human and judge scores are paired per sample; each rubric dimension must clear weighted Cohen's kappa and within-one agreement thresholds before judge scores may be quoted. The bundled dataset is synthetic and pre-labeled — it proves the pipeline, not a calibrated judge:

```bash
npm run eval:judge
```

## Dataset contract

- `cases/` contains one `profile-eval-case.v1` JSON file per case.
- `sources/` contains only public, fictional, or explicitly approved source material.
- `datasets/` declares case membership, optional dataset composition, runner, and thresholds.
- `schemas/` documents the case wire contract.
- `creative-retrieval-cases.json` uses `creative-retrieval-dataset.v1` for reference-ranking and License Guard regression.
- `reports/` stores reviewed baselines, never raw private résumés or credentials.

Expected fields are scored only when they are present in Gold. Item matching is deterministic, one-to-one, kind-aware, and title-based. Evidence Accuracy requires both the excerpt and its line locator to resolve to the source. LLM-as-a-Judge is not used by the offline suites. Included datasets retain their original case ownership and review status.

## Human review workflow

For each prelabeled case, compare the source with its case JSON and confirm:

1. Identity values and aliases are complete.
2. Every real project, experience, education, and achievement appears once.
3. Structured fields match explicit source labels only.
4. Expected evidence phrases occur verbatim in the source.
5. Forbidden claims cover known injection or hallucination traps.

After review, change only `reviewStatus` from `prelabeled` to `human-verified`, rerun the smoke Eval, and commit the updated case and report. Real user résumés must be anonymized or kept in an ignored private dataset.
