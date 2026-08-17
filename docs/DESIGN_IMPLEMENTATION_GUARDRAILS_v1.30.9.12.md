# DESIGN IMPLEMENTATION GUARDRAILS
**Audited at:** APP_VERSION v1.30.9.12 · 2026-08-14
**Part of the Claude Design handoff package** — see `DESIGN_BRIEF_v1.30.9.12.md`.
**Purpose:** what Claude Code must NOT break when implementing whatever Claude Design produces, and how to sequence the implementation safely.

---

## 1. Protected business logic (must remain functionally unchanged)

- **Conflict detection**: `checkConflict()`/`checkVehicleConflict()` overlap math and their write-time enforcement (hard block on submit, live advisory preview, drag/resize guards) — `js/assignments.js`, reused by `js/timeline-interactions.js`. A visual redesign may change how a conflict is *displayed*, never how it's *computed or enforced*.
- **RTDB write discipline**: never `set()` the root of any collection (`assignments`, `users`, `vehicles`, etc.) — always surgical single/multi-path updates. This is an explicit in-code invariant (`js/modal.js:541`) guarding against historical-data loss.
- **Permission gating**: `canAccessModule()` → `MODULE_PERMISSIONS` → `permission-service.js#can()` is the single runtime decision chain (`js/app.js`). A redesign must route new UI through this exact chain, never re-implement role checks inline in new components.
- **Cancelled-assignment visibility rule**: cancelled assignments are permanently retained in data but unconditionally filtered from the operational board/list/KPIs (`getFilteredAssignments()`, `js/app.js:3789-3792`) — for audit/history/analytics only.
- **Scheduled-time immutability**: an assignment's `startTime`/`endTime` fields are never mutated by lifecycle events; only the *display* window swaps to actual `startedAt`/`completedAt` once a trip starts/completes (`js/timeline.js:321-341`).
- **Draggable-status restriction**: only `assigned`-status blocks are drag/resize-eligible; Running/Completed/Cancelled stay immutable on the grid (`js/timeline-interactions.js:11-13`).
- **Session-only clipboard**: the Assignment Board's copy/paste is deliberately in-memory only, never `navigator.clipboard` (`js/timeline-clipboard.js:6-9`) — don't "fix" this into a persistent clipboard without a product decision.
- **Search vs. authority-data separation**: `getFilteredAssignments()` (search/filter) feeds only the timeline/list rendering; the create/edit form and detail modal always operate on the full unfiltered `assignments[]` for conflict-checking (`js/app.js:554-557`). Any new filter UI must preserve this split.
- **Ownership/action gating**: `canActOnAssignment()`/`canCancelAssignment()` (`js/modal.js`) — admin acts on anything, driver only their own, bidang only their own self-drive assignment. Reuse these functions; don't re-derive the logic in new components.
- **Soft-delete-only pattern** (Gudang, and the house convention elsewhere): hard delete of movement records is architecturally forbidden at the RTDB rules layer, not just a UI choice — a redesigned "delete" action must still route through `archiveItem()`-style soft delete, never attempt a real delete against append-only nodes.
- **Doc-number sequencing**: Reimbursement and NOR documents acquire sequential numbers via dedicated Cloud Functions (`acquireReimbursementDocNumber` etc.) — never generate document numbers client-side.
- **Prediction/Recommendation layering**: Prediction dashboards consume ONLY `prediction-service.js`'s certified output, never the raw engines; the Recommendation Board consumes certified predictions + explainability, never re-predicts; Scenario Simulation clones input and discards — never writes production data. Preserve this layering in any redesigned Analytics/Fleet screens.

## 2. Firebase/data contracts that must remain untouched

Top-level RTDB paths in active use (confirmed via `database.rules.json` + each domain's store/persistence file) — a redesign implementation must read/write through the existing store modules (`*-store.js`, `*-service.js`, `*-provider.js`), never invent parallel paths or reshape records for a UI convenience:

`assignments`, `driver_requests`, `drivers`, `vehicles`, `users`, `userProfiles`, `customRoles`, `permissions`, `userPermissionOverrides`, `rolePermissionOverrides`, `logs`, `events`, `notifications/{uid}`, `notification_state/{uid}`, `notification_deliveries`, `push_subscriptions`, `telegram_deliveries`, `reminders`, `settings`, `feature_flags`, `analytics_exports`, `gudang/{items,movements,assets,assetHistory,locations,departments,stockProjection}`, `overtime{Units,Employees,Rates,RateVersions,Holidays,Records,DailySummary,MonthlySummary,Audit,Budget,ReportHistory,Closing,Archive}`, `pettyCash{Expenses,Nors,Cycles,Settings,Audit}`, `engineering/{assignments,workReports,notifications,settings}`, `dispatchIntelligence/{capacityHistory,overrideLogs,requestRecommendations}`, `v2_sarpras/*` (Sarpras Intelligence).

One known gap the redesign should NOT try to silently fix as a data change: the Assignment Board's vehicle legend and manual-form `<select>` are hardcoded to 4 vehicles instead of reading `getActiveVehicles()` — this IS safe and recommended to fix (it's a read-path bug, not a schema change), see `ASSIGNMENT_BOARD_REDESIGN.md` §4.

## 3. Component reuse guidance

**Reuse as-is (genuinely shared, working):**
- `js/modal.js` modal/overlay shell
- `js/pbsi-select.js`, `js/pbsi-datepicker.js` (extend adoption to Gudang/Sarpras-Intelligence/workspace-list-kit rather than letting them keep hand-rolling dropdowns)
- `js/docs/doc-engine.js` Document Generation Framework (Reimbursement, NOR, any future generated document)
- `js/ui/sheet-gesture.js` swipe-to-dismiss (canonical — don't hand-roll per-sheet gesture code)
- Skeleton loaders (`platform.css` `skeleton-pulse`)
- `js/permission-service.js`, `canAccessModule()`

**Needs redesign (real duplication/inconsistency, safe to consolidate):**
- Buttons, chips/badges, empty states, toasts — see `DESIGN_SYSTEM_SPEC.md` §3 for the exact target component list
- Color/spacing/radius/shadow tokens — consolidate onto `platform.css`'s V2 `:root` scale
- Breakpoints — consolidate onto the 5-tier scale in `RESPONSIVE_BEHAVIOR_SPEC.md` §3

**Net-new (nothing to reuse, build fresh):**
- Any vehicle-lane/vehicle-availability view for the Assignment Board (currently doesn't exist)
- Real driver/vehicle/status filter chips on the board (currently only a single search box)
- Dynamic, `/vehicles`-sourced legend component

## 4. Production safety rule (restated from the original task brief)

This entire package is analysis + design handoff. Implementing it later must still, at every step:
- Never modify production data as a side effect of a visual change
- Never deploy Firebase (hosting or functions) or change `database.rules.json`/`firebase-rules.json` as part of a styling change
- Never rewrite business logic, permission architecture, or Firebase/API contracts "while we're in there"
- Stage implementation in the same small-diff, isolated-module, feature-gated style the rest of this codebase already uses (per `CLAUDE.md`'s own incremental-development mandate) — a visual redesign is exactly the kind of large-surface-area change that benefits most from that discipline, not an exception to it

## 5. Per-screen implementation strategy (current → design change → strategy → risk)

| Screen | Current implementation | Expected design change | Implementation strategy | Risk |
|---|---|---|---|---|
| Assignment Board | Absolutely-positioned blocks in flex rows, `--hour-width` CSS var scale | Vehicle-identity fix, filter chips, mobile List parity, conflict-badge overlay, title-truncation fix | Additive layers on top of `timeline.js`'s existing render pipeline; reuse `getActiveVehicles()` (already exists) for the legend fix; expose the existing List-view toggle rather than rebuilding it | Low for the P0 fixes (read-path only); medium if a vehicle-lane view or week-view is added (new rendering path) |
| Home workspaces | `js/workspace/*` + `js/widgets/*`, role→workspace→widgets, PURE presentation over existing models | Restyle widget cards/hero to new design system | Widgets already only consume `ctx.models`/`ctx.actions` — visual-only change, no data plumbing touch | Low |
| Module list/CRUD screens (Vehicles, Drivers, Gudang catalog, Overtime records, etc.) | Bespoke per-module markup + CSS, no shared table component | New shared Table/Card component per `DESIGN_SYSTEM_SPEC.md` §3 | Build the component once, migrate module-by-module (matches the codebase's own existing "Executive UI Kit" migration precedent — adopt-and-delete, not a big-bang rewrite) | Medium — highest number of touch points, but each migration is isolated and independently shippable |
| Forms/Modals | Shared `.modal-box` shell, per-module bespoke field markup | Restyle shell + form field components, fix button touch-targets | Shell reuse is safe; field-level changes should go through the shared Select/Datepicker components, closing the current adoption gap | Low-medium |
| Notifications/Activity | `js/notifications.js`, bell + activity log | Possible visual consolidation with Audit Driver/Kendaraan per `INFORMATION_ARCHITECTURE.md` §3 | If IA merge is adopted, needs a shared filterable-activity-list component; if not adopted, visual-only | Low if visual-only; medium if the IA merge ships in the same pass |
| Bottom nav / mobile shell | `js/config/bottom-nav-registry.js`, data-driven per role | Restyle only — the mechanism is sound and recently hardened | No structural change; new icon set + spacing per new design tokens | Low |

## 6. What Claude Design must NOT invent

- New user roles (e.g., a "Warehouse Staff" persona) — none exist in `role-registry.js`.
- Workflows with no code-verified basis (every proposed screen must map to a real feature in `FEATURE_UX_AUDIT.md`'s 55-item inventory).
- A second mobile navigation tree distinct from the existing relocated-rail pattern.
- New Firebase collections/fields for presentation convenience — flag the need, don't assume it's approved.
