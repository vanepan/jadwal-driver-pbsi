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
  IMPORT_SESSION_STATE, IMPORT_SESSION_STATE_DEFS, IMPORT_SESSION_KIND,
  PIPELINE_STAGE, PIPELINE_STAGE_ORDER, isOffRampStage, isTerminalImportSessionState,
} from '../knowledge/datasets/import-session/contracts/import-session-contract.js';
// Phase 2.6 HARDENING — EVERYTHING IMPORTED HERE IS A READ, OR AN EVIDENCE
// WRITE. Not one lifecycle mutator appears in this list, and that is the whole
// invariant, made checkable by inspection:
//
//   createImportSession   creation (the UI holds the File; nothing else can)
//   attach* / updateSessionMetadata
//                         EVIDENCE — facts, hashes, storage refs, human
//                         metadata confirmation. None of these touch `state`
//                         or `pipelineStage`.
//   get* / list* / hasContentFacts
//                         reads.
//
// submitImportSessionForReview, approveImportSession, markKnowledgeImported,
// markArchived, markUploading, markAwaitingEvidence, cancelImportSession,
// failImportSession and rejectImportSession are deliberately NOT imported.
// The UI collects evidence; the scheduler decides what it means.
import {
  createImportSession, attachManualEntryFacts, attachParsedContent, attachFileStorage,
  attachInferenceResult, updateSessionMetadata,
  getImportSession, listImportSessions, getImportSessionHistory, hasContentFacts,
} from '../knowledge/datasets/import-session/import-session-engine.js';
// The ONE driver of the pipeline. This UI no longer sequences submit ->
// approve -> import -> archive by hand (that duplicated logic was exactly what
// let a refresh orphan a session forever); it hands a session to the scheduler
// and renders whatever the scheduler honestly concluded.
import {
  registerArchiver, advanceSession, cancelImportBatch, discardImportSession,
  reportUploadStarted, MAX_PIPELINE_ATTEMPTS,
} from '../knowledge/datasets/import-session/pipeline-scheduler.js';
import {
  inferMetadata, inferPatternAssisted, AUTO_POPULATE_CONFIDENCE_THRESHOLD,
} from '../knowledge/datasets/import-session/metadata-inference-engine.js';
import {
  createBatch, recordBatchItem, pauseBatch, resumeBatch, completeBatch,
  getBatch, listBatches, getBatchHistory, BATCH_STATUS,
} from '../knowledge/datasets/import-session/import-batch-engine.js';
import { DATASET_TYPE } from '../knowledge/datasets/contracts/dataset-contract.js';
import { listDatasets } from '../knowledge/datasets/registry/dataset-registry.js';
import { manualFileSource } from '../knowledge/connectors/manual-file-connector.js';
import { listDomainTypes, getDomainType } from '../knowledge/registry/domain-type-registry.js';
import { listKinds } from '../knowledge/registry/kind-registry.js';
// Phase 4 — Archive is reached ONLY through its owner. `create as archiveCreate`
// used to be imported here, straight off the repository via the barrel; that was
// the second-owner defect the Phase 2.6 audit named, on the pipeline's primary
// archive path.
import { computeDocumentHash } from '../organizational-memory/index.js';
import {
  archiveImportedKnowledge, listArchive as archiveList,
} from '../organizational-memory/services/archive-service.js';
import { generateKnowledgeId } from '../knowledge/contracts/identity-contract.js';
// Phase 5, Part 3 — a human confirming previously-untrusted Advanced Metadata
// is a real, already-firing metadata correction. Recorded through the
// Learning Service, the ONE owner of organizational learning.
import { recordCorrection, CORRECTION_TYPE } from '../learning/services/learning-service.js';
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
  renderDetailSection, renderKvList, renderDetail, renderDiffTable, formatFileSize, isDeveloperMode,
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

/** Sprint 0 (Presentation Truth) — Normal Mode's plain-Indonesian label for
 *  the raw lifecycle state, used ONLY where the filter/stat-card axis is
 *  genuinely the 5-state lifecycle (not the 5-phase pipeline vocabulary —
 *  the two enumerate different things and collapsing state onto phase here
 *  would make distinct filter chips like "Pending Review" and "Approved"
 *  render with the identical label "Processing"). Same "translate the enum
 *  label, keep a 1:1 mapping" pattern BATCH_STATUS_LABEL below already
 *  uses. Developer Mode keeps the raw STATE_LABEL unchanged. */
const NORMAL_STATE_LABEL = Object.freeze({
  [IMPORT_SESSION_STATE.UPLOADED]: 'Diunggah',
  [IMPORT_SESSION_STATE.PENDING_REVIEW]: 'Menunggu Tinjauan',
  [IMPORT_SESSION_STATE.APPROVED]: 'Disetujui',
  [IMPORT_SESSION_STATE.KNOWLEDGE_IMPORTED]: 'Menjadi Pengetahuan',
  [IMPORT_SESSION_STATE.ARCHIVED]: 'Diarsipkan',
  [IMPORT_SESSION_STATE.CANCELLED]: 'Dibatalkan',
  [IMPORT_SESSION_STATE.FAILED]: 'Gagal',
});

const QUEUE_ROW_CAP = 50;

/** Phase 2.6 — the per-file batch-item status is now a straight projection of
 *  the SCHEDULER's own outcome. It used to be an independent little
 *  vocabulary the UI computed for itself ('needs_advanced', 'pending_review',
 *  'approved', 'unsupported'...), which drifted from what the session
 *  actually did — a file reported as 'pending_review' in the batch summary
 *  could be sitting at any of three real states. One conclusion, one name. */
const BATCH_ITEM_STATUS_FOR_OUTCOME = Object.freeze({
  completed: 'archived',
  cancelled: 'cancelled',
  failed: 'failed',
  awaiting_evidence: 'awaiting_evidence',
});

const BATCH_STATUS_LABEL = Object.freeze({
  archived: 'Selesai — Diimpor & Diarsipkan Otomatis',
  awaiting_evidence: 'Menunggu Bukti dari Anda',
  cancelled: 'Dibatalkan',
  failed: 'Gagal — tidak dapat diproses',
  blocked: 'Terhalang — tidak ada domain',
  error: 'Error',
  needs_attention: 'Perlu Perhatian',
});

/* Phase 2 Follow-up — the canonical 7 pipeline stages (PIPELINE_STAGE /
   PIPELINE_STAGE_ORDER) now live on the Import Session contract and are
   imported above; they are the SINGLE source of truth (persisted on the
   session), never redefined here. Below are the two DISPLAY vocabularies
   over that one truth (Requirement 3). */

/** Developer mode — the full ladder plus the three off-ramps, raw names. */
const DEV_STAGE_LABEL = Object.freeze({
  [PIPELINE_STAGE.PREPARING]: 'Preparing',
  [PIPELINE_STAGE.FINGERPRINTING]: 'Fingerprinting',
  [PIPELINE_STAGE.DEDUPLICATION]: 'Duplicate Detection',
  [PIPELINE_STAGE.CLASSIFICATION]: 'Classification',
  [PIPELINE_STAGE.UPLOADING]: 'Uploading',
  [PIPELINE_STAGE.POLICY_VALIDATION]: 'Policy Validation',
  [PIPELINE_STAGE.KNOWLEDGE_EXTRACTION]: 'Knowledge Extraction',
  [PIPELINE_STAGE.LEARNING]: 'Learning Registration',
  [PIPELINE_STAGE.ARCHIVE]: 'Archive',
  [PIPELINE_STAGE.COMPLETED]: 'Completed',
  [PIPELINE_STAGE.AWAITING_EVIDENCE]: 'Awaiting Evidence',
  [PIPELINE_STAGE.CANCELLED]: 'Cancelled',
  [PIPELINE_STAGE.FAILED]: 'Failed',
});

/** Normal mode — the friendly phases over the same one truth.
 *
 *  Phase 2.6 — "Uploading" now means UPLOADING. It used to be the label for
 *  CLASSIFICATION, which is why a file that had long since finished uploading
 *  (and in many cases had been fully classified, validated and given up on)
 *  still displayed a confident "Uploading" badge forever. The label described
 *  a step the session had already left, so the badge could never clear. */
const NORMAL_PHASES = Object.freeze([
  { id: 'preparing', label: 'Preparing', stages: [PIPELINE_STAGE.PREPARING, PIPELINE_STAGE.FINGERPRINTING, PIPELINE_STAGE.DEDUPLICATION, PIPELINE_STAGE.CLASSIFICATION] },
  { id: 'uploading', label: 'Uploading', stages: [PIPELINE_STAGE.UPLOADING] },
  { id: 'processing', label: 'Processing', stages: [PIPELINE_STAGE.POLICY_VALIDATION, PIPELINE_STAGE.KNOWLEDGE_EXTRACTION] },
  { id: 'finishing', label: 'Finishing', stages: [PIPELINE_STAGE.LEARNING, PIPELINE_STAGE.ARCHIVE] },
  { id: 'completed', label: 'Completed', stages: [PIPELINE_STAGE.COMPLETED] },
]);

/** The off-ramps get their own plain-language labels — they are NOT points on
 *  the ladder, and rendering them as a ladder position is what made a stopped
 *  document look like a moving one. */
const OFF_RAMP_LABEL = Object.freeze({
  [PIPELINE_STAGE.AWAITING_EVIDENCE]: 'Menunggu Bukti',
  [PIPELINE_STAGE.CANCELLED]: 'Dibatalkan',
  [PIPELINE_STAGE.FAILED]: 'Gagal',
});

/** The canonical stage -> normal-phase index (built once from the collapse
 *  map above), so a session's persisted stage resolves to its friendly
 *  phase without hardcoding the mapping twice. */
const STAGE_TO_NORMAL_PHASE_INDEX = (() => {
  const m = {};
  NORMAL_PHASES.forEach((phase, i) => { phase.stages.forEach((s) => { m[s] = i; }); });
  return Object.freeze(m);
})();

/** Phase 2.5 Part 4 — the authoritative lifecycle implies a MINIMUM pipeline
 *  stage a session must have reached. `state` is persisted and authoritative;
 *  `pipelineStage` is an annotation that can be missing on a legacy or
 *  rehydrated session. effectiveStage() below takes the FURTHER of the two,
 *  so a Knowledge-Imported/Archived row can never display an earlier stage
 *  even when pipelineStage is absent/stale. */
const STATE_MIN_STAGE = Object.freeze({
  [IMPORT_SESSION_STATE.UPLOADED]: PIPELINE_STAGE.CLASSIFICATION,
  [IMPORT_SESSION_STATE.PENDING_REVIEW]: PIPELINE_STAGE.POLICY_VALIDATION,
  [IMPORT_SESSION_STATE.APPROVED]: PIPELINE_STAGE.POLICY_VALIDATION,
  [IMPORT_SESSION_STATE.KNOWLEDGE_IMPORTED]: PIPELINE_STAGE.KNOWLEDGE_EXTRACTION,
  [IMPORT_SESSION_STATE.ARCHIVED]: PIPELINE_STAGE.COMPLETED,
});

/** Phase 2.6 — a terminal STATE always wins over whatever stage annotation a
 *  record happens to carry. This is the belt to the scheduler's braces: even
 *  a legacy row persisted before this milestone (stage `classification`,
 *  state `cancelled`) renders as Cancelled, never as a ghost still climbing
 *  the ladder. */
const STATE_TERMINAL_STAGE = Object.freeze({
  [IMPORT_SESSION_STATE.ARCHIVED]: PIPELINE_STAGE.COMPLETED,
  [IMPORT_SESSION_STATE.CANCELLED]: PIPELINE_STAGE.CANCELLED,
  [IMPORT_SESSION_STATE.FAILED]: PIPELINE_STAGE.FAILED,
});

/** The real, never-stale pipeline stage for display. Deterministic, no
 *  fabrication — it only ever reconciles the displayed stage with the
 *  authoritative persisted state, never invents progress the session hasn't
 *  made.
 *
 *  Three cases, in priority order:
 *   1. a terminal state fixes the stage outright (Completed/Cancelled/Failed);
 *   2. an off-ramp stage (Awaiting Evidence) is reported as-is — it is not a
 *      ladder position and must never be max()'d against one, or a session
 *      resting off the ladder would be dragged back onto it;
 *   3. otherwise, the later of the persisted stage and the state-implied
 *      minimum. */
export function effectiveStage(session) {
  if (!session) return PIPELINE_STAGE.CLASSIFICATION;
  const terminal = STATE_TERMINAL_STAGE[session.state];
  if (terminal) return terminal;
  if (isOffRampStage(session.pipelineStage)) return session.pipelineStage;
  const fromStage = PIPELINE_STAGE_ORDER.indexOf(session.pipelineStage);
  const fromState = PIPELINE_STAGE_ORDER.indexOf(STATE_MIN_STAGE[session.state] || PIPELINE_STAGE.CLASSIFICATION);
  const idx = Math.max(fromStage, fromState, 0);
  return PIPELINE_STAGE_ORDER[idx];
}

/** Sprint 0 (Presentation Truth) — the friendly phase label for a bare
 *  session `state` string (history/timeline entries only ever record
 *  `state`, never a per-version `pipelineStage`). Reuses the SAME
 *  state-implied floor effectiveStage() already relies on — never a
 *  second stage-inference, just applied without a pipelineStage input. */
function friendlyStateLabel(state) {
  // Phase 2.6 — the terminal states have no ladder position; they have a
  // plain-language name of their own.
  const terminal = STATE_TERMINAL_STAGE[state];
  if (terminal && isOffRampStage(terminal)) return OFF_RAMP_LABEL[terminal];
  const stage = terminal || STATE_MIN_STAGE[state] || PIPELINE_STAGE.CLASSIFICATION;
  const phaseIndex = STAGE_TO_NORMAL_PHASE_INDEX[stage] ?? 0;
  return NORMAL_PHASES[phaseIndex].label;
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
  const buckets = {
    preparing: 0, uploading: 0, policy_validation: 0, knowledge_extraction: 0,
    completed: 0, waitingReview: 0, failed: 0, cancelled: 0,
  };
  let started = 0;
  for (const sid of sessionIds) {
    const r = getImportSession(sid);
    if (!r.ok) continue;
    started += 1;
    const s = r.data;
    // Phase 2.6 — bucket by the session's REAL terminal state first. These are
    // persisted facts now, not inferences over validation arrays: a file the
    // pipeline gave up on is FAILED, a file the operator cancelled is
    // CANCELLED, and neither can be mistaken for in-flight work.
    if (s.state === IMPORT_SESSION_STATE.ARCHIVED) { buckets.completed += 1; continue; }
    if (s.state === IMPORT_SESSION_STATE.FAILED) { buckets.failed += 1; continue; }
    if (s.state === IMPORT_SESSION_STATE.CANCELLED) { buckets.cancelled += 1; continue; }
    if (reviewReasons(s).length) { buckets.waitingReview += 1; continue; }
    // In-flight, non-terminal, nothing blocking — bucket by real stage.
    const stage = effectiveStage(s);
    if (stage === PIPELINE_STAGE.KNOWLEDGE_EXTRACTION) buckets.knowledge_extraction += 1;
    else if (stage === PIPELINE_STAGE.POLICY_VALIDATION) buckets.policy_validation += 1;
    else if (stage === PIPELINE_STAGE.UPLOADING) buckets.uploading += 1;
    else buckets.preparing += 1; // prepare/fingerprint/dedup/classify span
  }
  // Files selected but not yet given a session (blocked with no domain, or
  // not started yet). The batch's persisted `error` tally counts real
  // failures that may have no session at all; use the larger of it and the
  // session-derived failed count so a blocked-no-session file is still shown.
  const failed = Math.max(buckets.failed, batch ? batch.error : 0);
  const notStarted = Math.max(0, total - started);
  return {
    total,
    preparing: buckets.preparing + notStarted, // classifying + not-yet-started
    uploading: buckets.uploading,              // genuinely uploading bytes, nothing else
    processing: buckets.policy_validation,
    knowledgeExtraction: buckets.knowledge_extraction,
    completed: buckets.completed,
    failed,
    cancelled: buckets.cancelled,
    waitingReview: buckets.waitingReview,
  };
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

  // Phase 2.6 — CANCELLED is a terminal state now, not an exception. It used
  // to produce a BATCH_CANCELLED "reason", which meant every cancelled file
  // piled into "Perlu Perhatian" demanding attention for a decision the
  // operator had ALREADY made. Cancelling a batch should empty the queue, not
  // fill it. A cancelled session is done; there is nothing to review.
  if (session.state === IMPORT_SESSION_STATE.CANCELLED) return reasons;

  // ARCHIVED is the happy terminal — nothing to say about it either.
  if (session.state === IMPORT_SESSION_STATE.ARCHIVED) return reasons;

  // FAILED is terminal but IS a genuine exception: a human should know this
  // document will never be processed, and why. The reason is always the real
  // recorded failure, never a fabricated explanation.
  if (session.state === IMPORT_SESSION_STATE.FAILED) {
    const unsupported = (session.validationErrors || []).some((e) => e.code === 'UNSUPPORTED_FORMAT')
      || session.kind === 'unsupported';
    reasons.push({
      code: unsupported ? 'UNSUPPORTED_FORMAT' : 'PIPELINE_FAILED',
      message: session.failureReason || 'Pipeline tidak dapat menyelesaikan dokumen ini.',
      confidence: session.confidence,
      evidence: null,
    });
    return reasons;
  }

  // ── Phase 2.6 — THE ONE GATE. A non-terminal session needs a human if, and
  // only if, the SCHEDULER PARKED IT — which it records in the persisted
  // pipelineStage as AWAITING_EVIDENCE. Anything else non-terminal is in
  // flight and belongs to the engine, not to a person.
  //
  // This inverts the old logic, which re-derived "is this stuck?" from state
  // + facts + confidence right here in the view. That second, independent
  // opinion is what produced the reported noise: a file still being uploaded
  // has no content facts YET, so the view declared it "needs attention"
  // while the engine was actively working on it — and a file the engine had
  // long since given up on looked identical to one it had never reached.
  // There is now exactly one authority on "is this waiting for me", and the
  // view reads it rather than guessing alongside it.
  if (session.pipelineStage !== PIPELINE_STAGE.AWAITING_EVIDENCE) return reasons;

  // Parked. Now explain WHY, from the same deterministic facts the scheduler
  // itself used — never a different opinion, just the same one, in words.

  // The most common honest pause: a PDF/DOCX cannot derive its own facts
  // (no OCR, no AI — by design), so if no human has typed one, there is
  // genuinely nothing to import.
  if (!hasContentFacts(session)) {
    reasons.push({ code: 'MISSING_CONTENT_FACTS', message: 'Belum ada fakta konten (manual atau JSON) — lampirkan fakta agar dapat diselesaikan.', confidence: session.confidence, evidence: null });
  }

  // Phase 2.6 — LOW_CONFIDENCE now clears once a human has confirmed the
  // metadata. `confidence` is the score the INFERENCE achieved and never
  // changes, so this reason used to persist forever — a session a human had
  // fully corrected by hand still reported "confidence too low" and could
  // never leave the attention queue. A human's confirmation is better
  // evidence than the machine's original guess.
  if (typeof session.confidence === 'number'
    && session.confidence < AUTO_POPULATE_CONFIDENCE_THRESHOLD
    && !session.metadataConfirmedBy) {
    reasons.push({ code: 'LOW_CONFIDENCE', message: `Confidence ${session.confidence} di bawah ambang batas populasi otomatis (${AUTO_POPULATE_CONFIDENCE_THRESHOLD}).`, confidence: session.confidence, evidence: session.confidenceRationale });
  }

  for (const w of session.validationWarnings || []) {
    if (w.code === 'DUPLICATE_FILENAME' || w.code === 'DUPLICATE_METADATA') {
      reasons.push({ code: 'DUPLICATE_AMBIGUITY', message: w.message, confidence: session.confidence, evidence: null });
    }
  }
  const archiveDup = archiveDuplicateWarning(session);
  if (archiveDup) reasons.push({ code: 'DUPLICATE_AMBIGUITY', message: archiveDup, confidence: session.confidence, evidence: null });

  // A real validation ERROR the pipeline could not get past (e.g.
  // DOMAIN_MISMATCH — the file's domain drifted from the one the upload was
  // started under). A human CAN fix these in Advanced Metadata, so they are
  // not terminal — but they must be visible, with the engine's own message.
  for (const e of session.validationErrors || []) {
    if (e.code === 'UNSUPPORTED_FORMAT') continue; // that path terminates as FAILED, handled above
    reasons.push({ code: 'VALIDATION_ERROR', message: e.message, confidence: session.confidence, evidence: null });
  }

  // A session the scheduler tried to advance automatically and could not —
  // it still has retries left (on exhaustion it becomes FAILED and is handled
  // above). Surfaced so a real engine problem is visible while it is still
  // being retried, rather than silently burning its attempts.
  if ((session.pipelineAttempts || 0) > 0 && session.failureReason) {
    reasons.push({
      code: 'PIPELINE_RETRYING',
      message: `${session.failureReason} (percobaan ${session.pipelineAttempts}/${MAX_PIPELINE_ATTEMPTS})`,
      confidence: session.confidence,
      evidence: null,
    });
  }

  // THE INVISIBILITY GUARD. A parked session is, by definition, waiting for a
  // human — so it MUST give that human something to read. If none of the
  // specific explanations above matched, the session would otherwise render
  // with an empty reason list: excluded from "Aktivitas Langsung" (it is off
  // the ladder) AND from "Perlu Perhatian" (no reasons), i.e. visible
  // nowhere, waiting forever, for nobody. That is the exact failure mode this
  // whole milestone exists to eliminate, so it gets an explicit floor rather
  // than a hope that the branches above are exhaustive.
  if (reasons.length === 0) {
    reasons.push({
      code: 'PENDING_HUMAN_EVIDENCE',
      message: 'Pipeline berhenti dan menunggu tinjauan Anda — periksa metadata dan fakta dokumen ini.',
      confidence: session.confidence,
      evidence: null,
    });
  }

  return reasons;
}

/** THE ARCHIVER — the ONE UI-layer function allowed to see both knowledge/
 *  (Import Session) and organizational-memory/ (ArchiveRecord).
 *
 *  Phase 2.6 HARDENING — its contract is deliberately narrow: it CONSTRUCTS
 *  AND WRITES the ArchiveRecord and returns its id. Nothing else. It used to
 *  also call markArchived() — meaning the pipeline's final lifecycle
 *  transition was still written by UI code, which quietly falsified the claim
 *  that the scheduler is the only driver. The scheduler now performs
 *  markArchived() itself from the id returned here, so this function cannot
 *  move a session at all, even if someone called it out of band.
 *
 *  @param {object} s — the Import Session record (passed in by the scheduler).
 *  @returns {string|null} the new ArchiveRecord's id, or null if the write failed.
 */
/*  PHASE 4 — this function no longer WRITES the archive. It describes a
 *  document, and hands that description to the Archive Service.
 *
 *  It used to call the archive repository's raw create() directly, which made
 *  the UI Archive's SECOND owner — on the pipeline's PRIMARY archive path, no
 *  less. Every uploaded document went through here, and every one of them
 *  bypassed:
 *
 *    · duplicate detection   — a document archived twice simply doubled
 *    · the lifecycle          — records were born with no state at all
 *    · the replacement chain  — nothing could supersede anything
 *    · provenance             — no reason, no actor, no import-session link
 *
 *  archiveImportedKnowledge() does all four, deterministically, in one call. The
 *  UI's job is to know what the document IS (it holds the Import Session); the
 *  Service's job is to know what archiving MEANS.
 */
function doArchive(s) {
  if (!s || !s.id) return null;
  const facts = s.manualEntryFacts || s.parsedContent || {};
  const result = archiveImportedKnowledge({
    id: generateKnowledgeId({ domainType: s.domainType, sourceType: 'manual-file', sourceRef: `archive:${s.id}` }),
    sourceDomainType: s.domainType,
    sourceId: s.id,
    sourceType: 'manual-file',
    documentNumber: facts.documentNumber || s.filename,
    documentDate: facts.documentDate || null,
    senderOrigin: facts.senderOrigin || null,
    documentHash: s.sha256 || s.documentHash || computeDocumentHash({ filename: s.filename, mimeType: s.mimeType, sizeBytes: s.sizeBytes }),
    sourceSnapshot: facts,
    hasOriginalFile: !!s.storagePath,
    fileRef: s.storagePath || null,
    // Part 4 — provenance. Every one of these is a REAL reference the session
    // already carries; none is inferred. An archived document can now answer
    // "which upload produced me, what did I become, and which dataset am I in?"
    importSessionId: s.id,
    knowledgeItemId: s.knowledgeItemId || null,
    datasetId: s.datasetId || null,
    archivedBy: s.uploadedBy || null,
  });
  return result.ok ? result.data.id : null;
}

/** Phase 2.6 — THE CROSS-LAYER SEAM, made explicit.
 *
 *  js/v2/README.md's dependency rule is absolute: `knowledge/ ──never
 *  depends on──> organizational-memory/`. The pipeline's final step
 *  (Knowledge Imported -> Archived) has to write an ArchiveRecord, which
 *  lives in organizational-memory/ — so the scheduler, which lives in
 *  knowledge/, cannot perform it. This file is the ONE place allowed to see
 *  both layers, so it supplies the step and the scheduler calls back into it.
 *
 *  Registered at module load, which is guaranteed to run before any
 *  scheduler sweep: sarpras-intelligence-center.js imports this module (for
 *  reviewReasons/effectiveStage) at ITS module load, and only calls
 *  sweepPipeline() later, from mount.
 *
 *  This replaces cascadeFromApproved(), which no longer exists: it was a
 *  SECOND, UI-resident copy of the pipeline's tail (approve -> import ->
 *  archive), and having two engines that both believed they owned the same
 *  transitions is the structural reason a session could end up half-advanced
 *  with nobody responsible for finishing it. There is now one driver
 *  (pipeline-scheduler.js) and one injected step (below). */
registerArchiver(doArchive);

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

/** Sprint 0 (Presentation Truth) — Advanced Metadata open/save/close all
 *  call `rerender()`, which does `contentEl.innerHTML = controller.render()`
 *  inside the host's real scrolling container (`.main-content` — same
 *  element app.js's own workspace-switch scrollY restore already targets).
 *  A full innerHTML replace drops the user's scroll position, losing their
 *  place in a long queue right after opening/saving/closing the panel.
 *  Keystrokes are already safe (see onInput's own comment on why it never
 *  calls rerender) — this covers the three remaining click actions. */
function rerenderPreservingScroll(rerender) {
  const scrollEl = typeof document !== 'undefined' ? document.querySelector('.main-content') : null;
  const top = scrollEl ? scrollEl.scrollTop : 0;
  rerender();
  if (scrollEl) requestAnimationFrame(() => { scrollEl.scrollTop = top; });
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
  /** Sprint 1 (Autonomy Closure, Part 5) — "Live Operation View": real,
   *  always-visible operational counts across EVERY session (not just an
   *  active batch, unlike the transient renderBatchProgress() stat cards
   *  below), bucketed by the same friendly NORMAL_PHASES vocabulary the
   *  stage badges already use. Every count is a fresh read of `sessions()`
   *  — no estimation, no separate counter store. There is no distinct
   *  persisted "Archiving" state (Learning/Archive both fold into a
   *  single synchronous doArchive() call, per markArchived's own header),
   *  so this reuses the SAME 5-phase collapse as the per-row stage badge
   *  rather than inventing a bucket no persisted state actually occupies.
   */
  function computeOperationalOverview(all) {
    const counts = NORMAL_PHASES.map(() => 0);
    all.forEach((s) => { counts[STAGE_TO_NORMAL_PHASE_INDEX[effectiveStage(s)] ?? 0] += 1; });
    return NORMAL_PHASES.map((phase, i) => ({ label: phase.label, count: counts[i] }));
  }

  function renderOperationalOverview(all) {
    const cards = computeOperationalOverview(all).map((b) => ({ count: b.count, label: b.label }));
    return `
      <div class="wlk-sec">
        <div class="wlk-sec-title">Ringkasan Operasional</div>
        ${renderStatCards(cards)}
      </div>`;
  }

  function renderWorkspace() {
    const p = st.batchProgress;
    const all = sessions();
    const needsAttention = all.filter((s) => reviewReasons(s).length > 0);
    // Live Activity — derived from the repository's PERSISTED session state,
    // never a transient callback. Phase 2.6: "in flight" is now exactly "not
    // terminal, and not parked off the ladder". A cancelled or failed session
    // is finished business and never appears here again; before this, neither
    // state existed, so both kinds of dead document kept marching in the live
    // list forever.
    const inFlight = all.filter((s) => !isTerminalImportSessionState(s.state) && !isOffRampStage(s.pipelineStage));
    const recent = all
      .filter((s) => isTerminalImportSessionState(s.state) || reviewReasons(s).length === 0)
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

        ${renderOperationalOverview(all)}

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
        <div class="dic-dropzone-hint">${isDeveloperMode()
          ? 'Metadata terisi otomatis dari nama file/folder, riwayat duplikat, dan Pattern Discovery — Advanced Metadata hanya muncul bila benar-benar diperlukan.'
          : 'Metadata terisi otomatis dari nama file/folder dan riwayat dokumen sebelumnya — formulir tambahan hanya muncul bila benar-benar diperlukan.'}</div>
        <div class="dic-dropzone-domain"><label>Domain Unggahan</label>${domainSelect}</div>
        <input data-act="dic-file-input" class="dic-file-input-hidden" type="file" multiple accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/json,.json"/>
        <input data-act="dic-folder-input" class="dic-file-input-hidden" type="file" multiple webkitdirectory directory/>
      </div>`;
  }

  /* ── Queue ─────────────────────────────────────────────────────── */

  function renderQueue() {
    const all = sessions();
    const devMode = isDeveloperMode();
    const stateLabelOf = (id) => (devMode ? STATE_LABEL[id] : NORMAL_STATE_LABEL[id]) || id;
    const stateFilters = [
      { id: '__all', label: 'Semua' },
      { id: '__needs_review', label: `Perlu Perhatian (${all.filter((s) => reviewReasons(s).length > 0).length})` },
      ...IMPORT_SESSION_STATE_DEFS.map((d) => ({ id: d.id, label: stateLabelOf(d.id) })),
    ];
    const filtered = st.queueStateFilter === '__all' ? all
      : st.queueStateFilter === '__needs_review' ? all.filter((s) => reviewReasons(s).length > 0)
        : all.filter((s) => s.state === st.queueStateFilter);
    const rows = filtered.slice(0, QUEUE_ROW_CAP);
    const hiddenCount = filtered.length - rows.length;

    const cards = IMPORT_SESSION_STATE_DEFS.map((d) => ({ count: all.filter((s) => s.state === d.id).length, label: stateLabelOf(d.id) }));

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

  /** Phase 2.6 — PART 4, "REMOVE REDUNDANT HUMAN APPROVAL", made real.
   *
   *  This used to hand back "Setujui", then "Impor sebagai Knowledge", then
   *  "Arsipkan" — three buttons that asked a human to press, in sequence, the
   *  three transitions the ENGINE already knows how to make and is capable of
   *  making unattended. That is not approval; it is manual labour dressed as
   *  governance. Worse, the two front buttons appeared TOGETHER on the same
   *  document (approve it, then separately import it) — two human decisions
   *  for one deterministic process, with nothing to decide between them.
   *
   *  What a human can genuinely do on a parked session, and nothing more:
   *    - supply the evidence the engine cannot invent  -> Advanced Metadata
   *    - decide this document should not be imported   -> Tolak (reject)
   *
   *  Everything else the engine does by itself, the moment the evidence
   *  exists. Organizational approval still exists, unchanged and unweakened —
   *  it just lives where it belongs: on the DRAFT KnowledgeItem, in Knowledge
   *  Center. Moving data between engines was never a thing to approve. */
  function humanActionsFor(session, reasons) {
    if (!reasons.length) return ''; // the engine has this — offer nothing
    if (session.state === IMPORT_SESSION_STATE.FAILED) {
      // Terminal and non-recoverable. There is no honest button here: an
      // unsupported format does not become supported by clicking. The row's
      // reason line says why, and that is the whole truth.
      return '';
    }
    const advanced = `<button class="wlk-btn" data-act="dic-advanced-open" data-id="${esc(session.id)}" type="button">Lengkapi Metadata &amp; Fakta</button>`;
    const reject = `<button class="wlk-btn wlk-btn--ghost" data-act="dic-reject" data-id="${esc(session.id)}" type="button">Tolak</button>`;
    return `${advanced}${reject}`;
  }

  function renderQueueRow(s) {
    const reasons = reviewReasons(s);
    const reasonLine = reasons.length
      ? `<div class="wlk-row-secondary">Alasan: ${reasons.map((r) => esc(r.message)).join(' · ')} — Saran: ${esc(suggestedActionFor(reasons[0].code))}</div>` : '';
    const actions = humanActionsFor(s, reasons);
    // Phase 2 Follow-up — the persisted pipeline stage in the active
    // vocabulary (Normal/Developer), read from the session itself.
    const stageBadge = `<span class="dic-stage-badge">${esc(stageLabelFor(s))}</span>`;
    // Sprint 0 (Presentation Truth) — Normal Mode shows the friendly stage
    // badge ONLY; the raw lifecycle label (STATE_LABEL) used to render
    // right next to it, the exact double-vocabulary the IX audit flagged.
    // Developer Mode keeps both, since the raw state is genuinely useful
    // there.
    const devMode = isDeveloperMode();
    const stateText = devMode ? ` — ${esc(STATE_LABEL[s.state] || s.state)}` : '';
    return `
      <li class="wlk-row" data-act="dic-session-row" data-id="${esc(s.id)}" data-clickable="1">
        <span class="wlk-row-primary">${esc(s.filename)}${stateText}${s.autoImported ? ' · otomatis' : ''} ${stageBadge}</span>
        <span class="wlk-row-secondary">${esc(domainLabel(s.domainType))} · ${esc(s.kind)} · ${formatFileSize(s.sizeBytes)}${typeof s.confidence === 'number' && devMode ? ` · confidence ${s.confidence}` : ''}${s.validationWarnings && s.validationWarnings.length ? ` · ${s.validationWarnings.length} peringatan` : ''}</span>
        ${reasonLine}
        ${actions}
      </li>`;
  }

  /** Phase 2.6 — every suggestion now names something a human can ACTUALLY
   *  do. The old list told the user to press buttons that were the engine's
   *  job ('Klik "Impor sebagai Knowledge" untuk mencoba lagi', 'Coba arsipkan
   *  ulang secara manual', 'Setujui atau Tolak sesi ini') — advice that was,
   *  in the one case it mattered most, an instruction to keep clicking a
   *  button that could never succeed. */
  function suggestedActionFor(reasonCode) {
    return {
      LOW_CONFIDENCE: 'Buka "Lengkapi Metadata & Fakta" untuk mengoreksi metadata — pipeline akan melanjutkan sendiri setelah disimpan.',
      DUPLICATE_AMBIGUITY: 'Bandingkan dengan dokumen yang sudah ada sebelum melanjutkan.',
      UNSUPPORTED_FORMAT: 'Format tidak didukung — dokumen ini tidak dapat diproses. Unggah ulang sebagai PDF, DOCX, atau JSON.',
      MISSING_CONTENT_FACTS: 'Buka "Lengkapi Metadata & Fakta" dan lampirkan fakta dari dokumen — pipeline akan menyelesaikan sisanya secara otomatis.',
      PIPELINE_FAILED: 'Pipeline tidak dapat menyelesaikan dokumen ini — unggah ulang bila perlu.',
      PIPELINE_RETRYING: 'Pipeline masih mencoba secara otomatis — tidak ada tindakan yang diperlukan saat ini.',
      VALIDATION_ERROR: 'Buka "Lengkapi Metadata & Fakta" untuk memperbaiki metadata yang ditolak validasi.',
      PENDING_HUMAN_EVIDENCE: 'Buka "Lengkapi Metadata & Fakta" untuk meninjau dokumen ini.',
    }[reasonCode] || 'Tinjau secara manual.';
  }

  function renderSessionDetail(id) {
    const result = getImportSession(id);
    if (!result.ok) return '';
    const s = result.data;
    const devMode = isDeveloperMode();
    // Sprint 0 (Presentation Truth) — Normal Mode never shows Dataset Type,
    // Knowledge Kind, the raw lifecycle label, or internal IDs (the exact
    // terms the mission names); Developer Mode still sees all of it. Status
    // itself uses the same friendly phase vocabulary as the stage badge —
    // no more STATE_LABEL sitting next to the friendly badge.
    const metadataPairs = [
      ['Nama File', s.filename], ['Tipe', s.mimeType], ['Ukuran', formatFileSize(s.sizeBytes)],
      ['Domain', domainLabel(s.domainType)],
      ['Status', devMode ? (STATE_LABEL[s.state] || s.state) : stageLabelFor(s)],
      ['Import Batch', s.batchId],
      ['Diunggah oleh', s.uploadedBy], ['Disetujui oleh', s.approvedBy],
      ['Diimpor Otomatis', s.autoImported ? 'Ya' : 'Tidak'],
    ];
    if (devMode) {
      metadataPairs.splice(4, 0, ['Tipe Dataset', s.datasetType], ['Knowledge Kind', s.knowledgeKind]);
      metadataPairs.push(['Knowledge Item Id', s.knowledgeItemId], ['Archive Record Id', s.archiveRecordId]);
    }
    const metadata = renderKvList(metadataPairs);
    // V2.1.2 Part M — Metadata & Audit Improvements: Confidence Score +
    // Inference Source (Pattern Used) — internal/technical, Developer only.
    const confidenceKv = devMode && typeof s.confidence === 'number' ? renderKvList([
      ['Confidence Score', `${s.confidence}${s.confidenceRationale && s.confidenceRationale.level ? ` (${s.confidenceRationale.level})` : ''}`],
      ['Sumber Inferensi — Domain', s.confidenceRationale ? s.confidenceRationale.domainType : '—'],
      ['Sumber Inferensi — Tipe Dataset', s.confidenceRationale ? s.confidenceRationale.datasetType : '—'],
      ['Sumber Inferensi — Knowledge Kind', s.confidenceRationale ? s.confidenceRationale.knowledgeKind : '—'],
    ]) : null;
    // Phase 2 Follow-up — the real, explainable confidence signal
    // breakdown persisted by the deterministic confidence engine. Developer
    // only (raw scores/weights) — a normal user gets the same explanation
    // via the row's plain-language "Alasan"/"Saran" text instead.
    const signals = s.confidenceRationale && Array.isArray(s.confidenceRationale.signals) ? s.confidenceRationale.signals : null;
    const confidenceSignalsKv = devMode && signals && signals.length ? renderKvList(signals.map((sig) => [
      sig.label,
      sig.available ? `${sig.subScore} (bobot ${sig.weight}) — ${sig.rationale}` : `tidak tersedia — ${sig.rationale}`,
    ])) : null;
    // Part H — Storage Hardening display (SHA-256/path/dedup) — internal,
    // Developer only.
    const storageKv = !devMode ? null : (s.storagePath ? renderKvList([
      ['SHA-256', s.sha256],
      ['Storage Path', s.storagePath],
      ['Original Size', formatFileSize(s.sizeBytes)],
      ['Stored Size', formatFileSize(s.sizeBytes)],
      ['Deduplication Status', s.fileStorageId && listStoredFiles().find((f) => f.id === s.fileStorageId && f.linkedSessionIds.length > 1) ? 'Duplikat — bytes tidak diunggah ulang' : 'Unggahan baru'],
    ]) : (s.sha256 ? renderKvList([['SHA-256', s.sha256], ['Storage Path', 'Belum diunggah ke Storage (lihat error unggahan bila ada)']]) : null));
    const previewHtml = renderDocumentPreview(s);
    const archiveDup = archiveDuplicateWarning(s);
    const warningPairs = [
      ...(s.validationWarnings || []).map((w) => [w.code, w.message]),
      ...(archiveDup ? [['DUPLICATE_ARCHIVE_MATCH', archiveDup]] : []),
    ];
    // Raw validation codes are Developer-only — the row's own "Alasan"/
    // "Saran" text already surfaces the equivalent message to everyone.
    const warnings = devMode && warningPairs.length ? renderKvList(warningPairs) : null;
    const errors = devMode && s.validationErrors && s.validationErrors.length
      ? renderKvList(s.validationErrors.map((e) => [e.code, e.message])) : null;
    const facts = s.manualEntryFacts ? renderKvList(Object.entries(s.manualEntryFacts))
      : (s.parsedContent ? renderKvList(Object.entries(s.parsedContent)) : null);

    // V2.1 — Import Session Viewer: Knowledge status, Archive status,
    // Timeline, Pattern recommendations. Status Knowledge/Archive carry
    // raw internal IDs — Developer only (Status already conveys this).
    const knowledgeStatusKv = devMode && s.knowledgeItemId ? renderKvList([['Knowledge Item', s.knowledgeItemId], ['Status', 'draft (menunggu review Knowledge terpisah)']]) : null;
    const archiveStatusKv = devMode && s.archiveRecordId ? renderKvList([['Archive Record', s.archiveRecordId]]) : null;
    const historyResult = getImportSessionHistory(id);
    const timeline = historyResult.ok
      ? renderKvList(historyResult.data.map((v) => [`Versi ${v.version}`, `${devMode ? (STATE_LABEL[v.state] || v.state) : friendlyStateLabel(v.state)} — ${v.updatedAt}`])) : null;
    const patternSuggestions = inferPatternAssisted(s.domainType, s.filename);
    const patternKv = patternSuggestions.length
      ? renderKvList(patternSuggestions.map((p) => [`${p.patternType}: ${p.value}`,
        devMode ? `support ${p.supportCount} · confidence ${p.confidence}` : `didukung ${p.supportCount} dokumen serupa`])) : null;

    // Phase 2, Part 6 — "Autonomous Learning" made honest, not fabricated:
    // once this session has a real KnowledgeItem, it is IMMEDIATELY
    // reachable from the Knowledge Graph (a real BFS read, not a
    // recomputation) and already factored into Pattern Discovery's own
    // continuous, deterministic recompute above — no separate "run
    // learning now" step exists or is needed, because both are pure reads
    // over the repository this session just became part of. Engine names
    // ("Knowledge Graph"/"Pattern Discovery") — Developer only.
    const learningKv = devMode && s.knowledgeItemId ? (() => {
      const neighbors = getNeighbors(s.knowledgeItemId);
      const relatedCount = neighbors.ok ? neighbors.data.length : 0;
      return renderKvList([
        ['Knowledge Graph', relatedCount > 0 ? `${relatedCount} item terkait ditemukan` : 'Belum ada item terkait (belum ada relationship yang ditautkan)'],
        ['Pattern Discovery', 'Dokumen ini kini ikut dihitung dalam rekomendasi Pattern Discovery berikutnya.'],
      ]);
    })() : null;

    const advancedPanel = st.advancedEditId === id ? renderAdvancedMetadataPanel(s) : '';

    // Sprint 1 (Autonomy Closure, Part 8) — Pipeline Self-Diagnostics,
    // Developer Mode only ("this information... Normal users should never
    // see"). Every field is honestly derived from data that already
    // exists on this session/its history — no fabricated field, no new
    // contract/schema. Reuses the SAME `historyResult` already computed
    // above for the Timeline section rather than re-fetching.
    const diagnosticsKv = devMode ? (() => {
      const reasons = reviewReasons(s);
      const stage = effectiveStage(s);
      const stageIdx = PIPELINE_STAGE_ORDER.indexOf(stage);
      const nextStage = stageIdx >= 0 && stageIdx < PIPELINE_STAGE_ORDER.length - 1 ? PIPELINE_STAGE_ORDER[stageIdx + 1] : null;
      const elapsedMs = s.updatedAt ? Date.now() - new Date(s.updatedAt).getTime() : 0;
      const elapsedText = elapsedMs > 3600000 ? `${Math.floor(elapsedMs / 3600000)} jam`
        : elapsedMs > 60000 ? `${Math.floor(elapsedMs / 60000)} menit`
          : `${Math.max(0, Math.floor(elapsedMs / 1000))} detik`;
      // Phase 2.6 — "Next Stage" must not claim a parked or cancelled session
      // is "sudah selesai". An off-ramp is not the end of the ladder; it is a
      // departure from it, and the honest next step is a human's, not the
      // engine's. "Retry Count" is now a REAL persisted counter
      // (pipelineAttempts, bounded by MAX_PIPELINE_ATTEMPTS) rather than the
      // version-count proxy it used to guess from.
      const nextStageText = isTerminalImportSessionState(s.state) ? 'Tidak ada — sudah terminal'
        : effectiveStage(s) === PIPELINE_STAGE.AWAITING_EVIDENCE ? 'Menunggu bukti dari manusia — pipeline berhenti di sini'
          : nextStage ? (DEV_STAGE_LABEL[nextStage] || nextStage) : 'Tidak ada';
      return renderKvList([
        ['Current / Last Successful Stage', DEV_STAGE_LABEL[stage] || stage],
        ['Current Wait Reason', reasons.length ? reasons[0].message : 'Tidak ada — berjalan normal'],
        ['Blocked By', reasons.length ? reasons[0].code : '—'],
        ['Automatic Retry Count', `${s.pipelineAttempts || 0} / ${MAX_PIPELINE_ATTEMPTS}`],
        ['Failure Reason', s.failureReason || '—'],
        ['Elapsed Time', elapsedText],
        ['Next Stage', nextStageText],
      ]);
    })() : null;

    return `
      <div class="wlk-sec">
        <div class="wlk-sec-title">Detail — ${esc(s.filename)}</div>
        ${renderDetail([
          renderDetailSection('Metadata', metadata),
          renderDetailSection(devMode ? 'Pipeline (Developer)' : 'Status', renderPipelineStages(s)),
          renderDetailSection('Diagnostik Pipeline (Developer Mode)', diagnosticsKv),
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
          renderDetailSection(devMode ? 'Rekomendasi Pattern Discovery' : 'Saran Berdasarkan Pola', patternKv),
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

    // Phase 2.6 — a session that left the ladder is NOT rendered as a position
    // on it. Drawing "Awaiting Evidence"/"Cancelled"/"Failed" as a half-filled
    // progress checklist is precisely the lie that made stopped documents look
    // like moving ones. Say what actually happened instead.
    if (isOffRampStage(stage)) {
      const reachedIdx = PIPELINE_STAGE_ORDER.indexOf(
        isOffRampStage(session.pipelineStage) ? (STATE_MIN_STAGE[session.state] || PIPELINE_STAGE.CLASSIFICATION) : session.pipelineStage,
      );
      const reached = PIPELINE_STAGE_ORDER[Math.max(reachedIdx, 0)];
      const detail = session.failureReason
        ? `<div class="wlk-row-secondary">${esc(session.failureReason)}</div>` : '';
      return `
        <div class="dic-stage-halt">
          <div class="wlk-row-primary">${esc(isDeveloperMode() ? (DEV_STAGE_LABEL[stage] || stage) : (OFF_RAMP_LABEL[stage] || stage))}</div>
          <div class="wlk-row-secondary">Berhenti setelah: ${esc(isDeveloperMode() ? (DEV_STAGE_LABEL[reached] || reached) : (NORMAL_PHASES[STAGE_TO_NORMAL_PHASE_INDEX[reached] ?? 0].label))}</div>
          ${detail}
        </div>`;
    }

    if (isDeveloperMode()) {
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
    if (isDeveloperMode()) return DEV_STAGE_LABEL[stage] || stage;
    if (isOffRampStage(stage)) return OFF_RAMP_LABEL[stage] || stage;
    const phaseIndex = STAGE_TO_NORMAL_PHASE_INDEX[stage] ?? 0;
    return NORMAL_PHASES[phaseIndex].label;
  }

  function renderBatchProgress(p) {
    const counters = computeBatchCounters(p);
    const failed = p.items.filter((i) => ['error', 'blocked', 'needs_attention'].includes(i.status));
    const isDone = p.processed === p.total && p.total > 0;
    // Phase 2.6 — read the PERSISTED batch status, not only this tab's local
    // flag, so a cancel issued from the recovery banner or another tab is
    // reflected here too (before, this panel would keep offering "Jeda" and
    // "Batalkan" for a batch that had already been cancelled elsewhere).
    const isCancelled = batchCancelled(p.batchId);
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
        ${renderStatCards(isDeveloperMode() ? [
          { count: `${counters.preparing} / ${counters.total}`, label: 'Preparing' },
          { count: counters.uploading, label: 'Uploading' },
          { count: counters.processing, label: 'Processing (Policy Validation)' },
          { count: counters.knowledgeExtraction, label: 'Knowledge Extraction' },
          { count: counters.completed, label: 'Completed' },
          { count: counters.waitingReview, label: 'Awaiting Evidence' },
          { count: counters.failed, label: 'Failed' },
          { count: counters.cancelled, label: 'Cancelled' },
        ] : [
          // Sprint 0 (Presentation Truth) — no raw pipeline-stage names
          // ("Policy Validation", "Knowledge Extraction") in Normal Mode;
          // same real counters, plain-language labels only.
          { count: `${counters.preparing} / ${counters.total}`, label: 'Disiapkan' },
          { count: counters.uploading, label: 'Diunggah' },
          { count: counters.processing, label: 'Diproses' },
          { count: counters.knowledgeExtraction, label: 'Menjadi Pengetahuan' },
          { count: counters.completed, label: 'Selesai' },
          { count: counters.waitingReview, label: 'Menunggu Bukti' },
          { count: counters.failed, label: 'Gagal' },
          { count: counters.cancelled, label: 'Dibatalkan' },
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

  /** Phase 2.6 — a rejected session is one a human TERMINALLY declined, which
   *  is now a persisted state (Cancelled), not a pattern to be archaeologically
   *  reconstructed from version history.
   *
   *  This used to scan every session's full history for a pending_review ->
   *  uploaded edge. Nothing produces that edge any more (see the dic-reject
   *  handler), so the counter would have read a permanent, confident ZERO —
   *  a stat that is not merely useless but actively misleading, since
   *  rejections would still be happening. It is also O(N * versions); this is
   *  O(N) over data already in hand. */
  function countRejectedSessions(all) {
    return all.filter((s) => s.state === IMPORT_SESSION_STATE.CANCELLED).length;
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
          { count: rejectedTotal, label: 'Ditolak / Dibatalkan' },
        ])}</div>

        <div class="wlk-sec">
          <div class="wlk-sec-title">Sesi dengan Laporan Impor (${candidates.length})</div>
          ${candidates.length ? renderRowList(candidates.slice(0, QUEUE_ROW_CAP), (s) => `
            <li class="wlk-row" data-act="dic-report-row" data-id="${esc(s.id)}" data-clickable="1">
              <span class="wlk-row-primary">${esc(s.filename)}</span>
              <span class="wlk-row-secondary">${esc(isDeveloperMode() ? (STATE_LABEL[s.state] || s.state) : stageLabelFor(s))}</span>
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

  /* ── Archive composition + dedup-reuse helpers live at module scope
     (doArchive / findReusableContentFacts, above
     createDatasetImportController) — reused here via closure, same as any
     other module-level import in this file. ──────────────────────────── */

  /* ── Zero-config batch processing (V2.1 -> V2.6) ──────────────────── */

  /**
   * Processes ONE real file — the FILE-BOUND half of the pipeline, and the
   * only half that must happen here.
   *
   *   hash -> parse (JSON) -> infer metadata -> create Import Session ->
   *   upload to Storage (dedup-checked) -> hand off to the scheduler
   *
   * Everything up to the hand-off needs the actual File object: bytes to
   * hash, bytes to upload, text to parse. A File handle cannot survive a
   * refresh, so this genuinely can only run in the tab that received the
   * drop. Everything AFTER it is lifecycle, and lifecycle belongs to
   * pipeline-scheduler.js — which works from the persisted session and can
   * therefore be re-run by any tab, at any time, after any interruption.
   *
   * That split is the entire Phase 2.6 correction. This function used to own
   * the whole lifecycle, which meant the lifecycle only ever ran while this
   * function was on the stack.
   *
   * Never fabricates a result: every branch reflects a real engine call's
   * actual outcome, and PDF/DOCX can never auto-reach Knowledge Imported
   * unless real content facts exist somewhere (markKnowledgeImported's own
   * content-fact gate, unchanged, still requires a human-typed fact those
   * formats can never auto-derive from nothing).
   *
   * @param {File} file
   * @param {string} folderPath
   * @param {string|null} batchId
   */
  async function processOneFile(file, folderPath, batchId = null) {
    const kind = fileKind(file.type);
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
      // Phase 2.6 — the ONE honest "Uploading" marker, written immediately
      // before the real network upload starts and nowhere else. Everything
      // before this line was synchronous and instant; everything after it has
      // genuinely finished uploading. A badge reading "Uploading" now means a
      // file is uploading. Reported THROUGH the scheduler (not written here)
      // so that no UI module writes pipelineStage directly.
      reportUploadStarted(sessionId);
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
        } else {
          // Sprint 1 (Autonomy Closure, Part 4) — uploadFile() RETURNING
          // {ok:false} (the real shape a permission-denied/exhausted-retry
          // Storage failure takes) previously had no `else` here at all —
          // completely silent, no log, no session field, and the pipeline
          // proceeded as if the file had been stored. This doesn't change
          // session state (never fabricate a stored file that isn't
          // there) — it only makes a real failure visible for triage.
          console.error('[dataset-import-center] Storage upload returned failure for', file.name, uploadResult.error);
        }
      } catch (err) {
        console.error('[dataset-import-center] uploadFile failed for', file.name, err);
      }
    }

    // Phase 2.6 — HAND OFF TO THE ONE DRIVER. Everything above this line is
    // the part only the UI can do: it has the actual File object (bytes to
    // hash, bytes to upload, text to parse) and a File handle cannot survive
    // a refresh. Everything below it is lifecycle, and lifecycle now belongs
    // to exactly one place.
    //
    // This replaces a hand-rolled submit -> approve -> cascade chain that was
    // a SECOND implementation of the state machine, living in the view. It
    // was also the only implementation that ever ran: nothing else in the
    // system advanced a session, so when this function returned — or the tab
    // closed, or the user refreshed — whatever it had not finished stayed
    // unfinished forever. The scheduler reads the same persisted session and
    // reaches the same conclusions, but it can be re-run by anyone, at any
    // time, from any tab. That is the whole difference between a pipeline and
    // a one-shot script.
    const outcome = advanceSession(sessionId);

    const finalResult = getImportSession(sessionId);
    if (finalResult.ok) base.warningCount = (finalResult.data.validationWarnings || []).length;
    if (factsReusedFromDuplicate) base.factsReusedFromDuplicate = true;

    if (!outcome.ok) return { ...base, status: 'error', error: outcome.error };
    return { ...base, status: BATCH_ITEM_STATUS_FOR_OUTCOME[outcome.outcome] || 'needs_attention', error: null };
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
  /** Phase 2.6 — PART 1, "THE ACTIVE WORKER STOPS SAFELY".
   *
   *  The loop's cancellation check used to read `st.batchProgress.control
   *  .cancelled` — a flag on a plain object in THIS controller's closure. So
   *  the worker could only ever be stopped by the one button rendered inside
   *  the one panel in the one tab that happened to be running it. A cancel
   *  issued from the Upload Recovery banner, or from a second tab, updated
   *  the persisted batch record and the worker sailed straight past it,
   *  cheerfully creating more sessions for a batch that no longer existed.
   *
   *  The persisted ImportBatchRecord is the source of truth, so the worker
   *  asks IT, every iteration. Cancellation from anywhere now stops the
   *  worker everywhere — which is what "cancel" is supposed to mean. */
  function batchCancelled(batchId) {
    if (st.batchProgress && st.batchProgress.control.cancelled) return true;
    if (!batchId) return false;
    const result = getBatch(batchId);
    return result.ok && result.data.status === BATCH_STATUS.CANCELLED;
  }

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
      if (batchCancelled(batchId)) break;
      // eslint-disable-next-line no-await-in-loop
      while (st.batchProgress.control.paused && !batchCancelled(batchId)) {
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => { setTimeout(resolve, 200); });
      }
      // Re-checked AFTER the pause loop and AFTER the await below: a cancel
      // can land during either, and a worker that only checks before it
      // starts waiting is a worker that ignores anything said while it waits.
      if (batchCancelled(batchId)) break;

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
          // Phase 2.6 — "imported" means a real Import Session exists and is
          // progressing or done; only a file that never got one (blocked) or
          // that the pipeline terminally failed is an error.
          imported: ['archived', 'awaiting_evidence'].includes(item.status),
          duplicate: item.wasDuplicate,
          warningCount: item.warningCount || 0,
          error: ['blocked', 'error', 'failed'].includes(item.status),
          knowledgeProduced: item.status === 'archived',
          storageBytes: item.storageBytes || 0,
        });
      }
      rerender();
    }

    // Phase 2.6 — settle the batch through the SCHEDULER, so cancelling also
    // cancels the sessions this loop already created (see cancelImportBatch).
    // completeBatch() now refuses to overwrite a CANCELLED batch, so a cancel
    // that landed while the last file was still in flight is no longer
    // silently resurrected as "Selesai" here.
    if (batchId) {
      if (batchCancelled(batchId)) cancelImportBatch(batchId);
      else completeBatch(batchId);
    }
    rerender();
  }

  /** V2.1.2 Part G — re-attempts submission for a session that already
   *  exists but failed validation (unsupported/needs_attention) — never
   *  creates a duplicate session. A 'blocked' item (Domain Unggahan was
   *  empty, no session was ever created) has nothing to retry until the
   *  administrator sets a domain and re-selects the file. */
  /** V2.1.2 Part G — re-attempts a session that already exists but did not
   *  finish. Phase 2.6: a retry is just "run the scheduler again" — the same
   *  deterministic driver, from wherever the session actually is. It no longer
   *  hard-codes `submitImportSessionForReview` as THE retry step, which was
   *  only ever correct for a session sitting at Uploaded and did nothing at
   *  all for one stuck further down.
   *
   *  A 'blocked' item (Domain Unggahan was empty, so no session was ever
   *  created) has nothing to retry until the administrator sets a domain and
   *  re-selects the file. */
  function retryFailedItem(item, rerender) {
    if (!item.sessionId) return;
    const outcome = advanceSession(item.sessionId);
    item.status = outcome.ok
      ? (BATCH_ITEM_STATUS_FOR_OUTCOME[outcome.outcome] || item.status)
      : item.status;
    item.error = outcome.ok ? null : outcome.error;
    const fresh = getImportSession(item.sessionId);
    if (fresh.ok) item.warningCount = (fresh.data.validationWarnings || []).length;
    rerender();
  }

  function retryAllFailed(rerender) {
    if (!st.batchProgress) return;
    for (const item of st.batchProgress.items) {
      if (['error', 'failed', 'needs_attention', 'awaiting_evidence'].includes(item.status)) retryFailedItem(item, rerender);
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
    // Phase 2.6 — cancel now PERSISTS immediately (not at the end of the
    // worker loop, where it used to sit until the loop happened to fall out).
    // The local flag stops the loop this tick; cancelImportBatch() writes the
    // batch AND cancels its unfinished sessions, so the state is real, is
    // durable, survives a refresh, and is visible to every other tab — the
    // moment the operator asks for it, not whenever the loop gets around to it.
    if (act === 'dic-batch-cancel') {
      if (st.batchProgress) {
        st.batchProgress.control.cancelled = true;
        if (st.batchProgress.batchId) cancelImportBatch(st.batchProgress.batchId);
      }
      rerender(); return true;
    }
    if (act === 'dic-batch-retry-all') { retryAllFailed(rerender); return true; }
    if (act === 'dic-batch-retry-one') {
      const item = st.batchProgress && st.batchProgress.items.find((i) => i.sessionId === id);
      if (item) retryFailedItem(item, rerender);
      return true;
    }

    // V2.1.2 Part E — Upload Recovery.
    if (act === 'dic-resume-banner-dismiss') { st.resumeBannerDismissed = true; rerender(); return true; }
    // Phase 2.6 — THE REPORTED BUG. This called bare cancelBatch(), which
    // (a) silently failed its structural validation on any rehydrated batch —
    // the only kind this banner can ever show — and (b) even on success only
    // ever touched the ImportBatchRecord, leaving every session it had created
    // still sitting in the queue looking like live work. Both halves are fixed:
    // the record round-trips correctly now (normalizeImportBatchRecord), and
    // cancelling a batch cancels its unfinished sessions.
    if (act === 'dic-resume-batch-cancel') { cancelImportBatch(id); rerender(); return true; }

    // V2.1.2 Part I — Batch History.
    if (act === 'dic-batch-status-filter') { st.batchStatusFilter = id; rerender(); return true; }
    if (act === 'dic-batch-sort') { st.batchSort = id; rerender(); return true; }
    if (act === 'dic-batch-row') { st.selectedBatchId = st.selectedBatchId === id ? null : id; rerender(); return true; }

    // V2.1.2 Part L — Document Preview.
    if (act === 'dic-preview-load') { loadDocumentPreview(id, el.dataset.path, rerender); return true; }

    // Phase 2.6 — PART 4. `dic-submit`, `dic-approve`, `dic-import` and
    // `dic-archive` are GONE. Each of them asked a human to press a button
    // whose entire job was to invoke an engine call that the engine was
    // already capable of making, and already responsible for making. They
    // were not decisions; they were the pipeline, wearing a person as a
    // clock. `dic-approve` and `dic-import` in particular could BOTH appear
    // for the same document — the two-approvals-for-one-process defect this
    // milestone was called to fix.
    //
    // What survives is the one genuine human decision at this layer: "this
    // document should not be imported at all."
    //
    // Phase 2.6 HARDENING — this used to call rejectImportSession() directly,
    // and it was broken in BOTH cases it could actually be reached:
    //
    //   - parked at Pending Review: reject moved the session back to Uploaded,
    //     and the next sweep drove it straight back to Pending Review. The
    //     scheduler silently overruled the human; the row never left the queue.
    //   - parked at Uploaded (low confidence): Uploaded -> Uploaded is not a
    //     legal edge, so the call failed with INVALID_IMPORT_DECISION and the
    //     button did nothing whatsoever.
    //
    // A "no" that the engine overturns on the next tick is not a no. Rejection
    // is now what it always meant — TERMINAL — and it is the scheduler that
    // records it, so no sweep can ever undo it.
    if (act === 'dic-reject') {
      discardImportSession(id, { actor: 'evan' });
      rerender(); return true;
    }

    if (act === 'dic-advanced-open') {
      const current = getImportSession(id);
      if (current.ok) {
        st.advancedEditId = id;
        st.advancedEdit = {
          domainType: current.data.domainType, datasetType: current.data.datasetType, knowledgeKind: current.data.knowledgeKind,
          facts: current.data.manualEntryFacts || { value: '', documentNumber: '', senderOrigin: '', notes: '' },
        };
      }
      rerenderPreservingScroll(rerender); return true;
    }
    if (act === 'dic-advanced-close') { st.advancedEditId = null; st.advancedEdit = null; rerenderPreservingScroll(rerender); return true; }
    if (act === 'dic-advanced-save') {
      if (st.advancedEdit) {
        // Phase 5, Part 3/9 — Correction Log, ACTIVATED. The original
        // dormant-subsystems.js finding was that submitCorrection() (the
        // engine built for KNOWLEDGE payload edits) has zero real callers —
        // and it still does; there is genuinely no payload-editing UI, and
        // inventing one just to make a counter move would be the wrong
        // reason to build a feature. But Advanced Metadata's save IS a real,
        // already-firing human correction — a person looking at metadata the
        // pipeline could not trust and vouching for it — which is exactly
        // Part 3's "Metadata correction" example. Capture the BEFORE state
        // here, before the write, so the recorded correction is a real diff.
        const before = getImportSession(id);
        const beforeSnapshot = before.ok
          ? { domainType: before.data.domainType, datasetType: before.data.datasetType, knowledgeKind: before.data.knowledgeKind }
          : null;
        // `confirmedBy` is what releases the low-confidence gate: a human has
        // now looked at this metadata and vouched for it, which is strictly
        // better evidence than the inference score that flagged it. Without
        // this, a session a human had fully corrected went on reporting
        // "confidence too low" forever and could never leave the queue.
        updateSessionMetadata(id, {
          domainType: st.advancedEdit.domainType,
          datasetType: st.advancedEdit.datasetType,
          knowledgeKind: st.advancedEdit.knowledgeKind,
          confirmedBy: 'evan',
        });
        // Recorded ONLY when this was a genuine correction — the session's
        // metadata was not yet human-confirmed. A save that merely re-confirms
        // already-trusted metadata (opening the panel and clicking Save with
        // nothing to fix) is not a correction and recordCorrection()'s own
        // idempotency would collapse it to a no-op anyway, but gating here
        // keeps the intent honest at the call site too.
        if (before.ok && !before.data.metadataConfirmedBy) {
          recordCorrection({
            domainType: st.advancedEdit.domainType,
            correctionType: CORRECTION_TYPE.METADATA,
            targetKey: id,
            actorId: 'evan',
            reason: 'Advanced Metadata dikonfirmasi manusia setelah confidence otomatis rendah.',
            before: beforeSnapshot,
            after: { domainType: st.advancedEdit.domainType, datasetType: st.advancedEdit.datasetType, knowledgeKind: st.advancedEdit.knowledgeKind },
            sourceDocumentId: id,
          });
        }
        // Sprint 0 (Presentation Truth) — any typed fact (not just "Nilai
        // Pokok") must be persisted. Gating on `facts.value` alone silently
        // discarded documentNumber/senderOrigin/notes whenever value was
        // left blank, so hasContentFacts() never became true and the
        // session could never reach Knowledge Imported (the "empty
        // Knowledge" bug).
        const hasAnyFact = Object.values(st.advancedEdit.facts).some((v) => v && String(v).trim());
        if (hasAnyFact) attachManualEntryFacts(id, st.advancedEdit.facts);

        // Phase 2.6 — PART 3, THE MISSING HALF OF THE AUTONOMOUS PIPELINE.
        // Saving here is the exact moment the evidence the engine was waiting
        // for comes into existence. Previously nothing happened next: the fact
        // was written, and the session just sat there — still parked, still in
        // the attention queue — until a human noticed and pressed a further
        // two buttons ("Setujui", then "Impor sebagai Knowledge") to walk it
        // through steps it could have taken by itself. The engine had
        // everything it needed and was still asking for permission.
        //
        // Now the arrival of evidence resumes the pipeline immediately, and it
        // runs to its terminal state. Supplying a fact is the human's whole
        // job; finishing the import is the engine's.
        advanceSession(id);
      }
      st.advancedEditId = null; st.advancedEdit = null;
      rerenderPreservingScroll(rerender); return true;
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
