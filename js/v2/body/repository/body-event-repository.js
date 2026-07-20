/* ============================================================
   BODY-EVENT-REPOSITORY.JS — Body Intelligence (V2, Phase 12.5.2)

   PURPOSE: the store for BodyEvents — Learning-style (direct exported
   functions over a module-local Map, no Null variant, no swappable-
   backend registry), same shape as relationship-repository.js and for
   the identical reason: a BodyEvent is derived organizational telemetry,
   not the durable record of anything (see
   contracts/body-event-contract.js's header, and
   learning/repository/learning-repository.js's header, which states the
   same argument for LearningEvent).

   Events are immutable — no appendVersion, no delete. Same "there is no
   delete" reasoning Archive and Learning both give for themselves:
   organizational telemetry that can forget on request is not telemetry.

   ══════════════════════════════════════════════════════════════════════
   OWNERSHIP: the ONE legitimate caller of `append()` is
   services/body-sensing-service.js — enforced by
   scripts/body-ownership-check.mjs.
   ══════════════════════════════════════════════════════════════════════

   DEPENDENCIES: contracts/body-event-contract.js (isBodyEvent).
   ============================================================ */

'use strict';

import { isBodyEvent } from '../contracts/body-event-contract.js';

export const BODY_EVENT_REPOSITORY_ERRORS = Object.freeze({
  DUPLICATE_ID: 'DUPLICATE_ID',
  INVALID_EVENT: 'INVALID_EVENT',
});

function success(data) { return Object.freeze({ ok: true, data: data ?? null, error: null }); }
function failure(code, message) { return Object.freeze({ ok: false, data: null, error: Object.freeze({ code, message }) }); }

/** @type {Map<string, object>} id -> BodyEvent */
const _store = new Map();

export function append(event) {
  if (!event || typeof event.id !== 'string' || !event.id) {
    return failure(BODY_EVENT_REPOSITORY_ERRORS.INVALID_EVENT, 'append: event.id must be supplied by the caller.');
  }
  if (_store.has(event.id)) {
    return failure(BODY_EVENT_REPOSITORY_ERRORS.DUPLICATE_ID, `An event with id "${event.id}" already exists.`);
  }
  if (!isBodyEvent(event)) {
    return failure(BODY_EVENT_REPOSITORY_ERRORS.INVALID_EVENT, 'append: event does not satisfy the BodyEvent contract.');
  }
  _store.set(event.id, Object.freeze({ ...event }));
  return success(_store.get(event.id));
}

export function list(filter = {}) {
  let items = [..._store.values()];
  if (filter.type) items = items.filter((e) => e.type === filter.type);
  if (filter.entityType) items = items.filter((e) => e.entityType === filter.entityType);
  if (filter.entityId) items = items.filter((e) => e.entityId === filter.entityId);
  return success(items.sort((a, b) => new Date(a.observedAt).getTime() - new Date(b.observedAt).getTime()));
}

export function getForEntity(entityId) {
  return list({ entityId });
}

/** Test/teardown helper. Not used by any runtime path. */
export function resetBodyEventRepository() {
  _store.clear();
}
