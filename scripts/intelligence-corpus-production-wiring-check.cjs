/* ============================================================
   intelligence-corpus-production-wiring-check.cjs
   — Controlled Deployment Phase C1

   Positively assert that the deterministic analysis runners are WIRED FOR
   PRODUCTION (not merely test-injectable):

     • functions/package.json declares `mammoth`
     • functions/src/intelligence/corpus-esm/ ships the four entry points
       + the {"type":"module"} marker
     • intelligenceCorpus / intelligenceStyleGuide / intelligenceVisualTemplate
       each dynamic-import() the corpus-esm mirror, resolve via a
       resolve*() helper, and RETAIN the *_UNAVAILABLE fail-safe for a
       mirror load failure
     • the __set*ForTest seams are still exported (unit isolation — §10)
     • RUNTIME: with NO injection, each op reaches the real runner (never
       returns *_UNAVAILABLE); WITH injection, the fake still wins

   No emulator, no network, no OpenAI. Fake Admin SDK db.

   Run:  node scripts/intelligence-corpus-production-wiring-check.cjs
   ============================================================ */

'use strict';

process.env.FIREBASE_CONFIG = process.env.FIREBASE_CONFIG
  || JSON.stringify({ databaseURL: 'https://check-only.firebaseio.com', projectId: 'check-only' });
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || 'check-only';

const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');

let fail = 0;
const check = (cond, msg) => { console.log(`${cond ? '✓' : '✗'} ${msg}`); if (!cond) fail += 1; };
const section = (t) => console.log(`\n── ${t} ──`);
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/* ── faithful, path-aware fake Admin SDK db ─────────────────────────── */
function makeFakeDb(seed) {
  const root = seed ? JSON.parse(JSON.stringify(seed)) : {};
  const at = (p) => String(p).split('/').reduce((a, k) => (a == null ? undefined : a[k]), root);
  const setAt = (p, v) => { const s = String(p).split('/'); let n = root; for (let i = 0; i < s.length - 1; i += 1) { n[s[i]] = n[s[i]] || {}; n = n[s[i]]; } n[s[s.length - 1]] = v; };
  const snap = (v) => ({ val: () => (v === undefined ? null : v), exists: () => v != null, forEach: (cb) => { if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) cb({ key: k, val: () => x }); } });
  function ref(p) {
    return {
      async once() { return snap(at(p)); },
      async set(v) { setAt(p, v); },
      async update(v) { setAt(p, Object.assign({}, at(p) || {}, v)); },
      async remove() { setAt(p, undefined); },
      push() { const id = 'k' + Math.random().toString(36).slice(2, 10); return { key: id, async set(v) { setAt(p + '/' + id, v); } }; },
      orderByChild(ck) { return { equalTo(val) { return { async once() { const all = at(p) || {}; const o = {}; for (const [k, r] of Object.entries(all)) if (r && r[ck] === val) o[k] = r; return snap(Object.keys(o).length ? o : null); } }; } }; },
      limitToFirst() { return this; }, limitToLast() { return this; },
    };
  }
  return { ref, _root: root };
}

/* ══════════════════════════════════════════════════════════════════════ */

section('functions/package.json — mammoth declared for the real .docx path');
{
  const pkg = JSON.parse(read('functions/package.json'));
  check(pkg.dependencies && typeof pkg.dependencies.mammoth === 'string', `functions/package.json depends on mammoth (${(pkg.dependencies || {}).mammoth || 'MISSING'})`);
}

section('functions/src/intelligence/corpus-esm/ — the vendored ESM mirror ships in the bundle');
{
  const base = 'functions/src/intelligence/corpus-esm';
  for (const f of [
    'package.json',
    'pipeline/analysis-pipeline.js',
    'writing-memory/writing-memory-builder.js',
    'visual-template/visual-evidence-aggregator.js',
    'temporal/convention-temporal-analyzer.js',
  ]) check(fs.existsSync(path.join(ROOT, base, f)), `${base}/${f} exists`);
  check(JSON.parse(read(base + '/package.json')).type === 'module', 'the mirror is an ESM package ("type":"module")');
  check(!/\brequire\s*\(/.test(read(base + '/pipeline/analysis-pipeline.js')), 'the mirror entry points are ESM (no require())');
}

section('the three callables dynamic-import() the mirror + keep the fail-safe');
for (const [file, spec, resolver, code] of [
  ['functions/src/intelligence/intelligenceCorpus.js', './corpus-esm/pipeline/analysis-pipeline.js', 'resolveAnalyzePipeline', 'PIPELINE_UNAVAILABLE'],
  ['functions/src/intelligence/intelligenceCorpus.js', './corpus-esm/temporal/convention-temporal-analyzer.js', 'resolveTemporalAnalyzer', 'TEMPORAL_UNAVAILABLE'],
  ['functions/src/intelligence/intelligenceCorpus.js', './corpus-esm/writing-memory/writing-memory-builder.js', 'resolveWritingMemoryBuilder', 'WRITING_MEMORY_UNAVAILABLE'],
  ['functions/src/intelligence/intelligenceStyleGuide.js', './corpus-esm/writing-memory/writing-memory-builder.js', 'resolveWritingMemoryBuilder', 'WRITING_MEMORY_UNAVAILABLE'],
  ['functions/src/intelligence/intelligenceVisualTemplate.js', './corpus-esm/visual-template/visual-evidence-aggregator.js', 'resolveVisualAggregator', 'VISUAL_ANALYSIS_UNAVAILABLE'],
]) {
  const src = read(file);
  const b = path.basename(file);
  check(src.includes(`import('${spec}')`), `${b}: dynamic import('${spec}')`);
  check(new RegExp(`${resolver}\\s*\\(`).test(src), `${b}: resolves the runner via ${resolver}()`);
  check(src.includes(code), `${b}: RETAINS the ${code} fail-safe (mirror load failure)`);
  check(!/require\(['"][^'"]*\/src\/intelligence\/corpus\//.test(src), `${b}: never require()s the root src/intelligence/corpus/ ESM tree`);
}

section('__set*ForTest injection seams are retained (§10)');
{
  const corpus = read('functions/src/intelligence/intelligenceCorpus.js');
  check(/module\.exports[\s\S]*__setAnalyzePipelineForTest/.test(corpus), 'intelligenceCorpus exports __setAnalyzePipelineForTest');
  check(/module\.exports[\s\S]*__setTemporalAnalyzerForTest/.test(corpus), 'intelligenceCorpus exports __setTemporalAnalyzerForTest');
  check(/module\.exports[\s\S]*__setWritingMemoryBuilderForTest/.test(corpus), 'intelligenceCorpus exports __setWritingMemoryBuilderForTest');
  check(/module\.exports[\s\S]*__setWritingMemoryBuilderForTest/.test(read('functions/src/intelligence/intelligenceStyleGuide.js')), 'intelligenceStyleGuide exports __setWritingMemoryBuilderForTest');
  check(/module\.exports[\s\S]*__setVisualAggregatorForTest/.test(read('functions/src/intelligence/intelligenceVisualTemplate.js')), 'intelligenceVisualTemplate exports __setVisualAggregatorForTest');
}

(async () => {
  section('RUNTIME — no injection ⇒ the production runner executes (never *_UNAVAILABLE)');

  const db = makeFakeDb({ feature_flags: { intelligence: { enabled: false } } });
  require.cache[require.resolve(path.join(ROOT, 'functions/src/config/admin'))] = {
    id: 'admin-shim', loaded: true, exports: { admin: {}, auth: {}, db },
  };
  const { intelligenceCorpus, __setAnalyzePipelineForTest, __setWritingMemoryBuilderForTest, __setTemporalAnalyzerForTest } = require(path.join(ROOT, 'functions/src/intelligence/intelligenceCorpus'));
  const { intelligenceStyleGuide } = require(path.join(ROOT, 'functions/src/intelligence/intelligenceStyleGuide'));
  const { intelligenceVisualTemplate } = require(path.join(ROOT, 'functions/src/intelligence/intelligenceVisualTemplate'));
  const asAdmin = (uid) => ({ uid, token: { role: 'admin' } });

  // ensure NO injection is active
  __setAnalyzePipelineForTest(null); __setWritingMemoryBuilderForTest(null); __setTemporalAnalyzerForTest(null);

  const wm = await intelligenceCorpus.run({ data: { op: 'writingMemory' }, auth: asAdmin('u1') });
  check(wm.ok && Array.isArray(wm.data.entries), `corpus.writingMemory → ok, entries[] (got ${wm.ok ? 'ok' : wm.error.code})`);

  const tv = await intelligenceCorpus.run({ data: { op: 'temporalView' }, auth: asAdmin('u1') });
  check(tv.ok, `corpus.temporalView → ok (got ${tv.ok ? 'ok' : tv.error.code})`);

  db._root.intelligence_corpus_documents = { ['corpus_' + 'd'.repeat(64)]: { schema: 'corpus-document@1', documentId: 'corpus_' + 'd'.repeat(64), ownerId: 'u1', checksum: 'd'.repeat(64), ingestionStatus: 'received', analysisStatus: 'pending', sourceFileId: null, createdAt: '2026-09-06T00:00:00.000Z', updatedAt: '2026-09-06T00:00:00.000Z' } };
  const an = await intelligenceCorpus.run({ data: { op: 'analyze', documentId: 'corpus_' + 'd'.repeat(64) }, auth: asAdmin('u1') });
  check(!an.ok && an.error.code === 'ANALYSIS_FAILED', `corpus.analyze (no source) → honest ANALYSIS_FAILED, NOT PIPELINE_UNAVAILABLE (got ${an.ok ? 'ok' : an.error.code})`);

  const sg = await intelligenceStyleGuide.run({ data: { op: 'proposeFromMemory', memoryId: 'mem_x' }, auth: asAdmin('u1') });
  check(!sg.ok && sg.error.code === 'MEMORY_NOT_FOUND', `styleGuide.proposeFromMemory → MEMORY_NOT_FOUND, NOT WRITING_MEMORY_UNAVAILABLE (got ${sg.ok ? 'ok' : sg.error.code})`);

  const vt = await intelligenceVisualTemplate.run({ data: { op: 'proposeFromEvidence', patternId: 'pat_x' }, auth: asAdmin('u1') });
  check(!vt.ok && vt.error.code === 'PATTERN_NOT_FOUND', `visualTemplate.proposeFromEvidence → PATTERN_NOT_FOUND, NOT VISUAL_ANALYSIS_UNAVAILABLE (got ${vt.ok ? 'ok' : vt.error.code})`);

  section('RUNTIME — a test injection still WINS over the production runner');
  let hit = 0;
  __setWritingMemoryBuilderForTest(async () => { hit += 1; return { schema: 'writing-memory-report@1', generatedAt: 'x', temporalConfigured: false, entries: [], conflicts: [], drift: [], summary: {} }; });
  const wm2 = await intelligenceCorpus.run({ data: { op: 'writingMemory' }, auth: asAdmin('u1') });
  check(wm2.ok && hit === 1, 'an injected writingMemory builder is invoked instead of the production one');
  __setWritingMemoryBuilderForTest(null);

  console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'} — ${fail} failing check(s).`);
  process.exit(fail === 0 ? 0 : 1);
})();
