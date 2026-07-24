/* ============================================================
   QUIET-INTELLIGENCE-ENGINE.JS — Gudang Quiet Intelligence Engine
   (Phase 8, Part 2)

   Authorized by: Doc 1 Art.VII (Amendment I — Quiet Intelligence) · Doc 2
   §15 (Quiet Intelligence) · Doc 3 Ch.10 (Quiet Intelligence Engine)

   PURPOSE: translate a number or flag analytics-engine.js already computed
   into the sentence a person reads instead of doing arithmetic (Doc 1
   Art.VII: "124 units -> ~18 days remaining"). Doc 3 Ch.10 is explicit
   about the boundary this file must never cross: "It takes exactly one
   input: a number or flag Analytics Engine already computed... It is
   never given raw Movement or Stock to interpret directly, and it never
   decides a threshold, a recommendation, or a forecast on its own."

   Every function here is a PURE string template over an already-decided
   value — no repository import, no I/O, no decision-making. If a function
   here ever needs to know "is this good or bad," that decision was made
   in analytics-engine.js and handed in as a boolean, never re-derived.

   Silence is a feature, not a gap: several functions return `null` rather
   than a sentence when there is nothing worth saying (Doc 2 §15: "a
   sentence, not a conversation partner... answers the question... and
   then goes quiet again") — e.g. no restock sentence when none is
   recommended, no cost sentence when there is no priced history yet.

   No AI. No chatbot. No conversational UI (Doc 2 §15) — every sentence
   below is a fixed template, not a generated one.
   ============================================================ */

'use strict';

/**
 * @param {?number} daysRemaining - analytics-engine.js#getForecastDaysRemaining's result
 * @returns {?string}
 */
export function forecastSentence(daysRemaining) {
  if (daysRemaining == null) return null; // Doc 2 §14: "No Forecast Yet" — insufficient history, not an error
  return `≈${daysRemaining} days remaining`;
}

/**
 * @param {boolean} recommended - analytics-engine.js#isRestockRecommended's result
 * @returns {?string}
 */
export function restockSentence(recommended) {
  return recommended ? 'Restock recommended' : null;
}

/**
 * @param {?string} departmentLabel - a human display name (resolved by the
 *   caller from Department, e.g. via department-repository.js) — this
 *   function never resolves a name from an id itself (Doc 4 Art.IV: no
 *   cross-domain reach from a presentation layer).
 * @returns {?string}
 */
export function topDepartmentSentence(departmentLabel) {
  if (!departmentLabel) return null;
  return `Highest consuming department: ${departmentLabel}`;
}

function formatRupiah(amount) {
  if (amount >= 1_000_000) return `Rp ${(amount / 1_000_000).toFixed(1)}jt`;
  if (amount >= 1_000) return `Rp ${(amount / 1_000).toFixed(0)}rb`;
  return `Rp ${Math.round(amount)}`;
}

/**
 * @param {?number} amount - analytics-engine.js#getAverageMonthlyCost's result
 * @returns {?string}
 */
export function averageMonthlyCostSentence(amount) {
  if (amount == null || amount <= 0) return null; // Doc 2 §07: price was never entered — nothing to report, not zero cost
  return `Average monthly cost: ${formatRupiah(amount)}`;
}
