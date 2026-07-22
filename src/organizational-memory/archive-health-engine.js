/* ============================================================
   ARCHIVE-HEALTH-ENGINE.JS — Organizational Memory Foundation (V2.0.7, Phase 10)

   PURPOSE: "Archive Health" — a real, deterministic composite over three
   already-real signals: gap count (gap-detection-engine.js), duplicate
   count (duplicate-detection-engine.js), knowledge contribution
   percentage (knowledge-contribution-engine.js's live re-check). No new
   computation of its own beyond the weighted combination.

   Weighting (documented, not hidden): 50% knowledge-contribution
   completeness, 30% gap-free-ness, 20% duplicate-free-ness — knowledge
   contribution is weighted highest because an archived-but-uncontributed
   document represents the platform's actual purpose (Official Documents
   -> Knowledge Acquisition -> ... -> Organizational Memory) going
   unfulfilled for that record.

   RESPONSIBILITY: `computeArchiveHealth(domainType)`.

   DEPENDENCIES: repository/archive-repository.js,
   gap-workflow-engine.js (workflow-aware — a gap already flagged/resolved
   should not count against health the same way a genuinely untouched one
   does), duplicate-detection-engine.js, knowledge-contribution-engine.js,
   contracts/health-contract.js.
   ============================================================ */

'use strict';

import { listArchive as list } from './services/archive-service.js';
import { getGapsWithWorkflowState } from './gap-workflow-engine.js';
import { findDuplicateArchiveRecords } from './duplicate-detection-engine.js';
import { checkKnowledgeContribution } from './knowledge-contribution-engine.js';

/**
 * @param {string} domainType
 * @returns {import('./contracts/health-contract.js').ArchiveHealthReport}
 */
export function computeArchiveHealth(domainType) {
  const result = list({ sourceDomainType: domainType });
  const records = result.ok ? result.data : [];
  const totalArchived = records.length;

  const openGapCount = getGapsWithWorkflowState(domainType).length;
  const duplicateGroupCount = findDuplicateArchiveRecords(domainType).length;
  const contributedCount = records.filter(checkKnowledgeContribution).length;
  const knowledgeContributionPct = totalArchived > 0 ? Math.round((contributedCount / totalArchived) * 100) : 0;

  const gapFreeScore = totalArchived > 0 ? Math.max(0, 1 - openGapCount / totalArchived) : 1;
  const duplicateFreeScore = totalArchived > 0 ? Math.max(0, 1 - duplicateGroupCount / totalArchived) : 1;
  const healthScore = totalArchived > 0
    ? Math.round((knowledgeContributionPct / 100) * 50 + gapFreeScore * 30 + duplicateFreeScore * 20)
    : 0;

  return Object.freeze({
    domainType,
    totalArchived,
    openGapCount,
    duplicateGroupCount,
    knowledgeContributionPct,
    healthScore,
    computedAt: new Date().toISOString(),
  });
}
