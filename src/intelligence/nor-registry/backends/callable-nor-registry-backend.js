/* ============================================================
   CALLABLE-NOR-REGISTRY-BACKEND.JS — Canonical NOR Registry (V2, Phase 5)

   A NorRegistryBackend that persists the canonical NOR record SERVER-SIDE by
   delegating every operation to the `intelligenceNorRegistry` Cloud Function
   (Admin SDK → RTDB /intelligence_nor_registry/{norId}). The browser never
   writes that node directly (RTDB rule ".write": false); ownership,
   lifecycle, and the official-number reservation are all enforced by the
   function from the verified Firebase context — NOT by anything the client
   sends.

   Direct sibling of callable-nor-draft-backend.js — same idiom: map the
   function's { ok, data, error } into the RegistryResult envelope; a
   transport that throws (offline, function-not-found, permission-denied)
   becomes a typed failure and is NEVER re-thrown.

   ZERO-TRUST CONTENT: `register` and `appendVersion` send ONLY the id — the
   server re-reads the linked Phase 4 draft and snapshots it. The client
   cannot inject NOR content, an owner, a version, or a number here.

   RESPONSIBILITY: createCallableNorRegistryBackend({ callRegistry }) → a
   frozen backend { id:'callable', version, register, getById, list,
   appendVersion, approve, publish, getHistory }.
   ============================================================ */

'use strict';

import { NOR_REGISTRY_ERRORS, registrySuccess, registryFailure } from '../contracts/registry-contract.js';

export const CALLABLE_NOR_REGISTRY_BACKEND_ID = 'callable';

function toEnvelope(raw) {
  if (raw && raw.ok === true) return registrySuccess(raw.data === undefined ? null : raw.data);
  if (raw && raw.ok === false && raw.error && typeof raw.error.code === 'string') {
    return registryFailure(raw.error.code, raw.error.message || '');
  }
  return registryFailure(NOR_REGISTRY_ERRORS.INVALID_RECORD, 'nor-registry function returned an unrecognised result.');
}

/**
 * @param {{ callRegistry: (payload: {op:string, norId?:string, draftId?:string, expectedVersion?:number}) => Promise<{ok:boolean,data:*,error:*}> }} opts
 */
export function createCallableNorRegistryBackend({ callRegistry } = {}) {
  if (typeof callRegistry !== 'function') {
    throw new Error('createCallableNorRegistryBackend: callRegistry port is required.');
  }

  function fromThrow(err) {
    const code = err && typeof err.code === 'string' ? err.code : '';
    const msg = err && err.message ? err.message : 'unknown';
    if (/permission-denied/.test(code)) return registryFailure(NOR_REGISTRY_ERRORS.FORBIDDEN, msg);
    if (/invalid-argument/.test(code)) return registryFailure(NOR_REGISTRY_ERRORS.INVALID_RECORD, msg);
    if (/not-found/.test(code)) return registryFailure(NOR_REGISTRY_ERRORS.NOT_FOUND, msg);
    if (/failed-precondition|aborted/.test(code)) return registryFailure(NOR_REGISTRY_ERRORS.ILLEGAL_TRANSITION, msg);
    return registryFailure(NOR_REGISTRY_ERRORS.NO_BACKEND_CONFIGURED, `nor-registry function unavailable (${code || msg}).`);
  }

  async function call(payload) {
    let raw;
    try {
      raw = await callRegistry(payload);
    } catch (err) {
      return fromThrow(err);
    }
    return toEnvelope(raw);
  }

  return Object.freeze({
    id: CALLABLE_NOR_REGISTRY_BACKEND_ID,
    version: 'nor-registry-callable-backend@1',

    /** register({ draft }) — only the draftId crosses the wire; the server
     *  re-reads /intelligence_nor_drafts/{draftId}, verifies the owner, and
     *  builds the canonical record itself. */
    register(input) {
      const draft = input && typeof input === 'object' ? input.draft : null;
      const draftId = (draft && draft.draftId) || (input && input.draftId) || '';
      if (!draftId) {
        return Promise.resolve(registryFailure(NOR_REGISTRY_ERRORS.INVALID_RECORD, 'register: a draftId is required.'));
      }
      return call({ op: 'register', draftId: String(draftId) });
    },

    getById(norId) {
      return call({ op: 'get', norId: String(norId || '') });
    },

    list() {
      return call({ op: 'list' });
    },

    /** appendVersion(norId, { expectedVersion }) — the server re-reads the
     *  linked draft and appends a version only if the content changed. */
    appendVersion(norId, input = {}) {
      const payload = { op: 'sync', norId: String(norId || '') };
      if (input && typeof input.expectedVersion === 'number') payload.expectedVersion = input.expectedVersion;
      return call(payload);
    },

    approve(norId, ctx = {}) {
      const payload = { op: 'approve', norId: String(norId || '') };
      if (ctx && typeof ctx.expectedVersion === 'number') payload.expectedVersion = ctx.expectedVersion;
      return call(payload);
    },

    // NO number input: the official number is the server-reserved sequence.
    publish(norId, ctx = {}) {
      const payload = { op: 'publish', norId: String(norId || '') };
      if (ctx && typeof ctx.expectedVersion === 'number') payload.expectedVersion = ctx.expectedVersion;
      return call(payload);
    },

    getHistory(norId) {
      return call({ op: 'history', norId: String(norId || '') });
    },
  });
}
