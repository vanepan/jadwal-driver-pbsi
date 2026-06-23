'use strict';

/* ============================================================
   EXECUTIVE-REPORT.JS — Analytics Executive A4 page (v1.15.0)

   A single-page executive summary built from the reusable components:
     Zone A  ReportHeader
     Zone B  HealthScoreHero (centered Operational Health Score)
     Zone C  MetricGrid of executive KPIs (Driver + Petty Cash)
     Zone D  HighlightsSection (cross-domain insights)
     Zone E  ReportFooter (filter / version line)

   The ExecutiveReportModel is produced client-side by
   js/exports/analytics/model/executive-report-model.js.
   ============================================================ */

const { page, rule, reportHeader, esc } = require('../layouts/report-layout');
const { healthScoreHero } = require('../components/health-score-hero');
const { scoreBreakdown } = require('../components/score-breakdown');
const { metricGrid } = require('../components/metric-grid');
const { highlightsSection } = require('../components/highlights-section');
const { reportFooter } = require('../components/report-footer');

/**
 * @param {Object} model ExecutiveReportModel
 * @returns {string} one .a4 page of HTML
 */
/**
 * Confidence / Data Sufficiency badge (v1.16.4.6.1 Phase A/E) — PDF twin of the
 * dashboard badge that sits directly under the Health Score hero. Reads the
 * model's confidence (level + label); renders nothing when absent.
 * @param {{level?:string, label?:string}|null} conf
 */
function confidenceBadge(conf) {
  if (!conf || !conf.label) return '';
  const level = String(conf.level || '').replace(/[^a-z]/gi, '') || 'insufficient';
  return `<div class="exec-conf-wrap"><span class="exec-conf exec-conf-${esc(level)}">${esc(conf.label)}</span></div>`;
}

/**
 * Transparency panel (v1.16.4.6.1 Phase C/E) — "Mengapa Skor Ini Muncul?". Plain
 * facts only (no recommendation / insight / prediction), identical to the
 * dashboard. Always renders (empty-data path shows the explanatory line).
 * @param {{label?:string, hasData?:boolean, facts?:string[], emptyText?:string}} t
 */
function transparencyPanel(t) {
  if (!t) return '';
  const label = t.label || 'Mengapa Skor Ini Muncul?';
  const body = (t.hasData && Array.isArray(t.facts) && t.facts.length)
    ? `<ul class="exec-tp-list">${t.facts.map((f) => `<li>${esc(String(f))}</li>`).join('')}</ul>`
    : `<div class="exec-tp-empty">${esc(t.emptyText || 'Data belum cukup untuk menghasilkan penilaian yang representatif.')}</div>`;
  return `<div class="zc"><div class="sl">${esc(label)}</div>${body}</div>`;
}

function buildExecutiveReport(model = {}) {
  const meta = model.meta || {};
  const kpisZone =
    '<div class="zc">' +
      `<div class="sl">${esc(meta.kpisLabel || 'Indikator Eksekutif')}</div>` +
      metricGrid(model.kpis || []) +
    '</div>';

  // Phase A — Confidence badge, directly under the hero (dashboard parity).
  const confidenceZone = confidenceBadge(model.confidence);

  // Phase D — Executive Narrative: the SAME hero sub-line the dashboard shows,
  // placed directly under the score hero (omitted when there is none).
  const narrativeZone = model.narrative
    ? `<div class="exec-narr">${esc(model.narrative)}</div>`
    : '';

  // Phase C — Explainability: the Petty Cash Health Score V2 breakdown, mirroring
  // the dashboard's position (directly under the hero, above the KPI grid).
  // scoreBreakdown returns '' on No-Data, so its rule only appears with content.
  const explainZone = scoreBreakdown(model.explainability || {});

  // Phase C/E — Transparency panel, after the explainability layer.
  const transparencyZone = transparencyPanel(model.transparency);

  const body =
    reportHeader({
      periodLabel: meta.periodLabel,
      dateLabel: meta.dateLabel,
      title: meta.title || 'Laporan Eksekutif Operasional',
    }) +
    rule() +
    healthScoreHero(model.health || {}) +
    confidenceZone +
    narrativeZone +
    rule() +
    (explainZone ? explainZone + rule() : '') +
    (transparencyZone ? transparencyZone + rule() : '') +
    kpisZone +
    rule() +
    highlightsSection({ label: meta.highlightsLabel || 'Sorotan Eksekutif', items: model.highlights || [] }) +
    rule() +
    reportFooter({ filterLine: meta.filterLine, versionLine: meta.versionLine });

  return page(body);
}

module.exports = { buildExecutiveReport };
