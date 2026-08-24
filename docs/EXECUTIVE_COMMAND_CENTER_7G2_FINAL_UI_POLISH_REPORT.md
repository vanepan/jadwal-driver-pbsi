# Phase 7G.2 — Final UI Polish Report

**Scope:** Three targeted fixes found during real-browser review: theme
transition choppiness, mobile header sizing/spacing, and the PBSI logo's
white background in dark mode. No IA change, no Hero redesign, no glow
changes (the 7G.1 glow was untouched, per the brief).

**Status:** Complete, verified in a real running browser session (not just
computed-style assertions), **NOT committed, NOT pushed, NOT deployed**.

**Testing method note:** all real-browser testing this round was done
**unauthenticated** — the app's own production Firebase has no test
credentials available in this session, and `js/firebase.js` always points
at the real production project (a documented, established constraint from
earlier in this program). This was sufficient because the header/topbar,
navigation rail, logo, and theme-toggle mechanism all initialize at
`DOMContentLoaded`, independent of login state (confirmed by reading
`app.js`'s init sequence) — the login overlay was hidden via
`element.style.display='none'` for screenshots only, no Firebase auth was
touched, no writes were made. See §10 for the one thing this couldn't
cover.

---

## 1. Root cause of remaining theme-transition choppiness

Investigated before changing anything, per the brief's explicit instruction.

The app already has a real, working site-wide crossfade: `applyTheme(theme,
true)` (called from all three real toggle buttons — topbar, rail, profile
switch — confirmed by reading all call sites) adds a `theme-anim` class to
`<html>` for ~650ms, which a `platform.css` rule uses to transition
`background-color`/`border-color`/`color`/`box-shadow` on every element,
plus a faster, curated 280ms "Part D" list for primary chrome containers.
7G.1 already fixed the Executive Command Center's gradient surfaces. So
what was still choppy?

**Two concrete, separate bugs, found by reading the CSS cascade and then
confirming with live, frame-by-frame `getComputedStyle` sampling of a
real click on the real toggle button — not assumed:**

1. **`.domshell-rail-logo` (the PBSI crest chip in the nav rail/mobile
   drawer) had a hardcoded `background: #fff` with no dark-mode value at
   all.** Not a snap — a total failure to theme. This was the dominant,
   most visually jarring part of "still choppy": a persistently white box
   sitting in an otherwise dark UI, unrelated to any transition timing.
2. **A real timing desync, confirmed only by live sampling**: `.v2-topbar`
   is in the curated "Part D" 280ms list, but `.domshell-rail` (the
   current nav rail, live under the `domainShellV1` default) and
   `.domshell-rail-logo` are not — that list still only has the *older*
   `.v2-rail` class from before "Redesign Phase 1" introduced
   `.domshell-rail` as its replacement. So the rail/logo fell back to the
   generic 550ms rule. Measured on a real click: `.v2-topbar` reached its
   final color by ~210ms while `.domshell-rail`/`.domshell-rail-logo` were
   still visibly interpolating past 500ms — the header visibly finished
   before the rail, i.e. exactly the reported "parts changing at
   different times."

No JS re-render was found to be defeating the transition — `applyTheme()`
was read in full; the only DOM mutation it does is swapping the sun/moon
SVG inside the toggle buttons themselves, which is expected and unrelated.

## 2. Exact transition fix

- `[data-theme="dark"] .domshell-rail-logo { background: var(--surface); }`
  — same one-line pattern `.brand-mark` (the login/splash crest badge)
  already used at `platform.css`'s `[data-theme="dark"] .brand-mark` rule.
  Did **not** touch the logo asset (`assets/Logo-PBSI.png`) — inspected it
  first (PNG, RGBA, already a transparent-background crest with no baked-in
  white rectangle) and confirmed the white was coming entirely from the
  container, per the brief's own explicit instruction to check that before
  changing anything.
- Added `.theme-anim .domshell-rail, .theme-anim .domshell-rail-logo` to
  the existing "Part D" curated 280ms list — reusing the exact mechanism
  already there for `.v2-topbar`/`.v2-rail`, not inventing a new one.
- Both are plain `background-color` changes (no gradients here, unlike
  Executive), so no `@property` registration was needed this round — the
  existing `html.theme-anim *` mechanism handles solid-color transitions
  natively.

**Verified live** (real click on `#v2TopbarThemeBtn`, `getComputedStyle`
sampled every animation frame): logo, header, and rail now report
**identical RGB values at every single sampled frame** through the whole
transition (light→dark: 255,255,255 → …→ 31,32,37, converging together at
~340ms; dark→light: the reverse, converging at ~290ms) — no visible desync
in either direction.

## 3. Mobile header changes

Investigated with real computed styles and an annotated real-browser
screenshot (every control outlined) at 375px before concluding what was
actually wrong — not guessed from reading the ~14 scattered historical
`.v2-topbar` rule blocks this file has accumulated across prior "VSM"/
"Phase 11" passes.

**Found**: the primary toolbar row (hamburger | date-nav | avatar) is
already a deliberately-designed 3-column/2-row CSS Grid with extensive,
well-reasoned history comments (`Phase 11I`/`11L`) from real prior device
testing — this was **not** broken and was left untouched, per "don't touch
working parts simply because they could be different."

**The one real, confirmed defect**: the quick-search trigger
(`.domshell-palette-trigger`, "Cari Cepat") had **no `grid-area` of its
own** in either breakpoint's `grid-template-areas`. CSS Grid auto-placement
dropped it into an undocumented implicit row below the named template —
small content width, left-aligned, with the entire rest of that row empty.
The annotated screenshot showed this precisely (a small "Cari Cepat" pill
with a large gray gap to its right, structurally different from every
other row, which are all deliberately centered/positioned).

**Fix**: added a `"search search search"` (≤600px) / `"search search"`
(≤380px) row to both existing `grid-template-areas`, and gave the trigger
`grid-area: search; justify-self: center;` in one new rule written
**outside** the media queries — `grid-area` only has an effect when the
parent is actually `display: grid` (≤600px only), so it is provably inert
at every wider breakpoint by construction, not by convention.

The date-nav row itself (Hari Ini / arrows / date) was investigated the
same way and found to already be correctly centered
(`justify-content:center` + `justify-self:center`, both already present) —
its own perceived "extra space" is the pill's already-content-driven width
(the date picker trigger alone needs ~150-180px), not a real bug; left
unchanged.

## 4. Responsive behavior at 375/390/402/430

All four widths screenshotted before and after: `"Cari Cepat"` now sits
centered on its own dedicated row at every one of them, including 430px
(previously the most cramped — the search trigger squeezed onto row 1
with everything else). `document.documentElement.scrollWidth <=
clientWidth` asserted programmatically at all four widths: **zero
horizontal overflow**. Primary toolbar row (hamburger/date-nav/avatar)
unchanged at all four, confirming the fix didn't touch what was already
correct.

## 5. PBSI dark-mode logo treatment

- **Light mode**: unchanged — confirmed via side-by-side screenshot, the
  logo chip is still the same white badge with border it always was.
- **Dark mode**: chip background now `var(--surface)` (matches the rail's
  own dark surface), crest fully legible against it, no white rectangle.
  Same fix applies automatically on both surfaces that share this one live
  DOM node — the persistent ≥768px rail and the mobile hamburger drawer
  (confirmed by reading `domain-shell.js`'s own comment: "below 768px
  these are the SAME live nodes, just moved and restyled").
- Logo asset itself untouched, per the brief's explicit instruction.

## 6. Reduced-motion behavior

Neither the site-wide `.theme-anim` crossfade nor its "Part D" curated
list had **any** `prefers-reduced-motion`/`data-anim="off"` guard before
this pass — a real, pre-existing accessibility gap, now closed as part of
fixing this exact mechanism (in scope, since the brief lists reduced-motion
preservation as an explicit acceptance criterion for this pass and I was
already extending this exact code). Added matching `@media
(prefers-reduced-motion: reduce)` and `[data-anim="off"]` overrides for
both the universal rule and the Part D list (the Part D list needed its
own separate guard — its own `!important` rule comes later in the
cascade and would otherwise silently re-enable the transition even under
reduced motion).

**Verified live**: with `prefers-reduced-motion: reduce` emulated, a real
click on the toggle button changes the logo's background from white to
dark within 2 animation frames (functionally instant) with
`transitionProperty` computing to `none` — correct final state, zero
animation.

## 7. Automated test results

Full existing verification suite re-run after all `platform.css` changes
(a shared file, so this also serves as the cross-workspace regression
check), **605/605 passed, 0 failed**. One transient flake
(`executive-snapshot-verification-check` reported 66/67 on a single run)
reproduced as 67/67 on two immediate re-runs with zero code changes
between attempts — a timing flake under repeated headless-browser load in
this session, not a real regression; noted rather than hidden.

## 8. Real-browser visual verification

Performed in the actual running app (`index.html` served locally, real
`app.js` boot, real CSS cascade — not the Executive-only synthetic
harness used elsewhere in this program):

- Light → Dark and Dark → Light: both directions clicked on the real
  toggle button; both confirmed frame-perfect in sync between logo/header/
  rail via live sampling (§2).
- Light → Dark and Dark → Light on mobile (375/390/402/430): screenshotted
  before/mid-transition/after for each; mid-transition frames show a
  coherent, uniformly-progressing dark state, no white flash, no
  mismatched components.
- Mobile at all 4 required widths: header composition, button sizes, date
  navigation, quick search placement, spacing/alignment all reviewed
  directly (not just asserted).
- Desktop (1440px) and tablet (1194px): screenshotted in both themes,
  confirmed the primary toolbar row and rail are visually unchanged from
  before this pass — the search-row grid fix is provably inert above
  600px, and this was visually confirmed, not just assumed.
- Rail logo close-up crops captured in both themes for direct comparison.

## 9. Files changed

- `platform.css` only (97 insertions, 4 deletions):
  - `.domshell-rail-logo` dark-mode background rule.
  - `.theme-anim .domshell-rail` / `.domshell-rail-logo` added to the
    existing Part D 280ms curated list.
  - Reduced-motion / `data-anim="off"` guards for both the universal
    `.theme-anim` rule and the Part D list.
  - `.v2-topbar`'s two grid-template-areas (≤600px, ≤380px) extended with
    a `search` row; one new rule placing `.domshell-palette-trigger` in it.
- No changes to any JS file, to `js/workspace/workspace-styles.js`, to the
  Executive widget, or to the 7G.1 glow/theme-fade work (untouched, per
  the brief).

## 10. Unrelated issues / known limitations

- This pass's real-browser testing was unauthenticated throughout (see the
  testing-method note at the top). Header/rail/logo/theme-toggle chrome is
  auth-independent and was fully, directly verified. What could **not** be
  directly verified in a single combined authenticated session: the
  Executive Command Center's own Command Panel (from 7G/7G.1) transitioning
  together with this round's header fixes on the exact same live page —
  each was verified thoroughly on its own (Command Panel in 7G.1's
  harness-based tests, header in this round's real unauthenticated page).
  No reason to expect interaction between them (they share only the
  site-wide `.theme-anim` mechanism, already verified independently on
  both), but a live authenticated pass is the one thing this report can't
  claim to have covered first-hand.
- The "?" avatar button showing as a plain red circle with "?" during
  testing is expected, pre-login placeholder behavior (no real user
  initials to show when unauthenticated) — not a defect, not touched.
- Noted but not fixed (pre-existing, unrelated to this pass's three listed
  issues): `platform.css` has accumulated roughly a dozen separate
  `.v2-topbar`-related rule blocks across several historical "VSM"/"Phase
  11" passes at different line numbers. The ones actually governing
  current behavior are well-commented and internally consistent (confirmed
  by tracing them), but the sheer number of historical, now-superseded
  blocks sitting alongside them makes the file harder to navigate than it
  needs to be. A future consolidation pass could reduce this, but that is
  a refactor, not a "final polish" fix, and was out of scope here.

## 11. Git status

Nothing committed, pushed, or deployed. All Phase 7 (7A–7G.2) work remains
uncommitted working-tree changes. Awaiting explicit user review before any
commit.
