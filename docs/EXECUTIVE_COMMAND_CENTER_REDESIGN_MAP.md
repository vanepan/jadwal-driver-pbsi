# Executive Command Center Redesign Map — Phase 7 (v1.30.11.6)

Current → target capability map for the Executive Command Center rebuild.
Scope: the admin-role Home briefing (`js/widgets/executive/*`), reached via
the "Today" domain. **Not** in scope: `js/components/executive-dashboard.js`
(the separate Insights → Executive Analytics drill-down page) — untouched,
still reachable exactly as before, and now also reachable directly from the
briefing (see the Launcher row below).

## Information architecture

**Before**: one flat, unlabeled 2-column grid of 8 widgets, in this order:
Hero → Attention → Recommendation → Snapshot → Story → Drivers → Vehicle
Flags → Launcher. No visual grouping beyond individual card boundaries; a
half-width Recommendation card sat visually level with Drivers/Vehicle
Flags despite being a decision surface, not a status readout.

**After**: a masthead plus four explicitly labeled attention-hierarchy
zones, in this order:

| Zone | Eyebrow | Answers | Contains |
|---|---|---|---|
| Masthead | *(none)* | What is happening? | Hero |
| NOW | Sekarang | What needs attention right now? | Attention |
| DECISIONS | Keputusan | What requires a decision? | Recommendation |
| SITUATION | Situasi Operasional | What's the current picture? | Snapshot, Story, Drivers, Vehicle Flags |
| OUTLOOK | Proyeksi | What should I expect next? | Outlook *(new)* |
| *(unlabeled)* | — | Where do I go deeper? | Launcher |

Zone banding is opt-in, additive infrastructure in the shared workspace
renderer (`workspace.zones`), consumed only by the `executive` workspace —
Request/Driver/Engineering workspaces are unaffected (verified: 0
regressions across all 3 in `workspace-foundation-check.mjs`).

## Capability map

| Current feature | New location | New presentation | Interaction | Data source | Preserved behavior |
|---|---|---|---|---|---|
| Hero (score, narrative, pulse stats) | Masthead | Unchanged — full-width hero, ring gauge, headline/body, 4-stat row | Unchanged | `ctx.models.exec`, `facts()` | 100% — zero code changes to `exec-hero` |
| Attention Center | NOW zone | Unchanged content; now the first labeled band directly under the masthead instead of one section among several | Unchanged (severity list, disclosure) | `facts()` cross-domain reads | 100% — zero code changes to `exec-attention` |
| Recommended Actions | DECISIONS zone | **Promoted**: half-width boxed `card` → full-width de-boxed `section`, alone in its own band | Unchanged (`.wsp-inbox` cards, disclosure, dismiss) | `ctx.recommendations` | 100% content/logic unchanged — only card chrome (span/variant) changed |
| Operational Snapshot | SITUATION zone | Unchanged (segmented Hari/Minggu/Bulan, 5-tile panels) **minus** the Insight sentence | Unchanged (ARIA tablist, keyboard nav, continuity) | `ctx.assignments/requests/engineeringEvents` | 100% except Insight sentence relocated (see Outlook row) |
| Operational Story | SITUATION zone | Unchanged (narrative timeline, context grouping) | Unchanged | `ctx.logs` + `ctx.engineeringEvents` | 100% — zero code changes to `exec-activity` |
| Drivers | SITUATION zone | Unchanged | Unchanged | `ctx.drivers`, `ctx.assignments` | 100% — zero code changes to `exec-drivers` |
| Vehicle Flags | SITUATION zone | Unchanged list, **new** click affordance per row | **Modified**: row is now a real deep link (was informational-only) | `ctx.vehicleFlags` (unchanged pipeline) | 100% of prior content; adds a new capability, removes nothing |
| — *(Insight sentence, formerly inside Snapshot)* | OUTLOOK zone (new `exec-outlook` widget) | One sentence, same as before | Unchanged | `topInsightLine(ctx)` — **identical function**, relocated call site | 100% — same computation, new location |
| — *(`ctx.recommendations.board.upcoming`, computed but never shown)* | OUTLOOK zone | New: up to 3 preventive/monitoring-tier vehicles, capped, honest empty state | New — no interaction (informational; each item already excluded from Attention because the engine itself marks it non-actionable) | `ctx.recommendations.board.upcoming` — **already computed**, previously unsurfaced | N/A (net-new visibility of existing certified data, nothing invented) |
| — *(no prior equivalent)* | OUTLOOK zone | New: "Trip Terjadwal Besok" metric tile | New — informational | `ctx.assignments` filtered to tomorrow's date, same filter shape as the existing `tripsToday` computation | N/A (net-new, zero new query) |
| Executive Launcher (9 destinations) | Unlabeled zone at the bottom (unchanged position) | Unchanged grid, **10th destination appended** | Unchanged (icon-over-label grid, native buttons) | Static catalogue, role-filtered | 100% of prior 9 + 1 new: "Analitik Eksekutif" → `navAnalyticsExecutive` (already-wired action, previously unreachable from Home) |

## Interaction model change

`exec-vehicle-flags` rows: **before** — informational only (`ctx.actions.openDetail`
only resolves assignment ids, a category error for a vehicle id, so the row
was deliberately left non-interactive). **After** — each row with a
resolvable vehicle opens the canonical Vehicle Detail Drawer
(`openVehicleDetailDrawer`, `js/components/vehicle-detail-drawer.js` — the
same drawer Vehicle Management already uses, same edit/archive/renew
actions via `vehicleDrawerHandlers()`). No new drawer implementation; a
correctly-typed second action (`ctx.actions.openVehicleDetail`) added
alongside the existing `openDetail`.

## Explicitly unchanged / out of scope

- `js/components/executive-dashboard.js` (Insights → Executive Analytics) —
  untouched, still reachable as before, now additionally reachable from the
  Launcher.
- Health Score engine, Recommendation Engine, Wellness Engine, Vehicle Core
  reminder pipeline — zero changes to any computation, only to what's
  displayed and where.
- Permission gating (`executive.dashboard.view`), role routing
  (`ROLE_TO_WORKSPACE`) — unchanged.
- Canonical icon system (`anIcon()`), canonical drawer (`js/components/drawer.js`
  + `vehicle-detail-drawer.js`), canonical motion tokens (`motion-profiles.js`
  `MACRO_STAGGER`/`MOTION_PROFILES`, extended with one new `outlook` beat,
  not replaced) — reused, not duplicated.
- Request / Driver / Engineering workspaces — zero behavioral change
  (verified via `workspace-foundation-check.mjs`, 0 regressions).
