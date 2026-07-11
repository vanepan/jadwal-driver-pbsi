/* organizational-knowledge-check.mjs — Node check for V2.0.12
   "Organizational Knowledge Foundation": Evidence contract,
   RecommendationEvidence contract, KnowledgeGraph engine/service
   (multi-hop composition over the existing single-hop dependency
   graph), Confidence service (delegation + Evidence reshaping),
   Statistics service (delegation), the domain-type-registry NOR
   label fix, and a structural dormancy check. Entirely deterministic
   — no AI, no LLM, no production writes (memory repository only).
   Run: node scripts/organizational-knowledge-check.mjs   (exit 0 = pass) */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { LIFECYCLE_STATE } from '../js/v2/knowledge/contracts/lifecycle-contract.js';
import { generateKnowledgeId } from '../js/v2/knowledge/contracts/identity-contract.js';
import { RELATIONSHIP_TYPE } from '../js/v2/knowledge/contracts/dependency-graph-contract.js';
import { setActiveRepository, create as repoCreate } from '../js/v2/knowledge/repository/knowledge-repository.js';
import { getDomainType, resetDomainTypeRegistry } from '../js/v2/knowledge/registry/domain-type-registry.js';

import { EVIDENCE_KIND, isEvidence, isEvidenceList } from '../js/v2/knowledge/contracts/evidence-contract.js';
import { isRecommendationEvidence } from '../js/v2/knowledge/contracts/recommendation-evidence-contract.js';

import { suggestConfidence as engineSuggestConfidence } from '../js/v2/knowledge/machine-learning/confidence-engine.js';
import { computeFieldStatistics as engineComputeFieldStatistics } from '../js/v2/knowledge/machine-learning/statistics-engine.js';

import * as knowledgeGraphService from '../js/v2/knowledge/services/knowledge-graph-service.js';
import * as confidenceService from '../js/v2/knowledge/services/confidence-service.js';
import * as statisticsService from '../js/v2/knowledge/services/statistics-service.js';

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); }
}

setActiveRepository('memory');

function makeItem(domainType, sourceType, sourceRef, kind = 'structure', payload = { seed: sourceRef }) {
  const now = new Date().toISOString();
  const item = Object.freeze({
    id: generateKnowledgeId({ domainType, sourceType, sourceRef }),
    version: 1, domainType, sourceType, kind, payload, confidence: 1,
    lifecycleState: LIFECYCLE_STATE.CANDIDATE,
    provenance: Object.freeze({ connectorId: sourceType, sourceRef, capturedAt: now }),
    approvedBy: null, approvedAt: null, preferenceRationale: null, createdAt: now, updatedAt: now,
  });
  repoCreate(item);
  return item;
}

function makeRelationship(domainType, fromId, toId, type) {
  const sourceRef = `rel:${fromId}:${toId}:${type}`;
  return makeItem(domainType, 'oktest', sourceRef, 'relationship', { fromId, toId, type }).id;
}

console.log('\n[Evidence contract]');
check('isEvidence accepts a well-formed SOURCE evidence object', isEvidence({
  itemId: 'nor:oktest:a', kind: EVIDENCE_KIND.SOURCE, weight: 0.9, rationale: 'source weight 0.9',
}));
check('isEvidence rejects an object missing itemId', !isEvidence({
  kind: EVIDENCE_KIND.SOURCE, weight: 0.9, rationale: 'no itemId',
}));
check('isEvidence rejects weight outside [0,1]', !isEvidence({
  itemId: 'nor:oktest:a', kind: EVIDENCE_KIND.SOURCE, weight: 1.5, rationale: 'too high',
}));
check('isEvidence rejects an unregistered kind', !isEvidence({
  itemId: 'nor:oktest:a', kind: 'bogus', weight: 0.5, rationale: 'bad kind',
}));
check('isEvidenceList accepts two valid entries and rejects one invalid entry mixed in', (() => {
  const good = { itemId: 'nor:oktest:a', kind: EVIDENCE_KIND.SOURCE, weight: 0.5, rationale: 'ok' };
  const bad = { itemId: 'nor:oktest:b', kind: EVIDENCE_KIND.SOURCE, weight: -1, rationale: 'bad weight' };
  return isEvidenceList([good, good]) === true && isEvidenceList([good, bad]) === false;
})());

console.log('\n[RecommendationEvidence contract]');
const validEvidence = [{ itemId: 'nor:oktest:a', kind: EVIDENCE_KIND.SOURCE, weight: 0.9, rationale: 'ok' }];
check('isRecommendationEvidence accepts a well-formed object with non-empty evidence', isRecommendationEvidence({
  recommendationId: 'rec-1', recommendationType: 'test', evidence: validEvidence,
  confidence: 0.8, rationale: 'because', generatedAt: new Date().toISOString(),
}));
check('isRecommendationEvidence rejects an empty evidence array', !isRecommendationEvidence({
  recommendationId: 'rec-2', recommendationType: 'test', evidence: [],
  confidence: 0.8, rationale: 'because', generatedAt: new Date().toISOString(),
}));
check('isRecommendationEvidence rejects confidence outside [0,1]', !isRecommendationEvidence({
  recommendationId: 'rec-3', recommendationType: 'test', evidence: validEvidence,
  confidence: 2, rationale: 'because', generatedAt: new Date().toISOString(),
}));
check('isRecommendationEvidence rejects a missing rationale', !isRecommendationEvidence({
  recommendationId: 'rec-4', recommendationType: 'test', evidence: validEvidence,
  confidence: 0.8, generatedAt: new Date().toISOString(),
}));

console.log('\n[Domain-type-registry — NOR label fix]');
check('getDomainType("nor").label is now "Nota Organisasi Realisasi"', getDomainType('nor').label === 'Nota Organisasi Realisasi');
check('the stale label is gone', getDomainType('nor').label !== 'Nota Operasional Reimbursement');
resetDomainTypeRegistry();
check('resetDomainTypeRegistry() re-bootstraps the corrected label, not the old one', getDomainType('nor').label === 'Nota Organisasi Realisasi');

console.log('\n[KnowledgeGraph — fixture: A<-B corroborates, A<-C supersedes, C<-D corroborates]');
const A = makeItem('nor', 'oktest', 'graph-a');
const B = makeItem('nor', 'oktest', 'graph-b');
const C = makeItem('nor', 'oktest', 'graph-c');
const D = makeItem('nor', 'oktest', 'graph-d');
makeRelationship('nor', B.id, A.id, RELATIONSHIP_TYPE.CORROBORATES);
makeRelationship('nor', C.id, A.id, RELATIONSHIP_TYPE.SUPERSEDES);
makeRelationship('nor', D.id, C.id, RELATIONSHIP_TYPE.CORROBORATES);

console.log('\n[KnowledgeGraph service — getNeighbors]');
const neighborsOfA = knowledgeGraphService.getNeighbors(A.id);
check('getNeighbors(A) includes B with direction "incoming"', neighborsOfA.ok
  && neighborsOfA.data.some((n) => n.neighborId === B.id && n.direction === 'incoming'));
const neighborsOfACorrob = knowledgeGraphService.getNeighbors(A.id, { relationshipType: RELATIONSHIP_TYPE.CORROBORATES });
check('getNeighbors(A, {CORROBORATES}) excludes C', neighborsOfACorrob.ok
  && !neighborsOfACorrob.data.some((n) => n.neighborId === C.id));
const neighborsOfAOutgoing = knowledgeGraphService.getNeighbors(A.id, { direction: 'outgoing' });
check('getNeighbors(A, {direction: "outgoing"}) is empty (A is never fromId)', neighborsOfAOutgoing.ok
  && neighborsOfAOutgoing.data.length === 0);

console.log('\n[KnowledgeGraph service — getSubgraph]');
const subgraphHop1 = knowledgeGraphService.getSubgraph(A.id, { maxHops: 1 });
check('getSubgraph(A, {maxHops:1}) excludes D (one hop short)', subgraphHop1.ok
  && !subgraphHop1.data.nodes.includes(D.id));
const subgraphHop2 = knowledgeGraphService.getSubgraph(A.id, { maxHops: 2 });
check('getSubgraph(A, {maxHops:2}) includes A, B, C, and D', subgraphHop2.ok
  && [A.id, B.id, C.id, D.id].every((id) => subgraphHop2.data.nodes.includes(id)));
check('getSubgraph(A, {maxHops:2}) has exactly 3 deduplicated edges', subgraphHop2.ok
  && subgraphHop2.data.edges.length === 3);

console.log('\n[KnowledgeGraph service — getGraphStats]');
const stats = knowledgeGraphService.getGraphStats({ domainType: 'nor' });
check('getGraphStats reports edgeCount 3 and nodeCount 4', stats.ok
  && stats.data.edgeCount === 3 && stats.data.nodeCount === 4);
check('getGraphStats byRelationshipType is {corroborates:2, supersedes:1}', stats.ok
  && stats.data.byRelationshipType.corroborates === 2 && stats.data.byRelationshipType.supersedes === 1);
const emptyStats = knowledgeGraphService.getGraphStats({ domainType: 'nonexistent-xyz' });
check('getGraphStats scopes cleanly to an empty domainType (no crash)', emptyStats.ok && emptyStats.data.edgeCount === 0);

console.log('\n[Confidence service — delegates, no math divergence]');
const E = makeItem('nor', 'nor', 'conf-e');
const F = makeItem('nor', 'oktest', 'conf-f');
const G = makeItem('nor', 'oktest', 'conf-g');
makeRelationship('nor', F.id, E.id, RELATIONSHIP_TYPE.CORROBORATES);
makeRelationship('nor', G.id, E.id, RELATIONSHIP_TYPE.CORROBORATES);

check('confidenceService.suggestConfidence delegates identically to the engine', JSON.stringify(confidenceService.suggestConfidence(E))
  === JSON.stringify(engineSuggestConfidence(E)));

const evidenceResult = confidenceService.explainConfidenceAsEvidence(E);
const engineConfidenceForE = engineSuggestConfidence(E);
check('explainConfidenceAsEvidence(E) returns exactly 1 + corroborationCount entries', evidenceResult.ok
  && evidenceResult.data.length === 1 + engineConfidenceForE.corroborationCount);
check('every entry returned by explainConfidenceAsEvidence(E) satisfies isEvidence', evidenceResult.ok
  && evidenceResult.data.every(isEvidence));
check('explainConfidenceAsEvidence(E) includes exactly one SOURCE entry and the rest CORROBORATION', evidenceResult.ok
  && evidenceResult.data.filter((e) => e.kind === EVIDENCE_KIND.SOURCE).length === 1
  && evidenceResult.data.filter((e) => e.kind === EVIDENCE_KIND.CORROBORATION).length === engineConfidenceForE.corroborationCount);

console.log('\n[Statistics service — delegates, no math divergence]');
check('statisticsService.computeFieldStatistics delegates identically to the engine', JSON.stringify(statisticsService.computeFieldStatistics([5, 5, 5, 50]))
  === JSON.stringify(engineComputeFieldStatistics([5, 5, 5, 50])));

console.log('\n[Dormancy — structural import scan]');
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const jsRoot = path.join(repoRoot, 'js');

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

function importSpecifiers(filePath) {
  const src = fs.readFileSync(filePath, 'utf8');
  const specifiers = [];
  const re = /(?:import|export)\s+(?:[^'"]*?\bfrom\s+)?['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(src))) specifiers.push(m[1]);
  return specifiers;
}

const allJsFiles = walk(jsRoot);
const v2Root = path.join(jsRoot, 'v2');
const knowledgeRoot = path.join(v2Root, 'knowledge');
const ALLOWED_V2_IMPORTERS = new Set([
  path.join(jsRoot, 'config', 'feature-gates.js'),
  path.join(jsRoot, 'config', 'module-loader-registry.js'),
]);

const outsideV2Violations = [];
for (const file of allJsFiles) {
  if (file.startsWith(v2Root)) continue;
  for (const spec of importSpecifiers(file)) {
    const resolved = path.resolve(path.dirname(file), spec);
    if (resolved.startsWith(v2Root) && !ALLOWED_V2_IMPORTERS.has(file)) outsideV2Violations.push(file);
  }
}
check('no file outside the gated chain imports from js/v2/', outsideV2Violations.length === 0);

const aiFoundationViolations = [];
const knowledgeFiles = walk(knowledgeRoot);
for (const file of knowledgeFiles) {
  for (const spec of importSpecifiers(file)) {
    if (spec.includes('ai-foundation')) aiFoundationViolations.push(file);
  }
}
check('js/v2/knowledge/ never imports js/v2/ai-foundation/', aiFoundationViolations.length === 0);

console.log(`\n${pass}/${pass + fail} checks passed.`);
process.exit(fail > 0 ? 1 : 0);
