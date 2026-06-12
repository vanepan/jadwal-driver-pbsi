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
 * @param {string} [p.icon]         - emoji/glyph (presentation only)
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
        <p class="v2-analytics-empty-state-msg">⚠️ ${message}</p>
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
   its inputs internally (they are engine-generated sentences). Future-ready for
   recommendation cards (same shape + an action slot later). */

/**
 * @param {Object} p
 * @param {'info'|'success'|'warning'} [p.type]
 * @param {string} p.title
 * @param {string} [p.description]
 * @param {string} [p.source]   - the metric this insight is derived from
 */
export function renderInsightCard({ type = 'info', title = '', description = '', source = '' } = {}) {
  const t = (type === 'success' || type === 'warning') ? type : 'info';
  const icon = t === 'warning' ? '⚠️' : t === 'success' ? '✅' : 'ℹ️';
  return `
      <div class="v2-analytics-insight-card v2-analytics-insight-card--${t}">
        <span class="v2-analytics-insight-icon" aria-hidden="true">${icon}</span>
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
  const icon = type === 'warning' ? '⚠️' : type === 'optimization' ? '💡' : '➡️';
  return `
      <div class="v2-analytics-insight-card v2-analytics-insight-card--${accent} v2-analytics-insight-card--rec" data-rec-type="${_escHtml(type)}">
        <span class="v2-analytics-insight-icon" aria-hidden="true">${icon}</span>
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
