/* ============================================================
   intelligence-nor-registry-check.cjs — Sarpras Intelligence (V2, Phase 5)

   CJS test for the SERVER-OWNED canonical NOR Registry & human publication
   (functions/src/intelligence/norRegistryContract.js + norRegistryStore.js +
   norNumberingCounter.js + intelligenceNorRegistry.js). No emulator — the
   Admin SDK RTDB surface is a faithful in-memory fake (drops empty objects,
   orderByChild/equalTo, AND a real .transaction()).

   Proves (PART L items 1–17, server side):
     1  create registry record            — registerFromDraft (get-or-create)
     2  get registry record               — getRecord
     3  list owner records                — listByOwner
     4  cross-owner read denied           — FORBIDDEN envelope
     5  cross-owner mutation denied       — sync/approve/publish → FORBIDDEN
     6  edit creates version              — syncFromDraft → v2 immutable version
     7  stale version rejected            — VERSION_CONFLICT
     8  approve requires in_review        — ILLEGAL_TRANSITION otherwise
     9  approve is human-gated            — only via an explicit approve op
     10 publish requires approved         — ILLEGAL_TRANSITION from in_review/draft
     11 publish reserves number           — atomic sequence, numberSource=reserved
     12 duplicate number impossible       — per-key idempotent allocator
     13 publication retry is idempotent   — second publish → same record, NO 2nd number
     14 published version immutable        — sync/approve/publish rejected after publish
     15 audit trail append-only            — auditHistory only grows, in order
     16 no browser write path              — rules: .write:false + counter has no rule
     17 no client-side secret              — static scan of the Phase 5 server files
     + CJS ⇄ ESM contract drift, functions/index.js wiring, callable auth matrix

   Run:  node scripts/intelligence-nor-registry-check.cjs   (exit 0 = pass)
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

/* ── faithful in-memory fake of the Admin SDK RTDB surface (with .transaction) ── */
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
      async transaction(updater) {
        const cur = getAt(p);
        const next = updater(cur === undefined ? null : cur);
        const committed = next !== undefined;
        if (committed) setAt(p, drop(next) === undefined ? null : drop(next));
        return { committed, snapshot: snap(getAt(p)) };
      },
      orderByChild(ck) { return { equalTo(val) { return { async once() {
        const all = getAt(p) || {}; const out = {};
        for (const [k, row] of Object.entries(all)) if (row && row[ck] === val) out[k] = row;
        return snap(Object.keys(out).length ? out : null);
      } }; } }; },
    };
  }
  return { ref, _root: root };
}

const cjs = require('../functions/src/intelligence/norRegistryContract');
const regStore = require('../functions/src/intelligence/norRegistryStore');
const draftStore = require('../functions/src/intelligence/norDraftStore');
const counter = require('../functions/src/intelligence/norNumberingCounter');

// install a fake db BEFORE requiring the callable
const callableDb = makeFakeDb();
require.cache[require.resolve('../functions/src/config/admin')] = {
  id: 'admin-shim', loaded: true, exports: { admin: {}, auth: {}, db: callableDb },
};
const { intelligenceNorRegistry } = require('../functions/src/intelligence/intelligenceNorRegistry');

(async () => {
  const esmRec = await import('../src/intelligence/nor-registry/contracts/nor-record-contract.js');
  const esmRegC = await import('../src/intelligence/nor-registry/contracts/registry-contract.js');
  const esmHelp = await import('../src/intelligence/nor-registry/nor-registry-record.js');
  const esmDraft = await import('../src/intelligence/nor-draft/contracts/nor-draft-record-contract.js');
  const { makeNorDraftRecord } = esmDraft;

  /* a contract-valid Phase 4 draft owned by `owner`, at `intelligence_nor_drafts/<id>` */
  const draftFixture = (over = {}) => makeNorDraftRecord({
    draftId: over.draftId || 'draft_conv_A',
    conversationId: over.conversationId || 'conv_A',
    ownerId: over.ownerId || 'owner',
    jenis: 'Pengadaan',
    subject: over.subject || 'Pengadaan mesin potong rumput (2)',
    recipient: 'Bendahara',
    recipientStatus: 'known',
    date: '2026-09-02',
    facts: over.facts || { item: 'mesin potong rumput', quantity: 2, unit: 'unit', purpose: 'perawatan lapangan PBSI', budget: 'Rp8.000.000' },
    body: over.body || 'Dengan hormat, bersama ini diajukan pengadaan mesin potong rumput.',
    numbering: { suggestedNumber: '015/NOR/IX/2026', source: 'system_suggested', basis: 'next after 014', confidence: 0.8 },
    now: '2026-09-02T00:00:00.000Z',
  });
  const seedDraft = async (db, over = {}) => {
    const rec = draftFixture(over);
    const r = await draftStore.createDraft(db, {
      ...rec, ownerId: over.ownerId || 'owner', updatedAt: rec.updatedAt || rec.createdAt,
      auditTrail: [{ type: 'AI_DRAFT_CREATED', at: rec.createdAt, actorId: over.ownerId || 'owner', changedFields: [] }],
    });
    if (!r.ok) throw new Error('seedDraft failed: ' + JSON.stringify(r.error));
    return r.data;
  };

  /* ── 1. CJS ⇄ ESM contract drift ─────────────────────────────────────── */
  section('CJS ⇄ ESM NOR-Registry contract drift');
  check(cjs.NOR_RECORD_SCHEMA === esmRec.NOR_RECORD_SCHEMA && cjs.NOR_RECORD_SCHEMA === 'nor-record@1', 'NOR_RECORD_SCHEMA matches');
  check(JSON.stringify(cjs.NOR_STATUS) === JSON.stringify(esmRec.NOR_STATUS), 'NOR_STATUS matches');
  check(JSON.stringify(cjs.NOR_STATUS_GRAPH) === JSON.stringify(esmRec.NOR_STATUS_GRAPH), 'NOR_STATUS_GRAPH matches (draft→in_review→approved→published→superseded)');
  check(JSON.stringify(cjs.NOR_HUMAN_GATED_STATES) === JSON.stringify(esmRec.NOR_HUMAN_GATED_STATES), 'NOR_HUMAN_GATED_STATES matches ([approved, published])');
  check(JSON.stringify(cjs.NUMBER_SOURCE) === JSON.stringify(esmRec.NUMBER_SOURCE), 'NUMBER_SOURCE matches');
  check(JSON.stringify(cjs.NOR_RECORD_FIELDS) === JSON.stringify(esmRec.NOR_RECORD_FIELDS), 'NOR_RECORD_FIELDS list matches');
  check(JSON.stringify(cjs.REGISTRY_AUDIT_EVENTS) === JSON.stringify(esmHelp.REGISTRY_AUDIT_EVENTS), 'REGISTRY_AUDIT_EVENTS matches');
  check(JSON.stringify(cjs.REGISTRY_CHANGE_TYPE) === JSON.stringify(esmHelp.REGISTRY_CHANGE_TYPE), 'REGISTRY_CHANGE_TYPE matches');
  for (const code of ['NO_BACKEND_CONFIGURED', 'NOT_FOUND', 'FORBIDDEN', 'INVALID_RECORD', 'ILLEGAL_TRANSITION', 'VERSION_CONFLICT', 'ALREADY_PUBLISHED', 'NUMBER_RESERVATION_FAILED', 'NOT_IMPLEMENTED']) {
    check(cjs.NOR_REGISTRY_ERRORS[code] === code && esmRegC.NOR_REGISTRY_ERRORS[code] === code, `NOR_REGISTRY_ERRORS.${code} present in both`);
  }
  check(esmRegC.NOR_REGISTRY_CONTRACT.methods.join(',') === 'register,getById,list,appendVersion,approve,publish,getHistory', 'ESM backend contract now includes approve');
  // behavioural parity — build from the same draft on both sides
  const pd = draftFixture();
  const cjsRec = cjs.makeNorRecordFromDraft(pd, { ownerId: 'owner', now: '2026-09-02T00:00:00.000Z' });
  const esmRecord = esmHelp.makeNorRecordFromDraft(pd, { ownerId: 'owner', now: '2026-09-02T00:00:00.000Z' });
  check(cjs.isNorRecord(cjsRec) === true && esmRec.isNorRecord(esmRecord) === true, 'isNorRecord: both accept the built record');
  check(cjsRec.status === 'in_review' && esmRecord.status === 'in_review', 'a fresh registry record is in_review on both sides');
  check(cjsRec.norNumber === '' && esmRecord.norNumber === '' && cjsRec.numberSource === 'system_suggested', 'no official number on register (both)');
  check(cjsRec.norId === 'nor_conv_A' && esmRecord.norId === 'nor_conv_A', 'norId = nor_<conversationId> on both');
  check(JSON.stringify(cjsRec.content) === JSON.stringify(esmRecord.content), 'the content snapshot is identical on both sides');
  // publishedVersion is a GENUINE null pre-publication on BOTH sides — not 0,
  // not undefined, no reliance on Number(null) → 0 downstream correction.
  check(Object.is(cjsRec.publishedVersion, null) && Object.is(esmRecord.publishedVersion, null), 'publishedVersion === null (strict) on both sides at register');
  check(esmRec.makeNorRecord({}).publishedVersion === null && esmRec.makeNorRecord({ publishedVersion: null }).publishedVersion === null, 'ESM makeNorRecord: omitted / null publishedVersion → null (not 0)');
  check(esmRec.makeNorRecord({ publishedVersion: 0 }).publishedVersion === null && esmRec.makeNorRecord({ publishedVersion: 3 }).publishedVersion === 3 && esmRec.makeNorRecord({ publishedVersion: '2' }).publishedVersion === 2, 'ESM makeNorRecord: 0 → null; 3 → 3; "2" → 2 (valid numeric versions still normalise)');
  check(cjs.isNorRecord({ schema: 'x' }) === false && esmRec.isNorRecord({ schema: 'x' }) === false, 'isNorRecord: both reject garbage');

  /* ── 2. norNumberingCounter — atomic + idempotent ────────────────────── */
  section('norNumberingCounter.reserveNorNumber — atomic + idempotent (PART F)');
  {
    const db = makeFakeDb();
    const a1 = await counter.reserveNorNumber({ db, reservationKey: 'nor_a' });
    check(a1.ok && a1.data.sequence === 1 && a1.data.replayed === false, 'first reservation → sequence 1, not a replay');
    const a2 = await counter.reserveNorNumber({ db, reservationKey: 'nor_a' });
    check(a2.ok && a2.data.sequence === 1 && a2.data.replayed === true, 'SAME reservationKey → SAME sequence, flagged replayed (no increment) — duplicate number impossible (item 12)');
    const b1 = await counter.reserveNorNumber({ db, reservationKey: 'nor_b' });
    check(b1.ok && b1.data.sequence === 2, 'a different reservationKey → the next sequence');
    check(db._root.intelligence_nor_registry_counters.intelligence_nor.seq === 2, 'the counter node holds seq 2 after two distinct allocations');
    const bad = await counter.reserveNorNumber({ db, reservationKey: 'a/b#c' });
    check(!bad.ok && bad.error.code === 'NUMBER_RESERVATION_FAILED', 'an RTDB-unsafe reservationKey → NUMBER_RESERVATION_FAILED');
    const scoped = await counter.reserveNorNumber({ db, reservationKey: 'nor_a', scopeKey: 'other_scope' });
    check(scoped.ok && scoped.data.sequence === 1, 'a fresh scope starts its own sequence at 1');
  }

  /* ── 3. norRegistryStore — full lifecycle ────────────────────────────── */
  section('norRegistryStore — register / get / list (items 1–4)');
  {
    const db = makeFakeDb();
    await seedDraft(db, { draftId: 'draft_conv_A', conversationId: 'conv_A', ownerId: 'owner' });
    const reg = await regStore.registerFromDraft(db, { draft: (await draftStore.getDraft(db, 'draft_conv_A')).data, ownerId: 'owner' });
    check(reg.ok && reg.data.norId === 'nor_conv_A' && reg.data.status === 'in_review' && reg.data.currentVersion === 1, 'registerFromDraft → in_review v1');
    check(reg.data.ownerId === 'owner' && reg.data.createdBy === 'owner', 'ownerId + createdBy come from the caller (verified uid)');
    check(reg.data.norNumber === '' && reg.data.publishedVersion === null, 'no number, no publishedVersion at register');
    check(reg.data.auditHistory.length === 1 && reg.data.auditHistory[0].type === 'AI_DRAFT_CREATED', 'auditHistory opens with AI_DRAFT_CREATED (item 15)');
    check(reg.data.versions.length === 1 && reg.data.versions[0].version === 1, 'versions[] opens with v1');
    const again = await regStore.registerFromDraft(db, { draft: (await draftStore.getDraft(db, 'draft_conv_A')).data, ownerId: 'owner' });
    check(again.ok && again.data.norId === 'nor_conv_A' && again.data.currentVersion === 1, 'registerFromDraft is get-or-create — a second call returns the SAME v1 record');
    const got = await regStore.getRecord(db, 'nor_conv_A');
    check(got.ok && got.data.content.facts.item === 'mesin potong rumput' && got.data.content.body.length > 0, 'getRecord rehydrates the content snapshot (item 2)');
    await seedDraft(db, { draftId: 'draft_conv_B', conversationId: 'conv_B', ownerId: 'owner' });
    await regStore.registerFromDraft(db, { draft: (await draftStore.getDraft(db, 'draft_conv_B')).data, ownerId: 'owner' });
    await seedDraft(db, { draftId: 'draft_conv_C', conversationId: 'conv_C', ownerId: 'other' });
    await regStore.registerFromDraft(db, { draft: (await draftStore.getDraft(db, 'draft_conv_C')).data, ownerId: 'other' });
    const mine = await regStore.listByOwner(db, 'owner');
    check(mine.ok && mine.data.length === 2 && mine.data.every((r) => r.ownerId === 'owner'), 'listByOwner returns only the caller’s records (item 3)');
  }

  section('norRegistryStore — edit → immutable version (items 6–7)');
  {
    const db = makeFakeDb();
    const d = await seedDraft(db, { draftId: 'draft_e', conversationId: 'conv_e', ownerId: 'owner' });
    await regStore.registerFromDraft(db, { draft: d, ownerId: 'owner' });
    // the human edits the Phase 4 draft (Phase 4 path), then the registry syncs
    const edited = await draftStore.updateDraft(db, 'draft_e', { body: 'Isi surat yang disunting manusia.', budget: 'Rp10.000.000' }, { actorId: 'owner', at: '2026-09-02T01:00:00.000Z' });
    check(edited.ok && edited.data.version === 2, 'Phase 4 draft edit → draft v2 (unchanged Phase 4 behaviour)');
    const s = await regStore.syncFromDraft(db, 'nor_conv_e', { draft: edited.data, actorId: 'owner', at: '2026-09-02T01:00:01.000Z' });
    check(s.ok && s.data.currentVersion === 2 && s.data.versions.length === 2, 'syncFromDraft → registry v2, a NEW versions[] entry (item 6)');
    check(s.data.versions[0].content.body !== s.data.versions[1].content.body && s.data.versions[0].version === 1, 'the v1 snapshot is UNCHANGED — history is append-only, never overwritten');
    check(s.data.content.body === 'Isi surat yang disunting manusia.' && s.data.content.facts.budget === 'Rp10.000.000', 'the head content is the latest snapshot');
    const last = s.data.auditHistory[s.data.auditHistory.length - 1];
    check(last.type === 'AI_DRAFT_EDITED' && last.actorId === 'owner' && last.version === 2, 'an AI_DRAFT_EDITED audit entry is appended (item 15)');
    const noop = await regStore.syncFromDraft(db, 'nor_conv_e', { draft: edited.data, actorId: 'owner' });
    check(noop.ok && noop.data.currentVersion === 2 && noop.data.versions.length === 2, 'a no-op sync (content unchanged) does NOT bump the version');
    const stale = await regStore.syncFromDraft(db, 'nor_conv_e', { draft: { ...edited.data, body: 'lagi' }, actorId: 'owner', expectedVersion: 1 });
    check(!stale.ok && stale.error.code === 'VERSION_CONFLICT', 'a stale expectedVersion → VERSION_CONFLICT (item 7)');
  }

  section('norRegistryStore — approve (items 8–9)');
  {
    const db = makeFakeDb();
    const d = await seedDraft(db, { draftId: 'draft_ap', conversationId: 'conv_ap', ownerId: 'owner' });
    await regStore.registerFromDraft(db, { draft: d, ownerId: 'owner' });
    const stale = await regStore.approveRecord(db, 'nor_conv_ap', { expectedVersion: 5, actorId: 'owner' });
    check(!stale.ok && stale.error.code === 'VERSION_CONFLICT', 'approve with a stale expectedVersion → VERSION_CONFLICT');
    const ap = await regStore.approveRecord(db, 'nor_conv_ap', { expectedVersion: 1, actorId: 'owner', at: '2026-09-02T02:00:00.000Z' });
    check(ap.ok && ap.data.status === 'approved', 'approve from in_review → approved (item 8/9)');
    check(ap.data.norNumber === '' && ap.data.numberSource === 'system_suggested' && ap.data.publishedVersion === null, 'approve reserves NO number, sets NO publishedVersion (PART E)');
    const apLast = ap.data.auditHistory[ap.data.auditHistory.length - 1];
    check(apLast.type === 'AI_DRAFT_APPROVED' && apLast.actorId === 'owner', 'an AI_DRAFT_APPROVED audit entry carries the actor');
    const again = await regStore.approveRecord(db, 'nor_conv_ap', { actorId: 'owner' });
    check(!again.ok && again.error.code === 'ILLEGAL_TRANSITION', 'approve again (already approved) → ILLEGAL_TRANSITION (not in_review)');
    // editing after approval is refused (must re-enter the lifecycle)
    const editAfter = await regStore.syncFromDraft(db, 'nor_conv_ap', { draft: { ...d, body: 'x' }, actorId: 'owner' });
    check(!editAfter.ok && editAfter.error.code === 'ILLEGAL_TRANSITION', 'sync after approve → ILLEGAL_TRANSITION (only in_review is editable)');
  }

  section('norRegistryStore — publish (items 10–14) + SERVER-AUTHORITATIVE number');
  {
    const db = makeFakeDb();
    const d = await seedDraft(db, { draftId: 'draft_pub', conversationId: 'conv_pub', ownerId: 'owner' });
    await regStore.registerFromDraft(db, { draft: d, ownerId: 'owner' });
    const early = await regStore.publishRecord(db, 'nor_conv_pub', { actorId: 'owner' });
    check(!early.ok && early.error.code === 'ILLEGAL_TRANSITION', 'publish from in_review → ILLEGAL_TRANSITION (item 10)');
    await regStore.approveRecord(db, 'nor_conv_pub', { actorId: 'owner' });
    const staleP = await regStore.publishRecord(db, 'nor_conv_pub', { expectedVersion: 9, actorId: 'owner' });
    check(!staleP.ok && staleP.error.code === 'VERSION_CONFLICT', 'publish with a stale expectedVersion → VERSION_CONFLICT');

    // counter state BEFORE the first publish for this scope
    const counterBefore = (db._root.intelligence_nor_registry_counters && db._root.intelligence_nor_registry_counters.intelligence_nor && db._root.intelligence_nor_registry_counters.intelligence_nor.seq) || 0;

    // publishRecord takes NO number input — pass tampering fields anyway; they must be ignored.
    const pub = await regStore.publishRecord(db, 'nor_conv_pub', {
      expectedVersion: 1, actorId: 'owner', at: '2026-09-02T03:00:00.000Z',
      officialNumber: '999999', publishedNumber: '999999', norNumber: '999999', number: '999999',
    });
    check(pub.ok && pub.data.status === 'published', 'publish from approved → published (item 10)');
    check(pub.data.numberSource === 'reserved', 'numberSource = reserved (item 11)');
    check(pub.data.metadata.numberAllocation && typeof pub.data.metadata.numberAllocation.sequence === 'number', 'the atomic allocation is recorded in metadata (audit source, PART F)');
    const seq = pub.data.metadata.numberAllocation.sequence;
    check(seq === counterBefore + 1, `the reserved sequence is counterBefore+1 (${counterBefore} → ${seq})`);
    check(pub.data.norNumber === String(seq), `norNumber IS the SERVER-RESERVED SEQUENCE ("${pub.data.norNumber}") — the tampering fields were IGNORED`);
    check(pub.data.norNumber !== '999999', 'a client-supplied number can NEVER become the official norNumber (item 17 / server-authoritative)');
    check(db._root.intelligence_nor_registry_counters.intelligence_nor.seq === counterBefore + 1, 'the counter advanced by EXACTLY 1');
    check(pub.data.publishedVersion === 1, 'publishedVersion is the version that was published');
    check(pub.data.versions.find((v) => v.version === 1).published === true, 'the published versions[] entry is flagged');
    const evs = pub.data.auditHistory.map((e) => e.type);
    check(evs.includes('NOR_NUMBER_RESERVED') && evs.includes('NOR_PUBLISHED') && evs.indexOf('NOR_NUMBER_RESERVED') < evs.indexOf('NOR_PUBLISHED'), 'audit: NOR_NUMBER_RESERVED then NOR_PUBLISHED, append-only (item 15)');
    check(pub.data.auditHistory.find((e) => e.type === 'NOR_PUBLISHED').detail.norNumber === String(seq), 'the NOR_PUBLISHED audit entry records the server sequence, not any client value');
    const firstNumber = pub.data.norNumber;
    const firstSeq = seq;

    const retry = await regStore.publishRecord(db, 'nor_conv_pub', { expectedVersion: 1, actorId: 'owner', officialNumber: 'RETRY-TAMPER' });
    check(retry.ok && retry.data.status === 'published' && retry.data.norNumber === firstNumber, 'publish retry → the SAME record, the SAME number (item 13) — retry tampering also ignored');
    check(retry.data.metadata.numberAllocation.sequence === firstSeq, 'no second sequence was allocated on retry (item 12/13)');
    check(retry.data.auditHistory.filter((e) => e.type === 'NOR_PUBLISHED').length === 1, 'the retry appended NO duplicate NOR_PUBLISHED entry');
    check(db._root.intelligence_nor_registry_counters.intelligence_nor.seq === firstSeq, 'the counter did not advance on the idempotent retry (counter stays N)');

    // item 14 — published version immutable
    const editPub = await regStore.syncFromDraft(db, 'nor_conv_pub', { draft: { ...d, body: 'tamper' }, actorId: 'owner' });
    check(!editPub.ok && editPub.error.code === 'ALREADY_PUBLISHED', 'sync after publish → ALREADY_PUBLISHED (item 14)');
    const apPub = await regStore.approveRecord(db, 'nor_conv_pub', { actorId: 'owner' });
    check(!apPub.ok && apPub.error.code === 'ALREADY_PUBLISHED', 'approve after publish → ALREADY_PUBLISHED (item 14)');
    check(db._root.intelligence_nor_registry.nor_conv_pub.content.body !== 'tamper', 'the stored published record was NOT mutated by the rejected edit');
  }

  /* ── 4. the intelligenceNorRegistry callable (.run) ─────────────────── */
  section('intelligenceNorRegistry callable — auth / authz / op');
  {
    let t;
    t = null; try { await intelligenceNorRegistry.run({ data: { op: 'get', norId: 'x' } }); } catch (e) { t = e; }
    check(t && t.code === 'unauthenticated', 'no auth → HttpsError(unauthenticated)');
    t = null; try { await intelligenceNorRegistry.run({ data: { op: 'get', norId: 'x' }, auth: { uid: 'bob', token: { role: 'driver' } } }); } catch (e) { t = e; }
    check(t && t.code === 'permission-denied', 'non-admin → HttpsError(permission-denied)');
    t = null; try { await intelligenceNorRegistry.run({ data: { op: 'get', norId: 'x' }, auth: { uid: 'eq', token: { role: 'x', adminEquivalent: 'true' } } }); } catch (e) { t = e; }
    check(t && t.code === 'permission-denied', 'adminEquivalent as the STRING "true" → still denied (must be the boolean)');
    t = null; try { await intelligenceNorRegistry.run({ data: { op: 'bogus' }, auth: { uid: 'a', token: { role: 'admin' } } }); } catch (e) { t = e; }
    check(t && t.code === 'invalid-argument', 'admin + unknown op → HttpsError(invalid-argument)');
  }

  section('intelligenceNorRegistry callable — lifecycle + ownership (items 1,4,5,9,13,14)');
  {
    const asAdmin = (uid, token) => ({ uid, token: token || { role: 'admin' } });
    // seed a Phase 4 draft owned by alice (into the callable's own fake db)
    await seedDraft(callableDb, { draftId: 'draft_conv_cb', conversationId: 'conv_cb', ownerId: 'alice' });

    // register — server derives owner from auth.uid, re-reads the draft
    const reg = await intelligenceNorRegistry.run({ data: { op: 'register', draftId: 'draft_conv_cb' }, auth: asAdmin('alice') });
    check(reg.ok && reg.data.norId === 'nor_conv_cb' && reg.data.status === 'in_review' && reg.data.ownerId === 'alice', 'register via callable → in_review, owned by auth.uid (item 1)');
    check(reg.data.auditHistory[0].type === 'AI_DRAFT_CREATED' && reg.data.auditHistory[0].actorId === 'alice', 'AI_DRAFT_CREATED carries the server uid');

    // a DIFFERENT admin cannot register from alice's draft
    const bReg = await intelligenceNorRegistry.run({ data: { op: 'register', draftId: 'draft_conv_cb' }, auth: asAdmin('bob') });
    check(!bReg.ok && bReg.error.code === 'FORBIDDEN', 'register from another user’s draft → FORBIDDEN envelope (item 4)');

    // cross-owner get / sync / approve / publish / history → FORBIDDEN envelope
    for (const op of ['get', 'sync', 'approve', 'publish', 'history']) {
      const r = await intelligenceNorRegistry.run({ data: { op, norId: 'nor_conv_cb' }, auth: asAdmin('bob') });
      check(!r.ok && r.error.code === 'FORBIDDEN', `cross-owner ${op} → FORBIDDEN envelope (item 4/5)`);
    }
    check((callableDb._root.intelligence_nor_registry.nor_conv_cb.status) === 'in_review', 'no cross-owner op mutated the record');

    // owner walks the human-gated lifecycle
    const ap = await intelligenceNorRegistry.run({ data: { op: 'approve', norId: 'nor_conv_cb', expectedVersion: 1 }, auth: asAdmin('alice') });
    check(ap.ok && ap.data.status === 'approved' && ap.data.norNumber === '', 'owner approve → approved, still no number (item 9)');
    const pubEarlyWrongState = await intelligenceNorRegistry.run({ data: { op: 'sync', norId: 'nor_conv_cb' }, auth: asAdmin('alice') });
    check(!pubEarlyWrongState.ok && pubEarlyWrongState.error.code === 'ILLEGAL_TRANSITION', 'sync after approve → ILLEGAL_TRANSITION');
    // a MALICIOUS client tries to pick the official number — every number-shaped
    // field on request.data must be IGNORED; the number comes only from the server.
    const cSeqBefore = (callableDb._root.intelligence_nor_registry_counters && callableDb._root.intelligence_nor_registry_counters.intelligence_nor && callableDb._root.intelligence_nor_registry_counters.intelligence_nor.seq) || 0;
    const pub = await intelligenceNorRegistry.run({
      data: { op: 'publish', norId: 'nor_conv_cb', expectedVersion: 1, publishedNumber: '999999', officialNumber: '999999', norNumber: '999999', number: '999999', humanConfirmedNumber: '999999' },
      auth: asAdmin('alice'),
    });
    check(pub.ok && pub.data.status === 'published' && pub.data.numberSource === 'reserved', 'owner publish → published + reserved number (item 11)');
    const srvSeq = pub.data.metadata.numberAllocation.sequence;
    check(pub.data.norNumber === String(srvSeq), `norNumber IS the server-reserved sequence ("${pub.data.norNumber}"), NOT the client "999999" (server-authoritative)`);
    check(pub.data.norNumber !== '999999', 'the client CANNOT choose / override / inject the official NOR number');
    check(callableDb._root.intelligence_nor_registry_counters.intelligence_nor.seq === cSeqBefore + 1, 'the counter advanced by exactly 1 for the first publish');
    const firstNum = pub.data.norNumber;
    const retry = await intelligenceNorRegistry.run({ data: { op: 'publish', norId: 'nor_conv_cb', expectedVersion: 1, officialNumber: 'RETRY-TAMPER' }, auth: asAdmin('alice') });
    check(retry.ok && retry.data.norNumber === firstNum, 'publish retry via callable → same number (item 13)');
    check(callableDb._root.intelligence_nor_registry_counters.intelligence_nor.seq === cSeqBefore + 1, 'the counter did NOT advance on the idempotent retry');
    const editAfter = await intelligenceNorRegistry.run({ data: { op: 'sync', norId: 'nor_conv_cb' }, auth: asAdmin('alice') });
    check(!editAfter.ok && editAfter.error.code === 'ALREADY_PUBLISHED', 'sync after publish via callable → ALREADY_PUBLISHED (item 14)');

    // history + list are owner-scoped
    const hist = await intelligenceNorRegistry.run({ data: { op: 'history', norId: 'nor_conv_cb' }, auth: asAdmin('alice') });
    check(hist.ok && Array.isArray(hist.data) && hist.data.length >= 1, 'history → the owner sees the version list');
    const list = await intelligenceNorRegistry.run({ data: { op: 'list' }, auth: asAdmin('alice') });
    check(list.ok && list.data.every((r) => r.ownerId === 'alice'), 'list → only the caller’s records');

    // adminEquivalent:true is allowed and owns its work
    await seedDraft(callableDb, { draftId: 'draft_conv_eq', conversationId: 'conv_eq', ownerId: 'eqadmin' });
    const eqReg = await intelligenceNorRegistry.run({ data: { op: 'register', draftId: 'draft_conv_eq' }, auth: asAdmin('eqadmin', { role: 'engineering_coordinator', adminEquivalent: true }) });
    check(eqReg.ok && eqReg.data.ownerId === 'eqadmin', 'adminEquivalent:true → allowed, owns the record');

    // unknown norId
    const miss = await intelligenceNorRegistry.run({ data: { op: 'get', norId: 'nor_ghost' }, auth: asAdmin('alice') });
    check(!miss.ok && miss.error.code === 'NOT_FOUND', 'get an unknown norId → NOT_FOUND envelope, no crash');
  }

  /* ── 5. static — Phase 5 server files touch NOTHING beyond the registry ── */
  section('static — no V1 / petty-cash / knowledge / secret leakage (item 17)');
  {
    // strip /* */ and // comments — a header may legitimately name the
    // reimbursement counter as the ARCHITECTURAL PRECEDENT while explaining
    // this code does not touch it. We scan for credential- / coupling-SHAPED
    // CODE, not prose (same discipline as intelligence-functions-check.cjs).
    const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    const rawFiles = ['intelligenceNorRegistry.js', 'norRegistryStore.js', 'norRegistryContract.js', 'norNumberingCounter.js']
      .map((f) => fs.readFileSync(path.join(ROOT, 'functions/src/intelligence', f), 'utf8'));
    const rawBlob = rawFiles.join('\n');
    const blob = rawFiles.map(stripComments).join('\n');
    // `NOR_SOURCE_MODULE.PETTY_CASH` / the string 'petty_cash' is the
    // canonical registered-source-module vocabulary (mirrors the ESM
    // nor-record-contract.js) — NOT a coupling to V1 Petty Cash code. What
    // Part K forbids is importing / calling / mutating V1 Petty Cash.
    check(!/require\([^)]*petty|from\s+['"][^'"]*petty|generateNor\s*\(|pettyCashNors|nextRefNumber|norNumberFromSequence|romanMonth/i.test(blob),
      'no import of / call into V1 Petty Cash (generateNor / its numbering formatters)');
    check(!/require\([^)]*reimbursement|acquireReimbursementNumber\s*\(|reimbursement_counter/i.test(blob), 'does not import or call the reimbursement counter (precedent named in comments only)');
    check(!/promoteKnowledge|ingestKnowledge|knowledge_repository|approvedKnowledge|mergeKnowledge/i.test(blob), 'no organizational-knowledge write / promote');
    check(!/db\.ref\(\s*['"`][^'"`]*feature_flags|feature_flags\/[a-z]+['"`]\s*\)/i.test(blob), 'never writes or reads the feature flag node');
    check(!/sk-[A-Za-z0-9]|OPENAI_API_KEY|api\.openai\.com|process\.env/i.test(blob), 'no key / endpoint / env-var reference in any Phase 5 server file (code)');
    check(!/sk-[A-Za-z0-9]{12,}/.test(rawBlob), 'no key literal even in the comments (raw scan)');
    const callSrc = fs.readFileSync(path.join(ROOT, 'functions/src/intelligence/intelligenceNorRegistry.js'), 'utf8');
    check(/METADATA ONLY/.test(callSrc), 'the log call is annotated METADATA ONLY');
    check(!/logger\.(info|log|warn)\([^;]*\bbody\b[^;]*\)/.test(stripComments(callSrc)), 'no logger call passes the body text');
    // the counter module is the ONLY place a transaction / increment happens
    const storeSrc = stripComments(fs.readFileSync(path.join(ROOT, 'functions/src/intelligence/norRegistryStore.js'), 'utf8'));
    check(!/\.transaction\(|ServerValue\.increment/.test(storeSrc), 'norRegistryStore.js performs no counter transaction itself (delegates to norNumberingCounter)');
    const storeRefs = storeSrc.match(/\bdb\.ref\([^)]*\)/g) || [];
    check(storeRefs.length > 0 && storeRefs.every((r) => /PATH/.test(r)), `norRegistryStore only ever addresses the PATH ('intelligence_nor_registry') node (${storeRefs.length} db.ref calls)`);
    const counterSrc = stripComments(fs.readFileSync(path.join(ROOT, 'functions/src/intelligence/norNumberingCounter.js'), 'utf8'));
    const counterRefs = counterSrc.match(/\bdb\.ref\([^)]*\)/g) || [];
    check(counterRefs.length === 1 && /COUNTERS_PATH/.test(counterRefs[0]), 'norNumberingCounter only ever addresses the COUNTERS_PATH node');
  }

  /* ── 6. wiring + rules (item 16) ────────────────────────────────────── */
  section('functions/index.js wiring + callable shape');
  {
    const idx = fs.readFileSync(path.join(ROOT, 'functions/index.js'), 'utf8');
    check(/const\s*\{\s*intelligenceNorRegistry\s*\}\s*=\s*require\(['"]\.\/src\/intelligence\/intelligenceNorRegistry['"]\)/.test(idx), 'functions/index.js requires ./src/intelligence/intelligenceNorRegistry');
    check(/exports\.intelligenceNorRegistry\s*=\s*intelligenceNorRegistry\s*;/.test(idx), "functions/index.js exports.intelligenceNorRegistry — the name js/firebase.js calls via httpsCallable('intelligenceNorRegistry')");
    const src = fs.readFileSync(path.join(ROOT, 'functions/src/intelligence/intelligenceNorRegistry.js'), 'utf8');
    check(/onCall\(\{\s*region:\s*REGION\s*\}/.test(src) && !/secrets:/.test(src), 'intelligenceNorRegistry is a region-pinned callable with NO secret binding');
    check(/canUseIntelligence\(auth\.token\)/.test(src), 'authz is the same token-only canUseIntelligence(auth.token) gate as every other Intelligence callable');
    check(/const uid = auth\.uid/.test(src) && /ownerId:\s*uid/.test(src), 'the actor / owner is ALWAYS auth.uid');
  }

  section('database.rules.json — /intelligence_nor_registry server-owned + owner-scoped (item 16)');
  {
    const rules = fs.readFileSync(path.join(ROOT, 'database.rules.json'), 'utf8');
    const block = (rules.match(/"intelligence_nor_registry"\s*:\s*\{[\s\S]*?\n\s{4}\}/) || [])[0] || '';
    check(block.length > 0, 'the intelligence_nor_registry rule block exists');
    check(/"\.write"\s*:\s*"false"/.test(block), '.write is "false" — only the Admin SDK (the callable) writes (no browser write path)');
    check(/"\.indexOn"\s*:\s*\[\s*"ownerId"\s*\]/.test(block), 'indexed on ownerId (for listByOwner)');
    check(/data\.child\('ownerId'\)\.val\(\)\s*===\s*auth\.uid/.test(block), 'the per-record .read is owner-scoped (data.ownerId === auth.uid)');
    check(/auth\.token\.role\s*===\s*'admin'/.test(block) && /auth\.token\.adminEquivalent\s*===\s*true/.test(block), 'admin / adminEquivalent may also read (parity with the draft node)');
    check(!/"intelligence_nor_registry_counters"/.test(rules), 'the counter node has NO rule of its own — the root deny-by-default covers it (like /reimbursement_counters)');
  }

  console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'} — ${fail} failing check(s).`);
  process.exit(fail === 0 ? 0 : 1);
})();
