/* ============================================================
   INDEX.JS — Knowledge Services public barrel (V2, Phase 6)

   PURPOSE: single entry point for every Knowledge service — Phase 6's
   original eleven, plus confidence/statistics/knowledgeGraph (V2.0.12),
   plus profiles (V2.0.12.5), plus importSession/profileOverrides/
   patternDiscovery (V2.1, Knowledge Acquisition Operational Readiness).

   RESPONSIBILITY: re-export only, NAMESPACED per service (rather than
   flattened) — `rollback` is exposed by both review-service.js (the named
   workflow operation) and versioning-service.js (the raw repository
   operation they both ultimately call); flattening would create an
   ambiguous duplicate export. Namespacing also matches how a future
   consumer will think about these ("the review service's rollback" vs.
   "the versioning service's rollback").

   DEPENDENCIES: every module under knowledge/services/.

   NON-GOALS: not imported by anything outside js/v2/ in Phase 6.

   FUTURE EVOLUTION: unchanged as more services are added — each gets one
   more namespaced export here.
   ============================================================ */

'use strict';

export * as review from './review-service.js';
export * as metrics from './metrics-service.js';
export * as explainability from './explainability-service.js';
export * as dependencyGraph from './dependency-graph-service.js';
export * as trace from './trace-service.js';
export * as health from './health-service.js';
export * as versioning from './versioning-service.js';
export * as lifecycle from './lifecycle-service.js';
export * as sourceWeight from './source-weight-service.js';
export * as validation from './validation-service.js';
export * as identity from './identity-service.js';
export * as registry from './registry-service.js';
export * as confidence from './confidence-service.js';
export * as statistics from './statistics-service.js';
export * as knowledgeGraph from './knowledge-graph-service.js';
export * as profiles from './profile-service.js';
// V2.1 — Knowledge Acquisition Operational Readiness.
export * as importSession from './import-session-service.js';
export * as profileOverrides from './profile-override-service.js';
export * as patternDiscovery from './pattern-discovery-service.js';
// Phase 12.7.3 — Recognition's Similarity Strategy Registry is the first
// cross-domain caller; see similarity-service.js's own header.
export * as similarity from './similarity-service.js';
