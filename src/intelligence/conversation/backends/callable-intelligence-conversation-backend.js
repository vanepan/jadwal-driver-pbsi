/* ============================================================
   CALLABLE-INTELLIGENCE-CONVERSATION-BACKEND.JS — Sarpras Intelligence (V2, Phase 2C)

   PURPOSE: an IcBackend (get/save/list) that persists DURABLE conversation
   state SERVER-SIDE, by delegating every operation to the
   `intelligenceConversation` Cloud Function (Admin SDK → RTDB
   /intelligence_conversations/{convId}). The browser never writes that
   node directly (RTDB rule ".write": false); ownership is enforced by the
   function from the verified Firebase context, not by anything the client
   sends.

   This EXTENDS Phase 1 — it implements the SAME
   intelligence-conversation-store-contract.js IcBackend interface as the
   `null` and `memory` backends; the store facade
   (intelligence-conversation-store.js) is unchanged.

   RESPONSIBILITY: createCallableIcBackend({ callConversation }) → a frozen
   backend { id:'callable', version, get, save, list }.

   DEPENDENCIES: ../intelligence-conversation-store-contract.js only.
   `callConversation(payload) => Promise<{ok,data,error}>` is INJECTED — in
   production it is js/firebase.js#callIntelligenceConversation; in tests it
   is a fake wired to the CJS callable's .run().

   NON-GOALS: no ownership logic here (the server owns it), no RTDB access,
   no orchestration. `save()` chooses create vs append from record.version.
   ============================================================ */

'use strict';

import { IC_STORE_ERRORS, icSuccess, icFailure } from '../intelligence-conversation-store-contract.js';

export const CALLABLE_IC_BACKEND_ID = 'callable';

/** Map the function's { ok, data, error } into the store envelope. A
 *  transport that throws (offline, function-not-found) becomes a typed
 *  failure — never propagated. */
function toEnvelope(raw) {
  if (raw && raw.ok === true) return icSuccess(raw.data ?? null);
  if (raw && raw.ok === false && raw.error && typeof raw.error.code === 'string') {
    return icFailure(raw.error.code, raw.error.message || '');
  }
  return icFailure(IC_STORE_ERRORS.INVALID_RECORD, 'conversation function returned an unrecognised result.');
}

/**
 * @param {{ callConversation: (payload: {op:string, convId?:string, record?:object}) => Promise<{ok:boolean,data:*,error:*}> }} opts
 */
export function createCallableIcBackend({ callConversation } = {}) {
  if (typeof callConversation !== 'function') {
    throw new Error('createCallableIcBackend: callConversation port is required.');
  }

  async function call(payload) {
    let raw;
    try {
      raw = await callConversation(payload);
    } catch (err) {
      return icFailure(IC_STORE_ERRORS.NO_BACKEND_CONFIGURED, `conversation function unreachable (${err && err.message ? err.message : 'unknown'}).`);
    }
    return toEnvelope(raw);
  }

  return Object.freeze({
    id: CALLABLE_IC_BACKEND_ID,
    version: 'ic-callable-backend@1',

    /** IcBackend.get — returns a Promise; the store facade awaits it. */
    get(convId) {
      return call({ op: 'get', convId: String(convId || '') });
    },

    /** IcBackend.save — create (version 1) or append (version > 1). */
    save(record) {
      if (!record || typeof record !== 'object') {
        return Promise.resolve(icFailure(IC_STORE_ERRORS.INVALID_RECORD, 'save: record must be an object.'));
      }
      const op = record.version === 1 ? 'create' : 'append';
      return call({ op, record });
    },

    /** IcBackend.list — by the authenticated actor (server ignores any
     *  client-supplied actorId; a filter is advisory only). */
    list() {
      return call({ op: 'list' });
    },
  });
}
