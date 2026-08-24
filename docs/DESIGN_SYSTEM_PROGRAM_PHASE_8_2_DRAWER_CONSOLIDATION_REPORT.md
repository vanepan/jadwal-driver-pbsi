# Phase 8.2 — Canonical Drawer Consolidation Report

**Scope:** Migrate hand-rolled drawer-like overlays onto the canonical
`js/components/drawer.js` primitive established in Phase 2. Audit-first,
migration-map-first, per the phase brief. Two of the four candidate modules were
migrated (Decision Replay, Driver Wellness); two were investigated in full and
explicitly deferred (Engineering Detail, Gudang Item/Asset Detail) because
migrating them requires solving a real architectural mismatch, which the brief's
own STOP condition says to report rather than force.

**Status:** Implementation + hostile review + verification complete, **NOT
committed, NOT pushed, NOT deployed**, matching every prior phase in this
program.

---

## 1. Initial drawer inventory

A full audit of `js/components/drawer.js` (the canonical primitive) and all 4
candidates found:

- **Canonical `drawer.js`** is well-built (real Tab-trap, Escape, focus
  restoration, mobile bottom-sheet with its own swipe-dismiss, a documented
  stale-overlay-race guard for the "replace while still open" case) but has real
  gaps: no body-scroll lock at all; `setDrawerBusy(true)` disables buttons but
  does **not** block backdrop-click/Escape from still closing mid-action; none of
  `isDirty`/`setDrawerLoading`/`setDrawerBusy`/`showDrawerError`/`refreshDrawerBody`
  had any real caller before this phase (confirmed by repo-wide grep — every one
  was unexercised in production).
- **Decision Replay + Driver Wellness**: pure-render over already-computed
  models, zero Firebase calls inside either drawer file, missing focus-trap /
  initial-focus / focus-restoration the canonical drawer already has, and
  carrying the exact stale-overlay-id race pattern the canonical drawer's
  existing guard was built for — but (as hostile review found, §15) that
  existing guard only covered one half of the race.
- **Engineering Detail**: a zero-state pure string-template function; all
  state/listeners/Firebase-writes/confirm() dialogs live in the caller
  (`engineering-center.js`), delegated through one `host`-level listener set.
- **Gudang Item/Asset Detail**: same delegation architecture as Engineering,
  plus it directly owns 3 async data-loaders and 2 Firebase-backed mutations.

Full detail with exact file:line citations is in the approved implementation
plan and the migration map (§ below).

## 2. Migration map

See `docs/DESIGN_SYSTEM_PROGRAM_PHASE_8_2_DRAWER_MIGRATION_MAP.md` — written
before any code changes, per the brief's requirement.

## 3. Canonical drawer capabilities used

`openDrawer({title, subtitle, icon, body, footer, onAction, onClose})` for both
new consumers. Neither uses `isDirty` (no unsaved state — both are read-only
reports), `loading` (no async load after open — the model is fully built before
`open*Drawer()` is called), or `sourceEl` (decision-replay's trigger is inside an
already-fully-covered modal; driver-wellness's optional enhancement was
considered and deliberately not taken, to keep the migration's behavior delta
minimal — see the plan). `footer` + `onAction` is used for the declarative "Tutup"
button on both; Decision Replay additionally appends its stateful export-menu
widget directly into `.drawer__foot` post-open, since it doesn't fit the
declarative `data-drawer-action` shape and forcing it there would have been an
unforced rewrite.

**The canonical primitive itself was not extended** — no new capability was
added to its public API. The one change to `drawer.js` (§15) is an internal
race-condition fix, not a new capability.

## 4. Each migrated consumer

**Decision Replay** (`js/components/decision-replay-drawer.js`): `buildSheet()`
split into `buildBodyContent(model)` (all 9 explainability sections, unchanged
logic) + `buildRecommendationSummary(model)` (the relocated hero block) +
`buildExportMenu(model, opts)` (the stateful export widget). `openDecisionReplayDrawer(model, opts)` now calls `openDrawer({...})` then
synchronously appends the body fragment and export menu into the returned
overlay — same tick, no flash of empty content. `openDecisionReplay(input, opts)`
(the convenience wrapper most callers use) is unchanged in signature and
behavior.

**Driver Wellness** (`js/components/driver-wellness-drawer.js`): same treatment,
minus the export menu (this drawer has never had one). `openDriverWellnessDrawer(driver)`'s signature is unchanged.

## 5. Feature behavior preserved

Verified, not assumed:
- All 10 Decision Replay sections + hero + export menu (PDF/Excel, wired to
  `opts.onExport`) + expandable ranking rows — `scripts/decision-replay-dom-check.mjs`, 30/30 pass.
- All 9 Driver Wellness sections + hero + both risk meters (Fatigue/Burnout,
  distinct captions) + explainability-points-sum-to-health-score invariant —
  `scripts/driver-wellness-dom-check.mjs`, 48/48 pass.
- Zero Firebase/business-logic files touched — `decision-replay-service.js` and
  `driver-wellness-service.js` are untouched (not in this phase's diff at all).

## 6. CSS consolidation

Shell rules deleted from both files' injected `<style>` blocks (`.drx-overlay`/
`.drx-sheet`/head/foot container rules, generic footer-button styling, the
mobile-width media query) — now exclusively owned by `platform.css`'s `.drawer*`
block. Content-specific rules kept in each file's own `ensureStyles()`/`STYLE_ID`
pattern (confirmed as the real Phase-2-native precedent: `vehicle-detail-drawer.js`
still does exactly this for its `.vad-*` classes, rather than moving content CSS
into `platform.css`). A **real, previously-unflagged risk** — the canonical
`.drawer` panel (`min(440px, 92vw)`) is ~120px narrower than both hand-rolled
sheets' old `min(560px, 100%)` — was verified with a real browser-measured
row-overflow check at 1280px for both drawers: **zero rows overflow the narrower
panel** (`scripts/decision-replay-dom-check.mjs` and `driver-wellness-dom-check.mjs`,
each with a dedicated `panelOverflow` assertion + screenshot).

## 7. Focus / accessibility

MEASURED (real browser, `scripts/drawer-consolidation-check.mjs`): initial focus
lands on the canonical close button; Shift+Tab from the first focusable element
stays trapped inside the panel; focus restores to the real triggering DOM
element after the ~260ms close animation. Both consumers gained a real focus
trap + initial focus + focus restoration they never had before — a strict
accessibility upgrade, not a regression. One small, bundled a11y improvement:
Decision Replay's ranking-row expand/collapse toggle now syncs `aria-expanded`
alongside its existing `data-expanded` (verified via a dedicated check in the
dom-check script).

## 8. Mobile behavior

MEASURED at 375/390/402/430px: drag-handle grabber visible (bottom-sheet
layout engaged), panel never exceeds viewport width, zero horizontal overflow,
zero console errors at every width — `scripts/drawer-consolidation-check.mjs`.

## 9. Motion integration

Both drawers now animate via the canonical `--drawer-dur`/`--drawer-ease`
(200ms `cubic-bezier(.4,0,.2,1)`) instead of their old independent
`.32s cubic-bezier(.32,.72,0,1)` — this is the intended consolidation outcome
(Phase 8's own §11: "Do NOT create separate timing curves... unless a verified
feature-specific interaction genuinely requires it" — neither did). MEASURED:
`[data-anim="off"]` and `prefers-reduced-motion: reduce` both collapse the
panel's `transition-duration` to ~0 while the drawer still functionally opens
(`is-open` class still applied, content still interactive) — confirming
suppressed decorative motion never breaks usability.

## 10. Race-condition testing

This is where hostile review found and fixed a real, pre-existing defect — see
§15. Explicitly tested and MEASURED, all passing after the fix:
- Open → close immediately → reopen, 5x back-to-back with no `await`s: exactly
  one `#appDrawerOverlay` survives, no duplicates.
- Open drawer A → open drawer B without closing A first (single-instance
  replace path): exactly one overlay, content correctly shows B.
- The specific race the fix targets — close() called, then a **fresh**
  `openDrawer()` call (not a caller-driven replace) within the ~260ms
  deferred-removal window: exactly one overlay survives; the **superseded**
  close's `onClose` does **not** fire; the **new** drawer's own close later
  fires its `onClose` exactly once.

## 11. Event-listener cleanup

MEASURED via an instrumented `document.addEventListener`/`removeEventListener`
spy across 10 clean open/close cycles: **net keydown listener count is exactly
0** — every registration is paired with a removal, no accumulation.
(`scratch/hostile-review-drawer-listener-audit.mjs`.)

## 12. Theme testing

Screenshotted in both light and dark for both migrated drawers (desktop 1280px):
canonical header, relocated hero block, all sections, and (for Decision Replay)
the Tutup + Export button pair all render correctly with no hard-coded colors —
both drawers' content CSS was already fully `var(--*)`-based (verified: the
existing `noHardWhite` regex assertion in both dom-check scripts still passes).

## 13. Reduced-motion testing

See §9 — MEASURED for both `[data-anim="off"]` and OS-level
`prefers-reduced-motion: reduce`, both independently confirmed to suppress the
panel transition while preserving full interactivity.

## 14. Performance measurements

MEASURED (`scratch/measure-drawer-8-2-performance.mjs`, 8-sample median/average,
headless Chromium):

| | Open (median) | Open (avg) | Close (median) | Close (avg) |
|---|---|---|---|---|
| Decision Replay | 32.7ms | 53.0ms | 17.7ms | 16.5ms |
| Driver Wellness | 32.1ms | 38.2ms | 17.6ms | 17.7ms |

A real Chrome trace of one full open+close cycle: **6.83ms total style recalc
(22 events), 3.79ms layout, 6.00ms paint, zero long tasks (>50ms)**. These are
healthy numbers for a drawer carrying 9-10 content sections each — well under
any perceptible-jank threshold, and the close-side numbers are dominated by the
intentional 200ms CSS transition, not script cost.

No formal before/after comparison against the old hand-rolled mechanism was
captured (the old code no longer exists to re-measure), but the old mechanism's
own `.32s` transition was strictly slower by design than the canonical `.2s` —
the motion consolidation is a net timing improvement by construction, not just
inference.

## 15. Hostile review findings

Performed a genuine adversarial pass per the brief's §23 checklist before
declaring completion. One real defect found and fixed; everything else checked
out clean:

- **REAL DEFECT, FIXED**: `js/components/drawer.js`'s existing stale-overlay
  guard (`if (_activeOverlay) {...}` in `openDrawer()`) only covers the
  "caller replaces without ever calling `closeDrawer()`" path. It does **not**
  cover a genuine `closeDrawer()` call followed by a **fresh** `openDrawer()`
  call inside the ~260ms deferred-removal window — `closeDrawer()` nulls
  `_activeOverlay` synchronously (by design, so a "nothing is open" check is
  immediately accurate), so the guard sees nothing to replace and appends a
  second `#appDrawerOverlay` element while the first is still mid-fade-out.
  This is a **pre-existing latent bug in the canonical primitive**, not
  something this migration's content changes introduced — it existed for the
  original 2 consumers too, just less likely to be exercised by their
  particular interaction patterns. Fixed with a small, self-contained,
  backward-compatible sequence-token guard (`_closeSeq`): `openDrawer()` now
  also hard-removes any lingering `OVERLAY_ID` element and invalidates any
  in-flight deferred close; `closeDrawer()`'s deferred cleanup checks it still
  owns the current sequence before firing `onClose`/restoring focus, so a
  superseded close becomes a no-op instead of corrupting the newer drawer's
  state. Re-verified against **both** the 2 new consumers (52/52 in
  `drawer-consolidation-check.mjs`) **and** the 2 pre-existing production
  consumers (`scratch/verify-modal-drawer.js`, `scratch/verify-vehicle-drawer-tabs.js`
  — both re-run clean, zero regressions, including Assignment Detail's own
  "Option A" close-then-reopen flow which exercises this exact code path in
  production today).
- Duplicate drawer IDs: none, in every tested scenario including the race above.
- Duplicate backdrops: none — single-instance model confirmed to hold.
- Orphaned overlays: none — DOM node count returns to 0 after every close,
  including raced ones.
- Stale event listeners: none — §11, net 0 across 10 cycles.
- Stale async callbacks: not applicable — neither migrated drawer performs
  async work after open.
- Broken focus restoration: none — §7.
- Broken Escape behavior: none — Escape closes correctly in every test session.
- Drawer reopening with stale content: none — single-instance replace was
  explicitly verified to show the *new* drawer's content, not the old one's.
- Dirty-state bypass: not applicable — neither consumer sets `isDirty` (no
  unsaved state exists in either drawer).
- Mobile overflow: none — §8.
- Theme mismatch: none — §12.
- Reduced-motion mismatch: none — §13.
- Duplicate Firebase operations: not applicable — no Firebase calls in either
  migrated file.
- Duplicated CSS: the shell-level duplication that motivated this phase is
  gone; content CSS between the two files uses disjoint `drx-`/`dwd-` prefixes,
  no duplication between them.
- Dead imports: none found — every import in both migrated files is used.
- Stale class names: repo-wide grep for `.drx-x`, `.dwd-x`, `.drx-foot`,
  `.dwd-foot`, `.drx-head`, `.dwd-head`, `.drx-btn--ghost`, `.dwd-btn` (all
  removed shell classes) returns zero matches anywhere in the codebase.
- Old drawer implementation references: repo-wide grep for `decisionReplayDrawer`
  and `driverWellnessDrawer` (the old root element ids) returns zero matches
  anywhere — no stale references survive in JS, CSS, or HTML.
- **A secondary, non-defect finding investigated and closed**: an initial
  hostile-review test appeared to show `closeDrawer()`'s bare call not firing
  an `onClose` that was registered via a preceding `openDrawer({onClose})`
  call. Traced to the correct, existing API contract (not a bug): `onClose`
  passed to `openDrawer()` is captured by *that specific call's*
  `requestClose()` closure and only fires via the backdrop/close-button/Escape
  paths — a direct `closeDrawer()` call is intentionally independent and needs
  its own `onClose` argument if the caller wants one fired programmatically.
  Confirmed this is already correctly worked around by the real, shipped
  Assignment Detail consumer (`js/modal.js:917-920`'s `closeDetailModal()`
  resets `viewingId` itself rather than relying on this path). Neither of this
  phase's 2 migrated consumers pass `onClose` at all, so the nuance doesn't
  affect them. No fix needed or made; documented here for future reference.

## 16. Regression results

- `scripts/decision-replay-dom-check.mjs`: **30 passed, 0 failed** (selectors
  updated for the canonical shell; one selector fragility fixed along the way —
  a positional `:first-of-type` lookup that broke once the hero block became a
  preceding sibling, replaced with a title-based lookup, which is more robust
  regardless of DOM restructuring).
- `scripts/driver-wellness-dom-check.mjs`: **48 passed, 0 failed** (selectors
  updated).
- `scripts/drawer-consolidation-check.mjs` (new): **52 passed, 0 failed** —
  static architecture (13 checks) + deferred-pair-untouched (4 checks) +
  real-browser single-instance/race/focus/layering/motion/mobile (35 checks).
- `scratch/hostile-review-drawer-listener-audit.mjs` (new): **8 passed, 0
  failed**.
- `scratch/verify-modal-drawer.js` (pre-existing, Assignment Detail): re-run
  clean, exit 0, zero page errors — confirms the `drawer.js` race fix doesn't
  regress the original production consumer, including its own close-then-reopen
  ("Option A") flow.
- `scratch/verify-vehicle-drawer-tabs.js` (pre-existing, Vehicle Detail):
  re-run clean, exit 0, zero failure markers.
- `scripts/executive-motion-polish-check.mjs`: **16 passed, 0 failed** (frozen
  Executive Command Center, re-run as a regression guard since drawer CSS is
  shared surface — zero change).
- `scratch/verify-motion-8-1.mjs`: **35 passed, 0 failed** (Phase 8.1 motion
  tokens, re-confirmed untouched).
- `scratch/verify-rail-hover-debounce.mjs`: **4 passed, 0 failed**.

No existing assertion was weakened or deleted anywhere in this process. Two
dom-check scripts had their selectors *updated* (a required, expected
consequence of the shell migration, not a weakening — see the migration map),
and one had a genuinely fragile selector *improved* to be structure-independent.

## 17. Files changed

- `js/components/decision-replay-drawer.js` — restructured onto the canonical
  shell; content/business logic unchanged.
- `js/components/driver-wellness-drawer.js` — same treatment.
- `js/components/drawer.js` — one targeted fix (the `_closeSeq` race guard,
  §15); no new public capability, no signature changes.
- `js/app.js` — import changes (`closeDecisionReplayDrawer` dropped, `closeDrawer`
  added); `closeApproveRequestModal()` now calls `closeDrawer()`.
- `scripts/decision-replay-dom-check.mjs`, `scripts/driver-wellness-dom-check.mjs`
  — selectors updated to the canonical shell; added panel-width-overflow and
  `aria-expanded` assertions.
- New: `scripts/drawer-consolidation-check.mjs`,
  `scratch/hostile-review-drawer-listener-audit.mjs`,
  `scratch/measure-drawer-8-2-performance.mjs`.
- **Not touched**: `js/engineering/ui/engineering-drawer.js`,
  `js/engineering/ui/engineering-center.js`,
  `js/gudang/ui/gudang-item-detail.js`, `js/gudang/ui/gudang-center.js` —
  mechanically confirmed via `git diff --quiet` in the consolidation check.

## 18. Deferred items

**Engineering Detail** and **Gudang Item/Asset Detail** — full reasoning in the
migration map. Recommended prerequisite for a future phase (8.2b, sequenced so
there's exactly one hand-rolled pair left to solve for): extend `drawer.js` with
an opt-in **externally-delegated events mode** (e.g. `openDrawer({...,
delegateTo: hostEl})`) so a caller with its own established delegation pattern
doesn't need the canonical primitive's own `[data-drawer-action]` handling —
needs a real design decision (re-dispatch matched events up to `hostEl`, vs.
appending the overlay inside `hostEl`'s own subtree instead of `document.body`)
that is out of scope for an infrastructure-migration-only phase. Gudang
additionally needs a documented "refresh-open-drawer-on-every-render" pattern:
`refreshDrawerBody()` wired into each async-loader completion callback, guarded
by a new `isDrawerOpen(idPredicate)` export so a stale callback (e.g. an old
`ensureAssetHistory` load finishing after the user switched to a different
drawer) can't clobber the wrong open drawer's content.

Also carried forward from Phase 8.1's own deferred list (unaffected by this
phase, still open): drawer/swipe-gesture-engine consolidation (`drawer.js`'s own
simple swipe-dismiss vs. the shared, better-built `js/ui/sheet-gesture.js`) —
sequencing note updated: best done *after* 8.2b, once Engineering/Gudang are
also on the canonical primitive, so there's only one gesture engine left to
consolidate onto instead of three.

## 19. Known limitations

- **NOT TESTABLE this session**: real authenticated end-to-end flows (logging
  in, navigating to a live pending request, clicking through to Decision
  Replay from real Firestore data) — the same documented credential constraint
  as every real-browser pass in this program. Worked around exactly as prior
  phases did: the real service/engine modules (`request-intelligence-service.js`,
  `driver-wellness-service.js`, `override-workflow-service.js`) are imported
  directly in bare harness pages and hand-fed plain-object data, exercising
  real content-building and real service math with only the Firestore-snapshot
  input substituted.
- The panel-width risk (§6) was verified with a structural row-overflow check
  plus screenshots, not a pixel-diff visual regression tool — a human review of
  the captured screenshots (`scratch/decision-replay-*.png`,
  `scratch/driver-wellness-*.png`) is still worthwhile before this ships.
- `drawer.js`'s pre-existing gaps noted in §1 (no body-scroll lock,
  `setDrawerBusy` not blocking backdrop-click/Escape mid-action) were **not**
  touched — neither is exercised by the 2 new consumers (no busy state, no
  scroll-sensitive content), and fixing either is unrelated to this migration's
  scope. Flagged here so they aren't lost, not bundled into this diff.
- The `_closeSeq` fix (§15) was verified against all 4 real consumers
  (2 migrated + 2 pre-existing), but not against every conceivable interleaving
  of `openDrawer`/`closeDrawer`/`requestClose` — it closes the specific race
  this phase's testing surfaced, not a formally exhaustive proof.

---

Nothing committed, pushed, or deployed. This sits alongside the still-uncommitted
Phase 7 and Phase 8.1 work in the working tree, awaiting explicit review.
