'use strict';

/* ============================================================
   DRIVER-REPORT.JS — Driver Analytics A4 page (prototype #r-pengemudi)

   The Driver report uses the generic single-page composition
   (zones A–E). It is a thin alias over buildSingleReport so the
   composition stays single-sourced and shared with Vehicle/Bidang.
   The DriverReportModel is produced client-side by
   js/exports/analytics/model/driver-report-model.js.
   ============================================================ */

const { buildSingleReport } = require('./single-report');

/**
 * @param {import('../../../../../js/exports/analytics/model/report-types.js').DriverReportModel} model
 * @returns {string} one .a4 page of HTML
 */
function buildDriverReport(model = {}) {
  return buildSingleReport(model);
}

module.exports = { buildDriverReport };
