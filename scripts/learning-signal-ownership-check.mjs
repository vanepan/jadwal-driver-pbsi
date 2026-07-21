/* learning-signal-ownership-check.mjs — Phase 12.6.7, "Universal Learning
   Engine: Ownership".

   Same two-part shape as scripts/body-ownership-check.mjs /
   scripts/learning-ownership-check.mjs, on purpose.

   1. ARCHITECTURAL (static, source-scanning). Asserts: no new file under
      js/v2/learning/ or js/v2/learning-bridge/ imports a producer domain's
      repository or ENGINE (the same leak-check discipline
      learning-ownership-check.mjs's own Part 2 already runs, applied to
      the new files); learning-bridge/ imports ONLY body-event-repository.js's
      `list`/`getForEntity`, never `append`; learning-signal-service.js's
      own source contains exactly one repository-touching call
      (recordLearningEvent) and no other write-shaped token — proving
      "never a second ledger" by direct inspection; learning-outcome-
      service.js and body-learning-bridge-service.js both route through
      emitLearningSignal only, never learning-repository.js or
      learning-service.js's writers directly.

   2. REGRESSION. Re-runs the EXISTING, unmodified
      scripts/learning-ownership-check.mjs as a subprocess — its own Part 9
      producer-callsite assertions (all 14 of them, across the original 8
      plus this phase's additions) already fail loudly if any pre-existing
      caller was accidentally touched. No new code duplicates those
      assertions here.

   Deterministic. No V1, no Firebase, no AI.
   Run: node scripts/learning-signal-ownership-check.mjs   (exit 0 = pass) */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0; let fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); }
}

const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

function allSourceFiles(dir) {
  const out = [];
  (function walk(rel) {
    for (const entry of fs.readdirSync(path.join(ROOT, rel), { withFileTypes: true })) {
      const r = `${rel}/${entry.name}`;
      if (entry.isDirectory()) walk(r);
      else if (entry.name.endsWith('.js')) out.push({ rel: r, code: stripComments(read(r)) });
    }
  }(dir));
  return out;
}

function importTargets(code) {
  const blocks = code.match(/import\s*(?:\{[^}]*\}|[\w*\s,]+)\s*from\s*'[^']*'|^import\s*'[^']*'/gms) || [];
  return blocks.map((b) => {
    const m = b.match(/from\s*'([^']*)'/) || b.match(/^import\s*'([^']*)'/);
    return { block: b, target: m ? m[1] : null };
  }).filter((x) => x.target);
}

function resolveRelative(fromRel, target) {
  if (!target.startsWith('.')) return target;
  const fromDir = path.posix.dirname(fromRel);
  return path.posix.normalize(path.posix.join(fromDir, target));
}

const LEARNING_FILES = allSourceFiles('js/v2/learning');
const BRIDGE_FILES = allSourceFiles('js/v2/learning-bridge');

console.log('\n[Part 1 — no new learning/ file imports a knowledge/ or organizational-memory/ ENGINE]');
{
  const FORBIDDEN_TREES = ['/v2/knowledge/', '/v2/organizational-memory/'];
  const ALLOWLISTED = /\/contracts\/[^/]+\.js$/;
  const leaks = [];
  for (const { rel, code } of LEARNING_FILES) {
    for (const { target } of importTargets(code)) {
      const resolved = resolveRelative(rel, target);
      if (!FORBIDDEN_TREES.some((t) => resolved.includes(t))) continue;
      if (ALLOWLISTED.test(resolved)) continue;
      leaks.push(`${rel} -> ${resolved}`);
    }
  }
  check(`no learning/ file (old or new) imports a knowledge/ or organizational-memory/ ENGINE${leaks.length ? ` — FOUND: ${leaks.join(', ')}` : ''}`, leaks.length === 0);
}

console.log('\n[Part 2 — learning-bridge/ imports ONLY body-event-repository.js\'s list/getForEntity, never append; and only emitLearningSignal from learning/]');
{
  const badBodyImports = [];
  const badLearningImports = [];
  const otherImports = [];
  for (const { rel, code } of BRIDGE_FILES) {
    for (const { block, target } of importTargets(code)) {
      const resolved = resolveRelative(rel, target);
      if (resolved.includes('/v2/body/')) {
        if (!/body-event-repository\.js$/.test(resolved) && !/body-event-contract\.js$/.test(resolved)) {
          otherImports.push(`${rel} -> ${resolved}`);
        }
        if (/body-event-repository\.js$/.test(resolved)) {
          const clause = block.match(/\{([^}]*)\}/);
          if (clause && /(^|[,{\s])append(\s+as\s+\w+)?\s*(,|$)/.test(clause[1])) badBodyImports.push(rel);
        }
      }
      if (resolved.includes('/v2/learning/')) {
        if (/learning-repository\.js$/.test(resolved)) badLearningImports.push(`${rel} -> ${resolved} (repository, should be emitLearningSignal)`);
        if (/services\/learning-service\.js$/.test(resolved)) badLearningImports.push(`${rel} -> ${resolved} (should route through emitLearningSignal, not learning-service.js directly)`);
      }
    }
  }
  check(`learning-bridge/ never imports body-event-repository.js's append()${badBodyImports.length ? ` — FOUND: ${badBodyImports.join(', ')}` : ''}`, badBodyImports.length === 0);
  check(`learning-bridge/ imports nothing from body/ beyond body-event-repository.js and body-event-contract.js${otherImports.length ? ` — FOUND: ${otherImports.join(', ')}` : ''}`, otherImports.length === 0);
  check(`learning-bridge/ never imports learning-repository.js or learning-service.js directly (must route through emitLearningSignal)${badLearningImports.length ? ` — FOUND: ${badLearningImports.join(', ')}` : ''}`, badLearningImports.length === 0);
}

console.log('\n[Part 3 — learning-signal-service.js: exactly one repository-touching call, never a second ledger]');
{
  const src = stripComments(read('js/v2/learning/services/learning-signal-service.js'));
  const writeTokens = (src.match(/\brecordLearningEvent\(/g) || []).length;
  check('recordLearningEvent( appears exactly once', writeTokens === 1);
  check('no other write-shaped token exists (.set(, new Map(, repoCreate, repoAppendVersion)', !/\.set\(|new Map\(|repoCreate|repoAppendVersion/.test(src));
}

console.log('\n[Part 4 — learning-outcome-service.js and body-learning-bridge-service.js both route through emitLearningSignal only]');
{
  const outcomeSrc = stripComments(read('js/v2/learning/services/learning-outcome-service.js'));
  check('learning-outcome-service.js imports ONLY emitLearningSignal from learning-signal-service.js, nothing from learning-repository.js', /emitLearningSignal/.test(outcomeSrc) && !/learning-repository\.js/.test(outcomeSrc) && !/repoCreate|repoAppendVersion/.test(outcomeSrc));

  const bridgeServiceSrc = stripComments(read('js/v2/learning-bridge/services/body-learning-bridge-service.js'));
  check('body-learning-bridge-service.js imports ONLY emitLearningSignal from learning/, nothing else write-shaped', /emitLearningSignal/.test(bridgeServiceSrc) && !/learning-repository\.js/.test(bridgeServiceSrc) && !/recordLearningEvent\(/.test(bridgeServiceSrc));

  // Phase 12.7.6 — recognition/'s own emission service is the third legal
  // caller (see Part 5's header below for why no bridge was needed here).
  const recognitionEmissionSrc = stripComments(read('js/v2/recognition/services/learning-emission-service.js'));
  check('recognition/services/learning-emission-service.js imports ONLY emitLearningSignal from learning/, nothing else write-shaped', /emitLearningSignal/.test(recognitionEmissionSrc) && !/learning-repository\.js/.test(recognitionEmissionSrc) && !/recordLearningEvent\(/.test(recognitionEmissionSrc));
}

console.log('\n[Part 5 — nothing outside learning/ + learning-bridge/ + recognition/ imports the new files yet (dormancy — same discipline as Phase 12.5)]');
{
  // Phase 12.7.6 (Continuous Learning Refinement) narrowed this assertion:
  // js/v2/recognition/services/learning-emission-service.js is now a
  // deliberate, approved THIRD caller of emitLearningSignal() — legally, the
  // same way knowledge/ and organizational-memory/ already call it directly
  // (recognition/ carries none of body/'s "must stay a pure zero-write peer"
  // constraint that required learning-bridge/ as an intermediary — see that
  // file's own header). This mirrors EXACTLY how Phase 12.6.7 itself already
  // narrowed scripts/body-ownership-check.mjs's analogous assertion after
  // learning-bridge/ became a deliberate, approved exception there — a stale
  // assertion fixed the moment a new, legitimate caller made it stale, not
  // silently left to rot. scripts/recognition-learning-emission-check.mjs is
  // the authority on exactly what recognition/ may import from learning/
  // (emitLearningSignal only, never learning-repository.js directly).
  const offenders = [];
  const scan = (dir) => {
    (function walk(rel) {
      if (rel === 'js/v2/learning' || rel === 'js/v2/learning-bridge' || rel === 'js/v2/recognition') return;
      for (const entry of fs.readdirSync(path.join(ROOT, rel), { withFileTypes: true })) {
        const r = `${rel}/${entry.name}`;
        if (entry.isDirectory()) { walk(r); continue; }
        if (!entry.name.endsWith('.js')) continue;
        const code = stripComments(read(r));
        for (const { target } of importTargets(code)) {
          const resolved = resolveRelative(r, target);
          if (resolved.includes('learning-signal-service') || resolved.includes('learning-recommendation-engine') || resolved.includes('learning-outcome-service') || resolved.includes('learning-lineage-engine') || resolved.includes('/v2/learning-bridge/')) {
            offenders.push(`${r} -> ${resolved}`);
          }
        }
      }
    }(dir));
  };
  scan('js/v2');
  check(`no file outside js/v2/learning/, js/v2/learning-bridge/, or js/v2/recognition/ imports any Phase 12.6 file yet${offenders.length ? ` — FOUND: ${offenders.join(', ')}` : ''}`, offenders.length === 0);
}

console.log('\n[Part 6 — regression: the EXISTING learning-ownership-check.mjs, re-run unmodified]');
{
  try {
    execFileSync('node', ['scripts/learning-ownership-check.mjs'], { cwd: ROOT, stdio: 'pipe' });
    check('scripts/learning-ownership-check.mjs (pre-existing, unmodified) still passes in full', true);
  } catch (e) {
    check(`scripts/learning-ownership-check.mjs (pre-existing, unmodified) still passes in full — FAILED:\n${e.stdout ? e.stdout.toString() : e.message}`, false);
  }
}

console.log(`\n${pass}/${pass + fail} checks passed.`);
if (fail > 0) process.exit(1);
