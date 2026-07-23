/* dynamic-conversation-check.mjs — Phase 4-7, Part 4 ("Dynamic
   Conversation Engine").

   1. ARCHITECTURAL (static). dynamic-conversation-engine.js and
      dynamic-conversation-service.js never import conversation-
      repository.js directly — only conversation-service.js's own public
      API. Proves Part 4 added zero new writers against the Conversation
      Repository (still exactly one owner, per conversation-ownership-
      check.mjs's own Part 1).

   2. BEHAVIOURAL — pure engine (prioritizeQuestions/selectNextQuestion/
      confidence). Priority tagging, dedup given a caller-supplied history,
      stable ordering.

   3. BEHAVIOURAL — full integration through dynamic-conversation-
      service.js, driving a REAL Conversation via the existing,
      UNMODIFIED conversation-service.js end to end.

   Deterministic. No AI, no Firebase touch.
   Run: node scripts/dynamic-conversation-check.mjs   (exit 0 = pass) */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  setKnowledgeBackend,
} from '../src/knowledge/services/knowledge-service.js';
import { resetConversationRepository } from '../src/conversation/repository/conversation-repository.js';
import { startConversation, continueConversation } from '../src/conversation/services/conversation-service.js';
import { explainDynamicConversation } from '../src/conversation/services/dynamic-conversation-service.js';
import {
  prioritizeQuestions, selectNextQuestion, computeConversationConfidence, hasReachedConfidenceThreshold,
} from '../src/conversation/dynamic-conversation-engine.js';
import { DYNAMIC_QUESTION_PRIORITY } from '../src/conversation/contracts/dynamic-question-contract.js';
import { GAP_PRIORITY } from '../src/reasoning/contracts/knowledge-gap-contract.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0; let fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); }
}
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

console.log('\n[Part 1 — Part 4 added ZERO new writers against the Conversation Repository]');
{
  const files = [
    'src/conversation/dynamic-conversation-engine.js',
    'src/conversation/services/dynamic-conversation-service.js',
  ];
  const offenders = [];
  for (const rel of files) {
    const code = read(rel);
    const blocks = code.match(/import\s*\{[^}]*\}\s*from\s*'[^']*'/gs) || [];
    for (const b of blocks) {
      const m = b.match(/from\s*'([^']*)'/);
      if (m && /conversation\/repository\/conversation-repository\.js$/.test(m[1])) offenders.push(`${rel} -> ${m[1]}`);
    }
  }
  check(`neither Phase 4-7 file imports conversation-repository.js directly${offenders.length ? ` — FOUND: ${offenders.join(', ')}` : ''}`,
    offenders.length === 0);
  const serviceCode = read('src/conversation/services/dynamic-conversation-service.js');
  check('dynamic-conversation-service.js reaches Conversation ONLY through conversation-service.js\'s public findConversation',
    /from\s*'\.\/conversation-service\.js'/.test(serviceCode) && /findConversation/.test(serviceCode));
}

console.log('\n[Part 2 — pure engine: priority tagging]');
{
  const schemaByField = new Map([
    ['destination', { field: 'destination', optimizable: false }],
    ['traveler', { field: 'traveler', optimizable: true }],
  ]);
  const stillMissing = [
    { field: 'destination', label: 'Tujuan', prompt: 'Ke mana?' },
    { field: 'traveler', label: 'Pelaksana', prompt: 'Siapa?' },
  ];
  const gaps = [{
    id: 'nor:missing_reasoning:organizational_reasoning', domainType: 'nor', gapType: 'missing_reasoning',
    field: 'organizational_reasoning', reason: 'x', priority: GAP_PRIORITY.HIGH, confidence: 0.6,
    recommendedQuestion: { question: 'Why?', raisedBy: 'test', status: 'open', answerRef: null },
  }];
  const qs = prioritizeQuestions(stillMissing, schemaByField, gaps, new Set());
  check('a non-optimizable schema field is tagged CRITICAL', qs.find((q) => q.field === 'destination').priority === DYNAMIC_QUESTION_PRIORITY.CRITICAL);
  check('an optimizable schema field is tagged NORMAL', qs.find((q) => q.field === 'traveler').priority === DYNAMIC_QUESTION_PRIORITY.NORMAL);
  check('a gap of priority HIGH is tagged HIGH', qs.find((q) => q.field === 'organizational_reasoning').priority === DYNAMIC_QUESTION_PRIORITY.HIGH);
  check('CRITICAL sorts before HIGH sorts before NORMAL', qs[0].priority === 'critical' && qs[1].priority === 'high' && qs[2].priority === 'normal');
  check('selectNextQuestion returns the top (critical) question', selectNextQuestion(qs).field === 'destination');
  check('selectNextQuestion returns null for an empty queue', selectNextQuestion([]) === null);
}

console.log('\n[Part 2 — pure engine: question deduplication given a caller-supplied history]');
{
  const stillMissing = [{ field: 'destination', label: 'Tujuan', prompt: 'Ke mana?' }];
  const gaps = [{
    id: 'nor:missing_context:ontology', domainType: 'nor', gapType: 'missing_context', field: 'ontology', reason: 'x',
    priority: GAP_PRIORITY.CRITICAL, confidence: 1, recommendedQuestion: { question: 'What is the Ontology?', raisedBy: 'test', status: 'open', answerRef: null },
  }];
  const asked = new Set(['destination', 'nor:missing_context:ontology']);
  const qs = prioritizeQuestions(stillMissing, new Map(), gaps, asked);
  check('both the already-asked schema field AND the already-asked gap are excluded', qs.length === 0);
}

console.log('\n[Part 2 — confidence arithmetic is plain, explainable, and threshold-checkable]');
{
  const low = computeConversationConfidence({ knownCount: 1, outstandingCount: 6 });
  check('1 known of 7 total ≈ 0.143', Math.abs(low.confidence - (1 / 7)) < 1e-9);
  check('basis names both counts', /1 of 7/.test(low.basis));
  check('below default threshold (0.75)', !hasReachedConfidenceThreshold(low.confidence));

  const high = computeConversationConfidence({ knownCount: 6, outstandingCount: 1 });
  check('6 known of 7 total ≈ 0.857, above default threshold', hasReachedConfidenceThreshold(high.confidence));
  check('exactly at threshold counts as reached (>=, not >)', hasReachedConfidenceThreshold(0.75, 0.75));
  check('trivial case (nothing required, nothing outstanding) is confidence 1', computeConversationConfidence({ knownCount: 0, outstandingCount: 0 }).confidence === 1);
}

/* ══ Part 3 — full integration through the REAL, unmodified Conversation flow ══ */

setKnowledgeBackend('memory');
resetConversationRepository();

console.log('\n[Part 3 — a freshly-started CREATE_NOR conversation has LOW confidence and a CRITICAL next question]');
let convId;
{
  const started = startConversation({ utterance: 'Buatkan NOR perjalanan dinas.', actorId: 'evan' });
  check('startConversation succeeds', started.ok);
  convId = started.data.id;

  const explained = explainDynamicConversation(convId);
  check('explainDynamicConversation succeeds', explained.ok);
  check('domainType resolved to "nor" (CREATE_NOR\'s own hardcoded mapping)', explained.data.domainType === 'nor');
  check('confidence is LOW (most facts still genuinely missing)', explained.data.confidence < 0.3);
  check('thresholdReached is false', explained.data.thresholdReached === false);
  check('nextQuestion exists and is CRITICAL (destination is non-optimizable)',
    explained.data.nextQuestion && explained.data.nextQuestion.priority === DYNAMIC_QUESTION_PRIORITY.CRITICAL);
  check('at least one Knowledge Gap is surfaced (no Ontology recorded yet for "nor" in this fresh process)',
    explained.data.gaps.length > 0);
}

console.log('\n[Part 3 — answering every schema fact raises confidence past the default threshold]');
{
  continueConversation(convId, { destination: 'Bandung' });
  continueConversation(convId, { traveler: 'Unit Engineering' });
  continueConversation(convId, { departureDate: '2026-08-01' });
  continueConversation(convId, { returnDate: '2026-08-03' });
  const finalTurn = continueConversation(convId, { budget: '5000000' });
  check('conversation reaches READY', finalTurn.ok && finalTurn.data.state === 'ready');

  const explained = explainDynamicConversation(convId);
  check('explainDynamicConversation still succeeds once READY', explained.ok);
  check('confidence rose substantially now that every schema fact is known', explained.data.confidence > 0.7);
  check('thresholdReached is now true', explained.data.thresholdReached === true);
  check('nextQuestion is now null or gap-sourced only (no schema fields remain)',
    !explained.data.nextQuestion || explained.data.nextQuestion.source === 'knowledge_gap');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
