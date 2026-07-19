/* ============================================================
   PATTERN-RECOMMENDATION-CONTRACT.JS — Pattern Discovery Foundation (V2.1)

   PURPOSE: fix the shape of a Candidate Recommendation — deterministic
   statistical evidence over Approved Knowledge (recipient/signatory/CC/
   attachment/approval-chain/vocabulary/paragraph frequency, rule
   confidence, relationship confidence), explicitly NEVER an automatic
   Organizational Profile change (that only ever happens through the
   Profile Override draft -> review -> approve pipeline, contracts/
   ../profiles/overrides/*). A recommendation is read-only output a human
   reviews and may explicitly turn into an override draft.

   RESPONSIBILITY: define PATTERN_TYPE and CandidateRecommendation, plus a
   structural validator.

   DEPENDENCIES: contracts/profile-contract.js (PROFILE_TYPE, spread — the
   seven profile-derived categories reuse the exact same type ids so a
   recommendation's patternType lines up 1:1 with a PROFILE_TYPE where one
   exists).

   NON-GOALS: does not compute anything (see
   profiles/pattern-discovery-engine.js). No AI, no machine learning model
   — every number here is a deterministic count/mean over repository data.
   ============================================================ */

'use strict';

import { PROFILE_TYPE } from './profile-contract.js';

export const PATTERN_RECOMMENDATION_SCHEMA = 'pattern-recommendation@1';

/** The ten profile-derived categories (reusing PROFILE_TYPE ids exactly —
 *  including WRITING_STYLE, already real since profile-contract.js: a
 *  `kind:'writing_style'` KnowledgeItem grouped by buildProfile() like any
 *  other profile category) plus statistical dimensions with no profile
 *  counterpart: two computed over Knowledge relationships (unchanged since
 *  V2.1), and two added in Phase 5 (Part 6, "Pattern Discovery must consume
 *  Learning Service") computed over the Learning domain instead — "Repeated
 *  corrections" and "Repeated organizational decisions" are facts about the
 *  platform's OWN correction/approval history, not about Approved Knowledge
 *  content, so they need a genuinely different source (learning-service.js,
 *  never a repository directly — see profiles/pattern-discovery-engine.js#
 *  computeLearningPatterns).
 *
 *  Phase 11, Sprint 11.5 ("Organizational Writing Intelligence") adds a
 *  SECOND evidence source into this SAME pre-existing WRITING_STYLE id —
 *  never a new PATTERN_TYPE member: profile-engine.js's own reads Approved
 *  historical documents' extracted writing_style Knowledge, while
 *  pattern-discovery-engine.js's new writingStyleRecommendations() reads
 *  LIVE reviewer wording corrections (semantic-diff-engine.js's
 *  opening_phrase/closing_phrase/wording_change classifications). Both
 *  legitimately answer "what is PBSI's preferred writing style" from two
 *  different real sources; a caller filtering by patternType ===
 *  PATTERN_TYPE.WRITING_STYLE sees recommendations from both. */
export const PATTERN_TYPE = Object.freeze({
  ...PROFILE_TYPE,
  RULE_CONFIDENCE: 'rule_confidence',
  RELATIONSHIP_CONFIDENCE: 'relationship_confidence',
  RECURRING_CORRECTION: 'recurring_correction',
  RECURRING_DECISION: 'recurring_decision',
});

/**
 * @typedef {Object} RecommendationEvidence
 * @property {number} supportCount        - how many Approved items/relationships back this recommendation
 * @property {number} confidence          - 0-1
 * @property {string[]} affectedDocumentIds - KnowledgeItem ids contributing evidence
 */

/**
 * @typedef {Object} CandidateRecommendation
 * @property {string} domainType
 * @property {string} patternType   - one of PATTERN_TYPE
 * @property {string} value         - the recommended value/subject (a ProfileEntry.value, an item id, or a relationship type label)
 * @property {RecommendationEvidence} evidence
 * @property {string} suggestedAction - a human-readable hint, e.g. "Pin this recipient" — never auto-applied
 * @property {string} computedAt
 */

export function makeCandidateRecommendation({ domainType, patternType, value, evidence, suggestedAction }) {
  return Object.freeze({
    domainType, patternType, value,
    evidence: Object.freeze({ ...evidence, affectedDocumentIds: Object.freeze([...(evidence.affectedDocumentIds || [])]) }),
    suggestedAction, computedAt: new Date().toISOString(),
  });
}

export function isCandidateRecommendation(r) {
  return !!r && typeof r === 'object'
    && typeof r.domainType === 'string' && r.domainType.length > 0
    && Object.values(PATTERN_TYPE).includes(r.patternType)
    && typeof r.value === 'string' && r.value.length > 0
    && !!r.evidence && typeof r.evidence === 'object'
    && typeof r.evidence.supportCount === 'number' && r.evidence.supportCount >= 0
    && typeof r.evidence.confidence === 'number' && r.evidence.confidence >= 0 && r.evidence.confidence <= 1
    && Array.isArray(r.evidence.affectedDocumentIds);
}
