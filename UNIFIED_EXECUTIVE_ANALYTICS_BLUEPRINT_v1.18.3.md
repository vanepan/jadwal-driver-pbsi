# Unified Executive Analytics UI — Master Architecture Blueprint
### v1.18.3 · Sarpras Operations
**Design authority:** Analytics Driver (`.v2-analytics-claude` + `analytics-shell.js`)
**Mandate:** Presentation only. Business logic frozen. No Firebase / engine / scoring changes.
**Quality target:** Apple HIG discipline × enterprise executive software.

> This is an **audit + architecture** document. It contains **no code changes**. It is the
> implementation blueprint for the unification work that follows.

---

## 0. Executive Finding (the one-paragraph truth)

Sarpras Operations does **not** have one analytics UI — it has **five parallel design systems**
and **three different icon systems**. Three modules (Driver, Executive, Petty Cash) already speak
the canonical "Claude" visual language. Four modules (Dispatch, Recommendation Accuracy, Driver
Wellness, Vehicle Management) speak a separate, boxed, emoji-driven, CSS-in-JS dialect that *looks
like a different application*. The fix is **not** a rewrite — it is **adopting the existing
canonical primitives** that already ship in `analytics-shell.js` and `platform.css`, and **deleting**
~330 lines of duplicated injected CSS plus a redundant icon system.

---

## 1. The Five Design Systems (ground truth)

| # | System | Scope class | Where it lives | Modules using it | Status vs authority |
|---|--------|-------------|----------------|------------------|---------------------|
| **A** | **Canonical "Claude"** | `.v2-analytics-claude` | `analytics-shell.js` + `platform.css` (~line 9324, 11036+) | Analytics Driver, **Executive**, **Petty Cash** | ✅ Authority |
| **B** | **DAA** | `.daa-*` | CSS-in-JS inside `dispatch-analytics-dashboard.js` (L34–185) | Dispatch Analytics, Recommendation Accuracy | ❌ Divergent |
| **C** | **RAA** (supplement of B) | `.raa-*` | CSS-in-JS inside `recommendation-accuracy-dashboard.js` (L35–92) | Recommendation Accuracy | ❌ Divergent |
| **D** | **DWI** (copy of B) | `.dwi-*` | CSS-in-JS inside `driver-wellness-dashboard.js` (L27–117) | Driver Wellness | ❌ Divergent (duplicate) |
| **E** | **VMS / VM / VAD** | `.vms-*`, `.vm-*`, `.vad-*` | `fleet-dashboard.js` CSS-in-JS (L29–61) + `platform.css` + `vehicle-detail-drawer.js` | Vehicle Management | ❌ Divergent |

### Icon systems (there are three)
1. **`anIcon()`** — canonical, in `analytics-shell.js`. One stroke set, 33 paths, `stroke="currentColor"`, no emoji. **Authority.**
2. **`renderIcon()`** — `icon-system.js`. A *second*, parallel SVG system (different names, fill-based glyphs). Used by Vehicle Management.
3. **Emoji literals** — 📊 🧑‍✈️ 🚐 🔁 🎯 🫀 ⬇️ 💡 ⚠️ 🎚️ 🗂️ 🔎 📈 📭 ✅ — hard-coded in DAA / RAA / DWI section titles and export buttons. **Explicitly forbidden** by the authority (Sprint 7B replaced every emoji with SVG).

---

## 2. The Canonical Vocabulary (what every module must match)

From `analytics-shell.js` + `platform.css`:

| Primitive | Canonical implementation | Key traits |
|-----------|--------------------------|-----------|
| **Section header** | `renderEyebrow({tag,title,sub})` → `.eyebrow` | **De-boxed.** Mono tag chip · Archivo h2 19px · faint sub · 1px hairline `.line`. No border, no card. |
| **Hero** | `renderHeroSection()` → `.hero` | Keynote: `clamp(30–52px)` display title, SVG health ring gauge, 3 big stats on whitespace. |
| **KPI card** | `renderAnalyticsKPICard()` → `.v2-analytics-kpi-card` | De-boxed, `inset 3px 0 0` status accent (not full border), trend indicator, responsive currency. |
| **KPI grid** | `renderKPIGrid()` → `.v2-analytics-kpi-grid` | 4 / 2 / 1 responsive. `.v2-exec-kpi-grid` = 6-up variant. |
| **Segmented control** | `renderSeg()` → `.seg` | Premium pill toggle, `data-tab-*` contract. |
| **Insight** | `renderInsightRow()` + `renderInsightDividerList()` → `.insights` / `.insight` | **Divider list, no nested boxes.** Tone icon badge + title + sev pill + kind chip. |
| **Chart** | `renderAnalyticsChart()` → `.v2-analytics-chart-wrap` | Title · subtitle · box · footer; Chart.js-ready canvas; theme-aware. |
| **Export** | `renderExportCenter()` → `.an-export` | Calm **list** (icon · name · sub · action / "Segera hadir" chip). Secondary by design. |
| **Empty/Loading/Error** | `renderAnalyticsEmptyState/LoadingState/ErrorState` → `.v2-analytics-empty-state` | Calm text states, SVG alert icon for errors. |
| **Score bars** | `renderScoreBreakdown()` → `.an-scorebar` | Weighted sub-score bars, null = em-dash. |
| **Icons** | `anIcon(name,{size,stroke})` | currentColor stroke SVG. |
| **Tokens** | `--font-display` Archivo · `--font-sans` Manrope · `--font-mono` JetBrains Mono · `--space-hero/section/subsection/card` (26/26/22/16) · `--type-*` scale · `--shadow-sm/md/lg` · `--accent #A8292F` | px-based, token-driven. |

**Divergent systems instead use:** boxed `.daa-sec`/`.dwi-sec` (border + 18px radius + shadow), **rem** units, gradient KPI tiles with full borders, emoji titles, toggle groups (`.daa-toggle`) instead of `.seg`, and `<button>⬇️ PDF</button>` strips instead of the Export Center list.

---

## 3. PHASE 1 — Design Audit Comparison Table

**Legend:** `IDENTICAL` = uses the canonical primitive · `SIMILAR` = same intent, different impl/tokens · `DIFFERENT` = separate design system · `BROKEN` = violates an explicit authority rule (e.g. emoji, hard-coded color, no dark-mode token).

> Reference column (Analytics Driver) is the authority; every cell is **relative to it**.

| Dimension | Analytics **Driver** (ref) | **Dispatch** Analytics | **Recommendation** Accuracy | **Driver Wellness** | **Vehicle Management** | **Executive** | **Petty Cash** |
|-----------|---------------------------|------------------------|-----------------------------|---------------------|------------------------|---------------|----------------|
| **Typography** | Archivo/Manrope/Mono tokens | DIFFERENT (rem, `font-weight:800`, no display font) | DIFFERENT | DIFFERENT | SIMILAR (`--font-sans`, rem sizes) | IDENTICAL | IDENTICAL |
| **Header hierarchy** | `.eyebrow` de-boxed | DIFFERENT (`.daa-top` title band) | DIFFERENT | DIFFERENT | SIMILAR (`.vms__title` micro-label) | IDENTICAL | SIMILAR (custom `.pc-an-hero` tag) |
| **Toolbar** | filter/seg row, no chrome | DIFFERENT (`.daa-top__actions` band) | DIFFERENT | DIFFERENT | SIMILAR (none; inventory toolbar) | IDENTICAL (`exec-filter-bar`) | SIMILAR (inline seg row) |
| **Export buttons** | `renderExportCenter` list | BROKEN (`⬇️ PDF/Excel` emoji btns) | BROKEN (emoji btns) | BROKEN (emoji btns) | N/A (no export) | IDENTICAL | IDENTICAL |
| **Reset buttons** | n/a (filters reset inline) | DIFFERENT (window toggle only) | DIFFERENT | DIFFERENT | SIMILAR | IDENTICAL | SIMILAR |
| **Search** | n/a / scope selects | none | DIFFERENT (`.raa-search` raw input) | none | SIMILAR (inventory search `.vm-*`) | SIMILAR (`v2-admin-filter`) | none |
| **Filters** | period seg + scope selects | DIFFERENT (`.daa-toggle`) | DIFFERENT (`.raa-sort` select) | DIFFERENT (`.dwi-toggle`) | SIMILAR | IDENTICAL (`.seg`) | SIMILAR (`.seg`) |
| **Spacing rhythm** | `--space-*` tokens (px) | DIFFERENT (rem gaps `1.1rem`) | DIFFERENT | DIFFERENT | SIMILAR (mixes `--space-section` + rem) | IDENTICAL | IDENTICAL |
| **Card system** | de-boxed `.v2-analytics-kpi-card` | DIFFERENT (`.daa-kpi` gradient box) | DIFFERENT (`.raa-big`) | DIFFERENT (`.dwi-kpi`) | DIFFERENT (`.vms__kpi` gradient box) | IDENTICAL | SIMILAR (inline-styled cycle cards) |
| **Section shell** | `.eyebrow` (no shell) | DIFFERENT (`.daa-sec` boxed 18px) | DIFFERENT (`.daa-sec`) | DIFFERENT (`.dwi-sec` boxed 18px) | SIMILAR (no shell, strip only) | IDENTICAL | IDENTICAL |
| **Table** | minimal / responsive currency | DIFFERENT (`.daa-table`) | DIFFERENT (`.daa-table`) | DIFFERENT (`.dwi-table` clickable) | DIFFERENT (`.vm-*` inventory grid) | n/a | BROKEN (raw inline-styled `<table>`, hard-coded `#e8e6e2`) |
| **Drawer** | n/a | n/a | n/a | DIFFERENT (`.dwd-*` drawer) | DIFFERENT (`.vad-*` drawer) | n/a | n/a |
| **KPI cards** | `.v2-analytics-kpi-card` | DIFFERENT | DIFFERENT | DIFFERENT | DIFFERENT | IDENTICAL | IDENTICAL |
| **Charts** | `renderAnalyticsChart` wrap | DIFFERENT (CSS sparkline cols) | DIFFERENT (CSS sparkline) | DIFFERENT (CSS sparkline) | N/A | n/a (KPI only) | IDENTICAL (`renderAnalyticsChart` + Chart.js) |
| **Empty state** | `.v2-analytics-empty-state` | BROKEN (`📭/📊` emoji empties) | BROKEN (emoji empties) | BROKEN (`🫀/📭` emoji empties) | SIMILAR (inventory empty) | IDENTICAL | IDENTICAL |
| **Loading state** | `renderAnalyticsLoadingState` | DIFFERENT (none) | DIFFERENT (none) | DIFFERENT (none) | DIFFERENT | IDENTICAL | IDENTICAL |
| **Hover** | token transitions | SIMILAR (`filter:brightness`) | SIMILAR | SIMILAR (row hover) | SIMILAR | IDENTICAL | SIMILAR |
| **Animation** | ring draw + countup | DIFFERENT (none) | DIFFERENT (none) | DIFFERENT (none) | DIFFERENT (none) | IDENTICAL | SIMILAR (chart anim only) |
| **Responsive behavior** | grid auto + container currency | SIMILAR (auto-fit grids) | SIMILAR | SIMILAR | SIMILAR (good breakpoints) | IDENTICAL | IDENTICAL |
| **Dark mode** | `[data-theme=dark]` tokens | SIMILAR (token-based, safe) | SIMILAR (token-based) | SIMILAR (token-based) | SIMILAR (token-based) | IDENTICAL | SIMILAR (hard-coded `#e8e6e2` in table — risk) |
| **SVG icons** | `anIcon` | BROKEN (emoji) | BROKEN (emoji) | BROKEN (emoji) | DIFFERENT (`renderIcon` 2nd system) | IDENTICAL | IDENTICAL |
| **Accessibility** | roles/aria on seg, aria-busy | SIMILAR (role=group, aria-label) | SIMILAR (aria on search) | SIMILAR (row role=button, tabindex) | SIMILAR | IDENTICAL | SIMILAR |

### Scorecard (cells per module, excluding n/a)

| Module | IDENTICAL | SIMILAR | DIFFERENT | BROKEN | Verdict |
|--------|:--:|:--:|:--:|:--:|--------|
| Executive | 18 | 3 | 0 | 0 | **Aligned** (reference-grade) |
| Petty Cash | 11 | 8 | 0 | 2 | **Mostly aligned** (table is the gap) |
| Vehicle Management | 0 | 12 | 6 | 0 | **Adjacent dialect** (SVG-clean, boxed cards) |
| Dispatch Analytics | 0 | 5 | 10 | 4 | **Foreign system** |
| Recommendation Accuracy | 0 | 6 | 9 | 4 | **Foreign system** |
| Driver Wellness | 0 | 6 | 10 | 4 | **Foreign system (duplicate of Dispatch)** |

**Headline:** the three "foreign system" modules share **one** root cause (the DAA dialect), so fixing
DAA fixes all three. Vehicle Management is *closer* (already SVG, token-driven) but uses boxed gradient
cards + a second icon system. Petty Cash needs only a table primitive and one hard-coded color removed.

---

## 4. PHASE 2 — Shared Executive UI System (architecture, not implementation)

**Principle:** do not invent a new library. **Promote `analytics-shell.js` to the platform-wide
"Executive UI Kit"** and express every component as a thin wrapper over the primitives that already
exist. New components below are *named contracts*; most map 1:1 to an existing function.

### 4.1 Module placement
```
js/analytics/analytics-shell.js   →  rename/expose as the Executive UI Kit (already the source of truth)
platform.css  (.v2-analytics-claude scope)  →  the single stylesheet; promote scope to `.exec-ui`
icon-system.js  →  FOLD INTO anIcon (merge missing glyphs), then deprecate renderIcon
```

### 4.2 Component contracts

| Component | Backing primitive (exists today) | New work | Notes |
|-----------|----------------------------------|----------|-------|
| **ExecutiveHeader** | page-header + `renderEyebrow` | thin wrapper | `{title, subtitle, meta}`. Replaces `.daa-top` / `.dwi-top` / `.vms__head`. |
| **ExecutiveToolbar** | `exec-filter-bar` pattern | extract to shell | hosts seg + selects + export trigger; no chrome band. |
| **ExecutiveFilterBar** | `exec-filter-bar` | extract | period seg + scope selects. |
| **ExecutiveSearch** | `v2-admin-filter` input | new tokenized class | replaces raw `.raa-search`. |
| **ExecutiveExport** | `renderExportCenter` | reuse as-is | replaces all emoji export button strips. |
| **ExecutiveReset** | — | small new | tokenized ghost button (currently absent everywhere). |
| **ExecutiveKPICard** | `renderAnalyticsKPICard` | reuse as-is | replaces `.daa-kpi`/`.dwi-kpi`/`.vms__kpi`/`.raa-big`. |
| **ExecutiveSection** | `renderEyebrow` (de-boxed) | reuse | replaces `.daa-sec`/`.dwi-sec` boxes. |
| **ExecutiveCard** | `.v2-admin-config-group` / inset card | consolidate | one neutral card token for the rare boxed need. |
| **ExecutiveDrawer** | `.vad-*` / `.dwd-*` / `.drx-*` grammar | **unify to one** | single `renderExecutiveDrawer({title, body, footer})` overlay+panel+ESC. |
| **ExecutiveTable** | (none canonical) | **new primitive** | the genuine gap — Petty/Dispatch/Wellness/Reco all need a real table. |
| **ExecutiveEmptyState** | `renderAnalyticsEmptyState` | reuse | replaces emoji empties. |
| **ExecutiveBadge** | `.an-kind` / sev pill | extract | tag/kind chips. |
| **ExecutiveStatusPill** | `.daa-pill`/`.dwi-pill` → tokenize | consolidate | one pill, `ok/info/warn/danger`. |
| **ExecutiveChartContainer** | `renderAnalyticsChart` | reuse | replaces CSS-sparkline blocks (or wraps them). |
| **ExecutiveInsightCard** | `renderInsightRow` + `renderInsightDividerList` | reuse | replaces `.raa-insight` boxed grid. |
| **ExecutiveSparkline** | (3 copies today) | **new shared** | dedupe the identical `sparkline()` in daa/raa/dwi. |
| **ExecutiveRing / Score** | `renderRingGauge` / `renderScoreBreakdown` | reuse | already shared. |

### 4.3 Two genuinely-new primitives (the only real net-new design work)
1. **`ExecutiveTable`** — token-driven, responsive (horizontal scroll wrap), numeric-right, status-pill cells, optional clickable rows (`data-*` → drawer), dark-mode safe. This is the single missing canonical primitive; 4 modules hand-roll it today (Petty Cash even with hard-coded hex).
2. **`ExecutiveDrawer`** — one overlay/panel/ESC/focus-trap grammar to replace the three near-identical drawers (`vad`, `dwd`, `drx`).

Everything else is **adoption + deletion**, not creation.

---

## 5. PHASE 3 — Migration Plan (lowest risk + highest visual impact first)

Ordering optimizes for: (a) ship the unified primitives once, (b) convert the cheapest/safest module
first to prove the path, (c) then the highest-visual-impact foreign modules, (d) leave the structurally
hardest (drawers/tables) for last.

| Wave | Work | Risk | Visual impact | Est. files | Why this order |
|:--:|------|:--:|:--:|:--:|----------------|
| **0** | Promote `analytics-shell.js` → Executive UI Kit; merge `icon-system.js` glyphs into `anIcon`; add `ExecutiveTable` + `ExecutiveDrawer` + `ExecutiveSparkline` primitives to `platform.css`/shell | Low | None yet | ~3 | Foundation. No visual change; pure addition. |
| **1** | **Petty Cash** table → `ExecutiveTable`; remove hard-coded `#e8e6e2`; cycle cards → `ExecutiveCard` | **Lowest** | Low–Med | 1 | Already canonical; smallest diff; validates `ExecutiveTable`. |
| **2** | **Vehicle Management** fleet strip → `ExecutiveKPICard`/grid; retire `.vms-*` CSS; `renderIcon`→`anIcon` | Low | **High** (front-door module) | 2–3 | SVG-clean already; swap gradient boxes for de-boxed cards. |
| **3** | **Dispatch Analytics** → full canonical (eyebrow sections, KPI cards, seg, Export Center, `ExecutiveTable`, SVG icons) | Med | **Highest** | 1 (+ engine untouched) | Biggest visual jump; defines the conversion recipe for 4 & 5. |
| **4** | **Recommendation Accuracy** → canonical (reuses Wave 3 recipe; drop `.raa-*` supplement) | Med | High | 1 | Shares DAA root; near-mechanical after Wave 3. |
| **5** | **Driver Wellness** → canonical + `ExecutiveDrawer` for the wellness drawer | Med | High | 2 (dash + drawer) | Last because it adds the drawer unification. |
| **6** | Delete dead CSS-in-JS, dead `STYLE_ID` injectors, `icon-system.js`; final dark-mode + a11y sweep | Low | None | ~6 | Cleanup once nothing references the old systems. |

### Impact estimates
- **Affected files:** ~9 render/component files + `analytics-shell.js` + `platform.css` (engines, stores, Firebase: **0**).
- **CSS removals:** **~330 lines** of injected CSS-in-JS (`daa` ~151 + `raa` ~57 + `dwi` ~90 + `vms` ~32) collapse into the existing `.v2-analytics-claude` stylesheet (net new CSS only for `ExecutiveTable`/`ExecutiveDrawer`).
- **Duplicate components eliminated:** 3 KPI-card implementations, 3 section shells, 3 sparkline functions, 3 drawers, 2 icon systems, 4 export-button strips, ~6 `esc()`/`fmtTime()` copies.
- **Injected `<style>` tags removed:** 4 analytics (`daa/raa/dwi/vm-summary`) + 3 drawer (`drx/dwd/vad`) → folded into the single platform sheet (the `dci-*` card family can follow later).
- **Technical debt eliminated:** one icon language, one spacing system (px tokens, no rem drift), zero emoji in UI chrome, zero hard-coded surface colors → dark-mode correctness by construction.

---

## 6. PHASE 4 — Cleanup Report (duplicates to remove)

### 6.1 Duplicate button systems
| Duplicate | Location | Canonical replacement |
|-----------|----------|-----------------------|
| `.daa-btn` / `.daa-btn--accent` | dispatch dashboard CSS | `renderExportCenter` action + tokenized buttons |
| `.dwi-btn` / `.dwi-btn--accent` | wellness dashboard CSS | same |
| Emoji export strips `⬇️ PDF / ⬇️ Excel` | daa, raa, dwi | `ExecutiveExport` list |
| `.daa-toggle` / `.dwi-toggle` | daa, dwi | `.seg` (`renderSeg`) |

### 6.2 Duplicate cards
- `.daa-kpi`, `.dwi-kpi`, `.vms__kpi`, `.raa-big` — **four** gradient KPI-card implementations → one `ExecutiveKPICard` (`.v2-analytics-kpi-card`).
- `.daa-trendcard` / `.dwi-trendcard` — identical trend tiles → one component.
- `.raa-insight` boxed grid — → `ExecutiveInsightCard` divider row.

### 6.3 Duplicate typography
- `font-weight:800` section titles in rem (`.daa-sec__title`, `.dwi-sec__title`, `.daa-top__title`) → `.eyebrow h2` (Archivo 19px token).
- Three rem-based label scales (`__lbl`, `__sub`, `__hint`) → `--type-label` / `--type-caption`.

### 6.4 Duplicate spacing
- rem gap rhythm (`gap:1.1rem`, `1.05rem 1.15rem`) in daa/raa/dwi → `--space-section` / `--space-card`.
- Vehicle Management mixes `--space-section` with rem → normalize to tokens.

### 6.5 Duplicate shadows
- `box-shadow:var(--shadow-sm)` re-declared on `.daa-sec`, `.dwi-sec`, `.vms__kpi` (boxed look the authority deliberately removed) → drop the box; shadow only where the kit prescribes.

### 6.6 Duplicate drawers
- `.vad-*` (vehicle), `.dwd-*` (wellness), `.drx-*` (decision replay) — three overlay+panel+ESC grammars (the files even say "Reuses the Decision Replay / Driver Wellness drawer grammar") → one `ExecutiveDrawer`.

### 6.7 Duplicate toolbars
- `.daa-top`, `.dwi-top`, `.vms__head` title-band toolbars → `ExecutiveHeader` + `ExecutiveToolbar`.

### 6.8 Duplicate utility code (JS)
- `esc()` redefined in ≥6 render files; `fmtTime()` in ≥4; `sparkline()` verbatim in 3 → hoist to the kit.

### 6.9 Forbidden patterns to purge
- **Emoji** in all DAA/RAA/DWI section titles + empties (📊🧑‍✈️🚐🔁🎯🫀💡⚠️🎚️🗂️🔎📈📭✅).
- **Hard-coded hex** `#e8e6e2`, `#5b5b64` in Petty Cash table inline styles (dark-mode trap — see `[[darkmode-white-token-trap]]`).
- **Second icon system** `icon-system.js` / `renderIcon` — merge glyphs into `anIcon`, then delete.

---

## 7. Guardrails (non-negotiable during implementation)
1. **No engine/scoring/Firebase edits.** Every module is a pure render layer already — keep it that way.
2. **Locked content stays locked.** Executive KPI strip order/labels are bound to the PDF model (`executive-report-model.js`); presentation reshapes containers, never numbers.
3. **Dark mode by token only.** Zero hard-coded surface/border colors; verify each wave under `[data-theme="dark"]`.
4. **No-data semantics preserved.** `null` → em-dash, never a fabricated `0` (hero ring, score bars).
5. **One icon language, zero emoji** in UI chrome after Wave 6.
6. **Each wave ships independently** and is visually verifiable before the next.

---

*Prepared as the v1.18.3 implementation blueprint. Phases 1–4 complete; no source files modified.*
