/* ============================================================
   INDEX.JS — Organizational Memory public barrel (V2.0.7, Phase 10)

   PURPOSE: single entry point for Organizational Memory — contracts,
   repository, and every domain-agnostic engine (ingestion, numbering, gap
   detection/workflow, duplicate detection, timeline, health, knowledge
   contribution).

   RESPONSIBILITY: re-export only.

   DEPENDENCIES: every module under organizational-memory/ except
   sources/ (deliberately excluded — see sources/index.js's own header:
   importing it is the explicit act that registers the real `nor` archive
   source and pulls in its Firebase-backed V1 dependency chain).

   NON-GOALS: does not re-export `sources/`. Not imported by
   js/v2/knowledge/ or js/v2/document-intelligence/ (Organizational
   Memory sits downstream of Knowledge per the frozen architecture —
   Official Documents -> Knowledge Acquisition -> Knowledge Repository ->
   Organizational Memory -> Applications — dependency direction is
   one-way: this tree may read knowledge/, never the reverse).
   ============================================================ */

'use strict';

export * from './contracts/archive-record-contract.js';
export * from './contracts/archive-source-contract.js';
export * from './contracts/gap-contract.js';
export * from './contracts/numbering-contract.js';
export * from './contracts/health-contract.js';
export * from './contracts/event-contract.js';
export * from './contracts/upload-recommendation-contract.js';

export * from './registry/archive-source-registry.js';

/* ══ PHASE 4 — THE BARREL NO LONGER LEAKS THE REPOSITORY ═══════════════
   This line used to be:

       export * from './repository/archive-repository.js';

   ...which handed `create` and `appendVersion` — the raw, unguarded writers of
   organizational memory — to every module that imported this barrel. Four UI
   files import it. Nothing stopped any of them from writing the archive
   directly, and one of them did: ui/dataset-import-center.js#doArchive called
   `create()` on the pipeline's PRIMARY archive path, bypassing duplicate
   detection, the lifecycle, the replacement chain and all provenance.

   Nobody had to reach past a facade to do it. It was one autocomplete away.

   The barrel now exports the OWNER instead. To write the archive, call the
   Archive Service: archiveDocument / archiveImportedKnowledge / archiveDuplicate /
   archiveSupersededKnowledge / archiveRejectedKnowledge / restoreDocument /
   deprecateDocument. To read it: findArchiveRecord / listArchive / searchArchive.

   Same hole, same fix, as import-session-service.js (Phase 2.6) and
   lifecycle-service.js (Phase 3). Enforced by scripts/archive-ownership-check.mjs.

   ARCHIVE_REPOSITORY_ERRORS and resetArchiveRepository are re-exported by name:
   the first is data (error codes), the second is a test-teardown helper with no
   runtime caller. Neither can write a record. */
export { ARCHIVE_REPOSITORY_ERRORS, resetArchiveRepository } from './repository/archive-repository.js';
export * from './services/archive-service.js';
export * from './archive-relationship-engine.js';

export * from './document-hash.js';
export * from './archive-ingestion-engine.js';
export * from './numbering-engine.js';
export * from './gap-detection-engine.js';
export * from './gap-workflow-engine.js';
export * from './duplicate-detection-engine.js';
export * from './archive-timeline-engine.js';
export * from './archive-health-engine.js';
export * from './knowledge-contribution-engine.js';
export * from './upload-recommendation-engine.js';
