'use strict';

/* ============================================================
   functions/src/intelligence/conversationStore.js — Phase 2C

   Server-owned persistence for multi-turn Intelligence generation state at
   /intelligence_conversations/{convId} (RTDB rule: ".write": false — this
   module, via the Admin SDK, is the ONLY writer; the owner may .read their
   own node).

   PURE over an injected `db` (an Admin SDK database handle, or a fake in a
   test). No auth here — the callable
   (functions/src/intelligence/intelligenceConversation.js) derives the
   owner from the verified Firebase context and calls in.

   RTDB quirks handled explicitly:
     • RTDB drops empty objects/arrays and rejects `undefined` on write, so
       every record is sanitized before .set() and re-hydrated after
       .once() back to the full IntelligenceConversation shape.
     • RTDB keys may not contain . $ # [ ] / or control chars — convId is guarded.

   RESPONSIBILITY: getConversation / createConversation / appendConversation
   / listByActor. Each returns the { ok, data, error } envelope
   (conversationContract.js) with IC_STORE_ERRORS codes.
   ============================================================ */

const {
  isIntelligenceConversation, IC_STORE_ERRORS, icSuccess, icFailure,
  INTELLIGENCE_CONVERSATION_SCHEMA,
} = require('./conversationContract');

const PATH = 'intelligence_conversations';

/** RTDB forbids `.` `$` `#` `[` `]` `/` and control chars in a key; we also
 *  reject whitespace. Hyphen and underscore ARE allowed (push keys use `-`). */
function isSafeConvId(convId) {
  if (typeof convId !== 'string' || convId.length === 0 || convId.length > 200) return false;
  for (let i = 0; i < convId.length; i += 1) {
    const c = convId.charCodeAt(i);
    if (c < 0x20 || c === 0x7f) return false;                 // control chars
    const ch = convId[i];
    if (ch === '.' || ch === '$' || ch === '#' || ch === '[' || ch === ']' || ch === '/' || ch === ' ') return false;
  }
  return true;
}

function nodeRef(db, convId) {
  return db.ref(`${PATH}/${convId}`);
}

/** Deep-strip `undefined` (RTDB rejects it). Empty {}/[] are left as-is;
 *  RTDB still drops them on write, and rehydrate() restores them. */
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

/** Restore the full IntelligenceConversation shape after a read — RTDB will
 *  have dropped any empty object/array field. */
function rehydrate(raw) {
  if (!raw || typeof raw !== 'object') return raw;
  return {
    schema: raw.schema || INTELLIGENCE_CONVERSATION_SCHEMA,
    convId: raw.convId || null,
    version: typeof raw.version === 'number' ? raw.version : 1,
    actorId: raw.actorId || null,
    actorRole: raw.actorRole == null ? null : raw.actorRole,
    sourceModule: raw.sourceModule || 'intelligence',
    sourceFeature: raw.sourceFeature == null ? null : raw.sourceFeature,
    task: raw.task == null ? null : raw.task,
    domainType: raw.domainType == null ? null : raw.domainType,
    openingUtterance: typeof raw.openingUtterance === 'string' ? raw.openingUtterance : '',
    collectedFields: raw.collectedFields && typeof raw.collectedFields === 'object' && !Array.isArray(raw.collectedFields) ? raw.collectedFields : {},
    missingFields: Array.isArray(raw.missingFields) ? raw.missingFields : [],
    status: raw.status || null,
    draft: raw.draft == null ? null : raw.draft,
    numbering: raw.numbering == null ? null : raw.numbering,
    turnCount: typeof raw.turnCount === 'number' ? raw.turnCount : (Array.isArray(raw.turns) ? raw.turns.length : 1),
    turns: Array.isArray(raw.turns) ? raw.turns.map((t) => ({
      turn: t.turn,
      at: t.at,
      answers: t.answers && typeof t.answers === 'object' && !Array.isArray(t.answers) ? t.answers : {},
      status: t.status,
      missingFields: Array.isArray(t.missingFields) ? t.missingFields : [],
      requestId: t.requestId == null ? null : t.requestId,
    })) : [],
    knowledgeRefs: Array.isArray(raw.knowledgeRefs) ? raw.knowledgeRefs : [],
    memoryRefs: Array.isArray(raw.memoryRefs) ? raw.memoryRefs : [],
    createdAt: raw.createdAt || null,
    updatedAt: raw.updatedAt || null,
  };
}

async function readRaw(db, convId) {
  const snap = await nodeRef(db, convId).once('value');
  const val = snap && typeof snap.val === 'function' ? snap.val() : null;
  return val == null ? null : val;
}

/** Read one conversation (rehydrated). NOT ownership-checked — the callable does that. */
async function getConversation(db, convId) {
  if (!isSafeConvId(convId)) return icFailure(IC_STORE_ERRORS.INVALID_RECORD, 'convId is missing or not an RTDB-safe key.');
  const raw = await readRaw(db, convId);
  if (raw == null) return icFailure(IC_STORE_ERRORS.NOT_FOUND, `No conversation "${convId}".`);
  return icSuccess(rehydrate(raw));
}

/** Persist version 1. Refuses if the id is taken. */
async function createConversation(db, record) {
  if (!isIntelligenceConversation(record)) return icFailure(IC_STORE_ERRORS.INVALID_RECORD, 'record does not satisfy the IntelligenceConversation contract.');
  if (record.version !== 1) return icFailure(IC_STORE_ERRORS.INVALID_RECORD, 'a new conversation must start at version 1.');
  if (!isSafeConvId(record.convId)) return icFailure(IC_STORE_ERRORS.INVALID_RECORD, 'convId is not an RTDB-safe key.');
  const existing = await readRaw(db, record.convId);
  if (existing != null) return icFailure(IC_STORE_ERRORS.INVALID_RECORD, `conversation "${record.convId}" already exists.`);
  const clean = sanitizeForRtdb(record);
  await nodeRef(db, record.convId).set(clean);
  return icSuccess(rehydrate(clean));
}

/** Persist version N+1. Enforces same-actor + monotonic version against the stored head. */
async function appendConversation(db, record) {
  if (!isIntelligenceConversation(record)) return icFailure(IC_STORE_ERRORS.INVALID_RECORD, 'record does not satisfy the IntelligenceConversation contract.');
  if (!isSafeConvId(record.convId)) return icFailure(IC_STORE_ERRORS.INVALID_RECORD, 'convId is not an RTDB-safe key.');
  const raw = await readRaw(db, record.convId);
  if (raw == null) return icFailure(IC_STORE_ERRORS.NOT_FOUND, `No conversation "${record.convId}".`);
  const head = rehydrate(raw);
  if (head.actorId !== record.actorId) return icFailure(IC_STORE_ERRORS.FORBIDDEN, 'actor mismatch — a session belongs to one actor.');
  if (record.version !== head.version + 1) return icFailure(IC_STORE_ERRORS.VERSION_CONFLICT, `expected version ${head.version + 1}, got ${record.version}.`);
  const clean = sanitizeForRtdb(record);
  await nodeRef(db, record.convId).set(clean);
  return icSuccess(rehydrate(clean));
}

/** Every conversation owned by `actorId` (uses the .indexOn ["actorId"] rule). */
async function listByActor(db, actorId) {
  if (typeof actorId !== 'string' || !actorId) return icFailure(IC_STORE_ERRORS.INVALID_RECORD, 'actorId is required.');
  const snap = await db.ref(PATH).orderByChild('actorId').equalTo(actorId).once('value');
  const out = [];
  if (snap && typeof snap.forEach === 'function') {
    snap.forEach((child) => { const v = child.val(); if (v && v.actorId === actorId) out.push(rehydrate(v)); });
  } else if (snap && typeof snap.val === 'function') {
    const all = snap.val() || {};
    for (const k of Object.keys(all)) if (all[k] && all[k].actorId === actorId) out.push(rehydrate(all[k]));
  }
  return icSuccess(out);
}

module.exports = {
  PATH,
  isSafeConvId,
  sanitizeForRtdb,
  rehydrate,
  getConversation,
  createConversation,
  appendConversation,
  listByActor,
};
