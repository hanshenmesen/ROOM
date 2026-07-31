# Camera Path Clipping Audit — Review Findings & Implementation Brief

Status: review complete, no code changed. This replaces the previous version
of this file, which was written before the Mardou museum integration
(commit `ac677d2`, "Integrate Mardou museum scene and placements"). That
commit already did real work toward geometric validation — this document
reviews what it did, what it's missing, and what to do next.

## What changed since the last review

`components/MardouMuseumLayout.ts` now centralizes every authored camera
position, focus target, and route waypoint as named constants (e.g.
`MARDOU_LOBBY_FOCUS`, `MARDOU_ENTRANCE_ROUTE`, `MARDOU_PRIVATE_ROUTE`), and
`components/WorldCanvas.tsx`'s `CameraRig` (lines 102–303) now reads from
these constants instead of inline hardcoded numbers. `scripts/audit-mardou-layout.mjs`
is a new standalone script that parses the actual GLB
(`public/vendor/mardou/MardouMuseumResult.glb`) by hand, raycasts against its
meshes, and checks that a list of authored points (`verifiedPoints`, lines
256–274) each have floor support and >= 1.2 units of horizontal clearance
from any obstacle mesh. This is real geometric validation against the actual
model, not eyeballing in a browser — a meaningful improvement.

## What I verified by running it

I ran `node scripts/audit-mardou-layout.mjs`: all 31 `verifiedPoints` pass.
I then used the script's own `horizontalClearance()` raycasting approach to
sample points that are **not** in `verifiedPoints` — specifically, straight-
line interpolations between the consecutive waypoints that `CameraRig` uses
for the `exterior → room-lobby` and `room-lobby → room-private` transitions
(`WorldCanvas.tsx` lines 178–225, drawing from `MARDOU_ENTRANCE_ROUTE` and
`MARDOU_PRIVATE_ROUTE`). Finding: the `gallery → lobby-focus-camera` segment
(`[0, 1.5, -8]` → `[-4.408, 1.5, -11.169]`) dips to **0.762** clearance units
around t=0.2 of that segment — well under the script's own 1.2-unit pass
threshold, though not yet inside geometry. Every other sampled segment
(entrance route legs, private route legs) stayed above 1.2 throughout.

## Root cause of the gap

`verifiedPoints` only lists **endpoints** — the camera's resting position at
each focus/room/exhibit state. It does not include the intermediate route
waypoints (`MARDOU_ENTRANCE_ROUTE.outside/threshold/gallery`,
`MARDOU_PRIVATE_ROUTE.ground/stairs/landing`) that `CameraRig` actually
travels through via `THREE.CatmullRomCurve3`, nor any sampled points *along*
those curves. The audit currently proves "the camera is safe wherever it
stops," not "the camera is safe wherever it passes through" — which is
exactly the distinction DESIGN.md's "Path clearance, not just endpoint
clearance" principle calls out, and it's the one gap this integration didn't
close.

Two secondary gaps: (1) `scripts/audit-mardou-layout.mjs` is not wired into
`npm test` (see `package.json` line 12) or any CI workflow — it only runs if
someone remembers to invoke it by hand, so a future edit to
`MardouMuseumLayout.ts` could silently reintroduce a clipping regression;
(2) `lib/agents/checker.ts`'s `connectedRooms()` graph check only knows about
`world.portals` (currently one entry, `room-lobby` ↔ `room-private`, defined
in `lib/agents/orchestrator.ts` line 190) — the exterior-to-lobby front door
crossing, which has the longest and most obstacle-dense camera route in the
scene, isn't represented as a portal at all, so it's invisible to that check.

---

## Prompt for whoever implements this (paste as-is)

**Goal:** Close the "path clearance" gap in the Mardou museum camera system —
guarantee that every authored camera route in ROOM's villa (not just its
resting endpoints) stays clear of the museum's geometry along its full
travel, and make that guarantee self-enforcing so it can't silently regress.

**Tasks, in order:**

1. Extend `scripts/audit-mardou-layout.mjs` to sample *along* each authored
   route, not just at its named endpoints. Concretely: for each of the two
   multi-waypoint transitions in `components/WorldCanvas.tsx`'s `CameraRig`
   (`exterior → room-lobby` using `MARDOU_ENTRANCE_ROUTE`, and
   `room-lobby → room-private` using `MARDOU_PRIVATE_ROUTE`, plus their
   reverse directions), reconstruct the same `THREE.CatmullRomCurve3` the
   runtime uses, sample it at t = 0, 0.1, 0.2, ... 1.0, and run the existing
   `floorAt()` / `horizontalClearance()` checks against every sample point,
   not just the route's named waypoints. Reuse the existing 1.2-unit
   clearance threshold and failure-reporting pattern (see `failures` array
   and the `throw` at the bottom of the script).
2. Fix the specific clearance dip found in this review: the
   `gallery → lobby-focus-camera` segment drops to 0.762 clearance units
   around t=0.2. Once Task 1's sampling is in place and reproduces this
   failure, resolve it by adjusting `MARDOU_ENTRANCE_ROUTE.gallery` or adding
   a new named intermediate waypoint in `MardouMuseumLayout.ts`, then
   updating the corresponding waypoint array in `CameraRig`
   (`WorldCanvas.tsx` lines 178–193) to route around the tight spot instead
   of cutting through it.
3. Wire `scripts/audit-mardou-layout.mjs` into `npm test` in `package.json`
   (currently line 12) so a future edit to `MardouMuseumLayout.ts` or the
   GLB can't silently reintroduce a clipping regression without failing CI.
4. Represent the exterior-to-lobby front-door crossing as a portal in
   `lib/agents/orchestrator.ts` (alongside the existing `portal-1` at line
   190) so `lib/agents/checker.ts`'s room-graph connectivity check actually
   covers it, even though "exterior" isn't a `WorldPlan` room today — if that
   requires a schema change, propose the smallest one that lets the checker
   see this edge rather than reworking the room model.

**Scope constraints:**
- Do not change any authored camera position, FOV, or transition duration
  that Task 1's sampling does not flag as a violation. This is a correctness
  pass on the validation coverage, not a visual redesign.
- Keep the audit script's existing manual GLB-parsing approach (it
  deliberately avoids pulling in `GLTFLoader` / DOM APIs for a Node script);
  don't introduce a new dependency to do this.
- `DESIGN.md`'s "Design principles" section already states the normative
  rule this closes ("Path clearance, not just endpoint clearance" and
  "minimum clearance radius (>= 0.35 m at eye height)" bullets) — implement
  against that text, don't rewrite it.
- Leave `tools/mardou-museum-picker/` (the manual coordinate-picking tool)
  as-is; it's a human-in-the-loop authoring aid, not part of the automated
  check.

**Acceptance criteria:**
- Running `node scripts/audit-mardou-layout.mjs` (or `npm test`, once wired
  in) samples every point along every authored multi-waypoint route, not
  only the named endpoints, and fails loudly (non-zero exit, listed reasons)
  if any sampled point drops below the clearance threshold.
- The specific 0.762-clearance dip on the `gallery → lobby` segment no longer
  reproduces — re-running the extended audit after the fix shows every
  sampled point on that segment at or above the 1.2-unit threshold.
- `npm test` fails if someone reverts the fix or edits
  `MardouMuseumLayout.ts` in a way that reintroduces a sub-threshold segment
  — verify this by temporarily reintroducing the old coordinates locally,
  confirming the test suite fails, then restoring the fix.
- `node --test tests/pipeline.test.ts` and the rest of the existing test
  suite still pass unchanged (32 tests currently pass; no count regression).
- No visual/behavioral change to any camera route that was already
  compliant — diff the full set of authored constants in
  `MardouMuseumLayout.ts` before/after and confirm only the flagged
  waypoint(s) changed.
