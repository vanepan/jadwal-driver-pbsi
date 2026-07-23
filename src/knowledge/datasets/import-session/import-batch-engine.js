/* ============================================================
   IMPORT-BATCH-ENGINE.JS — Batch History Foundation (V2.1.2)

   PURPOSE: the ONLY named entry points by which an Import Batch's
   aggregate counts and status move — mirrors import-session-engine.js's
   "named transitions only" discipline. Every count here is a real,
   incremental tally driven by the UI layer reporting one real per-file
   outcome at a time (recordBatchItem) — never independently recomputed
   or guessed.

   RESPONSIBILITY: createBatch, recordBatchItem, pauseBatch, resumeBatch,
   cancelBatch, completeBatch, getBatch, listBatches, getBatchHistory.

   DEPENDENCIES: ./repository/import-batch-repository.js, ./contracts/
   import-batch-contract.js.
   ============================================================ */

'use strict';

import { makeImportBatchRecord, BATCH_STATUS } from './contracts/import-batch-contract.js';
import {
  create as repoCreate, appendVersion as repoAppendVersion, getById as repoGetById,
  getHistory as repoGetHistory, list as repoList,
} from './repository/import-batch-repository.js';

function failure(code, message) {
  return Object.freeze({ ok: false, data: null, error: Object.freeze({ code, message }) });
}

let _counter = 0;
function nextBatchId(domainType) {
  _counter += 1;
  return `import-batch:${domainType}:${Date.now()}:${_counter}`;
}

export function createBatch({ createdBy, domainType, totalFiles }) {
  const id = nextBatchId(domainType);
  return repoCreate(makeImportBatchRecord({ id, createdBy, domainType, totalFiles }));
}

/**
 * Reports ONE real per-file outcome onto its batch's running totals.
 * @param {string} batchId
 * @param {string} sessionId
 * @param {{imported?: boolean, duplicate?: boolean, warningCount?: number, error?: boolean, knowledgeProduced?: boolean, storageBytes?: number}} outcome
 */
export function recordBatchItem(batchId, sessionId, outcome = {}) {
  const current = repoGetById(batchId);
  if (!current.ok) return current;
  const b = current.data;
  // Phase 2.6 — a 'blocked' file (no Domain Unggahan was selected, so no
  // Import Session was ever created) reports a NULL sessionId. Pushing that
  // null into sessionIds produced a sparse array, which RTDB then stores as
  // an OBJECT keyed by index rather than an array — corrupting the record's
  // shape on the next rehydration. The file is still counted in the outcome
  // tallies below; only the id-list, which is a list of real session ids,
  // skips it.
  const nextSessionIds = sessionId ? [...b.sessionIds, sessionId] : [...b.sessionIds];
  return repoAppendVersion(batchId, {
    sessionIds: nextSessionIds,
    imported: b.imported + (outcome.imported ? 1 : 0),
    duplicate: b.duplicate + (outcome.duplicate ? 1 : 0),
    warning: b.warning + (outcome.warningCount || 0),
    error: b.error + (outcome.error ? 1 : 0),
    knowledgeProduced: b.knowledgeProduced + (outcome.knowledgeProduced ? 1 : 0),
    storageUsedBytes: b.storageUsedBytes + (outcome.storageBytes || 0),
  });
}

export function pauseBatch(id) {
  const current = repoGetById(id);
  if (!current.ok) return current;
  if (current.data.status !== BATCH_STATUS.PROCESSING) {
    return failure('ILLEGAL_BATCH_TRANSITION', `Cannot pause batch "${id}" from status "${current.data.status}".`);
  }
  return repoAppendVersion(id, { status: BATCH_STATUS.PAUSED });
}

export function resumeBatch(id) {
  const current = repoGetById(id);
  if (!current.ok) return current;
  if (current.data.status !== BATCH_STATUS.PAUSED) {
    return failure('ILLEGAL_BATCH_TRANSITION', `Cannot resume batch "${id}" from status "${current.data.status}".`);
  }
  return repoAppendVersion(id, { status: BATCH_STATUS.PROCESSING });
}

/**
 * Phase 2.6 — IDEMPOTENT. Cancelling an already-cancelled batch is a
 * SUCCESSFUL no-op, not an error. This is load-bearing, not cosmetic: cancel
 * is now reachable from several honest places at once (the live progress
 * panel, the Upload Recovery banner, the worker loop's own end-of-run
 * settle, and another browser tab via the RTDB echo), and the worker loop
 * re-checks persisted status on every iteration. Treating the second call as
 * ILLEGAL_BATCH_TRANSITION made a correct, converged system report a failure
 * — and, worse, invited call sites to ignore the envelope entirely (which is
 * exactly what they did).
 *
 * A COMPLETED batch still refuses cancellation: its files are done, and
 * "cancel" cannot un-finish finished work.
 */
export function cancelBatch(id) {
  const current = repoGetById(id);
  if (!current.ok) return current;
  if (current.data.status === BATCH_STATUS.CANCELLED) return current; // already there — converged, not an error
  if (current.data.status === BATCH_STATUS.COMPLETED) {
    return failure('ILLEGAL_BATCH_TRANSITION', `Cannot cancel batch "${id}" — it already completed.`);
  }
  return repoAppendVersion(id, { status: BATCH_STATUS.CANCELLED, finishedAt: new Date().toISOString() });
}

/**
 * Phase 2.6 — a CANCELLED batch can never be flipped to Completed. The worker
 * loop calls completeBatch() when it falls out of its file loop; before this
 * guard, a cancel that landed while the final file was still being processed
 * was immediately overwritten by that completeBatch() call, resurrecting the
 * batch as "Selesai" and losing the cancellation the operator had just made.
 * Idempotent for the already-completed case, same reasoning as cancelBatch().
 */
export function completeBatch(id) {
  const current = repoGetById(id);
  if (!current.ok) return current;
  if (current.data.status === BATCH_STATUS.CANCELLED) return current; // cancellation wins — never silently un-cancelled
  if (current.data.status === BATCH_STATUS.COMPLETED) return current;
  return repoAppendVersion(id, { status: BATCH_STATUS.COMPLETED, finishedAt: new Date().toISOString() });
}

export function getBatch(id) { return repoGetById(id); }
export function listBatches(filter = {}) { return repoList(filter); }
export function getBatchHistory(id) { return repoGetHistory(id); }
export { BATCH_STATUS };
