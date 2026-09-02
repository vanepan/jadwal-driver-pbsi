/* ============================================================
   intelligence-nor-draft-check.cjs — Sarpras Intelligence (V2, Phase 4)

   CJS test for the SERVER-OWNED, human-reviewable NOR draft
   (functions/src/intelligence/norDraftContract.js + norDraftStore.js +
   intelligenceNorDraft.js). No emulator — the Admin SDK RTDB surface is a
   faithful in-memory fake (drops empty objects, orderByChild/equalTo).

   Proves:
     • CJS norDraftContract.js mirrors the ESM
       nor-draft/contracts/*  (schema, status, field lists, error codes,
       isNorDraftRecord + sanitizeDraftEdits behaviour) — drift guard
     • norDraftStore: create (v1) / get / update / listByOwner happy path +
       RTDB empty-field rehydrate round-trip
     • the SAFETY invariant: numbering.publishedNumber is null on create,
       on read, and after an edit — a client value is ignored
     • update: only DRAFT_EDITABLE_FIELDS change; structured facts survive;
       version bumps; humanEdited flips; an AI_DRAFT_EDITED entry is appended
       with changedFields; a no-op edit does NOT bump the version
     • ownership: cross-owner get / update → FORBIDDEN (envelope, not throw)
     • the intelligenceNorDraft callable (.run):
         - unauthenticated → HttpsError('unauthenticated')
         - non-admin       → HttpsError('permission-denied')
         - admin / adminEquivalent:true → allowed; adminEquivalent:'true' → denied
         - unknown op      → HttpsError('invalid-argument')
         - client-supplied ownerId is IGNORED (forced to auth.uid)
         - User B get/update of User A's draft → FORBIDDEN
         - AI_DRAFT_CREATED / AI_DRAFT_EDITED land in the record's auditTrail
         - metadata-only logging (no body / secret leak — static)
     • NO publish / numbering-counter / NOR-Registry / knowledge mutation
       anywhere in the Phase 4 server files (static)
     • functions/index.js wires + exports intelligenceNorDraft; the callable
       is region-pinned with NO secret binding
     • database.rules.json: /intelligence_nor_drafts is .write:false,
       owner-scoped .read, indexed on ownerId

   Run:  node scripts/intelligence-nor-draft-check.cjs   (exit 0 = pass)
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

/* ── faithful in-memory fake of the Admin SDK RTDB surface ───────────── */
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
      orderByChild(ck) { return { equalTo(val) { return { async once() {
        const all = getAt(p) || {}; const out = {};
        for (const [k, row] of Object.entries(all)) if (row && row[ck] === val) out[k] = row;
        return snap(Object.keys(out).length ? out : null);
      } }; } }; },
    };
  }
  return { ref, _root: root };
}

const cjs = require('../functions/src/intelligence/norDraftContract');
const store = require('../functions/src/intelligence/norDraftStore');

// intelligenceNorDraft.js require('../config/admin') for `db`. Install a fake
// BEFORE requiring the callable so a bare `node` run never touches a real DB.
const callableDb = makeFakeDb();
require.cache[require.resolve('../functions/src/config/admin')] = {
  id: 'admin-shim', loaded: true, exports: { admin: {}, auth: {}, db: callableDb },
};
const { intelligenceNorDraft } = require('../functions/src/intelligence/intelligenceNorDraft');

(async () => {
  const esm = await import('../src/intelligence/nor-draft/contracts/nor-draft-record-contract.js');
  const esmStore = await import('../src/intelligence/nor-draft/contracts/nor-draft-store-contract.js');
  const { makeNorDraftRecord } = esm;

  /* fixture — a contract-valid version-1 record owned by `owner`. */
  const fixture = (over = {}) => makeNorDraftRecord({
    draftId: over.draftId || 'draft_conv_A',
    conversationId: over.conversationId || 'conv_A',
    ownerId: over.ownerId || 'owner',
    jenis: 'Pengadaan',
    subject: 'Pengadaan mesin potong rumput (2)',
    recipient: 'Bendahara',
    recipientStatus: 'known',
    date: '2026-09-02',
    facts: { item: 'mesin potong rumput', quantity: 2, unit: 'unit', purpose: 'perawatan lapangan PBSI', budget: 'Rp8.000.000', type: 'create_nor' },
    body: 'Dengan hormat, bersama ini diajukan pengadaan mesin potong rumput.',
    numbering: { suggestedNumber: '015/NOR/IX/2026', source: 'system_suggested', basis: 'next after 014', confidence: 0.8 },
    now: '2026-09-02T00:00:00.000Z',
    ...over,
  });

  /* ── 1. CJS ⇄ ESM contract drift ─────────────────────────────────────── */
  section('CJS ⇄ ESM NOR-draft contract drift');
  check(cjs.NOR_DRAFT_SCHEMA === esm.NOR_DRAFT_SCHEMA && cjs.NOR_DRAFT_SCHEMA === 'intelligence-nor-draft@1', 'NOR_DRAFT_SCHEMA matches on both sides');
  check(JSON.stringify(cjs.NOR_DRAFT_STATUS) === JSON.stringify(esm.NOR_DRAFT_STATUS) && cjs.NOR_DRAFT_STATUS.REQUIRES_REVIEW === 'requires_review', 'NOR_DRAFT_STATUS matches (requires_review only)');
  check(JSON.stringify(cjs.DRAFT_FACT_FIELDS) === JSON.stringify(esm.DRAFT_FACT_FIELDS), `DRAFT_FACT_FIELDS matches (${cjs.DRAFT_FACT_FIELDS.join(',')})`);
  check(JSON.stringify(cjs.DRAFT_EDITABLE_FIELDS) === JSON.stringify(esm.DRAFT_EDITABLE_FIELDS), 'DRAFT_EDITABLE_FIELDS matches');
  check(JSON.stringify(cjs.NOR_DRAFT_FIELDS) === JSON.stringify(esm.NOR_DRAFT_FIELDS), 'NOR_DRAFT_FIELDS list matches');
  check(JSON.stringify(cjs.DRAFT_AUDIT_EVENTS) === JSON.stringify(esm.DRAFT_AUDIT_EVENTS), 'DRAFT_AUDIT_EVENTS matches (AI_DRAFT_CREATED, AI_DRAFT_EDITED)');
  for (const code of ['NO_BACKEND_CONFIGURED', 'NOT_FOUND', 'FORBIDDEN', 'INVALID_RECORD', 'VERSION_CONFLICT', 'NOT_IMPLEMENTED']) {
    check(cjs.DRAFT_STORE_ERRORS[code] === code && esmStore.DRAFT_STORE_ERRORS[code] === code, `DRAFT_STORE_ERRORS.${code} present in both`);
  }
  // behavioural parity on the same inputs
  const good = fixture();
  check(cjs.isNorDraftRecord(good) === true && esm.isNorDraftRecord(good) === true, 'isNorDraftRecord: both accept a valid record');
  const withPub = JSON.parse(JSON.stringify(good)); withPub.numbering.publishedNumber = 'NOR/999';
  check(cjs.isNorDraftRecord(withPub) === false && esm.isNorDraftRecord(withPub) === false, 'isNorDraftRecord: both REJECT a record carrying a publishedNumber (safety invariant is structural)');
  check(cjs.isNorDraftRecord({ schema: 'x' }) === false && esm.isNorDraftRecord({ schema: 'x' }) === false, 'isNorDraftRecord: both reject garbage');
  const dirtyEdits = { item: 'baru', purpose: '  rapat  ', bogus: 'x', publishedNumber: 'NOR/1', status: 'published', version: 9, quantity: 5, body: '' };
  check(JSON.stringify(cjs.sanitizeDraftEdits(dirtyEdits)) === JSON.stringify(esm.sanitizeDraftEdits(dirtyEdits)), 'sanitizeDraftEdits: identical output on both sides');
  const se = cjs.sanitizeDraftEdits(dirtyEdits);
  check(!('bogus' in se) && !('publishedNumber' in se) && !('status' in se) && !('version' in se), 'sanitizeDraftEdits drops non-editable keys (publishedNumber / status / version / bogus)');
  check(se.item === 'baru' && se.purpose === 'rapat' && se.quantity === 5 && se.body === '', 'sanitizeDraftEdits keeps trimmed strings, finite numbers, and an explicit clear');

  /* ── 2. norDraftStore — create / get / update / list ─────────────────── */
  section('norDraftStore — create (v1) / get / RTDB rehydrate');
  {
    const db = makeFakeDb();
    const created = await store.createDraft(db, fixture());
    check(created.ok && created.data.version === 1 && created.data.draftId === 'draft_conv_A', 'createDraft → ok, version 1');
    check(created.data.numbering.publishedNumber === null, 'createDraft: numbering.publishedNumber is null');
    check(Array.isArray(created.data.auditTrail) && created.data.auditTrail[0].type === 'AI_DRAFT_CREATED', 'createDraft: auditTrail seeded with AI_DRAFT_CREATED');
    const dup = await store.createDraft(db, fixture());
    check(!dup.ok && dup.error.code === cjs.DRAFT_STORE_ERRORS.INVALID_RECORD, 'createDraft on an existing id → INVALID_RECORD');
    const notV1 = await store.createDraft(db, { ...fixture({ draftId: 'draft_v2', conversationId: 'conv_v2' }), version: 2 });
    check(!notV1.ok && notV1.error.code === cjs.DRAFT_STORE_ERRORS.INVALID_RECORD, 'createDraft with version ≠ 1 → INVALID_RECORD');
    const got = await store.getDraft(db, 'draft_conv_A');
    check(got.ok && got.data.facts.item === 'mesin potong rumput' && got.data.facts.quantity === 2, 'getDraft rehydrates the structured facts');
    check(got.data.numbering.publishedNumber === null, 'getDraft: publishedNumber stays null on read');
    check(cjs.isNorDraftRecord(got.data), 'the rehydrated record satisfies the contract');
    const badKey = await store.getDraft(db, 'a/b.c');
    check(!badKey.ok && badKey.error.code === cjs.DRAFT_STORE_ERRORS.INVALID_RECORD, 'getDraft with an RTDB-unsafe key → INVALID_RECORD');
    const ghost = await store.getDraft(db, 'draft_nope');
    check(!ghost.ok && ghost.error.code === cjs.DRAFT_STORE_ERRORS.NOT_FOUND, 'getDraft for an unknown id → NOT_FOUND');
  }

  section('norDraftStore — a client publishedNumber is ignored');
  {
    const db = makeFakeDb();
    const rec = fixture({ draftId: 'draft_pn', conversationId: 'conv_pn' });
    const tampered = JSON.parse(JSON.stringify(rec)); tampered.numbering.publishedNumber = 'NOR/CHEAT/1';
    const created = await store.createDraft(db, tampered);
    check(created.ok && created.data.numbering.publishedNumber === null, 'createDraft forces publishedNumber to null even when the incoming record carries one');
    check((db._root.intelligence_nor_drafts.draft_pn.numbering || {}).publishedNumber == null, 'the value persisted to RTDB has no publishedNumber');
  }

  section('norDraftStore — update: editable-only, facts survive, version + audit');
  {
    const db = makeFakeDb();
    await store.createDraft(db, fixture({ draftId: 'draft_u', conversationId: 'conv_u' }));
    const upd = await store.updateDraft(db, 'draft_u', {
      budget: 'Rp10.000.000', body: 'Isi surat yang sudah disunting manusia.',
      publishedNumber: 'NOR/HACK/2', status: 'published', version: 99, ownerId: 'someoneElse',
    }, { actorId: 'owner', at: '2026-09-02T01:00:00.000Z' });
    check(upd.ok && upd.data.version === 2, 'updateDraft → version 2');
    check(upd.data.facts.budget === 'Rp10.000.000' && upd.data.body === 'Isi surat yang sudah disunting manusia.', 'the two editable fields changed');
    check(upd.data.facts.item === 'mesin potong rumput' && upd.data.facts.quantity === 2 && upd.data.recipient === 'Bendahara', 'structured facts NOT touched by the edit survived verbatim');
    check(upd.data.numbering.publishedNumber === null && upd.data.status === 'requires_review', 'publishedNumber stays null and status stays requires_review (non-editable keys ignored)');
    check(upd.data.ownerId === 'owner', 'ownerId is not editable — the tampered value was ignored');
    check(upd.data.humanEdited === true, 'humanEdited flips to true');
    const last = upd.data.auditTrail[upd.data.auditTrail.length - 1];
    check(last.type === 'AI_DRAFT_EDITED' && last.actorId === 'owner' && last.changedFields.sort().join(',') === 'body,budget', 'an AI_DRAFT_EDITED entry is appended with actorId + changedFields');
    check(upd.data.auditTrail.length === 2 && upd.data.auditTrail[0].type === 'AI_DRAFT_CREATED', 'the auditTrail is append-only (create + edit)');

    const noop = await store.updateDraft(db, 'draft_u', { budget: 'Rp10.000.000' }, { actorId: 'owner', at: '2026-09-02T02:00:00.000Z' });
    check(noop.ok && noop.data.version === 2 && noop.data.auditTrail.length === 2, 'a no-op edit (same values) does NOT bump the version or append an audit entry');

    const vc = await store.updateDraft(db, 'draft_u', { budget: 'X' }, { actorId: 'owner', expectedVersion: 1 });
    check(!vc.ok && vc.error.code === cjs.DRAFT_STORE_ERRORS.VERSION_CONFLICT, 'updateDraft with a stale expectedVersion → VERSION_CONFLICT');
  }

  section('norDraftStore — listByOwner');
  {
    const db = makeFakeDb();
    await store.createDraft(db, fixture({ draftId: 'draft_o1', conversationId: 'c1', ownerId: 'alice' }));
    await store.createDraft(db, fixture({ draftId: 'draft_o2', conversationId: 'c2', ownerId: 'alice' }));
    await store.createDraft(db, fixture({ draftId: 'draft_o3', conversationId: 'c3', ownerId: 'bob' }));
    const alice = await store.listByOwner(db, 'alice');
    check(alice.ok && alice.data.length === 2 && alice.data.every((d) => d.ownerId === 'alice'), 'listByOwner returns only that owner’s drafts');
  }

  /* ── 3. the intelligenceNorDraft callable (.run) ─────────────────────── */
  section('intelligenceNorDraft callable — auth / authz / op');
  {
    let threw;
    threw = null; try { await intelligenceNorDraft.run({ data: { op: 'get', draftId: 'x' } }); } catch (e) { threw = e; }
    check(threw && threw.code === 'unauthenticated', 'no auth → HttpsError(unauthenticated)');
    threw = null; try { await intelligenceNorDraft.run({ data: { op: 'get', draftId: 'x' }, auth: { uid: 'bob', token: { role: 'driver' } } }); } catch (e) { threw = e; }
    check(threw && threw.code === 'permission-denied', 'non-admin → HttpsError(permission-denied)');
    threw = null; try { await intelligenceNorDraft.run({ data: { op: 'get', draftId: 'x' }, auth: { uid: 'eq', token: { role: 'x', adminEquivalent: 'true' } } }); } catch (e) { threw = e; }
    check(threw && threw.code === 'permission-denied', 'adminEquivalent as the STRING "true" → still denied (must be the boolean)');
    threw = null; try { await intelligenceNorDraft.run({ data: { op: 'bogus' }, auth: { uid: 'a', token: { role: 'admin' } } }); } catch (e) { threw = e; }
    check(threw && threw.code === 'invalid-argument', 'admin + unknown op → HttpsError(invalid-argument)');
  }

  section('intelligenceNorDraft callable — ownership is server-derived (auth.uid)');
  {
    const asAdmin = (uid, token) => ({ uid, token: token || { role: 'admin' } });
    // create — client lies about ownerId; server forces auth.uid
    const rec = fixture({ draftId: 'draft_cb', conversationId: 'conv_cb', ownerId: 'CLIENT-LIE' });
    const cr = await intelligenceNorDraft.run({ data: { op: 'create', record: rec }, auth: asAdmin('alice') });
    check(cr.ok && cr.data.ownerId === 'alice', 'create: client-supplied record.ownerId is OVERRIDDEN with the authenticated uid');
    check(cr.data.auditTrail[0].type === 'AI_DRAFT_CREATED' && cr.data.auditTrail[0].actorId === 'alice', 'create: AI_DRAFT_CREATED audit entry carries the server uid');
    check(cr.data.numbering.publishedNumber === null, 'create via the callable: publishedNumber is null');

    // adminEquivalent:true is allowed
    const cr2 = await intelligenceNorDraft.run({ data: { op: 'create', record: fixture({ draftId: 'draft_eq', conversationId: 'conv_eq' }) }, auth: asAdmin('eqadmin', { role: 'engineering_coordinator', adminEquivalent: true }) });
    check(cr2.ok && cr2.data.ownerId === 'eqadmin', 'adminEquivalent:true → allowed, owns the draft');

    // User B cannot get / update User A's draft
    const bGet = await intelligenceNorDraft.run({ data: { op: 'get', draftId: 'draft_cb' }, auth: asAdmin('bob') });
    check(!bGet.ok && bGet.error.code === cjs.DRAFT_STORE_ERRORS.FORBIDDEN, 'User B get of User A’s draft → FORBIDDEN (envelope, not a throw)');
    const bUpd = await intelligenceNorDraft.run({ data: { op: 'update', draftId: 'draft_cb', edits: { body: 'tamper' } }, auth: asAdmin('bob') });
    check(!bUpd.ok && bUpd.error.code === cjs.DRAFT_STORE_ERRORS.FORBIDDEN, 'User B update of User A’s draft → FORBIDDEN');
    check((callableDb._root.intelligence_nor_drafts.draft_cb.body || '') !== 'tamper', 'the cross-owner update did NOT mutate the stored draft');

    // Owner can get + update; the edit is audited
    const aGet = await intelligenceNorDraft.run({ data: { op: 'get', draftId: 'draft_cb' }, auth: asAdmin('alice') });
    check(aGet.ok && aGet.data.draftId === 'draft_cb', 'the owner can get their own draft');
    const aUpd = await intelligenceNorDraft.run({ data: { op: 'update', draftId: 'draft_cb', edits: { item: 'mesin potong rumput X', budget: 'Rp12.000.000' } }, auth: asAdmin('alice') });
    check(aUpd.ok && aUpd.data.version === 2 && aUpd.data.humanEdited === true, 'the owner can update → version 2, humanEdited');
    const lastEv = aUpd.data.auditTrail[aUpd.data.auditTrail.length - 1];
    check(lastEv.type === 'AI_DRAFT_EDITED' && lastEv.changedFields.sort().join(',') === 'budget,item', 'the update appends AI_DRAFT_EDITED with the changed fields');
    check(aUpd.data.numbering.publishedNumber === null, 'still no publishedNumber after the edit');

    // list is owner-scoped
    const aList = await intelligenceNorDraft.run({ data: { op: 'list' }, auth: asAdmin('alice') });
    check(aList.ok && aList.data.every((d) => d.ownerId === 'alice') && aList.data.some((d) => d.draftId === 'draft_cb'), 'list returns only the caller’s drafts');

    // unknown draft
    const miss = await intelligenceNorDraft.run({ data: { op: 'get', draftId: 'draft_ghost' }, auth: asAdmin('alice') });
    check(!miss.ok && miss.error.code === cjs.DRAFT_STORE_ERRORS.NOT_FOUND, 'get an unknown draft → NOT_FOUND envelope, no crash');
  }

  /* ── 4. static — no publish / numbering / registry / knowledge mutation ── */
  section('static — the Phase 4 server files mutate NOTHING beyond the draft node');
  {
    const files = ['intelligenceNorDraft.js', 'norDraftStore.js', 'norDraftContract.js'].map((f) => fs.readFileSync(path.join(ROOT, 'functions/src/intelligence', f), 'utf8'));
    const blob = files.join('\n');
    check(!/acquire\w*Number|reimbursement_counter|nor_numbering|allocateNumber|publishNor|nor_registry|norRegistry/i.test(blob), 'no numbering-counter / NOR-Registry allocation or publish call');
    check(!/ServerValue\.increment|\.transaction\(|runTransaction/.test(blob), 'no counter increment / transaction');
    check(!/promoteKnowledge|ingestKnowledge|knowledge_repository|approvedKnowledge|mergeKnowledge/i.test(blob), 'no organizational-knowledge write / promote');
    const storeSrc = fs.readFileSync(path.join(ROOT, 'functions/src/intelligence/norDraftStore.js'), 'utf8');
    const refCalls = storeSrc.match(/\bdb\.ref\([^)]*\)/g) || [];
    check(refCalls.length > 0 && refCalls.every((r) => /PATH/.test(r)), `norDraftStore only ever addresses the PATH ('intelligence_nor_drafts') node (${refCalls.length} db.ref calls)`);
    const callSrc = fs.readFileSync(path.join(ROOT, 'functions/src/intelligence/intelligenceNorDraft.js'), 'utf8');
    check(/METADATA ONLY/.test(callSrc), 'the log call is annotated METADATA ONLY');
    check(!/logger\.(info|log|warn)\([^)]*\brecord\b[^)]*\)/.test(callSrc) && !/logger\.(info|log|warn)\([^)]*\bbody\b[^)]*\)/.test(callSrc), 'no logger call passes the record body / draft body');
    check(!/sk-[A-Za-z0-9]|OPENAI_API_KEY|api_key|process\.env/i.test(blob), 'no key / secret / env-var reference in the Phase 4 server files');
    // every `publishedNumber:` / `publishedNumber =` in the Phase 4 server files assigns the literal null
    const pnAssigns = blob.match(/publishedNumber\s*[:=]\s*[A-Za-z0-9_'".$]+/g) || [];
    check(pnAssigns.length > 0 && pnAssigns.every((m) => /[:=]\s*null$/.test(m)), `publishedNumber is only ever assigned the literal null (${pnAssigns.length} assignment(s))`);
  }

  /* ── 5. wiring + rules ─────────────────────────────────────────────── */
  section('functions/index.js wiring + callable shape');
  {
    const idx = fs.readFileSync(path.join(ROOT, 'functions/index.js'), 'utf8');
    check(/const\s*\{\s*intelligenceNorDraft\s*\}\s*=\s*require\(['"]\.\/src\/intelligence\/intelligenceNorDraft['"]\)/.test(idx), 'functions/index.js requires ./src/intelligence/intelligenceNorDraft');
    check(/exports\.intelligenceNorDraft\s*=\s*intelligenceNorDraft\s*;/.test(idx), "functions/index.js exports.intelligenceNorDraft — the name js/firebase.js calls via httpsCallable('intelligenceNorDraft')");
    const src = fs.readFileSync(path.join(ROOT, 'functions/src/intelligence/intelligenceNorDraft.js'), 'utf8');
    check(/onCall\(\{\s*region:\s*REGION\s*\}/.test(src) && !/secrets:/.test(src), 'intelligenceNorDraft is a region-pinned callable with NO secret binding');
    check(/canUseIntelligence\(auth\.token\)/.test(src), 'authz is the same token-only canUseIntelligence(auth.token) gate as Phase 3C');
    check(/const uid = auth\.uid/.test(src) && /ownerId:\s*uid/.test(src), 'the owner is ALWAYS auth.uid — a client-supplied ownerId is overwritten');
  }

  section('database.rules.json — /intelligence_nor_drafts is server-owned + owner-scoped');
  {
    const rules = fs.readFileSync(path.join(ROOT, 'database.rules.json'), 'utf8');
    const block = (rules.match(/"intelligence_nor_drafts"\s*:\s*\{[\s\S]*?\n\s{4}\}/) || [])[0] || '';
    check(block.length > 0, 'the intelligence_nor_drafts rule block exists');
    check(/"\.write"\s*:\s*"false"/.test(block), '.write is "false" — only the Admin SDK (the callable) writes');
    check(/"\.indexOn"\s*:\s*\[\s*"ownerId"\s*\]/.test(block), 'indexed on ownerId (for listByOwner)');
    check(/data\.child\('ownerId'\)\.val\(\)\s*===\s*auth\.uid/.test(block), 'the per-draft .read is owner-scoped (data.ownerId === auth.uid)');
    check(/auth\.token\.role\s*===\s*'admin'/.test(block) && /auth\.token\.adminEquivalent\s*===\s*true/.test(block), 'admin / adminEquivalent may also read (parity with the conversation node)');
  }

  console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'} — ${fail} failing check(s).`);
  process.exit(fail === 0 ? 0 : 1);
})();
