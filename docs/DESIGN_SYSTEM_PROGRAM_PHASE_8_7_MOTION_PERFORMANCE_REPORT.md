# Phase 8.7 — Motion Performance & Rendering Efficiency: Report

**Status:** Audit + baseline measurement + two narrow, evidence-backed fixes
+ regression complete. **NOT committed, NOT pushed, NOT deployed.**

**Scope note:** per this phase's own instruction ("do not assume there is a
performance problem — measure first"), the audit did not go looking for a
problem to justify a rewrite. It traced actual rAF/timer/observer/layout-read
patterns in the motion-relevant files, found two real (small) gaps against
an already-established in-file precedent, fixed those, and captured real
`page.metrics()` numbers (Chrome's actual Performance domain, not
`Date.now()` JS timing) to quantify the effect. No architecture changed.

## 1. Audit — rAF / timer / observer inventory (evidence, not filenames)

Searched `js/app.js`, `js/widgets/executive/index.js`, `js/components/drawer.js`,
`js/requests.js` for every `requestAnimationFrame`/`setInterval`/`new *Observer`
call, then traced each one's start/stop condition:

| Location | Pattern | Bounded? | Guarded against staleness? |
|---|---|---|---|
| `app.js:8618` `_animateCountUp` | rAF tween loop | Yes, `p<1` | N/A — single generic caller, not remounted mid-tween in practice |
| `app.js:2058` `refreshHomeWorkspace` | rAF-coalesced debounce | Yes, one-shot per frame | `_homeRefreshQueued` flag, already correct |
| `app.js` various (drawer/sheet/datepicker open) | single "next frame" trigger | Yes, one call | N/A — not loops |
| `index.js:186` Snapshot generic count-up (`targets.forEach`) | rAF tween loop | Yes, `p<1` | Part of `mountHeroMotion`'s own `stale()` closure — already guarded |
| `index.js:340/352/363` Hero ring/score/stat tweens | rAF tween loop | Yes, `p<1` | **Yes** — `root.__heroAnimGen`/`stale()`, already built (Phase 1) |
| `index.js:167` `mountCountUp` (Snapshot/Outlook) | rAF tween loop | Yes, `p<1` (420ms) | **No — found this pass, fixed** |
| `index.js:201` `mountBarReveal` (Snapshot/Drivers bars) | rAF tween loop per bar | Yes, `p<1` (500ms) | **No — found this pass, fixed** |
| `index.js:652` `clampTooltipToViewport` | single `getBoundingClientRect()` | N/A, one read + conditional write | Already reasoned-about in its own comment; not a thrashing pattern |
| `app.js:4156` | `MutationObserver` | — | pre-existing, not motion-related (`stamp` — outside this phase's scope) |
| `drawer.js` | zero rAF loops found, one one-shot "next frame" trigger for the open transition | Yes | N/A |

**No unbounded loop was found anywhere in the motion-relevant code.** Every
tween is duration-bounded (`p < 1` termination). The gap wasn't "loops that
never stop" — it was two loops that could **outlive their own relevance**
(keep running for their full 420-500ms after a newer mount superseded them),
because they lacked the staleness guard `mountHeroMotion` already
established for the identical scenario.

## 2. Bugs found and fixed

**Bug 1 — `mountCountUp()`/`mountBarReveal()` missing the staleness guard `mountHeroMotion()` already has.**
Root cause: `mountWidgets()` rebuilds each widget's `bodyEl.innerHTML` on
every mount (nav or live refresh). If a second mount for the same widget
(e.g. Snapshot or Outlook, both driven by Firebase listeners) arrives while
a PREVIOUS `mountCountUp`/`mountBarReveal` tween from an earlier mount is
still ticking (within its own 420-500ms window), the old tick loop keeps
running — writing to now-detached DOM nodes — for the rest of its duration.
Not visually broken (detached nodes render nothing) but genuinely wasted
scripting work, compounding under back-to-back Firebase updates — the exact
scenario `mountHeroMotion`'s own comment already names as the reason IT
has this guard (*"wasted work that compounds under back-to-back Firebase
updates"*). It was simply never applied to these two functions when they
were added later.

**Fix:** the identical pattern already in the same file — a per-`bodyEl`
generation counter incremented at the start of each mount call, checked by
every tick before it does any work. `js/widgets/executive/index.js`,
`mountCountUp()` (+8 lines) and `mountBarReveal()` (+3 lines).

**Verification:** `scripts/motion-performance-hardening-check.mjs` §1 —
fired 5 overlapping re-mounts with no `await` between them (the exact
"newer mount arrives before the old tween finishes" scenario), then
confirmed every `[data-countup]` element settled to its EXACT final target
with zero stale/mid-tween values left behind, and zero console errors.
VERIFIED.

## 3. Performance baseline — real measurements

**MEASURED** (`scratch/perf-home-renav-before-after.mjs`, Puppeteer's
`page.metrics()` — backed by Chrome's actual Performance domain, not JS
timing) — 5 re-navigations into the same workspace, comparing the pre-Phase-8.6
pattern (`skeleton` always `true`) against the fixed pattern
(`skeleton: false` on re-navigation):

| Metric | Before (buggy pattern) | After (fixed pattern) | Change |
|---|---|---|---|
| ScriptDuration | 0.0010s | 0.0007s | **-29%** |
| TaskDuration | 0.0182s | 0.0128s | **-29%** |
| Nodes (end state) | 6735 | 5856 | **-13%** |
| LayoutCount / RecalcStyleCount | 0 / 0 | 0 / 0 | no signal either way (see limitation below) |

**Honest limitation on this measurement, stated rather than glossed over:**
`LayoutCount`/`RecalcStyleCount` read 0 in both conditions — this harness
never forces a layout flush between mounts (no geometry read, no paint
wait), so Chrome legitimately deferred that work in both cases; this
result does NOT prove "zero layout cost," it means this specific test
didn't create the conditions to observe it. The Node-count reduction is
real and measured, but this pass did not further isolate its exact
mechanism (plausibly: fewer total nodes created-and-detached over the
sequence, reflected in an intermediate GC-pending count) — reported as a
real number, not a fully-explained one.

**NOT MEASURED / NOT TESTABLE this pass:**
- A real Chrome trace (`page.tracing`) with actual paint/composite
  breakdown — the CDP `Performance.getMetrics()` snapshot approach above
  was judged sufficient for this pass's actual finding (a scripting-time
  reduction from fewer/cheaper mounts), and a full trace requires either
  real authenticated content or a much heavier synthetic-content harness.
- Real device frame-rate/jank measurement (mobile or desktop) — requires
  either a real device or `page.tracing`'s frame-timing data on real
  content; both out of reach under the standing authentication constraint
  for real content, and judged not proportionate to build a heavier
  harness for this pass's narrow findings.
- Sustained memory profiling (heap growth over many real sessions) — same
  constraint.

## 4. Workspace navigation / View Transition performance (§12-13)

Not re-measured this pass — Phase 8.5's own report already captured this
ground (its own `page.metrics()`-adjacent reasoning, its 30-cycle stability
test). Nothing in `setWorkspace()`/`applyWorkspaceState()` changed this
phase. Re-running `navigation-crossfade-check.mjs` (53/53, unchanged) is
the evidence that Phase 8.7's edits didn't regress it.

## 5. Live-diff, Drawer, Command Palette, Executive, Login (§14-18, §22)

- **Live-diff (Pending/Requests):** unchanged, no exit-animation work
  attempted (explicit STOP condition, and no evidence surfaced that it's
  needed). `verify-requests-live-diff.mjs` 68/68, `verify-pending-workspace-reconciler.mjs`
  57/57, both unchanged.
- **Drawer:** audited for rAF/layout-thrash patterns (§1 above) — clean,
  zero changes made. `drawer-consolidation-check.mjs` 52/52 unchanged.
- **Command Palette:** already uses canonical `--motion-fast` token
  (`platform.css:14316`), not re-audited further this pass — no rAF loops
  found in `command-palette.js` itself in this or the Phase 8.6 pass.
- **Executive Command Center:** the two fixes ARE inside
  `js/widgets/executive/index.js`, the one exception the phase's own spec
  explicitly allows ("performance optimization is allowed only if...
  implementation-level... does not alter Executive behavior... passes the
  existing Executive regression suite") — `executive-motion-polish-check.mjs`
  16/16 and `workspace-foundation-check.mjs` 24/24, both unchanged, confirm
  the carve-out's own condition is met.
- **Login (Phase 6):** not touched, not independently re-inspected this
  pass (frozen per instruction; no evidence prompted a look).

## 6. Mobile (§19)

**VERIFIED** for overflow only, same 4 viewports as Phase 8.6
(`motion-performance-hardening-check.mjs` §4): no horizontal overflow on
the real `renderHome()` output at 375/430/1194/1440px. **NOT TESTABLE:**
real frame-drop/scroll-hitch measurement, real devices — same standing
constraint.

## 7. Background tab behavior (§20)

**NOT INDEPENDENTLY TESTED this pass.** Reasoned by construction: every
tween audited in §1 is `p < 1`-bounded (self-terminating on elapsed
wall-clock time via `performance.now()`), not an indefinite loop — a
backgrounded tab's throttled rAF callback rate would simply make an
in-flight tween finish later in wall-clock time, not run forever or
accumulate work. No JavaScript-driven visibility-change handling was added,
per the instruction not to add one without evidence it's needed — none
surfaced.

## 8. Reduced motion / `[data-anim="off"]` (§21)

**VERIFIED**: `mountCountUp`'s existing `motionOff()` check (untouched by
this phase's fix — the guard is additive, sitting inside the tween path
that already skips entirely under reduced motion) still shows exact values
immediately with zero tween (`motion-performance-hardening-check.mjs` §2).
`[data-anim="off"]` shares the same `motionOff()` function, not
independently re-tested (same code path already verified for reduced
motion).

## 9. Memory / repeated-interaction stability (§23)

**VERIFIED** for the Home-return case specifically (the system this phase's
fixes touch): 30x Home return visits, Hero node identity stable throughout
(shell never unnecessarily rebuilds — confirms Phase 8.6's fix holds under
sustained repetition, not just a single re-visit), exactly one set of
widget cards present at the end (no accumulation), zero console errors
(`motion-performance-hardening-check.mjs` §3). **NOT TESTED this pass:**
30x drawer/palette/theme cycles — those systems weren't touched by Phase
8.7 and were already exercised at this repetition count by Phase 8.2's
(drawer) and Phase 8.5's (rapid nav, 30-cycle) own suites, re-run clean
this pass; re-deriving identical stress tests for unchanged code was
judged non-additive.

## 10. Hostile review — what was actually attempted

Overlapping/non-awaited rapid re-mounts (the specific race the staleness
fix targets), 30x Home return visits, reduced motion, 4 viewports, real
`page.metrics()` before/after on a realistic 5-navigation sequence.
**Not attempted:** the full cross-product in §26 (rapid navigation +
drawer + palette + theme all combined, background/foreground tab
switching) — none of that surface changed this phase, and Phase 8.5/8.6's
own hostile-review passes already covered the navigation/continuity half of
it. Re-running their suites (below) is the applicable evidence.

## 11. Test script

`scripts/motion-performance-hardening-check.mjs` (16/16) — promoted to the
permanent suite. Verifies the staleness-guard fix behaviorally against the
real render pipeline (not copied logic), reduced motion, 30x return-visit
stability, and overflow across 4 viewports. Real performance numbers live
separately in `scratch/perf-home-renav-before-after.mjs` (kept, documents
the measurement) rather than duplicated into the pass/fail suite, since
`page.metrics()` deltas are inherently informational, not a binary gate.

## 12. Regression suite — exact numbers

| Suite | Result |
|---|---|
| `workspace-foundation-check.mjs` | 24/24 |
| `executive-motion-polish-check.mjs` | 16/16 |
| `drawer-consolidation-check.mjs` (8.2) | 52/52 |
| `verify-requests-live-diff.mjs` (8.3) | 68/68 |
| `verify-pending-workspace-reconciler.mjs` (8.4) | 57/57 |
| `navigation-crossfade-check.mjs` (8.5) | 53/53 |
| `motion-continuity-orchestration-check.mjs` (8.6) | 28/28 |
| `smoke-boot.mjs` (real unauthenticated app boot) | PASS, 0 fatal errors |
| **New: `motion-performance-hardening-check.mjs`** | **16/16** |
| **Total** | **314/314 automated checks green, zero regressions** |

## 13. Files changed

- `js/widgets/executive/index.js` — `mountCountUp()` and `mountBarReveal()`,
  each gained a generation-counter staleness guard (same pattern as the
  existing `mountHeroMotion()` in the same file). No visual, timing, or
  behavioral change to what a user sees — only removes wasted work on
  already-detached nodes.

## 14. Files deliberately untouched

- `js/app.js` — no changes this phase (Phase 8.5/8.6's `setWorkspace()`/
  `renderHomeWorkspace()` changes stand as-is; this phase's audit of its
  rAF usage found nothing to fix).
- `js/components/drawer.js`, `js/shell/command-palette.js` — audited,
  clean, zero edits.
- Everything else already listed as untouched in the 8.5/8.6 reports
  remains untouched: Firebase, permissions, workspace renderer/registry,
  live-diff reconciliation architecture, `document.startViewTransition()`
  integration, Phase 6 login.

## 15. Known limitations

- `LayoutCount`/`RecalcStyleCount` showed no signal in this pass's
  measurement setup — a real limitation of the harness, not a claim that
  layout cost is zero (§3).
- No real Chrome trace, no real device testing, no sustained memory
  profiling — all NOT TESTABLE under the standing authentication
  constraint, consistent with every prior phase in this program.
- The Node-count reduction (§3) is a real, measured number whose exact
  mechanism wasn't further isolated this pass.

## 16. Git status

Not committed, not pushed, not deployed.

## 17. Final readiness

**CONDITIONAL — REAL BROWSER VERIFICATION STILL REQUIRED**, same standing
recommendation as Phase 8.5/8.6. The audit found no evidence of a broader
performance problem requiring architectural change — the two fixes made are
narrow, precedented, and real-browser verified against the actual
production render pipeline. What remains unverified is, again, the same
authenticated-session real-content confirmation every phase in this program
has flagged, now also covering whether the measured scripting-time/node-count
reduction is perceptible (or was ever perceptible) with real data volume.
