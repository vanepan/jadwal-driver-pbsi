# Analytics V2 — Component Inventory & Audit

**Project:** Sarpras Operations · v1.10.0 — Analytics Experience Redesign
**Phase:** 1 (Existing Audit) + 5 (Reusable V2 Component Design)
**Status:** Architecture review — no code written
**Last updated:** 2026-06-12

> This document is the **system of record for what analytics exists today** and **what the
> reusable V2 component library will be**. It is grounded in the live implementation in
> [`js/app.js`](../js/app.js) (lines ~4209–5656) and the design prototype in this folder.

---

## PART A — Audit of the Existing Implementation

### A.0 Where analytics lives today

| Concern | Location | Notes |
|---------|----------|-------|
| Section entry point | `renderV2AdminAnalytics()` — app.js:4214 | Populates 4 filter dropdowns, restores filter state, calls refresh |
| Compute + render | `refreshAnalyticsDisplay()` — app.js:4310 | **One ~850-line function** doing filtering, all KPI math, all DOM string-building, and DQ logic |
| Charts | `_renderAnalyticsCharts()` — app.js:5518 | 6 Chart.js charts, manual lifecycle via `_analyticsCharts` Map |
| Chart teardown | `_destroyAnalyticsCharts()` — app.js:4209 | Called at top of every refresh |
| Data quality / alias engine | `_normDestKey`, `_strSimilarity`, `_detectSimilarPairs`, `_get/save/deleteAnalyticsAlias`, `_dismiss/_restoreDqWarning` — app.js:4243–5211 | Levenshtein-based fuzzy dedupe + canonical alias resolution |
| Alias / review modals | `initAliasResolutionModal`, `openAliasResolutionModal`, `initDestinationReviewModal`, `openDestinationReviewModal`, `_renderDestReviewList` — app.js:5254–5516 | Manual merge UX |
| PDF export | `exportAnalyticsReport()` — app.js:5217 → `analytics-summary` template (js/docs/templates/analytics-summary.js) | Snapshots `_lastAnalyticsModel`, hands off to Document Engine |
| Export snapshot | `_lastAnalyticsModel` (module var, written at app.js:4492) | Single source feeding the PDF — **this is the cleanest seam in the whole file** |

**Headline finding:** analytics is a single monolithic render function that fuses four concerns
that V2 must separate — **data selection, metric computation, presentation, and data-governance.**
There is no analytics module, no reusable component, and no typed model. Every metric is computed
inline and immediately interpolated into an HTML string.

---

### A.1 Existing KPI inventory

Legend for recommendation column: **KEEP** (carry forward as-is) · **REDESIGN** (keep the metric,
re-present it) · **REMOVE** (retire / fold into something better) · **PROMOTE** (elevate to executive tier).

| # | KPI | Source | Business value | Recommendation |
|---|-----|--------|----------------|----------------|
| 1 | Completion Rate `compRate` | assignments (completed/total) | Core operational health signal | **PROMOTE** — executive hero metric + trend delta |
| 2 | Total Assignments `total` | assignments (filtered) | Volume baseline | **PROMOTE** — executive hero metric |
| 3 | Selesai / Berlangsung / Dijadwalkan / Dibatalkan | assignment `status` buckets | Status mix | **KEEP** — feeds status donut |
| 4 | Open Rate `openRate` | (inProgress+scheduled)/total | Backlog pressure | **REDESIGN** — reframe as "Backlog / Open Work" insight |
| 5 | Driver Bertugas `driversWithTrips.length` | drivers ∩ assignments | Active workforce | **KEEP** |
| 6 | Kendaraan Digunakan `vehiclesWithTrips.length` | vehicles ∩ assignments | Fleet engagement | **KEEP** |
| 7 | Driver Paling Aktif / Paling Jarang | driver workload sort | Load balancing | **REDESIGN** → "Highlights" editorial cards |
| 8 | Workload class counts (Seimbang/Melebihi/Di Bawah) | mean ± stdDev classification | Fairness / over-utilization | **KEEP** — strong, statistically-grounded; surface as insight |
| 9 | Driver Tidak Bertugas / Kendaraan idle | zero-count entities | Under-utilization | **REDESIGN** → utilization grid + recommendation |
| 10 | Kendaraan Paling Sering Digunakan | vehicle usage sort | Maintenance risk proxy | **PROMOTE** → highlight + maintenance hook |
| 11 | Bidang terbanyak / paling jarang | request counts per `requesterName` | Demand concentration | **KEEP** |
| 12 | Bidang req% / asg% share | reqCount/total, asgCount/total | Demand vs fulfillment | **KEEP** |
| 13 | Total Jarak Tempuh `totalKm` | Σ `distanceTravelled` | Resource consumption | **PROMOTE** → executive metric |
| 14 | Rata-rata per Trip `avgKmPerTrip` | totalKm/odoTripCount | Route efficiency | **KEEP** |
| 15 | Trip dengan Odometer `odoTripCount` | count where distance>0 | Data completeness signal | **REDESIGN** → data-coverage indicator, not a headline KPI |
| 16 | Completion ratio `completed/total` string | derived | Redundant with #1 | **REMOVE** — duplicate of Completion Rate |

**Duplication / overlap found:**
- #1 Completion Rate and #16 Completion ratio are the same fact in two formats.
- "Driver Bertugas" appears both in the overview row (app.js:4629) and inside the driver section.
- Status counts are computed once but reasoned about in 3 places (KPI list, donut, insights).

**Missing operational insights (gaps to fill in V2):**
- No **trend over time** (everything is a single-period snapshot — the prototype's 30-day area chart and ±% deltas do not exist in production).
- No **lifecycle funnel** (Dibuat → Disetujui → Dimulai → Selesai).
- No **operational health score** (composite).
- No **period-over-period comparison** (the engine never computes a prior period).
- No **cost analytics** (no rupiah anywhere; reimbursement data exists but is not joined in).
- No **recommendations** (insights are descriptive, never prescriptive).

---

### A.2 Existing charts (Chart.js)

All six are created in `_renderAnalyticsCharts()` and tracked in `_analyticsCharts` for teardown.

| Chart id | Type | Data | Recommendation |
|----------|------|------|----------------|
| `chartAssignmentStatus` | doughnut | status buckets | **KEEP** — clean status mix |
| `chartDriverWorkload` | horizontal bar (top 12) | driver counts | **KEEP** |
| `chartVehicleUtil` | horizontal bar (top 10) | vehicle counts | **REDESIGN** — show true *utilization %*, not raw count (prototype uses util ratio) |
| `chartBidangDemand` | doughnut (top 8) | bidang reqCount | **KEEP** |
| `chartOdoDriver` | horizontal bar | driver km | **KEEP** |
| `chartOdoVehicle` | horizontal bar | vehicle km | **KEEP** |

**Weak visualizations / concerns:**
- Charts use a **hardcoded palette** (`PALETTE` at app.js:5531) and **hardcoded hex colors** in datasets that do not read the design-token CSS variables — they will not theme correctly and diverge from `DESIGN_SPEC.md`.
- Font is hardcoded to `'Inter'` (app.js:5528) while DESIGN_SPEC mandates Archivo/Manrope/JetBrains Mono.
- No trend/area/funnel chart types exist; the prototype expects them.
- Chart height is computed by row-count math inline — fragile, should be a component prop.

---

### A.3 Existing sections (current IA)

Rendered as one big template string at app.js:4864. Order:

1. Insight highlights (top-3 descriptive bullets)
2. **Ringkasan Operasional** → Assignment Analytics (7 KPI rows + status donut)
3. **Utilisasi Driver** → workload distribution (7 KPI rows + breakdown + bar)
4. **Utilisasi Kendaraan** (breakdown + bar)
5. **Sumber Daya Tidak Aktif** (idle drivers/vehicles)
6. **Analitik Tujuan** (top-10 destinations)
7. **Permintaan per Bidang** (demand table + donut)
8. **Odometer & Jarak Tempuh**
9. **Data Quality Resolution Center** (DQ warnings, alias table, review modal trigger)

This is a **flat list of equal-weight sections** — no executive layer, no progressive disclosure.
V2 restructures into the 3-level model (Executive → Highlights → Deep) per `INFORMATION_ARCHITECTURE.md`.

---

### A.4 Existing calculations (the real analytics IP)

These are the genuinely valuable algorithms worth preserving verbatim into the new engine:

| Calculation | Location | Verdict |
|-------------|----------|---------|
| Date-range cutoff (today/7d/30d/90d/all) | app.js:4316 | **KEEP** — move into `period` util |
| Status normalization `normalizeAssignmentStatus` | applied at app.js:4334 | **KEEP** |
| Relative workload classification (mean ± stdDev, no hardcoded thresholds) | app.js:4434 | **KEEP — flagship** |
| Bidang req/asg join via `requestId` | app.js:4421 | **KEEP** |
| Odometer aggregation per driver/vehicle/bidang | app.js:4505 | **KEEP** |
| Levenshtein similarity + fuzzy pair detection | app.js:4254–4281 | **KEEP** — governance engine |
| Canonical alias resolution | app.js:4283–4298 | **KEEP** — governance engine |

**Invariant to carry forward (from project memory + app.js):** alias resolution affects **analytics
display only**. Raw `/assignments`, `/driver_requests`, `/logs` are never mutated. V2 must preserve
this read-only-projection rule.

---

### A.5 Existing exports

| Export | Mechanism | Verdict |
|--------|-----------|---------|
| Analytics PDF | `exportAnalyticsReport()` → `_lastAnalyticsModel` snapshot → `DocumentEngine.generateAndOpen('analytics-summary', vm)` | **KEEP & EXTEND** — this is already the right pattern |

The export already follows the target architecture: a **view-model snapshot** (`_lastAnalyticsModel`,
written at app.js:4492) decouples compute from the PDF template. There is **no Excel and no Print**
path yet. The Document Engine ([`js/docs/`](../js/docs/)) already supports a pluggable exporter
(`getExporter(backend)`), so Excel/Print are additive, not a rewrite.

---

### A.6 Existing data sources (Firebase RTDB)

| Path | Module | Used by analytics for |
|------|--------|------------------------|
| `/assignments` | firebase.js / assignments.js | every assignment KPI, status, odometer, destination |
| `/driver_requests` | firebase.js / requests.js | bidang demand, request join via `requestId` |
| `/drivers` | drivers-store.js | active driver roster, workload denominator |
| `/vehicles` | vehicles-store.js | active fleet roster, utilization denominator |
| `/logs` | logs.js | **not yet used in analytics** (governance audit trail opportunity) |
| `/settings/analyticsAliases` | settings-store.js | canonical alias maps (destinations/drivers/vehicles/bidang) |
| `/settings/analyticsQuality` | settings-store.js | dismissed DQ warnings |

**Assignment schema (from assignments.js:350–406):** `id, driver, vehicle, date/startDate, startTime,
endTime, destination, purpose, pic, pax, notes, requestId, status (assigned|started|completed),
startOdometer, endOdometer, distanceTravelled, createdAt`.

**Scalability concern:** all analytics run **client-side over the full in-memory arrays** on every
filter change, rebuilding all DOM + destroying/recreating 6 charts each time. Fine at current volume;
will degrade as `/assignments` grows. V2 should memoize the computed model per (filter, dataset) key.

---

## PART B — Reusable V2 Component Inventory

Design goal: a component library that is **module-agnostic** so the same primitives render Driver,
Engineering, Inventory, Cost, and Maintenance analytics, and later feed the AI Operations Assistant.
Components are **presentation-only** — they receive a typed model from the Analytics Engine
(see `DATA_FLOW_ANALYSIS.md`) and never compute metrics themselves.

> Stack note: the production app is **vanilla JS, no framework** (project memory). The `.jsx` files in
> this folder are a *prototype only*. The V2 library will be authored as vanilla render functions /
> small factory components matching the existing app, **not** React. The prototype defines the
> *visual + interaction contract*, which these components must satisfy.

### B.1 Layout & chrome

| Component | Purpose | Key props | Reusability strategy |
|-----------|---------|-----------|----------------------|
| `AnalyticsHeader` | Page title, period label, export entry | `{ title, periodLabel, onExport }` | Title/subtitle are props → any module |
| `AnalyticsFilterBar` | Date range + entity filters + reset | `{ filters, options, onChange, onReset }` | `options` injected per module (driver/vehicle/bidang today; SKU/asset later) |
| `AnalyticsSection` | Titled section wrapper w/ optional eyebrow | `{ id, title, sub, eyebrow, children }` | Pure container |
| `AnalyticsTabs` (segmented) | Progressive disclosure for deep analytics | `{ tabs, active, onChange }` | `tabs` is data → any module defines its own |

### B.2 Metric & insight primitives

| Component | Purpose | Key props | Reusability |
|-----------|---------|-----------|-------------|
| `AnalyticsKPICard` | One metric: value, label, delta, trend tone | `{ label, value, fmt, delta, trendTone, sub, icon }` | `fmt` ∈ int/pct/km/currency → covers cost & maintenance |
| `KPIGrid` | Responsive grid of KPI cards | `{ items }` | Layout only |
| `HeroMetric` | Executive oversized stat (hero tier) | `{ label, value, fmt, delta }` | Executive Summary across modules |
| `HealthScoreGauge` | Composite ring gauge + grade | `{ score, grade, metrics[] }` | Each module supplies its own composite |
| `HighlightCard` | Editorial "most X" card, clickable to drill | `{ eyebrow, value, context, tag, tone, onClick }` | Any "top entity" |
| `InsightCard` | Human-readable finding w/ severity | `{ severity, title, desc }` | Output of Insight Engine — module-neutral |
| `RecommendationCard` | Prescriptive action w/ rationale + CTA | `{ priority, title, rationale, action, onAct }` | Output of Recommendation Engine |

### B.3 Chart wrappers (theme-aware, token-driven)

| Component | Wraps | Fixes vs today |
|-----------|-------|----------------|
| `AnalyticsChart` (base) | Chart.js lifecycle + teardown registry | Centralizes the `_analyticsCharts` Map pattern |
| `DonutChart` | doughnut | Reads CSS tokens, not hardcoded hex |
| `HBarList` / `BarChart` | horizontal bar | Height as prop, token colors |
| `AreaChart` (NEW) | line/area trend | Fills the missing trend capability |
| `Funnel` (NEW) | lifecycle funnel | Fills the missing lifecycle capability |
| `RankTable` | sortable table w/ inline bars | Replaces ad-hoc breakdown rows |

All chart components **must** consume the tokens in `DESIGN_SPEC.md` (`--c-green`, `--accent`, etc.)
and the Archivo/Manrope/JetBrains Mono families — resolving the theming defects in A.2.

### B.4 State components

| Component | Purpose | Notes |
|-----------|---------|-------|
| `AnalyticsLoadingState` | Skeleton shimmer per DESIGN_SPEC §13 | Replaces content, preserves card shell |
| `AnalyticsEmptyState` | "No data / adjust filters" | Generalizes current `.v2-analytics-empty-state` |
| `AnalyticsErrorState` | Compute/render failure | **New** — production currently has no error boundary |

### B.5 Governance components (productionize the existing DQ center)

| Component | From today's code | Purpose |
|-----------|-------------------|---------|
| `DataQualityPanel` | DQ Resolution Center | Surfaces duplicate/alias warnings + stats |
| `AliasManagerTable` | `_allAliases` table | CRUD over canonical aliases |
| `EntityReviewModal` | `initDestinationReviewModal` | Generalize beyond destinations → any entity |
| `ClassificationBadge` (NEW) | — | Shows production/testing/training/demo (see `GOVERNANCE_RECOMMENDATION.md`) |

### B.6 Module compatibility matrix

| Component | Driver Ops | Engineering | Inventory | Cost | Maintenance | AI Assistant |
|-----------|:---------:|:-----------:|:---------:|:----:|:-----------:|:------------:|
| KPICard / KPIGrid / HeroMetric | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ (reads model) |
| HealthScoreGauge | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| InsightCard / RecommendationCard | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ (primary surface) |
| Chart wrappers | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| DataQualityPanel / AliasManager | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ (trust signal) |

---

## Summary of recommendations

1. **Extract** the analytics IP (workload classification, alias resolution, odometer aggregation,
   bidang join) out of `refreshAnalyticsDisplay()` into a pure **Analytics Engine** that returns a
   typed model — see `DATA_FLOW_ANALYSIS.md`.
2. **Keep** all 6 charts but rebuild them as token-driven, theme-aware wrappers; **add** Area, Funnel,
   and Health gauge to close the executive-storytelling gap.
3. **Remove** the duplicated completion-ratio KPI; **promote** Completion Rate, Total Assignments,
   Total Distance to an executive hero tier.
4. **Reuse** the existing PDF export seam (`_lastAnalyticsModel` → Document Engine) and extend it with
   Excel + Print exporters — no PDF rewrite needed.
5. **Generalize** the destination-review/alias machinery into module-agnostic governance components.
