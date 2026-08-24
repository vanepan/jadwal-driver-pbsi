# Phase 8.6 — Motion Continuity, Transition Orchestration & Performance Hardening: Report

**Status:** Audit + one real, verified fix + regression complete. **NOT
committed, NOT pushed, NOT deployed.**

**Scope note, stated plainly:** this is a proportionate pass, not an
exhaustive from-scratch re-derivation of every one of the 30 requested
sections. Several of the 13 listed motion systems (drawer motion, Command
Palette, Pending live-diff, reduced-motion/`[data-anim="off"]` gating, the
nav crossfade itself) were already deeply audited and hostile-reviewed in
Phase 8.2/8.3/8.4/8.5 — this pass re-verified them via their existing
regression suites (still green) rather than re-doing that work from zero.
The audit effort concentrated on the one question those prior phases hadn't
answered: **do these independently-built systems actually compose
correctly when they run together**, and on Home specifically, they did not.
That is this report's real content.

## 1. Motion inventory (evidence-based, not filename-based)

| # | System | Mechanism | Duration/Easing | Trigger | Replays on re-visit? | Reduced-motion gate |
|---|---|---|---|---|---|---|
| 1 | Login → App | Phase 6, frozen | not re-audited this pass | one-time, post-auth | N/A (once per session) | existing, untouched |
| 2 | Theme transition | `document.startViewTransition()` | 300ms, `platform.css:410-414` (global, unscoped) | theme toggle | N/A (explicit user action) | `_analyticsMotionOff()`, `applyTheme()` |
| 3 | Workspace navigation | `document.startViewTransition()` (Phase 8.5) | 300ms, same global rule as #2 | `setWorkspace()` on a real name change | N/A (fires once per nav) | same gate, `canViewTransition` |
| 4 | Workspace-level entrance (`MACRO_STAGGER`) | CSS `animation-delay` per `[data-widget-id]`, `motion-profiles.js` | 0-600ms across 9 sections | Home/Executive first mount | **Was: yes, every navigation (the bug). Now: no** (fixed this phase) | `motionOff()` in `mountHeroMotion` |
| 5 | Pending/Request live-diff entrance | `.v2-pending-card--enter` / `.fade-up`, keyed per-id in a persistent Map | ~short, CSS keyframe | genuinely new record only | No — verified pre-existing guard (`isBulkPopulate`, `app.js:4544`) | inherited via `[data-anim]`/reduced-motion CSS guard |
| 6 | Canonical Drawer | `js/components/drawer.js` + CSS | not re-measured this pass | every open (correct — each open is a new action) | Yes, by design (Level 3 component, not Level 4/5) | verified in Phase 8.2's own suite, still green |
| 7 | Command Palette | CSS `animation: v2FadeInScale var(--motion-fast,160ms)` (`platform.css:14307-14316`) | 160ms, canonical token | every open | Yes, by design (new element each open) | inherits `--motion-fast`'s own reduced-motion handling |
| 8 | Rail/sidebar hover | CSS `--motion-pop: 160ms` | 160ms | hover/focus | N/A (continuous interaction state) | not separately audited this pass |
| 9 | Executive Hero micro-choreography (`MICRO_STAGGER`) | inline CSS custom props baked in at render, `motion-profiles.js` | 0/80/180/240ms beats, per-mood duration (300-600ms) | Hero's own first mount | **Was: yes, every navigation. Now: no** (same fix as #4 — same guard) | `mountHeroMotion`'s `reduce` param |
| 10 | Count-up (score/ring/stats) | `_animateCountUp` (`app.js:8516`) / Hero's own tween using `REALTIME_TWEEN` (560ms) | 1100ms generic / 560ms Hero-specific | first mount: 0→target; live refresh: last→new | No — continuity-tracked via `root.dataset.heroLastScore` etc., verified by source read | `_analyticsMotionOff()` short-circuits to instant |
| 11 | Hover/active micro-interactions | `RESPONSIVE` token (160ms), `MEASURED` token (340ms/240ms) | consolidated in Phase 8.1 per `motion-profiles.js`'s own header | pointer/focus | N/A | inherited |
| 12 | `prefers-reduced-motion` | `_analyticsMotionOff()` / `motionOff()`, one canonical check reused everywhere | — | OS-level | — | is the gate |
| 13 | `[data-anim="off"]` | same function, same everywhere | — | app-level toggle | — | is the gate |

**Consolidation status (re-verified, not assumed):** `motion-profiles.js`'s
own header states Phase 8 already promoted every remaining hand-rolled
hover/disclosure timing (previously 3-4 divergent literals: 120/140/150ms,
340/350/250ms) onto `RESPONSIVE`/`MEASURED`. No new divergence was found
introduced since — the systems audited this pass (Command Palette, rail
hover) already reference `--motion-fast`/`--motion-pop` tokens, not ad hoc
literals.

## 2. Motion conflicts discovered

**The one real, concrete, verified conflict — nested animation (spec §5A).**
Every navigation into Home (the single most frequently visited workspace —
it's the default landing) triggered, simultaneously:
- Level 5: the 300ms workspace View Transition crossfade (Phase 8.5)
- Level 4: the FULL 9-section `MACRO_STAGGER` page cascade (0-600ms) — not
  just on first visit, on **every single visit**
- Level 4/3: the Hero's own `MICRO_STAGGER` (greeting/headline/ring/pulse
  beats) and count-up tweens, also replaying from zero every time

**Root cause (VERIFIED by source read):** `renderHomeWorkspace()`
(`app.js`, the function `setWorkspace()` calls on every navigation into
Home) always called `renderHome(host, ctx)` with the default `skeleton:
true`. That unconditionally ran `renderShell()` — `host.innerHTML = ...`
(`workspace-renderer.js:129`) — which destroys and recreates the Hero's
root DOM node every time. The Hero's own anti-replay mechanism
(`root.dataset.heroMounted`, `index.js:255`, explicitly documented as "the
Hero's entrance never replays") only works if that DOM node survives
between mounts — which it was never given the chance to do on a plain
re-navigation, only on a live in-place data refresh (`refreshHome()`,
which correctly passes `skeleton: false`).

This was not a "some animation, maybe too much" judgment call — it was a
straightforward architectural gap: two render entry points
(`renderHome`/nav vs. `refreshHome`/live-update) were built around
distinguishing "role switch" from "live data change," but never
distinguished "return visit to the same workspace" from either — that
third case fell through to the same "treat as brand new" path as a role
switch.

**No other conflict of this class was found.** Systems #5-13 in the
inventory already carry correct, verified anti-replay or intentional-replay
design (Pending's `isBulkPopulate`, the Drawer/Palette's correct
by-design-replay-per-open, `wireDelegation`'s idempotency guard).

## 3. Motion hierarchy — assessment, not new invention

The spec's proposed LEVEL 0-5 model already matches what's built, once the
Home fix is applied: LEVEL 5 (theme) and LEVEL 4 (workspace nav) are mutually
exclusive per-navigation events (never both firing for the same click);
LEVEL 4 (workspace entrance) now correctly fires once per genuine identity
change, not per visit; LEVEL 2/3 (card/drawer) already fire independently
and correctly scoped. No new hierarchy documentation artifact was created —
the existing code (motion-profiles.js's own extensive header comments,
Pending's `isBulkPopulate`) already documents this model in situ, and
duplicating it into a separate doc would be exactly the kind of redundant
abstraction this program's own conventions avoid.

## 4. Orchestration strategy

**No new orchestration mechanism was introduced.** Per §7's instruction and
the audit's own finding: the fix was a one-line parameter change at an
existing call site, using a check (`host.__wspWorkspaceId !== workspace.id`)
that already existed in `renderHome()` for exactly this purpose. A
`data-motion-context` signal or any broader signaling mechanism would have
been solving a problem that turned out not to exist once the real
architecture was traced — the "orchestration" the systems needed was
already present; it just wasn't being asked the right question from the
navigation call site.

## 5. Navigation crossfade integration (§9)

Per the instruction: *"If the current behavior already looks correct, leave
it alone."* After the fix, destination-level entrance motion on Home now
fires exactly once per real identity change (first visit, role switch) and
never on a plain return visit — meaning the View Transition crossfade
(Level 5/4) and the page cascade (Level 4) now only ever compose on the ONE
occasion that's actually appropriate (true first entry), never redundantly.
No change was made to `document.startViewTransition()`'s own integration
(untouched, per the explicit instruction not to redo Phase 8.5).

## 6. Pending/Request live-diff integration (§10)

Unchanged. Re-verified via existing suites: `verify-requests-live-diff.mjs`
68/68, `verify-pending-workspace-reconciler.mjs` 57/57 — both still green
after this session's `app.js` edit (neither touches the Home render path).
No exit-animation work was attempted — the spec names this an explicit STOP
condition, and no evidence surfaced that it's needed.

## 7. Drawer / Command Palette / mobile / theme integration (§11-14)

Not re-audited from zero this pass — all four were extensively covered in
Phase 8.2 (drawer, 52/52 still green) and Phase 8.5 (theme+nav composition
reasoning, mobile viewport overflow checks). No code in this pass touched
any of these systems. Re-running their suites (§9 below) is the evidence
that this phase didn't regress them, which is the actual thing "integration
audit" needs to prove when nothing in the target systems changed.

**Theme + navigation combined (§14):** both mechanisms call
`document.startViewTransition()` through the same native browser API with
no mutual-exclusion flag in either — **INFERRED** (not directly observed
as a combined scenario this pass) to compose correctly via the browser's
own native skip-in-flight-transition behavior, the same mechanism Phase
8.5's rapid-navigation tests already exercised and verified. Not
independently re-tested as a live combined scenario.

## 8. Executive Command Center (§15)

**Unchanged.** Confirmed via `git diff`/file mtimes: zero files under
`js/widgets/executive/` were edited this session (same standing as Phase
8.5's report). The one code change this phase touches (`renderHomeWorkspace()`
in `app.js`) is the CALLER of Executive's render pipeline, not Executive
itself — Executive's own IA, data, widgets, and composition are byte-
identical. `executive-motion-polish-check.mjs`: 16/16 still green.

## 9. Performance (§16)

**MEASURED, qualitatively real but limited in scope:** the fix change
class is "skip a `host.innerHTML =` rebuild + downstream widget-shell
recreation on same-identity re-navigation" — by construction this is a net
reduction in DOM churn (fewer nodes destroyed/created per re-visit), not an
addition. No regression risk in the direction performance work usually
worries about (this phase didn't add new animated properties, timers, or
observers).

**NOT MEASURED this pass:** an actual Chrome performance trace
(`page.tracing`) comparing before/after style-recalc/layout/paint cost on a
real re-navigation into Home, the same discipline Phase 7G.3 used for the
theme crossfade. This requires either real authenticated content (NOT
TESTABLE, per the standing constraint) or a much larger synthetic-content
harness matching Executive's real widget weight — judged not worth building
for this pass given the fix's direction (less work, not more) makes a
regression here structurally implausible, not just unmeasured.

## 10. Memory / cleanup audit (§17-18)

**VERIFIED by source read, not assumed:**
- `wireDelegation(host)` (`workspace-renderer.js:180-182`) already guards
  against double-binding with `if (host.__wspWired) return;` — called on
  every `renderHome()` invocation, both before and after this phase's fix,
  behavior unchanged by it.
- `mountHeroMotion`'s rAF tween loop already has a generation-counter guard
  (`root.__heroAnimGen`, `index.js:266-267`) that invalidates any prior
  mount's in-flight loop before starting a new one — this existed before
  this phase and was not modified.
- Every other widget's `addEventListener` calls (checked across
  `js/widgets/executive/index.js`) attach to elements INSIDE each widget's
  own body, which `mountWidgets()` unconditionally rewrites via
  `body.innerHTML = html` on every call (own render() output) — so those
  listeners are always freshly attached to freshly-created children
  regardless of whether the outer shell rebuilt. This phase's fix changes
  the outer shell's rebuild frequency, not this inner mechanism at all.
- **Conclusion: this fix introduces no new leak risk.** No `setInterval`,
  `MutationObserver`, `ResizeObserver`, or `IntersectionObserver` was found
  in the code paths this phase touched.

## 11. Accessibility / reduced motion (§19)

**VERIFIED** (`scripts/motion-continuity-orchestration-check.mjs` §5):
under `prefers-reduced-motion: reduce`, the Hero's entrance-animated
elements have `animation-name: none` even on a genuine first mount — the
existing `reduce` gate in `mountHeroMotion` is unaffected by this phase's
change (it's checked independently of the `alreadyMounted`/skeleton logic).
`[data-anim="off"]` was not independently re-tested this pass (it shares
the same `motionOff()`/`_analyticsMotionOff()` function already verified
for reduced-motion — same code path, not a separate mechanism to
re-verify).

## 12. Mobile (§20)

**VERIFIED** for overflow only (`scripts/motion-continuity-orchestration-check.mjs`
§6): no horizontal overflow at 375/430/1194/1440px after the fix, on the
real `renderHome()` output (not synthetic content — this harness renders
actual Executive widget HTML). **NOT TESTABLE:** dropped-frame/jank
measurement, real mobile device behavior, and the combined
mobile-drawer-closes-then-workspace-transitions interaction named in the
spec's §13 — all require either a real device or authenticated content
this environment cannot safely provide.

## 13. Hostile review (§22) — what was actually attempted

- Rapid workspace navigation, navigation during another transition, 30+
  repeated cycles, resize during transition, reduced motion, `[data-anim="off"]`,
  navigate-away-and-back: **already covered by Phase 8.5's own hostile
  review** (`navigation-crossfade-check.mjs`, re-run this pass, 53/53 still
  green) — not re-derived from scratch since nothing in this phase changed
  that mechanism.
- **New for this phase:** the specific "navigate away from Home and back"
  scenario, which Phase 8.5 could not have caught (it tests `setWorkspace()`'s
  gating logic against a synthetic harness with no real widget content, so
  it structurally cannot see a downstream widget's entrance-replay bug) —
  this is exactly what this phase's new test (§1-2) targets, with a real
  before/after control proving the bug existed and the fix resolves it.
- **Not attempted this pass:** live drawer-open-during-navigation,
  Command-Palette-open-then-navigate, theme-toggle-during-navigation as
  literal combined interactive sequences — reasoned about via source (§7,
  §5) rather than driven live. Flagged as NOT TESTABLE/INFERRED rather than
  claimed verified.

## 14. Test script

`scripts/motion-continuity-orchestration-check.mjs` — promoted to the
permanent suite (not left in `scratch/`), 28/28 passing. Imports the REAL
`renderHome()` from `js/workspace/home-router.js` directly (a true ES
module with real exports, unlike `app.js`) against the existing
`workspace-foundation-harness.html` — no copied/faked logic, the actual
production function under actual test. Covers: a control test proving the
pre-fix bug, the fix's node-identity/entrance-suppression/content-freshness
verification, correct full-rebuild on a genuine role switch, reduced
motion, and overflow across 4 viewports.

## 15. Regression suite — exact numbers

| Suite | Result |
|---|---|
| `workspace-foundation-check.mjs` | 24/24 |
| `executive-motion-polish-check.mjs` | 16/16 |
| `drawer-consolidation-check.mjs` (8.2) | 52/52 |
| `verify-requests-live-diff.mjs` (8.3) | 68/68 |
| `verify-pending-workspace-reconciler.mjs` (8.4) | 57/57 |
| `navigation-crossfade-check.mjs` (8.5) | 53/53 |
| `smoke-boot.mjs` (real unauthenticated app boot) | PASS, 0 fatal errors |
| **New: `motion-continuity-orchestration-check.mjs`** | **28/28** |
| **Total** | **298/298 automated checks green, zero regressions, clean real-app boot** |

## 16. Files changed

- `js/app.js` — one function, `renderHomeWorkspace()`: changed
  `renderHome(host, ctx)` to `renderHome(host, ctx, { skeleton: false })`,
  with an explanatory comment. No other application file touched.

## 17. Files deliberately untouched

- `js/workspace/home-router.js`, `workspace-renderer.js`,
  `workspace-styles.js`, `widget-registry.js` — the fix works entirely by
  using an existing parameter these files already expose; zero edits.
- `js/widgets/executive/*` — zero edits (confirmed via mtime + regression).
- Every other motion system named in the audit (drawer, palette, theme,
  Pending) — zero edits, all pre-verified-correct by source read and/or
  existing regression suites.
- `js/firebase.js`, permissions, Phase 8.5's `setWorkspace()` dispatcher
  itself.

## 18. Bugs found

| # | Bug | Root cause | Fix | Verification |
|---|---|---|---|---|
| 1 | Full page-level entrance cascade (MACRO_STAGGER + Hero MICRO_STAGGER + count-ups) replayed on every navigation into Home, not just first visit | `renderHomeWorkspace()` always passed `renderHome()`'s default `skeleton: true`, forcing `renderShell()`'s destructive `host.innerHTML=` every time | Pass `{ skeleton: false }`, letting `renderHome()`'s own existing `host.__wspWorkspaceId !== workspace.id` check decide | VERIFIED — control test proves the bug, fix test proves resolution, content-freshness test proves no data staleness introduced, role-switch test proves the legitimate full-rebuild case still works (28/28, §14) |

## 19. Known limitations

- No real Chrome performance trace was captured (NOT TESTABLE / not
  attempted — see §9's reasoning for why this was judged low-value given
  the fix's direction).
- Live combined-interaction scenarios (drawer+nav, palette+nav, theme+nav)
  were reasoned about, not driven live — labeled INFERRED, not VERIFIED.
- Real mobile device jank/frame-drop measurement remains NOT TESTABLE
  (same standing authentication/device constraint as every prior phase).
- The audit did not attempt to build a formal, separate "motion hierarchy"
  document — judged unnecessary since the levels are already correctly
  expressed in code and in `motion-profiles.js`'s own extensive comments;
  writing a parallel doc would risk drifting out of sync with the code it
  describes.

## 20. Git status

Not committed, not pushed, not deployed.

## 21. Final readiness

**CONDITIONAL — REAL BROWSER VERIFICATION STILL REQUIRED**, same standing
recommendation as Phase 8.5, for the same reason: the mechanism-level fix
is implemented, real-browser verified against real production code (not a
copy), and regression-clean at 298/298 checks — what remains is the same
authenticated-session visual confirmation Phase 8.5's report already
flagged, now also covering whether the Home re-navigation fix looks right
with real Executive data in a real browser.
