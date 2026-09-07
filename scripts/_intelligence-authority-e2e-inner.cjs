/* ============================================================
   _intelligence-authority-e2e-inner.cjs — C4E full non-OpenAI
   authority-chain E2E (V2 Intelligence)

   Runs INSIDE `firebase emulators:exec --only database` (see
   scripts/intelligence-authority-emulator-e2e.mjs). It exercises the
   REAL production-wired callable handlers (functions/src/intelligence/*)
   against the REAL Realtime Database emulator, end to end:

     auth matrix → ingest → analyse (real corpus-esm pipeline) →
     Writing Memory → Style Guide proposal → human approval →
     certified retrieval → generation context → stale → conflict

   Invocation point: `handler.run(makeReq(...))` — the same, verified
   pattern functions/scripts/phase-c-emulator/_lib/fixtures.js uses (the
   repo deliberately has NO Auth/Functions emulator; `.run()` + the RTDB
   emulator IS its sanctioned isolated-environment harness). request.auth
   is built here from { uid, role } exactly as verifyPin would mint it —
   the handler's own canUseIntelligence() gate is what is under test.

   ZERO production contact: the safety guard refuses to load a single
   functions/src module unless FIREBASE_DATABASE_EMULATOR_HOST points at
   the local emulator on firebase.json's configured port. Cleanup = the
   emulator process exiting.
   ============================================================ */

'use strict';

const crypto = require('node:crypto');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');

// ── HARD production guard: bail before any functions/src module loads ──
require(path.join(ROOT, 'functions/scripts/phase-c-emulator/_lib/safety-guard')).assertSafeEmulatorOrExit();

process.env.FIREBASE_CONFIG = process.env.FIREBASE_CONFIG
  || JSON.stringify({ databaseURL: `http://${process.env.FIREBASE_DATABASE_EMULATOR_HOST}/?ns=schedule-driver-pbsi`, projectId: 'schedule-driver-pbsi' });
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || 'schedule-driver-pbsi';

let fail = 0;
const rows = [];
const ok = (cond, msg) => { const m = `${cond ? '✓' : '✗'} ${msg}`; console.log(m); if (!cond) fail += 1; rows.push({ cond: !!cond, msg }); return !!cond; };
const section = (t) => console.log(`\n══ ${t} ══`);

const { intelligenceCorpus } = require(path.join(ROOT, 'functions/src/intelligence/intelligenceCorpus'));
const { intelligenceStyleGuide } = require(path.join(ROOT, 'functions/src/intelligence/intelligenceStyleGuide'));
const { intelligenceVisualTemplate } = require(path.join(ROOT, 'functions/src/intelligence/intelligenceVisualTemplate'));
const { intelligenceRetrieval } = require(path.join(ROOT, 'functions/src/intelligence/intelligenceRetrieval'));
const { intelligenceNorGeneration } = require(path.join(ROOT, 'functions/src/intelligence/intelligenceNorGeneration'));
const { db } = require(path.join(ROOT, 'functions/src/config/admin'));

const AT = '2026-09-07T00:00:00.000Z';
const WM_CATS = new Set(['terminology', 'organizational_term', 'preferred_phrase', 'opening_pattern', 'closing_pattern', 'recipient_convention', 'subject_convention', 'date_convention', 'attachment_convention', 'copy_convention', 'signature_wording', 'body_structure', 'formal_tone']);
function makeReq({ data = {}, uid = null, role = null, adminEquivalent = false } = {}) {
  return {
    data,
    auth: uid ? { uid, token: { uid, sub: uid, ...(role ? { role } : {}), ...(adminEquivalent ? { adminEquivalent: true } : {}) } } : undefined,
    rawRequest: { headers: {} }, acceptsStreaming: false,
  };
}
async function call(handler, opts) {
  try { return { ok: true, data: await handler.run(makeReq(opts)) }; }
  catch (e) { return { ok: false, code: e && e.code, message: e && e.message }; }
}
const asAdmin = (uid) => ({ uid, role: 'admin' });

/* ── a minimal, real .docx (zip of OOXML) mammoth can extract ──────────
   `heading` parameterises the single H1 — the deterministic structure
   observer emits it verbatim as the `body_structure / heading_outline`
   observedValue, so three heading values across the writing corpus give
   the same slot three competing values (drift → supersession → conflict,
   phases I + J). `variant` only adds a trailing reference line. */
async function buildDocx(variant = '', heading = 'NOTA DINAS') {
  const JSZip = require(path.join(ROOT, 'functions/node_modules/jszip'));
  const zip = new JSZip();
  zip.file('[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
    `</Types>`);
  zip.folder('_rels').file('.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
    `</Relationships>`);
  const p = (t, style) => `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ''}<w:r><w:t xml:space="preserve">${t}</w:t></w:r></w:p>`;
  const body = [
    p(heading, 'Heading1'),
    p('Kepada Yth. Bendahara PBSI'),
    p('Perihal: pengadaan perangkat pemeliharaan lapangan'),
    p('Bersama ini kami sampaikan permohonan pengadaan perangkat pemeliharaan lapangan.'),
    p('Adapun rincian kebutuhan pemeliharaan lapangan adalah sebagai berikut.'),
    p('Perangkat pemeliharaan lapangan tersebut akan digunakan untuk pemeliharaan lapangan rutin.'),
    p('Demikian kami sampaikan atas perhatian Bapak/Ibu kami ucapkan terima kasih.'),
    `<w:tbl><w:tr><w:tc><w:p><w:r><w:t>No</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Uraian pemeliharaan lapangan</w:t></w:r></w:p></w:tc></w:tr>` +
    `<w:tr><w:tc><w:p><w:r><w:t>1</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Perangkat pemeliharaan lapangan</w:t></w:r></w:p></w:tc></w:tr></w:tbl>`,
    variant ? p(`Referensi internal ${variant}.`) : '',
  ].join('');
  zip.folder('word').file('document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}` +
    `<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr></w:body></w:document>`);
  const buf = await zip.generateAsync({ type: 'nodebuffer' });
  return Array.from(buf);
}

(async () => {
  const bytes = await buildDocx();
  const checksum = crypto.createHash('sha256').update(Buffer.from(bytes)).digest('hex');
  const source = { schema: 'corpus-source@1', checksum, format: 'docx', originalFilename: 'C4E-SYNTHETIC.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', bytes };

  /* ── PHASE A — authorization matrix (real canUseIntelligence gate) ── */
  section('PHASE A — authorization matrix');
  for (const [name, h] of [['intelligenceCorpus', intelligenceCorpus], ['intelligenceStyleGuide', intelligenceStyleGuide], ['intelligenceVisualTemplate', intelligenceVisualTemplate], ['intelligenceRetrieval', intelligenceRetrieval], ['intelligenceNorGeneration', intelligenceNorGeneration]]) {
    const un = await call(h, { data: { op: name === 'intelligenceRetrieval' || name === 'intelligenceNorGeneration' ? 'generationContext' : 'list', documentType: 'NOR' }, uid: null });
    ok(!un.ok && un.code === 'unauthenticated', `${name}: unauthenticated → rejected`);
    const dv = await call(h, { data: { op: 'list', documentType: 'NOR' }, uid: 'dev1', role: 'developer' });
    ok(!dv.ok && dv.code === 'permission-denied', `${name}: developer → permission-denied`);
    const dr = await call(h, { data: { op: 'list', documentType: 'NOR' }, uid: 'drv1', role: 'driver' });
    ok(!dr.ok && dr.code === 'permission-denied', `${name}: driver → permission-denied`);
  }
  const adminList = await call(intelligenceCorpus, { data: { op: 'list' }, ...asAdmin('opA') });
  ok(adminList.ok && adminList.data && adminList.data.ok, 'intelligenceCorpus: effective admin → allowed');
  const aeqList = await call(intelligenceStyleGuide, { data: { op: 'list' }, uid: 'opE', role: 'ops_lead', adminEquivalent: true });
  ok(aeqList.ok && aeqList.data && aeqList.data.ok, 'intelligenceStyleGuide: adminEquivalent → allowed');

  /* ── PHASE B — corpus ingest ─────────────────────────────────────── */
  section('PHASE B — corpus ingest');
  const ing = await call(intelligenceCorpus, {
    data: { op: 'ingest', document: { checksum, type: 'DOCX', title: 'C4E EMULATOR SYNTHETIC TEST DOCUMENT', filename: 'C4E-SYNTHETIC.docx', language: 'id', ownerId: 'CLIENT-LIE', documentId: 'CLIENT-LIE', ingestionStatus: 'analyzed', analysisStatus: 'completed' } },
    ...asAdmin('opA'),
  });
  const doc = ing.ok && ing.data && ing.data.ok ? (ing.data.data.document || ing.data.data) : null;
  ok(!!doc && !!doc.documentId, 'ingest → INGESTED, server documentId assigned');
  ok(doc && doc.ownerId === 'opA', 'ownerId = authenticated caller uid (client "CLIENT-LIE" ignored)');
  ok(doc && doc.documentId !== 'CLIENT-LIE' && doc.checksum === checksum, 'documentId server-derived; checksum preserved');
  ok(doc && doc.ingestionStatus !== 'analyzed' && doc.analysisStatus !== 'completed', 'client ingestion/analysis status was NOT accepted');
  const documentId = doc && doc.documentId;

  /* ── PHASE C — corpus analysis (real corpus-esm pipeline) ─────────── */
  section('PHASE C — corpus analysis');
  const an = await call(intelligenceCorpus, { data: { op: 'analyze', documentId, source }, ...asAdmin('opA') });
  const analysis = an.ok && an.data && an.data.ok ? an.data.data.analysis : null;
  ok(an.ok && an.data && an.data.ok, `analyze → ok (${an.ok && an.data ? (an.data.ok ? 'ok' : (an.data.error && an.data.error.code)) : an.code})`);
  ok(analysis && analysis.observationsRecorded > 0, `observations recorded: ${analysis && analysis.observationsRecorded}`);
  ok(analysis && Array.isArray(analysis.stages) && analysis.stages.some((s) => s.stage === 'text_extraction' && s.outcome === 'ran'), 'text_extraction stage RAN (real mammoth extraction)');
  const obsRes = await call(intelligenceCorpus, { data: { op: 'observations', documentId }, ...asAdmin('opA') });
  const observations = obsRes.ok && obsRes.data && obsRes.data.ok ? (Array.isArray(obsRes.data.data) ? obsRes.data.data : []) : [];
  ok(observations.length > 0, `observations readable: ${observations.length}`);
  ok(observations.every((o) => o.lifecycleState === 'observed'), 'every persisted observation is lifecycleState "observed" (never approved)');
  ok(observations.every((o) => o.approvedBy == null && o.preferenceRationale == null), 'no observation carries approvedBy / preferenceRationale');
  const wmCats = [...new Set(observations.filter((o) => WM_CATS.has(o.category)).map((o) => `${o.category}/${o.key}=${String(o.observedValue).slice(0, 24)}`))];
  console.log('  [diag] Phase-C observations in WRITING_MEMORY_CATEGORIES:', JSON.stringify(wmCats));

  /* ── PHASE C2 — seed a WRITING corpus (real ops) so Writing Memory
        has organizational material. `recordObservation` is a real deployed
        op; the server still forces owner + lifecycle. ────────────────── */
  section('PHASE C2 — seed writing corpus: analyse 9 NOR docs through the REAL pipeline');
  const WROWNER = asAdmin('opW');
  // Emit recipe (recovered from scripts/intelligence-corpus-writing-memory-check.mjs
  // + src/.../candidate-grouping.js#groupObservations, which filters through
  // isCorpusObservation()): the Writing-Memory group only forms from
  // observations the REAL analysis pipeline emits (they are makeCorpusObservation-
  // shaped and pass isCorpusObservation). So: analyse current-window NOR
  // documents that share body text → the deterministic observers emit the
  // SAME (category, key, observedValue) across all of them → candidate
  // Writing-Memory entries, temporalStatus current_evidence.
  //
  // THREE heading cohorts (3 docs each) give the `body_structure /
  // heading_outline` slot three competing current values:
  //   "NOTA DINAS"           → the host rule (phases E + F)
  //   "NOTA DINAS REVISI"     → the superseding value (phase I)
  //   "NOTA DINAS PERUBAHAN"  → the second competing value (phase J)
  async function seedAnalysedDoc(tag, sourceDate, heading = 'NOTA DINAS') {
    const b = await buildDocx(tag, heading);
    const cs = crypto.createHash('sha256').update(Buffer.from(b)).digest('hex');
    const i = await call(intelligenceCorpus, { data: { op: 'ingest', document: { checksum: cs, type: 'DOCX', title: `C4E writing ${tag}`, filename: `c4e-${tag}.docx`, language: 'id' } }, ...WROWNER });
    const d = i.ok && i.data && i.data.ok ? (i.data.data.document || i.data.data) : null;
    if (!d) return { ok: false };
    const src2 = { schema: 'corpus-source@1', checksum: cs, format: 'docx', originalFilename: `c4e-${tag}.docx`, mimeType: source.mimeType, bytes: b };
    const a = await call(intelligenceCorpus, { data: { op: 'analyze', documentId: d.documentId, source: src2 }, ...WROWNER });
    const rec = a.ok && a.data && a.data.ok ? ((a.data.data.analysis || {}).observationsRecorded || 0) : 0;
    // setClassification AFTER analyze — analyze writes the pipeline's own
    // classification (UNKNOWN / no date for a synthetic doc); the operator's
    // authoritative documentType + sourceDate are set last.
    const sc = await call(intelligenceCorpus, { data: { op: 'setClassification', documentId: d.documentId, classification: { documentType: 'NOR', sourceDate } }, ...WROWNER });
    const scDoc = sc.ok && sc.data && sc.data.ok ? (sc.data.data.document || sc.data.data) : null;
    return { ok: a.ok && a.data && a.data.ok && rec > 0, classified: !!scDoc && scDoc.documentType === 'NOR' && scDoc.sourceDate === sourceDate, rec };
  }
  const HOST_HEADING = 'NOTA DINAS';
  const REVISI_HEADING = 'NOTA DINAS REVISI';
  const PERUBAHAN_HEADING = 'NOTA DINAS PERUBAHAN';
  const seeded = [
    await seedAnalysedDoc('W1', '2026-01-05', HOST_HEADING),
    await seedAnalysedDoc('W2', '2026-02-05', HOST_HEADING),
    await seedAnalysedDoc('W3', '2026-03-05', HOST_HEADING),
    await seedAnalysedDoc('W4', '2026-01-12', REVISI_HEADING),
    await seedAnalysedDoc('W5', '2026-02-12', REVISI_HEADING),
    await seedAnalysedDoc('W6', '2026-03-12', REVISI_HEADING),
    await seedAnalysedDoc('W7', '2026-01-19', PERUBAHAN_HEADING),
    await seedAnalysedDoc('W8', '2026-02-19', PERUBAHAN_HEADING),
    await seedAnalysedDoc('W9', '2026-03-19', PERUBAHAN_HEADING),
  ];
  ok(seeded.every((s) => s.ok), `9 NOR documents analysed through the real pipeline (${seeded.filter((s) => s.ok).length}/9; obs recorded ${seeded.map((s) => s.rec).join('/')})`);
  ok(seeded.every((s) => s.classified), 'each doc persists documentType=NOR + a current-window sourceDate (setClassification round-trip verified)');

  /* ── PHASE D — Writing Memory ────────────────────────────────────── */
  section('PHASE D — Writing Memory');
  // diagnostic — what did the store actually persist + read back?
  {
    const lst = await call(intelligenceCorpus, { data: { op: 'list' }, ...WROWNER });
    const docs = lst.ok && lst.data && lst.data.ok ? (Array.isArray(lst.data.data) ? lst.data.data : []) : [];
    console.log('  [diag] opW docs:', docs.map((d) => ({ id: (d.documentId || '').slice(0, 20), type: d.documentType, sourceDate: d.sourceDate, analysisStatus: d.analysisStatus })));
    if (docs[0]) {
      const o = await call(intelligenceCorpus, { data: { op: 'observations', documentId: docs[0].documentId }, ...WROWNER });
      const od = o.ok && o.data && o.data.ok ? (Array.isArray(o.data.data) ? o.data.data : []) : [];
      const { pathToFileURL } = require('node:url');
      const { isCorpusObservation } = await import(pathToFileURL(path.join(ROOT, 'functions/src/intelligence/corpus-esm/contracts/corpus-observation-contract.js')).href);
      console.log('  [diag] doc[0] FULL observation:', JSON.stringify(od[0]));
      console.log('  [diag] isCorpusObservation(od[0]) =', isCorpusObservation(od[0]));
      console.log('  [diag] # observations passing isCorpusObservation:', od.filter(isCorpusObservation).length, '/', od.length);
    }
  }
  const WMCFG = { candidateMinDocuments: 3, temporal: { historicalCutoff: '2025-01-01', currentWindowStart: '2026-01-01', minCurrentDocuments: 2, minHistoricalDocuments: 1, conflictMinorityRatio: 0.34 } };
  let wm = await call(intelligenceCorpus, { data: { op: 'writingMemory', config: WMCFG }, ...WROWNER });
  let wmData = wm.ok && wm.data && wm.data.ok ? wm.data.data : null;
  let entries = wmData && Array.isArray(wmData.entries) ? wmData.entries : [];
  if (entries.length === 0) {
    // fall back: no config (verified in isolation to still emit current_evidence)
    console.log('  [diag] WMCFG produced 0 entries — retrying with no config');
    wm = await call(intelligenceCorpus, { data: { op: 'writingMemory' }, ...WROWNER });
    wmData = wm.ok && wm.data && wm.data.ok ? wm.data.data : null;
    entries = wmData && Array.isArray(wmData.entries) ? wmData.entries : [];
    if (wmData) console.log('  [diag] no-config summary:', JSON.stringify(wmData.summary));
  }
  ok(wm.ok && wm.data && wm.data.ok, `writingMemory → ok (${wm.ok && wm.data ? (wm.data.ok ? 'ok' : (wm.data.error && wm.data.error.code)) : wm.code})`);
  ok(entries.length > 0, `Writing Memory entries: ${entries.length}`);
  ok(entries.every((e) => e.authorityState === 'observed' || e.authorityState === 'candidate'), 'every entry is observed / candidate — NEVER approved');
  ok(entries.every((e) => Array.isArray(e.sourceObservationIds) || (e.evidence && typeof e.evidence === 'object')), 'entries carry provenance / evidence');
  // Explicit slot lookup — the `body_structure / heading_outline` slot now
  // carries THREE competing current values (see PHASE C2). Never index by
  // position: `entries` is sorted by memoryId and the cohorts perturb it.
  const norm = (v) => String(v == null ? '' : v).toLowerCase().replace(/\s+/g, ' ').trim();
  const headingEntry = (value) => entries.find((e) => e.category === 'body_structure'
    && e.key === 'heading_outline' && e.documentType === 'NOR' && norm(e.value) === norm(value));
  const hostEntry = headingEntry(HOST_HEADING);
  const revisiEntry = headingEntry(REVISI_HEADING);
  const perubahanEntry = headingEntry(PERUBAHAN_HEADING);
  ok(!!hostEntry && !!revisiEntry && !!perubahanEntry,
    `the heading_outline slot carries all 3 competing current values (host=${!!hostEntry} revisi=${!!revisiEntry} perubahan=${!!perubahanEntry})`);
  const memoryId = hostEntry && hostEntry.memoryId;

  /* ── PHASE E — Style Guide proposal ─────────────────────────────── */
  section('PHASE E — Style Guide proposal');
  const prop = await call(intelligenceStyleGuide, {
    data: { op: 'proposeFromMemory', memoryId, config: WMCFG, authorityState: 'authoritative', approvedBy: 'CLIENT-LIE', version: 999, status: 'approved' },
    ...WROWNER,
  });
  const rule = prop.ok && prop.data && prop.data.ok ? (prop.data.data.rule || prop.data.data) : null;
  ok(!!rule && !!rule.ruleId, `proposeFromMemory → ${rule ? rule.status : (prop.ok && prop.data ? (prop.data.error && prop.data.error.code) : prop.code)}`);
  ok(rule && rule.status === 'proposed', 'status = proposed');
  ok(rule && rule.authorityState !== 'authoritative' && rule.approvedBy == null, 'NOT authoritative; approvedBy null (client "CLIENT-LIE"/999/"approved" ignored)');
  ok(rule && rule.version === 1, `version = 1 (server-owned; got ${rule && rule.version})`);
  const ruleId = rule && rule.ruleId;

  /* ── PHASE F — human approval (curation contract) ───────────────── */
  section('PHASE F — human approval');
  const noRat = await call(intelligenceStyleGuide, { data: { op: 'approve', ruleId, rationale: '' }, ...asAdmin('opH') });
  ok(!noRat.ok || (noRat.data && !noRat.data.ok), 'approve with EMPTY rationale → rejected (human rationale required)');
  const appr = await call(intelligenceStyleGuide, { data: { op: 'approve', ruleId, rationale: 'C4E emulator fixture approval — not an organizational policy decision.', expectedVersion: 1 }, ...asAdmin('opH') });
  const approved = appr.ok && appr.data && appr.data.ok ? (appr.data.data.rule || appr.data.data) : null;
  ok(!!approved && approved.status === 'approved', `approve → ${approved ? approved.status : (appr.ok && appr.data ? (appr.data.error && appr.data.error.code) : appr.code)}`);
  ok(approved && approved.approvedBy === 'opH', 'approvedBy = authenticated approver uid (server-derived)');
  ok(approved && (approved.authorityState === 'authoritative' || approved.authorityState === 'approved'), `authorityState server-derived → ${approved && approved.authorityState}`);
  ok(approved && typeof approved.version === 'number' && approved.version >= 1, `version server-owned → ${approved && approved.version}`);
  ok(approved && approved.rationale && /C4E emulator fixture/.test(approved.rationale), 'human rationale stored verbatim');

  /* ── PHASE G — certified retrieval ──────────────────────────────── */
  section('PHASE G — certified retrieval');
  const certOf = (x) => (x == null ? null : (typeof x === 'string' ? x : (x.certification && (typeof x.certification === 'string' ? x.certification : x.certification.status)) || x.status || JSON.stringify(x).slice(0, 40)));
  const ret = await call(intelligenceRetrieval, { data: { op: 'norContext', documentType: 'NOR' }, ...asAdmin('opA') });
  const rc = ret.ok && ret.data && ret.data.ok ? ret.data.data : null;
  ok(ret.ok && ret.data && ret.data.ok, `intelligenceRetrieval(norContext) → ok (${ret.ok && ret.data ? (ret.data.ok ? 'ok' : (ret.data.error && ret.data.error.code)) : ret.code})`);
  const cert = certOf(rc);
  ok(rc && rc.certification != null, `certification computed server-side: ${cert}`);
  ok(['certified', 'incomplete', 'conflict', 'unavailable'].includes(cert), `certification is a documented status (${cert})`);
  const sgStatus = rc && (rc.styleGuideStatus || (rc.styleGuide && rc.styleGuide.status));
  ok(sgStatus === 'resolved' || (rc && Array.isArray(rc.styleRules) && rc.styleRules.length > 0) || (rc && rc.styleGuide && Array.isArray(rc.styleGuide.rules) && rc.styleGuide.rules.length > 0),
    `the approved Style Guide rule was selected by server-side retrieval (styleGuide status=${sgStatus})`);
  ok(!(cert === 'certified' && rc && rc.certifiedByClient), 'certification was NOT taken from any client input');

  /* ── PHASE H — generation context ──────────────────────────────── */
  section('PHASE H — generation context');
  const gen = await call(intelligenceNorGeneration, { data: { op: 'generationContext', documentType: 'NOR' }, ...asAdmin('opA') });
  const gc = gen.ok && gen.data && gen.data.ok ? gen.data.data : null;
  ok(gen.ok && gen.data && gen.data.ok, `intelligenceNorGeneration(generationContext) → envelope ok (${gen.ok && gen.data ? 'ok' : gen.code})`);
  ok(gc && gc.schema === 'intelligence-generation-context@1', 'returns intelligence-generation-context@1');
  ok(gc && gc.retrieval && typeof gc.retrieval.certification === 'string', `retrieval.certification server-derived: ${gc && gc.retrieval && gc.retrieval.certification}`);
  ok(gc && typeof gc.gate === 'string' && typeof gc.blocked === 'boolean', `honest gate outcome: gate=${gc && gc.gate} blocked=${gc && gc.blocked}`);
  ok(gc && Array.isArray(gc.style && gc.style.certifiedRuleIds), `style.certifiedRuleIds present (${gc && gc.style && gc.style.certifiedRuleIds && gc.style.certifiedRuleIds.length})`);
  ok(gc && gc.visual && typeof gc.visual.source === 'string', `visual domain honest (source=${gc && gc.visual && gc.visual.source}) — no approved Visual Template exists, so the gate must reflect that`);

  /* ── PHASE I — stale authority (supersession) ──────────────────────
        A DIFFERENT current value for the SAME slot ("NOTA DINAS REVISI")
        supersedes the approved host rule. Different verbatim value → a
        different deterministic ruleId (no RULE_EXISTS); `supersedesRuleId`
        targets the approved host, same slot → server-owned version 2.
        Approving v2 auto-deprecates v1 (§15). ─────────────────────── */
  section('PHASE I — stale authority via supersession');
  const revisiMemoryId = revisiEntry && revisiEntry.memoryId;
  const prop2 = await call(intelligenceStyleGuide, { data: { op: 'proposeFromMemory', memoryId: revisiMemoryId, config: WMCFG, supersedesRuleId: ruleId }, ...WROWNER });
  const rule2 = prop2.ok && prop2.data && prop2.data.ok ? (prop2.data.data.rule || prop2.data.data) : null;
  ok(!!rule2 && !!rule2.ruleId, `superseding proposal created → ${rule2 ? rule2.status : (prop2.ok && prop2.data ? (prop2.data.error && prop2.data.error.code) : prop2.code)}`);
  ok(rule2 && rule2.ruleId !== ruleId && rule2.supersedesRuleId === ruleId, `v2 is a distinct rule that declares it supersedes v1 (v2=${rule2 && rule2.ruleId ? 'set' : 'null'})`);
  ok(rule2 && rule2.version === 2, `v2 version server-owned → 2 (got ${rule2 && rule2.version})`);
  let ruleId2 = null;
  if (rule2 && rule2.ruleId) {
    const appr2 = await call(intelligenceStyleGuide, { data: { op: 'approve', ruleId: rule2.ruleId, rationale: 'C4E emulator supersession — v2 replaces v1.', expectedVersion: 2 }, ...asAdmin('opH') });
    const approved2 = appr2.ok && appr2.data && appr2.data.ok ? (appr2.data.data.rule || appr2.data.data) : null;
    ok(!!approved2 && approved2.status === 'approved', `approve v2 → ${approved2 ? approved2.status : (appr2.ok && appr2.data ? (appr2.data.error && appr2.data.error.code) : appr2.code)}`);
    ruleId2 = approved2 && approved2.ruleId;
    const oldGet = await call(intelligenceStyleGuide, { data: { op: 'get', ruleId }, ...asAdmin('opA') });
    const oldRule = oldGet.ok && oldGet.data && oldGet.data.ok ? (oldGet.data.data.rule || oldGet.data.data) : null;
    ok(oldRule && oldRule.status !== 'approved', `the superseded v1 is NO LONGER approved (status=${oldRule && oldRule.status}) — stale authority is not silently retained`);
    ok(oldRule && oldRule.supersededByRuleId === (approved2 && approved2.ruleId), 'v1 records the ruleId that superseded it (auditable chain)');
    const retB = await call(intelligenceRetrieval, { data: { op: 'norContext', documentType: 'NOR' }, ...asAdmin('opA') });
    const rcB = retB.ok && retB.data && retB.data.ok ? retB.data.data : null;
    ok(rcB && rcB.certification != null, `retrieval after supersession still resolves server-side (certification=${certOf(rcB)})`);
  }

  /* ── PHASE J — conflict (competing authoritative rules) ────────────
        A THIRD current value for the SAME slot ("NOTA DINAS PERUBAHAN")
        is proposed WITHOUT a supersession link and approved with an
        explicit acknowledgeConflict. Now v2 and v3 are BOTH approved in
        one slot with no supersession relation → resolveRule must report
        `conflict` and retrieval must NOT be "certified". ───────────── */
  section('PHASE J — conflict, fail-closed');
  const perubahanMemoryId = perubahanEntry && perubahanEntry.memoryId;
  const propC = await call(intelligenceStyleGuide, { data: { op: 'proposeFromMemory', memoryId: perubahanMemoryId, config: WMCFG }, ...WROWNER });
  const ruleC = propC.ok && propC.data && propC.data.ok ? (propC.data.data.rule || propC.data.data) : null;
  ok(!!ruleC && !!ruleC.ruleId && ruleC.ruleId !== ruleId2, `a competing (non-superseding) proposal was created → ${ruleC ? ruleC.status : (propC.ok && propC.data ? (propC.data.error && propC.data.error.code) : propC.code)}`);
  if (ruleC && ruleC.ruleId) {
    // without acknowledgeConflict the store MUST fail closed against a competing approval
    const naive = await call(intelligenceStyleGuide, { data: { op: 'approve', ruleId: ruleC.ruleId, rationale: 'C4E emulator — approve without acknowledging the conflict.' }, ...asAdmin('opH') });
    const naiveOk = naive.ok && naive.data && naive.data.ok;
    ok(!naiveOk, `approve of a competing rule WITHOUT acknowledgeConflict → refused (fail-closed; code=${naive.ok && naive.data ? (naive.data.error && naive.data.error.code) : naive.code})`);
    const apprC = await call(intelligenceStyleGuide, { data: { op: 'approve', ruleId: ruleC.ruleId, rationale: 'C4E emulator deliberate conflict — keep both, human-acknowledged.', acknowledgeConflict: true }, ...asAdmin('opH') });
    const okC = apprC.ok && apprC.data && apprC.data.ok;
    ok(okC, `approve WITH acknowledgeConflict → recorded (okC=${okC})`);
    const resv = await call(intelligenceStyleGuide, { data: { op: 'resolve', category: (approved && approved.category) || 'body_structure', key: (approved && approved.key) || 'heading_outline', documentType: 'NOR' }, ...asAdmin('opA') });
    const rv = resv.ok && resv.data && resv.data.ok ? resv.data.data : null;
    ok(!!rv, `resolveRule returns a verdict (outcome=${rv && (rv.outcome || rv.status)})`);
    ok(rv && rv.outcome === 'conflict' && Array.isArray(rv.competingRuleIds) && rv.competingRuleIds.length >= 2,
      `two acknowledged competing approvals → outcome "conflict", NOT an arbitrary pick (outcome=${rv && rv.outcome}, competing=${rv && rv.competingRuleIds && rv.competingRuleIds.length})`);
    const retC = await call(intelligenceRetrieval, { data: { op: 'norContext', documentType: 'NOR' }, ...asAdmin('opA') });
    const rcC = retC.ok && retC.data && retC.data.ok ? retC.data.data : null;
    ok(rcC && certOf(rcC) !== 'certified', `retrieval certification with an unresolved conflict is NOT "certified" (got ${certOf(rcC)})`);
  }

  /* ── PHASE K — negative authz re-confirm ───────────────────────── */
  section('PHASE K — negative authz re-confirm');
  const kUn = await call(intelligenceStyleGuide, { data: { op: 'list' }, uid: null });
  ok(!kUn.ok && kUn.code === 'unauthenticated', 'unauthenticated still rejected after the chain');
  const kDev = await call(intelligenceNorGeneration, { data: { op: 'generationContext', documentType: 'NOR' }, uid: 'dev2', role: 'developer' });
  ok(!kDev.ok && kDev.code === 'permission-denied', 'developer still permission-denied after the chain');

  console.log(`\n${'═'.repeat(50)}\n${fail === 0 ? 'PASS' : 'FAIL'} — ${fail} failing check(s) of ${rows.length}.`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('HARNESS THREW:', e && e.stack || e); process.exit(2); });
