/* ============================================================
   MEMORY-CORPUS-BACKEND.JS — NOR & Memorandum Corpus Acquisition
   Foundation (V2, Phase 5.x.1)

   An in-process corpus backend with the REAL rules: content-checksum
   dedup (§12), graph-validated analysis-status transitions (§11), and
   evidence accumulation that NEVER changes an observation's lifecycle
   state (§9, §15). Used by the contract/store tests and by the client in
   DISABLED mode — so a test walks the whole foundation without Firebase
   or the Admin SDK.

   SAFETY mirror of the server (functions/src/intelligence/corpusStore.js):
     • ingestDocument is get-or-create by checksum — a re-ingest returns
       the EXISTING document, never overwrites it
     • recordObservation always persists lifecycleState 'observed'
     • there is NO method that moves an observation toward 'approved'
     • no knowledge write, no numbering, no OpenAI
   ============================================================ */

'use strict';

import { CORPUS_STORE_ERRORS, corpusSuccess, corpusFailure } from '../contracts/corpus-store-contract.js';
import {
  makeCorpusDocument, isCorpusDocument, corpusDocumentIdFromChecksum,
  canAnalysisTransition, CORPUS_INGESTION_STATUS,
} from '../contracts/corpus-document-contract.js';
import {
  makeCorpusObservation, isCorpusObservation,
} from '../contracts/corpus-observation-contract.js';
import { OBSERVATION_LIFECYCLE } from '../contracts/observation-lifecycle-contract.js';
import { observationIdFrom, mergeObservationOccurrence } from '../corpus-observation-record.js';

export const MEMORY_CORPUS_BACKEND_ID = 'memory';
export const MEMORY_CORPUS_BACKEND_VERSION = 'corpus-memory-backend@1';

/** @type {Map<string, object>} documentId -> CorpusDocument */
const _docs = new Map();
/** @type {Map<string, object>} observationId -> CorpusObservation */
const _obs = new Map();

function nowIso(v) {
  return v || new Date().toISOString();
}

export const memoryCorpusBackend = Object.freeze({
  id: MEMORY_CORPUS_BACKEND_ID,
  version: MEMORY_CORPUS_BACKEND_VERSION,

  /** ingestDocument({ doc, ownerId, now }) — get-or-create by checksum. */
  ingestDocument(input) {
    const seed = input && typeof input === 'object' ? input.doc : null;
    if (!seed || typeof seed !== 'object') {
      return corpusFailure(CORPUS_STORE_ERRORS.INVALID_RECORD, 'ingestDocument: a document seed is required.');
    }
    const checksum = String(seed.checksum || '');
    if (!checksum) {
      return corpusFailure(CORPUS_STORE_ERRORS.INVALID_RECORD, 'ingestDocument: a non-empty checksum is required (dedup key).');
    }
    const documentId = corpusDocumentIdFromChecksum(checksum);
    const existing = _docs.get(documentId);
    if (existing) {
      // §12 — a byte-identical re-arrival is NEVER a new logical document
      // and NEVER overwrites the original. It is reported, not stored.
      return corpusSuccess(Object.freeze({ document: existing, duplicate: true }));
    }
    const at = nowIso(input && input.now);
    const ownerId = input && input.ownerId != null ? String(input.ownerId) : (seed.ownerId ?? null);
    const document = makeCorpusDocument({
      ...seed,
      documentId,
      checksum,
      ownerId,
      duplicateOfId: null,
      createdAt: seed.createdAt || at,
      ingestionStatus: seed.sourceFileId ? CORPUS_INGESTION_STATUS.STORED : CORPUS_INGESTION_STATUS.RECEIVED,
      provenance: {
        ingestedBy: ownerId,
        ingestedAt: at,
        method: (seed.provenance && seed.provenance.method) || 'upload',
        note: (seed.provenance && seed.provenance.note) || null,
      },
    });
    if (!isCorpusDocument(document)) {
      return corpusFailure(CORPUS_STORE_ERRORS.INVALID_RECORD, 'ingestDocument: the built record does not satisfy the CorpusDocument contract.');
    }
    _docs.set(documentId, document);
    return corpusSuccess(Object.freeze({ document, duplicate: false }));
  },

  getDocument(documentId) {
    const d = _docs.get(String(documentId || ''));
    return d ? corpusSuccess(d) : corpusFailure(CORPUS_STORE_ERRORS.NOT_FOUND, `No corpus document "${documentId}".`);
  },

  listDocuments(filter) {
    const ownerId = filter && typeof filter === 'object' ? filter.ownerId : filter;
    const items = [..._docs.values()].filter((d) => ownerId == null || d.ownerId === String(ownerId));
    return corpusSuccess(Object.freeze(items));
  },

  getObservations(documentId) {
    const id = String(documentId || '');
    if (!_docs.has(id)) return corpusFailure(CORPUS_STORE_ERRORS.NOT_FOUND, `No corpus document "${documentId}".`);
    const items = [..._obs.values()].filter((o) => o.documentId === id);
    return corpusSuccess(Object.freeze(items));
  },

  /** recordObservation({ observation, ownerId, now }) — always 'observed'. */
  recordObservation(input) {
    const seed = input && typeof input === 'object' ? input.observation : null;
    if (!seed || typeof seed !== 'object') {
      return corpusFailure(CORPUS_STORE_ERRORS.INVALID_RECORD, 'recordObservation: an observation seed is required.');
    }
    const documentId = String(seed.documentId || '');
    if (!_docs.has(documentId)) {
      return corpusFailure(CORPUS_STORE_ERRORS.NOT_FOUND, `recordObservation: no corpus document "${documentId}".`);
    }
    const at = nowIso(input && input.now);
    const observationId = seed.observationId || observationIdFrom(documentId, seed.category, seed.key);
    const fresh = makeCorpusObservation({
      ...seed,
      observationId,
      documentId,
      // HARD: the store never persists anything but 'observed' — approval is
      // a human review step in a later sub-phase (§9, §15).
      lifecycleState: OBSERVATION_LIFECYCLE.OBSERVED,
      approvedBy: null,
      approvedAt: null,
      preferenceRationale: null,
      createdAt: seed.createdAt || at,
      updatedAt: at,
    });
    if (!isCorpusObservation(fresh)) {
      return corpusFailure(CORPUS_STORE_ERRORS.INVALID_RECORD, 'recordObservation: the built observation is invalid (check provenance — every observation needs >= 1).');
    }
    const existing = _obs.get(observationId);
    if (!existing) {
      _obs.set(observationId, fresh);
      return corpusSuccess(Object.freeze({ observation: fresh, merged: false }));
    }
    const { next, changed } = mergeObservationOccurrence(existing, fresh);
    _obs.set(observationId, next);
    return corpusSuccess(Object.freeze({ observation: next, merged: changed }));
  },

  /** setAnalysisStatus(documentId, { to, actorId, at }) — graph-validated. */
  setAnalysisStatus(documentId, ctx = {}) {
    const id = String(documentId || '');
    const d = _docs.get(id);
    if (!d) return corpusFailure(CORPUS_STORE_ERRORS.NOT_FOUND, `No corpus document "${documentId}".`);
    const to = ctx && ctx.to;
    if (!canAnalysisTransition(d.analysisStatus, to)) {
      return corpusFailure(CORPUS_STORE_ERRORS.ILLEGAL_TRANSITION, `analysisStatus "${d.analysisStatus}" → "${to}" is not a legal move.`);
    }
    const at = nowIso(ctx.at);
    const next = makeCorpusDocument({ ...d, analysisStatus: to, analyzedAt: at });
    _docs.set(id, next);
    return corpusSuccess(next);
  },
});

/** Test/teardown helper — clears documents AND observations. */
export function resetMemoryCorpusBackend() {
  _docs.clear();
  _obs.clear();
}
