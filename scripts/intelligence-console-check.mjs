/* ============================================================
   intelligence-console-check.mjs — Sarpras Intelligence (V2, Phase 3B)

   PURE node test of the minimal console CONTROLLER
   (src/intelligence/console/intelligence-console-controller.js). No DOM, no
   Firebase, no OpenAI — the createIntelligenceService() instance is a
   scriptable FAKE, so this proves the state machine + the UI↔service
   contract boundary only.

   Covers:
     • idle → submit() → loading → needs_input   (service.handle called once,
       with a well-formed makeIntelligenceRequest; conversationId retained)
     • needs_input → answer() → continueSession(SAME id, { text })
     • → requires_review → review state, DISPLAY ONLY (no publish surface)
     • double-submit protection (a 2nd call while busy is dropped)
     • every service error code → ONE curated Indonesian sentence; a raw
       Firebase-shaped message is NEVER surfaced; a thrown service never
       crashes the controller
     • error is recoverable — the input is restored, retry resumes
     • reset() returns to idle without touching the server-owned conversation
     • the controller module is pure (no fetch / firebase / DOM / storage)

   Run:  node scripts/intelligence-console-check.mjs   (exit 0 = pass)
   ============================================================ */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let fail = 0;
const check = (cond, msg) => { console.log(`${cond ? '✓' : '✗'} ${msg}`); if (!cond) fail++; };
const section = (t) => console.log(`\n── ${t} ──`);
const tick = () => new Promise((r) => setTimeout(r, 0));

const { createIntelligenceConsoleController, CONSOLE_PHASE } =
  await import('../src/intelligence/console/intelligence-console-controller.js');
const { RESPONSE_STATUS, RESPONSE_ERRORS } =
  await import('../src/intelligence/contracts/intelligence-response-contract.js');
const { isIntelligenceRequest, REQUEST_TASK } =
  await import('../src/intelligence/contracts/intelligence-request-contract.js');

const ACTOR = { userId: 'evan', role: 'admin' };

/* A scriptable fake createIntelligenceService() instance. */
function fakeService(script) {
  const calls = { handle: [], continueSession: [] };
  let i = 0;
  const nextEnv = () => {
    const step = script[Math.min(i, script.length - 1)];
    i += 1;
    if (typeof step === 'function') return step();
    return step;
  };
  return {
    calls,
    reset() { i = 0; calls.handle.length = 0; calls.continueSession.length = 0; },
    async handle(request) { calls.handle.push(request); return nextEnv(); },
    async continueSession(convId, answers, actor) { calls.continueSession.push({ convId, answers, actor }); return nextEnv(); },
  };
}

const needsInput = (id, questions) => ({
  conversationId: id,
  response: { schema: 'intelligence-response@1', requestId: 'r', status: RESPONSE_STATUS.NEEDS_INPUT, questions },
});
const review = (id) => ({
  conversationId: id,
  response: {
    schema: 'intelligence-response@1', requestId: 'r', status: RESPONSE_STATUS.REQUIRES_REVIEW,
    draft: { documentType: 'nor', fields: { norType: 'Pengadaan', subject: 'Pengadaan kursi', recipient: 'Bendahara', recipientStatus: 'known', date: '2026-08-31', body: 'Badan surat.', details: { item: 'kursi', quantity: '10' }, metadata: { bodySource: 'template' } } },
    review: { reason: 'Menunggu review manusia.', blocking: true },
  },
});
const errEnv = (code, message) => ({
  conversationId: null,
  response: { schema: 'intelligence-response@1', requestId: 'r', status: RESPONSE_STATUS.ERROR, error: { code, message: message || code } },
});

/* ════════════════════════════════════════════════════════════════════════ */

section('idle → submit → needs_input');
let svc = fakeService([
  needsInput('conv_A', [{ id: 'item', prompt: 'Barang apa yang diadakan?', why: 'Item', required: true },
                        { id: 'quantity', prompt: 'Berapa jumlahnya?', why: 'Jumlah', required: true }]),
]);
let emits = [];
let ctl = createIntelligenceConsoleController({ service: svc, actor: ACTOR });
ctl.setOnChange((s) => emits.push(s.phase));
check(ctl.getState().phase === CONSOLE_PHASE.IDLE, 'initial phase = idle');
check(ctl.getState().messages.length === 0 && ctl.getState().busy === false, 'idle: no messages, not busy');

await ctl.submit('  buat NOR pengadaan kursi rapat  ');
check(svc.calls.handle.length === 1, 'service.handle() called exactly once');
const req = svc.calls.handle[0];
check(isIntelligenceRequest(req), 'handle() got a well-formed IntelligenceRequest');
check(req.task === REQUEST_TASK.NOR_GENERATE && req.domainType === 'nor', 'request task = nor.generate, domainType = nor');
check(req.input.text === 'buat NOR pengadaan kursi rapat', 'request input.text is the trimmed user text');
check(req.actor.userId === 'evan' && req.actor.sourceModule === 'intelligence', 'request actor carries the signed-in identity + sourceModule');
let st = ctl.getState();
check(st.phase === CONSOLE_PHASE.NEEDS_INPUT, 'phase → needs_input');
check(st.conversationId === 'conv_A', 'conversationId retained from the service response (never client-fabricated)');
check(st.questions.length === 2 && st.questions[0].id === 'item', 'both questions surfaced, order preserved');
check(st.messages[0].role === 'user' && st.messages[1].role === 'intelligence', 'stack shows the user turn then the Intelligence turn');
check(emits.includes('loading') && emits[emits.length - 1] === 'needs_input', 'onChange emitted loading then needs_input');

section('needs_input → answer → continueSession(SAME id, { text }) → review');
{
  const s3 = fakeService([
    needsInput('conv_X', [{ id: 'item', prompt: 'Barang apa?', why: 'Item', required: true }]),
    review('conv_X'),
  ]);
  ctl = createIntelligenceConsoleController({ service: s3, actor: ACTOR });
  await ctl.submit('buat NOR pengadaan kursi');
  await ctl.answer('kursi lipat');
  check(s3.calls.continueSession.length === 1, 'answer() → continueSession() called once');
  const c = s3.calls.continueSession[0];
  check(c.convId === 'conv_X', 'continueSession got the SAME conversationId the service returned');
  check(c.answers && c.answers.text === 'kursi lipat' && Object.keys(c.answers).length === 1,
    'the RAW free-text reply is handed to the service ({ text: … }) — the service extracts facts by meaning, not the UI');
  check(c.actor && c.actor.userId === 'evan', 'continueSession got the actor (identity never sent as a manual token)');
  st = ctl.getState();
  check(st.phase === CONSOLE_PHASE.REVIEW, 'phase → review after requires_review');
  check(st.draft && st.draft.fields.recipient === 'Bendahara', 'draft carried onto state for the read-only panel');
  check(st.review && st.review.blocking === true, 'review block retained (human approval required)');
  check(st.questions.length === 0, 'questions cleared in review');
}

section('review state is DISPLAY ONLY — no publish surface on the controller');
const api = Object.keys(ctl);
check(!api.some((k) => /publish|terbitkan|approve|save|number|reserve|commit/i.test(k)),
  `controller exposes no publish/approve/number method (has: ${api.join(', ')})`);
check(!('publish' in ctl) && !('approve' in ctl), 'no publish() / approve()');

section('double-submit protection');
let release;
const slow = new Promise((r) => { release = r; });
const slowSvc = {
  calls: { handle: [] },
  async handle(r) { this.calls.handle.push(r); await slow; return needsInput('conv_S', [{ id: 'item', prompt: 'Barang apa?', why: 'Item', required: true }]); },
  async continueSession() { return review('conv_S'); },
};
ctl = createIntelligenceConsoleController({ service: slowSvc, actor: ACTOR });
const p1 = ctl.submit('permintaan A');
await tick();
check(ctl.getState().busy === true && ctl.getState().phase === CONSOLE_PHASE.LOADING, 'while in flight: busy = true, phase = loading');
ctl.submit('permintaan B (spam)');
ctl.submit('permintaan C (spam)');
release();
await p1;
check(slowSvc.calls.handle.length === 1, 'the two extra submit() calls during loading were dropped — service.handle called ONCE');
check(ctl.getState().messages.filter((m) => m.role === 'user').length === 1, 'only ONE user turn recorded (no duplicate conversation turns)');

section('error mapping — one curated Indonesian sentence per code, raw message never shown');
const RAW = 'Firebase: PERMISSION_DENIED: /intelligence_conversations denied (permission-denied).';
const map = [
  [RESPONSE_ERRORS.FORBIDDEN, RAW, 'Anda tidak memiliki akses ke Sarpras Intelligence.'],
  [RESPONSE_ERRORS.INVALID_REQUEST, 'raw x', 'Permintaan tidak dapat diproses. Coba jelaskan kembali secara singkat dan spesifik.'],
  [RESPONSE_ERRORS.UNKNOWN_INTENT, 'raw x', 'Permintaan ini belum dapat dipahami. Jelaskan lebih spesifik, mis. "buat NOR pengadaan kursi rapat".'],
  [RESPONSE_ERRORS.LIMIT, 'raw x', 'Percakapan sudah terlalu panjang. Mulai permintaan baru.'],
  [RESPONSE_ERRORS.DISABLED, 'raw x', 'Layanan Intelligence sedang tidak aktif.'],
  [RESPONSE_ERRORS.NETWORK, 'raw x', 'Layanan Intelligence sedang tidak tersedia. Coba lagi sebentar lagi.'],
  [RESPONSE_ERRORS.PROVIDER_ERROR, 'raw x', 'Layanan Intelligence sedang tidak tersedia. Coba lagi sebentar lagi.'],
  ['NOT_FOUND', 'raw x', 'Sesi percakapan tidak ditemukan. Mulai permintaan baru.'],
  ['WEIRD_UNMAPPED_CODE', 'raw x', 'Intelligence tidak dapat memproses permintaan saat ini.'],
];
for (const [code, raw, want] of map) {
  const s = fakeService([errEnv(code, raw)]);
  const c = createIntelligenceConsoleController({ service: s, actor: ACTOR });
  await c.submit('sesuatu');
  const cs = c.getState();
  check(cs.phase === CONSOLE_PHASE.ERROR && cs.error === want, `${code} → "${want}"`);
  check(!cs.error.includes('PERMISSION_DENIED') && !cs.error.toLowerCase().includes('firebase'), `${code}: raw backend text is NOT surfaced`);
  check(cs.messages[cs.messages.length - 1].text === want, `${code}: the curated text is what lands in the stack`);
}

section('malformed / thrown service — never crashes');
let s = fakeService([{ conversationId: null, response: null }]);   // no response
let c = createIntelligenceConsoleController({ service: s, actor: ACTOR });
await c.submit('x');
check(c.getState().phase === CONSOLE_PHASE.ERROR && c.getState().error === 'Intelligence tidak dapat memproses permintaan saat ini.', 'a response-less envelope → fallback error, no throw');
s = fakeService([() => { throw new Error('boom'); }]);
c = createIntelligenceConsoleController({ service: s, actor: ACTOR });
let threw = false;
try { await c.submit('x'); } catch { threw = true; }
check(!threw && c.getState().phase === CONSOLE_PHASE.ERROR, 'a THROWN service.handle() is caught → error phase, controller still alive');
check(c.getState().busy === false, 'busy flag released after a thrown turn');

section('error is recoverable — input restored, retry resumes');
{
  const s5 = fakeService([
    needsInput('conv_R', [{ id: 'item', prompt: 'Barang apa?', why: 'Item', required: true }]),
    errEnv(RESPONSE_ERRORS.NETWORK, 'raw'),
    review('conv_R'),
  ]);
  const c5 = createIntelligenceConsoleController({ service: s5, actor: ACTOR });
  await c5.submit('buat NOR pengadaan kursi');
  await c5.answer('kursi');                 // → NETWORK error
  check(c5.getState().phase === CONSOLE_PHASE.ERROR, 'answer turn failed → error');
  check(c5.getState().pendingInput === 'kursi', 'the failed answer text is retained for the view to restore');
  check(c5.getState().conversationId === 'conv_R', 'the conversationId is kept across the error (retry continues the same session)');
  await c5.answer('kursi');                 // retry → review
  check(c5.getState().phase === CONSOLE_PHASE.REVIEW && s5.calls.continueSession.length === 2, 'retry resumed continueSession on the same id and reached review');
  check(c5.getState().pendingInput === '', 'pendingInput cleared after the successful retry');
}

section('answer() before any conversation falls back to submit()');
{
  const s6 = fakeService([needsInput('conv_Z', [{ id: 'item', prompt: 'Barang apa?', why: 'Item', required: true }])]);
  const c6 = createIntelligenceConsoleController({ service: s6, actor: ACTOR });
  await c6.answer('langsung menjawab tanpa mulai');
  check(s6.calls.handle.length === 1 && s6.calls.continueSession.length === 0, 'answer() with no live conversation routes to handle()');
}

section('reset() → idle, server-owned conversation untouched');
{
  const s7 = fakeService([review('conv_Q')]);
  const c7 = createIntelligenceConsoleController({ service: s7, actor: ACTOR });
  await c7.submit('buat NOR pengadaan kursi lengkap');
  c7.reset();
  const rs = c7.getState();
  check(rs.phase === CONSOLE_PHASE.IDLE && rs.messages.length === 0 && rs.conversationId === null && rs.draft === null, 'reset clears local state');
  check(!('cancel' in s7.calls) , 'reset did NOT call any cancel/delete on the service (server conversation left as-is)');
}

section('empty / whitespace input is ignored');
{
  const s8 = fakeService([needsInput('c', [{ id: 'item', prompt: 'p', why: 'Item', required: true }])]);
  const c8 = createIntelligenceConsoleController({ service: s8, actor: ACTOR });
  await c8.submit('   ');
  await c8.submit('');
  check(s8.calls.handle.length === 0 && c8.getState().phase === CONSOLE_PHASE.IDLE, 'blank submit() is a no-op');
}

section('static — the controller module is pure');
const src = fs.readFileSync(path.join(ROOT, 'src/intelligence/console/intelligence-console-controller.js'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
check(!/\bfetch\s*\(|XMLHttpRequest|WebSocket|from\s+['"][^'"]*firebase|\blocalStorage\.|\bsessionStorage\.|\bdocument\.|\bwindow\./.test(src),
  'no network / firebase / storage / DOM / window access in the controller');
check(!/api\.openai\.com|sk-[A-Za-z0-9]|OPENAI_API_KEY/.test(src), 'no OpenAI endpoint / key in the controller');
check(!/callGenerateCompletion|callIntelligenceConversation/.test(src), 'the controller never reaches a callable directly — only the injected service');
check(/service\.handle\(/.test(src) && /service\.continueSession\(/.test(src), 'it drives the flow through service.handle() + service.continueSession() ONLY');

section('static — the wiring bridge assembles ONE real createIntelligenceService()');
const bridge = fs.readFileSync(path.join(ROOT, 'js/intelligence-backend-wiring.js'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
check(/createWiredIntelligenceConsoleController/.test(bridge), 'exports createWiredIntelligenceConsoleController');
check(/createIntelligenceService\(\{[\s\S]*?buildDefaultPorts\(\)[\s\S]*?getActiveProvider\(\)/.test(bridge),
  'it builds createIntelligenceService with buildDefaultPorts() + getActiveProvider() (reuse, never a 2nd service)');
check(/await wireIntelligenceBackend\(\)/.test(bridge), 'it ensures the backend is wired first (idempotent)');
check(/canUseIntelligence:\s*\(a\)\s*=>/.test(bridge) && !/['"]role['"]\s*===/.test(bridge),
  'the client authz is a PRE-CHECK predicate, not a hardcoded role-string gate');
check(!/api\.openai\.com|sk-[A-Za-z0-9]|OPENAI_API_KEY|process\.env/.test(bridge), 'no endpoint / key / secret / env read in the bridge');
check(!/setIntelligenceConfig\(\s*\{\s*enabled:\s*true/.test(bridge), 'the bridge never force-enables the feature flag');

section('static — js/app.js gates the console on isV2Enabled + the synced flag, one-shot, no auto-mount');
const app = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
check(/intelligenceFeatureActive\s*=\s*!!\(wiringStatus && wiringStatus\.featureEnabled === true\)/.test(app),
  'intelligenceFeatureActive is taken from the Phase 3A wiring status (the synced flag), fail-closed');
check(/if \(intelligenceFeatureActive\)\s*\{[\s\S]{0,400}?loadIntelligenceConsole\(\)/.test(app),
  'the console is loaded ONLY when intelligenceFeatureActive is true');
const navIdx = app.indexOf('async function navSarprasIntelligence');
const canAccessIdx = app.indexOf("canAccessModule('sarprasIntelligence')", navIdx);
const consoleIdx = app.indexOf('loadIntelligenceConsole()', navIdx);
check(navIdx > 0 && canAccessIdx > navIdx && consoleIdx > canAccessIdx,
  'the console mount sits behind the existing canAccessModule(\'sarprasIntelligence\') pilot guard');
check(/mountIntelligenceConsole\(document\.getElementById\('v2SarprasIntelWorkspace'\)\)/.test(app),
  'it mounts into the EXISTING Sarpras Intelligence workspace host — no new nav architecture');
check((app.match(/mountIntelligenceConsole\(/g) || []).length === 1,
  'mountIntelligenceConsole is called from exactly one place (navSarprasIntelligence), never on load');

console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'} — ${fail} failing check(s).`);
process.exit(fail === 0 ? 0 : 1);
