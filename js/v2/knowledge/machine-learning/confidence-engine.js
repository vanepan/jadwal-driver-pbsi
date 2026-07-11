/* ============================================================
   CONFIDENCE-ENGINE.JS — Machine Learning Foundation (V2.0.9, Phase 12)

   PURPOSE: "Confidence" — a real, documented, weighted formula combining
   two already-real signals: source weight (contracts/source-weight-contract.js's
   real weight table, V2.0.9) and corroboration count (the dependency
   graph's CORROBORATES relationships — real since Phase 6, and now
   genuinely populated by knowledge/extraction/relationship-extraction-engine.js,
   V2.0.8). A REPORT only — never writes anything, so "Machine Learning
   never modifies Approved Knowledge" holds by construction: this engine
   cannot modify ANY KnowledgeItem, Approved or otherwise. A caller who
   wants to actually apply a suggestion still goes through the existing
   repository/appendVersion path themselves, on a non-Approved item, same
   as knowledge/learning/correction-pipeline-engine.js already requires.

   Formula (documented, not hidden): `suggestedConfidence = sourceWeight *
   0.6 + min(1, corroborationCount / 3) * 0.4` — source trust is weighted
   higher (0.6) than corroboration (0.4) because an untrustworthy source
   corroborated three times is still untrustworthy; corroboration caps at
   3 matches (min(1, n/3)) so a large duplicate cluster doesn't dominate
   the score.

   RESPONSIBILITY: `suggestConfidence(item)`.

   DEPENDENCIES: contracts/source-weight-contract.js,
   dependency-graph/knowledge-dependency-graph-engine.js.
   ============================================================ */

'use strict';

import { getSourceWeight } from '../contracts/source-weight-contract.js';
import { getDependencies, RELATIONSHIP_TYPE } from '../dependency-graph/knowledge-dependency-graph-engine.js';

const SOURCE_WEIGHT_FACTOR = 0.6;
const CORROBORATION_FACTOR = 0.4;
const CORROBORATION_CAP = 3;

/**
 * @param {import('../contracts/knowledge-item-contract.js').KnowledgeItem} item
 * @returns {{ok: boolean, currentConfidence: number, suggestedConfidence: number, sourceWeight: number, corroborationCount: number, rationale: string, error: object|null}}
 */
export function suggestConfidence(item) {
  if (!item || typeof item.sourceType !== 'string') {
    return { ok: false, currentConfidence: 0, suggestedConfidence: 0, sourceWeight: 0, corroborationCount: 0, rationale: '', error: { code: 'INVALID_ITEM', message: 'suggestConfidence: item must be a KnowledgeItem.' } };
  }

  const { weight: sourceWeight } = getSourceWeight(item.sourceType);
  const depsResult = getDependencies(item.id);
  const corroborationCount = depsResult.ok
    ? depsResult.data.filter((r) => r.payload && r.payload.type === RELATIONSHIP_TYPE.CORROBORATES).length
    : 0;

  const suggestedConfidence = Math.round((sourceWeight * SOURCE_WEIGHT_FACTOR + Math.min(1, corroborationCount / CORROBORATION_CAP) * CORROBORATION_FACTOR) * 100) / 100;

  return {
    ok: true,
    currentConfidence: item.confidence,
    suggestedConfidence,
    sourceWeight,
    corroborationCount,
    rationale: `sourceType "${item.sourceType}" weight=${sourceWeight}, ${corroborationCount} corroborating relationship(s).`,
    error: null,
  };
}
