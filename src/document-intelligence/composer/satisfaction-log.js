/* ============================================================
   SATISFACTION-LOG.JS — Pilot UX Validation (Phase 10, Sprint 10.7)

   PURPOSE: the ONE new data-capture point Sprint 10.7 needs — "Reviewer
   satisfaction" is the single Pilot UX Validation metric with no existing
   data source anywhere in this tree (review duration/manual edits/
   approval rate/common corrections/knowledge gaps are all pure
   aggregations over data Sprints 10.1-10.6 already produce — see
   review-metrics-service.js). A 1-5 rating, captured once at publish time
   (ui/review-workspace.js, right after a successful "Terbitkan"), logged
   here.

   Same minimal, in-memory, append-only idiom as
   knowledge/review/review-history.js — a real, tested store, not a stub,
   scoped to exactly what this sprint asks for and nothing more.

   RESPONSIBILITY: recordSatisfactionRating, listSatisfactionRatings.

   DEPENDENCIES: none.
   ============================================================ */

'use strict';

/** @type {{documentId: string, rating: number, actorId: string, ratedAt: string}[]} */
const _log = [];

export const SATISFACTION_RATING_MIN = 1;
export const SATISFACTION_RATING_MAX = 5;

/**
 * @param {{documentId: string, rating: number, actorId: string}} entry
 * @returns {{ok: boolean, data: object|null, error: object|null}}
 */
export function recordSatisfactionRating({ documentId, rating, actorId }) {
  if (!documentId || typeof rating !== 'number' || rating < SATISFACTION_RATING_MIN || rating > SATISFACTION_RATING_MAX) {
    return { ok: false, data: null, error: { code: 'INVALID_RATING', message: `rating must be an integer between ${SATISFACTION_RATING_MIN} and ${SATISFACTION_RATING_MAX}.` } };
  }
  const record = Object.freeze({ documentId, rating, actorId: actorId || null, ratedAt: new Date().toISOString() });
  _log.push(record);
  return { ok: true, data: record, error: null };
}

export function listSatisfactionRatings(documentId = null) {
  return documentId ? _log.filter((r) => r.documentId === documentId) : [..._log];
}

/** Test/teardown helper. Not used by any runtime path. */
export function resetSatisfactionLog() {
  _log.length = 0;
}
