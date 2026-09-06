'use strict';

/* ============================================================
   functions/src/intelligence/corpusStore.js — Phase 5.x.1

   Server-owned persistence for the historical NOR / Memorandum corpus:
     /intelligence_corpus_documents/{documentId}
     /intelligence_corpus_observations/{observationId}

   Both RTDB nodes are ".write": false — this module, via the Admin SDK,
   is the ONLY writer; the owner (ownerId === auth.uid) may .read their
   own records. Mirrors norDraftStore.js byte-for-byte where it can (safe
   key guard, sanitizeForRtdb, rehydrate, orderByChild('ownerId')).

   PURE over an injected `db` (an Admin SDK database handle, or a fake in
   a test). No auth here — the callable
   (functions/src/intelligence/intelligenceCorpus.js) derives the owner
   from the verified Firebase context and calls in.

   HARD SAFETY (Phase 5.x.1 §2, §9, §12, §15):
     • ingestDocument is GET-OR-CREATE by content checksum — a byte-
       identical re-ingest returns the EXISTING document ({ duplicate:
       true }) and NEVER overwrites it.
     • recordObservation ALWAYS persists lifecycleState 'observed'. There
       is NO method that moves an observation toward 'approved'.
     • setAnalysisStatus is graph-validated (§11) — that is the FILE
       processing lifecycle, never organizational approval.
     • no knowledge write, no numbering counter, no feature-flag read,
       no OpenAI call, no V1 / Petty Cash reference.
   ============================================================ */

const {
  CORPUS_STORE_ERRORS, corpusSuccess, corpusFailure,
  makeCorpusDocument, isCorpusDocument, corpusDocumentIdFromChecksum,
  canAnalysisTransition, CORPUS_INGESTION_STATUS,
  CORPUS_DOCUMENT_TYPE, CORPUS_DOCUMENT_ERA,
  makeCorpusObservation, isCorpusObservation,
  OBSERVATION_LIFECYCLE, observationIdFrom, mergeObservationOccurrence,
} = require('./corpusContract');

const PATH_DOCS = 'intelligence_corpus_documents';
const PATH_OBS = 'intelligence_corpus_observations';

/** Same rule as norDraftStore.isSafeDraftId. */
function isSafeCorpusId(id) {
  if (typeof id !== 'string' || id.length === 0 || id.length > 300) return false;
  for (let i = 0; i < id.length; i += 1) {
    const c = id.charCodeAt(i);
    if (c < 0x20 || c === 0x7f) return false;
    const ch = id[i];
    if (ch === '.' || ch === '$' || ch === '#' || ch === '[' || ch === ']' || ch === '/' || ch === ' ') return false;
  }
  return true;
}

function docRef(db, id) { return db.ref(`${PATH_DOCS}/${id}`); }
function obsRef(db, id) { return db.ref(`${PATH_OBS}/${id}`); }

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

async function readRaw(ref) {
  const snap = await ref.once('value');
  const val = snap && typeof snap.val === 'function' ? snap.val() : null;
  return val == null ? null : val;
}

/** Restore the full CorpusDocument shape after a read (RTDB drops empties
 *  and rejects undefined). makeCorpusDocument normalises everything else. */
function rehydrateDocument(raw) {
  if (!raw || typeof raw !== 'object') return raw;
  return makeCorpusDocument(raw);
}

function rehydrateObservation(raw) {
  if (!raw || typeof raw !== 'object') return raw;
  const provenance = Array.isArray(raw.provenance)
    ? raw.provenance
    : (raw.provenance && typeof raw.provenance === 'object' ? Object.values(raw.provenance) : []);
  return makeCorpusObservation(Object.assign({}, raw, {
    provenance,
    // a stored record is never anything but 'observed' — but force it on
    // read too, defence in depth.
    lifecycleState: raw.lifecycleState === OBSERVATION_LIFECYCLE.OBSERVED ? raw.lifecycleState : OBSERVATION_LIFECYCLE.OBSERVED,
    approvedBy: null,
    approvedAt: null,
    preferenceRationale: null,
  }));
}

/**
 * Get-or-create the corpus document for a source file, keyed by its
 * content checksum. `seed` is the classification metadata the caller
 * supplied (checksum / type / era / title / filename / pageCount / …);
 * `ownerId` is the verified uid. A re-ingest of the same checksum returns
 * the existing document with `duplicate: true` — NEVER an overwrite (§12).
 */
async function ingestDocument(db, { seed, ownerId, now } = {}) {
  if (!seed || typeof seed !== 'object') {
    return corpusFailure(CORPUS_STORE_ERRORS.INVALID_RECORD, 'a document seed is required.');
  }
  const checksum = String(seed.checksum || '');
  if (!checksum) {
    return corpusFailure(CORPUS_STORE_ERRORS.INVALID_RECORD, 'a non-empty checksum is required (the dedup key).');
  }
  const documentId = corpusDocumentIdFromChecksum(checksum);
  if (!isSafeCorpusId(documentId)) {
    return corpusFailure(CORPUS_STORE_ERRORS.INVALID_RECORD, 'the checksum does not yield an RTDB-safe document id.');
  }
  const existing = await readRaw(docRef(db, documentId));
  if (existing != null) {
    return corpusSuccess({ document: rehydrateDocument(existing), duplicate: true });
  }
  const at = now || new Date().toISOString();
  const owner = ownerId != null ? String(ownerId) : null;
  const document = makeCorpusDocument(Object.assign({}, seed, {
    documentId,
    checksum,
    ownerId: owner,
    duplicateOfId: null,
    createdAt: seed.createdAt || at,
    ingestionStatus: seed.sourceFileId ? CORPUS_INGESTION_STATUS.STORED : CORPUS_INGESTION_STATUS.RECEIVED,
    provenance: {
      ingestedBy: owner,
      ingestedAt: at,
      method: (seed.provenance && seed.provenance.method) || 'upload',
      note: (seed.provenance && seed.provenance.note) || null,
    },
  }));
  if (!isCorpusDocument(document)) {
    return corpusFailure(CORPUS_STORE_ERRORS.INVALID_RECORD, 'the built record does not satisfy the CorpusDocument contract.');
  }
  const clean = sanitizeForRtdb(document);
  await docRef(db, documentId).set(clean);
  return corpusSuccess({ document: rehydrateDocument(clean), duplicate: false });
}

/** Read one document (rehydrated). NOT ownership-checked — the callable does that. */
async function getDocument(db, documentId) {
  if (!isSafeCorpusId(documentId)) return corpusFailure(CORPUS_STORE_ERRORS.INVALID_RECORD, 'documentId is missing or not an RTDB-safe key.');
  const raw = await readRaw(docRef(db, documentId));
  if (raw == null) return corpusFailure(CORPUS_STORE_ERRORS.NOT_FOUND, `No corpus document "${documentId}".`);
  return corpusSuccess(rehydrateDocument(raw));
}

/** Every document owned by `ownerId` (uses the .indexOn ["ownerId"] rule). */
async function listByOwner(db, ownerId) {
  if (typeof ownerId !== 'string' || !ownerId) return corpusFailure(CORPUS_STORE_ERRORS.INVALID_RECORD, 'ownerId is required.');
  const snap = await db.ref(PATH_DOCS).orderByChild('ownerId').equalTo(ownerId).once('value');
  const out = [];
  if (snap && typeof snap.forEach === 'function') {
    snap.forEach((child) => { const v = child.val(); if (v && v.ownerId === ownerId) out.push(rehydrateDocument(v)); });
  } else if (snap && typeof snap.val === 'function') {
    const all = snap.val() || {};
    for (const k of Object.keys(all)) if (all[k] && all[k].ownerId === ownerId) out.push(rehydrateDocument(all[k]));
  }
  return corpusSuccess(out);
}

/** Advance a document's ANALYSIS lifecycle (§11). Graph-validated. */
async function setAnalysisStatus(db, documentId, { to, actorId, at } = {}) {
  if (!isSafeCorpusId(documentId)) return corpusFailure(CORPUS_STORE_ERRORS.INVALID_RECORD, 'documentId is not an RTDB-safe key.');
  const raw = await readRaw(docRef(db, documentId));
  if (raw == null) return corpusFailure(CORPUS_STORE_ERRORS.NOT_FOUND, `No corpus document "${documentId}".`);
  const head = rehydrateDocument(raw);
  if (!canAnalysisTransition(head.analysisStatus, to)) {
    return corpusFailure(CORPUS_STORE_ERRORS.ILLEGAL_TRANSITION, `analysisStatus "${head.analysisStatus}" → "${to}" is not a legal move.`);
  }
  const when = at || new Date().toISOString();
  const next = makeCorpusDocument(Object.assign({}, head, { analysisStatus: to, analyzedAt: when }));
  if (!isCorpusDocument(next)) return corpusFailure(CORPUS_STORE_ERRORS.INVALID_RECORD, 'the updated record would be invalid.');
  const clean = sanitizeForRtdb(next);
  await docRef(db, documentId).set(clean);
  return corpusSuccess(rehydrateDocument(clean));
}

/**
 * Record ONE extracted observation. The observation is ALWAYS stored in
 * lifecycleState 'observed'. Recording the same (document, category, key)
 * again MERGES the evidence (occurrenceCount grows, provenance appends,
 * confidence = max) without ever changing the lifecycle state (§9, §15).
 * `seed.documentId` must reference an existing corpus document.
 */
async function recordObservation(db, { seed, ownerId, now } = {}) {
  if (!seed || typeof seed !== 'object') {
    return corpusFailure(CORPUS_STORE_ERRORS.INVALID_RECORD, 'an observation seed is required.');
  }
  const documentId = String(seed.documentId || '');
  if (!isSafeCorpusId(documentId)) return corpusFailure(CORPUS_STORE_ERRORS.INVALID_RECORD, 'observation.documentId is not an RTDB-safe key.');
  const parent = await readRaw(docRef(db, documentId));
  if (parent == null) return corpusFailure(CORPUS_STORE_ERRORS.NOT_FOUND, `recordObservation: no corpus document "${documentId}".`);

  const at = now || new Date().toISOString();
  const observationId = seed.observationId || observationIdFrom(documentId, seed.category, seed.key);
  if (!isSafeCorpusId(observationId)) return corpusFailure(CORPUS_STORE_ERRORS.INVALID_RECORD, 'the observation does not yield an RTDB-safe id.');

  const fresh = makeCorpusObservation(Object.assign({}, seed, {
    observationId,
    documentId,
    // HARD invariant — the server never writes anything but 'observed'.
    lifecycleState: OBSERVATION_LIFECYCLE.OBSERVED,
    approvedBy: null,
    approvedAt: null,
    preferenceRationale: null,
    createdAt: seed.createdAt || at,
    updatedAt: at,
  }));
  if (!isCorpusObservation(fresh)) {
    return corpusFailure(CORPUS_STORE_ERRORS.INVALID_RECORD, 'the built observation is invalid (every observation needs >= 1 provenance).');
  }

  const existingRaw = await readRaw(obsRef(db, observationId));
  if (existingRaw == null) {
    const clean = sanitizeForRtdb(Object.assign({}, fresh, { ownerId: ownerId != null ? String(ownerId) : null }));
    await obsRef(db, observationId).set(clean);
    return corpusSuccess({ observation: rehydrateObservation(clean), merged: false });
  }
  const existing = rehydrateObservation(existingRaw);
  const { next, changed } = mergeObservationOccurrence(existing, fresh);
  const clean = sanitizeForRtdb(Object.assign({}, next, { ownerId: ownerId != null ? String(ownerId) : (existingRaw.ownerId || null) }));
  await obsRef(db, observationId).set(clean);
  return corpusSuccess({ observation: rehydrateObservation(clean), merged: changed });
}

/**
 * Apply a DERIVED CLASSIFICATION to a corpus document (§6, §7) — the
 * server-authoritative write of documentType / typeConfidence /
 * documentEra / eraConfidence / sourceDate / pageCount produced by the
 * analysis pipeline. Only those six fields can move; everything else on
 * the record is preserved. makeCorpusDocument re-normalises (clamps the
 * confidences, validates the enums, enforces the §5 "unknown era ⇒
 * confidence < 1" invariant). NEVER touches ingestionStatus,
 * analysisStatus, ownerId, or any observation.
 *
 * `patch.sourceDate` is trusted as a DOCUMENT FACT only — the caller
 * (the pipeline) derived it from document CONTENT (§2). This function
 * does not itself read a filename or a timestamp.
 */
async function setClassification(db, documentId, { patch, actorId, at } = {}) {
  if (!isSafeCorpusId(documentId)) return corpusFailure(CORPUS_STORE_ERRORS.INVALID_RECORD, 'documentId is not an RTDB-safe key.');
  const p = patch && typeof patch === 'object' ? patch : {};
  const raw = await readRaw(docRef(db, documentId));
  if (raw == null) return corpusFailure(CORPUS_STORE_ERRORS.NOT_FOUND, `No corpus document "${documentId}".`);
  const head = rehydrateDocument(raw);

  const next = {};
  if (p.documentType != null) {
    if (!Object.values(CORPUS_DOCUMENT_TYPE).includes(p.documentType)) return corpusFailure(CORPUS_STORE_ERRORS.INVALID_RECORD, `unknown documentType "${p.documentType}".`);
    next.documentType = p.documentType;
  }
  if (p.documentEra != null) {
    if (!Object.values(CORPUS_DOCUMENT_ERA).includes(p.documentEra)) return corpusFailure(CORPUS_STORE_ERRORS.INVALID_RECORD, `unknown documentEra "${p.documentEra}".`);
    next.documentEra = p.documentEra;
  }
  if (p.typeConfidence != null) next.typeConfidence = Number(p.typeConfidence);
  if (p.eraConfidence != null) next.eraConfidence = Number(p.eraConfidence);
  if (p.sourceDate !== undefined) next.sourceDate = p.sourceDate == null ? null : String(p.sourceDate);
  if (p.pageCount != null) next.pageCount = Number(p.pageCount);

  const merged = makeCorpusDocument(Object.assign({}, head, next));
  if (!isCorpusDocument(merged)) return corpusFailure(CORPUS_STORE_ERRORS.INVALID_RECORD, 'the classified record would be invalid.');
  const clean = sanitizeForRtdb(merged);
  await docRef(db, documentId).set(clean);
  return corpusSuccess(rehydrateDocument(clean));
}

/** The observations mined from one document (uses .indexOn ["documentId"]). */
async function listObservations(db, documentId) {
  if (!isSafeCorpusId(documentId)) return corpusFailure(CORPUS_STORE_ERRORS.INVALID_RECORD, 'documentId is not an RTDB-safe key.');
  const snap = await db.ref(PATH_OBS).orderByChild('documentId').equalTo(documentId).once('value');
  const out = [];
  if (snap && typeof snap.forEach === 'function') {
    snap.forEach((child) => { const v = child.val(); if (v && v.documentId === documentId) out.push(rehydrateObservation(v)); });
  } else if (snap && typeof snap.val === 'function') {
    const all = snap.val() || {};
    for (const k of Object.keys(all)) if (all[k] && all[k].documentId === documentId) out.push(rehydrateObservation(all[k]));
  }
  return corpusSuccess(out);
}

module.exports = {
  PATH_DOCS,
  PATH_OBS,
  isSafeCorpusId,
  sanitizeForRtdb,
  rehydrateDocument,
  rehydrateObservation,
  ingestDocument,
  getDocument,
  listByOwner,
  setAnalysisStatus,
  setClassification,
  recordObservation,
  listObservations,
};
