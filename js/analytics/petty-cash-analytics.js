/* ============================================================
   PETTY-CASH-ANALYTICS.JS — Analytics model for Analytics Petty Cash
   (v1.15.0 — Analytics Expansion Foundation)

   The "engine call site" for the Petty Cash domain: takes a context bundle
   (raw petty-cash records + selected time range + clock) and composes a
   normalized model using ONLY the reusable engines. No UI, no Firebase, no
   DOM — the view layer assembles the context from the store and renders the
   returned model. Mirrors the role analytics-engine.js plays for Driver.

   Time ranges: 'today' | '7d' | '30d' | '90d' | '1y' | 'annualized'.
   ('today' added v1.15.5.1 so Executive "Hari Ini" is a single-day window on
   both the Driver and Petty engines — no 7d fallback / mixed-window analytics.)
   ============================================================ */

'use strict';

import { calculateTrend, annualizedProjection, summarizeSeries } from './engines/trend-engine.js';
import {
  categoryBreakdown, unitBreakdown, bidangBreakdown, topTransactions, totalSpend, unitOf,
  calculateConsumedSpend,
} from './engines/spending-analytics-engine.js';
import {
  officialNorCount, averageRealizationTime, realizationTrend, getOfficialAnalyticsExpenses,
  realizationTimelinessRatio,
} from './engines/nor-analytics-engine.js';
import { resolveBidang } from '../petty-cash/bidang-matcher.js';
import { generateInsights, generateNarrative } from './engines/insight-engine.js';
import {
  administrativeComplianceScore, budgetAdherenceScore, cashAvailabilityScore,
  spendingStabilityScore, calculateScore, PC_SCORE_WEIGHTS_V1,
} from './engines/executive-score-engine.js';
import { DEFAULT_ANNUAL_PETTY_CASH_BUDGET } from '../petty-cash/petty-cash-config.js';

const MS_PER_DAY = 86400000;

function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
function isoOf(d) { return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }

export const PC_RANGES = ['today', '7d', '30d', '90d', '1y', 'annualized'];
export const PC_RANGE_LABELS = Object.freeze({
  today: 'Hari Ini', '7d': '7 Hari', '30d': '30 Hari', '90d': '90 Hari', '1y': '1 Tahun', annualized: 'Annualized',
});

/**
 * Resolve the analysis window (current + previous + elapsed days) for a range.
 * @returns {{start:string,end:string,days:number,elapsedDays:number,
 *   prevStart:string,prevEnd:string,isAnnualized:boolean}}
 */
function resolveWindow(range, now) {
  const end = new Date(now);
  const endISO = isoOf(end);
  if (range === 'annualized') {
    const yearStart = new Date(Date.UTC(end.getUTCFullYear(), 0, 1));
    const startISO = isoOf(yearStart);
    const elapsedDays = Math.max(1, Math.round((Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()) - yearStart.getTime()) / MS_PER_DAY) + 1);
    // Previous comparison = same elapsed window of the prior year.
    const prevEnd = new Date(Date.UTC(end.getUTCFullYear() - 1, end.getUTCMonth(), end.getUTCDate()));
    const prevStart = new Date(Date.UTC(end.getUTCFullYear() - 1, 0, 1));
    return { start: startISO, end: endISO, days: elapsedDays, elapsedDays, prevStart: isoOf(prevStart), prevEnd: isoOf(prevEnd), isAnnualized: true };
  }
  const days = range === 'today' ? 1 : range === '7d' ? 7 : range === '30d' ? 30 : range === '90d' ? 90 : range === '1y' ? 365 : 30;
  const start = new Date(end); start.setDate(start.getDate() - days + 1);
  const prevEnd = new Date(start); prevEnd.setDate(prevEnd.getDate() - 1);
  const prevStart = new Date(prevEnd); prevStart.setDate(prevStart.getDate() - days + 1);
  return { start: isoOf(start), end: endISO, days, elapsedDays: days, prevStart: isoOf(prevStart), prevEnd: isoOf(prevEnd), isAnnualized: false };
}

const inRange = (iso, start, end) => !!iso && iso >= start && iso <= end;

/** Bucket expenses into a chronological spend series appropriate to the range. */
function buildSpendSeries(expenses, win, range) {
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const map = new Map();
  let keyOf, labelOf, order;
  if (range === 'today' || range === '7d' || range === '30d') {
    keyOf = (iso) => iso;
    labelOf = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  } else if (range === '90d') {
    // ISO week-ish bucket: group by 7-day offset from window start.
    const startMs = Date.UTC(+win.start.slice(0, 4), +win.start.slice(5, 7) - 1, +win.start.slice(8, 10));
    keyOf = (iso) => {
      const ms = Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
      const wk = Math.floor((ms - startMs) / (7 * MS_PER_DAY));
      return String(wk).padStart(3, '0');
    };
    labelOf = (k) => `Mg ${Number(k) + 1}`;
  } else {
    // 1y / annualized → monthly
    keyOf = (iso) => iso.slice(0, 7);
    labelOf = (k) => `${MONTHS[+k.slice(5, 7) - 1]} ${k.slice(2, 4)}`;
  }
  for (const e of expenses) {
    const iso = e.expenseDate;
    if (!iso) continue;
    const k = keyOf(iso);
    const cur = map.get(k) || { key: k, label: labelOf(k), value: 0 };
    cur.value += num(e.amount);
    map.set(k, cur);
  }
  order = [...map.values()].sort((a, b) => String(a.key).localeCompare(String(b.key)));
  return order.map(p => ({ label: p.label, value: p.value }));
}

/**
 * Compute the Petty Cash analytics model.
 * @param {Object} ctx
 * @param {Object[]} ctx.expenses   - ALL expenses (any cycle/status)
 * @param {Object[]} ctx.nors       - ALL nors
 * @param {Object}   ctx.activeCycle
 * @param {Object[]} ctx.activeExpenses - non-archived expenses (active cycle working set)
 * @param {Object}   ctx.settings
 * @param {'today'|'7d'|'30d'|'90d'|'1y'|'annualized'} ctx.range
 * @param {Date|string|number} [ctx.now]
 * @returns {Object} PettyCashAnalyticsModel
 */
export function computePettyCashAnalytics(ctx = {}) {
  const range = PC_RANGES.includes(ctx.range) ? ctx.range : '30d';
  const now = ctx.now ? new Date(ctx.now) : new Date();
  const win = resolveWindow(range, now);

  const allExpenses = Array.isArray(ctx.expenses) ? ctx.expenses : [];
  const allNors = Array.isArray(ctx.nors) ? ctx.nors : [];
  const activeCycle = ctx.activeCycle || null;
  const settings = ctx.settings || {};
  const bidangRoster = Array.isArray(ctx.bidangRoster) ? ctx.bidangRoster : [];
  // Configurable annual budget (v1.16.0). Falls back to the agreed baseline so
  // existing installations whose settings predate the field keep working.
  const annualBudget = num(settings.annualPettyCashBudget) || DEFAULT_ANNUAL_PETTY_CASH_BUDGET;

  // ── OFFICIAL source of truth ─────────────────────────────────────────────
  // Analytics Petty Cash is an official report: it counts ONLY expenses linked
  // to an issued, official (non-archived) NOR. This single filter excludes
  // draft / siap-NOR / not-yet-in-NOR expenses, TEST NORs, archived TEST NORs,
  // and archived official NORs. Bidang is resolved (metadata → derived) once,
  // here, so every downstream breakdown shares one resolution.
  const officialExpenses = getOfficialAnalyticsExpenses(allExpenses, allNors).map(e => {
    const b = resolveBidang(e, bidangRoster);
    return { ...e, bidangName: b.bidangName, bidangId: b.bidangId };
  });

  // ── Window scoping (over the OFFICIAL set only) ─────────────────────────
  const curExpenses = officialExpenses.filter(e => inRange(e.expenseDate, win.start, win.end));
  const prevExpenses = officialExpenses.filter(e => inRange(e.expenseDate, win.prevStart, win.prevEnd));
  // NORs scoped by issue date (counts apply the official filter internally).
  const curNors = allNors.filter(n => inRange(n.norDate, win.start, win.end));
  const prevNors = allNors.filter(n => inRange(n.norDate, win.prevStart, win.prevEnd));

  const curTotal = totalSpend(curExpenses);
  const prevTotal = totalSpend(prevExpenses);
  const spendTrend = calculateTrend(curTotal, prevTotal, false); // more spend = negative tone

  // ── Active-cycle summary (Ringkasan Siklus Aktif) — cycle-scoped ────────
  // Official-only, scoped to the active cycle (matches the report semantics:
  // "Total Pengeluaran" reflects officially-realised spend, not drafts).
  const cycleOfficialExpenses = activeCycle
    ? officialExpenses.filter(e => e.cycleId === activeCycle.id)
    : [];
  const opening = activeCycle ? num(activeCycle.openingBalance) : num(settings.openingBalance);
  const cycleSpent = totalSpend(cycleOfficialExpenses);
  const remaining = opening - cycleSpent;
  const realizationPct = opening > 0 ? Math.min(100, Math.round((cycleSpent / opening) * 100)) : 0;

  // ── Hero KPIs ───────────────────────────────────────────────────────────
  const norOfficial = officialNorCount(curNors);
  const realization = averageRealizationTime(curNors);
  const realTrend = realizationTrend(curNors, prevNors);

  // ── Breakdowns + ranking ────────────────────────────────────────────────
  const byCategory = categoryBreakdown(curExpenses);
  const byUnit = unitBreakdown(curExpenses);
  const byBidang = bidangBreakdown(curExpenses);
  const topTx = topTransactions(curExpenses, 5);

  // ── Trend series + forecast ──────────────────────────────────────────────
  const series = buildSpendSeries(curExpenses, win, range);
  const seriesSummary = summarizeSeries(series, false);
  const projection = annualizedProjection(curTotal, win.elapsedDays, 365);

  // ── Insight context ───────────────────────────────────────────────────────
  const insightCtx = {
    totalSpend: curTotal,
    openingBalance: opening,
    remainingBalance: remaining,
    realizationPct,
    topUnit: byUnit.top ? { label: byUnit.top.label, pct: byUnit.top.pct, value: byUnit.top.value } : null,
    topCategory: byCategory.top ? { label: byCategory.top.label, pct: byCategory.top.pct, value: byCategory.top.value } : null,
    topBidang: byBidang.top ? { label: byBidang.top.label, pct: byBidang.top.pct, value: byBidang.top.value } : null,
    unitCount: byUnit.rows.length,
    officialNorCount: norOfficial,
    avgRealizationDays: realization.averageDays,
    realizationTrend: realTrend,
    forecast: { projected: projection.projected, actual: projection.actual },
    spendTrend,
    // v1.16.0 Phase D — activate the DORMANT `forecast-pace` insight that already
    // reads `annualBudget` in insight-engine.js (no new insight created).
    annualBudget,
  };
  const insights = generateInsights(insightCtx);
  const narrative = generateNarrative(insightCtx);

  // Dana Terpakai — operational consumption (official realized + active working
  // spend), SCOPED TO THE ACTIVE WINDOW (v1.15.7). Previously this was all-time
  // regardless of the selected period, so the Executive "Dana Terpakai" hero
  // never tracked the filter. It now reuses the SAME window as curExpenses by
  // pre-filtering inputs on expenseDate, then runs the existing
  // calculateConsumedSpend engine — no duplicate calculation, single source of
  // truth preserved. (consumed is Executive-only; Health Score does not read it.)
  const windowExpenses = allExpenses.filter(e => inRange(e.expenseDate, win.start, win.end));
  const consumed = calculateConsumedSpend({ expenses: windowExpenses, nors: allNors, activeCycle });

  // ── Administrative Compliance (v1.16.0 Phase C — FOUNDATION ONLY) ────────────
  // Internal metric: NOT wired into the Health Score, the UI, or any PDF this
  // sprint. Built purely from figures already computed above so the number is
  // verifiable now and ready to feed the future Petty Cash Health Score.
  //   Coverage Ratio   = officialRealizedSpend / totalConsumedSpend
  //   Timeliness Ratio = realized official NORs / official NORs (this window)
  // null when the denominator is 0 (No-Data ≠ 0). Score = 80% Coverage + 20%
  // Timeliness, re-normalized over whichever component is available.
  const coverageRatio = consumed.totalConsumedSpend > 0
    ? consumed.officialRealizedSpend / consumed.totalConsumedSpend
    : null;
  // v1.16.2 — TRUE Timeliness (speed): share of realized NORs replenished within
  // targetDays of issue. The old realizedCount/officialNorCount ratio measured
  // COMPLETION, so it is renamed `realizationRate` and kept as a diagnostic ONLY
  // (it no longer feeds the Compliance score). targetDays is settings-overridable
  // (default 14) with a safe fallback so existing installations keep working.
  const targetDays = num(settings.realizationTargetDays) || 14;
  const timelinessRatio = realizationTimelinessRatio(curNors, targetDays);
  const realizationRate = norOfficial > 0 ? realization.realizedCount / norOfficial : null;
  const complianceScore = administrativeComplianceScore({ coverageRatio, timelinessRatio });

  // ── Budget Adherence (v1.16.1 Phase B — OBSERVABILITY ONLY) ──────────────────
  // YTD by construction (independent of the selected range) so the figure is a
  // stable annual-pace signal — it does not move when the user changes the period
  // filter. Reuses the SAME 'annualized' window math (resolveWindow) the trend
  // block already uses, so Jan 1 → now and elapsed-days are computed one way only.
  //   Actual Burn YTD   = official spend Jan 1 → now (the official source of truth)
  //   Expected Burn YTD = configurable annual budget pro-rated by elapsed days
  //   Adherence Ratio   = actual / expected  (null when there is no YTD spend yet:
  //                       No-Data ≠ a real 0%-pace reading)
  // NOT wired into any score this sprint (spec B5/C).
  const ytdWin = win.isAnnualized ? win : resolveWindow('annualized', now);
  const ytdOfficial = officialExpenses.filter(e => inRange(e.expenseDate, ytdWin.start, ytdWin.end));
  const actualBurnYtd = totalSpend(ytdOfficial);
  const elapsedDaysYtd = ytdWin.elapsedDays;
  const expectedBurnYtd = Math.round(annualBudget * elapsedDaysYtd / 365);
  const budgetAdherenceRatio = (ytdOfficial.length > 0 && expectedBurnYtd > 0)
    ? actualBurnYtd / expectedBurnYtd
    : null;
  const budgetAdherenceScoreVal = budgetAdherenceScore(budgetAdherenceRatio);

  // ── Cash Availability (v1.16.2) — standalone budget-headroom component ───────
  // null when there is no active cycle budget to measure (No-Data ≠ 100).
  const cashRemainingRatio = (activeCycle && opening > 0) ? Math.max(0, remaining) / opening : null;
  const cashScore = cashAvailabilityScore(cashRemainingRatio);

  // ── Spending Stability v1 (v1.16.2) — R1 + R3 warning count (R2 deferred) ────
  // Same thresholds the engine applies (R1 >60%, R3 >25% annual budget); the
  // flags here are the explainability mirror, the engine owns the score.
  const stabilityHasData = curExpenses.length > 0;
  const topCategoryPct = byCategory.top ? byCategory.top.pct : null;
  const maxTransactionAmount = topTx.length ? topTx[0].amount : null;
  const r1Concentrated = stabilityHasData && topCategoryPct != null && topCategoryPct > 60;
  const r3OutsizedTx = stabilityHasData && annualBudget > 0 && maxTransactionAmount != null
    && maxTransactionAmount > annualBudget * 0.25;
  const stabilityScore = spendingStabilityScore({
    topCategoryPct, maxTransactionAmount, annualBudget, hasData: stabilityHasData,
  });

  // ── Petty Cash Health Score (v1.16.2 — 35/30/25/10 recomposition) ───────────
  // Reuses the SAME calculateScore blend engine as the Executive score (single
  // source of weighting + renormalization). Guard: needs ≥3 non-null components,
  // else null — communicates "insufficient data" honestly AND caps any single
  // component's effective influence at ≤50% (audit v1.16.1.1 §3). NOTE: this is
  // exposed on the model only; the Executive blend still uses the legacy
  // pettyCashHealthScore this sprint (cutover deferred to a UI/PDF-review sprint).
  const pcComponents = {
    compliance: complianceScore,
    budget: budgetAdherenceScoreVal,
    cash: cashScore,
    stability: stabilityScore,
  };
  const activeComponentCount = Object.values(pcComponents).filter(v => v != null).length;
  const pcScored = calculateScore(pcComponents, PC_SCORE_WEIGHTS_V1);
  const healthScore = activeComponentCount >= 3 ? pcScored.score : null;

  return {
    schemaVersion: 1,
    domain: 'pettyCash',
    metadata: { generatedAt: new Date().toISOString(), range, rangeLabel: PC_RANGE_LABELS[range], window: win },
    consumed,
    // v1.16.0 — configurable annual budget carried on the model so the Executive
    // composer can reuse the SAME value (single source) without re-reading settings.
    annualBudget,
    // v1.16.2 — Petty Cash Health Score (35/30/25/10), gated ≥3 components.
    healthScore,
    // v1.16.2 Phase F — per-component breakdown so Executive Analytics can later
    // explain "why the score is X" without recomputation (MODEL ONLY, no UI/PDF).
    scoreBreakdown: {
      compliance: complianceScore,        // 0–100 | null (35%)
      budget: budgetAdherenceScoreVal,    // 0–100 | null (30%)
      cash: cashScore,                    // 0–100 | null (25%)
      stability: stabilityScore,          // 0–100 | null (10%)
      weights: PC_SCORE_WEIGHTS_V1,
      usedWeight: pcScored.usedWeight,
      activeComponents: activeComponentCount,
    },
    // Administrative Compliance (v1.16.2): Coverage 80% + TRUE Timeliness 20%.
    // `realizationRate` is a diagnostic only (renamed from the old "timeliness").
    compliance: {
      coverageRatio, timelinessRatio, realizationRate, targetDays, score: complianceScore,
    },
    // Cash Availability (v1.16.2).
    cash: { remainingRatio: cashRemainingRatio, score: cashScore },
    // Spending Stability v1 (v1.16.2) — R1/R3 flags + score.
    stability: {
      topCategoryPct, maxTransactionAmount,
      r1Concentrated, r3OutsizedTx, score: stabilityScore,
    },
    // v1.16.1 Phase B/C — Budget Adherence observability (YTD).
    budget: {
      annualBudget,
      elapsedDaysYtd,
      expectedBurnYtd,
      actualBurnYtd,
      adherenceRatio: budgetAdherenceRatio,
      adherenceScore: budgetAdherenceScoreVal,
    },
    hero: {
      norOfficial,
      avgRealizationDays: realization.averageDays,
      realizedCount: realization.realizedCount,
      realizationTrend: realTrend,
    },
    cycle: {
      number: activeCycle ? activeCycle.cycleNumber : null,
      opening, spent: cycleSpent, remaining, realizationPct,
    },
    trend: {
      series, summary: seriesSummary, spendTrend,
      isAnnualized: win.isAnnualized,
      annualized: { actual: projection.actual, projected: projection.projected, perDay: projection.perDay, elapsedDays: projection.elapsedDays },
    },
    breakdown: { category: byCategory, unit: byUnit, bidang: byBidang },
    ranking: {
      topUnit: byUnit.top, topCategory: byCategory.top, topBidang: byBidang.top,
      topTransactions: topTx, bidangUnresolved: byBidang.unresolved,
    },
    insights,
    narrative,
    diagnostics: { curCount: curExpenses.length, prevCount: prevExpenses.length, curTotal, prevTotal },
  };
}

export { unitOf };
