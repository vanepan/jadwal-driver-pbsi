/* ============================================================
   RECOGNITION-RELATIONSHIP-CONTRACT.JS — Recognition Foundation (Phase 12.7.1)

   PURPOSE: fix the payload shape for RECORD_TYPE.RELATIONSHIP — an
   organizational/semantic-pattern relationship BETWEEN TWO SCOPES,
   possibly of two different domainTypes/entityTypes. Populated for real
   by Sprint 12.7.5 (Relationship Discovery).

   THIS IS THE FOURTH DISAMBIGUATED "RELATIONSHIP" IN THIS CODEBASE, ON
   PURPOSE — same word, four deliberately different concerns, never
   merged (this platform's own established discipline, already applied
   three times to "health" and twice to "graph"):
     1. knowledge/contracts/dependency-graph-contract.js#RELATIONSHIP_TYPE
        — evidentiary (CORROBORATES/SUPERSEDES/CONFLICTS_WITH/DERIVED_FROM),
        hand-curated `kind:'relationship'` KnowledgeItems.
     2. organizational-memory/contracts/archive-record-contract.js#
        ARCHIVE_RELATIONSHIP — structural (DUPLICATE_OF/SUPERSEDES/
        PARENT_OF/...), derived from ArchiveRecord's own recorded
        reference fields.
     3. body/contracts/entity-relationship-contract.js#
        ENTITY_RELATIONSHIP_TYPE — operational (ASSIGNED_TO_VEHICLE/
        ASSIGNED_TO_DRIVER), derived automatically from sensor-read V1 FK
        fields.
     4. THIS FILE — organizational/semantic-PATTERN relationships
        (SAME_VENDOR/SAME_TEMPLATE/SAME_DEPARTMENT/SAME_WORKFLOW/
        RECURRING_PARTICIPANT), discovered by comparing Recognition
        Signatures/Clusters across scopes — never written into any of the
        three prior relationship stores, and never reads them as its own
        storage either.

   RESPONSIBILITY: define RecognitionRelationshipPayload.

   DEPENDENCIES: none.

   NON-GOALS: does not discover anything (recognition/graph/, Sprint
   12.7.5). Does not replace or write into any of the three prior
   relationship vocabularies above — see
   registry/recognition-relationship-type-registry.js's header for why a
   fifth, generic vocabulary is warranted here rather than reusing one of
   the three.
   ============================================================ */

'use strict';

export const RECOGNITION_RELATIONSHIP_SCHEMA = 'recognition-relationship@1';

/**
 * @typedef {Object} RecognitionRelationshipPayload
 * @property {string} relationshipType   - registry-backed, see registry/recognition-relationship-type-registry.js
 * @property {string} fromScopeKey       - scopeKey() string
 * @property {string} toScopeKey         - scopeKey() string, must differ from fromScopeKey (a relationship needs two distinct things)
 */

export function isRecognitionRelationshipPayload(p) {
  return !!p && typeof p === 'object'
    && typeof p.relationshipType === 'string' && p.relationshipType.length > 0
    && typeof p.fromScopeKey === 'string' && p.fromScopeKey.length > 0
    && typeof p.toScopeKey === 'string' && p.toScopeKey.length > 0
    && p.fromScopeKey !== p.toScopeKey;
}
