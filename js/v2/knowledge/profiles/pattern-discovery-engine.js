/* ============================================================
   PATTERN-DISCOVERY-ENGINE.JS — Pattern Discovery Foundation (V2.1)

   PURPOSE: "the platform begins collecting statistical evidence from
   Approved organizational knowledge" — a pure report, mirroring
   machine-learning/confidence-engine.js's and profiles/profile-engine.js's
   NON-GOALS discipline exactly: NEVER writes anything, NEVER modifies an
   Organizational Profile. Every recommendation carries explainable
   evidence (support count, confidence, affected documents) — a human
   decides whether to turn one into a Profile Override draft (see
   profiles/overrides/profile-override-engine.js#createOverrideDraft).

   No AI. No machine learning model. Only deterministic statistical
   analysis over repository data:
   - Seven categories (recipient/signatory/CC/attachment/approval-chain/
     vocabulary/paragraph frequency) are NOT recomputed here — they reuse
     profile-engine.js#buildProfile()'s own already-computed ProfileEntry
     {value, sampleCount, frequency, confidence, evidence} verbatim,
     reframed into a CandidateRecommendation. Zero new statistics.
   - Rule confidence reuses machine-learning/confidence-engine.js#
     suggestConfidence() unchanged (source weight + corroboration).
   - Relationship confidence is the one genuinely new, small aggregation:
     groups `kind:'relationship'` KnowledgeItems by their payload.type and
     averages `confidence` per group.

   RESPONSIBILITY: computePatternRecommendations(domainType).

   DEPENDENCIES: profiles/profile-engine.js (buildProfile, unchanged),
   machine-learning/confidence-engine.js (suggestConfidence, unchanged),
   contracts/dependency-graph-contract.js (RELATIONSHIP_TYPE),
   repository/knowledge-repository.js (list, reused), contracts/
   pattern-recommendation-contract.js.
   ============================================================ */

'use strict';

import { buildProfile, listProfileTypes } from './profile-engine.js';
import { suggestConfidence } from '../machine-learning/confidence-engine.js';
import { RELATIONSHIP_TYPE } from '../contracts/dependency-graph-contract.js';
import { LIFECYCLE_STATE } from '../contracts/lifecycle-contract.js';
import { list } from '../repository/knowledge-repository.js';
import { PATTERN_TYPE, makeCandidateRecommendation } from '../contracts/pattern-recommendation-contract.js';

const RULE_LIKE_KINDS = Object.freeze(['rule', 'policy']);

function round2(n) {
  return Math.round(n * 100) / 100;
}

/** Reframes buildProfile()'s already-computed entries — zero new math. */
function fromProfileEntries(domainType, profileType) {
  const result = buildProfile(domainType, profileType);
  if (!result.ok || !result.profile) return [];
  return result.profile.entries.map((entry) => makeCandidateRecommendation({
    domainType,
    patternType: profileType,
    value: entry.value,
    evidence: {
      supportCount: entry.sampleCount,
      confidence: entry.confidence,
      affectedDocumentIds: entry.evidence.map((e) => e.itemId),
    },
    suggestedAction: `Pin "${entry.value}" as the organization's ${profileType} preference (sampleCount=${entry.sampleCount}, confidence=${entry.confidence}).`,
  }));
}

function ruleConfidenceRecommendations(domainType) {
  const recommendations = [];
  for (const kind of RULE_LIKE_KINDS) {
    const result = list({ domainType, kind, lifecycleState: LIFECYCLE_STATE.APPROVED });
    if (!result.ok) continue;
    for (const item of result.data) {
      const suggestion = suggestConfidence(item);
      if (!suggestion.ok) continue;
      recommendations.push(makeCandidateRecommendation({
        domainType,
        patternType: PATTERN_TYPE.RULE_CONFIDENCE,
        value: item.id,
        evidence: {
          supportCount: suggestion.corroborationCount,
          confidence: suggestion.suggestedConfidence,
          affectedDocumentIds: [item.id],
        },
        suggestedAction: suggestion.rationale,
      }));
    }
  }
  return recommendations;
}

function relationshipConfidenceRecommendations(domainType) {
  const result = list({ domainType, kind: 'relationship' });
  if (!result.ok) return [];

  const byType = new Map();
  for (const item of result.data) {
    const type = item.payload && item.payload.type;
    if (!Object.values(RELATIONSHIP_TYPE).includes(type)) continue;
    if (!byType.has(type)) byType.set(type, []);
    byType.get(type).push(item);
  }

  return [...byType.entries()].map(([type, items]) => makeCandidateRecommendation({
    domainType,
    patternType: PATTERN_TYPE.RELATIONSHIP_CONFIDENCE,
    value: type,
    evidence: {
      supportCount: items.length,
      confidence: round2(items.reduce((s, i) => s + i.confidence, 0) / items.length),
      affectedDocumentIds: items.map((i) => i.id),
    },
    suggestedAction: `${items.length} "${type}" relationship(s) found among Knowledge in domain "${domainType}".`,
  }));
}

/**
 * Deterministic statistical evidence over Approved Knowledge — never
 * written anywhere, never auto-applied to an Organizational Profile.
 * @param {string} domainType
 * @returns {import('../contracts/pattern-recommendation-contract.js').CandidateRecommendation[]}
 */
export function computePatternRecommendations(domainType) {
  const recommendations = [];
  for (const profileType of listProfileTypes()) {
    recommendations.push(...fromProfileEntries(domainType, profileType));
  }
  recommendations.push(...ruleConfidenceRecommendations(domainType));
  recommendations.push(...relationshipConfidenceRecommendations(domainType));
  return Object.freeze(recommendations);
}
