/* ============================================================
   ANALYTICS-GOVERNANCE.JS — Governance layer (placeholder)

   Sprint 0 foundation only. The data-classification model is defined
   in GOVERNANCE_RECOMMENDATION.md. The hard rule for this sprint:

       ABSENCE OF GOVERNANCE DATA  ⇒  PRODUCTION (eligible)

   so NO records disappear and analytics output is byte-identical to the
   pre-refactor behavior. The real classification UX, bulk reclassify
   tooling, and supervised cleanup land in a later sprint.

   This module is intentionally pure (no Firebase, no DOM).
   ============================================================ */

'use strict';

/** @type {ReadonlyArray<'production'|'testing'|'training'|'demo'>} */
export const CLASSIFICATIONS = ['production', 'testing', 'training', 'demo'];

/**
 * Is a record allowed into analytics aggregates?
 *
 * Sprint 0 contract: a record with no `governance` block is PRODUCTION.
 * A record is excluded only if it is *explicitly* marked non-production
 * (or analyticsEligible === false). Since no records carry a governance
 * block today, this returns true for every existing record → parity.
 *
 * @param {Object} record
 * @returns {boolean}
 */
export function isAnalyticsEligible(record) {
  const g = record && record.governance;
  if (g == null) return true;                       // legacy/unclassified ⇒ production
  if (g.analyticsEligible === false) return false;
  if (g.classification && g.classification !== 'production') return false;
  return true;
}

/**
 * Project a record list down to analytics-eligible records.
 * Identity for ungoverned data (Sprint 0) — the hook is wired now so the
 * engine pipeline is governance-ready, with zero behavioral change today.
 *
 * @template T
 * @param {T[]} records
 * @returns {T[]}
 */
export function filterEligible(records) {
  if (!Array.isArray(records)) return records;
  return records.filter(isAnalyticsEligible);
}

/**
 * Derive a non-mutating classification view of a record (for future UI).
 * @param {Object} record
 * @returns {{classification:string, eligible:boolean, explicit:boolean}}
 */
export function classificationOf(record) {
  const g = record && record.governance;
  if (g == null) return { classification: 'production', eligible: true, explicit: false };
  return {
    classification: g.classification || 'production',
    eligible: isAnalyticsEligible(record),
    explicit: true,
  };
}
