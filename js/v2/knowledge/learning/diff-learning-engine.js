/* ============================================================
   DIFF-LEARNING-ENGINE.JS — Diff Learning Foundation (V2.0.16)

   PURPOSE: bridge "Difference" to "Candidate Knowledge" in the roadmap's
   pipeline (Generated Draft -> User Edit -> Difference -> Candidate
   Knowledge -> Review Queue -> Approved Knowledge -> Organizational
   Profile Update) — the ONE new step this milestone adds. Every other
   node already exists and is reused UNCHANGED:

     Difference        -> diff-engine.js#computeDiff (V2.0.15, shared)
     Candidate Knowledge -> correction-pipeline-engine.js#submitCorrection (V2.0.5) — unmodified
     Review Queue       -> review/review-workflow-engine.js#submitForReview (Phase 5) — unmodified
     Approved Knowledge  -> review/review-workflow-engine.js#approve (Phase 5) — unmodified
     Organizational Profile Update -> automatic by construction: profiles/
       profile-engine.js never caches — the very next buildProfile()/
       buildAllProfiles() call after an approve() already reflects it. No
       polling, no event wiring, no new plumbing needed or built.

   Decision 6 ("teach once, learn forever") holds exactly as it already
   did in correction-pipeline-engine.js: this file NEVER calls
   submitForReview/approve itself — every learned change still requires
   an explicit, separate human review action.

   RESPONSIBILITY: `submitDraftEditAsCorrection({domainType, kind, itemId,
   before, after, correctedBy})` — computes the Diff, wraps it as ONE
   Correction (the whole `after` state, matching how a human reviews one
   coherent edit rather than N disconnected field patches), and submits
   it through the existing correction pipeline.

   DEPENDENCIES: diff-engine.js, contracts/diff-contract.js,
   correction-pipeline-engine.js (submitCorrection et al., untouched).

   NON-GOALS: does not call review-workflow-engine.js — moving a Candidate
   into Review Queue / Approved is a deliberate, separate human action a
   caller takes afterward, same as any other Candidate. Does not touch
   profiles/ — see the automatic-by-construction note above.
   ============================================================ */

'use strict';

import { computeDiff } from './diff-engine.js';
import {
  startCorrectionSession, submitCorrection, finishCorrectionSession,
} from './correction-pipeline-engine.js';

export const DIFF_LEARNING_ERRORS = Object.freeze({
  NO_CHANGE: 'NO_CHANGE',
});

/**
 * @param {{domainType: string, kind: string, itemId?: string|null, before: Object, after: Object, correctedBy: string, note?: string|null, onEvent?: Function}} params
 * @returns {{ok: boolean, diff: import('./contracts/diff-contract.js').Diff, submission: object|null, session: object|null, error: object|null}}
 */
export function submitDraftEditAsCorrection({
  domainType, kind, itemId = null, before, after, correctedBy, note = null, onEvent,
}) {
  const diff = computeDiff(before, after);

  if (diff.fieldsChanged === 0) {
    return {
      ok: false, diff, submission: null, session: null,
      error: { code: DIFF_LEARNING_ERRORS.NO_CHANGE, message: 'submitDraftEditAsCorrection: before and after are identical — nothing to learn.' },
    };
  }

  const session = startCorrectionSession(correctedBy, { onEvent });
  const changedFields = diff.entries.map((e) => e.field).join(', ');
  const correction = {
    itemId, domainType, kind, correctedPayload: after, correctedBy,
    note: note || `Diff learning: ${diff.fieldsChanged} field(s) changed (${changedFields}).`,
  };

  const submission = submitCorrection(session, correction, { onEvent });
  const completedSession = finishCorrectionSession(submission.session, { onEvent });

  return {
    ok: submission.ok,
    diff,
    submission,
    session: completedSession,
    error: submission.ok ? null : submission.error,
  };
}
