/* ============================================================
   INTELLIGENCE-CONVERSATION-STORE.JS — Sarpras Intelligence (V2, Phase 1)

   PURPOSE: the durable-conversation facade (PART 10). The Intelligence
   Service reads and writes multi-turn generation state ONLY through here,
   never a backend directly — mirroring src/intelligence/nor-registry/
   nor-registry.js and src/knowledge/repository/knowledge-repository.js.

   Delegates to the active backend:
     • 'null'     — default; every call NOT_IMPLEMENTED
     • 'memory'   — in-process append-only (tests + client DISABLED mode)
     • 'callable' — Phase 2C: server-owned RTDB state via the
                    `intelligenceConversation` Cloud Function
                    (backends/callable-intelligence-conversation-backend.js)

   ASYNC SINCE PHASE 2C: getConversation / createConversation /
   appendConversation / listConversations return a Promise of the SAME
   { ok, data, error } envelope — so a real (network-backed) backend works
   without changing the contract. The sync memory/null backends are
   `await`ed transparently; their behaviour is unchanged.

   RESPONSIBILITY: backend registry (register/setActive/getActiveId/list/
   reset) + get(convId, actor) / create(record, actor) / append(next, actor)
   with an actor-ownership check applied uniformly regardless of backend.

   DEPENDENCIES: ./intelligence-conversation-store-contract.js,
   ./contracts/intelligence-conversation-contract.js,
   ./backends/null-intelligence-conversation-backend.js.

   NON-GOALS: no recompute logic (the service), no schema (the contract).
   ============================================================ */

'use strict';

import {
  IC_STORE_ERRORS, icFailure, isIcBackend,
} from './intelligence-conversation-store-contract.js';
import { isIntelligenceConversation } from './contracts/intelligence-conversation-contract.js';
import { nullIntelligenceConversationBackend, NULL_IC_BACKEND_ID } from './backends/null-intelligence-conversation-backend.js';
import { createCallableIcBackend, CALLABLE_IC_BACKEND_ID } from './backends/callable-intelligence-conversation-backend.js';

export {
  IC_STORE_ERRORS, IC_STORE_SCHEMA, icSuccess, icFailure, IC_STORE_CONTRACT,
} from './intelligence-conversation-store-contract.js';
export {
  IC_STATUS, makeIntelligenceConversation, appendTurn, isIntelligenceConversation, isTerminalIcStatus,
} from './contracts/intelligence-conversation-contract.js';
export { createCallableIcBackend, CALLABLE_IC_BACKEND_ID } from './backends/callable-intelligence-conversation-backend.js';

/**
 * Phase 2C convenience — register the server-owned RTDB backend and make it
 * active. `callConversation` is js/firebase.js#callIntelligenceConversation
 * in production, a fake in tests.
 * @param {{ callConversation: Function }} opts
 */
export function useCallableIcBackend({ callConversation }) {
  const backend = createCallableIcBackend({ callConversation });
  registerIcBackend(backend);
  setActiveIcBackend(CALLABLE_IC_BACKEND_ID);
  return backend;
}

const _backends = new Map();
let _activeId = null;

export const DEFAULT_IC_BACKEND_ID = NULL_IC_BACKEND_ID;

export function registerIcBackend(backend) {
  if (!isIcBackend(backend)) {
    const err = new Error('registerIcBackend: backend must implement get/save/list.');
    err.code = 'INVALID_BACKEND';
    throw err;
  }
  _backends.set(backend.id, backend);
  if (_activeId === null) _activeId = backend.id;
  return backend;
}

export function setActiveIcBackend(id) {
  if (!_backends.has(id)) {
    const err = new Error(`setActiveIcBackend: no backend "${id}".`);
    err.code = 'UNKNOWN_BACKEND';
    throw err;
  }
  _activeId = id;
  return _backends.get(id);
}

export function getActiveIcBackendId() {
  return _activeId;
}

export function listIcBackends() {
  return Object.freeze([..._backends.values()].map((b) => Object.freeze({ id: b.id, version: b.version, active: b.id === _activeId })));
}

export function resetIcStore() {
  _backends.clear();
  _activeId = null;
  registerIcBackend(nullIntelligenceConversationBackend);
  setActiveIcBackend(DEFAULT_IC_BACKEND_ID);
}

function active() {
  return _backends.get(_activeId) || null;
}

/**
 * Read one session, enforcing that `actorId` owns it. A cross-actor read is
 * FORBIDDEN, not NOT_FOUND — the caller learns the id exists but is not
 * theirs only if a test needs it; production maps both to "no session".
 */
export async function getConversation(convId, actorId) {
  const backend = active();
  if (!backend) return icFailure(IC_STORE_ERRORS.NO_BACKEND_CONFIGURED, 'No active IntelligenceConversation backend.');
  const res = await backend.get(convId);
  if (!res.ok) return res;
  if (actorId && res.data && res.data.actorId !== actorId) {
    return icFailure(IC_STORE_ERRORS.FORBIDDEN, 'This conversation belongs to another user.');
  }
  return res;
}

/** Persist the first version of a session. */
export async function createConversation(record) {
  const backend = active();
  if (!backend) return icFailure(IC_STORE_ERRORS.NO_BACKEND_CONFIGURED, 'No active IntelligenceConversation backend.');
  if (!isIntelligenceConversation(record) || record.version !== 1) {
    return icFailure(IC_STORE_ERRORS.INVALID_RECORD, 'createConversation: expected a version-1 IntelligenceConversation.');
  }
  return backend.save(record);
}

/** Persist the next version, enforcing actor ownership against the stored head. */
export async function appendConversation(nextRecord, actorId) {
  const backend = active();
  if (!backend) return icFailure(IC_STORE_ERRORS.NO_BACKEND_CONFIGURED, 'No active IntelligenceConversation backend.');
  if (!isIntelligenceConversation(nextRecord)) {
    return icFailure(IC_STORE_ERRORS.INVALID_RECORD, 'appendConversation: not an IntelligenceConversation.');
  }
  const head = await backend.get(nextRecord.convId);
  if (!head.ok) return head;
  if (head.data.actorId !== nextRecord.actorId || (actorId && head.data.actorId !== actorId)) {
    return icFailure(IC_STORE_ERRORS.FORBIDDEN, 'appendConversation: actor mismatch.');
  }
  return backend.save(nextRecord);
}

export async function listConversations(filter) {
  const backend = active();
  if (!backend) return icFailure(IC_STORE_ERRORS.NO_BACKEND_CONFIGURED, 'No active IntelligenceConversation backend.');
  return backend.list(filter || {});
}

/* ── bootstrap ─────────────────────────────────────────────────────────── */
registerIcBackend(nullIntelligenceConversationBackend);
setActiveIcBackend(DEFAULT_IC_BACKEND_ID);
