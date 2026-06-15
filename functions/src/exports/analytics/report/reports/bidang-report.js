'use strict';

/* ============================================================
   BIDANG-REPORT.JS — Bidang Analytics A4 page (prototype #r-bidang)

   Reuses the generic single-page composition (zones A–E) — same
   HeroMetric / MetricGrid / HighlightsSection / ReportFooter as the
   Driver and Vehicle reports. The only difference is Zone C: the
   BidangReportModel carries `bidangStatus`, so single-report.js
   renders the fulfilled/waiting BidangStatusStrip instead of the
   proportional DistributionStrip. The BidangReportModel is produced
   client-side by js/exports/analytics/model/bidang-report-model.js.
   ============================================================ */

const { buildSingleReport } = require('./single-report');

/**
 * @param {import('../../../../../js/exports/analytics/model/report-types.js').BidangReportModel} model
 * @returns {string} one .a4 page of HTML
 */
function buildBidangReport(model = {}) {
  return buildSingleReport(model);
}

module.exports = { buildBidangReport };
