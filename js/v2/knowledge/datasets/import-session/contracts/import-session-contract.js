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
   forever, and (Phase 2.6) two terminal off-ramps — Cancelled and Failed —
   without which a file the pipeline could not finish had no legal place to
   land and simply sat in its last state forever.

   PHASE 2.6 — WHERE THE HUMAN GATE ACTUALLY LIVES. This file used to
   declare IMPORT_SESSION_HUMAN_GATED_STATES = [APPROVED] ("no path into
   Approved without an explicit human review action"). That flag was read by
   nothing — a dead constant — and the intent behind it was, on inspection,
   in the wrong place: an Import Session's `state` tracks an ADMINISTRATIVE
   fact (has this file been fingerprinted, validated, extracted, archived),
   not an EDITORIAL one. Approving an Import Session moves data between
   engines; it does not bless the resulting knowledge as organizationally
   true. The real, load-bearing human gate is one layer down and unchanged:
   every KnowledgeItem this pipeline produces lands as DRAFT
   (contracts/lifecycle-contract.js, connectors/manual-file-connector.js),
   and a human promotes it in Knowledge Center. So the administrative
   lifecycle here auto-advances whenever deterministic evidence is complete,
   and the ImportDecision below is an AUDIT RECORD of who/why (engine or
   human) — never a demand for a UI click. Two human approvals for one
   deterministic process was the bug, not the design.

   RESPONSIBILITY: define the state set, the transition graph, a pure
   canTransition check, and ImportDecision validation (mirrors
   knowledge/contracts/review-contract.js#isValidReviewDecision's shape
   exactly, against this graph instead of LIFECYCLE_GRAPH).

   DEPENDENCIES: none.

   NON-GOALS: does not persist anything (see
   ../repository/import-session-repository.js), does not perform a
   transition (see ../import-session-engine.js), does not drive a session
   through the pipeline (see ../pipeline-scheduler.js), does not decide WHO
   may approve (approverId is accepted and recorded, never authorized, same
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
  // Phase 2.6 — the two missing TERMINAL off-ramps. Before this, the graph
  // had exactly one sink (Archived), so a file the pipeline could never
  // finish (an unsupported format, a batch the operator cancelled) had
  // nowhere legal to land: it sat at `uploaded` forever, which is precisely
  // why "Uploading" badges never cleared and why cancellation could not be
  // represented at all. A lifecycle with unreachable terminals is not a
  // lifecycle — see IMPORT_SESSION_TERMINAL_STATES below.
  CANCELLED: 'cancelled',
  FAILED: 'failed',
});

export const IMPORT_SESSION_STATE_DEFS = Object.freeze([
  Object.freeze({ id: IMPORT_SESSION_STATE.UPLOADED, label: 'Uploaded' }),
  Object.freeze({ id: IMPORT_SESSION_STATE.PENDING_REVIEW, label: 'Pending Review' }),
  Object.freeze({ id: IMPORT_SESSION_STATE.APPROVED, label: 'Approved' }),
  Object.freeze({ id: IMPORT_SESSION_STATE.KNOWLEDGE_IMPORTED, label: 'Knowledge Imported' }),
  Object.freeze({ id: IMPORT_SESSION_STATE.ARCHIVED, label: 'Archived' }),
  Object.freeze({ id: IMPORT_SESSION_STATE.CANCELLED, label: 'Cancelled' }),
  Object.freeze({ id: IMPORT_SESSION_STATE.FAILED, label: 'Failed' }),
]);

/** The ONE authority on legal Import Session moves.
 *
 *  Phase 2.6 — every non-terminal state now has an edge to CANCELLED (the
 *  operator cancelled the batch it belongs to) and to FAILED (the pipeline
 *  hit a deterministic, non-recoverable condition — an unsupported format,
 *  or an automatic step that genuinely could not succeed after its bounded
 *  retries). KNOWLEDGE_IMPORTED deliberately has NO cancel edge: that
 *  session already produced real Knowledge, so its only honest remaining
 *  move is to finish archiving (partial progress is preserved, never
 *  thrown away — cancelling a batch never un-does completed work). */
export const IMPORT_SESSION_GRAPH = Object.freeze({
  [IMPORT_SESSION_STATE.UPLOADED]: Object.freeze([
    IMPORT_SESSION_STATE.PENDING_REVIEW, IMPORT_SESSION_STATE.CANCELLED, IMPORT_SESSION_STATE.FAILED,
  ]),
  // reject edge: a reviewer sends a bad upload back for revision instead of
  // leaving it stuck — mirrors lifecycle-contract.js's Pending Review ->
  // Candidate precedent.
  [IMPORT_SESSION_STATE.PENDING_REVIEW]: Object.freeze([
    IMPORT_SESSION_STATE.APPROVED, IMPORT_SESSION_STATE.UPLOADED,
    IMPORT_SESSION_STATE.CANCELLED, IMPORT_SESSION_STATE.FAILED,
  ]),
  [IMPORT_SESSION_STATE.APPROVED]: Object.freeze([
    IMPORT_SESSION_STATE.KNOWLEDGE_IMPORTED, IMPORT_SESSION_STATE.CANCELLED, IMPORT_SESSION_STATE.FAILED,
  ]),
  [IMPORT_SESSION_STATE.KNOWLEDGE_IMPORTED]: Object.freeze([
    IMPORT_SESSION_STATE.ARCHIVED, IMPORT_SESSION_STATE.FAILED,
  ]),
  [IMPORT_SESSION_STATE.ARCHIVED]: Object.freeze([]),
  [IMPORT_SESSION_STATE.CANCELLED]: Object.freeze([]),
  [IMPORT_SESSION_STATE.FAILED]: Object.freeze([]),
});

/** The three absorbing states. The scheduler's terminal-state guarantee
 *  (pipeline-scheduler.js) is exactly: every session eventually reaches one
 *  of these, OR rests at AWAITING_EVIDENCE (PIPELINE_STAGE below) because a
 *  human genuinely has to supply a fact the engine cannot invent. Those are
 *  the only four permanent resting places in this system. */
export const IMPORT_SESSION_TERMINAL_STATES = Object.freeze([
  IMPORT_SESSION_STATE.ARCHIVED, IMPORT_SESSION_STATE.CANCELLED, IMPORT_SESSION_STATE.FAILED,
]);

export function isTerminalImportSessionState(state) {
  return IMPORT_SESSION_TERMINAL_STATES.includes(state);
}

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

/** Phase 2 Follow-up / Phase 2.6 — the SINGLE source of truth for pipeline
 *  progress. A persisted, RTDB-backed annotation on the session (never a
 *  transient local UI callback), so progress survives refresh/reconnection/
 *  restart/multi-tab exactly like every other session field.
 *
 *  THE LADDER (the ten conceptual steps a document passes through):
 *
 *    Preparing → Fingerprinting → Duplicate Detection → Classification →
 *    Uploading → Policy Validation → Knowledge Extraction →
 *    Learning Registration → Archive → Completed
 *
 *  ...plus three OFF-RAMPS a document may legitimately leave the ladder on:
 *  Awaiting Evidence, Cancelled, Failed.
 *
 *  PERSISTED vs PASSED-THROUGH (Phase 2.6 — read this before adding a
 *  stage write). Only a stage a session can actually be OBSERVED AT is ever
 *  written; the rest are passed through synchronously inside a single
 *  engine call and have no resting point to persist. Writing a marker for
 *  an instantaneous step would be a fabricated state, and an enum member no
 *  session can ever hold is a dead branch. So:
 *
 *    PREPARING / FINGERPRINTING / DEDUPLICATION  pre-session — they all run
 *      to completion BEFORE createImportSession() has a record to write to.
 *      A session that exists has, by construction, passed all three.
 *    CLASSIFICATION      written once by createImportSession()
 *    UPLOADING           written once by markUploading(), immediately before
 *                        the real (slow, network-bound) Storage upload. This
 *                        is the ONLY stage that honestly means "uploading" —
 *                        before Phase 2.6 the display mapped CLASSIFICATION
 *                        to the word "Uploading", which is why every file
 *                        that never advanced sat under a permanent, lying
 *                        "Uploading" badge.
 *    POLICY_VALIDATION   written once by submitImportSessionForReview()
 *    KNOWLEDGE_EXTRACTION written once by markKnowledgeImported()
 *    LEARNING / ARCHIVE  passed through inside markArchived()'s single write
 *      (Learning Registration is a pure recompute over the repository the
 *      new item just joined — Knowledge Graph + Pattern Discovery are reads,
 *      not jobs; there is no work to wait on and so no resting point).
 *    COMPLETED           written once by markArchived()
 *
 *  Every one of those writes RIDES AN EXISTING appendVersion() — no stage
 *  costs a second write (D1), and each fires exactly once. */
export const PIPELINE_STAGE = Object.freeze({
  PREPARING: 'preparing',
  FINGERPRINTING: 'fingerprinting',
  DEDUPLICATION: 'deduplication',
  CLASSIFICATION: 'classification',
  UPLOADING: 'uploading',
  POLICY_VALIDATION: 'policy_validation',
  KNOWLEDGE_EXTRACTION: 'knowledge_extraction',
  LEARNING: 'learning',
  ARCHIVE: 'archive',
  COMPLETED: 'completed',
  // Off-ramps — deliberately NOT in PIPELINE_STAGE_ORDER (they are not
  // "further along the ladder", they are exits from it).
  AWAITING_EVIDENCE: 'awaiting_evidence',
  CANCELLED: 'cancelled',
  FAILED: 'failed',
});

/** The linear ladder, ordered, so a caller can compute "how far has this
 *  session got" as an index without hardcoding the sequence in two places.
 *  Off-ramp stages are excluded by design — see PIPELINE_OFF_RAMP_STAGES. */
export const PIPELINE_STAGE_ORDER = Object.freeze([
  PIPELINE_STAGE.PREPARING, PIPELINE_STAGE.FINGERPRINTING, PIPELINE_STAGE.DEDUPLICATION,
  PIPELINE_STAGE.CLASSIFICATION, PIPELINE_STAGE.UPLOADING, PIPELINE_STAGE.POLICY_VALIDATION,
  PIPELINE_STAGE.KNOWLEDGE_EXTRACTION, PIPELINE_STAGE.LEARNING, PIPELINE_STAGE.ARCHIVE,
  PIPELINE_STAGE.COMPLETED,
]);

/** A session sitting on one of these is OFF the ladder — its stage index is
 *  meaningless and must never be compared against PIPELINE_STAGE_ORDER. */
export const PIPELINE_OFF_RAMP_STAGES = Object.freeze([
  PIPELINE_STAGE.AWAITING_EVIDENCE, PIPELINE_STAGE.CANCELLED, PIPELINE_STAGE.FAILED,
]);

export function isOffRampStage(stage) {
  return PIPELINE_OFF_RAMP_STAGES.includes(stage);
}

/** The four permanent resting places — the scheduler's terminal guarantee
 *  (see ../pipeline-scheduler.js). AWAITING_EVIDENCE is permanent only
 *  until a human supplies the missing fact; the other three are absorbing. */
export const PIPELINE_RESTING_STAGES = Object.freeze([
  PIPELINE_STAGE.COMPLETED, PIPELINE_STAGE.CANCELLED, PIPELINE_STAGE.FAILED,
  PIPELINE_STAGE.AWAITING_EVIDENCE,
]);

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
 * @property {boolean} autoImported      - true if the pipeline walked this session through Approve->Knowledge Imported->Archived with no human click, because its deterministic evidence was complete. Phase 2.6: the old AUTO_IMPORT_CONFIDENCE_THRESHOLD that once decided this is gone — autonomy is decided by real evidence (content facts + trustworthy metadata), not by a score
 * @property {string} pipelineStage      - Phase 2 Follow-up: one of PIPELINE_STAGE — the persisted, RTDB-backed progress marker (source of truth for the live pipeline display; never derived from a transient callback). Defaults to CLASSIFICATION at creation (preparing+fingerprint+dedup+classify all complete before a session record exists); see PIPELINE_STAGE above for the exact, one-write-each transition table
 * @property {string|null} batchId       - V2.1.2: the ImportBatchRecord.id this session was created as part of (Part M "Import Batch" metadata link) — null only for a session created outside a batch (should not happen via the UI, kept nullable for contract honesty)
 * @property {string|null} metadataConfirmedBy - Phase 2.6: who manually confirmed/corrected this session's inferred metadata via Advanced Metadata. Fixes a real stuck-forever bug: `confidence` is the score the INFERENCE achieved and never changes afterwards, so a low-confidence session a human had already fixed kept re-reporting LOW_CONFIDENCE and could never leave the attention queue. A human's correction is better evidence than any score — once this is set, the low-confidence gate is satisfied
 * @property {number} pipelineAttempts   - Phase 2.6: how many times an AUTOMATIC advance of this session failed. Bounded by MAX_PIPELINE_ATTEMPTS in ../pipeline-scheduler.js; on exhaustion the session moves to FAILED with a real `failureReason` rather than retrying forever. This is what makes the terminal-state guarantee actually terminate
 * @property {string|null} failureReason - Phase 2.6: the real error message that sent this session to FAILED (never fabricated — always an engine's own returned message, or the deterministic condition that was detected)
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
    // Phase 2 Follow-up — a session that exists in the repository has, by
    // construction, already been prepared, fingerprinted, dedup-checked and
    // classified (all synchronous, before createImportSession runs), so
    // CLASSIFICATION is the honest starting stage; earlier stages are
    // pre-session and instantaneous.
    pipelineStage: PIPELINE_STAGE.CLASSIFICATION,
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
    metadataConfirmedBy: null,
    autoImported: false,
    pipelineAttempts: 0,
    failureReason: null,
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

/** Phase 2.6 — THE RTDB ROUND-TRIP NORMALIZER, and one of this milestone's
 *  two most consequential fixes.
 *
 *  Firebase RTDB does not store `null` and does not store an EMPTY ARRAY —
 *  both are simply absent from the snapshot it hands back. So a record
 *  written as `{..., validationErrors: [], archiveRecordId: null}` rehydrates
 *  after a refresh as `{...}` — those keys are GONE, not empty. Every
 *  `...spread`-based appendVersion() then carries the hole forward, and any
 *  `Array.isArray()`/`.length` read against it is a latent crash or, worse, a
 *  silent structural-validation failure that makes the write vanish with no
 *  error surfaced anywhere (this is precisely how "Batalkan Batch Ini" came
 *  to do nothing — see ./import-batch-contract.js#normalizeImportBatchRecord,
 *  where the very same hole made isImportBatchRecord() reject every merged
 *  record after a refresh, so cancelBatch()'s appendVersion silently failed).
 *
 *  Rehydration therefore re-establishes the record's full declared shape
 *  before anything reads it. It only ever restores an ABSENT key to its
 *  documented default — it never overwrites a value RTDB actually returned,
 *  so no real persisted fact can be clobbered by it.
 */
export function normalizeImportSessionRecord(r) {
  if (!r || typeof r !== 'object') return r;
  return {
    ...r,
    pipelineStage: r.pipelineStage || PIPELINE_STAGE.CLASSIFICATION,
    validationWarnings: Array.isArray(r.validationWarnings) ? r.validationWarnings : [],
    validationErrors: Array.isArray(r.validationErrors) ? r.validationErrors : [],
    manualEntryFacts: r.manualEntryFacts ?? null,
    parsedContent: r.parsedContent ?? null,
    documentHash: r.documentHash ?? null,
    sha256: r.sha256 ?? null,
    storagePath: r.storagePath ?? null,
    fileStorageId: r.fileStorageId ?? null,
    confidence: typeof r.confidence === 'number' ? r.confidence : null,
    confidenceRationale: r.confidenceRationale ?? null,
    metadataConfirmedBy: r.metadataConfirmedBy ?? null,
    autoImported: !!r.autoImported,
    pipelineAttempts: typeof r.pipelineAttempts === 'number' ? r.pipelineAttempts : 0,
    failureReason: r.failureReason ?? null,
    knowledgeItemId: r.knowledgeItemId ?? null,
    importReport: r.importReport ?? null,
    archiveRecordId: r.archiveRecordId ?? null,
    batchId: r.batchId ?? null,
    approvedBy: r.approvedBy ?? null,
    approvedAt: r.approvedAt ?? null,
    preferenceRationale: r.preferenceRationale ?? null,
  };
}
