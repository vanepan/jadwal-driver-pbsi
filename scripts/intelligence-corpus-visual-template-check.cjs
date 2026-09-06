/* ============================================================
   intelligence-corpus-visual-template-check.cjs — PBSI Visual Template
   System (V2, Phase 5.x.6)

   CJS test for the SERVER side
   (functions/src/intelligence/visualTemplateContract.js + visualTemplateStore.js
   + intelligenceVisualTemplate.js). No emulator — the Admin SDK RTDB
   surface is a faithful in-memory fake.

   Proves:
     1  CJS ⇄ ESM contract drift — schemas, enums, graphs, field lists;
        makeVisualTemplate / makeVisualTemplateProposalFromPattern /
        markApproved / resolveEffectiveTemplate produce IDENTICAL output
     2  the intelligenceVisualTemplate callable (.run) — auth / authz / op
        matrix; unauth → unauthenticated; non-admin → permission-denied;
        unknown op → invalid-argument
     3  proposeFromEvidence FAILS SAFE with no aggregator wired →
        VISUAL_ANALYSIS_UNAVAILABLE, nothing written (§26, §33)
     4  OWNER ISOLATION — the server rebuilds the visual aggregation from
        the CALLER'S OWN corpus only; a client-supplied corpus / pattern /
        authorityState / version is ignored (§11, §21, §27)
     5  HUMAN GATE — approve without a rationale → RATIONALE_REQUIRED;
        approvedBy / approvedAt are the server actor + timestamp
        (Fixture I); reject / deprecate preserve actor + reason
     6  CONFLICT — a second competing approval fails CLOSED
        (CONFLICT_UNRESOLVED); resolve returns `conflict`, never a
        frequency pick (Fixture F/K)
     7  SUPERSESSION — approving a superseding proposal auto-deprecates the
        predecessor; v1 stays immutable + queryable (Fixture J)
     8  READ-ONLY ops (list / get / resolve / history) write nothing
     9  static scan — no secret / model / HTTP / V1 / Petty Cash / NOR
        Registry / Style Guide / knowledge-write / feature-flag / renderer
        coupling in the 3 server files
    10  functions/index.js references + exports intelligenceVisualTemplate
        (WIRED — Controlled Deployment Phase A; deploy NOT run)

   Run:  node scripts/intelligence-corpus-visual-template-check.cjs   (exit 0 = pass)
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

const cjs = require('../functions/src/intelligence/visualTemplateContract');
const corpusStore = require('../functions/src/intelligence/corpusStore');
const callableDb = makeFakeDb();
require.cache[require.resolve('../functions/src/config/admin')] = { id: 'admin-shim', loaded: true, exports: { admin: {}, auth: {}, db: callableDb } };
const { intelligenceVisualTemplate, __setVisualAggregatorForTest } = require('../functions/src/intelligence/intelligenceVisualTemplate');

(async () => {
  const AT = '2026-09-04T00:00:00.000Z';
  const asAdmin = (uid) => ({ uid, token: { role: 'admin' } });
  const snapshotDb = () => JSON.stringify(callableDb._root);

  let seedN = 0;
  async function seedDoc(owner, id, sourceDate, documentType) {
    const ing = await corpusStore.ingestDocument(callableDb, { seed: { checksum: id.padEnd(64, '0'), title: `doc ${id}`, sourceDate }, ownerId: owner, now: AT });
    const docId = ing.data.document.documentId;
    await corpusStore.setClassification(callableDb, docId, { patch: { sourceDate, documentType: documentType || 'NOR' }, actorId: owner, at: AT });
    return docId;
  }
  async function seedLayout(owner, docId, key, observation, region, confidence) {
    const rec = await corpusStore.recordObservation(callableDb, {
      seed: {
        documentId: docId, category: 'layout', key, modality: 'visual',
        observedValue: key === 'page_geometry' ? `${observation.width}x${observation.height}` : null,
        observation,
        provenance: [{ sourceDocumentId: docId, sourceFileId: null, pageNumber: (region && region.pageNumber) || 1, region: region ? { x: region.x, y: region.y, width: region.width, height: region.height, coordinateSpace: region.coordinateSpace || 'pdf_points' } : null, extractionMethod: 'structure_parse', extractedAt: AT, confidence: confidence || 0.85 }],
        confidence: confidence || 0.85,
      },
      ownerId: owner, now: AT,
    });
    if (!rec.ok) throw new Error(`seed layout obs failed: ${JSON.stringify(rec.error)} (${docId}/${key}/${++seedN})`);
  }
  async function seedPage(owner, docId, w, h) {
    await seedLayout(owner, docId, 'page_geometry', { width: w, height: h, coordinateSpace: 'pdf_points', orientation: w > h ? 'landscape' : 'portrait' }, null, 0.9);
  }
  async function seedBlock(owner, docId, role, x, y, w, h) {
    await seedLayout(owner, docId, `block_${role}`, { role, order: 0 }, { x, y, width: w, height: h, coordinateSpace: 'pdf_points' }, 0.8);
  }

  // alice: NOR "logo left" x3  + NOR "logo center" x2  (a competing layout)
  for (const [id, x] of [['al_l1', 40], ['al_l2', 40], ['al_l3', 40], ['al_c1', 258], ['al_c2', 258]]) {
    const d = await seedDoc('alice', id, '2026-0' + (id.slice(-1)) + '-01', 'NOR');
    await seedPage('alice', d, 595, 842);
    await seedBlock('alice', d, 'logo', x, 780, 80, 40);
  }
  // bob: his own separate corpus
  {
    const d = await seedDoc('bob', 'bo_1', '2026-05-01', 'MEMORANDUM');
    await seedPage('bob', d, 420, 595);
  }

  const CFG = { geometryTolerance: { pageRelativeDecimals: 2, pageSizeTolerancePt: 6, minDocumentsForPattern: 2 }, temporal: { historicalCutoff: '2025-01-01', currentWindowStart: '2026-01-01', minCurrentDocuments: 2 } };
  const esmAgg = await import('../src/intelligence/corpus/visual-template/visual-evidence-aggregator.js');
  const esmVt = await import('../src/intelligence/corpus/visual-template/contracts/visual-template-contract.js');
  const esmProp = await import('../src/intelligence/corpus/visual-template/visual-template-proposal.js');
  const esmAuth = await import('../src/intelligence/corpus/visual-template/visual-template-authority.js');
  const esmQuery = await import('../src/intelligence/corpus/visual-template/visual-template-query.js');
  const wireAggregator = () => __setVisualAggregatorForTest((input, config, opts) => esmAgg.aggregateVisualEvidence(input, config, opts));

  /* ── 1. CJS ⇄ ESM drift parity ─────────────────────────────────────── */
  section('CJS ⇄ ESM contract parity');
  {
    check(cjs.VISUAL_TEMPLATE_SYSTEM_SCHEMA === esmVt.VISUAL_TEMPLATE_SYSTEM_SCHEMA && cjs.VISUAL_TEMPLATE_SCHEMA === esmVt.VISUAL_TEMPLATE_SCHEMA, 'schemas match');
    check(JSON.stringify(cjs.VISUAL_TEMPLATE_STATUS) === JSON.stringify(esmVt.VISUAL_TEMPLATE_STATUS), 'VISUAL_TEMPLATE_STATUS matches');
    check(JSON.stringify(cjs.VISUAL_TEMPLATE_STATUS_GRAPH) === JSON.stringify(esmVt.VISUAL_TEMPLATE_STATUS_GRAPH), 'VISUAL_TEMPLATE_STATUS_GRAPH matches');
    check(JSON.stringify(cjs.VISUAL_AUTHORITY_STATE) === JSON.stringify(esmVt.VISUAL_AUTHORITY_STATE), 'VISUAL_AUTHORITY_STATE matches');
    check(JSON.stringify(cjs.VISUAL_REGION_KIND) === JSON.stringify(esmVt.VISUAL_REGION_KIND), 'VISUAL_REGION_KIND matches');
    check(JSON.stringify(cjs.VISUAL_PAGE_RECURRENCE) === JSON.stringify(esmVt.VISUAL_PAGE_RECURRENCE), 'VISUAL_PAGE_RECURRENCE matches');
    check(JSON.stringify(cjs.COORDINATE_SPACE) === JSON.stringify(esmVt.COORDINATE_SPACE), 'COORDINATE_SPACE matches');
    check(JSON.stringify(cjs.VISUAL_TEMPLATE_AUDIT_EVENTS) === JSON.stringify(esmVt.VISUAL_TEMPLATE_AUDIT_EVENTS), 'VISUAL_TEMPLATE_AUDIT_EVENTS matches');
    check(JSON.stringify(cjs.VISUAL_TEMPLATE_FIELDS) === JSON.stringify(esmVt.VISUAL_TEMPLATE_FIELDS), 'VISUAL_TEMPLATE_FIELDS matches');
    check(cjs.visualTemplateIdFrom('organization', 'NOR', 'x') === esmVt.visualTemplateIdFrom('organization', 'NOR', 'x'), 'visualTemplateIdFrom is identical');

    // build a real pattern from the ESM aggregator, then compare record builders
    const rep = esmAgg.aggregateVisualEvidence({
      documents: [{ documentId: 'd1', documentType: 'NOR', sourceDate: '2026-01-01' }, { documentId: 'd2', documentType: 'NOR', sourceDate: '2026-02-01' }],
      observations: [
        { observationId: 'o1', documentId: 'd1', category: 'layout', modality: 'visual', key: 'page_geometry', observation: { width: 595, height: 842, coordinateSpace: 'pdf_points' }, provenance: [{ sourceDocumentId: 'd1', pageNumber: 1, region: null, extractionMethod: 'structure_parse', extractedAt: AT, confidence: 0.9 }], lifecycleState: 'observed' },
        { observationId: 'o2', documentId: 'd2', category: 'layout', modality: 'visual', key: 'page_geometry', observation: { width: 595, height: 842, coordinateSpace: 'pdf_points' }, provenance: [{ sourceDocumentId: 'd2', pageNumber: 1, region: null, extractionMethod: 'structure_parse', extractedAt: AT, confidence: 0.9 }], lifecycleState: 'observed' },
      ],
    }, CFG, { at: AT });
    const pat = rep.patterns[0];
    const cP = cjs.makeVisualTemplateProposalFromPattern(pat, { at: AT, actorId: 'evan' });
    const eP = esmProp.makeVisualTemplateProposalFromPattern(pat, { at: AT, actorId: 'evan' });
    check(JSON.stringify(cP) === JSON.stringify(eP), 'makeVisualTemplateProposalFromPattern → byte-identical CJS vs ESM');
    const cA = cjs.markApproved(cP, { actorId: 'evan', rationale: 'ok', at: AT });
    const eA = esmAuth.markApproved(eP, { actorId: 'evan', rationale: 'ok', at: AT });
    check(JSON.stringify(cA) === JSON.stringify(eA), 'markApproved → byte-identical CJS vs ESM');
    const two = [cA.next, cjs.makeVisualTemplate({ ...cP, templateId: cP.templateId + '_b', variant: cP.variant + '-alt', status: 'approved', rationale: 'b', approvedBy: 'x', approvedAt: AT })];
    check(JSON.stringify(cjs.resolveEffectiveTemplate(two, { documentType: 'NOR' })) === JSON.stringify(esmQuery.resolveEffectiveTemplate(two, { documentType: 'NOR' })),
      'resolveEffectiveTemplate → byte-identical CJS vs ESM (conflict outcome)');
  }

  /* ── 2. auth / authz / op ──────────────────────────────────────────── */
  section('auth / authz / op');
  {
    let t;
    t = null; try { await intelligenceVisualTemplate.run({ data: { op: 'list' } }); } catch (e) { t = e; }
    check(t && t.code === 'unauthenticated', 'no auth → unauthenticated');
    t = null; try { await intelligenceVisualTemplate.run({ data: { op: 'list' }, auth: { uid: 'x', token: { role: 'driver' } } }); } catch (e) { t = e; }
    check(t && t.code === 'permission-denied', 'non-admin → permission-denied');
    t = null; try { await intelligenceVisualTemplate.run({ data: { op: 'bogus' }, auth: asAdmin('a') }); } catch (e) { t = e; }
    check(t && t.code === 'invalid-argument', 'unknown op → invalid-argument');
    const empty = await intelligenceVisualTemplate.run({ data: { op: 'list' }, auth: asAdmin('alice') });
    check(empty.ok && Array.isArray(empty.data) && empty.data.length === 0, 'list on an empty system → ok, []');
  }

  /* ── 3. proposeFromEvidence fails safe ────────────────────────────── */
  section('proposeFromEvidence — FAILS SAFE with no aggregator wired, mutates nothing (§26, §33)');
  {
    __setVisualAggregatorForTest(null);
    const before = snapshotDb();
    const r = await intelligenceVisualTemplate.run({ data: { op: 'proposeFromEvidence', patternId: 'vpat_anything', config: CFG }, auth: asAdmin('alice') });
    check(!r.ok && r.error.code === 'VISUAL_ANALYSIS_UNAVAILABLE', 'no aggregator → VISUAL_ANALYSIS_UNAVAILABLE (envelope, no throw)');
    check(snapshotDb() === before, 'the database is byte-identical afterwards — nothing was written');
    const noId = await intelligenceVisualTemplate.run({ data: { op: 'proposeFromEvidence' }, auth: asAdmin('alice') });
    check(!noId.ok && noId.error.code === 'INVALID_RECORD', 'proposeFromEvidence without a patternId → INVALID_RECORD');
  }

  /* ── 4. owner isolation + client cannot forge authority ───────────── */
  section('proposeFromEvidence — owner isolation; client authority fields ignored (§11, §21, §27)');
  let aliceLeftPatternId = null;
  let aliceCenterPatternId = null;
  {
    wireAggregator();
    // discover alice's patterns the same way the server does
    const corpus = { documents: [], observations: [] };
    const docsRes = await corpusStore.listByOwner(callableDb, 'alice');
    for (const d of docsRes.data) { corpus.documents.push(d); const o = await corpusStore.listObservations(callableDb, d.documentId); corpus.observations.push(...o.data); }
    const rep = esmAgg.aggregateVisualEvidence({ observations: corpus.observations, documents: corpus.documents }, CFG, { at: AT });
    check(rep.patterns.length === 2, "alice's corpus yields two competing NOR layouts");
    const left = rep.patterns.reduce((a, b) => (a.evidence.documentCount >= b.evidence.documentCount ? a : b));
    aliceLeftPatternId = left.patternId;
    aliceCenterPatternId = rep.patterns.find((p) => p !== left).patternId;

    // bob cannot propose from alice's pattern id — his corpus doesn't contain it
    const bobTry = await intelligenceVisualTemplate.run({ data: { op: 'proposeFromEvidence', patternId: aliceLeftPatternId, config: CFG }, auth: asAdmin('bob') });
    check(!bobTry.ok && bobTry.error.code === 'PATTERN_NOT_FOUND', "bob cannot propose from alice's visual pattern — owner isolation (§27)");

    const r = await intelligenceVisualTemplate.run({
      data: {
        op: 'proposeFromEvidence', patternId: aliceLeftPatternId, config: CFG,
        // hostile injections
        status: 'approved', authorityState: 'authoritative', approvedBy: 'fake-user', approvedAt: 'fake-time',
        createdBy: 'fake', templateVersion: 999, rationale: 'client says approved', templateId: 'vtpl_HIJACKED',
        documents: [{ documentId: 'corpus_INJECTED' }], pattern: { variant: 'client variant', sourceDocumentIds: ['x'] },
      },
      auth: asAdmin('alice'),
    });
    check(r.ok && r.data.status === 'proposed' && r.data.authorityState === 'proposed', 'alice proposeFromEvidence → status=proposed, authorityState=proposed (client status/authorityState ignored — §11)');
    check(r.data.approvedBy === null && r.data.approvedAt === null && r.data.rationale === null, 'client approvedBy / approvedAt / rationale are ignored (§11, §28.I)');
    check(r.data.templateVersion === 1 && r.data.createdBy === 'alice', 'client templateVersion=999 / createdBy are ignored — version=1, createdBy=the verified uid (§11)');
    check(r.data.templateId !== 'vtpl_HIJACKED' && r.data.documentType === 'NOR', 'client templateId / pattern are ignored — the server built the template from ITS OWN aggregation (§27)');
    check(!JSON.stringify(r.data).includes('corpus_INJECTED'), 'the client-supplied corpus was IGNORED');
    check(r.data.sourceDocumentIds.length >= 2 && r.data.sourceObservationIds.length >= 1, 'the template carries server-verified evidence provenance (§13)');
    check(r.data.pageModel.coordinateSpace === 'pdf_points' && r.data.pageModel.width === 595, 'the page model carries an EXPLICIT coordinate space + real geometry (§5)');
  }

  /* ── 5. human approval gate ──────────────────────────────────────── */
  section('approve — human gate: rationale required; server-owned authority metadata (§11, §28.H/I)');
  let aliceLeftTemplateId = null;
  {
    const list = await intelligenceVisualTemplate.run({ data: { op: 'list', status: 'proposed' }, auth: asAdmin('alice') });
    aliceLeftTemplateId = list.data[0].templateId;

    const noRat = await intelligenceVisualTemplate.run({ data: { op: 'approve', templateId: aliceLeftTemplateId, rationale: '   ' }, auth: asAdmin('alice') });
    check(!noRat.ok && noRat.error.code === 'RATIONALE_REQUIRED', 'approve with a whitespace rationale → RATIONALE_REQUIRED (§11)');

    const ok = await intelligenceVisualTemplate.run({
      data: {
        op: 'approve', templateId: aliceLeftTemplateId,
        rationale: 'Disetujui sebagai tata letak NOR PBSI periode berjalan.',
        approvedBy: 'fake-user', approvedAt: '1999-01-01T00:00:00.000Z', authorityState: 'not_authoritative', status: 'proposed',
      },
      auth: asAdmin('alice'),
    });
    check(ok.ok && ok.data.status === 'approved' && ok.data.authorityState === 'authoritative', 'approve → status=approved, authorityState=authoritative');
    check(ok.data.approvedBy === 'alice' && ok.data.approvedAt !== '1999-01-01T00:00:00.000Z', 'approvedBy = the verified uid; approvedAt = the server clock — client values ignored (§11, §28.I)');
    check(ok.data.rationale.startsWith('Disetujui sebagai'), 'the human rationale is stored verbatim');
    check(ok.data.auditTrail.some((e) => e.event === 'VISUAL_TEMPLATE_APPROVED' && e.actorId === 'alice'), 'a VISUAL_TEMPLATE_APPROVED audit entry records the actor');
    const eff = await intelligenceVisualTemplate.run({ data: { op: 'list', status: 'approved' }, auth: asAdmin('alice') });
    check(eff.data.length === 1 && eff.data[0].templateId === aliceLeftTemplateId, 'the approved template is now in the system');
  }

  /* ── 6. conflict fails closed; resolve never picks by frequency ───── */
  section('conflict — a second competing approval FAILS CLOSED; resolve returns `conflict` (§21, §28.F/K)');
  {
    const propC = await intelligenceVisualTemplate.run({ data: { op: 'proposeFromEvidence', patternId: aliceCenterPatternId, config: CFG }, auth: asAdmin('alice') });
    check(propC.ok, 'the competing "logo center" layout is proposed');
    const templC = propC.data.templateId;

    const clash = await intelligenceVisualTemplate.run({ data: { op: 'approve', templateId: templC, rationale: 'juga terlihat' }, auth: asAdmin('alice') });
    check(!clash.ok && clash.error.code === 'CONFLICT_UNRESOLVED', 'approving a SECOND competing layout fails CLOSED — CONFLICT_UNRESOLVED (§21)');

    const ack = await intelligenceVisualTemplate.run({ data: { op: 'approve', templateId: templC, rationale: 'koeksistensi disengaja', acknowledgeConflict: true }, auth: asAdmin('alice') });
    check(ack.ok, '…with acknowledgeConflict the human can deliberately keep both');

    const res = await intelligenceVisualTemplate.run({ data: { op: 'resolve', documentType: 'NOR' }, auth: asAdmin('alice') });
    check(res.ok && res.data.outcome === 'conflict' && res.data.template === null && res.data.competingTemplateIds.length === 2, 'resolve → `conflict`, NO chosen template, both ids exposed (never a frequency pick — §21, §28.F)');
  }

  /* ── 7. supersession — v1 auto-deprecated + immutable + queryable ─── */
  section('supersede — approving a superseding proposal auto-deprecates the predecessor; v1 immutable (§12, §28.J)');
  {
    // carol: a fresh single-layout LEGACY slot (Letter), then an A4 layout to
    // supersede. A distinct (scope, documentType) slot from section 6's NOR
    // conflict — the /intelligence_visual_templates node is organization-wide.
    for (const id of ['ca_1', 'ca_2', 'ca_3']) { const d = await seedDoc('carol', id, '2026-01-01', 'LEGACY'); await seedPage('carol', d, 612, 792); }
    let corpus = { documents: [], observations: [] };
    let dr = await corpusStore.listByOwner(callableDb, 'carol');
    for (const d of dr.data) { corpus.documents.push(d); const o = await corpusStore.listObservations(callableDb, d.documentId); corpus.observations.push(...o.data); }
    const v1PatternId = esmAgg.aggregateVisualEvidence({ observations: corpus.observations, documents: corpus.documents }, CFG, { at: AT }).patterns[0].patternId;

    const v1prop = await intelligenceVisualTemplate.run({ data: { op: 'proposeFromEvidence', patternId: v1PatternId, config: CFG }, auth: asAdmin('carol') });
    const v1 = (await intelligenceVisualTemplate.run({ data: { op: 'approve', templateId: v1prop.data.templateId, rationale: 'tata letak lama (Letter)' }, auth: asAdmin('carol') })).data;

    for (const id of ['ca_4', 'ca_5', 'ca_6']) { const d = await seedDoc('carol', id, '2026-06-01', 'LEGACY'); await seedPage('carol', d, 595, 842); }
    corpus = { documents: [], observations: [] };
    dr = await corpusStore.listByOwner(callableDb, 'carol');
    for (const d of dr.data) { corpus.documents.push(d); const o = await corpusStore.listObservations(callableDb, d.documentId); corpus.observations.push(...o.data); }
    const rep2 = esmAgg.aggregateVisualEvidence({ observations: corpus.observations, documents: corpus.documents }, CFG, { at: AT });
    const v2PatternId = rep2.patterns.find((p) => p.pageModel.width === 595).patternId;

    const v2prop = await intelligenceVisualTemplate.run({ data: { op: 'proposeFromEvidence', patternId: v2PatternId, supersedesTemplateId: v1.templateId, config: CFG }, auth: asAdmin('carol') });
    check(v2prop.ok && v2prop.data.supersedesTemplateId === v1.templateId && v2prop.data.templateVersion === 2, 'the superseding proposal links supersedesTemplateId = v1, version 2 (§12)');
    const v2 = (await intelligenceVisualTemplate.run({ data: { op: 'approve', templateId: v2prop.data.templateId, rationale: 'tata letak A4 berjalan' }, auth: asAdmin('carol') })).data;
    check(v2.status === 'approved' && v2.templateVersion === 2, 'v2 is approved, version 2');

    const v1After = (await intelligenceVisualTemplate.run({ data: { op: 'get', templateId: v1.templateId }, auth: asAdmin('carol') })).data;
    check(v1After.status === 'deprecated' && v1After.supersededByTemplateId === v2.templateId, 'v1 was AUTO-deprecated and links forward to v2 (§12)');
    check(v1After.variant === v1.variant && v1After.rationale === v1.rationale && v1After.approvedBy === v1.approvedBy && v1After.approvedAt === v1.approvedAt, 'v1 content + approval metadata is UNCHANGED (immutable — §12)');
    check(v1After.auditTrail[0].event === 'VISUAL_TEMPLATE_PROPOSED' && v1After.auditTrail.some((e) => e.event === 'VISUAL_TEMPLATE_DEPRECATED'), 'v1 audit trail is append-only + complete');

    const hist = (await intelligenceVisualTemplate.run({ data: { op: 'history', templateId: v2.templateId }, auth: asAdmin('carol') })).data;
    check(hist.length === 2 && hist[0].templateId === v1.templateId && hist[1].templateId === v2.templateId, 'history returns the full chain oldest → newest — v1 still queryable (§12)');
    const resolved = (await intelligenceVisualTemplate.run({ data: { op: 'resolve', documentType: 'LEGACY' }, auth: asAdmin('carol') })).data;
    check(resolved.outcome === 'resolved' && resolved.template.templateId === v2.templateId, 'the resolver resolves the slot to v2 (a supersession chain is NOT a conflict)');
  }

  /* ── 8. reject preserves actor + reason ─────────────────────────── */
  section('reject — actor + reason preserved (§10)');
  {
    for (const id of ['ca_r1', 'ca_r2']) { const d = await seedDoc('dora', id, '2026-01-01', 'MEMORANDUM'); await seedPage('dora', d, 842, 595); }
    const corpus = { documents: [], observations: [] };
    const dr = await corpusStore.listByOwner(callableDb, 'dora');
    for (const d of dr.data) { corpus.documents.push(d); const o = await corpusStore.listObservations(callableDb, d.documentId); corpus.observations.push(...o.data); }
    const patId = esmAgg.aggregateVisualEvidence({ observations: corpus.observations, documents: corpus.documents }, CFG, { at: AT }).patterns[0].patternId;
    const prop = await intelligenceVisualTemplate.run({ data: { op: 'proposeFromEvidence', patternId: patId, config: CFG }, auth: asAdmin('dora') });
    const noReason = await intelligenceVisualTemplate.run({ data: { op: 'reject', templateId: prop.data.templateId, reason: '  ' }, auth: asAdmin('dora') });
    check(!noReason.ok && noReason.error.code === 'REASON_REQUIRED', 'reject without a reason → REASON_REQUIRED (§10)');
    const rej = await intelligenceVisualTemplate.run({ data: { op: 'reject', templateId: prop.data.templateId, reason: 'Orientasi landscape bukan format Memorandum PBSI.' }, auth: asAdmin('dora') });
    check(rej.ok && rej.data.status === 'rejected' && rej.data.rejectedBy === 'dora' && rej.data.auditTrail.some((e) => e.event === 'VISUAL_TEMPLATE_REJECTED' && e.detail.reason.startsWith('Orientasi')), 'reject records actor + reason (§10)');
  }

  /* ── 9. read-only ops write nothing ─────────────────────────────── */
  section('read-only ops — list / get / resolve / history write nothing');
  {
    const before = snapshotDb();
    await intelligenceVisualTemplate.run({ data: { op: 'list' }, auth: asAdmin('alice') });
    await intelligenceVisualTemplate.run({ data: { op: 'get', templateId: aliceLeftTemplateId }, auth: asAdmin('alice') });
    await intelligenceVisualTemplate.run({ data: { op: 'resolve', documentType: 'NOR' }, auth: asAdmin('alice') });
    await intelligenceVisualTemplate.run({ data: { op: 'history', templateId: aliceLeftTemplateId }, auth: asAdmin('alice') });
    check(snapshotDb() === before, 'list / get / resolve / history are byte-identical no-ops');
    const bobGet = await intelligenceVisualTemplate.run({ data: { op: 'get', templateId: aliceLeftTemplateId }, auth: asAdmin('bob') });
    check(bobGet.ok && bobGet.data.templateId === aliceLeftTemplateId, 'the Visual Template System is ORGANIZATION-WIDE — any effective admin reads any template (§23)');
  }

  /* ── 10. static scan ────────────────────────────────────────────── */
  section('static — no secret / model / HTTP / V1 / renderer / knowledge / flag');
  {
    const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    for (const f of ['functions/src/intelligence/visualTemplateContract.js', 'functions/src/intelligence/visualTemplateStore.js', 'functions/src/intelligence/intelligenceVisualTemplate.js']) {
      const blob = stripComments(fs.readFileSync(path.join(ROOT, f), 'utf8'));
      check(!/sk-[A-Za-z0-9]|OPENAI_API_KEY|api\.openai\.com|openai|anthropic|\bfetch\s*\(/i.test(blob), `${f}: no secret / model / outbound-HTTP reference`);
      check(!/require\([^)]*petty|generateNor\s*\(|pettyCashNors|promoteKnowledge|knowledge_repository|require\([^)]*\/knowledge|feature_flags|norRegistryStore|norDraftStore|styleGuideStore|pdfmake|renderPdf/i.test(blob), `${f}: no V1 / Petty Cash / NOR Registry / Style Guide / knowledge / feature-flag / renderer coupling`);
    }
    const cb = stripComments(fs.readFileSync(path.join(ROOT, 'functions/src/intelligence/intelligenceVisualTemplate.js'), 'utf8'));
    check(/canUseIntelligence\(auth\.token\)/.test(cb), 'the callable authorizes with canUseIntelligence (no new permission)');
    check(/const uid = auth\.uid/.test(cb) && !/data\.(actorId|createdBy|approvedBy|approvedAt|authorityState)\b/.test(cb) && !/data\.templateVersion\b/.test(cb), 'the callable derives the actor from auth.uid and NEVER reads a client authority field (§11, §24)');
    check(/gatherOwnerCorpus\(uid\)/.test(cb) && /_visualAggregator !== 'function'/.test(cb) && /VISUAL_ANALYSIS_UNAVAILABLE/.test(cb), 'proposeFromEvidence rebuilds the aggregation by the verified uid and fails safe (§27, §33)');
  }

  /* ── 11. wiring (WIRED — Controlled Deployment Phase A) ──────────── */
  section('functions/index.js — intelligenceVisualTemplate is WIRED (Controlled Deployment Phase A)');
  {
    const idx = fs.readFileSync(path.join(ROOT, 'functions/index.js'), 'utf8');
    check(/require\(['"]\.\/src\/intelligence\/intelligenceVisualTemplate['"]\)/.test(idx) && /exports\.intelligenceVisualTemplate\s*=\s*intelligenceVisualTemplate/.test(idx), 'functions/index.js requires + exports intelligenceVisualTemplate (deploy still NOT run; approve/reject/deprecate stay human-gated and inert behind the undeployed rule block + OFF flag)');
  }

  console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'} — ${fail} failing check(s).`);
  process.exit(fail === 0 ? 0 : 1);
})();
