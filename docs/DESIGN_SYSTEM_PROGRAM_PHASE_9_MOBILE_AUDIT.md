# Phase 9 — Mobile-First Experience: AUDIT (Stage 1 of the workflow)

**Status:** Audit complete. **No implementation has started.** Per this phase's
own instruction ("do not implement before the audit identifies actual
problems"), this document stops at findings + proposed direction + severity.
It is the checkpoint before Mobile IA / Migration Map / Implementation.

**Method:** four parallel research passes traced actual CSS media queries,
JS event wiring, and rendered markup across every top-level CSS file and the
relevant `js/**` modules — not assumptions from filenames. Every row below
has a `file:line` citation. Where a finding is inferred rather than directly
observed (e.g. a runtime race that wasn't reproduced live), it's labeled
**INFERRED** instead of **VERIFIED**.

---

## 1. Audit table

| Surface | Current mobile behavior | Problem | Severity | Proposed direction |
|---|---|---|---|---|
| Viewport meta (`index.html:5`) | `maximum-scale=1.0, user-scalable=no` | Disables pinch-zoom app-wide — direct conflict with this program's own §34 ("Do NOT disable browser zoom... Accessibility takes priority") | **P1** | Remove `maximum-scale`/`user-scalable`, keep `width=device-width, initial-scale=1, viewport-fit=cover` |
| Desktop rail, 768–1023px touch tablets (`platform.css:14131-14186`) | Item/brand/username labels are `opacity:0` until `:hover`/`:focus-within`; mobile-drawer override that forces them visible only applies `<768px` (`domain-shell.js:368`) | On a touch-only tablet (no `:hover`), rail is icon-only until the same tap that navigates away — no persistent "current location" label | **P1** | Extend the "always-expanded" override to `(hover: none)` regardless of width, not just `<768px` |
| Canonical Drawer body-scroll lock (`js/components/drawer.js`, all open/close paths) | Never calls the app's existing `lockBodyScroll()`/`unlockBodyScroll()` (`js/ui/sheet-gesture.js:112-123`), unlike every other bottom-sheet consumer (`app.js:836`, `admin.js:1569`, `notifications.js:580`, `request-mode-selector.js:101`) | Backdrop area can still be touch-scrolled, moving page content behind an open drawer | **P1** | Wire the existing `lockBodyScroll`/`unlockBodyScroll` into `openDrawer`/`closeDrawer` — reuses an established utility, no new architecture |
| Canonical Drawer footer safe-area (`platform.css:12872` + `12917`) | Both `.drawer` (panel) and `.drawer__foot` add `env(safe-area-inset-bottom)` when a footer is present | Double-counted inset — ~82px dead space below action buttons on notched devices instead of ~48px | **P2** | Make `.drawer`'s own bottom padding apply only when there's no footer (footer already carries its own inset) |
| Pending workspace free-text fields (`platform.css:4983-4990`, values built in `app.js:4446-4480`) | `white-space:nowrap; overflow:hidden; text-overflow:ellipsis` unconditionally on "Rekomendasi Dispatch"/"Ketersediaan"/"Keperluan"/"Catatan", no `title=` attr | Clipped text has no way to be revealed on touch (no hover tooltip works on mobile either) | **P1** | Add `title=` attribute for a native disclosure, or allow wrapping on these specific fields |
| Pending card action buttons (`platform.css:4999-5008`) | `.v2-pending-btn` has no `min-height`, ~30-32px effective; 3 buttons `flex:1` side by side with long labels | Below touch-target minimum on the primary approve/reject task; long Indonesian labels wrap awkwardly at 375px with no dedicated narrow layout | **P1** | Apply the app's own established `min-height:44px` convention (already used on `.btn-primary` etc., `style.css:841-844`); stack buttons vertically under a width threshold |
| Pending realtime insert order (`js/firebase.js:837-846` sort + `app.js:4549-4614` `reconcilePendingCards`) | New request (always newest — sorts first) is inserted **above** every visible card via `insertBefore(node, listEl.firstElementChild)` | A remote request arriving while an admin is mid-tap on the current first card's Setujui/Tolak button can shift that button to a different request underneath their finger. Neither Phase 8.3 nor 8.4's suites test this exact "insert above the currently-topmost card" scenario | **P1 — INFERRED** (code-grounded, not reproduced live) | Guard: if any pending card has an active pointerdown, defer the top-insert (or insert below the in-progress card) until pointerup |
| Pending mobile filter/search | The only filter mechanism (`#v2SearchInput`) is `display:none !important` at `<1024px` (three separate rules), with **no alternative** — the visible mobile "Cari Cepat" trigger is the unrelated global Command Palette (zero references to `searchQuery`/`pending` in `command-palette.js`) | On a phone, Pending has **no way to search/filter the request list at all** | **P1** | Add a compact search-icon affordance that reveals the existing search input in a sheet, reusing the established `sheet-gesture.js` action-sheet pattern (no new architecture) |
| Drivers / Administration user & driver card actions (`platform.css:6313-6416`, `6929-6935`) | `.v2-user-btn` (Edit/Nonaktifkan/Arsipkan/Reset PIN) shrinks to `padding:4px 8px; font-size:11px` at ≤400px — computed ≈23-26px tall, 3 buttons crammed edge to edge | Well under 44px on state-changing/destructive actions, the worst touch-target finding in the audit | **P1** | Apply `min-height:44px`; at ≤400px stack 2+1 or switch to a compact icon-only row with adequate individual widths instead of shrinking all three in place |
| Administration "Tambah/Edit User" form (`style.css:2282-2288`) | `.form-actions` is not sticky (only `#assignmentForm .form-actions` gets that treatment, `style.css:2385-2395`); this form can get very long (role summary + individual-permissions panel + engineering-level toggle) | Must scroll past the whole form to reach Simpan/Batal on a 375px screen | **P2** | Extend the existing sticky-footer rule to this form's `.form-actions` |
| Engineering History/Work-Report tables (`engineering.css:318`, `engineering-views.js:195-234`) | `.eng-table-wrap{overflow-x:auto} .eng-table{min-width:640px}`, 5 columns, no restructuring at any breakpoint | On a 375px screen, ~59% of the table is visible; status/duration require horizontal scroll to read | **P1** | Restructure to stacked key-value rows below ~640px, following the Petty Cash ledger's own precedent (`petty-cash.css:136-147`, which already does exactly this) |
| Engineering create/edit modal field grid (`engineering.css:419`) | `.eng-field-row{grid-template-columns:1fr 1fr}`, no `@media` override anywhere in the file | Columns compress to ~145px each at 375px — workable but tight for date/number inputs | **P2** | Collapse to 1 column below ~480-560px, matching the app's own `.form-grid` convention |
| Engineering input font size (`engineering.css:420`) | `.eng-input{font-size:13.5px}`, no mobile override | Below the 16px iOS-Safari zoom-prevention threshold the rest of the app uses; Gudang's near-identical `.gud-input` already patches this (`gudang.css:165`) | **P2** | Add the same `@media (max-width:600px){font-size:16px}` guard Gudang already has |
| Petty Cash Add/Edit Expense form (`petty-cash-center.js:1110-1152`) | Entirely inline-styled: fixed 2-col grid (no responsive override possible on an inline style), 13px inputs, ~35-38px buttons with no `min-height`, non-sticky footer inside a single scrolling overlay | Bypasses every shared mobile fix the rest of the app already has, because there's no class to hook one onto | **P1** | Convert to the shared `.form-grid`/`.form-group`/`.btn-primary` classes (already collapse/scale correctly elsewhere) |
| Petty Cash detail drawer (`petty-cash-center.js:1201-1203`) | Inline `style="width:440px;max-width:94vw"`, right-docked, no class name — no bottom-sheet fallback, no safe-area padding, no swipe affordance | Functional at 375px (94vw cap keeps it near-full-width) but the only drawer in the app with literally zero responsive rule surface (a class-based fix is impossible on an inline style) | **P2** | Give it a class name so it can join the drawer-migration effort below, or at minimum receive `env(safe-area-inset-bottom)` |
| Overtime: 4 tables (`overtime-records-view.js:113`, `overtime-closing-view.js:64`, `overtime-report-history-view.js:53`, `overtime-reports-view.js:66`) | Plain inline `overflow-x:auto` wrapper, no class, 5-6 columns each | Same as Engineering — no CSS media query can rescue an inline style; horizontal scroll is the only way to read any of these on a phone | **P1** | Move the wrapper to a class, then apply the same stacked-row restructuring as Engineering/Petty Cash |
| Overtime per-unit header row (`overtime-center.js:798-806`) | `display:flex` with **no `flex-wrap`**, packing unit name + 2 badges + 3 buttons (~85-95px each) into one row | At 375px (343px content width) this cannot fit — buttons will compress/overflow rather than wrap | **P1** | Add `flex-wrap:wrap` (minimal, one-line fix) |
| Overtime row actions (`overtime-records-view.js:73-77`) | Inline `padding:5px 10px;font-size:11.5px` ⇒ ~26px, inside the last `<td>` of a table only reachable after horizontal scroll | Smallest touch target found in the audit, compounded by requiring a scroll to reach it | **P2** (subsumed by the table restructuring fix above) | Resolved once the table becomes stacked rows with a normal-width action area |
| **Architectural: two navigation systems on mobile** (`bottom-nav-registry.js` + `domain-shell.js` reparented into the hamburger drawer) | Both simultaneously visible; overlapping but non-identical destination sets (e.g. driver bottom-nav vs. Operations domain items), no shared vocabulary | Not a rendering bug — a genuine "is this the intended IA" question | **Flag, do not silently fix** | This is a STOP-and-report item per §48 ("new routing architecture" / "replacing navigation" are explicitly out of scope for this phase) — documenting for a decision, not touching |
| **Architectural: 4 modules reimplement their own drawer** instead of `js/components/drawer.js` — Engineering (`.eng-drawer`), Gudang (`.gud-drawer`), Petty Cash (inline, no class), Overtime (`employeeHistoryDrawer`) | Each has its own overlay/backdrop, none has the canonical drawer's swipe-dismiss, safe-area handling, or (except Gudang, partially) focus trap | Directly contradicts `js/components/drawer.js`'s own stated intent ("THE canonical drawer... across Driver Ops, Vehicles, Petty Cash, Overtime, Engineering") | **Flag — large, needs its own scoped effort** | 4-module migration is a phase-sized effort on its own; recommend scoping as a deliberate follow-on rather than folding into Phase 9's touch-up pass |
| Executive Command Center — `.wsp-btn`/toggle touch targets (`workspace-styles.js:319-322`) | ~32-34px, no `min-height:44px` (the fix every other module already has) | Pre-existing gap, not a regression introduced by anything recent | **P2/P3 — frozen** | Executive is explicitly FROZEN this phase (§21); documented only, not touched, unless you want to lift the freeze for this one convention fix |
| Executive grid collapse breakpoint (`workspace-styles.js:1247`, 600px not 767px) | 601-767px devices (large-phone landscape, small tablets) still get the 2-column squeeze | Same freeze logic | **P3 — frozen** | Documented only |
| Command Palette trigger/result rows (`platform.css:14276-14296`, `14342-14353`) | Trigger ~34px, result rows ~36px | Below 44px but not severely | **P3** | Low priority; bump padding slightly if touching this file for other reasons |

---

## 2. What's already fine (verified, not re-touched)

- Requests workspace (`js/requests.js`) — touch targets, approval bottom-sheet at ≤600px, `.form-grid` collapse: already correctly built, already uses the app's `min-height:44px` convention.
- Petty Cash ledger table restructuring (`petty-cash.css:136-147`) — genuinely good mobile pattern, cited above as the model to copy elsewhere.
- Overtime Daily Entry checklist (`overtime.css:77-80`, `auto-fill` grid) — self-adapting, no hand-written breakpoints needed, already has a sticky save footer.
- Gudang catalog/movement-history/forms/modal structure — best-built of the six workspaces audited; only its detail drawer shares the cross-cutting drawer-violation finding.
- Canonical Drawer's own width/height/swipe/focus-trap/focus-restore behavior — correct bottom-sheet pattern already.
- Drivers/Administration form modals (`.form-grid`) — collapse correctly, 16px inputs already applied.
- Header, bottom-nav, safe-area handling on `.bottom-nav`/`.fab-add`/`.v2-topbar` — correct, already survived multiple prior hardening passes (Phase 11I/11L).
- `overflow-x:hidden` usages app-wide — every instance has a specific structural reason, none are bug-masking hacks.
- Executive hero/ring sizing, Story/Attention hover-dependency — no issue found.
- "Pulse-stat shelf" horizontal-scroll concern in the brief — **stale premise**: that pattern was already replaced by a wrapping flex layout; the only surviving horizontal-scroll primitive (`chipRow`) is dead code with zero call sites, not a live bug.

---

## 3. Severity summary

- **P1 (10 items):** zoom-disable meta tag, tablet rail label gap, drawer scroll-lock, Pending text truncation, Pending button touch targets, Pending realtime insert race (inferred), Pending mobile search absence, Drivers/Admin card touch targets, Engineering table, Petty Cash form, Overtime tables, Overtime header wrap.
  *(11 counted — one more than stated; see full table.)*
- **P2 (7 items):** drawer safe-area double-count, Admin form sticky footer, Engineering field-grid collapse, Engineering input font, Petty Cash drawer responsiveness, Overtime row actions (resolved by table fix).
- **P3 (3 items, 2 frozen):** Executive touch targets (frozen), Executive breakpoint (frozen), Command Palette minor sizing.
- **Flagged, not fixed (2 architectural items):** competing navigation systems, 4-module drawer violation. Both are explicitly the kind of finding §48 says to STOP and report rather than resolve inside this phase's touch-up scope.

---

## 4. Recommendation for next step

Per the required workflow (AUDIT → MOBILE IA → MIGRATION MAP → IMPLEMENTATION →
...), the next stage would draft a migration map for the P1/P2 items above.
Before doing that, this needs your call on scope — see the question below.
