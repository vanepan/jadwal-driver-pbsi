# Phase 10 — Overtime Employee History Drawer: Audit & Decision

**Status:** Audit only. **NOT migrated this phase.** This document exists
per Phase 10's explicit instruction: audit `employeeHistoryDrawer()`,
classify it, and only migrate if the audit proves it's clearly safe and
within bounded scope — otherwise defer with a documented reason.

**Target:** `js/overtime/overtime-center.js`, `employeeHistoryDrawer()`
(lines 484-543).

---

## 1. Behavior map

| Axis | Finding |
|---|---|
| Entry | Pure render function, included unconditionally in `shell()`'s output whenever `st.historyEmployeeId` is truthy (`${st.historyEmployeeId ? employeeHistoryDrawer() : ''}`, line 311) — no dedicated open()/close() pair, identical shape to Gudang/Engineering/Petty Cash before their migrations. |
| Open trigger | One: `data-act="openEmployeeHistory"` on each Employees-screen row (line 377) → `case 'openEmployeeHistory': setState({ historyEmployeeId: id }); return;` (line 1154). |
| Close triggers | Two, both → `case 'closeEmployeeHistory': setState({ historyEmployeeId: null }); return;` (line 1155): the backdrop overlay div (line 498) and an X icon button (lines 500-502). |
| Backdrop | Layered full-bleed div behind the panel (same "stacked div + `data-act='stop'` bubble-stopper" pattern as Petty Cash's `detailDrawer()`), `z-index:1650` — notably higher than this same module's OTHER inline modals (unit/employee/rate/holiday, all 1600). |
| Escape | **Absent.** The module's one `keydown` listener (`onRekapGridKeydown`) is scoped to the Rekap Lembur grid and the Save-Confirm dialog only — no branch for `st.historyEmployeeId`. |
| Focus trap / Tab order | **Absent.** No `tabindex` sequencing, no wrap-around. |
| Initial focus | **Absent.** No `autofocus`, no scripted `.focus()` call tied to opening (contrast with this same file's Save-Confirm dialog, which does focus its confirm button). |
| Focus restoration | **Absent.** The module's only focus-preservation mechanism (`createFocusGuard`) is scoped to `[data-focus]` live-typed inputs — nothing inside this drawer carries that attribute. |
| Body scroll lock | **Absent.** No import of `js/ui/sheet-gesture.js`, no manual `overflow` toggle anywhere in the file. |
| Safe-area | **Absent.** Zero `env(safe-area-inset-*)` occurrences anywhere in `overtime-center.js`. |
| Mobile layout | **No dedicated responsive rule.** `overtime.css` has zero rules referencing this drawer. Its only "mobile adaptation" is incidental: `width:100%;max-width:460px` on the panel, so it naturally goes full-width below 460px — not an authored breakpoint. |
| Desktop layout | 100% inline-styled (no class name on the panel), right-anchored (`justify-content:flex-end` on the backdrop), `height:100%`, `max-width:460px`. |
| Entrance/exit motion | **None at all** — no CSS transition/animation on open or close (contrast with Petty Cash's old drawer, which at least had `pcFade`/`pcPop`). Appears/disappears instantly. |
| Swipe-dismiss | **Absent.** No touch/pointer handlers anywhere in the file. |
| Actions inside | Exactly one: "Export CSV" (`data-act="exportEmployeeHistoryCsv"`, line 538) — a synchronous client-side Blob download, no Firebase write, no network call. |
| Delegation pattern | Fully delegated (one root-level `click`/`input`/`change`/`keydown` listener set, `data-act` dispatch) — identical pattern to the other three modules pre-migration. |
| Async on open | **None.** `svc.employeeHistory(employee.id)` is a synchronous aggregation over already-cached store data — no loading state exists because none is needed. |
| Firebase coupling | Indirect only, through `overtime-service.js` → `overtime-store.js` (which does import `firebase.js`) — the drawer/center file itself has zero direct Firebase calls, same layering as the other three modules. |
| DOM insertion | In-flow inside `#v2OvertimeWorkspace` (`.ot-root`), not a `document.body` portal — same as the other three modules pre-migration. |
| State surface | Exactly one field: `st.historyEmployeeId`. Everything else is derived fresh from `svc.listEmployees()`/`svc.getUnitLabel()`/`svc.employeeHistory()`. |
| **State-leak quirk (found this pass, not previously documented)** | `st.historyEmployeeId` is **not cleared** by `setOvertimeScreen()` (which does reset `unitModalOpen`/`employeeModalOpen`/`rateModalOpen`/`holidayModalOpen` on every screen switch) or by `closeOvertimeCenter()`. Since `shell()` renders it unconditionally regardless of `st.screen`, navigating away from "Karyawan" — or leaving Overtime entirely — while this drawer is open leaves it re-appearing over whatever screen the user lands on next, and again on the next Overtime mount. Pre-existing behavior, not something this audit is asked to fix, but worth carrying into a future migration's test plan. |
| `role="dialog"`/`aria-modal` | **Absent**, no accessibility attributes at all on the drawer root. |
| Content structure | Header (name, unit, active/inactive) → 4 stat cards (Total Hari/Nominal/Rata² Bulan/Rata² Tahun) → 1-line summary (last overtime date + most active month) → 2 hand-rolled mini bar charts (monthly/yearly series) → Export CSV button → a flat transaction list, newest-first, capped at the first 30 rows. No nested/conditional business-rule branches — unlike Petty Cash's 3 mutually-exclusive lock/archive banners or Engineering's role-gated action bar, this drawer's shape doesn't change based on any state beyond "which employee." |

---

## 2. Complexity comparison against the three already-migrated drawers

| | Gudang (migrated) | Engineering (migrated) | Petty Cash (migrated) | **Overtime** |
|---|---|---|---|---|
| Conditional body sections | Consumable vs. Asset body split, asset-action form | Lifecycle stepper, verification section | 3 mutually-exclusive lock/archive banners + reimbursement section | **None** — one fixed shape |
| Footer/action-bar states | N/A (all in-body) | 2-branch role/status matrix, up to 2 buttons | 4-branch lifecycle matrix, up to 4 buttons | **1 static action** (Export CSV) |
| Cross-entity lookups | Locations, departments, asset units | Personnel roster, participants | NOR cross-reference, audit log | **1 join** (unit label) |
| Async data on open | Yes (stock/forecast/history, cache-guarded) | No | No | **No** |
| Existing a11y baseline | `role="dialog"` + initial focus already present | Neither present | Neither present | **Neither present** (identical starting point to Engineering/Petty Cash before their migrations) |

**Overtime's drawer is the simplest of the four** on every axis that drove migration complexity in the other three — no conditional branching, no cross-entity reconciliation, no async loading states, a single always-present action instead of a role/status matrix. It is at least as migratable as Petty Cash was, and mechanically closer to Engineering's shape (simple header + body sections + one action) than to Petty Cash's (multiple mutually-exclusive banner/footer states).

---

## 3. Classification

### READY

The audit found no structural incompatibility with the canonical drawer's slot model:
- Content maps cleanly onto `body` (stat cards, charts, transaction list — all static markup, no conditional shell logic).
- The one action (`exportEmployeeHistoryCsv`) maps cleanly onto a single canonical `footer` button (`{label: 'Export CSV', action: 'exportEmployeeHistoryCsv'}`).
- `title`/`subtitle` map cleanly onto employee name / unit+status line (both plain text, no markup needed — an even better fit than Petty Cash's ref-number subtitle, which lost only a monospace font styling).
- No async loading state to reconcile with `openDrawer()`/`refreshDrawerBody()`'s open/refresh split.
- No swipe/focus-trap/scroll-lock/safe-area to preserve, since none exist today — migrating is a pure accessibility gain, identical to what happened for the other three.
- The one non-standard finding (the `st.historyEmployeeId` screen-navigation leak, §1) is orthogonal to the shell migration itself — the canonical shell's `onClose` callback would still fire correctly regardless of this pre-existing quirk; it doesn't block a shell migration, though a future pass could reasonably decide to also fix it as a small, disclosed, in-scope correction (matching Gudang/Engineering's own "the migration was also an accessibility/clarity improvement" pattern) if the user wants that folded in.

## 4. Recommendation

**Recommend migrating in a follow-up pass, not automatically bundled into this phase's already-completed three.** Reasoning:

- The phase's own instruction is explicit: "Unless the audit proves it is trivial and explicitly safe, DO NOT migrate Overtime during this phase" and "If you decide that Overtime should remain deferred, document the exact reason." The audit here does find it safe — but "trivial and explicitly safe" is a judgment call the user should confirm before a fourth migration is added to what was scoped as a 3-module phase.
- Bundling a 4th migration into this same report changes the phase's own stated Definition of Done ("Gudang/Engineering/Petty Cash... Overtime is either migrated too... or explicitly deferred with documented technical reasoning") — this document IS that documented reasoning; the decision to actually implement it is left to the user rather than assumed.
- **Exact reason for deferring implementation (not the audit) this pass:** no technical blocker exists — deferral here is purely a scope-discipline choice, consistent with "the objective is not to maximize the number of migrated files... one module at a time."

If the user wants it migrated now, the shape of the change is: convert `employeeHistoryDrawer()` to return `{title: employee.name, subtitle: `${unit} · ${employee.active ? 'Aktif' : 'Nonaktif'}`, body, footer: [{label:'Export CSV', action:'exportEmployeeHistoryCsv'}]}`, wire a `syncOvertimeHistoryDrawer()`/`onOvertimeDrawerAction()` pair mirroring the other three, and — as a disclosed, in-scope bonus fix — clear `st.historyEmployeeId` in `setOvertimeScreen()`/`closeOvertimeCenter()` to close the state-leak found in §1.
