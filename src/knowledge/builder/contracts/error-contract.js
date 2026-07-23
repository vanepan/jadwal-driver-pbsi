/* ============================================================
   ERROR-CONTRACT.JS — Knowledge Builder Foundation (V2, Phase 4)

   PURPOSE: fix how a Builder run fails, recovers, and is cancelled — three
   related but distinct concerns the master prompt calls out separately.

   RESPONSIBILITY:
   - BuilderError: closed error-code set + shape for a failed run/stage.
   - Recovery: the shape of "resume from where this run left off" (a
     partial watermark set) — a CONTRACT for resumability, not a resumer.
   - Cancellation: a CancellationToken the orchestrator polls between
     stages, and a small real (not stubbed) `createCancellationToken()`
     helper — this is plumbing, not business logic, so it is implemented
     for real rather than left NOT_IMPLEMENTED.

   DEPENDENCIES: none.

   NON-GOALS: does not implement retry policy or backoff — Phase 4 defines
   the shape of a failure and a recovery point, not a retry engine.

   FUTURE EVOLUTION: Phase 4+ decides an actual retry/backoff policy on top
   of this contract; the shape here should not need to change.
   ============================================================ */

'use strict';

export const BUILDER_ERRORS = Object.freeze({
  STAGE_FAILED: 'STAGE_FAILED',
  CANCELLED: 'CANCELLED',
  NOT_IMPLEMENTED: 'NOT_IMPLEMENTED',
});

/**
 * @typedef {Object} BuilderError
 * @property {string} code
 * @property {string} message
 * @property {string|null} stageId - which stage failed, if any
 */

export function makeBuilderError(code, message, stageId = null) {
  return Object.freeze({ code, message, stageId });
}

/**
 * A Recovery point is simply "the watermarks as of the last successfully
 * completed stage" — resuming a failed run means re-invoking the Builder
 * with these watermarks instead of the pre-run ones.
 * @typedef {Object} RecoveryPoint
 * @property {string} runId
 * @property {import('./context-contract.js').IndexWatermark[]} watermarks
 * @property {string} capturedAt - ISO 8601
 */

export function makeRecoveryPoint(runId, watermarks) {
  return Object.freeze({ runId, watermarks: Object.freeze([...watermarks]), capturedAt: new Date().toISOString() });
}

/**
 * @typedef {Object} CancellationToken
 * @property {() => boolean} isCancelled
 * @property {() => void} cancel
 */

/** A real (not stubbed) in-memory cancellation token — plumbing, not
 *  business logic, mirroring how a real AbortController would be used. */
export function createCancellationToken() {
  let cancelled = false;
  return Object.freeze({
    isCancelled: () => cancelled,
    cancel: () => { cancelled = true; },
  });
}
