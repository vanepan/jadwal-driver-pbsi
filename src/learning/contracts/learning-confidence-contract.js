/* ============================================================
   LEARNING-CONFIDENCE-CONTRACT.JS — Universal Learning Engine (Phase 12.6.1)

   PURPOSE: fix the shape of "how much to trust THIS SIGNAL at intake" —
   the platform's first first-class confidence concept at the Learning
   layer (LearningEvent itself has none — confirmed absent before this
   phase). Deliberately distinct from a KnowledgeItem's own `confidence`
   field: that one lives and evolves on ONE PERSISTED ITEM forever; this
   one is a transient property of one intake signal, recomputed fresh by
   learning-confidence-engine.js (Phase 12.6.2) every time, never itself
   versioned or stored as its own row.

   RESPONSIBILITY: define LearningConfidence and a structural validator.

   DEPENDENCIES: none.

   NON-GOALS: does not gate persistence. Every structurally-valid
   LearningSignal is recorded regardless of its computed confidence value —
   see learning-signal-service.js's header. A low-confidence signal is
   remembered, just labeled — the literal implementation of "never lose
   experience."
   ============================================================ */

'use strict';

export const LEARNING_CONFIDENCE_SCHEMA = 'learning-confidence@1';

/**
 * @typedef {Object} LearningConfidence
 * @property {number} value               - 0..1, trust in THIS SIGNAL at intake
 * @property {number} sourceWeight        - from registry/learning-source-weight-registry.js
 * @property {number} corroborationCount  - independent same-scope signals agreeing (same `after`)
 * @property {number} contradictionCount  - independent same-scope signals disagreeing (from learning-conflict-detection-engine.js)
 * @property {string} rationale           - cites the formula + every input, never a bare number
 * @property {string} computedAt          - ISO 8601
 */

export function makeLearningConfidence({ value, sourceWeight, corroborationCount, contradictionCount, rationale }) {
  return Object.freeze({
    value, sourceWeight, corroborationCount, contradictionCount, rationale,
    computedAt: new Date().toISOString(),
  });
}

export function isLearningConfidence(c) {
  return !!c && typeof c === 'object'
    && typeof c.value === 'number' && c.value >= 0 && c.value <= 1
    && typeof c.sourceWeight === 'number'
    && typeof c.corroborationCount === 'number' && c.corroborationCount >= 0
    && typeof c.contradictionCount === 'number' && c.contradictionCount >= 0
    && typeof c.rationale === 'string' && c.rationale.length > 0;
}
