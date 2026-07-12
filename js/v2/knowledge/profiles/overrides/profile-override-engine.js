/* ============================================================
   PROFILE-OVERRIDE-ENGINE.JS — Organizational Profiles, Editable Layer (V2.1)

   PURPOSE: the ONLY named entry points by which a Profile Override may
   move through Draft -> Candidate -> Pending Review -> Approved ->
   Deprecated, mirroring knowledge/review/review-workflow-engine.js's
   "named transitions only" discipline. Cannot reuse
   review-workflow-engine.js / lifecycle/lifecycle-engine.js directly —
   both are hardcoded to knowledge/repository/knowledge-repository.js — so
   this is the justified sibling: same LIFECYCLE_STATE/canTransition/
   isValidReviewDecision (all reused unchanged from
   knowledge/contracts/{lifecycle,review}-contract.js), a new instance of
   the guarded-transition pattern pointed at
   ./repository/profile-override-repository.js instead.

   RESPONSIBILITY: createOverrideDraft, submitOverrideForReview,
   approveOverride, rejectOverride, rollbackOverride.

   DEPENDENCIES: knowledge/contracts/lifecycle-contract.js,
   knowledge/contracts/review-contract.js (isValidReviewDecision, reused
   unchanged — it only depends on canTransition + LIFECYCLE_STATE, both
   already imported here), ./repository/profile-override-repository.js,
   ./contracts/profile-override-contract.js.
   ============================================================ */

'use strict';

import { LIFECYCLE_STATE, canTransition } from '../../contracts/lifecycle-contract.js';
import { isValidReviewDecision } from '../../contracts/review-contract.js';
import { makeProfileOverrideEntry } from './contracts/profile-override-contract.js';
import {
  create as repoCreate, appendVersion as repoAppendVersion, getById as repoGetById,
  getVersion as repoGetVersion, getHistory as repoGetHistory, list as repoList,
} from './repository/profile-override-repository.js';

function failure(code, message) {
  return Object.freeze({ ok: false, data: null, error: Object.freeze({ code, message }) });
}

/** Deterministic id — one override per (domainType, overrideType, key). */
function makeOverrideId(domainType, overrideType, key) {
  return `${domainType}:${overrideType}:${key}`;
}

export function createOverrideDraft({ domainType, overrideType, key, action, payload, authoredBy }) {
  const id = makeOverrideId(domainType, overrideType, key);
  const entry = makeProfileOverrideEntry({ id, domainType, overrideType, key, action, payload, authoredBy });
  return repoCreate(entry);
}

/** Structural pre-check only, same shape as review-workflow-engine.js#canSubmitForReview. */
export function canSubmitOverrideForReview(fromState) {
  return fromState === LIFECYCLE_STATE.CANDIDATE;
}

function currentState(id) {
  const result = repoGetById(id);
  return result.ok ? result.data.lifecycleState : null;
}

/** Moves a Draft override to Candidate (a human confirms it's ready to be
 *  proposed, before it enters the review queue proper). */
export function promoteOverrideToCandidate(id) {
  const from = currentState(id);
  if (!canTransition(from, LIFECYCLE_STATE.CANDIDATE)) {
    return failure('ILLEGAL_TRANSITION', `Cannot promote override "${id}" from state "${from}".`);
  }
  return repoAppendVersion(id, { lifecycleState: LIFECYCLE_STATE.CANDIDATE });
}

export function submitOverrideForReview(id) {
  const from = currentState(id);
  if (!canSubmitOverrideForReview(from)) {
    return failure('ILLEGAL_TRANSITION', `Cannot submit override "${id}" for review from state "${from}".`);
  }
  return repoAppendVersion(id, { lifecycleState: LIFECYCLE_STATE.PENDING_REVIEW });
}

export function approveOverride(id, reviewDecision) {
  const from = currentState(id);
  if (!isValidReviewDecision({ ...reviewDecision, toState: LIFECYCLE_STATE.APPROVED }, from)) {
    return failure('INVALID_REVIEW_DECISION', 'approveOverride: requires a valid ReviewDecision with preferenceRationale.');
  }
  return repoAppendVersion(id, {
    lifecycleState: LIFECYCLE_STATE.APPROVED,
    approvedBy: reviewDecision.approverId,
    approvedAt: reviewDecision.decidedAt,
    preferenceRationale: reviewDecision.preferenceRationale,
  });
}

/** Sends a Pending Review override back to Candidate. */
export function rejectOverride(id, reviewDecision) {
  const from = currentState(id);
  if (!isValidReviewDecision({ ...reviewDecision, toState: LIFECYCLE_STATE.CANDIDATE }, from)) {
    return failure('INVALID_REVIEW_DECISION', 'rejectOverride: requires a valid ReviewDecision.');
  }
  return repoAppendVersion(id, { lifecycleState: LIFECYCLE_STATE.CANDIDATE });
}

/** Approves a prior version as current — mirrors memory-repository.js#rollback exactly. */
export function rollbackOverride(id, toVersion, reviewDecision) {
  const current = repoGetById(id);
  if (!current.ok) return failure('NOT_FOUND', current.error.message);
  const target = repoGetVersion(id, toVersion);
  if (!target.ok) return failure('NOT_FOUND', target.error.message);
  if (!isValidReviewDecision({ ...reviewDecision, toState: LIFECYCLE_STATE.APPROVED }, current.data.lifecycleState)) {
    return failure('INVALID_REVIEW_DECISION', 'rollbackOverride: requires a valid ReviewDecision approving the prior version.');
  }
  return repoAppendVersion(id, {
    key: target.data.key, action: target.data.action, payload: target.data.payload,
    lifecycleState: LIFECYCLE_STATE.APPROVED,
    approvedBy: reviewDecision.approverId,
    approvedAt: reviewDecision.decidedAt,
    preferenceRationale: reviewDecision.preferenceRationale,
  });
}

export function getOverride(id) { return repoGetById(id); }
export function listOverrides(filter = {}) { return repoList(filter); }
export function getOverrideHistory(id) { return repoGetHistory(id); }
