# Phase 11I–11K — Mobile UX Stabilization
### Full Report

Status: implemented, **not committed, not pushed**. Follow-up to `PHASE11_UX_STABILIZATION_REPORT.md` (11A–11H).

Files touched: `platform.css`, `style.css`, `engineering.css`, `js/workspace/workspace-styles.js`, `js/app.js`, `js/notifications.js`, `js/admin.js`, `js/components/request-mode-selector.js`. New file: `js/ui/sheet-gesture.js`.

---

## 1. Root Cause

| Symptom | Root cause |
|---|---|
| "Lainnya" sheet unreadable in dark mode | `.bottom-sheet` used `background: var(--white)` — `--white` was deliberately excluded from the Phase 11A dark-token bridge (it's dual-use elsewhere), and this exact bug had already been fixed for `.modal-box` but the fix was never applied to `.bottom-sheet`. |
| "Hari Ini" chip overlaps adjacent controls at narrow widths | A higher-specificity, later-in-file rule (`body.v2-shell-active .v2-topbar`, `@media max-width:767px`, "keep everything on one row") silently overrode the app's own pre-existing, correctly-designed two-row mobile fallback (`@media max-width:600px`) — squeezing `#btnToday` + 2×`.btn-icon` (44px min-width each) + `#filterDate` (96px min-width) onto one row with the hamburger/avatar, with nothing left to shrink. |
| 11J (card layout) | No reproducible bug found — every grid already collapses safely well above 340-360px. The one real gap: no breakpoint existed below 380px except a single Analytics-only rule, leaving the 320-375px band technically unaudited by any explicit CSS. |
| No shared/consistent swipe-to-dismiss | 3 of 4 bottom sheets (Lainnya, Notifications, Profile) had zero gesture support at all; the 4th (request-mode confirm) had its own older, simpler implementation lacking velocity threshold, backdrop interpolation, and drag-vs-scroll disambiguation — four different (or absent) behaviors instead of one. |

## 2. Files Changed

- **`platform.css`** — `[data-theme="dark"] .bottom-sheet` fix; toolbar two-row restoration at ≤600px; ≤380px defensive gutter trims for Vehicle (`.vm-grid`/`.vm-asset`) and Analytics (`.v2-admin-config-groups`, `.v2-analytics-groups`).
- **`style.css`** — `body.sheet-scroll-lock { overflow: hidden; }` (shared body-scroll-lock class for the new gesture module).
- **`engineering.css`** — ≤380px defensive gutter trims for `.eng-card-grid`/`.eng-hero-stats`.
- **`js/workspace/workspace-styles.js`** — ≤380px defensive gutter trims for `.wsp-grid`/`.wsp-card`.
- **`js/ui/sheet-gesture.js`** *(new)* — shared `wireSheetSwipeDismiss()` + `lockBodyScroll()`/`unlockBodyScroll()`.
- **`js/app.js`** — wired the shared module into the "Lainnya" More sheet.
- **`js/notifications.js`** — wired the shared module into the Notifications modal.
- **`js/admin.js`** — wired the shared module into the Profile modal.
- **`js/components/request-mode-selector.js`** — replaced its bespoke `wireSwipe()` with the shared module (the one true de-duplication in this phase).

## 3. Why This Fixes the Issue

**11I dark mode:** `[data-theme="dark"] .bottom-sheet { background: var(--surface); box-shadow: var(--shadow-lg); }` reuses the exact same tokens and pattern already proven for `.modal-box` two lines above it in `platform.css` — no new hardcoded colors, no `--white`/`--dark` touched, per the "use the existing theme token system, no dark-mode exceptions" instruction. `.bottom-sheet-item`'s text (`--text`) and `.bottom-sheet-handle` (`--gray-3`) were already correctly dark-remapped from Phase 11A, so this one rule closes the gap completely.

**11I toolbar:** the new rule matches the winning selector's specificity (`body.v2-shell-active .v2-topbar[...]`) exactly, but is scoped to `@media (max-width:600px)` and placed later in the file — so it wins for the full 320-430px verification range by both specificity tie-break (source order) while leaving the untouched 601-767px single-row behavior intact (not reported broken). It restores the row to its own full-width line rather than shrinking touch targets, which is both safer and more consistent with "Apple-like spacing."

**11J:** since no bug was reproducible, the fix is additive-only — new `@media (max-width:380px)` rules that trim grid `gap`/card `padding` by a few px, mirroring the exact pattern already proven for Analytics' `.hm-stats`. Column counts and collapse logic are untouched.

**11K:** `wireSheetSwipeDismiss()` is modeled directly on the mobile drawer's gesture fix from Phase 11C (commit-the-state-change-before-clearing-inline-styles, deferred one `requestAnimationFrame`, so the CSS transition always has a real "from" frame to animate from — no snap). It adds three capabilities no existing sheet had: a velocity threshold (fast flicks dismiss even under the distance threshold), live backdrop-opacity interpolation during drag, and a scroll-top gate (`scrollEl.scrollTop <= 0`) so a sheet with its own scrollable content only arms the dismiss-drag once already scrolled to top — the standard iOS/Android nested-scroll convention. Because it's one function called by all four sheets, any future sheet only needs one wiring call instead of a new bespoke implementation.

## 4. Mobile Viewport Verification

Verified via code trace only (no browser available in this environment):
- Confirmed the new toolbar rule's selector specificity and file-order position beat the offending rule at every width ≤600px, covering all six requested widths (320/360/375/390/402/430).
- Confirmed `.wsp-card`, `.eng-card`, `.vm-asset` all already carry `min-width: 0`, so the new ≤380px padding/gap trims cannot themselves introduce overflow.
- Confirmed no column-count or `minmax` value was changed in 11J — only spacing.

**Not performed:** actual rendering at each of the six widths in a real/emulated viewport. This should be checked in DevTools device toolbar before shipping, particularly the toolbar row-wrap transition and the ≤380px card spacing.

## 5. Gesture Verification

Verified via code trace only:
- Traced `wireSheetSwipeDismiss()`'s touchstart/touchmove/touchend logic against all four call sites (More sheet, Notifications, Profile, request-mode sheet) to confirm `sheetEl`/`backdropEl` arguments match each one's actual DOM structure (siblings for the More sheet, parent/child for the modal-based ones).
- Confirmed each backdrop element's existing CSS (`.bottom-sheet-overlay`, `.modal-overlay`, `.req-sheet-overlay`) is compatible with inline `opacity`/`transition` manipulation without fighting an existing opacity-based CSS transition (only `.req-sheet-overlay` has one; the module's `transition:none`-during-drag / clear-after-rAF sequencing hands control back to it cleanly).
- Confirmed `.modal-box` (`max-height:90vh; overflow-y:auto`) is genuinely the scroll container for Notifications/Profile, so the default `scrollEl = sheetEl` is correct without needing an explicit override.
- Confirmed the module's idempotency guard (`WeakSet`) makes it safe to call `wireSheetSwipeDismiss()` on every `open*()` invocation rather than requiring a separate one-time init call site.

**Not performed:** actual touch/gesture feel (follow-finger smoothness, velocity-threshold tuning, spring-back animation) — cannot be tested without a touch-capable browser. Recommend verifying the default `distanceThreshold=80`/`velocityThreshold=0.5` feel right on a real device before shipping; both are easy to tune as the two options passed to `wireSheetSwipeDismiss()`.

## 6. Dark/Light Verification

- Traced `.bottom-sheet`'s full rule chain in both themes: light mode unaffected (still `var(--white)` background via the base rule); dark mode now resolves `background: var(--surface)` (`#1F2025`) with `.bottom-sheet-item`'s already-correct `color: var(--text)` (`#E6E4DF`) — a readable pairing, matching `.modal-box`'s already-verified dark contrast exactly.
- No other color was touched in this phase.

**Not performed:** visual confirmation in an actual dark-mode render.

## 7. Regression Analysis

1. **Toolbar wrap fix** — lowest risk of the CSS changes; purely restores a layout this app already had designed and working at one point, just silenced by a later rule. The 601-767px range (not reported broken) is explicitly untouched by scoping to ≤600px.
2. **11J narrow-breakpoint trims** — very low risk; additive spacing-only rules, no logic/column changes, and every target already had `min-width:0`.
3. **`wireSheetSwipeDismiss()`** — the WeakSet idempotency guard prevents duplicate listeners if `open*()` is ever called twice in a row. The scroll-top gate defaults to "don't arm" if `scrollEl` doesn't exist or errors, failing safe (falls back to tap-only dismissal, the pre-existing behavior).
4. **Removing `request-mode-selector.js`'s bespoke `wireSwipe()`** — behavior is a superset of the old function (same core mechanic, plus velocity/backdrop/nested-scroll handling), so no capability was lost; the old function's threshold (70px) vs. the new default (80px) is a minor, intentional behavior change — easy to override via the `distanceThreshold` option if 70px is preferred.
5. **Body-scroll-lock** — reference-counted specifically so overlapping open/close timing across sheets can't leave scroll permanently locked or unlocked prematurely; `unlockBodyScroll()` is safe to call even without a matching prior lock (clamped at 0).

## 8. Rollback Strategy

All changes are isolated to the 8 listed files plus one new file (`js/ui/sheet-gesture.js`). `git diff` / `git checkout -- <files>` fully reverts the modified files; `rm js/ui/sheet-gesture.js` (or `git clean`) removes the new one. No schema/data/Firebase impact, no new external dependencies.

---

Stopping here — no commit, no push, no further phase.
