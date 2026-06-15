/* ============================================================
   BIDANG-HIGHLIGHTS.JS — Zone-D highlights for the Bidang report

   PROJECTS the approved Bidang-tab highlights from values the
   Analytics Engine ALREADY computed (render.bidangEnhanced) plus the
   per-bidang distance the app already aggregates (Sprint 7C, passed
   in as `bidangKm`). It does NOT compute analytics or create an
   engine. The existing Insight Engine (analytics-insights.js) is
   reused as a graceful fallback (its 'Bidang Demand' finding) when
   there is no fulfilment/waiting/distance signal to project.

   Mirrors the prototype (Bidang tab) — three categories:
     • Pemenuhan  — bidang fully fulfilled (green)
     • Permintaan — bidang with unmet requests (attention/red)
     • Jarak      — where the recorded distance is attributed

   Output: Highlight[] = { category, tone, statement, context }
   ============================================================ */

'use strict';

import { generateInsights } from '../../../analytics/analytics-insights.js';
import { formatInt } from '../format/numbers.js';

const CATEGORY_ORDER = ['Pemenuhan', 'Permintaan', 'Jarak'];

/** A bidang is fulfilled when every request it raised got an assignment. */
function _isFulfilled(b) {
  return (b.reqCount || 0) > 0 && (b.asgCount || 0) >= (b.reqCount || 0);
}

/**
 * @param {import('../../../analytics/analytics-types.js').AnalyticsModel} model
 * @param {Object.<string, number>} [bidangKm] per-bidang distance (resolved names)
 * @returns {Array<{category:string, tone:string, statement:string, context:string}>}
 */
export function selectBidangHighlights(model, bidangKm = {}) {
  const r = (model && model.render) || {};
  const bidangs = Array.isArray(r.bidangEnhanced) ? r.bidangEnhanced : []; // [{name,reqCount,asgCount,…}] desc reqCount
  const out = [];

  const fulfilled = bidangs.filter(_isFulfilled);
  const waiting = bidangs.filter((b) => (b.reqCount || 0) > 0 && (b.asgCount || 0) < (b.reqCount || 0));

  // ── 1. Pemenuhan ──────────────────────────────────────────────
  if (fulfilled.length > 0) {
    const statement = fulfilled.length === 1
      ? `${fulfilled[0].name} terpenuhi sepenuhnya pada periode ini.`
      : `${fulfilled.length} bidang terpenuhi sepenuhnya pada periode ini.`;
    out.push({
      category: 'Pemenuhan', tone: 'good', statement,
      context: 'Seluruh permintaan mendapat penugasan dan diselesaikan.',
    });
  }

  // ── 2. Permintaan (unmet) ─────────────────────────────────────
  if (waiting.length > 0) {
    const w = waiting[0];
    const unmet = (w.reqCount || 0) - (w.asgCount || 0);
    out.push({
      category: 'Permintaan', tone: 'attention',
      statement: `${w.name} mengajukan ${formatInt(unmet)} permintaan yang belum mendapat penugasan.`,
      context: 'Permintaan ini menunggu penugasan pada periode berikutnya.',
    });
  }

  // ── 3. Jarak — distance attribution ───────────────────────────
  const kmEntries = Object.entries(bidangKm || {})
    .filter(([, km]) => (km || 0) > 0)
    .sort((a, b) => b[1] - a[1]);
  if (kmEntries.length > 0) {
    const totalKm = kmEntries.reduce((s, [, km]) => s + km, 0);
    const [topName, topKm] = kmEntries[0];
    const statement = kmEntries.length === 1
      ? `Seluruh ${formatInt(topKm)} km jarak tercatat berasal dari penugasan ${topName}.`
      : `${topName} menyumbang ${formatInt(topKm)} km — ${Math.round((topKm / totalKm) * 100)}% dari total jarak tercatat bidang.`;
    const noKm = waiting.find((w) => !(bidangKm[w.name] > 0));
    out.push({
      category: 'Jarak', tone: 'neutral', statement,
      context: noKm ? `${noKm.name} belum menghasilkan rekam jarak pada periode ini.` : '',
    });
  }

  // ── Fallback — reuse the engine's bidang finding if nothing projected.
  if (out.length === 0) {
    const ins = generateInsights(model).find((i) => i.source === 'Bidang Demand');
    if (ins) {
      out.push({ category: 'Permintaan', tone: 'neutral', statement: ins.title, context: ins.description || '' });
    }
  }

  return out.sort((a, b) => {
    const ia = CATEGORY_ORDER.indexOf(a.category);
    const ib = CATEGORY_ORDER.indexOf(b.category);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
}
