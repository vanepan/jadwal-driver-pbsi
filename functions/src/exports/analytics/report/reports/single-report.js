'use strict';

/* ============================================================
   SINGLE-REPORT.JS — generic single-page A4 composer

   The shared composition for every one-page analytics report
   (Driver, Vehicle, Bidang). Each of these maps onto the SAME
   approved zone layout; only the projected data differs. Keeping
   the composition here is the reuse seam: the body components are
   entirely generic, driven by the report model.

     Zone A  ReportHeader        (.za)
     ──────  rule                (.zr)
     Zone B  HeroMetric + MetricGrid  (.zb)
     ──────  rule
     Zone C  DistributionStrip OR BidangStatusStrip   (.zc)
     ──────  rule
     Zone D  HighlightsSection   (.zd)  — grows
     ──────  rule
     Zone E  ReportFooter        (.ze)

   Zone C is pluggable: a model carrying `bidangStatus` renders the
   fulfilled/waiting strips (Bidang); otherwise `distribution`
   renders the proportional bars (Driver/Vehicle). Pure composition
   only — no data logic. Returns ONE .a4 page.
   ============================================================ */

const { page, rule, reportHeader } = require('../layouts/report-layout');
const { heroMetric } = require('../components/hero-metric');
const { metricGrid } = require('../components/metric-grid');
const { distributionStrip } = require('../components/distribution-strip');
const { bidangStatusStrip } = require('../components/bidang-status-strip');
const { highlightsSection } = require('../components/highlights-section');
const { reportFooter } = require('../components/report-footer');

/**
 * Compose one A4 page from a single-report model
 * (DriverReportModel / VehicleReportModel — same shape).
 * @param {Object} model
 * @returns {string} one .a4 page of HTML
 */
function buildSingleReport(model = {}) {
  const meta = model.meta || {};

  // Zone C — bidang status strips when present, else proportional bars.
  const zoneC = model.bidangStatus
    ? bidangStatusStrip(model.bidangStatus)
    : distributionStrip(model.distribution || { rows: [] });

  const body =
    reportHeader({
      org: meta.org,
      orgSub: meta.orgSub,
      periodLabel: meta.periodLabel,
      dateLabel: meta.dateLabel,
      title: meta.title,
    }) +
    rule() +
    // Zone B — hero + KPI row share one .zb (as in the prototype).
    '<div class="zb">' +
      heroMetric(model.hero || {}) +
      metricGrid(model.kpis || []) +
    '</div>' +
    rule() +
    zoneC +
    rule() +
    highlightsSection({ label: 'Sorotan', items: model.highlights || [] }) +
    rule() +
    reportFooter({
      contributorsLabel: meta.contributorsLabel,
      contributors: model.contributors || [],
      filterLine: meta.filterLine,
      versionLine: meta.versionLine,
    });

  return page(body);
}

module.exports = { buildSingleReport };
