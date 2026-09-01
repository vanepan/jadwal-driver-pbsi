/* ============================================================
   intelligence-conversation-backend-check.cjs — Sarpras Intelligence (V2, Phase 2C)

   CJS test for the SERVER-OWNED conversation-state backend
   (functions/src/intelligence/conversationStore.js +
   functions/src/intelligence/intelligenceConversation.js). No emulator —
   the Admin SDK RTDB surface is a faithful in-memory fake that mimics
   RTDB's real quirks (drops empty objects/arrays, forbids bad keys).

   Proves:
     • CJS conversationContract.js mirrors the ESM contract (drift)
     • conversationStore: create / get / append happy path + RTDB
       empty-field drop → rehydrate round-trip
     • ownership: append with a mismatched actorId → FORBIDDEN
     • version: append with the wrong version → VERSION_CONFLICT
     • not found: get/append an unknown convId → NOT_FOUND
     • bad convId (RTDB-unsafe key) → INVALID_RECORD
     • intelligenceConversation callable (.run):
         - unauthenticated → HttpsError('unauthenticated')
         - non-admin       → HttpsError('permission-denied')
         - unknown op      → HttpsError('invalid-argument')
         - client-supplied actorId is IGNORED (forced to auth.uid)
         - User B get/append of User A's conversation → FORBIDDEN
         - metadata-only logging (no record body leak — static check)

   Run:  node scripts/intelligence-conversation-backend-check.cjs   (exit 0 = pass)
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

/* ── a faithful in-memory fake of the Admin SDK RTDB surface used by
      conversationStore.js: ref(path).once('value') / .set(v) /
      .orderByChild(k).equalTo(v).once('value'). Mimics RTDB dropping empty
      objects/arrays on write. ─────────────────────────────────────────── */
function makeFakeDb() {
  const root = {};
  const getAt = (p) => p.split('/').reduce((acc, k) => (acc == null ? undefined : acc[k]), root);
  const setAt = (p, v) => {
    const parts = p.split('/');
    let node = root;
    for (let i = 0; i < parts.length - 1; i += 1) { node[parts[i] ] = node[parts[i]] || {}; node = node[parts[i]]; }
    node[parts[parts.length - 1]] = v;
  };
  const dropEmpties = (v) => {
    if (Array.isArray(v)) { const a = v.map(dropEmpties).filter((x) => x !== undefined); return a.length ? a : undefined; }
    if (v && typeof v === 'object') {
      const o = {};
      for (const [k, val] of Object.entries(v)) { const d = dropEmpties(val); if (d !== undefined) o[k] = d; }
      return Object.keys(o).length ? o : undefined;
    }
    return v === undefined ? undefined : v;
  };
  const snap = (val) => ({
    val: () => (val === undefined ? null : val),
    exists: () => val !== undefined && val !== null,
    forEach: (cb) => { if (val && typeof val === 'object') for (const [k, v] of Object.entries(val)) cb({ key: k, val: () => v }); },
  });
  function ref(p) {
    return {
      _p: p,
      async once() { return snap(getAt(p)); },
      async set(v) { setAt(p, dropEmpties(v) === undefined ? null : dropEmpties(v)); },
      orderByChild(childKey) {
        return {
          equalTo(value) {
            return { async once() {
              const all = getAt(p) || {};
              const out = {};
              for (const [k, row] of Object.entries(all)) if (row && row[childKey] === value) out[k] = row;
              return snap(Object.keys(out).length ? out : null);
            } };
          },
        };
      },
    };
  }
  return { ref, _root: root };
}

const store = require('../functions/src/intelligence/conversationStore');
const cjsC = require('../functions/src/intelligence/conversationContract');

// intelligenceConversation.js `require('../config/admin')` for `db` (the
// conversation store). Install a fake admin db in the module cache BEFORE
// requiring the callable so a bare `node` run never touches a real database.
// canUseIntelligence() itself does NO db read — authz is the admin role only.
const callableDb = makeFakeDb();
require.cache[require.resolve('../functions/src/config/admin')] = {
  id: 'admin-shim', loaded: true, exports: { admin: {}, auth: {}, db: callableDb },
};
const { intelligenceConversation } = require('../functions/src/intelligence/intelligenceConversation');

/* Build a valid version-1 IntelligenceConversation using the CJS shape. */
function makeConv({ convId, actorId, status = 'needs_input', version = 1, collectedFields = {}, missingFields = [], turns } = {}) {
  const now = '2026-08-31T00:00:00.000Z';
  return {
    schema: 'intelligence-conversation@1',
    convId,
    version,
    actorId,
    actorRole: 'admin',
    sourceModule: 'intelligence',
    sourceFeature: null,
    task: 'nor.generate',
    domainType: 'nor',
    openingUtterance: 'buat NOR pengadaan',
    collectedFields,
    missingFields,
    status,
    draft: null,
    numbering: null,
    turnCount: version,
    turns: turns || [{ turn: 1, at: now, answers: {}, status, missingFields, requestId: 'r1' }],
    knowledgeRefs: [],
    memoryRefs: [],
    createdAt: now,
    updatedAt: now,
  };
}

(async () => {
  /* ── 1. contract drift ─────────────────────────────────────────────── */
  section('CJS ⇄ ESM conversation contract drift');
  const esmSrc = fs.readFileSync(path.join(ROOT, 'src/intelligence/conversation/contracts/intelligence-conversation-contract.js'), 'utf8');
  const esmStoreSrc = fs.readFileSync(path.join(ROOT, 'src/intelligence/conversation/intelligence-conversation-store-contract.js'), 'utf8');
  check(cjsC.INTELLIGENCE_CONVERSATION_SCHEMA === 'intelligence-conversation@1' && esmSrc.includes("'intelligence-conversation@1'"), 'schema string matches');
  check(JSON.stringify(cjsC.IC_STATUS) === JSON.stringify({ NEEDS_INPUT: 'needs_input', READY: 'ready', DRAFTED: 'drafted', ERROR: 'error', CANCELLED: 'cancelled' }), 'IC_STATUS matches');
  const esmFields = (esmSrc.match(/INTELLIGENCE_CONVERSATION_FIELDS = Object\.freeze\(\[([\s\S]*?)\]\)/) || [])[1] || '';
  check(cjsC.INTELLIGENCE_CONVERSATION_FIELDS.every((f) => esmFields.includes(`'${f}'`)) && cjsC.INTELLIGENCE_CONVERSATION_FIELDS.length === (esmFields.match(/'/g) || []).length / 2, 'INTELLIGENCE_CONVERSATION_FIELDS list matches the ESM one');
  for (const code of ['NOT_FOUND', 'FORBIDDEN', 'INVALID_RECORD', 'VERSION_CONFLICT', 'NOT_IMPLEMENTED', 'NO_BACKEND_CONFIGURED']) {
    check(cjsC.IC_STORE_ERRORS[code] === code && esmStoreSrc.includes(`${code}: '${code}'`), `IC_STORE_ERRORS.${code} present in both`);
  }
  check(cjsC.isIntelligenceConversation(makeConv({ convId: 'c1', actorId: 'u1' })) === true, 'CJS isIntelligenceConversation accepts a valid record');
  check(cjsC.isIntelligenceConversation({ schema: 'x' }) === false, 'CJS isIntelligenceConversation rejects garbage');

  /* ── 2. conversationStore happy path + RTDB round-trip ─────────────── */
  section('conversationStore — create / get / append + empty-field rehydrate');
  {
    const db = makeFakeDb();
    const c1 = makeConv({ convId: 'convA', actorId: 'userA', collectedFields: {}, missingFields: ['item'] });
    const created = await store.createConversation(db, c1);
    check(created.ok && created.data.convId === 'convA', 'createConversation → ok');
    // RTDB dropped collectedFields:{} on write — the stored raw has no such key
    check(db._root.intelligence_conversations.convA.collectedFields === undefined, 'RTDB fake dropped the empty collectedFields on write (real RTDB behaviour)');
    const got = await store.getConversation(db, 'convA');
    check(got.ok && got.data.collectedFields && typeof got.data.collectedFields === 'object' && !Array.isArray(got.data.collectedFields), 'getConversation rehydrates the dropped empty field back to {}');
    check(cjsC.isIntelligenceConversation(got.data), 'the rehydrated record still satisfies the contract');
    const v2 = makeConv({ convId: 'convA', actorId: 'userA', version: 2, collectedFields: { item: 'kursi' }, status: 'ready', turns: [c1.turns[0], { turn: 2, at: '2026-08-31T00:01:00.000Z', answers: { item: 'kursi' }, status: 'ready', missingFields: [], requestId: 'r2' }] });
    const appended = await store.appendConversation(db, v2);
    check(appended.ok && appended.data.version === 2 && appended.data.collectedFields.item === 'kursi', 'appendConversation → version 2, fields merged');
  }

  section('conversationStore — ownership / version / not-found / bad key');
  {
    const db = makeFakeDb();
    await store.createConversation(db, makeConv({ convId: 'convB', actorId: 'userA' }));
    const wrongOwner = await store.appendConversation(db, makeConv({ convId: 'convB', actorId: 'userB', version: 2 }));
    check(!wrongOwner.ok && wrongOwner.error.code === cjsC.IC_STORE_ERRORS.FORBIDDEN, 'append with a different actorId → FORBIDDEN');
    const wrongVersion = await store.appendConversation(db, makeConv({ convId: 'convB', actorId: 'userA', version: 5 }));
    check(!wrongVersion.ok && wrongVersion.error.code === cjsC.IC_STORE_ERRORS.VERSION_CONFLICT, 'append with a non-sequential version → VERSION_CONFLICT');
    const missing = await store.getConversation(db, 'nope');
    check(!missing.ok && missing.error.code === cjsC.IC_STORE_ERRORS.NOT_FOUND, 'get an unknown convId → NOT_FOUND');
    const badKey = await store.getConversation(db, 'a/b.c');
    check(!badKey.ok && badKey.error.code === cjsC.IC_STORE_ERRORS.INVALID_RECORD, 'get with an RTDB-unsafe key → INVALID_RECORD');
    check(store.isSafeConvId('conv_1-abc') === true && store.isSafeConvId('a.b') === false && store.isSafeConvId('a b') === false, 'isSafeConvId allows _ and - but not . or space');
    const listed = await store.listByActor(db, 'userA');
    check(listed.ok && listed.data.length === 1 && listed.data[0].convId === 'convB', 'listByActor returns only that actor’s conversations');
  }

  /* ── 3. the intelligenceConversation callable (.run) ──────────────── */
  section('intelligenceConversation callable — auth / authz / op');
  {
    let threw;
    threw = null; try { await intelligenceConversation.run({ data: { op: 'get', convId: 'x' } }); } catch (e) { threw = e; }
    check(threw && threw.code === 'unauthenticated', 'no auth → HttpsError(unauthenticated)');
    threw = null; try { await intelligenceConversation.run({ data: { op: 'get', convId: 'x' }, auth: { uid: 'bob', token: { role: 'driver' } } }); } catch (e) { threw = e; }
    check(threw && threw.code === 'permission-denied', 'non-admin → HttpsError(permission-denied)');
    threw = null; try { await intelligenceConversation.run({ data: { op: 'bogus' }, auth: { uid: 'anyadmin', token: { role: 'admin' } } }); } catch (e) { threw = e; }
    check(threw && threw.code === 'invalid-argument', 'ANY admin + unknown op → HttpsError(invalid-argument) (authz passed, no per-user grant needed)');
  }

  section('intelligenceConversation callable — ownership is server-derived (auth.uid)');
  {
    const ic2 = intelligenceConversation;

    // User A creates — client tries to claim actorId 'userZ', server must force 'userA'
    const conv = makeConv({ convId: 'convC', actorId: 'userZ-CLIENT-LIE' });
    const cr = await ic2.run({ data: { op: 'create', record: conv }, auth: { uid: 'userA', token: { role: 'admin' } } });
    check(cr.ok && cr.data.actorId === 'userA', 'create: client-supplied record.actorId is OVERRIDDEN with the authenticated uid');
    // User B tries to get it
    const bGet = await ic2.run({ data: { op: 'get', convId: 'convC' }, auth: { uid: 'userB', token: { role: 'admin' } } });
    check(!bGet.ok && bGet.error.code === cjsC.IC_STORE_ERRORS.FORBIDDEN, 'User B get of User A’s conversation → FORBIDDEN');
    // User B tries to append to it
    const bApp = await ic2.run({ data: { op: 'append', record: makeConv({ convId: 'convC', actorId: 'userB', version: 2 }) }, auth: { uid: 'userB', token: { role: 'admin' } } });
    check(!bApp.ok && bApp.error.code === cjsC.IC_STORE_ERRORS.FORBIDDEN, 'User B append to User A’s conversation → FORBIDDEN');
    // User A get succeeds
    const aGet = await ic2.run({ data: { op: 'get', convId: 'convC' }, auth: { uid: 'userA', token: { role: 'admin' } } });
    check(aGet.ok && aGet.data.convId === 'convC', 'User A can get their own conversation');
    // User A append succeeds
    const aApp = await ic2.run({ data: { op: 'append', record: makeConv({ convId: 'convC', actorId: 'IGNORED', version: 2, status: 'ready', turns: [conv.turns[0], { turn: 2, at: '2026-08-31T00:02:00.000Z', answers: {}, status: 'ready', missingFields: [], requestId: 'r2' }] }) }, auth: { uid: 'userA', token: { role: 'admin' } } });
    check(aApp.ok && aApp.data.version === 2 && aApp.data.actorId === 'userA', 'User A append: version bumps, actorId stays the authenticated uid');
    // unknown conversation
    const missing = await ic2.run({ data: { op: 'get', convId: 'ghost' }, auth: { uid: 'userA', token: { role: 'admin' } } });
    check(!missing.ok && missing.error.code === cjsC.IC_STORE_ERRORS.NOT_FOUND, 'get an unknown conversation → NOT_FOUND (envelope, not a throw)');
  }

  /* ── 4. static: metadata-only logging, no secret ─────────────────── */
  section('static — logging is metadata-only, no secret, no key');
  {
    const src = fs.readFileSync(path.join(ROOT, 'functions/src/intelligence/intelligenceConversation.js'), 'utf8');
    check(/METADATA ONLY/.test(src), 'the log call is annotated METADATA ONLY');
    check(!/logger\.(info|log|warn)\([^)]*record[^)]*\)/.test(src.replace(/METADATA ONLY[\s\S]*?\n/, '')), 'no logger call passes the record body');
    check(!/sk-[A-Za-z0-9]|OPENAI_API_KEY|api_key/i.test(src), 'no key / secret reference in the conversation callable');
    const storeSrc = fs.readFileSync(path.join(ROOT, 'functions/src/intelligence/conversationStore.js'), 'utf8');
    check(!/sk-[A-Za-z0-9]|OPENAI_API_KEY|process\.env/i.test(storeSrc), 'conversationStore.js reads no secret / env var');
  }

  console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'} — ${fail} failing check(s).`);
  process.exit(fail === 0 ? 0 : 1);
})();
