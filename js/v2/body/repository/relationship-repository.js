/* ============================================================
   RELATIONSHIP-REPOSITORY.JS — Body Intelligence (V2, Phase 12.5.2)

   PURPOSE: the store for EntityRelationship edges — Learning-style
   (direct exported functions over a module-local Map, no Null variant, no
   swappable-backend registry), deliberately NOT Knowledge's full
   Memory+Null+registry machinery, for the same reason
   learning/repository/learning-repository.js gives for itself: an
   EntityRelationship is DERIVED — reconstructible any time by re-sensing
   the same V1 records — never the durable record of anything itself (the
   real record of "this assignment uses this vehicle" is the assignment
   row's own `vehicle` field in V1). Building the full registry
   indirection now would be the premature optimization the Phase 12.5
   brief explicitly warns against.

   Relationships are IMMUTABLE observed facts, like BodyEvents — no
   appendVersion, no version field. A sensor re-deriving the "same" edge
   on a later tick simply creates a new EntityRelationship row with a
   fresh id and observedAt; nothing here deduplicates or supersedes (a
   consumer wanting "the latest edge of this type between these two
   entities" reads via `list()` + its own recency filter — see
   graph/entity-relationship-graph-engine.js, Phase 12.5.4).

   ══════════════════════════════════════════════════════════════════════
   OWNERSHIP: the ONE legitimate caller of `create()` is
   services/body-sensing-service.js — enforced by
   scripts/body-ownership-check.mjs. Every other consumer reads via
   `list()`/`getForEntity()` only.
   ══════════════════════════════════════════════════════════════════════

   DEPENDENCIES: contracts/entity-relationship-contract.js (isEntityRelationship).
   ============================================================ */

'use strict';

import { isEntityRelationship } from '../contracts/entity-relationship-contract.js';

export const RELATIONSHIP_REPOSITORY_ERRORS = Object.freeze({
  DUPLICATE_ID: 'DUPLICATE_ID',
  INVALID_RELATIONSHIP: 'INVALID_RELATIONSHIP',
});

function success(data) { return Object.freeze({ ok: true, data: data ?? null, error: null }); }
function failure(code, message) { return Object.freeze({ ok: false, data: null, error: Object.freeze({ code, message }) }); }

/** @type {Map<string, object>} id -> EntityRelationship */
const _store = new Map();

export function create(relationship) {
  if (!relationship || typeof relationship.id !== 'string' || !relationship.id) {
    return failure(RELATIONSHIP_REPOSITORY_ERRORS.INVALID_RELATIONSHIP, 'create: relationship.id must be supplied by the caller.');
  }
  if (_store.has(relationship.id)) {
    return failure(RELATIONSHIP_REPOSITORY_ERRORS.DUPLICATE_ID, `A relationship with id "${relationship.id}" already exists.`);
  }
  if (!isEntityRelationship(relationship)) {
    return failure(RELATIONSHIP_REPOSITORY_ERRORS.INVALID_RELATIONSHIP, 'create: relationship does not satisfy the EntityRelationship contract.');
  }
  _store.set(relationship.id, Object.freeze({ ...relationship }));
  return success(_store.get(relationship.id));
}

export function list(filter = {}) {
  let items = [..._store.values()];
  if (filter.type) items = items.filter((r) => r.type === filter.type);
  if (filter.entityId) items = items.filter((r) => r.fromEntityId === filter.entityId || r.toEntityId === filter.entityId);
  return success(items);
}

export function getForEntity(entityId) {
  return list({ entityId });
}

/** Test/teardown helper. Not used by any runtime path. */
export function resetRelationshipRepository() {
  _store.clear();
}
