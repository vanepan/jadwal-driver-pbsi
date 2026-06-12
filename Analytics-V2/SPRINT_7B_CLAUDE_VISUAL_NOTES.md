# Sprint 7B — Claude Design Visual-Language Migration (v1.10.2)

Adapts the production Analytics experience to the **approved Claude Design prototype**
(`Analytics-V2/*.jsx` + `analytics.css` + `styles.css`) — the source of truth. Where Sprint 7A
fixed the information architecture, 7B replaces the *visual language*: a typography-first, de-boxed,
Apple-style operational-intelligence experience. **Presentation only** — no engine, KPI, chart
dataset, trend, insight, or recommendation value changed (the four harnesses still pass).

## Scope mechanism
Everything is scoped under a single class **`.v2-analytics-claude`** on `#v2AdminSectionAnalytics`
(set in `js/app.js`). The prototype's design tokens (surfaces, text, accent, semantic `--c-*`,
shadows, radii) and fonts (**Archivo / Manrope / JetBrains Mono**) are redefined only within that
scope (light + `[data-theme="dark"]`), so the rest of the production app is visually untouched and
dark mode is a *proper* dark surface set, not an inverted light theme. Fonts were added to the
existing Google Fonts `<link>` in `index.html` (Inter/JetBrains Mono stay for the rest of the app).

## What changed (visual)
- **Keynote hero (de-boxed):** a derived operational-health **verdict** ("Operasi berjalan sehat") +
  a **0–100 health score** in a draw-animated **ring gauge** + three big stats with real
  period-over-period deltas. The score is computed in the **presentation layer** purely from values
  the engine already produced:
  `score = clamp(round(0.45·compRate + 0.25·(100−openRate) + 0.20·(100−cancRate) + 0.10·max(0,100−p1·25)))`
  where `p1` = count of Priority-1 insights + recommendations. Verdict/grade/colour by threshold
  (≥85 sangat efisien · ≥70 sehat · ≥50 cukup · <50 perlu perhatian). No engine change, no fabrication.
- **Custom SVG icon system (no emoji):** `anIcon(name,…)` in `analytics-shell.js` ports the prototype
  `PATHS` (one consistent outline stroke set). **Every emoji removed** (KPIs, tabs, insights, export,
  header button, error state).
- **Eyebrow section scaffold** (tag · title · sub · hairline) + whitespace/`--sec-gap` rhythm instead
  of nested cards. Cards are kept only for the detailed Resource panels and charts.
- **Editorial highlights trio** that deep-links into Resource tabs (`data-action="goto-resource"`).
- **Premium segmented control** (prototype `.seg`) for Resource Analytics.
- **Operational Health** as a single de-boxed **divider insight list** (`.insights/.insight`) with
  severity + Wawasan/Rekomendasi tags — ordered by the priority each engine already emits (P1→P3).
- **Operational Trends** as a de-boxed `.statrow` of the 4 Trend KPIs + the status donut in a card.
- **Export Center** restyled with prototype `.btn`/`.btn-primary` + file/sheet/printer icons.

## Micro-animations (calm, 200–1200ms)
`_animateAnalyticsRegion()` (app.js) drives **count-up** numbers (`[data-countup]`, ease-out-cubic via
rAF) and **ring-gauge draw** (`stroke-dasharray` 0→target). CSS keyframes handle **fade-up** (sections),
**stagger** (insight rows via nth-child delay), **panel-enter** (`deep-panel`), and the hero **attention
pulse**. `_switchAnalyticsTab` replays the panel animation + count-up and resizes Chart.js charts on
show. **All gated** by `prefers-reduced-motion` and `[data-anim="off"]` (values set immediately,
fully visible — capture/print safe).

## Files
- `index.html` — Archivo + Manrope added to the font link.
- `js/analytics/analytics-shell.js` — SVG icon system + new string primitives (`anIcon`, `renderEyebrow`,
  `renderRingGauge`, `renderHeroSection`, `renderHighlights`, `renderInsightRow`,
  `renderInsightDividerList`, `renderSeg`); export restyled; legacy insight/rec cards de-emojified.
- `js/app.js` — `.v2-analytics-claude` scope class; `refreshAnalyticsDisplay()` re-skinned (hero +
  highlights + eyebrow sections + seg + de-boxed health/trends/export); health-score derivation;
  `_animateAnalyticsRegion` / `_animateCountUp` / `_scrollAnalyticsTo`; `_switchAnalyticsTab` updated
  for the seg control + animation replay; `goto-health` / `goto-resource` delegated actions; emoji removed.
- `platform.css` — scoped token layer (light + dark) + ported prototype CSS (hero, eyebrow, highlights,
  seg, card, statrow, insights, export) + scoped restyle of retained breakdown/KPI/DQ/header markup +
  keyframes + responsive (920/760/520; no horizontal scroll).
- `js/config.js` → v1.10.2 (+ `service-worker.js` / `version.json` via `sync-version.mjs`).

## Explicitly NOT changed
`analytics-engine.js`, `analytics-model.js`, `analytics-insights.js`, `analytics-recommendations.js`,
`analytics-trends.js`; every analytics value; chart datasets & canvas ids; the DQ + export data-action
wiring; the header toolbar's existing controls/handlers.

## Verification
- `node Analytics-V2/parity-check.mjs · trend-check.mjs · insights-check.mjs · recommendations-check.mjs` — all PASS (values unchanged).
- `node --check js/app.js` · `node --check --input-type=module < js/analytics/analytics-shell.js` — PASS.
- Manual (Admin → Analytics): keynote hero with count-up + ring draw; **zero emoji** (all SVG); de-boxed
  eyebrow sections; premium seg control + tab animation + chart resize; Operational Health divider list
  P1→P3; Export Center PDF matches the header button. **Dark mode**: proper dark surfaces. **Mobile
  (≤520px)**: hero preserved, stats/highlights stack, seg full-width, no horizontal scroll.
  `prefers-reduced-motion`/`[data-anim="off"]`: motion disabled, content fully visible.
