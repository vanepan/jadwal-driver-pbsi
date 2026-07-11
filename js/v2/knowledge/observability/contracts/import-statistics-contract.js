/* ============================================================
   IMPORT-STATISTICS-CONTRACT.JS — Knowledge Observability (V2, Phase 9.1)

   PURPOSE: fix the shape of an aggregate rollup ACROSS MULTIPLE acquisition
   runs for one connector — distinct from
   acquisition/contracts/import-report-contract.js's KnowledgeImportReport
   (one run) and contracts/metrics-contract.js's KnowledgeHealthReport
   (whole-repository, point-in-time). "How has the `nor` connector done
   over its last 12 runs" is this shape; "what does the repository look
   like right now" is metrics-contract.js's.

   RESPONSIBILITY: define KnowledgeImportStatistics and a pure aggregator
   over an array of KnowledgeImportReport.

   DEPENDENCIES: none (structural — reads plain KnowledgeImportReport
   fields, does not import that contract to avoid a needless coupling for
   what is a pure reducer).
   ============================================================ */

'use strict';

export const IMPORT_STATISTICS_SCHEMA = 'knowledge-import-statistics@1';

/**
 * @typedef {Object} KnowledgeImportStatistics
 * @property {string} connectorId
 * @property {number} totalRuns
 * @property {number} itemsCreated
 * @property {number} itemsUpdated
 * @property {number} itemsSkipped
 * @property {number} totalWarnings
 * @property {number} totalErrors
 * @property {string|null} firstRunAt - ISO 8601
 * @property {string|null} lastRunAt  - ISO 8601
 */

/**
 * @param {string} connectorId
 * @param {import('../../acquisition/contracts/import-report-contract.js').KnowledgeImportReport[]} reports
 * @returns {KnowledgeImportStatistics}
 */
export function buildImportStatistics(connectorId, reports) {
  const forConnector = (reports || []).filter((r) => r.connectorId === connectorId);
  const sorted = [...forConnector].sort((a, b) => a.generatedAt.localeCompare(b.generatedAt));
  return Object.freeze({
    connectorId,
    totalRuns: sorted.length,
    itemsCreated: sorted.reduce((n, r) => n + (r.itemsCreated || 0), 0),
    itemsUpdated: sorted.reduce((n, r) => n + (r.itemsUpdated || 0), 0),
    itemsSkipped: sorted.reduce((n, r) => n + (r.itemsSkipped || 0), 0),
    totalWarnings: sorted.reduce((n, r) => n + ((r.warnings && r.warnings.length) || 0), 0),
    totalErrors: sorted.reduce((n, r) => n + ((r.errors && r.errors.length) || 0), 0),
    firstRunAt: sorted.length ? sorted[0].generatedAt : null,
    lastRunAt: sorted.length ? sorted[sorted.length - 1].generatedAt : null,
  });
}
