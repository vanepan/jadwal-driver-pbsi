/* ============================================================
   intelligence-authz-check.cjs — Sarpras Intelligence (V2, 3C access model)

   The dedicated proof of the Sarpras Intelligence server authorization
   boundary (the WHO). Current product decision:

     Sarpras Intelligence is a capability of the ADMIN role.
       role === 'admin'          → authorized
       adminEquivalent === true  → authorized (effective admin — same as
                                   every admin-tier database.rules.json rule)
       anything else             → DENIED

   No Individual Permission Assignment / per-user grant is required. The
   feature flag /feature_flags/intelligence/enabled is a SEPARATE WHAT/WHEN
   switch — OFF still blocks model execution for an authorized admin.

   Covers: the token-only authz matrix, the SHARED boundary
   (generateCompletion + intelligenceConversation), flag-OFF → DISABLED
   after authorization, ownership still auth.uid, cross-owner still
   FORBIDDEN, no client-side bypass, no secret leak.

   No emulator, no network, no OpenAI. Fake Admin SDK db.

   Run:  node scripts/intelligence-authz-check.cjs   (exit 0 = pass)
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

/* ── faithful, path-aware fake Admin SDK db (used only by the store) ─── */
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

/* ══════════════════════════════════════════════════════════════════════ */

const {
  canUseIntelligence, isEffectiveAdmin, INTELLIGENCE_PERMISSION_ID,
} = require('../functions/src/intelligence/serverPermissions');

(async () => {
  section('serverPermissions.canUseIntelligence — token-only authz matrix');

  // 1 — admin → allowed
  check(canUseIntelligence({ role: 'admin' }).ok === true, '1: role "admin" → ALLOWED');
  check(canUseIntelligence({ role: 'admin' }).role === 'admin', '   returns the role');

  // 2 — adminEquivalent → allowed (documented + tested)
  check(canUseIntelligence({ role: 'ops_lead', adminEquivalent: true }).ok === true,
    '2: adminEquivalent === true → ALLOWED (effective admin — same as every admin-tier RTDB rule)');
  check(canUseIntelligence({ adminEquivalent: true }).ok === true,
    '2: adminEquivalent === true with no role string → ALLOWED');
  check(canUseIntelligence({ role: 'x', adminEquivalent: 'true' }).ok === false,
    '2: adminEquivalent must be the boolean true — the STRING "true" does NOT authorize');
  check(canUseIntelligence({ role: 'x', adminEquivalent: 1 }).ok === false,
    '2: adminEquivalent === 1 does NOT authorize');

  // 3 — non-admin → denied
  for (const role of ['driver', 'bidang', 'viewer', 'engineering_coordinator', 'engineering_member', 'some_custom_role']) {
    check(canUseIntelligence({ role }).ok === false, `3: role "${role}" → DENIED`);
  }

  // 4 — unauthenticated / malformed → denied (fail closed)
  check(canUseIntelligence(undefined).ok === false, '4: no token → DENIED');
  check(canUseIntelligence(null).ok === false, '4: null token → DENIED');
  check(canUseIntelligence({}).ok === false, '4: empty token → DENIED');
  check(canUseIntelligence({ role: 42 }).ok === false, '4: non-string role → DENIED');

  // denial reason leaks nothing sensitive
  const r = canUseIntelligence({ role: 'driver' });
  check(r.reason && !/password|pin|secret|key|sk-|token|bearer/i.test(r.reason), 'the denial reason leaks nothing sensitive');

  section('isEffectiveAdmin helper — the exported building block');
  check(isEffectiveAdmin({ role: 'admin' }) === true && isEffectiveAdmin({ adminEquivalent: true }) === true, 'isEffectiveAdmin: admin / adminEquivalent → true');
  check(isEffectiveAdmin({ role: 'driver' }) === false && isEffectiveAdmin(undefined) === false, 'isEffectiveAdmin: non-admin / none → false');
  check(INTELLIGENCE_PERMISSION_ID === 'intelligence.use', "INTELLIGENCE_PERMISSION_ID names the capability ('intelligence.use')");

  section('static — no per-user grant read, no RTDB I/O in the authz decision');
  const permSrc = fs.readFileSync(path.join(ROOT, 'functions/src/intelligence/serverPermissions.js'), 'utf8');
  const permCode = permSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  check(!/readIntelligenceGrant|OVERRIDES_PATH|db\.ref\(|\.once\(/.test(permCode), 'serverPermissions.js no longer reads a per-user grant — the 3C-PREP /userPermissionOverrides read is gone');
  check(!/require\(['"]\.\.\/config\/admin|require\(['"]firebase-admin/.test(permCode), 'serverPermissions.js performs NO RTDB I/O — decision is token-only, synchronous');
  check(/role === 'admin'/.test(permCode) && /adminEquivalent === true/.test(permCode), "the check is `role === 'admin' || adminEquivalent === true` — the canonical admin-tier shape");
  check(!/require\(['"].*permission-registry/.test(permCode) && !/PERMISSIONS\s*=/.test(permCode), 'no client permission-registry import, no permission catalogue defined here');
  check(/^function canUseIntelligence\(authToken\)/m.test(permCode), 'canUseIntelligence is synchronous and token-only (no ctx / uid / db argument)');

  /* ── the callable boundary: generateCompletion + intelligenceConversation
        share the SAME authorization. Flag ON is seeded to prove the flag is
        not what authorizes — the admin role is. ────────────────────────── */
  section('callable boundary — generateCompletion.run() (tests 1/3/4/5/6/7)');
  const fcDb = makeFakeDb({ feature_flags: { intelligence: { enabled: true } } });
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
    // 4: unauthenticated
    e = null; try { await generateCompletion.run({ data: { completion: envelope } }); } catch (x) { e = x; }
    check(e && e.code === 'unauthenticated', '4: no auth → HttpsError(unauthenticated)');

    // 3: non-admin denied
    e = null; try { await generateCompletion.run({ data: { completion: envelope }, auth: { uid: 'bob', token: { role: 'driver' } } }); } catch (x) { e = x; }
    check(e && e.code === 'permission-denied', '3: authenticated non-admin → HttpsError(permission-denied)');

    // 1: ANY admin allowed (no per-user grant) — flag ON, no key bound → typed NOT_CONFIGURED, ZERO OpenAI
    const anyAdmin = await generateCompletion.run({ data: { completion: envelope }, auth: { uid: 'any-admin-account', token: { role: 'admin' } } });
    check(anyAdmin && anyAdmin.schema === 'model-completion@1' && anyAdmin.ok === false && anyAdmin.error.code === 'NOT_CONFIGURED',
      '1/6: ANY admin (no grant) + flag ON → PASSES authz + flag, reaches key stage → typed NOT_CONFIGURED');
    check(fetchHits === 0, '   ZERO real OpenAI requests (no key bound)');

    // 2: adminEquivalent allowed
    const adminEq = await generateCompletion.run({ data: { completion: envelope }, auth: { uid: 'ceq', token: { role: 'ops_lead', adminEquivalent: true } } });
    check(adminEq && adminEq.ok === false && adminEq.error.code === 'NOT_CONFIGURED', '2: adminEquivalent → PASSES authz (same as admin)');

    // 5: flag OFF → DISABLED AFTER authorization (re-require config with a flag-OFF db)
    const offDb = makeFakeDb({});
    require.cache[require.resolve('../functions/src/config/admin')].exports.db = offDb;
    delete require.cache[require.resolve('../functions/src/intelligence/config')];
    delete require.cache[require.resolve('../functions/src/intelligence/generateCompletion')];
    const { generateCompletion: gcOff } = require('../functions/src/intelligence/generateCompletion');
    const disabled = await gcOff.run({ data: { completion: envelope }, auth: { uid: 'evan', token: { role: 'admin' } } });
    check(disabled && disabled.ok === false && disabled.error.code === 'DISABLED',
      '5: admin authorized + flag OFF → typed DISABLED (authorization passed FIRST, then the flag blocked it)');
    check(fetchHits === 0, '   still ZERO OpenAI requests');

    // 7: intelligenceConversation shares the boundary
    e = null; try { await intelligenceConversation.run({ data: { op: 'list' }, auth: { uid: 'bob', token: { role: 'driver' } } }); } catch (x) { e = x; }
    check(e && e.code === 'permission-denied', '7: intelligenceConversation — non-admin → permission-denied (same boundary)');
    const listed = await intelligenceConversation.run({ data: { op: 'list' }, auth: { uid: 'any-admin-account', token: { role: 'admin' } } });
    check(listed && listed.ok === true, '7: intelligenceConversation — ANY admin → allowed (same boundary, no grant needed)');
    e = null; try { await intelligenceConversation.run({ data: { op: 'list' } }); } catch (x) { e = x; }
    check(e && e.code === 'unauthenticated', '7: intelligenceConversation — unauthenticated → unauthenticated');
  } finally {
    globalThis.fetch = realFetch;
  }

  /* ── ownership: unchanged, independent of authz ──────────────────── */
  section('ownership — actorId is auth.uid; cross-owner is FORBIDDEN');
  const convSrc = fs.readFileSync(path.join(ROOT, 'functions/src/intelligence/intelligenceConversation.js'), 'utf8');
  check(/const uid = auth\.uid/.test(convSrc) && /actorId:\s*uid/.test(convSrc),
    'intelligenceConversation still forces record.actorId = auth.uid');
  const created = await intelligenceConversation.run({
    data: { op: 'create', record: {
      schema: 'intelligence-conversation@1', convId: 'convO', version: 1, actorId: 'CLIENT-LIE',
      actorRole: 'admin', sourceModule: 'intelligence', sourceFeature: null, task: 'nor.generate',
      domainType: 'nor', openingUtterance: 'x', collectedFields: { a: 1 }, missingFields: [],
      status: 'needs_input', draft: null, numbering: null, turnCount: 1,
      turns: [{ turn: 1, at: '2026-09-01T00:00:00.000Z', answers: {}, status: 'needs_input', missingFields: [], requestId: 'r' }],
      knowledgeRefs: [], memoryRefs: [], createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z',
    } },
    auth: { uid: 'userA', token: { role: 'admin' } },
  });
  check(created.ok && created.data.actorId === 'userA', 'a client-supplied actorId is overwritten with the authenticated uid');
  const bGet = await intelligenceConversation.run({ data: { op: 'get', convId: 'convO' }, auth: { uid: 'userB', token: { role: 'admin' } } });
  check(!bGet.ok && bGet.error.code === 'FORBIDDEN', 'admin user B cannot read admin user A\'s conversation (ownership is a separate check)');

  /* ── 8 — no client-side auth bypass ─────────────────────────────── */
  section('8 — the client cannot self-authorize');
  const fbSrc = fs.readFileSync(path.join(ROOT, 'js/firebase.js'), 'utf8');
  check(!/isV2Enabled/.test(fbSrc), 'js/firebase.js (the callable wrappers) does not gate on isV2Enabled — the server does the WHO check');
  const gates = fs.readFileSync(path.join(ROOT, 'js/config/feature-gates.js'), 'utf8');
  check(/role !== 'admin'/.test(gates) && /V2_PILOT_ALLOWLIST/.test(gates), 'isV2Enabled() is a CLIENT UI-visibility gate only (role + allowlist) — it never reaches the server');
  const permOnly = permSrc.replace(/\/\*[\s\S]*?\*\//g, '');
  check(!/createCustomToken|request\.data|req\.body|data\.[a-z]/.test(permOnly),
    'serverPermissions.js never mints a claim and never reads the request body — only the verified authToken argument');
  // the callables pass request.auth.token (verified), not request.data
  const gcSrc = fs.readFileSync(path.join(ROOT, 'functions/src/intelligence/generateCompletion.js'), 'utf8');
  check(/canUseIntelligence\(auth\.token\)/.test(gcSrc) && /canUseIntelligence\(auth\.token\)/.test(convSrc),
    'both callables call canUseIntelligence(auth.token) — the verified claim, never a client field');
  check(!/const \{ db \}\s*=\s*require\(['"]\.\.\/config\/admin/.test(gcSrc),
    'generateCompletion.js no longer imports db for authz (dead 3C-PREP import removed)');

  /* ── 9 — no secret leakage ─────────────────────────────────────── */
  section('9 — no OpenAI key / endpoint anywhere it should not be');
  for (const f of ['serverPermissions.js', 'intelligenceConversation.js']) {
    const s = fs.readFileSync(path.join(ROOT, 'functions/src/intelligence', f), 'utf8');
    check(!/sk-[A-Za-z0-9]|OPENAI_API_KEY|api\.openai\.com|process\.env/i.test(s.replace(/\/\*[\s\S]*?\*\//g, '')),
      `functions/src/intelligence/${f}: no key / endpoint / env-var`);
  }
  check(!/api\.openai\.com/.test(fbSrc), 'js/firebase.js: no OpenAI endpoint (server-only)');

  console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'} — ${fail} failing check(s).`);
  process.exit(fail === 0 ? 0 : 1);
})();
