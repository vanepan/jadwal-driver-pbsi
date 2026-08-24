# Phase 7G.5 — Atomic Whole-App Theme Transition Report

**Scope:** Replace the fragmented, per-element theme-transition model
(`html.theme-anim *`, audited across 7G.1–7G.4) with the browser-native
View Transitions API as the primary mechanism, with the entire prior
mechanism preserved unchanged as the fallback for unsupported browsers
and for reduced-motion users. No redesign, no functional change, no IA
change.

**Status:** Complete, verified with real Chrome traces, real computed-
style opacity sampling, and a real running browser, **NOT committed, NOT
pushed, NOT deployed**.

---

## 1. Root cause of the fragmented theme transition

7G.1–7G.4 all measured and tuned the SAME underlying model:
`html.theme-anim *` (plus `::before`/`::after`) individually transitions
`background-color`/`border-color`/`color`/`box-shadow` on every one of
the ~2000 elements in the real page's DOM. That model is architecturally
incapable of producing a unified transition, no matter how its duration
or selector breadth is tuned (7G.4 proved narrowing the selector doesn't
even help performance, let alone perceived cohesion) — because it **is**
literally ~2000 independent CSS transitions, each with its own start
time, its own recalculated computed value, and no browser-level guarantee
they visually settle in lockstep. Different elements can and do finish
recalculating at slightly different points in the frame sequence,
producing exactly the reported "header changes, then a pause, then a card
changes" perception, even when the aggregate numbers (total ms) look
reasonable in isolation.

## 2. Why `html.theme-anim *` felt choppy even with good aggregate numbers

This is the direct answer to the brief's "don't confuse visual smoothness
with lower style recalculation" point. The 7G.3/7G.4 traces measured
**total** style-recalculation time across many small events (13–16 events,
~300ms combined) — a perfectly reasonable-looking aggregate that still
corresponds to the browser recomputing style for large parts of the DOM
tree in several separate passes as the `.theme-anim` class propagates its
invalidation. Nothing in that measurement captures **synchronization**
across elements, which is the actual complaint. A single number can never
prove or disprove "does this look like one coherent surface," which is
why this phase's own evaluation deliberately used both a Chrome trace
**and** direct visual/opacity verification (§10 below), not aggregate
numbers alone.

## 3. Was the View Transition API suitable?

Yes, and confirmed supported in this environment before writing any
implementation code — `typeof document.startViewTransition === 'function'`
returns `true` in the Puppeteer-bundled Chromium used for every real-
browser check in this program (HeadlessChrome/149). The API's actual
mechanism is the correct structural fix for the reported problem: it
captures the **entire viewport** as one "old" snapshot, runs the state-
mutation callback synchronously, captures the **entire viewport** again
as one "new" snapshot, and cross-fades the two as a single compositor
animation. There is no way for one region to visibly lag another in this
model, because there is only one old image and one new image — the
synchronization the brief asks for is a structural guarantee of the API,
not something that needs to be separately tuned or verified per-component.

## 4. Implementation details

`js/app.js`:
- `applyTheme()`'s DOM-mutation body (set `data-theme`, persist to
  `localStorage`, swap the sun/moon icons, update the profile toggle and
  status text) was extracted verbatim into a new `applyThemeState(theme)`
  — no logic changed, just relocated so it can serve as the synchronous
  callback `document.startViewTransition()` requires.
- `applyTheme(theme, animate)` now branches:
  - `animate=false` (initial page load) → `applyThemeState(theme)` only,
    exactly as before — never animated, no view transition, no flash.
  - `animate=true` and `document.startViewTransition` exists and motion is
    allowed → `document.startViewTransition(() => applyThemeState(theme))`.
    This is now the **primary** mechanism for every real user-triggered
    toggle (topbar button, rail button, profile switch — all three already
    called `applyTheme(theme, true)`, unchanged).
  - Otherwise (API unsupported, OR `prefers-reduced-motion: reduce`, OR
    `data-anim="off"`) → the exact pre-7G.5 fallback: add `.theme-anim`,
    the 420ms timeout removes it, `applyThemeState()` runs. **Byte-for-byte
    unchanged** from 7G.4 — this phase is additive, not a rewrite of the
    fallback path.
- Motion gating reuses the codebase's own existing `_analyticsMotionOff()`
  helper (already checks both `data-anim="off"` and the media query,
  already used elsewhere in this same file) rather than reimplementing the
  check.

`platform.css`:
- New minimal block: `::view-transition-old(root)` /
  `::view-transition-new(root)` given an explicit `animation-duration:
  300ms` and `animation-timing-function: ease` — the UA default is already
  a plain cross-fade at 250ms (already inside the requested 250–350ms
  band), so this only makes the duration an explicit, self-documenting
  value in the middle of that range rather than an unstated default. No
  other view-transition CSS was added — per the brief's "use the simplest
  possible configuration," the default cross-fade behavior was tested
  first and found correct (§10), so no custom `::view-transition-group`/
  `-image-pair` choreography was written.
- A defense-in-depth reduced-motion CSS guard
  (`@media (prefers-reduced-motion: reduce)` and `html[data-anim="off"]`,
  targeting `::view-transition-group(*)`/`-old(*)`/`-new(*)`) in addition
  to the JS-level gate — belt-and-suspenders, not the primary mechanism.
- The old `html.theme-anim *` block itself was **not deleted** — it is now
  exclusively the fallback path's mechanism, unreachable whenever the View
  Transition path runs. This matches §5's "if certain micro-transitions
  genuinely need to remain, they must be independently justified": this
  one is justified as the entire safety net for non-supporting browsers,
  not a redundant transition running underneath the new one — when the
  View Transition path is taken, `.theme-anim` is never added, so its CSS
  never activates in the first place.

## 5. Fallback behavior

Confirmed via direct testing (not assumed): with `document.
startViewTransition` deleted from the page (simulating an unsupported
browser) and separately with `prefers-reduced-motion: reduce` /
`data-anim="off"` active, `applyTheme()` correctly takes the fallback
branch every time — verified by wrapping `document.startViewTransition`
with a spy and confirming it is **never called** in any of these three
cases, while the theme itself still correctly changes.

## 6. Desktop verification

1194px and 1440px, both themes: real toggle click fires a real View
Transition (confirmed via a spied `startViewTransition`), final theme
state correct, zero horizontal overflow, zero console/page errors.

## 7. Mobile verification

375 / 390 / 402 / 430px, both themes: same real-toggle test — View
Transition fires at every width, zero overflow, **zero scroll-position
change** (`window.scrollY` identical before/after, explicitly checked),
mobile header screenshotted post-toggle and visually confirmed correct
(dark surfaces, legible text, no partial/mixed-theme artifacts).

## 8. Reduced-motion verification

Both `prefers-reduced-motion: reduce` and `data-anim="off"` tested
independently: `startViewTransition` confirmed never called in either
case (spied, not inferred), theme still changes correctly and
immediately, `.theme-anim`'s own existing reduced-motion CSS guards
(unchanged from 7G.2/7G.4) still apply on that fallback path — no broken
intermediate state.

## 9. Rapid-toggle verification

Six toggles fired 60ms apart (well inside each transition's own ~300ms
window) starting from `light`. Per-click intermediate reads of
`data-theme` showed what looks like a one-step lag relative to the click
that caused it — most likely a microtask-timing characteristic of when
this Chromium build's `startViewTransition` callback becomes externally
observable relative to `click()` returning, not a dropped or duplicated
toggle. What actually matters — the **cumulative, settled result** — was
verified precisely correct: six toggles from `light` mathematically ends
at `light` (light→dark→light→dark→light→dark→light), and the observed
final state matched exactly, **with the rendered background color
independently confirmed consistent with the final `data-theme` value**
(`rgb(255, 255, 255)` for light). No lost toggle, no duplicated toggle, no
split-brain state. Per-spec, a new `startViewTransition()` call while one
is active causes the browser to skip the in-flight one automatically —
native behavior this implementation relies on rather than re-implements.

## 10. Before/after Chrome performance measurements

**MEASURED**, same session, same machine, 3 real `page.tracing` traces per
side for a fair comparison (old mechanism forced via temporarily deleting
`document.startViewTransition` before the click, new mechanism using the
real API):

| | Style recalc | Paint | Long tasks |
|---|---|---|---|
| Old (`.theme-anim *`), 3 runs | 310–319ms / 15–16 events | 21.4–24.5ms | 2–3 tasks (~147–150ms + ~54–62ms) |
| New (View Transition), 3 runs | **37–41ms / 25–28 events** | **8.9–13.9ms** | **1 task (~142–147ms)** |

Style recalculation dropped **~87%** (310–319ms → 37–41ms) — consistent
with the architectural change: the real DOM mutation is now one attribute
write plus a couple of icon swaps, not hundreds of elements individually
recomputing their own transitioned properties. Paint dropped roughly in
half. The event *count* for style recalc is actually slightly higher
(25–28 vs 15–16) but each event is far cheaper — consistent with the View
Transition API's own internal bookkeeping (snapshotting, pseudo-element
setup) replacing the old model's large per-element recalculation passes.

**One residual, flagged rather than claimed fixed**: a single ~142–147ms
long task is present in **both** the old and new measurements, at nearly
identical magnitude, and matches the same ~142–149ms figure recorded in
every trace across 7G.3, 7G.4, and this phase regardless of which theme-
transition mechanism was active. This strongly suggests that task is
**not part of the theme-transition CSS at all** — it is some other fixed
cost triggered by the click (possibly unrelated JS work, or a cost
intrinsic to this specific real page/harness rather than to theming) and
was out of scope to chase down in this pass, which was about the
transition **model**, not an unrelated long task with a stable signature
across three separate phases' worth of measurements.

**MEASURED, not merely inferred, visual synchronization**: rather than
trusting the aggregate numbers alone (per the brief's explicit warning),
`getComputedStyle(document.documentElement, '::view-transition-old(root)')
.opacity` / `-new(root)` were sampled every animation frame during a real
toggle. Result: a smooth, monotonic crossfade — old-opacity descending
1 → 0 and new-opacity ascending 0 → 1 together, in the same frames,
completing in ~300ms with a visibly eased (non-linear, ease-shaped) curve
— direct proof of one coherent, synchronized transition rather than an
inference from timing numbers. (An earlier attempt to verify this via
screenshot sampling at fixed millisecond offsets produced misleading
results — screenshots appeared to jump from fully-light to fully-dark
within ~60ms; the opacity-sampling method revealed this was a headless-
screenshot-capture artifact, not the real transition timing, which is why
this report relies on the computed-style measurement as the authoritative
one.)

## 11. Full regression result

All 11 existing verification scripts re-run after the implementation:
**605/605 passed, 0 failed**, zero assertions weakened or deleted.
Additionally verified via real browser at all 6 required widths (375 /
390 / 402 / 430 / 1194 / 1440) × 2 themes = 12 combinations: real toggle
click, View Transition API confirmed firing, zero horizontal overflow,
zero console/page errors, in every combination.

## 12. Files changed

- `js/app.js` — `applyTheme()` restructured: DOM mutation extracted into
  `applyThemeState()`; added the View-Transition-aware branch; the
  existing fallback branch (class + timeout) preserved unchanged. `ICON_
  SUN`/`ICON_MOON` hoisted to module scope (unchanged content, just no
  longer redeclared inside the function on every call).
- `platform.css` — new `::view-transition-old(root)`/`-new(root)` duration/
  easing rule; new reduced-motion/`data-anim="off"` guard for view-
  transition pseudo-elements. The existing `.theme-anim` mechanism (rule,
  reduced-motion guard, Part D curated list) is **untouched** — it now
  serves exclusively as the fallback path.

## 13. Remaining limitations

- **NOT TESTABLE this session**: real Safari/Firefox behavior. This
  environment only has Chromium available; the fallback path (§5) was
  verified by simulating "unsupported" via deleting the API on a
  Chromium page, which exercises the correct code path but is not the
  same as observing an actual non-Chromium engine. Given `document.
  startViewTransition` is standard-shaped feature detection
  (`typeof ... === 'function'`), there is no reason to expect it to
  behave differently on a real non-supporting browser, but this is
  INFERRED from the feature-detection pattern being correct, not directly
  observed on those engines.
- **NOT TESTABLE this session**: an authenticated view of the actual
  Executive Command Center (Command Panel, Hero, timeline, cards)
  transitioning under the View Transition API — the same documented
  credential constraint as every real-browser pass in this program. All
  verification was performed against the real, unauthenticated shell
  (header, rail, login), which exercises the exact same `applyTheme()`
  code path and the exact same whole-viewport View Transition mechanism
  that would apply once authenticated content is present — the mechanism
  itself does not distinguish between authenticated and unauthenticated
  DOM content, since it operates on the whole document root regardless of
  what's inside it — but this is a reasoned inference from the
  mechanism's design, not a direct observation of the Command Panel
  itself mid-transition.
- The residual ~142–147ms long task (§10) was identified as unrelated to
  the theme-transition mechanism but not root-caused — flagged as a
  separate, pre-existing item rather than investigated further in this
  pass, which was scoped to the transition model itself.

---

Nothing committed, pushed, or deployed. All Phase 7 (7A–7G.5) work remains
uncommitted working-tree changes, awaiting explicit review.
