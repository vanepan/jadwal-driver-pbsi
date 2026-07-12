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
  IMPORT_SESSION_STATE, makeImportSessionRecord, isValidImportDecision, canTransitionImportSession,
} from './contracts/import-session-contract.js';
import {
  create as repoCreate, appendVersion as repoAppendVersion, getById as repoGetById,
  getHistory as repoGetHistory, list as repoList,
} from './repository/import-session-repository.js';
import { validateImportSession } from './import-validation-engine.js';
import { makeDatasetSpec } from '../contracts/dataset-contract.js';
import { registerDataset } from '../registry/dataset-registry.js';
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
 * Creates a new Import Session at Uploaded, and auto-registers a
 * DatasetSpec wired to manual-file's source — an uploaded file genuinely
 * IS "a named, classified, versioned collection wired to a sourceId", the
 * exact DatasetSpec definition (datasets/contracts/dataset-contract.js).
 */
export function createImportSession({ domainType, datasetType, filename, mimeType, sizeBytes, kind, knowledgeKind, uploadedBy, batchId = null }) {
  const id = nextImportSessionId(domainType);
  const datasetId = `${id}:dataset`;
  registerDataset(makeDatasetSpec({
    datasetId, name: filename, datasetType, domainType, sourceId: manualFileSource.id,
    description: `Auto-registered when Import Session "${id}" was uploaded.`,
  }));
  const record = makeImportSessionRecord({ id, domainType, datasetType, filename, mimeType, sizeBytes, kind, knowledgeKind, datasetId, uploadedBy, batchId });
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
export function updateSessionMetadata(id, { domainType, datasetType, knowledgeKind } = {}) {
  const patch = {};
  if (domainType) patch.domainType = domainType;
  if (datasetType) patch.datasetType = datasetType;
  if (knowledgeKind) patch.knowledgeKind = knowledgeKind;
  return repoAppendVersion(id, patch);
}

/** V2.1.2 — persists the real inferMetadata() result at creation time
 *  (previously only ever transient batch-processing UI state). No state
 *  change. */
export function attachInferenceResult(id, { confidence, confidenceRationale }) {
  return repoAppendVersion(id, { confidence, confidenceRationale });
}

/** V2.1.2 — records that markKnowledgeImported() ran automatically
 *  because confidence cleared AUTO_IMPORT_CONFIDENCE_THRESHOLD, purely
 *  for honest display (Review Experience, Batch History) — never changes
 *  what markKnowledgeImported() itself does. */
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
  return repoAppendVersion(id, { state: IMPORT_SESSION_STATE.PENDING_REVIEW, validationErrors: errors, validationWarnings: warnings });
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
  const hasContentFacts = session.kind === 'json'
    ? !!session.parsedContent && Object.keys(session.parsedContent).length > 0
    : !!session.manualEntryFacts && Object.keys(session.manualEntryFacts).length > 0;
  if (!hasContentFacts) {
    return failure('MISSING_CONTENT_FACTS', `Import session "${id}" has no human-verified content yet — attach manual-entry facts (or JSON content) via Advanced Metadata before it can become Knowledge.`);
  }

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
  return repoAppendVersion(id, { state: IMPORT_SESSION_STATE.ARCHIVED, archiveRecordId });
}

export function getImportSession(id) { return repoGetById(id); }
export function listImportSessions(filter = {}) { return repoList(filter); }
export function getImportSessionHistory(id) { return repoGetHistory(id); }
