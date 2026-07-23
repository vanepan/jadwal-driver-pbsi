/* ============================================================
   DEPENDENCY-GRAPH-CONTRACT.JS — Knowledge Platform (V2, Phase 3)

   PURPOSE: fix the shape of relationships BETWEEN KnowledgeItems — e.g. "this
   template_pattern corroborates that structure item", "this rule supersedes
   that rule". Relationships are themselves `kind: 'relationship'`
   KnowledgeItems (registry/kind-registry.js), so this file defines the
   PAYLOAD shape a relationship-kind item carries, plus a query contract —
   it does not introduce a second storage mechanism.

   RESPONSIBILITY: define the KnowledgeRelationship payload typedef and the
   read-side query contract (`getRelated`) that the (still-empty) dependency
   graph engine will implement.

   DEPENDENCIES: none.

   NON-GOALS: does not store or traverse a real graph. Does not compute
   corroboration count from this graph yet (see explainability-contract.js's
   `corroborationCount`, explicitly derived-later).

   FUTURE EVOLUTION: Phase 4+ implements
   knowledge/dependency-graph/knowledge-dependency-graph-engine.js's
   `getRelated()` once a real repository exists to query against.
   ============================================================ */

'use strict';

export const RELATIONSHIP_SCHEMA = 'knowledge-relationship@1';

/** Closed set of relationship types between two KnowledgeItems. */
export const RELATIONSHIP_TYPE = Object.freeze({
  CORROBORATES: 'corroborates',
  SUPERSEDES: 'supersedes',
  CONFLICTS_WITH: 'conflicts_with',
  DERIVED_FROM: 'derived_from',
});

/**
 * The payload shape for a KnowledgeItem whose `kind` is 'relationship'.
 * @typedef {Object} KnowledgeRelationship
 * @property {string} fromId          - KnowledgeItem id
 * @property {string} toId            - KnowledgeItem id
 * @property {string} type            - one of RELATIONSHIP_TYPE
 */

export function isRelationshipPayload(p) {
  return !!p && typeof p === 'object'
    && typeof p.fromId === 'string' && p.fromId.length > 0
    && typeof p.toId === 'string' && p.toId.length > 0
    && Object.values(RELATIONSHIP_TYPE).includes(p.type);
}
