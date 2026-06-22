/* ============================================================
   EXECUTIVE-ANALYTICS.JS — Combined model for Analytics Executive
   (v1.15.0 — Analytics Expansion Foundation)

   Fuses the Driver AnalyticsModel and the Petty Cash analytics model into
   one executive view, then derives the Operational Health Score via the
   reusable Executive Score Engine. Pure: takes already-computed models,
   performs no data access. (Formerly "Analytics Gabungan".)
   ============================================================ */

'use strict';

import {
  calculateScore, healthLevel, driverOpsScore, vehicleUtilScore, pettyCashHealthScore, SCORE_WEIGHTS_V1,
} from './engines/executive-score-engine.js';
import { generateInsights, generateNarrative } from './engines/insight-engine.js';

function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
function clampPct(v) { return Math.max(0, Math.min(100, Math.round(num(v)))); }

/**
 * Compose the executive model.
 * @param {Object} ctx
 * @param {Object} ctx.driverModel - AnalyticsModel from analytics-engine.js (may be null)
 * @param {Object} ctx.pettyModel  - model from petty-cash-analytics.js (may be null)
 * @returns {Object} ExecutiveAnalyticsModel
 */
export function computeExecutiveAnalytics({ driverModel, pettyModel } = {}) {
  const dk = (driverModel && driverModel.kpis) || {};
  const pc = pettyModel || {};
  const pcCycle = pc.cycle || {};
  const pcHero = pc.hero || {};

  // ── Driver KPIs ─────────────────────────────────────────────────────────
  const totalTrip = num(dk.total);
  // v1.15.6: trip split (PBSI armada vs requester/"Tanpa Kendaraan"). Falls back
  // so older driver models (without the split) still yield armada === total.
  const tripsWithoutVehicle = num(dk.tripsWithoutVehicle);
  const tripsWithVehicle = (dk.tripsWithVehicle != null) ? num(dk.tripsWithVehicle) : (totalTrip - tripsWithoutVehicle);
  const activeDrivers = num(dk.activeDrivers);
  const driversWithTrips = num(dk.driversWithTrips);
  const activeVehicles = num(dk.activeVehicles);
  const vehiclesWithTrips = num(dk.vehiclesWithTrips);
  const driverUtilization = activeDrivers > 0 ? clampPct((driversWithTrips / activeDrivers) * 100) : 0;

  // ── Petty Cash KPIs ───────────────────────────────────────────────────────
  const activeBalance = num(pcCycle.remaining);
  const norOfficial = num(pcHero.norOfficial);
  const realizedCount = num(pcHero.realizedCount);
  const realizationPct = num(pcCycle.realizationPct);
  // Dana Terpakai — single reusable consumption figure from the petty model.
  const consumedSpend = num((pc.consumed || {}).totalConsumedSpend);

  // ── Operational Health Score (Formula V1) ───────────────────────────────
  // v1.15.8 Phase A — Petty Cash No-Data ≠ Perfect. Previously opening<=0 made
  // remainingRatio default to 1 (100% headroom) and norOfficial===0 made
  // realizationRatio default to 1 (100% flow), so an empty domain scored 100.
  // We now detect the No-Data signature and feed `null`, letting the existing
  // weight re-normalization in calculateScore drop the component cleanly.
  const opening = num(pcCycle.opening);
  const pcTxCount = num((pc.diagnostics || {}).curCount); // official transactions in window
  const pettyNoData = opening <= 0 && norOfficial === 0 && pcTxCount === 0;
  const remainingRatio = opening > 0 ? Math.max(0, activeBalance) / opening : 1;
  const realizationRatio = norOfficial > 0 ? realizedCount / norOfficial : 1;
  const components = {
    driverOps: driverOpsScore({ compRate: dk.compRate, driverUtilization, totalTrips: totalTrip }),
    vehicleUtil: vehicleUtilScore({ vehiclesWithTrips, activeVehicles }),
    pettyCash: pettyNoData ? null : pettyCashHealthScore({ remainingRatio, realizationRatio }),
  };
  const scored = calculateScore(components, SCORE_WEIGHTS_V1);
  // v1.15.8 — null score (no domain available) maps to an explicit No-Data
  // health state rather than the misleading "Perlu Perhatian" that healthLevel
  // would return for a coerced 0.
  const level = scored.score == null
    ? { level: 'nodata', label: 'Belum Ada Data', tone: 'amber' }
    : healthLevel(scored.score);

  // ── Executive insights (cross-domain) — reuse the insight engine over a
  //    combined context, then fold in the petty-cash narrative findings. ────
  const execCtx = {
    realizationPct,
    openingBalance: num(pcCycle.opening),
    remainingBalance: activeBalance,
    officialNorCount: norOfficial,
    avgRealizationDays: pcHero.avgRealizationDays,
    realizationTrend: pcHero.realizationTrend,
    topUnit: (pc.ranking && pc.ranking.topUnit) ? { label: pc.ranking.topUnit.label, pct: pc.ranking.topUnit.pct, value: pc.ranking.topUnit.value } : null,
    topCategory: (pc.ranking && pc.ranking.topCategory) ? { label: pc.ranking.topCategory.label, pct: pc.ranking.topCategory.pct } : null,
    topBidang: (pc.ranking && pc.ranking.topBidang) ? { label: pc.ranking.topBidang.label, pct: pc.ranking.topBidang.pct } : null,
    unitCount: (pc.breakdown && pc.breakdown.unit && pc.breakdown.unit.rows.length) || 0,
    forecast: (pc.trend && pc.trend.annualized) ? { projected: pc.trend.annualized.projected } : null,
    spendTrend: (pc.trend && pc.trend.spendTrend) || null,
    totalSpend: num(pcCycle.spent),
  };
  const insights = generateInsights(execCtx);
  const narrative = generateNarrative(execCtx);

  return {
    schemaVersion: 1,
    domain: 'executive',
    metadata: { generatedAt: new Date().toISOString() },
    driverKpis: { totalTrip, tripsWithVehicle, tripsWithoutVehicle, driverUtilization, activeVehicles, vehiclesWithTrips, activeDrivers, compRate: clampPct(dk.compRate) },
    pettyKpis: { activeBalance, norOfficial, realizationPct, consumedSpend, opening: num(pcCycle.opening) },
    score: { value: scored.score, components: scored.components, weights: scored.weights, level: level.level, label: level.label, tone: level.tone },
    // v1.15.8 Phase D — Executive Score explainability (MODEL ONLY, no UI). The
    // per-domain sub-scores behind `value`, with explicit null where a domain
    // had no data. Consumed by future export / PDF Composer / Recommendation
    // Engine without changing the current hero. `usedWeight` lets a consumer see
    // how much of the formula's weight actually contributed.
    scoreBreakdown: {
      driverScore: components.driverOps,     // 0–100 | null
      fleetScore: components.vehicleUtil,    // 0–100 | null
      pettyCashScore: components.pettyCash,  // 0–100 | null
      weights: scored.weights,
      usedWeight: scored.usedWeight,
    },
    insights,
    narrative,
  };
}
