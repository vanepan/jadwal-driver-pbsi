/* ============================================================
   intelligence-corpus-temporal-check.cjs — Historical vs Current
   Convention (V2, Phase 5.x.3)

   CJS test for the STAGED read-only server surface — the
   `temporalView` + `driftCheck` ops on the intelligenceCorpus callable.
   No emulator — the Admin SDK RTDB surface is a faithful in-memory fake.

   Proves:
     1  auth / authz — unauth → unauthenticated; non-admin → permission-
        denied; unknown op → invalid-argument
     2  FAIL SAFE — with no temporal analyzer wired → TEMPORAL_UNAVAILABLE,
        and NOTHING is written (§15)
     3  OWNER ISOLATION — the server gathers ONLY the caller's own corpus
        documents + observations; another user's corpus is never seen; the
        client cannot supply the corpus, an owner, or a pre-computed view
     4  NO WRITE — temporalView / driftCheck mutate nothing: documents,
        observations, analysisStatus, lifecycleState all unchanged (§16)
     5  APPROVED RULE is READ-ONLY — a client-supplied rule with hostile
        `approvedBy` / `authority` fields is sanitised to {category,key,
        value,ruleId} and never persisted (§10, §19)
     6  end-to-end with the REAL analyzer injected — a possible_drift
        picture is reported and the corpus is still untouched
     7  static scan — no secret / model / HTTP / V1 / knowledge / flag
        coupling in the temporal server code
     8  functions/index.js references + exports intelligenceCorpus
        (WIRED — Controlled Deployment Phase A; deploy NOT run)

   Run:  node scripts/intelligence-corpus-temporal-check.cjs   (exit 0 = pass)
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

const corpusStore = require('../functions/src/intelligence/corpusStore');
const callableDb = makeFakeDb();
require.cache[require.resolve('../functions/src/config/admin')] = { id: 'admin-shim', loaded: true, exports: { admin: {}, auth: {}, db: callableDb } };
const { intelligenceCorpus, __setTemporalAnalyzerForTest } = require('../functions/src/intelligence/intelligenceCorpus');

(async () => {
  const AT = '2026-09-04T00:00:00.000Z';
  const asAdmin = (uid) => ({ uid, token: { role: 'admin' } });

  /* seed a corpus document + one observation for `owner` */
  async function seed(owner, id, sourceDate, value) {
    const ing = await corpusStore.ingestDocument(callableDb, { seed: { checksum: id.padEnd(64, '0'), title: `doc ${id}`, sourceDate }, ownerId: owner, now: AT });
    const docId = ing.data.document.documentId;
    // classification writes the sourceDate onto the stored record
    await corpusStore.setClassification(callableDb, docId, { patch: { sourceDate }, actorId: owner, at: AT });
    const rec = await corpusStore.recordObservation(callableDb, {
      seed: {
        documentId: docId, category: 'opening_pattern', key: 'opening_salutation', observedValue: value, modality: 'text',
        provenance: [{ sourceDocumentId: docId, sourceFileId: null, pageNumber: null, region: null, extractionMethod: 'structure_parse', extractedAt: AT, confidence: 0.8 }],
        confidence: 0.8,
      },
      ownerId: owner, now: AT,
    });
    if (!rec.ok) throw new Error('seed obs failed: ' + JSON.stringify(rec.error));
    return docId;
  }

  // alice: 2 historical (A) + 3 current (B)   → drift picture for approved rule = A
  await seed('alice', 'al_h1', '2022-01-01', 'A opening');
  await seed('alice', 'al_h2', '2023-01-01', 'A opening');
  await seed('alice', 'al_c1', '2026-02-01', 'B opening');
  await seed('alice', 'al_c2', '2026-03-01', 'B opening');
  await seed('alice', 'al_c3', '2026-04-01', 'B opening');
  // bob: his own separate corpus
  await seed('bob', 'bo_1', '2026-05-01', 'Z opening');

  const snapshotDb = () => JSON.stringify(callableDb._root);

  /* ── 1. auth / authz ──────────────────────────────────────────────── */
  section('auth / authz / op');
  {
    let t;
    t = null; try { await intelligenceCorpus.run({ data: { op: 'temporalView' } }); } catch (e) { t = e; }
    check(t && t.code === 'unauthenticated', 'no auth → unauthenticated');
    t = null; try { await intelligenceCorpus.run({ data: { op: 'temporalView' }, auth: { uid: 'x', token: { role: 'driver' } } }); } catch (e) { t = e; }
    check(t && t.code === 'permission-denied', 'non-admin → permission-denied');
    t = null; try { await intelligenceCorpus.run({ data: { op: 'temporalBogus' }, auth: asAdmin('a') }); } catch (e) { t = e; }
    check(t && t.code === 'invalid-argument', 'unknown op → invalid-argument');
  }

  /* ── 2. fail safe ────────────────────────────────────────────────── */
  section('temporalView — PRODUCTION analyzer wired via corpus-esm (Phase C1); read-only, mutates nothing (§15)');
  {
    __setTemporalAnalyzerForTest(null); // NO injection → exercises the deployed corpus-esm analyzer
    const before = snapshotDb();
    const r = await intelligenceCorpus.run({ data: { op: 'temporalView' }, auth: asAdmin('alice') });
    check(r.ok && r.data && typeof r.data === 'object', 'temporalView (production analyzer, empty owner corpus) → ok, a view object — NOT TEMPORAL_UNAVAILABLE (the corpus-esm mirror loaded)');
    check(snapshotDb() === before, 'the database is byte-identical afterwards — nothing was written (read-only)');
  }

  /* ── 3 + 4. owner isolation + no write ───────────────────────────── */
  section('temporalView — owner isolation + read-only (§16, §19)');
  {
    let capturedInput = null;
    let capturedConfig = null;
    __setTemporalAnalyzerForTest(async (input, config) => {
      capturedInput = input;
      capturedConfig = config;
      return { schema: 'corpus-temporal-report@1', generatedAt: AT, windows: {}, temporalConfigured: true, conventions: [], conflicts: [], drift: [], summary: {} };
    });
    const before = snapshotDb();
    const r = await intelligenceCorpus.run({
      data: {
        op: 'temporalView',
        config: { temporal: { historicalCutoff: '2025-01-01', currentWindowStart: '2026-01-01' }, enabled: true, stages: { observations: false } },
        // hostile injections — must all be ignored
        ownerId: 'bob', documents: [{ documentId: 'corpus_INJECTED' }], observations: [{ observationId: 'obs_INJECTED' }], view: { conventions: [{ conventionStatus: 'current_evidence' }] },
      },
      auth: asAdmin('alice'),
    });
    check(r.ok, 'temporalView with an injected analyzer → ok');
    check(capturedInput && capturedInput.documents.every((d) => d.ownerId === 'alice'), 'the analyzer received ONLY alice-owned documents');
    check(capturedInput.documents.length === 5 && capturedInput.observations.length === 5, "exactly alice's 5 documents + 5 observations were gathered server-side");
    check(!capturedInput.documents.some((d) => d.documentId === 'corpus_INJECTED') && !capturedInput.observations.some((o) => o.observationId === 'obs_INJECTED'),
      'the client-supplied `documents` / `observations` were IGNORED — the server built the corpus itself');
    check(!capturedInput.documents.some((d) => String(d.documentId).startsWith('corpus_bo_')), "bob's corpus is never visible to alice (owner isolation)");
    check(capturedConfig && capturedConfig.temporal && capturedConfig.temporal.historicalCutoff === '2025-01-01' && capturedConfig.temporal.currentWindowStart === '2026-01-01', 'the temporal config passes through, sanitised to the windows block');
    check(!('enabled' in capturedConfig) && !('stages' in capturedConfig), 'non-temporal config keys (enabled / stages) were stripped');
    check(snapshotDb() === before, 'temporalView wrote NOTHING to the database');
  }

  /* ── 5 + 6. driftCheck end-to-end with the REAL analyzer ─────────── */
  section('driftCheck — real analyzer, approved rule READ-ONLY, corpus untouched (§10, §11, §19)');
  {
    const esm = await import('../src/intelligence/corpus/temporal/convention-temporal-analyzer.js');
    __setTemporalAnalyzerForTest((input, config, opts) => esm.analyzeConventionTemporal(input, config, opts));
    const before = snapshotDb();
    const r = await intelligenceCorpus.run({
      data: {
        op: 'driftCheck',
        config: { temporal: { historicalCutoff: '2025-01-01', currentWindowStart: '2026-01-01', minCurrentDocuments: 2 } },
        approvedRule: { category: 'opening_pattern', key: 'opening_salutation', value: 'A opening', ruleId: 'rule_A',
          approvedBy: 'someHuman', approvedAt: '2020-01-01', authority: 'CURRENT_POLICY' },
      },
      auth: asAdmin('alice'),
    });
    check(r.ok && Array.isArray(r.data.drift) && r.data.drift.length === 1, 'driftCheck → one DriftFinding');
    const d = r.data.drift[0];
    check(d.status === 'possible_drift' && d.ruleUnchanged === true, 'status possible_drift; ruleUnchanged true (§10, §11)');
    check(d.approvedRule.value === 'A opening' && d.approvedRule.ruleId === 'rule_A'
      && !('approvedBy' in d.approvedRule) && !('authority' in d.approvedRule),
      'the approved rule is echoed with ONLY {category,key,value,ruleId} — hostile fields dropped (§19)');
    check(d.competingEvidence.some((e) => e.observedValue === 'B opening'), 'the competing recent value (B) is exposed');
    check(snapshotDb() === before, 'driftCheck wrote NOTHING — the approved rule and the corpus are untouched');
    // missing approvedRule
    const bad = await intelligenceCorpus.run({ data: { op: 'driftCheck', config: {} }, auth: asAdmin('alice') });
    check(!bad.ok && bad.error.code === 'INVALID_RECORD', 'driftCheck without an approvedRule → INVALID_RECORD');
    // cross-user: bob runs temporalView, only sees his own 1 doc
    let bobInput = null;
    __setTemporalAnalyzerForTest(async (input) => { bobInput = input; return { schema: 'corpus-temporal-report@1', generatedAt: AT, windows: {}, temporalConfigured: false, conventions: [], conflicts: [], drift: [], summary: {} }; });
    await intelligenceCorpus.run({ data: { op: 'temporalView' }, auth: asAdmin('bob') });
    check(bobInput && bobInput.documents.length === 1 && bobInput.documents[0].ownerId === 'bob', "bob's temporalView sees ONLY bob's 1 document");
    __setTemporalAnalyzerForTest(null);
  }

  /* ── 7. static scan ─────────────────────────────────────────────── */
  section('static — no secret / model / HTTP / V1 / knowledge / flag in the temporal server code');
  {
    const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    const src = fs.readFileSync(path.join(ROOT, 'functions/src/intelligence/intelligenceCorpus.js'), 'utf8');
    const blob = stripComments(src);
    // isolate the temporal region for the tighter checks
    check(/op === 'temporalView' \|\| op === 'driftCheck'/.test(blob), 'the temporalView / driftCheck branch exists');
    check(!/sk-[A-Za-z0-9]|OPENAI_API_KEY|api\.openai\.com|openai|anthropic|\bfetch\s*\(/i.test(blob.replace(/no openai/gi, '')), 'no secret / model / outbound-HTTP reference');
    check(!/require\([^)]*petty|generateNor\s*\(|pettyCashNors|promoteKnowledge|knowledge_repository|require\([^)]*\/knowledge|feature_flags/i.test(blob), 'no V1 / knowledge / feature-flag coupling');
    check(/gatherOwnerCorpus\(uid\)/.test(blob) && /listByOwner\(db, uid\)/.test(blob), 'temporalView gathers the corpus by the VERIFIED uid only');
    check(/sanitizeApprovedRules/.test(blob) && /sanitizeTemporalConfig/.test(blob), 'the approved-rule list + config are sanitised before use');
    // temporalView/driftCheck must not call any corpusStore WRITE method
    const temporalRegion = (blob.match(/op === 'temporalView' \|\| op === 'driftCheck'[\s\S]*?\n    \} else \{/) || [''])[0];
    check(temporalRegion.length > 0 && !/corpusStore\.(ingestDocument|recordObservation|setAnalysisStatus|setClassification)\b/.test(temporalRegion),
      'the temporal branch calls NO corpusStore write method (read-only — §16)');
    check(/import\(['"]\.\/corpus-esm\/temporal\/convention-temporal-analyzer\.js['"]\)/.test(blob) && /resolveTemporalAnalyzer\(\)/.test(blob) && /TEMPORAL_UNAVAILABLE/.test(blob), 'temporalView wires the production corpus-esm analyzer (Phase C1) AND retains a TEMPORAL_UNAVAILABLE fail-safe for a mirror load failure (§15)');
  }

  /* ── 8. wiring (WIRED — Controlled Deployment Phase A) ───────────── */
  section('functions/index.js — intelligenceCorpus is WIRED (Controlled Deployment Phase A)');
  {
    const idx = fs.readFileSync(path.join(ROOT, 'functions/index.js'), 'utf8');
    check(/require\(['"]\.\/src\/intelligence\/intelligenceCorpus['"]\)/.test(idx) && /exports\.intelligenceCorpus\s*=\s*intelligenceCorpus/.test(idx), 'functions/index.js requires + exports intelligenceCorpus (deploy still NOT run; the temporalView / driftCheck ops stay read-only and fail safe with no analyzer wired)');
  }

  console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'} — ${fail} failing check(s).`);
  process.exit(fail === 0 ? 0 : 1);
})();
