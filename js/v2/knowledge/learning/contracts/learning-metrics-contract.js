/* ============================================================
   LEARNING-METRICS-CONTRACT.JS — Teach Once, Learn Forever (V2.0.5, Phase 9.4)

   PURPOSE: fix the shape of a rollup over the Correction Pipeline's
   activity — mirrors observability/contracts/import-statistics-contract.js's
   pattern (a pure aggregator over a log of records), applied to
   corrections instead of acquisition runs.

   RESPONSIBILITY: define LearningMetrics and a pure aggregator over
   correction-pipeline-engine.js's in-memory correction log.

   DEPENDENCIES: none (structural).
   ============================================================ */

'use strict';

export const LEARNING_METRICS_SCHEMA = 'knowledge-learning-metrics@1';

/**
 * @typedef {Object} LearningMetrics
 * @property {number} totalCorrections
 * @property {number} updatesToExisting  - corrections with a non-null itemId
 * @property {number} candidatesGenerated - corrections that proposed a brand-new item
 * @property {number} similarityMatches  - corrections where Similarity Detection found an existing match
 * @property {string|null} firstCorrectionAt
 * @property {string|null} lastCorrectionAt
 */

/**
 * @param {{itemId: string|null, generatedNew: boolean, similarityMatchFound: boolean, at: string}[]} log
 * @returns {LearningMetrics}
 */
export function buildLearningMetrics(log) {
  const sorted = [...log].sort((a, b) => a.at.localeCompare(b.at));
  return Object.freeze({
    totalCorrections: sorted.length,
    updatesToExisting: sorted.filter((r) => !r.generatedNew).length,
    candidatesGenerated: sorted.filter((r) => r.generatedNew).length,
    similarityMatches: sorted.filter((r) => r.similarityMatchFound).length,
    firstCorrectionAt: sorted.length ? sorted[0].at : null,
    lastCorrectionAt: sorted.length ? sorted[sorted.length - 1].at : null,
  });
}
