'use strict';

/* ============================================================
   COMPLETE-REPORT.JS — Complete Analytics, 5 A4 pages
   (prototype #r-lengkap)

   Composes the five-page Lengkap document by REUSING every existing
   zone/body component. Only two body components are page-specific to
   Complete (HealthScoreHero P1, the two-column body P2); the rest are
   the same components the single reports use.

     P1 Ringkasan Eksekutif   — HealthScoreHero + 6-KPI + 5 highlights + cnote
     P2 Pengemudi & Armada    — TwoColumnSection (compact bars + highlights) + cross-dim
     P3 Permintaan & Operasi  — bidang strips + DestinationsList + highlights
     P4 Kontributor Utama     — ContributorsSection (3 groups)
     P5 Lampiran              — AppendixSection (key/value grid + note)

   Each page reuses reportHeader (Zone A), rule (.zr) and reportFooter
   (Zone E). Returns FIVE .a4 pages concatenated; report-document's
   htmlShell + the @page/.a4 break rules turn them into a 5-page PDF.

   Pure composition only — no data logic. The CompleteReportModel is
   produced client-side by model/complete-report-model.js.
   ============================================================ */

const { page, rule, reportHeader } = require('../layouts/report-layout');
const { twoColumn, columnHeader, crossDimensionNote } = require('../layouts/two-column-layout');
const { healthScoreHero } = require('../components/health-score-hero');
const { metricGrid } = require('../components/metric-grid');
const { distributionRows } = require('../components/distribution-strip');
const { highlightsSection, highlightItems } = require('../components/highlights-section');
const { compactHighlights } = require('../components/compact-highlights');
const { bidangStatusItems } = require('../components/bidang-status-strip');
const { destinationsList } = require('../components/destinations-list');
const { contributorsSection } = require('../components/contributors-section');
const { appendixSection } = require('../components/appendix-section');
const { reportFooter } = require('../components/report-footer');

function _header(meta, title) {
  return reportHeader({
    org: meta.org, orgSub: meta.orgSub,
    periodLabel: meta.periodLabel, dateLabel: meta.dateLabel,
    title,
  });
}

/* ── P1 — Ringkasan Eksekutif ──────────────────────────────── */
function _page1(m) {
  const meta = m.meta || {};
  const body =
    _header(meta, 'Laporan Analitik Lengkap') + rule() +
    healthScoreHero(m.healthScore || {}) + rule() +
    `<div class="zc" style="padding:14px 0">${metricGrid(m.execKpis || [], { borderless: true })}</div>` + rule() +
    highlightsSection({ label: 'Sorotan', items: m.execHighlights || [] }) + rule() +
    reportFooter({ note: m.baselineNote, filterLine: meta.filterLineDefault, versionLine: meta.versionLine });
  return page(body);
}

/* ── P2 — Pengemudi & Armada (two-column) ──────────────────── */
function _column(col) {
  return (
    columnHeader(col.heading, col.summary) +
    distributionRows(col.rows || [], { compact: true }) +
    compactHighlights(col.highlights || [])
  );
}
function _page2(m) {
  const meta = m.meta || {};
  const tc = m.twoColumn || { left: {}, right: {}, crossDimension: {} };
  const inner =
    twoColumn(_column(tc.left || {}), _column(tc.right || {})) +
    crossDimensionNote((tc.crossDimension || {}).label, (tc.crossDimension || {}).text);
  const body =
    _header(meta, 'Laporan Analitik Lengkap — Pengemudi & Armada') + rule() +
    `<div style="flex:1;display:flex;flex-direction:column;padding:16px 0;gap:16px;min-height:0">${inner}</div>` + rule() +
    reportFooter({ filterLine: meta.filterLineDefault, versionLine: meta.versionLine });
  return page(body);
}

/* ── P3 — Permintaan & Operasi ─────────────────────────────── */
function _page3(m) {
  const meta = m.meta || {};
  const bidang = m.bidangStatus || { items: [] };
  const dest = m.destinations || { items: [] };
  const inner =
    `<div><div class="sl">${bidang.label || 'Permintaan per Bidang'}</div>${bidangStatusItems(bidang.items, { gap: 16 })}</div>` +
    '<div class="zr"></div>' +
    `<div>${destinationsList(dest)}</div>` +
    '<div class="zr"></div>' +
    `<div><div class="sl">Sorotan</div><div class="hl-list" style="margin-top:8px">${highlightItems(m.operationsHighlights || [])}</div></div>`;
  const body =
    _header(meta, 'Laporan Analitik Lengkap — Permintaan & Operasi') + rule() +
    `<div style="flex:1;display:flex;flex-direction:column;padding:16px 0;gap:20px">${inner}</div>` + rule() +
    reportFooter({ filterLine: meta.filterLineBidang, versionLine: meta.versionLine });
  return page(body);
}

/* ── P4 — Kontributor Utama ────────────────────────────────── */
function _page4(m) {
  const meta = m.meta || {};
  const body =
    _header(meta, 'Laporan Analitik Lengkap — Kontributor Utama') + rule() +
    `<div style="flex:1;display:flex;flex-direction:column;padding:18px 0">${contributorsSection(m.contributorGroups || [])}</div>` + rule() +
    reportFooter({ filterLine: meta.filterLineDefault, versionLine: meta.versionLine });
  return page(body);
}

/* ── P5 — Lampiran ─────────────────────────────────────────── */
function _page5(m) {
  const meta = m.meta || {};
  const body =
    _header(meta, 'Laporan Analitik Lengkap — Lampiran') + rule() +
    `<div style="flex:1;padding:20px 0">${appendixSection(m.appendix || {})}</div>` + rule() +
    reportFooter({ filterLine: meta.filterLineDefault, versionLine: meta.versionLine });
  return page(body);
}

/**
 * @param {import('../../../../../js/exports/analytics/model/report-types.js').CompleteReportModel} model
 * @returns {string} five .a4 pages of HTML
 */
function buildCompleteReport(model = {}) {
  return _page1(model) + _page2(model) + _page3(model) + _page4(model) + _page5(model);
}

module.exports = { buildCompleteReport };
