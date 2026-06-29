/* ============================================================
   EXECUTIVE-UI-KIT.JS — The Executive UI Foundation (v1.18.3)

   THE single public API surface for Sarpras Operations' unified analytics UI.
   Analytics Driver (analytics-shell.js + .v2-analytics-claude) is the design
   authority; this module does NOT invent a second language. It:

     1. RE-EXPORTS the existing canonical primitives under stable `Executive*`
        names, so every future module imports from ONE place.
     2. Adds the two genuinely-new primitives the blueprint identified —
        ExecutiveTable and ExecutiveDrawer (own files).
     3. Adds small de-boxed builders that were duplicated across the foreign
        dashboards (header, toolbar, search, reset, badge, metric, card,
        sparkline, export convenience, state variants).

   PURE PRESENTATION. No business logic, no Firebase, no engine, no scoring.
   Nothing here is consumed by production yet — Sprint 1 only prepares the
   platform. Migration begins in Sprint 2 (Vehicle Management).

   STYLING: platform tokens only. New shapes live in platform.css under the
   `.exec-*` namespace. Components reference the canonical token set (which is
   provided by an ancestor `.v2-analytics-claude` / `.exec-ui` scope) with
   literal fallbacks so they remain robust if rendered standalone.
   ============================================================ */

'use strict';

/* ── 1. Canonical primitives, re-exported under Executive* names ──────────────
   These ARE the authority's functions — one implementation, new stable names.
   Importers should prefer the Executive* aliases; the originals stay valid. */
import {
  anIcon,
  renderEyebrow,
  renderHeroSection,
  renderRingGauge,
  renderAnalyticsKPICard,
  renderKPIGrid,
  renderTrendIndicator,
  renderResponsiveCurrency,
  renderInsightRow,
  renderInsightDividerList,
  renderScoreBreakdown,
  renderAnalyticsChart,
  renderAnalyticsChartLoading,
  renderAnalyticsChartEmpty,
  renderAnalyticsChartError,
  renderExportCenter,
  renderAnalyticsEmptyState,
  renderAnalyticsLoadingState,
  renderAnalyticsErrorState,
  renderSeg,
  renderAnalyticsTabPanels,
} from './analytics-shell.js';

import {
  renderExecutiveTable,
  bindExecutiveTable,
  renderExecutiveStatusPill,
} from './executive-table.js';

import {
  openExecutiveDrawer,
  closeExecutiveDrawer,
  execDrawerSection,
  execDrawerMetrics,
  execDrawerTimeline,
} from './executive-drawer.js';

/** Shared escaper — single source for the kit (dedupes the 6+ copies). */
export function escHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
const esc = escHtml;

/* Canonical re-exports (aliases) */
export {
  anIcon,
  renderHeroSection as ExecutiveHero,
  renderRingGauge as ExecutiveRing,
  renderEyebrow as ExecutiveSection,
  renderAnalyticsKPICard as ExecutiveKPICardBase,
  renderKPIGrid as ExecutiveKPIGrid,
  renderTrendIndicator as ExecutiveTrend,
  renderResponsiveCurrency as ExecutiveCurrency,
  renderInsightRow as ExecutiveInsightCard,
  renderInsightDividerList as ExecutiveInsightList,
  renderScoreBreakdown as ExecutiveScoreBreakdown,
  renderAnalyticsChart as ExecutiveChartContainer,
  renderAnalyticsChartLoading as ExecutiveChartLoading,
  renderAnalyticsChartEmpty as ExecutiveChartEmpty,
  renderAnalyticsChartError as ExecutiveChartError,
  renderExportCenter as ExecutiveExportCenter,
  renderSeg as ExecutiveSeg,
  renderAnalyticsTabPanels as ExecutiveTabPanels,
  // New primitives
  renderExecutiveTable as ExecutiveTable,
  bindExecutiveTable,
  renderExecutiveStatusPill as ExecutiveStatusPill,
  openExecutiveDrawer as ExecutiveDrawerOpen,
  closeExecutiveDrawer as ExecutiveDrawerClose,
  execDrawerSection as ExecutiveDrawerSection,
  execDrawerMetrics as ExecutiveDrawerMetrics,
  execDrawerTimeline as ExecutiveDrawerTimeline,
};

/* ── 2. Small de-boxed builders (dedupe the foreign dashboards) ───────────── */

/**
 * ExecutiveHeader — page-level header (title · subtitle · meta). De-boxed, no
 * chrome band (replaces .daa-top / .dwi-top / .vms__head title bands).
 */
export function ExecutiveHeader({ title = '', subtitle = '', meta = '', icon = '' } = {}) {
  const ic = icon ? `<span class="exec-head__ico" aria-hidden="true">${anIcon(icon, { size: 18 })}</span>` : '';
  return `
    <div class="exec-head">
      <div class="exec-head__l">
        <h1 class="exec-head__title">${ic}${esc(title)}</h1>
        ${subtitle ? `<p class="exec-head__sub">${esc(subtitle)}</p>` : ''}
      </div>
      ${meta ? `<div class="exec-head__meta">${esc(meta)}</div>` : ''}
    </div>`;
}

/**
 * ExecutiveToolbar — a flex row that hosts filter/search/action slots. Pass
 * pre-built HTML for each slot; the right cluster aligns to the end.
 */
export function ExecutiveToolbar({ left = '', right = '' } = {}) {
  return `<div class="exec-toolbar"><div class="exec-toolbar__l">${left}</div><div class="exec-toolbar__r">${right}</div></div>`;
}

/**
 * ExecutiveFilterBar — period segment + arbitrary scope controls.
 * @param {{seg?:string, controls?:string}} p  seg = renderSeg/ExecutiveSeg html
 */
export function ExecutiveFilterBar({ seg = '', controls = '' } = {}) {
  return `<div class="exec-filterbar">${seg}${controls ? `<div class="exec-filterbar__scope">${controls}</div>` : ''}</div>`;
}

/** ExecutiveSearch — tokenized search input (replaces raw .raa-search). */
export function ExecutiveSearch({ value = '', placeholder = 'Cari…', name = '', ariaLabel = '' } = {}) {
  return `<div class="exec-search"><span class="exec-search__ico" aria-hidden="true">${anIcon('search', { size: 14 })}</span>` +
    `<input type="search" class="exec-search__input" value="${esc(value)}" placeholder="${esc(placeholder)}"` +
    `${name ? ` data-exec-search="${esc(name)}"` : ''} aria-label="${esc(ariaLabel || placeholder)}" /></div>`;
}

/** ExecutiveReset — ghost reset button (absent everywhere today). */
export function ExecutiveReset({ label = 'Atur Ulang', action = 'reset' } = {}) {
  return `<button type="button" class="exec-reset" data-exec-action="${esc(action)}">` +
    `<span class="exec-reset__ico" aria-hidden="true">${anIcon('reset', { size: 14 })}</span>${esc(label)}</button>`;
}

/** ExecutiveBadge — tag / kind chip (mono eyebrow chip). */
export function ExecutiveBadge(text, { tone = 'neutral' } = {}) {
  return `<span class="exec-badge exec-badge--${esc(tone)}">${esc(text)}</span>`;
}

/**
 * ExecutiveMetric — de-boxed label/value/caption (replaces inline cycle cards).
 */
export function ExecutiveMetric({ label = '', value = '', caption = '', tone = '' } = {}) {
  return `
    <div class="exec-metric">
      <div class="exec-metric__l">${esc(label)}</div>
      <div class="exec-metric__v"${tone ? ` data-tone="${esc(tone)}"` : ''}>${value == null || value === '' ? '—' : esc(value)}</div>
      ${caption ? `<div class="exec-metric__c">${esc(caption)}</div>` : ''}
    </div>`;
}

/** ExecutiveCard — neutral boxed card for the rare case content needs a shell. */
export function ExecutiveCard({ content = '', pad = true } = {}) {
  return `<div class="exec-card${pad ? '' : ' exec-card--flush'}">${content}</div>`;
}

/**
 * ExecutiveSparkline — ONE sparkline (SVG polyline, currentColor). Replaces the
 * three identical CSS-column sparklines in daa / raa / dwi.
 * @param {number[]} values
 * @param {{width?:number,height?:number,tone?:string}} [opt]
 */
export function ExecutiveSparkline(values = [], { width = 120, height = 36, tone = '' } = {}) {
  const data = (Array.isArray(values) ? values : []).map((v) => Number(v) || 0);
  if (data.length < 2) return `<div class="exec-spark exec-spark--empty" aria-hidden="true"></div>`;
  const max = Math.max(...data), min = Math.min(...data);
  const span = (max - min) || 1;
  const stepX = width / (data.length - 1);
  const pts = data.map((v, i) => {
    const x = (i * stepX).toFixed(1);
    const y = (height - ((v - min) / span) * height).toFixed(1);
    return `${x},${y}`;
  }).join(' ');
  const toneCls = tone ? ` exec-spark--${esc(tone)}` : '';
  return `<svg class="exec-spark${toneCls}" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" ` +
    `preserveAspectRatio="none" fill="none" aria-hidden="true">` +
    `<polyline points="${pts}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

/**
 * ExecutiveKPICard — the ONE KPI grammar. Wraps the canonical card and adds the
 * optional mini-sparkline slot (Deliverable 8). All canonical options pass
 * through unchanged, so existing callers of renderAnalyticsKPICard are unaffected.
 * @param {Object} p  - see renderAnalyticsKPICard, plus:
 * @param {number[]} [p.spark]  - optional mini sparkline series
 * @param {string}   [p.format] - 'number'|'currency'|'percentage' (semantic hint only)
 */
export function ExecutiveKPICard(p = {}) {
  const base = renderAnalyticsKPICard(p);
  if (!Array.isArray(p.spark) || p.spark.length < 2) return base;
  // Inject the sparkline before the card's closing div (purely additive markup).
  const spark = `<div class="exec-kpi-spark">${ExecutiveSparkline(p.spark, { tone: p.sparkTone || '' })}</div>`;
  const idx = base.lastIndexOf('</div>');
  return idx === -1 ? base + spark : base.slice(0, idx) + spark + base.slice(idx);
}

/* ── 3. State family — empty / loading / error / permission / offline ─────────
   empty/loading/error reuse the canonical states; permission + offline are new
   variants built on the SAME shell (SVG only, no emoji). */
export {
  renderAnalyticsEmptyState as ExecutiveEmptyState,
  renderAnalyticsLoadingState as ExecutiveLoadingState,
  renderAnalyticsErrorState as ExecutiveErrorState,
};

export function ExecutivePermissionState({ message = 'Anda tidak memiliki akses ke data ini.', hint = '' } = {}) {
  return `
    <div class="v2-analytics-empty-state exec-state--perm" role="alert">
      <p class="v2-analytics-empty-state-msg"><span class="an-state-ico">${anIcon('lock', { size: 15 })}</span> ${esc(message)}</p>
      ${hint ? `<p class="v2-analytics-empty-state-hint">${esc(hint)}</p>` : ''}
    </div>`;
}

export function ExecutiveOfflineState({ message = 'Tidak ada koneksi. Menampilkan data terakhir.', hint = '' } = {}) {
  return `
    <div class="v2-analytics-empty-state exec-state--offline" role="status">
      <p class="v2-analytics-empty-state-msg"><span class="an-state-ico">${anIcon('offline', { size: 15 })}</span> ${esc(message)}</p>
      ${hint ? `<p class="v2-analytics-empty-state-hint">${esc(hint)}</p>` : ''}
    </div>`;
}

/**
 * ExecutiveExport — convenience over renderExportCenter for the common
 * PDF / Excel / CSV / Print set (Deliverable 6). Pass the actions you support;
 * unknown/omitted formats render as a calm "Segera hadir" chip.
 * @param {{pdf?:string, excel?:string, csv?:string, print?:string, description?:string}} p
 *   each value is the data-action string for that format ('' / undefined = soon)
 */
export function ExecutiveExport({ pdf = '', excel = '', csv = '', print = '', description = '' } = {}) {
  const fmt = (id, label, sub, icon, action) => ({
    id, label, sub, icon, action, actionLabel: `Unduh ${label.split(' ')[0]}`, enabled: !!action,
  });
  const formats = [
    fmt('pdf', 'PDF', 'Ringkasan (A4)', 'file', pdf),
    fmt('excel', 'Excel', 'Data rinci (xlsx)', 'sheet', excel),
    fmt('csv', 'CSV', 'Data mentah (csv)', 'sheet', csv),
    { id: 'print', label: 'Cetak', sub: 'Tampilan cetak', icon: 'printer', action: print, actionLabel: 'Cetak', enabled: !!print },
  ];
  return renderExportCenter({ description, formats });
}

/* ── Kit metadata (handy for diagnostics / version gates) ─────────────────── */
export const EXECUTIVE_UI_KIT_VERSION = '1.18.3';
