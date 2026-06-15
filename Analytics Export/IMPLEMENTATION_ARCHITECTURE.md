# Analytics Export — Production Implementation Architecture

**Author:** Principal Engineer, Sarpras Operations
**Status:** Architecture / planning — no implementation code
**Scope:** Turn the approved `Pratinjau Laporan Analitik.html` prototype into a maintainable production PDF export, reusing the platform's existing document + analytics subsystems.
**Design authority:** The HTML prototype in `Analytics Export/` is the visual source of truth. Nothing here redesigns it.

---

## 0. Repository Reality Check (why this differs from a blank-slate plan)

Before recommending technology, the existing platform was surveyed. Three facts dominate every decision below:

1. **A pluggable document/PDF subsystem already exists** — `js/docs/`:
   - `doc-engine.js` — `DocumentEngine.generate(templateId, data)` → caches and returns a **Blob**; `generateAndOpen()` shows the reusable viewer.
   - `pdf-exporter.js` — a **pluggable backend interface** `exportToPdf(definition) → Promise<Blob>` with two backends: **`PdfmakeBackend` (live, client-side)** and **`PuppeteerBackend` (already stubbed, explicitly labelled the "D-later seam")**.
   - `template-registry.js` — `register(id, {build, filename, meta})`; templates self-register on import.
   - `document-viewer.js`, `print-manager.js`, `doc-theme.js` — viewer, print, shared tokens.
   - Existing analytics templates: `templates/analytics-report.js`, `templates/analytics-summary.js` (pdfmake, vector primitives).
   - Everything above the backend deals only in **Blobs**, so the renderer can be swapped by config without touching the viewer, print, or callers.

2. **A mature, pure analytics engine already exists** — `js/analytics/`:
   - `analytics-engine.js` — `computeAnalyticsModel(ctx)` pure function.
   - `analytics-model.js` — `buildAnalyticsModel()` → normalized `AnalyticsModel { schemaVersion, metadata, kpis, charts, insights, recommendations, trends, diagnostics, render, exportSnapshot }`.
   - `analytics-insights.js` — **`generateInsights(model)`: deterministic, traceable, prioritized. No AI.** (This is Phase 5, already built.)
   - `analytics-recommendations.js` — deterministic rule-based recommendations.
   - `analytics-governance.js`, `analytics-period.js`, `analytics-trends.js`, `analytics-cancellation.js`, `analytics-types.js` (JSDoc typedefs — the platform is vanilla JS, no TypeScript).
   - The current PDF export already runs through this: `app.js` snapshots `_lastAnalyticsModel = model.exportSnapshot` and calls `DocumentEngine.generateAndOpen('analytics-summary', vm)`.

3. **Stack constraints**:
   - Vanilla JS, ES modules, **no framework, no bundler, no `src/` directory, no TypeScript**. The repo uses `js/`.
   - PWA used heavily on **iPhone** (cross-platform fidelity matters; offline matters).
   - **`puppeteer@25.1` is already a root dependency** (used by `scripts/generate-icons.js`).
   - A **Cloud Functions backend exists** (`functions/`, Node 20, `firebase-functions` v6).

**Consequence:** The task's Phase-2 menu (React-PDF / Puppeteer / Playwright / PDFKit / jsPDF) is evaluated honestly below, but the *real* incumbent is **pdfmake**, and the real question is: *can pdfmake reproduce the approved prototype, and if not, what is the lowest-maintenance path that can?* The prototype is pixel-precise HTML/CSS — that answer writes itself, and the repo already left the door open (`PuppeteerBackend` seam).

---

## 1. Design Inventory

The prototype is a single self-contained HTML file: one `<style>` block, four report variants toggled by nav, A4 pages of fixed `794×1123px` (= 210×297mm @96dpi), and a print stylesheet (`@media print` → `break-after:page`, nav hidden).

### 1.1 Report variants (4)

| Variant | id | Pages | Hero metric |
|---|---|---|---|
| Laporan Analitik **Pengemudi** (Driver) | `r-pengemudi` | 1 | Completion rate `100%` |
| Laporan Analitik **Armada** (Vehicle) | `r-armada` | 1 | Distance `1.342 km` |
| Laporan Analitik **Bidang** (Field/Dept) | `r-bidang` | 1 | Requests `2` |
| Laporan Analitik **Lengkap** (Complete) | `r-lengkap` | 5 | Health score `99 / 100` |

### 1.2 Page anatomy — the "Zone" system

Every single-report page is one `.a4 > .pi` flex column of five zones separated by `.zr` hairline rules (`1px #D4D4D4`):

| Zone | Class | Role | Flex |
|---|---|---|---|
| A | `.za` | **Header** — org identity, period, date, report title | `0 0 auto` |
| B | `.zb` | **Hero** — giant headline number + KPI row (`.kr`/`.kc`) | `0 0 auto` |
| C | `.zc` | **Distribution** — labelled bars (`.dr`/`.drow`) or bidang status strips (`.be`) | `0 0 auto` |
| D | `.zd` | **Highlights** — categorized findings (`.hl-list`/`.hi`) | `1` (fills) |
| E | `.ze` | **Footer** — top contributors line + filter/version bar (`.fb`) | `0 0 auto` |

The **Complete (Lengkap)** report reuses the same header (Zone A) and footer (`.ze`/`.fb`) on all 5 pages, but its bodies introduce additional composition patterns:

- **P1 Ringkasan Eksekutif** — centered **Health Score** hero (`.zb.ctr`, `.hsc`/`.hscn`/`.hscd`, `.hsbadge`), a 6-cell KPI row, and a 5-row highlights list.
- **P2 Pengemudi & Armada** — **two-column** layout (`.tcol`/`.cl`/`.cr`/`.crule`) with compact bars (`.dr.sm`) + compact highlights (`.chl`/`.chi`), plus a cross-dimension footnote (`.cdim`).
- **P3 Permintaan & Operasi** — bidang status strips + **destinations list** (`.dlist`/`.ditem`/`.dname`/`.dfreq`) + highlights.
- **P4 Kontributor Utama** — **full contributors** sections (`.cfs`/`.cfi`/`.cfn`/`.cfd` + right-aligned metric `.cfp`/`.cfpl`), grouped by Pengemudi / Kendaraan / Bidang.
- **P5 Lampiran** — **two-column key/value grid** (`.lgrid`/`.lkey`/`.lval`/`.lsub`) + closing note (`.lnote`).

### 1.3 Reusable components (the production component set)

| Prototype markup | Component | Appears in |
|---|---|---|
| `.za`/`.htop`/`.hid`/`.pm`/`.hot`/`.hrt` + `.htt` | **ReportHeader** | every page |
| `.zr` | **Rule** (hairline divider) | every page |
| `.zb` → `.hs`/`.hn`/`.hpu` + `.hl` | **HeroMetric** | single reports P1 |
| `.zb.ctr` → `.hsc`/`.hsbadge`/`.hslbl` | **HealthScoreHero** | Complete P1 |
| `.kr`/`.kc`/`.kv`/`.kl` | **MetricGrid** (n cells) | hero + Complete P1 |
| `.zc` → `.dr`/`.drow`/`.dn`/`.dt`/`.df`/`.dp`/`.dk` | **DistributionStrip** (bars) | Driver, Vehicle, Complete P2 (`.sm`) |
| `.be`/`.bdn`/`.bdd`/`.bsw`/`.bs`/`.bsl` | **BidangStatusStrip** | Bidang, Complete P3 |
| `.zd` → `.hl-list`/`.hi`/`.hcat`/`.hbd`/`.hst`/`.hct` | **HighlightsSection** | all reports |
| `.tcol`/`.cl`/`.cr`/`.crule` + `.chl`/`.chi` + `.cdim` | **TwoColumnSection** | Complete P2 |
| `.dlist`/`.ditem`/`.dname`/`.dfreq` | **DestinationsList** | Complete P3 |
| `.cfs`/`.cfsl`/`.cfi`/`.cfl`/`.cfn`/`.cfd`/`.cfr`/`.cfp`/`.cfpl` | **ContributorsSection** | Complete P4 |
| `.lgrid`/`.lkey`/`.lval`/`.lsub`/`.lnote` | **AppendixSection** | Complete P5 |
| `.ze` → `.sl`+`.cm` (contributors line) + `.fb`/`.fm` | **ReportFooter** | every page |
| `.sl` | **SectionLabel** (uppercase eyebrow) | throughout |

### 1.4 Typography hierarchy

Single typeface — **Inter** (weights 100/300/400/500/600 + italic 400), `-webkit-font-smoothing:antialiased`, `font-variant-numeric:tabular-nums` on every number.

| Role | Size / weight | Token |
|---|---|---|
| Hero number (`.hn`) | 92px / 100 | `display` |
| Health score (`.hscn`) | 100px / 100 | `display-xl` |
| Hero unit (`.hpu`) | 42px / 300 | `display-unit` |
| KPI value (`.kv`) | 27px / 300 | `metric` |
| Contributor metric (`.cfp`) | 22px / 300 | `metric-sm` |
| Entity name (`.cfn`,`.dn`,`.bdn`) | 11–13px / 600 | `name` |
| Body / highlight statement (`.hst`,`.lval`) | 11px / 500 | `body` |
| Caption (`.hct`,`.cs`,`.cfd`) | 9–10px / 400 | `caption` |
| Section label / eyebrow (`.sl`,`.htt`,`.hl`) | 7–9px / 500, `letter-spacing .12em`, uppercase | `eyebrow` |
| Footer micro (`.fm`) | 7.5px / 400 | `micro` |

### 1.5 Color tokens (extracted)

```
ink     #0F0F0F   primary text, bars (.df #1A1A1A)
dim     #6B6B6B   secondary text
faint   #9A9A9A   labels, micro
line    #D4D4D4   hairline rules
fillTrk #EBEBEB   empty bar track
paper   #FFFFFF   page
stage   #E6E6E3   viewport behind pages (screen only)
ok      #1A7A4A   fulfilled / positive (.hcat.g, .bs.ok, badge #E8F5EF/#1A7A4A)
warn    #C0392B   attention (.hcat.r)
```
Note: this is a **black-ink editorial palette** — distinct from the platform's PBSI-red document theme (`doc-theme.js` `accent #A8292F`). The approved design deliberately uses near-black; the production renderer must honor the prototype's tokens, not `doc-theme`'s.

### 1.6 Page composition rules (load-bearing for the renderer)

- A4 fixed box `794×1123px`; inner padding `72px 76px 64px`; `overflow:hidden` (no reflow past the page).
- Zone D (`.zd`) is the only `flex:1` zone — it absorbs vertical slack so the footer pins to the bottom. **The renderer must preserve this flex behavior**, which is precisely what an HTML/CSS engine gives for free and a programmatic PDF engine does not.
- Print: `@media print` hides nav, removes shadows, `break-after:page` per `.a4`.

---

## 2. Architecture Decision Record (ADR)

### ADR-001 — PDF rendering technology for Analytics Export

**Status:** Proposed
**Context:** The approved design is delivered as pixel-precise **HTML + CSS** (Inter variable weights down to 100, 92–100px hairline numerals, tabular figures, 1px hairline rules, flexbox zone layout with a single growing zone, two-column rules, proportional bar fills). The platform already ships a pluggable PDF subsystem whose backend interface is `definition → Blob`, with a **Puppeteer backend seam already stubbed**. Primary objective: **preserve the approved visual design with minimal future maintenance.**

**Decision:** Render the approved HTML/CSS verbatim through **headless Chrome via Puppeteer**, implemented as the existing `PuppeteerBackend` in `pdf-exporter.js`, executed in a **Firebase Cloud Function** (Puppeteer cannot run in the browser). The current `PdfmakeBackend` is retained as a fallback/offline path but is **not** the vehicle for this design.

**Decisive reason:** The prototype's fidelity (sub-pixel typography, flex slack distribution, hairlines, variable font weight 100) is *native* to a browser engine and *unreachable* in a programmatic layout engine without re-deriving every measurement by hand. With Puppeteer, **the approved CSS literally is the production renderer** → near-zero translation loss and the lowest possible maintenance: a future design tweak is a CSS edit, not a re-implementation.

**Consequences:**
- (+) The HTML prototype becomes the template with minimal change; design ≡ output.
- (+) Reuses the already-stubbed seam → `DocumentEngine`, viewer, print, and all callers stay untouched (they only see Blobs).
- (+) Insight/recommendation/model engines already exist and are reused unchanged.
- (−) Rendering moves **server-side** (a callable Cloud Function). Requires network; not offline. Cold-start + headless Chrome memory cost must be managed (see §10).
- (−) Adds an operational dependency (Chromium in Functions). Mitigated: puppeteer is already a repo dependency; use the pinned-Chromium pattern.
- Fallback: keep `analytics-summary` (pdfmake) registered as a degraded offline export so a no-network device still gets *a* PDF.

See §3 for the full option evaluation that backs this decision.

### ADR-002 — Report components are environment-agnostic HTML-string builders

**Decision:** Author every report component (§1.3) as a **pure function `(model) → htmlString`** with **no DOM and no Node API usage**, plus one shared CSS string lifted verbatim from the prototype. Pure builders run identically in the browser (for live preview) and in the Cloud Function (for Puppeteer). The model in → HTML out contract mirrors the existing `template.build(data) → definition` contract.

**Consequence:** One source of truth for markup; browser preview and server PDF can never visually diverge.

### ADR-003 — Reuse the existing AnalyticsModel; do not invent a parallel data pipeline

**Decision:** The export consumes the **existing `AnalyticsModel`** from `computeAnalyticsModel(ctx)` (specifically a new typed `ReportModel` projection, §5), reusing `analytics-insights.js` and `analytics-recommendations.js`. The four report variants are four **projections/compositions** of one model, not four pipelines.

**Consequence:** Phase-4 data model and Phase-5 insight engine are ~80% already built; this work *extends* them (notably: a Health Score derivation and a contributors selector), it does not rebuild them.

---

## 3. Recommended PDF Technology — Option Evaluation

Ranked against the stated objective: **preserve the approved HTML/CSS design with minimal future maintenance.**

### 3.1 Puppeteer — ★ RECOMMENDED
- **Pros:** Renders the approved HTML/CSS *exactly* (real Chromium: Inter @ weight 100, tabular-nums, flexbox slack, hairlines, `@media print`, `break-after:page`). Design ≡ output. Already a repo dependency. **Backend seam already stubbed** in `pdf-exporter.js`. `page.pdf({format:'A4', printBackground:true})` is purpose-built for this.
- **Cons:** Server-side only (Cloud Function) — needs network, not offline; headless Chrome cold-start/memory.
- **Maintenance cost:** **Lowest.** Design changes = CSS edits to the same stylesheet the designer approved.
- **Typography fidelity:** **Highest** (full web-font + variable-weight rendering).
- **Multi-page:** Native — CSS page breaks; the 5-page Complete report "just works."
- **Preserves approved design:** **Verbatim.**
- **Long-term maintainability:** **Best** for a design-led report; the artifact and the renderer speak the same language.

### 3.2 Playwright
- **Pros:** Same Chromium fidelity as Puppeteer; cleaner API; bundles its own browser.
- **Cons:** **New dependency** (Puppeteer is already here and already seamed). Heavier than needed for one server render path. No advantage over Puppeteer for this single-engine use case.
- **Maintenance / fidelity / multi-page / preservation:** Equal to Puppeteer.
- **Verdict:** Technically co-equal, but loses on "minimal change" — it ignores the existing Puppeteer seam and adds a parallel toolchain. Choose only if the team later standardizes on Playwright for E2E and wants one browser tool.

### 3.3 React-PDF (`@react-pdf/renderer`)
- **Pros:** Component model; decent multi-page; deterministic.
- **Cons:** **Not a browser** — its own Yoga/flex + a CSS *subset*. The approved CSS would be **re-implemented**, not reused; variable font weight 100, tabular-nums nuances, hairlines, and exact slack distribution must be re-derived and will drift. Also pulls **React** into a no-framework codebase.
- **Maintenance cost:** High (translation layer; every design tweak re-translated).
- **Typography fidelity:** Medium (font embedding works; fine control is fiddly).
- **Preserves approved design:** Approximation, not verbatim.
- **Verdict:** Rejected — violates "minimal change" and "no framework," and breaks design≡output.

### 3.4 PDFKit
- **Pros:** Powerful low-level vector/text control; streams; no browser.
- **Cons:** **Imperative drawing** — you compute every x/y/width. The zone flex layout, growing Zone D, two-column rules, and bar proportions become hand-coded geometry. Highest translation distance from an HTML prototype.
- **Maintenance cost:** Very high.
- **Typography fidelity:** High *if* you hand-place everything; no CSS.
- **Preserves approved design:** Only by laborious manual reproduction.
- **Verdict:** Rejected for a design-led, layout-rich report.

### 3.5 jsPDF (+ autotable / html2canvas)
- **Pros:** Client-side, offline, simple for trivial docs.
- **Cons:** Native text layout is primitive; the only way to approach the design is `html2canvas` → **rasterize** → blurry, non-selectable text, broken at print resolution, poor on iPhone. Multi-page via raster is fragile.
- **Maintenance cost:** High; fidelity ceiling is low.
- **Typography fidelity:** Low (raster) or very low (native).
- **Preserves approved design:** No.
- **Verdict:** Rejected. (The incumbent `pdfmake` is strictly better than jsPDF for this and is what we keep as the offline fallback.)

### 3.6 Incumbent note — pdfmake (not on the menu, but it's what's deployed)
The live `analytics-summary`/`analytics-report` templates use pdfmake vector primitives. pdfmake is excellent for *structured* docs (reimbursement) but, like PDFKit/React-PDF, it **cannot reproduce the approved editorial typography** (it has no web fonts at weight 100, no real flex slack, no tabular-figure CSS). **Keep it as the offline-degraded fallback; do not use it to chase this design.**

### Final recommendation

> **Use Puppeteer**, implemented as the existing `PuppeteerBackend` seam, running in a Firebase Cloud Function, rendering the approved HTML/CSS verbatim. Keep pdfmake (`analytics-summary`) registered as an offline fallback. This uniquely satisfies *preserve the approved design* AND *minimal future maintenance*, because the approved stylesheet becomes the production renderer with no translation layer.

---

## 4. Folder Structure

The task template specifies `src/exports/analytics/`. This repo has **no `src/`** and splits client (`js/`, browser ESM) from server (`functions/`, Node 20). Because Puppeteer is server-side, the renderer lives under `functions/`; the **pure HTML component builders are environment-agnostic and are the single source of truth**, imported by both. The `src/exports/analytics/` intent is honored, mapped onto the repo's real layout:

```
functions/src/exports/analytics/        ← server: render + orchestration
  index.js                              ← Cloud Function entry: exportAnalyticsReport (callable)
  render/
    puppeteer-renderer.js               ← html → A4 PDF Buffer (page.pdf), Chromium pool
    chromium.js                         ← headless Chrome lifecycle / launch options
  report/                               ← ⭐ PURE, environment-agnostic (shared w/ client preview)
    report-styles.js                    ← the approved CSS as one exported string (verbatim)
    report-document.js                  ← assembles <html> shell + page list per report type
    layouts/
      report-layout.js                  ← A4 page wrapper (.a4 > .pi), zone stack, .zr rules
      two-column-layout.js              ← .tcol / .cl / .cr / .crule  (Complete P2)
    components/
      report-header.js                  ← Zone A (.za)
      hero-metric.js                    ← Zone B (.zb)  — single-report hero
      health-score-hero.js             ← .zb.ctr        — Complete P1
      metric-grid.js                    ← .kr / .kc      — n-cell KPI row
      distribution-strip.js            ← .dr / .drow     — labelled bars (+ .sm variant)
      bidang-status-strip.js           ← .be / .bsw      — fulfilled/waiting strips
      highlights-section.js            ← Zone D (.zd)
      destinations-list.js             ← .dlist          — Complete P3
      contributors-section.js          ← .cfs / .cfi     — Complete P4
      appendix-section.js              ← .lgrid          — Complete P5
      report-footer.js                 ← Zone E (.ze / .fb)
      section-label.js                 ← .sl eyebrow
    reports/                            ← the 4 compositions (page assembly only)
      driver-report.js                  ← r-pengemudi (1 page)
      vehicle-report.js                 ← r-armada    (1 page)
      bidang-report.js                  ← r-bidang    (1 page)
      complete-report.js                ← r-lengkap   (5 pages)
  model/                                ← export-specific projection over AnalyticsModel
    report-model.js                     ← buildReportModel(analyticsModel, opts) → ReportModel
    report-types.js                     ← JSDoc typedefs (matches platform convention)
  insights/                             ← report-narrative layer (reuses js/analytics engines)
    health-score.js                     ← deriveHealthScore(model) — NEW deterministic metric
    contributors.js                     ← selectContributors(model) — NEW deterministic selector
    report-highlights.js                ← maps Insight[] → zone-D / contributor copy
  format/
    numbers.js                          ← id-ID formatting (1.342, 67 km, 42%) — tabular
    dates.js                            ← period + "15 Juni 2026" formatting
  assets/
    fonts/                              ← self-hosted Inter (do NOT fetch Google Fonts at runtime)
    pbsi-mark.js                        ← the "PBSI" mark (text mark; no external asset needed)

js/exports/analytics/                   ← client: trigger + preview (thin)
  analytics-export-client.js            ← calls the callable fn, receives Blob → DocumentViewer
  report-preview.js                     ← (optional) live in-browser preview using the SAME
                                          report/ builders rendered into an iframe

js/docs/pdf-exporter.js                 ← EXISTING — implement PuppeteerBackend.exportToPdf()
                                          to POST definition → callable fn → Blob
```

**Shared-code mechanism (no bundler):** the `report/` tree is pure ESM with zero DOM/Node calls. The Cloud Function imports it directly. For browser preview, the same files are imported by `js/exports/analytics/report-preview.js`. If functions packaging makes cross-tree import awkward, the `report/` tree is the canonical copy and is the only thing that would be vendored — never duplicated by hand. (Evaluate a tiny copy-on-build step in `scripts/` if needed; deferred until preview is actually built.)

---

## 5. Report Data Model

The export does **not** read Firebase or recompute analytics. It consumes the existing `AnalyticsModel` (from `computeAnalyticsModel`) and projects it into a stable, render-only `ReportModel`. Expressed as **JSDoc typedefs** to match the platform (`analytics-types.js`); a TS rendering is given for clarity, but the repo ships JSDoc.

```ts
// Conceptual TS (authored as JSDoc in functions/src/exports/analytics/model/report-types.js)

type ReportType = 'driver' | 'vehicle' | 'bidang' | 'complete';

interface ReportMeta {
  reportType: ReportType;
  title: string;                 // "Laporan Analitik Pengemudi"
  org: string;                   // "Bidang Sarana dan Prasarana"
  orgSub: string;                // "PBSI — Persatuan Bulu Tangkis Seluruh Indonesia"
  periodLabel: string;           // "30 Hari Terakhir"
  periodRange: string;           // "16 Mei – 15 Juni 2026"
  generatedAtLabel: string;      // "15 Juni 2026, pukul 00.44"
  generatedBy: string;           // "Evan"
  appVersion: string;            // "v1.11.3.3"
  filters: { driver: string; vehicle: string; bidang: string }; // "Semua ..."
  footerFilterLine: string;      // "Filter: Semua Pengemudi · ..."
}

interface HeroMetric {
  value: string;                 // pre-formatted, tabular: "100" | "1.342" | "2"
  unit?: string;                 // "%" | "km" (rendered as .hpu)
  label: string;                 // "Tingkat Selesai"
}

interface MetricCell { value: string; unit?: string; label: string; } // .kc
type MetricGrid = MetricCell[];  // 5 cells (single reports) or 6 (Complete P1)

interface DistributionRow {      // .drow
  name: string;                  // "Igo"
  fillPct: number;               // 0..100  → .df width (relative to leader)
  sharePct: number;              // 42      → .dp
  secondary?: string;            // "581 km" → .dk
}
interface Distribution {
  label: string;                 // "Distribusi Beban" / "Utilisasi Armada"
  rows: DistributionRow[];
  note?: string;                 // "Rata-rata beban: 8,7 ..."
}

interface BidangStatusItem {     // .be
  name: string;                  // "Bidang Turnamen"
  detail: string;                // "1 permintaan · 1 penugasan · 87 km"
  status: 'fulfilled' | 'waiting';
  statusLabel: string;           // "Terpenuhi" | "Menunggu"
}

interface Highlight {            // .hi
  category: string;              // "Efisiensi"
  tone: 'neutral' | 'good' | 'attention';   // → .hcat / .hcat.g / .hcat.r
  statement: string;             // .hst
  context?: string;              // .hct
}

interface Contributor {          // .cfi
  name: string;
  description: string;           // .cfd narrative
  metricValue: string;           // "581" | "—"
  metricLabel: string;           // "km"
}
interface ContributorGroup { label: string; items: Contributor[]; } // Pengemudi/Kendaraan/Bidang

interface DestinationItem { name: string; freqLabel: string; }      // .ditem ("8 trip")

interface AppendixEntry { key: string; value: string; sub?: string; } // .lgrid cell
interface Appendix { entries: AppendixEntry[]; note: string; }        // + .lnote

interface HealthScore {          // Complete P1 only
  score: number;                 // 99
  outOf: number;                 // 100
  badge: string;                 // "Sangat Baik"
  badgeTone: 'good' | 'neutral' | 'attention';
  label: string;                 // "Kesehatan Operasional"
}

interface ReportModel {
  meta: ReportMeta;
  // Single-report payloads (present per type):
  hero?: HeroMetric;
  kpis?: MetricGrid;
  distribution?: Distribution;          // driver/vehicle
  bidangStatus?: BidangStatusItem[];    // bidang
  highlights: Highlight[];
  contributorsLine?: string;            // footer .cm one-liner
  // Complete-report payloads:
  healthScore?: HealthScore;
  completeKpis?: MetricGrid;            // 6-cell
  twoColumn?: {                         // P2
    left:  { heading: string; summary: string; distribution: Distribution; highlights: Highlight[] };
    right: { heading: string; summary: string; distribution: Distribution; highlights: Highlight[] };
    crossDimensionNote: string;         // .cdim
  };
  destinations?: { uniqueCount: number; items: DestinationItem[] };  // P3
  contributorGroups?: ContributorGroup[];                           // P4
  appendix?: Appendix;                                              // P5
}
```

**Mapping note:** every `*Pct`, `value`, and `freqLabel` is **pre-formatted in `format/`** (id-ID locale, tabular figures) so components are pure string emitters — no number logic in the view. This mirrors how the prototype hard-codes `"1.342"`, `"42%"`, `"8,7"`.

---

## 6. Insight Engine V1 (rule-based, deterministic, no AI)

**Already exists and is reused as-is:** `js/analytics/analytics-insights.js` (`generateInsights(model)` → traceable, prioritized `Insight[]`) and `analytics-recommendations.js`. These satisfy the "completion / distance / utilization / fulfillment" insight requirements from existing model metrics, deterministically.

The export adds **two small deterministic derivations** on top (both pure, both traceable, both in `insights/`):

### 6.1 Health Score (`deriveHealthScore`)
Complete-report P1 shows `99 / 100` + a tone badge. This is a **weighted composite of metrics the engine already computes** — no new data, no ML:

```
score = round(
    wCompletion   * completionRate            // 100% → full
  + wUtilization  * (1 - idleVehicleShare)    // 0 idle → full
  + wFulfillment  * bidangFulfillmentRate     // requests fulfilled
  + wDataQuality  * odometerCoverage          // 20/26 trips → partial
  - penalties(criticalWarnings, cancellations)
)
badge = score≥95 'Sangat Baik' | ≥85 'Baik' | ≥70 'Cukup' | else 'Perlu Perhatian'
```
Weights are constants in `health-score.js`, documented and unit-tested against the prototype's reference figure. Output is fully explainable (each term traceable to a source metric) — same contract as `Insight.source`.

### 6.2 Contributor selection (`selectContributors`)
The footer "Kontributor Utama" line and P4 sections rank entities by deterministic rules already available in the model:
- **Driver:** highest distance + volume → "volume & jarak tertinggi"; full availability → "ketersediaan penuh"; widest destination diversity → "diversifikasi rute".
- **Vehicle:** highest volume → "tulang punggung"; highest km/trip → "rute jarak jauh"; lowest volume → "cadangan aktif".
- **Bidang:** fulfilled vs waiting.
These are **selectors over `model.charts`/`render`**, not new analytics. Output feeds `Contributor[]` / `contributorsLine`.

### 6.3 Highlights mapping (`report-highlights.js`)
Maps the existing `Insight[]` (priority-sorted, tone-tagged) into Zone-D `Highlight[]`: `Insight.type → tone` (`success→good`, `warning→attention`, `info→neutral`), `title→statement`, `description→context`, `source→category` (or a fixed category vocabulary: Efisiensi / Distribusi / Jarak / Utilisasi / Pemenuhan / Permintaan). **No new findings are invented** — the export is a *projection* of the existing deterministic insight engine.

### Architecture (data flow)
```
AnalyticsModel (existing engine, pure)
   │  insights[]  recommendations[]  kpis  charts  diagnostics  render
   ▼
insights/  (export-local, pure, deterministic)
   deriveHealthScore() ─┐
   selectContributors() ─┼─►  buildReportModel()  ─►  ReportModel
   report-highlights()  ─┘
```

---

## 7. Export Pipeline

```
┌─ CLIENT (browser / PWA) ──────────────────────────────────────────────┐
│ 1. User clicks Export (existing #v2AnalyticsExportPdf path)           │
│ 2. app.js already has _lastAnalyticsModel = model.exportSnapshot      │
│    → assemble ReportModel via buildReportModel() (pure)               │
│ 3. DocumentEngine.generateAndOpen('analytics-driver'|… , reportModel) │
│       └─ getExporter('puppeteer')  ← flip backend for these templates │
│             └─ PuppeteerBackend.exportToPdf(definition):              │
│                   POST {reportType, reportModel} → callable fn        │
└───────────────────────────────────────────────────────────────────────┘
                                  │ HTTPS (httpsCallable)
                                  ▼
┌─ CLOUD FUNCTION  functions/src/exports/analytics/index.js ────────────┐
│ 4. report-document.js: reportModel → full HTML string (report/ tree)  │
│    (report-styles.js CSS inlined; self-hosted Inter; PBSI text mark)  │
│ 5. puppeteer-renderer.js: launch/reuse Chromium → setContent(html)    │
│    → page.pdf({format:'A4', printBackground:true,                     │
│                margin:0, preferCSSPageSize:true}) → Buffer            │
│ 6. return base64 PDF                                                   │
└───────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─ CLIENT ──────────────────────────────────────────────────────────────┐
│ 7. PuppeteerBackend wraps Buffer → Blob (unchanged Blob interface)    │
│ 8. DocumentEngine caches; DocumentViewer shows it; PrintManager prints │
│    (viewer / print / caller code is 100% UNCHANGED — Blobs only)      │
└───────────────────────────────────────────────────────────────────────┘

Fallback (no network / offline PWA): getExporter('pdfmake') + existing
'analytics-summary' template → degraded but functional PDF.
```

Key property: **only `pdf-exporter.js` (implement the stub) and the four new templates change.** `doc-engine.js`, `document-viewer.js`, `print-manager.js`, and every caller already deal in Blobs and stay as-is.

---

## 8. Component Architecture (prototype → production map)

Each component is `(props) → htmlString`, props sliced from `ReportModel`. The CSS is the prototype's stylesheet, exported once from `report-styles.js`.

```
ReportDocument(reportModel)                         // <html><head>{styles}</head><body>
 └─ Report{Driver|Vehicle|Bidang|Complete}(model)   // selects pages
     └─ ReportLayout(page)                           // .a4 > .pi, stacks zones + .zr rules
         ├─ ReportHeader(meta)                       // Zone A
         ├─ HeroMetric(hero) | HealthScoreHero(hs)   // Zone B
         ├─ MetricGrid(kpis)                          // .kr
         ├─ DistributionStrip(dist) | BidangStatusStrip(items) | TwoColumnSection | DestinationsList | ContributorsSection | AppendixSection
         ├─ HighlightsSection(highlights)             // Zone D
         └─ ReportFooter(meta, contributorsLine)      // Zone E
```

- **Single reports** (`driver`/`vehicle`/`bidang`) = one `ReportLayout` with zones A–E; only Zone C differs (DistributionStrip vs BidangStatusStrip) and Zone B's value/label.
- **Complete report** = five `ReportLayout`s; bodies swap in TwoColumnSection (P2), DestinationsList (P3), ContributorsSection (P4), AppendixSection (P5); header + footer identical across pages.
- Components never compute — they emit markup with classes matching the approved CSS. This guarantees design≡output.

---

## 9. Implementation Sequence

### Phase A — PDF Foundation
- **Objective:** Stand up the Puppeteer render path end-to-end with a trivial page; lock the seam.
- **Deliverables:** `PuppeteerBackend.exportToPdf` implemented (client→callable→Blob); `functions/src/exports/analytics/{index.js, render/*}`; `report-styles.js` (approved CSS verbatim); self-hosted Inter; `report-layout.js`; a "hello A4" template proving `page.pdf` produces a pixel-faithful single page; pdfmake fallback wiring preserved.
- **Dependencies:** Functions deploy with Chromium; `httpsCallable` plumbing.
- **Risks:** Chromium in Functions (memory/cold start); font embedding; A4 box exactness (`preferCSSPageSize` vs explicit `width/height`). **Resolve all rendering risks here before any report content.**

### Phase B — Driver Analytics Export (`r-pengemudi`)
- **Objective:** First real report; exercises Hero, MetricGrid, DistributionStrip, Highlights, Footer.
- **Deliverables:** components above; `driver-report.js`; `buildReportModel(type:'driver')`; `report-highlights` + `selectContributors` for drivers; `format/` number+date helpers; visual diff vs prototype page.
- **Dependencies:** Phase A; existing AnalyticsModel driver buckets.
- **Risks:** Bar `fillPct` vs `sharePct` semantics (fill is relative-to-leader, share is % of total — both present in prototype); tabular alignment.

### Phase C — Vehicle Analytics Export (`r-armada`)
- **Objective:** Reuse Driver components with vehicle data + km-centric hero.
- **Deliverables:** `vehicle-report.js`; vehicle contributor rules (km/trip, idle, backbone); odometer-coverage note.
- **Dependencies:** Phase B (component reuse).
- **Risks:** Minimal — mostly data mapping; odometer coverage edge (`20/26`).

### Phase D — Bidang Analytics Export (`r-bidang`)
- **Objective:** Introduce BidangStatusStrip (fulfilled/waiting) + fulfillment hero.
- **Deliverables:** `bidang-status-strip.js`; `bidang-report.js`; fulfillment-rate + waiting-request highlights (reuse insights).
- **Dependencies:** Phase B foundation.
- **Risks:** Empty/`—` states (waiting bidang has no distance); `tone:'attention'` mapping.

### Phase E — Complete Analytics Export (`r-lengkap`, 5 pages)
- **Objective:** Multi-page composite; HealthScore; two-column; contributors; appendix.
- **Deliverables:** `health-score.js` (+ tests vs reference 99); `health-score-hero.js`; `two-column-layout.js` + `.sm` distribution; `destinations-list.js`; `contributors-section.js`; `appendix-section.js`; `complete-report.js`; multi-page break verification.
- **Dependencies:** Phases B–D (all components exist); HealthScore weights signed off.
- **Risks:** CSS page breaks across 5 pages; two-column rule height; Zone-D flex slack consistency page-to-page; appendix data completeness (odometer coverage, dismissed warnings, aliases).

---

## 10. Technical Risk Assessment

### Technical risks
- **Chromium in Cloud Functions** — cold starts (3–8 s), memory (set ≥512 MB–1 GB), Chromium availability. *Mitigation:* pin Chromium (puppeteer already a dep; use the documented Functions+Chromium launch flags `--no-sandbox --disable-gpu --single-process`); min-instances=0 acceptable for an on-demand admin export; consider a warmed instance only if usage grows. Cache blobs (DocumentEngine already does).
- **Server-side dependency for a previously client-side export** — network required. *Mitigation:* keep `analytics-summary` (pdfmake) as the offline fallback; surface a clear "needs connection for full report" affordance.
- **Cross-tree shared code without a bundler** — `report/` imported by both client preview and functions. *Mitigation:* keep `report/` strictly pure (no DOM/Node); canonical copy in functions; only vendor if packaging forces it.
- **Cost/abuse** — headless Chrome per click. *Mitigation:* auth-gated callable (admin only), blob cache, debounce the export button (already disabled-while-processing).

### Rendering risks
- **Font fidelity** — must **self-host Inter** (weights 100–600 + italic); never fetch Google Fonts at render time (offline/cold-start/privacy). Wait for `document.fonts.ready` before `page.pdf`.
- **A4 exactness** — prototype is `794×1123px @96dpi`. Use `@page { size: A4; margin: 0 }` + `preferCSSPageSize:true`, or set viewport to A4 px; verify no 1px overflow given `overflow:hidden`.
- **Hairlines & backgrounds** — `printBackground:true` is mandatory (bar fills, badges, status strips are backgrounds). Verify 1px rules don't drop at print scale.
- **Zone-D flex slack** — confirm the single growing zone behaves identically headless as in-browser (it will; same engine) and across all 5 Complete pages.

### Scalability concerns
- Export is **read-only and per-user on demand** — no fan-out load. The pure engine + pure builders are O(n) over already-filtered records. Primary scaling axis is concurrent Chromium instances, bounded by Functions concurrency + blob cache. No data-volume risk at PBSI scale.

### Future historical-analytics compatibility
- `ReportModel` carries `meta.periodLabel/periodRange` and the engine already has `analytics-period.js` + `analytics-trends.js` (period-over-period scaffolding, `TrendMetric`). The prototype's "baseline perdana — perbandingan tersedia mulai laporan berikutnya" note is the explicit hook: when trends exist, add a **comparison slot** to `ReportModel` (delta chips in MetricGrid, a trend strip) **without changing the component contract** — purely additive. Health Score is period-aware by construction.

### Future AI Operations Assistant compatibility
- The architecture is **deterministic-first and fully traceable**: every highlight/contributor/health term names a source metric (the existing `Insight.source` contract). An AI assistant can later **consume `ReportModel` + `AnalyticsModel`** as grounded, structured context (the model is the single source of truth feeding screen + PDF + future AI, exactly as `analytics-types.js` states). AI would *augment* narrative copy or answer questions over the same model — it never becomes a rendering or calculation dependency. Clean separation: engine (numbers) → insight engine (deterministic interpretation) → report model (projection) → renderer (HTML/CSS). AI plugs in at the interpretation layer behind the same `Insight`/`Recommendation` contracts.

---

## Summary of deliverables (this document)
1. **Design Inventory** — §1
2. **ADR** — §2 (ADR-001 technology, ADR-002 pure HTML builders, ADR-003 reuse engine)
3. **Recommended PDF technology** — §3 → **Puppeteer** via existing seam
4. **Folder structure** — §4
5. **Component architecture** — §8 (+ §1.3 inventory)
6. **Report data model** — §5
7. **Insight engine design** — §6 (reuses existing engines + HealthScore/Contributors)
8. **Export pipeline** — §7
9. **Implementation sequence** — §9 (Phases A–E)
10. **Technical risk assessment** — §10

*No implementation code authored, per directive. The approved prototype is treated as the immutable visual source of truth.*
