/* ============================================================
   METRICS-CONTRACT.JS — Knowledge Platform (V2, Phase 3)

   PURPOSE: fix the shape of KnowledgeHealthReport now, computed later
   (Decision 4, architecture doc §4.2.4) — so connectors and the repository
   can be built against a stable metrics contract without the metrics engine
   existing yet.

   RESPONSIBILITY: define the KnowledgeHealthReport typedef and its ten
   metrics as data. No computation.

   DEPENDENCIES: none.

   NON-GOALS: no metric is computed in Phase 3. Health Score's "reuse the
   existing weighted-combiner-plus-banding shape from
   js/analytics/engines/executive-score-engine.js" instruction is recorded
   here as a note for Phase 4+, not implemented — this file does not import
   that engine.

   FUTURE EVOLUTION: knowledge/metrics/knowledge-metrics-engine.js (Phase 3
   stub) implements `computeHealthReport()` against this shape once a real
   repository exists to query.
   ============================================================ */

'use strict';

export const METRICS_SCHEMA = 'knowledge-health-report@1';

/**
 * @typedef {Object} KnowledgeHealthReport
 * @property {number} coveragePct           - % of registered domainTypes/sourceTypes with >=1 Approved item
 * @property {Object} confidenceDistribution - aggregate confidence distribution across Approved knowledge
 * @property {number} patternCount          - count of Approved structure/template_pattern kind items
 * @property {number} vocabularySize        - count of distinct Approved vocabulary/terminology items
 * @property {number} templateCount         - count of Approved template_pattern items
 * @property {number} relationshipCount     - count of Approved relationship items
 * @property {number} learningQueueCount    - count of Draft + Candidate items awaiting processing
 * @property {number} pendingReviewCount    - count strictly in Pending Review
 * @property {number} healthScore           - composite; see NON-GOALS re: executive-score-engine.js reuse
 * @property {Object<string, string>} knowledgeAgeByDomainType - time since last Approved update, per domainType
 * @property {string} lastUpdatedAt         - ISO 8601, most recent Approved update across all domainTypes
 */

/** The ten metrics named in the architecture doc's Decision 4, as field ids. */
export const METRICS_FIELDS = Object.freeze([
  'coveragePct',
  'confidenceDistribution',
  'patternCount',
  'vocabularySize',
  'templateCount',
  'relationshipCount',
  'learningQueueCount',
  'pendingReviewCount',
  'healthScore',
  'knowledgeAgeByDomainType',
  'lastUpdatedAt',
]);

export const METRICS_CONTRACT = Object.freeze({
  schema: METRICS_SCHEMA,
  fields: METRICS_FIELDS,
});
