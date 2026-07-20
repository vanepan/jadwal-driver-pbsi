/* body-context-check.mjs — Phase 12.5.6, "Body Intelligence: AI Body
   Context + Services Barrel".

   Verifies buildBodyContext()'s composition against synthetic fixtures
   (no V1, no Firebase, no sensor), and that services/index.js's
   namespaced barrel imports cleanly in plain Node — proving it stays as
   Firebase-free as body-sensing-service.js alone, since it deliberately
   re-exports no sensor.

   Deterministic.
   Run: node scripts/body-context-check.mjs   (exit 0 = pass) */

import { generateEntityId } from '../js/v2/body/contracts/identity-contract.js';
import { ENTITY_STATE } from '../js/v2/body/contracts/entity-state-contract.js';
import { CAPABILITY, VISIBILITY, AI_CONTEXT_TAG } from '../js/v2/body/contracts/entity-vocabulary-contract.js';
import { makeEntityRelationship, ENTITY_RELATIONSHIP_TYPE } from '../js/v2/body/contracts/entity-relationship-contract.js';
import { makeBodyEvent, BODY_EVENT_TYPE } from '../js/v2/body/contracts/body-event-contract.js';
import { setActiveRepository, create as entityCreate } from '../js/v2/body/repository/entity-repository.js';
import { create as relationshipCreate, resetRelationshipRepository } from '../js/v2/body/repository/relationship-repository.js';
import { append as eventAppend, resetBodyEventRepository } from '../js/v2/body/repository/body-event-repository.js';
import { buildBodyContext } from '../js/v2/body/context/body-context-builder.js';
import * as bodyServices from '../js/v2/body/services/index.js';

let pass = 0; let fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); }
}

function fixtureEntity(entityType, sourceRef, attributes, observedAt) {
  const id = generateEntityId({ entityType, sourceRef });
  return Object.freeze({
    id, version: 1, entityType, sourceRef,
    attributes, observedState: ENTITY_STATE.ACTIVE, observedStateBasis: 'test',
    owner: { type: 'system', ref: 'test' }, capabilities: [CAPABILITY.ASSIGNABLE],
    relationshipIds: [], eventLogRef: id, lastHealthReportId: null, versionCount: 1,
    confidence: 1, observability: { sensorId: entityType, sensorVersion: 'test@1', observedAt, since: null },
    visibility: VISIBILITY.INTERNAL, aiContextTags: [AI_CONTEXT_TAG.OPERATIONAL],
    createdAt: observedAt, updatedAt: observedAt,
  });
}

console.log('\n[buildBodyContext — domain-less graceful degradation]');
{
  const empty = buildBodyContext({});
  check('an unscoped call returns an honest, empty context — never a guess', empty.entityType === null && empty.entities.length === 0 && empty.relationships.length === 0);
  check('explain.asOf and builtAt are always present, even when empty', typeof empty.explain.asOf === 'string' && typeof empty.builtAt === 'string');
}

setActiveRepository('memory');
resetRelationshipRepository();
resetBodyEventRepository();

const now = new Date().toISOString();
const vehicle = fixtureEntity('vehicle', 'v1', { name: 'Avanza 1' }, now);
const driver = fixtureEntity('driver', 'd1', { name: 'Budi' }, now);
const assignment = fixtureEntity('assignment', 'a1', { date: '2026-07-20' }, now);
entityCreate(vehicle);
entityCreate(driver);
entityCreate(assignment);
relationshipCreate(makeEntityRelationship({ id: 'rel-av', fromEntityId: assignment.id, toEntityId: vehicle.id, type: ENTITY_RELATIONSHIP_TYPE.ASSIGNED_TO_VEHICLE, derivedFrom: { sensorId: 'assignment', field: 'vehicle' } }));
relationshipCreate(makeEntityRelationship({ id: 'rel-ad', fromEntityId: assignment.id, toEntityId: driver.id, type: ENTITY_RELATIONSHIP_TYPE.ASSIGNED_TO_DRIVER, derivedFrom: { sensorId: 'assignment', field: 'driver' } }));
eventAppend(makeBodyEvent({ type: BODY_EVENT_TYPE.ENTITY_OBSERVED, entityId: assignment.id, entityType: 'assignment', sensorId: 'assignment' }));

console.log('\n[buildBodyContext({entityType}) — scoped composition]');
{
  const ctx = buildBodyContext({ entityType: 'assignment' });
  check('resolves the entity of the scoped type', ctx.entities.length === 1 && ctx.entities[0].id === assignment.id);
  check('resolves BOTH relationship edges from that entity (via the graph)', ctx.relationships.length === 2);
  check('resolves a real EntityHealthReport per entity (observability-only, no raw record at this layer)', ctx.health.length === 1 && ctx.health[0].entityId === assignment.id);
  check('resolves recent events for that entity', ctx.recentEvents.length === 1 && ctx.recentEvents[0].entityId === assignment.id);
  check('explain.sensorsQueried names the real sensor', ctx.explain.sensorsQueried.includes('assignment'));
}

console.log('\n[buildBodyContext({entityIds}) — explicit id scoping across types]');
{
  const ctx = buildBodyContext({ entityIds: [vehicle.id, driver.id] });
  check('resolves exactly the 2 requested entities, no more', ctx.entities.length === 2 && ctx.entities.every((e) => [vehicle.id, driver.id].includes(e.id)));
  check('relationships are DEDUPED across entities (the same edge is visible from both endpoints, counted once)', ctx.relationships.filter((r) => r.id === 'rel-av').length === 1);
  check('an unresolvable id is silently skipped, not an error for the whole call', buildBodyContext({ entityIds: ['vehicle:does-not-exist', vehicle.id] }).entities.length === 1);
}

console.log('\n[buildBodyContext — never a citation source; purely descriptive fields only]');
{
  const ctx = buildBodyContext({ entityType: 'vehicle' });
  check('entity fields are strictly descriptive (id/entityType/observedState/attributes/confidence) — no generated prose, no recommendation, no rule', Object.keys(ctx.entities[0]).sort().join(',') === 'attributes,confidence,entityType,id,observedState');
}

console.log('\n[services/index.js — namespaced barrel, deliberately sensor-free, Firebase-free]');
{
  check('exposes all 5 namespaces', ['entities', 'sensing', 'graph', 'health', 'context'].every((k) => k in bodyServices));
  check('entities namespace really is entity-service.js (has observeEntity)', typeof bodyServices.entities.observeEntity === 'function');
  check('sensing namespace really is body-sensing-service.js (has senseEntityType)', typeof bodyServices.sensing.senseEntityType === 'function');
  check('graph namespace really is entity-graph-service.js (has getSubgraph)', typeof bodyServices.graph.getSubgraph === 'function');
  check('health namespace really is entity-health-service.js (has computeEntityHealth)', typeof bodyServices.health.computeEntityHealth === 'function');
  check('context namespace really is body-context-builder.js (has buildBodyContext)', typeof bodyServices.context.buildBodyContext === 'function');
  check('this whole barrel imported cleanly in plain Node — proof it stays Firebase-free despite bundling sensing', true);
}

console.log(`\n${pass}/${pass + fail} checks passed.`);
if (fail > 0) process.exit(1);
