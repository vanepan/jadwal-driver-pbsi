'use strict';

/* ============================================================
   REPORT-LAYOUT.JS — A4 page wrapper + shared chrome (Zone A/E)

   The foundational layout primitives shared by every analytics
   report page. These map 1:1 to the approved prototype:

     page(inner)        → .a4 > .pi   (one A4 page, zone stack)
     rule()             → .zr         (hairline zone divider)
     reportHeader(meta) → Zone A (.za)
     reportFooter(meta) → Zone E (.ze / .fb)

   Pure string builders — no DOM, no Node APIs, no data logic.
   Phase B+ adds the body components (HeroMetric, MetricGrid,
   DistributionStrip, …); this file owns only the page shell.
   All text is HTML-escaped via esc().
   ============================================================ */

const { sarprasLogoDataUrl } = require('../../assets/logos/sarpras-logo');

/** Escape text for safe interpolation into HTML. */
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** One A4 page: the .a4 frame + .pi inner padding box (the zone stack). */
function page(innerHtml) {
  return `<div class="a4"><div class="pi">${innerHtml || ''}</div></div>`;
}

/** Hairline zone divider (.zr). */
function rule() {
  return '<div class="zr"></div>';
}

/**
 * Zone A — standard 3-column branded report header.
 *
 *   LEFT   PBSI monogram + institutional identity
 *   CENTER Sarpras Operations logo + wordmark
 *   RIGHT  report period + generate date
 *
 * The left (PBSI) and center (Sarpras Operations) branding is FIXED —
 * it is the platform institutional identity, shared verbatim by every
 * report — while period/date/title stay data-driven from the model.
 * The institutional lines are intentionally NOT taken from meta.org/
 * orgSub (the client model sends the department name there, e.g.
 * "Bidang Sarana dan Prasarana", which now lives in the centre wordmark
 * as "Sarpras Operations"). The centre logo is embedded as a data: URI;
 * when the asset is absent the wordmark renders text-only.
 *
 * @param {{appName?:string, periodLabel?:string,
 *          dateLabel?:string, title?:string}} meta
 */
function reportHeader(meta = {}) {
  const orgName    = 'PBSI';
  const orgSub     = 'Persatuan Bulutangkis Seluruh Indonesia';
  const appName    = esc(meta.appName || 'Sarpras Operations');
  const periodLabel = esc(meta.periodLabel || '');
  const dateLabel  = esc(meta.dateLabel || '');
  const title      = esc(meta.title || '');

  // CENTER — logo only (v1.12.2 final polish: the "Sarpras Operations"
  // wordmark under the logo was removed to keep the header calm). When the
  // mark is unavailable, fall back to a bold "SARPRAS OPERATIONS" text
  // wordmark so the centre is never blank/broken.
  const logo = sarprasLogoDataUrl();
  const centerInner = logo
    ? `<img class="hlogo" src="${logo}" alt="${appName}" />`
    : `<div class="hcl hcl-fallback">${esc((meta.appName || 'Sarpras Operations')).toUpperCase()}</div>`;

  return (
    '<div class="za">' +
      '<div class="htop">' +
        // LEFT — PBSI
        '<div class="hid">' +
          '<div class="pm">PBSI</div>' +
          `<div class="hot"><div class="on1">${orgName}</div><div class="on2">${orgSub}</div></div>` +
        '</div>' +
        // CENTER — Sarpras Operations
        '<div class="hctr">' +
          centerInner +
        '</div>' +
        // RIGHT — period + date
        `<div class="hrt"><div class="hpe">${periodLabel}</div><div class="hda">${dateLabel}</div></div>` +
      '</div>' +
      `<div class="htt">${title}</div>` +
    '</div>'
  );
}

/**
 * Zone E — standard footer bar (filter line · version/author/date).
 * `lead` is optional content rendered above the rule (contributor line,
 * baseline note, …); Phase A passes none.
 * @param {{filterLine?:string, versionLine?:string}} meta
 * @param {string} [lead]
 */
function reportFooter(meta = {}, lead = '') {
  const filterLine  = esc(meta.filterLine || '');
  const versionLine = esc(meta.versionLine || '');
  return (
    '<div class="ze">' +
      (lead || '<div></div>') +
      '<div class="fb">' +
        `<div class="fm">${filterLine}</div>` +
        `<div class="fm">${versionLine}</div>` +
      '</div>' +
    '</div>'
  );
}

module.exports = { esc, page, rule, reportHeader, reportFooter };
