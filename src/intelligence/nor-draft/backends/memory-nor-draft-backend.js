/* ============================================================
   MEMORY-NOR-DRAFT-BACKEND.JS — Sarpras Intelligence (V2, Phase 4)

   An in-process NOR-draft backend. Used by tests and by the client in
   DISABLED mode. Version history per draftId (array, oldest first), the
   same shape norDraftStore.js persists server-side — so a service-level
   test exercises the real create → get → update → re-get semantics without
   a network or the Admin SDK.

   SAFETY mirror of the server: numbering.publishedNumber is forced null on
   every write; edits touch only DRAFT_EDITABLE_FIELDS; a no-op edit returns
   the head unchanged (no version bump).
   ============================================================ */

'use strict';

import { DRAFT_STORE_ERRORS, draftSuccess, draftFailure } from '../contracts/nor-draft-store-contract.js';
import { isNorDraftRecord, applyDraftEdits } from '../contracts/nor-draft-record-contract.js';

export const MEMORY_NOR_DRAFT_BACKEND_ID = 'memory';

/** @type {Map<string, object[]>} draftId -> [v1, v2, ...] */
const _store = new Map();

function head(draftId) {
  const versions = _store.get(draftId);
  return versions && versions.length ? versions[versions.length - 1] : null;
}

function enforceInvariants(record) {
  const r = { ...record };
  r.numbering = { ...(r.numbering || {}), publishedNumber: null };
  return r;
}

export const memoryNorDraftBackend = Object.freeze({
  id: MEMORY_NOR_DRAFT_BACKEND_ID,
  version: 'nor-draft-memory-backend@1',

  get(draftId) {
    const rec = head(String(draftId || ''));
    return rec ? draftSuccess(rec) : draftFailure(DRAFT_STORE_ERRORS.NOT_FOUND, `No draft "${draftId}".`);
  },

  create(record) {
    const clean = enforceInvariants(record);
    if (!isNorDraftRecord(clean)) {
      return draftFailure(DRAFT_STORE_ERRORS.INVALID_RECORD, 'create: record does not satisfy the NorDraft contract.');
    }
    if (clean.version !== 1) {
      return draftFailure(DRAFT_STORE_ERRORS.INVALID_RECORD, 'create: a new draft must start at version 1.');
    }
    if (_store.has(clean.draftId)) {
      return draftFailure(DRAFT_STORE_ERRORS.INVALID_RECORD, `create: draft "${clean.draftId}" already exists.`);
    }
    _store.set(clean.draftId, [clean]);
    return draftSuccess(clean);
  },

  update(draftId, edits, ctx = {}) {
    const key = String(draftId || '');
    const cur = head(key);
    if (!cur) return draftFailure(DRAFT_STORE_ERRORS.NOT_FOUND, `No draft "${key}".`);
    const actorId = ctx && ctx.actorId;
    if (typeof actorId !== 'string' || !actorId) {
      return draftFailure(DRAFT_STORE_ERRORS.INVALID_RECORD, 'update: actorId is required.');
    }
    if (typeof ctx.expectedVersion === 'number' && ctx.expectedVersion !== cur.version) {
      return draftFailure(DRAFT_STORE_ERRORS.VERSION_CONFLICT, `update: expected version ${ctx.expectedVersion}, head is ${cur.version}.`);
    }
    const { next, changedFields } = applyDraftEdits(cur, edits, { actorId, at: ctx.at || new Date().toISOString() });
    if (changedFields.length === 0) return draftSuccess(cur); // idempotent no-op
    const clean = enforceInvariants(next);
    if (!isNorDraftRecord(clean)) {
      return draftFailure(DRAFT_STORE_ERRORS.INVALID_RECORD, 'update: the edited draft would be invalid.');
    }
    _store.set(key, [...(_store.get(key) || []), clean]);
    return draftSuccess(clean);
  },

  list(ownerId) {
    const items = [..._store.values()].map((v) => v[v.length - 1]).filter((d) => !ownerId || d.ownerId === ownerId);
    return draftSuccess(Object.freeze(items));
  },
});

/** Test/teardown helper. */
export function resetMemoryNorDraftBackend() {
  _store.clear();
}
