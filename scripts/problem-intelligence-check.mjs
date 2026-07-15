/* problem-intelligence-check.mjs — Phase 8-10, Part 1 ("Problem
   Intelligence Foundation").

   1. ARCHITECTURAL (static). problem-intelligence/ never imports
      conversation/ (the backwards, upstream-depends-on-downstream edge
      this domain's own README refuses) and never imports reasoning/'s
      ENGINES (contract-only import is fine, checked separately).

   2. BEHAVIOURAL. Both of this phase's own worked examples, driven
      through the real classification service: "AC kamar atlet rusak."
      classifies as facility/AC/Kamar Atlet/Rusak with urgency/
      budgetImpact/safetyImpact honestly ABSENT (never a fabricated
      "Unknown" string); "Mau buat perjalanan dinas." classifies as
      business_trip. An unrelated utterance honestly falls to 'unknown'.
      Category registry additivity ("Extensible Problem Types").

   Deterministic. No AI, no Firebase touch.
   Run: node scripts/problem-intelligence-check.mjs   (exit 0 = pass) */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  classifyProblem, classifyProblemWithContext, isProblem,
} from '../js/v2/problem-intelligence/services/problem-classification-service.js';
import {
  registerProblemCategory, hasProblemCategory, listProblemCategories, getProblemCategory,
} from '../js/v2/problem-intelligence/contracts/problem-category-contract.js';
import { knownCategories } from '../js/v2/problem-intelligence/problem-parser.js';
import { setKnowledgeBackend } from '../js/v2/knowledge/services/knowledge-service.js';

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

console.log('\n[Part 1 — problem-intelligence/ never imports conversation/, never a reasoning/ ENGINE (contract-only)]');
{
  const files = allSourceFiles('js/v2/problem-intelligence');
  const offenders = [];
  for (const { rel, code } of files) {
    for (const t of importsOf(code)) {
      if (/\/conversation\//.test(t)) offenders.push(`${rel} -> ${t} (conversation/)`);
      if (/\/reasoning\//.test(t) && !/contracts\/problem-contract\.js$/.test(t)) offenders.push(`${rel} -> ${t} (non-contract reasoning/ import)`);
    }
  }
  check(`no violation found${offenders.length ? ` — FOUND: ${offenders.join(', ')}` : ''}`, offenders.length === 0);
}

console.log('\n[Part 2 — nothing upstream imports problem-intelligence/ back]');
{
  const upstream = allSourceFiles('js/v2').filter((f) => /^js\/v2\/(knowledge|organizational-memory|learning|document-intelligence|conversation|reasoning|ai-foundation|file-storage)\//.test(f.rel));
  const offenders = [];
  for (const { rel, code } of upstream) {
    for (const t of importsOf(code)) { if (/\/problem-intelligence\//.test(t)) offenders.push(`${rel} -> ${t}`); }
  }
  check(`no upstream domain imports problem-intelligence/${offenders.length ? ` — FOUND: ${offenders.join(', ')}` : ''}`, offenders.length === 0);
}

console.log('\n[Part 3 — "Extensible Problem Types": the registry is real, additive]');
{
  const before = listProblemCategories().length;
  registerProblemCategory('test_only_category', 'Test Only', 'nor', []);
  check('registering a new category grows the registry by exactly 1', listProblemCategories().length === before + 1);
  check('hasProblemCategory finds it', hasProblemCategory('test_only_category'));
  check('the two bootstrap categories from this phase\'s own worked examples are registered',
    hasProblemCategory('facility') && hasProblemCategory('business_trip'));
  check('problem-parser.js#knownCategories() reflects the registry, not a hardcoded list',
    knownCategories().includes('test_only_category'));
}

/* ══ BEHAVIOUR ══════════════════════════════════════════════════════ */

setKnowledgeBackend('memory');

console.log('\n[Behaviour — "AC kamar atlet rusak." classifies exactly per this phase\'s own worked example]');
{
  const r = classifyProblem('AC kamar atlet rusak.');
  check('classifyProblem succeeds', r.ok);
  check('isProblem() accepts the real output', isProblem(r.data.problem));
  check('category is "facility"', r.data.problem.facts.category === 'facility');
  check('domainType resolved to "engineering" (facility\'s registered defaultDomainType)', r.data.problem.domainType === 'engineering');
  check('asset = "AC"', r.data.problem.facts.asset === 'AC');
  check('location = "Kamar Atlet"', r.data.problem.facts.location === 'Kamar Atlet');
  check('symptom = "Rusak"', r.data.problem.facts.symptom === 'Rusak');
  check('urgency is HONESTLY ABSENT (never a fabricated "Unknown" string)', !('urgency' in r.data.problem.facts));
  check('budgetImpact is HONESTLY ABSENT', !('budgetImpact' in r.data.problem.facts));
  check('safetyImpact is HONESTLY ABSENT', !('safetyImpact' in r.data.problem.facts));
  check('categoryConfidence is a real number > 0', typeof r.data.categoryConfidence === 'number' && r.data.categoryConfidence > 0);
}

console.log('\n[Behaviour — "Mau buat perjalanan dinas." classifies as business_trip]');
{
  const r = classifyProblem('Mau buat perjalanan dinas.');
  check('category is "business_trip"', r.data.problem.facts.category === 'business_trip');
  check('domainType resolved to "nor"', r.data.problem.domainType === 'nor');
  check('type extracted from the utterance itself', r.data.problem.facts.type === 'Perjalanan Dinas');
  check('destination/participants/schedule/budget are all honestly absent', !('destination' in r.data.problem.facts));
}

console.log('\n[Behaviour — an unrelated utterance honestly falls to "unknown", never a guess]');
{
  const r = classifyProblem('apa kabar hari ini');
  check('category is "unknown"', r.data.problem.facts.category === 'unknown');
  check('categoryConfidence is 0 or near-0', r.data.categoryConfidence < 0.2);
}

console.log('\n[Behaviour — classifyProblemWithContext composes a real ProblemContext]');
{
  const r = classifyProblemWithContext('AC kamar atlet rusak.');
  check('succeeds', r.ok);
  check('context.domainType matches the classified Problem', r.data.context.domainType === r.data.problem.domainType);
  check('context.knowledge is a real (possibly empty) array', Array.isArray(r.data.context.knowledge));
}

console.log('\n[Behaviour — an empty utterance is honestly rejected, never silently classified]');
{
  const r = classifyProblem('');
  check('ok:false', !r.ok);
  check('error code is INVALID_UTTERANCE', r.error.code === 'INVALID_UTTERANCE');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
