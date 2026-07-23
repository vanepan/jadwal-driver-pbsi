/* ============================================================
   LEARNING-SOURCE-WEIGHT-REGISTRY.JS — Universal Learning Engine (Phase 12.6.1)

   PURPOSE: "how much should THIS signal's sourceType count" — the input
   learning-confidence-engine.js (Phase 12.6.2) reads. Same shape as
   knowledge/contracts/source-weight-contract.js, a DIFFERENT id space —
   deliberately NOT imported from Knowledge: `learning/` may not depend on
   any `knowledge/` engine or contract keyed to Knowledge's own vocabulary
   (see scripts/learning-ownership-check.mjs Part 2's existing leak-check,
   and services/learning-service.js's own header on why Learning stays the
   platform's most upstream domain). The FORMULA this feeds is reused/cited
   (see learning-confidence-engine.js); the DATA is intentionally not,
   since Knowledge's `sourceType` id space ('nor','correction','extraction',
   'merge',...) and Learning Signal's `sourceType` id space (below) name
   different things.

   RESPONSIBILITY: register/get/list learning-signal sourceType weights.

   DEPENDENCIES: none.

   NON-GOALS: does not compute a LearningConfidence directly — see
   learning-confidence-engine.js, which reads this table as one input.
   ============================================================ */

'use strict';

/**
 * @typedef {Object} LearningSourceWeight
 * @property {string} sourceType
 * @property {number} weight
 * @property {string} rationale
 */

export const LEARNING_SOURCE_WEIGHT_SCHEMA = 'learning-source-weight@1';
export const DEFAULT_LEARNING_SOURCE_WEIGHT = 0.5;

const _weights = new Map();

function register(sourceType, weight, rationale) {
  _weights.set(sourceType, Object.freeze({ sourceType, weight, rationale }));
}

/**
 * @param {string} sourceType
 * @returns {LearningSourceWeight}
 */
export function getLearningSourceWeight(sourceType) {
  return _weights.get(sourceType) || Object.freeze({
    sourceType, weight: DEFAULT_LEARNING_SOURCE_WEIGHT,
    rationale: 'Unregistered sourceType — default weight (unknown, not distrusted), same rule knowledge/\'s source-weight-contract.js already establishes.',
  });
}

export function listLearningSourceWeights() {
  return Object.freeze([..._weights.values()]);
}

/** Test/teardown helper. Not used by any runtime path. */
export function resetLearningSourceWeights() {
  _weights.clear();
  bootstrap();
}

function bootstrap() {
  register('human-correction', 1.0, 'An explicit human statement reaching Learning through emitLearningSignal — highest trust, same rationale as Knowledge\'s own "correction" weight, independently registered here (different id space).');
  register('document-edit', 0.9, 'A real, attributed document/composer edit (e.g. document-intelligence/composer\'s section-learning-bridge.js-style signal) — a human acting inside a real workflow.');
  register('pattern-discovery', 0.7, 'Mechanically derived from repeated observation, one level removed from a direct human statement — same rationale tier as Knowledge\'s "extraction" weight.');
  register('reasoning-outcome', 0.8, 'Reserved for a future, separately-approved sprint recording a reasoning/ Recommendation\'s real-world outcome (see learning-outcome-service.js) — not a live producer in this phase.');
  register('sensor-observation', 0.6, 'Body Intelligence\'s pull-adapter telemetry (js/v2/learning-bridge/) — a real, deterministic sensor read, one level removed from a human statement.');
}

bootstrap();
