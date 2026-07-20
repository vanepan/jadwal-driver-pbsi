/* body-graph-check.mjs — Phase 12.5.4, "Body Intelligence: Entity
   Relationship Graph".

   Verifies getNeighbors/getSubgraph/getGraphStats against synthetic
   fixture Entities + EntityRelationships (an Assignment linked to a
   Vehicle and a Driver) — no V1, no Firebase, no sensor involved.

   Deterministic.
   Run: node scripts/body-graph-check.mjs   (exit 0 = pass) */

import { generateEntityId } from '../js/v2/body/contracts/identity-contract.js';
import { ENTITY_STATE } from '../js/v2/body/contracts/entity-state-contract.js';
import { CAPABILITY, VISIBILITY, AI_CONTEXT_TAG } from '../js/v2/body/contracts/entity-vocabulary-contract.js';
import { makeEntityRelationship, ENTITY_RELATIONSHIP_TYPE } from '../js/v2/body/contracts/entity-relationship-contract.js';
import { setActiveRepository, create as entityCreate } from '../js/v2/body/repository/entity-repository.js';
import { create as relationshipCreate, resetRelationshipRepository } from '../js/v2/body/repository/relationship-repository.js';
import { getNeighbors, getSubgraph, getGraphStats } from '../js/v2/body/graph/entity-relationship-graph-engine.js';
import * as entityGraphService from '../js/v2/body/services/entity-graph-service.js';

let pass = 0; let fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); }
}

function fixtureEntity(entityType, sourceRef) {
  const now = new Date().toISOString();
  const id = generateEntityId({ entityType, sourceRef });
  return Object.freeze({
    id, version: 1, entityType, sourceRef,
    attributes: {}, observedState: ENTITY_STATE.ACTIVE, observedStateBasis: 'test',
    owner: { type: 'system', ref: 'test' }, capabilities: [CAPABILITY.ASSIGNABLE],
    relationshipIds: [], eventLogRef: id, lastHealthReportId: null, versionCount: 1,
    confidence: 1, observability: { sensorId: entityType, sensorVersion: 'test@1', observedAt: now, since: null },
    visibility: VISIBILITY.INTERNAL, aiContextTags: [AI_CONTEXT_TAG.OPERATIONAL],
    createdAt: now, updatedAt: now,
  });
}

setActiveRepository('memory');
resetRelationshipRepository();

const vehicle = fixtureEntity('vehicle', 'v1');
const driver = fixtureEntity('driver', 'd1');
const assignment = fixtureEntity('assignment', 'a1');
entityCreate(vehicle);
entityCreate(driver);
entityCreate(assignment);
relationshipCreate(makeEntityRelationship({
  id: 'rel-av', fromEntityId: assignment.id, toEntityId: vehicle.id,
  type: ENTITY_RELATIONSHIP_TYPE.ASSIGNED_TO_VEHICLE, derivedFrom: { sensorId: 'assignment', field: 'vehicle' },
}));
relationshipCreate(makeEntityRelationship({
  id: 'rel-ad', fromEntityId: assignment.id, toEntityId: driver.id,
  type: ENTITY_RELATIONSHIP_TYPE.ASSIGNED_TO_DRIVER, derivedFrom: { sensorId: 'assignment', field: 'driver' },
}));

console.log('\n[getNeighbors — one hop, resolved]');
{
  const result = getNeighbors(assignment.id);
  check('finds both edges from the assignment', result.ok && result.data.length === 2);
  check('each neighbor entry carries the FULL resolved Entity, not just an id', result.data.every((n) => n.neighbor && n.neighbor.id === n.neighborId));
  check('direction is correctly "outgoing" from the assignment side', result.data.every((n) => n.direction === 'outgoing'));
  const fromVehicleSide = getNeighbors(vehicle.id);
  check('the SAME edge is visible from the referenced side too, direction "incoming"', fromVehicleSide.ok && fromVehicleSide.data.length === 1 && fromVehicleSide.data[0].direction === 'incoming' && fromVehicleSide.data[0].neighborId === assignment.id);
  const scoped = getNeighbors(assignment.id, { relationshipType: ENTITY_RELATIONSHIP_TYPE.ASSIGNED_TO_DRIVER });
  check('relationshipType scoping filters correctly', scoped.ok && scoped.data.length === 1 && scoped.data[0].neighborId === driver.id);
  const isolated = getNeighbors('vehicle:no-such-entity');
  check('an entity with no edges returns an empty (not an error)', isolated.ok && isolated.data.length === 0);
}

console.log('\n[getSubgraph — bounded BFS, always requires a starting entity]');
{
  const sub = getSubgraph(assignment.id, { maxHops: 2 });
  check('reaches both neighbors within 2 hops', sub.ok && sub.data.nodes.length === 3 && sub.data.edges.length === 2);
  const sub1hop = getSubgraph(assignment.id, { maxHops: 1 });
  check('maxHops is a real bound, not decorative', sub1hop.ok && sub1hop.data.nodes.length === 3);
  const unknown = getSubgraph('vehicle:does-not-exist');
  check('an unknown root entity fails honestly rather than returning an empty subgraph', unknown.ok === false);
}

console.log('\n[getGraphStats — repository-wide tally]');
{
  const stats = getGraphStats();
  check('edgeCount reflects both relationships', stats.ok && stats.data.edgeCount === 2);
  check('nodeCount counts distinct entities touched by an edge', stats.data.nodeCount === 3);
  check('byRelationshipType breaks down correctly', stats.data.byRelationshipType[ENTITY_RELATIONSHIP_TYPE.ASSIGNED_TO_VEHICLE] === 1 && stats.data.byRelationshipType[ENTITY_RELATIONSHIP_TYPE.ASSIGNED_TO_DRIVER] === 1);
  const scopedStats = getGraphStats({ relationshipType: ENTITY_RELATIONSHIP_TYPE.ASSIGNED_TO_VEHICLE });
  check('relationshipType scoping narrows the tally', scopedStats.data.edgeCount === 1);
}

console.log('\n[entity-graph-service — pure delegation, same answers as the engine directly]');
{
  check('getNeighbors delegates identically', JSON.stringify(entityGraphService.getNeighbors(assignment.id)) === JSON.stringify(getNeighbors(assignment.id)));
  check('getGraphStats delegates identically', JSON.stringify(entityGraphService.getGraphStats()) === JSON.stringify(getGraphStats()));
}

console.log(`\n${pass}/${pass + fail} checks passed.`);
if (fail > 0) process.exit(1);
