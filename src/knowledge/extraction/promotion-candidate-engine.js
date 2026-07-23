/* ============================================================
   PROMOTION-CANDIDATE-ENGINE.JS — Knowledge Learning Foundation (V2.0.8, Phase 11)

   PURPOSE: "Cross-Division Promotion Candidates" — identifies which
   already-Approved items represent the MAJORITY pattern within their
   domainType+kind group (real promotion candidates — evidence supports
   treating this as the org-wide standard) versus the minority/variant
   items (division-specific exceptions, not evidence of error, just not
   the majority). Reuses scope-detection-engine.js's
   `groupByPayload`/majority grouping rather than re-deriving it.

   This does NOT itself write a KnowledgeItem or perform a promotion —
   see js/v2/knowledge/promotion/promotion-engine.js (V2.0.4) for the real,
   human-gated promotion verbs (promoteToCandidate/approve/etc.); this
   engine only REPORTS which item ids are worth a human's promotion
   attention, same "propose, never auto-act" discipline as every other
   extraction engine here.

   RESPONSIBILITY: `identifyPromotionCandidates(domainType, kind, opts)`.

   DEPENDENCIES: index-engine.js, scope-detection-engine.js.
   ============================================================ */

'use strict';

import { buildKnowledgeIndex, indexGroup } from './index-engine.js';
import { groupByPayload } from './scope-detection-engine.js';

/**
 * @param {string} domainType
 * @param {string} kind
 * @param {{minGroupSize?: number}} [opts] - a group of size 1 is not
 *   "cross-division corroborated majority", just one data point
 * @returns {{ok: boolean, promotionCandidateIds: string[], variantIds: string[], majorityGroupSize: number, error: object|null}}
 */
export function identifyPromotionCandidates(domainType, kind, opts = {}) {
  const minGroupSize = opts.minGroupSize ?? 2;
  const index = buildKnowledgeIndex();
  const items = indexGroup(index, domainType, kind);

  if (items.length === 0) {
    return { ok: false, promotionCandidateIds: [], variantIds: [], majorityGroupSize: 0, error: { code: 'NO_POPULATION', message: `No Approved ${domainType}/${kind} items to identify promotion candidates from.` } };
  }

  const groups = groupByPayload(items);
  const majority = groups[0];

  if (majority.items.length < minGroupSize) {
    return { ok: true, promotionCandidateIds: [], variantIds: items.map((i) => i.id), majorityGroupSize: majority.items.length, error: null };
  }

  const promotionCandidateIds = majority.items.map((i) => i.id);
  const variantIds = groups.slice(1).flatMap((g) => g.items.map((i) => i.id));

  return { ok: true, promotionCandidateIds, variantIds, majorityGroupSize: majority.items.length, error: null };
}
