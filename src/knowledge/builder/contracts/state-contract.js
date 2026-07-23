/* ============================================================
   STATE-CONTRACT.JS — Knowledge Builder Foundation (V2, Phase 4)

   PURPOSE: fix the Builder's own run-state machine — distinct from, and
   much simpler than, the Knowledge lifecycle (contracts/lifecycle-contract.js).
   A Builder run is idle/running/completed/failed/cancelled; the ITEMS it
   produces separately carry their own Draft→...→Approved lifecycle.

   RESPONSIBILITY: define BUILDER_STATE, the transition graph, Progress, and
   BuilderEvent shapes.

   DEPENDENCIES: none.

   NON-GOALS: does not run anything — see builder-orchestrator.js for the
   (Phase 4, now real) state-transition driver.

   FUTURE EVOLUTION: none expected — this is a small, closed state machine
   for a build run, not expected to grow new states.
   ============================================================ */

'use strict';

export const BUILDER_STATE = Object.freeze({
  IDLE: 'idle',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
});

/** Legal single-step moves for a builder run — mirrors the
 *  canTransition() pattern from contracts/lifecycle-contract.js, scoped to
 *  this much smaller graph. */
export const BUILDER_STATE_GRAPH = Object.freeze({
  [BUILDER_STATE.IDLE]: Object.freeze([BUILDER_STATE.RUNNING]),
  [BUILDER_STATE.RUNNING]: Object.freeze([BUILDER_STATE.COMPLETED, BUILDER_STATE.FAILED, BUILDER_STATE.CANCELLED]),
  [BUILDER_STATE.COMPLETED]: Object.freeze([]),
  [BUILDER_STATE.FAILED]: Object.freeze([]),
  [BUILDER_STATE.CANCELLED]: Object.freeze([]),
});

export function canTransitionBuilderState(from, to) {
  const reachable = BUILDER_STATE_GRAPH[from];
  return Array.isArray(reachable) && reachable.includes(to);
}

/**
 * @typedef {Object} Progress
 * @property {number} stagesTotal
 * @property {number} stagesCompleted
 * @property {number} itemsProcessed
 */

/** Closed set of event types a running builder may emit via BuilderContext.onEvent. */
export const BUILDER_EVENT_TYPE = Object.freeze({
  STARTED: 'started',
  STAGE_STARTED: 'stage_started',
  STAGE_COMPLETED: 'stage_completed',
  STAGE_FAILED: 'stage_failed',
  CANCELLED: 'cancelled',
  COMPLETED: 'completed',
  FAILED: 'failed',
});

/**
 * @typedef {Object} BuilderEvent
 * @property {string} type       - one of BUILDER_EVENT_TYPE
 * @property {string} runId
 * @property {string|null} stageId
 * @property {string} at         - ISO 8601
 * @property {*} [detail]
 */

export function makeBuilderEvent(type, { runId, stageId = null, detail } = {}) {
  return Object.freeze({
    type,
    runId: runId ?? null,
    stageId,
    at: new Date().toISOString(),
    detail: detail ?? null,
  });
}
