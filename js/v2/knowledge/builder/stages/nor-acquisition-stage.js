/* ============================================================
   NOR-ACQUISITION-STAGE.JS — Knowledge Builder Stage (V2, Phase 9)

   PURPOSE: wrap acquisition-engine.runAcquisition('nor', ...) as a real
   Builder Stage (contracts/pipeline-contract.js) — this is what makes
   knowledge-builder.js's existing runIncremental()/runFull() entry points
   actually acquire NOR knowledge, with zero edits to either of those
   functions (they already build a pipeline from whatever's registered in
   stage-registry.js).

   RESPONSIBILITY: read the `nor` watermark out of the incoming
   BuilderContext (full runs ignore it), call runAcquisition, and translate
   its KnowledgeAcquisitionResult into a StageResult.

   DEPENDENCIES: acquisition/acquisition-engine.js,
   connectors/nor-connector.js (imported here for its self-registration
   side effect — see that file's header for why it isn't eagerly loaded by
   connector-registry.js itself), builder/contracts/pipeline-contract.js.

   NON-GOALS: this is the ONLY stage registered for V2.0.2 — the 11
   inactive placeholder connectors intentionally get no stage (see
   stage-registry.js's bootstrap in stages/index.js), because
   builder-orchestrator.runPipeline stops the whole run on the first stage
   failure and every placeholder's fetch() always fails.
   ============================================================ */

'use strict';

import '../../connectors/nor-connector.js';
import { runAcquisition } from '../../acquisition/acquisition-engine.js';
import { stageSuccess, stageFailure, STAGE_ERRORS } from '../contracts/pipeline-contract.js';
import { NOR_CONNECTOR_ID } from '../../connectors/nor-connector.js';

export const NOR_ACQUISITION_STAGE_ID = 'acquire-nor';
export const NOR_ACQUISITION_STAGE_VERSION = 'nor-acquisition-stage@1';

function watermarkFor(context) {
  const watermarks = (context && Array.isArray(context.watermarks)) ? context.watermarks : [];
  const match = watermarks.find((w) => w.connectorId === NOR_CONNECTOR_ID);
  return match ? match.lastIndexedAt : null;
}

function run(context) {
  const since = (context && context.mode === 'full') ? null : watermarkFor(context);
  const { result } = runAcquisition(NOR_CONNECTOR_ID, { since });

  if (!result.ok) {
    const message = result.errors[0] ? result.errors[0].message : 'NOR acquisition failed.';
    return stageFailure(STAGE_ERRORS.STAGE_FAILED, message, { stageId: NOR_ACQUISITION_STAGE_ID });
  }
  return stageSuccess(result.itemsWritten, { stageId: NOR_ACQUISITION_STAGE_ID });
}

export const norAcquisitionStage = Object.freeze({
  id: NOR_ACQUISITION_STAGE_ID,
  version: NOR_ACQUISITION_STAGE_VERSION,
  description: "Acquires Draft Knowledge from the NOR connector and writes it to the repository (wraps acquisition-engine.runAcquisition('nor', ...)).",
  run,
});

export default norAcquisitionStage;
