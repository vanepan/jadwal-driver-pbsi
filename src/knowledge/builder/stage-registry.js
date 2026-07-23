/* ============================================================
   STAGE-REGISTRY.JS — Knowledge Builder Foundation (V2, Phase 4)

   PURPOSE: the single process-wide directory of Builder stages, mirroring
   knowledge/registry/connector-registry.js and the underlying provider
   pattern (js/prediction/prediction-provider.js).

   RESPONSIBILITY: register/get/list stages against the Stage contract
   (contracts/pipeline-contract.js).

   DEPENDENCIES: knowledge/builder/contracts/pipeline-contract.js.

   NON-GOALS: zero real stages are registered in Phase 4 — no connector
   exists yet for a "fetch from connector X" stage to wrap.

   FUTURE EVOLUTION: Phase 4+ stages (fetch, validate, hand-off-to-repository)
   call registerStage() at their own module load time, same pattern as
   knowledge/registry/connector-registry.js.
   ============================================================ */

'use strict';

import { isStage } from './contracts/pipeline-contract.js';

export const STAGE_REGISTRY_ERRORS = Object.freeze({
  INVALID_STAGE: 'INVALID_STAGE',
});

/** @type {Map<string, object>} */
const _stages = new Map();

export function registerStage(stage) {
  if (!isStage(stage)) {
    const err = new Error('registerStage: stage must satisfy { id, version, description, run(context) }.');
    err.code = STAGE_REGISTRY_ERRORS.INVALID_STAGE;
    throw err;
  }
  _stages.set(stage.id, stage);
  return stage;
}

export function getStage(id) {
  return _stages.get(id) || null;
}

export function hasStage(id) {
  return _stages.has(id);
}

export function listStages() {
  return Object.freeze([..._stages.values()].map((s) => Object.freeze({
    id: s.id, version: s.version, description: s.description || null,
  })));
}

/** Test/teardown helper. Not used by any runtime path. */
export function resetStageRegistry() {
  _stages.clear();
}
