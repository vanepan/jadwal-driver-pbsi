/* ============================================================
   RECOGNITION-RELATIONSHIP-TYPE-REGISTRY.JS — Recognition Foundation (Phase 12.7.1)

   PURPOSE: register the vocabulary of `relationshipType` values a
   RecognitionRelationshipPayload may carry — mirrors knowledge/registry/
   kind-registry.js's exact shape. See recognition-relationship-
   contract.js's header for why this is a deliberately FOURTH, disambiguated
   "relationship" vocabulary, never a reuse of dependency-graph-contract.js's
   RELATIONSHIP_TYPE, archive-record-contract.js's ARCHIVE_RELATIONSHIP, or
   body's ENTITY_RELATIONSHIP_TYPE — each of those three names a relationship
   a human curated or a real FK derives; this registry names a relationship
   Recognition's own engines DISCOVER by pattern, across scopes that may
   belong to entirely different domainTypes.

   RESPONSIBILITY: register/list/check relationshipType ids and their labels.

   DEPENDENCIES: none.

   NON-GOALS: does not discover or derive anything. Registering a
   relationshipType here never implies a real discovery engine produces it
   yet (Sprint 12.7.5 is the first real producer).
   ============================================================ */

'use strict';

/** @type {Map<string, {id: string, label: string}>} */
const _relationshipTypes = new Map();

export function registerRelationshipType(id, label) {
  if (typeof id !== 'string' || !id) throw new Error('registerRelationshipType: id must be a non-empty string');
  if (typeof label !== 'string' || !label) throw new Error('registerRelationshipType: label must be a non-empty string');
  _relationshipTypes.set(id, Object.freeze({ id, label }));
}

export function hasRelationshipType(id) {
  return _relationshipTypes.has(id);
}

export function getRelationshipType(id) {
  return _relationshipTypes.get(id) || null;
}

export function listRelationshipTypes() {
  return Object.freeze([..._relationshipTypes.values()]);
}

/** Test/teardown helper. Not used by any runtime path. */
export function resetRelationshipTypeRegistry() {
  _relationshipTypes.clear();
  bootstrap();
}

function bootstrap() {
  registerRelationshipType('SAME_VENDOR', 'Same Vendor');
  registerRelationshipType('SAME_TEMPLATE', 'Same Template');
  registerRelationshipType('SAME_DEPARTMENT', 'Same Department');
  registerRelationshipType('SAME_WORKFLOW', 'Same Workflow');
  registerRelationshipType('RECURRING_PARTICIPANT', 'Recurring Participant');
  // Phase 12.7.5 — the one relationshipType this platform's own automatic
  // discovery is honestly entitled to assign by itself. Two scopes landing
  // in the same Recognition Cluster is real, already-persisted evidence
  // they are RELATED — but WHY (same vendor? same template? something
  // else?) is an interpretation this engine has not verified, and
  // asserting one of the five richer labels above without that evidence
  // would be exactly the "invent business rules" this platform's own
  // discipline forbids (see relationship-discovery-engine.js's header).
  // CO_CLUSTERED says only what was actually observed; a human or a
  // future, more-evidenced producer may later refine it into one of the
  // five above — this registry entry does not do that itself.
  registerRelationshipType('CO_CLUSTERED', 'Co-Clustered (cause not yet interpreted)');
}

bootstrap();
