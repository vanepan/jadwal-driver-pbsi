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
import { seedPerjalananDinasPengadaanKnowledge } from '../js/v2/knowledge/bootstrap/nor-perjalanan-dinas-pengadaan-knowledge.js';
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
const perjalananDinasPengadaanSeedResult = seedPerjalananDinasPengadaanKnowledge();

console.log('\n[Setup — real bootstrap Knowledge seeded, exactly as the live app does on mount]');
check('bootstrap seed produced zero errors', seedResult.errors.length === 0);
check('Perjalanan Dinas/Pengadaan seed (Sprint 9.3) produced zero errors', perjalananDinasPengadaanSeedResult.errors.length === 0);
const approvedNorCount = listKnowledge({ domainType: 'nor', lifecycleState: LIFECYCLE_STATE.APPROVED }).data.length;
check(`bootstrap seed produced a real batch of Approved nor-domain Knowledge (got ${approvedNorCount})`, approvedNorCount >= 90);
check(`Sprint 9.3 correction superseded exactly 2 Petty-Cash-tagged facts to Generic (got ${perjalananDinasPengadaanSeedResult.corrected.length})`, perjalananDinasPengadaanSeedResult.corrected.length === 2);

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

  // Reasoning — kept as a standalone diagnostic probe (same call shape as
  // before Sprint 9.5) for a quick "would ANY rule apply here" read
  // independent of Composition. As of Sprint 9.5, reason() is ALSO called
  // for real, live, inside composeNorDocument() below — see
  // docs/SPRINT_9_5_REASONING_ACTIVATION.md. This probe and that live call
  // should agree on citedRuleIds for the same occasion; §hypotheticalReasoningMatchesLive
  // checks exactly that, later in this file.
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
      // Sprint 9.5 — reason(), now genuinely called live inside
      // composeNorDocument(), surfaced as dev-only metadata (never part of
      // fieldMap/composedSections — never rendered into the NOR itself).
      trace.reasoningConsidered = composed.data.reasoningConsidered;
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
check('Business Trip: Reasoning now runs LIVE inside composition (Sprint 9.5)', businessTrip.reasoningConsidered && businessTrip.reasoningConsidered.ok === true);
// Precise sourceRef allowlists, not a naive substring match — rule.bpd-no-pengadaan-involvement
// (a real, correctly-cited BPD rule) itself contains the word "pengadaan", which a
// substring check would misread as cross-domain contamination.
const PENGADAAN_ONLY_RULE_REFS = ['rule.pengadaan-itemized-list-required', 'rule.pengadaan-kabid-approval-required', 'rule.pengadaan-price-justification-optional', 'rule.pengadaan-running-total-reference'];
const BPD_ONLY_RULE_REFS = ['rule.bpd-cost-breakdown-categories', 'rule.bpd-no-pengadaan-involvement', 'rule.bpd-traveler-role-stated', 'rule.bpd-multi-destination-aggregation'];
check('Business Trip: live Reasoning cites at least one Perjalanan-Dinas-tagged rule, zero Pengadaan-tagged rules', businessTrip.reasoningConsidered.citedRuleIds.some((id) => BPD_ONLY_RULE_REFS.some((ref) => id.endsWith(ref))) && !businessTrip.reasoningConsidered.citedRuleIds.some((id) => PENGADAAN_ONLY_RULE_REFS.some((ref) => id.endsWith(ref))));
check('Business Trip: live Reasoning citations match the standalone diagnostic probe for the same occasion', JSON.stringify([...businessTrip.reasoningConsidered.citedRuleIds].sort()) === JSON.stringify([...businessTrip.hypotheticalReasoningWouldCite].sort()));
// Sprint 9.6 (Composition Validation) — real bug found comparing composed
// output against the real evidence: pattern.bpd-perihal-subject-line's slot
// was named "lokasi", which no real Conversation fact is ever keyed by
// (nor-composer.js#resolvePattern looks up gatheredFacts BY THE SLOT'S OWN
// NAME) — it rendered permanently unresolved no matter what a human
// answered. Fixed by renaming the slot to "destination"/"traveler" (the
// actual registered fieldSchema fields) — see docs/SPRINT_9_6_COMPOSITION_VALIDATION.md.
check('Business Trip: BPD Perihal pattern resolves the real destination answer ("Bandung"), not a permanently-unresolved slot', businessTrip.patternSectionsComposed.some((s) => s.field.includes('bpd-perihal-subject-line') && s.value === 'Pengajuan Biaya Perjalanan Dinas (BPD) Survei Lokasi Bandung'));
check('Business Trip: BPD context paragraph resolves the real traveler answer ("Unit Sarpras")', businessTrip.patternSectionsComposed.some((s) => s.field.includes('bpd-context-paragraph') && s.value.includes('biaya perjalanan dinas Unit Sarpras (')));

check('Procurement: real Conversation started', procurement.hasRealConversation);
check('Procurement: NOR Type resolved as "Pengadaan" from the utterance itself', procurement.norType === 'Pengadaan');
check('Procurement: asked item/quantity/purpose/budget, NEVER destination/traveler/departureDate/returnDate — the exact audit acceptance criterion', procurement.questionsAsked.every((f) => ['item', 'quantity', 'purpose', 'budget'].includes(f)) && !procurement.questionsAsked.some((f) => ['destination', 'traveler', 'departureDate', 'returnDate'].includes(f)));
check('Procurement: reached READY', procurement.reachedReady);
check('Procurement: Reasoning now runs LIVE inside composition (Sprint 9.5)', procurement.reasoningConsidered && procurement.reasoningConsidered.ok === true);
check('Procurement: live Reasoning cites at least one Pengadaan-tagged rule, zero Perjalanan-Dinas-tagged rules', procurement.reasoningConsidered.citedRuleIds.some((id) => PENGADAAN_ONLY_RULE_REFS.some((ref) => id.endsWith(ref))) && !procurement.reasoningConsidered.citedRuleIds.some((id) => BPD_ONLY_RULE_REFS.some((ref) => id.endsWith(ref))));
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
