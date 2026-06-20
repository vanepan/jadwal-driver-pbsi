/* ============================================================
   PETTY-CASH-ANALYTICS.JS — Analytics model for Analytics Petty Cash
   (v1.15.0 — Analytics Expansion Foundation)

   The "engine call site" for the Petty Cash domain: takes a context bundle
   (raw petty-cash records + selected time range + clock) and composes a
   normalized model using ONLY the reusable engines. No UI, no Firebase, no
   DOM — the view layer assembles the context from the store and renders the
   returned model. Mirrors the role analytics-engine.js plays for Driver.

   Time ranges (spec P2): '7d' | '30d' | '90d' | '1y' | 'annualized'.
   ============================================================ */

'use strict';

import { calculateTrend, annualizedProjection, summarizeSeries } from './engines/trend-engine.js';
import {
  categoryBreakdown, unitBreakdown, bidangBreakdown, topTransactions, totalSpend, unitOf,
  calculateConsumedSpend,
} from './engines/spending-analytics-engine.js';
import {
  officialNorCount, averageRealizationTime, realizationTrend, getOfficialAnalyticsExpenses,
} from './engines/nor-analytics-engine.js';
import { resolveBidang } from '../petty-cash/bidang-matcher.js';
import { generateInsights, generateNarrative } from './engines/insight-engine.js';

const MS_PER_DAY = 86400000;

function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
function isoOf(d) { return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }

export const PC_RANGES = ['7d', '30d', '90d', '1y', 'annualized'];
export const PC_RANGE_LABELS = Object.freeze({
  '7d': '7 Hari', '30d': '30 Hari', '90d': '90 Hari', '1y': '1 Tahun', annualized: 'Annualized',
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
  const days = range === '7d' ? 7 : range === '30d' ? 30 : range === '90d' ? 90 : range === '1y' ? 365 : 30;
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
  if (range === '7d' || range === '30d') {
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
 * @param {'7d'|'30d'|'90d'|'1y'|'annualized'} ctx.range
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
  };
  const insights = generateInsights(insightCtx);
  const narrative = generateNarrative(insightCtx);

  // Dana Terpakai — total operational consumption (official realized + active
  // working spend). Reusable across Executive, PDF, dashboards, digests.
  const consumed = calculateConsumedSpend({ expenses: allExpenses, nors: allNors, activeCycle });

  return {
    schemaVersion: 1,
    domain: 'pettyCash',
    metadata: { generatedAt: new Date().toISOString(), range, rangeLabel: PC_RANGE_LABELS[range], window: win },
    consumed,
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
