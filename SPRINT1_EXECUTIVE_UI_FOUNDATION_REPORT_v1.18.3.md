# Sprint 1 — Executive UI Foundation · Report
### v1.18.3 · Sarpras Operations · Unified Executive Analytics UI

**Scope:** Foundation only. Presentation primitives. **No** business logic / Firebase / engine /
scoring / analytics touched. **No** production module migrated. **Zero** intended visual change.
Migration begins Sprint 2 (Vehicle Management).

Authority: Analytics Driver (`analytics-shell.js` + `.v2-analytics-claude` in `platform.css`).
No second design language was invented.

---

## 1. Architecture Summary

The Executive UI Kit is a **thin facade over the existing canonical authority**, plus the two
genuinely-new primitives the blueprint identified (Table, Drawer) and the small de-boxed builders
that the foreign dashboards each hand-rolled.

```
js/analytics/executive-ui-kit.js   ← THE single public import surface
   ├── re-exports canonical primitives (analytics-shell.js) under Executive* names
   ├── adds small builders: Header, Toolbar, FilterBar, Search, Reset, Badge,
   │                        Metric, Card, Sparkline, KPICard(+spark), Export, States
   ├── ExecutiveTable   → js/analytics/executive-table.js   (new primitive)
   └── ExecutiveDrawer  → js/analytics/executive-drawer.js  (new primitive)

js/analytics/analytics-shell.js    ← anIcon extended (single icon engine)
platform.css                       ← additive `.exec-*` CSS (new classes only)
```

**Token strategy (the key safety decision).** The kit does **not** mutate `:root`. It reuses the
canonical `.v2-analytics-claude` token authority. Components rendered inside an analytics module
inherit those tokens from the ancestor; the drawer (which attaches to `<body>`) carries
`class="exec-ui v2-analytics-claude"` so it inherits the **same set, including the dark-mode
variant, for free**. `.exec-ui` defines **only** net-new tokens (z-index scale, motion duration/
easing, focus ring) — values that did not exist anywhere before, so **no collision is possible**.
Every component also carries literal fallbacks (`var(--radius-sm, 11px)`) to stay correct standalone.

Because every selector is a brand-new `.exec-*` class consumed by no production markup, and the
only edits to shared files are **additive keys** (icons) and an **appended block** (CSS), the
application renders byte-for-byte as before.

---

## 2. Files Created

| File | Purpose | Lines |
|------|---------|------:|
| `js/analytics/executive-ui-kit.js` | Single public API: re-exports + small builders + state family | ~270 |
| `js/analytics/executive-table.js` | The ONE table primitive (render + sort/keyboard enhancer) | ~210 |
| `js/analytics/executive-drawer.js` | The ONE drawer grammar (overlay/focus-trap/ESC/slots) | ~210 |
| `scripts/executive-ui-kit-check.mjs` | Foundation unit check (46 assertions) | ~95 |
| `SPRINT1_EXECUTIVE_UI_FOUNDATION_REPORT_v1.18.3.md` | This report | — |

## 3. Files Modified

| File | Change | Risk |
|------|--------|------|
| `js/analytics/analytics-shell.js` | **Additive** — 19 new glyphs in `AN_ICON_PATHS` (vehicle, motorcycle, ambulance, fleet, maintenance, history, insurance, tax, dispatch, recommendation, wellness, analytics, pettycash, drawer, timeline, search, sort, lock, offline). No existing path touched. | None (new object keys) |
| `platform.css` | **Additive** — one `.exec-*` block appended at EOF (tokens, header, toolbar, search, reset, badge, pill, metric, card, sparkline, table, drawer, state variants, reduced-motion). All new class names. | None (unused selectors) |

---

## 4. Executive UI Kit — API

**Import everything from one place:** `import { … } from './analytics/executive-ui-kit.js'`

**Canonical re-exports (one implementation, stable names):**
`anIcon` · `ExecutiveHero` · `ExecutiveRing` · `ExecutiveSection` · `ExecutiveKPICardBase` ·
`ExecutiveKPIGrid` · `ExecutiveTrend` · `ExecutiveCurrency` · `ExecutiveInsightCard` ·
`ExecutiveInsightList` · `ExecutiveScoreBreakdown` · `ExecutiveChartContainer` (+Loading/Empty/Error) ·
`ExecutiveExportCenter` · `ExecutiveSeg` · `ExecutiveTabPanels` ·
`ExecutiveEmptyState` · `ExecutiveLoadingState` · `ExecutiveErrorState`

**New builders:**
`ExecutiveHeader` · `ExecutiveToolbar` · `ExecutiveFilterBar` · `ExecutiveSearch` · `ExecutiveReset` ·
`ExecutiveBadge` · `ExecutiveMetric` · `ExecutiveCard` · `ExecutiveSparkline` · `ExecutiveKPICard`
(canonical card + opt-in mini sparkline) · `ExecutiveExport` (PDF/Excel/CSV/Print convenience) ·
`ExecutivePermissionState` · `ExecutiveOfflineState` · `escHtml`

**New primitives:**
`ExecutiveTable` + `bindExecutiveTable` + `ExecutiveStatusPill` ·
`ExecutiveDrawerOpen` / `ExecutiveDrawerClose` + `ExecutiveDrawerSection` / `…Metrics` / `…Timeline`

---

## 5. Component Contracts (selected)

**ExecutiveTable** `({columns, rows, caption?, empty?, stickyHeader?, dense?, ariaLabel?})`
- `columns: [{ key, label, align?, sortable?, width?, primary?, render?(v,row), sortValue?, pill?(v,row) }]`
- `rows: [{ id?, clickable?, rowLabel?, …cellsByKey }]` — cell may be a value or `{value, pill/tone, title, sort}`
- Emits sortable `<th aria-sort>`, numeric `.exec-td--r`, status pills, `data-row-id` rows.
- `bindExecutiveTable(host)` → client-side sort (numeric-aware, `localeCompare` fallback) + row activation
  (click / Enter / Space) firing a bubbling `exec-table:row` CustomEvent (`detail.id`). Idempotent.

**ExecutiveDrawer** `openExecutiveDrawer({title, subtitle?, icon?, body, footer?, onAction?, onClose?})`
- Slots composed via `ExecutiveDrawerSection`, `ExecutiveDrawerMetrics`, `ExecutiveDrawerTimeline`.
- Overlay + click-outside + ESC + focus-trap (Tab cycle) + focus restore. Single-instance.
- Mobile ≤640px → bottom-sheet. Honors `prefers-reduced-motion`. Footer buttons → `onAction(name, close)`.

**ExecutiveKPICard** `(p)` — passes all `renderAnalyticsKPICard` options through unchanged; if
`p.spark:number[]` is supplied, injects one `ExecutiveSparkline`. Existing canonical callers unaffected.

**ExecutiveExport** `({pdf?, excel?, csv?, print?, description?})` — each value is the `data-action`
string; omitted formats render a calm "Segera hadir" chip. Built on `renderExportCenter` (no fork).

---

## 6. Technical Debt Removed (enabled by this foundation)

Nothing is deleted **this** sprint (migration is forbidden); the foundation makes the following
removals possible in Sprints 2–6. Estimates measured from the audited files.

| Duplicate | Count today | After migration | Removable |
|-----------|:--:|:--:|----------|
| Injected CSS-in-JS stylesheets (`daa` 152 + `raa` 58 + `dwi` 91 + `vm-summary` 33 lines) | 4 | 0 | **~334 CSS lines** |
| Injected `<style>` STYLE_IDs (4 dashboards + 3 drawers `drx/dwd/vad`) | 7 | 0 | 7 injectors |
| KPI-card implementations (`daa-kpi`, `dwi-kpi`, `vms__kpi`, `raa-big`) | 4 | 1 | 3 |
| Boxed section shells (`daa-sec`, `dwi-sec`) | 2 | 0 (de-boxed) | 2 |
| Data tables (daa, dwi, petty inline, vm grid) | 4 | 1 | 3 |
| Drawer grammars (`vad`, `dwd`, `drx`) | 3 | 1 | 2 |
| Toolbars (`daa-top`, `dwi-top`, `vms__head`) | 3 | 1 | 2 |
| Status-pill systems (`daa-pill`, `dwi-pill`) | 2 | 1 | 1 |
| Toggle groups (`daa-toggle`, `dwi-toggle`) → `.seg` | 2 | 0 | 2 |
| Sparkline functions (verbatim ×3) | 3 | 1 | ~30 JS lines |
| Export-button strips (emoji `⬇️ PDF/Excel`) | 3 | 0 | 3 |
| Icon systems (`anIcon` + `renderIcon` + emoji) | 3 | 1 | 1 system + all emoji |
| Duplicated utils (`esc` ≥6, `fmtTime` ≥4, `stars` ×2, `rateClass` ×2) | ~14 | 1 each | ~120 JS lines |

**Net estimate:** ~**450–650 lines** removable across the migration sprints, plus collapse of 7
injected stylesheets into the single platform sheet, one icon engine, one spacing/token rhythm,
and **zero emoji** in UI chrome.

---

## 7. Migration Readiness

✅ One import surface (`executive-ui-kit.js`) — modules will `import` and swap render fns.
✅ Two missing primitives now exist (Table, Drawer) — the only net-new design work, done.
✅ One icon engine (`anIcon`) now covers every glyph the foreign modules need (vehicle, fleet,
   maintenance, dispatch, wellness, pettycash, timeline, …). `renderIcon` can be retired the moment
   Vehicle Management migrates.
✅ Token authority reused (no `:root` churn) → dark mode works by construction for new components.
✅ Foundation unit check (`executive-ui-kit-check.mjs`) green and re-runnable in CI.

**Sprint 2 recipe (Vehicle Management):** replace `fleet-dashboard.js` `.vms-*` KPIs with
`ExecutiveKPICard`/`ExecutiveKPIGrid`; swap `renderIcon` → `anIcon`; route the vehicle detail
drawer through `ExecutiveDrawerOpen`; delete `vm-summary-styles` + `vad-drawer-styles` injectors.
The Petty Cash inline table → `ExecutiveTable` is the smallest, lowest-risk proof if a warm-up is
preferred first.

---

## 8. Regression Results

| Check | Result |
|-------|--------|
| `node --check` on 4 new/modified ESM files | **PASS** (all 4) |
| `scripts/executive-ui-kit-check.mjs` | **PASS** — 46/46 assertions (icons resolve, no emoji, table structure, opt-in sparkline, export soon-chip) |
| `scripts/smoke-boot.mjs` (headless Chromium full boot) | **PASS** — version 1.18.3, login renders, push UI present, **0 fatal boot errors** (only expected unauthenticated Firebase `permission_denied`) |
| Production visual change | **None** — every kit selector is an unconsumed new class |

---

## 9. Risks

1. **`renderIcon` not yet deleted.** Deliverable 4 says "one icon engine." `anIcon` *is* now the
   single engine and superset; `renderIcon`/`icon-system.js` still ships because Vehicle Management
   consumes it and migration is forbidden this sprint. Deleting it now would change Vehicle's
   appearance (different fill-based glyphs) — a rule violation. **Mitigation:** retire it in Sprint 2
   with the Vehicle migration. Tracked.
2. **`platform.css` growth.** +~150 lines on an already-large (11.6k-line) file. Acceptable — it is
   the canonical single sheet and replaces ~334 lines of injected CSS once migration completes.
3. **New-icon glyph fidelity.** The 19 added paths are hand-authored outlines; they pass the
   non-empty-path check but should get a visual once-over when first consumed (Sprint 2). No runtime
   risk — unused until then.
4. **Table sort is DOM-reorder, not data-rebind.** Intentional (keeps the primitive stateless and
   dependency-free). Consumers needing server/data sort can ignore `sortable` and re-render. Documented.
5. **Kit is dormant.** Nothing imports it yet, so a broken kit would not surface in production until
   Sprint 2. **Mitigation:** the `executive-ui-kit-check.mjs` unit check exercises every primitive
   now and should run in CI before each migration sprint.

---

*Sprint 1 complete. Stable Executive UI Foundation in place; every future migration is now a
presentation-component swap.*
