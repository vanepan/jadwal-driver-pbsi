/* ============================================================
   LEARNING-SCOPE-CONTRACT.JS — Universal Learning Engine (Phase 12.6.1)

   PURPOSE: fix "what is this Learning Signal ABOUT" as one shared,
   structured shape — the single key every new Phase 12.6 engine
   (similarity, conflict-detection, confidence's corroboration counting,
   lineage) agrees on for "same thing" — instead of each one independently
   inventing its own ad-hoc string convention the way today's `targetKey`
   already does across producers (`is:1`, `gap:${n}`,
   `pattern:${type}:${value}`, `${documentId}:${field}` — four different
   shapes for four different producers). Also closes a gap prior North Star
   audits explicitly flagged: "KnowledgeItem has no type/entity-scoping
   field, gap detection and reasoning can't scope to a specific operational
   context."

   RESPONSIBILITY: define LearningScope and scopeKey().

   DEPENDENCIES: none.

   NON-GOALS: does not validate domainType/entityType against any registry
   — learning-service.js#validateSeed() itself only requires a non-empty
   domainType string, never a registry membership check (Learning is the
   platform's most upstream domain; it does not import domain-type-registry.js
   either). A LearningScope is honest about what it names, not gated by
   whether that vocabulary is registered elsewhere.
   ============================================================ */

'use strict';

export const LEARNING_SCOPE_SCHEMA = 'learning-scope@1';

/**
 * @typedef {Object} LearningScope
 * @property {string} domainType         - e.g. 'nor' | 'body' | 'engineering' | ... (free-form, same discipline as LearningEvent.domainType)
 * @property {string|null} entityType    - e.g. Body's 'vehicle' | 'driver' | 'assignment', or null when the signal isn't about one specific entity type
 * @property {string|null} entityId      - a specific entity/record within entityType, or null when the signal is scoped only to entityType/domainType
 * @property {string} signalType         - registry-backed, see registry/learning-signal-type-registry.js (registration is optional metadata, not a gate — an unregistered signalType is still a valid scope)
 */

export function makeLearningScope({ domainType, entityType = null, entityId = null, signalType }) {
  if (typeof domainType !== 'string' || !domainType) throw new Error('makeLearningScope: domainType is required.');
  if (typeof signalType !== 'string' || !signalType) throw new Error('makeLearningScope: signalType is required.');
  return Object.freeze({ domainType, entityType, entityId, signalType });
}

export function isLearningScope(s) {
  return !!s && typeof s === 'object'
    && typeof s.domainType === 'string' && s.domainType.length > 0
    && (s.entityType === null || typeof s.entityType === 'string')
    && (s.entityId === null || typeof s.entityId === 'string')
    && typeof s.signalType === 'string' && s.signalType.length > 0;
}

/** The one shared "same thing" key every Phase 12.6 engine compares
 *  against — never reinvented per-engine. */
export function scopeKey(s) {
  return `${s.domainType}:${s.entityType || ''}:${s.entityId || ''}:${s.signalType}`;
}
