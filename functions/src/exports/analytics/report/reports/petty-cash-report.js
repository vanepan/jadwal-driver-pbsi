'use strict';

/* ============================================================
   PETTY-CASH-REPORT.JS — Petty Cash Analytics A4 page (v1.15.0)

   Reuses the generic single-page composition (zones A–E), exactly like
   the Driver/Vehicle reports. The PettyCashReportModel is produced
   client-side by js/exports/analytics/model/petty-cash-report-model.js
   and maps onto the same single-report shape, so Zone C renders the
   category distribution and Zone D the insight highlights.
   ============================================================ */

const { buildSingleReport } = require('./single-report');

/**
 * @param {Object} model PettyCashReportModel (single-report shape)
 * @returns {string} one .a4 page of HTML
 */
function buildPettyCashReport(model = {}) {
  return buildSingleReport(model);
}

module.exports = { buildPettyCashReport };
