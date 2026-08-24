# Phase 8.5 — Navigation Crossfade & Workspace Transition: Report

**Status:** Implementation + real-browser mechanism verification + hostile
review + regression complete. **NOT committed, NOT pushed, NOT deployed**,
matching every prior phase in this program.

Every claim below is tagged **VERIFIED** (asserted by a real-browser
Puppeteer test), **MEASURED** (a real number was captured), **LOGIC
VERIFIED** (asserted by a pure-logic harness, no browser), **INFERRED**
(reasoned from related evidence, not directly observed), or **NOT
TESTABLE** (requires an authenticated session this environment cannot
safely provide — see §9). No claim is upgraded past what it actually is.

## 1. Audit findings & root cause

Full detail in `DESIGN_SYSTEM_PROGRAM_PHASE_8_5_NAVIGATION_CROSSFADE_MAP.md`
(§0-§8 pre-implementation, §9 post-implementation addendum). Summary:

- **Root cause (VERIFIED by source read):** `setWorkspace()` (`js/app.js`,
  now line 4218) did ~15 raw `element.style.display = 'block'/'none'` swaps
  with no transition layer at all.
- **Single choke point (VERIFIED by source read):** every navigation
  surface — desktop rail, mobile drawer/bottom-nav, the flagged
  `domainShellV1` IA, Command Palette, the Home/Executive "Launcher" zone
  (confirmed this pass — see map §9a), `restoreNavState()` — funnels through
  one of ~19 `nav*()` functions into this single function.
- **Prior art (VERIFIED by source read):** `applyTheme()` (Phase 7G.5)
  already solved the identical problem shape for the theme toggle using
  `document.startViewTransition()`, with a documented root-cause lesson:
  per-element CSS transitions never look like one coherent surface change;
  a whole-viewport snapshot cross-fade does. The global
  `::view-transition-old(root)`/`::view-transition-new(root)` CSS and its
  reduced-motion guards (`platform.css:410-432`) already exist and are not
  scoped to theme — reused as-is, zero new CSS.

## 2. Product decisions applied

Per this session's explicit instructions:
- Crossfade fires **only** on a real workspace-boundary change
  (`name !== currentWorkspace`). Same-name re-navigation (e.g. Administration's
  Users/Config/Roles sub-sections) stays instant.
- The very first post-login workspace never crossfades (a `_workspaceEverSet`
  guard, armed only after the first `setWorkspace()` call completes) — it
  does not compete with the existing Phase 6 login transition, which was not
  touched.
- No new motion system: 100% reuse of the existing View Transitions
  infrastructure already shipped for theme toggling.

## 3. Final implementation

`js/app.js`, `setWorkspace()` (line 4218) is now a thin dispatcher:

```js
function setWorkspace(name) {
  const isWorkspaceChange = name !== currentWorkspace;
  const canViewTransition = _workspaceEverSet
    && isWorkspaceChange
    && typeof document.startViewTransition === 'function'
    && !_analyticsMotionOff();

  if (canViewTransition) {
    const transition = document.startViewTransition(() => applyWorkspaceState(name, isWorkspaceChange));
    transition.updateCallbackDone.catch(err => console.error('[setWorkspace] view transition update failed', err));
    transition.ready.catch(() => {});
    transition.finished.catch(() => {});
    return;
  }
  applyWorkspaceState(name, isWorkspaceChange);
}
```

`applyWorkspaceState(name, isWorkspaceChange)` is the entire prior body of
`setWorkspace()`, byte-identical, plus:
- `_workspaceEverSet = true;` as the first line.
- A scroll-reset gated on `isWorkspaceChange`:
  `(document.scrollingElement || document.documentElement).scrollTop = 0;`
  — corrected mid-implementation from an initial version that targeted
  `.main-content` (see §5, this was a real bug caught before it shipped).

Every individual workspace's own render function
(`renderPendingWorkspace()`, `renderV2AdminWorkspace()`, `renderHomeWorkspace()`,
the ~15 display-toggle lines) is untouched — same code, now running either
directly or inside the View Transition callback.

## 4. Same-workspace vs. first-load vs. rapid navigation

- **Same-workspace navigation stays instant** — **VERIFIED**
  (`scripts/navigation-crossfade-check.mjs` §3: a same-name call issues zero
  `startViewTransition` calls and never touches `scrollTop`).
- **First workspace load never transitions** — **VERIFIED** (§1: the very
  first `setWorkspace()` call, despite technically differing from the
  `'dashboard'` initial value, issues zero transitions).
- **Rapid navigation, "latest wins"** — **VERIFIED** for every realistic
  pattern (§6: 4 same-tick calls; §7: 10 same-tick calls with no
  immediate-reversal; §7c: 30 sequential real navigations with settle time
  between each). **One narrow, characterized exception found and
  deliberately left unfixed** — see §8's bug entry. Real click events are
  always separate browser tasks, never same-tick, so this exception has no
  real-world trigger.

## 5. Scroll reset & reload restoration

**Real bug found and fixed before this phase would have shipped a no-op.**
`.main-content` has no `overflow-y` anywhere in `style.css`/`platform.css`
(**VERIFIED** by grep of both files) — the document itself scrolls, not
`.main-content`. The first version of this fix targeted `.main-content.scrollTop`,
trusting a pre-existing code comment (`wireScrollStateSave()`'s own header)
that turned out to be inaccurate. A real-browser test (not the logic-only
harness, which mocks the DOM and couldn't have caught this) showed the
"fix" never actually reset anything. Corrected to
`document.scrollingElement`.

- **Scroll resets to top on a real workspace change** — **VERIFIED**
  (`scripts/navigation-crossfade-check.mjs` §2, via a setter-spy — see that
  script's own comment for why a spy was used instead of round-tripping real
  scroll position: headless Chromium was observed not to reflect a
  synchronous scrollTop write on immediate read-back, a headless-automation
  quirk unrelated to the code under test).
- **Same-name navigation never touches scroll** — **VERIFIED** (§3).
- **`restoreNavState()`'s reload-scroll-restore is untouched** — **VERIFIED
  by source read** (zero diff on that function). Whether it currently
  *works* is a separate, pre-existing question: it has the identical
  `.main-content`-targeting mismatch (map §9c) — **INFERRED** to already be
  a no-op today, independent of this phase, out of scope to fix here (not
  introduced by Phase 8.5, not touched by it).

## 6. Pending workspace / Executive Command Center

- **Pending's diff-based reconciler and busy-skip invariant (Phase 8.3/8.4):
  unaffected** — **VERIFIED** by re-running their existing harnesses
  unchanged (§10): 68/68 (`verify-requests-live-diff.mjs`) and 57/57
  (`verify-pending-workspace-reconciler.mjs`).
- **Navigating into Pending does not spuriously replay `.v2-pending-card--enter`
  on already-existing cards** — **LOGIC VERIFIED / INFERRED**, not directly
  observed: `_pendingCardNodes` persists across a `display:none`/`block`
  toggle (nodes are never destroyed by `setWorkspace()`), so the reconciler
  has no "new card" to detect on a plain navigation. This specific
  interaction (real crossfade + real Pending re-render + real card nodes,
  combined) was **NOT TESTABLE** this session — it requires either
  authenticated real data or a much larger combined harness beyond this
  pass's scope; flagged rather than assumed verified.
- **Executive Command Center: zero files touched** — **VERIFIED**.
  `git diff --stat` shows changes in `js/widgets/executive/index.js`/
  `motion-profiles.js`/`ui-kit.js`, but file modification timestamps
  (`index.js`: 2026-08-21) predate this session (2026-08-24) by 3 days —
  those diffs are prior, unrelated uncommitted work, not anything touched
  in this pass. Only `js/app.js` was edited this session.
  `scripts/executive-motion-polish-check.mjs` re-run: 16/16 green.

## 7. Drawer, mobile, theme interaction

- **Drawers are not swept on workspace change** — **VERIFIED by source
  read**, confirmed pre-existing (map §9b): `sweepOpenModalsOnWorkspaceChange()`
  only touches `.modal-overlay`, never `js/components/drawer.js` instances.
  Not changed by this phase, per its own instruction to verify rather than
  alter that contract. Real-browser behavior of an open drawer during an
  actual crossfade (visual layering, z-index, focus) is **NOT TESTABLE**
  without authenticated content to open a real drawer over.
- **Mobile viewports (375/390/430/768/1194/1024/1440):** no horizontal
  overflow, mid-transition or settled — **VERIFIED**
  (`scripts/navigation-crossfade-check.mjs` §9, all 7 viewports × 3 checks).
  This uses synthetic harness content, not real workspace markup — real
  mobile drawer-close-on-nav / safe-area / real-content layout is **NOT
  TESTABLE** without authentication.
- **Theme + navigation interaction (rapid theme toggle during nav, or vice
  versa):** both features call `document.startViewTransition()` through the
  same native browser mechanism with no mutual-exclusion flag in either
  function — **INFERRED** to compose correctly via the browser's own
  documented skip-in-flight-transition behavior (the same mechanism this
  phase's own rapid-nav tests exercise), not directly observed as a combined
  scenario. **NOT TESTABLE** as an explicit combined real-browser check this
  session.

## 8. Bugs found this session

| # | Bug | Root cause | Fix | Verification |
|---|---|---|---|---|
| 1 | Scroll-reset was a silent no-op | Targeted `.main-content.scrollTop`; that element has no `overflow-y` anywhere in the stylesheets, so the document scrolls, not it | Target `document.scrollingElement` instead | VERIFIED (§5) |
| 2 | Unhandled promise rejection on every render failure | `updateCallbackDone` rejection was never caught | `.catch(err => console.error(...))` | VERIFIED (§8's containment test: 3/3 passed) |
| 3 | Unhandled `AbortError` console error on ordinary rapid navigation | `ready`/`finished` reject with `AbortError: Transition was skipped` when a transition is natively superseded — expected, benign, but unhandled | Absorb `ready`/`finished` rejections silently | VERIFIED (rapid-nav tests show zero console errors after the fix, vs. errors before it) |
| 4 (characterized, not fixed) | Sub-5ms A→B→A same-tick reversal loses the final call | Native View Transition skip-in-flight timing edge case, isolated to immediate state-reversal within <5ms | Not fixed — no real click, scripted click, or code path can produce a <5ms same-task double call; fixing would mean adding debounce logic to hide a non-reachable race, which this phase's own instructions say not to do | VERIFIED as reproducible (`scratch/vt-burst-threshold.mjs`/`-threshold2.mjs`) and VERIFIED as resolved at 5ms+ gaps |

Bugs 1-3 are Category A (small, isolated, directly part of this phase's own
new code) — fixed in place, then the full 53-check suite re-run clean.
Bug 4 was triaged and deliberately left open per the categorization this
session's own instructions call for.

## 9. NOT TESTABLE — real authentication constraint (unchanged from before this pass)

No safe authenticated session exists in this environment (no `auth` emulator
in `firebase.json`, `js/firebase.js` always talks to real production
regardless of context, the quick-access login chips are confirmed removed
from the live app, no saved session exists). Per this session's own explicit
instruction, these are marked NOT TESTABLE rather than worked around:

- Real Pending/Administration/Executive content crossfading (only synthetic
  harness content was exercised).
- Real Chrome performance trace on real heavy workspace content (a
  synthetic-content wall-clock number was captured in §10, explicitly
  labeled as not a real performance measurement).
- Real drawer-open-during-navigation visual behavior.
- Real mobile device testing (only viewport emulation was done).
- The combined Pending-crossfade-plus-real-cards entrance-motion interaction
  (§6).
- Keyboard/focus continuity into real destination content.
- Real theme+navigation combined interaction.

## 10. Verification performed (what was actually run, and the numbers)

- `node --check js/app.js` — clean parse after every edit.
- **New: `scripts/navigation-crossfade-check.mjs`** (promoted to the
  permanent regression suite, not left in `scratch/`) — a real headless-
  Chromium Puppeteer suite against a synthetic local harness
  (`scratch/navigation-crossfade-harness.html`, a byte-for-byte copy of the
  new control flow, same reason every prior phase in this program used a
  copy: `app.js` has zero exports and boots real production Firebase on
  `DOMContentLoaded`). **53/53 passed.** Covers: first-load guard,
  workspace-change transition + scroll reset, same-name no-op, reduced
  motion, `[data-anim="off"]`, rapid navigation (4-call and 10-call
  bursts), 30-cycle sequential stability with latency-drift check,
  render-failure containment, and 7 viewports × overflow checks.
- **Regression suite re-run (pre-existing scripts, unmodified):**
  - `scripts/workspace-foundation-check.mjs` — 24/24 (VERIFIED)
  - `scripts/drawer-consolidation-check.mjs` (Phase 8.2) — 52/52 (VERIFIED)
  - `scripts/executive-motion-polish-check.mjs` — 16/16 (VERIFIED)
  - `scratch/verify-requests-live-diff.mjs` (Phase 8.3) — 68/68 (VERIFIED)
  - `scratch/verify-pending-workspace-reconciler.mjs` (Phase 8.4) — 57/57 (VERIFIED)
  - `scripts/smoke-boot.mjs` — real unauthenticated boot of the actual
    `index.html`: PASS, 0 fatal errors, app-ready reached, login modal
    renders. (The one logged console error, "Fetch Firebase data gagal:
    Permission denied," is the expected/correct result of an unauthenticated
    read against production and is not a regression.)
  - **Total: 270 pre-existing checks still green, zero regressions
    detected, plus a clean real-app boot.**
- Root-cause investigation scripts (kept, not disposed, per this program's
  convention of committing verification scripts that document what was
  found): `scratch/vt-burst-threshold.mjs`, `scratch/vt-burst-threshold2.mjs`.

**MEASURED, not just logic-asserted:** a synthetic-content wall-clock number
was captured during the 30-cycle stability test (30 real sequential
`setWorkspace()` calls + settle, harness content): first-5 vs. last-5
average per-call time showed no latency drift beyond a 2x threshold. This is
a synthetic-content signal, explicitly not a substitute for a real Chrome
performance trace against real workspace content (still NOT TESTABLE, §9).

## 11. Files changed

- `js/app.js` — the only application file touched this session
  (+410/-95 vs. the last commit, including prior uncommitted work already
  in the tree before this session).

## 12. Files deliberately untouched

- Every workspace's own render function and every `nav*()` function body.
- `js/widgets/executive/*`, `js/analytics/executive-analytics.js` — zero
  edits this session (verified via file mtimes predating this session).
- `js/components/drawer.js` and every canonical drawer instance.
- Firebase (`js/firebase.js`), permissions, `database.rules.json`.
- `js/shell/domain-shell.js`, `js/shell/command-palette.js` — confirmed
  (not re-verified with new edits) to already funnel through the same
  `nav*()` functions; no changes needed or made.
- Phase 6's login transition.

## 13. Known limitations

- The sub-5ms A→B→A race (§8, bug 4) is real, reproducible, and
  deliberately unfixed — flagged for the record in case future code ever
  calls `setWorkspace()` programmatically in a tight loop (no current code
  does).
- `restoreNavState()`'s scroll-restore likely already doesn't work (§5),
  independent of this phase — a pre-existing latent bug, not fixed here,
  worth its own follow-up.
- Every item in §9 remains genuinely unverified in a real authenticated
  browser. This report does not claim otherwise anywhere.

## 14. Git status

Not committed, not pushed, not deployed. `js/app.js` carries this phase's
changes on top of the substantial pre-existing uncommitted working tree
(Phase 8.2/8.3/8.4, the Executive Command Center 7G series, etc.) already
present before this session started.

## 15. Recommendation

**CONDITIONAL — REAL BROWSER VERIFICATION STILL REQUIRED.** The mechanism is
implemented, hostile-reviewed, and verified as thoroughly as this
environment safely allows: 53/53 new checks, 270/270 pre-existing regression
checks, a clean real-app boot smoke test, and three real bugs found and
fixed via actual browser testing (not assumed from source reading alone).
What remains is exactly what §9 lists — real authenticated visual
confirmation — and that requires a human with real credentials, not a
workaround.
