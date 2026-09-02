'use strict';

/* ============================================================
   functions/src/intelligence/norDraftStore.js — Phase 4

   Server-owned persistence for the human-reviewable NOR draft at
   /intelligence_nor_drafts/{draftId} (RTDB rule: ".write": false — this
   module, via the Admin SDK, is the ONLY writer; the owner may .read their
   own node).

   PURE over an injected `db` (an Admin SDK database handle, or a fake in a
   test). No auth here — the callable
   (functions/src/intelligence/intelligenceNorDraft.js) derives the owner
   from the verified Firebase context and calls in.

   Mirrors conversationStore.js byte-for-byte where it can (safe key guard,
   sanitizeForRtdb, rehydrate). RESPONSIBILITY: getDraft / createDraft /
   updateDraft / listByOwner — each returns the { ok, data, error } envelope
   (norDraftContract.js) with DRAFT_STORE_ERRORS codes.

   SAFETY: numbering.publishedNumber is forced null on every write. No
   numbering counter is read or advanced here. No NOR Registry write.
   ============================================================ */

const {
  isNorDraftRecord, sanitizeDraftEdits, DRAFT_STORE_ERRORS, draftSuccess, draftFailure,
  NOR_DRAFT_SCHEMA, NOR_DRAFT_STATUS,
} = require('./norDraftContract');

const PATH = 'intelligence_nor_drafts';

/** Same rule as conversationStore.isSafeConvId — RTDB forbids `.` `$` `#`
 *  `[` `]` `/` and control chars; we also reject whitespace. */
function isSafeDraftId(draftId) {
  if (typeof draftId !== 'string' || draftId.length === 0 || draftId.length > 200) return false;
  for (let i = 0; i < draftId.length; i += 1) {
    const c = draftId.charCodeAt(i);
    if (c < 0x20 || c === 0x7f) return false;
    const ch = draftId[i];
    if (ch === '.' || ch === '$' || ch === '#' || ch === '[' || ch === ']' || ch === '/' || ch === ' ') return false;
  }
  return true;
}

function nodeRef(db, draftId) {
  return db.ref(`${PATH}/${draftId}`);
}

function sanitizeForRtdb(value) {
  if (Array.isArray(value)) return value.map(sanitizeForRtdb);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (v === undefined) continue;
      out[k] = sanitizeForRtdb(v);
    }
    return out;
  }
  return value;
}

function rehydrate(raw) {
  if (!raw || typeof raw !== 'object') return raw;
  const numbering = raw.numbering && typeof raw.numbering === 'object' ? raw.numbering : {};
  return {
    schema: raw.schema || NOR_DRAFT_SCHEMA,
    draftId: raw.draftId || null,
    conversationId: raw.conversationId || null,
    version: typeof raw.version === 'number' ? raw.version : 1,
    ownerId: raw.ownerId || null,
    status: raw.status || NOR_DRAFT_STATUS.REQUIRES_REVIEW,
    jenis: raw.jenis == null ? null : raw.jenis,
    subject: typeof raw.subject === 'string' ? raw.subject : '',
    recipient: raw.recipient == null ? null : raw.recipient,
    recipientStatus: raw.recipientStatus == null ? null : raw.recipientStatus,
    date: raw.date == null ? null : raw.date,
    facts: raw.facts && typeof raw.facts === 'object' && !Array.isArray(raw.facts) ? raw.facts : {},
    body: typeof raw.body === 'string' ? raw.body : '',
    numbering: {
      suggestedNumber: typeof numbering.suggestedNumber === 'string' ? numbering.suggestedNumber : '',
      publishedNumber: null, // NEVER anything else, on read as on write
      source: numbering.source || 'system_suggested',
      basis: numbering.basis == null ? null : numbering.basis,
      confidence: typeof numbering.confidence === 'number' ? numbering.confidence : 0,
    },
    provenance: raw.provenance && typeof raw.provenance === 'object' && !Array.isArray(raw.provenance) ? raw.provenance : {},
    humanEdited: raw.humanEdited === true,
    auditTrail: Array.isArray(raw.auditTrail) ? raw.auditTrail.map((e) => ({
      type: e.type,
      at: e.at,
      actorId: e.actorId == null ? null : e.actorId,
      changedFields: Array.isArray(e.changedFields) ? e.changedFields : [],
    })) : [],
    createdAt: raw.createdAt || null,
    updatedAt: raw.updatedAt || null,
  };
}

/** Force the safety invariants on any record about to be written. */
function enforceInvariants(record) {
  const r = { ...record };
  r.numbering = { ...(r.numbering || {}) };
  r.numbering.publishedNumber = null; // hard invariant
  return r;
}

async function readRaw(db, draftId) {
  const snap = await nodeRef(db, draftId).once('value');
  const val = snap && typeof snap.val === 'function' ? snap.val() : null;
  return val == null ? null : val;
}

/** Read one draft (rehydrated). NOT ownership-checked — the callable does that. */
async function getDraft(db, draftId) {
  if (!isSafeDraftId(draftId)) return draftFailure(DRAFT_STORE_ERRORS.INVALID_RECORD, 'draftId is missing or not an RTDB-safe key.');
  const raw = await readRaw(db, draftId);
  if (raw == null) return draftFailure(DRAFT_STORE_ERRORS.NOT_FOUND, `No draft "${draftId}".`);
  return draftSuccess(rehydrate(raw));
}

/** Persist version 1. Refuses if the id is taken. */
async function createDraft(db, record) {
  const clean0 = enforceInvariants(record);
  if (!isNorDraftRecord(clean0)) return draftFailure(DRAFT_STORE_ERRORS.INVALID_RECORD, 'record does not satisfy the NorDraft contract.');
  if (clean0.version !== 1) return draftFailure(DRAFT_STORE_ERRORS.INVALID_RECORD, 'a new draft must start at version 1.');
  if (!isSafeDraftId(clean0.draftId)) return draftFailure(DRAFT_STORE_ERRORS.INVALID_RECORD, 'draftId is not an RTDB-safe key.');
  const existing = await readRaw(db, clean0.draftId);
  if (existing != null) return draftFailure(DRAFT_STORE_ERRORS.INVALID_RECORD, `draft "${clean0.draftId}" already exists.`);
  const clean = sanitizeForRtdb(clean0);
  await nodeRef(db, clean0.draftId).set(clean);
  return draftSuccess(rehydrate(clean));
}

/**
 * Apply a human reviewer's edits. Loads the head, verifies it is version
 * `expectedVersion` (or accepts any if omitted), applies only
 * DRAFT_EDITABLE_FIELDS, bumps the version, marks humanEdited, appends an
 * AI_DRAFT_EDITED audit entry. NEVER touches the source conversation.
 * @param {string} draftId
 * @param {Object} edits
 * @param {{ actorId: string, at: string, expectedVersion?: number }} ctx
 */
async function updateDraft(db, draftId, edits, ctx) {
  if (!isSafeDraftId(draftId)) return draftFailure(DRAFT_STORE_ERRORS.INVALID_RECORD, 'draftId is not an RTDB-safe key.');
  const actorId = ctx && ctx.actorId;
  const at = (ctx && ctx.at) || new Date().toISOString();
  if (typeof actorId !== 'string' || !actorId) return draftFailure(DRAFT_STORE_ERRORS.INVALID_RECORD, 'actorId is required.');
  const raw = await readRaw(db, draftId);
  if (raw == null) return draftFailure(DRAFT_STORE_ERRORS.NOT_FOUND, `No draft "${draftId}".`);
  const head = rehydrate(raw);
  if (ctx && typeof ctx.expectedVersion === 'number' && ctx.expectedVersion !== head.version) {
    return draftFailure(DRAFT_STORE_ERRORS.VERSION_CONFLICT, `expected version ${ctx.expectedVersion}, head is ${head.version}.`);
  }

  const applied = sanitizeDraftEdits(edits);
  const changedFields = [];
  const next = { ...head, facts: { ...head.facts } };
  for (const [k, v] of Object.entries(applied)) {
    if (k === 'item' || k === 'quantity' || k === 'unit' || k === 'purpose' || k === 'budget') {
      if (String(next.facts[k] == null ? '' : next.facts[k]) !== String(v)) changedFields.push(k);
      next.facts[k] = v;
    } else {
      if (String(next[k] == null ? '' : next[k]) !== String(v)) changedFields.push(k);
      next[k] = v;
    }
  }
  if (changedFields.length === 0) {
    // a no-op save still succeeds (idempotent) but does not bump the version
    return draftSuccess(head);
  }

  next.version = head.version + 1;
  next.updatedAt = at;
  next.humanEdited = true;
  next.auditTrail = [...head.auditTrail, { type: 'AI_DRAFT_EDITED', at, actorId, changedFields }];
  const clean = sanitizeForRtdb(enforceInvariants(next));
  if (!isNorDraftRecord(rehydrate(clean))) return draftFailure(DRAFT_STORE_ERRORS.INVALID_RECORD, 'the edited draft would be invalid.');
  await nodeRef(db, draftId).set(clean);
  return draftSuccess(rehydrate(clean));
}

/** Every draft owned by `ownerId` (uses the .indexOn ["ownerId"] rule). */
async function listByOwner(db, ownerId) {
  if (typeof ownerId !== 'string' || !ownerId) return draftFailure(DRAFT_STORE_ERRORS.INVALID_RECORD, 'ownerId is required.');
  const snap = await db.ref(PATH).orderByChild('ownerId').equalTo(ownerId).once('value');
  const out = [];
  if (snap && typeof snap.forEach === 'function') {
    snap.forEach((child) => { const v = child.val(); if (v && v.ownerId === ownerId) out.push(rehydrate(v)); });
  } else if (snap && typeof snap.val === 'function') {
    const all = snap.val() || {};
    for (const k of Object.keys(all)) if (all[k] && all[k].ownerId === ownerId) out.push(rehydrate(all[k]));
  }
  return draftSuccess(out);
}

module.exports = {
  PATH,
  isSafeDraftId,
  sanitizeForRtdb,
  rehydrate,
  enforceInvariants,
  getDraft,
  createDraft,
  updateDraft,
  listByOwner,
};
