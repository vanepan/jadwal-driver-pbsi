/* conversation-ownership-check.mjs — Phase 6, "Conversation Intelligence
   Foundation".

   Same two-part shape as knowledge-ownership-check.mjs / archive-ownership-
   check.mjs / learning-ownership-check.mjs, on purpose: a reader who
   understands one understands all four.

   1. ARCHITECTURAL (static). Asserts Conversation has exactly one owner,
      one repository boundary, that its own engines never bypass a sibling
      domain's service boundary, and — Part 8's own rule — that NOTHING
      under knowledge/, organizational-memory/, learning/ or
      document-intelligence/ ever imports conversation/ (the "Conversation
      Memory must never contaminate Organization Memory" boundary, made
      checkable rather than a claim in a comment).

   2. BEHAVIOURAL (runtime). Drives the real Conversation Service end to
      end — including the mission's own worked example, "Buatkan NOR
      perjalanan dinas." — and asserts the guarantees Parts 1-7 promise:
      deterministic intent detection, minimal questioning, honest
      optimizer resolution (never fabricated), a real Explainable Context
      Object, and Task Executor dispatch to REAL, already-owned services.

   Deterministic. No AI, no scoring beyond plain arithmetic, no fabricated
   data, no Firebase touch.
   Run: node scripts/conversation-ownership-check.mjs   (exit 0 = pass) */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { resetConversationRepository } from '../js/v2/conversation/repository/conversation-repository.js';
import {
  startConversation, continueConversation, completeConversation, cancelConversation,
  resumeConversation, listConversationHistory, explainConversation, findConversation,
  CONVERSATION_STATE,
} from '../js/v2/conversation/services/conversation-service.js';
import {
  CONVERSATION_GRAPH, canTransitionConversation, isTerminalConversationState,
} from '../js/v2/conversation/contracts/conversation-contract.js';
import { detectIntent } from '../js/v2/conversation/intent/intent-engine.js';
import { INTENT } from '../js/v2/conversation/contracts/intent-contract.js';

import { resetLearningRepository } from '../js/v2/learning/repository/learning-repository.js';
import { listLearningEvents, LEARNING_KIND, CORRECTION_TYPE } from '../js/v2/learning/services/learning-service.js';
import { resetArchiveRepository } from '../js/v2/organizational-memory/repository/archive-repository.js';
import { computeCoverageReport } from '../js/v2/organizational-memory/coverage-engine.js';
import { computeOrganizationalMemory } from '../js/v2/organizational-memory/organizational-memory-engine.js';
import {
  setKnowledgeBackend, ingest, promoteKnowledge,
} from '../js/v2/knowledge/services/knowledge-service.js';
import { LIFECYCLE_STATE } from '../js/v2/knowledge/contracts/lifecycle-contract.js';
import {
  createOverrideDraft, promoteOverrideToCandidate, submitOverrideForReview, approveOverride,
  PROFILE_OVERRIDE_TYPE, OVERRIDE_ACTION,
} from '../js/v2/knowledge/services/profile-override-service.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0; let fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); }
}

const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

function allSourceFiles() {
  const out = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(rel);
      else if (entry.name.endsWith('.js')) out.push({ rel, code: stripComments(read(rel)) });
    }
  }('js/v2'));
  return out;
}
const FILES = allSourceFiles();

const OWNER = 'js/v2/conversation/services/conversation-service.js';
const REPO_RE = /conversation\/repository\/conversation-repository\.js$/;

/* ══ 1. ONE OWNER ═════════════════════════════════════════════════════ */

console.log('\n[Part 1 — exactly ONE owner writes the Conversation Repository]');
{
  const writers = [];
  const readers = [];
  for (const { rel, code } of FILES) {
    if (rel === OWNER || rel.includes('/conversation/repository/')) continue;
    const blocks = code.match(/import\s*\{[^}]*\}\s*from\s*'[^']*'/gs) || [];
    for (const b of blocks) {
      const m = b.match(/from\s*'([^']*)'/);
      if (!m || !REPO_RE.test(m[1])) continue;
      const clause = b.slice(b.indexOf('{') + 1, b.lastIndexOf('}'));
      readers.push(rel);
      for (const w of ['create', 'appendVersion']) {
        if (new RegExp(`(^|[,{\\s])${w}(\\s+as\\s+\\w+)?\\s*(,|$)`).test(clause)) writers.push(`${rel}:${w}`);
      }
    }
  }
  check(`NO module outside the owner imports a Conversation Repository WRITER${writers.length ? ` — FOUND: ${writers.join(', ')}` : ''}`,
    writers.length === 0);
  check(`NO module outside the owner imports conversation-repository.js AT ALL${readers.length ? ` — FOUND: ${[...new Set(readers)].join(', ')}` : ''}`,
    readers.length === 0);

  const ownerSrc = stripComments(read(OWNER));
  check('the owner itself DOES write the repository (it is the owner, not a delegator)',
    /create as repoCreate/.test(ownerSrc) && /appendVersion as repoAppendVersion/.test(ownerSrc));
}

console.log('\n[Part 2 — Conversation never bypasses a sibling domain\'s service boundary]');
{
  const engineFiles = [
    'js/v2/conversation/questionnaire/question-optimizer.js',
    'js/v2/conversation/context/context-builder.js',
    'js/v2/conversation/task-executor.js',
    'js/v2/conversation/intent/intent-engine.js',
    'js/v2/conversation/questionnaire/questionnaire-engine.js',
  ];
  const offenders = [];
  for (const rel of engineFiles) {
    const src = stripComments(read(rel));
    const blocks = src.match(/import\s*\{[^}]*\}\s*from\s*'[^']*'/gs) || [];
    for (const b of blocks) {
      const m = b.match(/from\s*'([^']*)'/);
      if (m && /\/repository\//.test(m[1])) offenders.push(`${rel} -> ${m[1]}`);
    }
  }
  check(`question-optimizer.js / context-builder.js / task-executor.js / intent-engine.js / questionnaire-engine.js import NO repository, from ANY domain${offenders.length ? ` — FOUND: ${offenders.join(', ')}` : ''}`,
    offenders.length === 0);
}

console.log('\n[Part 8 — Conversation Memory never contaminates Organization Memory: nothing upstream imports conversation/]');
{
  const upstream = FILES.filter((f) => /^js\/v2\/(knowledge|organizational-memory|learning|document-intelligence|ai-foundation|file-storage)\//.test(f.rel));
  const offenders = [];
  for (const { rel, code } of upstream) {
    const blocks = code.match(/import\s*\{[^}]*\}\s*from\s*'[^']*'/gs) || [];
    for (const b of blocks) {
      const m = b.match(/from\s*'([^']*)'/);
      if (m && /\/conversation\//.test(m[1])) offenders.push(`${rel} -> ${m[1]}`);
    }
  }
  check(`NO module under knowledge/, organizational-memory/, learning/, document-intelligence/, ai-foundation/ or file-storage/ imports conversation/${offenders.length ? ` — FOUND: ${offenders.join(', ')}` : ''}`,
    offenders.length === 0);
}

console.log('\n[Part 3 — no orphan lifecycle states, exactly one authority]');
{
  const states = Object.values(CONVERSATION_STATE);
  check('every declared state has an entry in CONVERSATION_GRAPH (no dangling state)',
    states.every((s) => Array.isArray(CONVERSATION_GRAPH[s])));
  const reachable = new Set([CONVERSATION_STATE.STARTED]);
  for (const edges of Object.values(CONVERSATION_GRAPH)) edges.forEach((e) => reachable.add(e));
  check('every declared state is REACHABLE', states.every((s) => reachable.has(s)));
  check('COMPLETED / CANCELLED / FAILED are all absorbing (terminal)',
    [CONVERSATION_STATE.COMPLETED, CONVERSATION_STATE.CANCELLED, CONVERSATION_STATE.FAILED]
      .every((s) => CONVERSATION_GRAPH[s].length === 0));
  check('isTerminalConversationState recognizes exactly those three',
    isTerminalConversationState(CONVERSATION_STATE.COMPLETED) && isTerminalConversationState(CONVERSATION_STATE.CANCELLED)
    && isTerminalConversationState(CONVERSATION_STATE.FAILED) && !isTerminalConversationState(CONVERSATION_STATE.ACTIVE)
    && !isTerminalConversationState(CONVERSATION_STATE.READY));
}

console.log('\n[Part 6 — every named Task Executor dispatch has a REAL call site, not just a function]');
{
  const src = stripComments(read('js/v2/conversation/task-executor.js'));
  const dispatches = [
    ['CREATE_NOR -> proposeNorFields', 'proposeNorFields('],
    ['CORRECT_METADATA -> recordCorrection', 'recordCorrection('],
    ['REVIEW_KNOWLEDGE -> getPendingReviewKnowledge', 'getPendingReviewKnowledge('],
    ['GENERATE_EXECUTIVE_BRIEFING -> computeCoverageReport', 'computeCoverageReport('],
    ['GENERATE_EXECUTIVE_BRIEFING -> computeOrganizationalMemory', 'computeOrganizationalMemory('],
  ];
  for (const [label, needle] of dispatches) check(`${label} — real call site in task-executor.js`, src.includes(needle));
}

/* ══ 2. BEHAVIOUR ═════════════════════════════════════════════════════ */

setKnowledgeBackend('memory');
resetConversationRepository();
resetLearningRepository();
resetArchiveRepository();

console.log('\n[Behaviour — detectIntent: deterministic, explainable, honestly UNKNOWN when nothing matches]');
{
  const r = detectIntent('Buatkan NOR perjalanan dinas.');
  check('detects CREATE_NOR', r.intent === INTENT.CREATE_NOR);
  check('confidence is a real number > 0', typeof r.confidence === 'number' && r.confidence > 0);
  check('matchedKeywords includes "nor" and a create verb', r.matchedKeywords.includes('nor') && r.matchedKeywords.some((k) => ['buatkan', 'buat'].includes(k)));
  check('matchedPatterns fired', r.matchedPatterns.length > 0);
  check('extractedFacts.type is "Perjalanan Dinas" — from the utterance itself', r.extractedFacts.type === 'Perjalanan Dinas');

  const unknown = detectIntent('apa kabar hari ini');
  check('an unrelated utterance is honestly UNKNOWN, never a guess', unknown.intent === INTENT.UNKNOWN && unknown.confidence === 0);
}

let convId1;
console.log('\n[Behaviour — Part 1/2/3: startConversation detects intent, extracts "type" from the utterance, asks only what is genuinely missing]');
{
  const started = startConversation({ utterance: 'Buatkan NOR perjalanan dinas.', actorId: 'evan' });
  check('startConversation succeeds', started.ok);
  const conv = started.data;
  check('intent detected is CREATE_NOR', conv.currentIntent.intent === INTENT.CREATE_NOR);
  check('"type" was already known from the utterance — never asked', conv.gatheredFacts.type === 'Perjalanan Dinas');
  check('conversation is ACTIVE (genuine facts still missing)', conv.state === CONVERSATION_STATE.ACTIVE);
  const missingFields = conv.missingFacts.map((q) => q.field);
  check('exactly the mission\'s own missing list: destination/traveler/departureDate/returnDate/budget',
    ['destination', 'traveler', 'departureDate', 'returnDate', 'budget'].every((f) => missingFields.includes(f)) && missingFields.length === 5);
  convId1 = conv.id;
}

console.log('\n[Behaviour — Part 4: Question Optimizer resolves "traveler" from an Approved Profile Override, never asks again]');
{
  const draft = createOverrideDraft({
    domainType: 'nor', overrideType: PROFILE_OVERRIDE_TYPE.BUSINESS_RULE, key: 'default:traveler', action: OVERRIDE_ACTION.DEFINE,
    payload: {
      condition: 'domainType=nor', action: 'Unit Teknik', rationale: 'Pelaksana baku untuk NOR domain nor.', active: true,
    },
    authoredBy: 'evan',
  });
  check('override draft created', draft.ok);
  promoteOverrideToCandidate(draft.data.id);
  submitOverrideForReview(draft.data.id);
  const approved = approveOverride(draft.data.id, { approverId: 'evan', decidedAt: new Date().toISOString(), preferenceRationale: 'Sudah baku.' });
  check('override approved', approved.ok);

  const continued = continueConversation(convId1, {});
  check('continueConversation succeeds even with no new human answers (recomputes the Optimizer)', continued.ok);
  check('"traveler" is now resolved from the Profile Override, never asked', continued.data.gatheredFacts.traveler === 'Unit Teknik');
  check('"traveler" no longer appears in missingFacts', !continued.data.missingFacts.some((q) => q.field === 'traveler'));
  check('explainability.policiesApplied records the skip with a real rationale and source',
    continued.data.explainability.policiesApplied.some((p) => p.field === 'traveler' && p.source === 'profile_override'));
  check('still ACTIVE — four genuinely per-occasion facts remain', continued.data.state === CONVERSATION_STATE.ACTIVE && continued.data.missingFacts.length === 4);
}

console.log('\n[Behaviour — Part 3: a human answers the remaining facts, reaching READY with a real Context built]');
{
  const continued2 = continueConversation(convId1, {
    destination: 'Jakarta', departureDate: '2026-08-01', returnDate: '2026-08-03', budget: 2000000,
  });
  check('continueConversation succeeds', continued2.ok);
  check('all facts now known — READY', continued2.data.state === CONVERSATION_STATE.READY);
  check('missingFacts is empty', continued2.data.missingFacts.length === 0);
  check('an Explainable Context Object was built', !!continued2.data.context && continued2.data.context.domainType === 'nor');
  check('explainability.questionsAsked recorded the 4 human answers', continued2.data.explainability.questionsAsked.length === 4);
}

console.log('\n[Behaviour — Part 6: with NO Approved NOR structural Knowledge yet, the Task Executor honestly refuses to fabricate a draft]');
{
  const completed = completeConversation(convId1);
  check('completeConversation succeeds structurally — a real, recorded outcome, even though the outcome is failure', completed.ok);
  check('conversation moved to FAILED — the executor genuinely could not produce a draft', completed.data.state === CONVERSATION_STATE.FAILED);
  check('the failure names the REAL underlying reason (NO_KNOWLEDGE), never a fabricated draft', completed.data.taskResult.error.code === 'NO_KNOWLEDGE');
}

let started2;
console.log('\n[Behaviour — Part 6: with real Approved NOR structural Knowledge, the Task Executor produces a real structural draft]');
{
  const now = () => new Date().toISOString();
  const item = {
    id: 'knowledge:nor:conv-check-fixture:1',
    version: 1,
    domainType: 'nor',
    sourceType: 'manual-file',
    kind: 'structure',
    payload: {
      signatoryTopCount: 2, signatoryBottomCount: 1, itemCount: 3, reimburseLineCount: 4,
    },
    confidence: 1,
    lifecycleState: LIFECYCLE_STATE.DRAFT,
    provenance: { connectorId: 'manual-file', sourceRef: 'conv-check-fixture', capturedAt: now() },
    approvedBy: null,
    approvedAt: null,
    preferenceRationale: null,
    createdAt: now(),
    updatedAt: now(),
  };
  ingest(item);
  promoteKnowledge(item.id, { approverId: 'evan', decidedAt: now(), preferenceRationale: 'Benar.' });

  started2 = startConversation({ utterance: 'Buatkan NOR perjalanan dinas ke Bandung.', actorId: 'evan' });
  check('second conversation starts and detects CREATE_NOR', started2.ok && started2.data.currentIntent.intent === INTENT.CREATE_NOR);
  check('"traveler" is resolved from the very first turn (the Profile Override is already Approved)', started2.data.gatheredFacts.traveler === 'Unit Teknik');
  check('"destination" is NOT auto-filled from the earlier FAILED conversation — only CONFIRMED (COMPLETED) occasions count', !('destination' in started2.data.gatheredFacts));

  const answered = continueConversation(started2.data.id, {
    destination: 'Bandung', departureDate: '2026-09-01', returnDate: '2026-09-02', budget: 1500000,
  });
  check('reaches READY', answered.ok && answered.data.state === CONVERSATION_STATE.READY);
  started2 = answered;

  const completed2 = completeConversation(started2.data.id);
  check('completeConversation succeeds and COMPLETES', completed2.ok && completed2.data.state === CONVERSATION_STATE.COMPLETED);
  check('taskResult carries a real structural draft citing the real Knowledge fixture',
    completed2.data.taskResult.kind === 'nor_structural_draft' && completed2.data.taskResult.citedKnowledgeIds.includes(item.id));
  check('the draft never invents destination/budget/recipients — only structural counts',
    Object.keys(completed2.data.taskResult.draft.fields).every((k) => k.toLowerCase().includes('count')));
  started2 = completed2;
}

console.log('\n[Behaviour — Part 4: Question Optimizer reuses a CONFIRMED prior answer via PREVIOUS_CONVERSATION; question count keeps shrinking]');
{
  const started3 = startConversation({ utterance: 'Buatkan NOR perjalanan dinas.', actorId: 'evan' });
  check('third conversation starts', started3.ok);
  check('"traveler" resolved from the Profile Override', started3.data.gatheredFacts.traveler === 'Unit Teknik');
  check('"destination"/"departureDate"/"returnDate"/"budget" all resolved from the prior COMPLETED conversation',
    started3.data.gatheredFacts.destination === 'Bandung'
    && started3.data.gatheredFacts.departureDate === '2026-09-01'
    && started3.data.gatheredFacts.returnDate === '2026-09-02'
    && started3.data.gatheredFacts.budget === 1500000);
  check('nothing left to ask — the THIRD request reaches READY on the very first turn', started3.data.state === CONVERSATION_STATE.READY && started3.data.missingFacts.length === 0);
  check('every skip explains its real source and evidence (Part 7)',
    started3.data.explainability.questionsSkipped.filter((q) => q.field === 'destination')
      .every((q) => q.source === 'previous_conversation' && q.evidence.conversationId === started2.data.id));

  const cancelled = cancelConversation(started3.data.id, { reason: 'test cleanup — also proves READY -> CANCELLED is legal' });
  check('cancelConversation succeeds from READY', cancelled.ok && cancelled.data.state === CONVERSATION_STATE.CANCELLED);
}

console.log('\n[Behaviour — Part 6: CORRECT_METADATA dispatches to the REAL Learning Service — Conversation keeps no ledger of its own]');
{
  const beforeCount = listLearningEvents({ kind: LEARNING_KIND.CORRECTION, correctionType: CORRECTION_TYPE.METADATA }).data.length;
  const startedC = startConversation({ utterance: 'Tolong koreksi metadata dokumen ini.', actorId: 'evan' });
  check('detects CORRECT_METADATA', startedC.ok && startedC.data.currentIntent.intent === INTENT.CORRECT_METADATA);
  const answeredC = continueConversation(startedC.data.id, { domainType: 'nor', targetKey: 'is:conv-check-1', correctedValue: 'diperbaiki' });
  check('reaches READY', answeredC.ok && answeredC.data.state === CONVERSATION_STATE.READY);
  const completedC = completeConversation(startedC.data.id);
  check('COMPLETES', completedC.ok && completedC.data.state === CONVERSATION_STATE.COMPLETED);
  const afterCount = listLearningEvents({ kind: LEARNING_KIND.CORRECTION, correctionType: CORRECTION_TYPE.METADATA }).data.length;
  check('a REAL Learning Event was recorded through learning-service.js', afterCount === beforeCount + 1);
  check('taskResult names the real learningEventId', typeof completedC.data.taskResult.learningEventId === 'string');
}

console.log('\n[Behaviour — Part 6: GENERATE_EXECUTIVE_BRIEFING composes REAL, already-existing reports — invents no new number]');
{
  const startedB = startConversation({ utterance: 'Buatkan ringkasan eksekutif untuk domain nor.', actorId: 'evan' });
  check('detects GENERATE_EXECUTIVE_BRIEFING', startedB.ok && startedB.data.currentIntent.intent === INTENT.GENERATE_EXECUTIVE_BRIEFING);
  check('domainType "nor" extracted directly from the utterance', startedB.data.gatheredFacts.domainType === 'nor');
  check('reaches READY on the first turn', startedB.data.state === CONVERSATION_STATE.READY);
  const completedB = completeConversation(startedB.data.id);
  check('COMPLETES', completedB.ok && completedB.data.state === CONVERSATION_STATE.COMPLETED);

  // Both reports carry their own `computedAt` — real, and expected to differ
  // by milliseconds between two separate calls. Everything ELSE must be
  // byte-identical, which is the actual claim ("invents no new number").
  const withoutComputedAt = (v) => JSON.stringify(v, (k, val) => (k === 'computedAt' ? undefined : val));
  const directCoverage = computeCoverageReport('nor');
  const directOrgMemory = computeOrganizationalMemory('nor');
  check('coverage numbers are IDENTICAL to calling computeCoverageReport() directly',
    withoutComputedAt(completedB.data.taskResult.coverage) === withoutComputedAt(directCoverage.data));
  check('organization memory numbers are IDENTICAL to calling computeOrganizationalMemory() directly',
    withoutComputedAt(completedB.data.taskResult.organizationMemory) === withoutComputedAt(directOrgMemory.data));
}

console.log('\n[Behaviour — Part 1: resumeConversation is a pure re-entry — mutates nothing]');
{
  const startedR = startConversation({ utterance: 'Buatkan NOR perjalanan dinas.', actorId: 'evan-r' });
  const before = findConversation(startedR.data.id).data.version;
  const resumed1 = resumeConversation(startedR.data.id);
  const resumed2 = resumeConversation(startedR.data.id);
  check('resumeConversation succeeds', resumed1.ok && resumed2.ok);
  check('nextQuestion names a real missing field', !!resumed1.data.nextQuestion && typeof resumed1.data.nextQuestion.field === 'string');
  check('calling it twice performs ZERO writes (version unchanged)', findConversation(startedR.data.id).data.version === before);
}

console.log('\n[Behaviour — lifecycle guards: terminal states refuse continue/complete/cancel]');
{
  const startedT = startConversation({ utterance: 'Buatkan NOR perjalanan dinas.', actorId: 'evan-t' });
  const cancelledT = cancelConversation(startedT.data.id, { reason: 'test' });
  check('cancelled', cancelledT.ok && cancelledT.data.state === CONVERSATION_STATE.CANCELLED);
  const continueAfterCancel = continueConversation(startedT.data.id, { destination: 'X' });
  check('continueConversation on a CANCELLED conversation is refused', continueAfterCancel.ok === false && continueAfterCancel.error.code === 'ILLEGAL_TRANSITION');
  const completeAfterCancel = completeConversation(startedT.data.id);
  check('completeConversation on a CANCELLED conversation is refused (NOT_READY)', completeAfterCancel.ok === false && completeAfterCancel.error.code === 'NOT_READY');
  const cancelAgain = cancelConversation(startedT.data.id);
  check('cancelling an already-CANCELLED conversation is refused', cancelAgain.ok === false && cancelAgain.error.code === 'ILLEGAL_TRANSITION');
}

console.log('\n[Behaviour — Part 2: an unrecognized utterance is honestly FAILED, never guessed]');
{
  const startedU = startConversation({ utterance: 'apa kabar hari ini', actorId: 'evan-u' });
  check('startConversation succeeds structurally', startedU.ok);
  check('intent is UNKNOWN', startedU.data.currentIntent.intent === INTENT.UNKNOWN);
  check('conversation is FAILED, never ACTIVE/READY on a guess', startedU.data.state === CONVERSATION_STATE.FAILED);
}

console.log('\n[Behaviour — read surface: listConversationHistory + explainConversation]');
{
  const history = listConversationHistory({ actorId: 'evan' });
  check('listConversationHistory returns real accumulated conversations for this actor', history.ok && history.data.length >= 3);
  const explained = explainConversation(started2.data.id);
  check('explainConversation answers intent/known/missing', explained.ok && explained.data.intent === INTENT.CREATE_NOR
    && explained.data.knownFacts.length === 6 && explained.data.missingFacts.length === 0);
  check('explainConversation names real questionsSkipped, each with a source', explained.data.questionsSkipped.length > 0
    && explained.data.questionsSkipped.every((q) => typeof q.source === 'string'));
}

console.log('\n[Sprint 11.8 (Production Readiness) — "Average Questions Asked" is real, computable data over listConversationHistory]');
{
  const all = listConversationHistory({});
  check('listConversationHistory({}) (no filter) returns every real conversation created above', all.ok && all.data.length >= 3);
  check('every real conversation carries a real explainability.questionsAsked array (the field this metric aggregates)', all.data.every((c) => Array.isArray(c.explainability && c.explainability.questionsAsked)));
  const manualAverage = all.data.reduce((s, c) => s + c.explainability.questionsAsked.length, 0) / all.data.length;
  check('the average is a genuine arithmetic mean over real per-conversation counts (never fabricated)', manualAverage >= 0 && Number.isFinite(manualAverage));
}

console.log(`\n${pass}/${pass + fail} checks passed.`);
if (fail > 0) process.exit(1);
