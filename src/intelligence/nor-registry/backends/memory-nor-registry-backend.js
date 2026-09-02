/* ============================================================
   MEMORY-NOR-REGISTRY-BACKEND.JS — Canonical NOR Registry (V2, Phase 5)

   An in-process NOR Registry backend with the REAL lifecycle
   (in_review → approved → published → superseded), immutable per-version
   snapshots, optimistic concurrency, and an in-memory atomic + idempotent
   number allocator. Used by the service- and console-level tests and by the
   client in DISABLED mode — so a test walks the full human-gated lifecycle
   without Firebase or the Admin SDK.

   SAFETY mirror of the server (functions/src/intelligence/norRegistryStore.js
   + norNumberingCounter.js): no official number until publish, publish is
   idempotent (a retry never allocates a second number), a published record
   is immutable.
   ============================================================ */

'use strict';

import { NOR_REGISTRY_ERRORS, registrySuccess, registryFailure } from '../contracts/registry-contract.js';
import { NOR_STATUS } from '../contracts/nor-record-contract.js';
import {
  norIdFromConversation, registryContentFromDraft, makeNorRecordFromDraft,
  appendRegistryVersion, markApproved, markPublished,
} from '../nor-registry-record.js';

export const MEMORY_NOR_REGISTRY_BACKEND_ID = 'memory';

/** @type {Map<string, object>} norId -> head NorRecord (each carries its own versions[]) */
const _store = new Map();

/* one in-memory allocator shared across the module — mirrors the single
   server-side counter node. `_reservations` is the per-reservationKey memo
   that makes allocation idempotent under retry. */
let _seq = 0;
const _reservations = new Map();
const SCOPE_KEY = 'intelligence_nor';

function allocate(reservationKey) {
  if (_reservations.has(reservationKey)) {
    return { sequence: _reservations.get(reservationKey), scopeKey: SCOPE_KEY, reservationKey, allocatedAt: new Date().toISOString(), basis: 'memory-allocator (idempotent replay)' };
  }
  _seq += 1;
  _reservations.set(reservationKey, _seq);
  return { sequence: _seq, scopeKey: SCOPE_KEY, reservationKey, allocatedAt: new Date().toISOString(), basis: 'memory-allocator' };
}

export const memoryNorRegistryBackend = Object.freeze({
  id: MEMORY_NOR_REGISTRY_BACKEND_ID,
  version: 'nor-registry-memory-backend@1',

  /** register({ draft, ownerId, now }) — get-or-create the canonical record
   *  for a draft that just reached requires_review. */
  register(input) {
    const draft = input && typeof input === 'object' ? input.draft : null;
    const ownerId = input && input.ownerId;
    if (!draft || typeof draft !== 'object') {
      return registryFailure(NOR_REGISTRY_ERRORS.INVALID_RECORD, 'register: a draft record is required.');
    }
    const norId = norIdFromConversation(draft.conversationId);
    if (!norId) return registryFailure(NOR_REGISTRY_ERRORS.INVALID_RECORD, 'register: the draft has no conversationId.');
    const existing = _store.get(norId);
    if (existing) return registrySuccess(existing); // get-or-create — idempotent
    const record = makeNorRecordFromDraft(draft, { ownerId, now: input.now });
    _store.set(norId, record);
    return registrySuccess(record);
  },

  getById(norId) {
    const rec = _store.get(String(norId || ''));
    return rec ? registrySuccess(rec) : registryFailure(NOR_REGISTRY_ERRORS.NOT_FOUND, `No NOR record "${norId}".`);
  },

  list(ownerId) {
    const items = [..._store.values()].filter((r) => !ownerId || r.ownerId === ownerId);
    return registrySuccess(Object.freeze(items));
  },

  /** appendVersion(norId, { draft, actorId, at, expectedVersion }) — a human
   *  edit becomes a new immutable version. */
  appendVersion(norId, input) {
    const rec = _store.get(String(norId || ''));
    if (!rec) return registryFailure(NOR_REGISTRY_ERRORS.NOT_FOUND, `No NOR record "${norId}".`);
    const { draft, actorId, at, expectedVersion } = input || {};
    if (rec.status === NOR_STATUS.PUBLISHED) return registryFailure(NOR_REGISTRY_ERRORS.ALREADY_PUBLISHED, 'A published NOR is immutable — create a new version via the lifecycle.');
    if (rec.status !== NOR_STATUS.IN_REVIEW) return registryFailure(NOR_REGISTRY_ERRORS.ILLEGAL_TRANSITION, `Cannot edit a NOR in status "${rec.status}".`);
    if (typeof expectedVersion === 'number' && expectedVersion !== rec.currentVersion) {
      return registryFailure(NOR_REGISTRY_ERRORS.VERSION_CONFLICT, `expected version ${expectedVersion}, head is ${rec.currentVersion}.`);
    }
    const nextContent = registryContentFromDraft(draft || {});
    const { next, changed } = appendRegistryVersion(rec, { nextContent, actorId, at });
    if (!changed) return registrySuccess(rec);
    _store.set(rec.norId, next);
    return registrySuccess(next);
  },

  /** approve(norId, { expectedVersion, actorId, at }) — in_review → approved. */
  approve(norId, ctx = {}) {
    const rec = _store.get(String(norId || ''));
    if (!rec) return registryFailure(NOR_REGISTRY_ERRORS.NOT_FOUND, `No NOR record "${norId}".`);
    if (rec.status === NOR_STATUS.PUBLISHED) return registryFailure(NOR_REGISTRY_ERRORS.ALREADY_PUBLISHED, 'This NOR is already published.');
    if (typeof ctx.expectedVersion === 'number' && ctx.expectedVersion !== rec.currentVersion) {
      return registryFailure(NOR_REGISTRY_ERRORS.VERSION_CONFLICT, `expected version ${ctx.expectedVersion}, head is ${rec.currentVersion}.`);
    }
    const { next, error } = markApproved(rec, { actorId: ctx.actorId, at: ctx.at });
    if (error) return registryFailure(NOR_REGISTRY_ERRORS[error] || NOR_REGISTRY_ERRORS.ILLEGAL_TRANSITION, `approve: ${error}`);
    _store.set(rec.norId, next);
    return registrySuccess(next);
  },

  /** publish(norId, { expectedVersion, actorId, at }) — approved → published,
   *  reserving the official number atomically. NO number input — the number
   *  IS the reserved sequence. Idempotent: a retry on an already-published
   *  record returns it as-is. */
  publish(norId, ctx = {}) {
    const rec = _store.get(String(norId || ''));
    if (!rec) return registryFailure(NOR_REGISTRY_ERRORS.NOT_FOUND, `No NOR record "${norId}".`);
    if (rec.status === NOR_STATUS.PUBLISHED) return registrySuccess(rec); // idempotent — no second number
    if (rec.status !== NOR_STATUS.APPROVED) {
      return registryFailure(NOR_REGISTRY_ERRORS.ILLEGAL_TRANSITION, `publish requires status "approved" (current: "${rec.status}").`);
    }
    if (typeof ctx.expectedVersion === 'number' && ctx.expectedVersion !== rec.currentVersion) {
      return registryFailure(NOR_REGISTRY_ERRORS.VERSION_CONFLICT, `expected version ${ctx.expectedVersion}, head is ${rec.currentVersion}.`);
    }
    const allocation = allocate(rec.norId);
    const { next, error } = markPublished(rec, { allocation, actorId: ctx.actorId, at: ctx.at });
    if (error) return registryFailure(NOR_REGISTRY_ERRORS[error] || NOR_REGISTRY_ERRORS.ILLEGAL_TRANSITION, `publish: ${error}`);
    _store.set(rec.norId, next);
    return registrySuccess(next);
  },

  getHistory(norId) {
    const rec = _store.get(String(norId || ''));
    if (!rec) return registryFailure(NOR_REGISTRY_ERRORS.NOT_FOUND, `No NOR record "${norId}".`);
    return registrySuccess(Object.freeze([...rec.versions]));
  },
});

/** Test/teardown helper — clears records AND the allocator. */
export function resetMemoryNorRegistryBackend() {
  _store.clear();
  _reservations.clear();
  _seq = 0;
}
