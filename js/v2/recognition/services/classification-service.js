/* ============================================================
   CLASSIFICATION-SERVICE.JS — Autonomous Classification (Phase 12.7.2)

   PURPOSE: thin orchestration between the pure
   classification-suggestion-engine.js and recognition-service.js's ONE
   write owner — mirrors body/services/entity-graph-service.js's /
   entity-health-service.js's own "thin delegation" role exactly (compute
   via a pure engine, persist via the one service that owns writes,
   nothing else).

   Only ever persists a REAL suggestion (CLASSIFICATION_OUTCOME.SUGGESTED)
   — an honest abstention is never written as a low-confidence record;
   "we don't know yet" is not itself a fact worth persisting, the same
   restraint reasoning-engine.js's own NO_APPLICABLE_KNOWLEDGE path takes
   (nothing is written when there is nothing to say).

   RESPONSIBILITY: recordClassification(scope, signals, opts).

   DEPENDENCIES: ../classification/classification-suggestion-engine.js,
   ./recognition-service.js, ../contracts/{recognition-record,
   recognition-scope}-contract.js.

   NON-GOALS: does not assemble ClassificationSignals itself (a future,
   separately-wired caller's job — see classification-suggestion-
   engine.js's header).
   ============================================================ */

'use strict';

import { suggestClassification, CLASSIFICATION_OUTCOME } from '../classification/classification-suggestion-engine.js';
import { recordObservation, makeRecognitionRecordId } from './recognition-service.js';
import { RECORD_TYPE } from '../contracts/recognition-record-contract.js';
import { scopeKey } from '../contracts/recognition-scope-contract.js';

/**
 * @param {import('../contracts/recognition-scope-contract.js').RecognitionScope} scope
 * @param {import('../classification/classification-suggestion-engine.js').ClassificationSignal[]} signals
 * @param {{producerId?: string}} [opts]
 * @returns {{ok: boolean, data: object|null, error: object|null, op: 'create'|'append'|null, outcome: string}}
 */
export function recordClassification(scope, signals, { producerId = 'classification-suggestion-engine' } = {}) {
  const result = suggestClassification(signals);
  if (result.outcome !== CLASSIFICATION_OUTCOME.SUGGESTED) {
    return {
      ok: true, data: null, error: null, op: null, outcome: result.outcome,
    };
  }
  const now = new Date().toISOString();
  const id = makeRecognitionRecordId(RECORD_TYPE.CLASSIFICATION, scope);
  const candidate = Object.freeze({
    id,
    version: 1,
    recordType: RECORD_TYPE.CLASSIFICATION,
    scope,
    payload: result.suggestion,
    confidence: result.confidence,
    evidence: result.evidence,
    provenance: { producerId, computedAt: now },
    createdAt: now,
    updatedAt: now,
  });
  const written = recordObservation(candidate);
  return { ...written, outcome: result.outcome };
}

export { scopeKey };
