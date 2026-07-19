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

   PHASE 5, PART 6 — "PATTERN DISCOVERY MUST CONSUME LEARNING SERVICE. NOT
   REPOSITORIES." computePatternRecommendations() above is UNCHANGED — it
   still reads only Approved Knowledge, still writes nothing, still makes no
   new statistic. Its own NON-GOALS promise is kept exactly as it was.

   computeLearningPatterns() below is the genuinely NEW, ADDITIVE capability
   the mission asks for: "Repeated corrections" and "Repeated organizational
   decisions" are facts about the platform's OWN correction/approval
   history, which does not live in Approved Knowledge at all — it lives in
   the Learning domain. So this function reads learning-service.js directly
   (never learning-repository.js, never any other repository) — exactly the
   "consume the Service, not a repository" instruction, satisfied by
   construction rather than by discipline.

   PHASE 11, SPRINT 11.5 — "ORGANIZATIONAL WRITING INTELLIGENCE." A third
   producer, writingStyleRecommendations(), was added to
   computeLearningPatterns() below: recurring reviewer wording/phrasing
   preferences (semantic-diff-engine.js's opening_phrase/closing_phrase/
   wording_change classifications), reusing the identical recurring-count
   evidence shape RECURRING_CORRECTION already established. See that
   function's own comment for the full rationale and the one dimension
   ("per organizational unit") deliberately left unimplemented.

   RESPONSIBILITY: computePatternRecommendations(domainType),
   computeLearningPatterns(domainType).

   DEPENDENCIES: profiles/profile-engine.js (buildProfile, unchanged),
   machine-learning/confidence-engine.js (suggestConfidence, unchanged),
   contracts/dependency-graph-contract.js (RELATIONSHIP_TYPE),
   services/knowledge-service.js (list, reused), contracts/
   pattern-recommendation-contract.js, ../../learning/services/
   learning-service.js (knowledge/ may depend on learning/ — see that
   file's header for the full layering rationale).
   ============================================================ */

'use strict';

import { buildProfile, listProfileTypes } from './profile-engine.js';
import { suggestConfidence } from '../machine-learning/confidence-engine.js';
import { RELATIONSHIP_TYPE } from '../contracts/dependency-graph-contract.js';
import { LIFECYCLE_STATE } from '../contracts/lifecycle-contract.js';
import {
  listKnowledge as list,
} from '../services/knowledge-service.js';
import { PATTERN_TYPE, makeCandidateRecommendation } from '../contracts/pattern-recommendation-contract.js';
import { listLearningEvents, LEARNING_KIND } from '../../learning/services/learning-service.js';

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

const RECURRING_THRESHOLD = 2; // a single occurrence is an event, not yet a pattern

/** Part 6 — "Repeated corrections": CORRECTION-kind Learning Events grouped
 *  by their target (the same document/knowledge/override corrected more than
 *  once). `supportCount` is the real number of distinct correction
 *  occasions recorded for that target (the supersession-chain length —
 *  learning-service.js's own design), never estimated. */
function recurringCorrectionRecommendations(domainType) {
  const result = listLearningEvents({ kind: LEARNING_KIND.CORRECTION, domainType });
  if (!result.ok) return [];
  const byTarget = new Map();
  for (const e of result.data) {
    // `targetKey` (not `e.id`) is what identifies "the same target" across
    // occasions — every event has its own unique id by construction, so
    // falling back to `e.id` here would put every correction in its own
    // group of one and this pattern could never fire. Same key ordering
    // organizational-memory-engine.js#computeCorrectionFrequencies uses.
    const key = e.affectedKnowledgeId || e.sourceDocumentId || e.targetKey;
    if (!key) continue;
    if (!byTarget.has(key)) byTarget.set(key, { key, count: 0, correctionType: e.correctionType, eventIds: [] });
    const entry = byTarget.get(key);
    entry.count += 1;
    entry.eventIds.push(e.id);
  }
  return [...byTarget.values()]
    .filter((x) => x.count >= RECURRING_THRESHOLD)
    .map((x) => makeCandidateRecommendation({
      domainType,
      patternType: PATTERN_TYPE.RECURRING_CORRECTION,
      value: x.key,
      evidence: { supportCount: x.count, confidence: round2(Math.min(1, x.count / 5)), affectedDocumentIds: x.eventIds },
      suggestedAction: `"${x.key}" telah dikoreksi ${x.count} kali (${x.correctionType}) — pertimbangkan memperbaiki sumbernya, bukan mengoreksi berulang.`,
    }));
}

/** Part 6 — "Repeated organizational decisions": KNOWLEDGE_EVOLUTION events
 *  (Approvals) grouped by who decided. A real, recurring reviewer for a
 *  domain is itself an organizational fact — never an inference about their
 *  judgment quality, only a count of how often they have been the one to
 *  decide. */
function recurringDecisionRecommendations(domainType) {
  const result = listLearningEvents({ kind: LEARNING_KIND.KNOWLEDGE_EVOLUTION, domainType });
  if (!result.ok) return [];
  const byActor = new Map();
  for (const e of result.data) {
    if (!byActor.has(e.actorId)) byActor.set(e.actorId, { actorId: e.actorId, count: 0, eventIds: [] });
    const entry = byActor.get(e.actorId);
    entry.count += 1;
    entry.eventIds.push(e.id);
  }
  return [...byActor.values()]
    .filter((x) => x.count >= RECURRING_THRESHOLD)
    .map((x) => makeCandidateRecommendation({
      domainType,
      patternType: PATTERN_TYPE.RECURRING_DECISION,
      value: x.actorId,
      evidence: { supportCount: x.count, confidence: round2(Math.min(1, x.count / 5)), affectedDocumentIds: x.eventIds },
      suggestedAction: `${x.actorId} telah menyetujui ${x.count} pengetahuan di domain ini — reviewer tetap untuk domain ini.`,
    }));
}

// Sprint 11.5 (Organizational Writing Intelligence) — "HOW PBSI writes",
// not only WHAT. Only these three semantic-diff-engine.js diffNature
// values are a wording/phrasing preference; quantity_correction is a FACT
// correction (a document-specific value, never a style choice), and the
// structural ones are a section appearing/disappearing, not a rewording.
const WRITING_STYLE_DIFF_NATURES = Object.freeze(['opening_phrase', 'closing_phrase', 'wording_change']);

/** Groups CORRECTION Learning Events that carry a semantic-diff wording
 *  classification (attached by section-learning-bridge.js, computed by
 *  semantic-diff-engine.js — see that file's own header) by (field,
 *  preferredValue), and surfaces a preference once it has real recurring
 *  support. `field` is this platform's real "document family" dimension —
 *  a NOR's own fieldSchema slot (e.g. a letterhead "perihal" line, or a
 *  shared `pattern:<id>` citation reused across documents) is already
 *  scoped to one domainType/one document family by construction; grouping
 *  by domainType (the outer loop, same as every other producer here) plus
 *  field is exactly "per NOR Type, per document family" without inventing
 *  a new dimension. NOTE: "per organizational unit" (Sprint 11.5's third
 *  named dimension) is deliberately NOT implemented — ComposerDocument's
 *  own contract (composer-document-contract.js) carries no organizational-
 *  unit field today, so grouping by one would fabricate a dimension this
 *  codebase's data model does not actually have. Flagged here as a real
 *  gap needing a product decision (does a NOR carry a requesting unit at
 *  all?), not silently implemented either way.
 *
 *  Reuses the EXACT SAME recurring-count evidence shape and confidence
 *  formula (min(1, count/5)) as recurringCorrectionRecommendations/
 *  recurringDecisionRecommendations above — a wording choice repeated
 *  across enough real reviewer edits IS a recurring organizational
 *  decision, structurally identical to a repeated correction, not a
 *  reason to invent a second formula. */
function writingStyleRecommendations(domainType) {
  const result = listLearningEvents({ kind: LEARNING_KIND.CORRECTION, domainType });
  if (!result.ok) return [];
  const byFieldValue = new Map();
  for (const e of result.data) {
    const diff = e.evidence && e.evidence.semanticDiff;
    if (!diff || !WRITING_STYLE_DIFF_NATURES.includes(diff.diffNature)) continue;
    const field = e.evidence.field;
    const preferredValue = e.after && typeof e.after === 'object' ? e.after[field] : null;
    if (typeof preferredValue !== 'string' || !preferredValue) continue;
    const key = `${field}::${preferredValue}`;
    if (!byFieldValue.has(key)) byFieldValue.set(key, { field, preferredValue, diffNature: diff.diffNature, count: 0, eventIds: [] });
    const entry = byFieldValue.get(key);
    entry.count += 1;
    entry.eventIds.push(e.id);
  }
  return [...byFieldValue.values()]
    .filter((x) => x.count >= RECURRING_THRESHOLD)
    .map((x) => makeCandidateRecommendation({
      domainType,
      patternType: PATTERN_TYPE.WRITING_STYLE,
      value: `${x.field}:${x.preferredValue}`,
      evidence: { supportCount: x.count, confidence: round2(Math.min(1, x.count / 5)), affectedDocumentIds: x.eventIds },
      suggestedAction: `Reviewer memilih "${x.preferredValue}" untuk bagian "${x.field}" sebanyak ${x.count} kali (${x.diffNature}) — pertimbangkan menjadikannya gaya penulisan baku organisasi untuk domain "${domainType}".`,
    }));
}

/**
 * Part 6 — patterns that emerge from the platform's OWN accepted
 * organizational learning (corrections, decisions), read through the
 * Learning Service — never a repository, never Approved Knowledge content.
 * Deterministic, same as computePatternRecommendations(): every number is a
 * real count over real Learning Events, nothing scored or guessed.
 * @param {string} domainType
 */
export function computeLearningPatterns(domainType) {
  return Object.freeze([
    ...recurringCorrectionRecommendations(domainType),
    ...recurringDecisionRecommendations(domainType),
    ...writingStyleRecommendations(domainType),
  ]);
}
