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
  { key: 'compliance', label: 'Kepatuhan Administrasi', weightPct: 35, scope: 'Periode Analisis' },
  { key: 'budget',     label: 'Kepatuhan Anggaran',     weightPct: 30, scope: 'Tahun Berjalan (YTD)' },
  { key: 'cash',       label: 'Ketersediaan Kas',       weightPct: 25, scope: 'Siklus Petty Cash Aktif' },
  { key: 'stability',  label: 'Stabilitas Pengeluaran', weightPct: 10, scope: 'Periode Analisis' },
];

/**
 * Data Sufficiency / Confidence (v1.16.4.6.1 — Trust Layer). PRESENTATION ONLY.
 * Tells the reader whether the petty score rests on enough data. Reuses figures
 * the petty model ALREADY computed (transaction count, official NOR count, active
 * component count) — derives NO new analytics, runs NO engine, and NEVER feeds
 * the score, weights, or gate. Thresholds per spec v1.16.4.6.1 Phase A.
 * @returns {{level:'high'|'medium'|'low'|'insufficient', label:string}}
 */
function computeConfidence({ txCount, norCount, activeComponents, hasScore }) {
  if (!hasScore || !(txCount > 0)) return { level: 'insufficient', label: 'Data Tidak Memadai' };
  if (txCount >= 20 && norCount >= 3 && activeComponents >= 3) return { level: 'high', label: 'Data Sangat Memadai' };
  if (txCount >= 5) return { level: 'medium', label: 'Data Memadai' };
  return { level: 'low', label: 'Data Terbatas' }; // 1–4 transaksi
}

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
export function computeExecutiveAnalytics({ driverModel, pettyModel, meta } = {}) {
  const dk = (driverModel && driverModel.kpis) || {};
  const pc = pettyModel || {};
  const pcCycle = pc.cycle || {};
  const pcHero = pc.hero || {};
  const pcBudget = pc.budget || {};

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

  // ── Executive Petty KPIs (v1.16.4.5) — sourced directly from the existing
  //    petty model; NO engine changes. These three back the rationalized
  //    Executive KPI strip (Dashboard + PDF parity):
  //      • actualBurnYtd — Dana Digunakan YTD                 (pc.budget.actualBurnYtd)
  //      • realizedCount — Jumlah Realisasi NOR               (pc.hero.realizedCount)
  //      • rabUsagePct   — Persentase Pemakaian RAB Petty Cash
  //                        = (actualBurnYtd / annualBudget) × 100, guarded null
  //                          when annualBudget ≤ 0. Intentionally NOT
  //                          budget.adherenceRatio nor cycle.realizationPct.
  const actualBurnYtd = num(pcBudget.actualBurnYtd);
  const realizedCount = num(pcHero.realizedCount);
  const rabAnnualBudget = num(pc.annualBudget);
  const rabUsagePct = rabAnnualBudget > 0 ? clampPct((actualBurnYtd / rabAnnualBudget) * 100) : null;

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
    // v1.16.4.6.1 Phase B — expose the time horizon each component ALREADY uses
    // (no scope change; purely surfacing what the model computes today).
    scope: m.scope,
    score: sb[m.key] == null ? null : clampPct(sb[m.key]),
  }));
  const pettyLevelLabel = pettyHasScore ? healthLevel(pc.healthScore).label : 'Belum Ada Data';

  // ── Trust Layer (v1.16.4.6.1) — PRESENTATION metadata for Dashboard + PDF.
  //    Built ONLY from figures the petty model already produced; SINGLE source so
  //    both surfaces render identical copy (Phase E parity). No score/weight/gate
  //    change. ────────────────────────────────────────────────────────────────
  const pettyTxCount = num((pc.diagnostics || {}).curCount);            // official tx in window
  const pettyActiveComponents = num((pc.scoreBreakdown || {}).activeComponents);
  const hasActiveCycle = !!(pc.cycle && pc.cycle.number != null);
  const periodLabel = (meta && meta.periodLabel) || (pc.metadata && pc.metadata.rangeLabel) || '';
  const confidence = computeConfidence({
    txCount: pettyTxCount, norCount: norOfficial,
    activeComponents: pettyActiveComponents, hasScore: pettyHasScore,
  });
  // Phase C — Transparency facts (no recommendation/insight/AI/prediction): plain
  // facts the model already holds, prebuilt as display strings here so Dashboard
  // and PDF are byte-identical.
  const transparencyFacts = [];
  if (pettyTxCount > 0) {
    transparencyFacts.push(`${pettyTxCount} transaksi petty cash`);
    transparencyFacts.push(`${realizedCount} NOR terealisasi`);
    if (periodLabel) transparencyFacts.push(`Periode analisis ${periodLabel}`);
    transparencyFacts.push(hasActiveCycle ? 'Siklus petty cash aktif' : 'Tidak ada siklus aktif');
  }
  const transparency = {
    hasData: pettyTxCount > 0,
    facts: transparencyFacts,
    emptyText: 'Data belum cukup untuk menghasilkan penilaian yang representatif.',
  };
  // Phase D — Null-state clarification: petty score is null (insufficient) yet at
  // least one component bar still renders (e.g. Ketersediaan Kas = 100 from an
  // idle cycle). Make clear those bars are informational, not a verdict.
  const anyComponentData = pettyComponents.some((c) => c.score != null);
  const nullState = {
    active: !pettyHasScore && anyComponentData,
    text: 'Belum terdapat aktivitas petty cash yang cukup untuk menghasilkan Health Score. '
      + 'Beberapa indikator tetap ditampilkan sebagai informasi operasional dan belum '
      + 'merepresentasikan kesehatan petty cash secara menyeluruh.',
  };

  const pettyHealth = {
    score: pettyHasScore ? clampPct(pc.healthScore) : null,
    levelLabel: pettyLevelLabel,
    components: pettyComponents,
    narrative: pettyNarrative(pettyComponents, pettyLevelLabel, pettyHasScore),
    confidence,
    transparency,
    nullState,
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
    pettyKpis: { activeBalance, norOfficial, realizationPct, consumedSpend, opening: num(pcCycle.opening), actualBurnYtd, realizedCount, rabUsagePct },
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
    // ── Driver Workload Intelligence (v1.16.4.8) — ADDITIVE executive surface.
    //    Read straight from the Driver sub-model's KPIs; introduces NO new
    //    calculation here and does NOT touch the Executive score, scoreBreakdown,
    //    KPI strip, or Petty Cash health. Purely a presentation surface. ───────
    workloadIntel: {
      palingAktif: dk.workloadTop || null,          // { name, score } | null
      bebanTerendah: dk.workloadLow || null,        // { name, score } | null
      avgScore: num(dk.workloadAvgScore),
      totalActualHours: num(dk.totalActualHours),
      totalOvertimeHours: num(dk.totalOvertimeHours),
      weekendAssignments: num(dk.weekendAssignments),
    },
    insights,
    narrative,
  };
}
