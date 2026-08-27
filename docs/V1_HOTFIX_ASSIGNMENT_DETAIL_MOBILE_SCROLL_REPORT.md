# V1 HOTFIX — Assignment Detail Mobile Vertical Scroll / Content Clipping

**Status:** Audit → root cause → implementation → hostile review → regression →
report complete. **NOT committed, NOT pushed, NOT deployed.**

**Scope:** the mobile vertical clipping of the **Detail Jadwal / Assignment
Detail** drawer — the *whole* drawer, not just Form Reimbursement.

**Not touched:** `database.rules.json`, Cloud Functions, permission engine,
navigation architecture, V2 / Sarpras Intelligence, `APP_VERSION`,
`version.json`, `service-worker.js`, the canonical drawer's **JS**
(`js/components/drawer.js`), `js/modal.js` (Assignment Detail's own JS),
unrelated modules. This is a **CSS-only** hotfix (3 rules across 2 files).

**Final verdict:** **PASS WITH DOCUMENTED LIMITATION** (see §6).

---

## 1. Root Cause

The clipping is **three compounding CSS problems**, all in the *presentation*
layer — no `overflow-y:auto` was "added at random". Each was reproduced with
real-browser measurement (real `style.css` + `platform.css`, real
`js/modal.js` `openDetailModal()`, a deliberately tall assignment fixture),
not inferred from a `grep`.

### Cause A — the accordion's hardcoded `max-height: 700px` cap

`style.css`:

```css
.accord-body            { max-height: 0;    overflow: hidden; transition: max-height .25s ease-out; }
.accord-section--open > .accord-body { max-height: 700px; }
```

`max-height` is used to animate open/close (you cannot transition
`height:auto`). The `700px` value is a guess at "tall enough for most
sections". Any section whose content exceeds 700px has its **bottom silently
clipped** by `overflow: hidden`, with **no scrollbar** to recover it.

**Measured (fixture: long Tujuan/Keperluan/Catatan, full lifecycle audit +
cancellation reason, ~20-line WhatsApp preview):**

| Section | Content height | Rendered (`.accord-body` clientHeight) | Clipped |
|---|---|---|---|
| Ringkasan Jadwal @ 320px | ~745px | 700px | **45px** |
| Ringkasan WhatsApp @ 320px | ~839px | 700px | **139px** |
| Ringkasan WhatsApp @ 360px | ~737px | 700px | **37px** |
| Ringkasan WhatsApp @ 375px | ~717px | 700px | **17px** |

`.accord-*` classes are used **only** by `js/modal.js` (grep-confirmed) — this
is entirely local to Assignment Detail.

### Cause B — flex-shrink squeezing every section inside `.drawer__body` (dominant)

`platform.css`:

```css
.drawer__body { flex: 1 1 auto; overflow-y: auto; display: flex; flex-direction: column; gap: 20px; }
```

`.drawer__body` is a **column flex container** (only for `gap`). Its direct
children in Assignment Detail are `.accord-section` blocks. `.accord-section`
carries `overflow: hidden` (for its border-radius). Per the CSS Flexbox spec
(§4.5 / CSS Sizing §5.1), **a flex item whose main-axis `overflow` is not
`visible` has an automatic minimum size of 0** — so `.accord-section` is
fully shrinkable.

When the drawer body has a definite height (it does — `.drawer` is
`height: 86dvh` on mobile / `100%` on desktop) and the sections' combined
natural height exceeds it, the flex algorithm distributes the negative free
space by **shrinking every `.accord-section`** (`flex-shrink: 1` default) —
and each shrunken section then **clips its own content via its
`overflow: hidden`**. Because the sections shrink to fit, the body **never
overflows**, so `overflow-y: auto` produces **no scrollbar**. The user sees
many half-cut sections and *nothing to scroll*.

**Measured (fixture, all sections open, 390 × 844):**

| `.drawer__body` child | `flex-shrink` | rendered height | natural (`scrollHeight`) | clipped |
|---|---|---|---|---|
| Ringkasan Jadwal | 1 | 67px | 498px | **431px** |
| Informasi Operasional | 1 | 48px | 353px | **305px** |
| Detail Tambahan | 1 | 61px | 455px | **394px** |
| Odometer | 1 | 20px | 139px | **119px** |
| Ringkasan WhatsApp | 1 | 85px | 638px | **553px** |
| Form Reimbursement | 1 | 23px | 162px | **139px** |
| `.drawer__body` scrollHeight vs clientHeight | — | **634 == 634 (no scroll)** | | |

The two rows with `overflow: visible` — `.detail-actions-primary` and
`.detail-actions` (Hapus/Edit/Tutup) — kept their natural height (their
automatic minimum size is their content), which is why the *footer buttons*
were the one thing still reachable while every section above them was cut.

### Cause C — mobile bottom-sheet height measured against the large viewport

`platform.css`, `@media (max-width: 640px)`:

```css
.drawer-overlay { position: fixed; inset: 0; align-items: flex-end; }
.drawer        { height: min(86vh, 100%); }
```

`vh` is always the **large** viewport (URL bar collapsed). With the mobile
URL/nav bar showing, `86vh` ≈ or > the *visible* height, and the sheet is
anchored (`flex-end`) to the large-viewport bottom, which sits **behind the
browser chrome** — so the bottom of the (already scroll-broken) body renders
off the visible screen. This was fixed in the preceding V1 post-QA pass
(Issue D) and is **kept**; it is necessary but was **not sufficient** on its
own — Causes A and B still clip even when the sheet is fully on-screen.

### Why the earlier pass reported Issue D "no-regression, PASS"

The earlier consolidated harness injected 50 plain `<p>` rows into the drawer
body. Plain `<p>` has `overflow: visible` → automatic minimum size = content
→ it **cannot** be shrunk → the body overflowed and scrolled correctly. It
never exercised an `overflow:hidden` child, so Cause B stayed invisible. The
new harness drives the **real** `openDetailModal()` with real
`.accord-section` markup and asserts at the **section** level, not just the
`.accord-body` level — which is how B was caught.

---

## 2. Files Changed

| File | Rules | What |
|---|---|---|
| `style.css` | `.accord-body`, `.accord-section--open > .accord-body`, `.accord-body-inner` | **Cause A** — replace the `max-height: 0 → 700px` transition with `grid-template-rows: minmax(0, 0fr) → minmax(0, 1fr)`. Animates to the section's **true natural height**; no cap, no clip; same collapsed state, same ~0.25s ease-out slide. `min-height: 0` on `.accord-body-inner`. |
| `platform.css` | `.drawer__body > *` (new one-liner) | **Cause B** — `flex-shrink: 0` on the canonical drawer body's direct children, so a tall `overflow:hidden` child can no longer be squeezed-and-clipped; the body overflows and its own `overflow-y: auto` is the single vertical scroll owner. |
| `platform.css` | `.drawer-overlay`, `.drawer` (`@media ≤640px`) | **Cause C** — kept from the preceding pass: `dvh` (with `vh` fallback) instead of `vh` so the sheet tracks the *visible* viewport. |

**Net for this hotfix: 2 files, 3 CSS rules, ~10 functional lines** (the rest
is explanatory comments). No new files (other than the verification harness).
No HTML change. No JS change. No `APP_VERSION` bump.

The `js/app.js` and `js/petty-cash/petty-cash-center.js` diffs in the working
tree are the **preceding** V1 post-QA pass (Issues C & E) — untouched here.

### Exact diffs

**`style.css`**

```css
.accord-body {
  display: grid;
  grid-template-rows: minmax(0, 0fr);   /* was: max-height: 0 */
  overflow: hidden;
  transition: grid-template-rows 0.25s ease-out;   /* was: max-height 0.25s ease-out */
}
.accord-section--open > .accord-body {
  grid-template-rows: minmax(0, 1fr);   /* was: max-height: 700px */
}
.accord-body-inner {
  min-height: 0;   /* new — lets the single grid row collapse fully to 0 */
  padding: 4px 14px 14px;
}
```

Why `minmax(0, 0fr)` and not bare `0fr`: bare `0fr` is `minmax(auto, 0fr)`,
whose `auto` floor is the child's `min-content` — which includes
`.accord-body-inner`'s ~18px vertical padding, so a "collapsed" section stayed
visibly ~20px tall. `minmax(0, …)` gives an explicit 0 floor. (Verified: 20px
→ 0px.)

**`platform.css`**

```css
.drawer__body { flex: 1 1 auto; overflow-y: auto; -webkit-overflow-scrolling: touch; padding: 18px 20px; display: flex; flex-direction: column; gap: 20px; }
.drawer__body > * { flex-shrink: 0; }   /* NEW */
```

---

## 3. Fix — behaviour after

- `.accord-body` is a **grid**, not a scroll container (`overflow: hidden`,
  no `auto`/`scroll`, no scrollbar). Open state = `minmax(0, 1fr)` = the
  content's real height. Collapsed = `minmax(0, 0fr)` = 0. The open/close
  slide still plays (measured: mid-transition height is strictly between 0 and
  final; `transition-property` includes `grid-template-rows`; duration 0.25s).
- `.drawer__body`'s children keep their natural block height → total content
  (measured 2,586px for the fixture, all open) overflows the 634px body →
  `overflow-y: auto` yields **one** vertical scrollbar on the body.
- Scrolling the body reaches every section top-to-bottom, then the
  `Hapus / Edit / Tutup` row (last child, `overflow: visible`, `flex-shrink: 0`)
  fully visible with `padding-bottom` (18px + `env(safe-area-inset-bottom)`
  via `.drawer:not(:has(.drawer__foot))`) below it.
- Header (`.drawer__head`, `flex: 0 0 auto`) stays pinned and visible.
- No section has its own scrollbar. No `<pre>` (WhatsApp) scrollbar. One
  scroll owner: `.drawer__body`.

---

## 4. Verification

**Method:** real headless Chromium (Puppeteer) against
`scratch/modal-drawer-harness.html`, which imports the **real** `js/modal.js`
and mounts the **real** canonical drawer with a real `localStorage` admin
session. Fixture = one deliberately tall assignment (long free-text fields,
full lifecycle audit + cancellation reason, odometer, ~20-line WhatsApp
preview). New harness: `scratch/verify-assignment-detail-mobile.mjs`.

### 4.1 Mobile widths (× 5 accordion states each)

Widths: **320 / 360 / 375 / 390 / 393 / 410 / 430 / 475**.
Accordion states:
**A** all collapsed · **B** WhatsApp open · **C** Reimbursement open ·
**D** WhatsApp + Reimbursement · **E** all sections open.

Per width × state, all asserted **PASS**:

| Assertion | Result |
|---|---|
| No `.drawer__body` child is shrunk below its content (`scrollHeight ≤ renderedHeight`) | ✅ all 40 combos |
| When content is genuinely taller than the body, the body **is** scrolling (`scrollHeight > clientHeight`) | ✅ |
| No open section clips its content — checked at **both** the `.accord-body` (max-height) and the `.accord-section` (flex-shrink) level | ✅ (was: Summary +45px, WA +139/+37/+17px, plus §1-B section-level 100–550px clips) |
| No nested scrollbar inside any section | ✅ |
| Drawer bottom within the viewport | ✅ |
| Header stays visible | ✅ |
| `Hapus` / `Edit` / `Tutup` all fully visible after scroll-to-bottom | ✅ |
| No horizontal overflow (document **and** drawer) | ✅ |

### 4.2 Accordion behaviour

| Assertion | Result |
|---|---|
| Collapsed `.accord-body` height ≈ 0 (was ~20px with bare `0fr`) | ✅ `< 2px` |
| Opens to a real natural height (`> 40px`, section-dependent) | ✅ |
| `aria-expanded` toggles `"true"` / `"false"` | ✅ |
| Re-collapses to ≈ 0 | ✅ |
| Toggle is stable — open → close → open returns to the same height (±3px) | ✅ |
| Drawer body still scrolls after opening a section | ✅ |
| Open/close animation **plays** (mid-transition height strictly between 0 and final) | ✅ |
| `transition-property` includes `grid-template-rows`; normal-motion duration `0.25s` | ✅ |
| Multiple sections open simultaneously (state E) — body scrollable, nothing clipped, actions reachable | ✅ |

### 4.3 Reduced motion / `[data-anim="off"]`

| Assertion | Result |
|---|---|
| `prefers-reduced-motion: reduce` → `.accord-body` transition-duration ≈ 0 (`1e-05s`) — section snaps, content instantly readable | ✅ |
| `mobile-first-verification-check.mjs` `prefers-reduced-motion` boot | ✅ 0 errors |
| `verify-reduced-motion-gap-closure.mjs` | ✅ 15/15 |

(`[data-anim="off"]` is the same global `transition-duration: 0.01ms !important`
rule in `style.css` — identical effect.)

### 4.4 Desktop widths (no regression)

Widths: **1280 / 1440 / 1920** (state E, all sections open).

| Assertion | Result |
|---|---|
| Drawer right-docked & full viewport height (`top ≈ 0`, `height ≈ 100vh`) | ✅ |
| No `.drawer__body` child shrunk below content | ✅ |
| No open section clips its content | ✅ |
| Body scrolls, all actions reachable | ✅ |
| No nested scrollbar | ✅ |

### 4.5 Consolidated harness tally

`scratch/verify-assignment-detail-mobile.mjs` — **347 checks, 0 failures**
(8 mobile widths × 5 states × 8 assertions + accordion behaviour + animation
+ reduced-motion + 3 desktop widths × 5 assertions).

### 4.6 Regression suites (all re-run this pass)

| Suite | Result |
|---|---|
| `scratch/verify-modal-drawer.js` (full Assignment Detail migration — 11 scenarios, content/button matrix, focus trap, Escape, focus restore, source-highlight, mobile bottom-sheet, legacy-DOM-gone) | **PASS** (0 failures, 0 page errors) |
| `scripts/drawer-consolidation-check.mjs` (canonical drawer — desktop + mobile bottom-sheet @ 375/390/402/430, focus/trap/Escape/restore, listener leak) | **67/67** |
| `scratch/hostile-review-drawer-listener-audit.mjs` (10 open/close cycles → 0 net keydown listeners) | **8/8** |
| `scripts/mobile-first-verification-check.mjs` | **42/42** |
| `scratch/verify-motion-8-1-viewport-matrix.mjs` (8 widths × 2 themes × 3 motion modes) | **72/72** |
| `scratch/hotfix-mobile-ux-verify.mjs` (preceding pass's 6 issues) | **43/43** |
| `scripts/delete-confirm-drawer-check.mjs` | **16/16** |
| `scripts/admin-pin-reset-dom-check.mjs` | **39/39** |
| `scripts/role-management-edit-dom-check.mjs` | **25/25** (one run under parallel-CPU load reported 22/3; a clean isolated re-run is 25/25 — flake, not a regression) |
| `scripts/permissions-matrix-dom-check.mjs` | **30/30** |
| `scripts/driver-wellness-dom-check.mjs` | **48/48** |
| `scripts/engineering-ui-dom-check.mjs` | **51/51** |
| `scripts/gudang-ui-check.mjs` | **178/178** |
| `scripts/problem-first-home-dom-check.mjs` | **32/32** |
| `scripts/pettycash-intelligence-check.mjs` | **29/29** |
| `scripts/self-drive-assignment-check.mjs` | **42/42** |
| `scripts/overtime-report-model-check.mjs` | **36/36** |
| `scripts/measure-reimbursement.mjs` | ran clean; PDF layout stable (~61,980 bytes) |
| `scripts/smoke-boot.mjs` | **PASS**, 0 fatal (1 expected pre-auth `Permission denied`) |

**Tally:** 18 existing suites + 1 full migration suite + 1 new harness =
**~1,400 individual checks, 0 failures, 0 regressions.** No assertion was
weakened — the new harness's assertions are **stronger** than the earlier
pass's (section-level clip + "no child shrunk" + "body must scroll when
content is tall"), which is what surfaced Cause B.

### 4.7 Scroll behaviour / footer reachability / safe-area — summary

- **One** vertical scroll container: `.drawer__body`. Verified `scrollHeight
  2586 > clientHeight 634` with the fixture; zero descendant scroll
  containers.
- Footer (`Hapus / Edit / Tutup`) is the last body child, `flex-shrink: 0`,
  fully visible after scroll-to-bottom at every tested width incl. 320px.
- Safe-area: `.drawer:not(:has(.drawer__foot))` still applies
  `padding-bottom: env(safe-area-inset-bottom)` (Assignment Detail has **no**
  `.drawer__foot`); the last button clears the home indicator. No second
  safe-area system introduced.

---

## 5. Hostile Review

| Vector | Finding |
|---|---|
| **A. Scroll ownership** | Exactly one owner: `.drawer__body` (`overflow-y: auto`). `.accord-body` is a grid with `overflow: hidden` — not a scroll container. `.wa-preview-text` (`<pre>`, `white-space: pre-wrap`) has no `max-height`/`overflow` — natural height, no scrollbar. Harness confirms **0** nested scroll containers across all 40 mobile combos + desktop. |
| **B. Height constraints** | Removed: `.accord-section--open > .accord-body { max-height: 700px }`. Remaining in the chain: `.drawer { height: 86dvh / 100% }` (the sheet size — intended, and now the flex children overflow it correctly), `.accord-header { min-height: 44px }` (touch target — unrelated to body height), `grid-template-rows: minmax(0, Nfr)` (the new animation — `0` floor collapsed, natural when open). No hidden `height` / `max-height` / `min-height` on `#detailSummary` / `#detailOps` / `#detailExtra` / `#waPreviewText` / `.detail-value` (grep + computed-style checked). |
| **C. Overflow clipping** | `.accord-section { overflow: hidden }` — kept (border-radius); with `flex-shrink: 0` the section is now always ≥ its content, so it clips **nothing** (verified: rendered height ≈ scrollHeight, ±2px sub-pixel). `.accord-body { overflow: hidden }` — kept; required to clip the inner while the grid row is collapsed / mid-transition; when open the row equals the content so nothing is clipped. No `overflow: hidden` removed "blindly". |
| **D. Flex-shrink issue** | This **was** the dominant bug (§1-B). Fix: `.drawer__body > * { flex-shrink: 0 }`. `min-height: 0` is **not** the fix here — that would make things *more* shrinkable; the fix is the opposite (children must keep natural size so the body scrolls). Checked every other canonical-drawer consumer's body children (`.drawer-sec`, `.drawer-metrics`, `.drawer-tl`, petty-cash inline divs, admin persistent nodes) — all have `overflow: visible` → their automatic minimum size is already their content, so `flex-shrink: 0` is a no-op for them (confirmed by 8 consumer DOM suites, all green). The change can only fix, never regress. |
| **E. Sticky footer overlap** | Assignment Detail has **no** `.drawer__foot` — the action row is the last scroll child, not a sticky element, so there is nothing to overlap the last content. Verified the buttons are fully visible (not merely present) after scroll-to-bottom at 320–475px. Consumers that *do* use `.drawer__foot` (`flex: 0 0 auto`, its own safe-area `padding-bottom`) are unaffected — `.drawer__foot` is a child of `.drawer`, not `.drawer__body`, so `.drawer__body > *` doesn't select it. |
| **F. Safe-area issue** | `.drawer:not(:has(.drawer__foot))` bottom inset still applies (Assignment Detail path). `.drawer__body` keeps its own `padding: 18px 20px`. No double-count (the `:not(:has(.drawer__foot))` guard is exactly for the no-footer case). No new safe-area mechanism. The `dvh` overlay height (Cause C) makes the whole sheet sit within the visible viewport so the inset lands where it should. |
| **G. `grid-template-rows` animation support** | Interpolating `fr` in `grid-template-rows` is Chrome 107+ / Firefox 107+ / Safari 16+ (all 2022–2023). Verified the slide plays in headless Chromium (mid-transition height between 0 and final). On any engine that *doesn't* interpolate it, the section **snaps** open/closed — no clip, correct end states — strictly better than the old cap. |
| **H. Initial render** | `#accordSummary` ships with `.accord-section--open` in the HTML string → `grid-template-rows: minmax(0, 1fr)` from first paint → natural height immediately, no transition on load (initial state). Identical to the old `max-height: 700px`-from-the-start behaviour, minus the cap. |
| **I. Selector specificity / cascade** | `.drawer__body > *` = (0,1,1). No consumer rule sets `flex`/`flex-shrink` on a *direct* body child at ≥ that specificity (`.detail-actions button { flex: 1 }` targets grandchildren; `.drawer__error`/`.drawer__foot` are `.drawer` children, not `.drawer__body` children). No conflict found. |
| **J. Horizontal axis** | `flex-direction: column` → `flex-shrink` acts on the vertical (main) axis only; children still fill the body width as before. Verified 0 horizontal overflow (doc + drawer) across all widths + viewport matrix 72/72. |

**Issues found by the hostile review that are NOT fixed here:** none that block.
The one documented limitation is real-device confirmation of the `dvh` part
(§6).

---

## 6. Final Verdict

### PASS WITH DOCUMENTED LIMITATION

**PASS** — the reported problem is fixed and **real-browser verified**:

- Causes A and B (the actual clipping) **reproduce** in headless Chromium
  against the real drawer and real `js/modal.js`, and are **measured fixed**:
  every section renders at its true natural height, `.drawer__body` is the
  single vertical scroll container, and a user can scroll top-to-bottom
  through every section and still reach `Hapus / Edit / Tutup`, at
  320/360/375/390/393/410/430/475px, in all five accordion states, and on
  desktop 1280/1440/1920px.
- 347 harness checks + ~1,400 regression checks, 0 failures, 0 regressions.
- Open/close animation, `aria-expanded`, typography, spacing, keyboard
  behaviour, reduced motion, `[data-anim="off"]` — all preserved (verified).

**DOCUMENTED LIMITATION** — Cause C (`vh` → `dvh` on the mobile bottom-sheet,
carried over from the preceding pass) can only be **fully** confirmed on a
real device with dynamic browser chrome: headless Chromium has no URL bar, so
`dvh == vh` there and the off-screen-anchor scenario cannot be reproduced.
The change is the standard remedy, matches this file's own established
`100vh; 100dvh` idiom, and is no-regression-verified headless (drawer still
bottom-anchored, full-height on desktop, body scrolls, footer reachable).
Recommend a real iOS Safari + Android Chrome pass (URL bar visible) as part of
the separate review → deploy step. Causes A and B do **not** depend on a
device and are fully verified.

---

## 7. Git / Deployment

Nothing committed, pushed, or deployed. Working tree, ready for review:

- `style.css` — Cause A (accordion grid animation).
- `platform.css` — Cause B (`.drawer__body > *` flex-shrink) + Cause C (`dvh`,
  carried from the preceding pass) + the preceding pass's Issue B/F rules.
- `js/app.js`, `js/petty-cash/petty-cash-center.js` — the preceding V1 post-QA
  pass (Issues C & E); untouched here.
- `scratch/verify-assignment-detail-mobile.mjs` — new verification harness
  (reusable).
- `docs/` — this report + the preceding pass's report.

`APP_VERSION` / `version.json` deliberately not bumped — the reviewer stamps
the version at commit time.

*End of report.*
