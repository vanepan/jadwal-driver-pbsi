# Sprint 1 — Analytics V2 Shell · Notes

**Project:** Sarpras Operations · v1.10.0
**Scope:** Layout/structure modernization only. Engine, KPIs, charts, exports, governance — **untouched**. No numerical change.
**Date:** 2026-06-12

---

## 1. What changed

### New module: `js/analytics/analytics-shell.js`
Pure presentation primitives (no DOM, no Firebase, no business logic):
| Export | Purpose |
|--------|---------|
| `renderAnalyticsSection({id,title,description,content,variant})` | The single section pattern every block renders through. With no `description`, output is structurally identical to the legacy section markup. |
| `renderAnalyticsPlaceholderSection({id,title,description,note})` | Reserved section slot (Operational Trends, Insights, Export Center). |
| `renderAnalyticsEmptyState({message,hint})` | Reuses existing `.v2-analytics-empty-state` styling. |
| `renderAnalyticsLoadingState({message})` | Lightweight, no spinner. |
| `renderAnalyticsErrorState({message,detail})` | New resilience — surfaced on compute failure. |
| `ANALYTICS_SECTION_ORDER` | Canonical IA section ordering. |

### Modified: `js/app.js` (render layer only)
- **Analytics Header (Phase 2):** the analytics controls (date range, driver/vehicle/bidang filters, reset, export) + filter-summary are now wrapped in a `.v2-analytics-header` command region with a title/subtitle. **All element IDs preserved**; elements remain inside `ws`, so the existing event delegation (change/click) and the direct `#v2AnalyticsExportPdf` listener keep working unchanged.
- **Section system (Phase 3):** `refreshAnalyticsDisplay()` now builds each block's inner content into a fragment variable (`execContent`, `driverContent`, `vehicleContent`, `bidangContent`, `destContent`, `odoContent`, `dqContent`) and composes the page by mapping them through `renderAnalyticsSection(...)` in IA order. The inner HTML of every block (KPI rows, breakdowns, **canvas IDs**, DQ center) is byte-identical to Sprint 0.
- **Executive Summary container (Phase 4):** new `#analyticsExecutiveSummary` section hosting the insight highlights, the existing Assignment Analytics KPIs/status chart, and a reserved, invisible `<div class="v2-analytics-exec-kpis" data-future="kpi-cards">` slot for future KPI cards. No KPI redesign, no value change.
- **Insights placeholder (Phase 5):** `#analyticsInsights` reserved section noting the future Insight/Recommendation/AI layer. Also added Operational Trends and Export Center placeholders.
- **Destination Analytics** promoted from a sub-group of Bidang into its own `#analyticsDestination` section; shows an empty state (instead of disappearing) when there is no destination data.
- **States (Phase 6):** global empty state now uses `renderAnalyticsEmptyState`; the engine call is wrapped in `try/catch` → `renderAnalyticsErrorState` on failure (new).

### Information architecture (render order)
`Header → Executive Summary → Operational Trends* → Driver → Vehicle → Bidang → Destination → Odometer → Insights* → Data Quality → Export Center*` (`*` = reserved placeholder).

---

## 2. Why numbers cannot change

- `analytics-engine.js` was **not modified** in this sprint. All KPI/chart/aggregation/DQ values come from the engine exactly as in Sprint 0.
- The section refactor only re-wraps **already-computed** HTML fragments; the fragment builders and the destructured engine values are unchanged.
- Chart canvases keep the same IDs (`chartAssignmentStatus`, `chartDriverWorkload`, `chartVehicleUtil`, `chartBidangDemand`, `chartOdoDriver`, `chartOdoVehicle`), so `_renderAnalyticsCharts()` still finds them and renders identical datasets.
- The PDF export path (`_lastAnalyticsModel` → `analytics-summary`) is untouched.

**Verification:**
- `node Analytics-V2/parity-check.mjs` → still **PARITY OK** (9/9 scenarios, exact equality) — confirms the engine is intact.
- `node --check --input-type=module` passes on `analytics-shell.js` and `app.js`.

---

## 3. Mobile / tablet / desktop review (Phase 7)

- The header wraps the existing `.v2-admin-toolbar`; all matched CSS selectors (`.v2-admin-toolbar`, `.v2-analytics-filter-summary`, `.v2-analytics-section`) are **class-based**, not dependent on the old direct-child nesting — so wrapping does not break styling, including the toolbar's responsive media queries (`platform.css` ~5767/5809).
- New classes (`.v2-analytics-header`, `.v2-analytics-section-desc`, `.v2-analytics-section--placeholder`, `.v2-analytics-exec-kpis`, loading/error states) carry **no fixed widths** — header title/subtitle/descriptions use fluid inline styles → no horizontal overflow on mobile.
- The section system reuses `.v2-analytics-section` / `.v2-analytics-groups`, which already have responsive rules from prior sprints.
- No full responsive redesign performed (out of scope); no structural problems identified or introduced.

---

## 4. Deliverables checklist

| # | Deliverable | Status |
|---|-------------|--------|
| 1 | Analytics Shell created | ✅ `analytics-shell.js` + IA-ordered assembly |
| 2 | Analytics Header created | ✅ `.v2-analytics-header` command region (IDs preserved) |
| 3 | Section rendering system created | ✅ `renderAnalyticsSection`; all blocks render through it |
| 4 | Executive Summary container created | ✅ `#analyticsExecutiveSummary` + reserved KPI-card slot |
| 5 | Insights placeholder created | ✅ `#analyticsInsights` (+ Trends, Export placeholders) |
| 6 | Standardized states created | ✅ loading / empty / error helpers; empty+error wired in |
| 7 | Existing analytics preserved | ✅ inner content byte-identical; charts intact |
| 8 | Analytics Engine untouched | ✅ no change to `analytics-engine.js` |
| 9 | Numerical parity preserved | ✅ parity harness still passes |

---

## 5. Notes for next sprint
- Placeholders (Operational Trends, Insights/Recommendations, Export Center) are the mount points for the Trend/Insight/Recommendation engines and Excel/Print exporters.
- The reserved `.v2-analytics-exec-kpis` slot is where redesigned executive KPI cards will render (they currently live as KPI rows inside the Executive Summary section).
- `renderAnalyticsLoadingState` is available but not yet wired (compute is synchronous); it is ready for when data fetching becomes async.
