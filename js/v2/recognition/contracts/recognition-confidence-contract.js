/* ============================================================
   RECOGNITION-CONFIDENCE-CONTRACT.JS — Recognition Foundation (Phase 12.7.1)

   PURPOSE: fix the shape of a Recognition Confidence report — mirrors
   learning/contracts/learning-confidence-contract.js's role (Phase 12.6.2),
   itself citing/extending knowledge/machine-learning/confidence-engine.js's
   formula. This is the THIRD instance of the same disambiguated pattern in
   this codebase's history (Knowledge → Learning → now Recognition), and
   each one reimplements the arithmetic rather than importing the prior
   engine, for the identical, now well-precedented reason: an ownership-
   check boundary forbids importing another domain's ENGINE (only a bare
   contracts/*.js leaf may cross), so the FORMULA is cited and extended,
   never the code. See recognition-confidence-engine.js (a later sprint)
   for the actual computation; this file only fixes its output shape.

   RESPONSIBILITY: define RecognitionConfidence.

   DEPENDENCIES: none.

   NON-GOALS: does not compute anything. Does not define the source-weight
   table (that is registry/recognition-source-weight-registry.js — Sprint
   12.7.3, defined when the confidence engine that needs it ships, not
   speculatively here).
   ============================================================ */

'use strict';

export const RECOGNITION_CONFIDENCE_SCHEMA = 'recognition-confidence@1';

/**
 * @typedef {Object} RecognitionConfidence
 * @property {number} value               - 0–1, the final blended confidence
 * @property {number} sourceWeight         - 0–1, how much this recognition's producer is trusted
 * @property {number} corroborationCount   - how many independent recognitions agree
 * @property {number} contradictionCount   - how many independent recognitions disagree
 * @property {string} computedAt           - ISO 8601 — recomputed fresh every call, never itself versioned (same discipline LearningConfidence's own contract already states)
 */

export function isRecognitionConfidence(c) {
  return !!c && typeof c === 'object'
    && typeof c.value === 'number' && c.value >= 0 && c.value <= 1
    && typeof c.sourceWeight === 'number' && c.sourceWeight >= 0 && c.sourceWeight <= 1
    && typeof c.corroborationCount === 'number' && c.corroborationCount >= 0
    && typeof c.contradictionCount === 'number' && c.contradictionCount >= 0
    && typeof c.computedAt === 'string' && c.computedAt.length > 0;
}
