/* ============================================================
   REVIEW-QUEUE-ENGINE.JS — Knowledge Review Workflow (V2.0.3, Phase 9.2)

   PURPOSE: implement the queue contracts/review-contract.js's own header
   explicitly deferred ("NON-GOALS: does not implement a queue"). Wraps the
   repository's raw `getPendingReview()`/`list({lifecycleState})` results
   into real `ReviewQueueEntry` objects, oldest-first, annotated with
   whether Conflict Detection flagged the item.

   RESPONSIBILITY: `getReviewQueue()` (Pending Review) and
   `getCandidateQueue()` (Candidate) — the two named queues V2.0.3 asks
   for, both built on the SAME `ReviewQueueEntry` shape (it was never
   scoped to Pending Review specifically — see that typedef's field names).

   DEPENDENCIES: repository/knowledge-repository.js,
   conflict-detection-engine.js.

   NON-GOALS: does not perform any transition — see
   review-session-engine.js / review-workflow-engine.js.
   ============================================================ */

'use strict';

import {
  listKnowledge as list,
} from '../services/knowledge-service.js';
import { LIFECYCLE_STATE } from '../contracts/lifecycle-contract.js';
import { detectConflicts } from './conflict-detection-engine.js';
import { REVIEW_EVENT_TYPE, makeReviewEvent } from './contracts/event-contract.js';

function toQueueEntries(items, conflictedIds) {
  return Object.freeze(
    [...items]
      .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))
      .map((item) => Object.freeze({
        itemId: item.id,
        itemVersion: item.version,
        enteredQueueAt: item.updatedAt,
        hasConflict: conflictedIds.has(item.id),
      })),
  );
}

function conflictedIdSet(items, onEvent) {
  const reports = detectConflicts(items);
  if (typeof onEvent === 'function') {
    for (const report of reports) onEvent(makeReviewEvent(REVIEW_EVENT_TYPE.CONFLICT_FLAGGED, { detail: report }));
  }
  return new Set(reports.flatMap((r) => r.itemIds));
}

/** Items currently in Pending Review, oldest first. */
export function getReviewQueue(opts = {}) {
  const result = list({ lifecycleState: LIFECYCLE_STATE.PENDING_REVIEW });
  if (!result.ok) return Object.freeze([]);
  return toQueueEntries(result.data, conflictedIdSet(result.data, opts.onEvent));
}

/** Items currently in Candidate, awaiting submission, oldest first. */
export function getCandidateQueue(opts = {}) {
  const result = list({ lifecycleState: LIFECYCLE_STATE.CANDIDATE });
  if (!result.ok) return Object.freeze([]);
  return toQueueEntries(result.data, conflictedIdSet(result.data, opts.onEvent));
}
