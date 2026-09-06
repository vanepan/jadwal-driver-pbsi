/* ============================================================
   CALLABLE-CORPUS-BACKEND.JS — NOR & Memorandum Corpus Acquisition
   Foundation (V2, Phase 5.x.1)

   A CorpusBackend that persists corpus records SERVER-SIDE by delegating
   every operation to the `intelligenceCorpus` Cloud Function (Admin SDK →
   RTDB /intelligence_corpus_documents + /intelligence_corpus_observations).
   The browser never writes those nodes directly (RTDB rule ".write":
   false); ownership and the analysis lifecycle are enforced by the
   function from the verified Firebase context.

   Direct sibling of callable-nor-registry-backend.js — same idiom: map the
   function's { ok, data, error } into the CorpusResult envelope; a
   transport that throws (offline, function-not-found, permission-denied)
   becomes a typed failure and is NEVER re-thrown.

   STAGED: `intelligenceCorpus` is authored but NOT yet wired into
   functions/index.js and NOT deployed (Phase 5.x.1 §20). This adapter is
   therefore unreachable in production today — it exists so the client
   seam is complete and testable against the CJS callable's .run().
   ============================================================ */

'use strict';

import { CORPUS_STORE_ERRORS, corpusSuccess, corpusFailure } from '../contracts/corpus-store-contract.js';

export const CALLABLE_CORPUS_BACKEND_ID = 'callable';
export const CALLABLE_CORPUS_BACKEND_VERSION = 'corpus-callable-backend@1';

function toEnvelope(raw) {
  if (raw && raw.ok === true) return corpusSuccess(raw.data === undefined ? null : raw.data);
  if (raw && raw.ok === false && raw.error && typeof raw.error.code === 'string') {
    return corpusFailure(raw.error.code, raw.error.message || '');
  }
  return corpusFailure(CORPUS_STORE_ERRORS.INVALID_RECORD, 'corpus function returned an unrecognised result.');
}

/**
 * @param {{ callCorpus: (payload: {op:string} & Record<string,*>) => Promise<{ok:boolean,data:*,error:*}> }} opts
 */
export function createCallableCorpusBackend({ callCorpus } = {}) {
  if (typeof callCorpus !== 'function') {
    throw new Error('createCallableCorpusBackend: callCorpus port is required.');
  }

  function fromThrow(err) {
    const code = err && typeof err.code === 'string' ? err.code : '';
    const msg = err && err.message ? err.message : 'unknown';
    if (/permission-denied/.test(code)) return corpusFailure(CORPUS_STORE_ERRORS.FORBIDDEN, msg);
    if (/invalid-argument/.test(code)) return corpusFailure(CORPUS_STORE_ERRORS.INVALID_RECORD, msg);
    if (/not-found/.test(code)) return corpusFailure(CORPUS_STORE_ERRORS.NOT_FOUND, msg);
    if (/failed-precondition|aborted/.test(code)) return corpusFailure(CORPUS_STORE_ERRORS.ILLEGAL_TRANSITION, msg);
    return corpusFailure(CORPUS_STORE_ERRORS.NO_BACKEND_CONFIGURED, `corpus function unavailable (${code || msg}).`);
  }

  async function call(payload) {
    let raw;
    try {
      raw = await callCorpus(payload);
    } catch (err) {
      return fromThrow(err);
    }
    return toEnvelope(raw);
  }

  return Object.freeze({
    id: CALLABLE_CORPUS_BACKEND_ID,
    version: CALLABLE_CORPUS_BACKEND_VERSION,

    /** ingestDocument({ doc }) — the client supplies the CLASSIFICATION
     *  metadata (checksum, type, era, title, filename, pageCount, …); the
     *  server forces ownerId + the deterministic documentId. */
    ingestDocument(input) {
      const doc = input && typeof input === 'object' ? input.doc : null;
      if (!doc || typeof doc !== 'object') {
        return Promise.resolve(corpusFailure(CORPUS_STORE_ERRORS.INVALID_RECORD, 'ingestDocument: a document seed is required.'));
      }
      return call({ op: 'ingest', document: doc });
    },

    getDocument(documentId) {
      return call({ op: 'get', documentId: String(documentId || '') });
    },

    listDocuments() {
      return call({ op: 'list' });
    },

    getObservations(documentId) {
      return call({ op: 'observations', documentId: String(documentId || '') });
    },

    recordObservation(input) {
      const observation = input && typeof input === 'object' ? input.observation : null;
      if (!observation || typeof observation !== 'object') {
        return Promise.resolve(corpusFailure(CORPUS_STORE_ERRORS.INVALID_RECORD, 'recordObservation: an observation seed is required.'));
      }
      return call({ op: 'recordObservation', observation });
    },

    setAnalysisStatus(documentId, ctx = {}) {
      const payload = { op: 'setAnalysisStatus', documentId: String(documentId || '') };
      if (ctx && typeof ctx.to === 'string') payload.to = ctx.to;
      return call(payload);
    },
  });
}
