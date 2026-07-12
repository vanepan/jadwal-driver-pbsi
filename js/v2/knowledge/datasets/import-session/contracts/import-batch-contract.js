/* ============================================================
   IMPORT-BATCH-CONTRACT.JS — Batch History Foundation (V2.1.2)

   PURPOSE: fix the shape of ONE upload batch — every drag-drop/multi-
   select/folder-select action becomes a permanent ImportBatchRecord (Part
   I), distinct from an ImportSessionRecord: a Batch is the OPERATION (N
   files selected together, with a real start/finish time and aggregate
   counts); a Session is the PER-FILE outcome. A Batch never duplicates
   what a Session already tracks — its counts are always a real tally
   over its own `sessionIds`, never independently computed.

   RESPONSIBILITY: define ImportBatchRecord, BATCH_STATUS, and a
   structural validator.

   DEPENDENCIES: none.

   NON-GOALS: does not decide how a batch is processed (see
   ../import-batch-engine.js). Does not duplicate ImportSessionRecord's
   own fields — a Batch holds aggregate counts and a session-id list, the
   per-file detail always lives on the Session itself.
   ============================================================ */

'use strict';

export const IMPORT_BATCH_SCHEMA = 'import-batch@1';

export const BATCH_STATUS = Object.freeze({
  PROCESSING: 'processing',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
});

/**
 * @typedef {Object} ImportBatchRecord
 * @property {string} id
 * @property {number} version        - append-only, same invariants as ImportSessionRecord — this IS the Audit Trail (Part I), reusing the established pattern rather than a second log mechanism
 * @property {string} createdBy
 * @property {string} startedAt      - ISO 8601
 * @property {string|null} finishedAt - ISO 8601, null while processing/paused
 * @property {string} domainType     - the batch's assigned domain (Part A "domain defaults")
 * @property {number} totalFiles     - files selected for this batch (known up front)
 * @property {number} imported       - sessions that reached Pending Review or further
 * @property {number} duplicate      - sessions whose file matched an existing StoredFileRecord
 * @property {number} warning        - sum of validationWarnings across the batch's sessions
 * @property {number} error          - sessions that ended in a blocking error/unsupported state
 * @property {number} knowledgeProduced - sessions that reached Knowledge Imported or further
 * @property {number} storageUsedBytes  - real sum of sizeBytes for non-duplicate uploads only
 * @property {string} status         - one of BATCH_STATUS
 * @property {string[]} sessionIds   - every ImportSessionRecord.id this batch has created, in order
 * @property {string} updatedAt      - ISO 8601
 */

export function makeImportBatchRecord({ id, createdBy, domainType, totalFiles }) {
  const now = new Date().toISOString();
  return Object.freeze({
    id, version: 1, createdBy, startedAt: now, finishedAt: null, domainType, totalFiles,
    imported: 0, duplicate: 0, warning: 0, error: 0, knowledgeProduced: 0, storageUsedBytes: 0,
    status: BATCH_STATUS.PROCESSING,
    sessionIds: Object.freeze([]),
    updatedAt: now,
  });
}

export function isImportBatchRecord(r) {
  return !!r && typeof r === 'object'
    && typeof r.id === 'string' && r.id.length > 0
    && typeof r.version === 'number' && r.version >= 1
    && typeof r.createdBy === 'string' && r.createdBy.length > 0
    && typeof r.startedAt === 'string' && r.startedAt.length > 0
    && typeof r.domainType === 'string' && r.domainType.length > 0
    && typeof r.totalFiles === 'number' && r.totalFiles >= 0
    && Object.values(BATCH_STATUS).includes(r.status)
    && Array.isArray(r.sessionIds);
}
