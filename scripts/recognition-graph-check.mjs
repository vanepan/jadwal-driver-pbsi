/* recognition-graph-check.mjs — Phase 12.7.5, "Relationship Discovery".

   Verifies: discoverRelationshipsFromClusters() emits one honest
   CO_CLUSTERED relationship per unique member pair (never a richer,
   unverified label); recognition-graph-engine.js's getNeighbors/
   getSubgraph/getGraphStats correctly traverse a genuinely MIXED
   node-type graph (the one thing neither of the two pre-existing,
   node-type-specific graph engines in this codebase can do); getSubgraph
   is bounded (never an unscoped whole-graph walk) and cycle-safe;
   graph-service.js persists discovered relationships with a symmetric,
   deterministic id so re-discovery reconciles rather than duplicates.

   Deterministic. No V1, no Firebase, no AI.
   Run: node scripts/recognition-graph-check.mjs   (exit 0 = pass) */

import {
  discoverRelationshipsFromClusters, CO_CLUSTERED_RELATIONSHIP_TYPE,
} from '../js/v2/recognition/graph/relationship-discovery-engine.js';
import { getNeighbors, getSubgraph, getGraphStats } from '../js/v2/recognition/graph/recognition-graph-engine.js';
import { recordDiscoveredRelationships } from '../js/v2/recognition/services/graph-service.js';
import { resetRepositoryRegistry } from '../js/v2/recognition/repository/repository-registry.js';
import { setActiveRepository } from '../js/v2/recognition/repository/recognition-repository.js';
import { recordObservation, getRecognitionHistory } from '../js/v2/recognition/services/recognition-service.js';
import { RECORD_TYPE } from '../js/v2/recognition/contracts/recognition-record-contract.js';
import { makeRecognitionScope } from '../js/v2/recognition/contracts/recognition-scope-contract.js';
import { hasRelationshipType } from '../js/v2/recognition/registry/recognition-relationship-type-registry.js';

let pass = 0; let fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); }
}

const now = new Date().toISOString();
function fixtureCluster(memberScopeKeys, overrides = {}) {
  return Object.freeze({
    id: `cluster:test:${memberScopeKeys.join('|')}`,
    version: 1,
    recordType: 'cluster',
    payload: { clusterType: 'test', memberScopeKeys, representativeScopeKey: memberScopeKeys[0] },
    confidence: 0.75,
    evidence: [],
    provenance: { producerId: 'test', computedAt: now },
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

console.log('\n[Registry — CO_CLUSTERED is real, additive vocabulary]');
{
  check('CO_CLUSTERED is registered', hasRelationshipType('CO_CLUSTERED'));
  check('the pre-existing 5 relationship types are unchanged', ['SAME_VENDOR', 'SAME_TEMPLATE', 'SAME_DEPARTMENT', 'SAME_WORKFLOW', 'RECURRING_PARTICIPANT'].every(hasRelationshipType));
}

console.log('\n[discoverRelationshipsFromClusters — honest, cite-or-abstain]');
{
  const cluster = fixtureCluster(['a', 'b', 'c']);
  const discovered = discoverRelationshipsFromClusters([cluster]);
  check('a 3-member cluster produces exactly 3 unique pairs (a-b, a-c, b-c)', discovered.length === 3);
  check('every discovered relationship is honestly labeled CO_CLUSTERED, never a guessed richer type', discovered.every((d) => d.payload.relationshipType === CO_CLUSTERED_RELATIONSHIP_TYPE));
  check('every discovered relationship cites the real cluster as evidence', discovered.every((d) => d.evidence[0].itemId === cluster.id));
  check('no relationship names the same scope as both ends', discovered.every((d) => d.payload.fromScopeKey !== d.payload.toScopeKey));

  const noClusters = discoverRelationshipsFromClusters([]);
  check('no clusters -> no relationships (never fabricated)', noClusters.length === 0);

  const nonClusterRecord = { recordType: 'signature', payload: {} };
  const wrongType = discoverRelationshipsFromClusters([nonClusterRecord]);
  check('a non-cluster record is safely ignored, never mistaken for a cluster', wrongType.length === 0);
}

console.log('\n[recognition-graph-engine.js — a genuinely MIXED node-type graph]');
{
  resetRepositoryRegistry();
  setActiveRepository('memory');
  // Simulates a KnowledgeItem scope, a Body Entity scope, and an
  // ArchiveRecord scope all appearing in ONE graph — the one thing
  // neither knowledge-graph-engine.js nor entity-relationship-graph-
  // engine.js can do (each is hardcoded to one node type).
  const scopeA = makeRecognitionScope({ domainType: 'nor', entityId: 'doc-1' });
  const scopeB = makeRecognitionScope({ domainType: 'vehicle', entityId: 'veh-1' });
  const scopeC = makeRecognitionScope({ domainType: 'archive', entityId: 'arc-1' });
  const { scopeKey } = await import('../js/v2/recognition/contracts/recognition-scope-contract.js');
  const kA = scopeKey(scopeA); const kB = scopeKey(scopeB); const kC = scopeKey(scopeC);

  function directRelationship(id, from, to, type = 'CO_CLUSTERED') {
    recordObservation(Object.freeze({
      id,
      version: 1,
      recordType: RECORD_TYPE.RELATIONSHIP,
      scope: makeRecognitionScope({ domainType: 'recognition-relationship', entityType: type }),
      payload: { relationshipType: type, fromScopeKey: from, toScopeKey: to },
      confidence: 0.8,
      evidence: [],
      provenance: { producerId: 'test', computedAt: now },
      createdAt: now,
      updatedAt: now,
    }));
  }
  directRelationship('rel-1', kA, kB);
  directRelationship('rel-2', kB, kC);

  const neighborsOfA = getNeighbors(kA);
  check('getNeighbors finds a real cross-domain edge (KnowledgeItem scope -> vehicle Entity scope)', neighborsOfA.some((n) => n.neighborScopeKey === kB));

  const subgraph = getSubgraph(kA, { maxHops: 2 });
  check('getSubgraph reaches a 2-hop MIXED-domain node (nor -> vehicle -> archive)', subgraph.nodes.includes(kC));
  check('getSubgraph never exceeds the requested maxHops', subgraph.nodes.length === 3);

  const boundedSubgraph = getSubgraph(kA, { maxHops: 1 });
  check('a maxHops:1 request genuinely stops after 1 hop (archive scope not reached)', !boundedSubgraph.nodes.includes(kC));

  const stats = getGraphStats({});
  check('getGraphStats tallies real edge/node counts from persisted relationships', stats.edgeCount === 2 && stats.nodeCount === 3);
}

console.log('\n[getSubgraph — cycle-safe]');
{
  resetRepositoryRegistry();
  setActiveRepository('memory');
  function rel(id, from, to) {
    recordObservation(Object.freeze({
      id,
      version: 1,
      recordType: RECORD_TYPE.RELATIONSHIP,
      scope: makeRecognitionScope({ domainType: 'recognition-relationship', entityType: 'CO_CLUSTERED' }),
      payload: { relationshipType: 'CO_CLUSTERED', fromScopeKey: from, toScopeKey: to },
      confidence: 0.5,
      evidence: [],
      provenance: { producerId: 'test', computedAt: now },
      createdAt: now,
      updatedAt: now,
    }));
  }
  // A real cycle: x -> y -> z -> x
  rel('cyc-1', 'x', 'y');
  rel('cyc-2', 'y', 'z');
  rel('cyc-3', 'z', 'x');
  const result = getSubgraph('x', { maxHops: 5 });
  check('a real cycle terminates cleanly (finite node set, no infinite loop)', result.nodes.length === 3);
}

console.log('\n[graph-service.js — deterministic, symmetric persistence]');
{
  resetRepositoryRegistry();
  setActiveRepository('memory');
  const cluster = fixtureCluster(['scope-1', 'scope-2']);
  const first = recordDiscoveredRelationships([cluster]);
  check('recordDiscoveredRelationships succeeds', first.ok);
  check('exactly 1 relationship persisted for a 2-member cluster', first.relationships.length === 1);

  // Re-discovering from an EQUIVALENT cluster with members listed in the
  // opposite order must reconcile to the SAME relationship id.
  const reorderedCluster = fixtureCluster(['scope-2', 'scope-1'], { id: 'cluster:test:scope-2|scope-1' });
  const second = recordDiscoveredRelationships([reorderedCluster]);
  check('member order never changes the persisted relationship id (symmetric)', second.relationships[0].id === first.relationships[0].id);

  const history = getRecognitionHistory(first.relationships[0].id);
  check('re-discovery reconciles via append, never a duplicate row', history.ok && history.data.length === 2);
}

console.log(`\n${pass}/${pass + fail} checks passed.`);
if (fail > 0) process.exit(1);
