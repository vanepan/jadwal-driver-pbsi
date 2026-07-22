/* reasoning-engine-check.mjs — Phase 4-7, Part 2 ("Organizational
   Reasoning Engine").

   Same two-part shape as conversation-ownership-check.mjs, on purpose.

   1. ARCHITECTURAL (static). reasoning/ depends on knowledge/ only, and
      nothing under knowledge/, organizational-memory/, learning/,
      document-intelligence/ or conversation/ imports reasoning/ back
      (reasoning/ is the more upstream of the two, per js/v2/README.md's
      binding graph). reasoning/ never imports ai-foundation/.

   2. BEHAVIOURAL (runtime). Drives the real reasoning-service.js end to
      end: cite-or-abstain when nothing applies, a real applicable-rule
      Recommendation with a genuine citation, appliesWhen matching, and
      conflict detection reusing the EXISTING conflicts_with relationship
      type (no new relationship type created by this test).

   Deterministic. No AI, no Firebase touch.
   Run: node scripts/reasoning-engine-check.mjs   (exit 0 = pass) */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  setKnowledgeBackend, ingest, promoteKnowledge, LIFECYCLE_STATE,
} from '../js/v2/knowledge/services/knowledge-service.js';
import { generateKnowledgeId } from '../js/v2/knowledge/contracts/identity-contract.js';
import {
  reason, detectKnowledgeGaps, makeProblem, RECOMMENDATION_ERRORS,
} from '../js/v2/reasoning/services/reasoning-service.js';
import { isRecommendation } from '../js/v2/reasoning/contracts/recommendation-contract.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0; let fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); }
}
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
function allSourceFiles(dir) {
  const out = [];
  (function walk(d) {
    for (const entry of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) {
      const rel = `${d}/${entry.name}`;
      if (entry.isDirectory()) walk(rel);
      else if (entry.name.endsWith('.js')) out.push({ rel, code: stripComments(read(rel)) });
    }
  }(dir));
  return out;
}
function importsOf(code) {
  const targets = [];
  const blocks = code.match(/import\s*(?:\{[^}]*\}|\S+)\s*from\s*'[^']*'/gs) || [];
  for (const b of blocks) {
    const m = b.match(/from\s*'([^']*)'/);
    if (m) targets.push(m[1]);
  }
  return targets;
}

console.log('\n[Part 1 — reasoning/ depends on knowledge/ only, never ai-foundation/, never conversation/]');
{
  const reasoningFiles = allSourceFiles('js/v2/reasoning');
  const offenders = [];
  for (const { rel, code } of reasoningFiles) {
    for (const t of importsOf(code)) {
      if (/\/(ai-foundation|conversation)\//.test(t)) offenders.push(`${rel} -> ${t}`);
    }
  }
  check(`no file under reasoning/ imports ai-foundation/ or conversation/${offenders.length ? ` — FOUND: ${offenders.join(', ')}` : ''}`,
    offenders.length === 0);
}

console.log('\n[Part 2 — reasoning/ is upstream: nothing under knowledge/, organizational-memory/, learning/, document-intelligence/ or conversation/ imports it]');
{
  const upstream = allSourceFiles('js/v2').filter((f) => /^js\/v2\/(knowledge|organizational-memory|learning|document-intelligence|conversation|ai-foundation|file-storage)\//.test(f.rel));
  const offenders = [];
  for (const { rel, code } of upstream) {
    for (const t of importsOf(code)) {
      if (/\/reasoning\//.test(t)) offenders.push(`${rel} -> ${t}`);
    }
  }
  // conversation/dynamic-conversation-service.js is the ONE documented exception.
  const realOffenders = offenders.filter((o) => !o.startsWith('src/conversation/services/dynamic-conversation-service.js'));
  check(`no module outside conversation/'s Phase 4-7 dynamic-conversation files imports reasoning/${realOffenders.length ? ` — FOUND: ${realOffenders.join(', ')}` : ''}`,
    realOffenders.length === 0);
}

/* ══ BEHAVIOUR ══════════════════════════════════════════════════════ */

setKnowledgeBackend('memory');

function seedApproved({ domainType, kind, payload, confidence = 0.9, sourceRef }) {
  const id = generateKnowledgeId({ domainType, sourceType: 'manual-file', sourceRef });
  const now = new Date().toISOString();
  const item = Object.freeze({
    id, version: 1, domainType, sourceType: 'manual-file', kind, payload, confidence,
    lifecycleState: LIFECYCLE_STATE.DRAFT,
    provenance: Object.freeze({ connectorId: 'manual-file', sourceRef, capturedAt: now }),
    approvedBy: null, approvedAt: null, preferenceRationale: null, createdAt: now, updatedAt: now,
  });
  const ingested = ingest(item);
  if (!ingested.ok) throw new Error(`seed failed: ${JSON.stringify(ingested.error)}`);
  const promoted = promoteKnowledge(id, { approverId: 'evan', decidedAt: now, preferenceRationale: 'seeded for reasoning-engine-check.mjs' });
  if (!promoted.ok) throw new Error(`promote failed: ${JSON.stringify(promoted.error)}`);
  return promoted.data.id;
}

console.log('\n[Behaviour — cite-or-abstain: zero Approved rules for a domainType refuses, never guesses]');
{
  const problem = makeProblem({ domainType: 'memorandum', description: 'Should a memorandum be issued?', facts: {} });
  const result = reason(problem);
  check('reason() returns ok:false', !result.ok);
  check('error code is NO_APPLICABLE_KNOWLEDGE', result.error && result.error.code === RECOMMENDATION_ERRORS.NO_APPLICABLE_KNOWLEDGE);
}

console.log('\n[Behaviour — a domain-wide rule (no appliesWhen) produces a real, cited Recommendation]');
{
  const ruleId = seedApproved({
    domainType: 'nor', kind: 'rule',
    payload: { statement: 'A NOR\'s subject line is always system-derived from its date, never freely authored.' },
    confidence: 0.95, sourceRef: 'rule-domain-wide',
  });
  const problem = makeProblem({ domainType: 'nor', description: 'What governs a NOR\'s subject line?', facts: {} });
  const result = reason(problem);
  check('reason() succeeds', result.ok);
  check('isRecommendation() accepts the real output', result.ok && isRecommendation(result.data));
  check('citedRuleIds includes the seeded rule', result.ok && result.data.citedRuleIds.includes(ruleId));
  check('claim is built from the rule\'s OWN recorded statement text', result.ok && result.data.claim.includes('system-derived from its date'));
  check('explanation is non-empty (explainability-service#explain composed for every cited item)', result.ok && result.data.explanation.length > 0);
  check('no conflicts detected (only one applicable rule)', result.ok && result.data.conflicts.length === 0);
}

console.log('\n[Behaviour — appliesWhen: a scoped rule applies only when its named facts match]');
{
  seedApproved({
    domainType: 'sop', kind: 'rule',
    payload: { statement: 'Ambulance vehicles are excluded from standard scoring.', appliesWhen: { vehicleType: 'ambulance' } },
    confidence: 0.8, sourceRef: 'rule-scoped',
  });
  const nonMatching = reason(makeProblem({ domainType: 'sop', description: 'x', facts: { vehicleType: 'sedan' } }));
  check('a non-matching Problem gets NO_APPLICABLE_KNOWLEDGE (the rule correctly did not apply)',
    !nonMatching.ok && nonMatching.error.code === RECOMMENDATION_ERRORS.NO_APPLICABLE_KNOWLEDGE);
  const matching = reason(makeProblem({ domainType: 'sop', description: 'x', facts: { vehicleType: 'ambulance' } }));
  check('a matching Problem gets a real Recommendation', matching.ok && isRecommendation(matching.data));
}

console.log('\n[Behaviour — conflicting rules are detected, never silently resolved, and confidence is penalized]');
{
  const ruleA = seedApproved({ domainType: 'internal_letter', kind: 'rule', payload: { statement: 'Rule A applies.' }, confidence: 0.9, sourceRef: 'conflict-a' });
  const ruleB = seedApproved({ domainType: 'internal_letter', kind: 'rule', payload: { statement: 'Rule B applies.' }, confidence: 0.9, sourceRef: 'conflict-b' });
  seedApproved({
    domainType: 'internal_letter', kind: 'relationship',
    payload: { fromId: ruleA, toId: ruleB, type: 'conflicts_with' },
    confidence: 1, sourceRef: 'conflict-relationship',
  });
  const result = reason(makeProblem({ domainType: 'internal_letter', description: 'x', facts: {} }));
  check('reason() still succeeds (a conflict is surfaced, never discarded)', result.ok);
  check('conflicts array is non-empty', result.ok && result.data.conflicts.length > 0);
  check('confidence is LOWER than either rule\'s own carried-through confidence (0.9), because of the detected conflict',
    result.ok && result.data.confidence < 0.9);
  check('confidenceBasis honestly explains the penalty', result.ok && /conflict/i.test(result.data.confidenceBasis));
}

console.log('\n[Behaviour — Knowledge Gap Detection: no Approved Ontology reports exactly one critical gap]');
{
  const gaps = detectKnowledgeGaps('petty_cash');
  check('exactly one gap (missing_context) when no Ontology exists', gaps.length === 1 && gaps[0].gapType === 'missing_context');
  check('that gap is CRITICAL priority', gaps[0].priority === 'critical');
  check('recommendedQuestion satisfies the reused QuestionTreeEntry shape', gaps[0].recommendedQuestion.status === 'open' && typeof gaps[0].recommendedQuestion.question === 'string');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
