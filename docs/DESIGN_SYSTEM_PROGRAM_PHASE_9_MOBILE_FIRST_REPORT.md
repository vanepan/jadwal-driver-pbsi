# Phase 9 — Mobile-First Experience: Report

**Status:** Audit + targeted implementation + regression complete.
**NOT committed, NOT pushed, NOT deployed.** Continues from the audit at
`docs/DESIGN_SYSTEM_PROGRAM_PHASE_9_MOBILE_AUDIT.md` — read that first for
the full evidence table; this report covers what was actually built.

**Scope decision (confirmed with the user before implementation):** all
P1 + P2 items from the audit, in one pass. The two architectural findings
(competing mobile navigation systems; four modules reimplementing their own
drawer instead of the canonical one) were **documented, not fixed** — both
are explicitly the kind of finding the phase's own §48 says to "STOP and
report" rather than resolve inside a touch-up pass.

## 1. What changed and why (grouped by the audit's severity table)

### Global shell / accessibility
- **`index.html`** — viewport meta no longer sets `maximum-scale=1.0,
  user-scalable=no`. Pinch-zoom was disabled app-wide, a direct conflict
  with the phase's own §34.
- **`platform.css`** — new `@media (min-width: 768px) and (hover: none)`
  block. The desktop rail's collapsed-with-hover-to-reveal-labels pattern
  never revealed anything on a 768-1023px touch tablet (no pointer to
  hover with); this closes that gap without touching the `<768px`
  mobile-drawer path, which was already correct.

### Canonical Drawer (`js/components/drawer.js`, `platform.css`)
- Wired the app's existing `lockBodyScroll()`/`unlockBodyScroll()`
  (`js/ui/sheet-gesture.js`) into `openDrawer()`/`closeDrawer()` — reused
  a utility every other bottom-sheet in the app already used; the drawer
  itself never had. Reference-counted correctly across the instant-replace
  path, the deferred-close path, and the superseded-close path (verified
  by tracing all three, not just the common case).
- Fixed a real double-counted `env(safe-area-inset-bottom)`: `.drawer`'s
  own mobile padding and `.drawer__foot`'s padding were both adding the
  inset when a footer was present. Now scoped with `:not(:has(.drawer__foot))`
  so only the no-footer case gets the panel-level padding.

### Pending workspace (`js/app.js`, `platform.css`)
- `.v2-pending-btn` gained `min-height:44px` (was ~30-32px); at ≤480px the
  3-button action row stacks vertically instead of wrapping long Indonesian
  labels mid-word.
- Free-text fields (Rekomendasi Dispatch/Ketersediaan/Keperluan/Catatan)
  now wrap instead of clipping with no way to reveal them on touch — a
  `title=` attribute was considered but doesn't reliably surface on mobile
  tap, so wrapping is the actual fix (also simpler, no markup duplication).
- **Realtime top-insertion race** (the audit's one *inferred* finding,
  since verified): a new card sorts newest-first and was inserted above
  every visible card, including one an admin might have a finger on.
  Added a pointer-down guard (`_pendingActionPointerActive`) — while a
  pointer is down inside any card's action row, a newly-arriving card
  lands just below the pressed card instead of above it; the very next
  reconcile after release restores true order. Verified with a new,
  purpose-built test (see §3).
- **Mobile search was simply absent** — the only mechanism
  (`#v2SearchInput`) is `display:none` below 1024px with no alternative.
  Added a small toggle button in Pending's own header that reveals the
  *same* input as a fixed overlay bar, rather than touching the mobile
  topbar's CSS Grid (which platform.css's own comments document as having
  survived multiple overlap-bug rounds already — deliberately left alone).

### Drivers / Administration (`platform.css`)
- `.v2-user-btn` (Edit/Nonaktifkan/Arsipkan/Reset PIN on driver and user
  cards) gained `min-height:44px`. It shrank to ~23-26px at ≤400px — the
  worst touch-target finding in the audit, on state-changing/destructive
  actions.
- `#userForm .form-actions` now gets the same sticky-footer treatment
  `#assignmentForm` already had — the User form can get very long (role
  summary + individual-permissions panel + engineering-level toggle) and
  Simpan/Batal were scrolling out of reach.

### Engineering (`engineering.css`, `js/engineering/ui/engineering-views.js`)
- History and Work-Report tables (`.eng-table`, 5 columns, `min-width:640px`)
  now reflow into stacked key-value rows below 640px via the classic
  `display:block` + `td::before{content:attr(data-label)}` pattern — every
  column stays visible, nothing dropped.
- `.eng-field-row` (2-column create/edit modal grid) collapses to 1 column
  below 600px; `.eng-input` hits 16px on mobile (iOS zoom-on-focus guard,
  matching the fix Gudang's identical-purpose `.gud-input` already had).

### Petty Cash (`petty-cash.css`, `js/petty-cash/petty-cash-center.js`)
- The Add/Edit Expense form was **entirely inline-styled** — the audit's
  clearest case of a form that could never inherit any shared mobile fix
  because there was no class to hook one onto. Converted to new
  `.pc-add-*` classes carrying the exact same values the inline styles had
  (desktop unchanged), plus real `@media` behavior: 2-column grid collapses
  at 600px, every input in the form (including the ones the original audit
  citation didn't individually list — Kategori, the reimbursement
  breakdown grid, the readonly total) hits 16px, Save/Cancel get
  `min-height:44px` and a real flex-pinned footer (mirrors Gudang's already-
  correct `.gud-modal-box` structure) instead of scrolling away with the
  rest of a long form. The now-fully-unused `FLD_INPUT` constant was
  removed as a direct consequence.
- Detail drawer footer gained `env(safe-area-inset-bottom)` padding (it had
  none at all, unlike the canonical drawer).
- **Hostile-review catch:** a first-pass background agent assigned to this
  file went out of scope and deleted two unrelated `@keyframes` blocks
  (`pcSpin`, `pcPulse`) under its own "verified unused" reasoning — reverted
  before any further work; not part of this fix regardless of whether the
  claim was true.

### Overtime (`overtime.css`, 4 `js/overtime/ui/*.js` files, `overtime-center.js`)
- All four tables (Penyesuaian Data, Closing History, Report History, Report
  Builder previews) used a plain **inline** `overflow-x:auto` wrapper — no
  class, so no `@media` query could ever reach them. Moved each to a class
  and added the same stacked-row reflow as Engineering, at a breakpoint
  matched to each table's column count (768px for the 7-column history
  table down to 640px for the 3-4 column preview tables).
- Row-level action buttons (`.ot-row-btn`) gained `min-height:44px` (were
  ~26px, the smallest touch target found anywhere in the audit).
- Daily Entry's per-unit header row (`unitGridSection()`) had **no
  `flex-wrap`** on a row packing a unit name + 2 badges + 3 buttons — at
  375px this had no way to fit. Restructured into two sub-groups (name+badges,
  buttons) each independently wrapping, so the common case stays one line
  and the fallback is a clean 2-line split instead of arbitrary per-item
  wrap order.
- **Hostile-review catch:** a first background agent pass produced correct,
  well-commented CSS for all of the above but never touched the
  corresponding JS — the classes and `data-label` attributes the CSS
  targeted didn't exist in any rendered markup, making the entire CSS
  addition dead code. Wired the JS side myself (all 4 view files +
  overtime-center.js) to actually use it.

## 2. Explicitly NOT done this phase (per the confirmed scope decision)

- **Competing mobile navigation systems** (workspace-scoped bottom nav +
  Domain Shell rail-in-drawer, both simultaneously visible with overlapping
  but non-identical destinations) — documented in the audit, not touched.
  Genuinely needs a scoped IA decision, not a CSS fix.
- **Four modules reimplementing their own drawer** (Engineering, Gudang,
  Petty Cash, Overtime all bypass `js/components/drawer.js`) — documented,
  not migrated. A real migration is phase-sized on its own (4 modules ×
  behavior parity × regression). The Petty Cash detail drawer's one
  concrete gap (missing safe-area padding) was fixed as a small, isolated
  exception since it required no architectural change.
- **Executive Command Center** — frozen per §21. Two pre-existing, minor
  gaps were found (`.wsp-btn` touch targets ~32-34px; grid collapse
  breakpoint at 600px leaves 601-767px squeezed) — documented only, not
  regressions introduced by anything recent, so the freeze holds.
- **Gudang** — audited, found to be the best-built of the six workspaces;
  its only real gap (the non-canonical drawer) is covered by the
  architectural item above.
- P3 items (Command Palette trigger/result-row sizing) — out of scope per
  the confirmed "P1 + P2" decision.

## 3. Verification

**New/updated automated suites:**

| Suite | Result | What it covers |
|---|---|---|
| `scripts/mobile-first-verification-check.mjs` **(new, permanent)** | **42/42** | Real-boot horizontal-overflow sweep across all 9 mandated viewports (360-1440px), zoom-accessibility, Pending/Drivers touch-target CSS, tablet rail hover:none fallback, drawer scroll-lock source check, Engineering/Overtime/Petty-Cash reflow (real CSS against synthetic fragments shaped like the real render output), reduced-motion boot |
| `scratch/verify-pending-workspace-reconciler.mjs` | **61/61** (was 57 — 4 new) | Added a dedicated pointer-guard test: simulates a real `pointerdown` on the first card's action row, confirms a new arrival lands below it (not above), and that order self-corrects once the pointer releases |

**Existing suites re-run clean (no regressions):**

| Suite | Result |
|---|---|
| `smoke-boot.mjs` (real unauthenticated boot) | PASS, 0 fatal errors |
| `drawer-consolidation-check.mjs` | 52/52 |
| `workspace-foundation-check.mjs` | 24/24 |
| `executive-motion-polish-check.mjs` | 16/16 |
| `motion-performance-hardening-check.mjs` | 16/16 |
| `navigation-crossfade-check.mjs` | 53/53 |
| `motion-continuity-orchestration-check.mjs` | 28/28 |
| `scratch/verify-requests-live-diff.mjs` | 68/68 |
| `engineering-ui-check.mjs` | 61/61 |
| `engineering-ui-dom-check.mjs` | 50/50 |
| `engineering-foundation-check.mjs` | 116/116 |
| `pettycash-intelligence-check.mjs` | 29/29 |
| `overtime-analytics-engine-check.mjs` | 65/65 |
| `overtime-closing-engine-check.mjs` | 27/27 |
| `overtime-rate-engine-check.mjs` | 15/15 |
| `overtime-report-model-check.mjs` | 36/36 |
| `overtime-template-check.mjs` | 16/16 |

**Total: 775 automated checks, 0 failures.**

## 4. Evidence labels

- **VERIFIED** (real Puppeteer render + computed-style/DOM assertions
  against real project CSS/HTML, or a real regression suite run): every
  row in §3, the pointer-guard race fix, the search-toggle open/close/
  outside-click/Escape behavior, all table/form reflow claims.
- **LOGIC VERIFIED** (traced by reading, not independently re-derived):
  the lock-count balance across `openDrawer`'s three close paths (instant-
  replace, normal deferred close, superseded-close) — reasoned through
  explicitly in code comments, consistent with the existing reference-
  counted utility's own contract.
- **NOT TESTABLE this pass** (same standing constraint as every prior
  phase in this program): real device touch/keyboard behavior, real
  authenticated-session content at volume, real Chrome trace/frame timing.
  Every mobile/reflow claim above was verified via real CSS against
  realistically-shaped synthetic markup (the same method
  `verify-pending-workspace-reconciler.mjs` already established for this
  codebase, necessary because `js/app.js` has zero exports and would fire
  real Firebase reads if imported into a test harness) — not full end-to-
  end navigation through the authenticated app, which the standing
  constraint still rules out.

## 5. Hostile review findings (both caught before being reported as done)

Three implementation passes were attempted in parallel via background
agents; all three were interrupted mid-task by a session-wide rate limit.
Reviewing what was actually on disk (not what each agent claimed) surfaced:

1. **Petty Cash agent scope violation** — deleted two unrelated
   `@keyframes` (`pcSpin`, `pcPulse`) under its own "verified unused"
   reasoning, and had not yet touched the actual assigned fix (the inline-
   styled form) at all. Reverted the keyframe deletion; did the actual
   fix directly.
2. **Overtime agent produced dead CSS** — wrote complete, well-reasoned
   `@media` reflow rules for all 4 tables, but never updated the
   corresponding JS to emit the classes/`data-label` attributes the CSS
   targeted, so none of it took effect. Wired the JS side directly and
   verified the reflow actually fires (§3).
3. **Engineering agent's work was clean** but included one unrequested
   drive-by change (`.eng-toggle-knob` switched from `left` to `transform`
   for the same visual result) — reverted to keep the diff scoped to the
   three requested fixes only.

## 6. Files changed

`index.html`, `js/components/drawer.js`, `js/app.js`, `platform.css`,
`style.css`, `engineering.css`, `js/engineering/ui/engineering-views.js`,
`petty-cash.css`, `js/petty-cash/petty-cash-center.js`, `overtime.css`,
`js/overtime/overtime-center.js`, `js/overtime/ui/overtime-records-view.js`,
`js/overtime/ui/overtime-closing-view.js`,
`js/overtime/ui/overtime-report-history-view.js`,
`js/overtime/ui/overtime-reports-view.js`,
`scratch/pending-workspace-reconciler-harness.html`,
`scratch/verify-pending-workspace-reconciler.mjs` (new pointer-guard test),
`scripts/mobile-first-verification-check.mjs` (new permanent suite).

## 7. Files deliberately untouched

Executive Command Center (`js/widgets/executive/*`, `workspace-styles.js`) —
frozen, gaps documented only. Firebase (`js/firebase.js`), permissions
(`canAccessModule`, RTDB rules), business logic (rate/closing/report
calculations, NOR generation, dispatch scoring) — nothing here needed an
interface-level correction. `js/components/decision-replay-drawer.js`,
`driver-wellness-drawer.js` — already canonical, no gap found. Gudang
(`js/gudang/**`, `gudang.css`) — audited clean apart from the deferred
architectural item. `js/engineering/ui/engineering-drawer.js`,
`js/gudang/ui/gudang-item-detail.js`, `js/overtime/overtime-center.js`'s
`employeeHistoryDrawer()` — the four non-canonical drawers, deliberately
deferred (see §2).

## 8. Known limitations

- The Pending realtime-insert race was the audit's one *inferred* finding
  (reasoned from sort + insert order, not observed live) — now VERIFIED
  via a purpose-built pointer-simulation test, but still not observed on a
  real device with a real touch event under real network jitter.
- No real device testing anywhere in this phase — same standing constraint
  as every prior phase, browser emulation only.
- The two deferred architectural items (competing nav systems, non-
  canonical drawers) remain real, documented gaps — not resolved, not
  papered over.

## 9. Git status

Not committed, not pushed, not deployed — working tree left as-is per
instruction.

## 10. Recommendation

**CONDITIONAL — REAL DEVICE VERIFICATION STILL REQUIRED**, same standing
qualifier as every prior phase in this program. Every fix in this phase is
narrow, evidence-backed, and verified against real CSS/real render logic;
none required a business-logic or architecture change. What remains
unverified is real touch-device behavior and the two documented
architectural findings, which need their own scoped decisions before any
further phase touches them.
