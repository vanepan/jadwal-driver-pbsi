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
const { metricGrid } = require('../components/metric-grid');
const { highlightsSection } = require('../components/highlights-section');
const { reportFooter } = require('../components/report-footer');

/**
 * @param {Object} model ExecutiveReportModel
 * @returns {string} one .a4 page of HTML
 */
function buildExecutiveReport(model = {}) {
  const meta = model.meta || {};
  const kpisZone =
    '<div class="zc">' +
      `<div class="sl">${esc(meta.kpisLabel || 'Indikator Eksekutif')}</div>` +
      metricGrid(model.kpis || []) +
    '</div>';

  const body =
    reportHeader({
      periodLabel: meta.periodLabel,
      dateLabel: meta.dateLabel,
      title: meta.title || 'Laporan Eksekutif Operasional',
    }) +
    rule() +
    healthScoreHero(model.health || {}) +
    rule() +
    kpisZone +
    rule() +
    highlightsSection({ label: meta.highlightsLabel || 'Sorotan Eksekutif', items: model.highlights || [] }) +
    rule() +
    reportFooter({ filterLine: meta.filterLine, versionLine: meta.versionLine });

  return page(body);
}

module.exports = { buildExecutiveReport };
