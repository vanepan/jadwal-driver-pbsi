/* knowledge-extraction-check.mjs — Node check for V2.0.8 "Knowledge
   Learning Foundation": Knowledge Indexing, Pattern/Vocabulary/
   Relationship Extraction, Scope Detection, Cross-Division Promotion
   Candidates. All deterministic — no AI, no LLM, no fake NLP.
   Run: node scripts/knowledge-extraction-check.mjs   (exit 0 = pass)

   Entirely V1-free — synthetic Approved items against the Memory
   repository, reusing the existing promotion/review pipeline to reach
   Approved for real (not hand-set). */

import { LIFECYCLE_STATE } from '../js/v2/knowledge/contracts/lifecycle-contract.js';
import { generateKnowledgeId } from '../js/v2/knowledge/contracts/identity-contract.js';
import { RELATIONSHIP_TYPE } from '../js/v2/knowledge/contracts/dependency-graph-contract.js';
import { setActiveRepository, create as repoCreate, getById } from '../js/v2/knowledge/repository/knowledge-repository.js';
import { promoteToCandidate } from '../js/v2/knowledge/promotion/promotion-engine.js';
import { submitForReview, approve } from '../js/v2/knowledge/review/review-workflow-engine.js';

import { buildKnowledgeIndex, indexGroup } from '../js/v2/knowledge/extraction/index-engine.js';
import { extractPattern } from '../js/v2/knowledge/extraction/pattern-extraction-engine.js';
import { extractVocabulary } from '../js/v2/knowledge/extraction/vocabulary-extraction-engine.js';
import { extractCorroboratingRelationships } from '../js/v2/knowledge/extraction/relationship-extraction-engine.js';
import { detectScope, SCOPE } from '../js/v2/knowledge/extraction/scope-detection-engine.js';
import { identifyPromotionCandidates } from '../js/v2/knowledge/extraction/promotion-candidate-engine.js';
import { computeHealthReport } from '../js/v2/knowledge/metrics/knowledge-metrics-engine.js';

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); }
}

setActiveRepository('memory');

function makeApprovedItem(sourceRef, payload) {
  const now = new Date().toISOString();
  const item = Object.freeze({
    id: generateKnowledgeId({ domainType: 'nor', sourceType: 'extractiontest', sourceRef }),
    version: 1, domainType: 'nor', sourceType: 'extractiontest', kind: 'structure',
    payload, confidence: 1, lifecycleState: LIFECYCLE_STATE.DRAFT,
    provenance: Object.freeze({ connectorId: 'extractiontest', sourceRef, capturedAt: now }),
    approvedBy: null, approvedAt: null, preferenceRationale: null, createdAt: now, updatedAt: now,
  });
  repoCreate(item);
  promoteToCandidate(item.id);
  submitForReview(item.id);
  approve(item.id, { approverId: 'evan', decidedAt: now, preferenceRationale: 'Seed data for extraction check.' });
  return item.id;
}

const MAJORITY_PAYLOAD = Object.freeze({ hasSubject: true, itemCount: 5, signatoryTopCount: 3, noteText: 'laporan bulanan' });
const VARIANT_PAYLOAD = Object.freeze({ hasSubject: true, itemCount: 2, signatoryTopCount: 1, noteText: 'catatan lain', isUrgent: true });

const id1 = makeApprovedItem('rec-1', MAJORITY_PAYLOAD);
const id2 = makeApprovedItem('rec-2', MAJORITY_PAYLOAD);
const id3 = makeApprovedItem('rec-3', MAJORITY_PAYLOAD);
const id4 = makeApprovedItem('rec-4', VARIANT_PAYLOAD);

console.log('\n[Knowledge Indexing]');
const index = buildKnowledgeIndex();
check('index contains all 4 Approved items', index.totalIndexed === 4);
check('indexGroup returns the 4 nor/structure items', indexGroup(index, 'nor', 'structure').length === 4);
check('indexGroup returns empty for an unpopulated group', indexGroup(index, 'nor', 'vocabulary').length === 0);

console.log('\n[Pattern / Structure Extraction]');
const patternResult = extractPattern('nor', 'structure');
check('pattern extraction succeeds over the 4-item population', patternResult.ok === true && patternResult.itemsAnalyzed === 4);
const slotNames = patternResult.pattern.slots.map((s) => s.name);
check('slots include fields present in 100% of the population', ['hasSubject', 'itemCount', 'signatoryTopCount', 'noteText'].every((f) => slotNames.includes(f)));
check('slots exclude a field present in only 25% of the population (below the 0.8 threshold)', !slotNames.includes('isUrgent'));
check('the extracted pattern was written as Candidate knowledge (never auto-approved)', patternResult.write.data.lifecycleState === LIFECYCLE_STATE.CANDIDATE);

const patternId = generateKnowledgeId({ domainType: 'nor', sourceType: 'extraction', sourceRef: 'pattern:nor:structure' });
const rerun = extractPattern('nor', 'structure');
check('re-running extraction updates the SAME candidate (idempotent, version 2)', getById(patternId).data.version === 2 && rerun.write.op === 'append');

console.log('\n[Vocabulary Extraction]');
const vocabResult = extractVocabulary('nor', 'structure', { minOccurrence: 2 });
check('vocabulary extraction succeeds', vocabResult.ok === true);
check('extracts exactly the 2 terms shared by >=2 items (laporan, bulanan)', vocabResult.termsExtracted === 2);
const vocabTerms = vocabResult.writes.map((w) => w.data.payload.term).sort();
check('extracted terms are exactly "bulanan" and "laporan"', JSON.stringify(vocabTerms) === JSON.stringify(['bulanan', 'laporan']));
check('a one-off term (catatan/lain, appearing in only 1 item) is correctly excluded', !vocabTerms.includes('catatan') && !vocabTerms.includes('lain'));
check('every extracted vocabulary item is Candidate-lifecycle', vocabResult.writes.every((w) => w.data.lifecycleState === LIFECYCLE_STATE.CANDIDATE));

console.log('\n[Relationship Extraction]');
const relResult = extractCorroboratingRelationships('nor', 'structure');
check('extracts exactly 3 CORROBORATES pairs among the 3 identical-payload items', relResult.ok === true && relResult.relationshipsExtracted === 3);
check('every extracted relationship references two of {id1,id2,id3}, reuses the existing RELATIONSHIP_TYPE vocabulary', relResult.writes.every((w) => w.data.kind === 'relationship'
  && w.data.payload.type === RELATIONSHIP_TYPE.CORROBORATES
  && [id1, id2, id3].includes(w.data.payload.fromId) && [id1, id2, id3].includes(w.data.payload.toId)));

console.log('\n[Scope Detection]');
const scope = detectScope('nor', 'structure');
check('scope detection succeeds', scope.ok === true);
check('3/4 sharing the majority payload (75%) crosses the 70% org-wide threshold', scope.scope === SCOPE.ORGANIZATION_WIDE && scope.coveragePct === 0.75);
const narrowScope = detectScope('nor', 'structure', { orgWideThreshold: 0.9 });
check('a stricter threshold correctly reclassifies the same population as a variant', narrowScope.scope === SCOPE.VARIANT);

console.log('\n[Cross-Division Promotion Candidates]');
const promotionResult = identifyPromotionCandidates('nor', 'structure');
check('promotion candidates succeeds', promotionResult.ok === true);
check('identifies the 3-item majority group as promotion candidates', promotionResult.promotionCandidateIds.length === 3
  && [id1, id2, id3].every((id) => promotionResult.promotionCandidateIds.includes(id)));
check('identifies the 1-item variant as NOT a promotion candidate', promotionResult.variantIds.length === 1 && promotionResult.variantIds[0] === id4);
check('never performs a promotion itself — only reports ids for a human to act on', getById(id4).data.lifecycleState === LIFECYCLE_STATE.APPROVED);

console.log('\n[Knowledge Health — reused, not duplicated]');
const health = computeHealthReport();
check('computeHealthReport() (Phase 6, unchanged) succeeds', health.ok === true);
check('learningQueueCount (Draft+Candidate) reflects this run\'s extraction output for real — patternCount/vocabularySize/relationshipCount stay Approved-only until a human reviews them, exactly as designed (nothing here was auto-approved)', health.data.learningQueueCount >= 1 + vocabResult.termsExtracted + relResult.relationshipsExtracted);

console.log(`\n${pass}/${pass + fail} checks passed.`);
process.exit(fail > 0 ? 1 : 0);
