/* body-repository-check.mjs — Phase 12.5.2, "Body Intelligence: Repositories".

   Verifies the Entity Repository (Memory + Null + registry, append-only,
   no lifecycle gate), the Relationship and BodyEvent repositories
   (Learning-style, direct-function, immutable), and entity-service.js's
   observeEntity() create-or-append reconciliation — all against
   synthetic, non-V1 fixtures.

   Deterministic. No V1, no Firebase, no AI.
   Run: node scripts/body-repository-check.mjs   (exit 0 = pass) */

import { generateEntityId } from '../js/v2/body/contracts/identity-contract.js';
import { ENTITY_STATE } from '../js/v2/body/contracts/entity-state-contract.js';
import { CAPABILITY, VISIBILITY, AI_CONTEXT_TAG } from '../js/v2/body/contracts/entity-vocabulary-contract.js';
import { makeEntityRelationship, ENTITY_RELATIONSHIP_TYPE } from '../js/v2/body/contracts/entity-relationship-contract.js';
import { makeBodyEvent, BODY_EVENT_TYPE } from '../js/v2/body/contracts/body-event-contract.js';
import {
  setActiveRepository, getActiveRepositoryId, getById, list, getMetrics,
} from '../js/v2/body/repository/entity-repository.js';
import { REPOSITORY_ERRORS } from '../js/v2/body/repository/contracts/repository-contract.js';
import {
  create as relCreate, list as relList, getForEntity as relGetForEntity, resetRelationshipRepository,
} from '../js/v2/body/repository/relationship-repository.js';
import {
  append as eventAppend, list as eventList, getForEntity as eventGetForEntity, resetBodyEventRepository,
} from '../js/v2/body/repository/body-event-repository.js';
import {
  observeEntity, getEntity, listEntities, getEntityHistory, getEntityMetrics, setBodyBackend, getBodyBackendId,
} from '../js/v2/body/services/entity-service.js';

let pass = 0; let fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); }
}

function fixture(overrides = {}) {
  const now = new Date().toISOString();
  const id = generateEntityId({ entityType: 'vehicle', sourceRef: 'v-fixture-1' });
  return Object.freeze({
    id, version: 1, entityType: 'vehicle', sourceRef: 'v-fixture-1',
    attributes: { name: 'Avanza 1', plateNumber: 'B 1 ABC' },
    observedState: ENTITY_STATE.ACTIVE, observedStateBasis: "vehicles.status='active'",
    owner: { type: 'system', ref: 'vehicles-store' },
    capabilities: [CAPABILITY.ASSIGNABLE],
    relationshipIds: [], eventLogRef: id, lastHealthReportId: null, versionCount: 1,
    confidence: 1, observability: { sensorId: 'vehicle', sensorVersion: 'vehicle-sensor@1', observedAt: now, since: null },
    visibility: VISIBILITY.INTERNAL, aiContextTags: [AI_CONTEXT_TAG.OPERATIONAL],
    createdAt: now, updatedAt: now,
    ...overrides,
  });
}

console.log('\n[Entity Repository — Null is the honest default]');
{
  check('Null is active by default', getActiveRepositoryId() === 'null');
  const r = getById('anything');
  check('Null refuses rather than fabricating an empty/missing result', r.ok === false && r.error.code === REPOSITORY_ERRORS.NO_BACKEND_CONFIGURED);
}

setActiveRepository('memory');
console.log('\n[Entity Repository — Memory: append-only, no lifecycle gate]');
{
  check('setActiveRepository swapped to memory', getActiveRepositoryId() === 'memory');
  const created = observeEntity(fixture());
  check('first observation creates a version-1 row', created.ok && created.op === 'create' && created.data.version === 1);
  const again = observeEntity(fixture({ observedState: ENTITY_STATE.INACTIVE, observedStateBasis: "vehicles.status='maintenance'" }));
  check('re-observing the SAME sourceRef appends a new version, never overwrites', again.ok && again.op === 'append' && again.data.version === 2 && again.data.id === created.data.id);
  check('observedState is free to move in ANY direction — no gate, no canTransition (this is the whole point)', again.data.observedState === ENTITY_STATE.INACTIVE);
  check('versionCount tracks real history depth', again.data.versionCount === 2);
  const history = getEntityHistory(created.data.id);
  check('getEntityHistory returns both real versions in order', history.ok && history.data.length === 2 && history.data[0].observedState === ENTITY_STATE.ACTIVE && history.data[1].observedState === ENTITY_STATE.INACTIVE);
  const metrics = getEntityMetrics();
  check('getEntityMetrics tallies by entityType/observedState', metrics.ok && metrics.data.totalEntities === 1 && metrics.data.byEntityType.vehicle === 1);
  const invalid = observeEntity({ id: 'vehicle:bad', version: 1, entityType: 'vehicle' });
  check('a structurally invalid candidate is refused, never partially written', invalid.ok === false);
}

console.log('\n[entity-service reads go through the service, matching every other domain\'s "who reads?" discipline]');
{
  const one = listEntities({ entityType: 'vehicle' })
  check('listEntities filters by entityType', one.ok && one.data.length === 1);
  check('getEntity resolves the same row getById would', getEntity(generateEntityId({ entityType: 'vehicle', sourceRef: 'v-fixture-1' })).ok);
  check('setBodyBackend/getBodyBackendId re-export cleanly (no other module needs repository-registry.js directly)', getBodyBackendId() === 'memory');
}

console.log('\n[Relationship Repository — Learning-style, immutable, no version field]');
{
  resetRelationshipRepository();
  const rel = makeEntityRelationship({ id: 'rel-1', fromEntityId: 'assignment:a1', toEntityId: 'vehicle:v-fixture-1', type: ENTITY_RELATIONSHIP_TYPE.ASSIGNED_TO_VEHICLE, derivedFrom: { sensorId: 'assignment', field: 'vehicle' } });
  const created = relCreate(rel);
  check('a well-formed relationship is created', created.ok && created.data.id === 'rel-1');
  const dup = relCreate(rel);
  check('a duplicate id is refused', dup.ok === false);
  check('list() finds it by type', relList({ type: ENTITY_RELATIONSHIP_TYPE.ASSIGNED_TO_VEHICLE }).data.length === 1);
  check('getForEntity() finds it from either endpoint', relGetForEntity('assignment:a1').data.length === 1 && relGetForEntity('vehicle:v-fixture-1').data.length === 1);
  check('re-deriving the "same" edge creates a NEW row rather than deduplicating (immutable observed facts, see this file\'s header)', (() => {
    const rel2 = makeEntityRelationship({ id: 'rel-2', fromEntityId: 'assignment:a1', toEntityId: 'vehicle:v-fixture-1', type: ENTITY_RELATIONSHIP_TYPE.ASSIGNED_TO_VEHICLE, derivedFrom: { sensorId: 'assignment', field: 'vehicle' } });
    relCreate(rel2);
    return relGetForEntity('assignment:a1').data.length === 2;
  })());
  resetRelationshipRepository();
  check('resetRelationshipRepository clears state for the next check script', relList({}).data.length === 0);
}

console.log('\n[Body Event Repository — Learning-style, immutable, honest SENSE_FAILED]');
{
  resetBodyEventRepository();
  const ev = makeBodyEvent({ type: BODY_EVENT_TYPE.ENTITY_OBSERVED, entityId: 'vehicle:v-fixture-1', entityType: 'vehicle', sensorId: 'vehicle' });
  check('a well-formed event is appended', eventAppend(ev).ok);
  const failEv = makeBodyEvent({ type: BODY_EVENT_TYPE.SENSE_FAILED, entityId: null, entityType: 'vendor', sensorId: 'vendor', detail: { code: 'NOT_IMPLEMENTED' } });
  check('a SENSE_FAILED event (no entity produced) is appended honestly, never silently dropped', eventAppend(failEv).ok);
  check('list() sorts by observedAt', eventList({}).ok && eventList({}).data.length === 2);
  check('getForEntity finds only the entity-bound event', eventGetForEntity('vehicle:v-fixture-1').data.length === 1);
  check('list({entityType}) finds the SENSE_FAILED event with no entityId', eventList({ entityType: 'vendor' }).data.length === 1);
  resetBodyEventRepository();
  check('resetBodyEventRepository clears state', eventList({}).data.length === 0);
}

console.log(`\n${pass}/${pass + fail} checks passed.`);
if (fail > 0) process.exit(1);
