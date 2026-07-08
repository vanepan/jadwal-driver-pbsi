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

/** Default Formula-V1 weights (Executive Operational Health Score). Retained for
 *  callers that still compose the 3-domain score; superseded by V2 below. */
export const SCORE_WEIGHTS_V1 = Object.freeze({ driverOps: 0.4, vehicleUtil: 0.3, pettyCash: 0.3 });

/** Formula-V2 weights (v1.21.0 — Executive Command Center: Operational Briefing).
 *  Five operational pillars, Driver Operations and Engineering Operations weighted
 *  as equal core pillars (transport + facilities), Fleet/Request/Petty Cash as
 *  supporting domains. `calculateScore` is generic over any weights object — a
 *  future domain (Inventory, Procurement, Engineering Assets, ...) is added here
 *  by adding one weight key + one sub-score helper, never by redesigning the
 *  engine. */
export const SCORE_WEIGHTS_V2 = Object.freeze({
  driverOps: 0.25, engineering: 0.25, vehicleUtil: 0.20, request: 0.15, pettyCash: 0.15,
});

/** Petty Cash Health Score weights (v1.16.2 recomposition, spec-locked). */
export const PC_SCORE_WEIGHTS_V1 = Object.freeze({ compliance: 0.35, budget: 0.30, cash: 0.25, stability: 0.10 });

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
  // Keys are derived from the WEIGHTS object so the same blend engine serves any
  // composition (Executive driverOps/vehicleUtil/pettyCash AND the Petty Cash
  // Health Score compliance/budget/cash/stability). For the default Executive
  // call this yields the original ['driverOps','vehicleUtil','pettyCash'] order,
  // so behaviour is byte-identical. (v1.16.2)
  const keys = Object.keys(weights);
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
 * Engineering Operations sub-score (v1.21.0). Mirrors `driverOpsScore`'s
 * contract: completion stays dominant, overdue backlog is the penalty term.
 * Returns null when there is no operational data (totalAssignments === 0) —
 * No Data ≠ 0. Reuses ONLY fields `buildEngineeringAnalytics` already computes
 * (`completedAssignments`, `totalAssignments`, `overdueAssignments.count`) —
 * no new query/metric/engine.
 * @param {{completedAssignments?:number, totalAssignments?:number, overdueCount?:number}} m
 * @returns {number|null}
 */
export function engineeringOpsScore({ completedAssignments = 0, totalAssignments = 0, overdueCount = 0 } = {}) {
  if (!(Number(totalAssignments) > 0)) return null;
  const completionRate = clamp100((completedAssignments / totalAssignments) * 100);
  const overdueRate = clamp100((overdueCount / totalAssignments) * 100);
  return Math.round(completionRate * 0.75 + (100 - overdueRate) * 0.25);
}

/**
 * Request Domain sub-score (v1.21.0 — FOUNDATION V1). No domain-wide Request
 * analytics model exists anywhere in the codebase yet (only per-request
 * scoring in request-intelligence-service.js), so this is deliberately a
 * single-factor metric — share of requests already resolved (not pending) —
 * rather than a new engine. Returns null when there is no data
 * (totalRequests === 0). Extensible later (e.g. SLA/turnaround) without
 * changing this function's shape.
 * @param {{totalRequests?:number, pendingCount?:number}} m
 * @returns {number|null}
 */
export function requestScore({ totalRequests = 0, pendingCount = 0 } = {}) {
  if (!(Number(totalRequests) > 0)) return null;
  const resolvedRatio = (totalRequests - pendingCount) / totalRequests;
  return clamp100(resolvedRatio * 100);
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

/**
 * Administrative Compliance sub-score (v1.16.0 — FOUNDATION ONLY: not yet wired
 * into the main Health Score, the UI, or any PDF). Blends how much consumed
 * spend is covered by an official, realized NOR (Coverage, dominant) with how
 * many of the period's official NORs have actually been realized (Timeliness,
 * supporting). Both inputs are 0–1 ratios derived UPSTREAM from the existing
 * official-set + realization engines — no new query/metric/engine.
 *
 * Weights (spec C3): 80% Coverage Ratio + 20% Timeliness Ratio. A `null` input
 * is re-normalized out (mirrors calculateScore's No-Data handling); both null ⇒
 * null, because "nothing to measure" ≠ 0.
 *
 * @param {{coverageRatio?:number|null, timelinessRatio?:number|null}} m
 * @returns {number|null} 0–100 | null
 */
export function administrativeComplianceScore({ coverageRatio = null, timelinessRatio = null } = {}) {
  const parts = [
    { v: coverageRatio, w: 0.80 },
    { v: timelinessRatio, w: 0.20 },
  ];
  let weighted = 0;
  let used = 0;
  for (const { v, w } of parts) {
    if (v == null) continue;
    weighted += clamp100((Number(v) || 0) * 100) * w;
    used += w;
  }
  return used > 0 ? Math.round(weighted / used) : null;
}

/**
 * Budget Adherence sub-score (v1.16.1 — OBSERVABILITY ONLY: not yet wired into
 * the Executive Score or the Petty Cash Health Score). Maps a Budget Adherence
 * Ratio (actualBurnYTD / expectedBurnYTD) to a 0–100 score via a symmetric,
 * deterministic step curve centred on 100% pace. Over- AND under-spending are
 * penalised equally — both are budget-control signals.
 *
 * Curve "Option B — Balanced" (v1.16.2, audit-approved): restores ~85% of the
 * nominal weight (range 85 vs the retired floor-40 curve's range 60) while
 * keeping a small dignity floor of 15 so a single sub-metric can never zero the
 * blended score.
 *
 *   |dev| = |ratio − 1| × 100   (percentage points away from on-pace 100%)
 *     dev ≤ 10  (90–110%)      → 100   on pace
 *     dev ≤ 20  (80–120%)      →  88   minor drift
 *     dev ≤ 30  (70–130%)      →  72   notable drift
 *     dev ≤ 50  (50–150%)      →  50   strong drift
 *     dev ≤ 75  (25–175%)      →  28   severe drift
 *     dev > 75  (<25% / >175%) →  15   critical drift
 *
 * Stepped (not continuous) so every score is traceable to a named band — same
 * "explainable" contract as the other sub-scores. Symmetric: over- and
 * under-spending are penalised equally. Returns null when the ratio is null
 * (No-Data ≠ 0 ≠ 100).
 *
 * @param {number|null} ratio  actualBurnYTD / expectedBurnYTD
 * @returns {number|null} 0–100 | null
 */
export function budgetAdherenceScore(ratio) {
  if (ratio == null || !Number.isFinite(Number(ratio))) return null;
  // Round to 9 dp so float error (e.g. 1.10−1 = 0.1000…09 → 10.000…9) cannot push
  // an exact band edge like 110% / 70% / 130% into the next-lower band.
  const dev = Math.round(Math.abs(Number(ratio) - 1) * 100 * 1e9) / 1e9;
  if (dev <= 10) return 100;
  if (dev <= 20) return 88;
  if (dev <= 30) return 72;
  if (dev <= 50) return 50;
  if (dev <= 75) return 28;
  return 15;
}

/**
 * Cash Availability sub-score (v1.16.2). Standalone budget-headroom component of
 * the Petty Cash Health Score — how much of the cycle's opening balance is still
 * available. Linear over the full [0,100] range so it carries its nominal weight.
 *
 * @param {number|null} remainingRatio  max(0, remainingBalance) / openingBalance
 *   null when there is no cycle budget to measure (No-Data ≠ 0).
 * @returns {number|null} 0–100 | null
 */
export function cashAvailabilityScore(remainingRatio) {
  if (remainingRatio == null || !Number.isFinite(Number(remainingRatio))) return null;
  return clamp100(Number(remainingRatio) * 100);
}

/**
 * Spending Stability sub-score v1 (v1.16.2 — early-alarm, 10% weight). A simple,
 * explainable warning count over two ready rules; R2 (monthly spike) is reserved
 * for a future version and would map a 3rd warning to 60.
 *   R1: largest spend category > 60% of period spend       (concentration)
 *   R3: a single transaction > 25% of the annual budget     (outsized outlay)
 *   warnings → 0:100 · 1:90 · 2:75 · (3:60 reserved)
 *
 * Returns null when there is no spend to assess (hasData === false): No-Data ≠ 0.
 *
 * @param {{topCategoryPct?:number|null, maxTransactionAmount?:number|null,
 *          annualBudget?:number, hasData?:boolean}} m
 * @returns {number|null} 0–100 | null
 */
export function spendingStabilityScore({
  topCategoryPct = null, maxTransactionAmount = null, annualBudget = 0, hasData = false,
} = {}) {
  if (!hasData) return null;
  let warnings = 0;
  if (topCategoryPct != null && Number(topCategoryPct) > 60) warnings++;                       // R1
  if (Number(annualBudget) > 0 && maxTransactionAmount != null
      && Number(maxTransactionAmount) > Number(annualBudget) * 0.25) warnings++;               // R3
  const MAP = [100, 90, 75, 60]; // index = warning count (3 reserved for future R2)
  return MAP[Math.min(warnings, MAP.length - 1)];
}
