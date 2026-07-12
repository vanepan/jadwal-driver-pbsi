/* ============================================================
   IMPORT-SESSION-SERVICE.JS — Knowledge Services (V2.1)

   PURPOSE: the one public surface for the Import Session lifecycle, same
   idiom as review-service.js — pure re-export, no new decision logic.

   DEPENDENCIES: knowledge/datasets/import-session/import-session-engine.js.
   ============================================================ */

'use strict';

export {
  createImportSession,
  attachManualEntryFacts,
  attachParsedContent,
  attachDocumentHash,
  attachFileStorage,
  attachInferenceResult,
  markAutoImported,
  updateSessionMetadata,
  submitImportSessionForReview,
  approveImportSession,
  rejectImportSession,
  markKnowledgeImported,
  markArchived,
  getImportSession,
  listImportSessions,
  getImportSessionHistory,
} from '../datasets/import-session/import-session-engine.js';

export {
  inferMetadata,
  inferPatternAssisted,
  tokenize,
  AUTO_POPULATE_CONFIDENCE_THRESHOLD,
  AUTO_IMPORT_CONFIDENCE_THRESHOLD,
} from '../datasets/import-session/metadata-inference-engine.js';

// V2.1.2 — Batch History Foundation.
export {
  createBatch,
  recordBatchItem,
  pauseBatch,
  resumeBatch,
  cancelBatch,
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
