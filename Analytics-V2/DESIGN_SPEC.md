# Analytics V2 — Implementation-Ready Design Specification

**Project:** Sarpras Operations · Analytics (Executive Redesign)  
**Version:** V2  
**Last updated:** 2026-06-11

---

## 1. Typography

### Font Families

| Role | Family | Fallback |
|------|--------|---------|
| Display / headings | `Archivo` | `system-ui, sans-serif` |
| Body / UI | `Manrope` | `system-ui, sans-serif` |
| Numeric / mono | `JetBrains Mono` | `ui-monospace, monospace` |

> Loaded via Google Fonts at weights: Archivo 400–900, Manrope 400–800, JetBrains Mono 400–600.

### Font Sizes

| Token / Usage | Size | Weight | Notes |
|---------------|------|--------|-------|
| Hero title | `clamp(36px, 5.2vw, 62px)` | 800 | Archivo, `letter-spacing: -0.038em` |
| Hero subtitle | `clamp(17px, 1.9vw, 23px)` | 500 | Archivo, `letter-spacing: -0.012em` |
| Page H1 | `32px` | 800 | Archivo, `letter-spacing: -0.025em` |
| Section H2 | `19px` | 700 | Archivo, `letter-spacing: -0.018em` |
| Card H3 | `15.5px` | 700 | Archivo, `letter-spacing: -0.012em` |
| Big stat (hero) | `clamp(32px, 3.3vw, 46px)` | 800 | Archivo, tabular nums |
| Big stat (card) | `22px` | 800 | Archivo, tabular nums |
| Stat (small) | `26px` | 800 | Archivo, tabular nums |
| Body default | `14px` | 400 | Manrope, `line-height: 1.55` |
| Body small | `13px` | 400–600 | Manrope |
| Caption / label | `12px–12.5px` | 600 | Manrope |
| Eyebrow / overline | `11px` | 700 | `letter-spacing: 0.05–0.14em`, uppercase |
| Micro / badge | `10–10.5px` | 700–800 | uppercase, mono or sans |
| Mono data | `12–12.5px` | 400–600 | JetBrains Mono, tabular nums |

### Global Body
- `font-size: 14px`, `line-height: 1.55`, `letter-spacing: -0.006em`
- `-webkit-font-smoothing: antialiased`, `text-rendering: optimizeLegibility`

---

## 2. Color Tokens

### Light Theme (default)

| Token | Value | Usage |
|-------|-------|-------|
| `--canvas` | `#fbfbfd` | Page background |
| `--rail` | `#ffffff` | Sidebar |
| `--surface` | `#ffffff` | Cards, inputs |
| `--surface-2` | `#f5f5f7` | Pressed states, pill backgrounds |
| `--surface-3` | `#ededf0` | Deeper insets |
| `--hover` | `rgba(17,17,26, 0.03)` | Row / item hover fill |
| `--border` | `rgba(17,18,28, 0.055)` | Default border |
| `--border-strong` | `rgba(17,18,28, 0.10)` | Hover border, dropdown border |
| `--border-faint` | `rgba(17,18,28, 0.035)` | Dividers, hairlines |
| `--text` | `#18181d` | Primary text |
| `--text-dim` | `#5b5b64` | Secondary text |
| `--text-faint` | `#8a8a93` | Placeholder / label |
| `--text-ghost` | `#b0b0b8` | Disabled / ghost |
| `--accent` | `#cf4a43` | Brand red (primary CTA, active states) |
| `--accent-2` | `#d65a52` | Gradient start (lighter) |
| `--accent-weak` | `rgba(207,74,67, 0.10)` | Accent tint backgrounds |
| `--accent-line` | `rgba(207,74,67, 0.22)` | Accent borders |
| `--accent-fg` | `#ffffff` | Text on accent |

### Dark Theme (`[data-theme="dark"]`)

| Token | Value |
|-------|-------|
| `--canvas` | `#0a0a0c` |
| `--rail` | `#0d0d10` |
| `--surface` | `#141417` |
| `--surface-2` | `#1a1a1e` |
| `--surface-3` | `#212126` |
| `--hover` | `rgba(255,255,255, 0.04)` |
| `--border` | `rgba(255,255,255, 0.08)` |
| `--border-strong` | `rgba(255,255,255, 0.15)` |
| `--border-faint` | `rgba(255,255,255, 0.05)` |
| `--text` | `#f3f3f5` |
| `--text-dim` | `#a4a4ac` |
| `--text-faint` | `#6f6f78` |
| `--text-ghost` | `#4c4c54` |
| `--accent` | `#e0574f` |
| `--accent-2` | `#ec6a62` |

### Semantic Data Series

| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| `--c-green` | `#2f9e6b` | `#3fb27f` | Done / positive |
| `--c-blue` | `#3f72d6` | `#5a8cef` | Active / informational |
| `--c-amber` | `#c4892c` | `#d8a23e` | Scheduled / warning |
| `--c-violet` | `#8b6fd1` | `#a583e0` | Secondary series |
| `--c-teal` | `#2f9ea4` | `#46b9bd` | Tertiary series |
| `--c-neutral` | `#8c8c95` | `#7d7d86` | Cancelled / neutral |

### Status Aliases

| Token | Maps to |
|-------|---------|
| `--st-done` | `--c-green` |
| `--st-active` | `--c-blue` |
| `--st-sched` | `--c-amber` |
| `--st-cancel` | `#a6a6ad` (light) / `#8a8a93` (dark) |

### Critical / Alert (fixed, never follows accent tweaks)

| Token | Light | Dark |
|-------|-------|------|
| `--crit` | `#cf4a43` | `#e0574f` |
| `--crit-weak` | `rgba(207,74,67, 0.10)` | `rgba(224,87,79, 0.15)` |
| `--crit-line` | `rgba(207,74,67, 0.22)` | `rgba(224,87,79, 0.32)` |

---

## 3. Shadows

### Light Theme

| Token | Value |
|-------|-------|
| `--shadow-sm` | `0 1px 2px rgba(16,17,26, 0.025)` |
| `--shadow-md` | `0 1px 3px rgba(16,17,26, 0.03), 0 10px 24px -16px rgba(16,17,26, 0.09)` |
| `--shadow-lg` | `0 4px 12px rgba(16,17,26, 0.05), 0 26px 52px -26px rgba(16,17,26, 0.16)` |

### Dark Theme

| Token | Value |
|-------|-------|
| `--shadow-sm` | `0 1px 2px rgba(0,0,0, 0.4)` |
| `--shadow-md` | `0 2px 8px rgba(0,0,0, 0.4), 0 18px 40px -18px rgba(0,0,0, 0.8)` |
| `--shadow-lg` | `0 8px 24px rgba(0,0,0, 0.5), 0 34px 64px -22px rgba(0,0,0, 0.85)` |

> Philosophy: whisper-soft in light; deep cinema-black in dark. Depth from light, not lines.

---

## 4. Border Radius

| Token | Value | Used on |
|-------|-------|---------|
| `--radius-sm` | `11px` | Inputs, small controls, buttons |
| `--radius` (default) | `16px` | Cards |
| `--radius-lg` | `22px` | Large cards, modals |
| `6px` | — | Mini rank badges |
| `7px` | — | Filter menu items, small tags |
| `8px` | — | Dropdown options |
| `9px` | — | Segmented control buttons, icon-btns |
| `10px` | — | Filter buttons, topbar controls, `.dest` rows |
| `12px` | — | Dropdown menus |
| `13px` | — | Segmented control wrapper, utility cells |
| `15px` | — | Highlight avatars |
| `999px` | — | Pills, chips, full-round badges |

---

## 5. Spacing System

### Base Rhythm: 8pt grid, Apple-airy

| Token | Comfortable (default) | Spacious |
|-------|-----------------------|---------|
| `--gap` | `22px` | `28px` |
| `--pad` | `28px` | `34px` |
| `--sec-gap` | `78px` | `104px` |

> Toggled via `[data-density="comfortable"]` / `[data-density="spacious"]`

### Common Spacing Values

| Value | Usage |
|-------|-------|
| `2px` | Nav item gap, fine adjustments |
| `3px` | Segmented control gap |
| `4px` | Eyebrow tag padding vertical |
| `5px` | Card-tools gap, scroll margin |
| `6px` | Chip/badge padding, fb-menu padding |
| `8px` | Gap in inline controls, chip padding |
| `9px` | Nav item padding horizontal |
| `10px` | Filter option padding |
| `11px` | Sidebar padding, input padding |
| `12px` | Table cell padding, legend gap |
| `13px` | Bar list gap |
| `14px` | Card-head gap, gap in hbar |
| `16px` | Section label padding-bottom |
| `18px` | Eyebrow margin-bottom, stat top margin |
| `20px` | Card-head margin-bottom |
| `22px` | Page-head margin-bottom |
| `26px` | Health metric padding |
| `28px` | Card padding (= `--pad`) |
| `30px` | Hero margin-top, content padding-top |
| `34px` | Mobile padding bottom |
| `36px` | Content padding side (desktop) |
| `42px` | Hero metrics padding-top |
| `54px` | Hero metrics margin-top |

---

## 6. Layout — App Shell

### Chrome Dimensions

| Token | Value |
|-------|-------|
| `--sidebar-w` | `244px` (desktop) |
| `--topbar-h` | `58px` |

### App Structure
```
.app  (flex row, min-height: 100vh)
  .sidebar  (flex column, sticky, 100vh)
  .main  (flex column, flex: 1)
    .topbar  (sticky, height: 58px, z-index: 35)
    .filterbar  (sticky below topbar, z-index: 30)
    .content  (max-width: 1320px, centered)
```

---

## 7. Container Widths

| Context | Max Width | Padding (desktop) | Padding (tablet) | Padding (mobile) |
|---------|-----------|-------------------|-----------------|-----------------|
| `.content` | `1320px` | `30px 36px 96px` | `26px 22px 80px` | `18px 16px 80px` |
| `.hero-head` | `860px` | — | — | — |
| `.hero-sub` / hero text | `540px` (indirect) | — | — | — |
| `.tb-search` | `380px` | — | — | — |

---

## 8. Grid System

### Named Grid Classes

| Class | Columns | Usage |
|-------|---------|-------|
| `.g-2` | `1fr 1fr` | Two-column equal split |
| `.g-lead` | `1.7fr 1fr` | Lead chart + sidebar |
| `.g-3` | `repeat(3, 1fr)` | Three-column equal |
| `.hm-stats` | `repeat(3, 1fr)` | Hero metric stats row |
| `.highlights` | `repeat(3, 1fr)` | Operational highlights trio |
| `.util-grid` | `repeat(auto-fill, minmax(158px, 1fr))` | Utilization cells |

### Common Gap: `var(--gap)` = `22px`

---

## 9. Breakpoints

| Breakpoint | Width | Effect |
|------------|-------|--------|
| Tablet collapse | `≤ 1080px` | `.g-lead` → 1col; `.g-3` → 2col |
| Health stack | `≤ 920px` | `.hero-metrics` → 1col; health border changes |
| Narrow tablet | `≤ 720px` | `.g-2`, `.g-3` → 1col; highlights stack; stats stack; mobile font sizes |
| Mobile | `≤ 680px` | Sidebar collapses to drawer; topbar = 56px; content padding shrinks; search hidden |
| Small mobile | `≤ 480px` | Health gauge stacks vertically |
| Sidebar icon-only | `≤ 1024px` | Sidebar collapses to 68px wide (icons only) |

---

## 10. Responsive Behaviors

### Desktop (`> 1024px`)
- Sidebar: `244px`, fully expanded with labels, brand, user card
- Topbar: `58px` height, sticky, blur backdrop
- Content: up to `1320px`, `36px` horizontal padding
- Grids: full multi-column layouts
- Filter bar: full controls with labels

### Tablet (`680px – 1024px`)
- Sidebar: `68px`, icon-only (labels hidden)
- `.g-lead` collapses to single column at `1080px`
- `.g-3` collapses to 2 columns at `1080px`, then 1 column at `720px`
- Hero metrics stack vertically at `920px`
- Button labels hidden at `720px`
- Segmented control fills full width at `720px`

### Mobile (`≤ 680px`)
- Sidebar: off-canvas drawer (`252px` wide), toggled via `.app.nav-open`
- Backdrop overlay: `rgba(0,0,0, 0.5)` with `z-index: 39`
- Hamburger button displayed in topbar
- Topbar: `56px` height
- Search bar: hidden
- Date pill: hidden
- Content padding: `18px 16px 80px`
- All grids: single column
- Highlights: vertical stack with hairline top borders
- Page H1: `26px`
- Filter bar: wraps, deep-head stacks vertically

---

## 11. Interactive States

### Hover

| Component | Hover Effect |
|-----------|-------------|
| `.card.hoverable` | `border-color → --border-strong`, `box-shadow → --shadow-md` |
| `.sb-item` | `background → --hover`, `color → --text` |
| `.sb-item.active` | (no change — stays accented) |
| `.sb-add` | `filter: brightness(1.05)`, `transform: translateY(-1px)` |
| `.btn` | `border-color → --border-strong` |
| `.btn-primary` | `filter: brightness(1.05)` |
| `.btn-ghost` | `color → --text`, `background → --hover` |
| `.fb-select > button` | `border-color → --border-strong` |
| `.fb-opt` | `background → --hover`, `color → --text` |
| `.tb-icon` | `color → --text`, `background → --surface-2` |
| `.tb-user` | `background → --surface-2` |
| `.icon-btn` | `color → --text`, `background → --hover` |
| `.hl-item` | `transform: translateY(-2px)` |
| `.hl-item .hl-name`, `.hl-num:not(.up)` | `color → --accent` |
| `.hbar` | `.nm → color: --text`, `.track → box-shadow: 0 0 0 3px --accent-weak` |
| `.rtable tbody tr` | all `td` → `background → --hover`, `color → --text` |
| `.dest .row` | `background → --hover` |
| `.insight` | `background → --hover` |
| `.util-cell` | `border-color → --border-strong` |
| `.hero-attn` | `background` shifts toward `--crit`, `color → #fff` |
| `.hm-stat .alertbtn` | `gap: 9px` (arrow slides right) |
| `.eyebrow .act` | `color → --text` |
| `.tb-date button` | `background → --hover`, `color → --text` |
| `.fb-chip button` | `background → rgba(127,127,127, 0.18)` |

### Active / Pressed

| Component | Active Effect |
|-----------|--------------|
| `.btn` | `transform: translateY(1px)` |
| `.sb-item.active` | `background → --accent-weak`, `color → --accent`, `border-left-color → --accent` |
| `.tab.active` | `color → --text`, `border-bottom-color → --accent` |
| `.fb-opt.sel` | `color → --accent`, `background → --accent-weak`, `font-weight: 600` |
| `.seg button.on` | `background → --surface`, `color → --text`, `box-shadow → --shadow-sm`; `.ic → color: --accent` |

### Focus

- Default `outline: none`
- Focus-visible: `outline: 2px solid --accent-line`, `outline-offset: 2px`

### Selection

- `background: --accent-weak`, `color: --text`

---

## 12. Empty States

No dedicated `.empty-state` class is defined in current CSS. Implement as:

```html
<div class="card" style="min-height: 180px; display: grid; place-items: center; text-align: center;">
  <div>
    <div style="color: var(--text-ghost); font-size: 13px; font-weight: 600;">No data available</div>
    <div style="color: var(--text-faint); font-size: 12px; margin-top: 4px;">Adjust your filters to see results.</div>
  </div>
</div>
```

**Design rules for empty states:**
- Use `--text-ghost` for the primary empty message
- Use `--text-faint` for the sub-message
- Minimum card height: `180px`
- No heavy illustration — keep it minimal, inline with the calm aesthetic
- Optional icon: `32px`, `border-radius: 9px`, `background: --surface-2`, `color: --text-faint`

---

## 13. Loading States

No dedicated loader class is defined. Implement skeleton loading as:

```css
@keyframes shimmer {
  from { background-position: -200% 0; }
  to   { background-position: 200% 0; }
}
.skeleton {
  background: linear-gradient(
    90deg,
    var(--surface-2) 25%,
    var(--surface-3) 50%,
    var(--surface-2) 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.6s ease-in-out infinite;
  border-radius: var(--radius-sm);
}
/* Disable animation when prefers-reduced-motion or data-anim="off" */
:root[data-anim="off"] .skeleton { animation: none; }
```

**Loading state rules:**
- Skeleton blocks replace text/number content, not whole cards
- Preserve the card's border and shadow during loading (do not strip the card shell)
- Skeleton height matches the element it replaces: e.g. `14px` for body text, `46px` for big stats, `160px` for charts
- No spinner on charts — use full-width skeleton blocks inside the chart area
- `border-radius` matches the content it replaces (text rows: `6px`; stat numbers: `8px`)

---

## 14. Animation

| Token / Rule | Value |
|-------------|-------|
| Default transition | `0.12s–0.16s` |
| `fade-up` enter | `0.5s cubic-bezier(.2,.7,.2,1)` — `translateY(9px) → none` |
| Deep panel enter | `0.42s cubic-bezier(.2,.7,.2,1)` — `translateY(8px) → none` |
| Sidebar drawer | `0.26s cubic-bezier(.2,.7,.2,1)` |
| Bar fill | `1s cubic-bezier(.2,.7,.2,1)` |
| Funnel fill | `1s cubic-bezier(.2,.7,.2,1)` |
| Alert pulse | `2.6s ease-out infinite` (box-shadow grow/fade) |
| Disable all | `[data-anim="off"]` → `transition-duration: 0s`, `animation-duration: 0s` |

> All animations use `transform` only at rest so captures/PDF/print never see hidden content.

---

## 15. Scrollbar Style

```css
width: 10px; height: 10px;
thumb: background: --border-strong; border-radius: 8px; border: 2px solid transparent (clip);
thumb:hover: background: --text-ghost;
track: transparent;
```

Hidden on: `.tabs`, `.seg` (scrollbar-width: none)

---

## 16. Key Component Dimensions

| Component | Dimension |
|-----------|-----------|
| Sidebar width (desktop) | `244px` |
| Sidebar width (icon) | `68px` |
| Topbar height | `58px` (mobile: `56px`) |
| CTA button (`.sb-add`) | `40px` height, `border-radius: 11px` |
| Sidebar user card | `border-radius: 12px` |
| Topbar search | `36px` height, `border-radius: 10px` |
| Topbar icon buttons | `36×36px`, `border-radius: 10px` |
| Filter button | `36px` height, `border-radius: 10px` |
| Primary button (`.btn`) | `38px` height, `border-radius: 10px` |
| Chip | `30px` height, `border-radius: 999px` |
| Segmented control | `border-radius: 13px` outer, `9px` inner buttons |
| Card | `padding: var(--pad)` = `28px`, `border-radius: var(--radius)` = `16px` |
| Lead card | `padding: var(--pad) + 4px` = `32px` |
| Icon button | `30×30px`, `border-radius: 9px` |
| Highlight avatar | `48×48px`, `border-radius: 15px` |
| Insight icon block | `32×32px`, `border-radius: 9px` |
| Horizontal bar track | `10px` height, `border-radius: 6px` |
| Funnel track | `30px` height, `border-radius: 9px` |
| Health metric bar | `7px` height, `border-radius: 5px` |
| Mini table bar | `7px` height, `border-radius: 5px` |
| Destination bar | `5px` height, `border-radius: 4px` |
| Utility cell | `border-radius: 13px`, `padding: 14px` |
| AI input | `40px` height, `border-radius: 11px` |
| Rank badge | `19×19px`, `border-radius: 6px` |
| Destination pin | `24×24px`, `border-radius: 7px` |

---

## 17. Z-Index Stack

| Layer | Value | Element |
|-------|-------|---------|
| Sidebar (desktop) | `40` | `.sidebar` |
| Topbar | `35` | `.topbar` |
| Filter bar | `30` | `.filterbar` |
| Dropdown menus | `50` | `.fb-menu` |
| Sidebar backdrop (mobile) | `39` | `.sb-backdrop` |

---

## 18. Gradient Recipes

| Element | Gradient |
|---------|---------|
| CTA button / brand red | `linear-gradient(180deg, --accent-2, --accent)` |
| Sidebar logo | `radial-gradient(circle at 30% 25%, #2a8a46, #0e5a27 70%)` |
| Sidebar avatar | `linear-gradient(180deg, --accent-2, --accent)` |
| Highlight avatar | `linear-gradient(150deg, --accent-2, --accent)` |

---

## 19. Topbar Backdrop

```css
background: color-mix(in srgb, var(--canvas) 80%, transparent);
backdrop-filter: blur(16px) saturate(1.4);
```

Filter bar when scrolled past:
```css
background: color-mix(in srgb, var(--canvas) 86%, transparent);
backdrop-filter: blur(12px);
```

---

## 20. Implementation Notes

1. **Density system** — wrap the entire app in `[data-density]` to switch spacing. Default to `comfortable`.
2. **Theme switching** — set `[data-theme="dark"]` on `:root`. Tokens cascade automatically.
3. **Animation kill-switch** — set `[data-anim="off"]` on `:root` for reduced-motion or print.
4. **Tabular numerals** — all stat values use `font-variant-numeric: tabular-nums` to prevent layout shift.
5. **Sticky layering** — topbar at `top: 0`, filter bar at `top: var(--topbar-h)` to stack correctly.
6. **Filter bar stuck state** — add `.stuck` class via IntersectionObserver; it shows `--border` as bottom border.
7. **Bar animations** — `.fill` and `.ffill` transition `width` from `0` to target on mount. Requires JS to set initial width then add the CSS class.
8. **Text balance** — hero titles use `text-wrap: balance` (Chrome 114+). Safe to leave as-is for older browsers (falls back to normal wrap).
