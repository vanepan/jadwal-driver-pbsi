/* machine-learning-check.mjs — Node check for V2.0.9 "Machine Learning
   Foundation": Clustering, Pattern Mining, Statistics, Confidence,
   Outlier Detection. Similarity is reused from V2.0.5, not re-tested
   here (see knowledge-learning-check.mjs). Entirely deterministic — no
   AI, no LLM.
   Run: node scripts/machine-learning-check.mjs   (exit 0 = pass) */

import { LIFECYCLE_STATE } from '../js/v2/knowledge/contracts/lifecycle-contract.js';
import { generateKnowledgeId } from '../js/v2/knowledge/contracts/identity-contract.js';
import { RELATIONSHIP_TYPE } from '../js/v2/knowledge/contracts/dependency-graph-contract.js';
import { getSourceWeight, resetSourceWeights } from '../js/v2/knowledge/contracts/source-weight-contract.js';
import { setActiveRepository, create as repoCreate, getById } from '../js/v2/knowledge/repository/knowledge-repository.js';
import { promoteToCandidate } from '../js/v2/knowledge/promotion/promotion-engine.js';
import { submitForReview, approve } from '../js/v2/knowledge/review/review-workflow-engine.js';

import { buildKnowledgeIndex, indexGroup } from '../js/v2/knowledge/extraction/index-engine.js';
import { clusterItems } from '../js/v2/knowledge/machine-learning/clustering-engine.js';
import { minePatternsPerCluster } from '../js/v2/knowledge/machine-learning/pattern-mining-engine.js';
import { computeFieldStatistics, computeStatistics } from '../js/v2/knowledge/machine-learning/statistics-engine.js';
import { detectOutliers } from '../js/v2/knowledge/machine-learning/outlier-detection-engine.js';
import { suggestConfidence } from '../js/v2/knowledge/machine-learning/confidence-engine.js';

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); }
}

setActiveRepository('memory');
resetSourceWeights();

function makeApprovedItem(domainType, sourceRef, payload, kind = 'structure') {
  const now = new Date().toISOString();
  const item = Object.freeze({
    id: generateKnowledgeId({ domainType, sourceType: 'mltest', sourceRef }),
    version: 1, domainType, sourceType: 'mltest', kind,
    payload, confidence: 1, lifecycleState: LIFECYCLE_STATE.DRAFT,
    provenance: Object.freeze({ connectorId: 'mltest', sourceRef, capturedAt: now }),
    approvedBy: null, approvedAt: null, preferenceRationale: null, createdAt: now, updatedAt: now,
  });
  repoCreate(item);
  promoteToCandidate(item.id);
  submitForReview(item.id);
  approve(item.id, { approverId: 'evan', decidedAt: now, preferenceRationale: 'Seed data for ML check.' });
  return item.id;
}

console.log('\n[Confidence — real source weight table]');
check('correction weighted highest (1.0)', getSourceWeight('correction').weight === 1.0);
check('nor connector weighted 0.9', getSourceWeight('nor').weight === 0.9);
check('extraction weighted 0.7', getSourceWeight('extraction').weight === 0.7);
check('merge weighted 0.6', getSourceWeight('merge').weight === 0.6);
check('unregistered sourceType defaults to 0.5, not distrusted', getSourceWeight('unregistered-xyz').weight === 0.5);

console.log('\n[Clustering — similarity-based, not exact-match]');
const id1 = makeApprovedItem('nor', 'ml-1', { a: 1, b: 2, c: 3 });
const id2 = makeApprovedItem('nor', 'ml-2', { a: 1, b: 2, c: 99 }); // similar to id1 (2/3 keys match)
const id3 = makeApprovedItem('nor', 'ml-3', { a: 1, b: 2, c: 3 });  // identical to id1
const id4 = makeApprovedItem('nor', 'ml-4', { x: 1, y: 2 });        // unrelated

const norStructureItems = indexGroup(buildKnowledgeIndex(), 'nor', 'structure');
const clusters = clusterItems(norStructureItems, 0.6);
check('produces exactly 2 clusters', clusters.length === 2);
check('the larger cluster groups the 3 similar items (a/b/c family)', clusters[0].length === 3
  && [id1, id2, id3].every((id) => clusters[0].some((i) => i.id === id)));
check('the unrelated item forms its own singleton cluster', clusters[1].length === 1 && clusters[1][0].id === id4);

console.log('\n[Pattern Mining — one pattern per cluster]');
const miningResult = minePatternsPerCluster('nor', 'structure', { similarityThreshold: 0.6 });
check('mining succeeds and finds the same 2 clusters', miningResult.ok === true && miningResult.clustersFound === 2);
check('only the 3-member cluster produces a pattern (singleton skipped)', miningResult.patternsWritten === 1);
const minedItem = miningResult.writes[0].data;
check('mined pattern is Candidate-lifecycle', minedItem.lifecycleState === LIFECYCLE_STATE.CANDIDATE);
check('mined pattern slots are a/b/c (all present in the 3-member cluster)', ['a', 'b', 'c'].every((f) => minedItem.payload.slots.some((s) => s.name === f)));

console.log('\n[Statistics — real numeric aggregates]');
check('computeFieldStatistics is correct for a known population [5,5,5,50]', (() => {
  const s = computeFieldStatistics([5, 5, 5, 50]);
  return s.mean === 16.25 && s.median === 5 && s.min === 5 && s.max === 50 && s.count === 4;
})());

makeApprovedItem('petty_cash', 'stat-1', { itemCount: 5 });
makeApprovedItem('petty_cash', 'stat-2', { itemCount: 5 });
makeApprovedItem('petty_cash', 'stat-3', { itemCount: 5 });
makeApprovedItem('petty_cash', 'stat-4', { itemCount: 50 });

const statsResult = computeStatistics('petty_cash', 'structure');
check('statistics computed for the 1 numeric field (itemCount)', statsResult.ok === true && statsResult.fieldsAnalyzed === 1);
const statItem = statsResult.writes[0].data;
check('statistic item is kind:statistic, Candidate-lifecycle', statItem.kind === 'statistic' && statItem.lifecycleState === LIFECYCLE_STATE.CANDIDATE);
check('statistic payload carries the real computed mean (16.25)', statItem.payload.value === 16.25);

console.log('\n[Outlier Detection — z-score, reuses Statistics]');
const outliers = detectOutliers('petty_cash', 'structure', 'itemCount', { zThreshold: 1 });
check('outlier detection succeeds', outliers.ok === true && outliers.itemsAnalyzed === 4);
check('correctly flags the 50 as the outlier among [5,5,5,50]', outliers.outlierIds.length === 1
  && getById(outliers.outlierIds[0]).data.payload.itemCount === 50);
const zeroVariance = detectOutliers('petty_cash', 'structure', 'nonexistent-field');
check('a field with no numeric population reports NO_POPULATION honestly, never a crash', zeroVariance.ok === false && zeroVariance.error.code === 'NO_POPULATION');

console.log('\n[Confidence — real corroboration + source weight]');
const confItem = getById(id1).data; // sourceType 'mltest' -> unregistered, defaults to 0.5
// Manually assert 2 CORROBORATES relationships pointing at id1 (mirroring what
// knowledge/extraction/relationship-extraction-engine.js, V2.0.8, would produce).
function makeCorroborates(fromId, toId) {
  const now = new Date().toISOString();
  const item = Object.freeze({
    id: generateKnowledgeId({ domainType: 'nor', sourceType: 'mltest', sourceRef: `corrob:${fromId}:${toId}` }),
    version: 1, domainType: 'nor', sourceType: 'mltest', kind: 'relationship',
    payload: Object.freeze({ fromId, toId, type: RELATIONSHIP_TYPE.CORROBORATES }),
    confidence: 1, lifecycleState: LIFECYCLE_STATE.CANDIDATE,
    provenance: Object.freeze({ connectorId: 'mltest', sourceRef: `corrob:${fromId}:${toId}`, capturedAt: now }),
    approvedBy: null, approvedAt: null, preferenceRationale: null, createdAt: now, updatedAt: now,
  });
  repoCreate(item);
}
makeCorroborates(id2, id1);
makeCorroborates(id3, id1);

const before = getById(id1).data.version;
const confidenceResult = suggestConfidence(confItem);
check('suggestConfidence succeeds', confidenceResult.ok === true);
check('finds both corroborating relationships', confidenceResult.corroborationCount === 2);
check('sourceWeight uses the default (mltest is unregistered)', confidenceResult.sourceWeight === 0.5);
check('formula: 0.5*0.6 + min(1,2/3)*0.4 = 0.3 + 0.267 = 0.57 (rounded)', confidenceResult.suggestedConfidence === 0.57);
check('confidence-engine NEVER writes anything — item version unchanged after suggestConfidence()', getById(id1).data.version === before);

console.log(`\n${pass}/${pass + fail} checks passed.`);
process.exit(fail > 0 ? 1 : 0);
