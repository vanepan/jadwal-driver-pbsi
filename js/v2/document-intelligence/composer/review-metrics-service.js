/* ============================================================
   REVIEW-METRICS-SERVICE.JS — Pilot UX Validation (Phase 10, Sprint 10.7)

   PURPOSE: computeReviewMetrics() — the 6 metrics the Phase 10 spec names
   for Pilot UX Validation (Review duration, Manual edits, Approval rate,
   Common corrections, Knowledge gaps, Reviewer satisfaction), assembled
   ENTIRELY from data Sprints 10.1-10.6 already produce. Five of six are
   pure aggregation, invented here as arithmetic only, never as a new
   measurement:

     Review duration    <- getReviewHistory() timestamps (10.4/10.5)
     Manual edits        <- getRevisionHistory().editedBy (10.1/10.3)
     Approval rate       <- listAllDocuments() status distribution (10.1/10.4)
     Common corrections  <- EditableSection.isOverridden per field (10.3)
     Knowledge gaps       <- explainDocument().unknownFacts (10.2)

   The sixth, Reviewer satisfaction, has NO existing data source anywhere
   in this tree — satisfaction-log.js is this sprint's one genuinely new
   capture point (see that file's own header).

   WHY THIS FILE LIVES HERE, NOT UNDER knowledge/services/: it reads
   composer-store.js and nor-explainability-service.js, both
   document-intelligence/ — js/v2/README.md's dependency graph is
   explicit that knowledge/ may NEVER depend on document-intelligence/
   (the same constraint that placed nor-explainability-service.js under
   document-intelligence/nor/ in Sprint 10.2, not knowledge/services/).

   RESPONSIBILITY: computeReviewMetrics().

   DEPENDENCIES: composer-store.js, contracts/composer-review-contract.js,
   satisfaction-log.js, ../nor/nor-explainability-service.js.

   NON-GOALS: never recomputes a Recommendation or a Diff — reads only
   what those engines already produced and stored.
   ============================================================ */

'use strict';

import { listAllDocuments, getRevisionHistory, getReviewHistory } from './composer-store.js';
import { COMPOSER_REVIEW_STATE } from './contracts/composer-review-contract.js';
import { listSatisfactionRatings } from './satisfaction-log.js';
import { explainDocument } from '../nor/nor-explainability-service.js';

const DECIDED_STATES = Object.freeze([
  COMPOSER_REVIEW_STATE.APPROVED, COMPOSER_REVIEW_STATE.PUBLISHED, COMPOSER_REVIEW_STATE.REJECTED,
]);

function average(numbers) {
  if (!numbers.length) return null;
  return numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
}

function topN(counts, n) {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([field, count]) => ({ field, count }));
}

/** Time from a document's first entry INTO in_review to its first
 *  approved/rejected DECISION, in ms — null if either point is missing
 *  (e.g. still in_review, or never submitted). */
function reviewDurationMs(documentId) {
  const history = getReviewHistory(documentId);
  const enteredReview = history.find((r) => r.toState === COMPOSER_REVIEW_STATE.IN_REVIEW);
  if (!enteredReview) return null;
  const decided = history.find((r) => r.toState === COMPOSER_REVIEW_STATE.APPROVED || r.toState === COMPOSER_REVIEW_STATE.REJECTED);
  if (!decided) return null;
  const ms = new Date(decided.decidedAt).getTime() - new Date(enteredReview.decidedAt).getTime();
  return ms >= 0 ? ms : null;
}

function manualEditCount(documentId) {
  return getRevisionHistory(documentId).filter((r) => r.editedBy !== null).length;
}

/**
 * @returns {{ok: boolean, data: object, error: null}}
 */
export function computeReviewMetrics() {
  const docs = listAllDocuments();

  const statusDistribution = {};
  for (const d of docs) statusDistribution[d.status] = (statusDistribution[d.status] || 0) + 1;

  const decidedCount = docs.filter((d) => DECIDED_STATES.includes(d.status)).length;
  const approvedCount = docs.filter((d) => d.status === COMPOSER_REVIEW_STATE.APPROVED || d.status === COMPOSER_REVIEW_STATE.PUBLISHED).length;
  const approvalRate = decidedCount > 0 ? approvedCount / decidedCount : null;

  const durations = docs.map((d) => reviewDurationMs(d.documentId)).filter((ms) => ms !== null);
  const avgReviewDurationMs = average(durations);

  const editCounts = docs.map((d) => manualEditCount(d.documentId));
  const avgManualEditsPerDocument = average(editCounts);

  const correctionCounts = {};
  for (const d of docs) {
    for (const s of d.sections) {
      if (s.isOverridden) correctionCounts[s.field] = (correctionCounts[s.field] || 0) + 1;
    }
  }
  const topCorrectedFields = topN(correctionCounts, 5);

  const gapCounts = {};
  for (const d of docs) {
    const explained = explainDocument(d.documentId);
    if (!explained.ok) continue;
    for (const field of explained.data.unknownFacts) gapCounts[field] = (gapCounts[field] || 0) + 1;
  }
  const topKnowledgeGaps = topN(gapCounts, 5);

  const ratings = listSatisfactionRatings().map((r) => r.rating);
  const avgSatisfactionRating = average(ratings);

  return {
    ok: true,
    error: null,
    data: {
      totalDocuments: docs.length,
      statusDistribution,
      decidedCount,
      approvedCount,
      approvalRate,
      avgReviewDurationMs,
      reviewDurationSampleSize: durations.length,
      avgManualEditsPerDocument,
      topCorrectedFields,
      topKnowledgeGaps,
      avgSatisfactionRating,
      satisfactionRatingCount: ratings.length,
    },
  };
}
