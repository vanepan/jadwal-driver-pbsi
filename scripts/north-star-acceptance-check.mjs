/* north-star-acceptance-check.mjs — Phase 8.5, North Star Validation & Readiness.

   Executable acceptance-scenario harness for the North Star pipeline
   (Prompt -> Problem Classification -> Intent Detection -> NOR Type
   Resolution -> Conversation -> Knowledge Retrieval -> Knowledge Gap
   Detection -> Reasoning -> Composer -> Review Model -> Learning), driven
   for real, end to end, through the EXISTING, unmodified pipeline —
   mirrors problem-solving-integration-check.mjs's own real-drive discipline
   (no mocks, no fabricated output). Reuses every existing exported surface
   (beginProblemSolving, continueConversation, composeApprovedNor,
   explainConversation, explainDynamicConversation, detectKnowledgeGaps,
   reason, listKnowledge, listLearningEvents) — this sprint's own brief
   ("prove the capability does not already exist... reuse existing
   architecture") forbids inventing a second instrumentation layer when
   Phase 6/7's own explain*() surfaces already report exactly this.

   This script does two things:
   1. Asserts on facts that must hold if the North-Star-Gap-Closure work
      already landed this session is genuinely correct (regression floor).
   2. Prints a structured JSON trace per scenario to stdout, which
      docs/NORTH_STAR_VALIDATION_REPORT.md's own numbers are read from
      directly — every figure in that report traces back to a line printed
      here, never an estimate.

   Deterministic. No AI, no Firebase touch.
   Run: node scripts/north-star-acceptance-check.mjs   (exit 0 = pass) */

import {
  setKnowledgeBackend, listKnowledge, LIFECYCLE_STATE,
} from '../js/v2/knowledge/services/knowledge-service.js';
import { resetConversationRepository } from '../js/v2/conversation/repository/conversation-repository.js';
import { continueConversation, explainConversation } from '../js/v2/conversation/services/conversation-service.js';
import { explainDynamicConversation } from '../js/v2/conversation/services/dynamic-conversation-service.js';
import { resetComposerStore, getComposerTimeline } from '../js/v2/document-intelligence/composer/composer-store.js';
import { beginProblemSolving, composeApprovedNor } from '../js/v2/problem-solving/services/problem-solving-service.js';
import { seedNorBootstrapKnowledge } from '../js/v2/knowledge/bootstrap/nor-reverse-engineering-knowledge.js';
import { detectKnowledgeGaps, reason, makeProblem } from '../js/v2/reasoning/services/reasoning-service.js';
import { listNorTypes } from '../js/v2/knowledge/registry/nor-type-registry.js';
import { resetLearningRepository } from '../js/v2/learning/repository/learning-repository.js';
import { listLearningEvents } from '../js/v2/learning/services/learning-service.js';
import { DORMANT } from '../js/v2/dormant-subsystems.js';

let pass = 0; let fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); }
}

setKnowledgeBackend('memory');
resetConversationRepository();
resetComposerStore();
resetLearningRepository();
const seedResult = seedNorBootstrapKnowledge();

console.log('\n[Setup — real bootstrap Knowledge seeded, exactly as the live app does on mount]');
check('bootstrap seed produced zero errors', seedResult.errors.length === 0);
const approvedNorCount = listKnowledge({ domainType: 'nor', lifecycleState: LIFECYCLE_STATE.APPROVED }).data.length;
check(`bootstrap seed produced a real batch of Approved nor-domain Knowledge (got ${approvedNorCount})`, approvedNorCount >= 90);

/** Plausible human answers for every field ANY registered NOR Type schema
 *  (or the legacy fallback schema) might ask — a real human would type
 *  something different per occasion; these are deliberately generic so the
 *  QUESTION SEQUENCE itself (what got asked, in what order) is what this
 *  harness measures, not the specific answer content. */
const ANSWER_BOOK = {
  type: 'Perubahan Penanggung Jawab', // deliberately an UNREGISTERED NOR Type — see Administration scenario below
  destination: 'Bandung',
  traveler: 'Unit Sarpras',
  departureDate: '2026-08-01',
  returnDate: '2026-08-03',
  budget: '5000000',
  item: 'Meja',
  quantity: '5',
  purpose: 'Kebutuhan ruang Binpres',
};

/** Drives an ACTIVE Conversation to completion (or a safety-capped 10
 *  turns), answering exactly one field per turn — mirrors a real human
 *  answering one question at a time. Returns the ordered list of fields
 *  actually asked, so Conversation Quality can measure count/duplicates. */
function driveConversation(conversationId, firstState) {
  const askedSequence = [];
  let state = firstState;
  let missingFacts = state.missingFacts;
  let turns = 0;
  while (missingFacts.length && turns < 10) {
    const field = missingFacts[0].field;
    askedSequence.push(field);
    const answer = ANSWER_BOOK[field];
    const result = continueConversation(conversationId, { [field]: answer !== undefined ? answer : `test-value-${field}` });
    if (!result.ok) break;
    state = result.data;
    missingFacts = state.missingFacts;
    turns += 1;
  }
  return { askedSequence, finalState: state, turns };
}

function runScenario(name, utterance) {
  console.log(`\n[Scenario — ${name}: "${utterance}"]`);
  const trace = { name, utterance };

  const began = beginProblemSolving(utterance, 'evan');
  trace.beginOk = began.ok;
  if (!began.ok) { trace.error = began.error; console.log(JSON.stringify(trace, null, 2)); return trace; }

  trace.category = began.data.category;
  trace.categoryConfidence = began.data.categoryConfidence;
  trace.route = began.data.routingDecision.route;
  trace.hasRealConversation = !!began.data.conversation;

  if (!began.data.conversation) {
    trace.problemConversationTurn = !!began.data.problemConversationTurn;
    trace.downstreamNote = began.data.downstreamNote;
    console.log(JSON.stringify(trace, null, 2));
    return trace;
  }

  const conv = began.data.conversation;
  trace.intent = conv.currentIntent.intent;
  trace.intentConfidence = conv.currentIntent.confidence;
  trace.extractedFactsFromUtterance = conv.currentIntent.extractedFacts;
  trace.norType = conv.gatheredFacts.type || null;

  const { askedSequence, finalState, turns } = driveConversation(conv.id, conv);
  trace.questionsAsked = askedSequence;
  trace.questionCount = askedSequence.length;
  trace.turns = turns;
  trace.finalNorType = finalState.gatheredFacts.type || null;
  trace.reachedReady = finalState.state === 'ready';

  const explained = explainConversation(conv.id);
  if (explained.ok) {
    trace.questionsSkippedCount = explained.data.questionsSkipped.length;
    trace.knowledgeUsedCount = explained.data.knowledgeUsed.length;
  }
  const dynamicExplained = explainDynamicConversation(conv.id);
  if (dynamicExplained.ok) {
    trace.gapsAtCompletion = dynamicExplained.data.gaps.map((g) => ({ gapType: g.gapType, field: g.field, priority: g.priority }));
    trace.confidenceAtCompletion = dynamicExplained.data.confidence;
  }

  // Knowledge Gap Detection, scoped to this occasion's real domainType +
  // NOR Type — the exact call composeNorDocument/reasoning would make.
  const gaps = detectKnowledgeGaps('nor', trace.finalNorType);
  trace.knowledgeGaps = gaps.map((g) => ({ gapType: g.gapType, field: g.field, priority: g.priority, reason: g.reason }));

  // Reasoning — DIAGNOSTIC ONLY. reason() is never called on the real
  // CREATE_NOR path today (confirmed unchanged by this sprint — see
  // docs/NORTH_STAR_VALIDATION_REPORT.md's Stage 7 finding); this call
  // exists purely to answer "IF it were wired in, would today's Knowledge
  // even produce a citation for this occasion?", not to claim it runs live.
  const hypotheticalProblem = makeProblem({ domainType: 'nor', description: utterance, facts: { ...finalState.gatheredFacts, category: trace.category } });
  const hypotheticalReasoning = reason(hypotheticalProblem);
  trace.hypotheticalReasoningWouldCite = hypotheticalReasoning.ok
    ? hypotheticalReasoning.data.citedRuleIds
    : hypotheticalReasoning.error.code;

  if (trace.reachedReady) {
    const composed = composeApprovedNor(conv.id);
    trace.composeOk = composed.ok;
    if (composed.ok) {
      trace.composedSectionCount = composed.data.composerDocument.sections.length;
      trace.unresolvedFields = composed.data.unresolvedFields;
      trace.citedKnowledgeCount = composed.data.citedKnowledgeIds.length;
      // A composed pattern section is literally keyed 'pattern:<knowledgeId>'
      // by nor-composer.js itself (never inferred from id string shape).
      trace.patternSectionsComposed = composed.data.composerDocument.sections.filter((s) => s.field.startsWith('pattern:'));
      trace.patternsCited = trace.patternSectionsComposed.length;
      trace.composerDocumentId = composed.data.composerDocument.documentId;
    } else {
      trace.composeError = composed.error;
    }
  }

  console.log(JSON.stringify(trace, null, 2));
  return trace;
}

const businessTrip = runScenario('Business Trip', 'Buatkan NOR perjalanan dinas ke Surabaya.');
const procurement = runScenario('Procurement', 'Buatkan NOR pembelian meja ruang Binpres.');
const reimbursement = runScenario('Reimbursement', 'Buatkan NOR reimbursement biaya parkir.');
const administration = runScenario('Administration', 'Buatkan NOR perubahan penanggung jawab.');
// Phase 9, Sprint 9.1 (Organizational Decision) — proves the two
// CATEGORY_TO_INTENT routing fixes (docs/SPRINT_9_1_ORGANIZATIONAL_DECISION.md
// Decisions 2/3) actually take effect for an utterance that classifies
// into 'procurement'/'administration' WITHOUT also tripping business_trip's
// own 'nor'+create-verb pattern into a false win (the pre-existing,
// separate, still-unfixed Critical #1 regression the 'Procurement' scenario
// above already demonstrates) — i.e. these two utterances are deliberately
// worded so their own category's keywords/pattern outscore business_trip's.
const procurementRoutingFix = runScenario('Procurement (category-routing fix)', 'Tolong buatkan NOR, saya mau membeli meja untuk pengadaan ruang Binpres.');
const administrationRoutingFix = runScenario('Administration (category-routing fix)', 'Buatkan NOR, atlet kami kehilangan kartu identitas dan surat izin.');

console.log('\n[Assertions — regression floor for the North-Star-Gap-Closure work already landed this session]');
check('Business Trip: real Conversation started', businessTrip.hasRealConversation);
check('Business Trip: NOR Type resolved from the utterance itself (no "Jenis NOR" question needed)', !businessTrip.questionsAsked.includes('type'));
check('Business Trip: asked destination/traveler/departureDate/returnDate/budget, never Pengadaan fields', businessTrip.questionsAsked.every((f) => ['destination', 'traveler', 'departureDate', 'returnDate', 'budget'].includes(f)));
check('Business Trip: reached READY and composed', businessTrip.reachedReady && businessTrip.composeOk);

check('Procurement: real Conversation started', procurement.hasRealConversation);
check('Procurement: NOR Type resolved as "Pengadaan" from the utterance itself', procurement.norType === 'Pengadaan');
check('Procurement: asked item/quantity/purpose/budget, NEVER destination/traveler/departureDate/returnDate — the exact audit acceptance criterion', procurement.questionsAsked.every((f) => ['item', 'quantity', 'purpose', 'budget'].includes(f)) && !procurement.questionsAsked.some((f) => ['destination', 'traveler', 'departureDate', 'returnDate'].includes(f)));
check('Procurement: reached READY', procurement.reachedReady);
console.log(`  ⓘ Procurement: patternsCited = ${procurement.patternsCited} (diagnostic — see report for interpretation, not asserted either way)`);

// Sprint 9.1 Decision 1 — Reimbursement is NOT a NOR Type. Same utterance
// this harness has always tested; the expectation flipped from "resolves
// as Reimbursement" to "no longer resolves at all", proving the exclusion
// holds rather than silently deleting all trace of the prior behavior.
check('Reimbursement: no longer resolves as a NOR Type (Sprint 9.1 Decision 1 — not a NOR at all)', reimbursement.norType === null);
check('Reimbursement: "Jenis NOR" is asked first, same as any other unrecognized value (intentional, not a regression)', reimbursement.questionsAsked[0] === 'type');

check('Administration: no registered NOR Type matches this occasion by KEYWORD, so "Jenis NOR" is asked first (registration alone does not add NLU — Decision 3)', administration.questionsAsked[0] === 'type');
check('Administration: an unregistered-by-keyword occasion falls back to the trip-shaped schema (KNOWN, deferred gap)', administration.questionsAsked.slice(1).every((f) => ['destination', 'traveler', 'departureDate', 'returnDate', 'budget'].includes(f)));

check('Procurement (routing fix): classified as "procurement" category, not "business_trip"', procurementRoutingFix.category === 'procurement');
check('Procurement (routing fix): reaches a REAL Conversation via the new CATEGORY_TO_INTENT mapping (Decision 2)', procurementRoutingFix.hasRealConversation === true);
check('Procurement (routing fix): NOR Type resolved as "Pengadaan" from the utterance itself', procurementRoutingFix.norType === 'Pengadaan');
check('Procurement (routing fix): reached READY', procurementRoutingFix.reachedReady);

check('Administration (routing fix): classified as "administration" category, not "business_trip"', administrationRoutingFix.category === 'administration');
check('Administration (routing fix): reaches a REAL Conversation via the new CATEGORY_TO_INTENT mapping (Decision 3)', administrationRoutingFix.hasRealConversation === true);
check('Administration (routing fix): "Jenis NOR" asked first (no keyword-based type extraction authored for Administration — by design, no evidence yet)', administrationRoutingFix.questionsAsked[0] === 'type');

check('Administration is now a registered NOR Type (Sprint 9.1 Decision 3)', listNorTypes().some((t) => t.id === 'Administration'));
check('Reimbursement is no longer a registered NOR Type (Sprint 9.1 Decision 1)', !listNorTypes().some((t) => t.id === 'Reimbursement'));

console.log('\n[Knowledge Coverage — real counts per registered NOR Type, by kind]');
const KIND_LIST = ['ontology', 'workflow', 'rule', 'policy', 'rendering_rule', 'sentence_pattern', 'paragraph_pattern', 'template_pattern', 'signatory', 'recipient', 'cc', 'approval_chain'];
const norTypes = listNorTypes();
const coverage = {};
for (const nt of norTypes) {
  const approvedAll = listKnowledge({ domainType: 'nor', lifecycleState: LIFECYCLE_STATE.APPROVED });
  const items = approvedAll.ok ? approvedAll.data : [];
  const taggedForThisType = items.filter((i) => i.payload && i.payload.norType === nt.id);
  const generic = items.filter((i) => !(i.payload && i.payload.norType));
  coverage[nt.id] = {
    taggedSpecificallyForThisType: taggedForThisType.length,
    genericItemsThatWouldApply: generic.length,
    byKind: Object.fromEntries(KIND_LIST.map((k) => [k, generic.filter((i) => i.kind === k).length])),
  };
}
console.log(JSON.stringify(coverage, null, 2));

console.log('\n[Learning — Composer-level learning remains dormant (confirmed fresh, not cited from memory)]');
const dormantIds = DORMANT.map((d) => d.id);
check('composer-timeline is still declared DORMANT (editSection has no real caller)', dormantIds.includes('composer-timeline'));
// Knowledge PROMOTION (approving the seeded 90+ items) legitimately DOES
// record real KNOWLEDGE_EVOLUTION Learning Events — the assertion below is
// narrower and more honest than "zero events total": none of THIS run's 4
// real ComposerDocument ids appears anywhere in any Learning Event, which
// is exactly what "editSection has no real caller" means operationally —
// a human editing a composed draft never becomes organizational learning.
const composerDocumentIds = [businessTrip, procurement, reimbursement, administration, procurementRoutingFix, administrationRoutingFix]
  .map((t) => t.composerDocumentId).filter(Boolean);
const learningEventsAfterRun = listLearningEvents({}).data || [];
const composerReferenced = learningEventsAfterRun.some((e) => composerDocumentIds.includes(e.sourceDocumentId) || composerDocumentIds.includes(e.affectedKnowledgeId));
check(`this run's ${composerDocumentIds.length} real ComposerDocuments produced ZERO Learning Events (editSection has no real caller)`, !composerReferenced);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
