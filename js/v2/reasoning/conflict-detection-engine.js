/* ============================================================
   CONFLICT-DETECTION-ENGINE.JS — Organizational Reasoning Foundation
   (V2, Phase 4-7)

   PURPOSE: "identify conflicting rules" — reuses the existing, real
   `conflicts_with` relationship type (knowledge/contracts/
   dependency-graph-contract.js#RELATIONSHIP_TYPE, real since Phase 3) and
   the existing dependency-graph-service.js read path. Introduces NO new
   relationship type and NO new storage — a conflict between two rules is
   exactly the same kind of KnowledgeItem NOR-Specification.md §E.5's
   Terbilang inconsistency already proved this relationship type covers
   (see Knowledge-Asset-Specification.md §4).

   RESPONSIBILITY: `detectConflicts(applicableRuleIds)` — for a set of
   rules the applicability engine already decided apply to the same
   Problem, report every `conflicts_with` relationship connecting two of
   them. Never picks a winner — see reasoning-engine.js's header for why.

   DEPENDENCIES: knowledge/services/dependency-graph-service.js.

   NON-GOALS: does not decide which rule wins a conflict — a detected
   conflict always lowers a Recommendation's confidence and is surfaced
   verbatim, never silently resolved (that would be inventing a business
   rule the organization never actually approved).
   ============================================================ */

'use strict';

import { getDependencies, RELATIONSHIP_TYPE } from '../knowledge/services/dependency-graph-service.js';

/**
 * @param {string[]} applicableRuleIds
 * @returns {import('./contracts/recommendation-contract.js').RuleConflict[]}
 */
export function detectConflicts(applicableRuleIds) {
  const idSet = new Set(applicableRuleIds);
  const conflicts = [];
  const seenPairKeys = new Set();

  for (const ruleId of applicableRuleIds) {
    const result = getDependencies(ruleId, RELATIONSHIP_TYPE.CONFLICTS_WITH);
    if (!result.ok) continue;
    for (const relationship of result.data) {
      const { fromId, toId } = relationship.payload;
      const other = fromId === ruleId ? toId : fromId;
      if (!idSet.has(other) || other === ruleId) continue;
      const pairKey = [ruleId, other].sort().join('::');
      if (seenPairKeys.has(pairKey)) continue;
      seenPairKeys.add(pairKey);
      conflicts.push({ ruleId, conflictsWithRuleId: other, relationshipId: relationship.id });
    }
  }
  return conflicts;
}
