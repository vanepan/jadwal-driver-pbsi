# Design System Program — Phase 12: V1 Final Cross-Product QA & Stabilization Report

**Status:** Audit complete. 5 narrow fixes implemented (2 production `js/`,
3 test-infrastructure). Hostile review + full regression done. **NOT
committed, NOT pushed, NOT deployed.** `database.rules.json`, Cloud
Functions logic, `js/config.js`/`APP_VERSION`, `version.json`,
`service-worker.js`, the permission engine, and the navigation
architecture were **not touched**.

**Final V1 status: `V1 READY WITH DOCUMENTED DEFERMENTS`** (see §14).

---

## 1. Executive Summary

Phase 12 is the final quality gate for V1. It is not a feature phase. The
objective was to verify that the accumulated Phases 1–11 work behaves as
one coherent product and to fix only what is genuinely justified, narrow,
and safe.

**What was audited:** the full V1 surface inventory (§2) via direct code
inspection plus the project's existing headless regression infrastructure
— ~110 suites, ~4,700 individual checks re-run this pass. The known
carry-over items from Phases 9/10/11 (two competing mobile navigation
systems, Overtime's non-canonical drawer, the reimbursement authorization
history, the Custom Roles load-error incident, `konfigurasi.view` write
access, the `database.rules.json` test-parse issue) were each re-checked
against current code.

**What was found:** **zero P0. Zero P1.** Eight findings total — one
genuine production UX bug (Cancel not re-rendering in the Custom Role
editor), one architectural item that is a deliberate, still-open IA
decision (two mobile nav systems), one Overtime state-leak, and five
test-infrastructure / test-drift issues. Nothing that blocks V1.

**What was fixed (Phase 12 scope):**

| # | Fix | Files | Type |
|---|---|---|---|
| F1 | `cancelDraft()` in Role Management now re-renders — "Batal" visibly discards the draft (Save bar clears, checkbox reverts) | `js/role-management/role-management-center.js` (+9) | Production bug, P2 |
| F8 | Overtime `nav` action now clears `historyEmployeeId` — the Employee History drawer no longer survives a sub-screen switch | `js/overtime/overtime-center.js` (+10/-1) | Production bug, P2 |
| F3 | firebase-auth test stub gained `setPersistence`/`browserLocalPersistence` (+2 siblings) — `vehicles-store-check.mjs` runs again (was a hard crash) | `scripts/lib/firebase-stubs/firebase-auth.js` (+4 exports) | Test infra, P3 |
| F5 | `gudang-ui-check.mjs` — 2 stale assertions rewritten to test the current architecture (they asserted pre-`v1.30.5` / pre-`V1 Redesign 1b` implementation details) | `scripts/gudang-ui-check.mjs` (2 checks) | Test drift, P3 |
| F7 | `verify-reduced-motion-gap-closure.mjs` — toggle-knob assertion corrected to match the deliberately-`left`-based implementation (Phase 9 §2 revert), not the reverted `transform` version | `scratch/verify-reduced-motion-gap-closure.mjs` (1 block) | Test drift, P3 |

**What was deliberately deferred with documented reasons (§5):** the two
competing mobile navigation systems (needs a product/IA decision — a STOP
condition), a full port of `vehicle-asset-dom-check.mjs` onto the
canonical drawer contract, the `gudang-security-check.mjs` JSON-parse
issue, the reimbursement Cloud Function deployment, and re-running the
RTDB/Functions emulator suites (no JDK in this session's environment).

**Regression:** ~110 suites re-run, all green except the two pre-existing
failures that Phase 12 deferred (both confirmed pre-existing via `git
stash` — not caused by Phase 12, and for one of them, not caused by the
uncommitted Phase 8–11 baseline either).

---

## 2. Surface Inventory

Derived from `js/app.js`'s real navigation/render paths, `js/shell/
domain-shell.js`'s 7-domain IA, `js/config/bottom-nav-registry.js`, and
`MODULE_PERMISSIONS`. Every surface below was inspected at least at the
code + existing-regression level this pass.

### Core / Shell
- Login / authentication (`index.html` login card, `js/auth.js`) — inspected
- Global header / V2 topbar — inspected (Roles D-2 label fix confirmed in tree)
- Domain Shell rail + tab bar (`js/shell/domain-shell.js`) — inspected
- Legacy sidebar / hamburger drawer — inspected (mobile reparent path, §7)
- Workspace-scoped bottom nav (`renderBottomNav()`) — inspected (§7)
- Command palette (`js/shell/command-palette.js`) — regression only
- Theme switching (light/dark/system) — regression (`doc-theme-primitives-check`, viewport matrix)
- Notification surface (`js/notifications.js`, bell + panel) — regression (`notifications-panel-check` 22/22)
- Shared loading / error / empty states — inspected (Custom Roles load-error, §15)
- Canonical drawer (`js/components/drawer.js`) — regression + listener-leak audit

### Operations
- Today / Executive Home — regression (`problem-first-home-dom-check` 32/32)
- Driver Operations (Board / Timeline / dashboard) — regression + hotfix re-check
- Requests — regression (`request-workflow`, `request-intelligence`, `request-mode-polish`)
- Drivers / Driver Wellness — regression (`driver-wellness-check` 66, `-dom-check` 48)
- Vehicles / Vehicle Detail Drawer — regression (`vehicle-*` suites; one DOM test deferred, §5/F4)
- Audit Driver / Audit Kendaraan — regression (`self-drive-assignment`, `archive-ownership`)
- Pending workspace — regression (`verify-pending-workspace-reconciler` 61/61)
- Assignment / Vehicle detail — canonical-drawer regression

### Warehouse (Gudang)
- Catalog / item detail / asset detail — regression (`gudang-ui-check` 178/178 after F5)
- Goods In / Goods Out / Stock Opname / Asset Lifecycle — regression (all green)
- Dashboard / Analytics / Intelligence — regression (`gudang-analytics-check` 30/30)
- FAB positioning (hotfix Issue B) — re-confirmed via `gudang-ui-check`/`-smoke`

### Finance (Petty Cash)
- Petty Cash center / expense detail drawer — regression (`pettycash-intelligence-check` 29/29)
- Amount thousands-separator (hotfix Issue E) — `verify-pettycash-amount-format` path intact
- NOR / reimbursement linkage — regression + `measure-reimbursement`

### Engineering
- Engineering workspace / detail drawer (canonical, Phase 10) — regression (`engineering-ui-dom-check` 51/51)
- Routing / runtime / concurrency / master data / analytics export — all green
- Server notifications (`engineering.*`) — `engineering-notification-check` 38/38

### Administration
- Users (list, cards, lifecycle, last-admin guard) — regression (`users-lifecycle-check` 16/16)
- Roles / Permissions (detail + Permissions Matrix) — regression + **F1 fix**
- Settings (`renderV2AdminConfig`, numeric bounds, write-access gate) — regression (all green)
- Notifications (D2/D3/D4/D6) — `notifications-panel-check` 22/22
- User Create/Edit/View, Reset PIN, Clone/Review Role (canonical drawers) — regression (all green)
- Individual + Role Additional permission grant/revoke — regression (all green)

### Not in V1 scope (confirmed untouched)
- Sarpras Intelligence / V2 (`js/v2/*`, `js/sarpras-*`) — regression only, no changes
- Executive Command Center widgets — frozen, no changes

---

## 3. Findings

| ID | Surface | Severity | Finding | Root Cause | Action | Status |
|---|---|---|---|---|---|---|
| F1 | Administration → Role Management (Custom Role editor) | **P2** | Clicking "Batal" on an unsaved permission edit cleared the draft internally and showed a "Perubahan dibatalkan" toast, but the screen did not update — the Save/Cancel bar stayed visible and the toggled checkbox stayed checked until an unrelated interaction forced a re-render. | `cancelDraft()` was the only state-mutating handler in `role-management-center.js` that did not end with `render()`. Every sibling (`onChange` permission toggle, `selectRole`, `clone-cancel`, `review-back`, `toggleViewMode`) does. | Added `render()` to `cancelDraft()`. | **FIXED** — `role-management-edit-dom-check.mjs` 23/2 → 25/0. |
| F2 | Mobile navigation | **P2 (STOP)** | Two independent navigation systems are still both active and interactive on the same mobile screen: `renderBottomNav()`'s fixed bottom bar (System 1, keyed by workspace) and `domain-shell.js`'s 7-domain rail reparented into the hamburger drawer (System 2). Overlapping-but-non-identical destinations, two data sources (`BOTTOM_NAV_ITEMS` vs `buildDomains()`), no shared vocabulary. | Deliberate cross-phase deferral. First mapped in the Phase 9 checkpoint §4A; explicitly out of scope for Phases 9, 10, 11 because unifying requires an IA/product decision (which system is canonical, or how they divide responsibility), not a rendering fix. | **STOP — documented, not changed.** Both systems function and every destination is reachable, so this is redundancy/confusion (P2), not breakage (not P1). Recommend scoping as its own IA phase per Phase 9 §5. | **DEFERRED** (§5). |
| F3 | Test infrastructure | **P3** | `scripts/vehicles-store-check.mjs` — the only direct regression test of `js/vehicles-store.js` — crashed at import (`SyntaxError: ... does not provide an export named 'browserLocalPersistence'`), providing zero coverage. | `js/firebase.js` gained `import { setPersistence, browserLocalPersistence }` (from the login-entry / persistence work). `scripts/lib/firebase-stubs/firebase-auth.js`, which the test's ESM loader hook substitutes for the real SDK, was never updated — and Node validates every imported name at instantiation, so a missing one is a hard crash before any test code runs. | Added `setPersistence`, `browserLocalPersistence`, `browserSessionPersistence`, `inMemoryPersistence` exports to the stub, with a comment requiring the stub to stay a superset of `js/firebase.js`'s import. Test-only. | **FIXED** — `vehicles-store-check.mjs` now runs 54/54. |
| F4 | Test infrastructure | **P3** | `scripts/vehicle-asset-dom-check.mjs` (~30 checks: Fleet Dashboard + Vehicle Detail Drawer real-render) crashes on an unguarded `document.getElementById('execDrawerOverlay').querySelector(...)` — the whole test targets a DOM contract that no longer exists. | Design System Program **Phase 2 (v1.30.11.1)** migrated `js/components/vehicle-detail-drawer.js` onto the canonical `js/components/drawer.js` (`.exec-drawer*` / `#execDrawerOverlay` → `.drawer*` / `.drawer-overlay`). `refreshVehicleDetailDrawer()` was updated in that migration; this test's ~40 contract references were not. | **DEFERRED** (§5) — a faithful restore is a full port with per-assertion review of which behaviours legitimately changed in the migration, not a "narrow" fix. Confirmed pre-existing via `git stash` (fails identically with all uncommitted work removed). | **DEFERRED**. |
| F5 | Test drift (`scripts/gudang-ui-check.mjs`) | **P3** | Two assertions failed against correct current code: (a) `--accent` "copied verbatim from engineering.css" — regex `/--accent:#[0-9a-f]{6};/` matches neither file anymore; (b) `canAccessModule has a real, non-dev-only "gudang" case` — regex `/case 'gudang':\s*return false;/`. | (a) "V1 Redesign Phase 1b" retired local `--accent` literals from **both** `engineering.css` and `gudang.css` onto the single canonical `platform.css` token. (b) `v1.30.5` (Permission Runtime Migration) replaced `canAccessModule()`'s switch with a data-driven `MODULE_PERMISSIONS` lookup (`gudang: 'warehouse.view'`). Both assertions test removed implementation details; neither is a product bug. | Rewrote both to assert the current mechanism while preserving the original intent (no divergent Gudang brand identity; a real named permission gate, never world-open). | **FIXED** — `gudang-ui-check.mjs` 176/2 → 178/0. |
| F6 | (not a separate finding) | — | `role-management-edit-dom-check.mjs`'s 2 failing assertions ("Cancel hides the Save bar" / "reverts the checked count"). | These are the assertions that **correctly caught F1**. Not stale. | Resolved by the F1 fix. | **FIXED via F1**. |
| F7 | Test drift (`scratch/verify-reduced-motion-gap-closure.mjs`) | **P3** | One assertion failed: `.eng-toggle-knob final state uses a real CSS transform (translateX), not "none"` (before=none, after=none). | The Phase 9 checkpoint (§2) **deliberately reverted** `.eng-toggle-knob` to its original `left`-based transition (`transition: left .15s`; `left: 3px → 20px`). This scratch assertion still expected the reverted `transform` version. The knob's ~17px travel and its suppressibility under `prefers-reduced-motion` are unchanged — only the animated property differs — so there is no actual reduced-motion regression. | Corrected the assertion (and its section comment) to match the deliberate `left`-based implementation: assert the CSS `left` value changes (so reduced-motion can still collapse it). | **FIXED** — `verify-reduced-motion-gap-closure.mjs` 14/1 → 15/0. |
| F8 | Finance-adjacent / Overtime | **P2** | An open Employee History drawer (`js/overtime/overtime-center.js`'s `employeeHistoryDrawer()`) survived a sub-screen switch inside the Overtime module and re-rendered on top of the new screen. | `st.historyEmployeeId` is the only `shell()`-level overlay flag with no screen-scoped close path; `case 'nav'` set `{ screen }` only. First noted in the Phase 10 Overtime drawer audit (§7) as a bonus fix "if/when this drawer is migrated." | Fixed as a standalone 1-property state cleanup (`case 'nav': setState({ screen: id, historyEmployeeId: null })`) — no drawer migration. A cross-module modal-state-consistency defect squarely in this phase's remit; the fix can only ever close a stale drawer on navigation, so it is zero-risk. | **FIXED** (logic-verified — no Overtime-UI DOM harness exists; see §12). |

---

## 4. Fixes Implemented

All five changes are listed in §1's table. Consolidated diff scope:

| File | Lines | What |
|---|---|---|
| `js/role-management/role-management-center.js` | +9 (one hunk at `cancelDraft()`) | F1 — add `render()` + explanatory comment. Nothing else in this file touched by Phase 12 (its large uncommitted diff is pre-existing Phase 11 work). |
| `js/overtime/overtime-center.js` | +10 / −1 (one hunk at `case 'nav'`) | F8 — clear `historyEmployeeId` on sub-screen navigation + comment. |
| `scripts/lib/firebase-stubs/firebase-auth.js` | +8 (4 new exports + comment) | F3 — restore `vehicles-store-check.mjs`. Test-only. |
| `scripts/gudang-ui-check.mjs` | 2 assertions rewritten (~+18 / −6) | F5 — test current architecture, preserve intent. Test-only. |
| `scratch/verify-reduced-motion-gap-closure.mjs` | 1 block (~+12 / −7) | F7 — match the deliberate `left`-based knob. Test-only. |

**Two production `js/` files** (F1, F8), each a single small, self-contained
hunk matching an established in-file pattern. **Three test-only files**
(F3, F5, F7).

No new files. No CSS changes. No HTML changes. No `js/config.js` /
`APP_VERSION` / `version.json` / `service-worker.js` change. No
`database.rules.json` change. No Cloud Functions change. No navigation
architecture change. No `js/components/drawer.js` change.

---

## 5. Deliberately Deferred

| Item | Why deferred | Recommended disposition |
|---|---|---|
| **F2 — two competing mobile navigation systems** | Resolving it requires an IA/product decision (which system is canonical, or how they split responsibility) — a Phase 12 STOP condition (§23.1). Inventing a unified nav architecture is explicitly out of scope (§7, §22). Both systems currently function; every destination is reachable. | Scope as its own phase per Phase 9 checkpoint §5. Needs product input on which destinations matter most per role before implementation can even be bounded. |
| **F4 — `vehicle-asset-dom-check.mjs` port** | ~40 DOM-contract references target the `.exec-drawer*` markup removed by the v1.30.11.1 canonical-drawer migration. A faithful restore is a full port with per-assertion judgment about which behaviours legitimately changed in that migration (e.g. footer variant styling) — not a "narrow" test fix (§19), and Phase 12 warns against archaeology (§5). The Vehicle Detail Drawer's canonical behaviour is covered generically by `drawer-consolidation-check.mjs` (67/67) and the other canonical consumers' DOM checks; Fleet Dashboard rendering by `vehicle-management-presentation-check.mjs` (52) and `vehicle-asset-check.mjs` (58, logic). | Dedicated test-repair task: port the suite onto the canonical `.drawer` / `.drawer-overlay` / `[data-drawer-action]` / `.drawer-sec__h` contract. |
| **`gudang-security-check.mjs` — JSON-parse crash** | The test does `JSON.parse(database.rules.json)`; that file legitimately contains Firebase-valid `//` line comments (documented, maintained across every RTDB-hardening phase; the RTDB emulator's own parser loads it fine — the emulator suite is the sanctioned coverage). The imprecise "malformed file" framing in the Phase 10 / hotfix reports is corrected here: the file is not malformed, `JSON.parse` is simply comment-intolerant. Fixing the test means stripping `//` and `/* */` before parsing, then re-validating the assertions underneath — which needs RTDB-rules review, adjacent to territory Phase 12 §9/§22/§23.2 rules out. Consistent with the disposition of every prior phase. | Make the test comment-tolerant (mirror the "normalize comments/whitespace" step the RTDB deployment discipline already uses), then re-validate its structural assertions in a pass that is allowed to reason about `database.rules.json`. |
| **Reimbursement Cloud Function deployment** | `functions/src/reimbursement/counter.js`'s server-side ownership gate (v1.30.11.6) is committed but Cloud Functions do not auto-deploy from a git push — the older, weaker function is still live in production. Deploying is explicitly outside Phase 12's no-deploy remit (§26) and any Cloud Functions authorization change is a STOP (§23.3). The client-side ownership gate **is** live (Vercel auto-deploy). Phase 12 introduced no change here and weakened nothing (§6). | `firebase deploy --only functions` in the separate review→deploy step this repo is being left ready for. |
| **RTDB / Functions emulator suites not re-run this pass** | No JDK on `PATH` in this session's environment (`java: command not found`); `firebase-tools` 15.21.0 is present but the emulators need Java. Last certified results: RTDB emulator **20/20** (Custom Roles collection-read investigation, 2026-08-27); Functions emulator **95/95** (v1.30.11.6 hotfix). `database.rules.json` and `functions/` logic are byte-unchanged since (confirmed by `git diff`), so those results still stand. | Re-run `npm run test:rtdb-emulator` / `npm run test:functions-emulator` on a machine with a JDK as part of the pre-deploy checklist (the `rtdb-authorization-validation-suite` notes have no-admin JDK setup steps for this machine). |
| **F8 verification depth** | Fixed, but there is no Overtime-UI DOM harness in `scripts/` (only the 5 Overtime *engine* suites), so the fix is logic-verified, not DOM-verified. The change is a one-property addition to an object literal whose sibling `close*` handlers already clear their own state; `smoke-boot` + `node --check` + the engine suites confirm no breakage. | Optional: an `overtime-ui-dom-check.mjs` would close a real coverage gap for the whole Overtime UI, not just this fix. |
| **Overtime drawer → canonical migration** | Audited READY in Phase 10 §7, deliberately deferred there. Phase 12 §8 says not to migrate remaining surfaces unless necessary for V1 completion and low-risk. It is neither necessary nor free of regression surface. | Its own follow-up pass, as Phase 10 recommended. |
| **`js/auth.js` `getRoleLabel()` / `#roleBadge` Custom-Role blindness** | Left as-is in the uncommitted Phase 11 tree with a documented reason: fixing it would create an `auth.js → role-catalog.js → custom-roles-store.js → auth.js` import cycle in a foundational module. `#roleBadge` is a V1-only element, hidden in the V2 topbar, visible only under the emergency rollback flag. | Extract `isAdmin()` to a dependency-free module first, then resolve the label through `resolveRoleInfo()` — a separately-scoped refactor. |

---

## 6. Security Review

| Question | Answer |
|---|---|
| Did `database.rules.json` change? | **No.** Not opened for editing. Not in Phase 12's changed-file set. |
| Did Cloud Functions change? | **No.** No file under `functions/` was edited by Phase 12. (The `functions/src/maintenance/backupTick.js` comment in the working tree is pre-existing Phase 11 work.) |
| Did permission semantics change? | **No.** `MODULE_PERMISSIONS`, `permission-service.js`, `canAccessModule()`, `verifyPin.js`, role registries — all untouched. `permission-service-check` (68/68), `canAccessModule-check` (5/5), `permission-runtime-invariant-check` (43/43), `verify-pin-role-resolution-check` (23/23) all green. |
| Did reimbursement authorization change? | **No.** `js/reimbursement.js`, `js/modal.js`, `js/docs/document-viewer.js`, `functions/src/reimbursement/counter.js` — untouched. The hotfix's client-side ownership gate and z-index fix remain as shipped. `measure-reimbursement` green. The server-side Cloud Function gate remains committed-but-undeployed (§5) — Phase 12 neither deployed nor weakened it. |
| Was the `konfigurasi.view` write-access decision respected? | **Yes.** Phase 11's Decision 1 (client-side `hasAdminWriteAccess()` gating on Users + Settings) is intact in the working tree; `admin-write-access-gate-check` 19/19. Decision 2 (declining the `userPermissionOverrides` RTDB asymmetry) is untouched. |
| Reimbursement ownership regression (§10) | Client-side gate present and unchanged; server-side gate present in code, undeployed. No Phase 12 change to this chain. Full authoritative re-verification requires the Functions emulator (no JDK this session, §5) — last result 13/13 reimbursement-specific + 95/95 overall at v1.30.11.6. |

**No security-boundary change was introduced in Phase 12.**

---

## 7. Responsive Verification

Method: the project's existing headless Puppeteer harnesses, re-run this
pass. Real Chromium renders against the real project CSS/HTML/JS, real
computed-style and `getBoundingClientRect()` assertions.

| Widths tested | Suite | Result |
|---|---|---|
| 320 / 375 / 390 / 430 / 768 / 1024 / 1280 / 1440 (× light/dark × normal / `prefers-reduced-motion` / `[data-anim="off"]`) | `scratch/verify-motion-8-1-viewport-matrix.mjs` | **72/72** — zero horizontal overflow (`scrollWidth − innerWidth = 0`) at every combination, zero fatal console/page errors |
| 375 / 390 / 402 / 430 (canonical drawer bottom-sheet) | `scripts/drawer-consolidation-check.mjs` | **67/67** — panel never exceeds viewport width, grabber visible, zero overflow/errors |
| 9 mandated viewports, unauthenticated boot | `scripts/mobile-first-verification-check.mjs` | **42/42** |
| Gudang FAB (hotfix Issue B) at mobile | `gudang-ui-check` / `gudang-ui-smoke` | green — sibling-of-`.gud-content` structural fix intact |
| Requests mobile search toggle, Pending pointer-guard | `verify-phase9-*` paths via regression suites | green |

**NOT VERIFIED (real device):** same standing constraint disclosed in
every phase of this program — no physical device or authenticated session
in this environment. Real touch/gesture feel, real on-screen-keyboard
viewport resize, real notched-device safe-area insets: not tested.

---

## 8. Accessibility Verification

Practical checks performed (via existing suites + code inspection):

- **Canonical drawer** — focus trap, initial focus (`.drawer__close`),
  focus restoration, Escape, backdrop, body-scroll-lock, `role="dialog"` /
  `aria-modal`: `drawer-consolidation-check.mjs` 67/67 (real Puppeteer
  focus/trap/restore run) + `hostile-review-drawer-listener-audit.mjs` 8/8
  (10 open/close cycles leave 0 net keydown listeners; race handling
  correct; `onClose` fires exactly once).
- **Migrated admin drawers** (User Form, Reset PIN ×2, Delete Confirm,
  Clone/Review Role) — `delete-confirm-drawer-check` 16/16,
  `admin-pin-reset-dom-check` 39/39, `role-management-edit-dom-check`
  25/25, `permissions-matrix-dom-check` 30/30 (includes a real
  interaction test for the drill-in button that a DOM-presence assertion
  would have missed).
- **Login** — semantic `<form>`, `<label for>` on both fields,
  `autocomplete` hints, `aria-live` error region, `[hidden]` as the single
  show/hide mechanism (`verify-error-ux-names` green).
- **Reduced motion** — `verify-reduced-motion-gap-closure.mjs` 15/15
  (after F7), viewport matrix's reduced-motion column green.
- **Touch targets** — 44px convention on `.btn-*`, `.v2-pending-btn`,
  `.v2-user-btn`, `.ot-row-btn`, `.pc-add-btn` (mobile-first suite).

**Not chased:** theoretical WCAG-AAA completeness requiring redesign
(explicitly out of scope, §13). No new a11y defect was found.

---

## 9. Motion / Theme Verification

| Axis | Result |
|---|---|
| Light mode | Viewport matrix 72/72 (light column), `doc-theme-primitives-check` 26/26 |
| Dark mode | Viewport matrix 72/72 (dark column) — zero overflow, zero errors |
| System theme | Covered by the same matrix (no explicit `data-theme` = `prefers-color-scheme`) |
| Normal motion | `executive-motion-polish-check` 16/16, `motion-continuity-orchestration-check` 28/28 |
| `prefers-reduced-motion` | `verify-reduced-motion-gap-closure` 15/15, matrix reduced column green |
| `[data-anim="off"]` | Matrix `data-anim=off` column green (0 overflow, 0 errors, all widths/themes) |
| Navigation crossfade | `navigation-crossfade-check` 53/53, `verify-nav-crossfade-8-5` all pass |
| Command palette motion | `verify-command-palette-motion` 15/15 |
| Drawer motion | `drawer-consolidation-check` 67/67 (reduced-motion gating verified generically) |

**F7 note:** the one motion assertion that was failing (`.eng-toggle-knob`
transform vs `left`) was a stale scratch assertion contradicting a
deliberate Phase 9 revert — not a motion regression. Corrected. No new
animation system was introduced.

---

## 10. Performance Verification

Phase 12 added no `requestAnimationFrame` loop, no `setInterval`, no motion
token, no Firebase listener, no new always-on cost. The two production
changes are:

- **F1** — one extra `render()` call, only on the "Batal" click (an
  already-terminal user action). `render()` here is `root.innerHTML =
  shell()` with `focusGuard` capture/restore — the same operation every
  other handler in the module already runs on every interaction. Net: one
  full re-render replaces "no re-render + a subsequent forced re-render on
  the next interaction" — neutral-to-cheaper.
- **F8** — one extra property in a `setState()` object literal already
  being constructed. Zero measurable cost.

No suite in the ~110-suite regression run reported a performance
regression. `motion-performance-hardening-check` 16/16 (real `page.metrics()`
before/after numbers live in `scratch/perf-home-renav-before-after.mjs`,
unchanged this pass). No targeted profiling of Pending / Permissions
Matrix rendering was newly run — no measured problem to justify it, per
§17's "only implement performance fixes when there is measured evidence."

---

## 11. Regression Results

Every suite below was actually executed this pass (Node v24.16.0, headless
Chromium via the project's Puppeteer harnesses).

### Shell / mobile / motion / nav / drawer
| Suite | Result |
|---|---|
| `smoke-boot.mjs` | **PASS**, 0 fatal (1 expected `Permission denied` console line — no auth session) |
| `mobile-first-verification-check.mjs` | 42/42 |
| `drawer-consolidation-check.mjs` | 67/67 |
| `navigation-crossfade-check.mjs` | 53/53 |
| `workspace-foundation-check.mjs` | 24/24 |
| `executive-motion-polish-check.mjs` | 16/16 |
| `motion-performance-hardening-check.mjs` | 16/16 |
| `motion-continuity-orchestration-check.mjs` | 28/28 |
| `bottom-nav-notif-check.mjs` | 42/42 |
| `scratch/verify-motion-8-1-viewport-matrix.mjs` | 72/72 |
| `scratch/verify-nav-crossfade-8-5.mjs` | all pass |
| `scratch/verify-command-palette-motion.mjs` | 15/15 |
| `scratch/verify-reduced-motion-gap-closure.mjs` | **15/15** (was 14/1 — F7) |
| `scratch/hostile-review-drawer-listener-audit.mjs` | 8/8 |
| `scratch/verify-rail-hover-debounce.mjs` | 4/4 |

### Permissions / auth
| Suite | Result |
|---|---|
| `permission-service-check.mjs` | 68/68 |
| `canAccessModule-check.mjs` | 5/5 |
| `permission-runtime-invariant-check.mjs` | 43/43 |
| `verify-pin-role-resolution-check.mjs` | 23/23 |
| `credential-service-check.mjs` | 39/39 |
| `pin-hash-check.mjs` | 24/24 |
| `users-role-assignment-check.mjs` | 16/16 |

### Administration (Phase 11 suite)
| Suite | Result |
|---|---|
| `settings-store-check.mjs` | 16/16 |
| `admin-config-screen-dom-check.mjs` | 9/9 |
| `users-lifecycle-check.mjs` | 16/16 |
| `settings-numeric-bounds-check.mjs` | 13/13 |
| `notifications-panel-check.mjs` | 22/22 |
| `delete-confirm-drawer-check.mjs` | 16/16 |
| `admin-write-access-gate-check.mjs` | 19/19 |
| `phase-11-p1-fixes-check.mjs` | 19/19 |
| `permissions-matrix-dom-check.mjs` | 30/30 |
| `role-label-drift-check.mjs` | 7/7 |
| `custom-roles-load-error-check.mjs` | 4/4 |
| `role-management-detail-dom-check.mjs` | 18/18 |
| `role-management-edit-dom-check.mjs` | **25/25** (was 23/2 — F1) |
| `role-additional-permission-dom-check.mjs` | 22/22 |
| `individual-permission-management-dom-check.mjs` | 91/91 |
| `custom-role-protected-permission-dom-check.mjs` | 27/27 |
| `admin-pin-reset-dom-check.mjs` | 39/39 |

### Warehouse (Gudang)
| Suite | Result |
|---|---|
| `gudang-ui-check.mjs` | **178/178** (was 176/2 — F5) |
| `gudang-ui-smoke.mjs` | PASS |
| `gudang-foundation-check.mjs` | 64/64 |
| `gudang-goods-in-check.mjs` | 20/20 |
| `gudang-goods-out-check.mjs` | 22/22 |
| `gudang-stock-opname-check.mjs` | 19/19 |
| `gudang-asset-lifecycle-check.mjs` | 37/37 |
| `gudang-analytics-check.mjs` | 30/30 |
| `gudang-security-check.mjs` | **FAIL — pre-existing** (`JSON.parse` vs Firebase-valid `//` comments; §5). Confirmed pre-existing across Phases 10, 11, hotfix. |

### Engineering
| Suite | Result |
|---|---|
| `engineering-ui-check.mjs` | 61/61 |
| `engineering-ui-dom-check.mjs` | 51/51 |
| `engineering-foundation-check.mjs` | 116/116 |
| `engineering-routing-check.mjs` | 16/16 |
| `engineering-runtime-check.mjs` | 53/53 |
| `engineering-concurrency-check.mjs` | 12/12 |
| `engineering-master-data-check.mjs` | 26/26 |
| `engineering-analytics-export-check.mjs` | 11/11 |
| `engineering-notification-check.cjs` | 38/38 |

### Finance / Operations / Vehicles / Drivers
| Suite | Result |
|---|---|
| `pettycash-intelligence-check.mjs` | 29/29 |
| `measure-reimbursement.mjs` | PASS (1 page, 62,022 bytes) |
| `request-workflow-check.mjs` | 11/11 |
| `request-intelligence-check.mjs` | 53/53 |
| `request-mode-polish-dom-check.mjs` | 27/27 |
| `self-drive-assignment-check.mjs` | 42/42 |
| `archive-ownership-check.mjs` | 74/74 |
| `capacity-hardening-check.mjs` | 38/38 |
| `capacity-engine-check.mjs` | 52/52 |
| `vehicle-asset-check.mjs` | 58/58 |
| `vehicle-management-presentation-check.mjs` | 52/52 |
| `vehicle-recommendation-check.mjs` | 74/74 |
| `vehicle-timeline-check.mjs` | 44/44 |
| `vehicles-store-check.mjs` | **54/54** (was a hard crash — F3) |
| `vehicle-asset-dom-check.mjs` | **FAIL — pre-existing** (pre-Phase-2 drawer contract; §5/F4). Confirmed pre-existing via `git stash`. |
| `driver-wellness-check.mjs` | 66/66 |
| `driver-wellness-dom-check.mjs` | 48/48 |
| `self-drive-assignment-check.mjs` | 42/42 |
| `scratch/verify-requests-live-diff.mjs` | 68/68 |
| `scratch/verify-pending-workspace-reconciler.mjs` | 61/61 |

### Overtime
| Suite | Result |
|---|---|
| `overtime-analytics-engine-check.mjs` | 65/65 |
| `overtime-closing-engine-check.mjs` | 27/27 |
| `overtime-rate-engine-check.mjs` | 15/15 |
| `overtime-report-model-check.mjs` | 36/36 |
| `overtime-template-check.mjs` | 16/16 |

### Analytics / Executive / Home / Prediction / Dispatch
| Suite | Result |
|---|---|
| `analytics-navigation-check.mjs` | 56/56 |
| `analytics-sanitizer-check.mjs` | 68/68 |
| `executive-dashboard-dom-check.mjs` | 37/37 |
| `executive-attention-verification-check.mjs` | 84/84 |
| `executive-decision-verification-check.mjs` | 90/90 |
| `executive-hero-verification-check.mjs` | 108/108 |
| `executive-ui-kit-check.mjs` | PASS |
| `workspace-ownership-check.mjs` | 37/37 |
| `problem-first-home-dom-check.mjs` | 32/32 |
| `home-generate-live-preview-check.mjs` | 9/9 |
| `prediction-service-check.mjs` | PASS (0 failing) |
| `prediction-engine-check.mjs` | PASS (0 failing) |
| `prediction-explainability-check.mjs` | 56/56 |
| `prediction-validator-check.mjs` | PASS (0 failing) |
| `prediction-provider-check.mjs` | PASS (0 failing) |
| `dispatch-scoring-check.mjs` | 33/33 |
| `dispatch-presentation-check.mjs` | 34/34 |
| `dispatch-persistence-check.mjs` | 25/25 |
| `decision-replay-check.mjs` | 54/54 |
| `decision-replay-dom-check.mjs` | 30/30 |

### Sarpras Intelligence / V2 (not V1 scope; run for no-regression)
| Suite | Result |
|---|---|
| `sarpras-workspace-dom-check.mjs` | 95/95 |
| `live-document-workspace-check.mjs` | 45/45 |
| `doc-theme-primitives-check.mjs` | 26/26 |
| `verify-vehicle-identity.mjs` | 23/23 |
| `verify-icon-consolidation-names.mjs` | PASS |
| `verify-toast-defect-fix.mjs` | PASS |
| `verify-error-ux-names.mjs` | PASS |

### Not re-run this pass
| Suite | Reason | Last known |
|---|---|---|
| `npm run test:rtdb-emulator` | No JDK on `PATH` this session | 20/20 (2026-08-27) — `database.rules.json` unchanged since |
| `npm run test:functions-emulator` | No JDK on `PATH` this session | 95/95 (v1.30.11.6) — `functions/` logic unchanged since |

**Tally:** ~110 suites executed, **~4,700 individual checks green**. Two
pre-existing failures (`gudang-security-check.mjs`, `vehicle-asset-dom-check.mjs`),
both deferred with root cause and both confirmed pre-existing. Zero
regressions caused by Phase 12's five changes.

---

## 12. Real Browser Verification

Clearly separated per the phase's own evidence taxonomy:

- **VERIFIED (real headless Chromium, real render pipeline, real
  assertions):** every suite in §11 marked green; the F1, F3, F5, F7 fixes
  (each has a suite that now passes and previously failed/crashed); the
  responsive matrix (§7); the drawer focus/leak behaviour (§8).
- **LOGIC VERIFIED (reasoned from code + adjacent green suites, not a
  dedicated DOM run):** F8 — no Overtime-UI DOM harness exists; the change
  is a one-property `setState` addition matching sibling `close*` handlers,
  `node --check` clean, engine suites green, `smoke-boot` green.
- **STATIC VERIFIED:** the git scope review (§13) — file lists, hunk
  isolation, `grep` for orphaned IDs / stray markers.
- **NOT VERIFIED:** authenticated cross-product click-through (login as
  admin/bidang/driver/viewer and exercising each role's live UI); real
  physical mobile device; real network jitter. No Firebase credentials and
  no device in this environment — the standing constraint of every phase in
  this program.
- **BLOCKED:** RTDB / Functions emulator suites (no JDK this session, §5).

No claim of visual verification is made where only logic/static checks were
performed.

---

## 13. Git Scope Review

**Working tree going *into* Phase 12** (pre-existing, uncommitted Phases
8.x / 10 / 11 work — the documented, still-under-review baseline):
13 tracked code/asset files modified (~1,160 insertions), 4 `scratch/*.png`,
16 untracked files (12 `scripts/*-check.mjs` from Phase 11, 3 Phase 11
`docs/`, and 1 stray `database-debug.log`). Phase 12 did **not** commit,
squash, or otherwise disturb this baseline.

**Files changed *by* Phase 12 (5):**

| File | In the pre-existing baseline? | Phase 12 hunk |
|---|---|---|
| `js/role-management/role-management-center.js` | Yes (Phase 11) | One isolated hunk at `cancelDraft()` (`@@ -506,6 +668,14 @@`), +9 lines. Verified by diff that no other part of the file was touched by Phase 12. |
| `js/overtime/overtime-center.js` | No (clean at HEAD) | One hunk at `case 'nav'`, +10/−1. |
| `scripts/lib/firebase-stubs/firebase-auth.js` | No (clean at HEAD) | +8 (4 exports + comment). |
| `scripts/gudang-ui-check.mjs` | No (clean at HEAD) | 2 assertion blocks. |
| `scratch/verify-reduced-motion-gap-closure.mjs` | No (clean at HEAD) | 1 block (toggle-knob). |

**Scope-leak scan (hostile):**
- `grep` for the Phase 12 marker string across `js/`, `scripts/`,
  `scratch/` → exactly the 4 files that carry a `// Phase 12 (V1 Final QA)`
  comment (the stub's comment is worded differently but the file is in the
  list above). No stray edits elsewhere.
- `grep` for orphaned removed IDs (`modalUserFormTitle`, `btnCloseUserForm`,
  `btnCloseResetPin*`) → only in explanatory comments. No live references.
- `js/config.js`, `version.json`, `service-worker.js`, `index.html`,
  `database.rules.json`, `functions/**` (logic), `platform.css`,
  `style.css`, `js/components/drawer.js`, `js/firebase.js`, `js/auth.js` —
  **not in Phase 12's changed set** (`git diff --stat` confirms). The
  `index.html` / `backupTick.js` entries in the overall working-tree diff
  are pre-existing Phase 11.
- `node --check` clean on all 5 modified files.
- No generated evidence (screenshots, traces, logs) created or staged by
  Phase 12. The stray untracked `database-debug.log` in the repo root is
  **pre-existing**, not a Phase 12 artifact — recommend adding it to
  `.gitignore` in the review step (not done here: Phase 12 makes no config
  changes).

**Scope leaks found: 0. Scope leaks fixed: 0 (none to fix).**

---

## 14. Final V1 Status

### `V1 READY WITH DOCUMENTED DEFERMENTS`

**Why not `V1 READY TO SHIP`:** four items remain open and are documented
in §5 rather than resolved, because resolving them is either outside
Phase 12's remit or requires a decision Phase 12 is not authorised to make:

1. **The two competing mobile navigation systems (F2)** — a real UX
   coherence gap, but fixing it needs a product/IA decision (a Phase 12
   STOP condition). Not a functional break: both systems work and every
   destination is reachable.
2. **The reimbursement Cloud Function server-side ownership gate** is
   committed but not deployed (Cloud Functions don't auto-deploy from a
   git push). The client-side gate is live. Deploying is outside the
   no-deploy remit.
3. **`gudang-security-check.mjs` and `vehicle-asset-dom-check.mjs`** are
   broken tests (not product bugs) whose correct repair exceeds a "narrow"
   fix or touches RTDB-rules-adjacent territory. The behaviours they used
   to cover are covered elsewhere (RTDB emulator suite 20/20; canonical
   drawer suites 67/67).
4. **RTDB / Functions emulator suites** were not re-run this session (no
   JDK); their inputs are byte-unchanged since the last certified runs.

**Why not `V1 BLOCKED`:** every blocking criterion in the phase's own
Definition of Done is met:

- P0 findings = **0**; P1 findings = **0**.
- The one justified P2 with a live product impact (F1) is **fixed**; the
  other P2s are fixed (F8) or deferred with a concrete reason (F2).
- Remaining P3s are fixed (F3, F5, F7) or documented (F4, gudang-security).
- No new console/runtime errors (`smoke-boot` PASS, 0 fatal; viewport
  matrix 0 fatal across 72 combinations).
- No unintended horizontal overflow (viewport matrix, 8 widths × 3 motion
  modes × 2 themes, all 0).
- Major mobile and desktop surfaces are usable (regression + inventory).
- Canonical drawer behaviour is consistent (67/67 + listener-leak audit
  8/8); Overtime's non-canonical drawer is a known, documented deferral,
  not a regression.
- Navigation destinations are deterministic (`navigation-crossfade-check`
  53/53); the F2 redundancy is a coherence issue, not non-determinism.
- Permissions remain correct (§6; 4 permission suites green).
- Reimbursement ownership remains correct client-side and unchanged
  server-side (§6, §10).
- Authentication/session behaviour is correct — persistence is
  unconditional `browserLocalPersistence`, the "Ingat saya" toggle was
  intentionally removed (Phase 7G.4), no user-facing control remains.
- Light/dark coherent (§9); reduced motion respected (§9, F7).
- Realtime surfaces stable (`verify-requests-live-diff` 68/68,
  `verify-pending-workspace-reconciler` 61/61).
- No newly introduced measured performance regression (§10).
- Existing regression suites green except two pre-existing, deferred,
  non-product failures (§11).
- Real-browser verification documented honestly (§12).
- No unauthorised Firebase / security changes (§6, §13).
- No V2 work entered the V1 code path (§13).

**V1 Sarpras Operations is stable, coherent, and verified to the extent
this environment allows. It is ready to become the foundation for V2 —
Sarpras Intelligence — once the four documented deferments in §5/§14 are
scheduled and the separate review → commit → push → deploy step is run.**

---

## 15. Data / Loading / Error States (supporting detail for §14)

Re-checked against the Custom Roles incident specifically:

- `js/role-management/custom-roles-store.js` — `loadError` is a **separate
  flag** from the `customRoles` array. `refreshCache()` sets
  `loadError = false` even on a successful load of **zero** records, so a
  genuinely-empty collection renders the normal empty state, not the error
  banner. `onDenied`/`onError` set `loadError = true` **and** fire the
  change callbacks so the UI updates. `custom-roles-load-error-check.mjs`
  4/4.
- `role-management-center.js#customRolesLoadErrorHtml()` renders a truthful
  "Gagal memuat Custom Roles… coba muat ulang halaman" banner **alongside**
  (not instead of) the role list — the recovery path is a page reload
  (re-subscribe).
- The underlying production `/customRoles` RTDB read-rule gap that caused
  the incident was **fixed in production** on 2026-08-27 (deployed,
  read-back-and-diff verified — see
  `docs/PHASE_11_POST_CHECKPOINT_CUSTOM_ROLES_LOAD_FAILURE_INVESTIGATION.md`).
  Phase 12 made no change here.

"Empty collection" and "failed load" are correctly distinguished.

---

## 16. Realtime / Listener Audit (supporting detail for §14)

- Canonical drawer: 10 open/close cycles → 0 net `keydown` listeners; race
  (open-over-open) leaves exactly one overlay, superseded `onClose` does
  not fire, surviving `onClose` fires once
  (`hostile-review-drawer-listener-audit.mjs` 8/8).
- Requests live-diff reconciler: `verify-requests-live-diff.mjs` 68/68.
- Pending workspace reconciler: `verify-pending-workspace-reconciler.mjs`
  61/61 (pointer-guard, protected-node insertion, no duplicate
  subscriptions).
- `vehicles-store.js` writers: `vehicles-store-check.mjs` 54/54 (after F3)
  — every writer updates cache + listeners by the time its promise
  resolves; later echo does not duplicate.
- Notifications logout teardown (`resetNotificationsSync`), Custom Roles
  change listener, role-usage provider at session boot — all present in
  the working tree (Phase 11), `notifications-panel-check` 22/22,
  `phase-11-p1-fixes-check` 19/19.

No listener leak or duplicate-subscription defect was found. No realtime
system was modified by Phase 12.

---

*Per the master spec: Phase 12 remains uncommitted, unpushed, undeployed.
The repository is left ready for a separate, explicit review → commit →
push → deploy step. `database.rules.json` and Cloud Functions were not
touched; any deployment of the pending reimbursement Cloud Function or the
RTDB rules is a separate, deliberate action outside this phase.*
