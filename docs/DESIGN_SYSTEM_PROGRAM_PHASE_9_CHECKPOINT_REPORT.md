# Design System Program — Phase 9 Checkpoint & Next-Phase Discovery

**Status:** Audit-only pass. **No implementation performed in this pass.**
Nothing committed, pushed, or deployed. This document verifies Phase 9's
own report against the actual codebase, maps the two deferred architectural
items, audits design-system consistency and performance, and recommends
exactly one bounded next phase — without starting it.

---

## 1. Phase 9 implementation — verified against actual code

Every claim in `DESIGN_SYSTEM_PROGRAM_PHASE_9_MOBILE_FIRST_REPORT.md` was
re-checked directly against the working tree (grep + direct file reads),
not trusted from the report text.

| Claim | Verified against | Result |
|---|---|---|
| Viewport zoom re-enabled | `index.html:5` — no `maximum-scale`/`user-scalable` | **VERIFIED** |
| Tablet touch-rail fallback | `platform.css:14238` `@media (min-width:768px) and (hover:none)` | **VERIFIED** |
| Drawer scroll lock | `js/components/drawer.js:44,170,224,267` — import + 3 call sites | **VERIFIED** |
| Drawer safe-area double-count fix | `platform.css:13005` `.drawer:not(:has(.drawer__foot))` | **VERIFIED** |
| Pending button touch target | `platform.css:5056-5069` `.v2-pending-btn{...min-height:44px}` | **VERIFIED** |
| Pending field wrap (no more clipped text) | `platform.css:5042` `.v2-pending-field--full .v2-pending-value` | **VERIFIED** |
| Pending realtime pointer-guard | `js/app.js:4558+` `_pendingActionPointerActive`, `protectedNode`/`afterProtected` in `reconcilePendingCards` | **VERIFIED** |
| Pending mobile search toggle | `js/app.js:4689,4697,4715` button + wiring | **VERIFIED** |
| Drivers/Admin touch target | `platform.css:6386-6404` `.v2-user-btn{...min-height:44px}` | **VERIFIED** |
| Administration sticky form footer | `style.css:2390` `#userForm .form-actions` | **VERIFIED** |
| Engineering table reflow | `engineering.css:330-340` `@media(max-width:640px)` block; `js/engineering/ui/engineering-views.js` — 10 `data-label=` occurrences | **VERIFIED** |
| Engineering field-grid collapse + 16px input | `engineering.css:445` `.eng-input{font-size:16px}` | **VERIFIED** |
| Petty Cash form migrated off inline styles | `js/petty-cash/petty-cash-center.js` — `FLD_INPUT` constant gone, 13 `pc-add-*` class usages | **VERIFIED** |
| Petty Cash keyframes restored | `petty-cash.css:80,83` `pcSpin`/`pcPulse` present | **VERIFIED** (confirms the hostile-review revert held) |
| Petty Cash detail drawer safe-area | `js/petty-cash/petty-cash-center.js:1249` `env(safe-area-inset-bottom` | **VERIFIED** |
| Overtime table reflow (4 tables) | `js/overtime/ui/*.js` — 5+5+6+1 `data-label=` occurrences across the 4 view files; `.ot-row-btn` used 3+1 times | **VERIFIED** |
| Overtime header-row wrap fix | `js/overtime/overtime-center.js:805` `flex-wrap:wrap` on the unit-header button group | **VERIFIED** |

**Conclusion: every claim in the Phase 9 report is real and present in the
working tree.** No claim was found to be aspirational, stale, or reverted.

---

## 2. Out-of-scope leak review — hostile scan

The working tree currently shows 15 non-image files modified beyond
Phase 9's own file list, plus dozens more (executive widgets, workspace
renderer, firebase.js, auth.js, requests.js, command-palette.js, several
`scripts/*-check.mjs`). **These are NOT Phase 9 leaks.** Evidence:

**File-modification-time separation** (today is 2026-08-24; this Phase 9
session's own edits all fall between 12:15 and 18:11 today):

| Pre-existing (Phase 8.x, before this session) | mtime |
|---|---|
| `js/widgets/executive/motion-profiles.js`, `ui-kit.js` | 2026-08-20 |
| `js/workspace/workspace-registry.js`, `widget-registry.js`, `workspace-renderer.js`, `workspace-styles.js` | 2026-08-20/21 |
| `js/firebase.js`, `js/auth.js`, `js/shell/command-palette.js` | 2026-08-21 |
| `js/components/decision-replay-drawer.js`, `driver-wellness-drawer.js` | 2026-08-21 |
| `js/requests.js` | 2026-08-21 |
| `js/widgets/executive/index.js` (the Phase 8.7 `mountCountUp`/`mountBarReveal` staleness-guard fix) | 2026-08-24, **11:42** — before this session's first edit |
| 7 `scripts/*-verification-check.mjs` / `*-dom-check.mjs` files | 2026-08-20/21 |

| Genuinely Phase 9 (this session) | mtime |
|---|---|
| `index.html`, `js/components/drawer.js`, `js/app.js`, `platform.css`, `style.css`, `engineering.css`, `overtime.css`, `petty-cash.css`, `js/engineering/ui/engineering-views.js`, 4× `js/overtime/ui/*.js`, `js/overtime/overtime-center.js`, `js/petty-cash/petty-cash-center.js`, `scripts/mobile-first-verification-check.mjs` (new) | 2026-08-24, 12:15-18:11 |

**Diff-content separation for the shared files** (`js/app.js`, `platform.css`,
`style.css`, `index.html` were already modified before this session started,
so their `git diff` includes both eras mixed together):

- `js/app.js`: 519 total added lines in the diff. Only ~14 lines contain a
  Phase-9-unique marker (`_pendingActionPointerActive`, `protectedNode`,
  `wirePendingMobileSearchToggle`, etc.); tracing the surrounding hunk shows
  the entire `buildPendingCardHTML`/`reconcilePendingCards`/
  `updatePendingCardInPlace` system (~400+ lines) is the **already-disclosed
  Phase 8.4 Pending realtime reconciler** (`docs/DESIGN_SYSTEM_PROGRAM_PHASE_8_4_PENDING_WORKSPACE_REALTIME_REPORT.md`),
  sitting uncommitted since before this session. Phase 9's real contribution
  inside `js/app.js` is the pointer-guard block, the modified insertion
  branch, and the search-toggle button + wiring — on the order of 80-100
  lines, not 519.
- `platform.css`: 354 added lines; only 6 carry the `Phase 9 mobile-first
  audit` comment tag this session consistently used for every new block.
  The rest is pre-existing Phase 8.x CSS.
- `style.css`: 60 added lines; 1 Phase-9-tagged block (the `#userForm
  .form-actions` sticky-footer addition). The rest predates this session.
- `index.html`: 2 hunks. One is the 1-line viewport fix (Phase 9). The
  other, at line 353, is explicitly labeled `Phase 7G.4` in its own
  comment — a pre-existing login-screen change, not Phase 9's.

**Structural guarantee:** every edit this session used the `Edit` tool's
exact-string-match mechanism, which fails closed if the target text doesn't
match precisely — there is no path by which an edit could have silently
altered adjacent unrelated code.

**Conclusion: zero out-of-scope leaks from Phase 9.** Every file Phase 9
touched maps directly to an audited P1/P2 finding. The large pre-existing
diffs in shared files are Phase 8.x's own already-reported, still-
uncommitted work, untouched and unmodified by this phase.

One thing genuinely worth flagging, not as a leak but as a process note:
Phase 9's own background-agent dispatch (documented in its own report §5)
DID produce two real out-of-scope attempts — an unrelated keyframe deletion
in `petty-cash.css` and an unrelated toggle-knob CSS change in
`engineering.css` — both caught and reverted before being reported as done.
Re-verified here: `petty-cash.css:80,83` show `pcSpin`/`pcPulse` restored;
`engineering.css:304-305` show `.eng-toggle-knob` back to its original
`left`-based transition, not `transform`. Both reverts hold.

---

## 3. Real-device verification status

**VERIFIED** (real browser/CDP evidence, this pass and Phase 9's own):
- All 775 automated checks (§9) — real Puppeteer renders against real
  project CSS/HTML/JS, real computed-style assertions, real DOM diffing.
- Horizontal overflow at 9 mandated viewports, zero console errors, on a
  real unauthenticated app boot.

**NOT VERIFIED — requires a real physical device or authenticated session,
neither available in this environment (same standing constraint disclosed
in every phase back through 8.5):**
- Real touch interaction (actual finger-down timing against the Pending
  pointer-guard, actual drag-to-dismiss on the canonical drawer's grabber).
- Real mobile scrolling/momentum, real on-screen-keyboard viewport resize
  behavior (`dvh`/`svh` correctness under a real iOS/Android keyboard).
- Real drawer gesture feel (swipe velocity, not just the touchmove math).
- Real safe-area insets on an actual notched/Dynamic-Island/gesture-bar
  device (emulation only asserts the CSS rule exists and computes a value
  of `0px` in a desktop browser — it cannot prove the inset renders
  correctly against real hardware insets).
- Real network jitter during a Pending realtime update landing mid-tap —
  the pointer-guard test (§1, §9) proves the algorithm is correct under a
  simulated `PointerEvent`, not that a real touchscreen's touch-to-click
  timing behaves identically.
- Actual frame-timing/jank on real mobile hardware — no `page.tracing` or
  device profiling was run this pass (same gap Phase 8.7 disclosed).

No claim in this report or Phase 9's own report asserts real-device
verification. Where the distinction matters, both reports say so
explicitly.

---

## 4A. Navigation architecture map (audit only — not fixed)

Two independent navigation systems are simultaneously active on mobile:

**System 1 — Workspace-scoped bottom nav**
- Defined: `js/config/bottom-nav-registry.js` (`BOTTOM_NAV_ITEMS`, keyed by
  workspace: `driver`/`engineering`/`request`/`executive`).
- Rendered: `renderBottomNav()`, `js/app.js:744-781`; invoked unconditionally
  from the `updatePermissionUI()` path (`js/app.js:1057`) — not gated by
  any feature flag.
- Visible: fixed bottom bar, `<768px` (`style.css:3302`/`platform.css:1057-1442`).
- Destinations: 4-5 shortcuts per workspace (e.g. driver: Hari Ini/Timeline/
  Dashboard/Riwayat/Profil).
- Touch targets, safe-area handling: correct (56px items, `env(safe-area-
  inset-bottom)` applied).

**System 2 — Domain Shell rail, reparented into the hamburger drawer on
mobile**
- Defined: `js/shell/domain-shell.js` (`buildDomains()`, 7-domain IA:
  Today/Operations/Warehouse/Finance/Engineering/Insights/Control).
- Active by default: `js/app.js:1309` (`domainShellV1: true`), invoked at
  `js/app.js:1220`.
- On `<768px`: the desktop rail (`.domshell-rail`) is `display:none`, and
  `syncResponsive()` (`js/shell/domain-shell.js:361-398`) physically
  re-parents the same rail + tabbar DOM into the legacy `#sidebar` drawer,
  reachable only via the hamburger (`#sidebarToggle`).
- Destinations: full 7-domain tree — e.g. Operations alone exposes
  Board/Jadwal Saya/Requests/Drivers/Vehicles/Audit Driver/Audit
  Kendaraan/Riwayat.

**The conflict:** both are simultaneously visible and interactive on the
same mobile screen — a fixed bottom bar (System 1) plus a hamburger that
opens a drawer containing System 2's full tree. They pull from two
unrelated data sources (`BOTTOM_NAV_ITEMS` vs. `buildDomains()`) with
overlapping but non-identical destinations and no shared vocabulary (e.g.
System 1's driver bottom-nav item "Timeline" and System 2's Operations
domain don't reference each other).

**Why this wasn't fixed in Phase 9:** resolving it requires an IA decision
(which system is canonical, or how they should divide responsibility) —
not a rendering fix. The phase's own §48 lists "new routing architecture"
and "replacing navigation" as explicit STOP conditions.

**Migration risk if unified:**
- **High regression surface** — `BOTTOM_NAV_ITEMS` is consumed only by
  `renderBottomNav()`; `buildDomains()` feeds the entire Domain Shell
  (rail + tabbar + mobile drawer + breadcrumb). Collapsing one into the
  other means re-deriving one data source from the other, or replacing
  both with a third canonical source — either touches every workspace's
  navigation entry point.
- **State synchronization** — both systems independently track "current
  location" (bottom-nav via active-item class, Domain Shell via
  `resetNavActive`/tab state); unifying requires one source of truth for
  "where am I," consumed by both render paths or by a single replacement.
- **Accessibility** — bottom-nav items are always-labeled (no hover-gating
  issue); Domain Shell rail items rely on hover/focus-within for labels on
  desktop (already the subject of Phase 9's tablet hover:none fix) — a
  unified system needs to inherit the correct one of these two label
  strategies, not both.
- **Whether one can safely become canonical:** plausible in principle
  (bottom-nav's shortcuts could become curated entries INTO the Domain
  Shell tree, rather than a parallel tree), but this is a genuine design
  decision requiring product input on which destinations matter most per
  role — not something to infer from code alone.

**Recommendation:** scope as its own phase (see §5).

---

## 4B. Drawer architecture map (audit only — not migrated)

`js/components/drawer.js` is the canonical primitive (bottom-sheet ≤640px,
swipe-to-dismiss, focus trap, focus restore, now with body-scroll-lock and
correct safe-area handling per Phase 9). Four modules bypass it entirely:

| Module | File | Own overlay classes | Width/height on mobile | Safe-area | Swipe-dismiss | Focus trap | Focus restore |
|---|---|---|---|---|---|---|---|
| Engineering | `js/engineering/ui/engineering-drawer.js` | `.eng-scrim`/`.eng-drawer` | Full-width right-slide (not a bottom sheet) | **None** | **None** | **None** | **None** |
| Gudang | `js/gudang/ui/gudang-item-detail.js` | `.gud-scrim`/`.gud-drawer` | Full-width right-slide (not a bottom sheet) | **None** | **None** | **None** | **None** — has `role="dialog" aria-modal="true"` + initial focus, but no Tab trap |
| Petty Cash | `js/petty-cash/petty-cash-center.js` `detailDrawer()` | Inline styles, no class | Right-docked, `max-width:94vw` (no bottom-sheet fallback) | **Partial** — footer padding added in Phase 9 (§1), panel itself still has none | **None** | **None** | **None** |
| Overtime | `js/overtime/overtime-center.js` `employeeHistoryDrawer()` | Bespoke, not inspected in this pass beyond confirming it doesn't import `components/drawer.js` | Not re-audited this pass | Not re-audited this pass | Not re-audited this pass | Not re-audited this pass | Not re-audited this pass |

**Common pattern across all four:** each independently reimplements
overlay + backdrop + open/close, none has the canonical drawer's swipe
gesture or keyboard focus trap, and three of four have zero safe-area
handling. This directly contradicts `js/components/drawer.js`'s own header
comment, which names all four modules as intended consumers.

**Migration complexity per module:**
- **Gudang** — lowest complexity. Already has `role="dialog"`/initial
  focus; migrating means swapping its own overlay markup for
  `openDrawer()` calls and moving its content into the `body`/`footer`
  slots. Main risk: Gudang's drawer is described in its own code comment
  as "the single most-opened overlay in the module" — highest usage
  volume of the four, so behavior-parity regression risk is real even
  though the migration itself is mechanically simple.
- **Engineering** — similar shape to Gudang (scrim + right-slide panel),
  same migration mechanics, same risk profile, `role="dialog"` missing
  entirely so a migration is also an accessibility improvement, not just
  a refactor.
- **Petty Cash** — Phase 9 already added a `pc-add-*`/safe-area pattern to
  its Add/Edit form (a different surface than this drawer); the detail
  drawer itself is inline-styled with no class at all, so migration means
  first giving it a class (as Phase 9's report already recommended,
  §2/§4 of that report) and then swapping to `openDrawer()`. Content is
  substantial (audit timeline, reimbursement breakdown, NOR linkage
  states) — the highest content-complexity of the four to re-slot into
  `drawerSection()`/`drawerMetrics()`/`drawerTimeline()`.
- **Overtime** — not deeply audited this pass (`employeeHistoryDrawer()`
  was out of scope for both the Phase 9 audit and this checkpoint); its
  migration complexity is unknown until it receives the same close
  reading Engineering/Gudang/Petty Cash got.

**Regression risk if migrated:** each module has its own existing
regression suite (`engineering-ui-dom-check.mjs`, `gudang-ui-check.mjs`
family, `pettycash-intelligence-check.mjs`) — none currently assert
drawer-specific behavior (open/close/focus/safe-area), so a migration
would need new drawer-behavior assertions added per module, mirroring what
`drawer-consolidation-check.mjs` already does for the two already-migrated
consumers (Decision Replay, Driver Wellness).

**Recommendation:** scope as its own phase, likely sequenced Gudang →
Engineering → Petty Cash → Overtime (increasing content complexity), with
its own regression suite additions per module before calling any one
module done. See §5.

---

## 5. Design-system consistency audit (classification only, nothing fixed)

| Finding | Severity | Notes |
|---|---|---|
| 21 distinct hand-written `@media` pixel breakpoints across 9 top-level CSS files, no central token consumption (`--bp-*` tokens exist but are documented as "JS/matchMedia only, not CSS-consumable") | **Architectural** | Pre-existing (found in Phase 9's own audit, not introduced by it). A breakpoint-token migration is real design-system debt but touches every responsive rule in the app — explicitly the kind of "new design-token system" work Phase 9's own §48 and this checkpoint's guardrails both rule out doing opportunistically. |
| Two parallel spacing scales in `platform.css` (legacy `--space-hero/section/subsection/card` vs. an 8px `--space-1..8` scale with only 2 live consumers in a 14,000+ line file) | **Architectural / mostly dead** | Not touched by Phase 9. Not blocking anything. |
| Petty Cash (`.pc-root`) and Overtime (`.ot-root`) each hardcode their own `--bg/--card/--border/--text/--green/--amber/--blue/--purple` token sets rather than consuming the app's tokens | **P3** | Documented in the original codebase as "byte-identical copies, not-yet-audited." Phase 9 added new classes (`.pc-add-*`, `.ot-row-btn`, `.ot-*-table*`) that correctly consume these SAME module-local tokens (`var(--card)`, `var(--border)`, etc.) rather than the app-wide ones — consistent with the existing (if debt-laden) pattern, not a new inconsistency. |
| Touch-target convention (`min-height:44px`) — now applied to `.btn-primary/secondary/danger/success` (pre-existing), `.v2-pending-btn`, `.v2-user-btn`, `.ot-row-btn`, `.pc-add-btn` (all Phase 9) | **Converging, not yet universal** | Requests workspace already had it; Executive's `.wsp-btn` (~32-34px) still doesn't, by deliberate freeze (§8). Command Palette trigger/result rows (~34-36px) also still don't — correctly out of scope as P3 per Phase 9's confirmed scope decision. |
| 4 parallel overlay/dialog primitives exist app-wide: canonical Drawer, legacy `.modal-overlay`/`.modal-box`, the `sheet-gesture.js`-backed action-sheet system, and at least one fully bespoke inline-styled dialog (`overtime-center.js`'s `saveConfirmModal()`) | **Architectural** | Pre-existing, documented in Phase 9's audit (§9 of the audit doc). Not expanded by Phase 9 — no new overlay primitive was introduced this phase. |
| Reduced motion / `[data-anim="off"]` gating | **Consistent** | Phase 9 added zero new animation; existing `motionOff()` gates continue to apply unchanged, reverified in §9 (`prefers-reduced-motion` boot check, 1/1 pass). |
| Icon usage in Phase 9's own additions | **Consistent** | The Pending search toggle reuses the canonical `anIcon('search', ...)` (`js/analytics/analytics-shell.js`), not a new inline SVG or emoji — matches §28 of the mobile-first brief. |
| Safe-area handling | **Improving, still uneven** | Canonical Drawer (fixed this phase), `.bottom-nav`/`.fab-add`/`.v2-topbar` (already correct), Petty Cash detail-drawer footer (fixed this phase) vs. Engineering/Gudang drawers (still none — covered by §4B) and `.domshell-tabbar` (still no side-inset handling, not touched this phase, not previously flagged as P1/P2). |

**No P0 or P1 design-system-consistency findings.** Everything above is
either pre-existing architectural debt (already documented before this
checkpoint, unchanged by Phase 9) or a residual gap in the two explicitly-
deferred items (§4A, §4B). Nothing here meets the bar for immediate
intervention per this checkpoint's own instruction (§6: "Only P0/P1
findings should be considered candidates for immediate intervention").

---

## 6. Performance check

Phase 9 added no new `requestAnimationFrame` loop, `setInterval`, motion
token, or Firebase listener. Its only new **always-on** runtime cost is
three `document`-level event listeners for the Pending pointer-guard:

```
document.addEventListener('pointerdown', ..., { capture: true, passive: true });
document.addEventListener('pointerup', ..., { capture: true, passive: true });
document.addEventListener('pointercancel', ..., { capture: true, passive: true });
```

- **Current behavior:** each handler does an early-return `.closest()`
  check (`pointerdown`) or a boolean check (`pointerup`/`pointercancel`)
  on every pointer event anywhere in the document, `passive: true` so
  they cannot block scrolling/other gesture handling.
- **Measured problem:** none — no perf regression was observed in any of
  the 775 checks (§9), including the reduced-motion boot check and the
  full navigation/motion-continuity suites, all re-run after this
  addition.
- **Root cause / risk if any:** a `.closest()` call on every pointerdown
  anywhere in the app is a real but negligible cost (single DOM ancestor
  walk, only on an already-infrequent user-initiated event, not a
  continuous loop).
- **Proposed change:** none — no measured problem to fix.

The Pending search-toggle's `click`/`keydown` listeners for outside-click
and Escape are added on open and explicitly removed on close (`js/app.js`
`wirePendingMobileSearchToggle`'s `close()` function) — no listener leak
across repeated open/close cycles.

`reconcilePendingCards()`'s new `protectedNode`/`afterProtected` branch
adds one reference comparison per new-card insertion — O(1) per card, not
a new pass over the list.

**Conclusion: no measured performance problem exists from Phase 9's
changes, so no optimization is proposed or justified.** This matches the
checkpoint's own instruction not to optimize blindly.

---

## 7. Frozen surfaces (confirmed, not touched this pass or Phase 9)

- **Executive Command Center** (`js/widgets/executive/*`,
  `js/workspace/workspace-styles.js`) — frozen. Two pre-existing minor
  gaps remain documented, not fixed (§2 of Phase 9's own report).
- **Firebase** (`js/firebase.js`) — untouched.
- **Permissions** (`canAccessModule`, RTDB rules) — untouched.
- **Business logic** — rate/closing/report engines (Overtime), NOR
  generation and dispatch scoring (Petty Cash/Requests), Knowledge/
  Learning Engine, AI orchestration — none required or received an
  interface-level correction; all 5 Overtime engine suites, the Petty
  Cash intelligence suite, and every Engineering foundation/routing suite
  re-ran clean with zero logic changes.
- **Phase 8.x motion system** — no redesign; the one Phase 8.7 regression
  suite (`motion-performance-hardening-check.mjs`) re-ran clean at 16/16.
- **Phase 9's own mobile fixes** — not rewritten in this pass; this pass
  is audit-only.

---

## 8. Regression results — fresh re-run this pass

Every suite below was actually executed during this checkpoint pass (not
carried over from memory of Phase 9's own run):

| Suite | Result |
|---|---|
| `scripts/mobile-first-verification-check.mjs` | 42/42 |
| `scripts/drawer-consolidation-check.mjs` | 52/52 |
| `scripts/workspace-foundation-check.mjs` | 24/24 |
| `scripts/executive-motion-polish-check.mjs` | 16/16 |
| `scripts/motion-performance-hardening-check.mjs` | 16/16 |
| `scripts/navigation-crossfade-check.mjs` | 53/53 |
| `scripts/motion-continuity-orchestration-check.mjs` | 28/28 |
| `scratch/verify-requests-live-diff.mjs` | 68/68 |
| `scratch/verify-pending-workspace-reconciler.mjs` | 61/61 |
| `scripts/engineering-ui-check.mjs` | 61/61 |
| `scripts/engineering-ui-dom-check.mjs` | 50/50 |
| `scripts/engineering-foundation-check.mjs` | 116/116 |
| `scripts/pettycash-intelligence-check.mjs` | 29/29 |
| `scripts/overtime-analytics-engine-check.mjs` | 65/65 |
| `scripts/overtime-closing-engine-check.mjs` | 27/27 |
| `scripts/overtime-rate-engine-check.mjs` | 15/15 |
| `scripts/overtime-report-model-check.mjs` | 36/36 |
| `scripts/overtime-template-check.mjs` | 16/16 |
| `scripts/smoke-boot.mjs` | PASS, 0 fatal errors |

**775/775 automated checks green.** No suite was skipped; none required
an environment that wasn't available (all run headless via the project's
existing Puppeteer-based harnesses).

---

## 9. Recommended next phase

**One** phase is recommended — the two architectural findings should
**not** be combined into it, and should not be combined with each other
either. Reasoning:

- Navigation unification (§4A) is an **IA/product decision** first,
  implementation second — its scope can't even be bounded until someone
  decides which destinations survive.
- Drawer migration (§4B) is a **mechanical but multi-module refactor**
  with real regression surface, sequenceable module-by-module.
- Combining either with the other, or with a third initiative, multiplies
  regression surface for no synergy — they touch different files, different
  risk profiles, and different decision-makers.

### Phase 10 — Canonical Drawer Migration (recommended)

**Objective:** migrate Gudang, Engineering, and Petty Cash's detail drawers
onto `js/components/drawer.js`, closing the safe-area/swipe/focus-trap gaps
documented in §4B, one module at a time.

**Scope:**
- Gudang item-detail drawer → `openDrawer()` (lowest complexity, highest
  usage — do first, establishes the pattern).
- Engineering assignment-detail drawer → `openDrawer()` (same shape as
  Gudang, adds `role="dialog"` it currently lacks).
- Petty Cash expense-detail drawer → `openDrawer()` (highest content
  complexity — audit timeline, reimbursement breakdown, NOR-linkage
  states — do last, once the pattern is proven twice).
- New regression assertions per module (open/close/focus-trap/safe-area/
  swipe), extending each module's existing suite rather than only relying
  on `drawer-consolidation-check.mjs`'s generic coverage.

**Explicit exclusions:**
- Overtime's `employeeHistoryDrawer()` — not yet individually audited;
  defer to a Phase 10 follow-up or a dedicated look before committing to
  its migration shape.
- The two competing navigation systems (§4A) — untouched.
- Executive Command Center — stays frozen.
- No business-logic, Firebase, or permission changes.
- No new overlay primitive, no changes to `js/components/drawer.js`'s own
  public API beyond what a real migration needs (e.g., if a module's
  content genuinely doesn't fit the existing `drawerSection`/
  `drawerMetrics`/`drawerTimeline` slots, that's a STOP-and-report
  moment, not a license to redesign the canonical component).

**STOP conditions:**
- If any module's content cannot be represented through the canonical
  drawer's existing slot API without functional loss — stop and report,
  don't force it or extend the canonical API without confirming with the
  user first.
- If a migration surfaces a real behavior difference users depend on
  (e.g. Gudang's drawer being "the single most-opened overlay" suggests
  users may have muscle-memory around its current interaction) — stop and
  report before proceeding to the next module.

**Verification strategy:** same method already established across this
program — real Puppeteer runs against the actual render pipeline (not
copied logic, since these modules' UI functions are reachable without
Firebase auth, unlike `js/app.js`), plus the existing per-module
regression suites re-run clean after each module's migration, plus a new
`drawer-migration-check.mjs`-style suite (or additions to
`drawer-consolidation-check.mjs`) proving each migrated drawer behaves
identically to before on every axis §4B's table lists.

**Definition of DONE:** Gudang, Engineering, and Petty Cash's detail
drawers all render through `openDrawer()`; each has real swipe-dismiss,
focus trap, focus restore, and safe-area handling on mobile it didn't have
before; each module's existing regression suite plus new drawer-behavior
assertions are green; Overtime's drawer is either migrated too (if
audited and found straightforward) or explicitly deferred with a written
reason; nothing committed/pushed/deployed without separate approval.

---

## 10. Known limitations

- Real-device verification remains outstanding for both Phase 9's fixes
  and everything audited in this checkpoint — same standing constraint
  disclosed in every phase since 8.5.
- Overtime's `employeeHistoryDrawer()` was not individually audited this
  pass (out of scope for both Phase 9's audit and this checkpoint) — its
  row in §4B's table is explicitly incomplete, not silently assumed safe.
- The design-system consistency audit (§5) and performance check (§6) are
  bounded, evidence-based passes, not exhaustive design-token or
  profiling audits — neither surfaced anything at P0/P1, so neither
  triggered deeper investigation this pass, per the checkpoint's own
  "only P0/P1 justify immediate intervention" instruction.

## 11. Git status

Not committed, not pushed, not deployed. Working tree unchanged by this
checkpoint pass (audit-only, zero files edited).
