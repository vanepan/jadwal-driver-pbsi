# Vehicle Core — Investigation & Roadmap

**Status:** Investigation only. No code was written, renamed, moved, or refactored to produce this document.
**Method:** Six parallel read-only audits (Store/Data Model, UI, Compliance/Maintenance/Health/Reminders, Intelligence Layer wiring, Export/Timeline/Version-History, Testing/UX) plus manual spot-verification of the highest-stakes claims against source. Every claim below is cited `file:line`. Where a claim could not be verified, it says so instead of guessing.
**Comparator:** Warehouse Core (`docs/WAREHOUSE_CORE_LTS_v1.29.11.md`), the most recent module to go through this same audit-first discipline — compared on *architecture quality*, not feature parity, per the brief.

---

## 1. Current Architecture

Vehicle is not one module — it's **four layers built at four different points in the project's history**, each added without rewriting the one below it:

```
┌─────────────────────────────────────────────────────────────────────┐
│ LAYER 4 — Prediction / Fleet Intelligence (v1.19.0–1.19.8)           │
│  vehicle-prediction-dashboard.js (887L, 13 sections)                 │
│  fleet-recommendation-engine.js · scenario-simulation (shared,       │
│  domain-generic — NOT vehicle-only)                                  │
│  vehicle-recommendation-panel.js / vehicle-simulation-panel.js       │
│  (thin presentation adapters mounted INSIDE the drawer)              │
├─────────────────────────────────────────────────────────────────────┤
│ LAYER 3 — Dispatch Intelligence (v1.16.4.11, request-time scoring)   │
│  vehicle-capacity-engine.js · vehicle-recommendation-engine.js       │
│  dispatch-scoring-engine.js · request-intelligence-service.js        │
│  consumed by: assignment-dispatch-hints.js (live), requests.js (live)│
├─────────────────────────────────────────────────────────────────────┤
│ LAYER 2 — Asset Intelligence (v1.18.0, "Manajemen Kendaraan" →       │
│  Enterprise Vehicle Asset Management)                                 │
│  vehicle-asset-service.js (health/compliance/maintenance derivation) │
│  vehicle-asset-config.js · vehicle-asset-analytics.js                │
│  maintenance-service.js / maintenance-config.js / maintenance-       │
│  analytics.js · compliance-config.js                                 │
│  vehicle-detail-drawer.js · fleet-dashboard.js                       │
├─────────────────────────────────────────────────────────────────────┤
│ LAYER 1 — Vehicle Store (v1.5.2, foundation)                         │
│  vehicles-store.js — single RTDB path `/vehicles`, CRUD, live sync   │
└─────────────────────────────────────────────────────────────────────┘
```

Each layer reuses the layer below it correctly (Layer 2 reads Layer 1's records; Layer 3 reuses Layer 2's `healthScore` *concept* but not its computation — see §4/§7; Layer 4 reuses Layer 3's capacity primitives and a domain-generic recommendation/simulation engine shared with Driver). **The layering is real, not accidental** — but Layer 3 and Layer 2 each independently own a notion of "vehicle health" that never talks to each other (§7, Finding A).

**Dependency map (who imports whom):**
`app.js` → `vehicles-store.js`, `vehicle-asset-service.js`, `vehicle-detail-drawer.js`, `fleet-dashboard.js`, `vehicle-prediction-dashboard.js` (dynamic import via `module-loader-registry.js`)
`vehicle-asset-service.js` → `maintenance-service.js`, `compliance-config.js`, `vehicle-asset-config.js` — no reverse dependency
`vehicle-detail-drawer.js` → `vehicle/vehicle-recommendation-panel.js`, `vehicle/vehicle-simulation-panel.js` → `js/recommendation/fleet-recommendation-engine.js`, `js/simulation/*` (shared, cross-domain)
`vehicle-recommendation-engine.js` / `dispatch-scoring-engine.js` → raw `vehicles-store.js` records directly (bypasses `vehicle-asset-service.js` entirely — this is *why* Finding A exists)
`vehicles-store.js` → Firebase only; zero upward imports (correctly a leaf/foundation module)

## 2. Current Folder Responsibilities

| Path | Responsibility | Layer |
|---|---|---|
| `js/vehicles-store.js` | Single source of truth: CRUD, RTDB sync, cache | 1 |
| `js/services/vehicle-asset-service.js` | Derives status/health/completeness from raw records | 2 |
| `js/config/vehicle-asset-config.js`, `js/config/compliance-config.js`, `js/config/maintenance-config.js` | Frozen taxonomies/weights (types, statuses, health weights, document types, intervals) | 2 |
| `js/services/maintenance-service.js`, `js/analytics/maintenance-analytics.js` | Maintenance lifecycle + fleet-wide maintenance KPIs | 2 |
| `js/components/vehicle-detail-drawer.js`, `js/components/fleet-dashboard.js` | Presentation: drawer, dashboard tiles | 2 |
| `js/services/vehicle-capacity-engine.js`, `vehicle-recommendation-engine.js`, `dispatch-scoring-engine.js`, `request-intelligence-service.js` | Request-time scoring (pure) | 3 |
| `js/components/assignment-dispatch-hints.js` | Only *live* UI consumer of Layer 3 | 3 |
| `js/components/vehicle-prediction-dashboard.js` | Prediction Service consumer, Prediksi tab | 4 |
| `js/vehicle/vehicle-recommendation-panel.js`, `vehicle-simulation-panel.js` | Presentation adapters over the shared domain-generic `fleet-recommendation-engine.js` / simulation engine | 4 |
| `js/exports/analytics/vehicle-template.js` + `model/vehicle-report-model.js` + `insights/vehicle-{highlights,contributors}.js` | Client-side report projection | Export |
| `functions/src/exports/analytics/report/reports/vehicle-report.js` | Server-side PDF render (Puppeteer) | Export |
| `js/components/vehicle-recommendation-card.js`, `js/components/request-intelligence-panel.js` | **Dead** — self-documented "NOT MOUNTED", zero call sites | — |

## 3. Current Data Model

Single RTDB path `vehicles` (`js/vehicles-store.js:12`), one child node per vehicle (`vhc_<slug>`). No separate paths for maintenance/compliance — both are arrays **embedded in the vehicle node**.

| Field | Type | Written by | Status |
|---|---|---|---|
| `id, name, plateNumber, capacity, color` | core | `createVehicle`/`updateVehicle` | live |
| `type` (`mobil\|motor\|ambulance`), `status` (`active\|maintenance\|inactive\|retired`), `active` | classification | `normalizeType`/`normalizeStatus` | live |
| `archived`, `archivedAt` | lifecycle | `archiveVehicle`/`restoreVehicle` | live |
| `brand, model, year, fuel, transmission, engineNumber, chassisNumber, owner, registrationRegion, odometer, acquisitionDate, acquisitionValue` | registration | `sanitizeAssetFields` (`vehicles-store.js:50-55`) | live |
| `stnkNumber, stnkExpiry, annualTaxDue, fiveYearTaxDue, taxStatus` | compliance mirror | passthrough + recomputed by `recomputeComplianceMirror` (`:572-591`) | live |
| `insuranceCompany, policyNumber, coverage, insuranceExpiry, insuranceStatus` | insurance | passthrough (flat, **not** a ledger) | live |
| `complianceHistory[]` | STNK/tax ledger | `addComplianceRecord` | live (v1.29.2) |
| `maintenanceRecords[]` | maintenance ledger | `addMaintenanceRecord` | live |
| `timeline[]` | reserved general lifecycle log | passthrough only | **future-ready, unused** |
| `taxHistory[]` | legacy | accepted by `sanitizeAssetFields` (`:556-559`) | **dead — no writer** |
| `healthScore` | dispatch-time health | **nobody** | **dead — see §7 Finding A** |

**Seed rule:** `DEFAULT_VEHICLES` seeds `/vehicles` only if empty (`seedVehiclesIfEmpty`, `:127-148`); Firebase is authoritative thereafter — never re-applied.

**Legacy map fully retired:** the `VEHICLES` object in `js/drivers.js:22-27` (once the pre-v1.5.2 source of truth) is now demoted to a last-resort color fallback only (`getVehicleColor()`, `drivers.js:98-99`), confirmed by `js/config.js:1859` (v1.6.2) and zero other repo-wide usages. A stale prior memory calling this migration "deferred" is **outdated** — it completed in June.

## 4. Current Business Rules

| Subsystem | Exists? | Completeness | Reusable? | Needs redesign? | Missing entirely? |
|---|---|---|---|---|---|
| **Compliance** (`compliance-config.js`, `addComplianceRecord`) | Yes, real | Small (42L) but fully wired for STNK + annual/5-yr tax | Yes — explicitly designed open-ended (`compliance-config.js:13-15`) so insurance/registration can reuse `complianceHistory` without a schema change | No dedicated test file (only incidental coverage inside the DOM check) | Insurance renewal is still a flat field, not a ledger like STNK/tax — asymmetric |
| **Maintenance** (`maintenance-service.js`, `maintenance-config.js`, `maintenance-analytics.js`) | Yes, real, computed end-to-end | Full lifecycle: validate → normalize → timeline → summary → health | Yes, pure/testable | Yes — `computeMaintenanceHealth`/`deriveMaintenanceSummary` have **zero value-level test assertions** (41-case suite is 100% string-presence checks, `maintenance-intelligence-check.mjs:63`) | Due-date projection: `recommendedIntervalKm/Days` are computed per record but never consumed to produce a next-due date anywhere in the repo |
| **Vehicle Health Score (real)** (`computeVehicleHealth`, `vehicle-asset-service.js:124-162`) | Yes | Complete: legal 40% / maintenance 35% / operational 15% / documents 10% (`vehicle-asset-config.js:80-85`), feeds drawer + fleet dashboard | Yes | No | No |
| **Vehicle Health Score (dispatch)** (`vehicle.healthScore`) | Field referenced by 2 live engines | **Never computed, never written** — silently defaults to 100 for every vehicle, always | N/A | **Yes — highest-priority fix candidate**, see §7 Finding A | This *is* the missing piece |
| **Reminders / Notifications** | Only passive UI badges (due_soon/expired pills) | No scheduled delivery of any kind | The classification logic (`deriveDocStatus`) could seed one | Missing entirely | Yes — `functions/src/scheduled/README.md:1-9` is a placeholder confirming this was deferred; `reminderStatus/reminderSentDate/reminderDismissedDate` are null-only reserved fields (`maintenance-service.js:218-223`) with no writer anywhere |

## 5. Current Refresh Flow

Single chokepoint, same discipline as Warehouse's `refreshCatalog()`:

```
Firebase /vehicles  →  subscribeFirebasePath (init once, vehicles-store.js:165-170)
                    →  refreshVehiclesCache()  (:121-125, replaces array, fires listeners)
                    →  registerVehiclesChangeListener subscribers re-render
```

Consumers (`requests.js`, `drivers.js`, `modal.js`, `reimbursement.js`, sensors, analytics) all read live via `getVehicles()`/`getActiveVehicles()` or subscribe — **no independent per-screen lazy caches were found** (a cleaner starting position than Warehouse had before its LTS fix, which had to close exactly this kind of gap).

## 6. Current Cache Ownership

`vehicles-store.js` owns the only cache: a module-scope `vehicles` array + `vehiclesLoaded`/`vehiclesSubscribed` flags (`:22-25`). But ownership of *when the cache updates* is inconsistent between two writer classes:

- **Identity/status writers** (`createVehicle`, `updateVehicle`, `deactivateVehicle`, `reactivateVehicle`, `archiveVehicle`, `restoreVehicle`): only call `refreshVehiclesCache` in the offline branch; when Firebase is configured, they rely entirely on the async RTDB echo to eventually re-fire listeners.
- **Ledger writers** (`addMaintenanceRecord`, `updateMaintenanceRecord`, `deleteMaintenanceRecord`, `addComplianceRecord`): mutate the cached object **in place** before awaiting the Firebase write (verified: `vehicles-store.js:462` `existing.maintenanceRecords.push(newRecord)`, then `await updateFirebaseData(...)` at `:475` with no `refreshVehiclesCache`/listener call in that branch either). So `getVehicles()` reflects the change immediately, but `registerVehiclesChangeListener` subscribers are not notified until the RTDB echo lands.

This split is self-documented for `addComplianceRecord` only (`:608-610`) — not for the general pattern, and not flagged anywhere as a cross-writer inconsistency. It is real but narrow: any UI that re-renders solely off the *listener* (not a manual re-fetch after an add-record action) will show stale data for the gap between the synchronous mutation and the echo.

## 7. Current Technical Debt

**Finding A — dead `healthScore` field feeding two live engines (highest priority).** `vehicle-recommendation-engine.js:161-171` and `dispatch-scoring-engine.js:96` both read `vehicle.healthScore`, defaulting to 100 when absent. `vehicles-store.js` never writes this field — confirmed by a repo-wide grep (only unrelated `healthScore` usages exist: petty-cash analytics, a local UI-only `_healthScore` display var in `app.js:8928`, and JSDoc). The *real*, computed asset health (`computeVehicleHealth().overall`, weighted legal/maintenance/operational/documents) exists one layer over in `vehicle-asset-service.js` and is never passed into the recommendation/dispatch path. Result: every "health" sub-score in vehicle recommendation and dispatch scoring is silently the same constant (100) for every vehicle in the fleet, today. This is explicitly acknowledged as deferred in `js/config.js:1106-1114` ("no maintenance/inspection scoring this release") — so it's known debt, not a hidden regression, but it has never been closed across 3 subsequent minor-version chains.

**Finding B — duplicated stat tiles.** `applyVehicleView()` builds "Total Kendaraan" (`app.js:8162-8187`, raw `getVehicles()` filter) directly above `renderFleetDashboard()`'s "Armada" tile (`fleet-dashboard.js:99-126`, sourced from `computeFleetAssetModel().dashboard.totalAssets`) — two independently-computed totals stacked on the same page.

**Finding C — cache notify/mutate split** (§6) — narrow but real; no test currently exercises the listener-staleness window.

**Finding D — `taxHistory[]` dead field** — accepted by the sanitizer (`vehicles-store.js:556-559`) but no UI path writes it; superseded by `complianceHistory` since v1.29.2 but never removed.

**Finding E — two orphaned components.** `vehicle-recommendation-card.js` and `request-intelligence-panel.js` are both self-documented "NOT MOUNTED" and confirmed to have zero call sites outside their own files — both explicitly superseded (by `assignment-dispatch-hints.js` and the admin approval modal respectively), per `js/config.js:1109` and `:1021`.

**Finding F — undocumented VERSION_HISTORY gap.** The array jumps `1.11.3.3` (06-14) → `1.12.2.1` (06-18) with no entry for the release that actually shipped the dedicated Vehicle Analytics Export pipeline (`vehicle-template.js`, `vehicle-report-model.js`, server `vehicle-report.js`, registry entry) per git log (`345f5ee`, `96d6c55`). Minor documentation debt, not a functional bug.

**Finding G — no unified Vehicle Timeline engine.** Confirmed by the codebase's *own* roadmap note: `js/config.js:136-138` (v1.29.6) states the new Gudang `activity-engine.js` was deliberately built domain-ignorant "so a future Vehicle Timeline or Compliance Timeline (brief, Future Ready) reuses this EXACT file, unmodified." Today, `vehicle-detail-drawer.js` instead renders three separate ad-hoc array→timeline mappings (tax history, maintenance timeline, general history) rather than one typed-event engine (contrast with Engineering's `workReportTimelineEvent()` typed `TIMELINE_EVENT` pattern).

## 8. Current Missing Capabilities

- **Automated reminders** for STNK/tax/insurance/maintenance due dates — no Cloud Function, push, or Telegram trigger exists (§4). Only assignment/schedule reminders are live in `functions/src/reminders/`.
- **Maintenance due-date projection** — `recommendedIntervalKm/Days` computed but orphaned.
- **`healthScore` wiring** into dispatch/recommendation (Finding A).
- **Unified Vehicle Timeline engine** (Finding G) — the reuse target already exists (`activity-engine.js`) and is domain-ignorant by design.
- **Insurance history ledger** (parity with STNK/tax's `complianceHistory`).
- **Sort control / table view / pagination** on the Inventaris grid — cards-only, no sort state exists (unlike the unrelated Recommendation Accuracy vehicle table, which has its own sort/search).
- **Dedicated compliance test suite** — only incidental coverage today.
- **Value-level maintenance scoring tests** — current suite is wiring/presence-only.
- **Tablet-breakpoint and mobile-dark screenshots** — desktop-light/dark + mobile-light exist; no tablet or mobile-dark evidence (this gap is platform-wide, not vehicle-specific — Warehouse's own screenshot set has the same hole).

## 9. Current UX Review

- **Desktop:** cards (`.vm-grid`, `platform.css:6005-6150`) render well; two stacked "total vehicles" tiles is a real visible redundancy (Finding B).
- **Tablet/mobile:** `.vm-grid` has explicit breakpoints (2-col ≤720px, 1-col ≤520px, tighter gap ≤380px). The add/edit form's `.v2-vehicle-*` classes (color picker, avatar, capacity chip) have **no dedicated media queries** — they inherit the generic `.form-grid`/`.modal-box` rules only, unverified whether that's sufficient on small screens.
- **Accessibility:** genuinely solid — `.vm-asset:focus-visible` (platform.css:6035-6038), `role="dialog"`/`aria-modal`/`aria-label`/Escape/Tab-trap/focus-restoration all present in the shared `executive-drawer.js` that the vehicle drawer delegates to, `role="button"` + `aria-label` on cards.
- **Dark mode:** no hardcoded-hex bug found (the documented "--white trap" class of bug does **not** reproduce here — vehicle CSS uses `var(--token, #fallback)` correctly, and `vehicle-asset-dom-check.mjs` runtime-asserts "no hard-coded white").
- **Reduced motion:** guarded (`vehicle-prediction-dashboard.js:242-245`).
- **Consistency:** `vehicle-management-presentation-check.mjs` is a static contract enforcing Executive UI Kit reuse (KPI cards, header/toolbar, card, drawer) and banning emoji/hardcoded `#fff`/`#000` — this is the same discipline Warehouse's presentation layer follows.
- **Pain point:** no sort/table/pagination option on a page that can in principle grow to fleet-scale.

## 10. Current Testing Coverage

| Suite | Type | Cases | Covers |
|---|---|---|---|
| `vehicle-recommendation-check.mjs` | Pure Node | 63 | Capacity + recommendation scoring, ranking, weights |
| `vehicle-asset-check.mjs` | Pure Node | 58 | Type/status resolution, eligibility, health, tax/STNK/insurance status, doc completeness, timeline, dashboard |
| `vehicle-asset-dom-check.mjs` | Puppeteer | 23 | Dashboard + drawer render, STNK renewal, refresh-in-place, dark-mode safety |
| `vehicle-management-presentation-check.mjs` | Static source-text | 45 | Executive UI Kit contract, emoji/hex bans |

**Total: 189 assertions, 4 suites.** No `smoke-boot.mjs` or `package.json` orchestrator wires any of these together — each is run standalone, which is also true platform-wide (Warehouse's 21 suites have the same gap).

**Maturity vs. Warehouse:** Warehouse has 21 regression suites across ~60 files (1 suite per ~2.9 files, per its LTS audit). Vehicle has 4 suites across ~17 vehicle-named files plus `fleet-dashboard.js` (1 suite per ~4-4.5 files). **Real, not cosmetic — Vehicle's test suite is meaningfully thinner**, and its thinnest point is exactly where it matters most: the maintenance health-scoring formula has zero value-level assertions.

## 11. Current Reusable Infrastructure

Vehicle is a strong *consumer* of shared platform infrastructure, not a silo:

- **Executive UI Kit** (KPI cards, header/toolbar, drawer primitives) — same kit Driver/Warehouse/Engineering use.
- **`js/engines/prediction-engine.js`** — Vehicle is the SECOND certified consumer (after Driver); zero duplicate prediction logic.
- **`js/recommendation/fleet-recommendation-engine.js`** and simulation engine — genuinely domain-generic; Vehicle's Layer 4 panels are thin adapters, not a second implementation.
- **`js/services/driver-capacity-engine.js`** — `vehicle-capacity-engine.js` reuses its utilization/status-band math rather than redefining thresholds.
- **`compliance-config.js`** — deliberately open-ended (`:13-15`) for future document types via the same `complianceHistory` shape.
- **`js/gudang/activity-engine.js`** (Warehouse) — explicitly built domain-ignorant so a future Vehicle Timeline can reuse it unmodified (§7 Finding G) — this is a ready-made extension point, not aspirational.

## 12. Risk Assessment

| Risk | Severity | Why |
|---|---|---|
| Recommendation/dispatch scoring silently ignores real vehicle health | Medium | Not a crash risk — every vehicle just gets the same neutral 100 sub-score, so ranking degrades gracefully to the other 3 factors rather than breaking. But it means "health" in the marketing sense of Layer 3/4's picks is currently fiction. |
| Listener-staleness window after maintenance/compliance writes | Low | `getVehicles()` (direct read) is always correct; only pure-listener-driven re-renders can lag until the RTDB echo — narrow blast radius, no data loss. |
| No automated compliance/maintenance reminders | Medium (operational, not technical) | STNK/tax/maintenance lapses currently depend on someone opening the drawer to notice a badge — this is the single biggest gap between "system that tracks compliance" and "system that prevents a lapse." |
| Thin test coverage on the maintenance scoring formula | Low-Medium | A future refactor of `computeMaintenanceHealth` could silently change fleet health numbers with all 41 existing tests still green. |
| Duplicate stat tiles | Cosmetic | No functional risk, just a credibility/polish issue on the module's own overview strip. |

Nothing found rises to "redesign the architecture" — every layer is independently sound; the debt is at the *seams* between layers (Finding A being the clearest example), which is exactly the kind of thing a phased, incremental roadmap is suited to closing.

## 13. Future Roadmap

Per the brief: **no phase below starts with a rewrite.** Each is small, isolated, backward-compatible, and independently testable — same discipline as the Warehouse LTS → Digitization Era transition. Ordered by leverage (cheapest, highest-confidence fixes first), not by feature ambition.

**Phase 1 — Close Finding A (wire real health into dispatch scoring). ✅ DONE — v1.29.12, see §14.**
Shipped as `vehicle-recommendation-engine.js`'s health sub-score now reusing `normalizeVehicleAsset(vehicle, now).health.overall` (NOT the originally-proposed `computeVehicleHealth(vehicle).overall` — implementation found that call signature doesn't accept a raw vehicle record; see §14 Root Cause) instead of the never-written `vehicle.healthScore`. Pure function change, no schema migration, no UI change. Full report, exact diffs, and regression results: §14.

**Phase 2 — Fix the cache notify/mutate split (Finding C). ✅ DONE — v1.29.13, see §15.**
Shipped as one reused private helper, `applyVehiclesPatch()`, called by all 12 mutating exports AFTER their Firebase write is confirmed. Investigation found the real inconsistency broader than originally framed — 8 writers relied on the echo for BOTH cache and listeners (not just listeners), not just the 4 ledger writers described in §6/Finding C. Full report, exact diagram, and regression results: §15.

**Phase 3 — Dead-code cleanup (Findings D, E).**
Remove `taxHistory` from `sanitizeAssetFields` (superseded by `complianceHistory`) and delete `vehicle-recommendation-card.js` + `request-intelligence-panel.js` (both self-documented dead, zero call sites) — mirrors exactly what the Warehouse LTS audit did with its 2 dead exports.

**Phase 4 — De-duplicate stat tiles (Finding B).**
Pick one source of truth for "total vehicles" (`computeFleetAssetModel().dashboard.totalAssets` is the more complete one, already used by the dashboard) and have `applyVehicleView()`'s overview strip read it instead of recomputing independently.

**Phase 5 — Insurance ledger parity.**
Extend `complianceHistory` (already schema-flexible per its own design comment) to cover insurance renewals the same way STNK/tax already do, retiring the flat `insuranceExpiry` field in favor of "latest entry of type `insurance`" — same pattern `recomputeComplianceMirror` already implements for tax types.

**Phase 6 — Maintenance due-date projection.**
Consume the already-computed `recommendedIntervalKm/Days` (currently stored but unread) to derive a `nextDueDate`/`nextDueOdometer` per vehicle, surfaced as a new drawer field and dashboard signal. Still no scheduled delivery — just makes the existing computed data visible where it's dead today.

**Phase 7 — Vehicle reminder engine (closes the biggest operational gap, §12).**
Only after Phase 6 gives a real due-date to alert on: extend `functions/src/scheduled/` (already a placeholder folder, per its own README) with a Cloud Scheduler job for STNK/tax/insurance/maintenance thresholds, reusing the existing `deriveDocStatus` classification and the notification channels already wired for assignment reminders. This is the first phase that touches the backend/Functions layer — sequence it last so the due-date data it depends on (Phase 6) already exists and is tested.

**Phase 8 — Unified Vehicle Timeline (closes Finding G).**
Adopt `js/gudang/activity-engine.js` for vehicle events, exactly as its own v1.29.6 changelog entry anticipates — replacing the three ad-hoc drawer timeline mappings with one typed-event source. Do this only after Phases 1–4 land, since the drawer will already have been touched by Phase 3's cleanup.

**Phase 9 — Test-suite hardening.**
Add value-level assertions to `maintenance-intelligence-check.mjs` (today 100% string-presence) and a dedicated `compliance-check.mjs`. This can run in parallel with any of the phases above — it's the one item with zero product-behavior risk.

**Deliberately out of scope for this roadmap** (raised, not resolved, by this investigation): sort/table view for the Inventaris grid, tablet/mobile-dark screenshot coverage, and a `package.json` test-runner script to unify all `*-check.mjs` suites — all real but platform-wide concerns, not Vehicle-specific, and better addressed once (not once per module).

---

## 14. Phase 1 Implementation Report — Real Vehicle Health Integration (v1.29.12)

**Scope discipline:** exactly one behavioral file touched (`js/services/vehicle-recommendation-engine.js`), plus its test suite and the version-history entry required by this repo's convention. Vehicle Store, Firebase schema, Vehicle Drawer, Vehicle Dashboard UI, Compliance, Maintenance, the Prediction Engine, and every recommendation/dispatch *algorithm* (as opposed to the health sub-score's *data source*) are unmodified — verified by diff, not just by intent.

### Pre-implementation investigation (what changed the plan)

The brief's suggested one-liner — `computeVehicleHealth(vehicle).overall` — turned out to be **wrong as literally stated**, and tracing this before touching code is what caught it:

- `computeVehicleHealth(parts)` (`vehicle-asset-service.js:124`) destructures `{ status, stnk, tax, insurance, documents, maintenance }` — a **pre-derived parts object**, not a raw vehicle record. Calling it directly with a raw vehicle would silently misfire: `documents` and `maintenance` would be `undefined`, and `computeDocumentCompleteness`'s absence-handling (`documents ? documents.completeness : 0`) would inject a hardcoded **0** into the weighted average for every vehicle rather than correctly excluding the "no data" case — a subtle, wrong-in-a-different-way bug, not the right fix.
- The correct reuse point is `normalizeVehicleAsset(vehicle, now)` (`vehicle-asset-service.js:265`), which already assembles those parts correctly (via `resolveVehicleStatus`, `deriveDocStatus`, `deriveTaxStatus`, `computeDocumentCompleteness`, `computeMaintenanceHealth`) and returns `.health` = the exact `computeVehicleHealth()` result. This is what the fix calls — zero formula duplication, one existing, independently-tested function reused as-is.
- **Consumer investigation** (repo-wide `\.healthScore\b` grep): `vehicle-recommendation-engine.js:168` (inside `calculateHealthScore`) is the **only** place in the entire codebase that reads `.healthScore` as a property access. `dispatch-scoring-engine.js:96` and `request-intelligence-service.js:123` only *mention* `healthScore?` in JSDoc — both pass their vehicle arrays through to `recommendVehicle` unchanged, so fixing `calculateHealthScore` alone closes the gap for both without touching either file. `js/recommendation/fleet-recommendation-engine.js` (the separate, prediction-time recommendation layer used by the Prediksi tab) has **zero** `healthScore`/`.health` references — confirmed not a third consumer, not affected by this change.
- **Import-cycle check**: `vehicle-asset-service.js` → `dispatch-policy-engine.js` → `dispatch-policy-config.js` only; `vehicle-asset-analytics.js` and `maintenance-analytics.js` have no path back to `vehicle-recommendation-engine.js`. Importing `normalizeVehicleAsset` into the recommendation engine is a new but acyclic Layer-3→Layer-2 dependency.
- **Hidden blast-radius check**: every vehicle fixture in every test script that calls `recommendVehicle`/`recommendDispatch`/`generateDispatchRecommendation` anywhere in the repo (`vehicle-recommendation-check.mjs`, `dispatch-scoring-check.mjs`, `request-intelligence-check.mjs`, `decision-replay-check.mjs`, `decision-replay-dom-check.mjs`, `approval-panel-dom-check.mjs`) sets `healthScore` explicitly — confirmed by grep before writing any code. Only one assertion in the whole suite (`calculateHealthScore({}) === 100`) relied on the *absence* of the field, which is exactly the behavior being fixed.

### Root cause

`vehicle.healthScore` was designed as a forward-reference in v1.16.4.11-alpha.3 (Vehicle Recommendation Engine) for a health signal that, at the time, didn't exist yet — explicitly documented as deferred in `js/config.js` ("no maintenance/inspection scoring this release"). The real signal was later built in v1.18.0 (Vehicle Asset Intelligence) as `computeVehicleHealth()`/`normalizeVehicleAsset()`, but nothing ever connected the two — the dispatch/recommendation layer kept reading the original placeholder field, which `vehicles-store.js` has never written. Three releases (v1.18.0 → v1.29.11) shipped real health data one layer over without anyone wiring it into dispatch scoring.

### Files changed

| File | Change |
|---|---|
| `js/services/vehicle-recommendation-engine.js` | `calculateHealthScore(vehicleOrScore, now)`: preserves the explicit-override branch unchanged; when `.healthScore` is absent, now calls `normalizeVehicleAsset(vehicleOrScore, now).health.overall` instead of defaulting to 100. `recommendVehicle()`'s one call site now threads its resolved `now` through. New import: `normalizeVehicleAsset` from `./vehicle-asset-service.js`. JSDoc updated at both the file header and the function. |
| `scripts/vehicle-recommendation-check.mjs` | One pre-existing assertion updated (`calculateHealthScore({}) === 100` → `=== 60`, with inline rationale). Nine new value-level assertions added (3 realistic health tiers + an end-to-end `recommendVehicle` comparison). |
| `js/config.js` | `APP_VERSION` 1.29.11 → 1.29.12, `RELEASE_NAME`, new `VERSION_HISTORY` entry. |
| `service-worker.js`, `version.json`, `index.html` | Mechanically re-stamped by `scripts/sync-version.mjs` (cache-bust only, no logic). |

No other file was opened for editing.

### Health flow diagram

```
BEFORE (v1.29.11 and earlier):
  vehicle record (vehicles-store.js, no `healthScore` field ever written)
        │
        ▼
  calculateHealthScore(vehicle) ──► vehicle.healthScore is undefined ──► hardcoded 100, ALWAYS
        │
        ▼
  recommendVehicle() / recommendDispatch()  (health sub-score never discriminates)

AFTER (v1.29.12):
  vehicle record (vehicles-store.js)
        │
        ├──► calculateHealthScore(vehicle, now)
        │         │
        │         ├─ vehicle.healthScore explicit & finite? ──► use it, clamp/round  (UNCHANGED — test/override path)
        │         │
        │         └─ absent (every real store record) ──► normalizeVehicleAsset(vehicle, now).health.overall
        │                                                        │
        │                                                        ▼
        │                                        computeVehicleHealth({status, stnk, tax,
        │                                          insurance, documents, maintenance})
        │                                        = legal·0.40 + maintenance·0.35 +
        │                                          operational·0.15 + documents·0.10
        │                                          (v1.18.1 weights, re-normalized over
        │                                          present components — UNCHANGED, this
        │                                          release adds a caller, not a formula)
        ▼
  recommendVehicle() / recommendDispatch()  (health sub-score now reflects the vehicle's
                                              real legal/maintenance/operational/document state)
```

### Testing summary

`vehicle-recommendation-check.mjs`: **71/71 passed** (63 pre-existing minus 1 replaced plus 9 new). New cases, values obtained by running the real engine against each fixture (not hand-derived, to avoid exactly the kind of arithmetic error this investigation was trying to prevent):

| Fixture | Profile | Computed health |
|---|---|---|
| bare `{}` | no status, no documents, no maintenance data | 60 (was hardcoded 100) |
| "Sehat" (A) | active, valid STNK/tax/insurance, full doc fields, 1 recent completed preventive maintenance | 86 |
| "Sedang" (B) | active, tax due-soon, partial doc fields, no maintenance history | 65 |
| "Rusak" (C) | status=maintenance, expired STNK, one unresolved in-progress repair | 23 |

End-to-end: two vehicles identical in every scoring dimension except health (same capacity, both free, both LOW utilization) — pre-fix these would have tied at the same score (both defaulting to health=100); post-fix `recommendVehicle()` scores them 96 vs. 89 and correctly ranks the healthier one #1.

### Regression summary

Every suite that could plausibly touch `vehicle-recommendation-engine.js` or a vehicle fixture, run after the fix:

| Suite | Result |
|---|---|
| `vehicle-recommendation-check.mjs` | 71/71 |
| `vehicle-asset-check.mjs` (the reused formula's own suite — unmodified) | 58/58 |
| `dispatch-scoring-check.mjs` | 33/33 |
| `request-intelligence-check.mjs` | 53/53 |
| `capacity-hardening-check.mjs` | 38/38 |
| `decision-replay-check.mjs` | 54/54 |
| `decision-replay-dom-check.mjs` (Puppeteer) | 28/28 |
| `vehicle-asset-dom-check.mjs` (Puppeteer — Fleet Dashboard + Vehicle Drawer) | 30/30 |
| `vehicle-management-presentation-check.mjs` | 47/47 |
| `approval-panel-dom-check.mjs` (Puppeteer) | 23/23 |
| `policy-engine-dom-check.mjs` (Puppeteer) | 14/14 |
| `smoke-boot.mjs` | 0 fatal errors, PASS |

**Zero regressions.** Everything green.

### Performance impact

One additional `normalizeVehicleAsset()` call per vehicle per recommendation pass (fleet sizes in this deployment are single- to low-double-digit, per `DEFAULT_VEHICLES`/production usage) — immaterial. No caching was added, per the brief's explicit "do NOT cache prematurely" instruction; if this ever becomes measurable at fleet scale, memoizing `normalizeVehicleAsset` per `(vehicleId, now-bucket)` within a single recommendation pass would be the natural, still-non-premature next step — not attempted here since there's no evidence it's needed.

### Future extension points

- **Phase 2–9 of §13 are unaffected and still open** — this closes Finding A only.
- The same "explicit override, else compute" pattern used here is directly reusable if a future phase wants an admin-settable health override (e.g., "flag this vehicle as unsafe regardless of computed score") — the seam already exists and is tested.
- Once Phase 6 (§13, maintenance due-date projection) ships, `computeVehicleHealth`'s maintenance sub-score will have a `nextDueDate` signal available to it, which would make the health score (and therefore this fix's downstream ranking) more forward-looking — no change needed here to benefit from that later.

---

## 15. Phase 2 Implementation Report — Refresh Consistency (v1.29.13)

**Scope discipline:** one behavioral file touched (`js/vehicles-store.js`), plus one new test suite and its supporting test-only infrastructure, plus the version-history entry. Vehicle Dashboard, Vehicle Drawer, Recommendation Engine, Dispatch Engine, Prediction Engine, Compliance logic, Maintenance logic, Firebase schema, and Vehicle UI are unmodified — verified by diff and by a full regression sweep, not just by intent. No event bus, no state manager, no new coordinator, no DI parameter added to any exported function.

### Pre-implementation investigation (what changed the plan)

Tracing all 12 mutating exports in `vehicles-store.js` found the inconsistency **broader** than the brief's own background section described, which is exactly the kind of thing the brief's "investigate first" instruction — and its explicit permission to deviate — exists to catch:

- The brief's framing: *"Identity/status writers rely on the Firebase realtime echo. Ledger writers mutate the in-memory object immediately before awaiting Firebase... direct readers receive updated data immediately, while listener-based consumers may wait until the RTDB echo arrives."* This describes the ledger writers' behavior correctly, but generalizes it as if it applied to every writer.
- **What tracing every writer actually found:**
  - **Group A — identity/status/lifecycle writers** (`createVehicle`, `updateVehicle`, `deactivateVehicle`, `reactivateVehicle`, `archiveVehicle`, `restoreVehicle`, `deleteVehicle`, `updateVehicleOdometer`): in the Firebase-configured (i.e. real, production) branch, none of these touched the local `vehicles` array or fired listeners at all — they only called `await updateFirebaseData(...)`/`storeFirebaseData(...)` and returned. Both `getVehicles()` reads AND listener-driven re-renders were stale until the echo landed — not just listeners.
  - **Group B — ledger writers** (`addMaintenanceRecord`, `updateMaintenanceRecord`, `deleteMaintenanceRecord`, `addComplianceRecord`): mutated the live cached object **in place** (`existing.maintenanceRecords.push(...)`, `Object.assign(existing, ...)`) so `getVehicles()` looked correct, but never called `refreshVehiclesCache` in the online branch, so listener subscribers still lagged — this half matches the brief's description.
  - So it's two distinct bugs with opposite symptoms, not one bug affecting different writer classes differently as originally framed. This is documented per the brief's own explicit permission clause rather than silently "forcing the implementation to match the prompt."
- **Testability investigation — a harder blocker than expected.** `vehicles-store.js` imports `js/firebase.js`, which imports the real Firebase modular SDK from `https://www.gstatic.com/firebasejs/10.12.5/...` at module scope. Empirically confirmed (safely, before writing any test): Node's default ESM loader rejects `https:` specifiers outright — `ERR_UNSUPPORTED_ESM_URL_SCHEME`, zero network I/O attempted — so this file could not previously be `import`ed by a plain `node script.mjs` at all. Even if it could be, `isFirebaseConfigured()` is a hardcoded-true check in this app (the config object's 4 required fields are always present as literals), so any successful write would target the REAL PRODUCTION database — confirmed unacceptable per the `firebase-prod-in-local-testing` project convention. A dependency-injection refactor (the usual escape hatch elsewhere in this codebase, e.g. `dispatch-intelligence-persistence.js`) was rejected: it would change every writer's exported signature, directly violating this phase's own "Preserve Store API, Function signatures" backward-compatibility requirement.
- **Resolution:** Node 20.6+'s module-customization-hooks API (`node:module`'s `register()`, confirmed available on the Node 24.16.0 in this environment) can redirect a specific import specifier to a local file without touching the importing code at all. A minimal loader (`scripts/lib/firebase-stubs/loader.mjs`) redirects exactly the 5 gstatic.com specifiers `js/firebase.js` imports to local in-memory stub modules — `js/firebase.js` and `js/vehicles-store.js` load and execute completely unmodified; only the external SDK boundary is faked, entirely offline, entirely in-process. Empirically verified with an isolated probe before building the real stubs.
- **Timing-model correction caught during harness validation.** The first version of the fake database's realtime "echo" fired via a microtask (`Promise.resolve().then(...)`). Probing the CURRENT (pre-fix) code against it showed `getVehicles()` already reflecting a just-created vehicle immediately — which would have made the pre-fix bug invisible to the test, because a microtask-only echo always "wins the race" against an `await`ed write before the caller's continuation runs. Fixed by scheduling the echo on a macrotask (`setTimeout(..., 0)`) instead — matching a real Firebase round trip's actual behavior (the write-ack and the realtime listener notification are separate network events, not guaranteed to arrive in the same microtask flush). Re-verified against the pre-fix code: the harness then correctly caught the bug (see Testing Summary).

### Root cause

Every writer needed a "commit this change and tell everyone" step, but that step was implemented ad hoc, once per writer, 12 times, over multiple releases (v1.5.2 → v1.29.2) as the store grew from a simple identity CRUD (v1.5.2) to also owning maintenance (v1.18.1) and compliance (v1.29.2) ledgers. Each addition copied the nearest existing writer's shape rather than factoring out a shared step, and the two "eras" (identity-era writers vs. ledger-era writers) ended up with different partial implementations of that shared step — neither complete.

### Refresh flow diagram

```
BEFORE (v1.29.12 and earlier) — two different bugs, by writer group:

  Group A (create/update/deactivate/reactivate/archive/restore/delete/odometer):
    caller → await writer(...) → await updateFirebaseData/storeFirebaseData(...)
                                        │
                                        ▼ (writer returns; NOTHING else happens here)
    ...separately, asynchronously, whenever the echo lands...
    Firebase realtime echo → subscribeFirebasePath callback → refreshVehiclesCache()
                                        │
                                        ▼
                    NOW getVehicles() is fresh AND listeners fire (but not before)

  Group B (addMaintenanceRecord/updateMaintenanceRecord/deleteMaintenanceRecord/addComplianceRecord):
    caller → await writer(...) → mutate cached object IN PLACE (pre-confirmation)
                                → await updateFirebaseData(...)
                                        │
                                        ▼ (writer returns; getVehicles() already fresh,
                                           but listeners were NEVER told)
    ...separately, whenever the echo lands...
    Firebase realtime echo → subscribeFirebasePath callback → refreshVehiclesCache()
                                        │
                                        ▼
                            NOW listeners finally fire

AFTER (v1.29.13) — one path, every writer:

  caller → await writer(...) → validate
                              → compute next state IMMUTABLY (no shared-object mutation)
                              → if Firebase configured: await the write (CONFIRMED)
                              → applyVehiclesPatch(mutate)
                                    │
                                    ▼
                          refreshVehiclesCache(mapFirebaseVehicles(nextMap))
                                    │
                                    ▼
              getVehicles() fresh AND every listener fires — BEFORE writer() returns,
              for every one of the 12 writers, every time.

  (The Firebase realtime echo still lands afterward and calls refreshVehiclesCache
   again — same as before, now simply redundant-but-harmless for every writer,
   not the ONLY path for 8 of them. Verified idempotent: no duplication, no loss.)
```

### Files changed

| File | Change |
|---|---|
| `js/vehicles-store.js` | New private helper `applyVehiclesPatch(mutate)` (builds a `{id:vehicle}` map from the current cache, lets the caller mutate it, pushes the result through the existing `refreshVehiclesCache`). All 12 mutating exports rewired to call it exactly once, unconditionally, after their `if (isFirebaseConfigured()) { await ... }` block. The 4 ledger writers additionally stopped mutating the shared cached object in place (`existing.maintenanceRecords.push`, `existing.complianceHistory.push`, `Object.assign(existing, ...)`) in favor of building the next array/object immutably first. |
| `scripts/vehicles-store-check.mjs` | New — 42 cases, the first-ever direct test of this file. |
| `scripts/lib/firebase-stubs/` | New, test-only: `loader.mjs` (the module-customization-hook), `firebase-database.js` (the one stub with real in-memory behavior), `firebase-app.js`/`firebase-auth.js`/`firebase-functions.js`/`firebase-storage.js` (no-op stubs, exist only so `js/firebase.js`'s top-level imports don't throw), `README.md`. |
| `js/config.js` | `APP_VERSION` 1.29.12 → 1.29.13, `RELEASE_NAME`, new `VERSION_HISTORY` entry. |
| `service-worker.js`, `version.json`, `index.html` | Mechanically re-stamped by `scripts/sync-version.mjs` (cache-bust only). |

No other file was opened for editing — `js/components/vehicle-detail-drawer.js`, `js/components/fleet-dashboard.js`, `js/services/vehicle-recommendation-engine.js`, `js/services/vehicle-asset-service.js`, `js/services/maintenance-service.js`, `js/config/compliance-config.js`, prediction/dispatch engines, and every UI file are byte-identical to before this phase.

### Testing summary

`scripts/vehicles-store-check.mjs`: **42/42 passed.** Structure: boot (seeds 4 default vehicles), then one block per writer group — `createVehicle`, `updateVehicle`, `deactivateVehicle`/`reactivateVehicle`, `archiveVehicle`/`restoreVehicle`, `updateVehicleOdometer`, `addMaintenanceRecord`/`updateMaintenanceRecord`/`deleteMaintenanceRecord`, `addComplianceRecord`, `deleteVehicle` — each asserting (a) the write resolves with the expected return value, (b) `getVehicles()`/`getVehicleById()`/`getMaintenanceRecords()`/`getComplianceHistory()` reflect the change with **no extra tick**, and (c) the registered `registerVehiclesChangeListener` callback has **already fired** with the updated payload by the time the writer's own `await` resolves. Plus an echo-idempotency block (the later, now-redundant echo neither duplicates nor removes state) and 3 business-rule spot checks (empty name, non-positive capacity, duplicate plate — all still rejected, unchanged).

**Sanity-verified the suite is not vacuous**, per this project's own standing discipline of never trusting a test result without checking it can fail: re-ran the exact same suite against the pre-fix code (`git stash` on `js/vehicles-store.js` only). Result: the 3 `createVehicle` timing assertions fail exactly as expected, and the very next scenario (`updateVehicle`) then throws `Error: Kendaraan tidak ditemukan.` — a real, reproducible cascading failure: under the old code, creating a vehicle and immediately trying to reference it by the id the create call just returned could fail, because the cache hadn't caught up yet. This is a concrete illustration of Finding C's real-world impact, not just a timing technicality.

### Regression summary

| Suite | Result |
|---|---|
| `vehicles-store-check.mjs` | 42/42 (new) |
| `vehicle-recommendation-check.mjs` | 71/71 |
| `vehicle-asset-check.mjs` | 58/58 |
| `dispatch-scoring-check.mjs` | 33/33 |
| `request-intelligence-check.mjs` | 53/53 |
| `capacity-hardening-check.mjs` | 38/38 |
| `decision-replay-check.mjs` / `decision-replay-dom-check.mjs` | 54/54, 28/28 |
| `vehicle-asset-dom-check.mjs` (Fleet Dashboard + Vehicle Drawer) | 30/30 |
| `vehicle-management-presentation-check.mjs` | 47/47 |
| `approval-panel-dom-check.mjs` | 23/23 |
| `policy-engine-dom-check.mjs` | 14/14 |
| `prediction-engine-check.mjs` / `-validator-` / `-service-` / `-provider-check.mjs` (Prediction Dashboard's dependency chain — architecturally insulated, consumes only the certified Prediction Service) | PASS ×4 |
| `smoke-boot.mjs` | 0 fatal errors, PASS |
| `maintenance-intelligence-check.mjs` | 34/41 — **pre-existing, unrelated.** Confirmed via `git stash` to fail identically (same 7 failures) on the unmodified pre-1.29.12 codebase: the test checks for its own original `APP_VERSION 1.18.1`/`RELEASE_NAME 'Fleet Maintenance Intelligence'` release markers (now 12 versions stale) plus 4 UI-wiring assertions unrelated to refresh behavior. Left untouched per this phase's explicit "do not modify Maintenance logic" scope. |

**Zero regressions caused by this change.**

### Performance impact

No new Firebase calls — the same one write per writer as before. `applyVehiclesPatch` does an `O(n)` rebuild of the vehicle map, which is the same order of work `refreshVehiclesCache`'s callers already did in every writer's pre-existing offline branch — for this deployment's fleet size (single- to low-double-digit), immaterial. The only new "cost" is that the Firebase realtime echo now triggers a second, redundant `refreshVehiclesCache` call shortly after every write (previously the sole trigger for 8 of the 12 writers) — harmless since it's idempotent (whole-array replace, no accumulation), verified by the echo-idempotency test.

### Future extension points

- **Phase 3–9 of §13 are unaffected and still open** — this closes Finding C only. Phase 3 (dead-code cleanup) can now proceed cleanly against the simplified writer shape.
- `applyVehiclesPatch` is the natural, already-tested seam for any future ledger type (e.g. an insurance ledger, per §13 Phase 5) — a new writer just needs `validate → compute updates → conditional await → applyVehiclesPatch`, the same shape as all 12 existing writers, with no new refresh logic to invent.
- `scripts/lib/firebase-stubs/` is now reusable for any future direct test of `vehicles-store.js` (or, with its 5 stub files as a template, any other file that only imports `js/firebase.js` for the same narrow `readNode`/`storeFirebaseData`/`updateFirebaseData`/`subscribeFirebasePath` surface) — the first time this codebase has had a safe, real way to unit-test a Firebase-importing store file without either network access or a signature-changing DI refactor.

---

*Investigation and implementation both traceable to file:line citations inline. Nothing here should be treated as authoritative until a human reviews and approves it, per this project's standing rule that AI is an analyzer, not the decision-maker.*
