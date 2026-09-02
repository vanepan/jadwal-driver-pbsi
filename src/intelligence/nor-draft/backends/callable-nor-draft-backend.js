/* ============================================================
   CALLABLE-NOR-DRAFT-BACKEND.JS — Sarpras Intelligence (V2, Phase 4)

   A NorDraftBackend that persists the human-reviewable NOR draft
   SERVER-SIDE, by delegating every operation to the `intelligenceNorDraft`
   Cloud Function (Admin SDK → RTDB /intelligence_nor_drafts/{draftId}). The
   browser never writes that node directly (RTDB rule ".write": false);
   ownership is enforced by the function from the verified Firebase context,
   not by anything the client sends.

   Direct sibling of callable-intelligence-conversation-backend.js — same
   idiom: map the function's { ok, data, error } into the store envelope; a
   transport that throws (offline, function-not-found, permission-denied)
   becomes a typed failure and is NEVER re-thrown.

   RESPONSIBILITY: createCallableNorDraftBackend({ callDraft }) → a frozen
   backend { id:'callable', version, get, create, update, list }.
   `callDraft(payload) => Promise<{ok,data,error}>` is INJECTED — in
   production it is js/firebase.js#callIntelligenceNorDraft; in tests it is
   a fake wired to the CJS callable's .run().
   ============================================================ */

'use strict';

import { DRAFT_STORE_ERRORS, draftSuccess, draftFailure } from '../contracts/nor-draft-store-contract.js';

export const CALLABLE_NOR_DRAFT_BACKEND_ID = 'callable';

/** Map the function's { ok, data, error } into the store envelope. */
function toEnvelope(raw) {
  if (raw && raw.ok === true) return draftSuccess(raw.data === undefined ? null : raw.data);
  if (raw && raw.ok === false && raw.error && typeof raw.error.code === 'string') {
    return draftFailure(raw.error.code, raw.error.message || '');
  }
  return draftFailure(DRAFT_STORE_ERRORS.INVALID_RECORD, 'nor-draft function returned an unrecognised result.');
}

/**
 * @param {{ callDraft: (payload: {op:string, draftId?:string, record?:object, edits?:object, expectedVersion?:number}) => Promise<{ok:boolean,data:*,error:*}> }} opts
 */
export function createCallableNorDraftBackend({ callDraft } = {}) {
  if (typeof callDraft !== 'function') {
    throw new Error('createCallableNorDraftBackend: callDraft port is required.');
  }

  // Firebase httpsCallable rejects with an HttpsError carrying `.code`
  // ('unauthenticated', 'permission-denied', 'invalid-argument',
  // 'not-found', 'functions/not-found'). Map those; anything else
  // (offline, DNS, 5xx) is a transport failure. Never rethrows.
  function fromThrow(err) {
    const code = err && typeof err.code === 'string' ? err.code : '';
    const msg = err && err.message ? err.message : 'unknown';
    if (/permission-denied/.test(code)) return draftFailure(DRAFT_STORE_ERRORS.FORBIDDEN, msg);
    if (/invalid-argument/.test(code)) return draftFailure(DRAFT_STORE_ERRORS.INVALID_RECORD, msg);
    if (/not-found/.test(code)) return draftFailure(DRAFT_STORE_ERRORS.NOT_FOUND, msg);
    return draftFailure(DRAFT_STORE_ERRORS.NO_BACKEND_CONFIGURED, `nor-draft function unavailable (${code || msg}).`);
  }

  async function call(payload) {
    let raw;
    try {
      raw = await callDraft(payload);
    } catch (err) {
      return fromThrow(err);
    }
    return toEnvelope(raw);
  }

  return Object.freeze({
    id: CALLABLE_NOR_DRAFT_BACKEND_ID,
    version: 'nor-draft-callable-backend@1',

    get(draftId) {
      return call({ op: 'get', draftId: String(draftId || '') });
    },

    create(record) {
      if (!record || typeof record !== 'object') {
        return Promise.resolve(draftFailure(DRAFT_STORE_ERRORS.INVALID_RECORD, 'create: record must be an object.'));
      }
      return call({ op: 'create', record });
    },

    update(draftId, edits, ctx = {}) {
      const payload = { op: 'update', draftId: String(draftId || ''), edits: edits && typeof edits === 'object' ? edits : {} };
      if (ctx && typeof ctx.expectedVersion === 'number') payload.expectedVersion = ctx.expectedVersion;
      return call(payload);
    },

    /** by the authenticated owner — the server ignores any client-supplied id. */
    list() {
      return call({ op: 'list' });
    },
  });
}
