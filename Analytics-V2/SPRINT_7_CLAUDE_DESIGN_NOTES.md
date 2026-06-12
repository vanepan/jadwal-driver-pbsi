# Sprint 7 — Claude Design Analytics Experience Migration (v1.10.1)

Migrates Analytics V2 from a **flat list of 11 equal-weight sections** to a **6-section
operational-intelligence dashboard** in the Claude Design visual language. This is a
**presentation-layer migration only** — no analytics logic, KPI, chart dataset, insight,
recommendation, or trend value changed (proved by the existing harnesses, all still green).

## What did NOT change (hard constraint)
The five engine modules are untouched and consumed read-only:
`analytics-engine.js`, `analytics-model.js`, `analytics-insights.js`,
`analytics-recommendations.js`, `analytics-trends.js`. All calculations, formulas, datasets,
trend values, and Chart.js canvas ids are identical. The header **Export PDF** button and its
handler are retained as-is. Every existing content fragment in `refreshAnalyticsDisplay()`
(`execContent`, `trendsContent`, the five resource fragments, `dqContent`) is passed through
**verbatim** — only the surrounding composition changed.

## Target Information Architecture (6 sections)
```
Analytics
├── 01 Executive Summary    (KPI cards + highlights + quick summary)
├── 02 Operational Trends   (4 period-over-period KPI cards)
├── 03 Operational Health   (NEW merge: insights + recommendations, prioritized)
├── 04 Resource Analytics   (NEW tabs: Driver / Kendaraan / Bidang / Tujuan / Jarak Tempuh)
├── 05 Data Quality Center  (existing DQ resolution center, re-wrapped)
└── 06 Export Center        (NEW: PDF working · Excel/Print placeholders)
```
Each section is wrapped in an elevated **Claude-Design section card** (`renderAnalyticsSectionCard`)
with an eyebrow (`01 · Eksekutif`), an H2 title, and a one-line description.

## Section 3 — Operational Health (the merge)
`model.insights` (what happened) and `model.recommendations` (what to do) both already carry a
`priority` (1 = critical/risk, 2 = important, 3 = general) and are engine-sorted. The renderer
buckets them **Prioritas 1 → 3 (highest first)**; within a bucket, insights precede recommendations
(stable sort). Each card is tagged **Wawasan** or **Rekomendasi** and reuses the existing
`renderInsightCard` / `renderRecommendationCard`. Empty period → one calm combined empty state.

## Section 4 — Resource Analytics (the tabs)
The five resource fragments feed a segmented tab control (`renderAnalyticsTabs` +
`renderAnalyticsTabPanels`, default **Driver**). One panel is visible at a time; non-active panels
are `hidden`. Switching is a single **delegated** click listener on the stable `#v2AnalyticsContent`
(reuses the existing `ws` workspace listener in `initAdminEventHandlers`), so it survives every
`innerHTML` refresh. **Chart fix:** because a Chart.js canvas inside a `display:none` panel renders
at 0px, `_switchAnalyticsTab()` calls `.resize()` on charts inside the newly shown panel (iterating
the existing `_analyticsCharts` Map). The default Driver panel is visible on first paint, so only
on-show panels need the nudge.

## Section 6 — Export Center
`renderExportCenter` builds a button row: **PDF** carries `data-action="export-pdf"` (wired in the
same delegated listener → `exportAnalyticsReport()`, the same path the header button uses);
**Excel** and **Print** are inert "Segera hadir" placeholders for a later sprint. No export logic.

## Files
- **Changed:** `js/analytics/analytics-shell.js` (+6 additive presentation primitives:
  `renderAnalyticsSectionCard`, `renderAnalyticsTabs`, `renderAnalyticsTabPanels`,
  `renderHealthPriorityGroup`, `renderHealthItem`, `renderExportCenter`),
  `js/app.js` (`refreshAnalyticsDisplay()` composition reworked; `_switchAnalyticsTab()` helper;
  tab + `export-pdf` cases in the delegated `ws` click listener; new imports),
  `platform.css` (appended Sprint-7 style block — new classes only, reusing existing tokens),
  `js/config.js` (v1.10.1), `service-worker.js` + `version.json` (via `sync-version.mjs`).
- **New:** this notes file.

## Verification
```
node Analytics-V2/parity-check.mjs            # existing analytics values unchanged — PASS
node Analytics-V2/trend-check.mjs             # trend determinism/isolation/additive — PASS
node Analytics-V2/insights-check.mjs          # insights deterministic/prioritized — PASS
node Analytics-V2/recommendations-check.mjs   # recommendations deterministic — PASS
node --check js/app.js                        # syntax — PASS
node --check --input-type=module < js/analytics/analytics-shell.js   # syntax — PASS
```
Manual (Admin → Analytics): six wrapped section cards in IA order; Executive Summary & Operational
Trends numbers identical to before; Operational Health grouped P1→P3 (highest first), Wawasan/
Rekomendasi tags, calm combined empty state when no findings; Resource Analytics tabs switch panels
and **charts render correctly after switching**; Data Quality merge/dismiss/restore/alias actions
still work; Export Center PDF matches the header button, Excel/Print show "Segera hadir"; at ≤600px
the cards stack, tabs wrap, and there is **no horizontal scrolling**.
