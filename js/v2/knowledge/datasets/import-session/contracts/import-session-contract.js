/* ============================================================
   IMPORT-SESSION-CONTRACT.JS — Knowledge Acquisition Operational Readiness (V2.1)

   PURPOSE: fix the five-state Import Session lifecycle as data — the ONE
   authority on legal state moves for an UPLOADED artifact's journey,
   mirroring knowledge/contracts/lifecycle-contract.js's exact shape
   (frozen enum + graph + pure canTransition) but a deliberate SIBLING, not
   a reuse: an Import Session tracks one uploaded file's operational
   journey (did a human validate it, approve it, did its content become
   Knowledge, is it archived); a KnowledgeItem's lifecycle tracks one
   extracted FACT's truth-value curation. Two different questions, two
   different graphs — exactly the same reasoning that already justifies
   ArchiveRecord being a sibling of KnowledgeItem rather than a reuse
   (organizational-memory/contracts/archive-record-contract.js's header).

   Uploaded → Pending Review → Approved → Knowledge Imported → Archived

   Plus one reject edge, Pending Review → Uploaded (send back for
   revision), mirroring lifecycle-contract.js's own Pending Review →
   Candidate reject precedent rather than leaving a bad upload stuck
   forever.

   RESPONSIBILITY: define the state set, the transition graph, a pure
   canTransition check, and ImportDecision validation (mirrors
   knowledge/contracts/review-contract.js#isValidReviewDecision's shape
   exactly, against this graph instead of LIFECYCLE_GRAPH).

   DEPENDENCIES: none.

   NON-GOALS: does not persist anything (see
   ../repository/import-session-repository.js), does not perform a
   transition (see ../import-session-engine.js), does not decide WHO may
   approve (approverId is accepted and recorded, never authorized, same
   open question review-contract.js leaves).
   ============================================================ */

'use strict';

export const IMPORT_SESSION_SCHEMA = 'import-session@1';

export const IMPORT_SESSION_STATE = Object.freeze({
  UPLOADED: 'uploaded',
  PENDING_REVIEW: 'pending_review',
  APPROVED: 'approved',
  KNOWLEDGE_IMPORTED: 'knowledge_imported',
  ARCHIVED: 'archived',
});

export const IMPORT_SESSION_STATE_DEFS = Object.freeze([
  Object.freeze({ id: IMPORT_SESSION_STATE.UPLOADED, label: 'Uploaded' }),
  Object.freeze({ id: IMPORT_SESSION_STATE.PENDING_REVIEW, label: 'Pending Review' }),
  Object.freeze({ id: IMPORT_SESSION_STATE.APPROVED, label: 'Approved' }),
  Object.freeze({ id: IMPORT_SESSION_STATE.KNOWLEDGE_IMPORTED, label: 'Knowledge Imported' }),
  Object.freeze({ id: IMPORT_SESSION_STATE.ARCHIVED, label: 'Archived' }),
]);

/** The ONE authority on legal Import Session moves. */
export const IMPORT_SESSION_GRAPH = Object.freeze({
  [IMPORT_SESSION_STATE.UPLOADED]: Object.freeze([IMPORT_SESSION_STATE.PENDING_REVIEW]),
  // reject edge: a reviewer sends a bad upload back for revision instead of
  // leaving it stuck — mirrors lifecycle-contract.js's Pending Review ->
  // Candidate precedent.
  [IMPORT_SESSION_STATE.PENDING_REVIEW]: Object.freeze([IMPORT_SESSION_STATE.APPROVED, IMPORT_SESSION_STATE.UPLOADED]),
  [IMPORT_SESSION_STATE.APPROVED]: Object.freeze([IMPORT_SESSION_STATE.KNOWLEDGE_IMPORTED]),
  [IMPORT_SESSION_STATE.KNOWLEDGE_IMPORTED]: Object.freeze([IMPORT_SESSION_STATE.ARCHIVED]),
  [IMPORT_SESSION_STATE.ARCHIVED]: Object.freeze([]),
});

/** States never automatic — same Decision 6 discipline as
 *  lifecycle-contract.js's HUMAN_GATED_STATES: no path into Approved may be
 *  taken without an explicit human review action. */
export const IMPORT_SESSION_HUMAN_GATED_STATES = Object.freeze([IMPORT_SESSION_STATE.APPROVED]);

/**
 * Pure structural check: is `from -> to` a legal single-step transition?
 * @param {string} from
 * @param {string} to
 * @returns {boolean}
 */
export function canTransitionImportSession(from, to) {
  const reachable = IMPORT_SESSION_GRAPH[from];
  return Array.isArray(reachable) && reachable.includes(to);
}

/** Whether `to` requires the structural human-approval gate. */
export function isImportSessionHumanGated(to) {
  return IMPORT_SESSION_HUMAN_GATED_STATES.includes(to);
}

/**
 * @typedef {Object} ImportDecision
 * @property {string} toState        - one of IMPORT_SESSION_STATE
 * @property {string} approverId     - who decided
 * @property {string} decidedAt      - ISO 8601
 * @property {string|null} preferenceRationale - required when toState is APPROVED
 */

/**
 * Structural check that an ImportDecision is well-formed and legal against
 * IMPORT_SESSION_GRAPH. Mirrors review-contract.js#isValidReviewDecision
 * exactly, against this graph instead. Does NOT check approver authority.
 * @param {*} decision
 * @param {string} fromState
 * @returns {boolean}
 */
export function isValidImportDecision(decision, fromState) {
  if (!decision || typeof decision !== 'object') return false;
  if (typeof decision.approverId !== 'string' || !decision.approverId) return false;
  if (!canTransitionImportSession(fromState, decision.toState)) return false;
  if (decision.toState === IMPORT_SESSION_STATE.APPROVED
    && (typeof decision.preferenceRationale !== 'string' || !decision.preferenceRationale)) {
    return false;
  }
  return true;
}

/** The supported upload formats — closed set, Dataset Validation reads
 *  this same list (see ../import-validation-engine.js) so the allow-list
 *  is defined once. */
export const IMPORT_SESSION_KIND = Object.freeze({
  PDF: 'pdf',
  DOCX: 'docx',
  JSON: 'json',
  SYNTHETIC: 'synthetic',
});

/**
 * @typedef {Object} ImportSessionRecord
 * @property {string} id                 - deterministic, `import-session:<domainType>:<counter>`
 * @property {number} version            - append-only, same invariants as ArchiveRecord/KnowledgeItem
 * @property {string} domainType         - registry-backed domainType (registry/domain-type-registry.js)
 * @property {string} datasetType        - one of DATASET_TYPE (datasets/contracts/dataset-contract.js)
 * @property {string} filename
 * @property {string} mimeType
 * @property {number} sizeBytes
 * @property {string} kind               - one of IMPORT_SESSION_KIND (the upload FORMAT — pdf/docx/json/synthetic)
 * @property {string} knowledgeKind       - registry-backed knowledge/registry/kind-registry.js kind (e.g. 'rule', 'recipient', 'document_fact') — what SHAPE of Knowledge this upload becomes, chosen by the human in the manual-entry form, distinct from `kind` (the file format)
 * @property {string} state              - one of IMPORT_SESSION_STATE
 * @property {string} datasetId          - the auto-registered DatasetSpec this session is wired to
 * @property {Object|null} manualEntryFacts - human-typed facts (PDF/DOCX path), pre-Approved capture
 * @property {Object|null} parsedContent    - JSON.parse() result (JSON path only)
 * @property {string|null} documentHash  - V2.1: the real SHA-256 file-content hash once file-storage/file-storage-engine.js#uploadFile() runs; falls back to the older metadata-only proxy hash only if no file bytes were ever hashed (never both at once)
 * @property {string|null} sha256        - V2.1: same value as documentHash post-upload, kept as its own named field so callers reading for storage/dedup purposes don't need to know about the historical proxy-hash fallback
 * @property {string|null} storagePath   - V2.1: the real Firebase Storage path (file-storage/file-storage-contract.js#StoredFileRecord.storagePath), or null if not yet uploaded
 * @property {string|null} fileStorageId - V2.1: the StoredFileRecord.id this session's original file is linked to
 * @property {number|null} confidence    - V2.1.2: the real inferMetadata() overallConfidence at creation time, persisted (previously only ever transient batch-processing state) — drives both the Advanced Metadata prompt and the auto-import decision, and is shown honestly in Review/Session Viewer
 * @property {Object|null} confidenceRationale - V2.1.2: per-field {domainType, datasetType, knowledgeKind} rationale strings from the same inference call, for explainability (Part K "every review item must display... supporting evidence")
 * @property {boolean} autoImported      - V2.1.2: true if this session's confidence cleared AUTO_IMPORT_CONFIDENCE_THRESHOLD and it was walked through Approve->Knowledge Imported->Archived without a manual click
 * @property {string|null} batchId       - V2.1.2: the ImportBatchRecord.id this session was created as part of (Part M "Import Batch" metadata link) — null only for a session created outside a batch (should not happen via the UI, kept nullable for contract honesty)
 * @property {Object[]} validationWarnings
 * @property {Object[]} validationErrors
 * @property {string|null} knowledgeItemId
 * @property {Object|null} importReport  - the real KnowledgeImportReport once Knowledge Imported
 * @property {string|null} archiveRecordId
 * @property {string} uploadedBy
 * @property {string|null} approvedBy
 * @property {string|null} approvedAt
 * @property {string|null} preferenceRationale
 * @property {string} createdAt
 * @property {string} updatedAt
 */

/** @param {{domainType: string, datasetType: string, filename: string, mimeType: string, sizeBytes: number, kind: string, knowledgeKind: string, datasetId: string, uploadedBy: string, batchId?: string|null}} seed */
export function makeImportSessionRecord({ id, domainType, datasetType, filename, mimeType, sizeBytes, kind, knowledgeKind, datasetId, uploadedBy, batchId = null }) {
  const now = new Date().toISOString();
  return Object.freeze({
    id, version: 1, domainType, datasetType, filename, mimeType, sizeBytes, kind, knowledgeKind,
    state: IMPORT_SESSION_STATE.UPLOADED,
    datasetId,
    batchId,
    manualEntryFacts: null,
    parsedContent: null,
    documentHash: null,
    sha256: null,
    storagePath: null,
    fileStorageId: null,
    confidence: null,
    confidenceRationale: null,
    autoImported: false,
    validationWarnings: Object.freeze([]),
    validationErrors: Object.freeze([]),
    knowledgeItemId: null,
    importReport: null,
    archiveRecordId: null,
    uploadedBy,
    approvedBy: null,
    approvedAt: null,
    preferenceRationale: null,
    createdAt: now,
    updatedAt: now,
  });
}

/** Structural validity check — same rough shape as isArchiveRecord/isDatasetSpec. */
export function isImportSessionRecord(r) {
  return !!r && typeof r === 'object'
    && typeof r.id === 'string' && r.id.length > 0
    && typeof r.version === 'number' && r.version >= 1
    && typeof r.domainType === 'string' && r.domainType.length > 0
    && typeof r.filename === 'string' && r.filename.length > 0
    && typeof r.mimeType === 'string' && r.mimeType.length > 0
    && typeof r.state === 'string' && Object.values(IMPORT_SESSION_STATE).includes(r.state)
    && typeof r.datasetId === 'string' && r.datasetId.length > 0;
}
