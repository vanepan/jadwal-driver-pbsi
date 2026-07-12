/* diff-learning-check.mjs — Node check for V2.0.16 "Diff Learning
   Foundation": the full pipeline — Generated Draft -> User Edit ->
   Difference (computeDiff) -> Candidate Knowledge (submitCorrection,
   V2.0.5, unmodified) -> Review Queue -> Approved Knowledge
   (review-workflow-engine.js, Phase 5, unmodified) -> Organizational
   Profile Update (automatic — profile-engine.js never caches, V2.0.12.5/
   14.5). No automatic learning: every step through Approved still
   requires an explicit review call. No AI, no LLM, no production writes
   (memory repository only).
   Run: node scripts/diff-learning-check.mjs   (exit 0 = pass) */

import { LIFECYCLE_STATE } from '../js/v2/knowledge/contracts/lifecycle-contract.js';
import { generateKnowledgeId } from '../js/v2/knowledge/contracts/identity-contract.js';
import { setActiveRepository, create as repoCreate, getById } from '../js/v2/knowledge/repository/knowledge-repository.js';
import { submitForReview, approve } from '../js/v2/knowledge/review/review-workflow-engine.js';
import { buildProfile } from '../js/v2/knowledge/services/profile-service.js';
import { PROFILE_TYPE } from '../js/v2/knowledge/contracts/profile-contract.js';
import {
  submitDraftEditAsCorrection, DIFF_LEARNING_ERRORS,
} from '../js/v2/knowledge/learning/diff-learning-engine.js';

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); }
}

setActiveRepository('memory');

console.log('\n[Diff Learning — NO_CHANGE guard]');
const noChange = submitDraftEditAsCorrection({
  domainType: 'engineering', kind: 'recipient', before: { value: 'Same' }, after: { value: 'Same' }, correctedBy: 'evan',
});
check('identical before/after is rejected as NO_CHANGE, nothing submitted', noChange.ok === false && noChange.error.code === DIFF_LEARNING_ERRORS.NO_CHANGE);

console.log('\n[Diff Learning — Candidate Generation path (no itemId, matches correction-pipeline-engine.js unmodified)]');
const generated = submitDraftEditAsCorrection({
  domainType: 'engineering', kind: 'recipient',
  before: { value: 'Draft Name' }, after: { value: 'Pak Anwar' }, correctedBy: 'evan',
});
check('a real Diff is computed with exactly 1 changed field', generated.diff.fieldsChanged === 1 && generated.diff.entries[0].field === 'value');
check('submission succeeds and generates a brand-new Candidate item', generated.ok === true && generated.submission.generatedItem !== null);
check('the generated item starts life as CANDIDATE lifecycle (never auto-approved)', generated.submission.generatedItem.lifecycleState === LIFECYCLE_STATE.CANDIDATE);
check('the generated item really exists in the repository (no parallel store)', getById(generated.submission.generatedItem.id).ok === true);

console.log('\n[Diff Learning — in-place update path (existing mutable item, matches correction-pipeline-engine.js unmodified)]');
const now = new Date().toISOString();
const draftItem = Object.freeze({
  id: generateKnowledgeId({ domainType: 'engineering', sourceType: 'difftest', sourceRef: 'existing-1' }),
  version: 1, domainType: 'engineering', sourceType: 'difftest', kind: 'recipient',
  payload: { value: 'Old Value' }, confidence: 0.6, lifecycleState: LIFECYCLE_STATE.CANDIDATE,
  provenance: { connectorId: 'difftest', sourceRef: 'existing-1', capturedAt: now },
  approvedBy: null, approvedAt: null, preferenceRationale: null, createdAt: now, updatedAt: now,
});
repoCreate(draftItem);
const updated = submitDraftEditAsCorrection({
  domainType: 'engineering', kind: 'recipient', itemId: draftItem.id,
  before: { value: 'Old Value' }, after: { value: 'New Value' }, correctedBy: 'evan',
});
check('editing an existing mutable item updates it in place (no new item generated)', updated.ok === true && updated.submission.generatedItem === null);
check('the in-place update is reflected in the repository', getById(draftItem.id).data.payload.value === 'New Value');

console.log('\n[Full pipeline — Candidate -> Review Queue -> Approved -> Organizational Profile Update is automatic]');
const beforeApproval = buildProfile('engineering', PROFILE_TYPE.RECIPIENT);
check('before approval, the profile does not yet include "Pak Anwar" (still Candidate, not Approved)', !beforeApproval.ok
  || !beforeApproval.profile.entries.some((e) => e.value === 'Pak Anwar'));

const submitResult = submitForReview(generated.submission.generatedItem.id);
check('submitForReview moves the Candidate into Pending Review (existing engine, unmodified)', submitResult.ok === true
  && submitResult.data.lifecycleState === LIFECYCLE_STATE.PENDING_REVIEW);

const approveResult = approve(generated.submission.generatedItem.id, {
  itemId: generated.submission.generatedItem.id,
  itemVersion: submitResult.data.version,
  toState: LIFECYCLE_STATE.APPROVED,
  approverId: 'evan',
  decidedAt: new Date().toISOString(),
  preferenceRationale: 'Confirmed against the organizational recipient list.',
});
check('approve() succeeds (existing engine, unmodified) — this is the ONLY point Approved Knowledge is reached', approveResult.ok === true
  && approveResult.data.lifecycleState === LIFECYCLE_STATE.APPROVED);

const afterApproval = buildProfile('engineering', PROFILE_TYPE.RECIPIENT);
check('immediately after approval, the VERY NEXT buildProfile() call reflects it — no cache, no polling, no new plumbing', afterApproval.ok === true
  && afterApproval.profile.entries.some((e) => e.value === 'Pak Anwar'));

console.log(`\n${pass}/${pass + fail} checks passed.`);
process.exit(fail > 0 ? 1 : 0);
