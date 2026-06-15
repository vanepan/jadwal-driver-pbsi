/* ============================================================
   COMPLETE-HIGHLIGHTS.JS — merged exec highlights (Complete P1)

   The P1 "Sorotan" list spans all dimensions. This REUSES the three
   per-dimension highlight selectors (driver/vehicle/bidang) and adds
   one fleet-level "Jarak" projection (total km + avg/trip + odometer
   coverage) that the prototype's exec summary shows. No new analytics
   engine — every value comes from the existing AnalyticsModel.

   Order matches the approved prototype (Complete P1):
     Efisiensi (driver) · Utilisasi (vehicle) · Distribusi (driver)
     · Jarak (fleet) · Permintaan (bidang)

   Output: Highlight[] = { category, tone, statement, context }
   ============================================================ */

'use strict';

import { selectDriverHighlights } from './driver-highlights.js';
import { selectVehicleHighlights } from './vehicle-highlights.js';
import { selectBidangHighlights } from './bidang-highlights.js';
import { formatInt } from '../format/numbers.js';

const _byCategory = (arr) => {
  const map = {};
  for (const h of arr) if (!map[h.category]) map[h.category] = h;
  return map;
};

/**
 * @param {import('../../../analytics/analytics-types.js').AnalyticsModel} model
 * @param {Object.<string, number>} [bidangKm]
 * @returns {Array<{category:string, tone:string, statement:string, context:string}>}
 */
export function selectCompleteHighlights(model, bidangKm = {}) {
  const D = _byCategory(selectDriverHighlights(model));
  const V = _byCategory(selectVehicleHighlights(model));
  const B = _byCategory(selectBidangHighlights(model, bidangKm));
  const k = (model && model.kpis) || {};
  const out = [];

  if (D.Efisiensi) out.push(D.Efisiensi);
  if (V.Utilisasi) out.push(V.Utilisasi);
  if (D.Distribusi) out.push(D.Distribusi);

  // Fleet-level Jarak (matches the exec-summary wording).
  if ((k.totalKm || 0) > 0) {
    out.push({
      category: 'Jarak', tone: 'neutral',
      statement: `${formatInt(k.totalKm)} km tercatat selama periode ini, rata-rata ${formatInt(k.avgKmPerTrip || 0)} km per trip.`,
      context: `Data odometer tersedia untuk ${formatInt(k.odoTripCount || 0)} dari ${formatInt(k.total || 0)} penugasan.`,
    });
  }

  if (B.Permintaan) out.push(B.Permintaan);

  return out;
}
