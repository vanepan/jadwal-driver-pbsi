/* ============================================================
   HEALTH-SCORE.JS — deterministic Operational Health Score

   The Complete report's P1 hero (prototype: 99 / 100 "Sangat Baik",
   "Kesehatan Operasional"). A NEW deterministic derivation — NOT a
   new analytics engine: it is a weighted composite of metrics the
   Analytics Engine ALREADY computed, plus a critical-warning count
   that REUSES analytics-insights.js (priority-1 findings).

   Approved formula (PHASE_E_READINESS §4):
     score = round( 50·completion + 30·(1−idleShare)
                  + 15·(1−cancellationRate) + 5·odoCoverage )
             − 5·criticalWarnings        (clamped to [0,100])
     badge: ≥95 "Sangat Baik" · ≥85 "Baik" · ≥70 "Cukup"
            · else "Perlu Perhatian"

   Validated against the approved prototype: 50·1 + 30·1 + 15·1
   + 5·(20/26) = 98.85 → 99 → "Sangat Baik", 0 critical warnings.

   Pure, deterministic. No DOM, no Firebase.
   ============================================================ */

'use strict';

import { generateInsights } from '../../../analytics/analytics-insights.js';

/**
 * "Peringatan Kritis" — count of priority-1 (CRITICAL) insights.
 * Reuses the existing Insight Engine; no new computation.
 * @param {import('../../../analytics/analytics-types.js').AnalyticsModel} model
 * @returns {number}
 */
export function countCriticalWarnings(model) {
  return generateInsights(model).filter((i) => i.priority === 1).length;
}

function _band(score) {
  if (score >= 95) return { badge: 'Sangat Baik', tone: 'good' };
  if (score >= 85) return { badge: 'Baik', tone: 'good' };
  if (score >= 70) return { badge: 'Cukup', tone: 'neutral' };
  return { badge: 'Perlu Perhatian', tone: 'attention' };
}

/**
 * Derive the Operational Health Score from an AnalyticsModel.
 * @param {import('../../../analytics/analytics-types.js').AnalyticsModel} model
 * @returns {{score:number, outOf:number, badge:string, badgeTone:string, label:string, criticalWarnings:number}}
 */
export function deriveHealthScore(model) {
  const k = (model && model.kpis) || {};
  const r = (model && model.render) || {};

  // Empty-state (Phase F, I-1): no activity in the period → no score.
  // Returning a number here would read as a mediocre grade ("Perlu
  // Perhatian"); instead surface an explicit "no data" sentinel that the
  // hero renders as an em dash with a neutral badge.
  if (!((k.total || 0) > 0)) {
    return {
      score: null,
      outOf: 100,
      badge: 'Belum Ada Data',
      badgeTone: 'neutral',
      label: 'Kesehatan Operasional',
      criticalWarnings: 0,
    };
  }

  const completion = Math.max(0, Math.min(1, (k.compRate || 0) / 100));

  const idleVeh = Array.isArray(r.inactiveVehicles) ? r.inactiveVehicles.length : 0;
  const vWith = k.vehiclesWithTrips
    || (Array.isArray(r.vehiclesWithTrips) ? r.vehiclesWithTrips.length : 0);
  const totalVeh = (Array.isArray(r.activeVehicles) ? r.activeVehicles.length : 0) || (vWith + idleVeh);
  const idleShare = totalVeh > 0 ? idleVeh / totalVeh : 0;

  const cancRate = Math.max(0, Math.min(1, (k.cancellationRate || 0) / 100));
  const odoCoverage = (k.total || 0) > 0 ? (k.odoTripCount || 0) / k.total : 0;

  const critical = countCriticalWarnings(model);

  let score = Math.round(
    50 * completion +
    30 * (1 - idleShare) +
    15 * (1 - cancRate) +
    5 * odoCoverage
  ) - 5 * critical;
  score = Math.max(0, Math.min(100, score));

  const { badge, tone } = _band(score);
  return {
    score, outOf: 100, badge, badgeTone: tone,
    label: 'Kesehatan Operasional',
    criticalWarnings: critical,
  };
}
