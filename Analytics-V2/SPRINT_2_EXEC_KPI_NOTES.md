# Sprint 2 — Executive Summary V2 + KPI Foundation · Notes

**Project:** Sarpras Operations · v1.10.0
**Scope:** Presentation + model consumption only. Engine, KPI formulas, charts, exports, governance — **untouched**. No value changes.
**Date:** 2026-06-12 · First user-visible Analytics V2 upgrade.

---

## 1. What changed

### `js/analytics/analytics-shell.js` — new reusable KPI system
| Export | Purpose |
|--------|---------|
| `renderAnalyticsKPICard({title,value,trend,comparison,icon,status,subtitle,loading})` | One reusable KPI card. Supports loading, empty value (`—`), and `status` accents (ok/warn/info). Module-agnostic (Driver/Engineering/Inventory/Cost/Maintenance). |
| `renderKPIGrid(cards[])` | Responsive grid — desktop 4 / tablet 2 / mobile 1 (pure CSS, no hardcoded per-KPI layout). |
| `renderTrendIndicator(trend)` | `{direction:'up'|'down'|'neutral', percent}`. **Neutral unless explicit up/down** — never fabricates a comparison. |
| `renderOperationalHighlights(items[])` | Surfaces existing analytics (most active driver / most utilized vehicle / top destination / top bidang) in executive form. No AI, no recommendations, no new computation. |

### `js/app.js` — Executive Summary V2 (`execContent`)
Replaced the legacy 7-row "Assignment Analytics" KPI list with:
- **KPI Grid** (4 cards) — Total Assignments, Selesai, Completion Rate, Open Rate — values + status logic identical to the old rows, read from `_analyticsModel.kpis`.
- **Operational Highlights** — Driver Paling Aktif, Kendaraan Terutilisasi, Tujuan Tersering, Bidang Teraktif (from existing model outputs; `null`-safe).
- **Quick Summary** — remaining status detail (Berlangsung / Dijadwalkan / Dibatalkan) + the existing status donut chart (`chartAssignmentStatus`, unchanged).

The old free-text insight bullets (`insightsHtml`) are superseded by Operational Highlights (same facts, executive format). The Sprint-1 reserved `data-future="kpi-cards"` slot is now filled by the live grid.

### `platform.css` — new namespaced styles
`.v2-analytics-kpi-grid/-card/...`, `.v2-analytics-kpi-trend--up|down|neutral`, `.v2-analytics-highlights/-highlight`, `.v2-analytics-subhead`, `.v2-analytics-quick-summary-stats`, KPI skeleton. Namespaced `v2-analytics-*` to avoid the pre-existing `.v2-kpi-card` (used elsewhere). Uses existing design tokens (`--surface`, `--border`, `--ok/-bg`, `--warn`, `--info`, `--muted`, `--faint`). Responsive at 1024px (→2) and 600px (→1).

---

## 2. Model integration (Phase 6)
- The Executive Summary now reads `_analyticsModel.kpis` directly for KPI values and existing `model.render` outputs for highlights — **no DOM parsing, no duplicated calculations, no re-aggregation**.
- Everything below the Executive Summary (Driver/Vehicle/Bidang/Destination/Odometer/DQ) is unchanged from Sprint 1.

## 3. Trend foundation (Phase 4)
- KPI cards accept `trend: {direction, percent}`. Period-over-period data does not exist yet, so all cards render the **neutral** state (`—`) with a tooltip — no fabricated values. The slot is architecture-ready for the future Trend Engine.

## 4. Why numbers cannot change
- `analytics-engine.js` not modified. KPI grid values come from `model.kpis`; highlights from `model.render` — same numbers as Sprint 0/1.
- Status chart keeps its canvas id → `_renderAnalyticsCharts()` renders the identical dataset.
- PDF export (`_lastAnalyticsModel`) untouched.

**Verification:**
- `node Analytics-V2/parity-check.mjs` → **PARITY OK** (9/9) — engine intact.
- `node --check --input-type=module` passes on `analytics-shell.js` and `app.js`.

## 5. Mobile review (Phase 7)
- Grid collapses 4→2→1 (1024px / 600px). KPI cards: `min-width:0`, title ellipsis, tabular-nums value (no overflow). Highlights: `word-break` on long names. No horizontal scrolling.

## 6. Deliverables
| # | Deliverable | Status |
|---|-------------|--------|
| 1 | AnalyticsKPICard created | ✅ |
| 2 | KPI Grid created | ✅ (4/2/1 responsive) |
| 3 | Executive Summary V2 created | ✅ KPI grid + highlights + quick summary |
| 4 | Trend foundation added | ✅ neutral-only, no fabrication |
| 5 | Operational Highlights created | ✅ surfaces existing model outputs |
| 6 | Mobile KPI layout validated | ✅ |
| 7 | AnalyticsModel integration improved | ✅ consumes `model.kpis` |

## 7. Out of scope (untouched, as required)
AI insights, Recommendation Engine, anomaly detection, health score, governance UI, chart redesign, export redesign — all deferred.

## 8. Note
Validated via parity harness + static checks; **live browser smoke test still pending** (needs Firebase) — confirm KPI cards render, status chart draws, and the grid collapses on a narrow viewport.
