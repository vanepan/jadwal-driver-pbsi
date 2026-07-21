/* ============================================================
   RECOGNITION-SCOPE-CONTRACT.JS — Recognition Foundation (Phase 12.7.1)

   PURPOSE: fix "what is this Recognition record ABOUT" — the same problem
   learning/contracts/learning-scope-contract.js solved for Learning
   Signals (Phase 12.6.1). Deliberately a SEPARATE contract, not a literal
   import of LearningScope: that shape's fourth field is `signalType`,
   named and meant for Learning's own vocabulary — forcing Recognition's
   "which document/entity is this about" through a field literally called
   `signalType` would be exactly the kind of borrowed-shape-that-doesn't-
   fit this codebase's own precedent warns against (see
   learning-signal-similarity-engine.js's header on reimplementing a
   formula rather than importing a shape across an ownership boundary,
   for the same class of reason). RecognitionScope mirrors LearningScope
   in SPIRIT and field-naming (domainType/entityType/entityId) on purpose —
   Sprint 12.7.6 (Continuous Learning Refinement) maps one onto the other
   when Recognition emits a Learning Signal, and matching field names
   makes that mapping honest and mechanical rather than a reinterpretation.

   RESPONSIBILITY: define RecognitionScope and scopeKey().

   DEPENDENCIES: none.

   NON-GOALS: does not validate domainType/entityType against any registry
   — same restraint learning-scope-contract.js documents for itself. A
   RecognitionScope is honest about what it names, not gated by whether
   that vocabulary is registered elsewhere.
   ============================================================ */

'use strict';

export const RECOGNITION_SCOPE_SCHEMA = 'recognition-scope@1';

/**
 * @typedef {Object} RecognitionScope
 * @property {string} domainType        - e.g. 'nor' | 'vehicle' | 'driver' | ... (free-form, same discipline as LearningScope.domainType)
 * @property {string|null} entityType   - a finer-grained type within domainType (e.g. Body's 'vehicle'), or null when the scope is domainType-wide
 * @property {string|null} entityId     - a specific KnowledgeItem/ArchiveRecord/Entity id, or null when the scope is not about one specific record
 */

export function makeRecognitionScope({ domainType, entityType = null, entityId = null }) {
  if (typeof domainType !== 'string' || !domainType) throw new Error('makeRecognitionScope: domainType is required.');
  return Object.freeze({ domainType, entityType, entityId });
}

export function isRecognitionScope(s) {
  return !!s && typeof s === 'object'
    && typeof s.domainType === 'string' && s.domainType.length > 0
    && (s.entityType === null || typeof s.entityType === 'string')
    && (s.entityId === null || typeof s.entityId === 'string');
}

/** The one shared "same thing" key every Recognition engine compares
 *  against — never reinvented per-engine, mirroring LearningScope's own
 *  scopeKey() precedent exactly. */
export function scopeKey(s) {
  return `${s.domainType}:${s.entityType || ''}:${s.entityId || ''}`;
}
