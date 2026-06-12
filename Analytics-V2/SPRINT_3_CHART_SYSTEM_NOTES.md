# Sprint 3 — Unified Chart System + Operational Trends · Notes

**Project:** Sarpras Operations · v1.10.0
**Scope:** Chart presentation architecture only. Engine, datasets, Chart.js configs, exports, governance — **untouched**. No value changes.
**Date:** 2026-06-12

---

## 1. What changed

### `js/analytics/analytics-shell.js` — unified chart system
| Export | Purpose |
|--------|---------|
| `renderAnalyticsChart({title,subtitle,canvasId,boxVariant,height,actions,footer,metadata})` | One reusable chart container: **Title · Subtitle · Chart Area · Footer**. Keeps the canvas id stable so the Chart.js layer still finds it. When there is no subtitle/actions it emits the **legacy header markup verbatim** → existing charts look identical. |
| `renderAnalyticsChartLoading({title,message})` | Standardized chart loading state. |
| `renderAnalyticsChartEmpty({title,message,hint})` | Standardized chart empty state. |
| `renderAnalyticsChartError({title,message,detail})` | Standardized chart error state. |

Chart states reuse the Sprint-1 `renderAnalyticsLoadingState/EmptyState/ErrorState` inside a chart wrapper, so every chart behaves consistently.

### `js/app.js`
- **All 6 charts** (status donut, driver workload, vehicle utilization, bidang demand, odometer driver, odometer vehicle) now render through `renderAnalyticsChart(...)` instead of bespoke inline wrappers. Canvas ids unchanged (`chartAssignmentStatus`, `chartDriverWorkload`, `chartVehicleUtil`, `chartBidangDemand`, `chartOdoDriver`, `chartOdoVehicle`).
- **Operational Trends activated** (`#analyticsTrends`): promoted from a generic placeholder to a real chart-home section that renders a standardized `renderAnalyticsChartEmpty` state. No time-series data exists yet (the engine computes single-period figures), so it honestly shows a "Trend Engine pending" empty state — **no fabricated trends or comparisons**.
- **Chart metadata (Phase 5):** each chart wrapper carries hidden `data-generated-at`, `data-period`, `data-source` attributes (built from `model.metadata`) for future PDF/Excel/AI/governance consumers.
- **Model integration (Phase 6):** the `_renderAnalyticsCharts(...)` call now sources its datasets from `_analyticsModel.charts` (status/driverWorkload/vehicleUtil/bidangDemand/odoDriver/odoVehicle) + `model.kpis.totalKm` + `model.render.hasOdoData`. The Chart.js configuration inside `_renderAnalyticsCharts` is **unchanged** — same datasets, same options, same colors.

### `platform.css`
Added slot styles: `.v2-analytics-chart-head/-titles/-subtitle/-actions/-footer/-state`. Charts without subtitle/actions are unaffected (legacy markup path). No change to `.v2-analytics-chart-wrap/-box/-label`.

---

## 2. Why numbers/charts cannot change
- `analytics-engine.js` and `_renderAnalyticsCharts()` (the Chart.js config) were **not modified**.
- `renderAnalyticsChart` only standardizes the *wrapper*; the `<canvas id>` is identical, so the same chart renders the same dataset.
- The call site reads the **same arrays** (now via `model.charts`, which holds the same references the locals did).
- For charts with no subtitle/actions the produced DOM is byte-identical to Sprint 2 (only invisible `data-*` metadata is added).

**Verification:**
- `node Analytics-V2/parity-check.mjs` → **PARITY OK** (9/9) — engine intact.
- `node --check --input-type=module` passes on `analytics-shell.js` and `app.js`.

---

## 3. Mobile review (Phase 7)
- `.v2-analytics-chart-box` is `width:100%` (responsive); donut capped at 300px centered; bar charts use a fixed px height + Chart.js `maintainAspectRatio:false` → canvas scales to container width. No horizontal overflow.
- New `.v2-analytics-chart-head` is flex with `min-width:0` titles → long titles wrap/ellipsis rather than overflow; actions `flex-shrink:0`.
- No chart visualization redesign performed (out of scope).

---

## 4. Deliverables
| # | Deliverable | Status |
|---|-------------|--------|
| 1 | `renderAnalyticsChart()` created | ✅ |
| 2 | Unified chart container system | ✅ Title/Subtitle/Area/Footer |
| 3 | Chart loading/empty/error states | ✅ |
| 4 | Operational Trends activated | ✅ chart-home + honest empty state |
| 5 | Chart metadata foundation | ✅ hidden `data-*` from `model.metadata` |
| 6 | Improved `model.charts` integration | ✅ render call consumes `model.charts` |
| 7 | Mobile chart review | ✅ |

## 5. Out of scope (untouched)
AI insights, recommendation engine, anomaly detection, governance UI, export redesign, health score — deferred.

## 6. Note
Validated via parity harness + static checks. **Live browser smoke test still pending** (needs Firebase): confirm all 6 charts still draw with identical data, the Operational Trends empty state shows, and containers don't overflow on a narrow viewport.
