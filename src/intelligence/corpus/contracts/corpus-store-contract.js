/* ============================================================
   CORPUS-STORE-CONTRACT.JS — NOR & Memorandum Corpus Acquisition
   Foundation (V2, Phase 5.x.1)

   PURPOSE: fix the ONE interface every corpus backend implements (Null
   now; a Memory backend for tests / DISABLED mode; a server-backed
   callable backend later), plus the CorpusResult envelope — mirroring
   src/intelligence/nor-registry/contracts/registry-contract.js so
   swapping the store is a registry selection, not a caller-code change
   (§13, §14).

   THE METHOD SET IS DELIBERATELY NARROW (§14):

     ingestDocument      write a NEW CorpusDocument (get-or-create by
                         checksum — a re-ingest is a controlled no-op, §12)
     getDocument         read one
     listDocuments       read the caller's own (owner-scoped)
     getObservations     read the observations mined from one document
     recordObservation   write ONE observation — ALWAYS in lifecycleState
                         'observed'. There is intentionally NO method that
                         moves an observation toward 'approved' (§9, §15).
     setAnalysisStatus   advance the document's analysis lifecycle
                         (graph-validated — §11)

   RESPONSIBILITY: CORPUS_STORE_SCHEMA, CORPUS_STORE_ERRORS,
   corpusSuccess / corpusFailure, CORPUS_STORE_CONTRACT (method list as
   data), isCorpusBackend.

   DEPENDENCIES: none.

   NON-GOALS: no backend implemented here; no method called here. No
   knowledge write, no promotion, no OpenAI, no numbering.
   ============================================================ */

'use strict';

export const CORPUS_STORE_SCHEMA = 'corpus-store@1';

export const CORPUS_STORE_ERRORS = Object.freeze({
  NO_BACKEND_CONFIGURED: 'NO_BACKEND_CONFIGURED',
  NOT_FOUND: 'NOT_FOUND',
  FORBIDDEN: 'FORBIDDEN',                   // owner mismatch — a user may only touch their own corpus records
  DUPLICATE_DOCUMENT: 'DUPLICATE_DOCUMENT',  // informational: a byte-identical document already exists (§12)
  INVALID_RECORD: 'INVALID_RECORD',
  ILLEGAL_TRANSITION: 'ILLEGAL_TRANSITION',  // an analysis-status move that the graph forbids (§11)
  NOT_IMPLEMENTED: 'NOT_IMPLEMENTED',
});

/**
 * @typedef {Object} CorpusResult
 * @property {boolean} ok
 * @property {*} data
 * @property {{code: string, message: string}|null} error
 */

export function corpusSuccess(data) {
  return Object.freeze({ ok: true, data: data ?? null, error: null });
}

export function corpusFailure(code, message) {
  return Object.freeze({ ok: false, data: null, error: Object.freeze({ code, message: String(message || '') }) });
}

/**
 * @typedef {Object} CorpusBackend
 * @property {string} id
 * @property {string} version
 * @property {(input: {doc: object, ownerId?: string, now?: string}) => CorpusResult} ingestDocument
 * @property {(documentId: string) => CorpusResult} getDocument
 * @property {(filter?: object) => CorpusResult} listDocuments
 * @property {(documentId: string) => CorpusResult} getObservations
 * @property {(input: {observation: object, ownerId?: string, now?: string}) => CorpusResult} recordObservation
 * @property {(documentId: string, ctx: {to: string, actorId?: string, at?: string}) => CorpusResult} setAnalysisStatus
 */

export const CORPUS_STORE_CONTRACT = Object.freeze({
  schema: CORPUS_STORE_SCHEMA,
  methods: Object.freeze([
    'ingestDocument', 'getDocument', 'listDocuments',
    'getObservations', 'recordObservation', 'setAnalysisStatus',
  ]),
  errorCodes: CORPUS_STORE_ERRORS,
});

/** Structural check that an object satisfies the backend contract. */
export function isCorpusBackend(b) {
  if (!b || typeof b !== 'object') return false;
  if (typeof b.id !== 'string' || !b.id) return false;
  if (typeof b.version !== 'string' || !b.version) return false;
  return CORPUS_STORE_CONTRACT.methods.every((m) => typeof b[m] === 'function');
}
