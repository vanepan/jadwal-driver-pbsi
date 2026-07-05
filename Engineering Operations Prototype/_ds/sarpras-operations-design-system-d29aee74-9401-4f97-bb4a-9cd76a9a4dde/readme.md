# Sarpras Operations Platform — Design System

The design system for the **PBSI Sarpras Operations Platform** — the enterprise operations platform used by **Bidang Sarana dan Prasarana** (Facilities & Infrastructure Division) of **PBSI (Persatuan Bulutangkis Seluruh Indonesia)**, the Indonesian Badminton Association.

The platform manages daily facility operations: driver scheduling, vehicle & fleet management, petty cash, engineering/work-order operations, executive dashboards, analytics, and deterministic operational workflows. It is built for **operational efficiency**, not data-heavy dashboards.

**Design philosophy** — an Apple-inspired executive interface with enterprise-grade usability: premium visual hierarchy, calm and generous spacing, a reusable **Executive UI Kit**, and role-aware workspaces (Admin · Bidang · Driver · Engineering). Every screen should feel like it has always belonged to the platform.

---

## Sources

This design system was reverse-engineered from the production codebase. Explore these to build higher-fidelity work:

- **GitHub — `vanepan/jadwal-driver-pbsi`** (main): the production platform. Key references used:
  - `DESIGN_ANALYSIS.md` — the two-layer (V1 production / V2 executive) architecture and token map.
  - `Analytics-V2/styles.css` + `Analytics-V2/analytics.css` — the **design authority**: the Executive language this system is built on (tokens, hero, KPI grammar, cards, tables, insights).
  - `js/analytics/executive-ui-kit.js` — the Executive* component API surface.
  - `js/components/icon-system.js` — the SF-Symbols-style SVG icon set.
  - `docs/DOCUMENT_DESIGN_SYSTEM.md` — the PDF/document standards (header/footer, tables, charts).
- Related repos (private, not read here): `vanepan/pbsi-telegram-bot`, `vanepan/Schedule-Driver-PBSI`.

> A newer "Executive" language (Analytics V2 — Archivo/Manrope, Apple-bright near-whites, desaturated brand red) supersedes the older V1 production layer (Inter, warmer greys, `#A8292F` crimson, dark charcoal sidebar). This system adopts the **Executive language** because it is explicitly the design authority, is the most recent, and best matches the stated Apple-inspired philosophy. If you need the legacy V1 look, see `style.css` / `platform.css` in the repo.

---

## Content fundamentals

- **Language:** Indonesian throughout the product UI. Titles and section labels are often Indonesian; document titles are UPPERCASE (e.g. `LAPORAN RINGKASAN ANALITIK OPERASIONAL`).
- **Voice:** institutional, calm, precise. It states operational facts, not marketing. Executive-friendly — the headline reads in seconds.
- **Casing:** Sentence case for body and headings; UPPERCASE only for eyebrow labels and formal document titles. Mono, tabular numerals for all numbers, times, distances, and plate IDs.
- **Domain vocabulary:** Jadwal (schedule), Penugasan (assignment), Driver, Kendaraan (vehicle), Armada (fleet), Work Order, Bidang (division), Approval/Persetujuan, Pratinjau (preview), Segera (soon), Ringkasan (summary), Analitik (analytics).
- **Tone examples:** "Operasi berjalan sehat, dengan 7 perhatian aktif." · "Penugasan hari ini akan muncul di sini." · "3 kendaraan pajak jatuh tempo."
- **No emoji.** Ever. Iconography is the SF-Symbols-style SVG set — never emoji or unicode glyphs as icons.
- **Restraint:** avoid data slop. Every number earns its place. Less is more; one primary action per view.

---

## Visual foundations

- **Color** — Apple-bright near-white surfaces (`--canvas #fbfbfd`, `--surface #fff`). The brand red is a refined, **desaturated** `--accent #cf4a43`, used *sparingly* (one primary button, key emphasis, single most-important chart series). Data is encoded in a **low-chroma semantic series** (green/blue/amber/violet/teal) chosen for grayscale-safe ordering. Text is a four-step ink ramp (`--text → --text-dim → --text-faint → --text-ghost`).
- **Type** — **Archivo** for display/headings and keynote numerals (weight 800, tracking down to `-0.038em`); **Manrope** for UI body and labels; **JetBrains Mono** for every number, code, timestamp, and plate. Base 14px / line-height 1.55 / `-0.006em`. All three are Google Fonts.
- **Spacing** — generous, Apple-airy 8pt rhythm. Cards pad at 28px (`--pad`); major sections are separated by a large **78px** rhythm (`--sec-gap`). The interface breathes.
- **Backgrounds** — flat near-white canvas. No photographic backgrounds, no full-bleed imagery, no repeating patterns. The only gradient allowed is the brand-red button fill (`--accent-2 → --accent`) and the avatar tiles.
- **Borders** — hairline, nearly invisible (`--border` at ~5.5% alpha). Structure comes from whitespace and thin rules, not boxes. "De-box" wherever possible — KPIs and highlights float on whitespace separated by `border-faint` hairlines rather than sitting in nested cards.
- **Elevation** — whisper-soft, three-step shadow scale; depth reads from light, not lines. `--shadow-sm` on cards, `--shadow-md` on hover, `--shadow-lg` on modals/drawers.
- **Corner radius** — soft and consistent: 11px inputs/buttons, 16px cards, 22px modals, 999px pills.
- **Cards** — white surface, hairline border, `--shadow-sm`, 16px radius, 28px padding. On hover (when `hoverable`): border strengthens, shadow lifts to `--shadow-md`.
- **Animation** — restrained and **transform-only** (never `opacity:0` at rest, so print/PDF capture is safe). `fadeUp` (translateY 9px→0, cubic-bezier(.2,.7,.2,1)) on view entry; hover lift `translateY(-2px)`; bar fills animate width over 1s. A `[data-anim="off"]` switch disables all motion. One accent pulse exists (the hero attention dot).
- **Hover / press** — hover raises surface (`--surface-2`) or applies a subtle `--hover` wash + `translateY(-1px/-2px)`; primary buttons brighten 5%. Press settles with `translateY(1px)`.
- **Transparency & blur** — reserved for chrome: sticky topbar uses `backdrop-filter: blur(16px) saturate(1.4)` over a semi-transparent canvas. Drawers/modals dim the page with `--scrim`.
- **Theming** — light is default; a full dark inversion lives under `:root[data-theme="dark"]`. Density variants: `comfortable` (default) and `spacious`.

---

## Iconography

- **System:** a bespoke inline-SVG icon set following **Apple SF Symbols philosophy** — outline or single-fill, `currentColor`, scalable, no PNG or emoji dependencies. Paths are lifted directly from production `js/components/icon-system.js`.
- **Delivery:** the `Icon` component (`components/primitives/Icon.jsx`) wraps the path set as a React component; `tone` accepts `currentColor`, a token name (`accent`, `c-green`), or a raw color. Icons sit at 14–20px inline, `flex-shrink: 0`.
- **No emoji, no unicode glyphs as icons.** The only raster brand asset is the PBSI crest (`assets/pbsi-logo.png`).
- **CDN substitution:** none needed — the set is self-contained. Extend by adding paths to `ICON_PATHS` in `Icon.jsx` (keep the SF-Symbols stroke feel).

---

## Intentional additions

- **Icon** — the source ships an icon *path registry* (`icon-system.js`) rather than a React component. `Icon` wraps that exact path set as a component so consumers have a typed, tone-aware glyph primitive. No new glyphs invented; paths are copied from source.

---

## Components

Reusable primitives, grouped by concern. Each is `<Name>.jsx` + `<Name>.d.ts` + `<Name>.prompt.md`, exported under `window.SarprasOperationsDesignSystem_d29aee`.

**Primitives** (`components/primitives/`)
- **Button** — action button (default / primary / ghost / danger; sm/md; icon slot).
- **Badge** — small mono eyebrow chip for tags & kinds.
- **StatusPill** — lifecycle status chip with a color dot.
- **Segmented** — segmented control for period/view toggles.
- **SearchInput** — tokenized search field with leading glyph.
- **Icon** — inline SVG glyph from the platform icon set.

**Layout** (`components/layout/`)
- **Card** — the premium content surface (optional header + tools, hover lift).
- **SectionHeader** — the "eyebrow" section divider with hairline rule.
- **PageHeader** — top-of-view header (crumb, display title, lede, actions).

**Data** (`components/data/`)
- **KPICard** — the one KPI grammar (value, trend delta, sparkline; de-boxed).
- **Sparkline** — single SVG polyline trend, print-safe.
- **RingGauge** — circular health/utilisation gauge.
- **BarList** — ranked horizontal bar list.
- **DataTable** — minimalist executive table (hairline rules, mono numerics).

**Feedback** (`components/feedback/`)
- **InsightRow** — analytics/AI insight line for a divider list.
- **EmptyState** — calm empty / permission / offline placeholder.

---

## UI kits

- **`ui_kits/sarpras/`** — *Sarpras Executive Operations*, a click-through recreation of the platform: module rail + section panel + topbar shell, and three live screens — **Executive Analytics** (hero + health ring + KPIs + highlights + deep analytics), **Vehicle Management** (executive table + detail drawer), **Driver Operations** (daily assignment timeline + approval queue). Engineering & Administrasi appear as graduation-stage previews, matching production. See its `README.md`.

---

## Index / manifest

- `styles.css` — **entry point** consumers link (imports only).
- `tokens/` — `fonts.css`, `colors.css`, `typography.css`, `spacing.css`, `base.css`.
- `components/` — `primitives/`, `layout/`, `data/`, `feedback/`.
- `guidelines/` — foundation specimen cards (Colors, Type, Spacing, Brand).
- `ui_kits/sarpras/` — the Executive Operations UI kit.
- `assets/` — `pbsi-logo.png` (official crest), `icons/` (PWA icons).
- `SKILL.md` — Agent-Skill entry point for downstream use.

Generated files (`_ds_bundle.js`, `_ds_manifest.json`, `_adherence.oxlintrc.json`) are produced automatically — do not edit.

---

## Caveats

- Built on the **Executive (Analytics V2)** language, not the legacy V1 production look; see the note under *Sources*.
- Fonts load via Google Fonts CDN (as production does), so no `@font-face` binaries ship — the compiler reports 0 fonts; this is expected.
- The vehicle fleet palette (`--v-innova` etc.) is mapped onto the semantic data series (exact production `--v-*` hexes were not read); adjust in `tokens/colors.css` if you have the originals.
