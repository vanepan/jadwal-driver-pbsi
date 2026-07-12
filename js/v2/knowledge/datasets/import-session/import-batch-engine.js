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
  return repoAppendVersion(batchId, {
    sessionIds: [...b.sessionIds, sessionId],
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

export function cancelBatch(id) {
  const current = repoGetById(id);
  if (!current.ok) return current;
  if (current.data.status === BATCH_STATUS.COMPLETED || current.data.status === BATCH_STATUS.CANCELLED) {
    return failure('ILLEGAL_BATCH_TRANSITION', `Cannot cancel batch "${id}" — already "${current.data.status}".`);
  }
  return repoAppendVersion(id, { status: BATCH_STATUS.CANCELLED, finishedAt: new Date().toISOString() });
}

export function completeBatch(id) {
  const current = repoGetById(id);
  if (!current.ok) return current;
  return repoAppendVersion(id, { status: BATCH_STATUS.COMPLETED, finishedAt: new Date().toISOString() });
}

export function getBatch(id) { return repoGetById(id); }
export function listBatches(filter = {}) { return repoList(filter); }
export function getBatchHistory(id) { return repoGetHistory(id); }
export { BATCH_STATUS };
