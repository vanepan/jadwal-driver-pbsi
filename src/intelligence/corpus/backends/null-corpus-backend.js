/* ============================================================
   NULL-CORPUS-BACKEND.JS — NOR & Memorandum Corpus Acquisition
   Foundation (V2, Phase 5.x.1)

   The inert default corpus backend. Every method returns NOT_IMPLEMENTED
   (or NO_BACKEND_CONFIGURED). Active by default so the whole corpus layer
   is dormant — nothing is stored, nothing is analysed, until a real
   backend is registered and made active. Mirrors
   src/intelligence/nor-registry/backends/null-nor-registry-backend.js.
   ============================================================ */

'use strict';

import { CORPUS_STORE_ERRORS, corpusFailure } from '../contracts/corpus-store-contract.js';

export const NULL_CORPUS_BACKEND_ID = 'null';
export const NULL_CORPUS_BACKEND_VERSION = 'corpus-null-backend@1';

const notImplemented = (method) =>
  corpusFailure(CORPUS_STORE_ERRORS.NOT_IMPLEMENTED, `Corpus backend not implemented (method: ${method}).`);

export const nullCorpusBackend = Object.freeze({
  id: NULL_CORPUS_BACKEND_ID,
  version: NULL_CORPUS_BACKEND_VERSION,
  ingestDocument: () => notImplemented('ingestDocument'),
  getDocument: () => notImplemented('getDocument'),
  listDocuments: () => notImplemented('listDocuments'),
  getObservations: () => notImplemented('getObservations'),
  recordObservation: () => notImplemented('recordObservation'),
  setAnalysisStatus: () => notImplemented('setAnalysisStatus'),
});
