# Phase 8.1 — App-Wide Motion System: Foundation Report

**Scope:** The first narrow, safe slice of the "Phase 8 — App-Wide Motion System"
brief. Audit-first, migration-map-first, as the brief itself requires — this report
covers the audit, the scoped 8.1 implementation (reduced-motion coverage +
CSS motion-token consolidation + two confirmed defect fixes), and a named
roadmap (8.2–8.9) for everything the brief describes that this pass deliberately
did not touch, per the brief's own STOP conditions.

**Status:** Implementation + verification complete, **NOT committed, NOT
pushed, NOT deployed**, matching every prior phase in this program.

---

## 1. Existing motion audit

A 3-agent audit (motion infrastructure, CSS-level motion, feature-surface
motion) covered every stylesheet the live app loads (`style.css`, `platform.css`,
`petty-cash.css`, `overtime.css`, `engineering.css`, `gudang.css`,
`sarpras-intelligence.css`, `nor-center.css`, `workspace-list-kit.css`) and every
`js/components/`, `js/workspace/`, `js/widgets/`, and feature-module JS file with
motion logic. Headline findings:

- **Four independent, non-communicating CSS/JS motion-token systems**:
  `js/components/motion-tokens.js` (MICRO_MS/STANDARD_MS/SCENE_MS/
  EASE_ARRIVE), `js/widgets/executive/motion-profiles.js` (EASE/MACRO_STAGGER/
  MOTION_PROFILES), `style.css`'s `:root` block, and `platform.css`'s VSM-6
  `:root` block — none aware of the others, with several byte-identical
  duplicate token declarations between the two CSS blocks.
- **Three independent reduced-motion checks**: `motion-tokens.js`'s
  `prefersReducedMotion()`, `js/app.js`'s undocumented duplicate
  `_analyticsMotionOff()`, and the CSS-level blanket rules.
- **Genuinely good canonical primitives that are under-adopted**: `drawer.js`
  (well-built, only 2 real consumers, 4 hand-rolled duplicate drawers exist
  instead — two of those pairs are byte-identical CSS duplicates of each
  other), `save-feedback.js` and `toast.js` (both fully, genuinely adopted —
  no competing implementations found), `entry-transition.js` (reference-quality
  login/logout FLIP transition, single use).
- **The single most impactful, lowest-risk finding**: the app's own manual
  `[data-anim="off"]` motion-off switch was only ever hand-patched into
  `platform.css`. Seven other live stylesheets (`gudang.css`, `engineering.css`,
  `petty-cash.css`, `workspace-list-kit.css`, `sarpras-intelligence.css`,
  `nor-center.css`, `overtime.css`) had **zero** coverage of the manual toggle —
  every animation in those files only ever stopped for the OS-level
  `prefers-reduced-motion` query, never for the app's own switch.
- **A confirmed, real live-data bug**: `js/requests.js`'s `renderRequestsList()`
  does a full `innerHTML` replace on every RTDB `value`-listener fire for the
  entire `/driver_requests` node — one admin approving one request anywhere
  tears down and rebuilds every connected client's entire Requests list, with
  zero diffing. Real, but a data-layer problem, not a motion problem (see §21).
- Full findings (234 `transition:` declarations, 43 `@keyframes`, ~13 unique
  `cubic-bezier()` curves, per-surface verdicts for sidebar, navigation, forms,
  lists, tables, notifications, modals, empty/loading states, mobile, login) are
  reflected throughout this report and the approved implementation plan.

## 2. Migration map

The full brief describes 36 sections of work spanning the entire application.
Rather than attempt that in one pass — which the brief itself explicitly
forbids ("DO NOT attempt a giant all-at-once rewrite") — the audit findings
were sorted into:

- **Safe to fix now (Phase 8.1, this report)**: additive/corrective changes with
  no business-logic surface, no core-render-path risk, and (where a "fix"
  changes a rendered value at all) at most 1-2 verifiable call sites.
- **Deferred, named (Phase 8.2–8.9)**: real architectural refactors, changes
  to core render paths used by every domain, or changes touching live
  transactional (money/hours) flows — each gets a one-line reason and its own
  future review, per §21.

This is the migration map in practice: §3-§9 below are what shipped in 8.1;
§21 is the map for everything else.

## 3. Motion token architecture (post-8.1)

`js/components/motion-tokens.js` and `js/widgets/executive/motion-profiles.js`
remain deliberately separate, un-bridged JS layers this phase — their numbers
don't line up 1:1 with the CSS tokens (`STANDARD_MS=240` vs `--motion-base:
200ms`, `SCENE_MS=550` vs `--motion-slow:320ms`), so a mechanical alias would
be wrong; bridging them is a real design decision for a future phase, now
documented in a code comment at `style.css`'s token block instead of left
implicit.

At the CSS layer, `style.css`'s `:root` block is now the **sole source** for
`--motion-fast`/`--motion-base`/`--motion-slow`, `--ease-standard`,
`--ease-decelerate`, and the new `--ease-overshoot`. `platform.css`'s VSM-6
`:root` block no longer re-declares `--motion-fast`/`--motion-slow` (both were
byte-identical duplicates); its `--motion-normal` now aliases
`var(--motion-base, 200ms)` instead of an independent literal — same value,
single source of truth. `platform.css`'s own `--motion-ease` (a genuinely
different curve, 40+ real consumers) and `--motion-pop`/`--motion-sheet` (both
real, consumed) are untouched.

Four dead CSS tokens were removed (zero `var()` consumers anywhere, verified by
grep before removal, not assumed): `--ease-accelerate`, `--motion-view`,
`--motion-theme` (whose own comment was additionally stale — claimed to mirror
a 550ms crossfade that is actually a hardcoded, non-token-driven `.32s`/`.26s`),
and `--exec-ease`.

## 4. Canonical primitives (unchanged this phase)

`drawer.js`, `save-feedback.js`, `toast.js`, and `entry-transition.js` were
**not modified** — all four are already well-built; the problem the audit found
is adoption (drawer.js) or nothing at all (the other three are cleanly
adopted). Extending adoption is 8.2/8.6/8.7 work, not 8.1.

## 5. Consolidated implementations

**Overshoot-curve merge.** Three near-identical hand-authored "overshoot"
springs — `cubic-bezier(0.34,1.26,0.64,1)` (`.pbsi-toggle-input::after`),
`cubic-bezier(.34,1.56,.64,1)` (`.req-mode-card__tick`), and
`cubic-bezier(.34,1.3,.64,1)` (`.req-sheet`) — differed only in the y1 control
point. Consolidated into one new token, `--ease-overshoot:
cubic-bezier(0.34, 1.3, 0.64, 1)` (`style.css`), picking the value already in
production at `.req-sheet` so that call site is a zero-diff swap; the other two
shift imperceptibly (the audit's own characterization, verified by direct
computation of the curve's shape, not just eyeballed). All 3 call sites now
reference `var(--ease-overshoot, <original literal fallback>)`.

**Explicitly not merged**: `cubic-bezier(.2,.8,.3,1)` (`ls-pop`, the login
screen's own cold-load reveal, `platform.css:868`) — its only use site sits on
the frozen login-entry surface (Phase 6), so no merge was attempted.

**Toggle-knob `left`→`transform`.** `.eng-toggle-knob` (live, consumed by
`js/engineering/ui/engineering-views.js`) and `.p-switch::after` (verified dead
— zero consumers anywhere, fixed anyway for correctness) both animated `left`
instead of `transform`. Both now use `transition:transform` +
`transform:translateX(17px)` for the "on" state — same visual travel distance
(20px−3px and 19px−2px both equal 17px), now compositor-only.

**Dead-keyframe pruning.** `petty-cash.css`'s `pcSpin` and `pcPulse` were
verified to have zero consumers anywhere in the repo (including inline
`style=` attributes, which a naive CSS-only grep would miss — the initial audit
draft incorrectly flagged `pcPop` as dead too; re-verification found 3 live
inline-style consumers in `petty-cash-center.js` before anything was deleted).
`pcPop` and `pcFade` are untouched.

## 6. Navigation motion

Out of scope for 8.1 — see §21, Phase 8.4. `setWorkspace()`'s `display`
toggles and `renderShell()`'s `innerHTML=` replace remain hard swaps.

## 7. Drawer motion

Out of scope for 8.1 — see §21, Phase 8.2. `drawer.js` itself untouched.

## 8. Form motion

Out of scope for 8.1 — see §21, Phase 8.5.

## 9. Save feedback

Untouched — `save-feedback.js` is already canonical and fully adopted (4
callers, no competing implementations).

## 10. Toast

Untouched — `toast.js` is already canonical and fully adopted (its own header
documents replacing 5 prior implementations; this audit found no surviving
hand-rolled toast function anywhere).

## 11. Command palette

Two real, confirmed defects fixed in `js/shell/command-palette.js` +
`platform.css`:

**Replay-on-reopen.** The entrance animation (`v2FadeInScale`, applied via a
class selector on `.domshell-palette-box`) is driven by the ancestor
overlay's `display:none↔flex` toggle. Rather than trust the CSS-spec-general
assumption that this restarts the animation, this was **empirically probed**
first (`scratch/probe-display-toggle-animation-replay.mjs`): in this project's
actual Chromium build, the underlying `Animation` object survives the
`display:none` cycle and its `currentTime` keeps advancing in real time while
hidden — a reopen after 200ms showed `currentTime≈233ms` into a 400ms test
animation, not a fresh 0ms start. The bug is real. Fixed with the same
reflow-restart idiom the codebase already uses elsewhere
(`js/app.js`'s analytics deep-panel replay): `box.style.animation='none'; void
box.offsetWidth; box.style.animation='';` in `open()`.

**Result-list stagger**, gated to the render immediately after `open()` only —
a module-level `staggerNext` flag, consumed once, so typing (which re-renders
on every keystroke) never replays it. This mirrors an anti-pattern this
codebase has already fixed twice elsewhere (Gudang's `lastAnimatedScreen`
guard, `workspace-styles.js`'s onMount guard). Cadence matches the real
established per-list-item convention (`workspace-styles.js`'s
`.wsp-inbox__item`: 0.04s / 0.12s / 0.2s+), not the page-section
`MACRO_STAGGER` tier, which is a different scale for a different kind of list.

**`[data-anim="off"]` gap.** The palette was previously the only major overlay
in the app that checked `prefers-reduced-motion` but not the app's own manual
switch. Now imports `prefersReducedMotion()` from `motion-tokens.js` and gates
the stagger on it directly (in addition to the new global CSS blanket rule,
§14, being a second independent safety net).

## 12. Live-data motion

Out of scope for 8.1 — see §21, Phase 8.3 (Requests-list diffing).

## 13. Mobile motion

Not touched this phase — the audit found this area already good (a real,
purpose-built gesture engine, `js/ui/sheet-gesture.js`, used by 4 real sheets)
aside from one consolidation opportunity (drawer.js's own separate,
simpler swipe-dismiss) deferred to 8.7.

## 14. Reduced-motion support

The core deliverable of this phase. One new global blanket rule in `style.css`,
mirroring the existing OS-level `prefers-reduced-motion` blanket rule
structurally:

```css
[data-anim="off"] *,
[data-anim="off"] *::before,
[data-anim="off"] *::after {
  animation-duration: 0.01ms !important;
  animation-iteration-count: 1 !important;
  transition-duration: 0.01ms !important;
  scroll-behavior: auto !important;
}
```

Purely additive — no existing `[data-anim="off"]` rule elsewhere was edited or
removed (several reset element-specific end state, e.g. `stroke-dashoffset`,
that a duration override alone can't replicate; they're now harmless,
redundant overlap for the duration piece).

**MEASURED** (real browser, not inferred): representative live elements from
`gudang.css` (`.gud-btn`), `petty-cash.css` (`.pc-drawer-scrim`, animated), and
`workspace-list-kit.css` (`.dic-stage-dot`, an infinite-loop animation) all
confirmed collapsing from real non-zero durations (0.12s / 0.18s / 1.1s) down
to ~0.01ms under `[data-anim="off"]`, and independently under
`prefers-reduced-motion: reduce` (regression guard — confirms the new rule
didn't disturb the pre-existing OS-level path). `engineering.css` was checked
directly via its toggle-knob (§5). `sarpras-intelligence.css`, `nor-center.css`,
and `overtime.css` were confirmed via static analysis to contain zero
`transition`/`@keyframes` declarations at all — there was nothing to gate in
those three, so no browser check was needed for them specifically; they still
benefit from the blanket rule the moment any motion is added to them in the
future.

## 15. Accessibility

No focus-trap, keyboard-navigation, or ARIA changes were made this phase — the
scope was durations/easings/reduced-motion coverage only, none of which alters
focus order or semantics. The command-palette's existing ESC-to-close and
focus-on-open behavior is untouched.

## 16. Performance measurements

Per the brief's own requirement to measure representative flows rather than
claim "smoother" without evidence:

- **Rail hover-expand**: MEASURED via real `page.hover()` (not synthetic
  events) — width holds at 72px through ~50ms, reaches 220px by ~250ms,
  confirming the 100ms debounce + 200ms transition compose correctly.
- **Command palette open/reopen**: MEASURED via `Animation.currentTime`/
  `playState` sampling — first open finishes and visually settles
  (opacity:1, transform:none); reopen after the reflow-restart shim shows a
  fresh `running` animation at `currentTime≈0`, not a stuck-`finished` one.
- **Toggle-knob**: MEASURED via `getBoundingClientRect()` delta (17.00px,
  compositor-only via `transform`, confirmed via computed `matrix(1,0,0,1,17,0)`
  rather than a `left`-driven layout shift).
- **Executive Command Center** (frozen reference surface, re-run as a
  regression guard even though nothing in 8.1 touches its own token
  consumption): `scripts/executive-motion-polish-check.mjs` — **16/16
  passed**, zero change.
- **Toast defect-fix regression** (`toast.js` consumes `motion-tokens.js`,
  unmodified this phase, but its own `[data-anim="off"]` CSS rule now has a
  global sibling): `scratch/verify-toast-defect-fix.mjs` — **all checks
  passed**, no double-application regression.

No before/after trace comparison (style-recalc/paint/long-tasks) was run for
8.1's own changes specifically, since none of them change animation
*mechanism* the way Phase 7G.5's View-Transition migration did (§34 of the
brief lists this kind of trace for larger changes; 8.1 is token/duration
plumbing plus two small defect fixes, not a mechanism change) — flagged as a
deliberate scope decision, not an oversight.

## 17. Before/after comparison

- Rail hover-expand: **before** — any pointer graze across the 72px boundary
  instantly started the 200ms width transition (zero delay); **after** — a
  100ms dwell must elapse first.
- Command palette: **before** — reopening within an animation's real-time
  window showed a partway/stuck-finished state, no result stagger, no
  `[data-anim="off"]` awareness; **after** — every reopen gets a fresh
  entrance, first-open-only stagger, gated by both `[data-anim="off"]` and
  `prefers-reduced-motion`.
- Reduced-motion coverage: **before** — 7 stylesheets responded only to the
  OS-level query; **after** — all respond to both, verified per-file.
- Toggle knobs: **before** — `left`-based (layout/paint-triggering); **after**
  — `transform`-based (compositor-only), same visual travel distance.

## 18. Regression results

- `scripts/executive-motion-polish-check.mjs`: **16 passed, 0 failed**.
- `scratch/verify-toast-defect-fix.mjs`: all checks passed.
- New `scratch/verify-motion-8-1.mjs` (static/source assertions): **35
  passed, 0 failed**.
- New `scratch/verify-rail-hover-debounce.mjs` (real browser): **4 passed, 0
  failed**.
- New `scratch/verify-command-palette-motion.mjs` (real browser): **15
  passed, 0 failed**.
- New `scratch/verify-reduced-motion-gap-closure.mjs` (real browser): **15
  passed, 0 failed**.
- New `scratch/verify-motion-8-1-viewport-matrix.mjs` (real browser, 6 widths
  × 2 themes × 3 motion states = 36 combinations, against the real
  unauthenticated shell): **72 passed, 0 failed** (2 assertions per
  combination — zero horizontal overflow, zero fatal console/page errors).

No existing assertion was weakened, deleted, or skipped anywhere in this
process — several bugs found in the *test scripts themselves* during
development (a `page.type()`-per-keystroke race that made the palette stagger
test misread its own gating logic as broken, a `DOMRect`-serialization gotcha
across the Puppeteer evaluate boundary, a `getComputedStyle().animationDuration`
string-format mismatch, and a false-positive regex match against a code
*comment* rather than a real CSS declaration) were fixed by correcting the
test's methodology, never by loosening what it asserts.

## 19. Files changed

- `style.css` — new global `[data-anim="off"]` blanket rule; `:root` token
  cleanup (`--ease-accelerate` → `--ease-overshoot`); 2 overshoot-curve call
  sites updated to reference the new token.
- `platform.css` — VSM-6 `:root` token cleanup (removed duplicate
  `--motion-fast`/`--motion-slow`, aliased `--motion-normal`); removed 3 dead
  tokens (`--motion-view`, `--motion-theme`, `--exec-ease`); toggle-knob
  `left`→`transform` swap (`.p-switch::after`); rail hover-expand 100ms
  debounce (2 rules); command-palette result-stagger CSS (new); 1
  overshoot-curve call site updated.
- `engineering.css` — toggle-knob `left`→`transform` swap (`.eng-toggle-knob`).
- `petty-cash.css` — pruned 2 dead `@keyframes` (`pcSpin`, `pcPulse`).
- `js/shell/command-palette.js` — imports `prefersReducedMotion`; reflow-restart
  shim in `open()`; `staggerNext` gating for the result-list entrance.
- New verification scripts (all in `scratch/`, none touching production code):
  `verify-motion-8-1.mjs`, `verify-rail-hover-debounce.mjs`,
  `verify-command-palette-motion.mjs`, `verify-reduced-motion-gap-closure.mjs`,
  `verify-motion-8-1-viewport-matrix.mjs`,
  `probe-display-toggle-animation-replay.mjs` (diagnostic evidence, not a
  regression gate), and a minimal `command-palette-harness.html`.

## 20. Remaining limitations

- **NOT TESTABLE this session**: the two overshoot-curve visual spot-checks
  the plan called for (`.pbsi-toggle-input` in Settings, `.req-mode-card__tick`
  in Request submission) require authenticated access to reach those screens —
  the same documented credential constraint noted in every prior real-browser
  pass in this program (e.g. the Phase 7G.5 report). The curve substitution
  itself is mathematically near-identical (y1 shifts by ≤0.26 on a 4-point
  bezier already characterized as visually indistinguishable by the audit),
  and `.req-sheet`'s call site is a byte-for-byte zero-diff swap, so risk is
  low — but this is an INFERENCE from the numbers, not a direct visual
  observation, and is flagged as such rather than claimed verified.
- The bridging of the JS motion-token layers (`motion-tokens.js`/
  `motion-profiles.js`) to the CSS token layer remains explicitly undone —
  documented as a real design decision for a future phase (§3), not
  mechanically forced through this pass.
- `js/app.js`'s `_analyticsMotionOff()` duplicate of `prefersReducedMotion()`
  was left untouched — it's called from the frozen Phase 7G.5 View
  Transitions path, and any refactor to remove the duplication would touch
  that protected code.

## 21. Explicitly deferred work (roadmap)

- **8.2 — Drawer consolidation.** Migrate `decision-replay-drawer.js` +
  `driver-wellness-drawer.js` (byte-identical hand-rolled CSS pair) and
  `engineering-drawer.js` + `gudang-item-detail.js`'s `drawerShell` (a second
  byte-identical pair) onto the canonical `js/components/drawer.js`. *Real
  architectural refactor of 4 live feature modules — own reviewed phase.*
- **8.3 — Requests-list live-update diffing.** Fix the confirmed whole-tree
  teardown/rebuild on every `driver_requests` RTDB change. *Data-layer/
  Firebase-listener problem, not a motion problem.*
- **8.4 — Domain/workspace navigation crossfade.** Replace `setWorkspace()`'s
  raw `display` toggles and `renderShell()`'s raw `innerHTML=` replace with a
  transition at the container level. *Touches the core render path used by
  every domain — real regression risk if rushed.*
- **8.5 — Forms/inputs focus-ring unification.** 4+ independently-implemented
  focus treatments across 6 files. *Meaningful cross-file visual-consistency
  work, wants its own screenshotted review.*
- **8.6 — Overtime/Petty Cash modal-overlay motion.** Overtime's 7 hand-rolled
  overlays have zero animation; Petty Cash's 4 have inconsistent fade-in and no
  fade-out. *Touches live transactional (money/hours) flows.*
- **8.7 — Swipe-gesture-engine consolidation.** `drawer.js`'s own swipe-dismiss
  vs. the shared, better-built `js/ui/sheet-gesture.js`. *Best sequenced after
  8.2, so there's only one gesture engine left to consolidate onto.*
- **8.8 — Skeleton-pulse adoption** in Gudang/Overtime/PettyCash/Engineering
  (currently plain "Memuat…" text or nothing). *Cosmetic, low urgency.*
- **8.9 — Notification-bell arrival pulse.** Investigated during planning:
  `renderNotificationBadge()` only knows the current total unread count, not
  "what's new since last render" — needs a small previous-state-snapshot diff
  that doesn't exist yet. *A real state addition, not just a motion tweak.*

---

Nothing committed, pushed, or deployed. All Phase 8.1 work (plus the
pre-existing, still-uncommitted Phase 7A–7G.5 work already in this working
tree before this session started) remains uncommitted, awaiting explicit
review.
