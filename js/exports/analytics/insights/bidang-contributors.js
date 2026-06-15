/* ============================================================
   BIDANG-CONTRIBUTORS.JS — "Kontributor Utama" for the Bidang report

   A deterministic SELECTOR over render.bidangEnhanced (+ the per-bidang
   distance the app already aggregates). No new analytics, no AI
   (IMPLEMENTATION_ARCHITECTURE §6.2). Each active bidang becomes a
   contributor with a model-grounded role — mirroring the approved
   prototype (Bidang tab):

     • fulfilled bidang → "Penugasan terpenuhi, N km tercatat"
     • waiting bidang   → "Permintaan diajukan, menunggu penugasan"

   Output: { contributors: [{ name, role }] }
   ============================================================ */

'use strict';

import { formatInt } from '../format/numbers.js';

/**
 * @param {import('../../../analytics/analytics-types.js').AnalyticsModel} model
 * @param {Object.<string, number>} [bidangKm] per-bidang distance (resolved names)
 * @returns {{ contributors: Array<{name:string, role:string}> }}
 */
export function selectBidangContributors(model, bidangKm = {}) {
  const r = (model && model.render) || {};
  const bidangs = Array.isArray(r.bidangEnhanced) ? r.bidangEnhanced : []; // desc reqCount

  const contributors = bidangs.slice(0, 4).map((b) => {
    const fulfilled = (b.reqCount || 0) > 0 && (b.asgCount || 0) >= (b.reqCount || 0);
    const km = bidangKm[b.name] || 0;
    let role;
    if (fulfilled) {
      role = km > 0 ? `Penugasan terpenuhi, ${formatInt(km)} km tercatat` : 'Penugasan terpenuhi';
    } else {
      role = 'Permintaan diajukan, menunggu penugasan';
    }
    return { name: b.name, role };
  });

  return { contributors };
}
