/* ============================================================
   NOR-DRAFT-STORE-CONTRACT.JS — Sarpras Intelligence (V2, Phase 4)

   The ONE interface every NOR-draft persistence backend implements
   (null / memory / callable), plus the { ok, data, error } result
   envelope — mirroring
   src/intelligence/conversation/intelligence-conversation-store-contract.js.

   RESPONSIBILITY: DRAFT_STORE_ERRORS, draftSuccess / draftFailure,
   NOR_DRAFT_STORE_CONTRACT (method list as data), isNorDraftBackend.
   PURE — no I/O.

   The error-code set is byte-mirrored in the CJS
   functions/src/intelligence/norDraftContract.js (drift-guarded by
   scripts/intelligence-nor-draft-check.cjs).
   ============================================================ */

'use strict';

export const NOR_DRAFT_STORE_SCHEMA = 'intelligence-nor-draft-store@1';

export const DRAFT_STORE_ERRORS = Object.freeze({
  NO_BACKEND_CONFIGURED: 'NO_BACKEND_CONFIGURED',
  NOT_FOUND: 'NOT_FOUND',
  FORBIDDEN: 'FORBIDDEN',            // owner mismatch — a user may only touch their own drafts
  INVALID_RECORD: 'INVALID_RECORD',
  VERSION_CONFLICT: 'VERSION_CONFLICT',
  NOT_IMPLEMENTED: 'NOT_IMPLEMENTED',
});

export function draftSuccess(data) {
  return Object.freeze({ ok: true, data: data === undefined ? null : data, error: null });
}

export function draftFailure(code, message) {
  return Object.freeze({ ok: false, data: null, error: Object.freeze({ code, message: String(message || '') }) });
}

/**
 * @typedef {Object} NorDraftBackend
 * @property {string} id
 * @property {string} version
 * @property {(draftId: string) => Promise<{ok:boolean,data:*,error:*}>} get
 * @property {(record: object) => Promise<{ok:boolean,data:*,error:*}>} create
 * @property {(draftId: string, edits: object, ctx: object) => Promise<{ok:boolean,data:*,error:*}>} update
 * @property {(ownerId: string) => Promise<{ok:boolean,data:*,error:*}>} list
 */

export const NOR_DRAFT_STORE_CONTRACT = Object.freeze({
  schema: NOR_DRAFT_STORE_SCHEMA,
  methods: Object.freeze(['get', 'create', 'update', 'list']),
  errorCodes: DRAFT_STORE_ERRORS,
});

export function isNorDraftBackend(b) {
  if (!b || typeof b !== 'object') return false;
  if (typeof b.id !== 'string' || !b.id) return false;
  return NOR_DRAFT_STORE_CONTRACT.methods.every((m) => typeof b[m] === 'function');
}
