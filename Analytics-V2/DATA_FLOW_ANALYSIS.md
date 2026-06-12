# Analytics V2 — Data Flow Analysis & Engine Architecture

**Project:** Sarpras Operations · v1.10.0 — Analytics Experience Redesign
**Phase:** 3 (Reusable Analytics Architecture) + current-state data-flow audit
**Status:** Architecture review — no code written
**Last updated:** 2026-06-12

---

## PART A — Current data flow (as-built)

```
Firebase RTDB
  /assignments ──────┐
  /driver_requests ──┤
  /drivers ──────────┤   onValue listeners (firebase.js, *-store.js)
  /vehicles ─────────┤
  /settings ─────────┘
        │  hydrate module-scope arrays: assignments[], requests[], + stores
        ▼
  refreshAnalyticsDisplay()            ← app.js:4310  (ONE function, ~850 lines)
        │
        ├─ 1. date cutoff + filter assignments  (driver/vehicle/bidang/date)
        ├─ 2. filter requests
        ├─ 3. compute ~30 metrics inline (status, workload, util, bidang, odo, DQ)
        ├─ 4. snapshot → _lastAnalyticsModel          ← app.js:4492 (export seam)
        ├─ 5. build giant HTML string → contentEl.innerHTML
        └─ 6. _renderAnalyticsCharts(...)   create 6 Chart.js charts
        ▼
  DOM (.v2-analytics-sections)
        │
        └─ exportAnalyticsReport() → DocumentEngine.generateAndOpen('analytics-summary', vm)
                                          ▲ reads _lastAnalyticsModel
```

### What's wrong with this flow

| Problem | Evidence | Impact |
|---------|----------|--------|
| **Compute and presentation are fused** | metrics are computed and `innerHTML`-interpolated in the same pass (app.js:4373–4863) | Cannot reuse a single metric without running the whole render; cannot unit-test math |
| **No typed model** | the only structured output is `_lastAnalyticsModel`, and only for the PDF | Screen and export risk drift (mitigated today only because both read the same snapshot) |
| **No governance gate** | filters are date/entity only; no classification filter | Polluted aggregates (see `GOVERNANCE_RECOMMENDATION.md`) |
| **Full recompute + full DOM rebuild every change** | `_destroyAnalyticsCharts()` + `innerHTML =` on each refresh | Scales poorly; flicker; chart churn |
| **Single-period only** | cutoff yields one window; no prior-period computed | No trends, no deltas, no comparisons |
| **Charts ignore design tokens** | hardcoded hex + `'Inter'` (app.js:5528–5546) | Theming/brand drift from DESIGN_SPEC |

### What's right (preserve these seams)

- `_lastAnalyticsModel` is a genuine **view-model snapshot** — the correct decoupling pattern, just under-used.
- The **Document Engine** (`js/docs/`) is already a clean, backend-agnostic export pipeline with a pluggable exporter (`getExporter`) and template registry — exactly the target Export Engine shape.
- The **alias + duplicate-detection engine** is already a de-facto governance layer.

---

## PART B — Target architecture

```
            Database (Firebase RTDB)
                    │   raw collections (unchanged, read-only for analytics)
                    ▼
        ┌───────────────────────────────┐
        │   GOVERNANCE LAYER             │   classification filter · alias resolution · DQ
        └───────────────────────────────┘
                    │   governed projection (typed)
                    ▼
        ┌───────────────────────────────┐
        │   ANALYTICS ENGINE             │   pure functions, domain analyzers
        │   assignment / driver / vehicle│
        │   bidang / destination / odo / │
        │   cost                         │
        └───────────────────────────────┘
                    │   AnalyticsModel (typed)
          ┌─────────┼─────────┐
          ▼         ▼         ▼
       KPI       Insight   Recommendation
      Engine     Engine      Engine
          └─────────┼─────────┘
                    ▼
            DASHBOARD (V2 components)
                    │
                    ▼
            EXPORT ENGINE (PDF · Excel · Print)   ← existing Document Engine, extended
                    │
                    ▼
        AI OPERATIONS ASSISTANT (future — consumes AnalyticsModel + insights)
```

**Core idea:** one **pure compute pipeline** produces a single typed `AnalyticsModel`. Everything that
renders or exports — screen, PDF, Excel, print, and later the AI Assistant — consumes *that same model*.
Compute once, render many. This permanently kills screen/export drift.

---

### B.1 Governance Layer

Single entry: `buildGovernedDataset(raw, options)`. Responsibilities:
- Filter records by `isAnalyticsEligible()` (see `GOVERNANCE_RECOMMENDATION.md`).
- Apply alias/canonical resolution (relocate existing `_getAnalyticsAliases` / `_getAliasCanonical`).
- Compute duplicate-detection warnings (relocate existing `_detectSimilarPairs` / `_strSimilarity`).
- Output: `{ assignments, requests, drivers, vehicles, aliases, dqWarnings }` — all production-eligible.

Invariant preserved: **raw collections are never mutated**; this layer returns projections only.

### B.2 Analytics Engine (domain analyzers)

Pure functions, each taking the governed dataset + a resolved period, returning a typed sub-model.
Module-agnostic by construction — Engineering/Inventory/Maintenance later add their own analyzers
behind the same interface.

| Analyzer | Carries forward from today | New in V2 |
|----------|----------------------------|-----------|
| `assignmentAnalytics` | status buckets, completion rate, open rate (app.js:4373) | trend series, lifecycle funnel, period delta |
| `driverAnalytics` | workload counts, **mean±stdDev classification** (app.js:4434), most/least active | utilization %, fairness index |
| `vehicleAnalytics` | usage counts, idle detection (app.js:4396) | true utilization ratio, over-use → maintenance hook |
| `bidangAnalytics` | req/asg join via `requestId`, share % (app.js:4411) | demand trend |
| `destinationAnalytics` | top-N by frequency w/ alias resolution (app.js:4459) | distance concentration |
| `odometerAnalytics` | per driver/vehicle/bidang km, avg/trip (app.js:4505) | efficiency trend |
| `costAnalytics` (NEW) | — | join reimbursement data; cost per trip/bidang/vehicle |

**Period handling (new):** a `resolvePeriod(range)` util returns `{ current, previous }` windows so
every analyzer can emit a period-over-period delta — the foundation for the prototype's ±% trend chips.

### B.3 KPI Engine

Standardizes metric shape so any module + any export renders identically:
```ts
interface KPI {
  id: string; label: string;
  value: number | string; fmt: 'int'|'pct'|'pct1'|'km'|'km1'|'currency'|'ratio';
  delta?: number;          // period-over-period
  trendTone?: 'up'|'down'|'flat';
  sub?: string; icon?: string;
  tier: 'executive'|'section';
}
```
Centralizes: KPI calculation, trend/delta calc, period comparison. Fixes the current duplication
(e.g. Completion Rate vs completion-ratio string — `KPI_ENGINE` defines it once).

### B.4 Insight Engine

Turns model facts into **human-readable** findings. Production already does a primitive version
(top-3 descriptive bullets, app.js:4685). V2 formalizes:
```ts
interface Insight { id; severity:'crit'|'warn'|'info'|'good'; title; description; relatedEntities? }
```
Includes an **anomaly-detection foundation**: reuse the existing mean±stdDev approach (already proven
for workload) generically — flag entities/periods deviating > 1σ. Descriptive only; no actions here.

### B.5 Recommendation Engine

The genuinely new capability: **prescriptive** output.
```ts
interface Recommendation { id; priority:'high'|'med'|'low'; title; rationale; suggestedAction; relatedEntities? }
```
Seeds from rules grounded in existing metrics:
- workload `over` count > 0 → "Redistribusi N penugasan dari {driver} ke {under-utilized}".
- vehicle utilization > threshold → "Jadwalkan perawatan {vehicle} (over-utilisasi)".
- idle resources → capacity recommendation.
Same interface later backs AI-generated recommendations.

### B.6 Export Engine

**Reuse the existing Document Engine** (`js/docs/doc-engine.js`, `template-registry.js`,
`pdf-exporter.js`) — it already matches the target shape. Extend, don't rewrite:
- **PDF** — exists (`analytics-summary` template). Re-point it to consume the new `AnalyticsModel`.
- **Excel** — add an exporter behind the existing `getExporter(backend)` seam.
- **Print** — `print-manager.js` already exists; wire an analytics print view.

Key property retained: exports consume the **same `AnalyticsModel`** the screen renders → guaranteed
consistency (eliminates the snapshot-only coupling that protects this today).

### B.7 Future AI Layer

The AI Operations Assistant consumes the **typed `AnalyticsModel` + Insights + Recommendations** —
not raw Firebase. Because the model is already governed (production-only, alias-resolved, audited) and
typed, it is a safe, structured context for an LLM. This is why governance + typed model are
prerequisites, not follow-ups.

---

## PART C — Target data flow (end state)

```
raw collections
     ▼
buildGovernedDataset()                 // governance + alias + DQ
     ▼
resolvePeriod(range) → {current, previous}
     ▼
runAnalytics(governed, period)         // all domain analyzers (pure)
     ▼
AnalyticsModel  ──►  KPIEngine / InsightEngine / RecommendationEngine
     │
     ├──► Dashboard components (memoized per filter+dataset key)
     ├──► Export Engine (PDF / Excel / Print)  — same model
     └──► AI Operations Assistant              — same model
```

**Memoization:** cache `AnalyticsModel` keyed by `(governedDatasetVersion, filters)` so re-renders on
unrelated state changes are free — directly addresses the "full recompute every change" defect.

---

## Recommendations

1. Split `refreshAnalyticsDisplay()` into **Governance Layer → Analytics Engine → KPI/Insight/Recommendation → render**, with a single typed `AnalyticsModel` as the contract.
2. Make **all analyzers pure functions** (no DOM, no Firebase) so they are testable and reusable across modules and exports.
3. Introduce **period comparison** (`{current, previous}`) as a first-class engine concept.
4. **Reuse** the Document Engine for exports; add Excel/Print behind its existing exporter seam.
5. **Memoize** the model; stop rebuilding all DOM + all charts on every filter change.
6. Make charts **token-driven** so they honor DESIGN_SPEC theming.
