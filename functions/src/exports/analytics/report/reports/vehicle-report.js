'use strict';

/* ============================================================
   VEHICLE-REPORT.JS — Vehicle Analytics A4 page (prototype #r-armada)

   Reuses the generic single-page composition (zones A–E) — same
   HeroMetric / MetricGrid / DistributionStrip / HighlightsSection /
   ReportFooter as the Driver report. Only the projected data
   differs: the hero is total distance, the distribution is fleet
   utilisation ("Utilisasi Armada"), and the contributors/highlights
   are vehicle-scoped. The VehicleReportModel is produced client-side
   by js/exports/analytics/model/vehicle-report-model.js.
   ============================================================ */

const { buildSingleReport } = require('./single-report');

/**
 * @param {import('../../../../../js/exports/analytics/model/report-types.js').VehicleReportModel} model
 * @returns {string} one .a4 page of HTML
 */
function buildVehicleReport(model = {}) {
  return buildSingleReport(model);
}

module.exports = { buildVehicleReport };
