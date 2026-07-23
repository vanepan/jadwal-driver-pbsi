/* ============================================================
   EVENT-CONTRACT.JS — Teach Once, Learn Forever Observability (V2.0.5, Phase 9.4)

   PURPOSE: fix the shape of Correction Pipeline events, mirroring every
   other subsystem's onEvent idiom in this tree (acquisition, repository,
   lifecycle, review, promotion) for end-to-end observability parity.

   RESPONSIBILITY: define LEARNING_EVENT_TYPE and LearningEvent.

   DEPENDENCIES: none.
   ============================================================ */

'use strict';

export const LEARNING_EVENT_TYPE = Object.freeze({
  SESSION_STARTED: 'session_started',
  CORRECTION_APPLIED: 'correction_applied',
  CANDIDATE_GENERATED: 'candidate_generated',
  SESSION_COMPLETED: 'session_completed',
});

/**
 * @typedef {Object} LearningEvent
 * @property {string} type
 * @property {string} sessionId
 * @property {string} at
 * @property {*} [detail]
 */

export function makeLearningEvent(type, { sessionId, detail } = {}) {
  return Object.freeze({ type, sessionId: sessionId ?? null, at: new Date().toISOString(), detail: detail ?? null });
}
