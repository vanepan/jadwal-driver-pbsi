/* ============================================================
   intelligence-retrieval-check.cjs — Certified Retrieval Integration
   (V2, Phase 5.x.7)

   CJS test for the SERVER side
   (functions/src/intelligence/norRetrievalContract.js + intelligenceRetrieval.js).
   No emulator — the Admin SDK RTDB surface is a faithful in-memory fake;
   the Style Guide + Visual Template stores are the real Phase 5.x.5 /
   5.x.6 CJS stores.

   Proves:
     1  CJS ⇄ ESM contract drift — schemas, enums; retrieveNorContext
        produces IDENTICAL output on the same rule sets + request
     2  the intelligenceRetrieval callable (.run) — auth / authz / op
        matrix; unauth → unauthenticated; non-admin → permission-denied;
        unknown op → invalid-argument; missing documentType → invalid-argument
     3  A — approved Style Guide + approved Visual Template → certified
     4  D — Style Guide conflict → conflict
     5  L — a Style Guide store read failure → styleGuide `unavailable` →
        certification `unavailable` (NOT silently `[]` — §22, §23)
     6  READ-ONLY — the callable mutates NOTHING (DB byte-identical)
     7  CLIENT TRUST — a forged `scope` / authority context has no effect;
        the client controls only documentType / categories / regionKinds
     8  static scan — no OpenAI / model / RAG / external HTTP / secret / V1
        / NOR Generator / NOR Registry / Petty Cash / feature-flag / any
        write coupling in the 2 server files
     9  functions/index.js references + exports intelligenceRetrieval
        (WIRED — Controlled Deployment Phase A; deploy NOT run)

   Run:  node scripts/intelligence-retrieval-check.cjs   (exit 0 = pass)
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

const cjs = require('../functions/src/intelligence/norRetrievalContract');
const styleGuideStore = require('../functions/src/intelligence/styleGuideStore');
const visualTemplateStore = require('../functions/src/intelligence/visualTemplateStore');
const callableDb = makeFakeDb();
require.cache[require.resolve('../functions/src/config/admin')] = { id: 'admin-shim', loaded: true, exports: { admin: {}, auth: {}, db: callableDb } };
const { intelligenceRetrieval } = require('../functions/src/intelligence/intelligenceRetrieval');

(async () => {
  const AT = '2026-09-04T00:00:00.000Z';
  const asAdmin = (uid) => ({ uid, token: { role: 'admin' } });
  const snapshotDb = () => JSON.stringify(callableDb._root);

  const esmSg = await import('../src/intelligence/corpus/style-guide/style-guide-proposal.js');
  const esmSgAuth = await import('../src/intelligence/corpus/style-guide/style-guide-authority.js');
  const esmVt = await import('../src/intelligence/corpus/visual-template/visual-template-proposal.js');
  const esmVtAuth = await import('../src/intelligence/corpus/visual-template/visual-template-authority.js');
  const esmRetrieval = await import('../src/intelligence/retrieval/nor-context-retrieval.js');
  const esmRetrievalContract = await import('../src/intelligence/retrieval/contracts/nor-retrieval-contract.js');

  let _m = 0;
  function styleMemory(value, category, key) {
    _m += 1;
    return {
      memoryId: `mem_${_m}`, category: category || 'recipient_convention', key: key || 'recipient_label',
      value, normalizedValue: value.toLowerCase(), documentType: 'NOR', temporalStatus: 'current_evidence', conventionEra: 'current',
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
    check(cjs.NOR_RETRIEVAL_CONTEXT_SCHEMA === esmRetrievalContract.NOR_RETRIEVAL_CONTEXT_SCHEMA, 'context schema matches');
    check(JSON.stringify(cjs.RETRIEVAL_CERTIFICATION_STATUS) === JSON.stringify(esmRetrievalContract.RETRIEVAL_CERTIFICATION_STATUS), 'RETRIEVAL_CERTIFICATION_STATUS matches');
    check(JSON.stringify(cjs.RETRIEVAL_DOMAIN_STATUS) === JSON.stringify(esmRetrievalContract.RETRIEVAL_DOMAIN_STATUS), 'RETRIEVAL_DOMAIN_STATUS matches');
    check(JSON.stringify(cjs.RETRIEVAL_DOCUMENT_TYPES) === JSON.stringify(esmRetrievalContract.RETRIEVAL_DOCUMENT_TYPES), 'RETRIEVAL_DOCUMENT_TYPES matches');

    // build approved rule sets purely (no db)
    const sgRule = esmSgAuth.markApproved(esmSg.makeStyleGuideProposalFromMemory(styleMemory('Yth.'), { at: AT, actorId: 'evan' }), { actorId: 'evan', rationale: 'ok', at: AT }).next;
    const sgRule2 = esmSgAuth.markApproved(esmSg.makeStyleGuideProposalFromMemory(styleMemory('Kepada'), { at: AT, actorId: 'evan' }), { actorId: 'evan', rationale: 'ok', at: AT }).next;
    const vtRule = esmVtAuth.markApproved(esmVt.makeVisualTemplateProposalFromPattern(visualPattern('a4-x'), { at: AT, actorId: 'evan' }), { actorId: 'evan', rationale: 'ok', at: AT }).next;

    for (const [label, sr, vt] of [
      ['certified', [sgRule], [vtRule]],
      ['style conflict', [sgRule, sgRule2], [vtRule]],
      ['style unavailable', null, [vtRule]],
      ['both missing', [], []],
    ]) {
      const c = cjs.retrieveNorContext({ styleRules: sr, visualTemplates: vt }, { documentType: 'NOR' }, { at: AT });
      const e = esmRetrieval.retrieveNorContext({ styleRules: sr, visualTemplates: vt }, { documentType: 'NOR' }, { at: AT });
      check(JSON.stringify(c) === JSON.stringify(e), `retrieveNorContext → byte-identical CJS vs ESM (${label})`);
    }
  }

  /* seed the fake db */
  await seedApprovedStyle(callableDb, 'Yth.');
  await seedApprovedStyle(callableDb, 'Demikian disampaikan', 'closing_pattern', 'closing');
  const vtSeed = await seedApprovedTemplate(callableDb);

  /* ── 2. auth / authz / op ──────────────────────────────────────────── */
  section('auth / authz / op');
  {
    let t;
    t = null; try { await intelligenceRetrieval.run({ data: { op: 'norContext', documentType: 'NOR' } }); } catch (e) { t = e; }
    check(t && t.code === 'unauthenticated', 'no auth → unauthenticated');
    t = null; try { await intelligenceRetrieval.run({ data: { op: 'norContext', documentType: 'NOR' }, auth: { uid: 'x', token: { role: 'driver' } } }); } catch (e) { t = e; }
    check(t && t.code === 'permission-denied', 'non-admin → permission-denied');
    t = null; try { await intelligenceRetrieval.run({ data: { op: 'bogus', documentType: 'NOR' }, auth: asAdmin('a') }); } catch (e) { t = e; }
    check(t && t.code === 'invalid-argument', 'unknown op → invalid-argument');
    t = null; try { await intelligenceRetrieval.run({ data: { op: 'norContext' }, auth: asAdmin('a') }); } catch (e) { t = e; }
    check(t && t.code === 'invalid-argument', 'missing documentType → invalid-argument (§16)');
  }

  /* ── 3. A — certified end-to-end ───────────────────────────────────── */
  section('A — approved Style Guide + approved Visual Template → certified (§30.A)');
  {
    const r = await intelligenceRetrieval.run({ data: { op: 'norContext', documentType: 'NOR' }, auth: asAdmin('alice') });
    check(r.ok && esmRetrievalContract.isNorRetrievalContext(r.data), 'the callable returns a valid NorRetrievalContext envelope');
    check(r.data.certification.status === 'certified', 'certification.status === certified');
    check(r.data.certification.styleGuide.status === 'resolved' && r.data.certification.visualTemplate.status === 'resolved', 'both domain statuses resolved');
    check(r.data.styleGuide.rules.length >= 1 && r.data.styleGuide.rules.every((x) => x.rule == null || x.rule.authorityState === 'authoritative'), 'every returned style rule is authoritative (§14)');
    check(r.data.visualTemplate.template && r.data.visualTemplate.template.templateId === vtSeed.templateId, 'the approved template is returned');
    check(r.data.provenance.approvedStyleRuleCount >= 2 && r.data.provenance.approvedVisualTemplateCount === 1, 'provenance counts the approved records considered');
  }

  /* ── 4. D — style conflict → conflict ─────────────────────────────── */
  section('D — Style Guide conflict → conflict (§8, §30.D)');
  {
    await seedApprovedStyle(callableDb, 'Kepada', 'recipient_convention', 'recipient_label', true); // acknowledgeConflict — a deliberate competing approval
    const r = await intelligenceRetrieval.run({ data: { op: 'norContext', documentType: 'NOR', categories: ['recipient_convention'] }, auth: asAdmin('alice') });
    check(r.data.certification.status === 'conflict' && r.data.certification.styleGuide.status === 'conflict', 'D: style domain conflict → certification conflict (§30.D)');
    check(r.data.styleGuide.rules.some((x) => x.outcome === 'conflict' && x.rule === null && x.competingRuleIds.length === 2), 'D: the conflicted slot returns NO rule + both competing ids (§25)');
    check(r.data.conflicts.styleGuide.length === 1 && r.data.conflicts.styleGuide[0].competing.length === 2, 'D: conflicts.styleGuide exposes both competing rules (§8)');
  }

  /* ── 5. L — a store read failure → unavailable ─────────────────────── */
  section('L — a subsystem read failure → unavailable, NOT empty (§22, §23, §30.L)');
  {
    const orig = styleGuideStore.listRules;
    styleGuideStore.listRules = async () => ({ ok: false, data: null, error: { code: 'READ_FAILED', message: 'boom' } });
    const before = snapshotDb();
    const r = await intelligenceRetrieval.run({ data: { op: 'norContext', documentType: 'NOR' }, auth: asAdmin('alice') });
    styleGuideStore.listRules = orig;
    check(r.ok && r.data.certification.status === 'unavailable' && r.data.certification.styleGuide.status === 'unavailable', 'L: Style Guide store read fails → styleGuide `unavailable` → certification `unavailable` (§30.L)');
    check(r.data.certification.status !== 'incomplete', 'L: `unavailable` is NOT collapsed to `incomplete` (§22)');
    check(r.data.certification.reasons.some((x) => /could not be queried/.test(x)), 'L: an explicit "could not be queried" reason is recorded');
    check(snapshotDb() === before, 'L: nothing was written despite the failure');
  }

  /* ── 6 + 7. read-only + client cannot forge authority ─────────────── */
  section('read-only + client trust (§19, §20, §21, §30.N)');
  {
    const before = snapshotDb();
    const r = await intelligenceRetrieval.run({
      data: {
        op: 'norContext', documentType: 'NOR',
        // hostile injections — must all be ignored
        scope: 'attacker-tenant', authorityState: 'authoritative', approvedBy: 'attacker', version: 999,
        sourceDocumentIds: ['forged'], tenantId: 'evil', styleRules: [{ ruleId: 'INJECTED' }],
      },
      auth: asAdmin('alice'),
    });
    check(r.ok, 'the retrieval still succeeds with hostile extra fields');
    check(r.data.request.scope === 'organization', 'N: the forged `scope` is ignored — organization only (§20, §21, §30.N)');
    check(r.data.styleGuide.rules.every((x) => x.rule == null || x.rule.approvedBy === 'admin'), 'N: forged approvedBy has no effect — authority comes only from the approved records (§30.N)');
    check(!JSON.stringify(r.data).includes('INJECTED') && !JSON.stringify(r.data).includes('attacker-tenant') && !JSON.stringify(r.data).includes('"forged"'), 'N: forged rule ids / tenant / source ids do not appear in the result');
    check(snapshotDb() === before, 'the callable wrote NOTHING (read-only — §19)');
    // repeated call → byte-identical (§24)
    const r2 = await intelligenceRetrieval.run({ data: { op: 'norContext', documentType: 'NOR', categories: ['closing_pattern'] }, auth: asAdmin('alice') });
    const r3 = await intelligenceRetrieval.run({ data: { op: 'norContext', documentType: 'NOR', categories: ['closing_pattern'] }, auth: asAdmin('bob') });
    check(JSON.stringify(r2.data.styleGuide) === JSON.stringify(r3.data.styleGuide) && JSON.stringify(r2.data.certification) === JSON.stringify(r3.data.certification), 'M: identical request → byte-identical context regardless of caller (§24, §30.M)');
  }

  /* ── 8. static scan ─────────────────────────────────────────────── */
  section('static — no OpenAI / RAG / model / HTTP / secret / V1 / generator / write');
  {
    const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    for (const f of ['functions/src/intelligence/norRetrievalContract.js', 'functions/src/intelligence/intelligenceRetrieval.js']) {
      const blob = stripComments(fs.readFileSync(path.join(ROOT, f), 'utf8'));
      check(!/sk-[A-Za-z0-9]|OPENAI_API_KEY|api\.openai\.com|openai|anthropic|\bfetch\s*\(|embedding|vector|pinecone|weaviate|\bRAG\b/i.test(blob), `${f}: no OpenAI / RAG / vector / embedding / outbound-HTTP / secret reference`);
      check(!/require\([^)]*petty|generateNor\s*\(|pettyCashNors|promoteKnowledge|knowledge_repository|require\([^)]*\/knowledge|feature_flags|norRegistryStore|norDraftStore|norGenerator|renderPdf|pdfmake/i.test(blob), `${f}: no V1 / Petty Cash / NOR Registry / NOR Draft / NOR Generator / knowledge / feature-flag / renderer coupling`);
    }
    const cb = stripComments(fs.readFileSync(path.join(ROOT, 'functions/src/intelligence/intelligenceRetrieval.js'), 'utf8'));
    check(/canUseIntelligence\(auth\.token\)/.test(cb), 'the callable authorizes with canUseIntelligence (no new permission)');
    check(!/\.set\s*\(|\.update\s*\(|\.remove\s*\(|\.push\s*\(|\.transaction\s*\(/.test(cb), 'the callable performs NO database write of any kind (§19)');
    check(!/data\.(scope|authorityState|approvedBy|approvedAt|createdBy|version|sourceDocumentIds|tenantId)\b/.test(cb), 'the callable NEVER reads a client scope / authority / ownership field (§20, §21)');
  }

  /* ── 9. wiring (WIRED — Controlled Deployment Phase A) ─────────────── */
  section('functions/index.js — intelligenceRetrieval is WIRED (Controlled Deployment Phase A)');
  {
    const idx = fs.readFileSync(path.join(ROOT, 'functions/index.js'), 'utf8');
    check(/require\(['"]\.\/src\/intelligence\/intelligenceRetrieval['"]\)/.test(idx) && /exports\.intelligenceRetrieval\s*=\s*intelligenceRetrieval/.test(idx), 'functions/index.js requires + exports intelligenceRetrieval (deploy still NOT run; the gateway stays read-only and composes APPROVED-only records)');
  }

  console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'} — ${fail} failing check(s).`);
  process.exit(fail === 0 ? 0 : 1);
})();
