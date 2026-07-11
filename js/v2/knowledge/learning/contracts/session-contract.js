/* ============================================================
   SESSION-CONTRACT.JS — Teach Once, Learn Forever (V2.0.5, Phase 9.4)

   PURPOSE: fix the shape of one Learning Session — mirrors
   acquisition/contracts/session-contract.js and
   review/contracts/session-contract.js's identical start/complete shape,
   applied to a run of the Correction Pipeline instead of a connector or a
   reviewer's sitting. Same pattern, reused a third time, not reinvented.

   RESPONSIBILITY: define LearningSession and constructors.

   DEPENDENCIES: none.
   ============================================================ */

'use strict';

export const LEARNING_SESSION_SCHEMA = 'knowledge-learning-session@1';

export const LEARNING_SESSION_STATUS = Object.freeze({
  OPEN: 'open',
  COMPLETED: 'completed',
});

/**
 * @typedef {Object} LearningSession
 * @property {string} sessionId
 * @property {string} correctedBy
 * @property {string} startedAt
 * @property {string|null} completedAt
 * @property {string} status
 * @property {string[]} itemIds - items touched (updated or newly generated) during this session
 */

let _counter = 0;

export function startLearningSession(correctedBy) {
  _counter += 1;
  return Object.freeze({
    sessionId: `learning-session:${correctedBy}:${Date.now()}:${_counter}`,
    correctedBy,
    startedAt: new Date().toISOString(),
    completedAt: null,
    status: LEARNING_SESSION_STATUS.OPEN,
    itemIds: Object.freeze([]),
  });
}

export function appendLearningItem(session, itemId) {
  return Object.freeze({ ...session, itemIds: Object.freeze([...session.itemIds, itemId]) });
}

export function completeLearningSession(session) {
  return Object.freeze({ ...session, completedAt: new Date().toISOString(), status: LEARNING_SESSION_STATUS.COMPLETED });
}
