# Profile Conflict and Human Review

## Why this boundary exists

Résumé and website Agents can both be individually well-grounded while disagreeing about a current title, project role, date, or URL. ROOM therefore treats multi-source merge as a decision process, not object spreading. A provisional value may be selected for continuity, but a high-risk disagreement cannot enter the compiled world without an explicit resolution.

## Claim and report contracts

`EvidenceBackedClaim<T>` carries the value, bounded confidence, source evidence, source priority, and extraction method. Confidence here is a deterministic policy signal: direct evidence is stronger than an unsupported inference, while a user-confirmed value is exactly `1` and has priority `1000`. It is not presented as calibrated model probability.

`mergeProfilesWithReport()` returns `profile-merge-report.v1` with:

- the provisional merged Profile;
- automatic decisions and reasons;
- required conflicts with both candidate Claims and evidence;
- an explicit `reviewRequired` gate.

Summary selection no longer uses string length as a proxy for correctness. Low-risk differences follow evidence and source priority. Same-valued Claims merge their evidence.

## Review triggers

Required review currently covers:

- conflicting name, headline, location, or personal website;
- conflicting time range, role, or project URL on the same matched item;
- a key field or tech stack with no direct evidence;
- a phone-like contact before it becomes public;
- a profile photo or project cover mapped below `0.55` confidence.

Profiles that are structurally invalid beyond a field-level correction remain hard failures. The system does not pretend that a generic approval can repair malformed object structure or a missing item inventory.

## Resolution and precedence

The reviewer can accept either source, edit a value, reject an optional field, and expand every evidence excerpt. `resolveProfileMergeReview()` requires exactly one decision for every required conflict and revalidates the resulting Profile.

An accepted or edited field receives evidence with:

```text
sourceId: user-review
locator: user:<stable-conflict-id>
origin: user-confirmed
```

Later merges detect that origin as `extractionMethod: "user"`; neither source priority nor a later Agent output may replace it automatically.

## Workflow behavior

The typed Workflow engine checkpoints the node that produced the Merge Report, emits `review.requested`, and enters `waiting_for_review`. Review submission replaces the Profile Artifact, records a redacted history summary, emits `review.completed`, and resumes from the next incomplete node. Public snapshots reveal the active conflict evidence needed for the decision, but not the résumé body or full Profile Artifact.

The production `/api/parse` response uses the same report and browser Review panel. It avoids compiling or saving the provisional Profile until review completes. Durable recovery across process restarts still depends on the planned D1/R2 Workflow store.
