/* knowledge-promotion-check.mjs — Node check for V2.0.4 "Knowledge
   Promotion": Promotion Engine (full 5-state verb coverage), Rollback
   Engine, Conflict Resolution, Knowledge Merge Contracts.
   Run: node scripts/knowledge-promotion-check.mjs   (exit 0 = pass)

   Entirely V1-free — synthetic items against the Memory repository. */

import { LIFECYCLE_STATE } from '../src/knowledge/contracts/lifecycle-contract.js';
import { generateKnowledgeId } from '../src/knowledge/contracts/identity-contract.js';
import {
  setActiveRepository, create as repoCreate, getById,
} from '../src/knowledge/repository/knowledge-repository.js';
import { submitForReview, approve } from '../src/knowledge/review/review-workflow-engine.js';
import { detectConflicts } from '../src/knowledge/review/conflict-detection-engine.js';
import { resetReviewHistory, listReviewHistory } from '../src/knowledge/review/review-history.js';
import {
  promoteToCandidate, deprecate, rollbackPromotion,
} from '../src/knowledge/promotion/promotion-engine.js';
import { resolveConflict } from '../src/knowledge/promotion/conflict-resolution-engine.js';
import { mergePayloads, proposeMergedDraft } from '../src/knowledge/promotion/knowledge-merge-engine.js';
import { PROMOTION_EVENT_TYPE } from '../src/knowledge/promotion/contracts/event-contract.js';
import { makeMergeProposal, isKnowledgeMergeProposal } from '../src/knowledge/promotion/contracts/merge-contract.js';

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); }
}

setActiveRepository('memory');
resetReviewHistory();

function makeDraftItem(sourceRef, payload) {
  const now = new Date().toISOString();
  return Object.freeze({
    id: generateKnowledgeId({ domainType: 'nor', sourceType: 'promotiontest', sourceRef }),
    version: 1, domainType: 'nor', sourceType: 'promotiontest', kind: 'structure',
    payload, confidence: 0.9, lifecycleState: LIFECYCLE_STATE.DRAFT,
    provenance: Object.freeze({ connectorId: 'promotiontest', sourceRef, capturedAt: now }),
    approvedBy: null, approvedAt: null, preferenceRationale: null,
    createdAt: now, updatedAt: now,
  });
}

console.log('\n[Promotion Engine — full verb coverage]');
const events = [];
const onEvent = (e) => events.push(e);

const itemP = makeDraftItem('rec-p', { itemCount: 1 });
repoCreate(itemP);
const toCandidate = promoteToCandidate(itemP.id, { actorId: 'evan', onEvent });
check('promoteToCandidate moves draft -> candidate (previously had no named verb)', toCandidate.ok === true && toCandidate.data.lifecycleState === LIFECYCLE_STATE.CANDIDATE);
check('promoteToCandidate recorded a PromotionRecord in the SAME review-history log', listReviewHistory(itemP.id).length === 1);
check('PROMOTED event fired', events.some((e) => e.type === PROMOTION_EVENT_TYPE.PROMOTED));

const itemD = makeDraftItem('rec-d', { itemCount: 2 });
repoCreate(itemD);
promoteToCandidate(itemD.id);
const deprecateResult = deprecate(itemD.id, 'No longer needed for this check.', { actorId: 'evan', onEvent });
check('deprecate moves candidate -> deprecated (previously had no named verb)', deprecateResult.ok === true && deprecateResult.data.lifecycleState === LIFECYCLE_STATE.DEPRECATED);
check('DEPRECATED event fired with the reason recorded', events.some((e) => e.type === PROMOTION_EVENT_TYPE.DEPRECATED));
check('deprecate reason lands in the PromotionRecord rationale', listReviewHistory(itemD.id)[1].preferenceRationale === 'No longer needed for this check.');

console.log('\n[Rollback Engine]');
const itemR = makeDraftItem('rec-r', { itemCount: 3 });
repoCreate(itemR); // v1 draft
promoteToCandidate(itemR.id); // v2 candidate
submitForReview(itemR.id); // v3 pending_review
approve(itemR.id, { approverId: 'evan', decidedAt: new Date().toISOString(), preferenceRationale: 'Initial approval.' }); // v4 approved
const rollbackResult = rollbackPromotion(itemR.id, 2, { approverId: 'evan', decidedAt: new Date().toISOString(), preferenceRationale: 'Reverting to the candidate-stage content.' }, { onEvent });
check('rollbackPromotion succeeds and creates a new version (append-only, never an overwrite)', rollbackResult.ok === true && rollbackResult.data.version === 5);
check('rollback always resolves to approved (the self-loop is the rollback semantic)', rollbackResult.data.lifecycleState === LIFECYCLE_STATE.APPROVED);
check('ROLLED_BACK promotion event fired', events.some((e) => e.type === PROMOTION_EVENT_TYPE.ROLLED_BACK));

console.log('\n[Conflict Resolution]');
const itemW = makeDraftItem('rec-winner', { itemCount: 5 });
const itemL = makeDraftItem('rec-loser', { itemCount: 9 });
repoCreate(itemW); repoCreate(itemL);
promoteToCandidate(itemW.id); promoteToCandidate(itemL.id);
const conflicts = detectConflicts([{ ...itemW, version: 2, lifecycleState: LIFECYCLE_STATE.CANDIDATE }, { ...itemL, version: 2, lifecycleState: LIFECYCLE_STATE.CANDIDATE }]);
check('conflict detected between the two candidates', conflicts.length === 1);
const resolution = resolveConflict(conflicts[0], itemW.id, { actorId: 'evan', onEvent });
check('resolveConflict succeeds', resolution.ok === true && resolution.deprecated.length === 1 && resolution.deprecated[0] === itemL.id);
check('loser is now deprecated', getById(itemL.id).data.lifecycleState === LIFECYCLE_STATE.DEPRECATED);
check('winner is untouched — resolution never auto-approves (Decision 6 still applies)', getById(itemW.id).data.lifecycleState === LIFECYCLE_STATE.CANDIDATE);
check('CONFLICT_RESOLVED event fired', events.some((e) => e.type === PROMOTION_EVENT_TYPE.CONFLICT_RESOLVED));

console.log('\n[Knowledge Merge Contracts]');
const sampleProposal = makeMergeProposal({ domainType: 'nor', kind: 'structure', sourceItemIds: ['a', 'b'], mergedPayload: {}, proposedBy: 'evan' });
check('makeMergeProposal produces a valid KnowledgeMergeProposal', isKnowledgeMergeProposal(sampleProposal));
const mergeA = makeDraftItem('rec-merge-a', { fieldA: 1 });
const mergeB = makeDraftItem('rec-merge-b', { fieldB: 2 });
check('mergePayloads is a pure shallow merge (last item wins per field)', JSON.stringify(mergePayloads([mergeA, mergeB])) === JSON.stringify({ fieldA: 1, fieldB: 2 }));
const mergedDraft = proposeMergedDraft([mergeA, mergeB], { proposedBy: 'evan', onEvent });
check('proposeMergedDraft produces a Draft item (never auto-approved)', mergedDraft.lifecycleState === LIFECYCLE_STATE.DRAFT);
check('merged draft payload combines both sources', mergedDraft.payload.fieldA === 1 && mergedDraft.payload.fieldB === 2);
check('merged draft confidence is the min of its sources (conservative)', mergedDraft.confidence === 0.9);
check('MERGE_PROPOSED event fired', events.some((e) => e.type === PROMOTION_EVENT_TYPE.MERGE_PROPOSED));
const mergeCreateResult = repoCreate(mergedDraft);
check('the merged draft is a valid, storable KnowledgeItem', mergeCreateResult.ok === true);

console.log(`\n${pass}/${pass + fail} checks passed.`);
process.exit(fail > 0 ? 1 : 0);
