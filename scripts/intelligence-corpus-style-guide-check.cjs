/* ============================================================
   intelligence-corpus-style-guide-check.cjs — PBSI NOR Style Guide
   (V2, Phase 5.x.5)

   CJS test for the SERVER side
   (functions/src/intelligence/styleGuideContract.js + styleGuideStore.js +
   intelligenceStyleGuide.js). No emulator — the Admin SDK RTDB surface is
   a faithful in-memory fake.

   Proves:
     1  CJS ⇄ ESM contract drift — schemas, enums, graphs, field lists;
        makeStyleRule / makeStyleGuideProposalFromMemory / markApproved /
        resolveEffectiveRule produce IDENTICAL output on both sides
     2  the intelligenceStyleGuide callable (.run) — auth / authz / op
        matrix; unauth → unauthenticated; non-admin → permission-denied;
        unknown op → invalid-argument
     3  proposeFromMemory FAILS SAFE with no Writing Memory builder wired
        → WRITING_MEMORY_UNAVAILABLE, nothing written (§28)
     4  OWNER ISOLATION — the server rebuilds Writing Memory from the
        CALLER'S OWN corpus only; a client-supplied corpus / entry /
        authorityState / version is ignored (§9, §22, §26)
     5  HUMAN GATE — approve without a rationale → RATIONALE_REQUIRED;
        approvedBy / approvedAt are the server actor + timestamp, never a
        client value (Fixture C); reject / deprecate preserve actor + reason
     6  CONFLICT — a second competing approval fails CLOSED
        (CONFLICT_UNRESOLVED); resolve returns `conflict`, never a
        frequency pick (Fixture D)
     7  SUPERSESSION — approving a superseding proposal auto-deprecates the
        predecessor; v1 stays immutable + queryable (Fixture E)
     8  READ-ONLY ops (list / get / resolve / history) write nothing
     9  static scan — no secret / model / HTTP / V1 / Petty Cash /
        knowledge-write / feature-flag coupling in the 3 server files
    10  functions/index.js does NOT reference intelligenceStyleGuide
        (STAGED — §28, §30)

   Run:  node scripts/intelligence-corpus-style-guide-check.cjs   (exit 0 = pass)
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

const cjs = require('../functions/src/intelligence/styleGuideContract');
const corpusStore = require('../functions/src/intelligence/corpusStore');
const callableDb = makeFakeDb();
require.cache[require.resolve('../functions/src/config/admin')] = { id: 'admin-shim', loaded: true, exports: { admin: {}, auth: {}, db: callableDb } };
const { intelligenceStyleGuide, __setWritingMemoryBuilderForTest } = require('../functions/src/intelligence/intelligenceStyleGuide');

(async () => {
  const AT = '2026-09-04T00:00:00.000Z';
  const asAdmin = (uid) => ({ uid, token: { role: 'admin' } });
  const snapshotDb = () => JSON.stringify(callableDb._root);
  const styleGuideOnly = () => JSON.stringify(callableDb._root.intelligence_style_guide || null);

  /* seed a corpus document + one observation for `owner` */
  async function seed(owner, id, sourceDate, value, documentType, category, key) {
    const ing = await corpusStore.ingestDocument(callableDb, { seed: { checksum: id.padEnd(64, '0'), title: `doc ${id}`, sourceDate }, ownerId: owner, now: AT });
    const docId = ing.data.document.documentId;
    await corpusStore.setClassification(callableDb, docId, { patch: { sourceDate, documentType: documentType || 'NOR' }, actorId: owner, at: AT });
    const rec = await corpusStore.recordObservation(callableDb, {
      seed: {
        documentId: docId, category: category || 'recipient_convention', key: key || 'recipient_label', observedValue: value, modality: 'text',
        provenance: [{ sourceDocumentId: docId, sourceFileId: null, pageNumber: null, region: null, extractionMethod: 'structure_parse', extractedAt: AT, confidence: 0.85 }],
        confidence: 0.85,
      },
      ownerId: owner, now: AT,
    });
    if (!rec.ok) throw new Error('seed obs failed: ' + JSON.stringify(rec.error));
    return docId;
  }

  // alice: "Yth." x3 (current)  +  "Kepada Yth." x3 (current, a competing value)
  await seed('alice', 'al_a1', '2026-01-01', 'Yth.', 'NOR', 'recipient_convention', 'recipient_label');
  await seed('alice', 'al_a2', '2026-02-01', 'Yth.', 'NOR', 'recipient_convention', 'recipient_label');
  await seed('alice', 'al_a3', '2026-03-01', 'Yth.', 'NOR', 'recipient_convention', 'recipient_label');
  await seed('alice', 'al_b1', '2026-01-15', 'Kepada Yth.', 'NOR', 'recipient_convention', 'recipient_label');
  await seed('alice', 'al_b2', '2026-02-15', 'Kepada Yth.', 'NOR', 'recipient_convention', 'recipient_label');
  await seed('alice', 'al_b3', '2026-03-15', 'Kepada Yth.', 'NOR', 'recipient_convention', 'recipient_label');
  // bob: his own separate corpus
  await seed('bob', 'bo_1', '2026-05-01', 'Bob phrase', 'MEMORANDUM', 'opening_pattern', 'opening_salutation');

  const CFG = { temporal: { historicalCutoff: '2025-01-01', currentWindowStart: '2026-01-01', minCurrentDocuments: 2, conflictMinorityRatio: 0.34 }, candidateMinDocuments: 2 };
  const esmMem = await import('../src/intelligence/corpus/writing-memory/writing-memory-builder.js');
  const esmSg = await import('../src/intelligence/corpus/style-guide/contracts/style-guide-contract.js');
  const esmProp = await import('../src/intelligence/corpus/style-guide/style-guide-proposal.js');
  const esmAuth = await import('../src/intelligence/corpus/style-guide/style-guide-authority.js');
  const esmQuery = await import('../src/intelligence/corpus/style-guide/style-guide-query.js');
  const wireBuilder = () => __setWritingMemoryBuilderForTest((input, config, opts) => esmMem.buildWritingMemory(input, config, opts));

  /* ── 1. CJS ⇄ ESM drift parity ─────────────────────────────────────── */
  section('CJS ⇄ ESM contract parity');
  {
    check(cjs.STYLE_GUIDE_SCHEMA === esmSg.STYLE_GUIDE_SCHEMA && cjs.STYLE_RULE_SCHEMA === esmSg.STYLE_RULE_SCHEMA, 'schemas match');
    check(JSON.stringify(cjs.STYLE_RULE_STATUS) === JSON.stringify(esmSg.STYLE_RULE_STATUS), 'STYLE_RULE_STATUS matches');
    check(JSON.stringify(cjs.STYLE_RULE_STATUS_GRAPH) === JSON.stringify(esmSg.STYLE_RULE_STATUS_GRAPH), 'STYLE_RULE_STATUS_GRAPH matches');
    check(JSON.stringify(cjs.STYLE_AUTHORITY_STATE) === JSON.stringify(esmSg.STYLE_AUTHORITY_STATE), 'STYLE_AUTHORITY_STATE matches');
    check(JSON.stringify(cjs.STYLE_RULE_CATEGORIES) === JSON.stringify(esmSg.STYLE_RULE_CATEGORIES), 'STYLE_RULE_CATEGORIES matches (= Writing Memory language vocab)');
    check(JSON.stringify(cjs.STYLE_GUIDE_AUDIT_EVENTS) === JSON.stringify(esmSg.STYLE_GUIDE_AUDIT_EVENTS), 'STYLE_GUIDE_AUDIT_EVENTS matches');
    check(JSON.stringify(cjs.STYLE_RULE_FIELDS) === JSON.stringify(esmSg.STYLE_RULE_FIELDS), 'STYLE_RULE_FIELDS matches');
    check(cjs.styleRuleIdFrom('organization', 'recipient_convention', 'recipient_label', 'NOR', 'Yth.')
      === esmSg.styleRuleIdFrom('organization', 'recipient_convention', 'recipient_label', 'NOR', 'Yth.'), 'styleRuleIdFrom is identical');

    const mem = {
      memoryId: 'mem_x', category: 'recipient_convention', key: 'recipient_label', value: 'Yth.', normalizedValue: 'yth.',
      documentType: 'NOR', temporalStatus: 'current_evidence', conventionEra: 'current',
      evidence: { occurrenceCount: 6, documentCount: 3, documentTypeDistribution: { NOR: 3 }, oldestSourceDate: '2026-01-01', latestSourceDate: '2026-03-01', recentDocumentCount: 3, historicalDocumentCount: 0, conflictingDocumentCount: 0, approvedRulePresent: false, approvedRuleMatches: false },
      confidence: 0.9, sourceObservationIds: ['o1', 'o2'], sourceDocumentIds: ['d1', 'd2'],
    };
    const cP = cjs.makeStyleGuideProposalFromMemory(mem, { at: AT, actorId: 'evan' });
    const eP = esmProp.makeStyleGuideProposalFromMemory(mem, { at: AT, actorId: 'evan' });
    check(JSON.stringify(cP) === JSON.stringify(eP), 'makeStyleGuideProposalFromMemory → byte-identical CJS vs ESM');
    const cA = cjs.markApproved(cP, { actorId: 'evan', rationale: 'ok', at: AT });
    const eA = esmAuth.markApproved(eP, { actorId: 'evan', rationale: 'ok', at: AT });
    check(JSON.stringify(cA) === JSON.stringify(eA), 'markApproved → byte-identical CJS vs ESM');
    const two = [cA.next, cjs.makeStyleRule({ ...cP, ruleId: cP.ruleId + '_b', value: 'Kepada Yth.', normalizedValue: 'kepada yth.', status: 'approved', rationale: 'b', approvedBy: 'x', approvedAt: AT })];
    check(JSON.stringify(cjs.resolveEffectiveRule(two, { category: 'recipient_convention', key: 'recipient_label', documentType: 'NOR' }))
      === JSON.stringify(esmQuery.resolveEffectiveRule(two, { category: 'recipient_convention', key: 'recipient_label', documentType: 'NOR' })),
      'resolveEffectiveRule → byte-identical CJS vs ESM (conflict outcome)');
  }

  /* ── 2. auth / authz / op ──────────────────────────────────────────── */
  section('auth / authz / op');
  {
    let t;
    t = null; try { await intelligenceStyleGuide.run({ data: { op: 'list' } }); } catch (e) { t = e; }
    check(t && t.code === 'unauthenticated', 'no auth → unauthenticated');
    t = null; try { await intelligenceStyleGuide.run({ data: { op: 'list' }, auth: { uid: 'x', token: { role: 'driver' } } }); } catch (e) { t = e; }
    check(t && t.code === 'permission-denied', 'non-admin → permission-denied');
    t = null; try { await intelligenceStyleGuide.run({ data: { op: 'bogus' }, auth: asAdmin('a') }); } catch (e) { t = e; }
    check(t && t.code === 'invalid-argument', 'unknown op → invalid-argument');
    const empty = await intelligenceStyleGuide.run({ data: { op: 'list' }, auth: asAdmin('alice') });
    check(empty.ok && Array.isArray(empty.data) && empty.data.length === 0, 'list on an empty guide → ok, []');
  }

  /* ── 3. proposeFromMemory fails safe ──────────────────────────────── */
  section('proposeFromMemory — FAILS SAFE with no builder wired, mutates nothing (§28)');
  {
    __setWritingMemoryBuilderForTest(null);
    const before = snapshotDb();
    const r = await intelligenceStyleGuide.run({ data: { op: 'proposeFromMemory', memoryId: 'mem_anything', config: CFG }, auth: asAdmin('alice') });
    check(!r.ok && r.error.code === 'WRITING_MEMORY_UNAVAILABLE', 'no builder → WRITING_MEMORY_UNAVAILABLE (envelope, no throw)');
    check(snapshotDb() === before, 'the database is byte-identical afterwards — nothing was written');
    const noId = await intelligenceStyleGuide.run({ data: { op: 'proposeFromMemory' }, auth: asAdmin('alice') });
    check(!noId.ok && noId.error.code === 'INVALID_RECORD', 'proposeFromMemory without a memoryId → INVALID_RECORD');
  }

  /* ── 4. owner isolation + client cannot forge authority ───────────── */
  section('proposeFromMemory — owner isolation; client authority fields ignored (§9, §22, §26)');
  let aliceYthMemoryId = null;
  let aliceKepadaMemoryId = null;
  {
    wireBuilder();
    // discover alice's Writing Memory entry ids by building it the same way the server does
    const corpus = { documents: [], observations: [] };
    const docsRes = await corpusStore.listByOwner(callableDb, 'alice');
    for (const d of docsRes.data) { corpus.documents.push(d); const o = await corpusStore.listObservations(callableDb, d.documentId); corpus.observations.push(...o.data); }
    const report = esmMem.buildWritingMemory({ ...corpus, approvedRules: [] }, CFG, { at: AT });
    aliceYthMemoryId = report.entries.find((e) => e.value === 'Yth.' && e.documentType === 'NOR').memoryId;
    aliceKepadaMemoryId = report.entries.find((e) => e.value === 'Kepada Yth.' && e.documentType === 'NOR').memoryId;

    // bob cannot propose from alice's memory id — his corpus doesn't contain it
    const bobTry = await intelligenceStyleGuide.run({ data: { op: 'proposeFromMemory', memoryId: aliceYthMemoryId, config: CFG }, auth: asAdmin('bob') });
    check(!bobTry.ok && bobTry.error.code === 'MEMORY_NOT_FOUND', "bob cannot propose from alice's Writing Memory entry — owner isolation (§26)");

    // alice proposes, with hostile client authority fields that must be ignored
    const r = await intelligenceStyleGuide.run({
      data: {
        op: 'proposeFromMemory', memoryId: aliceYthMemoryId, config: CFG,
        // hostile injections
        status: 'approved', authorityState: 'authoritative', approvedBy: 'fake-user', approvedAt: 'fake-time',
        createdBy: 'fake', version: 999, rationale: 'client says approved', ruleId: 'sgr_HIJACKED',
        documents: [{ documentId: 'corpus_INJECTED' }], memory: { value: 'client value', sourceMemoryIds: ['x'] },
      },
      auth: asAdmin('alice'),
    });
    check(r.ok && r.data.status === 'proposed' && r.data.authorityState === 'proposed', 'alice proposeFromMemory → status=proposed, authorityState=proposed (client status/authorityState ignored — §9)');
    check(r.data.approvedBy === null && r.data.approvedAt === null && r.data.rationale === null, 'client approvedBy / approvedAt / rationale are ignored (§9, §24.C)');
    check(r.data.version === 1 && r.data.createdBy === 'alice', 'client version=999 / createdBy are ignored — version=1, createdBy=the verified uid (§9)');
    check(r.data.ruleId !== 'sgr_HIJACKED' && r.data.value === 'Yth.', 'client ruleId / memory value are ignored — the server built the rule from ITS OWN Writing Memory rebuild (§26)');
    check(!JSON.stringify(r.data).includes('corpus_INJECTED'), 'the client-supplied corpus was IGNORED');
    check(r.data.sourceMemoryIds.length === 1 && r.data.sourceObservationIds.length >= 1, 'the rule carries server-verified evidence provenance (§11)');
  }

  /* ── 5. human approval gate ──────────────────────────────────────── */
  section('approve — human gate: rationale required; server-owned authority metadata (§9, §10, §24.B/C)');
  let aliceYthRuleId = null;
  {
    const list = await intelligenceStyleGuide.run({ data: { op: 'list', status: 'proposed' }, auth: asAdmin('alice') });
    aliceYthRuleId = list.data[0].ruleId;

    const noRat = await intelligenceStyleGuide.run({ data: { op: 'approve', ruleId: aliceYthRuleId, rationale: '   ' }, auth: asAdmin('alice') });
    check(!noRat.ok && noRat.error.code === 'RATIONALE_REQUIRED', 'approve with a whitespace rationale → RATIONALE_REQUIRED (§10)');

    const ok = await intelligenceStyleGuide.run({
      data: {
        op: 'approve', ruleId: aliceYthRuleId,
        rationale: 'Disetujui karena digunakan secara konsisten pada NOR periode berjalan.',
        // hostile
        approvedBy: 'fake-user', approvedAt: '1999-01-01T00:00:00.000Z', authorityState: 'not_authoritative', status: 'proposed',
      },
      auth: asAdmin('alice'),
    });
    check(ok.ok && ok.data.status === 'approved' && ok.data.authorityState === 'authoritative', 'approve → status=approved, authorityState=authoritative');
    check(ok.data.approvedBy === 'alice' && ok.data.approvedAt !== '1999-01-01T00:00:00.000Z', 'approvedBy = the verified uid; approvedAt = the server clock — client values ignored (§9, §24.C)');
    check(ok.data.rationale.startsWith('Disetujui karena'), 'the human rationale is stored verbatim');
    check(ok.data.auditTrail.some((e) => e.event === 'STYLE_RULE_APPROVED' && e.actorId === 'alice'), 'an STYLE_RULE_APPROVED audit entry records the actor');

    const eff = await intelligenceStyleGuide.run({ data: { op: 'list', status: 'approved' }, auth: asAdmin('alice') });
    check(eff.data.length === 1 && eff.data[0].ruleId === aliceYthRuleId, 'the approved rule is now in the guide');
  }

  /* ── 6. conflict fails closed; resolve never picks by frequency ───── */
  section('conflict — a second competing approval FAILS CLOSED; resolve returns `conflict` (§14, §21, §24.D)');
  {
    const before = styleGuideOnly();
    const propB = await intelligenceStyleGuide.run({ data: { op: 'proposeFromMemory', memoryId: aliceKepadaMemoryId, config: CFG }, auth: asAdmin('alice') });
    check(propB.ok && propB.data.value === 'Kepada Yth.', 'the competing value "Kepada Yth." is proposed');
    const ruleB = propB.data.ruleId;

    const clash = await intelligenceStyleGuide.run({ data: { op: 'approve', ruleId: ruleB, rationale: 'juga terlihat' }, auth: asAdmin('alice') });
    check(!clash.ok && clash.error.code === 'CONFLICT_UNRESOLVED', 'approving a SECOND competing value fails CLOSED — CONFLICT_UNRESOLVED (§14, §21)');

    const ack = await intelligenceStyleGuide.run({ data: { op: 'approve', ruleId: ruleB, rationale: 'koeksistensi disengaja', acknowledgeConflict: true }, auth: asAdmin('alice') });
    check(ack.ok, '…with acknowledgeConflict the human can deliberately keep both');

    const res = await intelligenceStyleGuide.run({ data: { op: 'resolve', category: 'recipient_convention', key: 'recipient_label', documentType: 'NOR' }, auth: asAdmin('alice') });
    check(res.ok && res.data.outcome === 'conflict' && res.data.rule === null && res.data.competingRuleIds.length === 2, 'resolve → `conflict`, NO chosen rule, both ids exposed (never a frequency pick — §21, §22, §24.D)');
    void before;
  }

  /* ── 7. supersession — v1 auto-deprecated + immutable + queryable ─── */
  section('supersede — approving a superseding proposal auto-deprecates the predecessor; v1 immutable (§15, §24.E)');
  {
    // seed a fresh single-value slot to supersede cleanly
    await seed('carol', 'ca_1', '2026-01-01', 'Hormat kami', 'NOR', 'closing_pattern', 'closing');
    await seed('carol', 'ca_2', '2026-02-01', 'Hormat kami', 'NOR', 'closing_pattern', 'closing');
    await seed('carol', 'ca_3', '2026-03-01', 'Hormat kami', 'NOR', 'closing_pattern', 'closing');
    const corpus = { documents: [], observations: [] };
    const dr = await corpusStore.listByOwner(callableDb, 'carol');
    for (const d of dr.data) { corpus.documents.push(d); const o = await corpusStore.listObservations(callableDb, d.documentId); corpus.observations.push(...o.data); }
    const v1MemId = esmMem.buildWritingMemory({ ...corpus, approvedRules: [] }, CFG, { at: AT }).entries.find((e) => e.value === 'Hormat kami').memoryId;

    const v1prop = await intelligenceStyleGuide.run({ data: { op: 'proposeFromMemory', memoryId: v1MemId, config: CFG }, auth: asAdmin('carol') });
    const v1 = (await intelligenceStyleGuide.run({ data: { op: 'approve', ruleId: v1prop.data.ruleId, rationale: 'bentuk lama' }, auth: asAdmin('carol') })).data;
    const v1Snapshot = JSON.stringify(v1);

    // a new value for the SAME slot
    await seed('carol', 'ca_4', '2026-04-01', 'Demikian kami sampaikan', 'NOR', 'closing_pattern', 'closing');
    await seed('carol', 'ca_5', '2026-05-01', 'Demikian kami sampaikan', 'NOR', 'closing_pattern', 'closing');
    await seed('carol', 'ca_6', '2026-06-01', 'Demikian kami sampaikan', 'NOR', 'closing_pattern', 'closing');
    const corpus2 = { documents: [], observations: [] };
    const dr2 = await corpusStore.listByOwner(callableDb, 'carol');
    for (const d of dr2.data) { corpus2.documents.push(d); const o = await corpusStore.listObservations(callableDb, d.documentId); corpus2.observations.push(...o.data); }
    const v2MemId = esmMem.buildWritingMemory({ ...corpus2, approvedRules: [] }, CFG, { at: AT }).entries.find((e) => e.value === 'Demikian kami sampaikan').memoryId;

    const v2prop = await intelligenceStyleGuide.run({ data: { op: 'proposeFromMemory', memoryId: v2MemId, supersedesRuleId: v1.ruleId, config: CFG }, auth: asAdmin('carol') });
    check(v2prop.ok && v2prop.data.supersedesRuleId === v1.ruleId && v2prop.data.version === 2, 'the superseding proposal links supersedesRuleId = v1.ruleId, version 2 (§15)');
    const v2 = (await intelligenceStyleGuide.run({ data: { op: 'approve', ruleId: v2prop.data.ruleId, rationale: 'bentuk berjalan' }, auth: asAdmin('carol') })).data;
    check(v2.status === 'approved' && v2.version === 2, 'v2 is approved, version 2');

    const v1After = (await intelligenceStyleGuide.run({ data: { op: 'get', ruleId: v1.ruleId }, auth: asAdmin('carol') })).data;
    check(v1After.status === 'deprecated' && v1After.supersededByRuleId === v2.ruleId, 'v1 was AUTO-deprecated and links forward to v2 (§15)');
    check(v1After.value === v1.value && v1After.rationale === v1.rationale && v1After.approvedBy === v1.approvedBy && v1After.approvedAt === v1.approvedAt, 'v1 content + approval metadata is UNCHANGED (immutable — §15)');
    check(v1After.auditTrail.some((e) => e.event === 'STYLE_RULE_DEPRECATED') && v1After.auditTrail[0].event === 'STYLE_RULE_PROPOSED', 'v1 audit trail is append-only + complete');

    const hist = (await intelligenceStyleGuide.run({ data: { op: 'history', ruleId: v2.ruleId }, auth: asAdmin('carol') })).data;
    check(hist.length === 2 && hist[0].ruleId === v1.ruleId && hist[1].ruleId === v2.ruleId, 'history returns the full chain oldest → newest — v1 still queryable (§15)');

    const resolved = (await intelligenceStyleGuide.run({ data: { op: 'resolve', category: 'closing_pattern', key: 'closing', documentType: 'NOR' }, auth: asAdmin('carol') })).data;
    check(resolved.outcome === 'resolved' && resolved.rule.ruleId === v2.ruleId, 'the resolver cleanly resolves the slot to v2 (a supersession chain is NOT a conflict)');
    void v1Snapshot;
  }

  /* ── 8. reject / deprecate preserve actor + reason ───────────────── */
  section('reject / deprecate — actor + reason preserved (§10)');
  {
    // carol proposes a throwaway value then rejects it
    await seed('carol', 'ca_r1', '2026-01-01', 'Kepada Bapak/Ibu', 'NOR', 'recipient_convention', 'recipient_label');
    await seed('carol', 'ca_r2', '2026-02-01', 'Kepada Bapak/Ibu', 'NOR', 'recipient_convention', 'recipient_label');
    const corpus = { documents: [], observations: [] };
    const dr = await corpusStore.listByOwner(callableDb, 'carol');
    for (const d of dr.data) { corpus.documents.push(d); const o = await corpusStore.listObservations(callableDb, d.documentId); corpus.observations.push(...o.data); }
    const memId = esmMem.buildWritingMemory({ ...corpus, approvedRules: [] }, CFG, { at: AT }).entries.find((e) => e.value === 'Kepada Bapak/Ibu').memoryId;
    const prop = await intelligenceStyleGuide.run({ data: { op: 'proposeFromMemory', memoryId: memId, config: CFG }, auth: asAdmin('carol') });
    const noReason = await intelligenceStyleGuide.run({ data: { op: 'reject', ruleId: prop.data.ruleId, reason: '  ' }, auth: asAdmin('carol') });
    check(!noReason.ok && noReason.error.code === 'REASON_REQUIRED', 'reject without a reason → REASON_REQUIRED (§10)');
    const rej = await intelligenceStyleGuide.run({ data: { op: 'reject', ruleId: prop.data.ruleId, reason: 'Bukan bentuk PBSI.' }, auth: asAdmin('carol') });
    check(rej.ok && rej.data.status === 'rejected' && rej.data.rejectedBy === 'carol' && rej.data.auditTrail.some((e) => e.event === 'STYLE_RULE_REJECTED' && e.detail.reason === 'Bukan bentuk PBSI.'), 'reject records actor + reason (§10)');
  }

  /* ── 9. read-only ops write nothing ─────────────────────────────── */
  section('read-only ops — list / get / resolve / history write nothing');
  {
    const before = snapshotDb();
    await intelligenceStyleGuide.run({ data: { op: 'list' }, auth: asAdmin('alice') });
    await intelligenceStyleGuide.run({ data: { op: 'get', ruleId: aliceYthRuleId }, auth: asAdmin('alice') });
    await intelligenceStyleGuide.run({ data: { op: 'resolve', category: 'recipient_convention', key: 'recipient_label', documentType: 'NOR' }, auth: asAdmin('alice') });
    await intelligenceStyleGuide.run({ data: { op: 'history', ruleId: aliceYthRuleId }, auth: asAdmin('alice') });
    check(snapshotDb() === before, 'list / get / resolve / history are byte-identical no-ops');
    // cross-owner GET of an org-wide rule is allowed (the Style Guide is organization-wide — §16)
    const bobGet = await intelligenceStyleGuide.run({ data: { op: 'get', ruleId: aliceYthRuleId }, auth: asAdmin('bob') });
    check(bobGet.ok && bobGet.data.ruleId === aliceYthRuleId, 'the Style Guide is ORGANIZATION-WIDE — any effective admin reads any rule (§16)');
  }

  /* ── 10. static scan ────────────────────────────────────────────── */
  section('static — no secret / model / HTTP / V1 / Petty Cash / knowledge-write / flag');
  {
    const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    for (const f of ['functions/src/intelligence/styleGuideContract.js', 'functions/src/intelligence/styleGuideStore.js', 'functions/src/intelligence/intelligenceStyleGuide.js']) {
      const blob = stripComments(fs.readFileSync(path.join(ROOT, f), 'utf8'));
      check(!/sk-[A-Za-z0-9]|OPENAI_API_KEY|api\.openai\.com|openai|anthropic|\bfetch\s*\(/i.test(blob), `${f}: no secret / model / outbound-HTTP reference`);
      check(!/require\([^)]*petty|generateNor\s*\(|pettyCashNors|promoteKnowledge|knowledge_repository|require\([^)]*\/knowledge|feature_flags|norRegistryStore|norDraftStore/i.test(blob), `${f}: no V1 / Petty Cash / NOR Registry / knowledge / feature-flag coupling`);
    }
    const cb = stripComments(fs.readFileSync(path.join(ROOT, 'functions/src/intelligence/intelligenceStyleGuide.js'), 'utf8'));
    check(/canUseIntelligence\(auth\.token\)/.test(cb), 'the callable authorizes with canUseIntelligence (no new permission)');
    check(/const uid = auth\.uid/.test(cb) && !/data\.(actorId|createdBy|approvedBy|approvedAt|authorityState)\b/.test(cb) && !/data\.version\b/.test(cb), 'the callable derives the actor from auth.uid and NEVER reads a client authority field — createdBy/approvedBy/approvedAt/authorityState/version (§9, §18)');
    check(/gatherOwnerCorpus\(uid\)/.test(cb) && /_writingMemoryBuilder !== 'function'/.test(cb) && /WRITING_MEMORY_UNAVAILABLE/.test(cb), 'proposeFromMemory rebuilds Writing Memory by the verified uid and fails safe (§26, §28)');
  }

  /* ── 11. staging ────────────────────────────────────────────────── */
  section('functions/index.js — intelligenceStyleGuide STAGED (§28, §30)');
  {
    const idx = fs.readFileSync(path.join(ROOT, 'functions/index.js'), 'utf8');
    check(!/intelligenceStyleGuide/.test(idx), 'functions/index.js does NOT reference intelligenceStyleGuide');
  }

  console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'} — ${fail} failing check(s).`);
  process.exit(fail === 0 ? 0 : 1);
})();
