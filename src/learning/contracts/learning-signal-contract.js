/* ============================================================
   LEARNING-SIGNAL-CONTRACT.JS — Universal Learning Engine (Phase 12.6.1)

   PURPOSE: fix the shape of the intake envelope every domain hands to
   services/learning-signal-service.js#emitLearningSignal() — this
   domain's equivalent of a ConnectorResult item or a SensorResult entity:
   EPHEMERAL, never persisted directly. The pipeline (Normalize->Validate->
   Merge->Dedup->Conflict->Confidence) operates on a LearningSignal; only
   its final Persist step produces a real, durable LearningEvent via the
   EXISTING, unmodified recordLearningEvent().

   A LearningSignal is NOT a LearningEvent with a different name — a
   LearningEvent additionally carries kind/state/version/supersession,
   decided by the pipeline (see learning-signal-service.js#resolveLearningKind),
   never supplied by the producer directly. The producer only says WHAT it
   observed; the pipeline decides how the platform remembers it.

   RESPONSIBILITY: define LearningSignal and a structural validator.

   DEPENDENCIES: contracts/learning-scope-contract.js.

   NON-GOALS: no kind, no state, no id, no confidence (computed downstream
   by learning-confidence-engine.js, Phase 12.6.2) — a signal only carries
   what its producer actually knows at intake time.
   ============================================================ */

'use strict';

import { isLearningScope } from './learning-scope-contract.js';

export const LEARNING_SIGNAL_SCHEMA = 'learning-signal@1';

/**
 * @typedef {Object} LearningSignal
 * @property {import('./learning-scope-contract.js').LearningScope} scope
 * @property {string} sourceType             - registry-backed key into registry/learning-source-weight-registry.js (optional registration — an unregistered sourceType still works, see that registry's header)
 * @property {string} actorId                - who or what observed this — a human identity, or a deterministic system/producer id, never fabricated
 * @property {string|null} reason
 * @property {*} before
 * @property {*} after                       - required — a signal with no new fact records nothing (mirrors learning-service.js#validateSeed's own rule)
 * @property {string|null} sourceDocumentId   - bare reference, never an import
 * @property {string|null} affectedKnowledgeId - bare reference, never an import
 * @property {Object|null} evidence
 */

export function makeLearningSignal({
  scope, sourceType, actorId, reason = null, before = null, after,
  sourceDocumentId = null, affectedKnowledgeId = null, evidence = null,
}) {
  return Object.freeze({
    scope, sourceType, actorId, reason, before, after,
    sourceDocumentId, affectedKnowledgeId, evidence,
  });
}

export function isLearningSignal(s) {
  return !!s && typeof s === 'object'
    && isLearningScope(s.scope)
    && typeof s.sourceType === 'string' && s.sourceType.length > 0
    && typeof s.actorId === 'string' && s.actorId.length > 0
    && s.after !== undefined;
}
