/* ============================================================
   REVIEW-SERVICE.JS — Knowledge Services (V2, Phase 6)

   PURPOSE: the one public surface for "everything about reviewing
   Knowledge" — submit/approve/reject/rollback plus "what's waiting" — so a
   future review-queue UI imports one module instead of reaching into
   review-workflow-engine.js and knowledge-repository.js separately.

   RESPONSIBILITY: pure orchestration/composition of already-real Phase 5
   engines. Adds no new decision logic — every method is a direct
   delegation, at most composing two calls (e.g. `listPendingReview()`
   composes the repository's `getPendingReview()` with nothing extra).

   DEPENDENCIES: knowledge/review/review-workflow-engine.js,
   knowledge/repository/knowledge-repository.js.

   NON-GOALS: no authorization/role check (still the open Phase 4+
   question noted in contracts/review-contract.js). No new validation
   beyond what review-workflow-engine.js already performs.

   FUTURE EVOLUTION: once approver authority is decided, an authorization
   check is layered HERE (in front of the engine calls), not inside the
   engine — keeping the engine role-agnostic.
   ============================================================ */

'use strict';

import { submitForReview, approve, reject, rollback, canSubmitForReview } from '../review/review-workflow-engine.js';
import {
  getPendingReviewKnowledge as getPendingReview,
} from './knowledge-service.js';
import { getReviewQueue, getCandidateQueue } from '../review/review-queue-engine.js';

export { submitForReview, approve, reject, rollback, canSubmitForReview, getReviewQueue, getCandidateQueue };

/** Everything currently sitting in the review queue. */
export function listPendingReview() {
  return getPendingReview();
}
