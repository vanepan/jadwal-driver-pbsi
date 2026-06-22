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
  const remainingRatio = pcCycle.opening > 0 ? Math.max(0, activeBalance) / pcCycle.opening : 1;
  const realizationRatio = norOfficial > 0 ? realizedCount / norOfficial : 1;
  const components = {
    driverOps: driverOpsScore({ compRate: dk.compRate }),
    vehicleUtil: vehicleUtilScore({ vehiclesWithTrips, activeVehicles }),
    pettyCash: pettyCashHealthScore({ remainingRatio, realizationRatio }),
  };
  const scored = calculateScore(components, SCORE_WEIGHTS_V1);
  const level = healthLevel(scored.score);

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
    insights,
    narrative,
  };
}
