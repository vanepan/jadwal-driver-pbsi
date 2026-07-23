/* ============================================================
   RELATIONSHIP-DISCOVERY-ENGINE.JS — Relationship Discovery (Phase 12.7.5)

   PURPOSE: discover RecognitionRelationships this platform never had a
   human explicitly create — starting from the one, real, already-
   persisted signal this phase has by the time this sprint runs: two
   scopes landing in the SAME Recognition Cluster (Sprint 12.7.4).

   WHY ONLY 'CO_CLUSTERED', NEVER ONE OF THE FIVE RICHER LABELS
   (SAME_VENDOR/SAME_TEMPLATE/SAME_DEPARTMENT/SAME_WORKFLOW/
   RECURRING_PARTICIPANT). Two scopes co-clustering under a
   structural/similarity signature is real evidence they are RELATED —
   but WHY is an interpretation this engine has not verified. Asserting
   "SAME_VENDOR" from a bare structural-shape match would be exactly the
   "invent business rules" fabrication CLAUDE.md Principle 7 forbids —
   the same asymmetry Sprint 11.12's own evidence-resolution ladder drew
   between what a document's own text says and what an engine may
   responsibly infer. `CO_CLUSTERED` says only what was actually
   observed; a human confirming a real cause (via the Recognition
   Recommendation this cluster/relationship pair can produce — see
   services/recommendation-service.js, a later sprint) is the honest,
   existing path to a richer label, never this engine assigning one
   itself.

   RESPONSIBILITY: discoverRelationshipsFromClusters(clusterRecords).

   DEPENDENCIES: ../contracts/recognition-relationship-contract.js,
   knowledge/contracts/evidence-contract.js.

   NON-GOALS: does not persist anything (services/graph-service.js, this
   same sprint, does). Does not discover a relationship from anything
   other than cluster co-membership yet — repeated co-occurrence across
   Body/Learning events, recurring participants, etc. are real, named
   future extensions (see this sprint's own report), not attempted here.
   ============================================================ */

'use strict';

import { isRecognitionRelationshipPayload } from '../contracts/recognition-relationship-contract.js';
import { EVIDENCE_KIND } from '../../../../src/knowledge/contracts/evidence-contract.js';

export const CO_CLUSTERED_RELATIONSHIP_TYPE = 'CO_CLUSTERED';

/**
 * @typedef {Object} DiscoveredRelationship
 * @property {import('../contracts/recognition-relationship-contract.js').RecognitionRelationshipPayload} payload
 * @property {import('../../../../src/knowledge/contracts/evidence-contract.js').Evidence[]} evidence
 * @property {number} confidence
 */

/**
 * Pure. For every RecognitionRecord of recordType 'cluster' handed in,
 * emits one DiscoveredRelationship per unique PAIR of its members —
 * every one citing the cluster that produced it as its evidence (cite-
 * or-abstain: a relationship with no real cluster behind it is simply
 * never emitted, not a possible input to this function at all).
 * @param {object[]} clusterRecords - real RecognitionRecords, recordType === 'cluster'
 * @returns {DiscoveredRelationship[]}
 */
export function discoverRelationshipsFromClusters(clusterRecords) {
  const discovered = [];
  for (const cluster of (Array.isArray(clusterRecords) ? clusterRecords : [])) {
    if (!cluster || cluster.recordType !== 'cluster' || !cluster.payload) continue;
    const members = [...(cluster.payload.memberScopeKeys || [])].sort();
    for (let i = 0; i < members.length; i += 1) {
      for (let j = i + 1; j < members.length; j += 1) {
        const payload = Object.freeze({
          relationshipType: CO_CLUSTERED_RELATIONSHIP_TYPE,
          fromScopeKey: members[i],
          toScopeKey: members[j],
        });
        if (!isRecognitionRelationshipPayload(payload)) continue; // structurally unreachable, defensive only
        discovered.push(Object.freeze({
          payload,
          evidence: Object.freeze([Object.freeze({
            itemId: cluster.id,
            kind: EVIDENCE_KIND.RELATIONSHIP,
            weight: Math.round(cluster.confidence * 100) / 100,
            rationale: `Both scopes are members of Recognition Cluster "${cluster.id}" (${cluster.payload.clusterType}).`,
          })]),
          confidence: cluster.confidence,
        }));
      }
    }
  }
  return discovered;
}
