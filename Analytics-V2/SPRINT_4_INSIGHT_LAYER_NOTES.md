# Sprint 4 — Insight Layer Foundation · Notes

**Project:** Sarpras Operations · v1.10.0
**Scope:** Interpretation layer ("what happened?"). No new calculations, no recommendations, no AI. KPI/chart/export/governance values unchanged.
**Date:** 2026-06-12

---

## 1. What changed

### New module: `js/analytics/analytics-insights.js` — Insight Engine
- `generateInsights(model)` — **pure** function, `(AnalyticsModel) → Insight[]`. No DOM, no HTML, no Firebase, no `Date`/random → deterministic.
- Reads **only existing model outputs** (`model.kpis`, `model.render`, `model.diagnostics`) — performs no new calculations.
- `INSIGHT_PRIORITY = {CRITICAL:1, IMPORTANT:2, GENERAL:3}`; output sorted by priority asc, then stable insertion order.

**Insight contract** (also in `analytics-types.js`):
```
{ type: 'info'|'success'|'warning', title, description, source, priority }
```

**Insight sources** (all from existing outputs, each `source`-tagged):
Completion Rate · Open Rate · Cancelled Assignments · Driver Workload Distribution · Inactive Resources · Data Quality · Driver Workload · Vehicle Utilization · Destination Analytics · Bidang Demand.

### `js/analytics/analytics-engine.js`
Two-line addition: after building the model, `model.insights = generateInsights(model)`. **No calculation change** — KPI/chart/export values are untouched (the parity harness, which compares `render` + `exportSnapshot`, still passes).

### `js/analytics/analytics-shell.js`
- `renderInsightCard({type,title,description,source})` — reusable card (info/success/warning), escapes its inputs internally (`_escHtml`). Future-ready for recommendation cards.
- `renderInsightList(cards)` — vertical list wrapper.

### `js/app.js`
- Insights section **activated** (`#analyticsInsights`, titled "Wawasan Operasional"): driven entirely by `model.insights` mapped through `renderInsightCard` — **no inline insight generation, no hardcoded cards**. Empty state when there are no insights.

### `platform.css`
`.v2-analytics-insight-list/-card/-card--{info,success,warning}/-icon/-body/-title/-desc/-source`. Uses existing tokens; descriptions use `overflow-wrap:anywhere` (no truncation).

### `js/analytics/analytics-types.js`
`Insight` typedef updated to the Sprint-4 contract.

---

## 2. Safety rules honored (Phase 7)
- **Deterministic:** pure function, no clock/random; identical output across runs (validated).
- **Traceable:** every insight names a `source` metric (validated).
- **Explainable:** every insight has title + description tied to measurable values; no vague claims ("performance is excellent" only ever appears as a measured "Tingkat penyelesaian tinggi (X%)").
- **No fabrication:** empty data → zero insights (validated); no speculation, no AI summaries.

---

## 3. Verification
- `node Analytics-V2/insights-check.mjs` → **INSIGHTS OK** (11/11): populated, traceable, valid type/priority, explainable, sorted, deterministic across runs, detects backlog + cancellation + a priority-1 finding, and **no insights from empty data**.
- `node Analytics-V2/parity-check.mjs` → **PARITY OK** (9/9) — engine compute values unchanged.
- `node --check --input-type=module` passes on all four analytics modules + `app.js`.

---

## 4. Mobile review (Phase 8)
- Insight cards stack in a single-column flex list at every width; `.v2-analytics-insight-body` is `min-width:0` and descriptions use `overflow-wrap:anywhere` → long text wraps, never truncates, no horizontal scroll. Icon is `flex-shrink:0`.

---

## 5. Deliverables
| # | Deliverable | Status |
|---|-------------|--------|
| 1 | Insight model created | ✅ contract in types + model.insights |
| 2 | Insight engine created | ✅ `generateInsights()` pure |
| 3 | Insight prioritization | ✅ 1/2/3, deterministic sort |
| 4 | Insight card component | ✅ `renderInsightCard()` |
| 5 | Insights section activated | ✅ driven by `model.insights` |
| 6 | AnalyticsModel integration | ✅ engine attaches `model.insights` |
| 7 | Mobile review | ✅ |

## 6. Out of scope (untouched)
Recommendation Engine, AI/LLM, anomaly detection, governance UI, trend engine, export redesign — deferred. The Insight card is intentionally shaped so recommendation cards can reuse it later.

## 7. Note
Validated via the insight + parity harnesses and static checks. **Live browser smoke test still pending** (needs Firebase): confirm the Wawasan Operasional section lists insight cards, warnings sort to the top, and cards wrap cleanly on a narrow viewport.
