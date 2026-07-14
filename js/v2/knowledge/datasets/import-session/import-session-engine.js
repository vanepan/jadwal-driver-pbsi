/* ============================================================
   IMPORT-SESSION-ENGINE.JS — Knowledge Acquisition Operational Readiness (V2.1)

   PURPOSE: the ONLY named entry points by which an Import Session may move
   through Uploaded -> Pending Review -> Approved -> Knowledge Imported ->
   Archived (plus the Pending Review -> Uploaded reject edge) — mirroring
   knowledge/review/review-workflow-engine.js's "named transitions only"
   discipline exactly, so an invalid move is impossible by construction.

   RESPONSIBILITY: createImportSession, attachManualEntryFacts,
   attachParsedContent, submitImportSessionForReview, approveImportSession,
   rejectImportSession, markKnowledgeImported, markArchived,
   getImportSession, listImportSessions, getImportSessionHistory.

   markKnowledgeImported() reuses dataset-import-service.js#importDataset()
   completely UNCHANGED — it queues this session's human-verified content
   under its own id (acquisition/manual-import-queue-store.js) and marks it
   the active entry immediately before calling importDataset(), so
   manual-file-connector.js#fetch() consumes exactly that one entry.

   markArchived() is a PURE reference write — it never constructs or writes
   an ArchiveRecord itself (that would be a knowledge/ -> organizational-
   memory/ import, forbidden by the one-way dependency rule in
   js/v2/README.md). The UI layer (js/v2/ui/dataset-import-center.js) is
   the one place allowed to see both layers: it constructs the
   ArchiveRecord, writes it, and THEN calls markArchived(id,
   archiveRecordId) to record the reference here.

   DEPENDENCIES: ./contracts/import-session-contract.js,
   ./repository/import-session-repository.js,
   ./import-validation-engine.js, ../contracts/dataset-contract.js,
   ../registry/dataset-registry.js, ../dataset-import-service.js
   (reused unchanged), ../../connectors/manual-file-connector.js
   (manualFileSource only, for wiring a DatasetSpec's sourceId),
   ../../acquisition/manual-import-queue-store.js.
   ============================================================ */

'use strict';

import {
  IMPORT_SESSION_STATE, PIPELINE_STAGE, makeImportSessionRecord, isValidImportDecision, canTransitionImportSession,
  isTerminalImportSessionState,
} from './contracts/import-session-contract.js';
import {
  create as repoCreate, appendVersion as repoAppendVersion, getById as repoGetById,
  getHistory as repoGetHistory, list as repoList,
} from './repository/import-session-repository.js';
import { validateImportSession } from './import-validation-engine.js';
import { makeDatasetSpec } from '../contracts/dataset-contract.js';
import { registerDataset, hasDataset } from '../registry/dataset-registry.js';
import { importDataset } from '../dataset-import-service.js';
import { manualFileSource, MANUAL_FILE_CONNECTOR_ID } from '../../connectors/manual-file-connector.js';
import { queueManualEntry, setActiveImportSession, clearActiveImportSession } from '../../acquisition/manual-import-queue-store.js';
import { generateKnowledgeId } from '../../contracts/identity-contract.js';

export const IMPORT_SESSION_ENGINE_ERRORS = Object.freeze({
  NOT_FOUND: 'NOT_FOUND',
  ILLEGAL_TRANSITION: 'ILLEGAL_TRANSITION',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  INVALID_IMPORT_DECISION: 'INVALID_IMPORT_DECISION',
  NOT_APPROVED: 'NOT_APPROVED',
  NOT_KNOWLEDGE_IMPORTED: 'NOT_KNOWLEDGE_IMPORTED',
  ALREADY_TERMINAL: 'ALREADY_TERMINAL',
});

function failure(code, message) {
  return Object.freeze({ ok: false, data: null, error: Object.freeze({ code, message }) });
}

let _counter = 0;
function nextImportSessionId(domainType) {
  _counter += 1;
  return `import-session:${domainType}:${Date.now()}:${_counter}`;
}

/**
 * Phase 2.6 — THE AUTONOMOUS-IMPORT ROOT CAUSE, fixed.
 *
 * Every Import Session owns a DatasetSpec, derived ENTIRELY from the session
 * itself (`datasetId` is literally `<sessionId>:dataset`), and
 * markKnowledgeImported() cannot run without it — importDataset() resolves
 * the spec to find the connector that reads it.
 *
 * But the dataset registry is a plain in-memory Map, while Import Sessions
 * are RTDB-persisted and rehydrate on load. So after ANY page refresh the
 * sessions came back and their DatasetSpecs did not. markKnowledgeImported()
 * then failed with DATASET_NOT_FOUND, cascadeFromApproved() returned false,
 * and the session parked at Approved — which the UI dutifully surfaced as
 * "Fakta konten lengkap tetapi belum berhasil menjadi Knowledge" with an
 * "Impor sebagai Knowledge" button that called the very same failing path
 * and so could never work, no matter how many times it was clicked. That is
 * the reported defect in Part 3 AND the second half of the redundant
 * Setujui → Impor double-approval in Part 4: one dead in-memory registry
 * entry, surfacing as two "the engine is asking me to do its job" bugs.
 *
 * The spec is a pure, deterministic function of the session, so it can
 * always be re-derived — nothing is fabricated and nothing is guessed.
 * Making it self-healing HERE (rather than in a separate rehydration pass)
 * means the engine is correct on its own, for every caller, whether or not
 * anyone remembered to run a projection first.
 *
 * Idempotent and O(1): registerDataset() is already idempotent per id, and
 * hasDataset() short-circuits the common case where the spec is present.
 */
export function ensureDatasetForSession(session) {
  if (!session || !session.datasetId) return null;
  if (hasDataset(session.datasetId)) return session.datasetId;
  registerDataset(makeDatasetSpec({
    datasetId: session.datasetId,
    name: session.filename,
    datasetType: session.datasetType,
    domainType: session.domainType,
    sourceId: manualFileSource.id,
    description: `Auto-registered for Import Session "${session.id}".`,
  }));
  return session.datasetId;
}

/**
 * Creates a new Import Session at Uploaded, and auto-registers a
 * DatasetSpec wired to manual-file's source — an uploaded file genuinely
 * IS "a named, classified, versioned collection wired to a sourceId", the
 * exact DatasetSpec definition (datasets/contracts/dataset-contract.js).
 */
export function createImportSession({ domainType, datasetType, filename, mimeType, sizeBytes, kind, knowledgeKind, uploadedBy, batchId = null }) {
  const id = nextImportSessionId(domainType);
  const datasetId = `${id}:dataset`;
  const record = makeImportSessionRecord({ id, domainType, datasetType, filename, mimeType, sizeBytes, kind, knowledgeKind, datasetId, uploadedBy, batchId });
  // Same derivation as the rehydration path — one formula, one place.
  ensureDatasetForSession(record);
  return repoCreate(record);
}

/** PDF/DOCX path — captures human-typed facts before submission. No state change. */
export function attachManualEntryFacts(id, facts) {
  return repoAppendVersion(id, { manualEntryFacts: facts });
}

/** JSON path — captures a real JSON.parse() result before submission. No state change. */
export function attachParsedContent(id, parsedContent) {
  return repoAppendVersion(id, { parsedContent });
}

/** V2.1 — Advanced Metadata: lets a human correct/complete a session's
 *  administrative metadata after zero-config auto-population left it at
 *  low confidence. No state change — same "pre-submission capture" shape
 *  as attachManualEntryFacts. Only the three inferred fields are
 *  patchable here; filename/mimeType/sizeBytes/kind are the file's own
 *  real properties and never editable. */
export function updateSessionMetadata(id, { domainType, datasetType, knowledgeKind, confirmedBy = null } = {}) {
  const patch = {};
  if (domainType) patch.domainType = domainType;
  if (datasetType) patch.datasetType = datasetType;
  if (knowledgeKind) patch.knowledgeKind = knowledgeKind;
  // Phase 2.6 — record WHO confirmed the metadata, and fix a real
  // stuck-forever bug while we're here. `confidence` is the score the
  // automatic INFERENCE achieved; it is a historical fact about that
  // inference and it never changes afterwards. So a session that scored below
  // AUTO_POPULATE_CONFIDENCE_THRESHOLD kept re-reporting LOW_CONFIDENCE
  // FOREVER — including after a human had opened Advanced Metadata and
  // corrected every field by hand. It could never leave the attention queue,
  // because the thing being measured (the machine's guess) was no longer the
  // thing that mattered (the human's correction). A human confirmation is
  // strictly better evidence than any inference score, so once it exists the
  // low-confidence gate is satisfied — see ../pipeline-scheduler.js and
  // dataset-import-center.js#reviewReasons, which both read this field.
  if (confirmedBy) patch.metadataConfirmedBy = confirmedBy;
  const result = repoAppendVersion(id, patch);
  // The DatasetSpec is derived from domainType/datasetType — a corrected
  // session must re-register its spec or the import would run against stale
  // classification.
  if (result.ok) ensureDatasetForSession(result.data);
  return result;
}

/** Phase 2.6 — the ONLY honest "Uploading" marker. Written immediately
 *  BEFORE the real, network-bound Storage upload begins (the one genuinely
 *  slow step in this pipeline, and the only one worth its own resting
 *  stage). Before this, nothing ever wrote an uploading stage at all: the
 *  Normal-mode display simply RELABELLED the persisted `classification`
 *  stage as the word "Uploading", so every file that stopped advancing —
 *  low confidence, unsupported format, failed validation — sat under a
 *  permanent "Uploading" badge describing an upload that had finished long
 *  ago (or never started). Part 2's defect, at its source. */
export function markUploading(id) {
  return repoAppendVersion(id, { pipelineStage: PIPELINE_STAGE.UPLOADING });
}

/** Phase 2.6 — the "Pending Human Evidence" off-ramp: the pipeline looked at
 *  this session, found the deterministic evidence it needs GENUINELY absent
 *  (no content fact a PDF/DOCX can never self-derive; or metadata the
 *  inference could not classify confidently and no human has confirmed), and
 *  stopped on purpose. This is a real conclusion, not a stall — and saying so
 *  in the persisted stage is what stops it from masquerading as in-flight
 *  work. Deliberately does NOT touch `state`: the session is still legally at
 *  Uploaded/Pending Review and will resume the instant the evidence arrives.
 *  Idempotent — re-marking an already-awaiting session writes nothing, so a
 *  repeated sweep costs zero writes. */
export function markAwaitingEvidence(id) {
  const current = repoGetById(id);
  if (!current.ok) return failure(IMPORT_SESSION_ENGINE_ERRORS.NOT_FOUND, current.error.message);
  if (current.data.pipelineStage === PIPELINE_STAGE.AWAITING_EVIDENCE) return current; // no-op, no write
  return repoAppendVersion(id, { pipelineStage: PIPELINE_STAGE.AWAITING_EVIDENCE });
}

/** Phase 2.6 — terminal: the operator cancelled the batch this session
 *  belongs to. Idempotent (already-cancelled is a successful no-op), and it
 *  REFUSES to touch a session that already reached a terminal state — a file
 *  that finished before the cancel landed stays finished. Cancelling never
 *  destroys completed work. */
export function cancelImportSession(id, reason = 'Batch impor dibatalkan oleh operator.') {
  const current = repoGetById(id);
  if (!current.ok) return failure(IMPORT_SESSION_ENGINE_ERRORS.NOT_FOUND, current.error.message);
  const s = current.data;
  if (s.state === IMPORT_SESSION_STATE.CANCELLED) return current; // converged
  if (isTerminalImportSessionState(s.state)) {
    return failure(IMPORT_SESSION_ENGINE_ERRORS.ALREADY_TERMINAL, `Import session "${id}" is already terminal ("${s.state}") — completed work is never un-done by a cancel.`);
  }
  if (!canTransitionImportSession(s.state, IMPORT_SESSION_STATE.CANCELLED)) {
    // Knowledge Imported has no cancel edge by design — it already produced
    // real Knowledge, so its only honest move is to finish archiving.
    return failure(IMPORT_SESSION_ENGINE_ERRORS.ILLEGAL_TRANSITION, `Cannot cancel import session "${id}" from state "${s.state}".`);
  }
  return repoAppendVersion(id, {
    state: IMPORT_SESSION_STATE.CANCELLED,
    pipelineStage: PIPELINE_STAGE.CANCELLED,
    failureReason: reason,
  });
}

/** Phase 2.6 — terminal: a deterministic, non-recoverable condition (an
 *  unsupported format; an automatic step that genuinely could not succeed
 *  after its bounded retries). `reason` is ALWAYS a real engine message or a
 *  real detected condition — never a fabricated explanation. This is the
 *  state that makes the terminal-state guarantee actually terminate: without
 *  it, a session the pipeline cannot finish has nowhere to go, and "retry
 *  forever" is indistinguishable from "stuck forever". */
export function failImportSession(id, reason) {
  const current = repoGetById(id);
  if (!current.ok) return failure(IMPORT_SESSION_ENGINE_ERRORS.NOT_FOUND, current.error.message);
  const s = current.data;
  if (s.state === IMPORT_SESSION_STATE.FAILED) return current; // converged
  if (isTerminalImportSessionState(s.state)) {
    return failure(IMPORT_SESSION_ENGINE_ERRORS.ALREADY_TERMINAL, `Import session "${id}" is already terminal ("${s.state}").`);
  }
  return repoAppendVersion(id, {
    state: IMPORT_SESSION_STATE.FAILED,
    pipelineStage: PIPELINE_STAGE.FAILED,
    failureReason: reason || 'Pipeline tidak dapat menyelesaikan sesi ini.',
  });
}

/** Phase 2.6 — records that ONE automatic advance attempt failed. Bounded by
 *  the scheduler (MAX_PIPELINE_ATTEMPTS); on exhaustion it calls
 *  failImportSession() with the last real error. Never incremented by a
 *  human-initiated action — a person may retry as often as they like. */
export function recordPipelineAttempt(id) {
  const current = repoGetById(id);
  if (!current.ok) return failure(IMPORT_SESSION_ENGINE_ERRORS.NOT_FOUND, current.error.message);
  return repoAppendVersion(id, { pipelineAttempts: (current.data.pipelineAttempts || 0) + 1 });
}

/** V2.1.2 — persists the real inferMetadata() result at creation time
 *  (previously only ever transient batch-processing UI state). No state
 *  change. */
export function attachInferenceResult(id, { confidence, confidenceRationale }) {
  return repoAppendVersion(id, { confidence, confidenceRationale });
}

/** Records that this session completed AUTOMATICALLY — the pipeline had all
 *  the deterministic evidence it needed and finished without a human click.
 *  Purely for honest display/provenance (Review Experience, Batch History);
 *  never changes what markKnowledgeImported() itself does.
 *  Phase 2.6 — set by the scheduler, which is now the only thing that can
 *  complete a session automatically. */
export function markAutoImported(id) {
  return repoAppendVersion(id, { autoImported: true });
}

/** V2.1 — records the real file-storage/file-storage-engine.js#uploadFile()
 *  result. `documentHash` is upgraded from the older metadata-only FNV-1a
 *  proxy to this real SHA-256 file-content hash — one hash, never both at
 *  once, per this milestone's backend-readiness audit. No state change. */
export function attachFileStorage(id, { sha256, storagePath, fileStorageId }) {
  return repoAppendVersion(id, { sha256, storagePath, fileStorageId, documentHash: sha256 });
}

/** Records the client-computed content hash (organizational-memory/document-hash.js). No state change. */
export function attachDocumentHash(id, documentHash) {
  return repoAppendVersion(id, { documentHash });
}

export function submitImportSessionForReview(id, opts = {}) {
  const current = repoGetById(id);
  if (!current.ok) return failure(IMPORT_SESSION_ENGINE_ERRORS.NOT_FOUND, current.error.message);
  if (!canTransitionImportSession(current.data.state, IMPORT_SESSION_STATE.PENDING_REVIEW)) {
    return failure(IMPORT_SESSION_ENGINE_ERRORS.ILLEGAL_TRANSITION, `Cannot submit import session "${id}" for review from state "${current.data.state}".`);
  }
  const { ok, errors, warnings } = validateImportSession(current.data, opts);
  if (!ok) {
    repoAppendVersion(id, { validationErrors: errors, validationWarnings: warnings });
    return failure(IMPORT_SESSION_ENGINE_ERRORS.VALIDATION_FAILED, `Import session "${id}" has ${errors.length} validation error(s) — blocked from review.`);
  }
  // Phase 2 Follow-up — pipelineStage rides this EXISTING appendVersion
  // write (zero new writes, D1): reaching Pending Review means Dataset
  // Validation (the "Policy Validation" step) has run.
  return repoAppendVersion(id, { state: IMPORT_SESSION_STATE.PENDING_REVIEW, pipelineStage: PIPELINE_STAGE.POLICY_VALIDATION, validationErrors: errors, validationWarnings: warnings });
}

export function approveImportSession(id, importDecision) {
  const current = repoGetById(id);
  if (!current.ok) return failure(IMPORT_SESSION_ENGINE_ERRORS.NOT_FOUND, current.error.message);
  const decision = { ...importDecision, toState: IMPORT_SESSION_STATE.APPROVED };
  if (!isValidImportDecision(decision, current.data.state)) {
    return failure(IMPORT_SESSION_ENGINE_ERRORS.INVALID_IMPORT_DECISION, 'approveImportSession: requires a valid ImportDecision with preferenceRationale.');
  }
  return repoAppendVersion(id, {
    state: IMPORT_SESSION_STATE.APPROVED,
    approvedBy: decision.approverId,
    approvedAt: decision.decidedAt,
    preferenceRationale: decision.preferenceRationale,
  });
}

/** The reject edge: Pending Review -> Uploaded, sending a bad upload back for revision. */
export function rejectImportSession(id, importDecision) {
  const current = repoGetById(id);
  if (!current.ok) return failure(IMPORT_SESSION_ENGINE_ERRORS.NOT_FOUND, current.error.message);
  const decision = { ...importDecision, toState: IMPORT_SESSION_STATE.UPLOADED };
  if (!isValidImportDecision(decision, current.data.state)) {
    return failure(IMPORT_SESSION_ENGINE_ERRORS.INVALID_IMPORT_DECISION, 'rejectImportSession: requires a valid ImportDecision.');
  }
  return repoAppendVersion(id, { state: IMPORT_SESSION_STATE.UPLOADED });
}

/**
 * Whether `session` carries real, human-verified content — a human-typed
 * fact (PDF/DOCX) or genuinely parsed JSON content, never fabricated.
 * Exported (Phase 1) so the exception-based review UI can surface a
 * session stuck on this exact gate instead of re-deriving the check.
 * @param {object} session
 */
export function hasContentFacts(session) {
  return session.kind === 'json'
    ? !!session.parsedContent && Object.keys(session.parsedContent).length > 0
    : !!session.manualEntryFacts && Object.keys(session.manualEntryFacts).length > 0;
}

/**
 * Approved -> Knowledge Imported. Reuses dataset-import-service.js#
 * importDataset() completely unchanged.
 * @param {string} id
 * @param {{onEvent?: Function}} [opts]
 */
export function markKnowledgeImported(id, opts = {}) {
  const current = repoGetById(id);
  if (!current.ok) return failure(IMPORT_SESSION_ENGINE_ERRORS.NOT_FOUND, current.error.message);
  const session = current.data;
  if (session.state !== IMPORT_SESSION_STATE.APPROVED) {
    return failure(IMPORT_SESSION_ENGINE_ERRORS.NOT_APPROVED, `Import session "${id}" must be Approved before it can be Knowledge Imported (current: "${session.state}").`);
  }
  // V2.1 — the content-fact requirement relocated HERE from
  // import-validation-engine.js (see that file's header): zero-config
  // upload can reach Approved on administrative metadata alone, but
  // reaching real Knowledge still requires either a human-typed fact
  // (PDF/DOCX) or genuinely parsed JSON content — never fabricated.
  if (!hasContentFacts(session)) {
    return failure('MISSING_CONTENT_FACTS', `Import session "${id}" has no human-verified content yet — attach manual-entry facts (or JSON content) via Advanced Metadata before it can become Knowledge.`);
  }

  // Phase 2.6 — self-heal the DatasetSpec before importing. The registry is
  // in-memory; the session is RTDB-persisted. After a refresh the session
  // came back and its spec did not, so importDataset() below returned
  // DATASET_NOT_FOUND and this session could NEVER become Knowledge —
  // no matter how many times a human pressed "Impor sebagai Knowledge".
  // See ensureDatasetForSession()'s header for the full failure story.
  ensureDatasetForSession(session);

  queueManualEntry({
    importSessionId: id,
    domainType: session.domainType,
    kind: session.knowledgeKind,
    sourceType: 'manual-file',
    facts: session.manualEntryFacts,
    parsedContent: session.parsedContent,
  });
  setActiveImportSession(id);
  let importResult;
  try {
    importResult = importDataset(session.datasetId, opts);
  } finally {
    clearActiveImportSession();
  }

  if (!importResult.ok) {
    return failure('IMPORT_FAILED', importResult.error ? importResult.error.message : 'importDataset() failed.');
  }

  // Deterministic id — identical formula to manual-file-connector.js#toKnowledgeItem's
  // own generateKnowledgeId() call, so this is a real lookup key, not a guess.
  const knowledgeItemId = generateKnowledgeId({ domainType: session.domainType, sourceType: MANUAL_FILE_CONNECTOR_ID, sourceRef: id });

  return repoAppendVersion(id, {
    state: IMPORT_SESSION_STATE.KNOWLEDGE_IMPORTED,
    pipelineStage: PIPELINE_STAGE.KNOWLEDGE_EXTRACTION, // Phase 2 Follow-up — folded into this existing write
    importReport: importResult.report,
    knowledgeItemId,
  });
}

/**
 * Knowledge Imported -> Archived. Pure reference write — see header. The
 * caller (UI layer) must already have constructed and written the
 * ArchiveRecord itself before calling this.
 */
export function markArchived(id, archiveRecordId) {
  const current = repoGetById(id);
  if (!current.ok) return failure(IMPORT_SESSION_ENGINE_ERRORS.NOT_FOUND, current.error.message);
  if (current.data.state !== IMPORT_SESSION_STATE.KNOWLEDGE_IMPORTED) {
    return failure(IMPORT_SESSION_ENGINE_ERRORS.NOT_KNOWLEDGE_IMPORTED, `Import session "${id}" must be Knowledge Imported before it can be Archived (current: "${current.data.state}").`);
  }
  // Phase 2 Follow-up — the terminal stage. Learning (the passive Pattern
  // Discovery / Knowledge Graph recompute) is instantaneous and needs no
  // resting stage of its own, so it folds into this final write.
  return repoAppendVersion(id, { state: IMPORT_SESSION_STATE.ARCHIVED, pipelineStage: PIPELINE_STAGE.COMPLETED, archiveRecordId });
}

export function getImportSession(id) { return repoGetById(id); }
export function listImportSessions(filter = {}) { return repoList(filter); }
export function getImportSessionHistory(id) { return repoGetHistory(id); }

// Phase 2 Follow-up — re-exported so callers reading the engine's surface
// (UI, check scripts) get the pipeline-stage vocabulary from the same
// import as the transition functions that advance it.
export { PIPELINE_STAGE };
