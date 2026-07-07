/* ============================================================
   VERIFICATION-ENGINE.JS — Engineering Operations Foundation
   (v1.20.0)

   Completion and Verification are SEPARATE concerns. A worker finishing an
   assignment does not certify it — it moves to WAITING_VERIFICATION. A verifier
   then either verifies it (→ VERIFIED, optionally → COMPLETED) or rejects it
   back to IN_PROGRESS. This engine owns that step and nothing else.

        Finished ──▶ Waiting Verification ──▶ Verified ──▶ Completed
                                   └────────▶ (reject) In Progress

   The verification record stores: verifier, timestamp, notes, and reserved
   slots for a future attachment and before/after photos. It is written onto
   the assignment's `verification` block and mirrored to `verifiedTime`.

   PURE: reuses the guarded transitionAssignment from the Assignment Engine, so
   verification can never move the assignment along an illegal edge. No DOM, no
   Firebase, no `window`.
   ============================================================ */

'use strict';

import { cleanString, nowISO } from '../utils/engineering-utils.js';
import { STATUS, VERIFICATION_STATUS } from '../config/engineering-config.js';
import { TIMELINE_EVENT, createTimelineEvent, recordEvents } from '../timeline/timeline-engine.js';
import { transitionAssignment, TransitionError } from './assignment-engine.js';

/**
 * @typedef {Object} VerificationRecord
 * @property {string}  verifierId
 * @property {string}  verifierName
 * @property {string}  verifiedTime   ISO
 * @property {string}  notes
 * @property {?Object} attachment     reserved: future attachment
 * @property {?Object} beforeAfter    reserved: future before/after photos
 */

/** Build a normalized verification record (reserved slots kept null). */
export function createVerificationRecord(verifier = {}, options = {}) {
  return {
    verifierId: cleanString(verifier.id || verifier.verifierId),
    verifierName: cleanString(verifier.name || verifier.verifierName),
    verifiedTime: nowISO(options.now),
    notes: cleanString(options.notes),
    attachment: null,    // reserved: future attachment
    beforeAfter: null,   // reserved: future before / after photos
  };
}

/**
 * WAITING_VERIFICATION → VERIFIED. Writes the verification record, stamps
 * verifiedTime, marks the participants' verificationStatus, and records a
 * VERIFIED timeline event.
 * @param {Object} assignment    must be in WAITING_VERIFICATION
 * @param {Object} verifier      { id, name }
 * @param {Object} [options]
 * @param {string} [options.notes]
 * @param {Date|number|string} [options.now]
 * @returns {Object} new assignment (VERIFIED)
 */
export function verifyAssignment(assignment, verifier = {}, options = {}) {
  // Guard the SOURCE state so a duplicate/concurrent verify (two coordinators at
  // once, or a retry) throws instead of appending a second VERIFIED event. Under
  // the transactional commit path this makes the loser abort as a clean no-op.
  if (!assignment || assignment.status !== STATUS.WAITING_VERIFICATION) {
    throw new TransitionError(assignment && assignment.status, `${STATUS.VERIFIED}(requires ${STATUS.WAITING_VERIFICATION})`);
  }
  const record = createVerificationRecord(verifier, options);
  const participants = (assignment.participants || []).map((p) => ({
    ...p, verificationStatus: VERIFICATION_STATUS.VERIFIED,
  }));
  return transitionAssignment(
    { ...assignment, participants, verification: record },
    STATUS.VERIFIED,
    {
      eventType: TIMELINE_EVENT.VERIFIED,
      actor: { id: record.verifierId, name: record.verifierName },
      metadata: { verifierId: record.verifierId },
      notes: record.notes,
      patch: { verifiedTime: record.verifiedTime },
      now: options.now,
    },
  );
}

/**
 * Reject a submission: WAITING_VERIFICATION → IN_PROGRESS. Marks participant
 * verificationStatus REJECTED and records the rejection (as a PAUSED event with
 * a rejection flag — the timeline never loses the reason).
 * @param {Object} assignment
 * @param {Object} verifier
 * @param {Object} [options]
 * @param {string} [options.reason]
 */
export function rejectVerification(assignment, verifier = {}, options = {}) {
  const participants = (assignment.participants || []).map((p) => ({
    ...p, verificationStatus: VERIFICATION_STATUS.REJECTED,
  }));
  const event = createTimelineEvent(TIMELINE_EVENT.PAUSED, {
    actor: { id: cleanString(verifier.id), name: cleanString(verifier.name) },
    metadata: { rejected: true, reason: cleanString(options.reason) },
    notes: options.notes,
    now: options.now,
  });
  const rejected = recordEvents({ ...assignment, participants }, event);
  return transitionAssignment(rejected, STATUS.IN_PROGRESS, { now: options.now });
}

/**
 * VERIFIED → COMPLETED. The final sign-off closing an assignment as done.
 * @param {Object} assignment    must be VERIFIED
 * @param {Object} [options]
 * @returns {Object} new assignment (COMPLETED)
 */
export function completeAssignment(assignment, options = {}) {
  return transitionAssignment(assignment, STATUS.COMPLETED, {
    eventType: TIMELINE_EVENT.VERIFIED,
    actor: options.actor,
    metadata: { completed: true },
    now: options.now,
  });
}

/** Whether an assignment is currently awaiting verification. */
export function isAwaitingVerification(assignment) {
  return !!assignment && assignment.status === STATUS.WAITING_VERIFICATION;
}

/** Whether an assignment has been verified (or completed). */
export function isVerified(assignment) {
  return !!assignment
    && (assignment.status === STATUS.VERIFIED || assignment.status === STATUS.COMPLETED);
}
