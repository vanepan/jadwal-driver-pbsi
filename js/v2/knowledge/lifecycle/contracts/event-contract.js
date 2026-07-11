/* ============================================================
   EVENT-CONTRACT.JS — Knowledge Lifecycle Observability (V2, Phase 9.1)

   PURPOSE: fix the shape of a BUSINESS-meaning transition — "item X moved
   from candidate to approved" — distinct from repository/contracts/
   event-contract.js's RepositoryEvent (storage mechanics only). Every
   LifecycleEvent corresponds to exactly one successful `appendVersion()`
   call, but not every `appendVersion()` call is a lifecycle transition
   (e.g. re-acquiring unchanged content keeps the same lifecycleState).

   RESPONSIBILITY: define LIFECYCLE_EVENT_TYPE and LifecycleEvent.

   DEPENDENCIES: none.

   NON-GOALS: does not emit anything — see lifecycle-engine.js's
   `requestTransition()`, the ONE guarded mutator every transition (direct
   or via review-workflow-engine.js) already funnels through.
   ============================================================ */

'use strict';

export const LIFECYCLE_EVENT_TYPE = Object.freeze({
  TRANSITIONED: 'transitioned',
});

/**
 * @typedef {Object} LifecycleEvent
 * @property {string} type      - one of LIFECYCLE_EVENT_TYPE
 * @property {string} id
 * @property {string} fromState
 * @property {string} toState
 * @property {boolean} viaReviewDecision
 * @property {string} at        - ISO 8601
 */

export function makeLifecycleEvent({ id, fromState, toState, viaReviewDecision = false }) {
  return Object.freeze({
    type: LIFECYCLE_EVENT_TYPE.TRANSITIONED,
    id, fromState, toState, viaReviewDecision,
    at: new Date().toISOString(),
  });
}
