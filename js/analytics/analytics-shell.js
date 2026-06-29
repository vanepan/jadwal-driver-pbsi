/* ============================================================
   ANALYTICS-SHELL.JS — Reusable Analytics V2 layout primitives

   Sprint 1 (v1.10.0): separates analytics *layout structure* from
   analytics *content*. Pure string builders (no DOM, no Firebase, no
   business logic) — they wrap already-computed content fragments in a
   consistent section/state shell so every analytics block renders the
   same way and future modules can reuse the structure.

   IMPORTANT: this module performs NO calculations and changes NO numbers.
   It only standardizes the surrounding markup. Existing CSS classes are
   reused so there is no visual redesign.
   ============================================================ */

'use strict';

/** Minimal HTML escaper for engine-generated strings rendered by components. */
function _escHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * Ordered Analytics V2 section identifiers (the information architecture).
 * Rendering code may use this to keep section order consistent.
 */
export const ANALYTICS_SECTION_ORDER = [
  'analyticsExecutiveSummary',
  'analyticsTrends',
  'analyticsDriver',
  'analyticsVehicle',
  'analyticsBidang',
  'analyticsDestination',
  'analyticsOdometer',
  'analyticsInsights',
  'analyticsRecommendations',
  'analyticsDataQuality',
  'analyticsExport',
];

/**
 * Standard analytics section wrapper. When `description` is empty the output
 * is structurally identical to the legacy section markup (header directly
 * followed by content) — guaranteeing the existing sections look unchanged.
 *
 * @param {Object} p
 * @param {string} [p.id]
 * @param {string} p.title
 * @param {string} [p.description]
 * @param {string} p.content      - pre-built inner HTML (already escaped where needed)
 * @param {string} [p.variant]    - optional modifier suffix → v2-analytics-section--<variant>
 * @returns {string}
 */
export function renderAnalyticsSection({ id = '', title = '', description = '', content = '', variant = '' } = {}) {
  const idAttr = id ? ` id="${id}"` : '';
  const variantCls = variant ? ` v2-analytics-section--${variant}` : '';
  const descHtml = description
    ? `<p class="v2-analytics-section-desc" style="margin:-2px 0 14px;color:var(--text-dim,#5b5b64);font-size:13px;line-height:1.5;">${description}</p>`
    : '';
  return `
      <div class="v2-analytics-section${variantCls}"${idAttr}>
        <div class="v2-analytics-section-header">${title}</div>
        ${descHtml}
        ${content}
      </div>`;
}

/**
 * A reserved section that hosts no live content yet (Operational Trends,
 * Insights/Recommendations, Export Center). Renders a calm empty/placeholder
 * state so the architecture slot is visible without implying broken UI.
 */
export function renderAnalyticsPlaceholderSection({ id = '', title = '', description = '', note = '' } = {}) {
  return renderAnalyticsSection({
    id, title, description, variant: 'placeholder',
    content: `
        <div class="v2-analytics-groups">
          <div class="v2-admin-config-group">
            ${renderAnalyticsEmptyState({ message: note || 'Bagian ini sedang disiapkan.' })}
          </div>
        </div>`,
  });
}

/* ── KPI system (Sprint 2) — reusable, module-agnostic ───────────────────── */

/**
 * Trend indicator. Anything other than an explicit up/down trend renders a calm
 * NEUTRAL state — we never fabricate a comparison. The arrow always follows raw
 * movement (`direction`); the COLOR follows `tone` when supplied, since "up" is
 * good for some metrics (completion) and bad for others (open/cancellation rate).
 * Without `tone`, color falls back to direction (backward compatible).
 * Shape: { direction:'up'|'down'|'neutral', percent, tone?:'positive'|'negative'|'neutral' }.
 * @param {{direction?:string, percent?:number, tone?:string}|null} trend
 */
export function renderTrendIndicator(trend) {
  const dir = trend && trend.direction;
  if ((dir !== 'up' && dir !== 'down') || trend.percent == null) {
    return `<span class="v2-analytics-kpi-trend v2-analytics-kpi-trend--neutral" title="Perbandingan antar-periode belum tersedia">—</span>`;
  }
  const arrow = dir === 'up' ? '▲' : '▼';
  // tone → reuse the existing --up (good/green) / --down (bad/warn) color classes.
  const colorKey = trend.tone
    ? (trend.tone === 'positive' ? 'up' : trend.tone === 'negative' ? 'down' : 'neutral')
    : dir;
  return `<span class="v2-analytics-kpi-trend v2-analytics-kpi-trend--${colorKey}">${arrow} ${Math.abs(trend.percent)}%</span>`;
}

/**
 * One reusable KPI card. Presentation only — `value` is already computed by
 * the Analytics Engine. Designed for reuse across Driver/Engineering/Inventory/
 * Cost/Maintenance modules.
 *
 * @param {Object} p
 * @param {string} p.title
 * @param {string|number} [p.value]
 * @param {{direction?:string,percent?:number}|null} [p.trend]
 * @param {string} [p.comparison]   - small caption next to the trend
 * @param {string} [p.icon]         - glyph (presentation only)
 * @param {''|'ok'|'warn'|'info'} [p.status]
 * @param {string} [p.subtitle]
 * @param {boolean} [p.loading]
 */
export function renderAnalyticsKPICard({ title = '', value = '', trend = null, comparison = '', icon = '', status = '', subtitle = '', loading = false } = {}) {
  if (loading) {
    return `
      <div class="v2-analytics-kpi-card v2-analytics-kpi-card--loading" aria-busy="true">
        <div class="v2-analytics-kpi-skel v2-analytics-kpi-skel--line"></div>
        <div class="v2-analytics-kpi-skel v2-analytics-kpi-skel--value"></div>
      </div>`;
  }
  const statusCls = status ? ` v2-analytics-kpi-card--${status}` : '';
  const displayVal = (value === '' || value == null) ? '—' : value;
  const iconHtml = icon ? `<span class="v2-analytics-kpi-card-icon" aria-hidden="true">${icon}</span>` : '';
  const compHtml = comparison ? `<span class="v2-analytics-kpi-card-comp">${comparison}</span>` : '';
  const subHtml = subtitle ? `<div class="v2-analytics-kpi-card-sub">${subtitle}</div>` : '';
  return `
      <div class="v2-analytics-kpi-card${statusCls}">
        <div class="v2-analytics-kpi-card-head">
          ${iconHtml}
          <span class="v2-analytics-kpi-card-title">${title}</span>
        </div>
        <div class="v2-analytics-kpi-card-value">${displayVal}</div>
        <div class="v2-analytics-kpi-card-meta">${renderTrendIndicator(trend)}${compHtml}</div>
        ${subHtml}
      </div>`;
}

/**
 * Container-aware currency cell (v1.15.3). Carries four representations as data-*
 * attributes; bindResponsiveCurrency() (a ResizeObserver) swaps the visible text
 * to the widest form that fits the cell's ACTUAL width — not the viewport — so it
 * adapts correctly under DevTools, split-screen, foldables and tablet landscape:
 *   ≥240px "Rp 10.000.000" · 180–240 "Rp 10 Jt" · 130–180 "10 Jt" · <130 "10Jt"
 * Default text is the full value (graceful no-JS / pre-measure fallback). Pure
 * presentation — currency logic stays single-sourced (rp / rpCompact); the bare
 * + tight forms are derived by stripping the compact string (no dup formatter).
 * @param {string} full    e.g. "Rp 10.000.000"
 * @param {string} compact e.g. "Rp 10 Jt"
 * @param {string} [extraClass]
 */
export function renderResponsiveCurrency(full, compact, extraClass = '') {
  const f = String(full == null ? '' : full);
  const c = String(compact == null ? '' : compact);
  const bare = c.replace(/^(-?)Rp\s*/, '$1'); // "10 Jt"
  const tight = bare.replace(/\s+/g, '');      // "10Jt"
  const cls = extraClass ? ` ${extraClass}` : '';
  return `<span class="an-cur${cls}" data-cur-full="${_escHtml(f)}" data-cur-rp="${_escHtml(c)}" data-cur-jt="${_escHtml(bare)}" data-cur-tight="${_escHtml(tight)}">${_escHtml(f)}</span>`;
}

/**
 * Responsive KPI grid (desktop 4 / tablet 2 / mobile 1 — via CSS).
 * @param {string[]} cards - pre-rendered card HTML strings
 */
export function renderKPIGrid(cards = []) {
  const inner = Array.isArray(cards) ? cards.filter(Boolean).join('') : String(cards || '');
  return `<div class="v2-analytics-kpi-grid">${inner}</div>`;
}

/**
 * Operational highlights — surfaces EXISTING analytics outputs in an
 * executive-friendly format (no AI, no recommendations, no new computation).
 * @param {Array<{label:string,value:string,context?:string}|null>} items
 */
export function renderOperationalHighlights(items = []) {
  const valid = (items || []).filter(Boolean);
  if (valid.length === 0) {
    return renderAnalyticsEmptyState({ message: 'Belum ada sorotan operasional pada periode ini.' });
  }
  return `<div class="v2-analytics-highlights">${valid.map(it => `
      <div class="v2-analytics-highlight">
        <span class="v2-analytics-highlight-eyebrow">${it.label}</span>
        <span class="v2-analytics-highlight-value">${it.value}</span>
        ${it.context ? `<span class="v2-analytics-highlight-context">${it.context}</span>` : ''}
      </div>`).join('')}</div>`;
}

/* ── Standardized states (lightweight, reuse existing styled classes) ─────── */

/** Empty state — reuses the existing .v2-analytics-empty-state styling. */
export function renderAnalyticsEmptyState({ message = 'Tidak ada data.', hint = '' } = {}) {
  return `
      <div class="v2-analytics-empty-state">
        <p class="v2-analytics-empty-state-msg">${message}</p>
        ${hint ? `<p class="v2-analytics-empty-state-hint">${hint}</p>` : ''}
      </div>`;
}

/** Loading state — minimal, no spinner (kept intentionally lightweight). */
export function renderAnalyticsLoadingState({ message = 'Memuat analytics…' } = {}) {
  return `
      <div class="v2-analytics-empty-state v2-analytics-loading-state" aria-busy="true">
        <p class="v2-analytics-empty-state-msg">${message}</p>
      </div>`;
}

/** Error state — surfaced when computation/render fails (new resilience). */
export function renderAnalyticsErrorState({ message = 'Terjadi kesalahan saat memuat analytics.', detail = '' } = {}) {
  return `
      <div class="v2-analytics-empty-state v2-analytics-error-state" role="alert">
        <p class="v2-analytics-empty-state-msg"><span class="an-state-ico">${anIcon('alert', { size: 15 })}</span> ${message}</p>
        ${detail ? `<p class="v2-analytics-empty-state-hint">${detail}</p>` : ''}
      </div>`;
}

/* ── Unified chart system (Sprint 3) ─────────────────────────────────────────
   One container for every analytics chart: Title · Subtitle · Chart Area ·
   Footer. The Chart.js rendering itself is unchanged — this only standardizes
   the surrounding presentation. Reuses the existing .v2-analytics-chart-*
   classes so existing charts look identical. */

/**
 * @param {Object} p
 * @param {string} p.title
 * @param {string} [p.subtitle]
 * @param {string} p.canvasId        - kept stable so the Chart.js layer finds it
 * @param {string} [p.boxVariant]    - e.g. 'donut' → v2-analytics-chart-box--donut
 * @param {number|null} [p.height]   - fixed px height for bar charts
 * @param {string} [p.actions]       - pre-built action HTML (toolbar)
 * @param {string} [p.footer]
 * @param {{generatedAt?:string,period?:string,source?:string}|null} [p.metadata]
 *        Hidden data-* attributes for future PDF/Excel/AI/governance consumers.
 */
export function renderAnalyticsChart({ title = '', subtitle = '', canvasId = '', boxVariant = '', height = null, actions = '', footer = '', metadata = null } = {}) {
  const boxVariantCls = boxVariant ? ` v2-analytics-chart-box--${boxVariant}` : '';
  const heightStyle = height ? ` style="height:${height}px;"` : '';
  const subtitleHtml = subtitle ? `<div class="v2-analytics-chart-subtitle">${subtitle}</div>` : '';
  const actionsHtml = actions ? `<div class="v2-analytics-chart-actions">${actions}</div>` : '';
  const footerHtml = footer ? `<div class="v2-analytics-chart-footer">${footer}</div>` : '';
  const m = metadata || {};
  const metaAttr = metadata
    ? ` data-generated-at="${m.generatedAt || ''}" data-period="${m.period || ''}" data-source="${m.source || ''}"`
    : '';
  // When there is no subtitle/actions, emit the legacy header markup verbatim so
  // existing charts are byte-identical (only optional, invisible meta is added).
  const head = (subtitle || actions)
    ? `<div class="v2-analytics-chart-head"><div class="v2-analytics-chart-titles"><div class="v2-analytics-chart-label">${title}</div>${subtitleHtml}</div>${actionsHtml}</div>`
    : `<div class="v2-analytics-chart-label">${title}</div>`;
  return `
    <div class="v2-analytics-chart-wrap"${metaAttr}>
      ${head}
      <div class="v2-analytics-chart-box${boxVariantCls}"${heightStyle}>
        <canvas id="${canvasId}"></canvas>
      </div>
      ${footerHtml}
    </div>`;
}

/** Shared shell for chart states (loading/empty/error) inside a chart wrapper. */
function _chartStateShell(title, inner) {
  const label = title ? `<div class="v2-analytics-chart-label">${title}</div>` : '';
  return `
    <div class="v2-analytics-chart-wrap">
      ${label}
      <div class="v2-analytics-chart-state">${inner}</div>
    </div>`;
}

export function renderAnalyticsChartLoading({ title = '', message = 'Memuat grafik…' } = {}) {
  return _chartStateShell(title, renderAnalyticsLoadingState({ message }));
}
export function renderAnalyticsChartEmpty({ title = '', message = 'Belum ada data untuk grafik ini.', hint = '' } = {}) {
  return _chartStateShell(title, renderAnalyticsEmptyState({ message, hint }));
}
export function renderAnalyticsChartError({ title = '', message = 'Grafik gagal dimuat.', detail = '' } = {}) {
  return _chartStateShell(title, renderAnalyticsErrorState({ message, detail }));
}

/* ── Insight card (Sprint 4) ──────────────────────────────────────────────────
   Reusable presentation for one Insight produced by the Insight Engine. Escapes
   its inputs internally (they are engine-generated sentences). Retained for
   backward compatibility; the Sprint-7B Operational Health surface uses
   renderInsightRow (divider list) instead. */

/**
 * @param {Object} p
 * @param {'info'|'success'|'warning'} [p.type]
 * @param {string} p.title
 * @param {string} [p.description]
 * @param {string} [p.source]   - the metric this insight is derived from
 */
export function renderInsightCard({ type = 'info', title = '', description = '', source = '' } = {}) {
  const t = (type === 'success' || type === 'warning') ? type : 'info';
  const ico = t === 'warning' ? 'bolt' : t === 'success' ? 'check' : 'spark';
  return `
      <div class="v2-analytics-insight-card v2-analytics-insight-card--${t}">
        <span class="v2-analytics-insight-icon" aria-hidden="true">${anIcon(ico, { size: 15 })}</span>
        <div class="v2-analytics-insight-body">
          <div class="v2-analytics-insight-title">${_escHtml(title)}</div>
          ${description ? `<div class="v2-analytics-insight-desc">${_escHtml(description)}</div>` : ''}
          ${source ? `<span class="v2-analytics-insight-source">${_escHtml(source)}</span>` : ''}
        </div>
      </div>`;
}

/** Vertical list wrapper for insight cards. */
export function renderInsightList(cards = []) {
  const inner = Array.isArray(cards) ? cards.filter(Boolean).join('') : String(cards || '');
  return `<div class="v2-analytics-insight-list">${inner}</div>`;
}

/* ── Recommendation card (Sprint 5) ──────────────────────────────────────────
   Advisory "what should we do?" card. Reuses the insight-card architecture
   (same markup/CSS) with recommendation-specific type → accent/icon mapping. */

/**
 * @param {Object} p
 * @param {'action'|'warning'|'optimization'} [p.type]
 * @param {string} p.title
 * @param {string} [p.description]
 * @param {string} [p.source]
 */
export function renderRecommendationCard({ type = 'action', title = '', description = '', source = '' } = {}) {
  // Map advisory type → existing insight accent class + an action-oriented icon.
  const accent = type === 'warning' ? 'warning' : type === 'optimization' ? 'success' : 'info';
  const ico = type === 'warning' ? 'bolt' : type === 'optimization' ? 'spark' : 'arrowUR';
  return `
      <div class="v2-analytics-insight-card v2-analytics-insight-card--${accent} v2-analytics-insight-card--rec" data-rec-type="${_escHtml(type)}">
        <span class="v2-analytics-insight-icon" aria-hidden="true">${anIcon(ico, { size: 15 })}</span>
        <div class="v2-analytics-insight-body">
          <div class="v2-analytics-insight-title">${_escHtml(title)}</div>
          ${description ? `<div class="v2-analytics-insight-desc">${_escHtml(description)}</div>` : ''}
          ${source ? `<span class="v2-analytics-insight-source">${_escHtml(source)}</span>` : ''}
        </div>
      </div>`;
}

/** Vertical list wrapper for recommendation cards. */
export function renderRecommendationList(cards = []) {
  const inner = Array.isArray(cards) ? cards.filter(Boolean).join('') : String(cards || '');
  return `<div class="v2-analytics-insight-list v2-analytics-rec-list">${inner}</div>`;
}

/* ============================================================================
   CLAUDE DESIGN VISUAL LANGUAGE (Sprint 7B)

   Faithful port of the approved prototype (Analytics-V2/*.jsx + analytics.css)
   to vanilla string builders: an SVG icon system (no emoji), a keynote hero
   with a health ring, editorial highlights, eyebrow section headers, a premium
   segmented control, and a divider-based insight list. Pure presentation — no
   calculations, no data. All markup is consumed inside the `.v2-analytics-claude`
   scope so the rest of the app is untouched.
   ============================================================================ */

/* ── SVG icon system (ported from Analytics-V2/charts.jsx PATHS) ───────────── */
const AN_ICON_PATHS = {
  check:    'M20 6 9 17l-5-5',
  user:     'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0',
  car:      'M5 11l1.5-4.5A2 2 0 0 1 8.4 5h7.2a2 2 0 0 1 1.9 1.5L19 11m-14 0h14m-14 0a2 2 0 0 0-2 2v3h2m14-5a2 2 0 0 1 2 2v3h-2m-12 0h10m-10 0v1a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-1m12 0v1a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-1M7.5 14h.01M16.5 14h.01',
  building: 'M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16M15 21V9h4a1 1 0 0 1 1 1v11M3 21h18M7.5 8h.5M7.5 12h.5M7.5 16h.5M11 8h.5M11 12h.5',
  pin:      'M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11Zm0-8a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  ruler:    'M3 9.5 9.5 3 21 14.5 14.5 21 3 9.5ZM7 8l1.5 1.5M10 11l1.5 1.5M13 8l1.5 1.5',
  download: 'M12 3v12M7 11l5 5 5-5M5 21h14',
  reset:    'M3 12a9 9 0 1 0 3-6.7M3 4v4h4',
  x:        'M6 6l12 12M18 6 6 18',
  spark:    'M12 2v6M12 16v6M4.9 4.9l4.2 4.2M14.9 14.9l4.2 4.2M2 12h6M16 12h6',
  trend:    'M3 17l6-6 4 4 7-7M14 8h6v6',
  pin2:     '',
  chart:    'M4 20V10M10 20V4M16 20v-7M22 20H2',
  sparkle:  'M12 3l1.6 4.8L18 9.4l-4.4 1.6L12 16l-1.6-5L6 9.4l4.4-1.6zM19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8z',
  filter:   'M3 5h18l-7 8v5l-4 2v-7z',
  alert:    'M12 9v4M12 17h.01M10.3 4.3 2.6 18a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0Z',
  bolt:     'M13 2 4 14h6l-1 8 9-12h-6z',
  pulse:    'M3 12h4l2-6 4 12 2-6h6',
  arrowUR:  'M7 17 17 7M8 7h9v9',
  arrowDR:  'M7 7 17 17M17 8v9h-9',
  chevR:    'M9 6l6 6-6 6',
  file:     'M13 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5ZM13 3v5h5',
  sheet:    'M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1ZM4 9.5h16M4 14.5h16M9 4v16',
  printer:  'M6 9V3h12v6M6 18H4a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-2M6 14h12v7H6z',
  // ── v1.18.3 Executive UI Kit additions (single icon engine; renderIcon →
  //    anIcon consolidation). Outline only, currentColor stroke, 24×24. No emoji.
  vehicle:        'M3 13l1.8-5.2A2 2 0 0 1 6.7 6.5h10.6a2 2 0 0 1 1.9 1.3L21 13M5 13h14v4H5zM7 17v1.5M17 17v1.5M7.5 13.5h.01M16.5 13.5h.01',
  motorcycle:     'M5 18a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm14 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm-9-3h6l2.5-4M8 11h4l2 4M14 8h3.5',
  ambulance:      'M3 14h13V8H3zM16 11h3.2l1.8 3v3h-5zM6.5 18a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm11 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM8.5 9.5h2M9.5 8.5v2',
  fleet:          'M2 16.5h8.5v-3L9 10.5H3.5L2 13.5zM4 16.5V18M9 16.5V18M12.5 11h6.5l1.7 3.2v2.8h-7.2M14.5 17.3V18.5M19 17.3V18.5',
  maintenance:    'M21 3l-5.5 5.5m0 0a4 4 0 1 1-4.5-4.5 4 4 0 0 0 4.5 4.5ZM9.5 11.5l-6 6 3 3 6-6',
  history:        'M3 12a9 9 0 1 0 3-6.7M3 5v4h4M12 8v4.2l3 1.8',
  insurance:      'M12 3l7 3v5c0 4.6-3 7.7-7 9-4-1.3-7-4.4-7-9V6zM9 12l2 2 4-4',
  tax:            'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h3',
  dispatch:       'M3.5 11.5 20.5 4l-7 16.5-2.6-7.2-7.4-1.8Z',
  recommendation: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 4a5 5 0 1 0 0 10 5 5 0 0 0 0-10Zm0 4a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z',
  wellness:       'M3.5 12.5H7l1.5-3.5 3 7L16 9l1.5 3.5h3M12 20C7 16 4.5 13 4.5 9.8A3.8 3.8 0 0 1 12 8a3.8 3.8 0 0 1 7.5 1.8',
  analytics:      'M4 19h16M7 16v-5M12 16V7M17 16v-9',
  pettycash:      'M3 7a2 2 0 0 1 2-2h11v3M3 7v10a2 2 0 0 0 2 2h13a1 1 0 0 0 1-1v-3M21 10v4h-4a2 2 0 0 1 0-4z',
  drawer:         'M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1ZM15 5v14',
  timeline:       'M5 5.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm0 9.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3ZM5 8.5V15M10 7h9M10 16.5h9',
  search:         'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM20 20l-3.6-3.6',
  sort:           'M7 4v15M4 8l3-4 3 4M17 20V5M14 16l3 4 3-4',
  lock:           'M6 10V8a6 6 0 0 1 12 0v2M5 10h14a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1Zm7 4.5v2',
  offline:        'M2 4l20 20M8.5 16.6a5 5 0 0 1 7 0M5 12.9a10 10 0 0 1 3.2-2.1M19 12.9a10 10 0 0 0-7.4-2.8M12 20h.01',
};

/**
 * Inline SVG icon (string). Single consistent stroke set — replaces every emoji.
 * @param {string} name
 * @param {{size?:number,stroke?:number,fill?:boolean,cls?:string}} [opt]
 */
export function anIcon(name, { size = 16, stroke = 2, fill = false, cls = '' } = {}) {
  const d = AN_ICON_PATHS[name] || '';
  const classAttr = cls ? ` class="${cls}"` : '';
  return `<svg${classAttr} width="${size}" height="${size}" viewBox="0 0 24 24" fill="${fill ? 'currentColor' : 'none'}" stroke="${fill ? 'none' : 'currentColor'}" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
}

/**
 * Eyebrow section header (tag chip · title · sub · hairline) — the de-boxed
 * section scaffold from the prototype (analytics.css `.eyebrow`).
 */
export function renderEyebrow({ tag = '', title = '', sub = '' } = {}) {
  return `<div class="eyebrow">
      ${tag ? `<span class="tag">${_escHtml(tag)}</span>` : ''}
      <h2>${_escHtml(title)}</h2>
      ${sub ? `<span class="sub">${_escHtml(sub)}</span>` : ''}
      <span class="line"></span>
    </div>`;
}

/**
 * Health ring gauge (SVG string). Renders empty (dasharray 0) and carries the
 * target length in data-* so the host animates the draw on mount.
 * @param {{value?:number,size?:number,thickness?:number,color?:string,track?:string}} p
 */
export function renderRingGauge({ value = 0, size = 38, thickness = 5, color = 'var(--accent)', track = 'var(--surface-2)' } = {}) {
  const v = Math.max(0, Math.min(1, Number(value) || 0));
  const r = (size - thickness) / 2;
  const cx = size / 2;
  const circ = 2 * Math.PI * r;
  const len = (v * circ).toFixed(1);
  return `<svg class="an-ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">
      <circle cx="${cx}" cy="${cx}" r="${r.toFixed(2)}" fill="none" stroke="${track}" stroke-width="${thickness}"/>
      <circle class="an-ring-val" cx="${cx}" cy="${cx}" r="${r.toFixed(2)}" fill="none" stroke="${color}" stroke-width="${thickness}"
        stroke-linecap="round" stroke-dasharray="0 ${circ.toFixed(1)}" data-ring-len="${len}" data-ring-circ="${circ.toFixed(1)}"
        transform="rotate(-90 ${cx} ${cx})"/>
    </svg>`;
}

/**
 * Keynote executive hero (de-boxed) — verdict headline + health ring + 3 big
 * stats on whitespace (prototype overview.jsx / analytics.css `.hero`).
 *
 * @param {Object} p
 * @param {string} p.headline      - HTML; the verdict word should be wrapped in <span class="hl">…</span>
 * @param {string} p.sub           - HTML subtitle
 * @param {{label:string}|null} [p.attn] - optional pulse "needs attention" button
 * @param {number} p.score
 * @param {string} p.grade
 * @param {number} p.ringValue     - 0..1
 * @param {string} p.ringColor
 * @param {'green'|'amber'|'crit'} p.tone
 * @param {Array<{lbl:string,big:string,delta?:{tone:string,icon?:string,text:string,sub?:string},alert?:string,alertStat?:boolean}>} p.stats
 */
export function renderHeroSection({ headline = '', sub = '', attn = null, score = 0, grade = '', ringValue = 0, ringColor = 'var(--c-green)', tone = 'green', stats = [] } = {}) {
  const attnHtml = attn
    ? `<button class="hero-attn" type="button" data-action="goto-health"><span class="dot"></span> ${_escHtml(attn.label)} ${anIcon('chevR', { size: 13 })}</button>`
    : '';
  const ring = renderRingGauge({ value: ringValue, size: 172, thickness: 13, color: ringColor });
  const statHtml = (stats || []).map(s => {
    let metaHtml = '';
    if (s.delta) {
      metaHtml = `<div class="delta ${s.delta.tone || ''}">${s.delta.icon || ''} ${s.delta.text}${s.delta.sub ? ` <span>${_escHtml(s.delta.sub)}</span>` : ''}</div>`;
    } else if (s.alert) {
      metaHtml = `<button class="alertbtn" type="button" data-action="goto-health">${_escHtml(s.alert)} ${anIcon('chevR', { size: 12 })}</button>`;
    }
    return `<div class="hm-stat${s.alertStat ? ' alert' : ''}">
          <div class="lbl">${_escHtml(s.lbl)}</div>
          <div class="big">${s.big}</div>
          ${metaHtml}
        </div>`;
  }).join('');
  return `<section class="level hero fade-up an-tone-${tone}" id="analyticsExecutiveSummary">
      <div class="hero-head">
        <h1 class="hero-title">${headline}</h1>
        <p class="hero-sub">${sub}</p>
        ${attnHtml}
      </div>
      <div class="hero-metrics">
        <div class="hm-health">
          <div class="gwrap">
            ${ring}
            <div class="score">${score == null
              ? '<span class="v">—</span><span class="s">/ 100</span>'
              : `<span class="v" data-countup="${score}" data-countup-decimals="0">0</span><span class="s">/ 100</span>`}</div>
          </div>
          <div class="meta">
            <div class="lbl">Kesehatan Operasional</div>
            <span class="grade">${anIcon('check', { size: 13 })} ${_escHtml(grade)}</span>
          </div>
        </div>
        <div class="hm-stats">${statHtml}</div>
      </div>
    </section>`;
}

/**
 * Editorial highlights trio (de-boxed) — prototype `.highlights`. Each item
 * deep-links into a Resource tab via data-action="goto-resource".
 * @param {Array<{label:string,value:string,avatar?:string,unit?:string,tone?:string,context?:string,tag?:string,tagTone?:string,tab?:string}|null>} items
 */
export function renderHighlights(items = []) {
  const valid = (items || []).filter(Boolean);
  if (valid.length === 0) {
    return renderAnalyticsEmptyState({ message: 'Belum ada sorotan operasional pada periode ini.' });
  }
  return `<div class="highlights">${valid.map(it => {
    const inner = it.avatar
      ? `<div class="hl-val"><span class="hl-ava">${_escHtml(it.avatar)}</span><span class="hl-name">${_escHtml(it.value)}</span></div>`
      : `<div class="hl-num ${it.tone === 'up' ? 'up' : ''}">${_escHtml(it.value)}${it.unit ? `<span class="u">${_escHtml(it.unit)}</span>` : ''}</div>`;
    const tagHtml = it.tag ? `<span class="hl-tag ${it.tagTone || ''}">${_escHtml(it.tag)}</span>` : '';
    const tabAttr = it.tab ? ` data-action="goto-resource" data-tab-target="${_escHtml(it.tab)}"` : '';
    return `<button class="hl-item" type="button"${tabAttr}>
        <span class="hl-eye">${_escHtml(it.label)}</span>
        ${inner}
        <span class="hl-ctx">${_escHtml(it.context || '')}</span>
        ${tagHtml}
      </button>`;
  }).join('')}</div>`;
}

/**
 * One Operational-Health divider row (prototype `.insight`). No nested boxes.
 * @param {Object} p
 * @param {'crit'|'warn'|'info'|'good'} [p.tone]
 * @param {string} p.title
 * @param {string} [p.sevLabel]
 * @param {string} [p.desc]
 * @param {string} [p.kind]   - 'Wawasan' | 'Rekomendasi'
 */
export function renderInsightRow({ tone = 'info', title = '', sevLabel = '', desc = '', kind = '' } = {}) {
  const t = (tone === 'crit' || tone === 'warn' || tone === 'good') ? tone : 'info';
  const icoFor = { crit: 'alert', warn: 'bolt', info: 'spark', good: 'check' };
  const kindHtml = kind
    ? `<span class="an-kind an-kind--${kind === 'Rekomendasi' ? 'rec' : 'ins'}">${_escHtml(kind)}</span>`
    : '';
  const sevHtml = sevLabel ? `<span class="sev sev-${t}">${_escHtml(sevLabel)}</span>` : '';
  return `<div class="insight">
      <div class="ib ib-${t}">${anIcon(icoFor[t] || 'spark', { size: 16 })}</div>
      <div class="an-insight-main">
        <div class="it">${_escHtml(title)}${sevHtml}${kindHtml}</div>
        ${desc ? `<div class="id">${_escHtml(desc)}</div>` : ''}
      </div>
    </div>`;
}

/** Divider list wrapper for renderInsightRow items (prototype `.insights`). */
export function renderInsightDividerList(rows = []) {
  const inner = Array.isArray(rows) ? rows.filter(Boolean).join('') : String(rows || '');
  return `<div class="insights">${inner}</div>`;
}

/**
 * Score breakdown bars (v1.16.3) — a compact, explainable list of weighted
 * sub-scores rendered in the Executive visual language. Each row shows the
 * component label, its 0–100 score, and a horizontal bar whose width = score and
 * whose color follows the supplied tone (green/amber/crit). A `null` score reads
 * as an em-dash with an empty track (mirrors the hero's No-Data treatment), so a
 * missing component never looks like a real 0.
 * @param {Array<{label:string, score:number|null, tone?:'green'|'amber'|'crit', weightPct?:number, scope?:string}>} rows
 * @returns {string}
 */
export function renderScoreBreakdown(rows = []) {
  const items = (Array.isArray(rows) ? rows : []).filter(Boolean);
  if (!items.length) return '';
  const body = items.map((r) => {
    const has = r.score != null && Number.isFinite(Number(r.score));
    const pct = has ? Math.max(0, Math.min(100, Number(r.score))) : 0;
    const tone = (r.tone === 'crit' || r.tone === 'amber') ? r.tone : 'green';
    const weight = (r.weightPct != null) ? `<span class="an-sb-wt">${_escHtml(String(r.weightPct))}%</span>` : '';
    const val = has ? String(pct) : '—';
    // v1.16.4.6.1 — optional scope subtitle (Trust Layer). Back-compatible: rows
    // without `scope` render exactly as before, so other callers are unaffected.
    const scope = r.scope ? `<div class="an-sb-scope">${_escHtml(String(r.scope))}</div>` : '';
    return `<div class="an-sb-row">
        <div class="an-sb-head">
          <span class="an-sb-lbl">${_escHtml(r.label)}${weight}</span>
          <span class="an-sb-val">${val}</span>
        </div>
        ${scope}
        <div class="an-sb-track"><span class="an-sb-fill an-tone-${tone}" style="width:${pct}%;"></span></div>
      </div>`;
  }).join('');
  return `<div class="an-scorebar">${body}</div>`;
}

/**
 * Premium segmented control (prototype `.seg`). Same data-tab-* contract as the
 * Sprint-7 tabs so the existing delegated switch listener keeps working.
 * @param {{groupId:string, tabs:Array<{id:string,label:string,icon?:string}>, activeId?:string}} p
 */
export function renderSeg({ groupId = '', tabs = [], activeId = '' } = {}) {
  const list = Array.isArray(tabs) ? tabs.filter(Boolean) : [];
  const active = activeId || (list[0] && list[0].id) || '';
  const btns = list.map(t => {
    const on = t.id === active ? ' on' : '';
    const ic = t.icon ? `<span class="ic">${anIcon(t.icon, { size: 14 })}</span>` : '';
    return `<button type="button" class="${on.trim()}" role="tab" aria-selected="${t.id === active}"
        data-tab-group="${_escHtml(groupId)}" data-tab-id="${_escHtml(t.id)}">${ic}${_escHtml(t.label)}</button>`;
  }).join('');
  return `<div class="seg" role="tablist" data-tab-group="${_escHtml(groupId)}">${btns}</div>`;
}

/**
 * Tab panel container matching renderSeg. Non-active panels are `hidden`.
 * @param {{groupId:string, panels:Array<{id:string,content:string}>, activeId?:string}} p
 */
export function renderAnalyticsTabPanels({ groupId = '', panels = [], activeId = '' } = {}) {
  const list = Array.isArray(panels) ? panels.filter(Boolean) : [];
  const active = activeId || (list[0] && list[0].id) || '';
  return `<div class="v2-analytics-tab-panels" data-tab-group="${_escHtml(groupId)}">${list.map(p => {
    const hidden = p.id === active ? '' : ' hidden';
    return `<div class="v2-analytics-tab-panel deep-panel" role="tabpanel" data-tab-group="${_escHtml(groupId)}" data-tab-panel="${_escHtml(p.id)}"${hidden}>${p.content}</div>`;
  }).join('')}</div>`;
}

/**
 * Export Center — the long-term reporting hub (Sprint 7D restore). A calm,
 * informative, future-ready LIST (not a banner / not a button strip): each format
 * is a row with an icon, name + one-line description, and a right-aligned control —
 * an "Unduh" action for available formats, a "Segera hadir" chip for upcoming ones.
 * Secondary by design; it must not compete with the keynote hero.
 * @param {{formats:Array<{id:string,label:string,sub?:string,icon?:string,action?:string,actionLabel?:string,enabled?:boolean,note?:string}>, description?:string}} p
 */
export function renderExportCenter({ formats = [], description = '' } = {}) {
  const list = Array.isArray(formats) ? formats.filter(Boolean) : [];
  const descHtml = description ? `<p class="an-export-desc">${description}</p>` : '';
  const items = list.map(f => {
    const ic = f.icon ? anIcon(f.icon, { size: 17 }) : '';
    const subHtml = f.sub ? `<span class="an-export-sub">${_escHtml(f.sub)}</span>` : '';
    const control = (f.enabled && f.action)
      ? `<button type="button" class="an-export-go" data-action="${_escHtml(f.action)}">${anIcon('download', { size: 14 })}<span>${_escHtml(f.actionLabel || 'Unduh')}</span></button>`
      : `<span class="an-export-chip" aria-disabled="true">${_escHtml(f.note || 'Segera hadir')}</span>`;
    return `<div class="an-export-item${f.enabled ? '' : ' an-export-item--soon'}">
        <span class="an-export-ic" aria-hidden="true">${ic}</span>
        <div class="an-export-info">
          <span class="an-export-name">${_escHtml(f.label)}</span>
          ${subHtml}
        </div>
        ${control}
      </div>`;
  }).join('');
  return `<div class="an-export">${descHtml}<div class="an-export-list">${items}</div></div>`;
}
