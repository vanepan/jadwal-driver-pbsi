# Sprint 6 — Trend Engine Foundation (v1.10.0)

Transforms Analytics V2 from snapshot analytics into **comparison** analytics: it can now
answer **"what changed?"** by comparing the current period to the previous equal-length period.
Deterministic, explainable, traceable, reproducible — **no AI, no prediction, no KPI formula
changes, no existing analytics value changed** (proved by `parity-check.mjs`).

## Architecture

The Trend Engine diffs values the Analytics Engine **already** computed — it performs no new
KPI math.

```
refreshAnalyticsDisplay (app.js)
  │  derivePreviousPeriod(dateRange)            ← analytics-period.js (Phase 3)
  │     → { prevNow, windowEnd }  | { available:false }  ('all')
  │
  ├─ previousModel = computeAnalyticsModel({ ...ctx, now: prevNow, windowEnd })
  │     windowEnd = inclusive upper bound → previous window is isolated (no leakage)
  │
  └─ currentModel  = computeAnalyticsModel({ ...ctx, previousModel })
        engine: model.trends = generateTrends(current, previous)   ← analytics-trends.js
                (set BEFORE insights/recommendations → single generation pass)
```

### Why an explicit `windowEnd`
The engine filters assignments `_asgDate >= cutoff` with **no upper bound**, so simply shifting
the clock back would let current-period records leak into the previous window. `derivePreviousPeriod`
returns both a shifted `prevNow` (reproduces the previous window's lower bound via the engine's own
cutoff math) and a `windowEnd` (the inclusive upper bound). Both are **optional** engine inputs —
absent on the normal call, so current-period KPIs are byte-identical to before.

### Adjacent, non-overlapping windows
| range | N  | current            | previous            |
|-------|----|--------------------|---------------------|
| today | 1  | {now}              | {now-1}             |
| 7d    | 7  | [now-6 .. now]     | [now-13 .. now-7]   |
| 30d   | 30 | [now-29 .. now]    | [now-59 .. now-30]  |
| 90d   | 90 | [now-89 .. now]    | [now-179 .. now-90] |
| all   | —  | (no fixed length → comparison unavailable)         |

## Trend contract (`generateTrends`)
Per metric: `{ current, previous, delta, percentChange, direction, tone }`.
- `percentChange` = `round(delta / previous * 100)`, **`null` when previous == 0** (no divide-by-zero).
- `direction` = raw movement (`up`/`down`/`neutral`).
- `tone` = goodness for color (`positive`/`negative`/`neutral`): up is good for Completion Rate,
  bad for Open Rate / Cancellation Rate, neutral/informational for Total Assignments.

Sources (the 4 required KPIs only): **Total Assignments, Completion Rate, Open Rate, Cancellation Rate**.
Optional utilization/bidang-demand trends were intentionally left out of this sprint.

## UI
- **KPI indicators (Phase 6):** Completion Rate and Total Assignments overview cards show a `▲/▼ %`
  badge, colored by `tone`. `renderTrendIndicator` gained optional tone-based coloring (backward
  compatible). Cards without a trend source show no badge — never fabricated.
- **Operational Trends section (Phase 9, was a placeholder):** a 4-card grid (`renderKPIGrid` +
  `renderAnalyticsKPICard`) of the 4 KPIs vs the previous period.
- **States (Phase 10):** `available` → arrows; `insufficient` (prior period had no activity) →
  neutral cards + calm note; `unavailable` ('Semua Data') → note prompting a bounded range. Never fabricated.
- **Insights/Recommendations (Phases 7-8):** optional, guarded `(Trend)`-tagged references, emitted
  only when valid trend data exists; identical output when there is no previous period.

## Files
- **New:** `js/analytics/analytics-period.js`, `Analytics-V2/trend-check.mjs`, this notes file.
- **Changed:** `analytics-model.js` (+`trends` bucket), `analytics-types.js` (+`TrendMetric` typedef),
  `analytics-engine.js` (`windowEnd` filters + `previousModel`→`generateTrends`), `analytics-insights.js`
  & `analytics-recommendations.js` (guarded trend references), `analytics-shell.js`
  (`renderTrendIndicator` tone), `js/app.js` (orchestration + indicators + Operational Trends),
  `js/config.js` (v1.10.0), `service-worker.js` + `version.json` (via `sync-version.mjs`).

## Verification
```
node Analytics-V2/trend-check.mjs            # determinism, direction/percent/tone, isolation, missing history, additive
node Analytics-V2/parity-check.mjs           # existing analytics unchanged when trends absent
node Analytics-V2/insights-check.mjs
node Analytics-V2/recommendations-check.mjs
```
Manual: Admin → Analytics. On `30 Hari`, Completion Rate / Total Assignments cards show arrows and
the Operational Trends section lists 4 trend cards; on `Semua Data`, the section shows the calm
"comparison unavailable" note (no arrows); at mobile width the cards stack one-column (no horizontal scroll).
