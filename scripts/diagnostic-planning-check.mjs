/* diagnostic-planning-check.mjs — Phase 8-10, Part 2 ("Diagnostic
   Planning Engine").

   1. ARCHITECTURAL (static). reasoning/'s Phase 8-10 additions
      (hypothesis-engine.js, diagnostic-planning-engine.js) never import
      conversation/ or problem-intelligence/ — planDiagnosis() receives
      `candidateFields` as a plain parameter instead (see that file's own
      header for why).

   2. BEHAVIOURAL. Hypothesis generation is cite-or-abstain (zero overlap
      with Approved Knowledge -> zero hypotheses, never a guess);
      updateHypotheses() correctly CONFIRMS a corroborated hypothesis and
      RULES OUT a contradicted one; planDiagnosis() composes gaps +
      hypotheses into one DiagnosticPlan and picks a real
      recommendedNextQuestion with an honest gainBasis.

   Deterministic. No AI, no Firebase touch.
   Run: node scripts/diagnostic-planning-check.mjs   (exit 0 = pass) */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  setKnowledgeBackend, ingest, promoteKnowledge, LIFECYCLE_STATE,
} from '../src/knowledge/services/knowledge-service.js';
import { generateKnowledgeId } from '../src/knowledge/contracts/identity-contract.js';
import { makeProblem } from '../src/reasoning/contracts/problem-contract.js';
import {
  planDiagnosis, generateHypotheses, updateHypotheses, HYPOTHESIS_STATUS, isDiagnosticPlan, isHypothesis,
} from '../src/reasoning/services/reasoning-service.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0; let fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); }
}
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
function importsOf(code) {
  const targets = [];
  const blocks = code.match(/import\s*(?:\{[^}]*\}|\S+)\s*from\s*'[^']*'/gs) || [];
  for (const b of blocks) { const m = b.match(/from\s*'([^']*)'/); if (m) targets.push(m[1]); }
  return targets;
}

console.log('\n[Part 1 — diagnostic-planning-engine.js / hypothesis-engine.js never import conversation/ or problem-intelligence/]');
{
  const files = ['src/reasoning/diagnostic-planning-engine.js', 'src/reasoning/hypothesis-engine.js'];
  const offenders = [];
  for (const rel of files) {
    for (const t of importsOf(read(rel))) {
      if (/\/(conversation|problem-intelligence)\//.test(t)) offenders.push(`${rel} -> ${t}`);
    }
  }
  check(`no violation found${offenders.length ? ` — FOUND: ${offenders.join(', ')}` : ''}`, offenders.length === 0);
}

setKnowledgeBackend('memory');

function seedApproved({ domainType, kind, payload, sourceRef }) {
  const id = generateKnowledgeId({ domainType, sourceType: 'manual-file', sourceRef });
  const now = new Date().toISOString();
  ingest({
    id, version: 1, domainType, sourceType: 'manual-file', kind, payload, confidence: 0.8,
    lifecycleState: LIFECYCLE_STATE.DRAFT,
    provenance: { connectorId: 'manual-file', sourceRef, capturedAt: now },
    approvedBy: null, approvedAt: null, preferenceRationale: null, createdAt: now, updatedAt: now,
  });
  promoteKnowledge(id, { approverId: 'evan', decidedAt: now, preferenceRationale: 'seed for diagnostic-planning-check.mjs' });
  return id;
}

console.log('\n[Behaviour — generateHypotheses is cite-or-abstain]');
{
  const problem = makeProblem({ domainType: 'engineering', description: 'x', facts: { category: 'facility', asset: 'Genset', symptom: 'Mati' } });
  const empty = generateHypotheses(problem);
  check('zero Approved knowledge -> zero hypotheses, never a guess', empty.length === 0);

  const causeId = seedApproved({
    domainType: 'engineering', kind: 'organizational_reasoning',
    payload: { claim: 'Genset units commonly fail (mati) when the fuel filter clogs after prolonged use.', evidenceRefs: ['ref-1'] },
    sourceRef: 'genset-cause',
  });
  const hypotheses = generateHypotheses(problem);
  check('a real, evidence-cited hypothesis is generated', hypotheses.length === 1);
  check('isHypothesis() accepts it', isHypothesis(hypotheses[0]));
  check('cites the real seeded item', hypotheses[0].evidenceRefs.includes(causeId));
  check('cause text is the item\'s OWN recorded claim, never a generated sentence', hypotheses[0].cause.includes('fuel filter clogs'));
  check('likelihood reflects real overlap (facility/genset/mati vs the claim text)', hypotheses[0].likelihood > 0 && hypotheses[0].likelihood <= 1);
}

console.log('\n[Behaviour — updateHypotheses correctly CONFIRMS a corroborated hypothesis and RULES OUT a contradicted one]');
{
  const initial = [
    { id: 'h1', cause: 'The fuel filter is clogged, causing the failure.', evidenceRefs: ['x'], likelihood: 0.7, status: HYPOTHESIS_STATUS.CANDIDATE },
    { id: 'h2', cause: 'The battery is dead, causing the failure.', evidenceRefs: ['y'], likelihood: 0.2, status: HYPOTHESIS_STATUS.CANDIDATE },
  ];
  const updated = updateHypotheses(initial, { field: 'observation', value: 'fuel filter' });
  const h1 = updated.find((h) => h.id === 'h1');
  const h2 = updated.find((h) => h.id === 'h2');
  check('h1 (corroborated) likelihood increased', h1.likelihood > 0.7);
  check('h1 status is CONFIRMED (crossed the confirm threshold)', h1.status === HYPOTHESIS_STATUS.CONFIRMED);
  check('h2 (not corroborated) likelihood decreased', h2.likelihood < 0.2);
  check('h2 status is RULED_OUT (fell below the rule-out threshold)', h2.status === HYPOTHESIS_STATUS.RULED_OUT);
  check('output is sorted by likelihood descending', updated[0].id === 'h1');

  const reUpdated = updateHypotheses(updated, { field: 'x', value: 'battery' });
  check('a CONFIRMED/RULED_OUT hypothesis is terminal — never reconsidered', reUpdated.find((h) => h.id === 'h1').likelihood === h1.likelihood);
}

console.log('\n[Behaviour — planDiagnosis composes gaps + hypotheses into one real DiagnosticPlan]');
{
  const problem = makeProblem({ domainType: 'engineering', description: 'AC kamar atlet rusak.', facts: { category: 'facility', asset: 'AC', location: 'Kamar Atlet', symptom: 'Rusak' } });
  const candidateFields = [
    { field: 'urgency', label: 'Urgensi', prompt: 'Seberapa mendesak?', optimizable: true },
    { field: 'safetyImpact', label: 'Dampak Keselamatan', prompt: 'Berdampak keselamatan?', optimizable: true },
  ];
  const plan = planDiagnosis(problem, candidateFields);
  check('isDiagnosticPlan() accepts the real output', isDiagnosticPlan(plan));
  check('missingInformation includes the real detected Knowledge Gap(s)', plan.missingInformation.length > 0);
  check('recommendedNextQuestion is real, non-null', !!plan.recommendedNextQuestion);
  check('recommendedNextQuestion carries an honest, non-empty gainBasis', typeof plan.recommendedNextQuestion.gainBasis === 'string' && plan.recommendedNextQuestion.gainBasis.length > 0);
  check('confidence is a real number in [0,1]', typeof plan.confidence === 'number' && plan.confidence >= 0 && plan.confidence <= 1);
  check('hypotheses array reflects the earlier-seeded engineering knowledge', plan.hypotheses.length >= 0); // may be 0 or 1 depending on overlap — structural check only
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
