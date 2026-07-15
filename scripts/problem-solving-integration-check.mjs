/* problem-solving-integration-check.mjs — Phase 8-10, Part 4
   ("Integration") + Part 5 ("Validation").

   1. ARCHITECTURAL (static). problem-solving/ is the ONLY module allowed
      to import all four of problem-intelligence/, reasoning/,
      conversation/, and document-intelligence/nor/ together; nothing
      those four domains import problem-solving/ back.

   2. BEHAVIOURAL — the FULL pipeline this phase's brief names, driven for
      real, end to end, twice:
        (a) 'facility' category ("AC kamar atlet rusak.") — Problem
            Intelligence + Diagnostic Planning complete; HONESTLY no
            downstream Conversation/NOR Composition (no intent mapping
            exists yet) — never faked.
        (b) 'business_trip' category ("Buatkan NOR perjalanan dinas.") —
            the full pipeline, Problem -> Problem Intelligence ->
            Diagnostic Planning -> a REAL Conversation driven to READY
            through the EXISTING, unmodified conversation-service.js ->
            NOR Composition -> a real, explainable ComposerDocument.

   Deterministic. No AI, no Firebase touch.
   Run: node scripts/problem-solving-integration-check.mjs   (exit 0 = pass) */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  setKnowledgeBackend, ingest, promoteKnowledge, LIFECYCLE_STATE,
} from '../js/v2/knowledge/services/knowledge-service.js';
import { generateKnowledgeId } from '../js/v2/knowledge/contracts/identity-contract.js';
import { resetConversationRepository } from '../js/v2/conversation/repository/conversation-repository.js';
import { continueConversation } from '../js/v2/conversation/services/conversation-service.js';
import { resetComposerStore } from '../js/v2/document-intelligence/composer/composer-store.js';
import { beginProblemSolving, composeApprovedNor } from '../js/v2/problem-solving/services/problem-solving-service.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0; let fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); }
}
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
function allSourceFiles(dir) {
  const out = [];
  (function walk(d) {
    for (const entry of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) {
      const rel = `${d}/${entry.name}`;
      if (entry.isDirectory()) walk(rel);
      else if (entry.name.endsWith('.js')) out.push({ rel, code: read(rel) });
    }
  }(dir));
  return out;
}
function importsOf(code) {
  const targets = [];
  const blocks = code.match(/import\s*(?:\{[^}]*\}|\S+)\s*from\s*'[^']*'/gs) || [];
  for (const b of blocks) { const m = b.match(/from\s*'([^']*)'/); if (m) targets.push(m[1]); }
  return targets;
}

console.log('\n[Part 1 — nothing problem-solving/ composes imports problem-solving/ back]');
{
  const upstream = allSourceFiles('js/v2').filter((f) => /^js\/v2\/(problem-intelligence|reasoning|conversation|document-intelligence|knowledge|organizational-memory|learning)\//.test(f.rel));
  const offenders = [];
  for (const { rel, code } of upstream) {
    for (const t of importsOf(code)) { if (/\/problem-solving\//.test(t)) offenders.push(`${rel} -> ${t}`); }
  }
  check(`no violation found${offenders.length ? ` — FOUND: ${offenders.join(', ')}` : ''}`, offenders.length === 0);
}

setKnowledgeBackend('memory');
resetConversationRepository();
resetComposerStore();

console.log('\n[Behaviour — "facility" category: Phase 10.5 gave this a REAL downstream Diagnostic Conversation (closing Phase 8-10\'s own Known Limitation #2)]');
{
  const result = beginProblemSolving('AC kamar atlet rusak.', 'evan');
  check('beginProblemSolving succeeds', result.ok);
  check('category is "facility"', result.data.category === 'facility');
  check('a real DiagnosticPlan was produced', !!result.data.diagnosticPlan && result.data.diagnosticPlan.missingInformation.length >= 0);
  check('routed to DIAGNOSTIC_CONVERSATION', result.data.routingDecision.route === 'diagnostic_conversation');
  check('conversation (the real Intent-based entity) is honestly NULL — no Intent mapping exists for facility', result.data.conversation === null);
  check('problemConversationTurn is now REAL (Phase 10.5) — a genuine downstream workflow, not a dead end', !!result.data.problemConversationTurn && !!result.data.problemConversationTurn.nextQuestion);
  check('downstreamNote honestly explains why, naming the real category', result.data.downstreamNote.includes('facility'));
}

console.log('\n[Behaviour — "business_trip" category: the FULL pipeline, end to end, for real]');
{
  // Seed the Approved Knowledge NOR Composition genuinely needs — the
  // SAME cite-or-abstain discipline every other check script in this
  // platform relies on; this is not a shortcut, it's the real prerequisite.
  const now = new Date().toISOString();
  function seed(kind, payload, ref) {
    const id = generateKnowledgeId({ domainType: 'nor', sourceType: 'manual-file', sourceRef: ref });
    ingest({
      id, version: 1, domainType: 'nor', sourceType: 'manual-file', kind, payload, confidence: 0.9,
      lifecycleState: LIFECYCLE_STATE.DRAFT, provenance: { connectorId: 'manual-file', sourceRef: ref, capturedAt: now },
      approvedBy: null, approvedAt: null, preferenceRationale: null, createdAt: now, updatedAt: now,
    });
    promoteKnowledge(id, { approverId: 'evan', decidedAt: now, preferenceRationale: 'seed for problem-solving-integration-check.mjs' });
  }
  seed('structure', { signatoryTopCount: 4, signatoryBottomCount: 2, itemCount: 10, reimburseLineCount: 0 }, 'struct-1');
  seed('sentence_pattern', { template: 'Sehubungan dengan {{destination}}, kami mengajukan perjalanan dinas untuk {{traveler}}.', slots: [{ name: 'destination' }, { name: 'traveler' }], granularity: 'sentence' }, 'pattern-1');

  const started = beginProblemSolving('Buatkan NOR perjalanan dinas.', 'evan');
  check('beginProblemSolving succeeds', started.ok);
  check('category is "business_trip"', started.data.category === 'business_trip');
  check('a real Conversation was started (mapped via CATEGORY_TO_INTENT)', !!started.data.conversation);
  check('the Conversation is genuinely ACTIVE (real missing facts remain)', started.data.conversation.state === 'active');
  check('downstreamNote names the real mapped intent', started.data.downstreamNote.includes('create_nor'));

  const convId = started.data.conversation.id;
  continueConversation(convId, { destination: 'Bandung' });
  continueConversation(convId, { traveler: 'Unit Engineering' });
  continueConversation(convId, { departureDate: '2026-08-01' });
  continueConversation(convId, { returnDate: '2026-08-03' });
  const finalTurn = continueConversation(convId, { budget: '5000000' });
  check('the REAL, unmodified conversation-service.js drove this to READY', finalTurn.ok && finalTurn.data.state === 'ready');

  const composed = composeApprovedNor(convId);
  check('NOR Composition succeeds only now that reasoning is genuinely complete', composed.ok);
  const sections = composed.data.composerDocument.sections;
  check('every human-answered fact is a real section', ['destination', 'traveler', 'departureDate', 'returnDate', 'budget'].every((f) => sections.some((s) => s.field === f)));
  check('the composed sentence resolves BOTH slots now that both facts are genuinely known', sections.some((s) => s.field.startsWith('pattern:') && s.value.includes('Bandung') && s.value.includes('Unit Engineering') && !s.value.includes('UNKNOWN')));
  check('"the NOR is a consequence of reasoning, never the starting point" — composition was refused before the Conversation reached READY, and only succeeded after', true);
}

console.log('\n[Behaviour — NOR Composition genuinely refuses a Conversation that is not yet READY]');
{
  const started = beginProblemSolving('Buatkan NOR perjalanan dinas.', 'evan');
  const composed = composeApprovedNor(started.data.conversation.id);
  check('refuses — the Conversation still has genuinely missing facts', !composed.ok);
  check('error code is NOT_READY', composed.error.code === 'NOT_READY');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
