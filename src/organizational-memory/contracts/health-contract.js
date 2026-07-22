/* ============================================================
   HEALTH-CONTRACT.JS — Organizational Memory Foundation (V2.0.7, Phase 10)

   PURPOSE: fix the shape of "Archive Health" — mirrors
   knowledge/contracts/metrics-contract.js's KnowledgeHealthReport pattern
   (a whole-archive, point-in-time composite), applied to the archive
   instead of the knowledge repository. A different question ("is our
   organizational memory complete") than KnowledgeHealthReport's ("is our
   learned knowledge trustworthy") — not a duplicate.

   RESPONSIBILITY: define ArchiveHealthReport.

   DEPENDENCIES: none (structural — archive-health-engine.js computes it).
   ============================================================ */

'use strict';

export const ARCHIVE_HEALTH_SCHEMA = 'archive-health-report@1';

/**
 * @typedef {Object} ArchiveHealthReport
 * @property {string} domainType
 * @property {number} totalArchived
 * @property {number} openGapCount
 * @property {number} duplicateGroupCount
 * @property {number} knowledgeContributionPct  - % of archived records with hasContributedKnowledge
 * @property {number} healthScore               - 0-100 composite
 * @property {string} computedAt                - ISO 8601
 */
