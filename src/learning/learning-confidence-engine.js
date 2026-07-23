/* ============================================================
   LEARNING-CONFIDENCE-ENGINE.JS — Universal Learning Engine (Phase 12.6.2)

   PURPOSE: compute how much to trust ONE LearningSignal at intake. Cites
   and extends knowledge/machine-learning/confidence-engine.js#suggestConfidence's
   exact documented formula and constants (sourceWeight*0.6 +
   min(1,corroborationCount/3)*0.4) — reused as ARITHMETIC, not as code
   (that file is a knowledge/ ENGINE, not a bare contract leaf;
   scripts/learning-ownership-check.mjs already fails any learning/ file
   that imports one — see registry/learning-source-weight-registry.js's
   header for the full reasoning). Adds the one term that formula never
   needed: a documented contradiction penalty, since a Learning Signal (
   unlike a settled KnowledgeItem) can be directly contradicted by another
   signal in the same scope (see learning-conflict-detection-engine.js,
   Phase 12.6.3).

   RESPONSIBILITY: computeSignalConfidence(signal, opts).

   DEPENDENCIES: registry/learning-source-weight-registry.js,
   contracts/learning-confidence-contract.js.

   NON-GOALS: never gates persistence — see learning-confidence-contract.js's
   header. Never reads a repository itself; corroboration/contradiction
   counts are supplied by the caller (learning-signal-service.js, Phase
   12.6.4), which already has the relevant same-scope signals in hand from
   its own Merge/Dedup/Conflict steps — this engine stays pure arithmetic.
   ============================================================ */

'use strict';

import { getLearningSourceWeight } from './registry/learning-source-weight-registry.js';
import { makeLearningConfidence } from './contracts/learning-confidence-contract.js';

const SOURCE_WEIGHT_FACTOR = 0.6;          // same constant as knowledge/machine-learning/confidence-engine.js
const CORROBORATION_FACTOR = 0.4;          // same constant
const CORROBORATION_CAP = 3;               // same constant — a large duplicate cluster must not dominate the score
const CONTRADICTION_PENALTY_FACTOR = 0.3;  // NEW — Phase 12.6, no precedent to match; documented, not hidden
const CONTRADICTION_CAP = 3;               // same capping discipline as corroboration, applied symmetrically

/**
 * @param {import('./contracts/learning-signal-contract.js').LearningSignal} signal
 * @param {{corroborationCount?: number, contradictionCount?: number}} [opts]
 * @returns {import('./contracts/learning-confidence-contract.js').LearningConfidence}
 */
export function computeSignalConfidence(signal, { corroborationCount = 0, contradictionCount = 0 } = {}) {
  const { weight: sourceWeight } = getLearningSourceWeight(signal.sourceType);

  const raw = sourceWeight * SOURCE_WEIGHT_FACTOR
    + Math.min(1, corroborationCount / CORROBORATION_CAP) * CORROBORATION_FACTOR
    - Math.min(1, contradictionCount / CONTRADICTION_CAP) * CONTRADICTION_PENALTY_FACTOR;
  const value = Math.max(0, Math.min(1, Math.round(raw * 100) / 100));

  return makeLearningConfidence({
    value, sourceWeight, corroborationCount, contradictionCount,
    rationale: `sourceType "${signal.sourceType}" weight=${sourceWeight}, ${corroborationCount} corroborating / ${contradictionCount} contradicting same-scope signal(s) `
      + `(formula: sourceWeight*${SOURCE_WEIGHT_FACTOR} + min(1,corroboration/${CORROBORATION_CAP})*${CORROBORATION_FACTOR} - min(1,contradiction/${CONTRADICTION_CAP})*${CONTRADICTION_PENALTY_FACTOR}).`,
  });
}
