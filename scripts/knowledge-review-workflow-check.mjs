/* knowledge-review-workflow-check.mjs — Node check for V2.0.3 "Knowledge
   Review Workflow": Review Queue, Candidate Queue, Review Session,
   Conflict Detection, Review Events, Review History, Promotion Contracts.
   Run: node scripts/knowledge-review-workflow-check.mjs   (exit 0 = pass)

   Entirely V1-free — builds synthetic Draft items directly against the
   Memory repository, exactly like the V2.0.2/V2.0.2.1 checks. Approval/
   Rejection Pipeline itself (submitForReview/approve/reject) is
   Phase-5-real and already covered by knowledge-observability-check.mjs's
   Lifecycle Events section; this check exercises the NEW V2.0.3 layer
   built on top of it. */

import { LIFECYCLE_STATE } from '../src/knowledge/contracts/lifecycle-contract.js';
import { generateKnowledgeId } from '../src/knowledge/contracts/identity-contract.js';
import {
  setActiveRepository, create as repoCreate,
} from '../src/knowledge/repository/knowledge-repository.js';
import { requestTransition } from '../src/knowledge/lifecycle/lifecycle-engine.js';
import { getReviewQueue, getCandidateQueue } from '../src/knowledge/review/review-queue-engine.js';
import { detectConflicts } from '../src/knowledge/review/conflict-detection-engine.js';
import { isKnowledgeConflictReport } from '../src/knowledge/observability/contracts/conflict-report-contract.js';
import {
  startReviewSession, submitInSession, approveInSession, rejectInSession, finishReviewSession,
} from '../src/knowledge/review/review-session-engine.js';
import { REVIEW_EVENT_TYPE } from '../src/knowledge/review/contracts/event-contract.js';
import { REVIEW_SESSION_STATUS } from '../src/knowledge/review/contracts/session-contract.js';
import { listReviewHistory, resetReviewHistory } from '../src/knowledge/review/review-history.js';

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
    id: generateKnowledgeId({ domainType: 'nor', sourceType: 'reviewtest', sourceRef }),
    version: 1, domainType: 'nor', sourceType: 'reviewtest', kind: 'structure',
    payload, confidence: 1, lifecycleState: LIFECYCLE_STATE.DRAFT,
    provenance: Object.freeze({ connectorId: 'reviewtest', sourceRef, capturedAt: now }),
    approvedBy: null, approvedAt: null, preferenceRationale: null,
    createdAt: now, updatedAt: now,
  });
}

const itemA = makeDraftItem('rec-a', { itemCount: 3 });
const itemB = makeDraftItem('rec-b', { itemCount: 7 }); // deliberately different payload -> conflict
check('itemA created as Draft', repoCreate(itemA).ok === true);
check('itemB created as Draft', repoCreate(itemB).ok === true);

requestTransition(itemA.id, LIFECYCLE_STATE.DRAFT, LIFECYCLE_STATE.CANDIDATE);
requestTransition(itemB.id, LIFECYCLE_STATE.DRAFT, LIFECYCLE_STATE.CANDIDATE);

console.log('\n[Conflict Detection]');
const rawCandidates = [
  { ...itemA, version: 2, lifecycleState: LIFECYCLE_STATE.CANDIDATE },
  { ...itemB, version: 2, lifecycleState: LIFECYCLE_STATE.CANDIDATE },
];
const conflicts = detectConflicts(rawCandidates);
check('two distinct un-settled payloads for the same domainType/kind are flagged', conflicts.length === 1);
check('conflict report is well-formed', conflicts.length === 1 && isKnowledgeConflictReport(conflicts[0]));
check('conflict report references both item ids', conflicts.length === 1
  && conflicts[0].itemIds.includes(itemA.id) && conflicts[0].itemIds.includes(itemB.id));

console.log('\n[Candidate Queue]');
const candidateQueue = getCandidateQueue();
check('candidate queue has both items', candidateQueue.length === 2);
check('candidate queue entries satisfy ReviewQueueEntry shape (itemId/itemVersion/enteredQueueAt)', candidateQueue.every((e) => typeof e.itemId === 'string' && typeof e.itemVersion === 'number' && typeof e.enteredQueueAt === 'string'));
check('candidate queue flags both items as conflicted', candidateQueue.every((e) => e.hasConflict === true));
check('candidate queue is ordered oldest-first', candidateQueue[0].enteredQueueAt <= candidateQueue[1].enteredQueueAt);

console.log('\n[Review Session + Events + Promotion history]');
const reviewEvents = [];
const onEvent = (e) => reviewEvents.push(e);
let session = startReviewSession('evan', { onEvent });
check('session starts open with the given reviewerId', session.reviewerId === 'evan' && session.decisions.length === 0);

({ session } = submitInSession(session, itemA.id, { onEvent }));
({ session } = submitInSession(session, itemB.id, { onEvent }));
check('both items moved to pending_review after submitInSession', candidateQueueEmpty());
function candidateQueueEmpty() { return getCandidateQueue().length === 0; }

const approveOutcome = approveInSession(session, itemA.id, { decidedAt: new Date().toISOString(), preferenceRationale: 'Chosen as the canonical structure.' }, { onEvent });
session = approveOutcome.session;
check('approveInSession succeeds and records a promotion', approveOutcome.result.ok === true);

const rejectOutcome = rejectInSession(session, itemB.id, { decidedAt: new Date().toISOString() }, { onEvent });
session = rejectOutcome.session;
check('rejectInSession succeeds (pending_review -> candidate)', rejectOutcome.result.ok === true);

check('session accumulated 4 decisions (2 submits + 1 approve + 1 reject)', session.decisions.length === 4);

session = finishReviewSession(session, { onEvent });
check('session status is completed with a completedAt timestamp', session.status === REVIEW_SESSION_STATUS.COMPLETED && !!session.completedAt);

check('review events: 1 started + 4 decision_recorded + 1 completed = 6', reviewEvents.filter((e) => e.type === REVIEW_EVENT_TYPE.SESSION_STARTED).length === 1
  && reviewEvents.filter((e) => e.type === REVIEW_EVENT_TYPE.DECISION_RECORDED).length === 4
  && reviewEvents.filter((e) => e.type === REVIEW_EVENT_TYPE.SESSION_COMPLETED).length === 1);

console.log('\n[Review History]');
const allHistory = listReviewHistory();
check('review history recorded all 4 promotions', allHistory.length === 4);
const itemAHistory = listReviewHistory(itemA.id);
check('per-item review history filters correctly (submit + approve for itemA)', itemAHistory.length === 2
  && itemAHistory[1].toState === LIFECYCLE_STATE.APPROVED && itemAHistory[1].preferenceRationale === 'Chosen as the canonical structure.');

console.log('\n[Review Queue after resolution]');
const finalReviewQueue = getReviewQueue({ onEvent });
check('review queue is empty now (A approved, B back to candidate)', finalReviewQueue.length === 0);
const finalCandidateQueue = getCandidateQueue({ onEvent });
check('candidate queue has only itemB now, no longer flagged as conflicted (itemA left the group)', finalCandidateQueue.length === 1
  && finalCandidateQueue[0].itemId === itemB.id && finalCandidateQueue[0].hasConflict === false);

console.log(`\n${pass}/${pass + fail} checks passed.`);
process.exit(fail > 0 ? 1 : 0);
