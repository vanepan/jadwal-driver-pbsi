/* document-intelligence-check.mjs — Node check for V2.0.6 "Document
   Intelligence Runtime": real DocumentPipeline orchestration, the NOR
   pilot's five real steps (analyze/draft/validate/explain/recommend),
   Document Context/Session, and Knowledge Trace.
   Run: node scripts/document-intelligence-check.mjs   (exit 0 = pass)

   Entirely V1-free — every file this check touches (step-registry,
   document-intelligence-engine, nor-analyzer/generator/validator/
   explainer/recommender, session-store, trace-service) only reads the
   in-memory Knowledge repository, never js/petty-cash/*.js or
   js/firebase.js — unlike knowledge-acquisition-dom-check.mjs, no browser
   is required here. */

import { LIFECYCLE_STATE } from '../js/v2/knowledge/contracts/lifecycle-contract.js';
import { generateKnowledgeId } from '../js/v2/knowledge/contracts/identity-contract.js';
import { setActiveRepository, create as repoCreate } from '../js/v2/knowledge/repository/knowledge-repository.js';
import { promoteToCandidate } from '../js/v2/knowledge/promotion/promotion-engine.js';
import { submitForReview, approve } from '../js/v2/knowledge/review/review-workflow-engine.js';
import { traceKnowledge } from '../js/v2/knowledge/services/trace-service.js';
import { BUILDER_EVENT_TYPE } from '../js/v2/knowledge/builder/contracts/state-contract.js';

import { runPipeline } from '../js/v2/document-intelligence/document-intelligence-engine.js';
import { listSteps } from '../js/v2/document-intelligence/registry/step-registry.js';
import { listAnalyzers } from '../js/v2/document-intelligence/registry/document-registry.js';
import {
  startDocumentSession, transitionDocumentSession, resetDocumentSessionStore,
} from '../js/v2/document-intelligence/session-store.js';
import { DOCUMENT_SESSION_STATE } from '../js/v2/document-intelligence/contracts/document-context-contract.js';
import { validateNorInput } from '../js/v2/document-intelligence/nor/nor-validator.js';
import { NOR_PIPELINE } from '../js/v2/document-intelligence/nor/index.js'; // side effect: registers all 5 NOR steps

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); }
}

// NOTE: resetStepRegistry()/resetDocumentRegistry() are NOT called here —
// this is a fresh Node process, and the static `import ... from
// '.../nor/index.js'` above already ran (and self-registered all 5 NOR
// steps) before this line executes, since ES module imports are
// evaluated before a module's own top-level code. Resetting afterward
// would just wipe those real registrations with nothing left to
// re-populate them (dynamic re-import of an already-loaded module is a
// cache hit, not a re-execution).
setActiveRepository('memory');
resetDocumentSessionStore();

console.log('\n[Registries]');
check('nor-analyzer registered in document-registry', listAnalyzers().some((a) => a.id === 'nor-analyzer'));
check('all 5 NOR steps registered in step-registry', listSteps('nor').length === 5);

/* ── Seed 2 Approved nor/structure items so the DRAFT/RECOMMEND steps
   have something real to statistically summarize. ─────────────────── */
function makeApprovedNorItem(sourceRef, payload) {
  const now = new Date().toISOString();
  const item = Object.freeze({
    id: generateKnowledgeId({ domainType: 'nor', sourceType: 'ditest', sourceRef }),
    version: 1, domainType: 'nor', sourceType: 'ditest', kind: 'structure',
    payload, confidence: 1, lifecycleState: LIFECYCLE_STATE.DRAFT,
    provenance: Object.freeze({ connectorId: 'ditest', sourceRef, capturedAt: now }),
    approvedBy: null, approvedAt: null, preferenceRationale: null, createdAt: now, updatedAt: now,
  });
  repoCreate(item);
  promoteToCandidate(item.id);
  submitForReview(item.id);
  approve(item.id, { approverId: 'evan', decidedAt: now, preferenceRationale: 'Seed data for document intelligence check.' });
  return item.id;
}

const idA = makeApprovedNorItem('rec-a', { signatoryTopCount: 3, signatoryBottomCount: 2, itemCount: 4, reimburseLineCount: 1 });
const idB = makeApprovedNorItem('rec-b', { signatoryTopCount: 3, signatoryBottomCount: 1, itemCount: 6, reimburseLineCount: 0 });
// expected averages: top=3, bottom=1.5->2 (rounded), itemCount=5, reimburse=0.5->1 (rounded, banker's-unaware Math.round -> 1)

console.log('\n[Document Context / Session]');
const session = startDocumentSession('nor');
check('session starts in ANALYZING', session.state === DOCUMENT_SESSION_STATE.ANALYZING && session.domainType === 'nor');

console.log('\n[Full pipeline run — analyze -> draft -> validate -> explain -> recommend]');
const events = [];
const runResult = runPipeline(NOR_PIPELINE, {
  pipelineId: session.id,
  sessionId: session.id,
  input: { norNumber: 'NOR-TEST-1', expenseIds: ['e1', 'e2'] },
  onEvent: (e) => events.push(e),
});
check('pipeline completes successfully', runResult.ok === true && runResult.stepsCompleted === 5);

check('ANALYZE: classified as domainType nor with full confidence', runResult.results.analyze.classification.domainType === 'nor' && runResult.results.analyze.classification.confidence === 1);
check('ANALYZE: structure names the real NOR sections', runResult.results.analyze.structure.sectionLabels.includes('items') && runResult.results.analyze.structure.sectionLabels.includes('signatories'));

const draftOut = runResult.results.draft;
check('DRAFT: proposes structural suggestions from the 2 Approved items', draftOut.ok === true && draftOut.sampleSize === 2);
check('DRAFT: suggested signatory counts match the real average (3 top, 2 bottom rounded)', draftOut.draft.fields.suggestedSignatoryTopCount === 3 && draftOut.draft.fields.suggestedSignatoryBottomCount === 2);
check('DRAFT: never proposes business content like norNumber/subject', !('norNumber' in draftOut.draft.fields) && !('subject' in draftOut.draft.fields));
check('DRAFT: cites the real source knowledge ids', draftOut.citedKnowledgeIds.includes(idA) && draftOut.citedKnowledgeIds.includes(idB));

check('VALIDATE: input with norNumber + expenseIds passes', runResult.results.validate.ok === true && runResult.results.validate.issues.length === 0);
const failingValidation = validateNorInput({});
check('VALIDATE (direct call): empty input reports both missing-field issues, mirroring generateNor()\'s own guard clauses', failingValidation.ok === false && failingValidation.issues.length === 2);

check('EXPLAIN: one DocumentExplanation per cited knowledge id', runResult.results.explain.length === draftOut.citedKnowledgeIds.length);
check('EXPLAIN: explanations are grounded in the real cited ids', runResult.results.explain.every((e) => draftOut.citedKnowledgeIds.includes(e.citedKnowledgeIds[0])));

check('RECOMMEND: 3 recommendations, each citing the real source items', runResult.results.recommend.length === 3
  && runResult.results.recommend.every((r) => r.citedKnowledgeIds.includes(idA)));

check('events: started + 5×(stage_started/stage_completed) + completed = 11', events.filter((e) => e.type === BUILDER_EVENT_TYPE.STARTED).length === 1
  && events.filter((e) => e.type === BUILDER_EVENT_TYPE.STAGE_STARTED).length === 5
  && events.filter((e) => e.type === BUILDER_EVENT_TYPE.STAGE_COMPLETED).length === 5
  && events.filter((e) => e.type === BUILDER_EVENT_TYPE.COMPLETED).length === 1);

console.log('\n[Session transitions]');
const toDrafting = transitionDocumentSession(session.id, DOCUMENT_SESSION_STATE.DRAFTING);
check('analyzing -> drafting is legal', toDrafting.ok === true);
const illegalJump = transitionDocumentSession(session.id, DOCUMENT_SESSION_STATE.FINALIZED);
check('drafting -> finalized directly is rejected (must pass through reviewing)', illegalJump.ok === false && illegalJump.error.code === 'ILLEGAL_TRANSITION');

console.log('\n[Missing step handler]');
const unregisteredPipeline = Object.freeze({ id: 'unregistered', domainType: 'memorandum', steps: Object.freeze(['analyze']) });
const missingResult = runPipeline(unregisteredPipeline, {});
check('a pipeline for a domainType with no registered steps fails cleanly (never silently succeeds)', missingResult.ok === false && missingResult.error.code === 'STEP_NOT_FOUND');

console.log('\n[Knowledge Trace]');
const trace = traceKnowledge(idA);
check('traceKnowledge composes explanation + evolution + dependencies', trace.ok === true
  && trace.data.explanation !== null
  && trace.data.evolution.entries.length >= 1
  && Array.isArray(trace.data.dependencies));
check('trace evolution reflects the real promotion history (draft -> candidate -> pending_review -> approved)', trace.data.evolution.entries.length === 4);

console.log(`\n${pass}/${pass + fail} checks passed.`);
process.exit(fail > 0 ? 1 : 0);
