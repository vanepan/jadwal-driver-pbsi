/* ============================================================
   INTELLIGENCE-CONVERSATION-STORE-CONTRACT.JS — Sarpras Intelligence (V2, Phase 1)

   PURPOSE: the ONE interface every durable-conversation backend implements
   (Null, Memory now; RTDB-backed later), plus the result envelope —
   mirroring src/intelligence/nor-registry/contracts/registry-contract.js.

   RESPONSIBILITY: IC_STORE_ERRORS, icSuccess / icFailure,
   IC_STORE_CONTRACT (method list as data), isIcBackend.

   DEPENDENCIES: none.

   NON-GOALS: no backend implemented here.
   ============================================================ */

'use strict';

export const IC_STORE_SCHEMA = 'intelligence-conversation-store@1';

export const IC_STORE_ERRORS = Object.freeze({
  NO_BACKEND_CONFIGURED: 'NO_BACKEND_CONFIGURED',
  NOT_FOUND: 'NOT_FOUND',
  FORBIDDEN: 'FORBIDDEN',            // actor mismatch — a user may only touch their own sessions
  INVALID_RECORD: 'INVALID_RECORD',
  VERSION_CONFLICT: 'VERSION_CONFLICT',
  NOT_IMPLEMENTED: 'NOT_IMPLEMENTED',
});

export function icSuccess(data) {
  return Object.freeze({ ok: true, data: data ?? null, error: null });
}

export function icFailure(code, message) {
  return Object.freeze({ ok: false, data: null, error: Object.freeze({ code, message: String(message || '') }) });
}

/**
 * @typedef {Object} IcBackend
 * @property {string} id
 * @property {string} version
 * @property {(convId: string) => {ok:boolean,data:*,error:*}} get
 * @property {(record: object) => {ok:boolean,data:*,error:*}} save   - create OR append (record.version drives it)
 * @property {(filter?: object) => {ok:boolean,data:*,error:*}} list
 */

export const IC_STORE_CONTRACT = Object.freeze({
  schema: IC_STORE_SCHEMA,
  methods: Object.freeze(['get', 'save', 'list']),
  errorCodes: IC_STORE_ERRORS,
});

export function isIcBackend(b) {
  if (!b || typeof b !== 'object') return false;
  if (typeof b.id !== 'string' || !b.id) return false;
  return IC_STORE_CONTRACT.methods.every((m) => typeof b[m] === 'function');
}
