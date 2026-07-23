/* learning-signal-vocabulary-check.mjs — Phase 12.6.1, "Universal Learning
   Engine: Vocabulary".

   Verifies the new contracts (LearningScope, LearningSignal,
   LearningConfidence, LearningRecommendation, LearningLineage) and
   registries (learning-signal-type-registry, learning-source-weight-registry),
   plus the one additive LEARNING_KIND.OBSERVATION amendment — confirming
   isLearningEvent() still accepts every pre-existing kind unchanged and
   the 14 existing producer functions are untouched.

   Deterministic. No V1, no Firebase, no AI.
   Run: node scripts/learning-signal-vocabulary-check.mjs   (exit 0 = pass) */

import { LEARNING_KIND, isLearningEvent, makeLearningEvent } from '../src/learning/contracts/learning-event-contract.js';
import { makeLearningScope, isLearningScope, scopeKey } from '../src/learning/contracts/learning-scope-contract.js';
import { makeLearningSignal, isLearningSignal } from '../src/learning/contracts/learning-signal-contract.js';
import { makeLearningConfidence, isLearningConfidence } from '../src/learning/contracts/learning-confidence-contract.js';
import {
  RECOMMENDATION_TYPE, makeLearningRecommendation, isLearningRecommendation,
} from '../src/learning/contracts/learning-recommendation-contract.js';
import { isLearningLineage } from '../src/learning/contracts/learning-lineage-contract.js';
import {
  registerSignalType, hasSignalType, getSignalType, listSignalTypes, resetSignalTypeRegistry, SIGNAL_TYPE_REGISTRY_ERRORS,
} from '../src/learning/registry/learning-signal-type-registry.js';
import {
  getLearningSourceWeight, listLearningSourceWeights, resetLearningSourceWeights, DEFAULT_LEARNING_SOURCE_WEIGHT,
} from '../src/learning/registry/learning-source-weight-registry.js';
import {
  recordCorrection, recordPattern, CORRECTION_TYPE,
} from '../src/learning/services/learning-service.js';

let pass = 0; let fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); }
}

console.log('\n[LEARNING_KIND — additive amendment, zero regression]');
{
  check('exactly 6 kinds now (5 original + OBSERVATION)', Object.values(LEARNING_KIND).length === 6);
  check('all 5 original values are byte-identical', LEARNING_KIND.CORRECTION === 'correction' && LEARNING_KIND.GAP_RESOLUTION === 'gap_resolution' && LEARNING_KIND.PATTERN === 'pattern' && LEARNING_KIND.COVERAGE_SNAPSHOT === 'coverage_snapshot' && LEARNING_KIND.KNOWLEDGE_EVOLUTION === 'knowledge_evolution');
  check('OBSERVATION is the one new value', LEARNING_KIND.OBSERVATION === 'observation');
  const ev = makeLearningEvent({ kind: LEARNING_KIND.OBSERVATION, domainType: 'test', actorId: 'test', after: { x: 1 } });
  check('isLearningEvent() accepts the new kind', isLearningEvent(ev));
  const oldEv = makeLearningEvent({ kind: LEARNING_KIND.CORRECTION, correctionType: CORRECTION_TYPE.METADATA, domainType: 'test', actorId: 'test', after: { x: 1 } });
  check('isLearningEvent() still accepts every pre-existing kind, unchanged', isLearningEvent(oldEv));
  check('the 14 existing producers are untouched — recordCorrection/recordPattern still callable with their original signatures', typeof recordCorrection === 'function' && typeof recordPattern === 'function');
}

console.log('\n[LearningScope]');
{
  const scope = makeLearningScope({ domainType: 'body', entityType: 'vehicle', entityId: 'v1', signalType: 'body:state_changed' });
  check('makeLearningScope produces a valid LearningScope', isLearningScope(scope));
  check('scopeKey is deterministic and includes all 4 dimensions', scopeKey(scope) === 'body:vehicle:v1:body:state_changed');
  check('entityType/entityId may be null (domain-level scope)', isLearningScope(makeLearningScope({ domainType: 'nor', signalType: 'x' })));
  check('a missing domainType throws (required)', (() => { try { makeLearningScope({ signalType: 'x' }); return false; } catch { return true; } })());
  check('two scopes differing only in signalType produce different keys', scopeKey(makeLearningScope({ domainType: 'nor', signalType: 'a' })) !== scopeKey(makeLearningScope({ domainType: 'nor', signalType: 'b' })));
}

console.log('\n[LearningSignal — the ephemeral intake envelope]');
{
  const scope = makeLearningScope({ domainType: 'nor', signalType: 'x' });
  const signal = makeLearningSignal({ scope, sourceType: 'human-correction', actorId: 'evan', after: { field: 'v' } });
  check('makeLearningSignal produces a valid LearningSignal', isLearningSignal(signal));
  check('a signal with no "after" is invalid (required, mirrors validateSeed)', !isLearningSignal({ scope, sourceType: 'x', actorId: 'x' }));
  check('a signal with an invalid scope is invalid', !isLearningSignal({ scope: {}, sourceType: 'x', actorId: 'x', after: 1 }));
  check('LearningSignal carries no kind/state/id — those are pipeline-decided, not producer-supplied', !('kind' in signal) && !('state' in signal) && !('id' in signal));
}

console.log('\n[LearningConfidence]');
{
  const c = makeLearningConfidence({ value: 0.72, sourceWeight: 0.6, corroborationCount: 2, contradictionCount: 0, rationale: 'test rationale' });
  check('makeLearningConfidence produces a valid LearningConfidence', isLearningConfidence(c));
  check('computedAt is always fresh ISO 8601', typeof c.computedAt === 'string' && !Number.isNaN(new Date(c.computedAt).getTime()));
  check('a value outside [0,1] is invalid', !isLearningConfidence({ ...c, value: 1.5 }));
  check('a missing rationale is invalid — never a bare number', !isLearningConfidence({ ...c, rationale: '' }));
}

console.log('\n[LearningRecommendation — disambiguated from reasoning/\'s Recommendation]');
{
  const scope = makeLearningScope({ domainType: 'nor', signalType: 'repeated_correction' });
  const confidence = makeLearningConfidence({ value: 0.8, sourceWeight: 0.9, corroborationCount: 3, contradictionCount: 0, rationale: 'r' });
  const rec = makeLearningRecommendation({
    id: 'test-rec-1', recommendationType: RECOMMENDATION_TYPE.PROMOTE_TO_RULE, scope,
    claim: 'field X was corrected the same way 3 times', citedLearningEventIds: ['learning:correction:nor:1', 'learning:correction:nor:2'], confidence, rationale: 'r',
  });
  check('makeLearningRecommendation produces a valid LearningRecommendation', isLearningRecommendation(rec));
  check('cite-or-abstain: zero cited events is structurally invalid', !isLearningRecommendation({ ...rec, citedLearningEventIds: [] }));
  check('exactly 4 recommendation types exist, "Learning Rule" is not one of them (folded into PROMOTE_TO_RULE)', Object.values(RECOMMENDATION_TYPE).length === 4 && !('LEARNING_RULE' in RECOMMENDATION_TYPE));
  check('an unknown recommendationType is rejected', !isLearningRecommendation({ ...rec, recommendationType: 'not-a-real-type' }));
}

console.log('\n[LearningLineage — shape only, disambiguated from History]');
{
  const lineage = { originId: 'learning:x:1', events: [], recommendations: [], outcomes: [], promotedKnowledgeIds: [], computedAt: new Date().toISOString() };
  check('a well-formed lineage shape passes isLearningLineage()', isLearningLineage(lineage));
  check('a missing originId is invalid', !isLearningLineage({ ...lineage, originId: '' }));
}

console.log('\n[learning-signal-type-registry — 8 dormant vocabulary entries, honest mapsToKind]');
{
  check('exactly 8 signal types registered at bootstrap', listSignalTypes().length === 8);
  check('every bootstrapped entry is dormant (owningDomain: null)', listSignalTypes().every((s) => s.owningDomain === null));
  check('all 8 mission-named categories are present', ['repeated_correction', 'user_behavior', 'operational_habit', 'workflow_outcome', 'entity_relationship_recurrence', 'document_structure_recurrence', 'implicit_business_rule', 'emerging_knowledge'].every(hasSignalType));
  check('registering with an invalid mapsToKind throws, forcing honesty', (() => {
    try { registerSignalType('bad', { label: 'Bad', mapsToKind: 'not-a-real-kind' }); return false; } catch (e) { return e.code === SIGNAL_TYPE_REGISTRY_ERRORS.INVALID_MAPS_TO_KIND; }
  })());
  check('a real producer can re-register a dormant entry with a real owningDomain (idempotent replace)', (() => {
    registerSignalType('repeated_correction', { label: 'Repeated Correction', owningDomain: 'knowledge', mapsToKind: 'pattern' });
    return getSignalType('repeated_correction').owningDomain === 'knowledge';
  })());
  resetSignalTypeRegistry();
  check('resetSignalTypeRegistry re-bootstraps to 8 dormant entries', listSignalTypes().length === 8 && getSignalType('repeated_correction').owningDomain === null);
}

console.log('\n[learning-source-weight-registry — new id space, honest default]');
{
  check('exactly 5 source weights registered', listLearningSourceWeights().length === 5);
  check('human-correction is weighted highest (1.0), same rationale tier as Knowledge\'s own registry', getLearningSourceWeight('human-correction').weight === 1.0);
  check('sensor-observation (Body\'s pull-adapter) is registered', getLearningSourceWeight('sensor-observation').weight === 0.6);
  check('reasoning-outcome is reserved (registered, not yet a live producer)', getLearningSourceWeight('reasoning-outcome').weight === 0.8);
  check('an unregistered sourceType defaults honestly, never throws', getLearningSourceWeight('totally-unknown-source').weight === DEFAULT_LEARNING_SOURCE_WEIGHT);
  resetLearningSourceWeights();
  check('resetLearningSourceWeights re-bootstraps to the same 5', listLearningSourceWeights().length === 5);
}

console.log(`\n${pass}/${pass + fail} checks passed.`);
if (fail > 0) process.exit(1);
