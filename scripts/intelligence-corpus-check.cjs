/* ============================================================
   intelligence-corpus-check.cjs — NOR & Memorandum Corpus Acquisition
   Foundation (V2, Phase 5.x.1)

   CJS test for the SERVER side
   (functions/src/intelligence/corpusContract.js + corpusStore.js +
   intelligenceCorpus.js). No emulator — the Admin SDK RTDB surface is a
   faithful in-memory fake (drops empty objects, orderByChild/equalTo).

   Proves:
     1  CJS ⇄ ESM contract drift — schemas, enums, field lists, graphs,
        envelope codes; makeCorpusDocument / makeCorpusObservation produce
        IDENTICAL output on both sides
     2  corpusStore over the fake db — ingest (get-or-create by checksum),
        get, listByOwner, dedup never overwrites (§12), analysis-status
        graph (§11), recordObservation always 'observed' + merges (§9,§15),
        listObservations
     3  the intelligenceCorpus callable (.run) — auth / authz / op matrix;
        owner is ALWAYS auth.uid; cross-owner get/observations/record/
        setAnalysisStatus → FORBIDDEN envelope; a client CANNOT inject
        ownerId / documentId / an observation lifecycleState
     4  static security scan of the 3 server files — no secret / endpoint /
        env-var, no V1 Petty Cash / generateNor coupling, no knowledge
        write, no feature-flag access, log annotated METADATA ONLY
     5  functions/index.js references + exports intelligenceCorpus
        (WIRED — Controlled Deployment Phase A) — and database.rules.json
        carries the two server-owned, owner-scoped rule blocks

   Run:  node scripts/intelligence-corpus-check.cjs   (exit 0 = pass)
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

/* ── faithful in-memory fake of the Admin SDK RTDB surface ──────────── */
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
  const snap = (val) => ({
    val: () => (val === undefined ? null : val),
    exists: () => val != null,
    forEach: (cb) => { if (val && typeof val === 'object') for (const [k, v] of Object.entries(val)) cb({ key: k, val: () => v }); },
  });
  function ref(p) {
    return {
      async once() { return snap(getAt(p)); },
      async set(v) { setAt(p, drop(v) === undefined ? null : drop(v)); },
      orderByChild(ck) {
        return { equalTo(val) { return { async once() {
          const all = getAt(p) || {}; const out = {};
          for (const [k, row] of Object.entries(all)) if (row && row[ck] === val) out[k] = row;
          return snap(Object.keys(out).length ? out : null);
        } }; } };
      },
    };
  }
  return { ref, _root: root };
}

const cjs = require('../functions/src/intelligence/corpusContract');
const corpusStore = require('../functions/src/intelligence/corpusStore');

// install a fake db BEFORE requiring the callable
const callableDb = makeFakeDb();
require.cache[require.resolve('../functions/src/config/admin')] = {
  id: 'admin-shim', loaded: true, exports: { admin: {}, auth: {}, db: callableDb },
};
const { intelligenceCorpus } = require('../functions/src/intelligence/intelligenceCorpus');

(async () => {
  const esmDoc = await import('../src/intelligence/corpus/contracts/corpus-document-contract.js');
  const esmObs = await import('../src/intelligence/corpus/contracts/corpus-observation-contract.js');
  const esmProv = await import('../src/intelligence/corpus/contracts/corpus-provenance-contract.js');
  const esmLc = await import('../src/intelligence/corpus/contracts/observation-lifecycle-contract.js');
  const esmSc = await import('../src/intelligence/corpus/contracts/corpus-store-contract.js');
  const esmRec = await import('../src/intelligence/corpus/corpus-observation-record.js');

  const AT = '2026-09-03T00:00:00.000Z';

  /* ── 1. CJS ⇄ ESM contract drift ─────────────────────────────────── */
  section('CJS ⇄ ESM corpus contract drift');
  check(cjs.CORPUS_DOCUMENT_SCHEMA === esmDoc.CORPUS_DOCUMENT_SCHEMA && cjs.CORPUS_DOCUMENT_SCHEMA === 'corpus-document@1', 'CORPUS_DOCUMENT_SCHEMA matches');
  check(cjs.CORPUS_OBSERVATION_SCHEMA === esmObs.CORPUS_OBSERVATION_SCHEMA && cjs.CORPUS_OBSERVATION_SCHEMA === 'corpus-observation@1', 'CORPUS_OBSERVATION_SCHEMA matches');
  check(cjs.CORPUS_PROVENANCE_SCHEMA === esmProv.CORPUS_PROVENANCE_SCHEMA, 'CORPUS_PROVENANCE_SCHEMA matches');
  check(JSON.stringify(cjs.CORPUS_DOCUMENT_TYPE) === JSON.stringify(esmDoc.CORPUS_DOCUMENT_TYPE), 'CORPUS_DOCUMENT_TYPE matches (NOR/NOTA_ORGANISASI/MEMORANDUM/LEGACY/UNKNOWN)');
  check(JSON.stringify(cjs.CORPUS_DOCUMENT_ERA) === JSON.stringify(esmDoc.CORPUS_DOCUMENT_ERA), 'CORPUS_DOCUMENT_ERA matches');
  check(JSON.stringify(cjs.CORPUS_INGESTION_STATUS) === JSON.stringify(esmDoc.CORPUS_INGESTION_STATUS), 'CORPUS_INGESTION_STATUS matches');
  check(JSON.stringify(cjs.CORPUS_INGESTION_STATUS_GRAPH) === JSON.stringify(esmDoc.CORPUS_INGESTION_STATUS_GRAPH), 'CORPUS_INGESTION_STATUS_GRAPH matches');
  check(JSON.stringify(cjs.CORPUS_ANALYSIS_STATUS) === JSON.stringify(esmDoc.CORPUS_ANALYSIS_STATUS), 'CORPUS_ANALYSIS_STATUS matches');
  check(JSON.stringify(cjs.CORPUS_ANALYSIS_STATUS_GRAPH) === JSON.stringify(esmDoc.CORPUS_ANALYSIS_STATUS_GRAPH), 'CORPUS_ANALYSIS_STATUS_GRAPH matches');
  check(JSON.stringify(cjs.CORPUS_DOCUMENT_FIELDS) === JSON.stringify(esmDoc.CORPUS_DOCUMENT_FIELDS), 'CORPUS_DOCUMENT_FIELDS list matches');
  check(JSON.stringify(cjs.OBSERVATION_MODALITY) === JSON.stringify(esmObs.OBSERVATION_MODALITY), 'OBSERVATION_MODALITY matches');
  check(JSON.stringify(cjs.OBSERVATION_CATEGORY) === JSON.stringify(esmObs.OBSERVATION_CATEGORY), 'OBSERVATION_CATEGORY matches');
  check(JSON.stringify(cjs.CORPUS_OBSERVATION_FIELDS) === JSON.stringify(esmObs.CORPUS_OBSERVATION_FIELDS), 'CORPUS_OBSERVATION_FIELDS list matches');
  check(JSON.stringify(cjs.OBSERVATION_LIFECYCLE) === JSON.stringify(esmLc.OBSERVATION_LIFECYCLE), 'OBSERVATION_LIFECYCLE matches');
  check(JSON.stringify(cjs.OBSERVATION_LIFECYCLE_GRAPH) === JSON.stringify(esmLc.OBSERVATION_LIFECYCLE_GRAPH), 'OBSERVATION_LIFECYCLE_GRAPH matches');
  check(JSON.stringify(cjs.OBSERVATION_HUMAN_GATED_STATES) === JSON.stringify(esmLc.OBSERVATION_HUMAN_GATED_STATES), 'OBSERVATION_HUMAN_GATED_STATES matches ([approved])');
  check(JSON.stringify(cjs.EXTRACTION_METHOD) === JSON.stringify(esmProv.EXTRACTION_METHOD), 'EXTRACTION_METHOD matches');
  check(JSON.stringify(cjs.COORDINATE_SPACE) === JSON.stringify(esmProv.COORDINATE_SPACE), 'COORDINATE_SPACE matches');
  check(JSON.stringify(cjs.CORPUS_AUDIT_EVENTS) === JSON.stringify(esmRec.CORPUS_AUDIT_EVENTS), 'CORPUS_AUDIT_EVENTS matches');
  for (const code of ['NO_BACKEND_CONFIGURED', 'NOT_FOUND', 'FORBIDDEN', 'DUPLICATE_DOCUMENT', 'INVALID_RECORD', 'ILLEGAL_TRANSITION', 'NOT_IMPLEMENTED']) {
    check(cjs.CORPUS_STORE_ERRORS[code] === code && esmSc.CORPUS_STORE_ERRORS[code] === code, `CORPUS_STORE_ERRORS.${code} present in both`);
  }
  check(esmSc.CORPUS_STORE_CONTRACT.methods.join(',') === 'ingestDocument,getDocument,listDocuments,getObservations,recordObservation,setAnalysisStatus'
    && cjs.CORPUS_STORE_CONTRACT.methods.join(',') === esmSc.CORPUS_STORE_CONTRACT.methods.join(','),
    'CORPUS_STORE_CONTRACT.methods match — the six §14 methods, NO approve/promote');

  section('CJS ⇄ ESM — behavioural parity');
  const seed = {
    checksum: 'sha_113', documentType: 'NOTA_ORGANISASI', documentEra: 'historical', eraConfidence: 0.8, typeConfidence: 0.9,
    title: 'Nota Organisasi Sarpras 113', originalFilename: 'NOR-113.pdf', pageCount: 2, language: 'id', createdAt: AT,
    provenance: { ingestedBy: 'evan', ingestedAt: AT, method: 'upload', note: null },
    ownerId: 'evan',
  };
  const cjsD = cjs.makeCorpusDocument(seed);
  const esmD = esmDoc.makeCorpusDocument(seed);
  check(JSON.stringify(cjsD) === JSON.stringify(esmD), 'makeCorpusDocument produces byte-identical output on both sides');
  check(cjs.isCorpusDocument(cjsD) && esmDoc.isCorpusDocument(esmD), 'isCorpusDocument accepts the built record on both sides');
  check(cjs.corpusDocumentIdFromChecksum('sha_113') === esmDoc.corpusDocumentIdFromChecksum('sha_113') && cjsD.documentId === 'corpus_sha_113', 'corpusDocumentIdFromChecksum is identical + deterministic');
  const uncertain = cjs.makeCorpusDocument({ checksum: 'memo362', documentType: 'Memo', documentEra: 'unknown', eraConfidence: 1 });
  check(uncertain.documentType === 'UNKNOWN' && uncertain.eraConfidence < 1 && !cjs.isCorpusDocument({ ...uncertain, eraConfidence: 1 }),
    '§5 invariant (UNKNOWN era ⇒ confidence < 1) holds on the CJS side too');
  const oSeed = {
    observationId: 'obs_x', documentId: 'corpus_sha_113', category: 'recipient_convention', key: 'recipient_label',
    observedValue: 'Kepada Yth.', confidence: 0.97, createdAt: AT, updatedAt: AT,
    provenance: [{ sourceDocumentId: 'corpus_sha_113', sourceFileId: null, pageNumber: 1, region: null, extractionMethod: 'text_layer', extractedAt: AT, confidence: 0.9 }],
  };
  const cjsO = cjs.makeCorpusObservation(oSeed);
  const esmO = esmObs.makeCorpusObservation(oSeed);
  check(JSON.stringify(cjsO) === JSON.stringify(esmO), 'makeCorpusObservation produces byte-identical output on both sides');
  check(cjsO.normalizedValue === null && cjsO.lifecycleState === 'observed' && cjs.isCorpusObservation(cjsO), 'the CJS observation is "observed" with normalizedValue null and is valid');
  check(cjs.observationIdFrom('corpus_sha_113', 'recipient_convention', 'recipient_label') === esmRec.observationIdFrom('corpus_sha_113', 'recipient_convention', 'recipient_label'), 'observationIdFrom is identical on both sides');

  /* ── 2. corpusStore over the fake db ─────────────────────────────── */
  section('corpusStore — ingest (get-or-create by checksum), get, list (§12)');
  {
    const db = makeFakeDb();
    const r1 = await corpusStore.ingestDocument(db, { seed: { ...seed, ownerId: undefined }, ownerId: 'evan', now: AT });
    check(r1.ok && r1.data.duplicate === false && r1.data.document.documentId === 'corpus_sha_113', 'ingestDocument → new document, duplicate: false');
    check(r1.data.document.ownerId === 'evan', 'ownerId comes from the caller (verified uid), not the seed');
    check(r1.data.document.ingestionStatus === 'received', 'no sourceFileId → ingestionStatus "received"');
    const dup = await corpusStore.ingestDocument(db, { seed: { ...seed, title: 'TAMPERED', ownerId: 'mallory' }, ownerId: 'evan', now: '2026-09-03T09:00:00.000Z' });
    check(dup.ok && dup.data.duplicate === true && dup.data.document.title === 'Nota Organisasi Sarpras 113',
      're-ingest of the same checksum → duplicate: true, the ORIGINAL is returned (never overwritten — §12)');
    check(db._root.intelligence_corpus_documents.corpus_sha_113.ownerId === 'evan', 'the stored record was NOT re-owned by the second caller');
    await corpusStore.ingestDocument(db, { seed: { ...seed, checksum: 'sha_120' }, ownerId: 'evan', now: AT });
    await corpusStore.ingestDocument(db, { seed: { ...seed, checksum: 'sha_other' }, ownerId: 'mallory', now: AT });
    const mine = await corpusStore.listByOwner(db, 'evan');
    check(mine.ok && mine.data.length === 2 && mine.data.every((d) => d.ownerId === 'evan'), 'listByOwner returns only the caller’s documents');
    const got = await corpusStore.getDocument(db, 'corpus_sha_113');
    check(got.ok && got.data.title === 'Nota Organisasi Sarpras 113', 'getDocument rehydrates a stored document');
    const miss = await corpusStore.getDocument(db, 'corpus_ghost');
    check(!miss.ok && miss.error.code === 'NOT_FOUND', 'getDocument on an unknown id → NOT_FOUND envelope');
    const noCs = await corpusStore.ingestDocument(db, { seed: { title: 'x' }, ownerId: 'evan' });
    check(!noCs.ok && noCs.error.code === 'INVALID_RECORD', 'ingestDocument with no checksum → INVALID_RECORD');
  }

  section('corpusStore — analysis-status graph (§11)');
  {
    const db = makeFakeDb();
    await corpusStore.ingestDocument(db, { seed: { ...seed, checksum: 'sha_an' }, ownerId: 'evan', now: AT });
    const bad = await corpusStore.setAnalysisStatus(db, 'corpus_sha_an', { to: 'completed', actorId: 'evan', at: AT });
    check(!bad.ok && bad.error.code === 'ILLEGAL_TRANSITION', 'pending → completed (skipping extraction) → ILLEGAL_TRANSITION');
    const ok1 = await corpusStore.setAnalysisStatus(db, 'corpus_sha_an', { to: 'text_extracted', actorId: 'evan', at: '2026-09-03T02:00:00.000Z' });
    check(ok1.ok && ok1.data.analysisStatus === 'text_extracted' && ok1.data.analyzedAt === '2026-09-03T02:00:00.000Z', 'pending → text_extracted advances + stamps analyzedAt');
    check(ok1.data.ingestionStatus === 'received', 'ingestionStatus is untouched (separate lifecycle — §11)');
    const missDoc = await corpusStore.setAnalysisStatus(db, 'corpus_ghost', { to: 'text_extracted', actorId: 'evan' });
    check(!missDoc.ok && missDoc.error.code === 'NOT_FOUND', 'setAnalysisStatus on an unknown document → NOT_FOUND');
  }

  section('corpusStore — recordObservation always "observed" + merges (§9, §15)');
  {
    const db = makeFakeDb();
    await corpusStore.ingestDocument(db, { seed: { ...seed, checksum: 'sha_obs' }, ownerId: 'evan', now: AT });
    const docId = 'corpus_sha_obs';
    const prov = [{ sourceDocumentId: docId, pageNumber: 1, extractionMethod: 'text_layer', extractedAt: AT, confidence: 0.9 }];
    const o1 = await corpusStore.recordObservation(db, {
      seed: { documentId: docId, category: 'recipient_convention', key: 'recipient_label', observedValue: 'Kepada Yth.', confidence: 0.6, provenance: prov,
        // client tampering — an "approved" lifecycle with approval fields
        lifecycleState: 'approved', approvedBy: 'evan', approvedAt: AT, preferenceRationale: 'tamper' },
      ownerId: 'evan', now: AT,
    });
    check(o1.ok && o1.data.merged === false && o1.data.observation.lifecycleState === 'observed', 'recordObservation → merged:false, lifecycleState forced to "observed"');
    check(o1.data.observation.approvedBy === null && o1.data.observation.preferenceRationale === null, 'the injected approval fields were STRIPPED by the store');
    check(db._root.intelligence_corpus_observations[o1.data.observation.observationId].lifecycleState === 'observed', 'the RTDB row itself is "observed"');
    const o2 = await corpusStore.recordObservation(db, {
      seed: { documentId: docId, category: 'recipient_convention', key: 'recipient_label', observedValue: 'Kepada Yth.', confidence: 0.95,
        provenance: [{ sourceDocumentId: docId, pageNumber: 2, extractionMethod: 'text_layer', extractedAt: '2026-09-03T03:00:00.000Z', confidence: 0.95 }] },
      ownerId: 'evan', now: '2026-09-03T03:00:00.000Z',
    });
    check(o2.ok && o2.data.merged === true && o2.data.observation.occurrenceCount === 2 && o2.data.observation.provenance.length === 2, 'the same (doc,category,key) MERGES → occurrenceCount 2, provenance appended');
    check(o2.data.observation.confidence === 0.95 && o2.data.observation.lifecycleState === 'observed', 'confidence = max; lifecycle STILL "observed" (no auto-promote — §9, §15)');
    const noProv = await corpusStore.recordObservation(db, { seed: { documentId: docId, category: 'terminology', key: 'k', observedValue: 'x', provenance: [] }, ownerId: 'evan', now: AT });
    check(!noProv.ok && noProv.error.code === 'INVALID_RECORD', 'an observation with ZERO provenance is refused (§6)');
    const orphan = await corpusStore.recordObservation(db, { seed: { documentId: 'corpus_none', category: 'terminology', key: 'k', observedValue: 'x', provenance: [{ sourceDocumentId: 'corpus_none', extractionMethod: 'manual', extractedAt: AT, confidence: 0.5 }] }, ownerId: 'evan', now: AT });
    check(!orphan.ok && orphan.error.code === 'NOT_FOUND', 'an observation for a non-existent document → NOT_FOUND');
    const list = await corpusStore.listObservations(db, docId);
    check(list.ok && list.data.length === 1, 'listObservations returns the merged observation for the document');
  }

  /* ── 3. the intelligenceCorpus callable (.run) ───────────────────── */
  section('intelligenceCorpus callable — auth / authz / op');
  {
    let t;
    t = null; try { await intelligenceCorpus.run({ data: { op: 'list' } }); } catch (e) { t = e; }
    check(t && t.code === 'unauthenticated', 'no auth → HttpsError(unauthenticated)');
    t = null; try { await intelligenceCorpus.run({ data: { op: 'list' }, auth: { uid: 'bob', token: { role: 'driver' } } }); } catch (e) { t = e; }
    check(t && t.code === 'permission-denied', 'non-admin → HttpsError(permission-denied)');
    t = null; try { await intelligenceCorpus.run({ data: { op: 'list' }, auth: { uid: 'eq', token: { role: 'x', adminEquivalent: 'true' } } }); } catch (e) { t = e; }
    check(t && t.code === 'permission-denied', 'adminEquivalent as the STRING "true" → still denied (must be the boolean)');
    t = null; try { await intelligenceCorpus.run({ data: { op: 'bogus' }, auth: { uid: 'a', token: { role: 'admin' } } }); } catch (e) { t = e; }
    check(t && t.code === 'invalid-argument', 'admin + unknown op → HttpsError(invalid-argument)');
  }

  section('intelligenceCorpus callable — ingest / ownership / no-injection (§13, §14)');
  {
    const asAdmin = (uid, token) => ({ uid, token: token || { role: 'admin' } });
    // alice ingests — the client tries to inject ownerId + documentId + statuses
    const reg = await intelligenceCorpus.run({
      data: { op: 'ingest', document: { checksum: 'cb_sha_1', documentType: 'MEMORANDUM', documentEra: 'unknown', eraConfidence: 1, title: 'Memo Sarpras 362',
        ownerId: 'mallory', documentId: 'corpus_HACKED', ingestionStatus: 'stored', analysisStatus: 'completed', tenantId: 'x' } },
      auth: asAdmin('alice'),
    });
    check(reg.ok && reg.data.document.ownerId === 'alice', 'ingest via callable → owned by auth.uid (the injected ownerId "mallory" was ignored)');
    check(reg.data.document.documentId === 'corpus_cb_sha_1', 'the documentId is the server-derived checksum id (the injected "corpus_HACKED" was ignored)');
    check(reg.data.document.ingestionStatus === 'received' && reg.data.document.analysisStatus === 'pending',
      'the injected ingestion/analysis statuses were ignored — server sets received/pending');
    check(reg.data.document.documentType === 'MEMORANDUM' && reg.data.document.documentEra === 'unknown' && reg.data.document.eraConfidence < 1,
      'the CLASSIFICATION metadata the client is allowed to supply IS kept (type/era), with the §5 clamp');
    const docId = reg.data.document.documentId;

    // bob (a different admin) cannot touch alice's document
    for (const op of ['get', 'observations', 'setAnalysisStatus']) {
      const r = await intelligenceCorpus.run({ data: { op, documentId: docId, to: 'text_extracted' }, auth: asAdmin('bob') });
      check(!r.ok && r.error.code === 'FORBIDDEN', `cross-owner ${op} → FORBIDDEN envelope`);
    }
    const rRec = await intelligenceCorpus.run({ data: { op: 'recordObservation', observation: { documentId: docId, category: 'terminology', key: 'k', observedValue: 'x',
      provenance: [{ sourceDocumentId: docId, extractionMethod: 'manual', extractedAt: AT, confidence: 0.5 }] } }, auth: asAdmin('bob') });
    check(!rRec.ok && rRec.error.code === 'FORBIDDEN', 'cross-owner recordObservation → FORBIDDEN envelope');
    check(callableDb._root.intelligence_corpus_documents[docId].ownerId === 'alice', 'no cross-owner op mutated the record');

    // alice records an observation — tries to inject an approved lifecycle
    const rec = await intelligenceCorpus.run({
      data: { op: 'recordObservation', observation: { documentId: docId, category: 'signature_wording', key: 'closing', observedValue: 'Atas perhatiannya diucapkan terima kasih.',
        provenance: [{ sourceDocumentId: docId, pageNumber: 1, extractionMethod: 'text_layer', extractedAt: AT, confidence: 0.88 }],
        lifecycleState: 'approved', approvedBy: 'alice', preferenceRationale: 'tamper' } },
      auth: asAdmin('alice'),
    });
    check(rec.ok && rec.data.observation.lifecycleState === 'observed', 'recordObservation via callable → the observation is "observed" (injected "approved" ignored)');
    check(rec.data.observation.approvedBy === null, 'the injected approvedBy was stripped');

    // alice advances the analysis lifecycle (legal move)
    const adv = await intelligenceCorpus.run({ data: { op: 'setAnalysisStatus', documentId: docId, to: 'text_extracted' }, auth: asAdmin('alice') });
    check(adv.ok && adv.data.analysisStatus === 'text_extracted', 'owner setAnalysisStatus → advances');
    const advBad = await intelligenceCorpus.run({ data: { op: 'setAnalysisStatus', documentId: docId, to: 'pending' }, auth: asAdmin('alice') });
    check(!advBad.ok && advBad.error.code === 'ILLEGAL_TRANSITION', 'an illegal analysis move → ILLEGAL_TRANSITION envelope');

    // list + observations are owner-scoped
    const list = await intelligenceCorpus.run({ data: { op: 'list' }, auth: asAdmin('alice') });
    check(list.ok && list.data.every((d) => d.ownerId === 'alice') && list.data.length >= 1, 'list → only the caller’s documents');
    const obs = await intelligenceCorpus.run({ data: { op: 'observations', documentId: docId }, auth: asAdmin('alice') });
    check(obs.ok && obs.data.length === 1 && obs.data[0].lifecycleState === 'observed', 'observations → the owner sees the "observed" observation');

    // adminEquivalent:true is allowed and owns its work
    const eq = await intelligenceCorpus.run({ data: { op: 'ingest', document: { checksum: 'cb_eq', title: 'x' } }, auth: asAdmin('eqadmin', { role: 'engineering_coordinator', adminEquivalent: true }) });
    check(eq.ok && eq.data.document.ownerId === 'eqadmin', 'adminEquivalent:true → allowed, owns the record');

    // there is NO approve op
    const noApprove = await intelligenceCorpus.run({ data: { op: 'approve', documentId: docId }, auth: asAdmin('alice') }).catch((e) => e);
    check(noApprove && noApprove.code === 'invalid-argument', 'there is NO "approve" op on the corpus callable (§15)');
  }

  /* ── 4. static security scan of the 3 server files ───────────────── */
  section('static — no secret / V1 / knowledge / feature-flag coupling');
  {
    const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    const files = ['intelligenceCorpus.js', 'corpusStore.js', 'corpusContract.js'].map((f) => fs.readFileSync(path.join(ROOT, 'functions/src/intelligence', f), 'utf8'));
    const rawBlob = files.join('\n');
    const blob = files.map(stripComments).join('\n');
    check(!/sk-[A-Za-z0-9]{12,}/.test(rawBlob), 'no key literal anywhere (raw scan incl. comments)');
    check(!/sk-[A-Za-z0-9]|OPENAI_API_KEY|api\.openai\.com|process\.env(?!\.FIREBASE_CONFIG|\.GCLOUD_PROJECT)/i.test(blob), 'no key / endpoint / env-var reference in the server code');
    check(!/require\([^)]*petty|from\s+['"][^'"]*petty|generateNor\s*\(|pettyCashNors|nextRefNumber|romanMonth/i.test(blob), 'no import of / call into V1 Petty Cash / generateNor / its numbering');
    check(!/require\([^)]*reimbursement|acquireReimbursementNumber\s*\(|\.transaction\(|ServerValue\.increment/i.test(blob), 'no numbering counter / transaction / increment (corpus allocates nothing)');
    check(!/promoteKnowledge|ingestKnowledge|knowledge_repository|approvedKnowledge|mergeKnowledge|require\([^)]*src\/knowledge/i.test(blob), 'no organizational-knowledge write / promote / import');
    check(!/db\.ref\(\s*['"`][^'"`]*feature_flags|feature_flags\/[a-z]+['"`]\s*\)/i.test(blob), 'never reads or writes the feature-flag node');
    check(!/require\(['"][^'"]*\/src\/intelligence\//.test(blob), 'the CJS server never imports the ESM src/intelligence/ tree (keeps its own mirror)');
    const callSrc = fs.readFileSync(path.join(ROOT, 'functions/src/intelligence/intelligenceCorpus.js'), 'utf8');
    check(/METADATA ONLY/.test(callSrc), 'the log call is annotated METADATA ONLY');
    check(!/logger\.(info|log|warn)\([^;]*\b(observedValue|preferenceRationale|body|text)\b[^;]*\)/.test(stripComments(callSrc)), 'no logger call passes the observed text / rationale / body');
    check(/onCall\(\{\s*region:\s*REGION\s*\}/.test(callSrc) && !/secrets:/.test(callSrc), 'intelligenceCorpus is a region-pinned callable with NO secret binding');
    check(/canUseIntelligence\(auth\.token\)/.test(callSrc) && /const uid = auth\.uid/.test(callSrc), 'authz = the shared canUseIntelligence(auth.token); actor/owner = auth.uid');
    // corpusStore only ever addresses its own two nodes
    const storeSrc = stripComments(fs.readFileSync(path.join(ROOT, 'functions/src/intelligence/corpusStore.js'), 'utf8'));
    const refs = storeSrc.match(/\bdb\.ref\([^)]*\)/g) || [];
    check(refs.length > 0 && refs.every((r) => /PATH_DOCS|PATH_OBS/.test(r)), `corpusStore only ever addresses PATH_DOCS / PATH_OBS (${refs.length} db.ref calls)`);
  }

  /* ── 5. wiring (WIRED — Controlled Deployment Phase A) + rules ────── */
  section('functions/index.js — intelligenceCorpus is WIRED (Controlled Deployment Phase A)');
  {
    const idx = fs.readFileSync(path.join(ROOT, 'functions/index.js'), 'utf8');
    check(/require\(['"]\.\/src\/intelligence\/intelligenceCorpus['"]\)/.test(idx) && /exports\.intelligenceCorpus\s*=\s*intelligenceCorpus/.test(idx), 'functions/index.js requires + exports intelligenceCorpus (wired in Controlled Deployment Phase A; write ops still inert behind the undeployed rule blocks + OFF flag)');
    check(/intelligenceNorRegistry/.test(idx), '(sanity) functions/index.js still wires the Phase 5 registry callable');
  }

  section('database.rules.json — corpus nodes server-owned + owner-scoped');
  {
    const rules = fs.readFileSync(path.join(ROOT, 'database.rules.json'), 'utf8');
    for (const node of ['intelligence_corpus_documents', 'intelligence_corpus_observations']) {
      const block = (rules.match(new RegExp(`"${node}"\\s*:\\s*\\{[\\s\\S]*?\\n\\s{4}\\}`)) || [])[0] || '';
      check(block.length > 0, `the ${node} rule block exists`);
      check(/"\.write"\s*:\s*"false"/.test(block), `${node}: .write is "false" — only the Admin SDK writes (no browser write path)`);
      check(/"\.indexOn"/.test(block), `${node}: has an .indexOn`);
      check(/data\.child\('ownerId'\)\.val\(\)\s*===\s*auth\.uid/.test(block), `${node}: per-record .read is owner-scoped (data.ownerId === auth.uid)`);
      check(/auth\.token\.role\s*===\s*'admin'/.test(block) && /auth\.token\.adminEquivalent\s*===\s*true/.test(block), `${node}: admin / adminEquivalent may also read (parity with the registry node)`);
    }
    check(/STAGED/.test(rules) || /Phase 5\.x\.1/.test(rules), 'the corpus rule blocks are annotated as STAGED / Phase 5.x.1');
  }

  console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'} — ${fail} failing check(s).`);
  process.exit(fail === 0 ? 0 : 1);
})();
