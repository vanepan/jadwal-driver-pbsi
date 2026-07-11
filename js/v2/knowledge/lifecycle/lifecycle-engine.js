/* ============================================================
   LIFECYCLE-ENGINE.JS — Knowledge Platform (V2, Phase 5)

   PURPOSE: the single guarded mutator for moving a KnowledgeItem between
   lifecycle states, mirroring js/engineering/engines/assignment-engine.js's
   "guarded-transition-only mutation" convention — no caller may set
   `lifecycleState` directly.

   RESPONSIBILITY: validate a requested transition against the lifecycle
   graph (contracts/lifecycle-contract.js), then delegate the actual append
   to knowledge-repository.js's `appendVersion()`. Now wired for real
   (Phase 5 gave the repository a real, if default-Null, backend) — a
   caller with NullRepository active gets NO_BACKEND_CONFIGURED; a caller
   with MemoryRepository active gets a genuine, versioned transition.

   DEPENDENCIES: knowledge/contracts/lifecycle-contract.js,
   knowledge/repository/knowledge-repository.js,
   knowledge/lifecycle/contracts/event-contract.js (Phase 9.1).

   NON-GOALS: does not decide WHO may request a transition into a
   human-gated state (Approved) — that is knowledge/review/
   review-workflow-engine.js's job (it passes `viaReviewDecision: true`).

   FUTURE EVOLUTION: unchanged as a real (e.g. Firebase-backed) repository
   replaces Memory — this engine only ever talks to the active repository
   through the facade.
   ============================================================ */

'use strict';

import { canTransition, isHumanGated, LIFECYCLE_STATE } from '../contracts/lifecycle-contract.js';
import { appendVersion } from '../repository/knowledge-repository.js';
import { makeLifecycleEvent } from './contracts/event-contract.js';

export const LIFECYCLE_ENGINE_ERRORS = Object.freeze({
  ILLEGAL_TRANSITION: 'ILLEGAL_TRANSITION',
  HUMAN_GATE_REQUIRED: 'HUMAN_GATE_REQUIRED',
});

/** @type {Function[]} */
const _listeners = [];

/** Phase 9.1 — Lifecycle Events, mirroring repository/knowledge-repository.js's
 *  own listener registry (and, further back, V1's petty-cash-store.js
 *  registerChangeListener() precedent). */
export function registerLifecycleListener(cb) {
  if (typeof cb === 'function') _listeners.push(cb);
}

export function unregisterLifecycleListener(cb) {
  const i = _listeners.indexOf(cb);
  if (i !== -1) _listeners.splice(i, 1);
}

/**
 * Validate (but do not perform) a requested transition.
 * @param {string} fromState
 * @param {string} toState
 * @param {{viaReviewDecision?: boolean}} [opts]
 * @returns {{ok: boolean, error: {code: string, message: string}|null}}
 */
export function validateTransition(fromState, toState, opts = {}) {
  if (!canTransition(fromState, toState)) {
    return Object.freeze({
      ok: false,
      error: Object.freeze({ code: LIFECYCLE_ENGINE_ERRORS.ILLEGAL_TRANSITION, message: `${fromState} -> ${toState} is not a legal transition.` }),
    });
  }
  if (isHumanGated(toState) && !opts.viaReviewDecision) {
    return Object.freeze({
      ok: false,
      error: Object.freeze({ code: LIFECYCLE_ENGINE_ERRORS.HUMAN_GATE_REQUIRED, message: `${toState} requires an explicit ReviewDecision (Decision 6) — it cannot be entered directly.` }),
    });
  }
  return Object.freeze({ ok: true, error: null });
}

/**
 * Validates, then performs, a transition by appending a new version through
 * the active repository. Returns the repository's RepositoryResult when
 * validation passes; a locally-shaped `{ok:false, error}` when it doesn't
 * (so a caller need not distinguish "validation failed" from "repository
 * failed" — both arrive as `{ok:false, error:{code,message}}`).
 * @param {string} id
 * @param {string} fromState
 * @param {string} toState
 * @param {object} [extraPatch] - additional fields to merge (e.g. approvedBy on an Approved transition)
 * @param {{viaReviewDecision?: boolean}} [opts]
 */
export function requestTransition(id, fromState, toState, extraPatch = {}, opts = {}) {
  const validation = validateTransition(fromState, toState, opts);
  if (!validation.ok) return validation;
  const result = appendVersion(id, { ...extraPatch, lifecycleState: toState });
  if (result.ok) {
    const event = makeLifecycleEvent({ id, fromState, toState, viaReviewDecision: !!opts.viaReviewDecision });
    for (const cb of _listeners) cb(event);
  }
  return result;
}

export { LIFECYCLE_STATE };
export { LIFECYCLE_EVENT_TYPE } from './contracts/event-contract.js';
