/* ============================================================
   PATTERN-DISCOVERY-SERVICE.JS — Knowledge Services (V2.1 -> Phase 5)

   PURPOSE: the public surface for Pattern Discovery, same idiom as
   dependency-graph-service.js — pure delegation, no computation added.

   PHASE 5, PART 9 — PATTERN DISCOVERY AS A LEARNING PRODUCER.
   computePatternRecommendations() and computeLearningPatterns() both stay
   PURE (unchanged NON-GOALS — see pattern-discovery-engine.js's header):
   neither writes anything, ever. discoverAndRecordPatterns() below is the
   one, explicitly-named, OPT-IN bridge that reads both and feeds qualifying
   results into the Learning Service — the same "compose, don't mutate a
   pure engine" discipline dataset-import-center.js#doArchive already
   established for bridging Import Session facts into Archive.

   Safe to call from render-adjacent code (a repository-change listener, an
   Executive Briefing composition) because learning-service.js#recordPattern
   is idempotent-when-unchanged: a converged pattern set performs ZERO writes
   on repeat calls. Only a genuine change in support/confidence produces a
   new, dated Learning Event — see recordPattern()'s own header for why this
   is what makes it safe.

   DEPENDENCIES: knowledge/profiles/pattern-discovery-engine.js,
   ../../learning/services/learning-service.js (recordPattern).
   ============================================================ */

'use strict';

import { computePatternRecommendations, computeLearningPatterns } from '../profiles/pattern-discovery-engine.js';
import { PATTERN_TYPE, isCandidateRecommendation } from '../contracts/pattern-recommendation-contract.js';
import { recordPattern } from '../../learning/services/learning-service.js';

/** The minimum support a recommendation needs before it is worth
 *  remembering as organizational Learning — a single-sample "pattern" is
 *  noise, not memory. Recommendations below this bar are still returned by
 *  computePatternRecommendations()/computeLearningPatterns() themselves
 *  (this threshold governs recording, not discovery). */
const MIN_SUPPORT_TO_RECORD = 2;

/**
 * Reads every pattern (profile-derived AND Learning-derived) for a domain
 * and records the ones with real support as Learning Events. Returns the
 * recommendations unchanged — this is additive, never a replacement for
 * calling computePatternRecommendations()/computeLearningPatterns() directly
 * where only the read is wanted.
 * @param {string} domainType
 */
export function discoverAndRecordPatterns(domainType) {
  const profileDerived = computePatternRecommendations(domainType);
  const learningDerived = computeLearningPatterns(domainType);
  for (const rec of [...profileDerived, ...learningDerived]) {
    if (rec.evidence.supportCount < MIN_SUPPORT_TO_RECORD) continue;
    recordPattern({
      domainType: rec.domainType,
      patternType: rec.patternType,
      value: rec.value,
      evidence: rec.evidence,
    });
  }
  return { profileDerived, learningDerived };
}

export {
  computePatternRecommendations, computeLearningPatterns, PATTERN_TYPE, isCandidateRecommendation,
};
