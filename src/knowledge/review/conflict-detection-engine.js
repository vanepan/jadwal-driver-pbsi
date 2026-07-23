/* ============================================================
   CONFLICT-DETECTION-ENGINE.JS — Knowledge Review Workflow (V2.0.3, Phase 9.2)

   PURPOSE: find KnowledgeItems that are structurally competing for the
   same slot and disagree — e.g. two independently-acquired Candidates for
   the same domainType+kind with different payloads, both still in flight
   toward Approved. Two items with DIFFERENT sourceRef (different
   underlying source records, e.g. two different NOR documents) are NOT a
   conflict by construction — every source record is its own legitimate
   fact. A conflict is specifically: more than one DISTINCT payload
   un-settled (Candidate or Pending Review) at once for the same
   domainType+kind, i.e. more than one candidate answer for what "the"
   structure/rule/vocabulary for that combination should be.

   RESPONSIBILITY: `detectConflicts(items)` — pure, generic, works on any
   array of KnowledgeItems (typically pre-filtered to one domainType+kind
   by the caller — see review-queue-engine.js, its real consumer).

   DEPENDENCIES: observability/contracts/conflict-report-contract.js
   (reused, not duplicated — this is "Conflict Detection", V2.0.3; the
   report SHAPE is "Conflict Reporting", already built in V2.0.2.1).

   NON-GOALS: does not resolve anything (V2.0.4's Conflict Resolution).
   Does not compare across different domainType/kind groups — the caller
   decides the comparison scope.
   ============================================================ */

'use strict';

import { LIFECYCLE_STATE } from '../contracts/lifecycle-contract.js';
import { makeConflictReport } from '../observability/contracts/conflict-report-contract.js';

const UNSETTLED_STATES = Object.freeze([LIFECYCLE_STATE.CANDIDATE, LIFECYCLE_STATE.PENDING_REVIEW]);

function payloadKey(item) {
  try { return JSON.stringify(item.payload); } catch { return String(item.payload); }
}

/**
 * @param {import('../contracts/knowledge-item-contract.js').KnowledgeItem[]} items
 * @returns {import('../observability/contracts/conflict-report-contract.js').KnowledgeConflictReport[]}
 */
export function detectConflicts(items) {
  const groups = new Map(); // `${domainType}::${kind}` -> Map<payloadKey, itemId[]>

  for (const item of items) {
    if (!UNSETTLED_STATES.includes(item.lifecycleState)) continue;
    const groupKey = `${item.domainType}::${item.kind}`;
    if (!groups.has(groupKey)) groups.set(groupKey, { domainType: item.domainType, byPayload: new Map() });
    const group = groups.get(groupKey);
    const key = payloadKey(item);
    if (!group.byPayload.has(key)) group.byPayload.set(key, []);
    group.byPayload.get(key).push(item.id);
  }

  const reports = [];
  for (const group of groups.values()) {
    if (group.byPayload.size < 2) continue; // only one distinct payload in flight — no conflict
    const itemIds = [...group.byPayload.values()].flat();
    reports.push(makeConflictReport({
      domainType: group.domainType,
      itemIds,
      description: `${group.byPayload.size} distinct un-settled payloads competing for domainType "${group.domainType}".`,
    }));
  }
  return reports;
}
