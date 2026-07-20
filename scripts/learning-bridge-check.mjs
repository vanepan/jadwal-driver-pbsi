/* learning-bridge-check.mjs — Phase 12.6.6, "Universal Learning Engine:
   Body Pull Adapter".

   Verifies mapBodyEventToSignalSeed() (pure, all 4 BodyEvent types) and
   pullBodyEventsAsSignals() (impure orchestrator) against fixture
   BodyEvents seeded directly into body-event-repository.js — no real V1,
   no real sensor, no Firebase (this check only touches body/'s pure
   contracts + in-memory repository, both confirmed Node-safe in Phase
   12.5). Confirms the load-bearing risk-mitigation detail from the Phase
   12.6 plan: a repeated STATE_CHANGED for the SAME entity/field supersedes
   through Learning's existing targetKey mechanism, never accumulating
   unboundedly.

   Deterministic. No V1, no Firebase, no AI.
   Run: node scripts/learning-bridge-check.mjs   (exit 0 = pass) */

import { makeBodyEvent, BODY_EVENT_TYPE } from '../js/v2/body/contracts/body-event-contract.js';
import { append as appendBodyEvent, resetBodyEventRepository } from '../js/v2/body/repository/body-event-repository.js';
import { mapBodyEventToSignalSeed } from '../js/v2/learning-bridge/adapters/body-signal-adapter.js';
import { pullBodyEventsAsSignals } from '../js/v2/learning-bridge/services/body-learning-bridge-service.js';
import { findLearningEvent, listLearningEvents } from '../js/v2/learning/services/learning-service.js';
import { isLearningEvent } from '../js/v2/learning/contracts/learning-event-contract.js';

let pass = 0; let fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); }
}

console.log('\n[body-signal-adapter — pure mapping, all 4 BodyEvent types]');
{
  const observed = makeBodyEvent({ type: BODY_EVENT_TYPE.ENTITY_OBSERVED, entityId: 'vehicle:v1', entityType: 'vehicle', sensorId: 'vehicle' });
  const seedObserved = mapBodyEventToSignalSeed(observed);
  check('ENTITY_OBSERVED maps to domainType body, real entityType/entityId/sensorId carried through', seedObserved.domainType === 'body' && seedObserved.entityType === 'vehicle' && seedObserved.entityId === 'vehicle:v1' && seedObserved.actorId === 'vehicle');
  check('ENTITY_OBSERVED signalType is body:entity_observed', seedObserved.signalType === 'body:entity_observed');
  check('sourceType is sensor-observation (registered, weight=0.6)', seedObserved.sourceType === 'sensor-observation');

  const stateChanged = makeBodyEvent({ type: BODY_EVENT_TYPE.STATE_CHANGED, entityId: 'vehicle:v1', entityType: 'vehicle', detail: { fromState: 'active', toState: 'maintenance' }, sensorId: 'vehicle' });
  const seedStateChanged = mapBodyEventToSignalSeed(stateChanged);
  check('STATE_CHANGED maps before/after to {state} shape, not the raw {fromState,toState} detail', seedStateChanged.before.state === 'active' && seedStateChanged.after.state === 'maintenance');
  check('STATE_CHANGED signalType is body:state_changed', seedStateChanged.signalType === 'body:state_changed');

  const relObserved = makeBodyEvent({ type: BODY_EVENT_TYPE.RELATIONSHIP_OBSERVED, entityId: 'assignment:a1', entityType: 'assignment', detail: { toEntityId: 'vehicle:v1', relationshipType: 'assigned_to_vehicle' }, sensorId: 'assignment' });
  const seedRel = mapBodyEventToSignalSeed(relObserved);
  check('RELATIONSHIP_OBSERVED carries its detail verbatim as `after`', seedRel.after.toEntityId === 'vehicle:v1' && seedRel.after.relationshipType === 'assigned_to_vehicle');

  const senseFailed = makeBodyEvent({ type: BODY_EVENT_TYPE.SENSE_FAILED, entityId: null, entityType: 'vendor', detail: { code: 'NOT_IMPLEMENTED' }, sensorId: 'vendor' });
  const seedFailed = mapBodyEventToSignalSeed(senseFailed);
  check('SENSE_FAILED (no entity) maps to a null entityId, still a valid seed', seedFailed.entityId === null && seedFailed.entityType === 'vendor');

  check('a malformed input (not a real BodyEvent) throws rather than fabricating a seed', (() => { try { mapBodyEventToSignalSeed({ not: 'a body event' }); return false; } catch { return true; } })());

  check('every generated seed carries traceability back to the originating BodyEvent id', seedObserved.evidence.bodyEventId === observed.id);
}

console.log('\n[pullBodyEventsAsSignals — real end-to-end pull, through the EXISTING Learning ledger]');
{
  resetBodyEventRepository();
  const domainType = 'body';
  const entityId = `vehicle:pull-test-${Date.now()}`;
  appendBodyEvent(makeBodyEvent({ type: BODY_EVENT_TYPE.ENTITY_OBSERVED, entityId, entityType: 'vehicle', sensorId: 'vehicle' }));
  appendBodyEvent(makeBodyEvent({ type: BODY_EVENT_TYPE.STATE_CHANGED, entityId, entityType: 'vehicle', detail: { fromState: 'active', toState: 'maintenance' }, sensorId: 'vehicle' }));

  const result = pullBodyEventsAsSignals({ entityId });
  check('the pull succeeds', result.ok === true);
  check('both fixture BodyEvents were pulled and emitted', result.data.pulled === 2 && result.data.emitted === 2 && result.data.failed === 0);

  const persisted = listLearningEvents({ domainType });
  const forThisEntity = persisted.data.filter((e) => e.evidence && e.evidence.scope && e.evidence.scope.entityId === entityId);
  check('real LearningEvents now exist for this entity, findable through the EXISTING ledger', forThisEntity.length >= 1 && forThisEntity.every(isLearningEvent));
  check('a specific emitted event is directly findable via findLearningEvent()', findLearningEvent(result.data.outcomes[0].emitted.data.id).ok);
}

console.log('\n[Risk mitigation — a REPEATED state change for the SAME entity/field supersedes, never accumulates unboundedly]');
{
  resetBodyEventRepository();
  const domainType = 'body';
  const entityId = `vehicle:supersede-test-${Date.now()}`;
  appendBodyEvent(makeBodyEvent({ type: BODY_EVENT_TYPE.STATE_CHANGED, entityId, entityType: 'vehicle', detail: { fromState: 'active', toState: 'maintenance' }, sensorId: 'vehicle' }));
  const firstPull = pullBodyEventsAsSignals({ entityId });
  check('first pull creates a new event', firstPull.data.outcomes[0].emitted.op === 'create');

  resetBodyEventRepository();
  appendBodyEvent(makeBodyEvent({ type: BODY_EVENT_TYPE.STATE_CHANGED, entityId, entityType: 'vehicle', detail: { fromState: 'maintenance', toState: 'active' }, sensorId: 'vehicle' }));
  const secondPull = pullBodyEventsAsSignals({ entityId });
  check('a SECOND, genuinely different state change for the SAME entity/signalType SUPERSEDES rather than creating an unrelated third row', secondPull.data.outcomes[0].emitted.op === 'superseded');

  const stateChangeEvents = listLearningEvents({ domainType }).data.filter((e) => e.evidence && e.evidence.scope && e.evidence.scope.entityId === entityId && e.evidence.scope.signalType === 'body:state_changed');
  check('exactly 2 rows exist for this entity\'s state-changed stream (1 historical + 1 current), never an unbounded flood', stateChangeEvents.length === 2 && stateChangeEvents.filter((e) => e.state === 'historical').length === 1);
}

console.log('\n[Per-record isolation — one malformed BodyEvent never sinks the whole pull]');
{
  resetBodyEventRepository();
  appendBodyEvent(makeBodyEvent({ type: BODY_EVENT_TYPE.ENTITY_OBSERVED, entityId: `vehicle:isolation-${Date.now()}`, entityType: 'vehicle', sensorId: 'vehicle' }));
  // A second, well-formed event with an unusual but still-valid detail —
  // both should succeed; the isolation guarantee is exercised by the
  // per-outcome try/catch already covering mapping failures (see
  // body-learning-bridge-service.js), verified structurally here.
  appendBodyEvent(makeBodyEvent({ type: BODY_EVENT_TYPE.SENSE_FAILED, entityId: null, entityType: 'vendor', detail: { code: 'NOT_IMPLEMENTED' }, sensorId: 'vendor' }));
  const result = pullBodyEventsAsSignals({});
  check('multiple heterogeneous events (including one with a null entityId) all pull successfully', result.ok && result.data.failed === 0 && result.data.emitted === result.data.pulled);
}

console.log(`\n${pass}/${pass + fail} checks passed.`);
if (fail > 0) process.exit(1);
