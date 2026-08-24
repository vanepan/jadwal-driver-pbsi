# Executive Command Center — Phase 7G.1 Refinement Report

**Scope:** Four targeted visual fixes to the already-implemented Phase 7G
Command Panel — ambient glow (dirty/muddy, weak in dark mode, worse on
mobile) and a choppy light↔dark theme transition. No new sections, no IA
change, no Hero redesign, no Command Panel replacement.

**Status:** Complete, fully verified, **NOT committed, NOT pushed, NOT
deployed**.

---

## 1. What caused the dirty/muddy glow appearance

Measured directly in a real browser (`getBoundingClientRect()` /
`getComputedStyle`) rather than assumed from CSS reading. The old
`.wsp-hero::before` was a **fixed 620×620px circle pinned to the Hero
panel's own top-right corner** (`top:-140px; right:-100px`), completely
independent of where the gauge actually sat in the layout. Three concrete
defects fell out of that:

1. **Only `width` was capped** (`max-width: 90%`) — `height` was not. At
   375px the glow rendered as a **306×620px ellipse** (measured), an
   elongated vertical smear starting above the headline and running most
   of the way down the Hero.
2. **On tablet, the gauge moved to the Hero's left edge** (per the 768px
   layout), but the glow stayed pinned to the top-right corner. Measured
   centers: gauge at `(113, 442)`, glow at `(866, 286)` — **~750px apart**.
   The glow was floating over empty space, not lighting the gauge at all.
3. Even where the glow DID roughly overlap the gauge (desktop), it was
   ~5× the gauge's own diameter, spread thin at a flat 22–30% alpha with a
   68%-radius falloff — reading as a soft, directionless haze rather than
   light anchored to an object.

## 2. How the glow was refined

Moved the pseudo-element from `.wsp-hero::before` to
`.wsp-hero__gwrap::before` — the element that tightly wraps the gauge SVG
(confirmed via measurement: `gwrap`'s box is pixel-identical to the SVG's
box at every breakpoint). Sized with **percentages** (`width: 230%; height:
230%`) instead of fixed pixels: percentage width/height on an absolutely
positioned descendant resolve against its own positioned ancestor's box,
so the glow now automatically scales with and stays centered on the gauge
at every current AND future breakpoint, with no per-breakpoint position
math required. `.wsp-hero` keeps `overflow: hidden` as a safety clamp.

Falloff tightened from `0%→68%` to `0%→60%` (softer edge, more contained).
Light-mode alpha trimmed (30/28/26/28/22% → 22/20/18/20/16% for
good/warn/danger/info/neutral) — now justified since the glow is
correctly contained instead of needing to "reach" across a huge field.

## 3. Desktop glow behavior

Precisely centered on the 128px gauge, ~294px effective diameter, softly
contained within the Hero's own right-side content, fades out well before
reaching the headline column. Confirmed via screenshot review at 1440px,
both themes.

## 4. Mobile glow behavior

Since percentage sizing already tracks the gauge automatically, mobile
inherited a correctly-centered, correctly-shaped (circular, not
elliptical) glow "for free." Added one mobile-only override (`@media
(max-width: 767px)`) shrinking it further to `175%`/`.78` opacity — the
gauge itself stays full-size (156px) on mobile, but the Hero card is only
~340–400px wide, so the same proportion would otherwise read larger
relative to the card than it does on a 1400px desktop Hero. Verified via
full-page screenshots at 375/390/402/430px and element-scoped crops of
just the Hero panel: the headline now sits on a clean background; the
glow is visible only directly behind the gauge, never washing upward into
the text.

## 5. Dark-mode glow behavior

A flat opacity increase was rejected (would either stay imperceptible
against the near-black Command Panel surface, or collapse into a "bright
blob" further up). Instead each tone is **first lightened toward white**
(`color-mix(in srgb, var(--wsp-good) 65%, white)` — still clearly the same
hue, just higher luminance so it reads as light rather than a dim tinted
patch), **then** given a moderate alpha (30–34%, tuned per tone). The
gauge's own stroke stays the strongest, most saturated color signal in the
panel; the glow only supports it. Confirmed visible, localized, and
subordinate to the gauge via desktop/tablet/mobile dark screenshots.

## 6. Theme transition implementation

**Investigated the existing mechanism before adding a new one.** The app
already arms a site-wide crossfade on every real toggle
(`applyTheme(theme, true)` adds a `theme-anim` class to `<html>` for
~650ms; a `platform.css` rule transitions `background-color`,
`border-color`, `color`, `box-shadow` on every element with `!important`
while that class is present). This mechanism is real and fires correctly
on every production toggle path (topbar button, rail button, profile
toggle) — confirmed by reading `applyTheme()`'s three call sites.

**The actual gap**: several Command Panel surfaces set their color via
`background: linear-gradient(...)` (`.wsp-hero`, `.wsp-attn--panel`,
`.wsp-inbox--tinted`, and the reworked glow itself) — a gradient sets
`background-image`, not `background-color`. CSS cannot transition
`background-image` at all in the general case, so **all four of these
surfaces were snapping instantly** regardless of the site-wide mechanism,
while flat-color siblings (text, borders) glided — exactly the reported
"choppy... component-by-component snapping."

**Fix**: for each of the four gradients, the color *stops* were extracted
into their own custom properties (e.g. `--wsp-hero-bg1`/`--wsp-hero-bg2`,
`--wsp-mood-glow`) and each was registered via `@property ... { syntax:
'<color>'; ... }`. Registering a custom property as `<color>` is what
makes it interpolable — an unregistered custom property is a discrete,
non-animatable token. With that in place, `transition: --wsp-hero-bg1
340ms, --wsp-hero-bg2 340ms, ...` genuinely cross-fades the gradient.
Verified with a live frame-by-frame sample of a real light→dark toggle
(`getComputedStyle(...).backgroundImage` sampled via `requestAnimationFrame`
across the transition): the Hero's background progressed through ~12
intermediate values over ~340ms before settling, in lockstep with the
glow and with the Attention/Decision panels sampled the same way — no
snap, no flash.

A second, smaller, Executive-scoped rule (`THEME_FADE_TARGETS`, gated by
`.wsp-root:has(.wsp-dashboard-grid)` for the two shared header classes it
touches, since `.wsp-dashboard-grid` is emitted only by the executive
workspace's `renderZonedGrid()`) adds plain `background-color`/
`border-color`/`box-shadow`/`color` transitions to the remaining flat-color
surfaces (status pills, domain meter tracks/fills, Pulse rail, headline/
insight text, Situation zone panels). This one is a deliberate,
permanent complement to the site-wide mechanism, not a replacement —
kept because it (a) still applies if `data-theme` is ever set outside the
`theme-anim` window, and (b) is the only one of the two that respects
`prefers-reduced-motion`/`data-anim="off"` for these specific elements
(the site-wide `platform.css` mechanism has no such guard at all — a
pre-existing, unrelated gap, noted in §10 below, not fixed here).

No `!important`, no universal `*` selector, no new JS animation loop —
pure CSS `@property` + `transition`, exactly per the brief's "prefer CSS
transitions" instruction.

## 7. Reduced-motion behavior

Every new transition (the three gradient-stop pairs, the glow, and the
`THEME_FADE_TARGETS` list) is wrapped in matching `@media
(prefers-reduced-motion: reduce)` and `[data-anim="off"]` guards that set
`transition: none`, following the file's existing established pattern.
Verified: `executive-motion-polish-check.mjs` (16/16) re-passed against
the Hero's new structure, and a direct computed-style check under
`page.emulateMediaFeatures([{name:'prefers-reduced-motion', value:'reduce'}])`
confirmed `.wsp-hero`'s `transitionProperty` resolves to `none` with
reduced motion active.

## 8. Responsive verification

Full 12-shot matrix regenerated after the final fix (375/390/402/430/
tablet-1194/desktop-1440 × light/dark), each asserting
`document.documentElement.scrollWidth <= clientWidth` programmatically —
**zero horizontal overflow at any breakpoint, either theme**. Visually
reviewed: desktop light/dark, tablet dark (previously the worst-offending
case — glow ~750px from the gauge, now precisely wrapping it), and
element-scoped Hero crops at 375px light/dark and 430px dark (previously
the elongated-ellipse case, now a clean, contained halo with the headline
on a plain background).

## 9. Existing test results

Full existing verification suite re-run after all changes,
**605/605 passed, 0 failed** — identical count to the pre-refinement
baseline, confirming zero regressions:

| Script | Result |
|---|---|
| `workspace-foundation-check.mjs` | 24 passed |
| `executive-hero-verification-check.mjs` | 108 passed |
| `executive-attention-verification-check.mjs` | 84 passed |
| `executive-decision-verification-check.mjs` | 90 passed |
| `executive-snapshot-verification-check.mjs` | 67 passed |
| `executive-launcher-verification-check.mjs` | 41 passed |
| `executive-outlook-verification-check.mjs` | 42 passed |
| `executive-motion-polish-check.mjs` | 16 passed |
| `executive-story-verification-check.mjs` | 50 passed |
| `executive-ui-kit-check.mjs` | 46 passed |
| `executive-dashboard-dom-check.mjs` | 37 passed |

No assertion was weakened. Additionally ran two ad hoc, non-permanent
Puppeteer checks this pass (both discarded after use): a computed-style
audit confirming `:has(.wsp-dashboard-grid)` matches correctly and every
`THEME_FADE_TARGETS` selector carries the expected `transition` value, and
the frame-by-frame live-toggle sample described in §6.

## 10. Unrelated issues observed (not fixed, per this pass's scope)

- **`platform.css`'s site-wide `.theme-anim` crossfade has no
  `prefers-reduced-motion` guard at all.** It's an always-armed,
  `!important`, universal-selector transition whenever the class is
  present, app-wide, not just on Executive. This is a real accessibility
  gap but is shared infrastructure well outside "Executive Command
  Center" scope for this pass — recording it here rather than touching
  `platform.css`, per the explicit instruction not to expand scope into
  unrelated modules.
- **A pre-existing sizing regression, unrelated to this pass**: the
  Phase 7G report claimed the desktop gauge renders at 156px, but
  measurement this round showed it is actually 128px on both tablet AND
  desktop — the `@media (min-width: 1280px)` block never re-overrides
  `.wsp-hero__gwrap svg`, so the `768px` tier's 128px override cascades
  through unchanged. This did not need fixing for the glow/transition
  work (the glow auto-follows whatever size the gauge actually is,
  percentage-based), so it was left untouched rather than risking a
  gauge/layout change outside this pass's four listed issues.
- No new console/page errors at any point in this pass (`page.on('console'
  /'pageerror')` listeners empty across every verification run and every
  ad hoc check).

## 11. Files changed

- `js/workspace/workspace-styles.js` only. Specifically:
  - `THEME_FADE_TARGETS` (new top-of-file JS constant) + its generated
    CSS rule + reduced-motion/`data-anim="off"` guards.
  - `.wsp-hero__gwrap` — added `z-index: 0` (stacking-context fix for the
    relocated glow).
  - `.wsp-hero::before` removed; replaced by `.wsp-hero__gwrap::before`
    (glow) + 5 light-tone rules + 5 dark-tone rules + 1 mobile override.
  - `@property --wsp-mood-glow`, `--wsp-hero-bg1/2`, `--wsp-attn-bg1/2`,
    `--wsp-inbox-bg1/2` (6 new registrations).
  - `.wsp-hero`, `.wsp-attn--panel`, `.wsp-inbox--tinted` — background
    rewritten to reference their new bg1/bg2 custom properties (visually
    identical); each given one dedicated `transition` rule.
- No changes to `js/widgets/executive/index.js`, any other JS file, or
  any other CSS file (including `platform.css`).

## 12. Git status

Nothing committed, pushed, or deployed. All Phase 7 (7A–7G.1) work remains
uncommitted working-tree changes. `docs/EXECUTIVE_COMMAND_CENTER_7G_COMMAND_PANEL_IMPLEMENTATION_REPORT.md`
(the prior round's report) and this file are both new, untracked docs.
Awaiting explicit user review before any commit.
