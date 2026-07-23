/* ============================================================
   IMPORT-SESSION-SERVICE.JS — Knowledge Services (V2.1)

   PURPOSE: the one public surface for the Import Session lifecycle, same
   idiom as review-service.js — pure re-export, no new decision logic.

   DEPENDENCIES: knowledge/datasets/import-session/import-session-engine.js.
   ============================================================ */

'use strict';

/* ── EVIDENCE + READS — everything a consumer may legitimately do to an
   Import Session by itself. Not one of these writes `state` or
   `pipelineStage`; they record what is TRUE about a document (its facts, its
   hash, where its bytes live, that a human confirmed its metadata), and the
   scheduler decides what that truth means for the lifecycle. ────────────── */
export {
  createImportSession,
  attachManualEntryFacts,
  attachParsedContent,
  attachDocumentHash,
  attachFileStorage,
  attachInferenceResult,
  updateSessionMetadata,
  ensureDatasetForSession,
  getImportSession,
  listImportSessions,
  getImportSessionHistory,
  hasContentFacts,
} from '../datasets/import-session/import-session-engine.js';

/* ── LIFECYCLE — the scheduler, and ONLY the scheduler. ──────────────────
 *
 * Phase 2.6 HARDENING — this facade used to re-export the raw transition
 * primitives too: submitImportSessionForReview, approveImportSession,
 * markKnowledgeImported, markArchived, markUploading, markAwaitingEvidence,
 * cancelImportSession, failImportSession, rejectImportSession, markAutoImported
 * and the bare cancelBatch. Nothing in the codebase called them through here —
 * but that is luck, not design. A facade whose stated job is to be THE safe
 * public surface, and which hands out every unsafe primitive behind it,
 * guarantees only that the next workspace to need "just move this one session
 * along" will quietly reintroduce the exact class of bug this milestone spent
 * its life removing: a second thing that believes it owns the lifecycle.
 *
 * The primitives still exist on the engine, and the scheduler still calls them
 * — but a consumer now has to reach past a facade and into knowledge/datasets/
 * import-session/ to get at one, which is a deliberate, visible, reviewable act
 * rather than an autocomplete away.
 *
 *   advanceSession()        drive ONE session as far as its evidence allows
 *   sweepPipeline()         drive ALL of them (event-driven; never polled)
 *   cancelImportBatch()     cancel a batch AND its unfinished sessions — the
 *                           ONLY correct way to cancel (bare cancelBatch only
 *                           ever flipped a status field and left the work running)
 *   discardImportSession()  a human's terminal "do not import this"
 *   reportUploadStarted()   the UI reporting real bytes going to Storage
 *   registerArchiver()      the one cross-layer seam (see the scheduler's header)
 */
export {
  registerArchiver,
  advanceSession,
  sweepPipeline,
  cancelImportBatch,
  discardImportSession,
  reportUploadStarted,
  PIPELINE_OUTCOME,
  MAX_PIPELINE_ATTEMPTS,
} from '../datasets/import-session/pipeline-scheduler.js';

export {
  inferMetadata,
  inferPatternAssisted,
  tokenize,
  AUTO_POPULATE_CONFIDENCE_THRESHOLD,
} from '../datasets/import-session/metadata-inference-engine.js';

// V2.1.2 — Batch History Foundation.
/* Batch = operational bookkeeping for ONE upload action (N files selected
   together). It is not the Import Session lifecycle and never writes to it.
   `cancelBatch` is deliberately NOT re-exported: on its own it only flips a
   status field and leaves every session that batch created still running — the
   precise defect Part 1 of this milestone root-caused. Use the scheduler's
   cancelImportBatch() above, which cancels the WORK. */
export {
  createBatch,
  recordBatchItem,
  pauseBatch,
  resumeBatch,
  completeBatch,
  getBatch,
  listBatches,
  getBatchHistory,
  BATCH_STATUS,
} from '../datasets/import-session/import-batch-engine.js';

// V2.1.2 — Persistence (lazy, opt-in — see import-session-repository.js's
// header). The ONLY caller is sarpras-intelligence-center.js's mount.
export { initImportSessionSync } from '../datasets/import-session/repository/import-session-repository.js';
export { initImportBatchSync } from '../datasets/import-session/repository/import-batch-repository.js';

// Phase 1 (Operational Engine Hardening) — cross-tab live wiring. Aliased
// on re-export since both repositories name their hook the same thing
// locally (see each repository's own header comment for why notify()
// only fires on remote-originated hydration, never a local write).
export { registerChangeListener as registerImportSessionChangeListener } from '../datasets/import-session/repository/import-session-repository.js';
export { registerChangeListener as registerImportBatchChangeListener } from '../datasets/import-session/repository/import-batch-repository.js';
