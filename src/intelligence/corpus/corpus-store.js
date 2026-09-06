/* ============================================================
   CORPUS-STORE.JS — NOR & Memorandum Corpus Acquisition Foundation
   (V2, Phase 5.x.1)

   PURPOSE: THE single access point to the historical corpus — corpus
   document identity, the preserved-original reference, extracted
   observations, and the analysis lifecycle. Every reader/writer of the
   corpus goes through HERE; the actual persistence is a pluggable backend
   (Null now; Memory for tests / DISABLED mode; a server-owned callable
   later). Mirrors src/intelligence/nor-registry/nor-registry.js exactly:
   a backend registry + process-wide events + pure delegation.

       (future) corpus ingestion UI ──┐
       (future) page visual analyzer ─┼──▶  corpus store  ──▶  active backend
       (future) corpus review UI ─────┘          │                (Null by default)
                                                 └── events (metadata only)

   RESPONSIBILITY: backend registry (register / setActive / reset /
   useCallableCorpusBackend), CORPUS_EVENT + listeners, and the six
   delegating facade methods (contracts/corpus-store-contract.js).

   DEPENDENCIES: contracts/corpus-store-contract.js,
   backends/null-corpus-backend.js, backends/callable-corpus-backend.js.

   NON-GOALS: does not itself persist, hash, render, analyse, or classify
   anything. Ships the Null backend only, so every call returns
   NOT_IMPLEMENTED until a real backend is registered. Does NOT promote an
   observation to approved — there is no method for it (§9, §15). Does NOT
   read or write src/knowledge/, the feature flag, or any OpenAI surface.
   ============================================================ */

'use strict';

import {
  CORPUS_STORE_ERRORS, corpusFailure, isCorpusBackend,
} from './contracts/corpus-store-contract.js';
import { nullCorpusBackend, NULL_CORPUS_BACKEND_ID } from './backends/null-corpus-backend.js';
import { createCallableCorpusBackend, CALLABLE_CORPUS_BACKEND_ID } from './backends/callable-corpus-backend.js';

/* ── re-exports so this facade is a complete import surface ───────────── */
export {
  CORPUS_STORE_SCHEMA, CORPUS_STORE_ERRORS, corpusSuccess, corpusFailure,
  CORPUS_STORE_CONTRACT, isCorpusBackend,
} from './contracts/corpus-store-contract.js';
export {
  CORPUS_AUDIT_EVENTS, observationIdFrom, makeObservationFromExtraction,
  mergeObservationOccurrence, advanceObservationLifecycle,
} from './corpus-observation-record.js';
export {
  NULL_CORPUS_BACKEND_ID,
} from './backends/null-corpus-backend.js';
export {
  createCallableCorpusBackend, CALLABLE_CORPUS_BACKEND_ID,
} from './backends/callable-corpus-backend.js';

/* ── backend registry — Null is the default and the reset target ─────── */

const _backends = new Map();
let _activeBackendId = null;

export const DEFAULT_CORPUS_BACKEND_ID = NULL_CORPUS_BACKEND_ID;

export function registerCorpusBackend(backend) {
  if (!isCorpusBackend(backend)) {
    const err = new Error('registerCorpusBackend: backend must satisfy the CORPUS_STORE_CONTRACT method set.');
    err.code = 'INVALID_BACKEND';
    throw err;
  }
  _backends.set(backend.id, backend);
  if (_activeBackendId === null) _activeBackendId = backend.id;
  return backend;
}

export function setActiveCorpusBackend(id) {
  if (!_backends.has(id)) {
    const err = new Error(`setActiveCorpusBackend: no backend registered under "${id}".`);
    err.code = 'UNKNOWN_BACKEND';
    throw err;
  }
  _activeBackendId = id;
  return _backends.get(id);
}

export function getActiveCorpusBackendId() {
  return _activeBackendId;
}

export function listCorpusBackends() {
  return Object.freeze([..._backends.values()].map((b) => Object.freeze({
    id: b.id, version: b.version, active: b.id === _activeBackendId,
  })));
}

/**
 * Register the server-owned callable backend and make it active.
 * `callCorpus` is js/firebase.js's httpsCallable wrapper in production, a
 * fake wired to the CJS callable's .run() in tests.
 * @param {{ callCorpus: Function }} opts
 */
export function useCallableCorpusBackend({ callCorpus }) {
  const backend = createCallableCorpusBackend({ callCorpus });
  registerCorpusBackend(backend);
  setActiveCorpusBackend(CALLABLE_CORPUS_BACKEND_ID);
  return backend;
}

/** Test/teardown helper — restore just the Null backend, active. */
export function resetCorpusStore() {
  _backends.clear();
  _activeBackendId = null;
  registerCorpusBackend(nullCorpusBackend);
  setActiveCorpusBackend(DEFAULT_CORPUS_BACKEND_ID);
  _listeners.length = 0;
}

function active(method, ...args) {
  const backend = _backends.get(_activeBackendId);
  if (!backend) {
    return corpusFailure(CORPUS_STORE_ERRORS.NO_BACKEND_CONFIGURED, `No active corpus backend (method: ${method}).`);
  }
  return backend[method](...args);
}

/* ── corpus events (mirrors nor-registry.js) — metadata only ─────────── */

/** @type {Function[]} */
const _listeners = [];

export function registerCorpusListener(cb) {
  if (typeof cb === 'function') _listeners.push(cb);
}

export function unregisterCorpusListener(cb) {
  const i = _listeners.indexOf(cb);
  if (i !== -1) _listeners.splice(i, 1);
}

export const CORPUS_EVENT = Object.freeze({
  DOCUMENT_INGESTED: 'corpus.document_ingested',
  DOCUMENT_DUPLICATE: 'corpus.document_duplicate',
  OBSERVATION_RECORDED: 'corpus.observation_recorded',
  ANALYSIS_ADVANCED: 'corpus.analysis_advanced',
});

function notify(type, payload) {
  const event = Object.freeze({
    type,
    at: new Date().toISOString(),
    documentId: (payload && payload.documentId) || null,
    observationId: (payload && payload.observationId) || null,
  });
  for (const cb of _listeners) cb(event);
}

/* ── facade methods ─────────────────────────────────────────────────── */

/**
 * Ingest one source document. `input` = { doc, ownerId?, now? }. Backends
 * are get-or-create by content checksum: a byte-identical re-ingest
 * returns the EXISTING document with `duplicate: true` and never
 * overwrites it (§12).
 */
export function ingestDocument(input) {
  const result = active('ingestDocument', input);
  if (result && result.ok) {
    const dup = result.data && result.data.duplicate === true;
    const documentId = result.data && result.data.document ? result.data.document.documentId : null;
    notify(dup ? CORPUS_EVENT.DOCUMENT_DUPLICATE : CORPUS_EVENT.DOCUMENT_INGESTED, { documentId });
  }
  return result;
}

export const getDocument = (documentId) => active('getDocument', documentId);
export const listDocuments = (filter) => active('listDocuments', filter);
export const getObservations = (documentId) => active('getObservations', documentId);

/**
 * Record ONE extracted observation. `input` = { observation, ownerId?,
 * now? }. Always persisted in lifecycleState 'observed'; repeated
 * evidence of the same thing accumulates (occurrenceCount / provenance)
 * without ever changing the lifecycle state (§9, §15).
 */
export function recordObservation(input) {
  const result = active('recordObservation', input);
  if (result && result.ok) {
    const observationId = result.data && result.data.observation ? result.data.observation.observationId : null;
    notify(CORPUS_EVENT.OBSERVATION_RECORDED, { observationId });
  }
  return result;
}

/**
 * Advance a document's ANALYSIS lifecycle (§11). `ctx` = { to, actorId?,
 * at? }. Graph-validated by the backend — an illegal move returns
 * ILLEGAL_TRANSITION. This is the processing lifecycle, NOT organizational
 * approval.
 */
export function setAnalysisStatus(documentId, ctx = {}) {
  const result = active('setAnalysisStatus', documentId, ctx);
  if (result && result.ok) {
    const id = result.data && result.data.documentId ? result.data.documentId : documentId;
    notify(CORPUS_EVENT.ANALYSIS_ADVANCED, { documentId: id });
  }
  return result;
}

/* ── bootstrap ─────────────────────────────────────────────────────── */
registerCorpusBackend(nullCorpusBackend);
setActiveCorpusBackend(DEFAULT_CORPUS_BACKEND_ID);
