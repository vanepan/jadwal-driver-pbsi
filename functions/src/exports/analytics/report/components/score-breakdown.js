'use strict';

/* ============================================================
   SCORE-BREAKDOWN.JS — Executive Explainability section
   (.zc / .sl / .exec-narr-sub / .sbk / .sbk-row / .sbk-head /
    .sbk-lbl / .sbk-wt / .sbk-val / .sbk-track / .sbk-fill)

   The Petty Cash Health Score V2 explainability block — the PDF
   twin of the dashboard's renderScoreBreakdown (analytics-shell).
   Each component renders as a labelled, weighted score with a
   tone-coloured fill bar, so the reader of the blended Executive
   score understands WHY the petty score is what it is.

   Pure string builder. The model (component scores, weights, per-
   row tone, derived narrative) is produced client-side by
   executive-report-model.js straight from exec.pettyHealth — this
   component performs NO scoring and NO formula.
   ============================================================ */

const { esc } = require('../layouts/report-layout');

const TONE_CLASS = { green: 'g', amber: 'a', crit: 'r' };

function _clampPct(n) {
  const v = Number(n || 0);
  if (v < 0) return 0;
  if (v > 100) return 100;
  return v;
}

/**
 * @param {{ label?:string, narrative?:string,
 *           components?:Array<{label:string, weightPct?:number,
 *             score:number|null, tone?:string}> }} explain
 * @returns {string} HTML for the Zone-C explainability block, or '' when there
 *   is no petty health data to show (mirrors the dashboard's anyData gate so the
 *   PDF stays clean rather than printing four em-dashes — F2/F3 No-Data safety).
 */
function scoreBreakdown(explain = {}) {
  const comps = Array.isArray(explain.components) ? explain.components : [];
  const anyData = comps.some((c) => c && c.score != null);
  if (!anyData) return '';

  const label = explain.label || 'Rincian Kesehatan Petty Cash';
  const subHtml = explain.narrative
    ? `<div class="exec-narr-sub">${esc(explain.narrative)}</div>`
    : '';

  const rows = comps.map((c) => {
    const has = c && c.score != null && Number.isFinite(Number(c.score));
    const pct = has ? _clampPct(Number(c.score)) : 0;
    const toneClass = TONE_CLASS[c && c.tone] || 'g';
    const weight = (c && c.weightPct != null)
      ? `<span class="sbk-wt">${esc(String(c.weightPct))}%</span>`
      : '';
    const val = has ? esc(String(pct)) : '—';
    return (
      '<div class="sbk-row">' +
        '<div class="sbk-head">' +
          `<span class="sbk-lbl">${esc((c && c.label) || '')}${weight}</span>` +
          `<span class="sbk-val">${val}</span>` +
        '</div>' +
        `<div class="sbk-track"><span class="sbk-fill ${toneClass}" style="width:${pct}%"></span></div>` +
      '</div>'
    );
  }).join('');

  return (
    '<div class="zc">' +
      `<div class="sl">${esc(label)}</div>` +
      subHtml +
      `<div class="sbk">${rows}</div>` +
    '</div>'
  );
}

module.exports = { scoreBreakdown };
