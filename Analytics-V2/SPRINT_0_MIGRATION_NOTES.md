# Sprint 0 — Analytics Engine Extraction · Migration Notes

**Project:** Sarpras Operations · v1.10.0
**Scope:** Architecture refactoring only. No UI / styling / chart / behavior changes.
**Outcome:** Analytics computation extracted into a reusable, pure engine with **0 visible changes** and **proven numerical parity**.
**Date:** 2026-06-12

---

## 1. What changed

### New module: `js/analytics/`
| File | Role |
|------|------|
| `analytics-types.js` | JSDoc typedefs for the model contracts (`AnalyticsModel`, `KPI`, `Insight`, `AnalyticsContext`, `AnalyticsClassification`). No runtime behavior. |
| `analytics-governance.js` | Governance **placeholder**. `isAnalyticsEligible()` / `filterEligible()` — **absence of governance data ⇒ production**, so it is identity for all current records. |
| `analytics-model.js` | `buildAnalyticsModel()` — deterministic assembler producing the normalized `{ schemaVersion, metadata, kpis, charts, insights, diagnostics, render, exportSnapshot }` shape. |
| `analytics-engine.js` | `computeAnalyticsModel(ctx)` — the central computation, plus the relocated pure helpers (`normDestKey`, `strSimilarity`, `detectSimilarPairs`, `getAliasCanonical`, `getAliasMeta`, `dqPairKey`). |

### Modified: `js/app.js`
- Added imports from `./analytics/analytics-engine.js` (`computeAnalyticsModel` + 3 helpers re-aliased to their old underscore names so the alias/review modals are untouched).
- Deleted the six pure helper definitions (moved to the engine). **Kept** `_getAnalyticsAliases` / `_getDismissedWarnings` (they read `getSetting`, so they remain app-side and feed the engine via `ctx`).
- `refreshAnalyticsDisplay()`: the former ~300-line inline compute block (KPIs, driver/vehicle/bidang/destination/odometer aggregation, workload classification, data-quality detection, export snapshot) is replaced by **one `computeAnalyticsModel(...)` call + a destructure**. The ~530 lines of HTML rendering below are **unchanged**.

### Net
~300 lines of computation moved out of the UI function; rendering now **consumes the model**.

---

## 2. How parity is guaranteed (the method)

The computation was **lifted verbatim**. Inside `computeAnalyticsModel` a short *rebinding preamble* maps the `ctx` onto the exact local identifiers the original code used:

```js
const getDrivers = () => ctx.drivers;
const _getAnalyticsAliases = (type) => ctx.aliases[type] || {};
const analyticsDateRange = ctx.filters.dateRange;
// …etc.
```

Because of this, the moved lines are byte-for-byte the original logic — there is no re-expression of any formula, so there is nothing to drift.

Two side effects the engine intentionally does **not** perform (to stay pure) are done by the caller, exactly as before:
- `window._analyticsFilteredAsg = model.diagnostics.filteredAsg;`
- `_lastAnalyticsModel = model.exportSnapshot;`  ← the PDF export snapshot (unchanged shape)

The renderer keeps using the same variable names via one destructure of `model.render`, whose keys are deliberately identical to the names used inside the HTML template literals (including `_destFreq`, `_dqMainWarnings`, `_allAliases`, …).

---

## 3. Parity validation (Step 5) — RESULTS

A runnable harness, `Analytics-V2/parity-check.mjs`, runs the **new engine** against an **independent verbatim copy of the original pre-refactor logic** (`computeOld`) over 9 scenarios, asserting exact equality of the `render` projection and the `exportSnapshot`.

Run:
```
node Analytics-V2/parity-check.mjs
```

Result (all pass, exit 0):
```
✓ [all-data, no aliases]                exportSnapshot=true render=true
✓ [all-data, with aliases + dismissed]  exportSnapshot=true render=true
✓ [30d window]                          exportSnapshot=true render=true
✓ [7d window]                           exportSnapshot=true render=true
✓ [today only]                          exportSnapshot=true render=true
✓ [driver filter (Igo)]                 exportSnapshot=true render=true
✓ [vehicle filter (Innova)]             exportSnapshot=true render=true
✓ [bidang filter]                       exportSnapshot=true render=true
✓ [empty result (impossible filter)]    exportSnapshot=true render=true

PARITY OK — engine matches the original computation across all scenarios.
```

Scenarios deliberately exercise: empty data / impossible filters, every date window, each entity filter, **alias resolution** (canonical destination merge), **dismissed DQ warnings**, **fuzzy-duplicate detection** (Igo/Igoo, Innova/Innovaa, near-duplicate bidang names), **legacy statuses** (`null`, `'selesai'`), **odometer** aggregation, and off-roster entities.

Clock is injectable via `ctx.now` for deterministic date-window tests; when absent the engine uses the real clock — byte-identical to the original `new Date()` behavior.

> Static checks: `node --check --input-type=module` passes on all four new files and on `app.js`.

---

## 4. Governance placeholder (Step 6)

- `filterEligible(ctx.assignments)` is wired at the top of the engine pipeline. With **absence ⇒ production**, it returns every existing record → **no record disappears**, output unchanged.
- The classification model (`production | testing | training | demo`) is defined in `analytics-types.js` and `GOVERNANCE_RECOMMENDATION.md`. Creation-form UX, bulk reclassification, and supervised cleanup are **out of scope for Sprint 0** (later sprint).

---

## 5. Export alignment (Step 7)

No export refactor was required. The Analytics PDF (`analytics-summary` template) consumes `_lastAnalyticsModel`, which is now `model.exportSnapshot` — same shape, parity-proven. The normalized `AnalyticsModel` is positioned to become the single source of truth for Dashboard + PDF + Excel + Print + AI in later sprints; `exportSnapshot` / `render` are explicitly marked transitional projections to be retired once those consumers read the structured buckets.

---

## 6. Deliverables checklist

| # | Deliverable | Status |
|---|-------------|--------|
| 1 | Analytics Engine extracted | ✅ `analytics-engine.js` |
| 2 | AnalyticsModel created | ✅ `analytics-model.js` + `analytics-types.js` |
| 3 | Governance placeholder created | ✅ `analytics-governance.js` (absence ⇒ production) |
| 4 | Rendering separated from calculations | ✅ `refreshAnalyticsDisplay()` consumes the model |
| 5 | Parity validation completed | ✅ 9/9 scenarios, exact equality (`parity-check.mjs`) |
| 6 | Migration notes documented | ✅ this file |

---

## 7. Residual notes / next sprint

- `model.kpis` / `model.charts` / `model.diagnostics` are populated but the UI still renders from `model.render`. Migrating the renderer onto the structured buckets is a **Sprint 1+** task (and is where new visuals/trends land).
- `package.json` has no `"type": "module"`; Node prints a harmless `MODULE_TYPELESS_PACKAGE_JSON` warning when running the harness. The browser app is unaffected (loaded as `<script type="module">`).
