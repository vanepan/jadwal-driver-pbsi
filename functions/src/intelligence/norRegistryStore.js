'use strict';

/* ============================================================
   functions/src/intelligence/norRegistryStore.js — Phase 5

   Server-owned persistence for the CANONICAL NOR Registry at
   /intelligence_nor_registry/{norId} (RTDB rule ".write": false — this
   module, via the Admin SDK, is the ONLY writer; the owner may .read their
   own record).

   PURE over an injected `db` (an Admin SDK database handle, or a fake in a
   test). No auth here — the callable
   (functions/src/intelligence/intelligenceNorRegistry.js) derives the owner
   from the verified Firebase context and calls in.

   ZERO-TRUST CONTENT: `registerFromDraft` / `syncFromDraft` take the FULL
   Phase 4 draft the callable itself re-read from /intelligence_nor_drafts —
   never client-supplied NOR content. The registry never re-computes business
   content; it snapshots the draft (norRegistryContract.registryContentFromDraft).

   LIFECYCLE (norRegistryContract.js is the one authority):
     register  → in_review (v1, NO number)
     sync      → in_review (v+1 immutable version) — only while in_review
     approve   → approved                          — human, only from in_review
     publish   → published (+ atomic official number) — human, only from approved
                 idempotent: a retry on a published record returns it as-is
     published → immutable (edit/approve/publish rejected)

   Mirrors norDraftStore.js byte-for-byte where it can (safe key guard,
   sanitizeForRtdb, rehydrate).
   ============================================================ */

const {
  NOR_RECORD_SCHEMA, NOR_STATUS, NUMBER_SOURCE, NOR_REGISTRY_ERRORS,
  registrySuccess, registryFailure, isNorRecord,
  norIdFromConversation, registryContentFromDraft,
  makeNorRecordFromDraft, appendRegistryVersion, markApproved, markPublished,
} = require('./norRegistryContract');
const { reserveNorNumber, DEFAULT_SCOPE_KEY } = require('./norNumberingCounter');

const PATH = 'intelligence_nor_registry';

/** Same rule as norDraftStore.isSafeDraftId. */
function isSafeNorId(norId) {
  if (typeof norId !== 'string' || norId.length === 0 || norId.length > 200) return false;
  for (let i = 0; i < norId.length; i += 1) {
    const c = norId.charCodeAt(i);
    if (c < 0x20 || c === 0x7f) return false;
    const ch = norId[i];
    if (ch === '.' || ch === '$' || ch === '#' || ch === '[' || ch === ']' || ch === '/' || ch === ' ') return false;
  }
  return true;
}

function nodeRef(db, norId) {
  return db.ref(`${PATH}/${norId}`);
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

function asArray(v) {
  if (Array.isArray(v)) return v;
  if (v && typeof v === 'object') return Object.values(v);
  return [];
}

function rehydrateContent(raw) {
  const c = raw && typeof raw === 'object' ? raw : {};
  const facts = c.facts && typeof c.facts === 'object' && !Array.isArray(c.facts) ? c.facts : {};
  return {
    jenis: c.jenis == null ? null : c.jenis,
    subject: typeof c.subject === 'string' ? c.subject : '',
    recipient: c.recipient == null ? null : c.recipient,
    recipientStatus: c.recipientStatus == null ? null : c.recipientStatus,
    date: c.date == null ? null : c.date,
    body: typeof c.body === 'string' ? c.body : '',
    bodySource: c.bodySource == null ? null : c.bodySource,
    facts,
    draftVersion: typeof c.draftVersion === 'number' ? c.draftVersion : 1,
  };
}

/** Restore the full NorRecord shape after a read — RTDB drops empty
 *  objects/arrays and rejects `undefined`. */
function rehydrate(raw) {
  if (!raw || typeof raw !== 'object') return raw;
  const meta = raw.metadata && typeof raw.metadata === 'object' ? raw.metadata : {};
  return {
    schema: raw.schema || NOR_RECORD_SCHEMA,
    norId: raw.norId || null,
    norNumber: typeof raw.norNumber === 'string' ? raw.norNumber : '',
    sourceModule: raw.sourceModule || 'intelligence',
    sourceFeature: raw.sourceFeature == null ? null : raw.sourceFeature,
    documentType: raw.documentType || 'nor',
    title: typeof raw.title === 'string' ? raw.title : '',
    subject: typeof raw.subject === 'string' ? raw.subject : '',
    recipient: raw.recipient == null ? null : raw.recipient,
    createdAt: raw.createdAt || null,
    createdBy: raw.createdBy == null ? null : raw.createdBy,
    status: raw.status || NOR_STATUS.IN_REVIEW,
    currentVersion: typeof raw.currentVersion === 'number' ? raw.currentVersion : 1,
    // a genuine null pre-publication; a real published version is always >= 1
    publishedVersion: typeof raw.publishedVersion === 'number' && raw.publishedVersion >= 1 ? raw.publishedVersion : null,
    numberSource: raw.numberSource || NUMBER_SOURCE.SYSTEM_SUGGESTED,
    ownerId: raw.ownerId || null,
    content: rehydrateContent(raw.content),
    metadata: {
      draftId: meta.draftId == null ? null : meta.draftId,
      conversationId: meta.conversationId == null ? null : meta.conversationId,
      sourceFeature: meta.sourceFeature == null ? null : meta.sourceFeature,
      suggestedNumber: typeof meta.suggestedNumber === 'string' ? meta.suggestedNumber : '',
      suggestionBasis: meta.suggestionBasis == null ? null : meta.suggestionBasis,
      suggestionConfidence: typeof meta.suggestionConfidence === 'number' ? meta.suggestionConfidence : 0,
      numberAllocation: meta.numberAllocation && typeof meta.numberAllocation === 'object' ? {
        sequence: typeof meta.numberAllocation.sequence === 'number' ? meta.numberAllocation.sequence : null,
        scopeKey: meta.numberAllocation.scopeKey == null ? null : meta.numberAllocation.scopeKey,
        reservationKey: meta.numberAllocation.reservationKey == null ? null : meta.numberAllocation.reservationKey,
        allocatedAt: meta.numberAllocation.allocatedAt == null ? null : meta.numberAllocation.allocatedAt,
        basis: meta.numberAllocation.basis == null ? null : meta.numberAllocation.basis,
      } : null,
    },
    versions: asArray(raw.versions).map((v) => ({
      version: typeof v.version === 'number' ? v.version : 1,
      at: v.at || null,
      actorId: v.actorId == null ? null : v.actorId,
      changeType: v.changeType || null,
      published: v.published === true ? true : undefined,
      content: rehydrateContent(v.content),
    })).map((v) => { if (v.published === undefined) delete v.published; return v; }),
    auditHistory: asArray(raw.auditHistory).map((e) => ({
      type: e.type,
      at: e.at,
      actorId: e.actorId == null ? null : e.actorId,
      fromVersion: typeof e.fromVersion === 'number' ? e.fromVersion : null,
      version: typeof e.version === 'number' ? e.version : null,
      detail: e.detail && typeof e.detail === 'object' ? e.detail : {},
    })),
  };
}

async function readRaw(db, norId) {
  const snap = await nodeRef(db, norId).once('value');
  const val = snap && typeof snap.val === 'function' ? snap.val() : null;
  return val == null ? null : val;
}

/** Read one record (rehydrated). NOT ownership-checked — the callable does that. */
async function getRecord(db, norId) {
  if (!isSafeNorId(norId)) return registryFailure(NOR_REGISTRY_ERRORS.INVALID_RECORD, 'norId is missing or not an RTDB-safe key.');
  const raw = await readRaw(db, norId);
  if (raw == null) return registryFailure(NOR_REGISTRY_ERRORS.NOT_FOUND, `No NOR record "${norId}".`);
  return registrySuccess(rehydrate(raw));
}

/**
 * Get-or-create the canonical record for a Phase 4 draft that has reached
 * requires_review. `draft` is the FULL draft the callable re-read from RTDB;
 * `ownerId` is the verified uid.
 */
async function registerFromDraft(db, { draft, ownerId, now } = {}) {
  if (!draft || typeof draft !== 'object') return registryFailure(NOR_REGISTRY_ERRORS.INVALID_RECORD, 'a draft record is required.');
  const norId = norIdFromConversation(draft.conversationId);
  if (!isSafeNorId(norId)) return registryFailure(NOR_REGISTRY_ERRORS.INVALID_RECORD, 'the draft has no RTDB-safe conversationId.');
  const existing = await readRaw(db, norId);
  if (existing != null) return registrySuccess(rehydrate(existing)); // get-or-create — idempotent
  const record = makeNorRecordFromDraft(draft, { ownerId, now });
  if (!isNorRecord(record)) return registryFailure(NOR_REGISTRY_ERRORS.INVALID_RECORD, 'the built record does not satisfy the NorRecord contract.');
  const clean = sanitizeForRtdb(record);
  await nodeRef(db, norId).set(clean);
  return registrySuccess(rehydrate(clean));
}

/**
 * Snapshot the linked draft into a NEW immutable version — only while
 * `in_review`. A no-op (content unchanged) returns the head, no version
 * bump. `draft` is the FULL draft the callable re-read.
 */
async function syncFromDraft(db, norId, { draft, actorId, at, expectedVersion } = {}) {
  if (!isSafeNorId(norId)) return registryFailure(NOR_REGISTRY_ERRORS.INVALID_RECORD, 'norId is not an RTDB-safe key.');
  if (typeof actorId !== 'string' || !actorId) return registryFailure(NOR_REGISTRY_ERRORS.INVALID_RECORD, 'actorId is required.');
  const raw = await readRaw(db, norId);
  if (raw == null) return registryFailure(NOR_REGISTRY_ERRORS.NOT_FOUND, `No NOR record "${norId}".`);
  const head = rehydrate(raw);
  if (head.status === NOR_STATUS.PUBLISHED) return registryFailure(NOR_REGISTRY_ERRORS.ALREADY_PUBLISHED, 'A published NOR is immutable — subsequent changes re-enter the lifecycle.');
  if (head.status !== NOR_STATUS.IN_REVIEW) return registryFailure(NOR_REGISTRY_ERRORS.ILLEGAL_TRANSITION, `Cannot edit a NOR in status "${head.status}".`);
  if (typeof expectedVersion === 'number' && expectedVersion !== head.currentVersion) {
    return registryFailure(NOR_REGISTRY_ERRORS.VERSION_CONFLICT, `expected version ${expectedVersion}, head is ${head.currentVersion}.`);
  }
  const nextContent = registryContentFromDraft(draft || {});
  const { next, changed } = appendRegistryVersion(head, { nextContent, actorId, at: at || new Date().toISOString() });
  if (!changed) return registrySuccess(head);
  const clean = sanitizeForRtdb(next);
  if (!isNorRecord(clean)) return registryFailure(NOR_REGISTRY_ERRORS.INVALID_RECORD, 'the edited record would be invalid.');
  await nodeRef(db, norId).set(clean);
  return registrySuccess(rehydrate(clean));
}

/** in_review → approved (human). Optimistic concurrency on currentVersion. */
async function approveRecord(db, norId, { expectedVersion, actorId, at } = {}) {
  if (!isSafeNorId(norId)) return registryFailure(NOR_REGISTRY_ERRORS.INVALID_RECORD, 'norId is not an RTDB-safe key.');
  if (typeof actorId !== 'string' || !actorId) return registryFailure(NOR_REGISTRY_ERRORS.INVALID_RECORD, 'actorId is required.');
  const raw = await readRaw(db, norId);
  if (raw == null) return registryFailure(NOR_REGISTRY_ERRORS.NOT_FOUND, `No NOR record "${norId}".`);
  const head = rehydrate(raw);
  if (head.status === NOR_STATUS.PUBLISHED) return registryFailure(NOR_REGISTRY_ERRORS.ALREADY_PUBLISHED, 'This NOR is already published.');
  if (typeof expectedVersion === 'number' && expectedVersion !== head.currentVersion) {
    return registryFailure(NOR_REGISTRY_ERRORS.VERSION_CONFLICT, `expected version ${expectedVersion}, head is ${head.currentVersion}.`);
  }
  const { next, error } = markApproved(head, { actorId, at: at || new Date().toISOString() });
  if (error) return registryFailure(NOR_REGISTRY_ERRORS[error] || NOR_REGISTRY_ERRORS.ILLEGAL_TRANSITION, `approve refused: ${error}.`);
  const clean = sanitizeForRtdb(next);
  await nodeRef(db, norId).set(clean);
  return registrySuccess(rehydrate(clean));
}

/**
 * approved → published (human). Reserves the official number atomically +
 * idempotently (norNumberingCounter.reserveNorNumber, keyed by norId), then
 * transitions. The official number IS the server-reserved sequence — this
 * function takes NO number input from its caller (and the callable takes
 * none from the browser). IDEMPOTENT: a retry on an already-published record
 * returns it unchanged — no second number, no second counter increment.
 */
async function publishRecord(db, norId, { expectedVersion, actorId, at, scopeKey } = {}) {
  if (!isSafeNorId(norId)) return registryFailure(NOR_REGISTRY_ERRORS.INVALID_RECORD, 'norId is not an RTDB-safe key.');
  if (typeof actorId !== 'string' || !actorId) return registryFailure(NOR_REGISTRY_ERRORS.INVALID_RECORD, 'actorId is required.');
  const when = at || new Date().toISOString();
  const raw = await readRaw(db, norId);
  if (raw == null) return registryFailure(NOR_REGISTRY_ERRORS.NOT_FOUND, `No NOR record "${norId}".`);
  const head = rehydrate(raw);
  if (head.status === NOR_STATUS.PUBLISHED) return registrySuccess(head); // idempotent — no second number
  if (head.status !== NOR_STATUS.APPROVED) {
    return registryFailure(NOR_REGISTRY_ERRORS.ILLEGAL_TRANSITION, `publish requires status "approved" (current: "${head.status}").`);
  }
  if (typeof expectedVersion === 'number' && expectedVersion !== head.currentVersion) {
    return registryFailure(NOR_REGISTRY_ERRORS.VERSION_CONFLICT, `expected version ${expectedVersion}, head is ${head.currentVersion}.`);
  }
  const alloc = await reserveNorNumber({ db, reservationKey: norId, scopeKey: scopeKey || DEFAULT_SCOPE_KEY, now: when });
  if (!alloc.ok) return registryFailure(NOR_REGISTRY_ERRORS.NUMBER_RESERVATION_FAILED, (alloc.error && alloc.error.message) || 'number reservation failed');
  const { next, error } = markPublished(head, { allocation: alloc.data, actorId, at: when });
  if (error) return registryFailure(NOR_REGISTRY_ERRORS[error] || NOR_REGISTRY_ERRORS.ILLEGAL_TRANSITION, `publish refused: ${error}.`);
  const clean = sanitizeForRtdb(next);
  await nodeRef(db, norId).set(clean);
  return registrySuccess(rehydrate(clean));
}

/** Every record owned by `ownerId` (uses the .indexOn ["ownerId"] rule). */
async function listByOwner(db, ownerId) {
  if (typeof ownerId !== 'string' || !ownerId) return registryFailure(NOR_REGISTRY_ERRORS.INVALID_RECORD, 'ownerId is required.');
  const snap = await db.ref(PATH).orderByChild('ownerId').equalTo(ownerId).once('value');
  const out = [];
  if (snap && typeof snap.forEach === 'function') {
    snap.forEach((child) => { const v = child.val(); if (v && v.ownerId === ownerId) out.push(rehydrate(v)); });
  } else if (snap && typeof snap.val === 'function') {
    const all = snap.val() || {};
    for (const k of Object.keys(all)) if (all[k] && all[k].ownerId === ownerId) out.push(rehydrate(all[k]));
  }
  return registrySuccess(out);
}

/** Version history (append-only; the published entry is never rewritten). */
async function getHistory(db, norId) {
  const got = await getRecord(db, norId);
  if (!got.ok) return got;
  return registrySuccess(got.data.versions);
}

module.exports = {
  PATH,
  isSafeNorId,
  sanitizeForRtdb,
  rehydrate,
  getRecord,
  registerFromDraft,
  syncFromDraft,
  approveRecord,
  publishRecord,
  listByOwner,
  getHistory,
};
