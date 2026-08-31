/* ============================================================
   intelligence-functions-check.cjs — Sarpras Intelligence (V2, Phase 1)

   CJS test for the SERVER-SIDE OpenAI boundary (functions/src/intelligence/).
   No emulator, no network — the OpenAI call is exercised with a stubbed
   fetch. Proves:

     • CJS ⇄ ESM contract DRIFT: functions/.../model-completion-contract.js
       matches src/intelligence/providers/model-completion-contract.js
     • serverPermissions: admin / adminEquivalent allowed; anyone else denied
     • openaiClient.callChatCompletion — every failure mode is a TYPED,
       non-throwing ModelCompletionResult; the key never appears in a result;
       401→AUTH, 429→QUOTA, 5xx→PROVIDER_ERROR, abort→TIMEOUT, throw→NETWORK,
       bad JSON→INVALID_OUTPUT, empty content→INVALID_OUTPUT
     • config: INTELLIGENCE_FLAGS ships enabled:false
     • generateCompletion.js loads and exports the callable (staged, unwired)
     • no key literal / no client-side endpoint leak

   Run:  node scripts/intelligence-functions-check.cjs   (exit 0 = pass)
   ============================================================ */

'use strict';

// functions/src/config/admin.js calls admin.database() at load — give it a
// URL so a bare `node` run can require the modules. Nothing here ever
// connects (no db call is made); this only satisfies ensureUrl().
process.env.FIREBASE_CONFIG = process.env.FIREBASE_CONFIG
  || JSON.stringify({ databaseURL: 'https://check-only.firebaseio.com', projectId: 'check-only' });
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || 'check-only';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
let fail = 0;
const check = (cond, msg) => { console.log(`${cond ? '✓' : '✗'} ${msg}`); if (!cond) fail++; };
const section = (t) => console.log(`\n── ${t} ──`);

/* ── 1. contract drift ─────────────────────────────────────────────────── */
section('CJS ⇄ ESM contract drift');
const cjsC = require('../functions/src/intelligence/model-completion-contract');
const esmSrc = fs.readFileSync(path.join(ROOT, 'src/intelligence/providers/model-completion-contract.js'), 'utf8');
check(cjsC.MODEL_COMPLETION_SCHEMA === 'model-completion@1' && esmSrc.includes("'model-completion@1'"), 'schema string matches on both sides');
for (const code of ['DISABLED', 'NOT_CONFIGURED', 'AUTH', 'QUOTA', 'TIMEOUT', 'NETWORK', 'PROVIDER_ERROR', 'INVALID_OUTPUT', 'INVALID_REQUEST']) {
  check(cjsC.MODEL_COMPLETION_ERRORS[code] === code && esmSrc.includes(`${code}: '${code}'`), `error code ${code} present in both`);
}
check(JSON.stringify(cjsC.MESSAGE_ROLE) === JSON.stringify({ SYSTEM: 'system', USER: 'user', ASSISTANT: 'assistant' }), 'MESSAGE_ROLE matches');
check(cjsC.isModelCompletionResult(cjsC.modelCompletionResult({ text: 'x' })) && !cjsC.isModelCompletionResult({}), 'CJS validators behave');

/* ── 2. server permissions — admin FLOOR + explicit intelligence.use grant
      (Phase 3C-PREP). The gate is now NARROWER than "is an admin". Async —
      driven from the bottom orchestrator (see serverPermissions() below). ── */
const {
  canUseIntelligence, meetsAdminFloor, readIntelligenceGrant,
  INTELLIGENCE_PERMISSION_ID, OVERRIDES_PATH,
} = require('../functions/src/intelligence/serverPermissions');

/** a path-aware fake of the Admin SDK db: reads only
 *  userPermissionOverrides/<uid>/permissions */
function grantDb(grants /* { uid: string[] } */) {
  return {
    ref(p) {
      return {
        async once() {
          const m = /^userPermissionOverrides\/([^/]+)\/permissions$/.exec(p);
          const val = m && grants[m[1]] ? grants[m[1]] : null;
          return { val: () => val };
        },
      };
    },
  };
}

async function serverPermissions() {
  section('serverPermissions (PART 11 + Phase 3C-PREP pilot grant)');
  const dbWith = grantDb({ evan: [INTELLIGENCE_PERMISSION_ID], other: ['warehouse.item.edit'] });
  const dbEmpty = grantDb({});

  check(INTELLIGENCE_PERMISSION_ID === 'intelligence.use', "the capability id is 'intelligence.use'");
  check(OVERRIDES_PATH === 'userPermissionOverrides', 'the grant is read from the EXISTING /userPermissionOverrides node');

  // the admin floor helper — necessary, not sufficient
  check(meetsAdminFloor({ role: 'admin' }) === true && meetsAdminFloor({ role: 'x', adminEquivalent: true }) === true, 'meetsAdminFloor: admin / adminEquivalent → true');
  check(meetsAdminFloor({ role: 'driver' }) === false && meetsAdminFloor(undefined) === false, 'meetsAdminFloor: non-admin / no token → false');

  // the full async gate
  check((await canUseIntelligence({ role: 'admin' }, { uid: 'evan', db: dbWith })).ok === true, 'A: admin WITH intelligence.use → allowed');
  check((await canUseIntelligence({ role: 'engineering_coordinator', adminEquivalent: true }, { uid: 'evan', db: dbWith })).ok === true, 'adminEquivalent WITH intelligence.use → allowed');
  check((await canUseIntelligence({ role: 'admin' }, { uid: 'other', db: dbWith })).ok === false, 'B: admin WITHOUT intelligence.use → DENIED (admin role / global flag is not enough)');
  check((await canUseIntelligence({ role: 'admin' }, { uid: 'nobody', db: dbEmpty })).ok === false, 'admin, no override record at all → DENIED (fail closed)');
  check((await canUseIntelligence({ role: 'driver' }, { uid: 'evan', db: dbWith })).ok === false, 'D: non-admin (even with a grant record) → DENIED (admin floor not met)');
  check((await canUseIntelligence({ role: 'admin' }, {})).ok === false, 'admin but no { uid, db } context → DENIED (fail closed — never floor-only)');
  check((await canUseIntelligence(undefined, { uid: 'evan', db: dbWith })).ok === false, 'E: no token → DENIED');
  const denyReason = (await canUseIntelligence({ role: 'admin' }, { uid: 'other', db: dbWith })).reason;
  check(denyReason && !/password|key|secret|sk-/i.test(denyReason), 'the denial reason leaks nothing sensitive');
  const throwDb = { ref() { return { once() { throw new Error('rtdb down'); } }; } };
  check((await readIntelligenceGrant(throwDb, 'evan')).ok === false, 'readIntelligenceGrant: an RTDB read error → { ok:false } (fail closed)');
  check((await readIntelligenceGrant(dbWith, '')).ok === false, 'readIntelligenceGrant: missing uid → { ok:false }');

  // §7 MANDATORY security regression — the Phase 3C blocker must stay closed.
  // Fails if canUseIntelligence() is ever reduced to `role === 'admin' || adminEquivalent`.
  check((await canUseIntelligence({ role: 'admin' }, { uid: 'arbitrary-admin', db: dbEmpty })).ok === false,
    '§7 REGRESSION: admin role alone is NOT sufficient authorization for an arbitrary admin');
  const permSrc = fs.readFileSync(path.join(ROOT, 'functions/src/intelligence/serverPermissions.js'), 'utf8');
  check(/userPermissionOverrides/.test(permSrc) && /intelligence\.use/.test(permSrc) && /once\(/.test(permSrc),
    '§7 REGRESSION: serverPermissions.js still reads an explicit intelligence.use grant from /userPermissionOverrides');
}

/* ── 3. openaiClient — every failure mode is typed + non-throwing ──────── */
section('openaiClient.callChatCompletion — typed failure modes (PART 13)');
const { callChatCompletion, OPENAI_URL } = require('../functions/src/intelligence/openaiClient');
const { MODEL_COMPLETION_ERRORS: E } = cjsC;
const baseArgs = { apiKey: 'sk-TESTONLY-not-real', model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'hi' }], determinism: 0.7, timeoutMs: 5000 };
const jsonResp = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

async function run() {
  check(OPENAI_URL === 'https://api.openai.com/v1/chat/completions', 'endpoint is the server-side OpenAI URL');

  let r = await callChatCompletion({ ...baseArgs, apiKey: '', fetchImpl: async () => jsonResp(200, {}) });
  check(r.ok === false && r.error.code === E.NOT_CONFIGURED, 'no apiKey → NOT_CONFIGURED (no call attempted)');

  let sentAuth = null;
  r = await callChatCompletion({ ...baseArgs, fetchImpl: async (_url, opts) => { sentAuth = opts.headers.Authorization; return jsonResp(200, { model: 'gpt-4o-mini', choices: [{ message: { content: 'Badan surat.' } }], usage: { prompt_tokens: 11, completion_tokens: 22 } }); } });
  check(r.ok === true && r.text === 'Badan surat.' && r.usage.inputTokens === 11 && r.usage.outputTokens === 22, 'a 200 with content → ok result with usage');
  check(sentAuth === 'Bearer sk-TESTONLY-not-real', 'the key is sent as a Bearer header to OpenAI (server-side only)');
  check(!JSON.stringify(r).includes('sk-TESTONLY'), 'the key NEVER appears in the returned result');

  r = await callChatCompletion({ ...baseArgs, fetchImpl: async () => jsonResp(401, { error: { message: 'bad key' } }) });
  check(r.ok === false && r.error.code === E.AUTH && !/bad key/.test(r.error.message), '401 → AUTH, and the provider message is NOT echoed');

  r = await callChatCompletion({ ...baseArgs, fetchImpl: async () => jsonResp(429, {}) });
  check(r.ok === false && r.error.code === E.QUOTA, '429 → QUOTA');

  r = await callChatCompletion({ ...baseArgs, fetchImpl: async () => jsonResp(503, {}) });
  check(r.ok === false && r.error.code === E.PROVIDER_ERROR, '503 → PROVIDER_ERROR');

  r = await callChatCompletion({ ...baseArgs, fetchImpl: async () => { const e = new Error('aborted'); e.name = 'AbortError'; throw e; } });
  check(r.ok === false && r.error.code === E.TIMEOUT, 'an AbortError → TIMEOUT');

  r = await callChatCompletion({ ...baseArgs, fetchImpl: async () => { throw new Error('ECONNRESET'); } });
  check(r.ok === false && r.error.code === E.NETWORK, 'a thrown transport error → NETWORK (never propagated)');

  r = await callChatCompletion({ ...baseArgs, fetchImpl: async () => ({ ok: true, status: 200, json: async () => { throw new Error('not json'); } }) });
  check(r.ok === false && r.error.code === E.INVALID_OUTPUT, 'a non-JSON body → INVALID_OUTPUT');

  r = await callChatCompletion({ ...baseArgs, fetchImpl: async () => jsonResp(200, { choices: [{ message: { content: '   ' } }] }) });
  check(r.ok === false && r.error.code === E.INVALID_OUTPUT, 'an empty completion → INVALID_OUTPUT');

  // determinism → temperature mapping is bounded
  let sentBody = null;
  await callChatCompletion({ ...baseArgs, determinism: 1, fetchImpl: async (_u, o) => { sentBody = JSON.parse(o.body); return jsonResp(200, { choices: [{ message: { content: 'x' } }], usage: {} }); } });
  check(sentBody && sentBody.temperature === 0, 'determinism 1 → temperature 0');
}

/* ── 4. config + callable load ────────────────────────────────────────── */
function configAndCallable() {
  section('config + callable module');
  const { INTELLIGENCE_FLAGS } = require('../functions/src/intelligence/config');
  check(INTELLIGENCE_FLAGS.enabled === false, 'INTELLIGENCE_FLAGS ships enabled:false (deploy-inert)');
  check(typeof INTELLIGENCE_FLAGS.model === 'string' && INTELLIGENCE_FLAGS.model.length > 0, 'a default model id is defined server-side');
  check(Object.isFrozen(INTELLIGENCE_FLAGS), 'INTELLIGENCE_FLAGS is frozen');

  const gc = require('../functions/src/intelligence/generateCompletion');
  check(typeof gc.generateCompletion === 'function' || (gc.generateCompletion && typeof gc.generateCompletion.run === 'function'), 'generateCompletion.js loads and exports the callable');

  // Phase 2A: the callable is now WIRED into the entrypoint (but still inert —
  // no secret set, feature flag OFF, no deploy run).
  const idx = fs.readFileSync(path.join(ROOT, 'functions/index.js'), 'utf8');
  check(/const\s*\{\s*generateCompletion\s*\}\s*=\s*require\(['"]\.\/src\/intelligence\/generateCompletion['"]\)/.test(idx), 'functions/index.js requires ./src/intelligence/generateCompletion (Phase 2A wiring)');
  check(/exports\.generateCompletion\s*=\s*generateCompletion\s*;/.test(idx), "functions/index.js exports.generateCompletion — the exact name js/firebase.js calls via httpsCallable('generateCompletion')");
  check(INTELLIGENCE_FLAGS.enabled === false, 'the wired callable is still inert — INTELLIGENCE_FLAGS.enabled is false');

  const secrets = fs.readFileSync(path.join(ROOT, 'functions/src/config/secrets.js'), 'utf8');
  check(/defineSecret\(['"]OPENAI_API_KEY['"]\)/.test(secrets), 'OPENAI_API_KEY is declared via defineSecret (Secret Manager, PART 5)');
  check(!/OPENAI_API_KEY\s*=\s*['"][^'"]+['"]/.test(secrets), 'secrets.js contains no OPENAI_API_KEY literal value');

  // Phase 2C: the conversation-state callable is wired (still not deployed).
  check(/const\s*\{\s*intelligenceConversation\s*\}\s*=\s*require\(['"]\.\/src\/intelligence\/intelligenceConversation['"]\)/.test(idx), 'functions/index.js requires ./src/intelligence/intelligenceConversation (Phase 2C wiring)');
  check(/exports\.intelligenceConversation\s*=\s*intelligenceConversation\s*;/.test(idx), "functions/index.js exports.intelligenceConversation — the name js/firebase.js calls via httpsCallable('intelligenceConversation')");
  const convSrc = fs.readFileSync(path.join(ROOT, 'functions/src/intelligence/intelligenceConversation.js'), 'utf8');
  check(/onCall\(\{\s*region:\s*REGION\s*\}/.test(convSrc) && !/secrets:/.test(convSrc), 'intelligenceConversation is a region-pinned callable with NO secret binding');
  check(/actorId:\s*uid/.test(convSrc) && /const uid = auth\.uid/.test(convSrc), 'the owner is ALWAYS auth.uid — a client-supplied actorId is overwritten (PART D)');
}

/* ── 5. no key literal / no client leak ───────────────────────────────── */
function noLeak() {
  section('No secret literal / no client-side endpoint (PART 5, PART 25)');
  const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const dir = path.join(ROOT, 'functions/src/intelligence');
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.js'))) {
    const src = stripComments(fs.readFileSync(path.join(dir, f), 'utf8'));
    check(!/['"]sk-[A-Za-z0-9_-]{12,}['"]/.test(src), `functions/src/intelligence/${f}: no OpenAI key literal`);
    check(!/OPENAI_API_KEY\s*=\s*['"]/.test(src), `functions/src/intelligence/${f}: no key assignment`);
    // only generateCompletion / openaiClient legitimately touch the key/endpoint
    if (f !== 'generateCompletion.js' && f !== 'openaiClient.js' && f !== 'config.js' && f !== 'secrets.js') {
      check(!/OPENAI_API_KEY|api\.openai\.com|process\.env/i.test(src), `functions/src/intelligence/${f}: no key / endpoint / env-var reference (Phase 2C files stay out of the model path)`);
    }
  }
  check(/OPENAI_API_KEY\.value\(\)/.test(fs.readFileSync(path.join(ROOT, 'functions/src/intelligence/generateCompletion.js'), 'utf8')), 'the key is read only from Secret Manager at call time (OPENAI_API_KEY.value())');
  // the client surface must still not reference the OpenAI endpoint
  const clientFiles = [path.join(ROOT, 'js/firebase.js')];
  for (const cf of clientFiles) {
    check(!/api\.openai\.com/.test(fs.readFileSync(cf, 'utf8')), `${path.relative(ROOT, cf)} does not reference api.openai.com (server-only)`);
  }
  check(/callGenerateCompletion/.test(fs.readFileSync(path.join(ROOT, 'js/firebase.js'), 'utf8')), 'js/firebase.js exposes callGenerateCompletion (the httpsCallable wrapper, no key)');
}

/* ── 6. generateCompletion behavioural matrix — .run() on the IDENTICAL
      deployed source (the deployed function == this file at HEAD). This
      covers the auth / authorization / feature-flag-OFF / typed-DISABLED /
      no-OpenAI-call path that cannot be exercised against the DEPLOYED
      function without an admin ID token (BLOCKED — see the report). ──── */
async function deployedBehaviour() {
  section('generateCompletion.run() — auth / authz / flag-OFF / no OpenAI call');

  // shim the Admin SDK db. getIntelligenceRuntimeConfig() reads
  // /feature_flags/intelligence (→ null → INTELLIGENCE_FLAGS defaults,
  // enabled:false — exactly as against the non-existent prod node) and
  // Phase 3C-PREP's canUseIntelligence() reads
  // /userPermissionOverrides/<uid>/permissions. 'evan' is granted
  // 'intelligence.use'; every other admin is NOT.
  const fakeDb = {
    ref: (p) => ({
      once: async () => {
        const m = /^userPermissionOverrides\/([^/]+)\/permissions$/.exec(String(p || ''));
        if (m) return { val: () => (m[1] === 'evan' ? ['intelligence.use'] : null) };
        return { val: () => null };   // /feature_flags/intelligence, /settings/intelligence → absent
      },
    }),
  };
  require.cache[require.resolve('../functions/src/config/admin')] = {
    id: 'admin-shim', loaded: true, exports: { admin: {}, auth: {}, db: fakeDb },
  };
  delete require.cache[require.resolve('../functions/src/intelligence/config')];
  delete require.cache[require.resolve('../functions/src/intelligence/generateCompletion')];
  const { generateCompletion } = require('../functions/src/intelligence/generateCompletion');

  const envelope = {
    schema: 'model-completion@1', requestId: 'req-x', purpose: 'nor.draft',
    messages: [{ role: 'system', content: 'sys' }, { role: 'user', content: 'hi' }],
    expectJson: false, maxOutputTokens: null, determinism: 0.7,
  };

  // no OpenAI call may happen — trap the global fetch.
  const realFetch = globalThis.fetch;
  let fetchHits = 0;
  globalThis.fetch = async () => { fetchHits += 1; throw new Error('fetch must not be called with the flag OFF'); };
  try {
    let threw;
    threw = null; try { await generateCompletion.run({ data: { completion: envelope } }); } catch (e) { threw = e; }
    check(threw && threw.code === 'unauthenticated', 'no auth → HttpsError(unauthenticated)');

    threw = null; try { await generateCompletion.run({ data: { completion: envelope }, auth: { uid: 'bob', token: { role: 'driver' } } }); } catch (e) { threw = e; }
    check(threw && threw.code === 'permission-denied', 'authenticated non-admin → HttpsError(permission-denied)');

    // Phase 3C-PREP §7: an ARBITRARY admin without the intelligence.use grant
    // is denied at the callable boundary — the global flag never rescues them.
    threw = null; try { await generateCompletion.run({ data: { completion: envelope }, auth: { uid: 'someadmin', token: { role: 'admin' } } }); } catch (e) { threw = e; }
    check(threw && threw.code === 'permission-denied', 'G/§7: admin WITHOUT intelligence.use → HttpsError(permission-denied) (before any flag/OpenAI logic)');

    threw = null; try { await generateCompletion.run({ data: { completion: { bad: 1 } }, auth: { uid: 'evan', token: { role: 'admin' } } }); } catch (e) { threw = e; }
    check(threw && threw.code === 'invalid-argument', 'granted admin + malformed envelope → HttpsError(invalid-argument)');

    const disabled = await generateCompletion.run({ data: { completion: envelope }, auth: { uid: 'evan', token: { role: 'admin' } } });
    check(disabled && disabled.ok === false && disabled.error && disabled.error.code === 'DISABLED', 'F: granted admin + flag OFF → typed { ok:false, error:{code:DISABLED} } (RETURNED, not thrown)');
    check(disabled.schema === 'model-completion@1', 'the DISABLED result is a well-formed ModelCompletionResult');

    check(fetchHits === 0, 'NO OpenAI call occurred at any point (global fetch never invoked)');
  } finally {
    globalThis.fetch = realFetch;
  }
}

(async () => {
  await serverPermissions();
  await run();
  configAndCallable();
  noLeak();
  await deployedBehaviour();
  console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'} — ${fail} failing check(s).`);
  process.exit(fail === 0 ? 0 : 1);
})();
