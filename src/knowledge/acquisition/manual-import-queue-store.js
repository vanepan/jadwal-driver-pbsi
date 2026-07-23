/* ============================================================
   MANUAL-IMPORT-QUEUE-STORE.JS — Knowledge Acquisition Operational Readiness (V2.1)

   PURPOSE: the in-memory hand-off between "an Import Session just reached
   Approved and its human-verified content is ready" and
   connectors/manual-file-connector.js's next fetch() seeing exactly that
   one entry — mirrors acquisition/cursor-store.js's single-purpose,
   Map-backed scope (a small, bounded store, not a general queue
   framework).

   Deliberately NOT a time-cursor design (unlike nor-connector.js's
   `since`-based incremental read): every call in this pipeline is
   synchronous and in-memory (no network/DB latency), so
   import-session-engine.js#markKnowledgeImported() can queue exactly one
   entry and mark it "active" immediately before calling
   dataset-import-service.js#importDataset() — the connector's fetch()
   then consumes only that one active entry, deterministically, with zero
   risk of one session's queued facts leaking into a different session's
   import run (the risk a `since` timestamp filter cannot fully rule out
   when multiple sessions could submit within the same millisecond).

   RESPONSIBILITY: queueManualEntry / setActiveImportSession /
   consumeActiveEntry / resetManualImportQueue.

   DEPENDENCIES: none.
   ============================================================ */

'use strict';

/** @type {Map<string, {importSessionId: string, domainType: string, kind: string, sourceType: string, facts: Object|null, parsedContent: Object|null, submittedAt: string}>} */
const _queue = new Map();

let _activeImportSessionId = null;

/** Called once, right before markKnowledgeImported() invokes the
 *  acquisition pipeline — queues this session's human-verified content
 *  under its own importSessionId. */
export function queueManualEntry({ importSessionId, domainType, kind, sourceType, facts = null, parsedContent = null }) {
  _queue.set(importSessionId, Object.freeze({
    importSessionId, domainType, kind, sourceType, facts, parsedContent,
    submittedAt: new Date().toISOString(),
  }));
}

/** Scopes the connector's next fetch() to exactly one Import Session. */
export function setActiveImportSession(importSessionId) {
  _activeImportSessionId = importSessionId;
}

export function clearActiveImportSession() {
  _activeImportSessionId = null;
}

export function getActiveImportSession() {
  return _activeImportSessionId;
}

/** Consumes (removes) and returns the currently-active entry, or null if
 *  none is queued/active. Called by manual-file-connector.js#fetch(). */
export function consumeActiveEntry() {
  const id = _activeImportSessionId;
  if (!id) return null;
  const entry = _queue.get(id);
  if (!entry) return null;
  _queue.delete(id);
  return entry;
}

/** Test/teardown helper. Not used by any runtime path. */
export function resetManualImportQueue() {
  _queue.clear();
  _activeImportSessionId = null;
}
