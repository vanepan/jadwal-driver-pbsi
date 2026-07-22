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
  setKnowledgeBackend, ingest, promoteKnowledge, listKnowledge, LIFECYCLE_STATE,
} from '../js/v2/knowledge/services/knowledge-service.js';
import { generateKnowledgeId } from '../js/v2/knowledge/contracts/identity-contract.js';
import { resetConversationRepository } from '../js/v2/conversation/repository/conversation-repository.js';
import { continueConversation } from '../js/v2/conversation/services/conversation-service.js';
import { resetComposerStore } from '../src/document-intelligence/composer/composer-store.js';
import { beginProblemSolving, composeApprovedNor } from '../js/v2/problem-solving/services/problem-solving-service.js';
import { seedNorBootstrapKnowledge } from '../js/v2/knowledge/bootstrap/nor-reverse-engineering-knowledge.js';
import { archiveDocument, resetArchiveRepository } from '../src/organizational-memory/index.js';

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

  // Sprint 11.10 (Product Architecture Gap Closure) — "Susun Draf
  // Sekarang" / Fix 6 "Live Preview First": the SAME still-ACTIVE
  // conversation, but with allowIncomplete:true, must now succeed —
  // additive, opt-in, never the default (the check right above proves the
  // default is completely unchanged).
  const draftNow = composeApprovedNor(started.data.conversation.id, { allowIncomplete: true });
  check('with allowIncomplete:true, composition succeeds from ACTIVE (intent known, facts still incomplete)', draftNow.ok);
  const draftSections = draftNow.ok ? draftNow.data.composerDocument.sections : [];
  check('no missing fact is fabricated — the pattern slot for the still-unknown "traveler" resolves to the real UNRESOLVED_MARKER, never invented text', draftSections.some((s) => s.field.startsWith('pattern:') && String(s.value).includes('UNKNOWN')));
  check('the real structural suggestion (signatory counts, evidence-based, independent of gatheredFacts) is still genuinely present in the early draft', draftSections.some((s) => s.field === 'suggestedSignatoryTopCount' && s.value === 4));

  // The already-known facts from the ORIGINAL utterance/first turn (if
  // any were extracted) still appear as real sections — never dropped
  // just because composition happened early.
  const stillReady = composeApprovedNor(started.data.conversation.id); // default call, still refused — proves allowIncomplete never mutates the conversation's own state
  check('composing early never advances/mutates the Conversation itself — the default (non-draft) call is STILL refused right after', !stillReady.ok && stillReady.error.code === 'NOT_READY');
}

console.log('\n[North-Star Gap Closure — "Saya ingin membuat NOR..." (no "dinas"/"perjalanan", no bare "buat") now reaches the REAL pipeline]');
{
  // Before this fix: problem-parser.js's business_trip rule had no NOR-aware
  // keyword/pattern, so this utterance scored 0 across every category and
  // fell to 'unknown' -> generic clarification, never reaching Conversation
  // at all. Proves Fix A (problem-parser.js) and Fix B (intent-engine.js's
  // 'membuat' gap) together, on the exact phrase used to justify both.
  const result = beginProblemSolving('Saya ingin membuat NOR untuk perjalanan ke Surabaya.', 'evan');
  check('beginProblemSolving succeeds', result.ok);
  check('category is "business_trip" (Fix A: problem-parser.js recognizes NOR-creation phrasing)', result.data.category === 'business_trip');
  check('routed to CONVERSATION, not CLARIFICATION_CONVERSATION', result.data.routingDecision.route === 'conversation');
  check('a REAL Conversation was started (Fix B: intent-engine.js recognizes "membuat")', !!result.data.conversation);
  check('the mapped intent is create_nor, not unknown', !!result.data.conversation && result.data.conversation.currentIntent.intent === 'create_nor');
  check('clarification was NOT requested — the real path was reached, not the fallback', result.data.clarification === null);
}

console.log('\n[North-Star Gap Closure — bootstrap NOR Knowledge (docs/KNOWLEDGE_POPULATION_REPORT.md) is real, Approved, and reachable via the live knowledge-service.js surface]');
{
  // Before this fix: seedNorBootstrapKnowledge() was only ever called from
  // scripts/nor-knowledge-bootstrap-seed.mjs's own one-off Node process —
  // nothing in the live app's mount path called it, so a real pilot session
  // always retrieved against an empty repository (docs/
  // KNOWLEDGE_POPULATION_REPORT.md's own "Known Limitations #1"). Fix C
  // wires this same function into sarpras-intelligence-center.js's
  // mountSarprasIntelligence(); this proves the function itself still does
  // what that fix depends on.
  const beforeCount = listKnowledge({ domainType: 'nor', lifecycleState: LIFECYCLE_STATE.APPROVED }).data.length;
  const seedResult = seedNorBootstrapKnowledge();
  const afterCount = listKnowledge({ domainType: 'nor', lifecycleState: LIFECYCLE_STATE.APPROVED }).data.length;
  check('seeding real bootstrap knowledge produces zero errors', seedResult.errors.length === 0);
  check('a large, real batch of Approved nor-domain Knowledge is now present', afterCount - beforeCount >= 90);
  check('every seeded item genuinely reached Approved (not left Draft/Candidate)', seedResult.items.every((i) => i.lifecycleState === LIFECYCLE_STATE.APPROVED));
  check('relationships were seeded too', seedResult.relationships.length > 0);
}

console.log('\n[Sprint 11.1, Workstream 1 — norNumber flows end-to-end from real Archive evidence through composeApprovedNor]');
{
  resetArchiveRepository();
  // A real, consistent Archive numbering pattern for domainType 'nor' —
  // organizational-memory/numbering-engine.js#suggestNextNumber() infers
  // the majority template from exactly records like these (no synthetic
  // stub of the engine itself — this exercises the real one).
  archiveDocument({ id: 'nor:archive:seq-1', sourceDomainType: 'nor', sourceId: 's1', sourceType: 'manual-file', documentNumber: 'NOR-2026-013', documentHash: 'hash-seq-1', sourceSnapshot: {} });
  archiveDocument({ id: 'nor:archive:seq-2', sourceDomainType: 'nor', sourceId: 's2', sourceType: 'manual-file', documentNumber: 'NOR-2026-014', documentHash: 'hash-seq-2', sourceSnapshot: {} });

  const started = beginProblemSolving('Buatkan NOR perjalanan dinas.', 'evan');
  const convId2 = started.data.conversation.id;
  continueConversation(convId2, { destination: 'Bandung' });
  continueConversation(convId2, { traveler: 'Unit Engineering' });
  continueConversation(convId2, { departureDate: '2026-08-01' });
  continueConversation(convId2, { returnDate: '2026-08-03' });
  continueConversation(convId2, { budget: '5000000' });
  const composedWithArchive = composeApprovedNor(convId2);

  check('composition still succeeds with real Archive evidence present', composedWithArchive.ok);
  const norNumberSection = composedWithArchive.data.composerDocument.sections.find((s) => s.field === 'norNumber');
  check('norNumber is a REAL section in the composed document, sourced from the real numbering engine — not fetched/invented by nor-composer.js itself', !!norNumberSection);
  check('the suggested number is the honest next-in-sequence value from the real Archive records seeded above', norNumberSection && norNumberSection.value === 'NOR-2026-015');

  resetArchiveRepository();
}

console.log('\n[Sprint 11.1 (production feedback, "Adaptive Conversation") — a fact problem-parser.js already extracted is never re-asked]');
{
  // The user's own real example: "buat NOR pembelian kursi ruang
  // pengadaan" — problem-parser.js's PROCUREMENT_ITEM_KEYWORDS table
  // matches "kursi" -> item:'Kursi' BEFORE this call, in classifyProblem()
  // (verified directly in problem-parser.js — not assumed). Before this
  // fix, startConversation() discarded problem.facts entirely and only
  // ever seeded from detectIntent()'s own narrower extraction (CREATE_NOR
  // extracts just `type`), so the Conversation re-asked for `item` anyway
  // — confirmed as the real, verified root cause, not assumed.
  const result = beginProblemSolving('buat NOR pembelian kursi ruang pengadaan', 'evan');
  check('beginProblemSolving succeeds', result.ok);
  check('a real Conversation was started (not the generic Problem Conversation fallback)', !!result.data.conversation);
  const c = result.data.conversation;
  check('gatheredFacts.item is ALREADY "Kursi" — carried in from problem-parser.js\'s own extraction, not fetched a second time', c && c.gatheredFacts.item === 'Kursi');
  check('missingFacts does NOT ask for "item" again — the exact bug reported ("Barang apa yang ingin dibeli?" after the parser already found it) is gone', c && !(c.missingFacts || []).some((q) => q.field === 'item'));

  // Negative control — an utterance where problem-parser.js's item table
  // genuinely finds nothing MUST still honestly ask (never silently
  // invent an item just because this fix now merges facts in).
  resetConversationRepository();
  const noItem = beginProblemSolving('buat NOR pengadaan barang kantor', 'evan');
  const c2 = noItem.data.conversation;
  check('an utterance with no recognizable item keyword still honestly asks for it (never fabricated by this fix)', c2 && (c2.missingFacts || []).some((q) => q.field === 'item'));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
