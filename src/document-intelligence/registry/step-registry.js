/* ============================================================
   STEP-REGISTRY.JS — Document Intelligence Runtime (V2.0.6, Phase 9.5)

   PURPOSE: the process-wide directory of DocumentPipeline step handlers,
   keyed by `${domainType}:${step}` — mirrors
   knowledge/builder/stage-registry.js exactly (same Map-backed
   register/get/list/reset shape), the pattern this file's own
   document-pipeline-contract.js header explicitly pointed at ("if a
   working orchestrator is wanted, it can reuse
   knowledge/builder/builder-orchestrator.js's sequencing pattern").

   RESPONSIBILITY: register/get/list step handlers against
   contracts/document-pipeline-contract.js's DOCUMENT_PIPELINE_STEP.

   DEPENDENCIES: contracts/document-pipeline-contract.js.

   NON-GOALS: zero real handlers registered here — domain pilots (nor/)
   register their own steps at their own module load time, exactly like
   knowledge/connectors/nor-connector.js self-registers.
   ============================================================ */

'use strict';

import { DOCUMENT_PIPELINE_STEP } from '../contracts/document-pipeline-contract.js';

export const STEP_REGISTRY_ERRORS = Object.freeze({
  INVALID_STEP_ID: 'INVALID_STEP_ID',
  INVALID_HANDLER: 'INVALID_HANDLER',
});

/** @type {Map<string, {domainType: string, step: string, handler: Function}>} */
const _steps = new Map();

function key(domainType, step) { return `${domainType}:${step}`; }

/**
 * @param {string} domainType
 * @param {string} step   - one of DOCUMENT_PIPELINE_STEP
 * @param {(context: object) => object} handler
 */
export function registerStep(domainType, step, handler) {
  if (!Object.values(DOCUMENT_PIPELINE_STEP).includes(step)) {
    const err = new Error(`registerStep: "${step}" is not a valid DOCUMENT_PIPELINE_STEP.`);
    err.code = STEP_REGISTRY_ERRORS.INVALID_STEP_ID;
    throw err;
  }
  if (typeof handler !== 'function') {
    const err = new Error('registerStep: handler must be a function.');
    err.code = STEP_REGISTRY_ERRORS.INVALID_HANDLER;
    throw err;
  }
  _steps.set(key(domainType, step), { domainType, step, handler });
}

export function getStep(domainType, step) {
  const entry = _steps.get(key(domainType, step));
  return entry ? entry.handler : null;
}

export function hasStep(domainType, step) {
  return _steps.has(key(domainType, step));
}

export function listSteps(domainType = null) {
  return Object.freeze([..._steps.values()]
    .filter((e) => !domainType || e.domainType === domainType)
    .map((e) => Object.freeze({ domainType: e.domainType, step: e.step })));
}

/** Test/teardown helper. Not used by any runtime path. */
export function resetStepRegistry() {
  _steps.clear();
}
