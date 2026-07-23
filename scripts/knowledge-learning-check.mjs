/* knowledge-learning-check.mjs — Node check for V2.0.5 "Teach Once, Learn
   Forever": Correction Pipeline, Learning Session, Candidate Generation,
   Similarity Detection, Pattern/Vocabulary/Relationship Update (one
   generic mechanism), Knowledge Evolution, Learning Metrics.
   Run: node scripts/knowledge-learning-check.mjs   (exit 0 = pass)

   Entirely V1-free — synthetic items against the Memory repository. */

import { LIFECYCLE_STATE } from '../src/knowledge/contracts/lifecycle-contract.js';
import { generateKnowledgeId } from '../src/knowledge/contracts/identity-contract.js';
import { isRelationshipPayload, RELATIONSHIP_TYPE } from '../src/knowledge/contracts/dependency-graph-contract.js';
import {
  setActiveRepository, create as repoCreate, getById,
} from '../src/knowledge/repository/knowledge-repository.js';
import { promoteToCandidate } from '../src/knowledge/promotion/promotion-engine.js';
import { submitForReview, approve } from '../src/knowledge/review/review-workflow-engine.js';
import {
  startCorrectionSession, submitCorrection, finishCorrectionSession, listCorrectionLog, resetCorrectionLog,
} from '../src/knowledge/learning/correction-pipeline-engine.js';
import { computeSimilarity, findSimilarItems } from '../src/knowledge/learning/similarity-detection-engine.js';
import { getKnowledgeEvolution } from '../src/knowledge/learning/knowledge-evolution-engine.js';
import { buildLearningMetrics } from '../src/knowledge/learning/contracts/learning-metrics-contract.js';
import { LEARNING_EVENT_TYPE } from '../src/knowledge/learning/contracts/event-contract.js';
import { LEARNING_SESSION_STATUS } from '../src/knowledge/learning/contracts/session-contract.js';

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); }
}

setActiveRepository('memory');
resetCorrectionLog();

function makeItem(sourceRef, payload, state = LIFECYCLE_STATE.DRAFT) {
  const now = new Date().toISOString();
  return Object.freeze({
    id: generateKnowledgeId({ domainType: 'nor', sourceType: 'learningtest', sourceRef }),
    version: 1, domainType: 'nor', sourceType: 'learningtest', kind: 'structure',
    payload, confidence: 1, lifecycleState: state,
    provenance: Object.freeze({ connectorId: 'learningtest', sourceRef, capturedAt: now }),
    approvedBy: null, approvedAt: null, preferenceRationale: null,
    createdAt: now, updatedAt: now,
  });
}

console.log('\n[Similarity Detection]');
const simA = computeSimilarity({ itemCount: 3, isTest: false }, { itemCount: 3, isTest: false });
check('identical payloads score 1.0', simA.score === 1);
const simB = computeSimilarity({ itemCount: 3 }, { itemCount: 99 });
check('fully divergent payloads score 0.0', simB.score === 0);

const approvedItem = makeItem('rec-approved', { itemCount: 3, isTest: false });
repoCreate(approvedItem);
promoteToCandidate(approvedItem.id);
submitForReview(approvedItem.id);
approve(approvedItem.id, { approverId: 'evan', decidedAt: new Date().toISOString(), preferenceRationale: 'Baseline approved item for learning check.' });

const nearMatches = findSimilarItems('nor', 'structure', { itemCount: 3, isTest: false }, 0.5);
check('findSimilarItems finds the near-identical approved item', nearMatches.length >= 1 && nearMatches[0].itemBId === approvedItem.id);

console.log('\n[Correction Pipeline — Learning Session + Events]');
const events = [];
const onEvent = (e) => events.push(e);
let session = startCorrectionSession('evan', { onEvent });
check('session starts open', session.status === 'open' && session.correctedBy === 'evan');

console.log('\n[Update path — Pattern/Vocabulary/Relationship Update, one mechanism]');
const candidateItem = makeItem('rec-candidate', { itemCount: 5 }, LIFECYCLE_STATE.CANDIDATE);
repoCreate(candidateItem);
const updateOutcome = submitCorrection(session, {
  itemId: candidateItem.id, domainType: 'nor', kind: 'structure', correctedPayload: { itemCount: 6 }, correctedBy: 'evan', note: 'Fixed the count.',
}, { onEvent });
session = updateOutcome.session;
check('in-place update succeeds', updateOutcome.ok === true && updateOutcome.generatedItem === null);
check('same item id, version incremented (append-only, never overwritten)', updateOutcome.result.data.id === candidateItem.id && updateOutcome.result.data.version === 2);
check('lifecycleState untouched by a content correction (still candidate)', updateOutcome.result.data.lifecycleState === LIFECYCLE_STATE.CANDIDATE);
check('provenance now attributes this version to the correction', updateOutcome.result.data.provenance.connectorId === 'correction');

console.log('\n[Candidate Generation — correcting an Approved item never mutates it in place]');
const supersedeOutcome = submitCorrection(session, {
  itemId: approvedItem.id, domainType: 'nor', kind: 'structure', correctedPayload: { itemCount: 99, isTest: false }, correctedBy: 'evan', note: 'Approved item was wrong.',
}, { onEvent, similarityThreshold: 0.4 });
session = supersedeOutcome.session;
check('a brand-new Candidate is generated instead of mutating the Approved item', supersedeOutcome.generatedItem !== null && supersedeOutcome.generatedItem.id !== approvedItem.id);
check('generated candidate lands at candidate lifecycle, never auto-approved', supersedeOutcome.generatedItem.lifecycleState === LIFECYCLE_STATE.CANDIDATE);
check('the original Approved item is completely untouched', getById(approvedItem.id).data.version === 4 && getById(approvedItem.id).data.payload.itemCount === 3);
check('a DERIVED_FROM relationship item links the new candidate back to the approved one', supersedeOutcome.relationshipItem !== null
  && isRelationshipPayload(supersedeOutcome.relationshipItem.payload)
  && supersedeOutcome.relationshipItem.payload.type === RELATIONSHIP_TYPE.DERIVED_FROM
  && supersedeOutcome.relationshipItem.payload.fromId === supersedeOutcome.generatedItem.id
  && supersedeOutcome.relationshipItem.payload.toId === approvedItem.id);
check('Similarity Detection ran and found the approved item as a near-match', supersedeOutcome.similar.length >= 1);

console.log('\n[Pure new candidate — no supersede target]');
const newOutcome = submitCorrection(session, {
  itemId: null, domainType: 'nor', kind: 'structure', correctedPayload: { itemCount: 42, isTest: true }, correctedBy: 'evan', note: 'A brand new fact.',
}, { onEvent });
session = newOutcome.session;
check('brand-new candidate generated with no relationship item', newOutcome.generatedItem !== null && newOutcome.relationshipItem === null);

session = finishCorrectionSession(session, { onEvent });
check('session completed with 3 items touched', session.status === LEARNING_SESSION_STATUS.COMPLETED && session.itemIds.length === 3);
check('events: 1 started, 1 correction_applied, 2 candidate_generated, 1 completed', events.filter((e) => e.type === LEARNING_EVENT_TYPE.SESSION_STARTED).length === 1
  && events.filter((e) => e.type === LEARNING_EVENT_TYPE.CORRECTION_APPLIED).length === 1
  && events.filter((e) => e.type === LEARNING_EVENT_TYPE.CANDIDATE_GENERATED).length === 2
  && events.filter((e) => e.type === LEARNING_EVENT_TYPE.SESSION_COMPLETED).length === 1);

console.log('\n[Knowledge Evolution]');
const evolution = getKnowledgeEvolution(candidateItem.id);
check('evolution timeline has 2 entries (create + correction)', evolution.entries.length === 2);
check('correctionCount reflects the one corrected version', evolution.correctionCount === 1);
check('second entry is attributed to the correction pipeline', evolution.entries[1].producedBy === 'correction');

console.log('\n[Learning Metrics]');
const log = listCorrectionLog();
check('correction log recorded all 3 submissions', log.length === 3);
const metrics = buildLearningMetrics(log);
check('metrics: 1 update, 2 candidates generated', metrics.updatesToExisting === 1 && metrics.candidatesGenerated === 2);
check('metrics: similarityMatches counts corrections where a match was found', metrics.similarityMatches === 1);
check('metrics totalCorrections matches the log', metrics.totalCorrections === 3);

console.log(`\n${pass}/${pass + fail} checks passed.`);
process.exit(fail > 0 ? 1 : 0);
