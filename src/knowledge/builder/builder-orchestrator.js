/* ============================================================
   BUILDER-ORCHESTRATOR.JS — Knowledge Builder Foundation (V2, Phase 4)

   PURPOSE: the ONE real piece of control-flow in the Builder — sequencing a
   Pipeline's stages, honoring cancellation, driving the BUILDER_STATE
   machine, and emitting BuilderEvents. This is genuinely implemented (not a
   NOT_IMPLEMENTED stub) because orchestration-with-zero-registered-stages
   is a true, honestly-reportable outcome ("ran 0 stages, processed 0
   items") — not a placeholder success. What is NOT implemented is any
   STAGE (no connector exists yet to wrap), so any pipeline naming a real
   stage id will correctly fail with STAGE_NOT_FOUND.

   RESPONSIBILITY: `runPipeline(pipeline, context)` — resolve each stage id
   against stage-registry.js, run it in order, stop on cancellation or
   failure, and return a real BuilderRunResult.

   DEPENDENCIES: knowledge/builder/stage-registry.js,
   knowledge/builder/contracts/{pipeline,context,state,error}-contract.js.

   NON-GOALS: does not decide WHAT stages a run should include (that is
   knowledge-builder.js's `runIncremental`/`runFull`, which build a Pipeline
   from the connector registry). Does not retry a failed stage. Does not
   persist anything itself — a stage that hands data to the repository
   does so inside its own `run()`, once such a stage exists.

   FUTURE EVOLUTION: Phase 4+ stages get registered; this orchestrator's
   loop does not need to change to run them.
   ============================================================ */

'use strict';

import { getStage } from './stage-registry.js';
import { BUILDER_ERRORS, makeBuilderError } from './contracts/error-contract.js';
import { BUILDER_STATE, BUILDER_EVENT_TYPE, makeBuilderEvent } from './contracts/state-contract.js';

/**
 * @typedef {Object} BuilderRunResult
 * @property {boolean} ok
 * @property {string} state          - one of BUILDER_STATE (terminal: completed/failed/cancelled)
 * @property {number} stagesCompleted
 * @property {number} itemsProcessed
 * @property {import('./contracts/error-contract.js').BuilderError|null} error
 */

function emit(context, event) {
  if (context && typeof context.onEvent === 'function') context.onEvent(event);
}

/**
 * @param {import('./contracts/pipeline-contract.js').Pipeline} pipeline
 * @param {import('./contracts/context-contract.js').BuilderContext} context
 * @returns {BuilderRunResult}
 */
export function runPipeline(pipeline, context) {
  const runId = context && context.runId;
  let state = BUILDER_STATE.IDLE;
  let stagesCompleted = 0;
  let itemsProcessed = 0;

  state = BUILDER_STATE.RUNNING;
  emit(context, makeBuilderEvent(BUILDER_EVENT_TYPE.STARTED, { runId }));

  const stageIds = (pipeline && Array.isArray(pipeline.stageIds)) ? pipeline.stageIds : [];

  for (const stageId of stageIds) {
    if (context && context.cancellationToken && context.cancellationToken.isCancelled()) {
      state = BUILDER_STATE.CANCELLED;
      emit(context, makeBuilderEvent(BUILDER_EVENT_TYPE.CANCELLED, { runId, stageId }));
      return Object.freeze({
        ok: false, state, stagesCompleted, itemsProcessed,
        error: makeBuilderError(BUILDER_ERRORS.CANCELLED, 'Run was cancelled before completion.', stageId),
      });
    }

    const stage = getStage(stageId);
    if (!stage) {
      state = BUILDER_STATE.FAILED;
      const error = makeBuilderError('STAGE_NOT_FOUND', `No stage registered under "${stageId}".`, stageId);
      emit(context, makeBuilderEvent(BUILDER_EVENT_TYPE.STAGE_FAILED, { runId, stageId, detail: error }));
      emit(context, makeBuilderEvent(BUILDER_EVENT_TYPE.FAILED, { runId, detail: error }));
      return Object.freeze({ ok: false, state, stagesCompleted, itemsProcessed, error });
    }

    emit(context, makeBuilderEvent(BUILDER_EVENT_TYPE.STAGE_STARTED, { runId, stageId }));
    const result = stage.run(context);

    if (!result || !result.ok) {
      state = BUILDER_STATE.FAILED;
      const error = (result && result.error) || makeBuilderError(BUILDER_ERRORS.STAGE_FAILED, `Stage "${stageId}" failed.`, stageId);
      emit(context, makeBuilderEvent(BUILDER_EVENT_TYPE.STAGE_FAILED, { runId, stageId, detail: error }));
      emit(context, makeBuilderEvent(BUILDER_EVENT_TYPE.FAILED, { runId, detail: error }));
      return Object.freeze({ ok: false, state, stagesCompleted, itemsProcessed, error });
    }

    itemsProcessed += result.itemsProcessed || 0;
    stagesCompleted += 1;
    emit(context, makeBuilderEvent(BUILDER_EVENT_TYPE.STAGE_COMPLETED, { runId, stageId, detail: result }));
  }

  state = BUILDER_STATE.COMPLETED;
  emit(context, makeBuilderEvent(BUILDER_EVENT_TYPE.COMPLETED, { runId, detail: { stagesCompleted, itemsProcessed } }));
  return Object.freeze({ ok: true, state, stagesCompleted, itemsProcessed, error: null });
}
