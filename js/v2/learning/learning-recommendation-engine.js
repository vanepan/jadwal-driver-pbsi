/* ============================================================
   LEARNING-RECOMMENDATION-ENGINE.JS — Universal Learning Engine (Phase 12.6.5)

   PURPOSE: computeRecommendations(partialScope) — a PURE, STATELESS query
   over accumulated LearningEvents, synthesizing standing, scope-level
   LearningRecommendations. Mirrors both Pattern Discovery's and
   reasoning-service.js's own "holds no repository — computed fresh every
   call" precedent. Never writes anything, never auto-applies anything —
   see contracts/learning-recommendation-contract.js's header for the
   governance rule this respects.

   Deliberately a reference implementation, same honesty as
   knowledge/learning/similarity-detection-engine.js calling its own
   Jaccard formula "one honest, generic reference metric" — this is
   ARCHITECTURE for the mission's named future-discovery categories
   (repeated corrections, recurring relationships, recurring document
   structures, implicit business rules, emerging knowledge), not machine
   learning. Every rule below is small, deterministic, exact-match or
   simple-threshold — no scoring model, no training, no AI.

   FOUR RULES, EACH CITING ONLY REAL, ALREADY-PERSISTED LearningEvents:
     PROMOTE_TO_RULE — within one group (same domainType+entityType+
       signalType, entityId ignored so the SAME fact recurring across
       DIFFERENT entities counts), the FACT (`after`) with the most
       independent agreeing events, once it reaches `minSupport`.
     FLAG_ANOMALY — within that SAME group, once a dominant fact exists,
       every OTHER (minority) fact bucket — a real, checkable deviation
       from the group's own established consensus.
     FLAG_FOR_REVIEW — events sharing the same non-null
       `affectedKnowledgeId`, once their count reaches `minSupport` — a
       specific KnowledgeItem keeps recurring in Learning Signals.
     MERGE_CANDIDATE — pairs of events in DIFFERENT scopes whose `after`
       values are highly similar (learning-signal-similarity-engine.js,
       Phase 12.6.3) — candidates for a human to consider unifying.

   RESPONSIBILITY: computeRecommendations(partialScope, opts).

   DEPENDENCIES: contracts/{learning-scope,learning-recommendation,
   learning-confidence}-contract.js, contracts/learning-event-contract.js
   (isTerminalLearningState), learning-signal-similarity-engine.js,
   learning-confidence-engine.js, services/learning-service.js
   (listLearningEvents — read-only).

   NON-GOALS: only considers events carrying a structured `evidence.scope`
   — i.e. events that flowed through learning-signal-service.js#
   emitLearningSignal(). Pre-Phase-12.6 events (recordCorrection etc.)
   have no `evidence.scope` and are honestly excluded rather than
   guessed at — see this file's own filter. Never calls
   knowledge-service.js#promoteKnowledge() or any write path — see
   services/learning-outcome-service.js for the human-gated boundary this
   engine's output feeds into.

   KNOWN LIMITATION (documented, not hidden): MERGE_CANDIDATE's pairwise
   comparison is O(N^2) over the domainType-scoped event pool — acceptable
   at this platform's current, pre-any-real-producer data volumes (this
   phase ships zero live callers), but a real future volume would need the
   same exact-key-bucket discipline archive-relationship-engine.js already
   uses instead of pairwise scanning. Not built now — no real producer
   exists yet to make the cost real.
   ============================================================ */

'use strict';

import { isLearningScope, scopeKey } from './contracts/learning-scope-contract.js';
import { RECOMMENDATION_TYPE, makeLearningRecommendation } from './contracts/learning-recommendation-contract.js';
import { isTerminalLearningState } from './contracts/learning-event-contract.js';
import { computeSignalSimilarity } from './learning-signal-similarity-engine.js';
import { computeSignalConfidence } from './learning-confidence-engine.js';
import { listLearningEvents } from './services/learning-service.js';

const DEFAULT_MIN_SUPPORT = 3;
const DEFAULT_SIMILARITY_THRESHOLD = 0.7;

function groupKey(scope) {
  return `${scope.domainType}:${scope.entityType || ''}:${scope.signalType}`;
}

function confidenceFor(supportCount, opposingCount = 0) {
  // 'pattern-discovery' — mechanically derived from repeated observation,
  // the same source-weight tier knowledge/'s own registry gives its
  // "extraction" weight (see registry/learning-source-weight-registry.js).
  return computeSignalConfidence({ sourceType: 'pattern-discovery' }, { corroborationCount: supportCount, contradictionCount: opposingCount });
}

function relevantEvents(partialScope) {
  const result = listLearningEvents({ domainType: partialScope.domainType });
  if (!result.ok) return [];
  return result.data
    .filter((e) => !isTerminalLearningState(e.state))
    .filter((e) => e.evidence && isLearningScope(e.evidence.scope))
    .filter((e) => !partialScope.entityType || e.evidence.scope.entityType === partialScope.entityType)
    .filter((e) => !partialScope.signalType || e.evidence.scope.signalType === partialScope.signalType);
}

/**
 * @param {{domainType: string, entityType?: string|null, signalType?: string|null}} partialScope
 * @param {{minSupport?: number, similarityThreshold?: number}} [opts]
 * @returns {import('./contracts/learning-recommendation-contract.js').LearningRecommendation[]}
 */
export function computeRecommendations(partialScope, opts = {}) {
  const minSupport = opts.minSupport ?? DEFAULT_MIN_SUPPORT;
  const similarityThreshold = opts.similarityThreshold ?? DEFAULT_SIMILARITY_THRESHOLD;
  const events = relevantEvents(partialScope);
  const recommendations = [];

  // ── PROMOTE_TO_RULE + FLAG_ANOMALY ──
  const groups = new Map();
  for (const e of events) {
    const gk = groupKey(e.evidence.scope);
    if (!groups.has(gk)) groups.set(gk, []);
    groups.get(gk).push(e);
  }
  for (const groupEvents of groups.values()) {
    const byFact = new Map();
    for (const e of groupEvents) {
      const factKey = JSON.stringify(e.after);
      if (!byFact.has(factKey)) byFact.set(factKey, []);
      byFact.get(factKey).push(e);
    }
    const sortedBuckets = [...byFact.values()].sort((a, b) => b.length - a.length);
    const [dominant, ...minorities] = sortedBuckets;
    if (dominant && dominant.length >= minSupport) {
      const scope = dominant[0].evidence.scope;
      const gk = groupKey(scope);
      recommendations.push(makeLearningRecommendation({
        id: `learning-recommendation:${RECOMMENDATION_TYPE.PROMOTE_TO_RULE}:${gk}`,
        recommendationType: RECOMMENDATION_TYPE.PROMOTE_TO_RULE,
        scope,
        claim: `The same fact ${JSON.stringify(dominant[0].after)} was independently observed ${dominant.length} time(s) for (${gk}).`,
        citedLearningEventIds: dominant.map((e) => e.id),
        confidence: confidenceFor(dominant.length, 0),
        rationale: `${dominant.length} of ${groupEvents.length} events in this group agree — >= minSupport (${minSupport}).`,
      }));
      for (const minority of minorities) {
        const mScope = minority[0].evidence.scope;
        recommendations.push(makeLearningRecommendation({
          id: `learning-recommendation:${RECOMMENDATION_TYPE.FLAG_ANOMALY}:${scopeKey(mScope)}:${JSON.stringify(minority[0].after)}`,
          recommendationType: RECOMMENDATION_TYPE.FLAG_ANOMALY,
          scope: mScope,
          claim: `${minority.length} event(s) report ${JSON.stringify(minority[0].after)}, deviating from this group's established consensus (${JSON.stringify(dominant[0].after)}, ${dominant.length} agreeing).`,
          citedLearningEventIds: minority.map((e) => e.id),
          confidence: confidenceFor(dominant.length, minority.length),
          rationale: `A consensus of ${dominant.length} exists in (${gk}); these ${minority.length} disagree.`,
        }));
      }
    }
  }

  // ── FLAG_FOR_REVIEW ──
  const byKnowledgeId = new Map();
  for (const e of events) {
    if (!e.affectedKnowledgeId) continue;
    if (!byKnowledgeId.has(e.affectedKnowledgeId)) byKnowledgeId.set(e.affectedKnowledgeId, []);
    byKnowledgeId.get(e.affectedKnowledgeId).push(e);
  }
  for (const [knowledgeId, related] of byKnowledgeId) {
    if (related.length < minSupport) continue;
    recommendations.push(makeLearningRecommendation({
      id: `learning-recommendation:${RECOMMENDATION_TYPE.FLAG_FOR_REVIEW}:${knowledgeId}`,
      recommendationType: RECOMMENDATION_TYPE.FLAG_FOR_REVIEW,
      scope: related[0].evidence.scope,
      claim: `KnowledgeItem "${knowledgeId}" is the affectedKnowledgeId of ${related.length} recorded Learning Events.`,
      citedLearningEventIds: related.map((e) => e.id),
      confidence: confidenceFor(related.length, 0),
      rationale: `${related.length} events reference this KnowledgeItem — >= minSupport (${minSupport}).`,
    }));
  }

  // ── MERGE_CANDIDATE (pairwise across DIFFERENT scopes — see this
  //    file's KNOWN LIMITATION note in the header) ──
  for (let i = 0; i < events.length; i += 1) {
    for (let j = i + 1; j < events.length; j += 1) {
      const a = events[i]; const b = events[j];
      if (scopeKey(a.evidence.scope) === scopeKey(b.evidence.scope)) continue; // same-scope handled above
      const { score } = computeSignalSimilarity(a.after, b.after);
      if (score < similarityThreshold) continue;
      recommendations.push(makeLearningRecommendation({
        id: `learning-recommendation:${RECOMMENDATION_TYPE.MERGE_CANDIDATE}:${a.id}:${b.id}`,
        recommendationType: RECOMMENDATION_TYPE.MERGE_CANDIDATE,
        scope: a.evidence.scope,
        claim: `Events "${a.id}" and "${b.id}" report similar facts (similarity ${score.toFixed(2)}) in different scopes.`,
        citedLearningEventIds: [a.id, b.id],
        confidence: confidenceFor(2, 0),
        rationale: `Jaccard similarity ${score.toFixed(2)} >= threshold ${similarityThreshold}.`,
      }));
    }
  }

  return recommendations;
}
