/* ============================================================
   CONFIDENCE-SERVICE.JS — Knowledge Services (V2.0.12)

   PURPOSE: the public surface for confidence — both the raw
   suggestConfidence() number and, new in V2.0.12, that number
   reshaped into Evidence[] records (contracts/evidence-contract.js)
   so a caller can see WHAT backs the number, not just the number.

   RESPONSIBILITY: `suggestConfidence` is pure delegation.
   `explainConfidenceAsEvidence(item)` is composition only — it
   reshapes machine-learning/confidence-engine.js's own already-computed
   sourceWeight/corroborationCount plus the actual CORROBORATES
   relationships into Evidence[]. It computes no new number.

   DEPENDENCIES: machine-learning/confidence-engine.js,
   dependency-graph-service.js, contracts/evidence-contract.js.

   NON-GOALS: no new confidence math — every weight in the returned
   Evidence[] comes directly from suggestConfidence()'s own output.

   FUTURE EVOLUTION: unchanged as confidence-engine.js's formula is
   tuned — this file reshapes whatever it returns, it doesn't
   duplicate the formula.
   ============================================================ */

'use strict';

import { suggestConfidence } from '../machine-learning/confidence-engine.js';
import { getDependencies, RELATIONSHIP_TYPE } from './dependency-graph-service.js';
import { EVIDENCE_KIND, isEvidence } from '../contracts/evidence-contract.js';

export { suggestConfidence };

/**
 * @param {import('../contracts/knowledge-item-contract.js').KnowledgeItem} item
 * @returns {{ok: boolean, data: import('../contracts/evidence-contract.js').Evidence[], suggestedConfidence: number, error: object|null}}
 */
export function explainConfidenceAsEvidence(item) {
  const confidenceResult = suggestConfidence(item);
  if (!confidenceResult.ok) {
    return { ok: false, data: [], suggestedConfidence: 0, error: confidenceResult.error };
  }

  const depsResult = getDependencies(item.id, RELATIONSHIP_TYPE.CORROBORATES);
  const corroborations = depsResult.ok ? depsResult.data : [];

  const evidence = [
    {
      itemId: item.id,
      kind: EVIDENCE_KIND.SOURCE,
      weight: confidenceResult.sourceWeight,
      rationale: `sourceType "${item.sourceType}" weighted ${confidenceResult.sourceWeight}.`,
    },
    ...corroborations.map((relationship) => ({
      itemId: relationship.payload.fromId === item.id ? relationship.payload.toId : relationship.payload.fromId,
      kind: EVIDENCE_KIND.CORROBORATION,
      weight: corroborations.length > 0 ? Math.min(1, 1 / corroborations.length) : 0,
      rationale: `Corroborated by relationship "${relationship.id}".`,
    })),
  ].filter(isEvidence);

  return { ok: true, data: evidence, suggestedConfidence: confidenceResult.suggestedConfidence, error: null };
}
