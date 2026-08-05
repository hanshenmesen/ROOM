# Agent System Baseline

## Purpose

This baseline fixes ROOM's public Pipeline behavior before Agent Eval and recoverable workflow work. It proves that the Phase 1 observability refactor did not change the deterministic Profile, Creative Brief, World, or Check Report artifacts.

## Revisions and environment

| Item | Value |
| --- | --- |
| Reference revision | `5c3acfc` |
| Phase 1 candidate | `f79b9c2` |
| Baseline date | 2026-08-05 |
| Node used for capture | `v24.16.0` |
| npm used for capture | `11.13.0` |
| Declared Node support | `>=22.13.0` |
| Fixture | `fictional-sample-resume.v1` |
| Fixture classification | Public, fictional, safe to commit |

The reference revision was exported to a temporary directory and executed against the same fixture and installed dependencies as the candidate. Neither execution made a network request.

## Compatibility result

The core JSON was serialized in this order: Profile, Creative Brief, World, Check Report.

| Revision | SHA-256 | Profile items | Rooms | Exhibits | Check score |
| --- | --- | ---: | ---: | ---: | ---: |
| `5c3acfc` | `71873d47cd8b9c74ad1c7329025968d5692f67d2b9215437f8a9362a926d1d24` | 13 | 2 | 25 | 100 |
| `f79b9c2` | `71873d47cd8b9c74ad1c7329025968d5692f67d2b9215437f8a9362a926d1d24` | 13 | 2 | 25 | 100 |

The identical digest confirms that the Phase 1 refactor preserved the four public core artifacts. Trace is intentionally compared separately because Phase 1 replaced a static summary with real events.

## Reproduction

```bash
npm run baseline:agent
```

The command regenerates the Pipeline in memory and compares it byte-for-byte with [`docs/baselines/agent-pipeline-v1.json`](./baselines/agent-pipeline-v1.json). Random run IDs, event IDs, call IDs, timestamps, and latency fields are replaced with explicit placeholders. The committed snapshot contains the complete fictional input, versioned core artifacts, aggregated Trace, and normalized run events.

Only after reviewing an intentional contract change should the snapshot be replaced:

```bash
npm run baseline:agent:update
```

Changing the expected core digest requires a reviewed migration or an explicit compatibility decision; updating the snapshot alone cannot bypass the digest guard.

## Validation baseline

The Phase 0 implementation must pass:

```bash
npx tsc --noEmit
npm run lint
npm run baseline:agent
npm test
```

The full test command includes the layout and asset audits, all Node tests, the production build, and the rendered HTML test. Exact final counts are recorded in the Phase 0 commit verification output.

Recorded result on 2026-08-05:

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | Pass |
| `npm run lint` | Pass |
| `npm run baseline:agent` | Pass; expected core digest matched |
| Node test suite | 292 passed, 0 failed |
| Layout and asset audits | Pass |
| Production build | Pass |
| Rendered HTML test | 1 passed, 0 failed |

The production build retains the existing non-blocking warning for client chunks larger than 500 kB; it does not affect the Agent artifact compatibility result.

## Privacy boundary

- No real résumé or private user input is stored.
- The committed source explicitly identifies its person, institutions, experience, and metrics as fictional.
- Snapshot generation rejects credential-like Bearer and `sk-`/`key-` values.
- API keys, Authorization headers, prompt bodies, and browser-session configuration are not baseline fields.
- Large or private future inputs must remain outside Git and use the persistence policy in ADR 0002.
