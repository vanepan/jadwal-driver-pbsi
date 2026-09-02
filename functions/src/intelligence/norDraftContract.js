'use strict';

/* ============================================================
   functions/src/intelligence/norDraftContract.js — Phase 4
   — CJS mirror of the SERVER-relevant parts of
     src/intelligence/nor-draft/contracts/nor-draft-record-contract.js

   The Functions runtime is CJS and self-contained; it cannot import the
   browser-ESM contracts. This mirrors ONLY what the server needs to
   validate a NOR draft it is about to persist and to speak the same
   { ok, data, error } envelope. Kept byte-equivalent to the ESM original
   by the drift test in scripts/intelligence-nor-draft-check.cjs —
   change one, change both.

   A NOR draft is the persistent, human-reviewable object produced when an
   Intelligence conversation reaches `requires_review`. It is NOT a
   published NOR: `numbering.publishedNumber` is ALWAYS null; there is no
   publish/approve/number operation on this contract.
   ============================================================ */

const NOR_DRAFT_SCHEMA = 'intelligence-nor-draft@1';

/** The one status this phase produces — the durable equivalent of the
 *  `requires_review` response status. */
const NOR_DRAFT_STATUS = Object.freeze({
  REQUIRES_REVIEW: 'requires_review',
});
const NOR_DRAFT_STATUS_LIST = Object.freeze(Object.values(NOR_DRAFT_STATUS));

/** Structured intake facts kept SEPARATE from the generated body. */
const DRAFT_FACT_FIELDS = Object.freeze(['item', 'quantity', 'unit', 'purpose', 'budget']);

/** What a human reviewer may edit. Recipient stays distinct from purpose. */
const DRAFT_EDITABLE_FIELDS = Object.freeze([...DRAFT_FACT_FIELDS, 'recipient', 'subject', 'date', 'body']);

const NOR_DRAFT_FIELDS = Object.freeze([
  'schema', 'draftId', 'conversationId', 'version', 'ownerId', 'status',
  'jenis', 'subject', 'recipient', 'recipientStatus', 'date',
  'facts', 'body', 'numbering', 'provenance', 'humanEdited', 'auditTrail',
  'createdAt', 'updatedAt',
]);

const DRAFT_AUDIT_EVENTS = Object.freeze(['AI_DRAFT_CREATED', 'AI_DRAFT_EDITED']);

function isPlainObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/** Structural check — the CJS twin of ESM isNorDraftRecord(). */
function isNorDraftRecord(d) {
  if (!isPlainObject(d)) return false;
  if (d.schema !== NOR_DRAFT_SCHEMA) return false;
  if (typeof d.draftId !== 'string' || !d.draftId) return false;
  if (typeof d.conversationId !== 'string' || !d.conversationId) return false;
  if (typeof d.ownerId !== 'string' || !d.ownerId) return false;
  if (typeof d.version !== 'number' || d.version < 1) return false;
  if (!NOR_DRAFT_STATUS_LIST.includes(d.status)) return false;
  if (!isPlainObject(d.facts)) return false;
  if (typeof d.body !== 'string') return false;
  if (!isPlainObject(d.numbering)) return false;
  // the safety invariant, enforced structurally
  if (d.numbering.publishedNumber !== null && d.numbering.publishedNumber !== undefined) return false;
  if (!Array.isArray(d.auditTrail) || d.auditTrail.length < 1) return false;
  return NOR_DRAFT_FIELDS.every((f) => f in d);
}

/** The edits a valid `update` op may carry — only DRAFT_EDITABLE_FIELDS,
 *  each a non-empty string or a finite number; anything else is dropped. */
function sanitizeDraftEdits(edits) {
  const out = {};
  if (!isPlainObject(edits)) return out;
  for (const k of DRAFT_EDITABLE_FIELDS) {
    if (!(k in edits)) continue;
    const v = edits[k];
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
    else if (typeof v === 'string' && v.trim() !== '') out[k] = v.trim();
    else if (v === '' || v === null) out[k] = ''; // an explicit clear is allowed for optional text
  }
  return out;
}

/* ── store result envelope (twin of nor-draft-store-contract.js) ── */

const DRAFT_STORE_ERRORS = Object.freeze({
  NO_BACKEND_CONFIGURED: 'NO_BACKEND_CONFIGURED',
  NOT_FOUND: 'NOT_FOUND',
  FORBIDDEN: 'FORBIDDEN',
  INVALID_RECORD: 'INVALID_RECORD',
  VERSION_CONFLICT: 'VERSION_CONFLICT',
  NOT_IMPLEMENTED: 'NOT_IMPLEMENTED',
});

function draftSuccess(data) {
  return Object.freeze({ ok: true, data: data == null ? null : data, error: null });
}
function draftFailure(code, message) {
  return Object.freeze({ ok: false, data: null, error: Object.freeze({ code, message: String(message || '') }) });
}

module.exports = {
  NOR_DRAFT_SCHEMA,
  NOR_DRAFT_STATUS,
  NOR_DRAFT_STATUS_LIST,
  NOR_DRAFT_FIELDS,
  DRAFT_FACT_FIELDS,
  DRAFT_EDITABLE_FIELDS,
  DRAFT_AUDIT_EVENTS,
  isNorDraftRecord,
  sanitizeDraftEdits,
  DRAFT_STORE_ERRORS,
  draftSuccess,
  draftFailure,
};
