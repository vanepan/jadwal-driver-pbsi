/* ============================================================
   WORKLOAD-ENGINE.JS — Driver Workload Intelligence (v1.16.4.8)

   A pure, normalized workload-scoring engine. Given each driver's raw
   operational components for a period — completed assignments, actual
   working hours, distance travelled (+ weekend count and days worked) —
   it produces a fair, explainable 0–100 Workload Score and a ranking.

   WHY a composite index (not a raw sum):
     The three inputs are in incomparable units (count, hours, km) at very
     different magnitudes. Summing them raw lets whichever has the biggest
     numbers (km) dominate and makes "20 trips / 40 h / 300 km" outrank
     "15 trips / 90 h / 1.500 km", which is operationally wrong. So each
     component is first NORMALIZED to a 0–100 index, THEN weighted. This is
     the standard composite-indicator method (OECD Handbook on Constructing
     Composite Indicators, 2008): normalize → weight → aggregate.

   NORMALIZATION — "distance to a reference" (max) method:
     index = value / cohortMax × 100   (0 when cohortMax is 0)
     The reference is the busiest driver in the SAME period, so a score reads
     as "share of the period's hardest-working driver". Chosen over z-scores
     because it is bounded [0,100], never negative, and is directly
     explainable to operations users (no standard-deviation literacy needed).

   WEIGHTS — WORKLOAD_WEIGHTS_V1 (sum = 1.0):
     hours       0.45  Actual working time is the most direct, time-true
                       measure of labour/workload and the metric fleet
                       Hours-of-Service / driver-utilization analytics
                       (FMCSA HOS, Samsara/Geotab telematics) privilege.
     distance    0.30  Operational exposure / intensity (highway vs idle);
                       in logistics & safety analytics, kilometres travelled
                       is the primary EXPOSURE measure — "1 trip ≠ 1 trip".
     assignments 0.25  Dispatch / coordination load: each task carries fixed
                       overhead regardless of length, but task COUNT is the
                       weakest proxy for effort (ignores duration & distance),
                       so it carries the lowest weight.

   SCOPE: workload measurement ONLY. NOT payroll, overtime pay, tariff, or
   HR appraisal. Pure: no DOM, no Firebase, no `window`, no side effects.
   ============================================================ */

'use strict';

/** Component weights for Workload Score V1. Sum === 1.0. See file header for
 *  the per-weight justification. Exported so the UI/PDF can show the formula. */
export const WORKLOAD_WEIGHTS_V1 = Object.freeze({
  hours: 0.45,
  distance: 0.30,
  assignments: 0.25,
});

function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
function clamp100(v) { return Math.max(0, Math.min(100, v)); }

/**
 * @typedef {Object} WorkloadInput
 * @property {string} name              driver display name
 * @property {number} completed         completed assignments in the window
 * @property {number} hours             actual working hours (sum)
 * @property {number} distance          distance travelled in km (sum; 0 ok)
 * @property {number} [weekend]         weekend (Sat/Sun) assignments
 * @property {number} [daysWorked]      distinct days the driver had actual hours
 * @property {number} [officeHoursPerDay] available office hours per worked day
 */

/**
 * @typedef {Object} WorkloadDriver
 * @property {string} name
 * @property {number} completed
 * @property {number} hours
 * @property {number} distance
 * @property {number} weekend
 * @property {number} assignmentIndex   0–100 (completed / maxCompleted)
 * @property {number} hoursIndex        0–100 (hours / maxHours)
 * @property {number} distanceIndex     0–100 (distance / maxDistance)
 * @property {number} score             0–100 Workload Score
 * @property {{hours:number,distance:number,assignments:number}} contribution
 *           each component's share (%) of THIS driver's score (sum ≈ 100,
 *           0/0/0 when the score is 0) — the Explainability Layer.
 * @property {number} utilization       per-driver working-hour utilization %
 *           (hours / (officeHoursPerDay × daysWorked) × 100), null when no
 *           days were worked.
 */

/**
 * Build the normalized workload model for a cohort of drivers.
 *
 * Only drivers with operational work (completed > 0 OR hours > 0) are scored;
 * a driver with no completed work is not part of the cohort (and would score
 * 0 anyway). Distance may be 0 — a "Tanpa Kendaraan" driver still earns hours
 * and assignment contribution (validated explicitly in scripts/workload-check.mjs).
 *
 * @param {WorkloadInput[]} drivers
 * @param {{hours:number,distance:number,assignments:number}} [weights]
 * @returns {{
 *   weights:{hours:number,distance:number,assignments:number},
 *   drivers:WorkloadDriver[],              // sorted by score desc
 *   palingAktif:(WorkloadDriver|null),     // highest Workload Score
 *   bebanTertinggi:(WorkloadDriver|null),  // highest Workload Score (== palingAktif)
 *   bebanTerendah:(WorkloadDriver|null),   // lowest Workload Score (null if <2 drivers)
 *   utilizationRanking:WorkloadDriver[],   // sorted by utilization desc, score tiebreak
 *   averageScore:number                    // mean Workload Score across the cohort
 * }}
 */
export function buildWorkloadModel(drivers, weights = WORKLOAD_WEIGHTS_V1) {
  const W = {
    hours: num(weights.hours),
    distance: num(weights.distance),
    assignments: num(weights.assignments),
  };

  const cohort = (Array.isArray(drivers) ? drivers : [])
    .map((d) => ({
      name: d.name,
      completed: num(d.completed),
      hours: num(d.hours),
      distance: num(d.distance),
      weekend: num(d.weekend),
      daysWorked: num(d.daysWorked),
      officeHoursPerDay: num(d.officeHoursPerDay),
    }))
    .filter((d) => d.completed > 0 || d.hours > 0);

  const maxA = cohort.reduce((m, d) => Math.max(m, d.completed), 0);
  const maxH = cohort.reduce((m, d) => Math.max(m, d.hours), 0);
  const maxD = cohort.reduce((m, d) => Math.max(m, d.distance), 0);

  const scored = cohort.map((d) => {
    const assignmentIndex = maxA > 0 ? (d.completed / maxA) * 100 : 0;
    const hoursIndex      = maxH > 0 ? (d.hours / maxH) * 100 : 0;
    const distanceIndex   = maxD > 0 ? (d.distance / maxD) * 100 : 0;

    // Weighted contributions (pre-round). The raw score is their sum.
    const cH = W.hours * hoursIndex;
    const cD = W.distance * distanceIndex;
    const cA = W.assignments * assignmentIndex;
    const raw = cH + cD + cA;
    const score = Math.round(clamp100(raw));

    // Explainability: each component's share of THIS driver's score.
    const contribution = raw > 0
      ? {
          hours: Math.round((cH / raw) * 100),
          distance: Math.round((cD / raw) * 100),
          assignments: Math.round((cA / raw) * 100),
        }
      : { hours: 0, distance: 0, assignments: 0 };

    const available = d.officeHoursPerDay * d.daysWorked;
    const utilization = available > 0 ? Math.round((d.hours / available) * 100) : null;

    return {
      name: d.name,
      completed: d.completed,
      hours: d.hours,
      distance: d.distance,
      weekend: d.weekend,
      assignmentIndex: Math.round(assignmentIndex),
      hoursIndex: Math.round(hoursIndex),
      distanceIndex: Math.round(distanceIndex),
      score,
      contribution,
      utilization,
    };
  });

  // Deterministic ordering: score desc, then hours desc (more time-true tie
  // break), then name asc.
  scored.sort((a, b) => (b.score - a.score) || (b.hours - a.hours) || String(a.name).localeCompare(String(b.name)));

  const palingAktif    = scored[0] || null;
  const bebanTertinggi = scored[0] || null;
  const bebanTerendah  = scored.length > 1 ? scored[scored.length - 1] : null;

  // Utilization Ranking — primary: per-driver working-hour utilization;
  // tiebreak: Workload Score (so two equally-utilized drivers order by load).
  const utilizationRanking = [...scored].sort(
    (a, b) => (num(b.utilization) - num(a.utilization)) || (b.score - a.score)
  );

  const averageScore = scored.length
    ? Math.round(scored.reduce((s, d) => s + d.score, 0) / scored.length)
    : 0;

  return {
    weights: W,
    drivers: scored,
    palingAktif,
    bebanTertinggi,
    bebanTerendah,
    utilizationRanking,
    averageScore,
  };
}
