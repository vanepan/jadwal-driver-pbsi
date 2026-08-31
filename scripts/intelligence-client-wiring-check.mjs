/* ============================================================
   intelligence-client-wiring-check.mjs — Sarpras Intelligence (V2, Phase 2F)

   PURE node test. Proves the CLIENT backend wiring:

     • bootstrapIntelligenceClient() registers the 'callable' conversation
       backend + the 'openai' provider, from injected transports
     • feature flag OFF  → provider REGISTERED, Null Provider stays ACTIVE
       (deterministic path — zero OpenAI risk)
     • feature flag ON   → provider becomes ACTIVE
     • missing port      → controlled error, never a throw
     • the wired stack: createIntelligenceService + the callable store
       backend runs a real turn through the injected callConversation
     • deterministic path: flag OFF → a turn produces a template-body draft,
       callModel is NEVER invoked
     • static: js/intelligence-backend-wiring.js is a thin adapter over
       js/firebase.js + src/intelligence/client-bootstrap.js, no key /
       endpoint / gate / uncaught error; js/app.js calls it behind
       isV2Enabled, lazily, in the one-shot post-auth block

   Run:  node scripts/intelligence-client-wiring-check.mjs   (exit 0 = pass)
   ============================================================ */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

process.env.FIREBASE_CONFIG = process.env.FIREBASE_CONFIG
  || JSON.stringify({ databaseURL: 'https://check-only.firebaseio.com', projectId: 'check-only' });
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || 'check-only';

let fail = 0;
const check = (cond, msg) => { console.log(`${cond ? '✓' : '✗'} ${msg}`); if (!cond) fail++; };
const section = (t) => console.log(`\n── ${t} ──`);

/* ── faithful in-memory fake of the Admin SDK RTDB surface ───────────── */
function makeFakeDb() {
  const root = {};
  const at = (p) => p.split('/').reduce((a, k) => (a == null ? undefined : a[k]), root);
  const set = (p, v) => { const s = p.split('/'); let n = root; for (let i = 0; i < s.length - 1; i += 1) { n[s[i]] = n[s[i]] || {}; n = n[s[i]]; } n[s[s.length - 1]] = v; };
  const drop = (v) => { if (Array.isArray(v)) { const a = v.map(drop).filter((x) => x !== undefined); return a.length ? a : undefined; } if (v && typeof v === 'object') { const o = {}; for (const [k, x] of Object.entries(v)) { const d = drop(x); if (d !== undefined) o[k] = d; } return Object.keys(o).length ? o : undefined; } return v === undefined ? undefined : v; };
  const snap = (val) => ({ val: () => (val === undefined ? null : val), exists: () => val != null, forEach: (cb) => { if (val && typeof val === 'object') for (const [k, v] of Object.entries(val)) cb({ key: k, val: () => v }); } });
  return { ref: (p) => ({ once: async () => snap(at(p)), set: async (v) => set(p, drop(v) === undefined ? null : drop(v)), orderByChild: (ck) => ({ equalTo: (val) => ({ once: async () => { const all = at(p) || {}; const o = {}; for (const [k, r] of Object.entries(all)) if (r && r[ck] === val) o[k] = r; return snap(Object.keys(o).length ? o : null); } }) }) }), _root: root };
}

/* wire the CJS conversation callable at a fake db. Phase 3C-PREP — the
   callable now also requires an explicit /userPermissionOverrides/{uid}
   `intelligence.use` grant; seed it for 'evan' (the caller below). */
const _fakeDb = makeFakeDb();
_fakeDb._root.userPermissionOverrides = { evan: { permissions: ['intelligence.use'] } };
require.cache[require.resolve('../functions/src/config/admin')] = { id: 'admin-shim', loaded: true, exports: { admin: {}, auth: {}, db: _fakeDb } };
const { intelligenceConversation } = require('../functions/src/intelligence/intelligenceConversation');
const callConversation = (payload) => intelligenceConversation.run({ data: payload, auth: { uid: 'evan', token: { role: 'admin' } } });

const { bootstrapIntelligenceClient } = await import('../src/intelligence/client-bootstrap.js');
const store = await import('../src/intelligence/conversation/intelligence-conversation-store.js');
const registry = await import('../src/intelligence/provider-registry.js');
const { createIntelligenceService } = await import('../src/intelligence/service/intelligence-service.js');
const { buildDefaultPorts } = await import('../src/intelligence/service/default-ports.js');
const { makeIntelligenceRequest, REQUEST_TASK } = await import('../src/intelligence/contracts/intelligence-request-contract.js');
const { RESPONSE_STATUS } = await import('../src/intelligence/contracts/intelligence-response-contract.js');
const cfg = await import('../src/intelligence/config/intelligence-config.js');
const { resetConversationRepository } = await import('../src/conversation/repository/conversation-repository.js');

/* ════════════════════════════════════════════════════════════════════════ */

section('bootstrapIntelligenceClient — registration, flag OFF (default)');
store.resetIcStore();
registry.resetRegistry();
cfg.resetIntelligenceConfig();
let modelCalls = 0;
const callModel = async () => { modelCalls += 1; return { schema: 'model-completion@1', ok: true, text: 'x', usage: {}, model: 'm', durationMs: 1, error: null }; };
const s1 = bootstrapIntelligenceClient({ callConversation, callModel });
check(s1.ok === true, 'bootstrap returns ok');
check(s1.conversationBackend === 'callable', "the 'callable' conversation backend is registered + active");
check(s1.providerRegistered === true && registry.getProvider('openai') !== null, "the 'openai' provider is registered");
check(s1.featureEnabled === false, 'featureEnabled reflects the client config flag (OFF)');
check(s1.activeProvider === 'null', 'flag OFF → the Null Provider stays ACTIVE (deterministic path)');

section('bootstrapIntelligenceClient — idempotent');
const s1b = bootstrapIntelligenceClient({ callConversation, callModel });
check(s1b.ok === true && registry.listProviders().filter((p) => p.id === 'openai').length === 1, 'a second call is a safe no-op (openai still registered exactly once)');

section('bootstrapIntelligenceClient — feature flag ON → provider activated');
store.resetIcStore(); registry.resetRegistry();
const sOn = bootstrapIntelligenceClient({ callConversation, callModel, enabled: true });
check(sOn.featureEnabled === true && sOn.activeProvider === 'openai', 'flag ON → the OpenAI provider becomes ACTIVE');

section('bootstrapIntelligenceClient — missing port → controlled error, no throw');
let threw = false;
let sErr;
try { sErr = bootstrapIntelligenceClient({ callConversation }); } catch { threw = true; }
check(!threw && sErr.ok === false && /callModel port is required/.test(sErr.error), 'a missing callModel port → { ok:false, error } (never thrown)');
try { sErr = bootstrapIntelligenceClient({ callModel }); } catch { threw = true; }
check(!threw && sErr.ok === false && /callConversation port is required/.test(sErr.error), 'a missing callConversation port → { ok:false, error }');

section('Wired stack — createIntelligenceService runs a turn through the callable backend (flag OFF)');
store.resetIcStore(); registry.resetRegistry(); resetConversationRepository(); cfg.resetIntelligenceConfig();
modelCalls = 0;
bootstrapIntelligenceClient({ callConversation, callModel });
let _n = 0;
const svc = createIntelligenceService({
  ports: buildDefaultPorts(),
  provider: registry.getActiveProvider(),      // 'null' while flag OFF — the SERVICE's own config check also gates
  authz: { canUseIntelligence: (a) => !!a && a.role === 'admin', canAccessKnowledge: () => true },
  config: { isEnabled: () => cfg.isIntelligenceEnabled(), get: () => cfg.getIntelligenceConfig() },
  idgen: () => `conv_2f_${++_n}`,
});
const t1 = await svc.handle(makeIntelligenceRequest({ requestId: 'w1', actor: { userId: 'evan', role: 'admin', sourceModule: 'intelligence' }, task: REQUEST_TASK.NOR_GENERATE, domainType: 'nor', input: { text: 'buat NOR pengadaan kursi' } }));
check(t1.response.status === RESPONSE_STATUS.NEEDS_INPUT && typeof t1.conversationId === 'string', 'turn 1 through the wired stack → needs_input + a conversationId');
const sess = await svc.getSession(t1.conversationId, { userId: 'evan' });
check(sess.ok && sess.conversation.version === 1 && sess.conversation.actorId === 'evan', 'the conversation was PERSISTED through the callable backend (version 1, owner evan)');
const t2 = await svc.continueSession(t1.conversationId, { item: 'kursi', quantity: '10', purpose: 'rapat', budget: '5jt', recipient: 'Bendahara' }, { userId: 'evan', role: 'admin' });
check(t2.response.status === RESPONSE_STATUS.REQUIRES_REVIEW, 'turn 2 → requires_review (draft)');
check(t2.response.draft.fields.metadata.bodySource === 'template', 'flag OFF → DETERMINISTIC template body');
check(modelCalls === 0, 'callModel (→ callGenerateCompletion) was NEVER invoked (no OpenAI call)');
// (server-enforced cross-owner isolation is covered by
//  intelligence-conversation-backend-check.cjs + intelligence-e2e-multiturn-check.mjs)

section('Error handling (PART 9) — the callable backend maps every failure, never throws');
const { createCallableIcBackend } = await import('../src/intelligence/conversation/intelligence-conversation-store.js');
const mk = (fn) => createCallableIcBackend({ callConversation: fn });
const cases = [
  ['unauthenticated', 'NO_BACKEND_CONFIGURED'],
  ['permission-denied', 'FORBIDDEN'],
  ['functions/permission-denied', 'FORBIDDEN'],
  ['invalid-argument', 'INVALID_RECORD'],
  ['not-found', 'NOT_FOUND'],
  ['functions/not-found', 'NOT_FOUND'],
  ['unavailable', 'NO_BACKEND_CONFIGURED'],
];
for (const [code, expect] of cases) {
  let out; let threw = false;
  try { out = await mk(async () => { const e = new Error(code); e.code = code; throw e; }).get('c1'); } catch { threw = true; }
  check(!threw && out.ok === false && out.error.code === expect, `thrown HttpsError code "${code}" → ${expect} (no throw)`);
}
// a plain transport throw (no .code)
let netOut; let netThrew = false;
try { netOut = await mk(async () => { throw new Error('Failed to fetch'); }).get('c1'); } catch { netThrew = true; }
check(!netThrew && netOut.ok === false && netOut.error.code === 'NO_BACKEND_CONFIGURED', 'a bare network error → NO_BACKEND_CONFIGURED (no throw)');
// a well-formed {ok:false} envelope passes through
const envOut = await mk(async () => ({ ok: false, data: null, error: { code: 'FORBIDDEN', message: 'nope' } })).get('c1');
check(envOut.ok === false && envOut.error.code === 'FORBIDDEN', 'a {ok:false,error} envelope from the function is preserved');
// success passes through
const okOut = await mk(async () => ({ ok: true, data: { convId: 'c1' }, error: null })).get('c1');
check(okOut.ok === true && okOut.data.convId === 'c1', 'a success envelope is preserved');
// garbage → INVALID_RECORD, not a throw
const junkOut = await mk(async () => 'not an object').get('c1');
check(junkOut.ok === false && junkOut.error.code === 'INVALID_RECORD', 'an unrecognised function result → INVALID_RECORD (no throw)');

section('Static — js/intelligence-backend-wiring.js is a thin, safe adapter');
const wiringSrc = fs.readFileSync(path.join(ROOT, 'js/intelligence-backend-wiring.js'), 'utf8');
const wiringCode = wiringSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
check(/from '\.\/firebase\.js'/.test(wiringCode) && /callGenerateCompletion/.test(wiringCode) && /callIntelligenceConversation/.test(wiringCode), 'it maps js/firebase.js#callGenerateCompletion + callIntelligenceConversation onto the ports');
check(/from '\.\.\/src\/intelligence\/client-bootstrap\.js'/.test(wiringCode), 'it delegates to src/intelligence/client-bootstrap.js (no logic of its own)');
check(!/api\.openai\.com|sk-[A-Za-z0-9]|OPENAI_API_KEY|process\.env/.test(wiringCode), 'no endpoint / key / secret / env-var in the adapter');
check(!/isV2Enabled|['"]role['"]\s*===|\busername\s*===/.test(wiringCode), 'the adapter implements no gate (js/app.js owns isV2Enabled)');
check(/try\s*\{[\s\S]*\}\s*catch/.test(wiringCode) && /console\.warn/.test(wiringCode), 'the adapter swallows its own errors (never disturbs V1 boot)');

section('Static — js/app.js calls the wiring behind isV2Enabled, lazily, one-shot');
const appSrc = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
check(/loadIntelligenceBackendWiring/.test(appSrc), 'app.js imports the memoized lazy loader');
check(/if\s*\(\s*isV2Enabled\(getCurrentUser\(\)\)\s*\)\s*\{[\s\S]{0,600}?wireIntelligenceBackend\(/.test(appSrc), 'wireIntelligenceBackend(...) is called ONLY inside an isV2Enabled(getCurrentUser()) guard');
// the call site must be within startAuthenticatedSession's one-shot block (after the _sessionInfraStarted guard)
const sasIdx = appSrc.indexOf('async function startAuthenticatedSession');
const guardIdx = appSrc.indexOf('_sessionInfraStarted = true', sasIdx);
const wireIdx = appSrc.indexOf('await wireIntelligenceBackend(', sasIdx);
check(sasIdx > 0 && guardIdx > sasIdx && wireIdx > guardIdx, 'the wiring call is inside startAuthenticatedSession(), after the _sessionInfraStarted one-shot guard');
// Phase 3A — the post-auth /feature_flags node (appFlags) is forwarded to the wiring
const flagReadIdx = appSrc.indexOf('appFlags = await loadFeatureFlags()', sasIdx);
check(flagReadIdx > guardIdx && wireIdx > flagReadIdx, 'the flag read (appFlags = await loadFeatureFlags()) happens BEFORE the wiring call (auth → flag read → wire → provider selection)');
check(/await wireIntelligenceBackend\(\s*appFlags\s*\)/.test(appSrc), 'the already-fetched /feature_flags node (appFlags) is forwarded to wireIntelligenceBackend — no second flag read/system');
check(/const \{ wireIntelligenceBackend \} = await loadIntelligenceBackendWiring\(\)/.test(appSrc), 'the wiring module is LAZY-loaded (dynamic import via the memoized loader), never a static import');
const mlr = fs.readFileSync(path.join(ROOT, 'js/config/module-loader-registry.js'), 'utf8');
check(/loadIntelligenceBackendWiring\s*=\s*\(\)\s*=>\s*loadModule\('intelligence-backend-wiring', \(\) => import\('\.\.\/intelligence-backend-wiring\.js'\)\)/.test(mlr), 'module-loader-registry.js registers the memoized loader');

section('Static — the deterministic-path guarantee is structural');
check(!/setIntelligenceConfig\(\s*\{\s*enabled:\s*true/.test(wiringSrc + fs.readFileSync(path.join(ROOT, 'src/intelligence/client-bootstrap.js'), 'utf8')), 'nothing in the wiring path enables the feature flag');
check(/if \(featureEnabled\) setActiveProvider/.test(fs.readFileSync(path.join(ROOT, 'src/intelligence/client-bootstrap.js'), 'utf8')), 'the OpenAI provider is activated ONLY behind featureEnabled');

console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'} — ${fail} failing check(s).`);
process.exit(fail === 0 ? 0 : 1);
