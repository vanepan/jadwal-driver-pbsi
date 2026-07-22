/* ============================================================
   DOCUMENT-INTELLIGENCE-ENGINE.JS — Document Intelligence Runtime (V2.0.6, Phase 9.5)

   PURPOSE: run a DocumentPipeline (analyze -> draft -> validate -> explain
   -> recommend) for real — Phase 7 kept this a locked stub deliberately
   ("architecture-only"); this is the "Phase 8+ ... if a working
   orchestrator is wanted, reuse knowledge/builder/builder-orchestrator.js's
   sequencing pattern" the stub's own header pointed at. The loop below IS
   that pattern, adapted from stage ids to `${domainType}:${step}` lookups
   (registry/step-registry.js) and reusing knowledge/builder/contracts/
   state-contract.js's BUILDER_EVENT_TYPE/makeBuilderEvent verbatim — the
   shape (started/stage_started/stage_completed/stage_failed/completed/
   failed) is identical for a document step as for a builder stage, so
   this is genuine reuse, not a near-clone contract.

   RESPONSIBILITY: `runPipeline(pipeline, context)` — resolve each step
   against step-registry.js, run it in order, stop on the first failure,
   accumulate `context.results[step]`.

   DEPENDENCIES: registry/step-registry.js,
   knowledge/builder/contracts/state-contract.js (event shape reuse).

   NON-GOALS: does not decide what a step DOES — nor/*.js supplies the
   real handlers. Does not persist anything itself. Never generates,
   renders, or replaces the existing NOR/Document Engine — a `draft` step
   proposes FIELD VALUES only (see nor/nor-generator.js).
   ============================================================ */

'use strict';

import { getStep } from './registry/step-registry.js';
import { BUILDER_EVENT_TYPE, makeBuilderEvent } from '../../js/v2/knowledge/builder/contracts/state-contract.js';

export const DOCUMENT_INTELLIGENCE_ERRORS = Object.freeze({
  STEP_NOT_FOUND: 'STEP_NOT_FOUND',
  STEP_FAILED: 'STEP_FAILED',
});

function emit(context, event) {
  if (context && typeof context.onEvent === 'function') context.onEvent(event);
}

/**
 * @typedef {Object} DocumentPipelineRunResult
 * @property {boolean} ok
 * @property {number} stepsCompleted
 * @property {Object<string, object>} results - keyed by step name
 * @property {{code: string, message: string, step: string|null}|null} error
 */

/**
 * @param {import('./contracts/document-pipeline-contract.js').DocumentPipeline} pipeline
 * @param {{pipelineId?: string, input?: object, onEvent?: Function}} [context]
 * @returns {DocumentPipelineRunResult}
 */
export function runPipeline(pipeline, context = {}) {
  const pipelineId = context.pipelineId || pipeline.id;
  const results = {};
  let stepsCompleted = 0;

  emit(context, makeBuilderEvent(BUILDER_EVENT_TYPE.STARTED, { runId: pipelineId }));

  for (const step of pipeline.steps) {
    const handler = getStep(pipeline.domainType, step);
    if (!handler) {
      const error = { code: DOCUMENT_INTELLIGENCE_ERRORS.STEP_NOT_FOUND, message: `No handler registered for "${pipeline.domainType}:${step}".`, step };
      emit(context, makeBuilderEvent(BUILDER_EVENT_TYPE.STAGE_FAILED, { runId: pipelineId, stageId: step, detail: error }));
      emit(context, makeBuilderEvent(BUILDER_EVENT_TYPE.FAILED, { runId: pipelineId, detail: error }));
      return Object.freeze({ ok: false, stepsCompleted, results: Object.freeze(results), error: Object.freeze(error) });
    }

    emit(context, makeBuilderEvent(BUILDER_EVENT_TYPE.STAGE_STARTED, { runId: pipelineId, stageId: step }));
    const stepResult = handler({ ...context, input: context.input, results });

    if (!stepResult || !stepResult.ok) {
      const error = (stepResult && stepResult.error) || { code: DOCUMENT_INTELLIGENCE_ERRORS.STEP_FAILED, message: `Step "${step}" failed.`, step };
      emit(context, makeBuilderEvent(BUILDER_EVENT_TYPE.STAGE_FAILED, { runId: pipelineId, stageId: step, detail: error }));
      emit(context, makeBuilderEvent(BUILDER_EVENT_TYPE.FAILED, { runId: pipelineId, detail: error }));
      return Object.freeze({ ok: false, stepsCompleted, results: Object.freeze(results), error: Object.freeze(error) });
    }

    results[step] = stepResult.output;
    stepsCompleted += 1;
    emit(context, makeBuilderEvent(BUILDER_EVENT_TYPE.STAGE_COMPLETED, { runId: pipelineId, stageId: step, detail: stepResult.output }));
  }

  emit(context, makeBuilderEvent(BUILDER_EVENT_TYPE.COMPLETED, { runId: pipelineId, detail: { stepsCompleted } }));
  return Object.freeze({ ok: true, stepsCompleted, results: Object.freeze(results), error: null });
}
