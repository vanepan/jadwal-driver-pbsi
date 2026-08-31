/* ============================================================
   intelligence-pilot-authz-check.cjs — Sarpras Intelligence (V2, Phase 3C-PREP)

   The dedicated proof that the Intelligence/OpenAI server boundary is
   NARROWER than "is an admin": a caller is authorized ONLY when BOTH

     1. the admin FLOOR  (role 'admin' OR adminEquivalent === true), AND
     2. an EXPLICIT `intelligence.use` grant in
        /userPermissionOverrides/{auth.uid}/permissions

   hold. The global feature flag /feature_flags/intelligence/enabled is the
   WHAT; this is the WHO; they are independent.

   Permission test matrix (Phase 3C-PREP brief §6) + the MANDATORY §7
   security regression + §I (client cannot self-grant) + §J (actorId stays
   auth.uid) + §K (cross-owner still forbidden) + §L (V1 auth untouched).

   No emulator, no network, no OpenAI. Fake, path-aware Admin SDK db.

   Run:  node scripts/intelligence-pilot-authz-check.cjs   (exit 0 = pass)
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

/* ── faithful, path-aware fake Admin SDK db ──────────────────────────── */
function makeFakeDb(seed) {
  const root = seed ? JSON.parse(JSON.stringify(seed)) : {};
  const at = (p) => String(p).split('/').reduce((a, k) => (a == null ? undefined : a[k]), root);
  const setAt = (p, v) => {
    const s = String(p).split('/'); let n = root;
    for (let i = 0; i < s.length - 1; i += 1) { n[s[i]] = n[s[i]] || {}; n = n[s[i]]; }
    n[s[s.length - 1]] = v;
  };
  const snap = (v) => ({
    val: () => (v === undefined ? null : v),
    exists: () => v != null,
    forEach: (cb) => { if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) cb({ key: k, val: () => x }); },
  });
  function ref(p) {
    return {
      async once() { return snap(at(p)); },
      async set(v) { setAt(p, v); },
      orderByChild(ck) { return { equalTo(val) { return { async once() {
        const all = at(p) || {}; const o = {};
        for (const [k, r] of Object.entries(all)) if (r && r[ck] === val) o[k] = r;
        return snap(Object.keys(o).length ? o : null);
      } }; } }; },
    };
  }
  return { ref, _root: root };
}

const grantSeed = () => ({
  userPermissionOverrides: {
    evan: { permissions: ['intelligence.use'] },
    coord: { permissions: ['intelligence.use', 'eng.assignment.create'] },
    userA: { permissions: ['intelligence.use'] },
    userB: { permissions: ['intelligence.use'] },
    plainadmin: { permissions: ['warehouse.item.edit'] }, // an admin with OTHER grants, not intelligence.use
    driverwithgrant: { permissions: ['intelligence.use'] }, // a non-admin who somehow has the id
  },
});

/* ══════════════════════════════════════════════════════════════════════ */

const {
  canUseIntelligence, meetsAdminFloor, readIntelligenceGrant,
  INTELLIGENCE_PERMISSION_ID, OVERRIDES_PATH,
} = require('../functions/src/intelligence/serverPermissions');

(async () => {
  section('serverPermissions.canUseIntelligence — the A–H matrix (brief §6)');
  const db = makeFakeDb(grantSeed());

  // A — authorized pilot: admin + intelligence.use
  check((await canUseIntelligence({ role: 'admin' }, { uid: 'evan', db })).ok === true,
    'A: admin WITH intelligence.use → ALLOWED');
  check((await canUseIntelligence({ role: 'engineering_coordinator', adminEquivalent: true }, { uid: 'coord', db })).ok === true,
    'A: adminEquivalent WITH intelligence.use → ALLOWED');

  // B — admin WITHOUT intelligence.use
  check((await canUseIntelligence({ role: 'admin' }, { uid: 'plainadmin', db })).ok === false,
    'B: admin WITHOUT intelligence.use → DENIED');

  // C — adminEquivalent WITHOUT intelligence.use
  check((await canUseIntelligence({ role: 'custom_ops', adminEquivalent: true }, { uid: 'plainadmin', db })).ok === false,
    'C: adminEquivalent WITHOUT intelligence.use → DENIED');

  // D — non-admin WITH intelligence.use → denied (admin floor is non-negotiable this phase)
  check((await canUseIntelligence({ role: 'driver' }, { uid: 'driverwithgrant', db })).ok === false,
    'D: non-admin WITH an intelligence.use record → DENIED (admin floor not met)');
  check((await canUseIntelligence({ role: 'bidang' }, { uid: 'driverwithgrant', db })).ok === false,
    'D: bidang WITH an intelligence.use record → DENIED');

  // E — unauthenticated / no token
  check((await canUseIntelligence(undefined, { uid: 'evan', db })).ok === false, 'E: no token → DENIED');
  check((await canUseIntelligence(null, { uid: 'evan', db })).ok === false, 'E: null token → DENIED');

  // fail-closed: missing context
  check((await canUseIntelligence({ role: 'admin' }, {})).ok === false, 'admin, no { uid, db } → DENIED (never floor-only)');
  check((await canUseIntelligence({ role: 'admin' }, { uid: 'evan' })).ok === false, 'admin, no db → DENIED');
  check((await canUseIntelligence({ role: 'admin' }, { db })).ok === false, 'admin, no uid → DENIED');

  // fail-closed: RTDB read error
  const throwDb = { ref() { return { once() { throw new Error('rtdb unreachable'); } }; } };
  check((await canUseIntelligence({ role: 'admin' }, { uid: 'evan', db: throwDb })).ok === false,
    'an RTDB read error while checking the grant → DENIED (fail closed)');

  // the denial reason never leaks anything sensitive
  for (const uid of ['plainadmin']) {
    const r = await canUseIntelligence({ role: 'admin' }, { uid, db });
    check(r.reason && !/password|pin|secret|key|sk-|token|bearer/i.test(r.reason), `denial reason for "${uid}" leaks nothing sensitive`);
  }

  section('the admin FLOOR helper is necessary but NOT sufficient');
  check(meetsAdminFloor({ role: 'admin' }) === true, 'meetsAdminFloor(admin) === true');
  check(meetsAdminFloor({ role: 'x', adminEquivalent: true }) === true, 'meetsAdminFloor(adminEquivalent) === true');
  check(meetsAdminFloor({ role: 'driver' }) === false && meetsAdminFloor(undefined) === false, 'meetsAdminFloor(non-admin / none) === false');
  check(INTELLIGENCE_PERMISSION_ID === 'intelligence.use' && OVERRIDES_PATH === 'userPermissionOverrides',
    "the capability id is 'intelligence.use', read from the existing /userPermissionOverrides node");

  section('readIntelligenceGrant — shape tolerance + fail-closed');
  check((await readIntelligenceGrant(db, 'evan')).granted === true, 'array shape → granted');
  const listyDb = makeFakeDb({ userPermissionOverrides: { z: { permissions: { 0: 'a.b', 1: 'intelligence.use' } } } });
  check((await readIntelligenceGrant(listyDb, 'z')).granted === true, "RTDB list-like {0:..,1:..} shape → granted");
  check((await readIntelligenceGrant(db, 'plainadmin')).granted === false, 'present record without the id → not granted');
  check((await readIntelligenceGrant(db, 'ghost')).ok === true && (await readIntelligenceGrant(db, 'ghost')).granted === false, 'absent record → { ok:true, granted:false }');
  check((await readIntelligenceGrant(null, 'evan')).ok === false, 'no db → { ok:false }');

  /* ── §7 MANDATORY security regression ─────────────────────────────── */
  section('§7 MANDATORY — a global flag / admin role is NOT sufficient authorization');
  check((await canUseIntelligence({ role: 'admin' }, { uid: 'arbitrary-admin-account', db: makeFakeDb(grantSeed()) })).ok === false,
    '§7: an ARBITRARY admin (no intelligence.use grant) is DENIED — the Phase 3C blocker stays closed');
  const permSrc = fs.readFileSync(path.join(ROOT, 'functions/src/intelligence/serverPermissions.js'), 'utf8');
  check(/userPermissionOverrides/.test(permSrc) && /intelligence\.use/.test(permSrc) && /\.once\(/.test(permSrc),
    '§7: serverPermissions.js still reads an explicit intelligence.use grant from /userPermissionOverrides (fails if reverted to role-only)');
  check(/meetsAdminFloor/.test(permSrc) && /grant\.granted/.test(permSrc),
    '§7: the gate still combines the admin floor AND the grant (both required)');

  /* ── the callable boundary (generateCompletion + intelligenceConversation) ── */
  section('callable boundary — generateCompletion.run() enforces the grant (brief §6 F/G/H)');
  const fcDb = makeFakeDb({
    ...grantSeed(),
    feature_flags: { intelligence: { enabled: true } },   // flag ON — must STILL not rescue an ungranted admin
  });
  require.cache[require.resolve('../functions/src/config/admin')] = {
    id: 'admin-shim', loaded: true, exports: { admin: {}, auth: {}, db: fcDb },
  };
  delete require.cache[require.resolve('../functions/src/intelligence/config')];
  delete require.cache[require.resolve('../functions/src/intelligence/generateCompletion')];
  delete require.cache[require.resolve('../functions/src/intelligence/intelligenceConversation')];
  const { generateCompletion } = require('../functions/src/intelligence/generateCompletion');
  const { intelligenceConversation } = require('../functions/src/intelligence/intelligenceConversation');

  const envelope = {
    schema: 'model-completion@1', requestId: 'r', purpose: 'nor.draft',
    messages: [{ role: 'system', content: 's' }, { role: 'user', content: 'u' }],
    expectJson: false, maxOutputTokens: null, determinism: 0.7,
  };
  const realFetch = globalThis.fetch;
  let fetchHits = 0;
  globalThis.fetch = async () => { fetchHits += 1; throw new Error('no OpenAI call in this test'); };
  try {
    let e;
    e = null; try { await generateCompletion.run({ data: { completion: envelope }, auth: { uid: 'plainadmin', token: { role: 'admin' } } }); } catch (x) { e = x; }
    check(e && e.code === 'permission-denied', 'G: flag ON + admin WITHOUT intelligence.use → permission-denied (flag never rescues)');

    e = null; try { await generateCompletion.run({ data: { completion: envelope }, auth: { uid: 'bob', token: { role: 'driver' } } }); } catch (x) { e = x; }
    check(e && e.code === 'permission-denied', 'non-admin → permission-denied');

    // H: granted admin + flag ON → passes authz + the flag check, reaches the
    // Secret-Manager key stage. No key is bound in this test, so it returns a
    // typed NOT_CONFIGURED result and STILL makes zero OpenAI calls — proof the
    // boundary opens for the pilot without any real model request in this phase.
    const okAuthz = await generateCompletion.run({ data: { completion: envelope }, auth: { uid: 'evan', token: { role: 'admin' } } });
    check(okAuthz && okAuthz.schema === 'model-completion@1' && okAuthz.ok === false && okAuthz.error && okAuthz.error.code === 'NOT_CONFIGURED',
      'H: granted admin + flag ON → PASSES authz + flag, reaches the key stage → typed NOT_CONFIGURED (not DISABLED, not permission-denied)');
    check(fetchHits === 0, 'H: ZERO real OpenAI requests — no key is bound, so the model is never called');

    // intelligenceConversation must enforce the SAME grant (no bypass).
    e = null; try { await intelligenceConversation.run({ data: { op: 'list' }, auth: { uid: 'plainadmin', token: { role: 'admin' } } }); } catch (x) { e = x; }
    check(e && e.code === 'permission-denied', 'intelligenceConversation: admin WITHOUT intelligence.use → permission-denied (same boundary, no bypass)');

    const listed = await intelligenceConversation.run({ data: { op: 'list' }, auth: { uid: 'evan', token: { role: 'admin' } } });
    check(listed && listed.ok === true, 'intelligenceConversation: granted admin → allowed');
  } finally {
    globalThis.fetch = realFetch;
  }

  /* ── §J — actorId stays auth.uid ─────────────────────────────────── */
  section('§J — conversation ownership stays server-derived (auth.uid)');
  const convSrc = fs.readFileSync(path.join(ROOT, 'functions/src/intelligence/intelligenceConversation.js'), 'utf8');
  check(/const uid = auth\.uid/.test(convSrc) && /actorId:\s*uid/.test(convSrc),
    'intelligenceConversation still forces record.actorId = auth.uid (unchanged by this phase)');
  const created = await intelligenceConversation.run({
    data: { op: 'create', record: {
      schema: 'intelligence-conversation@1', convId: 'convJ', version: 1, actorId: 'CLIENT-LIE',
      actorRole: 'admin', sourceModule: 'intelligence', sourceFeature: null, task: 'nor.generate',
      domainType: 'nor', openingUtterance: 'x', collectedFields: { a: 1 }, missingFields: [],
      status: 'needs_input', draft: null, numbering: null, turnCount: 1,
      turns: [{ turn: 1, at: '2026-08-31T00:00:00.000Z', answers: {}, status: 'needs_input', missingFields: [], requestId: 'r' }],
      knowledgeRefs: [], memoryRefs: [], createdAt: '2026-08-31T00:00:00.000Z', updatedAt: '2026-08-31T00:00:00.000Z',
    } },
    auth: { uid: 'evan', token: { role: 'admin' } },
  });
  check(created.ok && created.data.actorId === 'evan', 'a client-supplied actorId is overwritten with the authenticated uid');

  /* ── §K — cross-owner access still forbidden (both users granted) ── */
  section('§K — cross-owner conversation access remains FORBIDDEN');
  const bGet = await intelligenceConversation.run({ data: { op: 'get', convId: 'convJ' }, auth: { uid: 'userB', token: { role: 'admin' } } });
  check(!bGet.ok && bGet.error.code === 'FORBIDDEN', 'granted user B cannot read granted user A\'s conversation (ownership is a separate check)');

  /* ── §I — the client cannot self-grant intelligence.use ──────────── */
  section('§I — /userPermissionOverrides has NO self-write path (browser cannot self-grant)');
  const rulesRaw = fs.readFileSync(path.join(ROOT, 'database.rules.json'), 'utf8');
  const rulesNoComments = rulesRaw.replace(/^\s*\/\/.*$/gm, '');
  const rules = JSON.parse(rulesNoComments);
  const upo = rules.rules.userPermissionOverrides && rules.rules.userPermissionOverrides.$username;
  check(!!upo, 'database.rules.json has the userPermissionOverrides/$username node');
  check(typeof upo['.write'] === 'string'
    && /auth\.token\.role === 'admin'/.test(upo['.write'])
    && /adminEquivalent === true/.test(upo['.write'])
    && !/auth\.uid\s*===?\s*\$username/.test(upo['.write']),
    '.write requires admin/adminEquivalent and has NO `auth.uid === $username` self-write branch');
  check(/auth\.uid === \$username/.test(upo['.read']),
    '.read DOES allow the subject to read their own record (self-read is fine; self-WRITE is what is forbidden)');
  const idxValidate = upo.permissions && upo.permissions.$index && upo.permissions.$index['.validate'];
  check(typeof idxValidate === 'string' && /newData\.isString\(\)/.test(idxValidate) && /!==\s*'system\.admin'/.test(idxValidate),
    "the permissions .validate accepts any string except 'system.admin' — so 'intelligence.use' is grantable by an admin with NO rule change");
  // sanity: the id we chose satisfies that validate, and a dangerous id does not
  check('intelligence.use' !== 'system.admin', "'intelligence.use' passes the .validate (isString && !== system.admin)");

  /* ── §L — V1 auth / permission architecture untouched by this phase ── */
  section('§L — V1 permission + auth architecture is untouched');
  const verifyPinSrc = fs.readFileSync(path.join(ROOT, 'functions/src/auth/verifyPin.js'), 'utf8');
  check(/createCustomToken\(username, \{ role, \.\.\.extraClaims \}\)/.test(verifyPinSrc),
    'verifyPin.js still mints exactly { role, ...extraClaims } — this phase adds NO token claim');
  check(!/intelligence/i.test(verifyPinSrc), 'verifyPin.js has no Intelligence-specific logic (grant lives in RTDB, not the token)');
  check(!/require\(['"].*permission-registry/.test(permSrc) && !/permission-registry/.test(permSrc),
    'serverPermissions.js does not import or touch the client permission-registry');
  check(!/PERMISSIONS\s*=|role-permissions|role-registry/.test(permSrc),
    'serverPermissions.js defines no permission catalogue — it only checks one id against the existing grant node');

  console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'} — ${fail} failing check(s).`);
  process.exit(fail === 0 ? 0 : 1);
})();
