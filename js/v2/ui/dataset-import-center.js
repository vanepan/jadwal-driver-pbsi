/* ============================================================
   DATASET-IMPORT-CENTER.JS — Sarpras Intelligence, Dataset Import Center (V2.1)

   PURPOSE: the first real file-upload surface in this codebase — lets a
   pilot administrator drag in one file or hundreds, walk them through the
   Import Session lifecycle (Uploaded -> Pending Review -> Approved ->
   Knowledge Imported -> Archived, knowledge/datasets/import-session/*),
   and see them become real Knowledge via the manual-verification bridge.

   V2.1.1 — ZERO-CONFIGURATION IMPORT: the default workflow is now Select
   Files -> automatic metadata extraction -> Import Session creation ->
   Validation -> Review (only if necessary) -> Knowledge pipeline. Manual
   metadata entry ("Advanced Metadata") only surfaces when confidence is
   low, the format is unsupported, or the administrator explicitly opens
   it — see knowledge/datasets/import-session/metadata-inference-engine.js
   for the deterministic (no AI/OCR) inference this drives.

   Every file's real content hash (file-storage/file-hash.js#computeSha256)
   is checked against the file-storage dedup ledger BEFORE any Storage
   upload — identical bytes are never uploaded twice (file-storage/
   file-storage-engine.js#uploadFile).

   ARCHITECTURE: exported as a FACTORY (createDatasetImportController), not
   a module-level singleton — both archive-center.js (unscoped) and
   nor-center.js (scoped to domainType:'nor') embed this simultaneously,
   per Sarpras Intelligence's "every screen stays mounted" model, and must
   not share render state. The shared source of truth is the Import
   Session repository, not the controller instance — every render() call
   re-reads it fresh, same convention workspace-list-kit.js's consumers
   already follow (never cache, always re-list).

   This is the ONE UI file allowed to see both knowledge/ (Import Session
   engine) and organizational-memory/ (ArchiveRecord) — the
   Knowledge Imported -> Archived edge is composed HERE.

   DEPENDENCIES: knowledge/datasets/import-session/* (engine + contract +
   metadata-inference-engine.js), knowledge/datasets/contracts/
   dataset-contract.js, knowledge/datasets/registry/dataset-registry.js,
   knowledge/connectors/manual-file-connector.js, knowledge/registry/
   {domain-type,kind}-registry.js, organizational-memory/index.js (the one
   cross-layer read/write in this milestone), file-storage/* (V2.1, the
   new top-level sibling), ./shared/workspace-list-kit.js.

   NON-GOALS: no OCR, no AI, no PDF/DOCX content parsing — those formats
   only ever carry auto-derived administrative metadata + human-typed
   facts. No new persistence beyond the in-memory stores the engines
   already own, plus the one real Firebase Storage upload.
   ============================================================ */

'use strict';

import {
  IMPORT_SESSION_STATE, IMPORT_SESSION_STATE_DEFS, IMPORT_SESSION_GRAPH, IMPORT_SESSION_KIND,
  PIPELINE_STAGE, PIPELINE_STAGE_ORDER,
} from '../knowledge/datasets/import-session/contracts/import-session-contract.js';
import {
  createImportSession, attachManualEntryFacts, attachParsedContent, attachFileStorage,
  attachInferenceResult, markAutoImported,
  updateSessionMetadata, submitImportSessionForReview, approveImportSession, rejectImportSession,
  markKnowledgeImported, markArchived, getImportSession, listImportSessions, getImportSessionHistory,
  hasContentFacts,
} from '../knowledge/datasets/import-session/import-session-engine.js';
import {
  inferMetadata, inferPatternAssisted, AUTO_POPULATE_CONFIDENCE_THRESHOLD,
} from '../knowledge/datasets/import-session/metadata-inference-engine.js';
import {
  createBatch, recordBatchItem, pauseBatch, resumeBatch, cancelBatch, completeBatch,
  getBatch, listBatches, getBatchHistory, BATCH_STATUS,
} from '../knowledge/datasets/import-session/import-batch-engine.js';
import { DATASET_TYPE } from '../knowledge/datasets/contracts/dataset-contract.js';
import { listDatasets } from '../knowledge/datasets/registry/dataset-registry.js';
import { manualFileSource } from '../knowledge/connectors/manual-file-connector.js';
import { listDomainTypes, getDomainType } from '../knowledge/registry/domain-type-registry.js';
import { listKinds } from '../knowledge/registry/kind-registry.js';
import { computeDocumentHash, create as archiveCreate, list as archiveList } from '../organizational-memory/index.js';
import { generateKnowledgeId } from '../knowledge/contracts/identity-contract.js';
// Phase 2 (Autonomous Learning Pipeline), Part 6 — a real, already-
// existing, zero-AI engine (BFS over KnowledgeItem relationships); safe
// to import statically like every other knowledge/ engine here, since it
// has no Firebase dependency (unlike file-storage-engine.js below).
import { getNeighbors } from '../knowledge/services/knowledge-graph-service.js';
import { computeSha256 } from '../file-storage/file-hash.js';
import { listStoredFiles, getStoredFileBySha256 } from '../file-storage/file-storage-registry.js';
// V2.1 — file-storage-engine.js transitively imports js/firebase.js (the
// real Storage SDK, from a CDN at module top-level). Lazily imported
// INSIDE processOneFile() rather than statically here, so that mounting
// Archive Center / NOR Center — which happens every time their screen is
// shown, whether or not anyone ever uploads a file — never eagerly loads
// live Firebase Storage machinery. Same discipline
// knowledge/connectors/nor-connector.js's own header already documents
// for why it self-registers instead of being eagerly bootstrapped.

import {
  esc, renderEmptyState, renderRowList, renderStatCards, renderFilterBar, renderSearchBox,
  renderDetailSection, renderKvList, renderDetail, renderDiffTable, formatFileSize,
} from './shared/workspace-list-kit.js';

/** Phase 2 (Autonomous Learning Pipeline), Part 5 — "Unified Import
 *  Workspace": the daily flow (Upload -> Live Activity -> Needs Attention
 *  -> Completed) is now ONE page (`view: 'workspace'`, the default — see
 *  renderWorkspace()), no tab click required. These four are the
 *  audit/power-user views that used to be first-class tabs — still fully
 *  present, just moved one level down into a small "Utilities" menu (see
 *  renderUtilitiesBar()) so they stay out of the way of the daily
 *  workflow without losing any capability. */
const UTILITY_VIEWS = [
  { id: 'queue', label: 'Antrean Dataset (Semua)' },
  { id: 'browser', label: 'Dataset Browser' },
  { id: 'report', label: 'Laporan Impor' },
  { id: 'batches', label: 'Riwayat Batch' },
];

const RECENT_ROW_CAP = 20;

const BATCH_STATUS_DISPLAY_LABEL = Object.freeze({
  processing: 'Diproses',
  paused: 'Dijeda',
  completed: 'Selesai',
  cancelled: 'Dibatalkan',
});

const MIME_TO_KIND = Object.freeze({
  'application/pdf': IMPORT_SESSION_KIND.PDF,
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': IMPORT_SESSION_KIND.DOCX,
  'application/json': IMPORT_SESSION_KIND.JSON,
});

const STATE_LABEL = Object.freeze(
  IMPORT_SESSION_STATE_DEFS.reduce((acc, d) => ({ ...acc, [d.id]: d.label }), {}),
);

const QUEUE_ROW_CAP = 50;

const BATCH_STATUS_LABEL = Object.freeze({
  pending_review: 'Otomatis ke Pending Review',
  approved: 'Disetujui Otomatis (menunggu konten)',
  archived: 'Diimpor & Diarsipkan Otomatis',
  needs_advanced: 'Perlu Advanced Metadata',
  needs_attention: 'Perlu Perhatian (validasi gagal)',
  unsupported: 'Format Tidak Didukung',
  blocked: 'Terhalang — tidak ada domain',
  error: 'Error',
});

/* Phase 2 Follow-up — the canonical 7 pipeline stages (PIPELINE_STAGE /
   PIPELINE_STAGE_ORDER) now live on the Import Session contract and are
   imported above; they are the SINGLE source of truth (persisted on the
   session), never redefined here. Below are the two DISPLAY vocabularies
   over that one truth (Requirement 3). */

/** Developer mode — the seven real stages, full detail. */
const DEV_STAGE_LABEL = Object.freeze({
  [PIPELINE_STAGE.FINGERPRINTING]: 'Fingerprinting',
  [PIPELINE_STAGE.DEDUPLICATION]: 'Deduplication',
  [PIPELINE_STAGE.CLASSIFICATION]: 'Classification',
  [PIPELINE_STAGE.POLICY_VALIDATION]: 'Policy Validation',
  [PIPELINE_STAGE.KNOWLEDGE_EXTRACTION]: 'Knowledge Extraction',
  [PIPELINE_STAGE.LEARNING]: 'Learning',
  [PIPELINE_STAGE.COMPLETED]: 'Completed',
});

/** Normal mode — the five friendly phases. Ordered; each maps to a SET of
 *  canonical stages (the 7->5 collapse), so the same persisted stage lands
 *  in the right friendly phase. */
const NORMAL_PHASES = Object.freeze([
  { id: 'preparing', label: 'Preparing', stages: [PIPELINE_STAGE.FINGERPRINTING, PIPELINE_STAGE.DEDUPLICATION] },
  { id: 'uploading', label: 'Uploading', stages: [PIPELINE_STAGE.CLASSIFICATION] },
  { id: 'processing', label: 'Processing', stages: [PIPELINE_STAGE.POLICY_VALIDATION, PIPELINE_STAGE.KNOWLEDGE_EXTRACTION] },
  { id: 'finishing', label: 'Finishing', stages: [PIPELINE_STAGE.LEARNING] },
  { id: 'completed', label: 'Completed', stages: [PIPELINE_STAGE.COMPLETED] },
]);

/** The canonical stage -> normal-phase index (built once from the collapse
 *  map above), so a session's persisted stage resolves to its friendly
 *  phase without hardcoding the mapping twice. */
const STAGE_TO_NORMAL_PHASE_INDEX = (() => {
  const m = {};
  NORMAL_PHASES.forEach((phase, i) => { phase.stages.forEach((s) => { m[s] = i; }); });
  return Object.freeze(m);
})();

/** Phase 2.5 Part 4 — the authoritative 5-state lifecycle implies a MINIMUM
 *  pipeline stage a session must have reached. `state` is persisted and
 *  authoritative; `pipelineStage` is an annotation that can be missing on a
 *  legacy or rehydrated session. effectiveStage() below takes the FURTHER
 *  of the two, so a Knowledge-Imported/Archived row can never display an
 *  earlier stage like "Uploading" even when pipelineStage is absent/stale. */
const STATE_MIN_STAGE = Object.freeze({
  [IMPORT_SESSION_STATE.UPLOADED]: PIPELINE_STAGE.CLASSIFICATION,
  [IMPORT_SESSION_STATE.PENDING_REVIEW]: PIPELINE_STAGE.POLICY_VALIDATION,
  [IMPORT_SESSION_STATE.APPROVED]: PIPELINE_STAGE.POLICY_VALIDATION,
  [IMPORT_SESSION_STATE.KNOWLEDGE_IMPORTED]: PIPELINE_STAGE.KNOWLEDGE_EXTRACTION,
  [IMPORT_SESSION_STATE.ARCHIVED]: PIPELINE_STAGE.COMPLETED,
});

/** The real, never-stale pipeline stage for display: the later (by
 *  PIPELINE_STAGE_ORDER) of the persisted pipelineStage and the
 *  state-implied minimum. Deterministic, no fabrication — it only ever
 *  advances the displayed stage to match the authoritative persisted state,
 *  never invents progress the session hasn't made. */
export function effectiveStage(session) {
  const fromStage = PIPELINE_STAGE_ORDER.indexOf(session && session.pipelineStage);
  const fromState = PIPELINE_STAGE_ORDER.indexOf(STATE_MIN_STAGE[session && session.state] || PIPELINE_STAGE.CLASSIFICATION);
  const idx = Math.max(fromStage, fromState, 0);
  return PIPELINE_STAGE_ORDER[idx];
}

/** Phase 2.5 Part 5 — genuine operational counters computed DIRECTLY from
 *  persisted Import Sessions (never the transient `p.items`, never
 *  estimated/animated). Each session in the batch is classified into
 *  exactly one operational bucket by priority (failed > waiting-review >
 *  completed > active-stage), so the buckets partition cleanly. `total`
 *  and `failed` come from the persisted ImportBatchRecord (its own
 *  authoritative tally); the live per-stage distribution comes from the
 *  sessions themselves. Module-scope + exported so it is independently
 *  testable — it has no controller-closure dependency, only `p` and the
 *  module-level engine reads. */
export function computeBatchCounters(p) {
  const batchResult = p.batchId ? getBatch(p.batchId) : null;
  const batch = batchResult && batchResult.ok ? batchResult.data : null;
  const total = batch ? batch.totalFiles : p.total;

  const sessionIds = batch ? batch.sessionIds : (p.items || []).map((i) => i.sessionId).filter(Boolean);
  const buckets = { classification: 0, policy_validation: 0, knowledge_extraction: 0, learning: 0, completed: 0, waitingReview: 0, failed: 0 };
  let started = 0;
  for (const sid of sessionIds) {
    const r = getImportSession(sid);
    if (!r.ok) continue;
    started += 1;
    const s = r.data;
    const hasUnsupported = (s.validationErrors || []).some((e) => e.code === 'UNSUPPORTED_FORMAT');
    const reasons = reviewReasons(s);
    if (hasUnsupported) { buckets.failed += 1; continue; }
    if (s.state === IMPORT_SESSION_STATE.ARCHIVED) { buckets.completed += 1; continue; }
    if (reasons.length) { buckets.waitingReview += 1; continue; }
    // In-flight, non-terminal, nothing blocking — bucket by real stage.
    const stage = effectiveStage(s);
    if (stage === PIPELINE_STAGE.KNOWLEDGE_EXTRACTION) buckets.knowledge_extraction += 1;
    else if (stage === PIPELINE_STAGE.LEARNING) buckets.learning += 1;
    else if (stage === PIPELINE_STAGE.POLICY_VALIDATION) buckets.policy_validation += 1;
    else buckets.classification += 1; // fingerprint/dedup/classify span
  }
  // Files selected but not yet given a session (blocked with no domain, or
  // not started yet). The batch's persisted `error` tally counts real
  // failures (blocked/error/unsupported/needs_attention) that may have no
  // session; use the larger of it and the session-derived failed count so
  // a blocked-no-session file is still counted.
  const failed = Math.max(buckets.failed, batch ? batch.error : 0);
  const notStarted = Math.max(0, total - started);
  return {
    total,
    uploading: buckets.classification + notStarted, // "Uploading X / total": classifying + not-yet-started
    processing: buckets.policy_validation,
    knowledgeExtraction: buckets.knowledge_extraction,
    learning: buckets.learning,
    completed: buckets.completed,
    failed,
    waitingReview: buckets.waitingReview,
  };
}

const PRESENTATION_MODE_KEY = 'sarpras.import.presentationMode';

function loadPresentationMode() {
  try {
    const v = typeof localStorage !== 'undefined' ? localStorage.getItem(PRESENTATION_MODE_KEY) : null;
    return v === 'developer' ? 'developer' : 'normal';
  } catch { return 'normal'; }
}

function savePresentationMode(mode) {
  try { if (typeof localStorage !== 'undefined') localStorage.setItem(PRESENTATION_MODE_KEY, mode); } catch { /* private mode / disabled storage — non-fatal, just won't persist */ }
}

function domainLabel(id) {
  const registered = getDomainType(id);
  return registered ? registered.label : id;
}

function fileKind(mimeType) {
  return MIME_TO_KIND[mimeType] || null;
}

/**
 * @param {{domainType?: string|null, lockDomainType?: boolean}} [opts]
 * @returns {{render: () => string, onClick: (el: HTMLElement, rerender: () => void) => boolean, onInput: (e: Event, rerender: () => void) => boolean, onChange: (e: Event, rerender: () => void) => boolean, onDrop: (e: DragEvent, rerender: () => void) => boolean}}
 */
/** Duplicate-against-the-Archive check — lives HERE (the UI layer), not
 *  in import-validation-engine.js, since it's the one cross-layer read
 *  the one-way dependency rule forbids inside knowledge/. Module-scope
 *  (Phase 1) so other workspaces can reuse the real check instead of
 *  re-deriving a narrower one — it has no dependency on controller state. */
export function archiveDuplicateWarning(session) {
  if (!session.documentHash) return null;
  const result = archiveList({ sourceDomainType: session.domainType });
  if (!result.ok) return null;
  const matches = result.data.filter((r) => r.documentHash === session.documentHash);
  if (matches.length === 0) return null;
  return `Dokumen dengan hash yang sama sudah ada di Archive (${matches.length} kecocokan: ${matches.map((r) => r.documentNumber).join(', ')}) — kemungkinan duplikat.`;
}

/** V2.1.2 Part K — Exception-Based Review. Real reasons only, computed
 *  from signals already on the session (never fabricated): Low
 *  Confidence, Duplicate Ambiguity (within sessions or against the
 *  Archive), Unsupported Format, and (Phase 1) Missing Content Facts — a
 *  session Approved but not yet Knowledge Imported because no human-typed
 *  fact or parsed JSON content exists yet (markKnowledgeImported's own
 *  gate, reused via the exported hasContentFacts() rather than
 *  re-derived) was previously invisible to this filter despite being
 *  genuinely stuck waiting on a human. "Profile Conflict" is intentionally
 *  NOT implemented as a fabricated always-empty check — it would need
 *  design work beyond this milestone's scope (comparing a session's
 *  not-yet-typed content facts against Approved Profile Overrides is
 *  usually a no-op before Knowledge Imported) and is documented as a
 *  known gap in the final report rather than faked. Module-scope
 *  (Phase 1) so other workspaces can reuse the real exception logic. */
export function reviewReasons(session) {
  const reasons = [];
  // Phase 2.5 Part 6 — the pipeline now auto-completes any fully-evidenced
  // file, so a session that has NOT completed is, deterministically, one
  // whose evidence is genuinely missing or ambiguous. Missing content
  // facts (a PDF/DOCX whose human-typed fact does not exist yet) is the
  // single most common honest pause — surfaced here for Pending Review AND
  // Approved (previously only Approved), since a fully-autonomous pipeline
  // never leaves a facts-complete file waiting at Pending Review.
  const awaitingContent = (session.state === IMPORT_SESSION_STATE.PENDING_REVIEW || session.state === IMPORT_SESSION_STATE.APPROVED);
  if (awaitingContent && !hasContentFacts(session)) {
    reasons.push({ code: 'MISSING_CONTENT_FACTS', message: 'Belum ada fakta konten (manual atau JSON) — lampirkan fakta agar dapat diselesaikan.', confidence: session.confidence, evidence: null });
  } else if (session.state === IMPORT_SESSION_STATE.PENDING_REVIEW) {
    // Facts ARE present yet the file is still at Pending Review — the
    // auto-completion genuinely could not finish (a real engine error);
    // a human decision is legitimately needed. Rare, never routine noise.
    reasons.push({ code: 'PENDING_DECISION', message: 'Bukti lengkap tetapi belum selesai otomatis — perlu keputusan manual.', confidence: session.confidence, evidence: null });
  }
  if (typeof session.confidence === 'number' && session.confidence < AUTO_POPULATE_CONFIDENCE_THRESHOLD) {
    reasons.push({ code: 'LOW_CONFIDENCE', message: `Confidence ${session.confidence} di bawah ambang batas populasi otomatis (${AUTO_POPULATE_CONFIDENCE_THRESHOLD}).`, confidence: session.confidence, evidence: session.confidenceRationale });
  }
  for (const w of session.validationWarnings || []) {
    if (w.code === 'DUPLICATE_FILENAME' || w.code === 'DUPLICATE_METADATA') {
      reasons.push({ code: 'DUPLICATE_AMBIGUITY', message: w.message, confidence: session.confidence, evidence: null });
    }
  }
  const archiveDup = archiveDuplicateWarning(session);
  if (archiveDup) reasons.push({ code: 'DUPLICATE_AMBIGUITY', message: archiveDup, confidence: session.confidence, evidence: null });
  for (const e of session.validationErrors || []) {
    if (e.code === 'UNSUPPORTED_FORMAT') reasons.push({ code: 'UNSUPPORTED_FORMAT', message: e.message, confidence: session.confidence, evidence: null });
  }
  // Phase 2 — the Approved -> Knowledge Imported -> Archived cascade now
  // runs immediately once content facts exist (see cascadeFromApproved);
  // a session still sitting at Knowledge Imported with no archiveRecordId
  // means that cascade's own doArchive() step genuinely failed (a real
  // system error, e.g. archiveCreate() rejecting the record) — a rare but
  // real exception the engine could not resolve on its own.
  if (session.state === IMPORT_SESSION_STATE.KNOWLEDGE_IMPORTED && !session.archiveRecordId) {
    reasons.push({ code: 'ARCHIVE_PENDING', message: 'Knowledge Imported, tetapi belum berhasil diarsipkan otomatis.', confidence: session.confidence, evidence: null });
  }
  return reasons;
}

/** Archive composition (unchanged from prior milestone) — the ONE UI-layer
 *  function allowed to see both knowledge/ (Import Session) and
 *  organizational-memory/ (ArchiveRecord). Module-scope (Phase 2, same
 *  "promote for reuse/testability" convention as reviewReasons above) —
 *  it never touched controller closure state (`st`/`scopedDomainType`),
 *  only module-level engine imports. */
function doArchive(sessionId) {
  const current = getImportSession(sessionId);
  if (!current.ok) return false;
  const s = current.data;
  const facts = s.manualEntryFacts || s.parsedContent || {};
  const now = new Date().toISOString();
  const record = Object.freeze({
    id: generateKnowledgeId({ domainType: s.domainType, sourceType: 'manual-file', sourceRef: `archive:${s.id}` }),
    version: 1, sourceDomainType: s.domainType, sourceId: s.id, sourceType: 'manual-file',
    documentNumber: facts.documentNumber || s.filename,
    documentDate: facts.documentDate || null,
    senderOrigin: facts.senderOrigin || null,
    documentHash: s.sha256 || s.documentHash || computeDocumentHash({ filename: s.filename, mimeType: s.mimeType, sizeBytes: s.sizeBytes }),
    hasContributedKnowledge: !!s.knowledgeItemId,
    sourceSnapshot: facts,
    hasOriginalFile: !!s.storagePath, fileRef: s.storagePath || null,
    archivedAt: now, updatedAt: now,
  });
  const result = archiveCreate(record);
  if (!result.ok) return false;
  const archived = markArchived(sessionId, result.data.id);
  return archived.ok;
}

/** Phase 2 (Autonomous Learning Pipeline), Decision 4 — "never ask the
 *  user to manually continue the pipeline": Approved -> Knowledge
 *  Imported -> Archived now runs as one uninterrupted cascade the
 *  moment a session has real content facts, whether it got to Approved
 *  through the confidence-based auto-chain (processOneFile) or a human's
 *  manual "Setujui" click (onClick's dic-approve handler) — approval
 *  IS the human decision point; a second click to "continue" the same
 *  decision has nothing left to decide. Never called on a session
 *  missing content facts — markKnowledgeImported's own gate correctly
 *  refuses, surfaced honestly via reviewReasons' MISSING_CONTENT_FACTS.
 *  `auto:true` records provenance (markAutoImported) ONLY for the fully
 *  automatic path — a manually-approved session's later steps are still
 *  engine-driven, but the decision itself was a human's, so it keeps its
 *  own honest provenance rather than being mislabeled "automatic".
 *  Module-scope (Phase 2) so it's independently testable — see
 *  scripts/dataset-import-center-check.mjs.
 * @returns {boolean} true if the session reached Archived.
 */
export function cascadeFromApproved(sessionId, { auto = false } = {}) {
  const current = getImportSession(sessionId);
  if (!current.ok || !hasContentFacts(current.data)) return false;
  const importResult = markKnowledgeImported(sessionId);
  if (!importResult.ok) return false;
  if (auto) markAutoImported(sessionId);
  return doArchive(sessionId);
}

/** Phase 2, Decision 3 — "If duplicate -> Archive", made real. A
 *  confirmed byte-identical duplicate (same sha256, `uploadFile()`
 *  already found it in the dedup ledger) MAY reuse content facts a
 *  human already verified for that exact same content — never
 *  fabricated, since it's genuinely the same document. Only ever
 *  offered for PDF/DOCX (`kind !== 'json'`): JSON always derives its
 *  own facts from its own real bytes (`file.text()`), which for a
 *  byte-identical duplicate always succeeds if the original did, so
 *  reuse would be redundant there, not needed. Returns null (never
 *  fabricates) when no sibling session has verified content yet.
 *  Module-scope (Phase 2) — pure, no controller closure dependency,
 *  independently testable.
 * @param {import('../file-storage/contracts/file-storage-contract.js').StoredFileRecord} storedFileRecord
 * @param {string} currentSessionId
 */
export function findReusableContentFacts(storedFileRecord, currentSessionId) {
  if (!storedFileRecord) return null;
  for (const siblingId of storedFileRecord.linkedSessionIds) {
    if (siblingId === currentSessionId) continue;
    const siblingResult = getImportSession(siblingId);
    if (!siblingResult.ok) continue;
    const sibling = siblingResult.data;
    if (sibling.kind !== IMPORT_SESSION_KIND.JSON && hasContentFacts(sibling)) {
      return { manualEntryFacts: sibling.manualEntryFacts };
    }
  }
  return null;
}

export function createDatasetImportController(opts = {}) {
  const scopedDomainType = opts.domainType || null;
  const lockDomainType = !!opts.lockDomainType;

  const st = {
    // Phase 2, Part 5 — 'workspace' is the default, unified landing page;
    // 'queue'/'browser'/'report'/'batches' are the Utilities views (see
    // UTILITY_VIEWS / renderUtilitiesBar()).
    view: 'workspace',
    utilitiesOpen: false,
    // Phase 2 Follow-up (Req 3) — Normal (friendly, 5 phases) vs Developer
    // (detailed, 7 stages), persisted per-user in localStorage.
    presentationMode: loadPresentationMode(),
    queueStateFilter: '__all',
    selectedSessionId: null,
    reportSessionId: null,
    batchDomainType: scopedDomainType || (listDomainTypes()[0] ? listDomainTypes()[0].id : ''),
    // { batchId, total, processed, items: [{filename, sizeBytes, status, sessionId, wasDuplicate, warningCount, error, fileRef, startedAtMs}], control: {paused, cancelled}, startedAtMs, current: {filename, stage}|null, lastStageRenderMs }
    batchProgress: null,
    advancedEditId: null, // sessionId currently showing the Advanced Metadata panel
    advancedEdit: null,   // working copy of {domainType, datasetType, knowledgeKind, facts}
    resumeBannerDismissed: false, // V2.1.2 Part E — Upload Recovery
    batchSearch: '', // V2.1.2 Part I — Batch History
    batchStatusFilter: '__all',
    batchSort: 'newest', // 'newest' | 'oldest' | 'mostFiles'
    selectedBatchId: null,
    preview: { sessionId: null, url: null, loading: false, error: null }, // V2.1.2 Part L — Document Preview
  };

  /* ── shared reads ──────────────────────────────────────────────── */

  function sessions() {
    const filter = scopedDomainType ? { domainType: scopedDomainType } : {};
    const result = listImportSessions(filter);
    return result.ok ? result.data : [];
  }

  function domainOptions() {
    return scopedDomainType ? [{ id: scopedDomainType, label: domainLabel(scopedDomainType) }] : listDomainTypes();
  }

  /** V2.1.2 Part E — Upload Recovery: a batch left `processing`/`paused`
   *  after a browser refresh/restart/crash is a genuine unfinished
   *  session, not resolved by anything else — surfaced as a real Resume/
   *  Cancel/Discard banner rather than silently forgotten. */
  function unfinishedBatches() {
    const result = listBatches(scopedDomainType ? { domainType: scopedDomainType } : {});
    if (!result.ok) return [];
    return result.data.filter((b) => b.status === BATCH_STATUS.PROCESSING || b.status === BATCH_STATUS.PAUSED);
  }

  /* ── render dispatch ───────────────────────────────────────────── */

  function render() {
    if (st.view === 'workspace') return renderWorkspace();
    // Utilities views — reused completely unchanged, just reached one
    // level down instead of sitting in the main tab bar (Part 5).
    const body = {
      queue: renderQueue,
      browser: renderBrowser,
      report: renderReport,
      batches: renderBatchHistory,
    }[st.view] || renderQueue;
    return `${renderUtilitiesBar()}${body()}`;
  }

  /** Phase 2, Part 5 — a small, de-emphasized menu revealing the 4
   *  audit/power-user Utilities views. Shown on the workspace page (to
   *  reach a utility) AND on a utility page itself (to jump to another
   *  utility or back to the workspace) — never a separate navigation
   *  layer to get lost in. */
  function renderUtilitiesBar() {
    const backLink = st.view !== 'workspace'
      ? `<button class="wlk-btn wlk-btn--ghost" data-act="dic-view" data-id="workspace" type="button">← Kembali ke Import</button>` : '';
    const menuItems = UTILITY_VIEWS.map((v) => `
      <button class="dic-utilities-item${st.view === v.id ? ' dic-utilities-item--active' : ''}" data-act="dic-view" data-id="${esc(v.id)}" type="button">${esc(v.label)}</button>`).join('');
    return `
      <div class="wlk-sec dic-utilities-bar">
        ${backLink}
        ${renderModeToggle()}
        <div class="dic-utilities">
          <button class="wlk-btn wlk-btn--ghost" data-act="dic-utilities-toggle" type="button">Utilities ${st.utilitiesOpen ? '▴' : '▾'}</button>
          ${st.utilitiesOpen ? `<div class="dic-utilities-menu">${menuItems}</div>` : ''}
        </div>
      </div>`;
  }

  /** Phase 2, Part 5 — the unified single-page Import workflow: Upload ->
   *  Live Activity -> Needs Attention -> Completed/Recent Imports, no tab
   *  click required for the daily flow (Part 3's exception-only default
   *  lives here too — Needs Attention is prominent, Recent Imports is a
   *  collapsed, de-emphasized `<details>`). */
  function renderWorkspace() {
    const p = st.batchProgress;
    const all = sessions();
    const needsAttention = all.filter((s) => reviewReasons(s).length > 0);
    // Live Activity (D3) — derived from the repository's PERSISTED session
    // state, never a transient callback: a session is "in flight" when its
    // pipelineStage has not yet reached COMPLETED AND it has no reviewReason
    // holding it for a human. Empty after a refresh (nothing is actively
    // processing once the tab reloaded — the resume banner covers that),
    // which is the honest truth.
    const inFlight = all.filter((s) => s.pipelineStage !== PIPELINE_STAGE.COMPLETED && reviewReasons(s).length === 0 && s.state !== IMPORT_SESSION_STATE.ARCHIVED);
    const recent = all
      .filter((s) => reviewReasons(s).length === 0)
      .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
      .slice(0, RECENT_ROW_CAP);
    const resumeBanner = (!p && !st.resumeBannerDismissed) ? renderResumeBanner() : '';
    const progressBlock = p ? renderBatchProgress(p) : '';

    return `
      <div class="wlk-page">
        <div class="wlk-page-head">
          <div class="wlk-page-crumb">DATASET IMPORT CENTER</div>
          <h1 class="wlk-page-title">Impor Dokumen</h1>
          <p class="wlk-page-lede">Tidak ada OCR atau AI. Unggah dokumen — fingerprinting, deduplikasi, klasifikasi, validasi, ekstraksi pengetahuan, dan pengarsipan berjalan otomatis. Anda hanya perlu melihat bagian yang benar-benar memerlukan perhatian.</p>
        </div>

        ${renderUtilitiesBar()}
        ${resumeBanner}

        <div class="wlk-sec">${renderUploadZone()}</div>

        ${progressBlock}

        ${inFlight.length ? `
        <div class="wlk-sec">
          <div class="wlk-sec-title">Aktivitas Langsung (${inFlight.length})</div>
          ${renderRowList(inFlight.slice(0, QUEUE_ROW_CAP), renderQueueRow)}
        </div>` : ''}

        <div class="wlk-sec">
          <div class="wlk-sec-title">Perlu Perhatian (${needsAttention.length})</div>
          ${needsAttention.length
            ? renderRowList(needsAttention.slice(0, QUEUE_ROW_CAP), renderQueueRow)
            : renderEmptyState('Semua beres.', 'Tidak ada sesi yang memerlukan tindakan Anda saat ini.')}
        </div>

        <div class="wlk-sec">
          <details class="dic-recent"${needsAttention.length === 0 ? ' open' : ''}>
            <summary>Impor Terbaru (${recent.length})</summary>
            <div class="dic-recent-body">
              ${recent.length
                ? renderRowList(recent, renderQueueRow)
                : renderEmptyState('Belum ada impor.', 'Impor yang selesai tanpa masalah akan muncul di sini.')}
            </div>
          </details>
        </div>

        ${st.selectedSessionId ? renderSessionDetail(st.selectedSessionId) : ''}
      </div>`;
  }

  /** Phase 2 Follow-up (Req 3) — the Normal/Developer toggle, persisted to
   *  localStorage. Placed in the Utilities bar so it stays out of the way
   *  of the daily flow but is always reachable. */
  function renderModeToggle() {
    return `
      <div class="dic-mode-toggle" role="group" aria-label="Mode tampilan pipeline">
        <button class="dic-mode-btn${st.presentationMode === 'normal' ? ' dic-mode-btn--active' : ''}" data-act="dic-mode" data-id="normal" type="button">Normal</button>
        <button class="dic-mode-btn${st.presentationMode === 'developer' ? ' dic-mode-btn--active' : ''}" data-act="dic-mode" data-id="developer" type="button">Developer</button>
      </div>`;
  }

  /** Phase 4 — the redesigned drag zone: large, generous whitespace, a
   *  hidden native `<input>` triggered by a real styled button (never the
   *  raw browser file-chooser look), folder support unchanged/reused. */
  function renderUploadZone() {
    const domainSelect = `
      <select data-act="dic-batch-domain" class="wlk-select" ${lockDomainType ? 'disabled' : ''}>
        ${domainOptions().map((d) => `<option value="${esc(d.id)}" ${st.batchDomainType === d.id ? 'selected' : ''}>${esc(d.label)}</option>`).join('')}
      </select>`;

    return `
      <div class="dic-dropzone" data-act="dic-dropzone">
        <div class="dic-dropzone-icon" aria-hidden="true">⬆</div>
        <div class="dic-dropzone-title">Tarik &amp; lepas dokumen di sini</div>
        <div class="dic-dropzone-sub">PDF, DOCX, atau JSON — satu file atau ratusan sekaligus.</div>
        <div class="dic-dropzone-actions">
          <button class="wlk-btn dic-dropzone-btn" data-act="dic-choose-files" type="button">Pilih File</button>
          <button class="wlk-btn wlk-btn--ghost dic-dropzone-btn" data-act="dic-choose-folder" type="button">Pilih Folder</button>
        </div>
        <div class="dic-dropzone-hint">Metadata terisi otomatis dari nama file/folder, riwayat duplikat, dan Pattern Discovery — Advanced Metadata hanya muncul bila benar-benar diperlukan.</div>
        <div class="dic-dropzone-domain"><label>Domain Unggahan</label>${domainSelect}</div>
        <input data-act="dic-file-input" class="dic-file-input-hidden" type="file" multiple accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/json,.json"/>
        <input data-act="dic-folder-input" class="dic-file-input-hidden" type="file" multiple webkitdirectory directory/>
      </div>`;
  }

  /* ── Queue ─────────────────────────────────────────────────────── */

  function renderQueue() {
    const all = sessions();
    const stateFilters = [
      { id: '__all', label: 'Semua' },
      { id: '__needs_review', label: `Perlu Perhatian (${all.filter((s) => reviewReasons(s).length > 0).length})` },
      ...IMPORT_SESSION_STATE_DEFS.map((d) => ({ id: d.id, label: d.label })),
    ];
    const filtered = st.queueStateFilter === '__all' ? all
      : st.queueStateFilter === '__needs_review' ? all.filter((s) => reviewReasons(s).length > 0)
        : all.filter((s) => s.state === st.queueStateFilter);
    const rows = filtered.slice(0, QUEUE_ROW_CAP);
    const hiddenCount = filtered.length - rows.length;

    const cards = IMPORT_SESSION_STATE_DEFS.map((d) => ({ count: all.filter((s) => s.state === d.id).length, label: d.label }));

    return `
      <div class="wlk-page">
        <div class="wlk-page-head">
          <div class="wlk-page-crumb">DATASET IMPORT CENTER</div>
          <h1 class="wlk-page-title">Antrean Dataset</h1>
          <p class="wlk-page-lede">Uploaded &rarr; Pending Review &rarr; Approved &rarr; Knowledge Imported &rarr; Archived. Setiap unggahan nyata melewati alur ini — tidak ada status yang direkayasa. Review bersifat exception-based — sesi tanpa masalah nyata tidak perlu ditinjau manual.</p>
        </div>

        <div class="wlk-sec">${renderStatCards(cards)}</div>
        <div class="wlk-sec">${renderFilterBar(stateFilters, st.queueStateFilter, { act: 'dic-queue-filter' })}</div>

        <div class="wlk-sec">
          <div class="wlk-sec-title">Sesi Impor (${filtered.length})</div>
          ${rows.length ? renderRowList(rows, renderQueueRow) : renderEmptyState('Belum ada sesi impor.', 'Mulai dari tab "Unggah" untuk membuat sesi impor pertama.')}
          ${hiddenCount > 0 ? `<p class="wlk-page-lede">+${hiddenCount} sesi lain tidak ditampilkan — gunakan filter status untuk mempersempit daftar.</p>` : ''}
        </div>

        ${st.selectedSessionId ? renderSessionDetail(st.selectedSessionId) : ''}
      </div>`;
  }

  function nextActionFor(session) {
    const legal = IMPORT_SESSION_GRAPH[session.state] || [];
    if (legal.includes(IMPORT_SESSION_STATE.PENDING_REVIEW)) return { act: 'dic-submit', label: 'Ajukan untuk Review' };
    if (session.state === IMPORT_SESSION_STATE.PENDING_REVIEW) return { act: 'dic-approve', label: 'Setujui' };
    if (session.state === IMPORT_SESSION_STATE.APPROVED) return { act: 'dic-import', label: 'Impor sebagai Knowledge' };
    if (session.state === IMPORT_SESSION_STATE.KNOWLEDGE_IMPORTED) return { act: 'dic-archive', label: 'Arsipkan' };
    return null;
  }

  function renderQueueRow(s) {
    const next = nextActionFor(s);
    const rejectBtn = s.state === IMPORT_SESSION_STATE.PENDING_REVIEW
      ? `<button class="wlk-btn wlk-btn--ghost" data-act="dic-reject" data-id="${esc(s.id)}" type="button">Tolak</button>` : '';
    const reasons = reviewReasons(s);
    // Phase 1 (Operational Engine Hardening) — this button used to render
    // unconditionally on every row, including already-Archived ones. The
    // engine should only ask for human input when it genuinely lacks
    // confidence to proceed on its own; a clean, non-exceptional session
    // has nothing for Advanced Metadata to fix.
    const advancedBtn = reasons.length
      ? `<button class="wlk-btn wlk-btn--ghost" data-act="dic-advanced-open" data-id="${esc(s.id)}" type="button">Advanced Metadata</button>` : '';
    const reasonLine = reasons.length
      ? `<div class="wlk-row-secondary">Alasan: ${reasons.map((r) => esc(r.message)).join(' · ')} — Saran: ${esc(suggestedActionFor(reasons[0].code))}</div>` : '';
    // Phase 2 (Autonomous Learning Pipeline) — "never ask the user to
    // manually continue the pipeline": a next-action button only earns a
    // spot on a clean row's UI when the engine has a REAL, reviewReasons-
    // backed reason it couldn't already finish the step itself (approval
    // now cascades all the way to Archived on its own — see
    // cascadeFromApproved). Still fully wired (Human Override stays
    // possible on any exceptional row), just no longer offered where
    // there is nothing left for a human to decide.
    const nextBtn = (next && reasons.length)
      ? `<button class="wlk-btn" data-act="${next.act}" data-id="${esc(s.id)}" type="button">${esc(next.label)}</button>` : '';
    // Phase 2 Follow-up — the persisted pipeline stage in the active
    // vocabulary (Normal/Developer), read from the session itself.
    const stageBadge = `<span class="dic-stage-badge">${esc(stageLabelFor(s))}</span>`;
    return `
      <li class="wlk-row" data-act="dic-session-row" data-id="${esc(s.id)}" data-clickable="1">
        <span class="wlk-row-primary">${esc(s.filename)} — ${esc(STATE_LABEL[s.state] || s.state)}${s.autoImported ? ' · otomatis' : ''} ${stageBadge}</span>
        <span class="wlk-row-secondary">${esc(domainLabel(s.domainType))} · ${esc(s.kind)} · ${formatFileSize(s.sizeBytes)}${typeof s.confidence === 'number' ? ` · confidence ${s.confidence}` : ''}${s.validationWarnings && s.validationWarnings.length ? ` · ${s.validationWarnings.length} peringatan` : ''}</span>
        ${reasonLine}
        ${nextBtn}
        ${rejectBtn}
        ${advancedBtn}
      </li>`;
  }

  function suggestedActionFor(reasonCode) {
    return {
      PENDING_DECISION: 'Setujui atau Tolak sesi ini.',
      LOW_CONFIDENCE: 'Buka Advanced Metadata untuk melengkapi/mengoreksi.',
      DUPLICATE_AMBIGUITY: 'Bandingkan dengan dokumen yang sudah ada sebelum melanjutkan.',
      UNSUPPORTED_FORMAT: 'Format tidak didukung — dokumen ini tidak dapat diproses lebih lanjut.',
      MISSING_CONTENT_FACTS: 'Buka Advanced Metadata untuk melampirkan fakta konten sebelum menjadi Knowledge.',
      ARCHIVE_PENDING: 'Coba arsipkan ulang secara manual.',
    }[reasonCode] || 'Tinjau secara manual.';
  }

  function renderSessionDetail(id) {
    const result = getImportSession(id);
    if (!result.ok) return '';
    const s = result.data;
    const metadata = renderKvList([
      ['Nama File', s.filename], ['Tipe', s.mimeType], ['Ukuran', formatFileSize(s.sizeBytes)],
      ['Domain', domainLabel(s.domainType)], ['Tipe Dataset', s.datasetType], ['Knowledge Kind', s.knowledgeKind],
      ['Status', STATE_LABEL[s.state] || s.state], ['Import Batch', s.batchId],
      ['Diunggah oleh', s.uploadedBy], ['Disetujui oleh', s.approvedBy], ['Knowledge Item Id', s.knowledgeItemId],
      ['Archive Record Id', s.archiveRecordId], ['Diimpor Otomatis', s.autoImported ? 'Ya (confidence tinggi)' : 'Tidak'],
    ]);
    // V2.1.2 Part M — Metadata & Audit Improvements: Confidence Score +
    // Inference Source (Pattern Used), shown separately from the raw
    // metadata list for visibility.
    const confidenceKv = typeof s.confidence === 'number' ? renderKvList([
      ['Confidence Score', `${s.confidence}${s.confidenceRationale && s.confidenceRationale.level ? ` (${s.confidenceRationale.level})` : ''}`],
      ['Sumber Inferensi — Domain', s.confidenceRationale ? s.confidenceRationale.domainType : '—'],
      ['Sumber Inferensi — Tipe Dataset', s.confidenceRationale ? s.confidenceRationale.datasetType : '—'],
      ['Sumber Inferensi — Knowledge Kind', s.confidenceRationale ? s.confidenceRationale.knowledgeKind : '—'],
    ]) : null;
    // Phase 2 Follow-up — the real, explainable confidence signal
    // breakdown persisted by the deterministic confidence engine. Each
    // signal shows whether it contributed (available) and why; the two
    // honest gaps (policyMatch/knowledgeGraphEvidence) render as
    // "not available" with their real rationale, never a fabricated score.
    const signals = s.confidenceRationale && Array.isArray(s.confidenceRationale.signals) ? s.confidenceRationale.signals : null;
    const confidenceSignalsKv = signals && signals.length ? renderKvList(signals.map((sig) => [
      sig.label,
      sig.available ? `${sig.subScore} (bobot ${sig.weight}) — ${sig.rationale}` : `tidak tersedia — ${sig.rationale}`,
    ])) : null;
    // Part H — Storage Hardening display: Original Size / Stored Size
    // (identical — no compression exists, shown honestly, never a
    // fabricated ratio) / Deduplication Status / Storage Path.
    const storageKv = s.storagePath ? renderKvList([
      ['SHA-256', s.sha256],
      ['Storage Path', s.storagePath],
      ['Original Size', formatFileSize(s.sizeBytes)],
      ['Stored Size', formatFileSize(s.sizeBytes)],
      ['Deduplication Status', s.fileStorageId && listStoredFiles().find((f) => f.id === s.fileStorageId && f.linkedSessionIds.length > 1) ? 'Duplikat — bytes tidak diunggah ulang' : 'Unggahan baru'],
    ]) : (s.sha256 ? renderKvList([['SHA-256', s.sha256], ['Storage Path', 'Belum diunggah ke Storage (lihat error unggahan bila ada)']]) : null);
    const previewHtml = renderDocumentPreview(s);
    const archiveDup = archiveDuplicateWarning(s);
    const warningPairs = [
      ...(s.validationWarnings || []).map((w) => [w.code, w.message]),
      ...(archiveDup ? [['DUPLICATE_ARCHIVE_MATCH', archiveDup]] : []),
    ];
    const warnings = warningPairs.length ? renderKvList(warningPairs) : null;
    const errors = s.validationErrors && s.validationErrors.length
      ? renderKvList(s.validationErrors.map((e) => [e.code, e.message])) : null;
    const facts = s.manualEntryFacts ? renderKvList(Object.entries(s.manualEntryFacts))
      : (s.parsedContent ? renderKvList(Object.entries(s.parsedContent)) : null);

    // V2.1 — Import Session Viewer: Knowledge status, Archive status,
    // Timeline, Pattern recommendations.
    const knowledgeStatusKv = s.knowledgeItemId ? renderKvList([['Knowledge Item', s.knowledgeItemId], ['Status', 'draft (menunggu review Knowledge terpisah)']]) : null;
    const archiveStatusKv = s.archiveRecordId ? renderKvList([['Archive Record', s.archiveRecordId]]) : null;
    const historyResult = getImportSessionHistory(id);
    const timeline = historyResult.ok
      ? renderKvList(historyResult.data.map((v) => [`Versi ${v.version}`, `${STATE_LABEL[v.state] || v.state} — ${v.updatedAt}`])) : null;
    const patternSuggestions = inferPatternAssisted(s.domainType, s.filename);
    const patternKv = patternSuggestions.length
      ? renderKvList(patternSuggestions.map((p) => [`${p.patternType}: ${p.value}`, `support ${p.supportCount} · confidence ${p.confidence}`])) : null;

    // Phase 2, Part 6 — "Autonomous Learning" made honest, not fabricated:
    // once this session has a real KnowledgeItem, it is IMMEDIATELY
    // reachable from the Knowledge Graph (a real BFS read, not a
    // recomputation) and already factored into Pattern Discovery's own
    // continuous, deterministic recompute above — no separate "run
    // learning now" step exists or is needed, because both are pure reads
    // over the repository this session just became part of.
    const learningKv = s.knowledgeItemId ? (() => {
      const neighbors = getNeighbors(s.knowledgeItemId);
      const relatedCount = neighbors.ok ? neighbors.data.length : 0;
      return renderKvList([
        ['Knowledge Graph', relatedCount > 0 ? `${relatedCount} item terkait ditemukan` : 'Belum ada item terkait (belum ada relationship yang ditautkan)'],
        ['Pattern Discovery', 'Dokumen ini kini ikut dihitung dalam rekomendasi Pattern Discovery berikutnya.'],
      ]);
    })() : null;

    const advancedPanel = st.advancedEditId === id ? renderAdvancedMetadataPanel(s) : '';

    return `
      <div class="wlk-sec">
        <div class="wlk-sec-title">Detail — ${esc(s.filename)}</div>
        ${renderDetail([
          renderDetailSection('Metadata', metadata),
          renderDetailSection(`Pipeline (${st.presentationMode === 'developer' ? 'Developer' : 'Normal'})`, renderPipelineStages(s)),
          renderDetailSection('Confidence & Sumber Inferensi', confidenceKv),
          renderDetailSection('Rincian Sinyal Confidence', confidenceSignalsKv),
          renderDetailSection('Storage', storageKv),
          renderDetailSection('Preview Dokumen', previewHtml),
          renderDetailSection('Fakta Terverifikasi', facts),
          renderDetailSection('Peringatan Validasi', warnings),
          renderDetailSection('Error Validasi', errors),
          renderDetailSection('Status Knowledge', knowledgeStatusKv),
          renderDetailSection('Status Archive', archiveStatusKv),
          renderDetailSection('Pembelajaran & Knowledge Graph', learningKv),
          renderDetailSection('Timeline', timeline),
          renderDetailSection('Rekomendasi Pattern Discovery', patternKv),
        ])}
        ${advancedPanel}
      </div>`;
  }

  /** V2.1.2 Part L — Document Preview. Real PDF preview only (the browser
   *  natively renders actual stored bytes fetched via getBytes() — never
   *  a signed URL, never a second PDF renderer). DOCX stays metadata-only
   *  (Decision 3 — no new parsing dependency this milestone); Metadata
   *  Preview/Storage Metadata/Import History/Pattern Discovery
   *  Explanation are the existing sections already rendered around this
   *  one, reused rather than duplicated here. */
  function renderDocumentPreview(s) {
    if (!s.storagePath) {
      return renderEmptyState('Preview tidak tersedia.', 'Dokumen belum tersimpan di Storage.');
    }
    if (s.mimeType !== 'application/pdf') {
      return renderEmptyState('Preview konten hanya tersedia untuk PDF saat ini.', 'DOCX menampilkan metadata saja — unggah ulang atau buka dokumen aslinya untuk membaca isi.');
    }
    if (st.preview.sessionId === s.id && st.preview.url) {
      return `<embed src="${esc(st.preview.url)}" type="application/pdf" class="dic-pdf-preview" />`;
    }
    if (st.preview.sessionId === s.id && st.preview.loading) {
      return renderEmptyState('Memuat preview…');
    }
    if (st.preview.sessionId === s.id && st.preview.error) {
      return renderEmptyState('Gagal memuat preview.', st.preview.error);
    }
    return `<button class="wlk-btn" data-act="dic-preview-load" data-id="${esc(s.id)}" data-path="${esc(s.storagePath)}" type="button">Muat Preview PDF</button>`;
  }

  /** Lazily loads Firebase Storage's real bytes (same lazy-import
   *  discipline as the upload path — never eager on mount) and
   *  constructs a LOCAL object URL — never a signed/public link. */
  async function loadDocumentPreview(sessionId, storagePath, rerender) {
    st.preview = { sessionId, url: null, loading: true, error: null };
    rerender();
    try {
      const { downloadFileFromStorage } = await import('../../firebase.js');
      const result = await downloadFileFromStorage(storagePath);
      if (!result.ok) {
        st.preview = { sessionId, url: null, loading: false, error: result.error };
      } else {
        const blob = new Blob([result.bytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        st.preview = { sessionId, url, loading: false, error: null };
      }
    } catch (err) {
      st.preview = { sessionId, url: null, loading: false, error: err && err.message ? err.message : 'Gagal memuat preview.' };
    }
    rerender();
  }

  /** V2.1 — "Advanced Metadata": the manual form, now collapsed by
   *  default and only shown on request (dic-advanced-open) or when a
   *  batch item's confidence was too low to auto-populate. Edits an
   *  EXISTING session (updateSessionMetadata/attachManualEntryFacts),
   *  never a pre-creation form — every file already has a real Import
   *  Session by the time this panel can appear. */
  function renderAdvancedMetadataPanel(s) {
    const edit = st.advancedEdit || { domainType: s.domainType, datasetType: s.datasetType, knowledgeKind: s.knowledgeKind, facts: s.manualEntryFacts || { value: '', documentNumber: '', senderOrigin: '', notes: '' } };
    const domainSelect = `
      <select data-act="dic-adv-field" data-field="domainType" class="wlk-select">
        ${listDomainTypes().map((d) => `<option value="${esc(d.id)}" ${edit.domainType === d.id ? 'selected' : ''}>${esc(d.label)}</option>`).join('')}
      </select>`;
    const datasetTypeSelect = `
      <select data-act="dic-adv-field" data-field="datasetType" class="wlk-select">
        ${Object.values(DATASET_TYPE).map((t) => `<option value="${esc(t)}" ${edit.datasetType === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}
      </select>`;
    const kindSelect = `
      <select data-act="dic-adv-field" data-field="knowledgeKind" class="wlk-select">
        ${listKinds().map((k) => `<option value="${esc(k.id)}" ${edit.knowledgeKind === k.id ? 'selected' : ''}>${esc(k.label)}</option>`).join('')}
      </select>`;
    const isJson = s.kind === IMPORT_SESSION_KIND.JSON;
    const factsForm = isJson ? '' : `
      <div class="wlk-form-row"><label>Nilai Pokok (value)</label><input data-act="dic-adv-fact" data-field="value" class="wlk-input" type="text" value="${esc(edit.facts.value)}" placeholder="Fakta utama yang benar-benar Anda baca dari dokumen"/></div>
      <div class="wlk-form-row"><label>Nomor Dokumen</label><input data-act="dic-adv-fact" data-field="documentNumber" class="wlk-input" type="text" value="${esc(edit.facts.documentNumber)}"/></div>
      <div class="wlk-form-row"><label>Dari (Sender Origin)</label><input data-act="dic-adv-fact" data-field="senderOrigin" class="wlk-input" type="text" value="${esc(edit.facts.senderOrigin)}"/></div>
      <div class="wlk-form-row"><label>Catatan</label><input data-act="dic-adv-fact" data-field="notes" class="wlk-input" type="text" value="${esc(edit.facts.notes)}"/></div>`;

    return `
      <div class="wlk-sec">
        <div class="wlk-sec-title">Advanced Metadata — ${esc(s.filename)}</div>
        <div class="wlk-form-row"><label>Domain</label>${domainSelect}</div>
        <div class="wlk-form-row"><label>Tipe Dataset</label>${datasetTypeSelect}</div>
        <div class="wlk-form-row"><label>Knowledge Kind</label>${kindSelect}</div>
        ${factsForm}
        <button class="wlk-btn" data-act="dic-advanced-save" data-id="${esc(s.id)}" type="button">Simpan</button>
        <button class="wlk-btn wlk-btn--ghost" data-act="dic-advanced-close" type="button">Tutup</button>
      </div>`;
  }

  /* ── Upload — see renderUploadZone() (Part 4/5): now embedded directly
     in the unified renderWorkspace() page, not a standalone tab. ──────── */

  /** V2.1.2 Part E — Upload Recovery: a real, non-dismissible-by-default
   *  banner for any batch left processing/paused (browser crash/refresh/
   *  restart). "Resume" here honestly means re-selecting the same files —
   *  browser File handles cannot survive a refresh, no software can
   *  restore them (see this milestone's plan, Decision 6) — so the CTA is
   *  framed as "select the same files again", not a false promise of
   *  automatic continuation. */
  function renderResumeBanner() {
    const unfinished = unfinishedBatches();
    if (!unfinished.length) return '';
    return `
      <div class="wlk-sec">
        <div class="dic-resume-banner">
          <div class="wlk-empty-title">Sesi unggah belum selesai ditemukan</div>
          <div class="wlk-empty-sub">${unfinished.length} batch belum selesai (kemungkinan karena refresh, restart browser, atau koneksi terputus). Pilih ulang folder/file yang sama untuk melanjutkan — sesi yang sudah berhasil akan otomatis dilewati, tidak diunggah ulang.</div>
          ${renderRowList(unfinished, (b) => `
            <li class="wlk-row">
              <span class="wlk-row-primary">${esc(b.id)} — ${b.imported}/${b.totalFiles} selesai</span>
              <span class="wlk-row-secondary">${esc(domainLabel(b.domainType))} · dimulai ${esc(b.startedAt)}</span>
              <button class="wlk-btn wlk-btn--ghost" data-act="dic-resume-batch-cancel" data-id="${esc(b.id)}" type="button">Batalkan Batch Ini</button>
            </li>`)}
          <button class="wlk-btn wlk-btn--ghost" data-act="dic-resume-banner-dismiss" type="button">Tutup</button>
        </div>
      </div>`;
  }

  /** Phase 2 Follow-up — the pipeline checklist for ONE session, read
   *  entirely from its PERSISTED `pipelineStage` (the single source of
   *  truth — survives refresh/multi-tab; never a transient callback).
   *  Renders whichever vocabulary the active presentation mode selects
   *  (Requirement 3): Developer shows all 7 canonical stages; Normal
   *  collapses them to the 5 friendly phases. */
  function renderPipelineStages(session) {
    if (!session) return '';
    const stage = effectiveStage(session); // Phase 2.5 Part 4 — never behind the authoritative state
    if (st.presentationMode === 'developer') {
      const currentIndex = PIPELINE_STAGE_ORDER.indexOf(stage);
      const items = PIPELINE_STAGE_ORDER.map((s, i) => {
        const state = i < currentIndex ? 'done' : i === currentIndex ? 'active' : 'pending';
        return `<li class="dic-stage dic-stage--${state}"><span class="dic-stage-dot"></span><span class="dic-stage-label">${esc(DEV_STAGE_LABEL[s])}</span></li>`;
      }).join('');
      return `<ol class="dic-stage-list">${items}</ol>`;
    }
    // Normal mode — collapse the persisted stage onto the 5 friendly phases.
    const currentPhase = STAGE_TO_NORMAL_PHASE_INDEX[stage] ?? 0;
    const items = NORMAL_PHASES.map((phase, i) => {
      const state = i < currentPhase ? 'done' : i === currentPhase ? 'active' : 'pending';
      return `<li class="dic-stage dic-stage--${state}"><span class="dic-stage-dot"></span><span class="dic-stage-label">${esc(phase.label)}</span></li>`;
    }).join('');
    return `<ol class="dic-stage-list">${items}</ol>`;
  }

  /** A compact single-line stage label for a row (active vocabulary),
   *  again read from the persisted stage. */
  function stageLabelFor(session) {
    const stage = effectiveStage(session); // Phase 2.5 Part 4 — authoritative-state-derived, never stale
    if (st.presentationMode === 'developer') return DEV_STAGE_LABEL[stage] || stage;
    const phaseIndex = STAGE_TO_NORMAL_PHASE_INDEX[stage] ?? 0;
    return NORMAL_PHASES[phaseIndex].label;
  }

  function renderBatchProgress(p) {
    const counters = computeBatchCounters(p);
    const failed = p.items.filter((i) => ['error', 'blocked', 'needs_attention'].includes(i.status));
    const isDone = p.processed === p.total && p.total > 0;
    const isCancelled = p.control.cancelled;
    const isPaused = p.control.paused;

    // Part J — real ETA/speed from measured elapsed time, never fabricated.
    const elapsedMs = Date.now() - p.startedAtMs;
    const avgMsPerFile = p.processed > 0 ? elapsedMs / p.processed : 0;
    const remaining = p.total - p.processed;
    const etaMs = avgMsPerFile * remaining;
    const bytesProcessed = p.items.reduce((n, i) => n + (i.sizeBytes || 0), 0);
    const bytesPerSecond = elapsedMs > 0 ? (bytesProcessed / (elapsedMs / 1000)) : 0;

    const controls = !isDone && !isCancelled ? `
      ${isPaused
        ? `<button class="wlk-btn" data-act="dic-batch-resume" type="button">Lanjutkan</button>`
        : `<button class="wlk-btn wlk-btn--ghost" data-act="dic-batch-pause" type="button">Jeda</button>`}
      <button class="wlk-btn wlk-btn--ghost" data-act="dic-batch-cancel" type="button">Batalkan</button>
    ` : '';

    // Phase 2 Follow-up (D3) — batch-level throughput only; per-file stage
    // is now the session's own persisted pipelineStage, shown live in the
    // repository-derived Live Activity list (renderLiveActivity) and on
    // each session row, not from any transient batch state.
    const liveActivity = (!isDone && !isCancelled)
      ? `<p class="wlk-page-lede" style="margin-top:0;">Sisa waktu perkiraan: ${etaMs > 0 ? Math.ceil(etaMs / 1000) + ' detik' : '—'} · Kecepatan: ${formatFileSize(bytesPerSecond)}/detik · Sisa file: ${remaining}</p>`
      : '';

    // Part 4 — a real success moment, only ever shown once genuinely
    // done with zero failures (never shown on a cancelled or
    // partially-failed batch — no fabricated celebration).
    const successBanner = (isDone && !isCancelled && failed.length === 0)
      ? `<div class="dic-success"><span class="dic-success-check">✓</span><span>Selesai — ${p.total} dokumen diproses, tidak ada yang gagal.</span></div>` : '';

    return `
      <div class="wlk-sec dic-progress${isDone && !isCancelled ? ' dic-progress--done' : ''}">
        <div class="wlk-sec-title">Progres — ${p.processed}/${p.total} diproses${isPaused ? ' (dijeda)' : ''}${isCancelled ? ' (dibatalkan)' : ''}</div>
        <div class="dic-progress-bar"><div class="dic-progress-fill" style="width:${p.total ? Math.round((p.processed / p.total) * 100) : 0}%"></div></div>
        ${successBanner}
        ${liveActivity}
        ${controls}
        ${renderStatCards([
          { count: `${counters.uploading} / ${counters.total}`, label: 'Uploading' },
          { count: counters.processing, label: 'Processing (Policy Validation)' },
          { count: counters.knowledgeExtraction, label: 'Knowledge Extraction' },
          { count: counters.learning, label: 'Learning' },
          { count: counters.completed, label: 'Completed' },
          { count: counters.waitingReview, label: 'Waiting Review' },
          { count: counters.failed, label: 'Failed' },
        ])}
        ${isDone || isCancelled ? renderRowList(p.items, (i) => `
          <li class="wlk-row" ${i.sessionId ? `data-act="dic-session-row" data-id="${esc(i.sessionId)}" data-clickable="1"` : ''}>
            <span class="wlk-row-primary">${esc(i.filename)} (${formatFileSize(i.sizeBytes)})</span>
            <span class="wlk-row-secondary">${esc(BATCH_STATUS_LABEL[i.status] || i.status)}${i.wasDuplicate ? ' · duplikat konten' : ''}${i.error ? ` · ${esc(i.error)}` : ''}</span>
            ${['error', 'unsupported', 'needs_attention'].includes(i.status) && i.sessionId ? `<button class="wlk-btn wlk-btn--ghost" data-act="dic-batch-retry-one" data-id="${esc(i.sessionId)}" type="button">Coba Lagi</button>` : ''}
          </li>`) : ''}
        ${(isDone || isCancelled) && failed.length > 0 ? `<button class="wlk-btn" data-act="dic-batch-retry-all" type="button">Coba Lagi Semua yang Gagal (${failed.length})</button>` : ''}
        ${isDone || isCancelled ? `<button class="wlk-btn" data-act="dic-view" data-id="queue" type="button">Buka Antrean Dataset</button><button class="wlk-btn wlk-btn--ghost" data-act="dic-batch-clear" type="button">Unggah Lagi</button>` : ''}
      </div>`;
  }

  /* ── Dataset Browser ───────────────────────────────────────────── */

  function renderBrowser() {
    const filter = scopedDomainType ? { domainType: scopedDomainType } : {};
    const datasets = listDatasets(filter).filter((d) => d.sourceId === manualFileSource.id);

    return `
      <div class="wlk-page">
        <div class="wlk-page-head">
          <div class="wlk-page-crumb">DATASET IMPORT CENTER · DATASET BROWSER</div>
          <h1 class="wlk-page-title">Dataset dari Unggahan</h1>
          <p class="wlk-page-lede">Dataset yang secara otomatis terdaftar dari setiap sesi impor pada Dataset Import Center ini — read-only sampai disetujui.</p>
        </div>
        <div class="wlk-sec">
          <div class="wlk-sec-title">Dataset (${datasets.length})</div>
          ${datasets.length ? renderRowList(datasets.slice(0, QUEUE_ROW_CAP), (d) => `
            <li class="wlk-row">
              <span class="wlk-row-primary">${esc(d.name)}</span>
              <span class="wlk-row-secondary">${esc(domainLabel(d.domainType))} · ${esc(d.datasetType)}</span>
            </li>`) : renderEmptyState('Belum ada dataset dari unggahan.', 'Dataset akan muncul di sini setelah sesi impor pertama dibuat.')}
        </div>
      </div>`;
  }

  /* ── Import Report / Dashboard ─────────────────────────────────── */

  /** A session was genuinely rejected if its history shows a real
   *  pending_review -> uploaded transition — mirrors workspace-list-kit.js#
   *  deriveRejectedFromCandidateQueue's exact reasoning. */
  function countRejectedSessions(all) {
    let n = 0;
    for (const s of all) {
      const historyResult = getImportSessionHistory(s.id);
      if (!historyResult.ok) continue;
      const versions = historyResult.data;
      for (let i = 1; i < versions.length; i += 1) {
        if (versions[i - 1].state === IMPORT_SESSION_STATE.PENDING_REVIEW && versions[i].state === IMPORT_SESSION_STATE.UPLOADED) {
          n += 1;
          break;
        }
      }
    }
    return n;
  }

  function renderReport() {
    const all = sessions();
    const candidates = all.filter((s) => s.importReport);
    const selected = st.reportSessionId ? getImportSession(st.reportSessionId) : null;

    const imported = all.length;
    const pendingReview = all.filter((s) => s.state === IMPORT_SESSION_STATE.PENDING_REVIEW).length;
    const duplicateCount = all.filter((s) => (s.validationWarnings || []).some((w) => w.code === 'DUPLICATE_METADATA' || w.code === 'DUPLICATE_FILENAME')).length;
    const unsupportedCount = all.filter((s) => (s.validationErrors || []).some((e) => e.code === 'UNSUPPORTED_FORMAT')).length;
    const warningsTotal = all.reduce((n, s) => n + (s.validationWarnings ? s.validationWarnings.length : 0), 0);
    const knowledgeProduced = all.filter((s) => !!s.knowledgeItemId).length;
    const rejectedTotal = countRejectedSessions(all);

    return `
      <div class="wlk-page">
        <div class="wlk-page-head">
          <div class="wlk-page-crumb">DATASET IMPORT CENTER · LAPORAN</div>
          <h1 class="wlk-page-title">Import Dashboard</h1>
          <p class="wlk-page-lede">Angka di bawah ini berasal langsung dari state Import Session yang nyata — boleh menunjukkan nol.</p>
        </div>

        <div class="wlk-sec">${renderStatCards([
          { count: imported, label: 'Imported (Sesi Dibuat)' },
          { count: pendingReview, label: 'Pending Review' },
          { count: duplicateCount, label: 'Duplicate' },
          { count: unsupportedCount, label: 'Unsupported' },
          { count: warningsTotal, label: 'Warnings' },
          { count: knowledgeProduced, label: 'Knowledge Produced' },
          { count: rejectedTotal, label: 'Dikirim Kembali (Reject)' },
        ])}</div>

        <div class="wlk-sec">
          <div class="wlk-sec-title">Sesi dengan Laporan Impor (${candidates.length})</div>
          ${candidates.length ? renderRowList(candidates.slice(0, QUEUE_ROW_CAP), (s) => `
            <li class="wlk-row" data-act="dic-report-row" data-id="${esc(s.id)}" data-clickable="1">
              <span class="wlk-row-primary">${esc(s.filename)}</span>
              <span class="wlk-row-secondary">${esc(STATE_LABEL[s.state] || s.state)}</span>
            </li>`) : renderEmptyState('Belum ada laporan impor.', 'Laporan muncul setelah sebuah sesi mencapai Knowledge Imported.')}
        </div>

        ${selected && selected.ok ? renderReportDetail(selected.data) : ''}
      </div>`;
  }

  function renderReportDetail(s) {
    const historyResult = getImportSessionHistory(s.id);
    const history = historyResult.ok ? historyResult.data : [];
    let diffHtml = null;
    if (history.length >= 2) {
      diffHtml = renderDiffTable(diffStates(history[history.length - 2], history[history.length - 1]));
    }
    const reportKv = s.importReport ? renderKvList([
      ['Item Dibuat', s.importReport.itemsCreated ?? 0],
      ['Item Diperbarui', s.importReport.itemsUpdated ?? 0],
      ['Item Dilewati', s.importReport.itemsSkipped ?? 0],
      ['Warnings', (s.importReport.warnings || []).length],
    ]) : null;

    return `
      <div class="wlk-sec">
        <div class="wlk-sec-title">Laporan — ${esc(s.filename)}</div>
        ${renderDetail([
          renderDetailSection('Knowledge Import Report', reportKv),
          renderDetailSection('Riwayat Versi', renderKvList(history.map((v) => [`Versi ${v.version}`, `${v.state} — ${v.updatedAt}`]))),
          renderDetailSection('Diff (versi terakhir vs sebelumnya)', diffHtml),
        ])}
      </div>`;
  }

  /** A minimal Import-Session-shaped diff (field/before/after/changeType),
   *  same shape renderDiffTable() expects. */
  function diffStates(before, after) {
    const fields = ['state', 'validationWarnings', 'knowledgeItemId', 'archiveRecordId'];
    const entries = fields
      .map((field) => ({ field, before: before[field], after: after[field], changeType: JSON.stringify(before[field]) === JSON.stringify(after[field]) ? null : 'modified' }))
      .filter((e) => e.changeType);
    return { entries, fieldsChanged: entries.length };
  }

  /* ── Batch History (V2.1.2 Part I) ─────────────────────────────── */

  function renderBatchHistory() {
    const allResult = listBatches(scopedDomainType ? { domainType: scopedDomainType } : {});
    let batches = allResult.ok ? allResult.data : [];

    const q = st.batchSearch.trim().toLowerCase();
    if (q) batches = batches.filter((b) => b.id.toLowerCase().includes(q) || b.createdBy.toLowerCase().includes(q));

    const statusFilters = [{ id: '__all', label: 'Semua' }, ...Object.entries(BATCH_STATUS_DISPLAY_LABEL).map(([id, label]) => ({ id, label }))];
    if (st.batchStatusFilter !== '__all') batches = batches.filter((b) => b.status === st.batchStatusFilter);

    const sorted = [...batches].sort((a, b) => {
      if (st.batchSort === 'oldest') return a.startedAt.localeCompare(b.startedAt);
      if (st.batchSort === 'mostFiles') return b.totalFiles - a.totalFiles;
      return b.startedAt.localeCompare(a.startedAt); // 'newest', default (listBatches already returns newest-first, re-sorted here for explicitness)
    });
    const sortOptions = [{ id: 'newest', label: 'Terbaru' }, { id: 'oldest', label: 'Terlama' }, { id: 'mostFiles', label: 'Jumlah File Terbanyak' }];

    return `
      <div class="wlk-page">
        <div class="wlk-page-head">
          <div class="wlk-page-crumb">DATASET IMPORT CENTER · RIWAYAT BATCH</div>
          <h1 class="wlk-page-title">Riwayat Batch</h1>
          <p class="wlk-page-lede">Setiap unggahan (drag-drop/pilih file/folder) menjadi satu Import Batch permanen — Batch ID, waktu mulai/selesai, total file, dan hasil nyata per batch.</p>
        </div>

        <div class="wlk-sec">${renderSearchBox(st.batchSearch, 'Cari berdasarkan Batch ID atau pengunggah…', { inputId: 'dicBatchSearch' })}</div>
        <div class="wlk-sec">${renderFilterBar(statusFilters, st.batchStatusFilter, { act: 'dic-batch-status-filter' })}</div>
        <div class="wlk-sec">${renderFilterBar(sortOptions, st.batchSort, { act: 'dic-batch-sort' })}</div>

        <div class="wlk-sec">
          <div class="wlk-sec-title">Batch (${sorted.length})</div>
          ${sorted.length ? renderRowList(sorted.slice(0, QUEUE_ROW_CAP), (b) => `
            <li class="wlk-row" data-act="dic-batch-row" data-id="${esc(b.id)}" data-clickable="1">
              <span class="wlk-row-primary">${esc(b.id)} — ${esc(BATCH_STATUS_DISPLAY_LABEL[b.status] || b.status)}</span>
              <span class="wlk-row-secondary">${esc(domainLabel(b.domainType))} · ${b.totalFiles} file · oleh ${esc(b.createdBy)} · ${esc(b.startedAt)}</span>
            </li>`) : renderEmptyState('Belum ada riwayat batch.', 'Setiap unggahan melalui tab "Unggah" akan tercatat di sini secara permanen.')}
        </div>

        ${st.selectedBatchId ? renderBatchDetail(st.selectedBatchId) : ''}
      </div>`;
  }

  function renderBatchDetail(batchId) {
    const result = getBatch(batchId);
    if (!result.ok) return '';
    const b = result.data;
    const summary = renderKvList([
      ['Batch ID', b.id], ['Dibuat oleh', b.createdBy], ['Domain', domainLabel(b.domainType)],
      ['Dimulai', b.startedAt], ['Selesai', b.finishedAt || '—'], ['Status', BATCH_STATUS_DISPLAY_LABEL[b.status] || b.status],
      ['Total File', b.totalFiles], ['Imported', b.imported], ['Duplicate', b.duplicate], ['Warning', b.warning],
      ['Error', b.error], ['Knowledge Produced', b.knowledgeProduced], ['Storage Digunakan', formatFileSize(b.storageUsedBytes)],
    ]);
    const historyResult = getBatchHistory(batchId);
    const auditTrail = historyResult.ok
      ? renderKvList(historyResult.data.map((v) => [`Versi ${v.version}`, `${BATCH_STATUS_DISPLAY_LABEL[v.status] || v.status} — ${v.updatedAt} (${v.sessionIds.length} sesi tercatat)`])) : null;
    const sessionLinks = b.sessionIds.length
      ? renderRowList(b.sessionIds.slice(0, QUEUE_ROW_CAP), (sid) => `
          <li class="wlk-row" data-act="dic-session-row" data-id="${esc(sid)}" data-clickable="1">
            <span class="wlk-row-primary">${esc(sid)}</span>
          </li>`) : null;

    return `
      <div class="wlk-sec">
        <div class="wlk-sec-title">Detail Batch — ${esc(b.id)}</div>
        ${renderDetail([
          renderDetailSection('Ringkasan', summary),
          renderDetailSection('Audit Trail', auditTrail),
          renderDetailSection('Sesi dalam Batch Ini', sessionLinks),
        ])}
      </div>`;
  }

  /* ── Archive composition + Phase 2 cascade/dedup-reuse helpers now live
     at module scope (doArchive/cascadeFromApproved/findReusableContentFacts,
     above createDatasetImportController) — reused here via closure, same
     as any other module-level import in this file. ──────────────────── */

  /* ── Zero-config batch processing (V2.1 -> V2.1.2) ────────────────── */

  /**
   * Processes ONE real file: hash -> infer metadata -> create Import
   * Session -> upload to Storage (dedup-checked) -> submit for review
   * (metadata confidence clears AUTO_POPULATE_CONFIDENCE_THRESHOLD, else it
   * pauses for Advanced Metadata) -> and, Phase 2.5 Part 6, auto-run
   * straight through Approve -> Knowledge Imported -> Archived whenever the
   * real content facts needed to proceed are present (JSON parsed content,
   * or a verified duplicate's reused human facts). Never fabricates a
   * result — every branch reflects a real engine call's actual outcome, and
   * PDF/DOCX can never auto-reach Knowledge Imported unless real content
   * facts exist somewhere (markKnowledgeImported's own content-fact gate,
   * unchanged, still requires a human-typed fact those formats can never
   * auto-derive from nothing).
   * @param {File} file
   * @param {string} folderPath
   * @param {string|null} batchId
   *
   * Phase 2 Follow-up — there is deliberately NO `onStage` callback anymore
   * (D3): pipeline progress is now the session's own persisted
   * `pipelineStage` field, advanced by the engine transitions below
   * (createImportSession seeds CLASSIFICATION; submit -> POLICY_VALIDATION;
   * markKnowledgeImported -> KNOWLEDGE_EXTRACTION; markArchived ->
   * COMPLETED), which is what makes progress survive refresh/restart/
   * multi-tab. The UI reads that persisted stage, never a local callback.
   */
  async function processOneFile(file, folderPath, batchId = null) {
    const kind = fileKind(file.type);
    const isUnsupported = !kind;
    const domainType = st.batchDomainType;
    const base = { filename: file.name, sizeBytes: file.size, fileRef: file, folderPath, sessionId: null, wasDuplicate: false, warningCount: 0, storageBytes: 0 };

    if (!domainType) {
      return { ...base, status: 'blocked', error: 'Tidak ada Domain Unggahan yang dipilih.' };
    }

    let sha256 = null;
    try { sha256 = await computeSha256(file); } catch { /* hashing failure must not block the whole batch */ }

    // Phase 2 Follow-up — parse JSON BEFORE inference so the confidence
    // engine's real document-structure / content-facts signals have the
    // parsed object to assess. Still no OCR/parse of PDF/DOCX (those pass
    // no content, and those two signals are honestly reported unavailable).
    let parsedContent = null;
    if (kind === IMPORT_SESSION_KIND.JSON) {
      try {
        parsedContent = JSON.parse(await file.text());
      } catch { /* real parse failure — leave null, never fabricate content */ }
    }

    const inferred = inferMetadata({ filename: file.name, mimeType: file.type, sizeBytes: file.size, folderPath, sha256, scopedDomainType: domainType, kind, parsedContent });

    const created = createImportSession({
      domainType: inferred.domainType.value || domainType,
      datasetType: inferred.datasetType.value,
      filename: file.name, mimeType: file.type, sizeBytes: file.size,
      kind: kind || 'unsupported', knowledgeKind: inferred.knowledgeKind.value,
      uploadedBy: 'evan', batchId,
    });
    if (!created.ok) return { ...base, status: 'error', error: created.error.message };
    const sessionId = created.data.id;
    base.sessionId = sessionId;

    // Persist the real confidence score AND the full explainable signal
    // breakdown (Phase 2 Follow-up) onto the session's existing
    // confidenceRationale field — no new field, rides this existing write.
    attachInferenceResult(sessionId, {
      confidence: inferred.overallConfidence,
      confidenceRationale: {
        domainType: inferred.domainType.rationale,
        datasetType: inferred.datasetType.rationale,
        knowledgeKind: inferred.knowledgeKind.rationale,
        level: inferred.confidenceReport.level,
        signals: inferred.confidenceReport.signals,
      },
    });
    if (parsedContent) attachParsedContent(sessionId, parsedContent);

    // A Storage failure (network hiccup, permission error) for ONE file
    // must never abort the rest of a bulk batch — caught and recorded as
    // a real, honest per-file outcome instead of an uncaught rejection
    // that would kill every file still queued behind it.
    let factsReusedFromDuplicate = false;
    if (sha256) {
      try {
        const { uploadFile } = await import('../file-storage/file-storage-engine.js');
        const uploadResult = await uploadFile(file, { domainType: inferred.domainType.value || domainType, importSessionId: sessionId });
        if (uploadResult.ok) {
          attachFileStorage(sessionId, { sha256: uploadResult.sha256, storagePath: uploadResult.record.storagePath, fileStorageId: uploadResult.record.id });
          base.wasDuplicate = uploadResult.wasDuplicate;
          base.storageBytes = uploadResult.wasDuplicate ? 0 : file.size;
          // Phase 2, Decision 3 — a confirmed byte-identical duplicate may
          // honestly inherit a sibling's already-verified content facts.
          if (uploadResult.wasDuplicate && kind !== IMPORT_SESSION_KIND.JSON) {
            const reused = findReusableContentFacts(uploadResult.record, sessionId);
            if (reused) {
              attachManualEntryFacts(sessionId, reused.manualEntryFacts);
              factsReusedFromDuplicate = true;
            }
          }
        }
      } catch (err) {
        console.error('[dataset-import-center] uploadFile failed for', file.name, err);
      }
    }

    if (isUnsupported) {
      submitImportSessionForReview(sessionId, { expectedDomainType: scopedDomainType || undefined });
      return { ...base, status: 'unsupported', error: null };
    }

    if (inferred.overallConfidence < AUTO_POPULATE_CONFIDENCE_THRESHOLD) {
      return { ...base, status: 'needs_advanced', error: null };
    }

    const submitResult = submitImportSessionForReview(sessionId, { expectedDomainType: scopedDomainType || undefined });
    if (!submitResult.ok) {
      return { ...base, status: 'needs_attention', error: submitResult.error.message };
    }
    base.warningCount = (submitResult.data.validationWarnings || []).length;

    // Phase 2.5 Part 6 — FULLY AUTONOMOUS COMPLETION. The engine now
    // auto-runs Approve -> Knowledge Imported -> Archived whenever the
    // deterministic evidence needed to proceed is genuinely present, and
    // pauses ONLY when it is genuinely missing. "Evidence present" =
    // real content facts exist (JSON parsed content, or a verified
    // duplicate's reused human facts) — this is what markKnowledgeImported
    // requires anyway, so completing here fabricates nothing. This
    // deliberately supersedes the old 0.85 confidence gate: confidence
    // now decides only whether metadata needed Advanced review (the
    // <AUTO_POPULATE branch above), not whether a fully-evidenced file
    // must wait for a redundant human "Setujui" click. The resulting
    // KnowledgeItem still lands as DRAFT (human-gated — Decision 6); only
    // the Import Session's own administrative lifecycle auto-advances.
    const current = getImportSession(sessionId);
    const hasEvidence = current.ok && hasContentFacts(current.data);
    if (hasEvidence) {
      const rationale = factsReusedFromDuplicate
        ? 'Diselesaikan otomatis — duplikat konten terverifikasi; fakta digunakan kembali dari sesi sebelumnya.'
        : `Diselesaikan otomatis — bukti konten lengkap (confidence ${inferred.overallConfidence}).`;
      const approveResult = approveImportSession(sessionId, { approverId: 'evan', decidedAt: new Date().toISOString(), preferenceRationale: rationale });
      if (approveResult.ok && cascadeFromApproved(sessionId, { auto: true })) {
        return { ...base, status: 'archived', error: null };
      }
    }

    // Genuinely missing evidence (PDF/DOCX with no human-typed facts yet):
    // the session rests at Pending Review and is surfaced honestly by
    // reviewReasons() as MISSING_CONTENT_FACTS — a real "needs a human
    // fact", never a fabricated completion.
    return { ...base, status: 'pending_review', error: null };
  }

  /**
   * Processes a whole batch sequentially (correctness over speed at this
   * data scale — Storage upload contention is the limiting factor, not
   * CPU), updating progress after every file, checking Pause/Cancel
   * between files, and recording every real outcome onto a persisted
   * ImportBatchRecord (Part I) so it survives refresh/restart.
   * @param {File[]} files
   * @param {(file: File) => string} folderPathFor
   * @param {() => void} rerender
   */
  async function processBatch(files, folderPathFor, rerender) {
    const batchResult = createBatch({ createdBy: 'evan', domainType: st.batchDomainType || 'unknown', totalFiles: files.length });
    const batchId = batchResult.ok ? batchResult.data.id : null;
    // Phase 2 Follow-up (D3) — no transient per-stage state here anymore.
    // Per-file progress is the batch record + each session's own persisted
    // pipelineStage (read live in renderWorkspace's Live Activity); this
    // local object only tracks batch-level counters + control flags.
    st.batchProgress = { batchId, total: files.length, processed: 0, items: [], control: { paused: false, cancelled: false }, startedAtMs: Date.now() };
    rerender();

    for (const file of files) {
      if (st.batchProgress.control.cancelled) break;
      // eslint-disable-next-line no-await-in-loop
      while (st.batchProgress.control.paused && !st.batchProgress.control.cancelled) {
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => { setTimeout(resolve, 200); });
      }
      if (st.batchProgress.control.cancelled) break;

      let item;
      try {
        // eslint-disable-next-line no-await-in-loop
        item = await processOneFile(file, folderPathFor(file), batchId);
      } catch (err) {
        // Robustness fix (Part F "no silent skipping"): an unexpected
        // throw ANYWHERE in processOneFile must still produce a real
        // result entry and let the batch continue — never silently drop
        // a file or abort everything queued behind it.
        console.error('[dataset-import-center] processOneFile threw for', file.name, err);
        item = { filename: file.name, sizeBytes: file.size, fileRef: file, folderPath: folderPathFor(file), sessionId: null, wasDuplicate: false, warningCount: 0, storageBytes: 0, status: 'error', error: err && err.message ? err.message : 'Unexpected error.' };
      }

      st.batchProgress.items.push(item);
      st.batchProgress.processed += 1;
      if (batchId) {
        recordBatchItem(batchId, item.sessionId, {
          imported: ['pending_review', 'approved', 'archived'].includes(item.status),
          duplicate: item.wasDuplicate,
          warningCount: item.warningCount || 0,
          error: ['blocked', 'error', 'unsupported', 'needs_attention'].includes(item.status),
          knowledgeProduced: item.status === 'archived',
          storageBytes: item.storageBytes || 0,
        });
      }
      rerender();
    }

    if (batchId) {
      if (st.batchProgress.control.cancelled) cancelBatch(batchId);
      else completeBatch(batchId);
    }
    rerender();
  }

  /** V2.1.2 Part G — re-attempts submission for a session that already
   *  exists but failed validation (unsupported/needs_attention) — never
   *  creates a duplicate session. A 'blocked' item (Domain Unggahan was
   *  empty, no session was ever created) has nothing to retry until the
   *  administrator sets a domain and re-selects the file. */
  function retryFailedItem(item, rerender) {
    if (!item.sessionId) return;
    const submitResult = submitImportSessionForReview(item.sessionId, { expectedDomainType: scopedDomainType || undefined });
    item.error = submitResult.ok ? null : (submitResult.error ? submitResult.error.message : item.error);
    item.status = submitResult.ok ? 'pending_review' : item.status;
    if (submitResult.ok) item.warningCount = (submitResult.data.validationWarnings || []).length;
    rerender();
  }

  function retryAllFailed(rerender) {
    if (!st.batchProgress) return;
    for (const item of st.batchProgress.items) {
      if (['error', 'unsupported', 'needs_attention'].includes(item.status)) retryFailedItem(item, rerender);
    }
  }

  /* ── events ────────────────────────────────────────────────────── */

  /**
   * @param {HTMLElement} el
   * @param {() => void} rerender
   * @returns {boolean} true if this controller handled the click
   */
  function onClick(el, rerender) {
    const act = el.dataset.act;
    if (!act || !act.startsWith('dic-')) return false;
    const id = el.dataset.id;

    if (act === 'dic-view') { st.view = id; st.utilitiesOpen = false; rerender(); return true; }
    // Part 5 — the Utilities menu itself.
    if (act === 'dic-utilities-toggle') { st.utilitiesOpen = !st.utilitiesOpen; rerender(); return true; }
    // Phase 2 Follow-up (Req 3) — Normal/Developer presentation mode.
    if (act === 'dic-mode') { st.presentationMode = id === 'developer' ? 'developer' : 'normal'; savePresentationMode(st.presentationMode); rerender(); return true; }
    // Part 4 — the redesigned dropzone's real buttons trigger the same
    // hidden, unchanged file inputs (folder support included) rather than
    // showing the native browser file-chooser control directly.
    if (act === 'dic-choose-files' || act === 'dic-choose-folder') {
      const zone = el.closest('.dic-dropzone');
      const targetAct = act === 'dic-choose-files' ? 'dic-file-input' : 'dic-folder-input';
      const input = zone && zone.querySelector(`[data-act="${targetAct}"]`);
      if (input) input.click();
      return true;
    }
    if (act === 'dic-queue-filter') { st.queueStateFilter = id; rerender(); return true; }
    if (act === 'dic-session-row') { st.selectedSessionId = st.selectedSessionId === id ? null : id; rerender(); return true; }
    if (act === 'dic-report-row') { st.reportSessionId = st.reportSessionId === id ? null : id; rerender(); return true; }
    if (act === 'dic-batch-clear') { st.batchProgress = null; rerender(); return true; }

    // V2.1.2 Part G — Upload Queue Controls.
    if (act === 'dic-batch-pause') { if (st.batchProgress) { st.batchProgress.control.paused = true; if (st.batchProgress.batchId) pauseBatch(st.batchProgress.batchId); } rerender(); return true; }
    if (act === 'dic-batch-resume') { if (st.batchProgress) { st.batchProgress.control.paused = false; if (st.batchProgress.batchId) resumeBatch(st.batchProgress.batchId); } rerender(); return true; }
    if (act === 'dic-batch-cancel') { if (st.batchProgress) st.batchProgress.control.cancelled = true; rerender(); return true; }
    if (act === 'dic-batch-retry-all') { retryAllFailed(rerender); return true; }
    if (act === 'dic-batch-retry-one') {
      const item = st.batchProgress && st.batchProgress.items.find((i) => i.sessionId === id);
      if (item) retryFailedItem(item, rerender);
      return true;
    }

    // V2.1.2 Part E — Upload Recovery.
    if (act === 'dic-resume-banner-dismiss') { st.resumeBannerDismissed = true; rerender(); return true; }
    if (act === 'dic-resume-batch-cancel') { cancelBatch(id); rerender(); return true; }

    // V2.1.2 Part I — Batch History.
    if (act === 'dic-batch-status-filter') { st.batchStatusFilter = id; rerender(); return true; }
    if (act === 'dic-batch-sort') { st.batchSort = id; rerender(); return true; }
    if (act === 'dic-batch-row') { st.selectedBatchId = st.selectedBatchId === id ? null : id; rerender(); return true; }

    // V2.1.2 Part L — Document Preview.
    if (act === 'dic-preview-load') { loadDocumentPreview(id, el.dataset.path, rerender); return true; }

    if (act === 'dic-submit') { submitImportSessionForReview(id, { expectedDomainType: scopedDomainType || undefined }); rerender(); return true; }
    if (act === 'dic-approve') {
      // Phase 2, Decision 4 — approval IS the human decision point; once
      // made, the engine finishes the rest of the pipeline itself instead
      // of waiting for two more separate clicks (see cascadeFromApproved).
      const approveResult = approveImportSession(id, { approverId: 'evan', decidedAt: new Date().toISOString(), preferenceRationale: 'Ditinjau dan disetujui melalui Dataset Import Center.' });
      if (approveResult.ok) cascadeFromApproved(id);
      rerender(); return true;
    }
    if (act === 'dic-reject') {
      rejectImportSession(id, { approverId: 'evan', decidedAt: new Date().toISOString() });
      rerender(); return true;
    }
    if (act === 'dic-import') { markKnowledgeImported(id); rerender(); return true; }
    if (act === 'dic-archive') { doArchive(id); rerender(); return true; }

    if (act === 'dic-advanced-open') {
      const current = getImportSession(id);
      if (current.ok) {
        st.advancedEditId = id;
        st.advancedEdit = {
          domainType: current.data.domainType, datasetType: current.data.datasetType, knowledgeKind: current.data.knowledgeKind,
          facts: current.data.manualEntryFacts || { value: '', documentNumber: '', senderOrigin: '', notes: '' },
        };
      }
      rerender(); return true;
    }
    if (act === 'dic-advanced-close') { st.advancedEditId = null; st.advancedEdit = null; rerender(); return true; }
    if (act === 'dic-advanced-save') {
      if (st.advancedEdit) {
        updateSessionMetadata(id, { domainType: st.advancedEdit.domainType, datasetType: st.advancedEdit.datasetType, knowledgeKind: st.advancedEdit.knowledgeKind });
        if (st.advancedEdit.facts.value) attachManualEntryFacts(id, st.advancedEdit.facts);
      }
      st.advancedEditId = null; st.advancedEdit = null;
      rerender(); return true;
    }

    return false;
  }

  /**
   * @param {Event} e
   * @param {() => void} rerender
   * @returns {boolean}
   */
  function onInput(e, rerender) {
    const target = e.target;
    if (!target || !target.closest) return false;
    if (target.id === 'dicBatchSearch') { st.batchSearch = target.value; rerender(); return true; }
    // Phase 2.5 Part 1 — the metadata editor must feel like a native form.
    // A keystroke updates st.advancedEdit ONLY; it deliberately does NOT
    // call rerender(), because the host's rerender does
    // `contentEl.innerHTML = importController.render()` — a full workspace
    // rebuild that destroys the focused <input>, losing focus, caret, and
    // scroll position (the reported "jumps to top" bug). The native input
    // already shows the typed character, and state stays in sync for Save;
    // there is no live validation that would need a re-render mid-typing.
    const advField = target.closest('[data-act="dic-adv-field"]');
    if (advField && st.advancedEdit) { st.advancedEdit[advField.dataset.field] = advField.value; return true; }
    const advFact = target.closest('[data-act="dic-adv-fact"]');
    if (advFact && st.advancedEdit) { st.advancedEdit.facts[advFact.dataset.field] = advFact.value; return true; }
    return false;
  }

  /**
   * @param {Event} e
   * @param {() => void} rerender
   * @returns {boolean}
   */
  function onChange(e, rerender) {
    const target = e.target;
    if (!target || !target.closest) return false;

    const domainSelect = target.closest('[data-act="dic-batch-domain"]');
    if (domainSelect) { st.batchDomainType = domainSelect.value; rerender(); return true; }

    const fileInput = target.closest('[data-act="dic-file-input"], [data-act="dic-folder-input"]');
    if (fileInput && fileInput.files && fileInput.files.length > 0) {
      const files = Array.from(fileInput.files);
      const folderPathFor = (file) => (file.webkitRelativePath ? file.webkitRelativePath.split('/').slice(0, -1).join('/') : '');
      processBatch(files, folderPathFor, rerender);
      return true;
    }
    return false;
  }

  /**
   * Real drag-and-drop support (Part F). Accepts a DragEvent already
   * `preventDefault()`-ed by the caller's dragover handler.
   * @param {DragEvent} e
   * @param {() => void} rerender
   * @returns {boolean}
   */
  function onDrop(e, rerender) {
    const target = e.target;
    if (!target || !target.closest || !target.closest('[data-act="dic-dropzone"]')) return false;
    const files = e.dataTransfer && e.dataTransfer.files ? Array.from(e.dataTransfer.files) : [];
    if (files.length === 0) return false;
    processBatch(files, () => '', rerender);
    return true;
  }

  return { render, onClick, onInput, onChange, onDrop };
}
