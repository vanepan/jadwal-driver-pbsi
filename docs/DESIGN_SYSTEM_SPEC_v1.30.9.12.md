# DESIGN SYSTEM SPEC — Current State + Proposed Unification
**Audited at:** APP_VERSION v1.30.9.12 · 2026-08-14
**Part of the Claude Design handoff package** — see `DESIGN_BRIEF_v1.30.9.12.md`.

CSS load order confirmed in `index.html:25-34`: `style.css → platform.css → petty-cash.css → overtime.css → engineering.css → gudang.css → sarpras-intelligence.css → nor-center.css → workspace-list-kit.css → vendor/flatpickr.min.css`. `Analytics-V2/*` and `Engineering Operations Prototype/*` are **source prototypes not linked from index.html** — several production files say they were "ported verbatim" from them; they explain the origin of some duplication but are not live surface.

---

## 1. Current State — the chaos, precisely

### 1.1 Typography
One real type-scale token exists — `platform.css:59-66` (`--type-display-xl/lg`, `--type-heading-xl/lg/md`, `--type-body`, `--type-caption`, `--type-label`) — but it is used **22 times, all inside `platform.css`'s own scope**. Every other stylesheet hardcodes raw px: **1,046 `font-size: Npx` declarations across 13 files**, ranging from 8.5px to 60px, no consistent step. Font stack is centrally defined (`platform.css:33-35`: Archivo display / Manrope sans / JetBrains Mono) but ~15 places in `platform.css` itself still hardcode the literal `'JetBrains Mono', 'DM Mono', monospace` string instead of `var(--font-mono)`.

### 1.2 Color — three to four parallel systems
- **(A) Legacy `style.css:8-54`** — no dark variant. `--red/--dark/--gray-1..4/--white/--text/--text-muted/--radius/--shadow`.
- **(B) "V2.0" `platform.css:25-227`** — the intended system of record per its own header comment. Full light+dark pairs: `--canvas/--surface/--border/--text/--muted/--accent(#A8292F light, #B8454A dark)/--info/--ok/--warn/--danger` + `-bg` pairs, per-vehicle colors `--v-innova/luxio/poly/hiace`.
- **(C) A "card system" palette duplicated byte-for-byte across 4 scopes**: `--accent:#cf4a43/#e0574f`, `--c-green/blue/amber/violet/teal/neutral`, its own `--shadow-sm/md/lg`, `--radius:16px/--radius-sm:11px/--radius-lg:22px`. Found in `.gud-root` (`gudang.css:24-63`, explicitly commented "copied from engineering.css's .eng-root verbatim"), `.eng-root` (`engineering.css:17-47`), `.v2-analytics-claude` (`platform.css:11472-11562`, explicitly commented "prototype values, verbatim"), `.sic-root` (`sarpras-intelligence.css:10-33`, partial).
- **(D) A PBSI-crimson pair** for Overtime/Petty Cash: `--primary:#9a1b2d` + friends, identical in `overtime.css:21-27,40-45` and `petty-cash.css:18-24,46-51`.

`nor-center.css` and `workspace-list-kit.css` are the **one place duplication was consciously avoided** — both explicitly inherit from `.sic-root` by cascade rather than redeclaring.

**Dark-mode mechanism**: `[data-theme="dark"]` attribute on `<html>`/`<body>`, set from JS. **`var(--white)` white-trap confirmed still live**: `style.css` has 21 `background: var(--white)` sites that stay white in dark mode — cards, panels, form controls, and `.modal-box` itself. The maintainers know (comments describing the exact bug exist in `platform.css:6565,6982,11997`) and have deliberately deferred a fix because `--white`/`--dark`/`--dark-2/3` are dual-use (surface-background AND text-on-badge) — a blind remap breaks the text usage.

### 1.3 Spacing
`platform.css:43-55` defines workspace geometry tokens (`--workspace-max-width:1400px`, `--workspace-pad-inline:24px`, `--workspace-edge:40px`, `--workspace-section-gap:32px`, `--workspace-card-gap:16px`) — partially adopted. A second vertical-rhythm scale (`--space-hero/section/subsection/card`) is **fully dead code** — zero uses anywhere, including in its own file. Every module file hardcodes integer px gaps/padding ad hoc.

### 1.4 Shape
No consistently-used radius token; every integer 0–20px appears somewhere, plus pill-radius written 3 different ways (`999px`, `99px`, `50%`). Three co-existing shadow scales track the color-token split in §1.2 — same variable *names* (`--shadow-sm/md/lg`) resolve to **different actual values** depending which scoped root (`.gud-root`/`.eng-root`/`.v2-analytics-claude`/plain `:root`) an element sits under.

### 1.5 Component duplication (see `FEATURE_UX_AUDIT.md` §5 for the summary)
- **Buttons**: no shared `<button>` component. `platform.css` alone has ~25 one-off `*-btn` families beyond its own generic `.p-btn*`. `.eng-btn`/`.gud-btn` and `.eng-icon-btn`/`.gud-icon-btn` are character-for-character identical CSS declared twice.
- **Chips/badges**: 4 separate systems (`platform.css` `.p-pill.*`, `.gud-chip`/`.gud-pill` copy of `.eng-chip`/`.eng-pill`, `.exec-badge`/`.exec-pill`).
- **Empty states**: 3 near-identical implementations (`.v2-analytics-empty-state`, `.gud-empty`/`.eng-empty` explicitly "ported verbatim," `.wlk-empty`/`.nc-empty`).
- **Toasts**: shared `#toast`/`showToast()` in `js/utils.js` exists, but `js/gudang/ui/gudang-center.js` implements its **own local, state-driven `showToast()`** in parallel.
- **Genuinely shared, no duplication found**: Modals (`.modal-overlay`/`.modal-box`, `js/modal.js`), the Select/Datepicker components (`js/pbsi-select.js`, `js/pbsi-datepicker.js` — adoption gap only: Gudang/Sarpras-Intelligence/workspace-list-kit never import them and hand-roll bespoke dropdowns instead), and skeleton loaders.

### 1.6 Responsive
No breakpoint is ever expressed as a shared token or JS constant anywhere in the 9 in-scope CSS files — every value is a hard-coded literal. Distinct values found: **380, 400, 480, 520, 560, 600, 640, 680, 720, 760, 767/768, 800, 900, 920, 960, 1023/1024, 1080, 1180, 1279/1280, 1440.** See `RESPONSIVE_BEHAVIOR_SPEC_v1.30.9.12.md` for the full inconsistency breakdown and the proposed canonical scale.

---

## 2. Proposed Unified Design System

**Governing decision**: the highest-leverage move is *not* inventing a new system — `platform.css`'s already-defined V2 `:root` scale is sound (accent `#A8292F`, sensible semantic colors, a real type scale, workspace geometry) and simply was never made the single source every module draws from. Claude Design should **adopt this scale as canonical and delete the 3 competing systems**, not create a 5th.

### 2.1 Typography
| Token | Use | Value |
|---|---|---|
| `--font-display` | Headings, hero numbers | Archivo, Inter, system-ui, sans-serif |
| `--font-sans` | Body, UI chrome | Manrope, Inter, system-ui, sans-serif |
| `--font-mono` | Timestamps, ids, technical values | JetBrains Mono, ui-monospace, monospace |

Type scale (extend the existing 8-token set to a full step scale so every module has a token to reach for instead of hardcoding): display-xl/lg, heading-xl/lg/md/sm, body-lg/body/body-sm, caption, label. Weights: keep the existing disciplined 5-step set already in use (400/500/600/700/800) — don't add 300/900.

### 2.2 Color
Adopt `platform.css`'s V2 `:root`/`[data-theme]` pair as the **only** color system. Retire (A) legacy, (C) card-system, (D) crimson-pair as literal token sets — their concrete *values* can inform the final palette (e.g., the crimson-accent identity is core to brand), but they must resolve to the same variable names as (B) so every module reads one source. Explicitly resolve the `--white`/`--dark` dual-use conflict by splitting into distinct surface-background and text-on-accent tokens (e.g. `--surface-inverse` vs `--text-on-accent`) — this is the one token-model change (not just a value change) required to finally close the dark-mode trap.

Per-vehicle colors (`--v-innova/luxio/poly/hiace`) already exist as tokens — extend this to be **generated, not enumerated**, so a 5th/6th vehicle gets a color without a code change (see Assignment Board doc).

### 2.3 Spacing
Keep `--workspace-*` geometry tokens. Replace the dead `--space-hero/section/subsection/card` set with a real, actually-referenced 8px-based scale (e.g. `--space-1:4px` … `--space-8:32px` or similar) and require new component CSS to reference it.

### 2.4 Shape
One radius scale: `--radius-sm/md/lg` (the `.v2-analytics-claude` values — 11/16/22px — are already the most-adopted informal standard; formalize them). One shadow scale: `--shadow-sm/md/lg`, defined once at `:root`/`[data-theme]`, never redeclared per scoped root.

### 2.5 Motion
Reuse the existing, already-good motion tokens found by the docs-mining pass: `pop` (modal, 160ms), `sheetUp` (mobile sheet, 260ms), `viewIn` (route change, 340ms), `.theme-anim` (550ms crossfade) — plus the universal `prefers-reduced-motion` guard already established in v1.20.8. Don't reinvent; extend this set for any new interaction (drawers, list insertion/removal, skeleton transitions).

### 2.6 Icons
**Zero emoji in UI chrome** — already enforced by check scripts, already established. `anIcon()` (stroke SVG, `currentColor`) is canonical; `renderIcon()`/`icon-system.js` is a deprecated second system still live in some Vehicle-adjacent code — a redesign is a natural opportunity to finish that migration, not a reason to introduce a third icon system.

### 2.7 Visual language
**De-boxed philosophy is already the established, correct direction for this brief.** Sections use `renderEyebrow()` (mono tag chip + Archivo h2 + hairline rule), not bordered boxes — the boxed-card look (`.daa-sec`, `.dwi-sec`, and by extension the `.gud-root`/`.eng-root` "card system") is the **explicitly-rejected divergent pattern** per prior UX-unification reports. This aligns directly with the Apple-inspired brief's own "clarity, restraint, whitespace over hairlines" language — Claude Design should lean into this existing direction rather than treat it as optional.

### 2.8 Responsive
See `RESPONSIVE_BEHAVIOR_SPEC_v1.30.9.12.md` for the full proposed breakpoint scale and rules.

---

## 3. Component library — what to formalize as reusable primitives

| Component | Status today | Redesign action |
|---|---|---|
| Button (primary/secondary/danger/success/ghost/icon) | ~30 divergent implementations | Design ONE component with size variants (incl. a ≥44px touch-safe default), replace all module-local `*-btn` classes |
| Chip/Badge/Status Pill | 4 systems | Design ONE with semantic color variants (info/ok/warn/danger/neutral) |
| Empty state | 3 near-identical | Design ONE with icon/title/subtitle/CTA slots |
| Toast | shared + 1 rogue local impl | Design ONE, ensure Gudang migrates onto it |
| Modal / Drawer | genuinely shared, but 3 different mobile-bottom-sheet thresholds (560/600/640) | Keep the shared shell, unify the breakpoint (see Responsive doc) |
| Select / Date picker | shared but under-adopted | Keep, extend adoption to Gudang/Sarpras-Intelligence/workspace-list-kit |
| Table | no shared component — per-view bespoke markup with horizontal-scroll wrapper | Design ONE reusable table shell (see Responsive doc for the overflow rule to keep) |
| Card | fragmented across module "card systems" | Design ONE, de-boxed by default per §2.7 |
