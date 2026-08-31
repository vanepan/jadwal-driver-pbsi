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

/* ── 2. server permissions ────────────────────────────────────────────── */
section('serverPermissions (PART 11)');
const { canUseIntelligence } = require('../functions/src/intelligence/serverPermissions');
check(canUseIntelligence({ role: 'admin' }).ok === true, 'admin → allowed');
check(canUseIntelligence({ role: 'engineering_coordinator', adminEquivalent: true }).ok === true, 'adminEquivalent → allowed');
check(canUseIntelligence({ role: 'driver' }).ok === false, 'driver → denied');
check(canUseIntelligence({ role: 'bidang' }).ok === false, 'bidang → denied');
check(canUseIntelligence(undefined).ok === false, 'no token → denied (fail closed)');
check(canUseIntelligence({ role: 'driver' }).reason && !/password|key|secret/i.test(canUseIntelligence({ role: 'driver' }).reason), 'the denial reason leaks nothing sensitive');

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
}

/* ── 5. no key literal / no client leak ───────────────────────────────── */
function noLeak() {
  section('No secret literal / no client-side endpoint (PART 5, PART 25)');
  const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  for (const f of ['config.js', 'serverPermissions.js', 'openaiClient.js', 'generateCompletion.js', 'model-completion-contract.js']) {
    const src = stripComments(fs.readFileSync(path.join(ROOT, 'functions/src/intelligence', f), 'utf8'));
    check(!/['"]sk-[A-Za-z0-9_-]{12,}['"]/.test(src) || f === undefined, `functions/src/intelligence/${f}: no OpenAI key literal`);
    check(!/OPENAI_API_KEY\s*=\s*['"]/.test(src), `functions/src/intelligence/${f}: no key assignment`);
  }
  check(/OPENAI_API_KEY\.value\(\)/.test(fs.readFileSync(path.join(ROOT, 'functions/src/intelligence/generateCompletion.js'), 'utf8')), 'the key is read only from Secret Manager at call time (OPENAI_API_KEY.value())');
  // the client surface must still not reference the OpenAI endpoint
  const clientFiles = [path.join(ROOT, 'js/firebase.js')];
  for (const cf of clientFiles) {
    check(!/api\.openai\.com/.test(fs.readFileSync(cf, 'utf8')), `${path.relative(ROOT, cf)} does not reference api.openai.com (server-only)`);
  }
  check(/callGenerateCompletion/.test(fs.readFileSync(path.join(ROOT, 'js/firebase.js'), 'utf8')), 'js/firebase.js exposes callGenerateCompletion (the httpsCallable wrapper, no key)');
}

(async () => {
  await run();
  configAndCallable();
  noLeak();
  console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'} — ${fail} failing check(s).`);
  process.exit(fail === 0 ? 0 : 1);
})();
