/* ============================================================
   HEALTH-SCORE.JS — Complete Driver PDF Operational Health Score

   The Complete report's P1 hero ("Kesehatan Operasional"). As of v1.16.0 this
   no longer derives its OWN score: it reads the Driver Health Score from the
   single source of truth — the Executive Score Engine (driverOpsScore) — so the
   PDF hero and the Analytics Executive hero can NEVER disagree for the same data.

   Official Driver Health Score (v1.16.0, spec A2):
     70% Completion Rate + 20% Driver Utilization + 10% Volume Factor
     (computed by executive-score-engine.driverOpsScore)

   Banding/labels also come from the engine (healthLevel), mapped to the PDF's
   existing badge-tone vocabulary so the hero layout/markup is UNCHANGED — only
   the score SOURCE is consolidated (spec A4). The legacy 50/30/15/5 composite
   and its 95/85/70 bands are retired.

   "Peringatan Kritis" (critical-warning count) is still surfaced as a separate
   KPI in the report, so it is retained here — it no longer affects the score.

   Pure, deterministic. No DOM, no Firebase.
   ============================================================ */

'use strict';

import { generateInsights } from '../../../analytics/analytics-insights.js';
import { driverOpsScore, healthLevel } from '../../../analytics/engines/executive-score-engine.js';

/** Engine tone (green/amber/crit) → the PDF hero's existing tone vocabulary. */
const TONE_MAP = { green: 'good', amber: 'neutral', crit: 'attention' };

/**
 * "Peringatan Kritis" — count of priority-1 (CRITICAL) insights.
 * Reuses the existing Insight Engine; no new computation.
 * @param {import('../../../analytics/analytics-types.js').AnalyticsModel} model
 * @returns {number}
 */
export function countCriticalWarnings(model) {
  return generateInsights(model).filter((i) => i.priority === 1).length;
}

/**
 * Derive the Operational Health Score for the Complete Driver PDF from an
 * AnalyticsModel — delegating the score math to the Executive Score Engine.
 * @param {import('../../../analytics/analytics-types.js').AnalyticsModel} model
 * @returns {{score:number|null, outOf:number, badge:string, badgeTone:string, label:string, criticalWarnings:number}}
 */
export function deriveHealthScore(model) {
  const k = (model && model.kpis) || {};

  // Driver Utilization (share of active drivers who drove) — derived from the
  // SAME model KPIs the Executive path uses, so both surfaces feed driverOpsScore
  // identical inputs. activeDrivers / driversWithTrips are counts on the model.
  const activeDrivers = Number(k.activeDrivers) || 0;
  const driversWithTrips = Number(k.driversWithTrips) || 0;
  const driverUtilization = activeDrivers > 0 ? (driversWithTrips / activeDrivers) * 100 : 0;

  // SINGLE SOURCE OF TRUTH (v1.16.0): Driver Health Score from the engine.
  const score = driverOpsScore({
    compRate: k.compRate,
    driverUtilization,
    totalTrips: k.total,
  });

  const critical = countCriticalWarnings(model);

  // No activity in the period (driverOpsScore === null) → explicit "no data"
  // sentinel: the hero renders an em dash with a neutral badge rather than a
  // misleading low grade.
  if (score == null) {
    return {
      score: null,
      outOf: 100,
      badge: 'Belum Ada Data',
      badgeTone: 'neutral',
      label: 'Kesehatan Operasional',
      criticalWarnings: critical,
    };
  }

  const lv = healthLevel(score);
  return {
    score,
    outOf: 100,
    badge: lv.label,
    badgeTone: TONE_MAP[lv.tone] || 'neutral',
    label: 'Kesehatan Operasional',
    criticalWarnings: critical,
  };
}
