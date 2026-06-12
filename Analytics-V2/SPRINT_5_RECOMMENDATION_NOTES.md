# Sprint 5 — Recommendation Engine Foundation · Notes

**Project:** Sarpras Operations · v1.10.0
**Scope:** Advisory layer ("what should we do?") via deterministic rules. No AI/LLM/prediction/ML. KPI/chart/insight/export/governance values unchanged.
**Date:** 2026-06-12

---

## 1. What changed

### New module: `js/analytics/analytics-recommendations.js` — Recommendation Engine
- `generateRecommendations(model)` — **pure**, `(AnalyticsModel) → Recommendation[]`. No DOM/HTML/Firebase/clock/random → deterministic.
- Driven by existing metrics (the same findings the Insight Engine uses) — **no new calculations**.
- `RECOMMENDATION_PRIORITY = {RISK:1, OPTIMIZATION:2, INFO:3}`; output sorted by priority asc, then stable insertion order.

**Recommendation contract** (also in `analytics-types.js`):
```
{ type: 'action'|'warning'|'optimization', title, description, source, priority }
```

**Rules → sources (all traceable):**
| Condition | Recommendation | type / priority | source |
|-----------|----------------|-----------------|--------|
| Completion < 50% | Tinjau penyebab penyelesaian rendah | warning / 1 | Completion Rate |
| Open rate > 50% | Tinjau backlog penjadwalan | action / 1 | Open Rate |
| Cancelled ≥ 20% | Tinjau alur persetujuan penugasan | action / 1 | Cancelled Assignments |
| Workload over > 0 | Seimbangkan distribusi beban driver | optimization / 2 | Driver Workload Distribution |
| Idle vehicles | Tinjau utilisasi armada | optimization / 2 | Inactive Resources |
| Idle drivers | Tinjau alokasi driver | optimization / 2 | Inactive Resources |
| DQ duplicates | Tinjau normalisasi data tujuan/entitas | action / 3 | Data Quality |

### `js/analytics/analytics-engine.js`
After insights, attaches `model.recommendations = generateRecommendations(model)`. No calculation change → parity preserved.

### `js/analytics/analytics-model.js`
`buildAnalyticsModel` now defaults `recommendations: []` (shape-stable).

### `js/analytics/analytics-shell.js`
- `renderRecommendationCard({type,title,description,source})` — **reuses the insight-card architecture/CSS**; maps advisory type → accent + action-oriented icon (action ➡️ / optimization 💡 / warning ⚠️); escapes inputs internally; carries `data-rec-type`.
- `renderRecommendationList(cards)` — list wrapper.
- `ANALYTICS_SECTION_ORDER` now includes `analyticsRecommendations`.

### `js/app.js`
- New **Recommendations section** (`#analyticsRecommendations`, "Rekomendasi Operasional"), placed after Insights, driven entirely by `model.recommendations`. Empty state when none. No inline generation, no hardcoded cards.

---

## 2. Success criteria honored
- **Deterministic:** pure rule function, no clock/random; identical across runs (validated).
- **Traceable:** every recommendation names a `source` metric/insight (validated).
- **Explainable:** title + description tie to measurable values; no vague advice.
- **Actionable:** each is a concrete next step ("Tinjau backlog penjadwalan", "Seimbangkan distribusi beban driver").
- **No fabrication:** empty data → zero recommendations (validated); no AI, no prediction.

---

## 3. Verification
- `node Analytics-V2/recommendations-check.mjs` → **RECOMMENDATIONS OK** (12/12): populated, traceable, valid type/priority, explainable, sorted, deterministic across runs, advises on backlog + cancellation + fleet utilization, ≥1 priority‑1, and **none from empty data**.
- `node Analytics-V2/insights-check.mjs` → **INSIGHTS OK** (unchanged).
- `node Analytics-V2/parity-check.mjs` → **PARITY OK** (9/9) — engine compute values unchanged.
- `node --check --input-type=module` passes on all analytics modules + `app.js`.

---

## 4. Mobile review (Phase 8)
Recommendation cards reuse the insight-card layout: single-column stacking list, `min-width:0` body, `overflow-wrap:anywhere` descriptions → long text wraps, no truncation, no horizontal scroll.

---

## 5. Deliverables
| # | Deliverable | Status |
|---|-------------|--------|
| 1 | Recommendation model | ✅ contract + `model.recommendations` |
| 2 | Recommendation engine | ✅ `generateRecommendations()` pure |
| 3 | Recommendation sources | ✅ from insights/metrics, source-tagged |
| 4 | Traceability | ✅ every rec → source |
| 5 | Recommendation card system | ✅ card + list (reuses insight architecture) |
| 6 | Recommendations section activated | ✅ driven by `model.recommendations` |
| 7 | Prioritization | ✅ 1=risk / 2=optimization / 3=info, deterministic |
| 8 | Mobile review | ✅ |

## 6. Analytics V2 stack now
governed engine → model → KPI cards + unified charts + **insights** + **recommendations**, all parity-preserving.

## 7. Note
Validated via the recommendation/insight/parity harnesses + static checks. **Live browser smoke test still pending** (needs Firebase): confirm the Rekomendasi Operasional section lists advisory cards with risks sorted to the top.
