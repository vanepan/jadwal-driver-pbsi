/* ============================================================
   INDEX.JS — Knowledge Extraction public barrel (V2.0.8, Phase 11)

   PURPOSE: single entry point for "Knowledge Learning Foundation" —
   Knowledge Indexing, Pattern/Vocabulary/Relationship Extraction, Scope
   Detection, Cross-Division Promotion Candidates.

   RESPONSIBILITY: re-export only.

   DEPENDENCIES: every module under knowledge/extraction/. Pure — no V1
   dependency, safe to re-export from knowledge/index.js.

   NON-GOALS: "Knowledge Health" is deliberately NOT re-implemented here —
   knowledge/metrics/knowledge-metrics-engine.js#computeHealthReport()
   (real since Phase 6) already reports patternCount/vocabularySize/
   templateCount/relationshipCount/learningQueueCount, all of which
   naturally increase as this directory's engines write Candidate items.
   Running extraction, then calling computeHealthReport(), is Knowledge
   Health for V2.0.8 — no duplicate metrics engine was built.
   ============================================================ */

'use strict';

export * from './index-engine.js';
export * from './extraction-write-helper.js';
export * from './pattern-extraction-engine.js';
export * from './vocabulary-extraction-engine.js';
export * from './relationship-extraction-engine.js';
export * from './scope-detection-engine.js';
export * from './promotion-candidate-engine.js';
