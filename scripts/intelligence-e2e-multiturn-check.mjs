/* ============================================================
   intelligence-e2e-multiturn-check.mjs — Sarpras Intelligence (V2, Phase 2D)

   END-TO-END backend validation of the multi-turn contract, with state
   crossing the SERVER boundary every turn:

     browser  → Intelligence Service (ESM)
              → conversation-store facade  ('callable' backend)
              → intelligenceConversation Cloud Function (.run(), CJS)
              → conversationStore.js  → fake Admin-SDK RTDB

   No emulator — the RTDB is a faithful in-memory fake. Every turn: the
   service LOADS state through the callable, recomputes, and PERSISTS the
   new version through the callable. Nothing is held in the ESM process
   between turns except what the server returned.

   Covers PART F (start/continue), PART G (the mesin-potong-rumput
   walkthrough), PART D (ownership isolation), PART L (recipient
   contextual — asked when unknown, proposed when history is consistent),
   PART M (suggestedNumber ≠ officialPublishedNumber), PART I (structured
   response), PART O (nonexistent conversation, wrong owner).

   Run:  node scripts/intelligence-e2e-multiturn-check.mjs   (exit 0 = pass)
   ============================================================ */

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

process.env.FIREBASE_CONFIG = process.env.FIREBASE_CONFIG
  || JSON.stringify({ databaseURL: 'https://check-only.firebaseio.com', projectId: 'check-only' });
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || 'check-only';

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

/* ── wire the CJS callable at a fake db (admin-module shim) ──────────── */
const fakeDb = makeFakeDb();
// Phase 3C-PREP — intelligenceConversation now requires an explicit
// `intelligence.use` grant in /userPermissionOverrides/{uid} on top of the
// admin role. Seed it for every identity this suite exercises as an
// authorized caller (evan = the pilot; mallory = a DIFFERENT authorized
// admin, so the cross-owner test still fails on OWNERSHIP, not on authz).
fakeDb._root.userPermissionOverrides = {
  evan: { permissions: ['intelligence.use'] },
  mallory: { permissions: ['intelligence.use'] },
};
require.cache[require.resolve('../functions/src/config/admin')] = {
  id: 'admin-shim', loaded: true, exports: { admin: {}, auth: {}, db: fakeDb },
};
const { intelligenceConversation } = require('../functions/src/intelligence/intelligenceConversation');

const ADMIN = { userId: 'evan', role: 'admin', sourceModule: 'intelligence' };
const authToken = (uid, role = 'admin') => ({ uid, token: { role } });

/* the `callConversation` port the ESM 'callable' backend needs */
function callConversationAs(uid, role = 'admin') {
  return async (payload) => intelligenceConversation.run({ data: payload, auth: authToken(uid, role) });
}

/* ── the ESM Intelligence stack ─────────────────────────────────────── */
const { createIntelligenceService } = await import('../src/intelligence/service/intelligence-service.js');
const { buildDefaultPorts } = await import('../src/intelligence/service/default-ports.js');
const { createOpenAiProvider } = await import('../src/intelligence/providers/openai-provider.js');
const store = await import('../src/intelligence/conversation/intelligence-conversation-store.js');
const { makeIntelligenceRequest, REQUEST_TASK } = await import('../src/intelligence/contracts/intelligence-request-contract.js');
const { RESPONSE_STATUS, RESPONSE_ERRORS } = await import('../src/intelligence/contracts/intelligence-response-contract.js');
const cfg = await import('../src/intelligence/config/intelligence-config.js');
const { resetConversationRepository } = await import('../src/conversation/repository/conversation-repository.js');

let _n = 0;
const idgen = () => `conv_${Date.now().toString(36)}_${++_n}`;
const authz = { canUseIntelligence: (a) => !!a && a.role === 'admin', canAccessKnowledge: () => true };

function newSvc({ callerUid = 'evan', provider, memoryReader } = {}) {
  store.resetIcStore();
  store.useCallableIcBackend({ callConversation: callConversationAs(callerUid) });
  const ports = buildDefaultPorts();
  if (memoryReader) ports.memoryReader = memoryReader;
  return createIntelligenceService({
    ports,
    provider: provider || { async complete() { return { schema: 'model-completion@1', ok: true, text: 'Badan surat.', usage: {}, model: 'fake', durationMs: 1, error: null }; } },
    authz,
    config: { isEnabled: () => cfg.isIntelligenceEnabled(), get: () => cfg.getIntelligenceConfig() },
    idgen,
  });
}
const norReq = (id, text, fields = {}) => makeIntelligenceRequest({ requestId: id, actor: ADMIN, task: REQUEST_TASK.NOR_GENERATE, domainType: 'nor', input: { text, fields } });
const rawStored = (convId) => (fakeDb._root.intelligence_conversations || {})[convId];

/* ════════════════════════════════════════════════════════════════════════ */

section('PART G — TURN 1: "Buatkan NOR pembelian mesin potong rumput."');
resetConversationRepository(); cfg.resetIntelligenceConfig();
let svc = newSvc();
const t1 = await svc.handle(norReq('e1-t1', 'Buatkan NOR pembelian mesin potong rumput.'));
const conv = t1.conversationId;
check(t1.response.status === RESPONSE_STATUS.NEEDS_INPUT, 'TURN 1 → status = needs_input');
const q1 = t1.response.questions.map((q) => q.id);
check(q1.length >= 2, `TURN 1 asks for the missing information (${q1.join(', ')})`);
check(!q1.includes('type'), 'the NOR type ("pembelian" ⇒ Pengadaan) extracted from the utterance is NOT asked');
check(!!rawStored(conv) && rawStored(conv).version === 1 && rawStored(conv).actorId === 'evan', 'TURN 1 state PERSISTED to /intelligence_conversations/<convId> (version 1, owner = evan)');

section('PART G — TURN 2: "2 unit, Honda GX35, sekitar Rp4 juta per unit."');
const t2 = await svc.continueSession(conv, { quantity: '2 unit', item: 'mesin potong rumput Honda GX35', budget: 'Rp4 juta per unit' }, ADMIN);
check(t2.response.status === RESPONSE_STATUS.NEEDS_INPUT, 'TURN 2 → still needs_input (purpose not yet given)');
const q2 = t2.response.questions.map((q) => q.id);
check(!q2.includes('item') && !q2.includes('quantity') && !q2.includes('budget'), 'TURN 2 does NOT re-ask already-provided fields (item/quantity/budget)');
check(rawStored(conv).version === 2 && rawStored(conv).collectedFields.item && rawStored(conv).collectedFields.quantity, 'TURN 2 state PERSISTED (version 2) with the accumulated fields — server is the source of truth');

section('PART G — TURN 3: "Untuk kebutuhan perawatan lapangan PBSI."');
const t3 = await svc.continueSession(conv, { purpose: 'perawatan lapangan PBSI' }, ADMIN);
check(
  (t3.response.status === RESPONSE_STATUS.NEEDS_INPUT && t3.response.questions.map((q) => q.id).includes('recipient'))
  || t3.response.status === RESPONSE_STATUS.REQUIRES_REVIEW,
  'TURN 3 → every NOR field known; the one remaining item is the recipient (PART L — asked, never invented)'
);
check(rawStored(conv).version === 3, 'TURN 3 state PERSISTED (version 3)');

section('PART G — TURN 4: recipient supplied → ready + structured draft');
const t4 = await svc.continueSession(conv, { recipient: 'Bendahara' }, ADMIN);
check(t4.response.status === RESPONSE_STATUS.REQUIRES_REVIEW, 'TURN 4 → requires_review (a structured draft, gated on human review)');
const d = t4.response.draft;
check(d && d.documentType === 'nor' && d.fields && typeof d.fields.body === 'string', 'the draft is STRUCTURED (documentType, fields, body) — not raw model text (PART I)');
check(d.fields.recipient === 'Bendahara', 'recipient in the draft is exactly the human answer, never fabricated (PART L)');
check(t4.response.review && t4.response.review.blocking === true, 'the draft BLOCKS on human review — no auto-publication (PART S)');
check(t4.numbering && typeof t4.numbering.suggestedNumber === 'string' && t4.numbering.publishedNumber === null, 'a suggestedNumber may be carried; officialPublishedNumber is NOT set (PART M)');
check(!('norNumber' in d.fields) || !d.fields.norNumber, 'the draft carries no official NOR number');
check(rawStored(conv).status === 'drafted' && rawStored(conv).version >= 4, 'final DRAFTED state PERSISTED server-side');

section('PART D / PART O — ownership isolation across the server boundary');
const mallorySvc = createIntelligenceService({
  ports: buildDefaultPorts(), authz,
  provider: { async complete() { return { schema: 'model-completion@1', ok: true, text: 'x', usage: {}, model: 'm', durationMs: 1, error: null }; } },
  config: { isEnabled: () => false, get: () => cfg.getIntelligenceConfig() }, idgen,
  store: {
    create: (r) => intelligenceConversation.run({ data: { op: 'create', record: r }, auth: authToken('mallory') }),
    append: (r) => intelligenceConversation.run({ data: { op: 'append', record: r }, auth: authToken('mallory') }),
    get: (id) => intelligenceConversation.run({ data: { op: 'get', convId: id }, auth: authToken('mallory') }),
  },
});
const mGet = await mallorySvc.getSession(conv, { userId: 'mallory' });
check(mGet.ok === false && mGet.error.code === 'FORBIDDEN', 'another user CANNOT read this conversation (server-enforced, not client-trusted)');
const mCont = await mallorySvc.continueSession(conv, { item: 'tamper' }, { userId: 'mallory', role: 'admin' });
check(mCont.response.status === RESPONSE_STATUS.ERROR && mCont.response.error.code === RESPONSE_ERRORS.FORBIDDEN, 'another user CANNOT continue this conversation');
check(rawStored(conv).collectedFields.item.includes('Honda'), 'the stored conversation was NOT mutated by the cross-owner attempt');
const ghost = await svc.continueSession('conv_does_not_exist', { x: 1 }, ADMIN);
check(ghost.response.status === RESPONSE_STATUS.ERROR, 'continuing a nonexistent conversation → controlled error, no crash (PART O)');

section('Phase 3C-PREP — an admin WITHOUT the intelligence.use grant is denied at the callable');
// 'stranger' has admin role but no /userPermissionOverrides grant seeded above.
let strangerErr = null;
try {
  await intelligenceConversation.run({ data: { op: 'get', convId: conv }, auth: authToken('stranger') });
} catch (e) { strangerErr = e; }
check(strangerErr && strangerErr.code === 'permission-denied',
  'admin role WITHOUT intelligence.use → HttpsError(permission-denied) — the grant, not the role, authorizes');
check(rawStored(conv).collectedFields.item.includes('Honda'),
  'the ungranted admin attempt did NOT mutate or expose the conversation');


section('PART L — recipient PROPOSED from a consistent archive history (TURN 3 → ready directly)');
resetConversationRepository(); cfg.resetIntelligenceConfig();
const consistentMemory = { listArchive: () => ({ ok: true, data: Array.from({ length: 6 }, (_, i) => ({ id: `a${i}`, recipient: 'Sekretaris Jenderal', createdAt: `2026-02-0${i + 1}` })) }) };
const svc2 = newSvc({ memoryReader: consistentMemory });
const s1 = await svc2.handle(norReq('e2-t1', 'buat NOR pengadaan sepatu atlet'));
const s2 = await svc2.continueSession(s1.conversationId, { item: 'sepatu lari', quantity: '40 pasang', budget: '60 juta' }, ADMIN);
const s3 = await svc2.continueSession(s1.conversationId, { purpose: 'pelatnas' }, ADMIN);
check(s3.response.status === RESPONSE_STATUS.REQUIRES_REVIEW, 'with a consistent recipient history, TURN 3 reaches a draft without a recipient question');
check(s3.response.draft.fields.recipient === 'Sekretaris Jenderal' && s3.response.draft.fields.recipientStatus === 'proposed', 'recipient is PROPOSED from history (a human still confirms) — different NOR, different recipient, no fixed constant');

section('Enabled provider — the model body crosses the boundary too');
resetConversationRepository(); cfg.resetIntelligenceConfig();
cfg.setIntelligenceConfig({ enabled: true });
let modelCalls = 0;
const prov = createOpenAiProvider({ callModel: async () => { modelCalls += 1; return { schema: 'model-completion@1', ok: true, text: 'Dengan hormat, bersama ini diajukan pengadaan...', usage: { inputTokens: 9, outputTokens: 20 }, model: 'gpt-4o-mini', durationMs: 3, error: null }; } });
const svc3 = newSvc({ provider: prov });
const g1 = await svc3.handle(norReq('e3-t1', 'buat NOR pengadaan meja', { item: 'meja rapat', quantity: '8', purpose: 'ruang sidang', budget: '16 juta', recipient: 'Bendahara' }));
check(g1.response.status === RESPONSE_STATUS.REQUIRES_REVIEW && modelCalls === 1, 'enabled: the provider is called once for the body');
check(g1.response.draft.fields.metadata.bodySource === 'model' && g1.response.provenance.model === 'gpt-4o-mini', 'the model-sourced body + provenance are in the draft; state persisted server-side');
check(rawStored(g1.conversationId).status === 'drafted', 'enabled-mode draft state also persisted through the callable');
cfg.resetIntelligenceConfig();

console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'} — ${fail} failing check(s).`);
process.exit(fail === 0 ? 0 : 1);
