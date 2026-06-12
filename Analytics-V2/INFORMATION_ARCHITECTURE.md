# Analytics V2 — Information Architecture

**Project:** Sarpras Operations · v1.10.0 — Analytics Experience Redesign
**Phase:** 4 (Analytics V2 Information Architecture)
**Status:** Architecture review — no code written
**Last updated:** 2026-06-12

---

## 1. Guiding model: 3-level progressive disclosure

Today's analytics is a **flat list of nine equal-weight sections** (see `COMPONENT_INVENTORY.md` §A.3)
— the reader gets no hierarchy and no "so what." The design prototype (`overview.jsx`, `deep.jsx`)
already demonstrates the target: a **layered narrative**.

```
LEVEL 1 — Executive Summary      "3–5 second understanding"   (one idea, big)
LEVEL 2 — Operational Highlights "the 3 findings that matter" (editorial trio)
LEVEL 3 — Deep Analytics         "all the detail, on demand"  (tabbed, progressive)
LEVEL 4 — Intelligence & Export  insights, recommendations, export center
```

Everything below maps the prompt's target IA onto these levels.

---

## 2. Section-by-section IA

For each section: **purpose · audience · business value · roadmap compatibility**.

### 2.1 Executive Summary  *(Level 1)*
- **Purpose:** instant operational verdict — health score, total assignments, completion rate, total distance, critical-alert count, period delta.
- **Audience:** owner / leadership / anyone opening the page cold.
- **Business value:** the "is everything OK?" answer without scrolling. Replaces the current
  undifferentiated overview row (app.js:4617) with a true executive tier.
- **Roadmap:** module-neutral hero (`HeroMetric` + `HealthScoreGauge`) — Engineering/Inventory/Cost reuse it. The health score becomes the AI Assistant's headline summary.

### 2.2 Operational Trends  *(Level 3 · default tab)*
- **Purpose:** assignment volume over time, status distribution, lifecycle funnel (Dibuat → Disetujui → Dimulai → Selesai), period-over-period.
- **Audience:** operations lead.
- **Business value:** direction of travel — the single biggest gap today (production has **no trend at all**).
- **Roadmap:** the trend/area + funnel primitives are the substrate for predictive forecasting (Q3 2026 roadmap item in `data.jsx`).

### 2.3 Driver Analytics  *(Level 3)*
- **Purpose:** workload distribution, fairness (mean±stdDev classification — preserve from app.js:4434), distance ranking, idle drivers.
- **Audience:** dispatch / HR / operations.
- **Business value:** load balancing and fairness — already the strongest existing analytic; elevate it.
- **Roadmap:** fairness index feeds Recommendation Engine ("redistribute N trips") and AI staffing suggestions.

### 2.4 Vehicle Analytics  *(Level 3)*
- **Purpose:** true utilization %, distance ranking, fleet-wide utilization grid, over-use flags.
- **Audience:** fleet management.
- **Business value:** capacity + the maintenance-risk early-warning the current raw counts only hint at.
- **Roadmap:** over-utilization directly seeds the **Maintenance Analytics** module and predictive servicing (Q3 2026).

### 2.5 Bidang Analytics  *(Level 3)*
- **Purpose:** departmental demand (request share %, assignment fulfillment %, distance per bidang) via the `requestId` join (app.js:4411).
- **Audience:** leadership / inter-departmental planning.
- **Business value:** who consumes transport capacity, and whether demand is met.
- **Roadmap:** demand basis for cost allocation (Cost Analytics) and inter-bidang chargeback.

### 2.6 Destination Analytics  *(Level 3, within Bidang/Trends context)*
- **Purpose:** top destinations by frequency & distance, with alias resolution + route concentration.
- **Audience:** operations / route planning.
- **Business value:** route-consolidation opportunities (prototype insight: "3 destinations = 56% of distance").
- **Roadmap:** route optimization + the existing alias governance keeps destination data clean for AI.

### 2.7 Cost Analytics  *(Level 3 — NEW)*
- **Purpose:** operational cost per trip / bidang / vehicle, by joining reimbursement data (`js/reimbursement.js`) into the engine.
- **Audience:** finance / leadership.
- **Business value:** the missing money dimension — analytics currently has **zero rupiah**.
- **Roadmap:** flagged Q4 2026 in the prototype roadmap; the Cost analyzer + `currency` KPI format are designed for it now.

### 2.8 Odometer Analytics  *(Level 3)*
- **Purpose:** distance per driver/vehicle/bidang, avg per trip, odometer data coverage.
- **Audience:** operations / maintenance.
- **Business value:** resource consumption + maintenance proxy; coverage % becomes a data-quality signal.
- **Roadmap:** odometer is the input to predictive maintenance scheduling.

### 2.9 Insights  *(Level 4)*
- **Purpose:** auto-generated, human-readable findings with severity (crit/warn/info/good).
- **Audience:** everyone — the narrative layer.
- **Business value:** turns numbers into meaning; formalizes today's 3-bullet highlights (app.js:4685).
- **Roadmap:** Insight Engine output is the AI Assistant's natural-language substrate + anomaly detection base.

### 2.10 Recommendations  *(Level 4 — NEW)*
- **Purpose:** prescriptive next actions (redistribute load, schedule maintenance, consolidate routes) with rationale.
- **Audience:** operations lead / decision-makers.
- **Business value:** moves analytics from *descriptive* to *prescriptive* — net-new capability.
- **Roadmap:** the Recommendation Engine interface is shared with future AI-generated recommendations.

### 2.11 Export Center  *(Level 4)*
- **Purpose:** PDF (exists), Excel (new), Print (new) — all from the same `AnalyticsModel`.
- **Audience:** anyone producing reports for meetings/records.
- **Business value:** export consistency — screen and document never diverge.
- **Roadmap:** every future module exports through the same Document Engine; the AI Assistant can trigger an export as an action.

---

## 3. Navigation structure

```
Analytics
├── Executive Summary            (Level 1 — always visible, top)
├── Operational Highlights       (Level 2 — editorial trio, clickable → drills into Level 3)
├── Deep Analytics               (Level 3 — segmented tabs)
│   ├── Operational Trends       (default)
│   ├── Driver
│   ├── Vehicle
│   ├── Bidang  (+ Destination)
│   ├── Cost                     (new)
│   └── Odometer
├── Intelligence                 (Level 4)
│   ├── Insights
│   └── Recommendations          (new)
└── Export Center                (Level 4 — PDF · Excel · Print)
```

- **Filter bar is global** (date range + driver/vehicle/bidang) and applies across all levels — preserving today's behavior (app.js:4214) where all sections respect all four filters.
- **Highlights drill into Deep Analytics** (prototype `onPick` pattern in overview.jsx) — clicking "Driver Paling Aktif" jumps to the Driver tab pre-filtered.
- The segmented control (`AnalyticsTabs`) keeps the page short while keeping all data one click away.

---

## 4. Mapping: today → V2

| Today (flat sections, app.js:4864) | V2 home |
|------------------------------------|---------|
| Overview row (4 cards) | Executive Summary (Level 1) |
| Insight highlights (3 bullets) | Insights (Level 4) + Highlights (Level 2) |
| Ringkasan Operasional | Operational Trends (Level 3) |
| Utilisasi Driver | Driver Analytics (Level 3) |
| Utilisasi Kendaraan | Vehicle Analytics (Level 3) |
| Sumber Daya Tidak Aktif | folded into Driver/Vehicle utilization grids |
| Analitik Tujuan | Destination Analytics (under Bidang/Trends) |
| Permintaan per Bidang | Bidang Analytics (Level 3) |
| Odometer & Jarak Tempuh | Odometer Analytics (Level 3) |
| Data Quality Resolution Center | Governance surface (see GOVERNANCE_RECOMMENDATION.md) |
| *(none)* | Cost Analytics (new) |
| *(none)* | Recommendations (new) |
| PDF export button | Export Center (PDF + Excel + Print) |

---

## 5. Roadmap compatibility summary

Every section is designed so the **same IA serves future modules** (Driver Ops → Engineering →
Inventory → Cost → Maintenance) by swapping the analyzers behind identical layout/components, and so
the **AI Operations Assistant** plugs in at Levels 1 & 4 (summary, insights, recommendations, export
actions) without IA changes.
