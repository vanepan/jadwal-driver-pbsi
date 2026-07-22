/* ============================================================
   COMPOSER-DOCUMENT-REPOSITORY.JS — Review Workspace Foundation (Phase 10, Sprint 10.1)

   PURPOSE: give ComposerDocuments (and their ComposerRevision history) real
   persistence, mirroring knowledge/datasets/import-session/repository/
   import-session-repository.js's exact proven shape (V2.1.2) — an
   in-memory Map CACHE backed by Firebase Realtime Database, never the
   frontend as source of truth. Before this file, composer-store.js's two
   Maps (_documents/_revisions) lived ONLY for the lifetime of one browser
   tab: a composed NOR draft, and every human edit made to it, vanished on
   refresh — unworkable for a real Review Workspace, where a reviewer must
   be able to return to a document days later.

   SHAPE: one record per documentId — `{document: ComposerDocument,
   revisions: ComposerRevision[], explainability: object|null}` —
   composer-store.js's own two Maps folded into one persisted unit, since a
   document and its revision history are never meaningfully read apart.

   Phase 10, Sprint 10.2 — `explainability` added: the `reasoningConsidered`/
   `unresolvedFields`/`citedKnowledgeIds`/`explanation`/
   `renderingRulesConsidered`/`conversationId` bundle problem-solving-
   service.js#composeApprovedNor already computes but previously discarded
   after one render (only ever lived in sarpras-intelligence-center.js's
   own `homeState.lastPipelineTrace`, overwritten by the next composition).
   Optional and additive — `putRecord()`'s 4th argument is undefined for
   ordinary create/edit calls, which preserves whatever explainability was
   already attached rather than erasing it.

   LAZY FIREBASE IMPORT / DEBOUNCED REHYDRATION / MICROTASK-COALESCED
   WRITES: identical discipline to import-session-repository.js — see that
   file's header for the full reasoning. Summary: `js/firebase.js` is only
   ever `import()`-ed inside `initComposerDocumentSync()`, so every Node
   check script that never calls it stays Firebase-free; a burst of writes
   to the SAME document in one synchronous call (e.g. several editSection()
   calls) collapses into one remote write of the latest state.

   NORMALIZATION: RTDB strips `null` values and empty arrays from
   everything it stores (the same "Phase 2.6" story import-session-
   contract.js documents at length) — a rehydrated EditableSection can
   arrive missing `knowledgeReferences`/`suggestionPlaceholder`, and a
   rehydrated ComposerRevision can arrive missing `diff`/`editedBy`.
   Normalizing at this ONE boundary (where a remote record enters the
   cache) means every downstream reader sees a structurally complete
   record, matching the contracts' own shape.

   RESPONSIBILITY: getRecord/putRecord/listRecords/
   resetComposerDocumentRepository/initComposerDocumentSync.

   DEPENDENCIES: js/firebase.js (lazy, see above). No contract imports —
   this file trusts composer-store.js to hand it already-contract-valid
   documents/revisions; it only re-shapes what RTDB itself may have
   stripped on the way back.
   ============================================================ */

'use strict';

const RTDB_PATH = 'v2_sarpras/composer_documents';
const HYDRATE_DEBOUNCE_MS = 250;

/** @type {Map<string, {document: object, revisions: object[]}>} documentId -> record */
const _store = new Map();

let _remoteWrite = null;
let _syncStarted = false;
let _hydrateTimer = null;
let _pendingRawSnapshot;

const _changeListeners = [];
export function registerChangeListener(cb) { if (typeof cb === 'function') _changeListeners.push(cb); }
function notifyChange() {
  _changeListeners.forEach((cb) => { try { cb(); } catch (e) { console.error('[composer-document-repository] listener error', e); } });
}

function normalizeSection(raw) {
  return {
    sectionId: raw.sectionId,
    field: raw.field,
    value: raw.value,
    isOverridden: !!raw.isOverridden,
    knowledgeReferences: Array.isArray(raw.knowledgeReferences) ? raw.knowledgeReferences : [],
    suggestionPlaceholder: raw.suggestionPlaceholder || null,
  };
}

function normalizeDocument(raw) {
  return { ...raw, sections: Array.isArray(raw.sections) ? raw.sections.map(normalizeSection) : [] };
}

function normalizeRevision(raw) {
  return {
    ...raw,
    sections: Array.isArray(raw.sections) ? raw.sections.map(normalizeSection) : [],
    diff: raw.diff || null,
    editedBy: raw.editedBy || null,
  };
}

/** Phase 10, Sprint 10.2 — same RTDB null/empty-array stripping story as
 *  every other normalize* function here, applied to the explainability
 *  bag so nor-explainability-service.js can safely `.map()` over its
 *  array fields without a rehydrated record crashing it. */
function normalizeExplainability(raw) {
  if (!raw) return null;
  return {
    conversationId: raw.conversationId || null,
    unresolvedFields: Array.isArray(raw.unresolvedFields) ? raw.unresolvedFields : [],
    citedKnowledgeIds: Array.isArray(raw.citedKnowledgeIds) ? raw.citedKnowledgeIds : [],
    explanation: Array.isArray(raw.explanation) ? raw.explanation : [],
    renderingRulesConsidered: Array.isArray(raw.renderingRulesConsidered) ? raw.renderingRulesConsidered : [],
    reasoningConsidered: raw.reasoningConsidered || null,
  };
}

function applyRemoteSnapshot(raw) {
  _store.clear();
  if (raw) {
    for (const [id, record] of Object.entries(raw)) {
      if (record && record.document) {
        _store.set(id, {
          document: Object.freeze(normalizeDocument(record.document)),
          revisions: Object.freeze((Array.isArray(record.revisions) ? record.revisions : []).map((r) => Object.freeze(normalizeRevision(r)))),
          explainability: record.explainability ? Object.freeze(normalizeExplainability(record.explainability)) : null,
        });
      }
    }
  }
  notifyChange();
}

function scheduleHydrate(raw) {
  _pendingRawSnapshot = raw;
  clearTimeout(_hydrateTimer);
  _hydrateTimer = setTimeout(() => {
    applyRemoteSnapshot(_pendingRawSnapshot);
    _pendingRawSnapshot = undefined;
  }, HYDRATE_DEBOUNCE_MS);
}

/**
 * Opt-in: subscribes to the real RTDB backend and starts background-
 * writing every future putRecord(). Idempotent — safe to call more than
 * once. Never called by any test script (see header).
 */
export async function initComposerDocumentSync() {
  if (_syncStarted) return;
  _syncStarted = true;
  const { subscribeNode, storeFirebaseData, readNode } = await import('../../../js/firebase.js');
  _remoteWrite = storeFirebaseData;
  const initial = await readNode(RTDB_PATH);
  if (initial.status === 'ok') applyRemoteSnapshot(initial.value);
  subscribeNode(RTDB_PATH, (snapshot) => {
    scheduleHydrate(snapshot.exists() ? snapshot.val() : null);
  }, { onError: (err) => console.error('[composer-document-repository] RTDB sync error:', err) });
}

const _pendingRemoteWrite = new Set();
function persistRemote(id) {
  if (!_remoteWrite) return;
  if (_pendingRemoteWrite.has(id)) return; // already queued — it will pick up the latest state
  _pendingRemoteWrite.add(id);
  queueMicrotask(() => {
    _pendingRemoteWrite.delete(id);
    const record = _store.get(id);
    if (!record) return;
    _remoteWrite(`${RTDB_PATH}/${id}`, record).catch((err) => {
      console.error(`[composer-document-repository] RTDB write failed for "${id}":`, err);
    });
  });
}

export function getRecord(documentId) {
  return _store.get(documentId) || null;
}

/** Overwrites the full record for `documentId` — composer-store.js always
 *  hands over the complete current document + full revision array, never a
 *  partial patch (same "caller owns the merge" contract editSection()
 *  already has internally).
 *
 *  Unlike import-session-repository.js's own local write (which
 *  deliberately does NOT notify, since its one writer already re-renders
 *  itself synchronously), this DOES notify on a local write too: a
 *  ComposerDocument is typically WRITTEN from the Home dashboard
 *  (composeApprovedNor) but READ from the separate, persistently-mounted
 *  Review Workspace screen — two different controllers, so the writer
 *  cannot re-render the reader for it. */
export function putRecord(documentId, document, revisions, explainability) {
  const existing = _store.get(documentId);
  const nextExplainability = explainability !== undefined ? explainability : (existing ? existing.explainability : null);
  _store.set(documentId, { document, revisions: [...revisions], explainability: nextExplainability });
  persistRemote(documentId);
  notifyChange();
}

export function listRecords() {
  return [..._store.values()];
}

/** Test/teardown helper. Not used by any runtime path. Clears the cache
 *  only — deliberately does NOT reset sync state, mirroring
 *  import-session-repository.js#resetImportSessionRepository's own note. */
export function resetComposerDocumentRepository() {
  _store.clear();
  clearTimeout(_hydrateTimer);
  _pendingRawSnapshot = undefined;
  _pendingRemoteWrite.clear();
}
