/* ============================================================
   CONFLICT-REPORT-CONTRACT.JS — Knowledge Observability (V2, Phase 9.1)

   PURPOSE: fix the shape of a reported conflict between two or more
   KnowledgeItems — reuses contracts/dependency-graph-contract.js's
   existing RELATIONSHIP_TYPE.CONFLICTS_WITH rather than inventing a
   competing "conflict" vocabulary.

   RESPONSIBILITY: define KnowledgeConflictReport and a constructor ONLY —
   this is "Conflict Reporting" (V2.0.2.1), the shape a report takes.
   Finding conflicts ("Conflict Detection") is explicitly V2.0.3 scope, and
   deciding how to resolve one ("Conflict Resolution") is V2.0.4 scope —
   this module intentionally contains no detection or resolution logic.

   DEPENDENCIES: contracts/dependency-graph-contract.js (RELATIONSHIP_TYPE
   reference only).
   ============================================================ */

'use strict';

import { RELATIONSHIP_TYPE } from '../../contracts/dependency-graph-contract.js';

export const CONFLICT_REPORT_SCHEMA = 'knowledge-conflict-report@1';

let _counter = 0;

/**
 * @typedef {Object} KnowledgeConflictReport
 * @property {string} conflictId
 * @property {string} domainType
 * @property {string[]} itemIds      - the KnowledgeItem ids in conflict (>= 2)
 * @property {string} relationshipType - always RELATIONSHIP_TYPE.CONFLICTS_WITH today
 * @property {string} description
 * @property {string} detectedAt     - ISO 8601
 */

export function makeConflictReport({ domainType, itemIds, description }) {
  _counter += 1;
  return Object.freeze({
    conflictId: `conflict:${domainType}:${Date.now()}:${_counter}`,
    domainType,
    itemIds: Object.freeze([...itemIds]),
    relationshipType: RELATIONSHIP_TYPE.CONFLICTS_WITH,
    description: description || null,
    detectedAt: new Date().toISOString(),
  });
}

/** Structural check that an object satisfies the KnowledgeConflictReport contract. */
export function isKnowledgeConflictReport(r) {
  return !!r && typeof r === 'object'
    && typeof r.conflictId === 'string' && r.conflictId.length > 0
    && typeof r.domainType === 'string' && r.domainType.length > 0
    && Array.isArray(r.itemIds) && r.itemIds.length >= 2
    && r.relationshipType === RELATIONSHIP_TYPE.CONFLICTS_WITH;
}
