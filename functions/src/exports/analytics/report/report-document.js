'use strict';

/* ============================================================
   REPORT-DOCUMENT.JS — model → full HTML document (server side)

   Assembles the <html> shell (embedded Inter @font-face + the
   approved report stylesheet) and dispatches templateId → page
   list. This is the single place that turns a report model into
   the HTML string handed to Puppeteer.

   Phase A registers ONE template: 'poc' — a minimal but real
   two-page A4 document whose only job is to prove the pipeline
   and the four rendering guarantees:
     • A4 sizing          (@page A4 + 794×1123 .a4 box)
     • Inter font loading (embedded @font-face, weight 100 hero)
     • printBackground    (filled bar .df / status strip / badge)
     • page breaks        (TWO .a4 pages → 2-page PDF)

   Driver/Vehicle/Bidang/Complete templates arrive in Phase B–E;
   they will register here and reuse layouts/ + components/.
   ============================================================ */

const { REPORT_STYLES } = require('./report-styles');
const { interFontFaceCss, hasInterFonts } = require('../assets/fonts/inter-fonts');
const { page, rule, reportHeader, reportFooter, esc } = require('./layouts/report-layout');
const { buildDriverReport } = require('./reports/driver-report');
const { buildVehicleReport } = require('./reports/vehicle-report');
const { buildBidangReport } = require('./reports/bidang-report');
const { buildCompleteReport } = require('./reports/complete-report');
const { buildPettyCashReport } = require('./reports/petty-cash-report');
const { buildExecutiveReport } = require('./reports/executive-report');

/** Wrap page HTML in the document shell (fonts + stylesheet inlined). */
function htmlShell(bodyHtml) {
  return (
    '<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8">' +
    `<style>${interFontFaceCss()}\n${REPORT_STYLES}</style>` +
    `</head><body>${bodyHtml}</body></html>`
  );
}

/* ── POC template ──────────────────────────────────────────── */

function _pocMeta(model) {
  const m = model || {};
  return {
    org: 'Bidang Sarana dan Prasarana',
    orgSub: 'PBSI — Persatuan Bulu Tangkis Seluruh Indonesia',
    periodLabel: esc(m.periodLabel || 'Pratinjau Fondasi'),
    dateLabel: esc(m.dateLabel || new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })),
    title: 'Analytics Export — A4 Foundation POC',
    filterLine: 'Phase A · Fondasi PDF · bukan laporan final',
    versionLine: esc(m.versionLine || 'POC · Puppeteer'),
  };
}

/* Page 1 — exercises Zone A (header), Zone B (weight-100 hero + KPI row),
   Zone C (filled distribution bars → printBackground), Zone D (highlights
   incl. font-status proof line), Zone E (footer). */
function _pocPage1(meta) {
  const fontProof = hasInterFonts()
    ? 'Inter tertanam (embedded @font-face) — angka 100 ini dirender pada bobot 100.'
    : 'Inter TIDAK tertanam — fallback system-ui (letakkan file Inter di assets/fonts).';

  const body =
    reportHeader(meta) + rule() +
    // Zone B — hero proves weight-100 numerals + tabular figures
    '<div class="zb">' +
      '<div>' +
        '<div class="hs"><span class="hn">100</span><span class="hpu">%</span></div>' +
        '<div class="hl">Pipeline Verification</div>' +
      '</div>' +
      '<div class="kr">' +
        '<div class="kc"><div class="kv">A4</div><div class="kl">Page Size</div></div>' +
        '<div class="kc"><div class="kv">2</div><div class="kl">Halaman</div></div>' +
        '<div class="kc"><div class="kv">1.342 <span class="ku">px</span></div><div class="kl">Tinggi A4</div></div>' +
        '<div class="kc"><div class="kv">5</div><div class="kl">Bobot Inter</div></div>' +
      '</div>' +
    '</div>' + rule() +
    // Zone C — filled bars prove printBackground (background colour must print)
    '<div class="zc">' +
      '<div class="sl">printBackground Proof</div>' +
      '<div class="dr">' +
        '<div class="drow"><div class="dn">Fill 100%</div><div class="dt"><div class="df" style="width:100%"></div></div><div class="dp">100%</div><div class="dk">solid</div></div>' +
        '<div class="drow"><div class="dn">Fill 64%</div><div class="dt"><div class="df" style="width:64%"></div></div><div class="dp">64%</div><div class="dk">track</div></div>' +
      '</div>' +
      '<div class="dnote">Jika bilah hitam tercetak penuh, printBackground aktif.</div>' +
    '</div>' + rule() +
    // Zone D — highlights, incl. the font-embed status line; Zone D absorbs slack
    '<div class="zd">' +
      '<div class="sl">Foundation Checks</div>' +
      '<div class="hl-list">' +
        `<div class="hi"><div class="hcat g">Font</div><div class="hbd"><div class="hst">${esc(fontProof)}</div></div></div>` +
        '<div class="hi"><div class="hcat g">Layout</div><div class="hbd"><div class="hst">Zona D mengisi ruang sisa; footer terkunci di dasar halaman.</div><div class="hct">Perilaku flexbox identik dengan prototipe yang disetujui.</div></div></div>' +
        '<div class="hi"><div class="hcat">Paging</div><div class="hbd"><div class="hst">Halaman berikutnya membuktikan page-break menghasilkan PDF 2 halaman.</div></div></div>' +
      '</div>' +
    '</div>' + rule() +
    reportFooter(meta);

  return page(body);
}

/* Page 2 — proves the page break + a second printBackground surface
   (the green status strip / badge). Deliberately minimal. */
function _pocPage2(meta) {
  const p2 = Object.assign({}, meta, { title: 'Analytics Export — A4 Foundation POC · Halaman 2' });
  const body =
    reportHeader(p2) + rule() +
    '<div class="zb ctr">' +
      '<div class="hsc"><span class="hscn">2</span><span class="hscd"> / 2</span></div>' +
      '<div><div class="hsbadge">Page Break OK</div></div>' +
      '<div class="hslbl">Multi-Page Rendering</div>' +
    '</div>' + rule() +
    '<div class="zc">' +
      '<div class="sl">Status Strip Proof</div>' +
      '<div style="display:flex;flex-direction:column;gap:18px">' +
        '<div class="be"><div class="bdn">Page-break support</div><div class="bdd">.a4 → break-after:page</div>' +
          '<div class="bsw"><div class="bs ok"></div><div class="bsl ok">Terpenuhi</div></div></div>' +
      '</div>' +
    '</div>' + rule() +
    '<div class="zd"></div>' + rule() +
    reportFooter(p2);
  return page(body);
}

function _buildPoc(model) {
  const meta = _pocMeta(model);
  return htmlShell(_pocPage1(meta) + _pocPage2(meta));
}

/* ── Dispatch ──────────────────────────────────────────────── */

const TEMPLATES = {
  poc: _buildPoc,
  'analytics-driver': (model) => htmlShell(buildDriverReport(model)),
  'analytics-vehicle': (model) => htmlShell(buildVehicleReport(model)),
  'analytics-bidang': (model) => htmlShell(buildBidangReport(model)),
  'analytics-complete': (model) => htmlShell(buildCompleteReport(model)),
  'analytics-petty-cash': (model) => htmlShell(buildPettyCashReport(model)),
  'analytics-executive': (model) => htmlShell(buildExecutiveReport(model)),
};

/**
 * Build the full HTML document for a report.
 * @param {string} templateId
 * @param {object} model
 * @returns {string} complete HTML document
 */
function buildReportHtml(templateId, model) {
  const builder = TEMPLATES[templateId];
  if (!builder) {
    throw new Error(`Unknown analytics export templateId: "${templateId}"`);
  }
  return builder(model || {});
}

/** Template ids known to this build (tooling/diagnostics). */
function listReportTemplates() {
  return Object.keys(TEMPLATES);
}

module.exports = { buildReportHtml, listReportTemplates, htmlShell };
