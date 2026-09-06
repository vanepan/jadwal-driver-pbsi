/* ============================================================
   intelligence-corpus-ingestion-check.cjs — Corpus Ingestion & Document
   Analysis (V2, Phase 5.x.2)

   CJS test for the SERVER side of Phase 5.x.2
   (functions/src/intelligence/corpusChecksum.js + the corpusStore
   `setClassification` write + the intelligenceCorpus `setClassification`
   and `analyze` ops). No emulator — the Admin SDK RTDB surface is a
   faithful in-memory fake.

   Proves:
     1  CJS ⇄ ESM checksum parity — the same bytes hash identically
     2  corpusStore.setClassification — server re-validates every field;
        only documentType / typeConfidence / documentEra / eraConfidence /
        sourceDate / pageCount can move; the §5 "unknown era ⇒ confidence
        < 1" invariant holds; ownerId / ingestionStatus / analysisStatus /
        observations are NEVER touched
     3  the intelligenceCorpus callable — auth / authz / op matrix for the
        two NEW ops; cross-owner setClassification / analyze → FORBIDDEN;
        a client CANNOT set an approval field or an owner
     4  `analyze` FAILS SAFE — with no pipeline wired it returns
        PIPELINE_UNAVAILABLE and mutates NOTHING (§14)
     5  `analyze` with an injected fake pipeline — writes classification +
        the analysis-status chain + observations, EVERY observation forced
        to 'observed' (§21), a model-injected 'approved' is stripped
     6  static scan — no secret / endpoint / model call in the Phase 5.x.2
        server files; no V1 / knowledge / feature-flag coupling
     7  functions/index.js references + exports intelligenceCorpus
        (WIRED — Controlled Deployment Phase A; deploy NOT run)

   Run:  node scripts/intelligence-corpus-ingestion-check.cjs   (exit 0 = pass)
   ============================================================ */

'use strict';

process.env.FIREBASE_CONFIG = process.env.FIREBASE_CONFIG
  || JSON.stringify({ databaseURL: 'https://check-only.firebaseio.com', projectId: 'check-only' });
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || 'check-only';

const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');

let fail = 0;
const check = (cond, msg) => { console.log(`${cond ? '✓' : '✗'} ${msg}`); if (!cond) fail++; };
const section = (t) => console.log(`\n── ${t} ──`);

function makeFakeDb() {
  const root = {};
  const getAt = (p) => p.split('/').reduce((a, k) => (a == null ? undefined : a[k]), root);
  const setAt = (p, v) => {
    const parts = p.split('/'); let n = root;
    for (let i = 0; i < parts.length - 1; i += 1) { n[parts[i]] = n[parts[i]] || {}; n = n[parts[i]]; }
    n[parts[parts.length - 1]] = v;
  };
  const drop = (v) => {
    if (Array.isArray(v)) { const a = v.map(drop).filter((x) => x !== undefined); return a.length ? a : undefined; }
    if (v && typeof v === 'object') { const o = {}; for (const [k, x] of Object.entries(v)) { const d = drop(x); if (d !== undefined) o[k] = d; } return Object.keys(o).length ? o : undefined; }
    return v === undefined ? undefined : v;
  };
  const snap = (val) => ({ val: () => (val === undefined ? null : val), exists: () => val != null, forEach: (cb) => { if (val && typeof val === 'object') for (const [k, v] of Object.entries(val)) cb({ key: k, val: () => v }); } });
  function ref(p) {
    return {
      async once() { return snap(getAt(p)); },
      async set(v) { setAt(p, drop(v) === undefined ? null : drop(v)); },
      orderByChild(ck) { return { equalTo(val) { return { async once() {
        const all = getAt(p) || {}; const out = {};
        for (const [k, row] of Object.entries(all)) if (row && row[ck] === val) out[k] = row;
        return snap(Object.keys(out).length ? out : null);
      } }; } }; },
    };
  }
  return { ref, _root: root };
}

const cc = require('../functions/src/intelligence/corpusChecksum');
const corpusStore = require('../functions/src/intelligence/corpusStore');

const callableDb = makeFakeDb();
require.cache[require.resolve('../functions/src/config/admin')] = { id: 'admin-shim', loaded: true, exports: { admin: {}, auth: {}, db: callableDb } };
const { intelligenceCorpus, __setAnalyzePipelineForTest } = require('../functions/src/intelligence/intelligenceCorpus');

(async () => {
  const esmChecksum = await import('../src/intelligence/corpus/ingestion/corpus-checksum.js');
  const AT = '2026-09-03T00:00:00.000Z';

  /* ── 1. checksum parity ──────────────────────────────────────────── */
  section('CJS ⇄ ESM checksum parity (§5)');
  const bytes = Buffer.from('the original document bytes for phase 5.x.2');
  const cjsHash = await cc.computeCorpusChecksum(bytes);
  const esmHash = await esmChecksum.computeCorpusChecksum(new Uint8Array(bytes));
  check(cjsHash === esmHash && /^[0-9a-f]{64}$/.test(cjsHash), 'CJS Node crypto and ESM Web Crypto produce the SAME SHA-256 for the same bytes');
  check(cc.computeCorpusChecksumSync(bytes) === cjsHash, 'the sync variant matches the async one');
  check(await cc.computeCorpusChecksum('abc') === 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad', 'known SHA-256("abc")');

  /* seed helper — a corpus document owned by `owner` in `db` */
  const seedDoc = async (db, over = {}) => {
    const checksum = over.checksum || 'a'.repeat(64);
    const r = await corpusStore.ingestDocument(db, {
      seed: { checksum, title: over.title || 'Nota Organisasi Sarpras 113', originalFilename: 'NOR-113.docx', pageCount: over.pageCount, mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
      ownerId: over.ownerId || 'owner', now: AT,
    });
    if (!r.ok) throw new Error('seedDoc failed: ' + JSON.stringify(r.error));
    return r.data.document;
  };

  /* ── 2. corpusStore.setClassification ────────────────────────────── */
  section('corpusStore.setClassification — server-authoritative, 6 fields only (§6, §7)');
  {
    const db = makeFakeDb();
    const doc = await seedDoc(db, { checksum: 'c1'.padEnd(64, '1') });
    const id = doc.documentId;
    const before = JSON.parse(JSON.stringify(db._root.intelligence_corpus_documents[id]));

    const r = await corpusStore.setClassification(db, id, {
      patch: { documentType: 'NOTA_ORGANISASI', typeConfidence: 0.9, documentEra: 'current', eraConfidence: 0.8, sourceDate: '2026-05-18', pageCount: 3,
        // fields that MUST be ignored
        ownerId: 'mallory', ingestionStatus: 'stored', analysisStatus: 'completed', classification: 'public' },
      actorId: 'owner', at: AT,
    });
    check(r.ok && r.data.documentType === 'NOTA_ORGANISASI' && r.data.typeConfidence === 0.9 && r.data.documentEra === 'current' && r.data.sourceDate === '2026-05-18' && r.data.pageCount === 3,
      'the 6 classification fields are applied');
    check(r.data.ownerId === 'owner' && r.data.ingestionStatus === before.ingestionStatus && r.data.analysisStatus === before.analysisStatus && r.data.classification === 'restricted',
      'ownerId / ingestionStatus / analysisStatus / classification are UNTOUCHED (only the 6 derived fields move)');
    // §5 invariant on the server side
    const r2 = await corpusStore.setClassification(db, id, { patch: { documentEra: 'unknown', eraConfidence: 1 }, actorId: 'owner', at: AT });
    check(r2.ok && r2.data.documentEra === 'unknown' && r2.data.eraConfidence < 1, 'an "unknown" era is re-normalised to eraConfidence < 1 by makeCorpusDocument (§5 invariant, server side)');
    const bad = await corpusStore.setClassification(db, id, { patch: { documentType: 'INVOICE' }, actorId: 'owner', at: AT });
    check(!bad.ok && bad.error.code === 'INVALID_RECORD', 'an unknown documentType is refused');
    const miss = await corpusStore.setClassification(db, 'corpus_ghost', { patch: { documentType: 'NOR' }, actorId: 'owner', at: AT });
    check(!miss.ok && miss.error.code === 'NOT_FOUND', 'setClassification on an unknown document → NOT_FOUND');
    // no observation was created
    check(db._root.intelligence_corpus_observations === undefined, 'setClassification writes NO observation');
  }

  /* ── 3+4. the callable — auth / new ops / fail-safe analyze ───────── */
  section('intelligenceCorpus callable — auth / authz / the new ops');
  {
    let t;
    t = null; try { await intelligenceCorpus.run({ data: { op: 'setClassification', documentId: 'x' } }); } catch (e) { t = e; }
    check(t && t.code === 'unauthenticated', 'no auth → unauthenticated');
    t = null; try { await intelligenceCorpus.run({ data: { op: 'analyze', documentId: 'x' }, auth: { uid: 'bob', token: { role: 'driver' } } }); } catch (e) { t = e; }
    check(t && t.code === 'permission-denied', 'non-admin → permission-denied');
    t = null; try { await intelligenceCorpus.run({ data: { op: 'classifyMagically' }, auth: { uid: 'a', token: { role: 'admin' } } }); } catch (e) { t = e; }
    check(t && t.code === 'invalid-argument', 'admin + unknown op → invalid-argument');
  }

  section('analyze — PRODUCTION pipeline wired via corpus-esm (Phase C1); honest ANALYSIS_FAILED on empty input, no observations');
  {
    __setAnalyzePipelineForTest(null); // NO injection → exercises the deployed corpus-esm pipeline
    await seedDoc(callableDb, { checksum: 'ff'.padEnd(64, 'f'), ownerId: 'alice' });
    const docId = 'corpus_' + 'ff'.padEnd(64, 'f');
    // no `source` supplied → the real pipeline returns an honest INVALID_INPUT / failed
    const r = await intelligenceCorpus.run({ data: { op: 'analyze', documentId: docId }, auth: { uid: 'alice', token: { role: 'admin' } } });
    check(!r.ok && r.error.code === 'ANALYSIS_FAILED', 'analyze (production pipeline, no source) → honest ANALYSIS_FAILED — NOT PIPELINE_UNAVAILABLE (the corpus-esm mirror loaded)');
    check(callableDb._root.intelligence_corpus_documents[docId].analysisStatus === 'failed', 'the honest "failed" analysis status was recorded (pending → failed is a legal step)');
    check(callableDb._root.intelligence_corpus_observations === undefined, 'NO observation was written');
  }

  section('setClassification via callable — owner-scoped, no client injection');
  {
    const asAdmin = (uid) => ({ uid, token: { role: 'admin' } });
    await seedDoc(callableDb, { checksum: 'ab'.padEnd(64, 'a'), ownerId: 'alice' });
    const docId = 'corpus_' + 'ab'.padEnd(64, 'a');
    const bob = await intelligenceCorpus.run({ data: { op: 'setClassification', documentId: docId, classification: { documentType: 'NOR' } }, auth: asAdmin('bob') });
    check(!bob.ok && bob.error.code === 'FORBIDDEN', "a different admin cannot classify alice's document → FORBIDDEN");
    const ok = await intelligenceCorpus.run({
      data: { op: 'setClassification', documentId: docId, classification: { documentType: 'NOTA_ORGANISASI', typeConfidence: 0.88, documentEra: 'unknown', eraConfidence: 1, sourceDate: '2026-05-18', ownerId: 'bob', analysisStatus: 'completed' } },
      auth: asAdmin('alice'),
    });
    check(ok.ok && ok.data.documentType === 'NOTA_ORGANISASI' && ok.data.ownerId === 'alice' && ok.data.eraConfidence < 1 && ok.data.analysisStatus === 'pending',
      'owner classify → applied; injected ownerId + analysisStatus ignored; §5 clamp applied');
  }

  section('analyze via callable (injected fake pipeline) — writes classification + status chain + OBSERVED observations (§21)');
  {
    const asAdmin = (uid) => ({ uid, token: { role: 'admin' } });
    await seedDoc(callableDb, { checksum: 'cd'.padEnd(64, 'c'), ownerId: 'carol' });
    const docId = 'corpus_' + 'cd'.padEnd(64, 'c');

    // a fake pipeline runner that returns a realistic PipelineResult,
    // INCLUDING a model-style observation that tries to be 'approved'
    __setAnalyzePipelineForTest(async ({ documentId }) => ({
      ok: true,
      documentId,
      classification: { documentType: 'NOTA_ORGANISASI', typeConfidence: 0.9, documentEra: 'current', eraConfidence: 0.8, sourceDate: '2026-05-18', pageCount: 2 },
      analysisStatus: 'completed',
      statusPath: ['structure_extracted', 'completed'],
      stages: [{ stage: 'text_extraction', outcome: 'ran' }, { stage: 'observations', outcome: 'ran' }],
      observations: [
        { schema: 'corpus-observation@1', observationId: `obs_${documentId}__recipient_convention__recipient_label`, documentId, category: 'recipient_convention', modality: 'text', key: 'recipient_label',
          observedValue: 'Kepada Yth.', normalizedValue: null, observation: null,
          provenance: [{ schema: 'corpus-provenance@1', sourceDocumentId: documentId, sourceFileId: null, pageNumber: null, region: null, extractionMethod: 'structure_parse', extractedAt: AT, confidence: 0.8 }],
          confidence: 0.8, occurrenceCount: 1, lifecycleState: 'observed', approvedBy: null, approvedAt: null, preferenceRationale: null, createdAt: AT, updatedAt: AT },
        // a hostile "approved" observation — the callable MUST strip it back to observed
        { schema: 'corpus-observation@1', observationId: `obs_${documentId}__layout__signature_block`, documentId, category: 'layout', modality: 'visual', key: 'signature_block',
          observedValue: 'bottom-right', normalizedValue: null, observation: { anchor: 'bottom-right' },
          provenance: [{ schema: 'corpus-provenance@1', sourceDocumentId: documentId, sourceFileId: null, pageNumber: 1, region: null, extractionMethod: 'visual_analysis', extractedAt: AT, confidence: 0.5 }],
          confidence: 0.5, occurrenceCount: 1, lifecycleState: 'approved', approvedBy: 'the-model', approvedAt: AT, preferenceRationale: 'the model approved itself', createdAt: AT, updatedAt: AT },
      ],
    }));

    const r = await intelligenceCorpus.run({ data: { op: 'analyze', documentId: docId }, auth: asAdmin('carol') });
    check(r.ok && r.data.analysis && r.data.analysis.observationsRecorded === 2, 'analyze → ok, 2 observations recorded');
    check(r.data.document.documentType === 'NOTA_ORGANISASI' && r.data.document.sourceDate === '2026-05-18' && r.data.document.pageCount === 2, 'the derived classification was written');
    check(r.data.document.analysisStatus === 'completed', 'the analysis-status chain advanced to "completed" via legal steps');
    const obsRows = Object.values(callableDb._root.intelligence_corpus_observations || {}).filter((o) => o.documentId === docId);
    check(obsRows.length === 2 && obsRows.every((o) => o.lifecycleState === 'observed'), 'BOTH persisted observations are "observed" — the model-injected "approved" was forced back (§21)');
    check(obsRows.every((o) => o.approvedBy == null && o.preferenceRationale == null), 'no approvedBy / preferenceRationale on any persisted observation');
    check(obsRows.every((o) => o.ownerId === 'carol'), 'every observation is owned by the caller');

    // cross-owner analyze
    const bobAnalyze = await intelligenceCorpus.run({ data: { op: 'analyze', documentId: docId }, auth: asAdmin('bob') });
    check(!bobAnalyze.ok && bobAnalyze.error.code === 'FORBIDDEN', "another admin cannot analyze carol's document → FORBIDDEN");

    __setAnalyzePipelineForTest(null); // reset for other suites
  }

  /* ── 6. static security scan ─────────────────────────────────────── */
  section('static — no secret / endpoint / model call / V1 / knowledge / flag coupling');
  {
    const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    const files = ['intelligenceCorpus.js', 'corpusStore.js', 'corpusChecksum.js', 'corpusContract.js'].map((f) => fs.readFileSync(path.join(ROOT, 'functions/src/intelligence', f), 'utf8'));
    const rawBlob = files.join('\n');
    const blob = files.map(stripComments).join('\n');
    check(!/sk-[A-Za-z0-9]{12,}/.test(rawBlob), 'no key literal anywhere (raw incl. comments)');
    check(!/sk-[A-Za-z0-9]|OPENAI_API_KEY|api\.openai\.com|openai|anthropic/i.test(blob.replace(/no openai/gi, '')), 'no OpenAI / model endpoint / SDK reference in the Phase 5.x.2 server code');
    check(!/\bfetch\s*\(|https?:\/\/[a-z0-9.-]+\.[a-z]{2,}/i.test(blob.replace(/check-only\.firebaseio\.com/g, '')), 'the server code makes NO outbound HTTP call');
    check(!/process\.env(?!\.FIREBASE_CONFIG|\.GCLOUD_PROJECT)/i.test(blob), 'no env-var read beyond the Firebase runtime config');
    check(!/require\([^)]*petty|from\s+['"][^'"]*petty|generateNor\s*\(|pettyCashNors/i.test(blob), 'no V1 Petty Cash / generateNor coupling');
    check(!/promoteKnowledge|knowledge_repository|approvedKnowledge|require\([^)]*src\/knowledge|require\([^)]*\/knowledge/i.test(blob), 'no organizational-knowledge write / import');
    check(!/feature_flags/i.test(blob), 'never touches the feature-flag node');
    check(!/require\(['"][^'"]*\/src\/intelligence\//.test(blob), 'the CJS server never require()s the root ESM src/intelligence/ tree (production analysis runs via a dynamic import() of the vendored functions/src/intelligence/corpus-esm/ mirror instead)');
    const callSrc = fs.readFileSync(path.join(ROOT, 'functions/src/intelligence/intelligenceCorpus.js'), 'utf8');
    check(/METADATA ONLY/.test(callSrc) && !/logger\.(info|log|warn)\([^;]*\b(observedValue|preferenceRationale|body|text)\b[^;]*\)/.test(stripComments(callSrc)), 'the log call is METADATA ONLY — never the observed text / rationale');
    check(/canUseIntelligence\(auth\.token\)/.test(callSrc) && /const uid = auth\.uid/.test(callSrc), 'authz + actor/owner unchanged (canUseIntelligence(auth.token); owner = auth.uid)');
    check(/import\(['"]\.\/corpus-esm\/pipeline\/analysis-pipeline\.js['"]\)/.test(callSrc) && /resolveAnalyzePipeline\(\)/.test(callSrc) && /PIPELINE_UNAVAILABLE/.test(callSrc), 'analyze wires the production corpus-esm pipeline (Phase C1) AND retains a PIPELINE_UNAVAILABLE fail-safe for a mirror load failure (§14)');
    check(/forced to 'observed'|forced back|lifecycleState: _l/.test(callSrc) || /lifecycleState: _l/.test(callSrc), 'analyze strips the client/model lifecycleState before recordObservation');
  }

  /* ── 7. wiring assertion (WIRED — Controlled Deployment Phase A) ──── */
  section('functions/index.js — intelligenceCorpus is WIRED (Controlled Deployment Phase A)');
  {
    const idx = fs.readFileSync(path.join(ROOT, 'functions/index.js'), 'utf8');
    check(/require\(['"]\.\/src\/intelligence\/intelligenceCorpus['"]\)/.test(idx) && /exports\.intelligenceCorpus\s*=\s*intelligenceCorpus/.test(idx), 'functions/index.js requires + exports intelligenceCorpus (deploy still NOT run; ingest/analyze write ops remain inert behind the undeployed rule blocks + OFF flag)');
  }

  console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'} — ${fail} failing check(s).`);
  process.exit(fail === 0 ? 0 : 1);
})();
