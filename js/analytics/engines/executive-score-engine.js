/* ============================================================
   EXECUTIVE-SCORE-ENGINE.JS — Operational Health Score
   (v1.15.0 — Analytics Expansion Foundation)

   Combines normalized sub-scores into a single 0–100 Operational Health
   Score and maps it to a qualitative health level. Used by Analytics
   Executive (hero) and future Executive PDF.

   Formula V1 (spec P5):
     40% Driver Operations + 30% Vehicle Utilization + 30% Petty Cash Health

   Each component is a 0–100 sub-score. The score engine only WEIGHTS and
   COMBINES — derivation of each sub-score from raw metrics is done by the
   small, explicit helpers below so they are reusable and testable.

   Pure: no DOM, no Firebase, no side effects.
   ============================================================ */

'use strict';

/** Default Formula-V1 weights. */
export const SCORE_WEIGHTS_V1 = Object.freeze({ driverOps: 0.4, vehicleUtil: 0.3, pettyCash: 0.3 });

function clamp100(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

/**
 * Weighted Operational Health Score.
 * @param {{driverOps?:number, vehicleUtil?:number, pettyCash?:number}} components
 *   each a 0–100 sub-score
 * @param {{driverOps?:number, vehicleUtil?:number, pettyCash?:number}} [weights]
 *   weights need not sum to 1 — the result is normalized by the weights of the
 *   components actually provided, so a missing component degrades gracefully.
 * @returns {{score:number|null, components:Object, weights:Object, usedWeight:number}}
 *   score is null when NO component is available (No Data ≠ 0 ≠ 100). v1.15.8.
 */
export function calculateScore(components = {}, weights = SCORE_WEIGHTS_V1) {
  const keys = ['driverOps', 'vehicleUtil', 'pettyCash'];
  let weighted = 0;
  let usedWeight = 0;
  const norm = {};
  for (const k of keys) {
    if (components[k] == null) continue;
    const c = clamp100(components[k]);
    const w = Number(weights[k]) || 0;
    norm[k] = c;
    weighted += c * w;
    usedWeight += w;
  }
  // v1.15.8: no valid component ⇒ null (was 0). A 0 implied "measured and bad";
  // null means "nothing to measure", which is what the hero must communicate.
  const score = usedWeight > 0 ? Math.round(weighted / usedWeight) : null;
  return { score, components: norm, weights, usedWeight };
}

/**
 * Map a 0–100 score to a qualitative health level.
 * @param {number} score
 * @returns {{level:'excellent'|'good'|'fair'|'attention', label:string,
 *   tone:'green'|'amber'|'crit'}}
 */
export function healthLevel(score) {
  const s = clamp100(score);
  if (s >= 85) return { level: 'excellent', label: 'Sangat Baik', tone: 'green' };
  if (s >= 70) return { level: 'good', label: 'Baik', tone: 'green' };
  if (s >= 55) return { level: 'fair', label: 'Cukup', tone: 'amber' };
  return { level: 'attention', label: 'Perlu Perhatian', tone: 'crit' };
}

/* ── Sub-score derivation helpers (raw metrics → 0–100) ─────────────────── */

/**
 * Operational-volume factor — a saturating 0–100 curve over trip count so that
 * "more operations completed well" scores higher than "a handful completed
 * well", without letting raw volume dominate. log10-based and saturated at
 * ~100 trips: 1→15, 10→52, 50→85, 100→100 (clamped above). v1.15.8.
 * @param {number} trips
 * @returns {number}
 */
export function volumeFactor(trips) {
  const t = Math.max(0, Number(trips) || 0);
  if (t <= 0) return 0;
  return clamp100((Math.log10(t + 1) / Math.log10(101)) * 100);
}

/**
 * Driver Operations sub-score (v1.15.8 recomposition).
 *
 * Completion rate stays DOMINANT (70%) so quality of execution remains the
 * headline, but driver utilization (20%) and operational volume (10%) now
 * contribute so that 1 perfect trip no longer reads identically to 500 perfect
 * trips. Reuses ONLY existing Driver-model metrics (compRate, driverUtilization,
 * total) — no new query/metric/engine.
 *
 * Returns null when there is no operational data at all (totalTrips === 0):
 * No Data ≠ 0. A 0 would drag the blended Health Score down as if performance
 * were bad, when in fact nothing happened in the window.
 *
 * @param {{compRate?:number, driverUtilization?:number, totalTrips?:number}} kpis
 * @returns {number|null}
 */
export function driverOpsScore({ compRate = 0, driverUtilization = 0, totalTrips = 0 } = {}) {
  if (!(Number(totalTrips) > 0)) return null;
  const comp = clamp100(compRate);
  const util = clamp100(driverUtilization);
  const vol = volumeFactor(totalTrips);
  return Math.round(comp * 0.70 + util * 0.20 + vol * 0.10);
}

/**
 * Vehicle Utilization sub-score — share of active vehicles that were used
 * (fleet coverage). Returns null when there is no fleet to measure
 * (activeVehicles === 0) so the component is re-normalized out rather than
 * scored as 0. "Tanpa Kendaraan" trips never reach this metric — they are
 * stored with vehicle === '' upstream, so they inflate neither numerator nor
 * denominator. v1.15.8.
 * @param {{vehiclesWithTrips?:number, activeVehicles?:number}} kpis
 * @returns {number|null}
 */
export function vehicleUtilScore({ vehiclesWithTrips = 0, activeVehicles = 0 } = {}) {
  if (!(Number(activeVehicles) > 0)) return null;
  return clamp100((vehiclesWithTrips / activeVehicles) * 100);
}

/**
 * Petty Cash Health sub-score — blends remaining-balance headroom (how much of
 * the cycle budget is still available) with realization discipline (whether
 * issued NORs get replenished). Both already 0–1 ratios.
 * @param {{remainingRatio?:number, realizationRatio?:number}} m
 *   remainingRatio  = remainingBalance / openingBalance   (budget headroom)
 *   realizationRatio = realizedNors / officialNors         (replenishment flow)
 * @returns {number}
 */
export function pettyCashHealthScore({ remainingRatio = 1, realizationRatio = 1 } = {}) {
  const headroom = clamp100((Number(remainingRatio) || 0) * 100);
  const flow = clamp100((Number(realizationRatio) || 0) * 100);
  // Headroom dominates (overspending is the primary risk), flow is supporting.
  return Math.round(headroom * 0.65 + flow * 0.35);
}
