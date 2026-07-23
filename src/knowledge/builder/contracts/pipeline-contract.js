/* ============================================================
   PIPELINE-CONTRACT.JS — Knowledge Builder Foundation (V2, Phase 4)

   PURPOSE: fix the shape of a Builder "Stage" — the atomic unit the
   orchestrator sequences — deliberately mirroring the provider contract
   already proven in this codebase (js/prediction/prediction-provider.js:
   `{ id, version, predict(input, config) }` → here `{ id, version,
   run(context) }`), per the master prompt's explicit instruction to reuse
   provider patterns rather than invent a new one.

   RESPONSIBILITY: define the Stage and StageResult shapes, and Pipeline as
   an ordered list of stage ids. No stage is implemented here.

   DEPENDENCIES: knowledge/builder/contracts/context-contract.js (a Stage's
   `run` receives a BuilderContext).

   NON-GOALS: no extraction, parsing, or connector-invocation logic. A real
   Stage (Phase 4+) might wrap one connector's `fetch()` — that wrapping
   does not exist yet.

   FUTURE EVOLUTION: Phase 4+ real stages (e.g. "fetch from connector X",
   "validate against KnowledgeItem contract", "hand off to repository")
   register against knowledge/builder/stage-registry.js.
   ============================================================ */

'use strict';

export const PIPELINE_SCHEMA = 'knowledge-pipeline@1';

/** Closed set of stage result error codes. */
export const STAGE_ERRORS = Object.freeze({
  STAGE_FAILED: 'STAGE_FAILED',
  NOT_IMPLEMENTED: 'NOT_IMPLEMENTED',
});

/**
 * @typedef {Object} Stage
 * @property {string} id
 * @property {string} version
 * @property {string} description
 * @property {(context: import('./context-contract.js').BuilderContext) => StageResult} run
 */

/**
 * @typedef {Object} StageResult
 * @property {boolean} ok
 * @property {number} itemsProcessed
 * @property {{code: string, message: string}|null} error
 * @property {string} stageId
 */

/**
 * @typedef {Object} Pipeline
 * @property {string} id
 * @property {string[]} stageIds  - ordered; the orchestrator runs them in this sequence
 */

export function stageSuccess(itemsProcessed, { stageId } = {}) {
  return Object.freeze({ ok: true, itemsProcessed: itemsProcessed ?? 0, error: null, stageId: stageId ?? null });
}

export function stageFailure(code, message, { stageId } = {}) {
  return Object.freeze({
    ok: false,
    itemsProcessed: 0,
    error: Object.freeze({ code, message }),
    stageId: stageId ?? null,
  });
}

/** Structural check that an object satisfies the Stage contract. */
export function isStage(s) {
  return !!s && typeof s === 'object'
    && typeof s.id === 'string' && s.id.length > 0
    && typeof s.version === 'string' && s.version.length > 0
    && typeof s.run === 'function';
}
