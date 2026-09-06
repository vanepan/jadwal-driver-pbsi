/* ============================================================
   intelligence-corpus-writing-memory-check.cjs — Organizational Writing
   Memory (V2, Phase 5.x.4)

   CJS test for the STAGED read-only server surface — the `writingMemory`
   op on the intelligenceCorpus callable. No emulator — the Admin SDK RTDB
   surface is a faithful in-memory fake.

   Proves:
     1  auth / authz / op — unauth → unauthenticated; non-admin →
        permission-denied; unknown op → invalid-argument
     2  FAIL SAFE — no builder wired → WRITING_MEMORY_UNAVAILABLE, nothing
        written (§22)
     3  OWNER ISOLATION — the server gathers ONLY the caller's own corpus;
        another user's corpus is never seen; a client-supplied corpus /
        owner / authorityState is ignored (§23)
     4  NO WRITE — writingMemory mutates nothing (DB byte-identical)
     5  NEVER `approved` — even if the injected builder tries to return an
        `approved` entry, the server strips it before returning (§8, §23)
     6  end-to-end with the REAL builder injected — a candidate memory +
        possible_drift picture, corpus untouched
     7  static scan — no secret / model / HTTP / V1 / knowledge / flag
        coupling; the writingMemory branch calls NO corpusStore write
     8  functions/index.js references + exports intelligenceCorpus
        (WIRED — Controlled Deployment Phase A; deploy NOT run)

   Run:  node scripts/intelligence-corpus-writing-memory-check.cjs   (exit 0 = pass)
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
const { intelligenceCorpus, __setWritingMemoryBuilderForTest } = require('../functions/src/intelligence/intelligenceCorpus');

(async () => {
  const AT = '2026-09-04T00:00:00.000Z';
  const asAdmin = (uid) => ({ uid, token: { role: 'admin' } });

  async function seed(owner, id, sourceDate, value, documentType, category, key) {
    const ing = await corpusStore.ingestDocument(callableDb, { seed: { checksum: id.padEnd(64, '0'), title: `doc ${id}`, sourceDate }, ownerId: owner, now: AT });
    const docId = ing.data.document.documentId;
    await corpusStore.setClassification(callableDb, docId, { patch: { sourceDate, documentType: documentType || 'NOR' }, actorId: owner, at: AT });
    const rec = await corpusStore.recordObservation(callableDb, {
      seed: {
        documentId: docId, category: category || 'opening_pattern', key: key || 'opening_salutation', observedValue: value, modality: 'text',
        provenance: [{ sourceDocumentId: docId, sourceFileId: null, pageNumber: null, region: null, extractionMethod: 'structure_parse', extractedAt: AT, confidence: 0.85 }],
        confidence: 0.85,
      },
      ownerId: owner, now: AT,
    });
    if (!rec.ok) throw new Error('seed obs failed: ' + JSON.stringify(rec.error));
    return docId;
  }

  // alice: closing_pattern drift picture — 1 historical "Demikian disampaikan" + 3 recent "Demikian kami sampaikan"
  await seed('alice', 'al_h', '2022-01-01', 'Demikian disampaikan', 'NOR', 'closing_pattern', 'closing');
  await seed('alice', 'al_c1', '2026-01-01', 'Demikian kami sampaikan', 'NOR', 'closing_pattern', 'closing');
  await seed('alice', 'al_c2', '2026-02-01', 'Demikian kami sampaikan', 'NOR', 'closing_pattern', 'closing');
  await seed('alice', 'al_c3', '2026-03-01', 'Demikian kami sampaikan', 'NOR', 'closing_pattern', 'closing');
  // bob: his own separate corpus
  await seed('bob', 'bo_1', '2026-05-01', 'Bob phrase', 'MEMORANDUM', 'opening_pattern', 'opening_salutation');

  const snapshotDb = () => JSON.stringify(callableDb._root);

  /* ── 1. auth / authz / op ────────────────────────────────────────── */
  section('auth / authz / op');
  {
    let t;
    t = null; try { await intelligenceCorpus.run({ data: { op: 'writingMemory' } }); } catch (e) { t = e; }
    check(t && t.code === 'unauthenticated', 'no auth → unauthenticated');
    t = null; try { await intelligenceCorpus.run({ data: { op: 'writingMemory' }, auth: { uid: 'x', token: { role: 'driver' } } }); } catch (e) { t = e; }
    check(t && t.code === 'permission-denied', 'non-admin → permission-denied');
    t = null; try { await intelligenceCorpus.run({ data: { op: 'writingMemoryBogus' }, auth: asAdmin('a') }); } catch (e) { t = e; }
    check(t && t.code === 'invalid-argument', 'unknown op → invalid-argument');
  }

  /* ── 2. fail safe ────────────────────────────────────────────────── */
  section('writingMemory — FAILS SAFE with no builder wired, mutates nothing (§22)');
  {
    __setWritingMemoryBuilderForTest(null);
    const before = snapshotDb();
    const r = await intelligenceCorpus.run({ data: { op: 'writingMemory' }, auth: asAdmin('alice') });
    check(!r.ok && r.error.code === 'WRITING_MEMORY_UNAVAILABLE', 'no builder → WRITING_MEMORY_UNAVAILABLE (envelope, no throw)');
    check(snapshotDb() === before, 'the database is byte-identical afterwards — nothing was written');
  }

  /* ── 3 + 4 + 5. owner isolation + no write + never approved ──────── */
  section('writingMemory — owner isolation, read-only, NEVER `approved` (§8, §16, §23)');
  {
    let capturedInput = null;
    let capturedConfig = null;
    __setWritingMemoryBuilderForTest(async (input, config) => {
      capturedInput = input;
      capturedConfig = config;
      // a HOSTILE builder that tries to leak an `approved` entry + approval metadata
      return {
        schema: 'writing-memory-report@1', generatedAt: AT, temporalConfigured: true,
        entries: [
          { schema: 'writing-memory@1', memoryId: 'mem_ok', category: 'opening_pattern', key: 'k', value: 'ok', normalizedValue: 'ok',
            documentType: 'NOR', temporalStatus: 'current_evidence', conventionEra: 'current', evidence: {}, confidence: 0.9,
            authorityState: 'candidate', sourceObservationIds: ['o'], sourceDocumentIds: ['d'], createdAt: AT, updatedAt: AT },
          { schema: 'writing-memory@1', memoryId: 'mem_hack', category: 'opening_pattern', key: 'k2', value: 'hack', normalizedValue: 'hack',
            documentType: 'NOR', temporalStatus: 'current_evidence', conventionEra: 'current', evidence: {}, confidence: 0.9,
            authorityState: 'approved', approvedBy: 'attacker', approvedAt: AT, sourceObservationIds: ['o'], sourceDocumentIds: ['d'], createdAt: AT, updatedAt: AT },
        ],
        conflicts: [], drift: [], summary: {},
      };
    });
    const before = snapshotDb();
    const r = await intelligenceCorpus.run({
      data: {
        op: 'writingMemory',
        config: { temporal: { historicalCutoff: '2025-01-01', currentWindowStart: '2026-01-01' }, candidateMinDocuments: 3, enabled: true, stages: { observations: false } },
        // hostile injections — must all be ignored
        ownerId: 'bob', documents: [{ documentId: 'corpus_INJECTED' }], observations: [{ observationId: 'obs_INJECTED' }],
        entries: [{ authorityState: 'approved', value: 'client says approved' }],
      },
      auth: asAdmin('alice'),
    });
    check(r.ok, 'writingMemory with an injected builder → ok');
    check(capturedInput && capturedInput.documents.every((d) => d.ownerId === 'alice') && capturedInput.documents.length === 4,
      "the builder received ONLY alice's 4 documents");
    check(capturedInput.observations.length === 4 && !capturedInput.documents.some((d) => d.documentId === 'corpus_INJECTED') && !capturedInput.observations.some((o) => o.observationId === 'obs_INJECTED'),
      'the client-supplied documents / observations were IGNORED — the server built the corpus itself');
    check(!capturedInput.documents.some((d) => String(d.documentId).startsWith('corpus_bo_')), "bob's corpus is never visible to alice");
    check(capturedConfig && capturedConfig.temporal && capturedConfig.temporal.currentWindowStart === '2026-01-01' && capturedConfig.candidateMinDocuments === 3, 'config passes through, sanitised (temporal windows + candidateMinDocuments only)');
    check(!('enabled' in capturedConfig) && !('stages' in capturedConfig), 'non-temporal config keys stripped');
    check(r.data.entries.length === 1 && r.data.entries[0].memoryId === 'mem_ok', 'the hostile `approved` entry was STRIPPED — only observed/candidate entries are returned (§8, §23)');
    check(!JSON.stringify(r.data).includes('"authorityState":"approved"') && !JSON.stringify(r.data).includes('attacker'), 'no `approved` authorityState / approval metadata leaves the server');
    check(snapshotDb() === before, 'writingMemory wrote NOTHING to the database');
  }

  /* ── 6. end-to-end with the REAL builder ────────────────────────── */
  section('writingMemory — real builder injected: candidate + possible_drift, corpus untouched');
  {
    const esm = await import('../src/intelligence/corpus/writing-memory/writing-memory-builder.js');
    __setWritingMemoryBuilderForTest((input, config, opts) => esm.buildWritingMemory(input, config, opts));
    const before = snapshotDb();
    const r = await intelligenceCorpus.run({
      data: {
        op: 'writingMemory',
        config: { temporal: { historicalCutoff: '2025-01-01', currentWindowStart: '2026-01-01', minCurrentDocuments: 2 }, candidateMinDocuments: 3 },
        approvedRules: [{ category: 'closing_pattern', key: 'closing', value: 'Demikian disampaikan', ruleId: 'rule_c', approvedBy: 'HUMAN', authorityState: 'approved' }],
      },
      auth: asAdmin('alice'),
    });
    check(r.ok && Array.isArray(r.data.entries) && r.data.entries.length >= 2, 'real builder → a WritingMemoryReport with entries');
    check(r.data.entries.every((e) => e.authorityState === 'observed' || e.authorityState === 'candidate'), 'every entry is observed / candidate — NEVER approved (§8)');
    const recent = r.data.entries.find((e) => e.value === 'Demikian kami sampaikan');
    const approvedVal = r.data.entries.find((e) => e.value === 'Demikian disampaikan');
    check(recent && recent.temporalStatus === 'current_evidence' && recent.authorityState === 'candidate', 'the recent closing → current_evidence, candidate');
    check(approvedVal && approvedVal.temporalStatus === 'possible_drift', 'the approved-rule value → possible_drift');
    check(r.data.drift.length === 1 && r.data.drift[0].status === 'possible_drift' && r.data.drift[0].ruleUnchanged === true, 'a drift finding: possible_drift, ruleUnchanged true (§17)');
    check(!('approvedBy' in r.data.drift[0].approvedRule) && !('authorityState' in r.data.drift[0].approvedRule), 'the approved rule is echoed sanitised — approvedBy / authorityState dropped (§23)');
    check(snapshotDb() === before, 'writingMemory wrote NOTHING — the corpus and any approved rule are untouched');
    // bob sees only his own
    let bobInput = null;
    __setWritingMemoryBuilderForTest(async (input) => { bobInput = input; return { schema: 'writing-memory-report@1', generatedAt: AT, temporalConfigured: false, entries: [], conflicts: [], drift: [], summary: {} }; });
    await intelligenceCorpus.run({ data: { op: 'writingMemory' }, auth: asAdmin('bob') });
    check(bobInput && bobInput.documents.length === 1 && bobInput.documents[0].ownerId === 'bob', "bob's writingMemory sees ONLY bob's 1 document");
    __setWritingMemoryBuilderForTest(null);
  }

  /* ── 7. static scan ─────────────────────────────────────────────── */
  section('static — no secret / model / HTTP / V1 / knowledge / flag; no write in the branch');
  {
    const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    const src = fs.readFileSync(path.join(ROOT, 'functions/src/intelligence/intelligenceCorpus.js'), 'utf8');
    const blob = stripComments(src);
    check(/op === 'writingMemory'/.test(blob), 'the writingMemory branch exists');
    check(!/sk-[A-Za-z0-9]|OPENAI_API_KEY|api\.openai\.com|openai|anthropic|\bfetch\s*\(/i.test(blob.replace(/no openai/gi, '')), 'no secret / model / outbound-HTTP reference');
    check(!/require\([^)]*petty|generateNor\s*\(|pettyCashNors|promoteKnowledge|knowledge_repository|require\([^)]*\/knowledge|feature_flags/i.test(blob), 'no V1 / knowledge / feature-flag coupling');
    check(/_writingMemoryBuilder !== 'function'/.test(blob) && /WRITING_MEMORY_UNAVAILABLE/.test(blob), 'fails safe when no builder is wired (§22)');
    check(/gatherOwnerCorpus\(uid\)/.test(blob), 'writingMemory gathers the corpus by the VERIFIED uid only');
    check(/authorityState === 'observed' \|\| e\.authorityState === 'candidate'/.test(blob), 'the server strips any entry that is not observed / candidate before returning (§8, §23)');
    const wmRegion = (blob.match(/op === 'writingMemory'[\s\S]*?\n    \} else \{/) || [''])[0];
    check(wmRegion.length > 0 && !/corpusStore\.(ingestDocument|recordObservation|setAnalysisStatus|setClassification)\b/.test(wmRegion),
      'the writingMemory branch calls NO corpusStore write method (read-only)');
  }

  /* ── 8. wiring (WIRED — Controlled Deployment Phase A) ───────────── */
  section('functions/index.js — intelligenceCorpus is WIRED (Controlled Deployment Phase A)');
  {
    const idx = fs.readFileSync(path.join(ROOT, 'functions/index.js'), 'utf8');
    check(/require\(['"]\.\/src\/intelligence\/intelligenceCorpus['"]\)/.test(idx) && /exports\.intelligenceCorpus\s*=\s*intelligenceCorpus/.test(idx), 'functions/index.js requires + exports intelligenceCorpus (deploy still NOT run; the writingMemory op stays read-only and fails safe with no builder wired)');
  }

  console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'} — ${fail} failing check(s).`);
  process.exit(fail === 0 ? 0 : 1);
})();
