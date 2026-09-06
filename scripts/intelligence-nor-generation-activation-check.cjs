/* ============================================================
   intelligence-nor-generation-activation-check.cjs — V2 Phase 6A
   Server-Authoritative Activation

   CJS test for the SERVER side of Phase 6A:
     • functions/index.js WIRES intelligenceNorGeneration (§0.1, §25)
     • intelligenceNorDraft.create CROSS-CHECKS a submitted
       provenance.generationContext against the LIVE Style Guide /
       Visual Template records (generationContextVerifier.js, §15) —
       never blindly trusts it, never silently repairs it
     • the legitimate end-to-end path: intelligenceNorGeneration →
       intelligenceNorDraft.create → the SAME (verified) context persists
     • adversarial: forged ruleId / forged rule content / stale (deprecated)
       rule / stale (version-moved) rule / forged templateId / tampered
       geometry / a blocked context smuggling authority / forged actor /
       forged organization scope / numbering injection / publication
       injection — ALL rejected, none silently repaired
     • provenance.visualBinding is SERVER-DERIVED from the verified
       generationContext, never trusted from the client directly
     • the verifier performs ONLY point lookups (getRule / getTemplate) —
       never re-runs retrieval (listRules / listTemplates) — §9, §26
     • static scan — no OpenAI / RAG / HTTP / secret / numbering / publish /
       registry / Petty Cash / V1 coupling in the new/edited server files
     • database.rules.json — 0 change (no new RTDB node)

   Run:  node scripts/intelligence-nor-generation-activation-check.cjs
   (exit 0 = pass)
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

const styleGuideStore = require('../functions/src/intelligence/styleGuideStore');
const visualTemplateStore = require('../functions/src/intelligence/visualTemplateStore');
const { VERIFY_ERRORS } = require('../functions/src/intelligence/generationContextVerifier');
const callableDb = makeFakeDb();
require.cache[require.resolve('../functions/src/config/admin')] = { id: 'admin-shim', loaded: true, exports: { admin: {}, auth: {}, db: callableDb } };
const { intelligenceNorGeneration } = require('../functions/src/intelligence/intelligenceNorGeneration');
const { intelligenceNorDraft } = require('../functions/src/intelligence/intelligenceNorDraft');
const { NOR_DRAFT_SCHEMA, DRAFT_STORE_ERRORS } = require('../functions/src/intelligence/norDraftContract');

(async () => {
  const AT = '2026-09-04T00:00:00.000Z';
  const asAdmin = (uid) => ({ uid, token: { role: 'admin' } });
  const snapshotDb = () => JSON.stringify(callableDb._root);

  let _m = 0;
  function styleMemory(value, category, key) {
    _m += 1;
    return {
      memoryId: `mem_${_m}`, category: category || 'opening_pattern', key: key || 'default',
      value, normalizedValue: String(value).toLowerCase(), documentType: 'NOR', temporalStatus: 'current_evidence', conventionEra: 'current',
      evidence: { occurrenceCount: 6, documentCount: 4, documentTypeDistribution: { NOR: 4 }, oldestSourceDate: '2026-01-01', latestSourceDate: '2026-03-01', recentDocumentCount: 4, historicalDocumentCount: 0, conflictingDocumentCount: 0, approvedRulePresent: false, approvedRuleMatches: false },
      confidence: 0.9, sourceObservationIds: [`obs_${_m}_a`], sourceDocumentIds: [`corpus_${_m}_1`],
    };
  }
  let _p = 0;
  function visualPattern(variant) {
    _p += 1;
    return {
      patternId: `vpat_${_p}`, documentType: 'NOR', scope: 'organization', variant: variant || `a4-v${_p}`,
      pageModel: { pageNumber: null, width: 595, height: 842, unit: 'pt', coordinateSpace: 'pdf_points', orientation: 'portrait', sourceDocumentIds: [`corpus_v${_p}_1`], sourceObservationIds: [`o_v${_p}_1`] },
      regions: [{ kind: 'logo', geometry: { x: 0.06, y: 0.92, width: 0.13, height: 0.05, coordinateSpace: 'normalized' }, pageRecurrence: 'unknown', occurrenceCount: 2, documentCount: 2, confidence: 0.8, sourceObservationIds: [`o_v${_p}_1`], sourceDocumentIds: [`corpus_v${_p}_1`], note: '' }],
      typography: { fontFamily: null, fontSizePt: null, weight: null, italic: null, alignment: null, lineHeight: null, letterSpacing: null, confidence: 0, sourceObservationIds: [] },
      spacing: { paragraphSpacing: null, lineSpacing: null, coordinateSpace: 'unknown', unit: 'unknown', confidence: 0, sourceObservationIds: [] },
      structuralRules: { multiPage: false, headerRecurrence: 'unknown', footerRecurrence: 'unknown', pageNumberRecurrence: 'unknown', signatureOnFinalPageOnly: null },
      sourceDocumentIds: [`corpus_v${_p}_1`, `corpus_v${_p}_2`], sourceObservationIds: [`o_v${_p}_1`, `o_v${_p}_2`],
      evidence: { documentCount: 2, observationCount: 2, pageCount: 1, regionKinds: ['logo'], coordinateSpaces: ['pdf_points'], geometryKnown: true, documentTypeDistribution: { NOR: 2 } },
      temporalEvidence: { temporalStatus: 'current_evidence', conventionEra: 'current', oldestSourceDate: '2026-01-01', latestSourceDate: '2026-02-01', recentDocumentCount: 2, historicalDocumentCount: 0, transitionalDocumentCount: 0, undatedDocumentCount: 0 },
      confidence: 0.85,
    };
  }
  async function seedApprovedStyle(db, value, category, key) {
    const prop = await styleGuideStore.proposeFromMemory(db, { memory: styleMemory(value, category, key), actorId: 'admin', now: AT });
    if (!prop.ok) throw new Error('seed style propose failed: ' + JSON.stringify(prop.error));
    const app = await styleGuideStore.approveRule(db, prop.data.ruleId, { actorId: 'admin', rationale: `disetujui ${value}`, at: AT });
    if (!app.ok) throw new Error('seed style approve failed: ' + JSON.stringify(app.error));
    return app.data;
  }
  async function seedApprovedTemplate(db, variant) {
    const prop = await visualTemplateStore.proposeFromEvidence(db, { pattern: visualPattern(variant), actorId: 'admin', now: AT });
    if (!prop.ok) throw new Error('seed template propose failed: ' + JSON.stringify(prop.error));
    const app = await visualTemplateStore.approveTemplate(db, prop.data.templateId, { actorId: 'admin', rationale: 'tata letak disetujui', at: AT });
    if (!app.ok) throw new Error('seed template approve failed: ' + JSON.stringify(app.error));
    return app.data;
  }

  let _d = 0;
  function makeDraftRecord({ generationContext, ownerId, status, publishedNumber } = {}) {
    _d += 1;
    const provenance = { bodySource: 'template', fieldProvenance: {} };
    if (generationContext !== undefined) provenance.generationContext = generationContext;
    return {
      schema: NOR_DRAFT_SCHEMA, draftId: `draft_act_${_d}`, conversationId: `conv_act_${_d}`,
      version: 1, ownerId: ownerId || 'client-claimed-owner', status: status || 'requires_review',
      jenis: 'Pengadaan', subject: 'Pengadaan kursi rapat', recipient: 'Bendahara', recipientStatus: 'known',
      date: '2026-09-04', facts: { item: 'kursi rapat', quantity: '10' },
      body: 'Dengan hormat, diajukan pengadaan kursi rapat.',
      numbering: { suggestedNumber: '', publishedNumber: publishedNumber === undefined ? null : publishedNumber, source: 'system_suggested', basis: null, confidence: 0 },
      provenance,
      humanEdited: false,
      auditTrail: [{ type: 'AI_DRAFT_CREATED', at: AT, actorId: 'client-claimed-actor', changedFields: [] }],
      createdAt: AT, updatedAt: AT,
    };
  }

  /* ── seed the canonical authority ──────────────────────────────────── */
  const styleSeed = await seedApprovedStyle(callableDb, 'Dengan hormat,', 'opening_pattern', 'default');
  const vtSeed = await seedApprovedTemplate(callableDb);

  /* ── 1. functions/index.js is now WIRED (Phase 6A §0.1, §25) ───────── */
  section('functions/index.js — intelligenceNorGeneration WIRED (Phase 6A)');
  {
    const idx = fs.readFileSync(path.join(ROOT, 'functions/index.js'), 'utf8');
    check(/require\(['"]\.\/src\/intelligence\/intelligenceNorGeneration['"]\)/.test(idx), 'functions/index.js requires ./src/intelligence/intelligenceNorGeneration');
    check(/exports\.intelligenceNorGeneration\s*=\s*intelligenceNorGeneration/.test(idx), 'functions/index.js exports intelligenceNorGeneration');
    // §36 — the ONE architectural exception this phase permits: no OTHER
    // staged callable is wired alongside it.
    for (const other of ['intelligenceCorpus', 'intelligenceStyleGuide', 'intelligenceVisualTemplate', 'intelligenceRetrieval']) {
      check(!new RegExp(`exports\\.${other}\\b`).test(idx), `functions/index.js still does NOT export ${other} (§25 — only the generation callable is activated)`);
    }
  }

  /* ── 2. the legitimate end-to-end path ──────────────────────────────── */
  let genCtx;
  section('end-to-end — intelligenceNorGeneration → intelligenceNorDraft.create persists the SAME verified context');
  {
    const gen = await intelligenceNorGeneration.run({ data: { op: 'generationContext', documentType: 'NOR' }, auth: asAdmin('alice') });
    check(gen.ok && gen.data.gate === 'GENERATION_ALLOWED', 'precondition: server-authoritative generation is ALLOWED');
    genCtx = gen.data;

    const record = makeDraftRecord({ generationContext: genCtx });
    const res = await intelligenceNorDraft.run({ data: { op: 'create', record }, auth: asAdmin('alice') });
    check(res.ok, `create with a legitimate generation context succeeds (${res.ok ? '' : JSON.stringify(res.error)})`);
    check(JSON.stringify(res.data.provenance.generationContext) === JSON.stringify(genCtx), 'the persisted generationContext is byte-identical to the verified one (the frozen snapshot — §16)');
    check(JSON.stringify(res.data.provenance.visualBinding) === JSON.stringify(genCtx.visual), 'provenance.visualBinding is SERVER-DERIVED from generationContext.visual');
    check(res.data.ownerId === 'alice', 'ownerId is the authenticated uid, not the client-claimed one');
  }

  /* ── 3. legacy mode (no generationContext) always passes ────────────── */
  section('legacy mode — a draft with no generationContext at all is always accepted');
  {
    const record = makeDraftRecord({}); // no `generationContext` key at all
    const res = await intelligenceNorDraft.run({ data: { op: 'create', record }, auth: asAdmin('alice') });
    check(res.ok && res.data.provenance.generationContext == null, 'legacy-mode create succeeds; generationContext stays null');
  }
  {
    const record = makeDraftRecord({ generationContext: null });
    const res = await intelligenceNorDraft.run({ data: { op: 'create', record }, auth: asAdmin('alice') });
    check(res.ok, 'an explicit null generationContext is also accepted (equivalent to legacy)');
  }

  /* ── 4. adversarial — forged / stale generation context (§15, §29) ─── */
  section('adversarial — forged ruleId (A/C: forged certification / forged rule)');
  {
    const forged = JSON.parse(JSON.stringify(genCtx));
    forged.style.slots.opening.ruleId = 'sgr_completely_made_up';
    const res = await intelligenceNorDraft.run({ data: { op: 'create', record: makeDraftRecord({ generationContext: forged }) }, auth: asAdmin('alice') });
    check(!res.ok && res.error.code === DRAFT_STORE_ERRORS.INVALID_GENERATION_CONTEXT, 'a ruleId that does not exist → INVALID_GENERATION_CONTEXT (rejected, not repaired)');
  }
  section('adversarial — real ruleId, tampered value (content forgery behind a real id)');
  {
    const forged = JSON.parse(JSON.stringify(genCtx));
    forged.style.slots.opening.value = 'KALIMAT PEMBUKA PALSU';
    const res = await intelligenceNorDraft.run({ data: { op: 'create', record: makeDraftRecord({ generationContext: forged }) }, auth: asAdmin('alice') });
    check(!res.ok && res.error.code === DRAFT_STORE_ERRORS.INVALID_GENERATION_CONTEXT, 'a real ruleId with a DIFFERENT claimed value → INVALID_GENERATION_CONTEXT');
  }
  section('adversarial — forged version number');
  {
    const forged = JSON.parse(JSON.stringify(genCtx));
    forged.style.slots.opening.version = 999;
    const res = await intelligenceNorDraft.run({ data: { op: 'create', record: makeDraftRecord({ generationContext: forged }) }, auth: asAdmin('alice') });
    check(!res.ok && res.error.code === DRAFT_STORE_ERRORS.STALE_GENERATION_CONTEXT, 'a forged/mismatched rule version → STALE_GENERATION_CONTEXT');
  }
  section('adversarial — forged template id / geometry (D: forged Visual Template)');
  {
    const forgedId = JSON.parse(JSON.stringify(genCtx));
    forgedId.visual.templateId = 'vtpl_completely_made_up';
    let res = await intelligenceNorDraft.run({ data: { op: 'create', record: makeDraftRecord({ generationContext: forgedId }) }, auth: asAdmin('alice') });
    check(!res.ok && res.error.code === DRAFT_STORE_ERRORS.INVALID_GENERATION_CONTEXT, 'a templateId that does not exist → INVALID_GENERATION_CONTEXT');

    const forgedGeo = JSON.parse(JSON.stringify(genCtx));
    forgedGeo.visual.pageModel = { ...forgedGeo.visual.pageModel, width: 999 };
    res = await intelligenceNorDraft.run({ data: { op: 'create', record: makeDraftRecord({ generationContext: forgedGeo }) }, auth: asAdmin('alice') });
    check(!res.ok && res.error.code === DRAFT_STORE_ERRORS.INVALID_GENERATION_CONTEXT, 'a real templateId with TAMPERED geometry → INVALID_GENERATION_CONTEXT (never silently repaired to the real geometry)');
  }
  section('adversarial — a blocked context smuggling authority (§9, §15.4)');
  {
    const smuggled = JSON.parse(JSON.stringify(genCtx));
    smuggled.gate = 'GENERATION_BLOCKED_UNAVAILABLE';
    smuggled.status = 'blocked_unavailable';
    smuggled.blocked = true; // claims blocked, but keeps the certified slots/visual — a lie
    const res = await intelligenceNorDraft.run({ data: { op: 'create', record: makeDraftRecord({ generationContext: smuggled }) }, auth: asAdmin('alice') });
    check(!res.ok, 'a context that is internally inconsistent (blocked=true yet still carries certified authority) is rejected');
  }
  section('adversarial — historical/proposal injection (G/H) cannot become authority');
  {
    const forged = JSON.parse(JSON.stringify(genCtx));
    forged.style.slots.opening.source = 'certified_style_rule';
    forged.style.slots.opening.ruleId = 'mem_1'; // a Writing Memory id, never a real ruleId
    const res = await intelligenceNorDraft.run({ data: { op: 'create', record: makeDraftRecord({ generationContext: forged }) }, auth: asAdmin('alice') });
    check(!res.ok && res.error.code === DRAFT_STORE_ERRORS.INVALID_GENERATION_CONTEXT, 'a Writing-Memory / non-rule id presented as a certified ruleId → INVALID (no lookup match, no promotion)');
  }

  /* ── 5. STALE — authority moves after generation, before draft create ── */
  section('STALE — the approved rule is deprecated after generation, before draft creation (§16)');
  {
    const gen = await intelligenceNorGeneration.run({ data: { op: 'generationContext', documentType: 'NOR' }, auth: asAdmin('alice') });
    const snapshot = gen.data;
    check(snapshot.gate === 'GENERATION_ALLOWED', 'a fresh snapshot is certified before the rule is deprecated');
    const dep = await styleGuideStore.deprecateRule(callableDb, styleSeed.ruleId, { actorId: 'admin', reason: 'digantikan', at: AT, expectedVersion: styleSeed.version });
    check(dep.ok, 'precondition: the rule is now deprecated (no longer approved)');
    const res = await intelligenceNorDraft.run({ data: { op: 'create', record: makeDraftRecord({ generationContext: snapshot }) }, auth: asAdmin('alice') });
    check(!res.ok && res.error.code === DRAFT_STORE_ERRORS.STALE_GENERATION_CONTEXT, 'the now-stale snapshot is REJECTED — a stale rule is not silently treated as current authority (documented §16 policy: re-generate rather than persist)');
  }
  // reseed a DIFFERENT value (a different value ⇒ a different deterministic
  // ruleId — styleRuleIdFrom hashes the value) so the remaining sections get
  // a fresh ALLOWED generation context without colliding with the just-
  // deprecated rule's id.
  await seedApprovedStyle(callableDb, 'Dengan hormat dan salam sejahtera,', 'opening_pattern', 'default');

  /* ── 6. E/F — forged actor / forged organization scope ─────────────── */
  section('E — forged actor: server derives ownerId from auth.uid, never data.record.ownerId');
  {
    const gen = await intelligenceNorGeneration.run({ data: { op: 'generationContext', documentType: 'NOR' }, auth: asAdmin('bob') });
    const record = makeDraftRecord({ generationContext: gen.data, ownerId: 'someone-else-entirely' });
    const res = await intelligenceNorDraft.run({ data: { op: 'create', record }, auth: asAdmin('bob') });
    check(res.ok && res.data.ownerId === 'bob', 'a forged ownerId in the record is discarded; auth.uid wins');
  }
  section('F — forged organization scope in the generation request is ignored');
  {
    const before = snapshotDb();
    const res = await intelligenceNorGeneration.run({
      data: { op: 'generationContext', documentType: 'NOR', scope: 'attacker-tenant', organization: 'evil-corp' },
      auth: asAdmin('alice'),
    });
    check(res.ok && res.data.retrieval.documentType === 'NOR', 'the generation callable ignores a forged scope/organization field entirely');
    check(snapshotDb() === before, 'still read-only');
  }

  /* ── 7. I/J — numbering + publication injection ────────────────────── */
  section('I — numbering injection: a client-supplied publishedNumber never persists');
  {
    const gen = await intelligenceNorGeneration.run({ data: { op: 'generationContext', documentType: 'NOR' }, auth: asAdmin('alice') });
    const record = makeDraftRecord({ generationContext: gen.data, publishedNumber: 'NOR/999/FORGED' });
    const res = await intelligenceNorDraft.run({ data: { op: 'create', record }, auth: asAdmin('alice') });
    check(res.ok && res.data.numbering.publishedNumber === null, 'numbering.publishedNumber is forced null regardless of what the client sent (§18)');
  }
  section('J — publication injection: a client-supplied status:"published" is rejected, never silently accepted as requires_review');
  {
    const gen = await intelligenceNorGeneration.run({ data: { op: 'generationContext', documentType: 'NOR' }, auth: asAdmin('alice') });
    const record = makeDraftRecord({ generationContext: gen.data, status: 'published' });
    const res = await intelligenceNorDraft.run({ data: { op: 'create', record }, auth: asAdmin('alice') });
    check(!res.ok, 'a draft record claiming status "published" is REJECTED outright (the contract only allows requires_review — §19)');
  }

  /* ── 8. the verifier performs POINT LOOKUPS ONLY — never re-retrieval ── */
  section('the verifier never re-runs retrieval (§9, §26) — point lookups only');
  {
    const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    const verifierSrc = stripComments(fs.readFileSync(path.join(ROOT, 'functions/src/intelligence/generationContextVerifier.js'), 'utf8'));
    check(/styleGuideStore\.getRule\(/.test(verifierSrc) && /visualTemplateStore\.getTemplate\(/.test(verifierSrc), 'the verifier calls ONLY getRule / getTemplate (point lookups)');
    check(!/\.listRules\(|\.listTemplates\(|\.listAll\(|retrieveNorContext|evaluateGenerationContext|buildGenerationContext/.test(verifierSrc), 'the verifier NEVER calls listRules / listTemplates / retrieveNorContext / the gate — no shadow retrieval, no re-composition');
  }

  /* ── 9. static safety scan ─────────────────────────────────────────── */
  section('static — no OpenAI / RAG / HTTP / secret / numbering / publish / registry / Petty Cash / V1');
  {
    const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    for (const f of ['functions/src/intelligence/generationContextVerifier.js', 'functions/src/intelligence/intelligenceNorDraft.js', 'functions/src/intelligence/intelligenceNorGeneration.js']) {
      const blob = stripComments(fs.readFileSync(path.join(ROOT, f), 'utf8'));
      check(!/sk-[A-Za-z0-9]|OPENAI_API_KEY|api\.openai\.com|\bopenai\b|anthropic|\bfetch\s*\(|embedding|vector|\bRAG\b/i.test(blob), `${f}: no OpenAI / RAG / vector / embedding / outbound-HTTP / secret reference`);
      check(!/require\([^)]*petty|generateNor\s*\(|pettyCashNors|norRegistryStore|norGenerator|renderPdf|pdfmake|\bapproveNor\b|\bpublishNor\b|reserveNumber|numberAllocation/i.test(blob), `${f}: no V1 / Petty Cash / NOR Registry / numbering / publish / renderer coupling`);
    }
  }

  /* ── 10. database.rules.json unchanged ──────────────────────────────── */
  section('database.rules.json — 0 change (Phase 6A adds no RTDB node)');
  {
    const rules = fs.readFileSync(path.join(ROOT, 'database.rules.json'), 'utf8');
    check(!/intelligence_generation/.test(rules), 'no new node for generation context — it rides inside the existing /intelligence_nor_drafts provenance bag');
  }

  console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'} — ${fail} failing check(s).`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
