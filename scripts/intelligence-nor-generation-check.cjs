/* ============================================================
   intelligence-nor-generation-check.cjs — Certified Retrieval → NOR
   Generation (V2, Phase 6)

   CJS test for the SERVER side
   (functions/src/intelligence/generationContextContract.js +
   intelligenceNorGeneration.js). No emulator — the Admin SDK RTDB surface
   is a faithful in-memory fake; the Style Guide + Visual Template stores
   are the real Phase 5.x.5 / 5.x.6 CJS stores.

   Proves:
     1  CJS ⇄ ESM drift — schemas, enums, STYLE_SLOT_CATEGORY_MAP;
        buildGenerationContext IDENTICAL on the same retrieval context
     2  the intelligenceNorGeneration callable (.run) — auth / authz / op
        matrix; unauth → unauthenticated; non-admin → permission-denied;
        unknown op → invalid-argument; missing documentType → invalid-argument
     3  end-to-end: approved Style + approved Visual → GENERATION_ALLOWED
     4  HYBRID §8: missing approved Visual → GENERATION_BLOCKED_INCOMPLETE
     5  a store read failure → GENERATION_BLOCKED_UNAVAILABLE, 0 writes
     6  client trust — forged certification / authorityState / scope ignored
     7  determinism — identical request → byte-identical generation context
     8  static — no OpenAI / RAG / model / HTTP / secret / V1 / Petty Cash /
        NOR Draft / NOR Registry / numbering / publish / renderer / any
        database write in the 2 server files
     9  functions/index.js does NOT reference intelligenceNorGeneration (§45)
    10  database.rules.json adds no RTDB node

   Run:  node scripts/intelligence-nor-generation-check.cjs   (exit 0 = pass)
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

const cjs = require('../functions/src/intelligence/generationContextContract');
const rcCjs = require('../functions/src/intelligence/norRetrievalContract');
const styleGuideStore = require('../functions/src/intelligence/styleGuideStore');
const visualTemplateStore = require('../functions/src/intelligence/visualTemplateStore');
const callableDb = makeFakeDb();
require.cache[require.resolve('../functions/src/config/admin')] = { id: 'admin-shim', loaded: true, exports: { admin: {}, auth: {}, db: callableDb } };
const { intelligenceNorGeneration } = require('../functions/src/intelligence/intelligenceNorGeneration');

(async () => {
  const AT = '2026-09-04T00:00:00.000Z';
  const asAdmin = (uid) => ({ uid, token: { role: 'admin' } });
  const snapshotDb = () => JSON.stringify(callableDb._root);

  const esmContract = await import('../src/intelligence/generation/contracts/generation-context-contract.js');
  const esmBuild = await import('../src/intelligence/generation/build-generation-context.js');
  const esmSg = await import('../src/intelligence/corpus/style-guide/style-guide-proposal.js');
  const esmSgAuth = await import('../src/intelligence/corpus/style-guide/style-guide-authority.js');
  const esmVt = await import('../src/intelligence/corpus/visual-template/visual-template-proposal.js');
  const esmVtAuth = await import('../src/intelligence/corpus/visual-template/visual-template-authority.js');
  const esmRetrieval = await import('../src/intelligence/retrieval/nor-context-retrieval.js');

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
  async function seedApprovedStyle(db, value, category, key, ack) {
    const prop = await styleGuideStore.proposeFromMemory(db, { memory: styleMemory(value, category, key), actorId: 'admin', now: AT });
    if (!prop.ok) throw new Error('seed style propose failed: ' + JSON.stringify(prop.error));
    const app = await styleGuideStore.approveRule(db, prop.data.ruleId, { actorId: 'admin', rationale: `disetujui ${value}`, at: AT, acknowledgeConflict: ack === true });
    if (!app.ok) throw new Error('seed style approve failed: ' + JSON.stringify(app.error));
    return app.data;
  }
  async function seedApprovedTemplate(db, variant, ack) {
    const prop = await visualTemplateStore.proposeFromEvidence(db, { pattern: visualPattern(variant), actorId: 'admin', now: AT });
    if (!prop.ok) throw new Error('seed template propose failed: ' + JSON.stringify(prop.error));
    const app = await visualTemplateStore.approveTemplate(db, prop.data.templateId, { actorId: 'admin', rationale: 'tata letak disetujui', at: AT, acknowledgeConflict: ack === true });
    if (!app.ok) throw new Error('seed template approve failed: ' + JSON.stringify(app.error));
    return app.data;
  }

  /* ── 1. CJS ⇄ ESM drift parity ─────────────────────────────────────── */
  section('CJS ⇄ ESM contract parity');
  {
    check(cjs.GENERATION_CONTEXT_SCHEMA === esmContract.GENERATION_CONTEXT_SCHEMA, 'GENERATION_CONTEXT_SCHEMA matches');
    for (const k of ['GENERATION_MODE', 'GENERATION_GATE_OUTCOME', 'GENERATION_STATUS', 'GENERATION_STYLE_SLOT', 'STYLE_SLOT_SOURCE', 'VISUAL_BINDING_SOURCE', 'STYLE_SLOT_CATEGORY_MAP', 'SINGLE_VALUE_SLOTS']) {
      check(JSON.stringify(cjs[k]) === JSON.stringify(esmContract[k]), `${k} matches CJS ⇄ ESM`);
    }
    check(JSON.stringify(cjs.STYLE_SLOT_DEFAULT_REASON) === JSON.stringify(esmContract.STYLE_SLOT_DEFAULT_REASON || {})
      || Object.keys(cjs.STYLE_SLOT_DEFAULT_REASON).length === Object.values(esmContract.GENERATION_STYLE_SLOT).length,
    'STYLE_SLOT_DEFAULT_REASON covers every slot');

    // build approved rule sets purely (no db), compare buildGenerationContext
    const sgOpen = esmSgAuth.markApproved(esmSg.makeStyleGuideProposalFromMemory(styleMemory('Dengan hormat,', 'opening_pattern', 'default'), { at: AT, actorId: 'evan' }), { actorId: 'evan', rationale: 'ok', at: AT }).next;
    const sgR1 = esmSgAuth.markApproved(esmSg.makeStyleGuideProposalFromMemory(styleMemory('Yth.', 'recipient_convention', 'r'), { at: AT, actorId: 'evan' }), { actorId: 'evan', rationale: 'ok', at: AT }).next;
    const sgR2 = esmSgAuth.markApproved(esmSg.makeStyleGuideProposalFromMemory(styleMemory('Kepada', 'recipient_convention', 'r'), { at: AT, actorId: 'evan' }), { actorId: 'evan', rationale: 'ok', at: AT }).next;
    const vt1 = esmVtAuth.markApproved(esmVt.makeVisualTemplateProposalFromPattern(visualPattern('a4-x'), { at: AT, actorId: 'evan' }), { actorId: 'evan', rationale: 'ok', at: AT }).next;

    for (const [label, sr, vt] of [
      ['allowed', [sgOpen], [vt1]],
      ['style conflict → blocked', [sgR1, sgR2], [vt1]],
      ['missing visual → blocked_incomplete', [sgOpen], []],
      ['unavailable → blocked_unavailable', null, [vt1]],
      ['both missing', [], []],
    ]) {
      const rContextC = rcCjs.retrieveNorContext({ styleRules: sr, visualTemplates: vt }, { documentType: 'NOR' }, { at: AT });
      const rContextE = esmRetrieval.retrieveNorContext({ styleRules: sr, visualTemplates: vt }, { documentType: 'NOR' }, { at: AT });
      const c = cjs.buildGenerationContext(rContextC, { mode: 'intelligence', at: AT });
      const e = esmBuild.buildGenerationContext(rContextE, { mode: 'intelligence', at: AT });
      check(JSON.stringify(c) === JSON.stringify(e), `buildGenerationContext → byte-identical CJS vs ESM (${label})`);
      check(cjs.isGenerationContext(c) && esmContract.isGenerationContext(e), `…both are structurally valid (${label})`);
    }
  }

  /* seed the fake db */
  await seedApprovedStyle(callableDb, 'Dengan hormat,', 'opening_pattern', 'default');
  await seedApprovedStyle(callableDb, 'Demikian disampaikan.', 'closing_pattern', 'default');
  const vtSeed = await seedApprovedTemplate(callableDb);

  /* ── 2. auth / authz / op ──────────────────────────────────────────── */
  section('auth / authz / op');
  {
    let t;
    t = null; try { await intelligenceNorGeneration.run({ data: { op: 'generationContext', documentType: 'NOR' } }); } catch (e) { t = e; }
    check(t && t.code === 'unauthenticated', 'no auth → unauthenticated');
    t = null; try { await intelligenceNorGeneration.run({ data: { op: 'generationContext', documentType: 'NOR' }, auth: { uid: 'x', token: { role: 'driver' } } }); } catch (e) { t = e; }
    check(t && t.code === 'permission-denied', 'non-admin → permission-denied');
    t = null; try { await intelligenceNorGeneration.run({ data: { op: 'bogus', documentType: 'NOR' }, auth: asAdmin('a') }); } catch (e) { t = e; }
    check(t && t.code === 'invalid-argument', 'unknown op → invalid-argument');
    t = null; try { await intelligenceNorGeneration.run({ data: { op: 'generationContext' }, auth: asAdmin('a') }); } catch (e) { t = e; }
    check(t && t.code === 'invalid-argument', 'missing documentType → invalid-argument (§16)');
  }

  /* ── 3. end-to-end certified ───────────────────────────────────────── */
  section('end-to-end — approved Style + approved Visual → GENERATION_ALLOWED');
  {
    const r = await intelligenceNorGeneration.run({ data: { op: 'generationContext', documentType: 'NOR' }, auth: asAdmin('alice') });
    check(r.ok && cjs.isGenerationContext(r.data), 'the callable returns a valid GenerationContext envelope');
    check(r.data.gate === 'GENERATION_ALLOWED' && r.data.status === 'generated' && r.data.blocked === false, 'certified → GENERATION_ALLOWED / generated / not blocked');
    check(r.data.style.slots.opening && r.data.style.slots.opening.source === 'certified_style_rule' && r.data.style.slots.opening.value === 'Dengan hormat,', 'the approved opening rule binds the opening slot');
    check(r.data.visual.source === 'approved_template' && r.data.visual.templateId === vtSeed.templateId, 'the approved template binds the visual directive');
    check(r.data.snapshot.styleRuleIds.length >= 2 && r.data.snapshot.visualTemplateIds.length === 1, 'the provenance snapshot lists the rule + template ids used');
    check(r.data.style.slots.opening.value === 'Dengan hormat,' && !JSON.stringify(r.data).includes('disetujui'), 'no approval rationale text leaks into the generation context (§33)');
  }

  /* ── 4. HYBRID §8 — missing approved visual → blocked ──────────────── */
  section('HYBRID §8 — a MEMORANDUM request (no approved MEMO template) → GENERATION_BLOCKED_INCOMPLETE');
  {
    const r = await intelligenceNorGeneration.run({ data: { op: 'generationContext', documentType: 'MEMORANDUM' }, auth: asAdmin('alice') });
    check(r.ok && r.data.gate === 'GENERATION_BLOCKED_INCOMPLETE' && r.data.blocked === true, 'no approved Visual Template for the type → BLOCKED_INCOMPLETE');
    check(r.data.style.certifiedRuleIds.length === 0, 'a blocked generation binds NO certified style rule (§9)');
    check(r.data.reasons.some((x) => /no approved Visual Template/i.test(x)), 'the reason names the missing approved template');
  }

  /* ── 5. store read failure → unavailable, 0 writes ────────────────── */
  section('a subsystem read failure → GENERATION_BLOCKED_UNAVAILABLE, 0 writes (§10, §19)');
  {
    const orig = styleGuideStore.listRules;
    styleGuideStore.listRules = async () => ({ ok: false, data: null, error: { code: 'READ_FAILED', message: 'boom' } });
    const before = snapshotDb();
    const r = await intelligenceNorGeneration.run({ data: { op: 'generationContext', documentType: 'NOR' }, auth: asAdmin('alice') });
    styleGuideStore.listRules = orig;
    check(r.ok && r.data.gate === 'GENERATION_BLOCKED_UNAVAILABLE' && r.data.blocked === true, 'a Style Guide read failure → GENERATION_BLOCKED_UNAVAILABLE (never a guess)');
    check(r.data.gate !== 'GENERATION_BLOCKED_INCOMPLETE', '`unavailable` is NOT collapsed to `incomplete` (§10)');
    check(snapshotDb() === before, 'nothing was written despite the failure (read-only — §19)');
  }

  /* ── 6. client trust — forged fields ignored ─────────────────────── */
  section('client trust (§28, §29) — forged certification / authority / scope ignored');
  {
    const before = snapshotDb();
    const r = await intelligenceNorGeneration.run({
      data: {
        op: 'generationContext', documentType: 'NOR',
        // hostile injections
        certification: 'certified', gate: 'GENERATION_ALLOWED', blocked: false,
        scope: 'attacker-tenant', authorityState: 'authoritative', approvedBy: 'attacker', version: 999,
        styleRules: [{ ruleId: 'INJECTED', value: 'HOSTILE' }],
        generationContext: { blocked: false, style: { certifiedRuleIds: ['INJECTED'] } },
      },
      auth: asAdmin('alice'),
    });
    check(r.ok, 'the callable still succeeds with hostile extra fields');
    check(r.data.retrieval.documentType === 'NOR', 'documentType is the only client-controlled routing field honoured');
    check(!JSON.stringify(r.data).includes('INJECTED') && !JSON.stringify(r.data).includes('HOSTILE') && !JSON.stringify(r.data).includes('attacker'), 'forged rule ids / values / tenant do not appear anywhere in the result');
    check(r.data.style.slots.opening.value === 'Dengan hormat,', 'authority still comes ONLY from the approved records in storage');
    check(snapshotDb() === before, 'the callable wrote NOTHING (read-only)');
    const r2 = await intelligenceNorGeneration.run({ data: { op: 'generationContext', documentType: 'NOR' }, auth: asAdmin('bob') });
    check(JSON.stringify(r.data.style) === JSON.stringify(r2.data.style) && JSON.stringify(r.data.gate) === JSON.stringify(r2.data.gate), 'identical request → byte-identical context regardless of caller (§23)');
  }

  /* ── 7. static scan ─────────────────────────────────────────────── */
  section('static — no OpenAI / RAG / model / HTTP / secret / V1 / generator / numbering / publish / write');
  {
    const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    for (const f of ['functions/src/intelligence/generationContextContract.js', 'functions/src/intelligence/intelligenceNorGeneration.js']) {
      const blob = stripComments(fs.readFileSync(path.join(ROOT, f), 'utf8'));
      check(!/sk-[A-Za-z0-9]|OPENAI_API_KEY|api\.openai\.com|\bopenai\b|anthropic|\bfetch\s*\(|embedding|vector|pinecone|weaviate|\bRAG\b/i.test(blob), `${f}: no OpenAI / RAG / vector / embedding / outbound-HTTP / secret reference`);
      check(!/require\([^)]*petty|generateNor\s*\(|pettyCashNors|promoteKnowledge|require\([^)]*\/knowledge|feature_flags|norRegistryStore|norDraftStore|norGenerator|renderPdf|pdfmake|publishedNumber|reserveNumber|\bapproveNor\b|\bpublishNor\b/i.test(blob), `${f}: no V1 / Petty Cash / NOR Draft / NOR Registry / numbering / publish / renderer / knowledge / feature-flag coupling`);
      // a DB write means a write method invoked on a db/ref/snapshot receiver
      // — `Map.set` / `Set.add` / `Array.push` do not count.
      check(!/\b(db|ref|snap|snapshot|admin\.database\(\))[\w.()]*\.(set|update|remove|push|transaction)\s*\(/.test(blob), `${f}: performs NO database write of any kind (§19)`);
    }
    const contractBlob = stripComments(fs.readFileSync(path.join(ROOT, 'functions/src/intelligence/generationContextContract.js'), 'utf8'));
    check(!/\brequire\s*\(\s*['"](?!\.\/norRetrievalContract|\.\/styleGuideContract)['"]?/.test(contractBlob) && /require\('\.\/norRetrievalContract'\)/.test(contractBlob), 'the CJS contract mirror requires ONLY norRetrievalContract + styleGuideContract (no store, no admin, no db)');
    const cb = stripComments(fs.readFileSync(path.join(ROOT, 'functions/src/intelligence/intelligenceNorGeneration.js'), 'utf8'));
    check(/canUseIntelligence\(auth\.token\)/.test(cb), 'the callable authorizes with canUseIntelligence (no new permission — §29)');
    check(!/data\.(scope|authorityState|approvedBy|approvedAt|createdBy|version|certification|gate|blocked|generationContext)\b/.test(cb), 'the callable NEVER reads a client scope / authority / certification / gate field (§28, §29)');
    check(!/\bdb\b(?![\w.]*\.list(Rules|Templates)\b)[\w.]*\.\w/.test(cb.replace(/db,\s*\{\}/g, 'X')), 'the callable only passes `db` to listRules / listTemplates — it never calls a write method on it');
  }

  /* ── 8. rules unchanged ───────────────────────────────────────────── */
  section('database.rules.json unchanged (Phase 6 / 6A add no RTDB node)');
  {
    const rules = fs.readFileSync(path.join(ROOT, 'database.rules.json'), 'utf8');
    check(!/intelligence_generation/.test(rules), 'database.rules.json adds no RTDB node for Phase 6 / 6A');
  }
  // NOTE — Phase 6A wires intelligenceNorGeneration into functions/index.js
  // (server-authoritative activation). See
  // scripts/intelligence-nor-generation-activation-check.cjs for the WIRED
  // assertion + the draft cross-check + adversarial matrix.

  console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'} — ${fail} failing check(s).`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
