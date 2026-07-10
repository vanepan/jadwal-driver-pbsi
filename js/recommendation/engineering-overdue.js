/* ============================================================
   RECOMMENDATION/ENGINEERING-OVERDUE.JS — v1.23.0 hotfix

   Single source of truth for "how many overdue engineering assignments
   makes this CRITICAL, not just noteworthy." Before this fix, Hero
   (narrative-builder.js) and Attention (widgets/executive/index.js) each
   made their own independent decision on the same fact — Hero at >=3,
   Attention at >0 — so for engOverdue of 1 or 2 the two sections disagreed:
   Hero read as "warning," Attention read as "Kritis." One operational fact
   must produce one operational interpretation.

   Both sections read different local severity vocabularies (Hero's
   narrative-builder.js uses the five-tier critical/high/medium/low/
   informational PRIORITY_LEVELS; Attention's ui-kit.js uses the two-tier
   critical/warn SEV_META), so this module makes the ONE underlying
   decision — is this critical? — and each caller maps that single decision
   into its own existing vocabulary. The threshold itself exists in exactly
   one place.

   Pure: no DOM, no Firebase, no side effects.
   ============================================================ */

'use strict';

/** The one number this decision depends on. */
const OVERDUE_CRITICAL_THRESHOLD = 3;

/**
 * Classifies an engineering-overdue count into the single severity decision
 * every Executive Briefing section must agree on for this fact.
 * @param {number} engOverdue
 * @returns {{critical:boolean, severity:'critical'|'high'}}
 *   critical — Attention's binary critical/warn vocabulary reads this directly.
 *   severity — Hero/narrative-builder's five-tier vocabulary reads this directly.
 */
export function classifyEngineeringOverdue(engOverdue) {
  const critical = Number(engOverdue) >= OVERDUE_CRITICAL_THRESHOLD;
  return { critical, severity: critical ? 'critical' : 'high' };
}
