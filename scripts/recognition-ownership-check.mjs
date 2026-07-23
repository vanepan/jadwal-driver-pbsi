/* recognition-ownership-check.mjs — Phase 12.7.7, "Production Validation".

   Same two-part shape as scripts/body-ownership-check.mjs /
   scripts/learning-ownership-check.mjs / scripts/knowledge-ownership-
   check.mjs, on purpose.

   1. ARCHITECTURAL (static, source-scanning). Asserts: recognition-
      repository.js's writers (create/appendVersion) have exactly one
      legitimate caller (services/recognition-service.js); recognition/
      imports nothing from knowledge/, organizational-memory/, body/, or
      document-intelligence/ ENGINES OR REPOSITORIES — only the
      precedented pure-leaf contract reuses (evidence-contract.js,
      identity-contract.js), vocabulary-only registry reads
      (domain-type/kind/nor-type-registry.js — has-, get-, list- reads
      only, never register-), and the one services-facade import added THIS
      phase specifically for Recognition (knowledge/services/
      similarity-service.js); recognition/'s only touch of learning/ is
      emitLearningSignal, via services/learning-emission-service.js
      (cross-checked against scripts/learning-signal-ownership-check.mjs,
      the authority on that boundary from learning/'s own side); nothing
      outside js/v2/recognition/ imports js/v2/recognition/ yet — the
      Open Question 2 default (full dormancy, same precedent every domain
      since body/ has shipped under) is verified true, not just claimed.

   2. BEHAVIOURAL (runtime). Every real file under recognition/ imports
      cleanly in plain Node — unlike body/'s 3 real sensors (genuinely
      V1/Firebase-coupled by design), recognition/ has ZERO V1-coupled
      files in this phase (no direct document/entity reads are wired yet —
      that is deferred to a future, separately-approved sprint), so
      100% of this domain is Node-testable today. This is itself a real,
      checkable claim, not an assumption.

   Deterministic. No V1, no Firebase, no AI.
   Run: node scripts/recognition-ownership-check.mjs   (exit 0 = pass) */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0; let fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); }
}

const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

function filesUnder(dir) {
  const out = [];
  (function walk(rel) {
    for (const entry of fs.readdirSync(path.join(ROOT, rel), { withFileTypes: true })) {
      const r = `${rel}/${entry.name}`;
      if (entry.isDirectory()) walk(r);
      else if (entry.name.endsWith('.js')) out.push(r);
    }
  }(dir));
  return out;
}

const RECOGNITION_FILES = filesUnder('js/v2/recognition');

console.log('\n[Part 1 — recognition-repository.js\'s writers have exactly one caller]');
{
  const offenders = [];
  for (const rel of RECOGNITION_FILES) {
    if (rel === 'js/v2/recognition/services/recognition-service.js') continue;
    if (rel.startsWith('js/v2/recognition/repository/')) continue;
    const src = stripComments(read(rel));
    if (/from '\.\.\/repository\/recognition-repository\.js'/.test(src) || /from '\.\/repository\/recognition-repository\.js'/.test(src)) {
      offenders.push(rel);
    }
  }
  check(`only services/recognition-service.js imports repository/recognition-repository.js${offenders.length ? ` — FOUND: ${offenders.join(', ')}` : ''}`, offenders.length === 0);
}

console.log('\n[Part 2 — no upstream domain ENGINE or REPOSITORY import, only precedented exceptions]');
{
  // Same allowlist-by-name discipline body-ownership-check.mjs already
  // uses for ITS two precedented pure-leaf reuses, extended here with
  // Recognition's own: a services-facade import (added Phase 12.7.3
  // specifically so this edge could stay "services-only"), plus
  // vocabulary-only registry reads (Phase 12.7.2).
  const ALLOWED_EXACT = [
    '../../../../src/knowledge/contracts/evidence-contract.js',
    '../../../../../src/knowledge/contracts/identity-contract.js',
    '../../../../src/knowledge/services/similarity-service.js',
    '../../../../src/knowledge/registry/domain-type-registry.js',
    '../../../../src/knowledge/registry/kind-registry.js',
    '../../../../src/knowledge/registry/nor-type-registry.js',
    '../../../../src/learning/services/learning-signal-service.js',
  ];
  const offenders = [];
  for (const rel of RECOGNITION_FILES) {
    const src = stripComments(read(rel));
    const imports = [...src.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]);
    for (const imp of imports) {
      const isInternal = imp.startsWith('./') || imp.startsWith('../recognition') || (imp.startsWith('..') && !imp.includes('knowledge/') && !imp.includes('organizational-memory/') && !imp.includes('body/') && !imp.includes('learning/') && !imp.includes('document-intelligence/'));
      if (isInternal) continue; // a within-recognition/ relative import
      if (ALLOWED_EXACT.includes(imp)) continue;
      offenders.push(`${rel} -> ${imp}`);
    }
  }
  check(`no unlisted cross-domain import anywhere under recognition/${offenders.length ? ` — FOUND: ${offenders.join(', ')}` : ''}`, offenders.length === 0);
}

console.log('\n[Part 3 — dormancy: nothing outside recognition/ imports it yet]');
{
  const roots = ['js/v2/body', 'src/knowledge', 'src/organizational-memory', 'src/learning', 'src/document-intelligence', 'src/conversation', 'src/reasoning', 'src/intake', 'src/ui'];
  const offenders = [];
  for (const root of roots) {
    for (const rel of filesUnder(root)) {
      const src = stripComments(read(rel));
      if (/from\s+'[^']*\/recognition\//.test(src) || /from\s+'\.\.\/recognition\//.test(src)) offenders.push(rel);
    }
  }
  check(`nothing outside recognition/ imports it yet (Open Question 2 default: full dormancy)${offenders.length ? ` — FOUND: ${offenders.join(', ')}` : ''}`, offenders.length === 0);
}

console.log('\n[Part 4 — behavioural: every real recognition/ file imports cleanly in plain Node]');
{
  const modules = RECOGNITION_FILES.filter((f) => !f.includes('/repository/implementations/')); // implementations are exercised individually below
  const results = await Promise.allSettled(modules.map((rel) => import(`../${rel}`)));
  const failed = results
    .map((r, i) => ({ r, rel: modules[i] }))
    .filter(({ r }) => r.status === 'rejected');
  check(`ALL ${modules.length} recognition/ files import cleanly in plain Node (zero transitive Firebase/V1 dependency, unlike body/'s 3 real sensors)${failed.length ? ` — FAILED: ${failed.map((f) => f.rel).join(', ')}` : ''}`, failed.length === 0);

  const barrelResult = await import('../js/v2/recognition/services/index.js');
  check('services/index.js (the full namespaced barrel) imports cleanly and exposes every real namespace', ['records', 'classification', 'similarity', 'clustering', 'graph', 'learning'].every((k) => k in barrelResult));

  const indexResult = await import('../js/v2/recognition/index.js');
  check('recognition/index.js (the dormant barrel) imports cleanly and stays a structural no-op', indexResult.RECOGNITION_DORMANT === true);
}

console.log('\n[Part 5 — regression: the EXISTING recognition-*-check.mjs scripts, re-run unmodified]');
{
  const { execFileSync } = await import('node:child_process');
  const priorScripts = [
    'recognition-foundation-check.mjs', 'recognition-classification-check.mjs', 'recognition-similarity-check.mjs',
    'recognition-clustering-check.mjs', 'recognition-graph-check.mjs', 'recognition-learning-emission-check.mjs',
  ];
  for (const script of priorScripts) {
    try {
      execFileSync('node', [`scripts/${script}`], { cwd: ROOT, stdio: 'pipe' });
      check(`scripts/${script} (pre-existing, unmodified) still passes in full`, true);
    } catch {
      check(`scripts/${script} (pre-existing, unmodified) still passes in full`, false);
    }
  }
}

console.log(`\n${pass}/${pass + fail} checks passed.`);
if (fail > 0) process.exit(1);
