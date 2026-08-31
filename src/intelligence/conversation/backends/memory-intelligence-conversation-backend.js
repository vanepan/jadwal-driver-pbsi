/* ============================================================
   MEMORY-INTELLIGENCE-CONVERSATION-BACKEND.JS — Sarpras Intelligence (V2, Phase 1)

   An in-process, append-only durable-conversation backend. Used by tests
   and by the client in DISABLED mode (a single-session continuity that is
   good enough when no server round-trip happens anyway). The RTDB-backed
   backend replaces it server-side later.

   Append-only per convId (version array, oldest first), same shape as
   src/conversation/repository/conversation-repository.js.
   ============================================================ */

'use strict';

import { IC_STORE_ERRORS, icSuccess, icFailure } from '../intelligence-conversation-store-contract.js';
import { isIntelligenceConversation } from '../contracts/intelligence-conversation-contract.js';

export const MEMORY_IC_BACKEND_ID = 'memory';

/** @type {Map<string, object[]>} convId -> [v1, v2, ...] */
const _store = new Map();

function latest(convId) {
  const versions = _store.get(convId);
  return versions && versions.length ? versions[versions.length - 1] : null;
}

export const memoryIntelligenceConversationBackend = Object.freeze({
  id: MEMORY_IC_BACKEND_ID,
  version: 'ic-memory-backend@1',

  get(convId) {
    const rec = latest(convId);
    return rec ? icSuccess(rec) : icFailure(IC_STORE_ERRORS.NOT_FOUND, `No conversation "${convId}".`);
  },

  save(record) {
    if (!isIntelligenceConversation(record)) {
      return icFailure(IC_STORE_ERRORS.INVALID_RECORD, 'save: record does not satisfy the IntelligenceConversation contract.');
    }
    const existing = _store.get(record.convId);
    if (!existing) {
      if (record.version !== 1) {
        return icFailure(IC_STORE_ERRORS.INVALID_RECORD, 'save: a new conversation must start at version 1.');
      }
      _store.set(record.convId, [record]);
      return icSuccess(record);
    }
    const head = existing[existing.length - 1];
    if (record.actorId !== head.actorId) {
      return icFailure(IC_STORE_ERRORS.FORBIDDEN, 'save: actor mismatch — a session belongs to one actor.');
    }
    if (record.version !== head.version + 1) {
      return icFailure(IC_STORE_ERRORS.VERSION_CONFLICT, `save: expected version ${head.version + 1}, got ${record.version}.`);
    }
    _store.set(record.convId, [...existing, record]);
    return icSuccess(record);
  },

  list(filter = {}) {
    let items = [..._store.values()].map((v) => v[v.length - 1]);
    if (filter.actorId) items = items.filter((i) => i.actorId === filter.actorId);
    if (filter.status) items = items.filter((i) => i.status === filter.status);
    return icSuccess(Object.freeze(items));
  },
});

/** Test/teardown helper. */
export function resetMemoryIntelligenceConversationBackend() {
  _store.clear();
}
