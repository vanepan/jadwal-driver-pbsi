/* ============================================================
   NOR-DRAFT-STORE.JS — Sarpras Intelligence (V2, Phase 4)

   The durable NOR-draft facade. The Intelligence Service and the console
   read/write the persistent, human-reviewable NOR draft ONLY through here,
   never a backend directly — mirroring
   src/intelligence/conversation/intelligence-conversation-store.js.

   Delegates to the active backend:
     • 'null'     — default; every call NOT_IMPLEMENTED
     • 'memory'   — in-process version history (tests + client DISABLED mode)
     • 'callable' — Phase 4: server-owned RTDB state via the
                    `intelligenceNorDraft` Cloud Function
                    (backends/callable-nor-draft-backend.js)

   Every method returns a Promise of the { ok, data, error } envelope
   (nor-draft-store-contract.js). The sync null/memory backends are awaited
   transparently.

   RESPONSIBILITY: backend registry (register/setActive/getActiveId/list/
   reset) + getDraft(draftId, actor) / createDraft(record, actor) /
   updateDraft(draftId, edits, actor) / listDrafts(actor) — with an
   owner-ownership check applied uniformly regardless of backend. The
   authoritative ownership check still lives server-side in the callable;
   this is defence in depth for the memory/test path.

   NON-GOALS: no recompute (the service), no schema (the record contract),
   no publish / number / approve — those do not exist on this contract.
   ============================================================ */

'use strict';

import {
  DRAFT_STORE_ERRORS, draftFailure, isNorDraftBackend,
} from './contracts/nor-draft-store-contract.js';
import { isNorDraftRecord } from './contracts/nor-draft-record-contract.js';
import { nullNorDraftBackend, NULL_NOR_DRAFT_BACKEND_ID } from './backends/null-nor-draft-backend.js';
import { createCallableNorDraftBackend, CALLABLE_NOR_DRAFT_BACKEND_ID } from './backends/callable-nor-draft-backend.js';

export {
  DRAFT_STORE_ERRORS, NOR_DRAFT_STORE_SCHEMA, draftSuccess, draftFailure, NOR_DRAFT_STORE_CONTRACT,
} from './contracts/nor-draft-store-contract.js';
export {
  NOR_DRAFT_SCHEMA, NOR_DRAFT_STATUS, NOR_DRAFT_FIELDS, DRAFT_FACT_FIELDS, DRAFT_EDITABLE_FIELDS,
  DRAFT_AUDIT_EVENTS, makeNorDraftRecord, applyDraftEdits, sanitizeDraftEdits, isNorDraftRecord,
} from './contracts/nor-draft-record-contract.js';
export { createCallableNorDraftBackend, CALLABLE_NOR_DRAFT_BACKEND_ID } from './backends/callable-nor-draft-backend.js';

/**
 * Phase 4 convenience — register the server-owned RTDB backend and make it
 * active. `callDraft` is js/firebase.js#callIntelligenceNorDraft in
 * production, a fake in tests.
 * @param {{ callDraft: Function }} opts
 */
export function useCallableNorDraftBackend({ callDraft }) {
  const backend = createCallableNorDraftBackend({ callDraft });
  registerNorDraftBackend(backend);
  setActiveNorDraftBackend(CALLABLE_NOR_DRAFT_BACKEND_ID);
  return backend;
}

const _backends = new Map();
let _activeId = null;

export const DEFAULT_NOR_DRAFT_BACKEND_ID = NULL_NOR_DRAFT_BACKEND_ID;

export function registerNorDraftBackend(backend) {
  if (!isNorDraftBackend(backend)) {
    const err = new Error('registerNorDraftBackend: backend must implement get/create/update/list.');
    err.code = 'INVALID_BACKEND';
    throw err;
  }
  _backends.set(backend.id, backend);
  if (_activeId === null) _activeId = backend.id;
  return backend;
}

export function setActiveNorDraftBackend(id) {
  if (!_backends.has(id)) {
    const err = new Error(`setActiveNorDraftBackend: no backend "${id}".`);
    err.code = 'UNKNOWN_BACKEND';
    throw err;
  }
  _activeId = id;
  return _backends.get(id);
}

export function getActiveNorDraftBackendId() {
  return _activeId;
}

export function listNorDraftBackends() {
  return Object.freeze([..._backends.values()].map((b) => Object.freeze({ id: b.id, version: b.version, active: b.id === _activeId })));
}

export function resetNorDraftStore() {
  _backends.clear();
  _activeId = null;
  registerNorDraftBackend(nullNorDraftBackend);
  setActiveNorDraftBackend(DEFAULT_NOR_DRAFT_BACKEND_ID);
}

function active() {
  return _backends.get(_activeId) || null;
}

function actorId(actor) {
  if (!actor) return null;
  if (typeof actor === 'string') return actor;
  return actor.userId || actor.uid || actor.actorId || actor.id || null;
}

/** Read one draft, enforcing that `actor` owns it. Cross-owner → FORBIDDEN. */
export async function getDraft(draftId, actor) {
  const backend = active();
  if (!backend) return draftFailure(DRAFT_STORE_ERRORS.NO_BACKEND_CONFIGURED, 'No active NOR-draft backend.');
  const res = await backend.get(String(draftId || ''));
  if (!res.ok) return res;
  const who = actorId(actor);
  if (who && res.data && res.data.ownerId && res.data.ownerId !== who) {
    return draftFailure(DRAFT_STORE_ERRORS.FORBIDDEN, 'This draft belongs to another user.');
  }
  return res;
}

/** Persist a new version-1 draft. */
export async function createDraft(record, actor) {
  const backend = active();
  if (!backend) return draftFailure(DRAFT_STORE_ERRORS.NO_BACKEND_CONFIGURED, 'No active NOR-draft backend.');
  const who = actorId(actor);
  const toSave = who && record && !record.ownerId ? { ...record, ownerId: who } : record;
  if (!isNorDraftRecord(toSave) || toSave.version !== 1) {
    return draftFailure(DRAFT_STORE_ERRORS.INVALID_RECORD, 'createDraft: expected a version-1 NorDraft record.');
  }
  return backend.create(toSave);
}

/** Apply a reviewer's edits to their own draft. */
export async function updateDraft(draftId, edits, actor, ctx = {}) {
  const backend = active();
  if (!backend) return draftFailure(DRAFT_STORE_ERRORS.NO_BACKEND_CONFIGURED, 'No active NOR-draft backend.');
  const who = actorId(actor);
  if (!who) return draftFailure(DRAFT_STORE_ERRORS.INVALID_RECORD, 'updateDraft: an actor is required.');
  // defence-in-depth ownership check for the non-server path
  const head = await backend.get(String(draftId || ''));
  if (!head.ok) return head;
  if (head.data && head.data.ownerId && head.data.ownerId !== who) {
    return draftFailure(DRAFT_STORE_ERRORS.FORBIDDEN, 'This draft belongs to another user.');
  }
  return backend.update(String(draftId || ''), edits && typeof edits === 'object' ? edits : {}, {
    actorId: who,
    at: ctx.at || new Date().toISOString(),
    expectedVersion: typeof ctx.expectedVersion === 'number' ? ctx.expectedVersion : undefined,
  });
}

/** Every draft the actor owns. */
export async function listDrafts(actor) {
  const backend = active();
  if (!backend) return draftFailure(DRAFT_STORE_ERRORS.NO_BACKEND_CONFIGURED, 'No active NOR-draft backend.');
  return backend.list(actorId(actor));
}

/* ── bootstrap ─────────────────────────────────────────────────────────── */
registerNorDraftBackend(nullNorDraftBackend);
setActiveNorDraftBackend(DEFAULT_NOR_DRAFT_BACKEND_ID);
