# Phase 8.5 — Navigation Crossfade & Workspace Transition: Migration Map

**Status:** Audit + migration map, pre-implementation. No code changed yet.

## 0. Scope

Numbering note: the original Phase 8 roadmap (`DESIGN_SYSTEM_PROGRAM_PHASE_8_MOTION_REPORT.md`
§21) called this **8.4** — "Domain/workspace navigation crossfade." That slot
was consumed instead by Pending Workspace Realtime, a defect 8.3 uncovered
mid-flight and that needed its own phase (`..._PHASE_8_4_PENDING_WORKSPACE_REALTIME_REPORT.md`).
This phase is the original 8.4 item, renumbered **8.5** to its actual place
in the shipped sequence (8.1 Motion Foundation → 8.2 Drawer Consolidation →
8.3 Requests Diffing → 8.4 Pending Workspace Realtime → **8.5, here**).

Target: `setWorkspace()` in `js/app.js` (currently line 4199) — the single
function every navigation path in the app calls to switch the visible
workspace. Confirmed as the sole choke point (§4 below); this phase does not
touch any individual workspace's internal render logic.

## 1. Traced flow (current, before this phase)

```
User navigation (desktop rail click, mobile drawer/bottom-nav tap,
domain-shell.js's new IA, command palette, browser reload via
restoreNavState())
    ↓
one of ~19 nav*() functions in js/app.js (navHome, navPending,
navJadwalDriver, navManajemenUser, navGudang, ...) — "single source of
truth for routing", per that block's own header comment at app.js:1841-1846
    ↓
setWorkspace(name)                                   [app.js:4199-4317]
    sweepOpenModalsOnWorkspaceChange()
    currentWorkspace = name
    ~15 raw display toggles:  hostEl.style.display = isX ? 'block' : 'none'
    pause/resume live listeners for the workspace being left/entered
    if (isPend)  renderPendingWorkspace()             ← full section render,
    if (isAdmWs) renderV2AdminWorkspace()                synchronous, already
    if (isHome)  renderHomeWorkspace()                   complete when
                                                          setWorkspace() returns
    ↓
old workspace: display:none, instantly gone
new workspace: display:block, instantly there, fully painted
    ↓
[NO motion layer at all today — confirmed by reading the full function body,
 not assumed]
```

**Root cause, confirmed by source read (not inferred):** every one of the
~15 `hostEl.style.display = isX ? 'block' : 'none'` lines in `setWorkspace()`
is a hard swap. There is no transition, no opacity ramp, nothing — this
matches exactly what the Phase 8.1 report predicted without yet fixing
(`PHASE_8_MOTION_REPORT.md` §6: *"Out of scope for 8.1 — see §21, Phase 8.4
[now 8.5]. `setWorkspace()`'s `display` toggles ... remain hard swaps."*).
`renderShell()`, named in that same original roadmap line as a second target,
no longer exists in the codebase (grepped, zero matches) — its `innerHTML=`
replace was presumably refactored away in an intervening phase; nothing to
migrate there.

## 2. Prior art already in the codebase — Phase 7G.5's theme-toggle crossfade

This is the load-bearing precedent for this phase's design, not a new
invention. `applyTheme()` (`app.js:11756-11788`) solved **the identical
problem shape** — swap the entire visible screen from one state to another
without it looking fragmented — for the light/dark theme toggle, and its own
header comment documents the exact failure mode that matters here too:

> *"the old mechanism drove the transition via `html.theme-anim *` —
> hundreds/thousands of INDEPENDENT per-element CSS transitions, each
> individually starting/settling, which is why the app never looked like ONE
> surface changing state no matter how much that selector or its duration
> was tuned."*

The fix was `document.startViewTransition()`: the browser captures the whole
viewport as one before/after image pair and cross-fades them as a single
compositor animation, so there is no "header changes before the sidebar" —
architecturally impossible, not just tuned away. Progressive enhancement:
used when supported and motion is allowed; falls back to the pre-existing
instant/CSS path otherwise.

**Navigation is the same problem shape, one level up** — instead of "same
layout, different colors" it's "different layout, different content," but
the mechanism doesn't care: it screenshots whatever is actually on screen
before and after `setWorkspace()`'s synchronous body runs, and cross-fades
those two images. Recommendation: **reuse this exact mechanism at
`setWorkspace()`**, not a new bespoke navigation-motion system.

## 3. Reusable infrastructure already in place (verified, not assumed)

- `platform.css:410-414` — `::view-transition-old(root)` /
  `::view-transition-new(root) { animation-duration: 300ms; ... }` is
  **already global**, not scoped to the theme toggle. Any future call to
  `document.startViewTransition()` anywhere in the app inherits this timing
  for free; no new CSS is required for the base crossfade to work.
- `platform.css:421-432` — the reduced-motion / `[data-anim="off"]` guard on
  `::view-transition-*` is also global (`animation: none !important`),
  so a navigation-triggered transition is automatically accessible-safe with
  zero new code.
- `js/app.js`'s `_analyticsMotionOff()` (line 8511) — despite the name, this
  is the app's one canonical reduced-motion/`data-anim` check, already reused
  verbatim by `applyTheme()` itself. Same function, same call, for the nav
  case — no new gate to invent.
- Chrome (rail, topbar, bottom-nav) sits outside every workspace host and is
  never torn down on navigation — only content-region pixels actually
  differ between the old and new snapshot, so an unscoped root-level
  transition behaves, in practice, like a content-only crossfade: pixels
  that don't change don't visibly move. (Same reasoning that already makes
  the theme crossfade work despite also being root-scoped.)
- Native overlap handling: per the View Transitions spec (and already relied
  on by `applyTheme()`'s own comment), a second `startViewTransition()` call
  while one is in flight skips the first and starts immediately — rapid
  double-clicks on nav items need no manual debouncing, exactly as today's
  theme toggle needs none.

## 4. Single choke point — confirmed, not assumed

Traced every navigation entry point in the codebase to verify they all
funnel through `setWorkspace()` before instrumenting it:

| Entry point | Routes through |
|---|---|
| Desktop rail (`v2Rail*` buttons) | `handleRailClick()` → `setRailModule()` → `nav*()` → `setWorkspace()` |
| Mobile bottom nav (`bottom-nav-registry.js`) | `bottomNavActionMap()` → the same `nav*()` functions |
| Mobile sidebar drawer | Same `nav*()` functions (per `app.js:1844-1846`'s own header: *"Panel buttons, the mobile sidebar drawer and any mobile sub-nav all call these — single source of truth for routing"*) |
| `js/shell/domain-shell.js` (new `domainShellV1`-flagged 7-domain IA, currently default-off) | Explicitly a thin DI router — calls the *exact same* `nav*()` refs via its `land` config object, confirmed in its own header comment: *"every domain/tab renders through the real, unmodified nav functions"* |
| `js/shell/command-palette.js` | Same `land`/`nav*()` refs, shared with domain-shell.js |
| Browser reload / `restoreNavState()` (`app.js:664`) | `setRailModule(state.module)` → same path |

**Conclusion:** instrumenting `setWorkspace()` alone covers every present
and near-future (flagged, unshipped) navigation surface in the app. No
per-entry-point work is needed.

## 5. Real gaps found during this audit (not part of the original ask, found by tracing)

**5a. No scroll-reset on workspace change — currently invisible, would become a real visual bug once crossfade ships.**
`.main-content` is documented in the code itself as *"the single scroll
container every workspace renders into"* (`app.js:686-687`, `wireScrollStateSave()`'s
own comment) — every workspace host is a sibling inside it, sharing ONE
scroll position. Grepped every `scrollTo`/`scrollTop` call site in `app.js`:
the only general-purpose one resets scroll on a **logo/crest click**
(`app.js:2657-2659`), not on workspace navigation. `restoreNavState()`
deliberately restores a saved `scrollY` on reload (`app.js:680-683`) — that
is intentional "resume where you left off," not this bug.

Today this is masked: an instant `display:none`→`block` swap gives the eye
no time to register that the new workspace's content started mid-scroll.
Under a crossfade, the old and new frames are visible simultaneously for
~300ms — a user who scrolled deep into e.g. Administration → Users, then
navigates to Pending, would see Pending's card list crossfade in already
scrolled past its own header. **This needs a `.main-content` scroll-reset
folded into the same `setWorkspace()` change**, or the crossfade will make an
existing latent bug newly, visibly wrong. (Scoped to exclude the
`restoreNavState()` reload path, which sets scroll intentionally via its own
deferred `setTimeout`.)

**5b. Scope question — workspace-boundary crossings only, or every `setWorkspace()` call?**
Several `nav*()` functions call `setWorkspace('administration')` with the
**same** name repeatedly (e.g. `navManajemenUser()` → `navKonfigurasiGlobal()`
→ `navRoleManagement()`-adjacent admin sections) — the display toggle is a
no-op (already `block`), only `renderV2AdminWorkspace()`'s internal content
changes. Crossfading these too would treat every admin-section click the
same as a full domain change, which may read as too heavy for what's
actually a sub-navigation. This needs a product decision (§7), not a
unilateral call — Phase 8.3/8.4 deliberately kept within-workspace updates on
their own lighter (diff-based) motion model rather than a coarse full-screen
transition, which is a relevant precedent for "no" here.

## 6. What stays untouched

- Every individual workspace's own render function (`renderPendingWorkspace()`,
  `renderV2AdminWorkspace()`, `renderHomeWorkspace()`, etc.) — this phase
  wraps `setWorkspace()`'s existing synchronous body in a transition
  callback; it does not change what any of them render or how.
- Phase 8.3/8.4's per-card diffing/entrance-motion (`.v2-pending-card--enter`,
  `reconcileRequestCards`) — those fire on **live data changes within an
  already-visible workspace**, a different trigger than a navigation crossfade.
  Need to verify in implementation (not blocking for this map) that
  navigating INTO Pending doesn't spuriously re-trigger every card's enter
  animation — expected not to, since `_pendingCardNodes` persists across a
  `display:none`/`block` toggle (the nodes are never destroyed), but this is
  a verification item, not yet confirmed by a real test.
- `js/components/entry-transition.js` — Phase 8.1 flagged this as an
  already-well-built, currently-unadopted canonical primitive. Not used here:
  it's a per-element entrance animation tool, a different problem shape than
  "cross-dissolve the whole screen," which is what `startViewTransition()`
  already solves at the root. No conflict, just: not the right tool for this
  specific gap.

## 7. Open decisions (need a call before implementation)

1. **Scope of §5b** — crossfade only on workspace-name changes (recommended:
   simplest, matches "domain change" framing in the original roadmap item,
   avoids re-litigating Phase 8.3/8.4's within-workspace motion model), or
   also on same-name re-navigations?
2. **Fallback behavior for unsupported browsers** (Firefox stable, Safari
   <18.2) — recommended: none needed, they simply keep today's exact instant
   swap (this is genuinely different from theme toggle, which had a
   *pre-existing* `.theme-anim` CSS crossfade to fall back to; navigation has
   no such prior mechanism, so "fallback" here just means "unchanged
   behavior," zero new code for that path).
3. **5a's scroll-reset** — confirm this should ship bundled with 8.5 (it's
   the same `setWorkspace()` call site and becomes visibly necessary once the
   crossfade exists) rather than filed as a separate fix.

## 8. Verification plan (once the above are decided)

- Real Chrome trace (`page.tracing`) of an actual nav click, same discipline
  as Phase 7G.3's theme-toggle measurement — confirm navigation-triggered
  `startViewTransition()` doesn't reintroduce a style-recalc cost spike on
  the app's heavier workspaces (Pending with many cards, Administration).
  Navigation is a much higher-frequency action than theme toggling, so this
  matters more here than it did there.
- Puppeteer: `getComputedStyle`/bounding-rect assertions on the scroll-reset
  fix (§5a), not just DOM-content presence — per the explicit lesson already
  recorded from Domain Shell Phase 1's tab-visibility bug, a content
  assertion is not a visibility/position assertion.
- Manual look at a real trace of Pending→Administration and
  Administration→Pending (both directions) to confirm no double-firing of
  `.v2-pending-card--enter` (§6).
- `[data-anim="off"]` and OS reduced-motion runs: confirm instant, correct
  end-state with zero animation, same as the existing theme-toggle guard.

---

## 9. Implementation addendum (post-build — §7's decisions resolved, real findings from hostile review)

§7's three open decisions were resolved: crossfade scoped to workspace-name
changes only (§7.1); no fallback animation for unsupported browsers, they
keep the exact prior instant swap (§7.2); the scroll-reset ships bundled
with this phase (§7.3). Full implementation detail lives in the Phase 8.5
**Report** doc, not duplicated here. This section records architecture
findings from the deeper audit/hostile-review pass that weren't yet known
when §0-§8 above were written.

**9a. Entry-point audit completed — "Executive Launcher" traced and confirmed.**
`buildHomeContext()`'s `actions` map (`app.js:1884-1910`) is the sole bridge
handed to every Home/Executive widget, including whatever the Home layout's
"Launcher"/"Explore" zone renders (`workspace-registry.js`'s own comment
names it, e.g. line ~29: *"the Launcher's own 'the way out arrives last,
quietly' motion intent"*) — its entries (`navPending`, `navVehicles`,
`navDriverOps`, `navEngineering`, `navHome`, etc.) are the literal `nav*()`
functions, confirming this is not a separate navigation system. §4's
"single choke point" conclusion now covers every entry point named in the
Phase 8.5 continuation brief, not just the ones the original audit checked.

**9b. Drawers are NOT swept on workspace change — confirmed pre-existing, not a Phase 8.5 regression.**
`sweepOpenModalsOnWorkspaceChange()` (`app.js:4198-4202`, first line of the
navigation path) only touches `.modal-overlay` elements. `js/components/drawer.js`'s
`openDrawer()`/canonical drawer instances are a structurally separate
overlay system it never queries. This means navigating away while a drawer
(Assignment Detail, Vehicle Detail, Decision Replay, Driver Wellness) is
open leaves it open today, unchanged by this phase — confirmed by reading
both functions, not assumed. Per this phase's own instruction (§15: *"If
navigation is expected to close a drawer, verify that behavior rather than
changing it"*) — the verified behavior is "not expected to close," so this
was left untouched, not fixed.

**9c. `.main-content` is not the actual scroll container — corrected mid-implementation.**
§5a's original scroll-reset fix (this map's §5a, written before code existed)
assumed `wireScrollStateSave()`'s own comment — *"#main-content is the single
scroll container every workspace renders into"* — was accurate. It is not:
grepping `style.css`/`platform.css` for `overflow-y` on `.main-content`,
`.main-area`, and `.app-layout` finds none; `.app-layout` only sets
`overflow-x: clip` (deliberately, per its own comment, to avoid blocking
touch-pan events — see line ~148). The DOCUMENT scrolls, not `.main-content`.
The first version of the fix set `.main-content.scrollTop`, which was
therefore a silent no-op — caught by real-browser testing (a headless
Chromium harness with real overflow showed the assertion never actually
scrolled), not caught by the logic-only harness (which mocks the DOM and
so had no way to catch a wrong-element bug). Corrected to target
`document.scrollingElement`. `wireScrollStateSave()`/`restoreNavState()`
have this identical pre-existing mismatch — out of scope for this phase
(not introduced by it, not touched), documented for whoever picks it up.

**9d. View Transition promise rejections were unhandled — found and fixed.**
`document.startViewTransition()` returns three promises. The original
implementation only awaited `updateCallbackDone` (guarding against a render
function throwing). Real-browser rapid-navigation testing surfaced a second,
more common failure mode: `ready`/`finished` reject with
`AbortError: Transition was skipped` whenever a transition is natively
superseded by a newer one before it finishes — expected, benign behavior
(the same mechanism `applyTheme()` already relies on), but unhandled it
produced a real console error on every instance of ordinary rapid
navigation. Fixed by absorbing `ready`/`finished` rejections silently while
keeping `updateCallbackDone`'s rejection logged (that one indicates an
actual application bug, not a benign skip).

**9e. A narrow, sub-5ms, non-reachable race was found, characterized, and deliberately left unfixed.**
Investigated via `scratch/vt-burst-threshold.mjs` / `-threshold2.mjs`
(kept — they document the investigation). Root cause: calling
`setWorkspace(A)` → `setWorkspace(B)` → `setWorkspace(A)` again with under
~5ms between the 2nd and 3rd calls loses the final call (B wins instead of
the intended return to A). Confirmed NOT a general "many rapid calls"
problem — sequences that don't immediately revisit the just-left state
resolve correctly regardless of count; the failure is specific to an
immediate A→B→A reversal inside the browser's native transition-skip
window. At a 5ms+ gap it resolves correctly every time. No real click
event, no scripted UI click, and no existing `nav*()` call site in this app
can produce two `setWorkspace()` calls under 5ms apart — every real
navigation originates from a separate browser task. Left unfixed per this
phase's own instruction not to add debounce logic to hide a race that has
no real trigger; recorded here in case it ever becomes reachable through
future code that calls `setWorkspace()` programmatically in a tight loop.
