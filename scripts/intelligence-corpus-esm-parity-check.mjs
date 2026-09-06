/* ============================================================
   intelligence-corpus-esm-parity-check.mjs — Controlled Deployment Phase C1

   DRIFT GUARD for the vendored ESM analysis mirror.

   functions/src/intelligence/corpus-esm/** is a VERBATIM copy of the
   traced dependency closure of the four deterministic runners under
   src/intelligence/corpus/**:

     • pipeline/analysis-pipeline.js          (intelligenceCorpus.analyze)
     • writing-memory/writing-memory-builder.js
                                              (intelligenceCorpus.writingMemory,
                                               intelligenceStyleGuide.proposeFromMemory)
     • visual-template/visual-evidence-aggregator.js
                                              (intelligenceVisualTemplate.proposeFromEvidence)
     • temporal/convention-temporal-analyzer.js
                                              (intelligenceCorpus.temporalView / driftCheck)

   Firebase deploys only the functions/ directory, so the root src/ ESM
   tree cannot execute in production. This mirror ships INSIDE the bundle
   and is loaded via dynamic import(). It MUST stay byte-identical to the
   source of truth. This check re-traces the closure from the mirror's
   own entry points and asserts, for every file:

     1. it exists at the same corpus-relative path under src/intelligence/corpus/
     2. it is byte-identical to that source file
     3. the traced file SET is exactly equal both directions (no missing,
        no stale extra)
     4. no closure file imports anything outside the mirror except the two
        sanctioned externals: `mammoth` (.docx) and `node:zlib` (PDF inflate)

   Plus: the ESM package marker (corpus-esm/package.json → {"type":"module"})
   is present and correct.

   Run:  node scripts/intelligence-corpus-esm-parity-check.mjs   (exit 0 = pass)
   ============================================================ */

import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve, relative, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC_BASE = join(ROOT, 'src/intelligence/corpus');
const MIRROR_BASE = join(ROOT, 'functions/src/intelligence/corpus-esm');

const ENTRIES = [
  'pipeline/analysis-pipeline.js',
  'writing-memory/writing-memory-builder.js',
  'visual-template/visual-evidence-aggregator.js',
  'temporal/convention-temporal-analyzer.js',
];
const ALLOWED_EXTERNALS = new Set(['mammoth', 'node:zlib']);

let fail = 0;
const check = (cond, msg) => { console.log(`${cond ? '✓' : '✗'} ${msg}`); if (!cond) fail += 1; };
const norm = (p) => p.split('\\').join('/');

/** Trace the relative-import closure of ENTRIES starting from `base`. */
function traceClosure(base) {
  const seen = new Set();
  const externals = new Set();
  const missing = [];
  function walk(file) {
    file = norm(file);
    if (seen.has(file)) return;
    seen.add(file);
    let src;
    try { src = readFileSync(file, 'utf8'); } catch { missing.push(relative(base, file)); seen.delete(file); return; }
    const re = /(?:import|export)[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|require\(\s*['"]([^'"]+)['"]\s*\)/g;
    let m;
    while ((m = re.exec(src))) {
      const spec = m[1] || m[2] || m[3];
      if (!spec) continue;
      if (spec.startsWith('.')) walk(resolve(dirname(file), spec));
      else externals.add(spec);
    }
  }
  for (const e of ENTRIES) walk(join(base, e));
  return {
    files: [...seen].map((f) => norm(relative(base, f))).sort(),
    externals: [...externals].sort(),
    missing,
  };
}

console.log('\n── the ESM package marker ──');
const pkgPath = join(MIRROR_BASE, 'package.json');
check(existsSync(pkgPath), 'functions/src/intelligence/corpus-esm/package.json exists');
let pkg = {};
try { pkg = JSON.parse(readFileSync(pkgPath, 'utf8')); } catch { /* handled below */ }
check(pkg.type === 'module', 'corpus-esm/package.json declares "type": "module" (so Node loads the mirror as ESM inside the CJS functions package)');
check(!pkg.dependencies && !pkg.main && !pkg.exports, 'corpus-esm/package.json is a pure marker — no dependencies / main / exports of its own');

console.log('\n── trace the closure from the MIRROR entry points ──');
const mir = traceClosure(MIRROR_BASE);
check(mir.missing.length === 0, `every relative import in the mirror resolves (${mir.missing.length} missing: ${mir.missing.join(', ') || 'none'})`);
check(mir.files.length >= ENTRIES.length, `the mirror closure has ${mir.files.length} files`);
check(mir.externals.every((e) => ALLOWED_EXTERNALS.has(e)), `the mirror closure imports ONLY sanctioned externals (found: ${mir.externals.join(', ') || 'none'}; allowed: mammoth, node:zlib)`);

console.log('\n── trace the closure from the SOURCE-OF-TRUTH entry points ──');
const src = traceClosure(SRC_BASE);
check(src.missing.length === 0, `every relative import in src/intelligence/corpus resolves (${src.missing.length} missing)`);

console.log('\n── the two closures are the SAME file set ──');
const inMirrorNotSrc = mir.files.filter((f) => !src.files.includes(f));
const inSrcNotMirror = src.files.filter((f) => !mir.files.includes(f));
check(inMirrorNotSrc.length === 0, `no file in the mirror closure is absent from src/ (${inMirrorNotSrc.join(', ') || 'none'})`);
check(inSrcNotMirror.length === 0, `no file the source closure needs is missing from the mirror (${inSrcNotMirror.join(', ') || 'none'})`);

console.log('\n── every mirrored file is BYTE-IDENTICAL to its source ──');
let identical = 0;
for (const rel of mir.files) {
  const a = join(SRC_BASE, rel);
  const b = join(MIRROR_BASE, rel);
  let same = false;
  try { same = Buffer.compare(readFileSync(a), readFileSync(b)) === 0; } catch { same = false; }
  if (same) identical += 1;
  else check(false, `DRIFT: functions/src/intelligence/corpus-esm/${rel} differs from src/intelligence/corpus/${rel}`);
}
check(identical === mir.files.length, `all ${mir.files.length} mirrored files are byte-identical to src/intelligence/corpus/**`);

console.log('\n── no stray non-closure .js files were copied into the mirror ──');
// The mirror should contain EXACTLY the closure files + package.json (nothing more).
import('node:fs/promises').then(async (fsp) => {
  const walkDir = async (d, acc = []) => {
    for (const ent of await fsp.readdir(d, { withFileTypes: true })) {
      const p = join(d, ent.name);
      if (ent.isDirectory()) await walkDir(p, acc);
      else acc.push(norm(relative(MIRROR_BASE, p)));
    }
    return acc;
  };
  const onDisk = (await walkDir(MIRROR_BASE)).filter((f) => f !== 'package.json').sort();
  const extra = onDisk.filter((f) => !mir.files.includes(f));
  const gone = mir.files.filter((f) => !onDisk.includes(f));
  check(extra.length === 0, `the mirror holds NO file outside the traced closure (${extra.join(', ') || 'none'})`);
  check(gone.length === 0, `the mirror holds every traced closure file on disk (${gone.join(', ') || 'none'})`);

  console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'} — ${fail} failing check(s).`);
  process.exit(fail === 0 ? 0 : 1);
});
