/* ============================================================
   SPENDING-ANALYTICS-ENGINE.JS — Reusable petty-cash spending analytics
   (v1.15.0 — Analytics Expansion Foundation)

   Pure functions over Petty Cash expense records. Used by Analytics
   Petty Cash (Category/Unit breakdown, Spending Intelligence), Analytics
   Executive, and future reports.

   Expense record shape (see petty-cash-service.createExpense):
     { expenseDate:'YYYY-MM-DD', unit:'Engineering'|'Cleaning Service'|'Others',
       customUnit:string, category:string, amount:number, description, notes,
       bidangName?:string|null, bidangId?:string|null  (analytics metadata, v1.15.0) }

   Builds on ranking-engine (distribution) + trend-engine (annualizedProjection),
   so there is one source of ranking/projection math.

   Pure: no DOM, no Firebase, no side effects.
   ============================================================ */

'use strict';

import { distribution, topN } from './ranking-engine.js';
import { annualizedProjection } from './trend-engine.js';
import { getOfficialAnalyticsExpenses } from './nor-analytics-engine.js';

function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }

/** Resolve an expense's display unit ("Others" → its custom unit name). */
export function unitOf(e) {
  if (!e) return '—';
  return e.unit === 'Others' ? (e.customUnit || 'Others') : (e.unit || '—');
}

/**
 * Spend distribution by category.
 * @param {Object[]} expenses
 * @returns {ReturnType<typeof distribution>}
 */
export function categoryBreakdown(expenses) {
  return distribution(expenses, {
    keyOf: (e) => e && e.category,
    valueOf: (e) => num(e && e.amount),
  });
}

/**
 * Spend distribution by operational unit (Engineering / Cleaning Service /
 * custom "Others" name).
 * @param {Object[]} expenses
 * @returns {ReturnType<typeof distribution>}
 */
export function unitBreakdown(expenses) {
  return distribution(expenses, {
    keyOf: (e) => unitOf(e),
    valueOf: (e) => num(e && e.amount),
  });
}

/**
 * Spend distribution by BIDANG — derived from the analytics metadata captured
 * at expense entry (bidangName, matched from the "Nama Unit" free-text against
 * the bidang user roster). Expenses without a resolved bidang are excluded, so
 * this only ranks transactions whose bidang is known.
 * @param {Object[]} expenses
 * @returns {ReturnType<typeof distribution> & {unresolved:number}}
 */
export function bidangBreakdown(expenses) {
  const list = Array.isArray(expenses) ? expenses : [];
  const resolved = list.filter(e => e && e.bidangName);
  const dist = distribution(resolved, {
    keyOf: (e) => e.bidangName,
    valueOf: (e) => num(e && e.amount),
  });
  return { ...dist, unresolved: list.length - resolved.length };
}

/**
 * Top transactions by amount.
 * @param {Object[]} expenses
 * @param {number} [n=5]
 * @returns {Array<{date:string, unit:string, category:string, amount:number,
 *   description:string, bidangName:(string|null)}>}
 */
export function topTransactions(expenses, n = 5) {
  return (Array.isArray(expenses) ? expenses : [])
    .map(e => ({
      date: (e && e.expenseDate) || '',
      unit: unitOf(e),
      category: (e && e.category) || '—',
      amount: num(e && e.amount),
      description: (e && e.description) || '',
      bidangName: (e && e.bidangName) || null,
    }))
    .sort((a, b) => (b.amount - a.amount) || String(a.date).localeCompare(String(b.date)))
    .slice(0, Math.max(0, n));
}

/**
 * Forecast total spend over a horizon from spend-to-date and elapsed days.
 * Thin wrapper over the Trend Engine's annualizedProjection so spending and
 * trend math stay consistent.
 * @param {Object[]} expenses
 * @param {number} elapsedDays
 * @param {number} [horizonDays=365]
 * @returns {ReturnType<typeof annualizedProjection>}
 */
export function forecast(expenses, elapsedDays, horizonDays = 365) {
  const total = (Array.isArray(expenses) ? expenses : []).reduce((s, e) => s + num(e && e.amount), 0);
  return annualizedProjection(total, elapsedDays, horizonDays);
}

/**
 * Total spend across an expense set (convenience).
 * @param {Object[]} expenses
 * @returns {number}
 */
export function totalSpend(expenses) {
  return (Array.isArray(expenses) ? expenses : []).reduce((s, e) => s + num(e && e.amount), 0);
}

/**
 * Total petty-cash "Dana Terpakai" — how much has been consumed operationally
 * up to now, answering: "Berapa total dana petty cash yang telah dikonsumsi
 * operasional sampai saat ini?" (NOT "how much is in NOR reports").
 *
 *   totalConsumedSpend = officialRealizedSpend + activeWorkingSpend
 *
 *   officialRealizedSpend = sum of the official analytics expense source
 *     (expenses in an issued, official, non-archived NOR) — historical realized.
 *   activeWorkingSpend    = active-cycle expenses NOT yet linked to any NOR
 *     (waiting for future realization), and not archived.
 *
 * Excluded by construction: Test NOR, archived Test NOR, archived Official NOR,
 * and orphaned/deleted records (a stale norId is neither official-realized nor
 * working). No double counting: official-linked expenses carry a norId, so they
 * never fall into activeWorkingSpend.
 *
 * @param {{expenses:Object[], nors:Object[], activeCycle:?Object}} ctx
 * @returns {{officialRealizedSpend:number, activeWorkingSpend:number, totalConsumedSpend:number}}
 */
export function calculateConsumedSpend({ expenses, nors, activeCycle } = {}) {
  const list = Array.isArray(expenses) ? expenses : [];
  const officialRealizedSpend = totalSpend(getOfficialAnalyticsExpenses(list, nors));
  const activeWorkingSpend = activeCycle
    ? list
        .filter(e => e && e.cycleId === activeCycle.id && e.status !== 'archived' && !e.norId)
        .reduce((s, e) => s + num(e.amount), 0)
    : 0;
  return {
    officialRealizedSpend,
    activeWorkingSpend,
    totalConsumedSpend: officialRealizedSpend + activeWorkingSpend,
  };
}
