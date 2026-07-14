/* ============================================================
   KNOWLEDGE-METRICS-ENGINE.JS — Knowledge Platform (V2, Phase 5)

   PURPOSE: compute a real KnowledgeHealthReport (contracts/metrics-contract.js)
   against whatever repository is currently active — now wired for real
   since Phase 5 gave the platform a working repository. Against
   NullRepository (the default), every call to the repository fails
   honestly and this engine surfaces that failure rather than fabricating
   zeros; against MemoryRepository, every field is a genuine computation
   over real stored items.

   RESPONSIBILITY: `computeHealthReport()` — coverage, counts by kind,
   pending-review/learning-queue counts, a healthScore banded through
   js/services/unified-scoring.js (reused, not re-implemented), and
   knowledge age.

   DEPENDENCIES: knowledge/repository/knowledge-repository.js,
   knowledge/registry/domain-type-registry.js,
   knowledge/contracts/lifecycle-contract.js,
   js/services/unified-scoring.js (pure reuse, per NON-GOALS in
   language/contracts/statistics-confidence-contract.js's precedent).

   NON-GOALS: does not invent a new banding scale. Does not compute
   `confidenceDistribution` as more than a simple bucketed count (a richer
   distribution is Phase 6+ Services work if ever needed).

   FUTURE EVOLUTION: Phase 6's metrics-service.js is a thin facade over
   this function — this file stays the one place the computation lives.
   ============================================================ */

'use strict';

import {
  listKnowledge as list,
  getKnowledgeMetrics as repositoryMetrics,
  getPendingReviewKnowledge as getPendingReview,
} from '../services/knowledge-service.js';
import { listDomainTypes } from '../registry/domain-type-registry.js';
import { LIFECYCLE_STATE } from '../contracts/lifecycle-contract.js';
import { scoreBand } from '../../../services/unified-scoring.js';

/**
 * @returns {{ok: boolean, data: import('../contracts/metrics-contract.js').KnowledgeHealthReport|null, error: object|null}}
 */
export function computeHealthReport() {
  const metricsResult = repositoryMetrics();
  if (!metricsResult.ok) return metricsResult;

  const allApprovedResult = list({ lifecycleState: LIFECYCLE_STATE.APPROVED });
  const approvedItems = allApprovedResult.ok ? allApprovedResult.data : [];

  const draftResult = list({ lifecycleState: LIFECYCLE_STATE.DRAFT });
  const candidateResult = list({ lifecycleState: LIFECYCLE_STATE.CANDIDATE });
  const pendingReviewResult = getPendingReview();

  const domainTypesWithApproved = new Set(approvedItems.map((i) => i.domainType));
  const registeredDomainTypes = listDomainTypes();
  const coveragePct = registeredDomainTypes.length
    ? Math.round((domainTypesWithApproved.size / registeredDomainTypes.length) * 100)
    : 0;

  const confidenceDistribution = { critical: 0, poor: 0, fair: 0, good: 0, 'very-good': 0, excellent: 0 };
  for (const item of approvedItems) {
    const band = scoreBand(Math.max(0, Math.min(1, Number(item.confidence) || 0)) * 100);
    if (band in confidenceDistribution) confidenceDistribution[band] += 1;
  }

  const patternCount = approvedItems.filter((i) => ['structure', 'template_pattern', 'sentence_pattern', 'paragraph_pattern'].includes(i.kind)).length;
  const vocabularySize = approvedItems.filter((i) => ['vocabulary', 'terminology'].includes(i.kind)).length;
  const templateCount = approvedItems.filter((i) => i.kind === 'template_pattern').length;
  const relationshipCount = approvedItems.filter((i) => i.kind === 'relationship').length;

  const learningQueueCount = (draftResult.ok ? draftResult.data.length : 0) + (candidateResult.ok ? candidateResult.data.length : 0);
  const pendingReviewCount = pendingReviewResult.ok ? pendingReviewResult.data.length : 0;

  const knowledgeAgeByDomainType = {};
  let lastUpdatedAt = null;
  for (const item of approvedItems) {
    const existing = knowledgeAgeByDomainType[item.domainType];
    if (!existing || item.updatedAt > existing) knowledgeAgeByDomainType[item.domainType] = item.updatedAt;
    if (!lastUpdatedAt || item.updatedAt > lastUpdatedAt) lastUpdatedAt = item.updatedAt;
  }

  // healthScore: a simple, transparent composite — coverage and (inverted)
  // pending-review backlog, weighted equally. Reuses the shared 0-100 scale;
  // does not invent a new formula philosophy.
  const backlogPenalty = Math.min(100, pendingReviewCount * 5);
  const healthScore = Math.round(coveragePct * 0.5 + (100 - backlogPenalty) * 0.5);

  return {
    ok: true,
    error: null,
    data: Object.freeze({
      coveragePct,
      confidenceDistribution: Object.freeze(confidenceDistribution),
      patternCount,
      vocabularySize,
      templateCount,
      relationshipCount,
      learningQueueCount,
      pendingReviewCount,
      healthScore,
      knowledgeAgeByDomainType: Object.freeze(knowledgeAgeByDomainType),
      lastUpdatedAt,
    }),
  };
}
