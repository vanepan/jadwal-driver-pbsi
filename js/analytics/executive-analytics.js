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
  calculateScore, healthLevel, driverOpsScore, vehicleUtilScore, SCORE_WEIGHTS_V1,
} from './engines/executive-score-engine.js';
import { generateInsights, generateNarrative } from './engines/insight-engine.js';

function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
function clampPct(v) { return Math.max(0, Math.min(100, Math.round(num(v)))); }

/* ── Petty Cash explainability (v1.16.3) ──────────────────────────────────── */

/** Display metadata for the four Petty Cash Health Score V2 components, in
 *  formula-weight order. Labels are Executive-facing (Indonesian). */
const PETTY_COMPONENT_META = [
  { key: 'compliance', label: 'Kepatuhan Administrasi', weightPct: 35 },
  { key: 'budget',     label: 'Kepatuhan Anggaran',     weightPct: 30 },
  { key: 'cash',       label: 'Ketersediaan Kas',       weightPct: 25 },
  { key: 'stability',  label: 'Stabilitas Pengeluaran', weightPct: 10 },
];

/**
 * Executive Narrative (v1.16.3) — one explainable sentence derived STRICTLY from
 * the actual Petty Cash V2 scoreBreakdown (no engine, no hardcoded verdict).
 * Names the strongest and weakest contributing components so a reader of the
 * blended score understands what carried it and what held it back.
 * @param {Array<{label:string, score:number|null}>} components
 * @param {string} levelLabel  qualitative band of the petty score (or No-Data label)
 * @param {boolean} hasScore   false ⇒ petty score is null (insufficient data)
 * @returns {string}
 */
function pettyNarrative(components, levelLabel, hasScore) {
  if (!hasScore) return 'Belum cukup data untuk menilai kesehatan petty cash periode ini.';
  const scored = components.filter((c) => c.score != null);
  if (!scored.length) return 'Belum cukup data untuk menilai kesehatan petty cash periode ini.';
  const sorted = [...scored].sort((a, b) => b.score - a.score);
  const strongest = sorted[0];
  const weakest = sorted[sorted.length - 1];
  const lvl = String(levelLabel || '').toLowerCase();
  // When every component is strong (no meaningful weak link), keep it positive
  // and single-clause; otherwise contrast the lead driver against the laggard.
  if (weakest.score >= 80 || strongest.label === weakest.label) {
    return `Kesehatan petty cash ${lvl} — ditopang ${strongest.label.toLowerCase()} (${strongest.score}).`;
  }
  return `Kesehatan petty cash ${lvl} — ditopang ${strongest.label.toLowerCase()} (${strongest.score}) namun perlu perhatian pada ${weakest.label.toLowerCase()} (${weakest.score}).`;
}

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
  const realizationPct = num(pcCycle.realizationPct);
  // Dana Terpakai — single reusable consumption figure from the petty model.
  const consumedSpend = num((pc.consumed || {}).totalConsumedSpend);

  // ── Operational Health Score (Formula V1) ───────────────────────────────
  // v1.16.3 — Petty Cash Health Score V2 cutover. The petty model already
  // composes the validated V2 score (35% Compliance / 30% Budget / 25% Cash /
  // 10% Stability), gated to ≥3 active components and null on No-Data. We read
  // that single source of truth directly instead of recomputing the retired
  // legacy headroom/flow blend. When `pc.healthScore` is null, feeding null lets
  // the existing calculateScore re-normalization drop the petty component cleanly
  // so the Executive score stays stable (B3).
  const pettyCashV2 = pc.healthScore == null ? null : clampPct(pc.healthScore);
  const components = {
    driverOps: driverOpsScore({ compRate: dk.compRate, driverUtilization, totalTrips: totalTrip }),
    vehicleUtil: vehicleUtilScore({ vehiclesWithTrips, activeVehicles }),
    pettyCash: pettyCashV2,
  };
  const scored = calculateScore(components, SCORE_WEIGHTS_V1);
  // v1.15.8 — null score (no domain available) maps to an explicit No-Data
  // health state rather than the misleading "Perlu Perhatian" that healthLevel
  // would return for a coerced 0.
  const level = scored.score == null
    ? { level: 'nodata', label: 'Belum Ada Data', tone: 'amber' }
    : healthLevel(scored.score);

  // ── Petty Cash explainability (v1.16.3) — projects the V2 scoreBreakdown the
  //    petty model already computed into a UI-ready shape (component scores +
  //    weights + a derived narrative). NO recomputation: every score is read
  //    straight from `pc.scoreBreakdown`. ───────────────────────────────────
  const sb = pc.scoreBreakdown || {};
  const pettyHasScore = pc.healthScore != null;
  const pettyComponents = PETTY_COMPONENT_META.map((m) => ({
    key: m.key,
    label: m.label,
    weightPct: m.weightPct,
    score: sb[m.key] == null ? null : clampPct(sb[m.key]),
  }));
  const pettyLevelLabel = pettyHasScore ? healthLevel(pc.healthScore).label : 'Belum Ada Data';
  const pettyHealth = {
    score: pettyHasScore ? clampPct(pc.healthScore) : null,
    levelLabel: pettyLevelLabel,
    components: pettyComponents,
    narrative: pettyNarrative(pettyComponents, pettyLevelLabel, pettyHasScore),
  };

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
    // v1.16.0 Phase D — reuse the petty model's configurable annual budget so the
    // existing (formerly dormant) `forecast-pace` insight can fire here too. No
    // new insight is introduced; the rule already lives in insight-engine.js.
    annualBudget: num(pc.annualBudget) || undefined,
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
    // v1.16.3 Phase C — Petty Cash Health Score V2 explainability for the
    // Executive view: the four component sub-scores (with formula weights) plus a
    // one-line narrative, all derived from the petty model's scoreBreakdown.
    pettyHealth,
    insights,
    narrative,
  };
}
