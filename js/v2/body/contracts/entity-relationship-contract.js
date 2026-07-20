/* ============================================================
   ENTITY-RELATIONSHIP-CONTRACT.JS — Body Intelligence (V2, Phase 12.5.1)

   PURPOSE: fix the shape of ONE edge in the Entity Relationship Graph —
   deliberately disambiguated, by both name and mechanism, from
   knowledge/contracts/dependency-graph-contract.js's RELATIONSHIP_TYPE:

     | | Knowledge Graph (existing)              | Entity Relationship Graph (this) |
     |-|------------------------------------------|-----------------------------------|
     | Graphs over | Facts (KnowledgeItems)        | Operational objects (Entities)   |
     | Edges are   | Hand-curated, human-reviewable `kind:'relationship'` KnowledgeItems | DERIVED automatically from sensor-read V1 FK fields — never hand-authored |

   RESPONSIBILITY: define ENTITY_RELATIONSHIP_TYPE and EntityRelationship.

   DEPENDENCIES: none.

   NON-GOALS: no human review workflow, no corroboration count — an edge
   is either derivable from a real V1 FK field this tick, or it does not
   exist this tick (re-sensing simply re-derives it).

   FUTURE EVOLUTION: a new relationship type is added only when a real
   sensor can derive it from a real FK — never pre-declared speculatively
   (see sensors/assignment-sensor.js for the two real types this phase
   ships).
   ============================================================ */

'use strict';

export const ENTITY_RELATIONSHIP_SCHEMA = 'entity-relationship@1';

export const ENTITY_RELATIONSHIP_TYPE = Object.freeze({
  ASSIGNED_TO_VEHICLE: 'assigned_to_vehicle', // Assignment -> Vehicle
  ASSIGNED_TO_DRIVER: 'assigned_to_driver',   // Assignment -> Driver
});

/**
 * @typedef {Object} EntityRelationship
 * @property {string} id
 * @property {string} fromEntityId
 * @property {string} toEntityId
 * @property {string} type            - one of ENTITY_RELATIONSHIP_TYPE
 * @property {{sensorId: string, field: string}} derivedFrom - traceability: which sensor, which raw V1 field
 * @property {string} observedAt      - ISO 8601
 */

export function makeEntityRelationship({ id, fromEntityId, toEntityId, type, derivedFrom }) {
  return Object.freeze({
    id, fromEntityId, toEntityId, type,
    derivedFrom: Object.freeze({ ...derivedFrom }),
    observedAt: new Date().toISOString(),
  });
}

export function isEntityRelationship(r) {
  return !!r && typeof r === 'object'
    && typeof r.id === 'string' && r.id.length > 0
    && typeof r.fromEntityId === 'string' && r.fromEntityId.length > 0
    && typeof r.toEntityId === 'string' && r.toEntityId.length > 0
    && typeof r.type === 'string' && Object.values(ENTITY_RELATIONSHIP_TYPE).includes(r.type)
    && !!r.derivedFrom && typeof r.derivedFrom === 'object'
    && typeof r.derivedFrom.sensorId === 'string' && typeof r.derivedFrom.field === 'string';
}
