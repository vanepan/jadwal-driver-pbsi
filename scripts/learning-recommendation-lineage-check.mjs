/* learning-recommendation-lineage-check.mjs — Phase 12.6.5, "Universal
   Learning Engine: Recommendation + Outcome + Lineage".

   Verifies computeRecommendations()'s four rules (PROMOTE_TO_RULE,
   FLAG_ANOMALY, FLAG_FOR_REVIEW, MERGE_CANDIDATE) against fixture
   LearningEvents built entirely through emitLearningSignal(),
   recordLearningOutcome()'s governance (bare-id, never verifies,
   collision-safe targetKey), and traceLineage()'s end-to-end composition.

   Deterministic.
   Run: node scripts/learning-recommendation-lineage-check.mjs   (exit 0 = pass) */

import { emitLearningSignal } from '../js/v2/learning/services/learning-signal-service.js';
import { computeRecommendations } from '../js/v2/learning/learning-recommendation-engine.js';
import { RECOMMENDATION_TYPE, isLearningRecommendation } from '../js/v2/learning/contracts/learning-recommendation-contract.js';
import {
  recordLearningOutcome, OUTCOME_DECISION, OUTCOME_RESULT,
} from '../js/v2/learning/services/learning-outcome-service.js';
import { traceLineage } from '../js/v2/learning/learning-lineage-engine.js';
import { findLearningEvent } from '../js/v2/learning/services/learning-service.js';

let pass = 0; let fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); }
}

console.log('\n[PROMOTE_TO_RULE — a fact recurring across DIFFERENT entities reaches minSupport]');
{
  const domainType = `rec-check-promote-${Date.now()}`;
  const entities = ['e1', 'e2', 'e3'];
  const results = entities.map((entityId) => emitLearningSignal({
    domainType, entityType: 'fixture', entityId, signalType: 'recurring-fact',
    sourceType: 'sensor-observation', actorId: 'a', after: { verdict: 'stable' },
  }));
  check('all 3 signals persisted as genuinely new events (different entities = different scope)', results.every((r) => r.ok && r.op === 'create'));

  const recs = computeRecommendations({ domainType, signalType: 'recurring-fact' }, { minSupport: 3 });
  const promote = recs.find((r) => r.recommendationType === RECOMMENDATION_TYPE.PROMOTE_TO_RULE);
  check('a PROMOTE_TO_RULE recommendation emerges once 3 independent entities agree', !!promote && isLearningRecommendation(promote));
  check('it cites all 3 real events, cite-or-abstain', promote.citedLearningEventIds.length === 3 && promote.citedLearningEventIds.every((id) => findLearningEvent(id).ok));
  check('below minSupport (e.g. 4), no recommendation emerges for only 3 observations', computeRecommendations({ domainType, signalType: 'recurring-fact' }, { minSupport: 4 }).filter((r) => r.recommendationType === RECOMMENDATION_TYPE.PROMOTE_TO_RULE).length === 0);
}

console.log('\n[FLAG_ANOMALY — a minority disagreeing with an established group consensus]');
{
  const domainType = `rec-check-anomaly-${Date.now()}`;
  ['e1', 'e2', 'e3'].forEach((entityId) => emitLearningSignal({
    domainType, entityType: 'fixture', entityId, signalType: 'consensus-fact',
    sourceType: 'sensor-observation', actorId: 'a', after: { state: 'normal' },
  }));
  emitLearningSignal({
    domainType, entityType: 'fixture', entityId: 'e4', signalType: 'consensus-fact',
    sourceType: 'sensor-observation', actorId: 'a', after: { state: 'DEVIANT' },
  });

  const recs = computeRecommendations({ domainType, signalType: 'consensus-fact' }, { minSupport: 3 });
  const anomaly = recs.find((r) => r.recommendationType === RECOMMENDATION_TYPE.FLAG_ANOMALY);
  check('a FLAG_ANOMALY recommendation emerges for the minority once a consensus exists', !!anomaly);
  check('it cites only the deviating event, not the consensus', anomaly.citedLearningEventIds.length === 1);
  check('its claim names both the deviation and the consensus it deviates from (built only from real data)', anomaly.claim.includes('DEVIANT') && anomaly.claim.includes('normal'));
}

console.log('\n[FLAG_FOR_REVIEW — repeated affectedKnowledgeId across events]');
{
  const domainType = `rec-check-review-${Date.now()}`;
  const knowledgeId = 'knowledge:fixture:1';
  ['e1', 'e2', 'e3'].forEach((entityId) => emitLearningSignal({
    domainType, entityType: 'fixture', entityId, signalType: 'kb-touch',
    sourceType: 'human-correction', actorId: 'a', after: { note: `touch-${entityId}` }, affectedKnowledgeId: knowledgeId,
  }));
  const recs = computeRecommendations({ domainType }, { minSupport: 3 });
  const review = recs.find((r) => r.recommendationType === RECOMMENDATION_TYPE.FLAG_FOR_REVIEW);
  check('a FLAG_FOR_REVIEW recommendation emerges once a KnowledgeItem is touched >= minSupport times', !!review);
  check('its claim names the real KnowledgeItem id', review.claim.includes(knowledgeId));
}

console.log('\n[MERGE_CANDIDATE — similar facts across different scopes]');
{
  const domainType = `rec-check-merge-${Date.now()}`;
  emitLearningSignal({ domainType, entityType: 'fixture', entityId: 'm1', signalType: 'type-a', sourceType: 'human-correction', actorId: 'a', after: { field: 'title', value: 'Permohonan' } });
  emitLearningSignal({ domainType, entityType: 'fixture', entityId: 'm2', signalType: 'type-b', sourceType: 'human-correction', actorId: 'a', after: { field: 'title', value: 'Permohonan' } });
  const recs = computeRecommendations({ domainType }, { minSupport: 99, similarityThreshold: 0.5 });
  const merge = recs.find((r) => r.recommendationType === RECOMMENDATION_TYPE.MERGE_CANDIDATE);
  check('a MERGE_CANDIDATE recommendation emerges for cross-scope similar facts, independent of minSupport', !!merge);
  check('it cites exactly the 2 similar events', merge.citedLearningEventIds.length === 2);
}

console.log('\n[recordLearningOutcome — governance: bare id, never verified, collision-safe]');
{
  const domainType = `rec-check-outcome-${Date.now()}`;
  ['e1', 'e2', 'e3'].forEach((entityId) => emitLearningSignal({
    domainType, entityType: 'fixture', entityId, signalType: 'outcome-fact',
    sourceType: 'sensor-observation', actorId: 'a', after: { v: 1 },
  }));
  const [rec] = computeRecommendations({ domainType, signalType: 'outcome-fact' }, { minSupport: 3 });
  check('a recommendation exists to record an outcome against', !!rec);

  const bad = recordLearningOutcome({ recommendation: rec, actorId: 'evan', decision: 'not-a-real-decision' });
  check('an invalid decision is refused', bad.ok === false);

  const outcome1 = recordLearningOutcome({ recommendation: rec, actorId: 'evan', decision: OUTCOME_DECISION.ACCEPTED, result: OUTCOME_RESULT.CONFIRMED, promotedKnowledgeId: 'knowledge:fixture:promoted-1' });
  check('a valid outcome is recorded through the real ledger', outcome1.ok);
  check('promotedKnowledgeId is stored VERBATIM, never verified/resolved (bare-id discipline)', outcome1.data.after.promotedKnowledgeId === 'knowledge:fixture:promoted-1');

  // A SECOND, DIFFERENT recommendation's outcome for a sibling entity in
  // the SAME domainType must not collide with the first (see the
  // targetKey fix in learning-outcome-service.js).
  emitLearningSignal({ domainType, entityType: 'fixture', entityId: 'e9', signalType: 'other-fact', sourceType: 'human-correction', actorId: 'a', after: { v: 2 }, affectedKnowledgeId: 'k9' });
  emitLearningSignal({ domainType, entityType: 'fixture', entityId: 'e10', signalType: 'other-fact', sourceType: 'human-correction', actorId: 'a', after: { v: 2 }, affectedKnowledgeId: 'k9' });
  emitLearningSignal({ domainType, entityType: 'fixture', entityId: 'e11', signalType: 'other-fact', sourceType: 'human-correction', actorId: 'a', after: { v: 2 }, affectedKnowledgeId: 'k9' });
  const [otherRec] = computeRecommendations({ domainType }, { minSupport: 3 }).filter((r) => r.recommendationType === 'flag_for_review');
  const outcome2 = recordLearningOutcome({ recommendation: otherRec, actorId: 'evan', decision: OUTCOME_DECISION.REJECTED });
  check('a second outcome for a DIFFERENT recommendation does not collide with/supersede the first', outcome2.ok && outcome2.data.id !== outcome1.data.id && findLearningEvent(outcome1.data.id).data.state !== 'historical');
}

console.log('\n[traceLineage — composes explainLearningEvent + Recommendation + Outcome, never re-walks chains]');
{
  const domainType = `rec-check-lineage-${Date.now()}`;
  const results = ['e1', 'e2', 'e3'].map((entityId) => emitLearningSignal({
    domainType, entityType: 'fixture', entityId, signalType: 'lineage-fact',
    sourceType: 'sensor-observation', actorId: 'a', after: { v: 'traceable' },
  }));
  const originId = results[0].data.id;

  const lineage = traceLineage(originId);
  check('traceLineage succeeds for a real event', lineage.ok);
  check('events includes the real supersession chain (a single-version event: itself)', lineage.data.events.some((e) => e.id === originId));
  const rec = lineage.data.recommendations.find((r) => r.recommendationType === RECOMMENDATION_TYPE.PROMOTE_TO_RULE);
  check('the real PROMOTE_TO_RULE recommendation citing this event is found', !!rec);

  recordLearningOutcome({ recommendation: rec, actorId: 'evan', decision: OUTCOME_DECISION.ACCEPTED, result: OUTCOME_RESULT.CONFIRMED, promotedKnowledgeId: 'knowledge:fixture:lineage-promoted' });
  const lineageAfterOutcome = traceLineage(originId);
  check('the outcome now appears in the lineage', lineageAfterOutcome.data.outcomes.length === 1);
  check('the promoted KnowledgeItem id is surfaced, deduped', lineageAfterOutcome.data.promotedKnowledgeIds.includes('knowledge:fixture:lineage-promoted'));

  const unknownLineage = traceLineage('learning:observation:does-not-exist:1');
  check('an unknown event id fails honestly rather than fabricating an empty lineage', unknownLineage.ok === false);
}

console.log(`\n${pass}/${pass + fail} checks passed.`);
if (fail > 0) process.exit(1);
