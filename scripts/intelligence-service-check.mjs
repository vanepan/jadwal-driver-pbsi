/* ============================================================
   intelligence-service-check.mjs — Sarpras Intelligence (V2, Phase 1)

   PURE node test (no browser, no Firebase, no network). Proves the
   Intelligence Service orchestration end to end, reusing the REAL
   src/conversation, src/knowledge and src/organizational-memory services:

     • disabled mode → deterministic only, no model call, no failure
     • enabled mode  → provider.complete() drives the draft body
     • needs_input / requires_review / error responses
     • clarification: incomplete request, multiple missing fields,
       already-known info not re-asked, recipient ambiguity → ask,
       recipient from an answer → not asked, recipient from a consistent
       archive pattern → proposed (never invented)
     • knowledge: retrieved read-only; inaccessible knowledge rejected;
       generated output never auto-promoted to Approved Knowledge
     • numbering: suggestion ≠ official; the AI layer never sets an official number
     • conversation state: turn 1 → needs_input, turn 2 retains state,
       turn 3 → requires_review; isolation between users; maxTurns cap
     • security: unauthenticated/authorized-by-role gate; provider failure
       degrades gracefully

   Run:  node scripts/intelligence-service-check.mjs   (exit 0 = pass)
   ============================================================ */

import { createIntelligenceService } from '../src/intelligence/service/intelligence-service.js';
import { buildDefaultPorts } from '../src/intelligence/service/default-ports.js';
import { createOpenAiProvider } from '../src/intelligence/providers/openai-provider.js';
import { makeIntelligenceRequest, REQUEST_TASK } from '../src/intelligence/contracts/intelligence-request-contract.js';
import { RESPONSE_ERRORS, RESPONSE_STATUS } from '../src/intelligence/contracts/intelligence-response-contract.js';
import {
  registerIcBackend, setActiveIcBackend, resetIcStore,
} from '../src/intelligence/conversation/intelligence-conversation-store.js';
import {
  memoryIntelligenceConversationBackend, resetMemoryIntelligenceConversationBackend,
} from '../src/intelligence/conversation/backends/memory-intelligence-conversation-backend.js';
import * as cfg from '../src/intelligence/config/intelligence-config.js';
import { resetConversationRepository } from '../src/conversation/repository/conversation-repository.js';

let fail = 0;
const check = (cond, msg) => { console.log(`${cond ? '✓' : '✗'} ${msg}`); if (!cond) fail++; };
const section = (t) => console.log(`\n── ${t} ──`);

resetIcStore();
registerIcBackend(memoryIntelligenceConversationBackend);
setActiveIcBackend('memory');

let _n = 0;
const idgen = () => `conv_${++_n}`;
const adminActor = { userId: 'evan', role: 'admin', sourceModule: 'intelligence' };
const authzAdmin = { canUseIntelligence: (a) => !!a && a.role === 'admin', canAccessKnowledge: () => true };

function makeSvc({ provider, authz = authzAdmin, config } = {}) {
  return createIntelligenceService({
    ports: buildDefaultPorts(),
    provider: provider || { async complete() { return { schema: 'model-completion@1', ok: true, text: 'Badan surat.', usage: { inputTokens: 4, outputTokens: 8 }, model: 'fake', durationMs: 2, error: null }; } },
    authz,
    config: config || { isEnabled: () => cfg.isIntelligenceEnabled(), get: () => cfg.getIntelligenceConfig() },
    idgen,
  });
}

function reset() {
  resetMemoryIntelligenceConversationBackend();
  resetConversationRepository();
  cfg.resetIntelligenceConfig();
}

const norReq = (requestId, text, fields = {}) => makeIntelligenceRequest({
  requestId, actor: adminActor, task: REQUEST_TASK.NOR_GENERATE, domainType: 'nor', input: { text, fields },
});

/* ════════════════════════════════════════════════════════════════════════ */

section('Authorization gate (PART 11)');
reset();
{
  const svc = makeSvc();
  const rejected = await svc.handle(makeIntelligenceRequest({ requestId: 'a1', actor: { userId: 'bob', role: 'driver', sourceModule: 'x' }, task: REQUEST_TASK.NOR_GENERATE, input: { text: 'buat NOR' } }));
  check(rejected.response.status === RESPONSE_STATUS.ERROR && rejected.response.error.code === RESPONSE_ERRORS.FORBIDDEN, 'a non-admin caller is rejected FORBIDDEN (admin-pilot policy)');
  const noActor = await svc.handle(makeIntelligenceRequest({ requestId: 'a2', task: REQUEST_TASK.NOR_GENERATE, input: { text: 'buat NOR' } }));
  check(noActor.response.error.code === RESPONSE_ERRORS.FORBIDDEN, 'a request with no actor is rejected');
}

section('Disabled mode — deterministic only, no model call, no failure (PART 4)');
reset();
{
  let modelCalls = 0;
  const spyProvider = { async complete() { modelCalls++; return { schema: 'model-completion@1', ok: true, text: 'x', usage: {}, model: 'm', durationMs: 1, error: null }; } };
  const svc = makeSvc({ provider: spyProvider });
  check(cfg.isIntelligenceEnabled() === false, 'intelligence.enabled is false by default');
  const r1 = await svc.handle(norReq('d1', 'buat NOR pengadaan kursi', { type: 'Pengadaan', item: 'kursi', quantity: '10', purpose: 'rapat', budget: '5jt', recipient: 'Bendahara' }));
  check(r1.response.status === RESPONSE_STATUS.REQUIRES_REVIEW, 'a complete request still produces a draft in disabled mode');
  check(r1.response.draft.fields.metadata.bodySource === 'template', 'disabled mode → deterministic TEMPLATE body');
  check(modelCalls === 0, 'disabled mode NEVER calls provider.complete()');
}

section('Enabled mode — provider.complete() drives the body (PART 3)');
reset();
{
  cfg.setIntelligenceConfig({ enabled: true, provider: 'openai' });
  let calls = 0;
  const prov = createOpenAiProvider({ callModel: async () => { calls++; return { schema: 'model-completion@1', ok: true, text: 'Dengan hormat, bersama ini...', usage: { inputTokens: 7, outputTokens: 12 }, model: 'gpt-4o-mini', durationMs: 4, error: null }; } });
  const svc = makeSvc({ provider: prov });
  const r = await svc.handle(norReq('e1', 'buat NOR pengadaan meja', { type: 'Pengadaan', item: 'meja', quantity: '5', purpose: 'rapat', budget: '5jt', recipient: 'Bendahara' }));
  check(r.response.status === RESPONSE_STATUS.REQUIRES_REVIEW && calls === 1, 'enabled mode calls the model exactly once for the body');
  check(r.response.draft.fields.metadata.bodySource === 'model', 'enabled mode → body sourced from the model');
  check(r.response.provenance && r.response.provenance.model === 'gpt-4o-mini', 'provenance records the model id (PART 12)');
  check(r.response.provenance.promptVersion === 'nor-draft@1', 'provenance records the prompt version');
}

section('Enabled mode — provider failure degrades gracefully (PART 13)');
reset();
{
  cfg.setIntelligenceConfig({ enabled: true });
  const boom = createOpenAiProvider({ callModel: async () => { throw new Error('network down'); } });
  const svc = makeSvc({ provider: boom });
  const r = await svc.handle(norReq('f1', 'buat NOR pengadaan lemari', { type: 'Pengadaan', item: 'lemari', quantity: '2', purpose: 'arsip', budget: '3jt', recipient: 'Bendahara' }));
  check(r.response.status === RESPONSE_STATUS.REQUIRES_REVIEW && !!r.response.draft, 'a provider failure still returns a safe draft, never a crash');
  check(r.response.draft.fields.metadata.bodySource === 'template', 'failure falls back to the deterministic template body');
  check(r.modelError && r.modelError.code === 'NETWORK', 'the model error is reported alongside, not swallowed silently');
}

section('Clarification loop (PART 6)');
reset();
{
  const svc = makeSvc();
  const t1 = await svc.handle(norReq('c1', 'Buatkan NOR pembelian mesin potong rumput'));
  check(t1.response.status === RESPONSE_STATUS.NEEDS_INPUT, 'an incomplete NOR request → needs_input');
  const ids1 = t1.response.questions.map((q) => q.id);
  check(ids1.length >= 2, `multiple missing fields are asked at once (${ids1.join(', ')})`);
  check(!ids1.includes('type'), 'the NOR type extracted from the utterance ("pembelian" ⇒ Pengadaan) is NOT re-asked');
  const conv = t1.conversationId;
  const t2 = await svc.continueSession(conv, { item: 'mesin potong rumput Honda GX35', quantity: '2 unit' }, adminActor);
  check(t2.response.status === RESPONSE_STATUS.NEEDS_INPUT, 'turn 2 still needs the remaining fields');
  const ids2 = t2.response.questions.map((q) => q.id);
  check(!ids2.includes('item') && !ids2.includes('quantity'), 'already-answered fields (item, quantity) are NOT asked again (PART 6)');
  const t3 = await svc.continueSession(conv, { purpose: 'perawatan lapangan', budget: '8 juta' }, adminActor);
  check(t3.response.status === RESPONSE_STATUS.NEEDS_INPUT && t3.response.questions.map((q) => q.id).includes('recipient'), 'all fields known ⇒ the ONE remaining question is the recipient (PART 8 — asked, not invented)');
  const t4 = await svc.continueSession(conv, { recipient: 'Sekretaris Jenderal' }, adminActor);
  check(t4.response.status === RESPONSE_STATUS.REQUIRES_REVIEW, 'once the recipient is supplied ⇒ requires_review with a draft');
  check(t4.response.draft.fields.recipient === 'Sekretaris Jenderal', 'the recipient in the draft is exactly what the human answered (never fabricated)');
  check(t4.response.review && t4.response.review.blocking === true, 'the draft is BLOCKING on human review — never auto-published (PART 1)');
}

section('Recipient is contextual — different NORs, different recipients (PART 8, PART 15)');
reset();
{
  const svc = makeSvc();
  const mk = async (id, recip) => {
    const t = await svc.handle(norReq(id, 'buat NOR pengadaan barang', { type: 'Pengadaan', item: 'barang', quantity: '1', purpose: 'x', budget: '1jt', recipient: recip }));
    return t.response.draft.fields.recipient;
  };
  check(await mk('rc1', 'Sekretaris Jenderal') === 'Sekretaris Jenderal', 'NOR A → Kepada: Sekretaris Jenderal');
  check(await mk('rc2', 'Bendahara') === 'Bendahara', 'NOR B → Kepada: Bendahara (no fixed recipient rule)');
}

section('Recipient from a consistent archive pattern is PROPOSED, never imposed (PART 8)');
reset();
{
  // inject a memoryReader whose archive consistently addressed one recipient
  const ports = buildDefaultPorts();
  ports.memoryReader = { listArchive: () => ({ ok: true, data: Array.from({ length: 5 }, (_, i) => ({ id: `a${i}`, recipient: 'Sekretaris Jenderal', createdAt: `2026-01-0${i + 1}` })) }) };
  const svc = createIntelligenceService({ ports, provider: { async complete() { return { schema: 'model-completion@1', ok: true, text: 'b', usage: {}, model: 'm', durationMs: 1, error: null }; } }, authz: authzAdmin, config: { isEnabled: () => false, get: () => cfg.getIntelligenceConfig() }, idgen });
  const t = await svc.handle(norReq('rp1', 'buat NOR pengadaan alat', { type: 'Pengadaan', item: 'alat', quantity: '3', purpose: 'x', budget: '2jt' }));
  check(t.response.status === RESPONSE_STATUS.REQUIRES_REVIEW, 'a consistent history lets the flow proceed without re-asking');
  check(t.response.draft.fields.recipient === 'Sekretaris Jenderal' && t.response.draft.fields.recipientStatus === 'proposed', 'the recipient is PROPOSED from the pattern and flagged recipientStatus:"proposed" (a human still confirms)');
}

section('Knowledge integration (PART 7)');
reset();
{
  let listCalls = 0;
  const ports = buildDefaultPorts();
  ports.knowledgeReader = {
    listKnowledge: (filter) => {
      listCalls++;
      return { ok: true, data: [
        { id: 'k1', domainType: 'nor', kind: 'pattern', lifecycleState: 'approved', payload: { text: 'Perihal diawali "Realisasi"' } },
        { id: 'k2', domainType: 'nor', kind: 'draft-thing', lifecycleState: 'draft', payload: {} },
      ].filter((k) => k.domainType === filter.domainType && k.lifecycleState === filter.lifecycleState) };
    },
  };
  const svc = createIntelligenceService({ ports, provider: { async complete() { return { schema: 'model-completion@1', ok: true, text: 'b', usage: {}, model: 'm', durationMs: 1, error: null }; } }, authz: authzAdmin, config: { isEnabled: () => false, get: () => cfg.getIntelligenceConfig() }, idgen });
  const t = await svc.handle(norReq('k1', 'buat NOR pengadaan', { type: 'Pengadaan', item: 'x', quantity: '1', purpose: 'y', budget: '1jt', recipient: 'Bendahara' }));
  check(listCalls >= 1, 'the service retrieves Approved Knowledge for the draft');
  check(t.response.draft.fields.metadata.knowledgeRefs.includes('k1'), 'only the APPROVED item (k1) is used as a reference');
  check(!t.response.draft.fields.metadata.knowledgeRefs.includes('k2'), 'a non-approved (draft) item is never used');
  // generated output does NOT become approved knowledge — the service imports no promote/ingest path.
  // NOTE: the Phase 4 NOR-draft store legitimately exposes createDraft/updateDraft (persist a
  // human-reviewable NOR draft — NOT knowledge), so the guard is scoped to knowledge-write symbols
  // and to any import from src/knowledge/{services,repository}.
  const svcSrc = (await import('node:fs')).readFileSync(new URL('../src/intelligence/service/intelligence-service.js', import.meta.url), 'utf8');
  const retrSrc = (await import('node:fs')).readFileSync(new URL('../src/intelligence/retrieval/knowledge-retrieval.js', import.meta.url), 'utf8');
  const knowledgeWrite = /from ['"][^'"]*knowledge\/(services|repository)/.test(svcSrc)
    || /promoteKnowledge|mergeKnowledge|appendVersion|ingestKnowledge|\bingest\(/.test(svcSrc + retrSrc)
    || /knowledge[A-Za-z]*\.(save|write|create|promote|ingest|approve)\s*\(/.test(svcSrc + retrSrc);
  check(!knowledgeWrite, 'the Intelligence layer calls NO knowledge write/promote path — generated output never auto-becomes Approved Knowledge (PART 7)');
}

section('Inaccessible knowledge is rejected (PART 11)');
reset();
{
  const svc = makeSvc({ authz: { canUseIntelligence: (a) => !!a && a.role === 'admin', canAccessKnowledge: () => false } });
  const t = await svc.handle(norReq('ka1', 'buat NOR pengadaan', { type: 'Pengadaan', item: 'x', quantity: '1', purpose: 'y', budget: '1jt', recipient: 'Bendahara' }));
  check(t.response.status === RESPONSE_STATUS.ERROR && t.response.error.code === RESPONSE_ERRORS.FORBIDDEN, 'if the actor may not read the knowledge, the request is refused — the model is never asked');
}

section('Numbering — suggestion ≠ official (PART 9, PART 12)');
reset();
{
  const ports = buildDefaultPorts();
  ports.numbering = { suggestNextNumber: () => ({ domainType: 'nor', suggestedNumber: 'NOR-2026-015', basis: 'next after NOR-2026-014', confidence: 0.9, computedAt: '2026-01-01T00:00:00Z' }) };
  const svc = createIntelligenceService({ ports, provider: { async complete() { return { schema: 'model-completion@1', ok: true, text: 'b', usage: {}, model: 'm', durationMs: 1, error: null }; } }, authz: authzAdmin, config: { isEnabled: () => false, get: () => cfg.getIntelligenceConfig() }, idgen });
  const t = await svc.handle(norReq('nm1', 'buat NOR pengadaan', { type: 'Pengadaan', item: 'x', quantity: '1', purpose: 'y', budget: '1jt', recipient: 'Bendahara' }));
  check(t.numbering.suggestedNumber === 'NOR-2026-015', 'the service surfaces a SUGGESTED number');
  check(t.numbering.publishedNumber === null, 'the AI layer NEVER sets an official/published number');
  check(t.numbering.source === 'system_suggested', 'the number is flagged as a system suggestion');
  check(!('norNumber' in t.response.draft.fields) || !t.response.draft.fields.norNumber, 'the draft fields carry NO official norNumber');
}

section('Conversation state — durable, multi-turn, isolated (PART 10)');
reset();
{
  const svc = makeSvc();
  const t1 = await svc.handle(norReq('s1', 'buat NOR pengadaan sepatu'));
  const conv = t1.conversationId;
  check(t1.response.status === RESPONSE_STATUS.NEEDS_INPUT, 'request 1 → needs_input');
  const sess1 = await svc.getSession(conv, { userId: 'evan' });
  check(sess1.ok && sess1.conversation.turnCount === 1 && sess1.conversation.status === 'needs_input', 'server holds turn-1 state (convId, status, collectedFields)');
  const t2 = await svc.continueSession(conv, { item: 'sepatu', quantity: '30' }, adminActor);
  check(t2.response.status === RESPONSE_STATUS.NEEDS_INPUT, 'request 2 retains state and advances');
  const sess2 = await svc.getSession(conv, { userId: 'evan' });
  check(sess2.conversation.collectedFields.item === 'sepatu' && sess2.conversation.turnCount === 2, 'accumulated fields persist across turns');
  const t3 = await svc.continueSession(conv, { purpose: 'atlet', budget: '30jt', recipient: 'Bendahara' }, adminActor);
  check(t3.response.status === RESPONSE_STATUS.REQUIRES_REVIEW, 'request 3 → requires_review');
  const other = await svc.getSession(conv, { userId: 'mallory' });
  check(other.ok === false && other.error.code === 'FORBIDDEN', 'another user cannot read this session (state isolation)');
  const otherCont = await svc.continueSession(conv, { item: 'hack' }, { userId: 'mallory', role: 'admin' });
  check(otherCont.response.status === RESPONSE_STATUS.ERROR && otherCont.response.error.code === RESPONSE_ERRORS.FORBIDDEN, 'another user cannot continue this session');
}

section('Defensive bounds — no infinite conversation (PART 13)');
reset();
{
  cfg.setIntelligenceConfig({ limits: { maxTurns: 3 } });
  const svc = makeSvc();
  const t1 = await svc.handle(norReq('l1', 'buat NOR pengadaan barang'));
  const conv = t1.conversationId;
  await svc.continueSession(conv, {}, adminActor);              // turn 2
  await svc.continueSession(conv, {}, adminActor);              // turn 3
  const capped = await svc.continueSession(conv, {}, adminActor); // turn 4 — over the cap
  check(capped.response.status === RESPONSE_STATUS.ERROR && capped.response.error.code === RESPONSE_ERRORS.LIMIT, 'continuing past maxTurns → a controlled LIMIT error, not a loop');
}

section('Unsupported task / empty input (PART 5)');
reset();
{
  const svc = makeSvc();
  const bad = await svc.handle(makeIntelligenceRequest({ requestId: 'u1', actor: adminActor, task: 'knowledge.query', input: { text: 'x' } }));
  check(bad.response.error.code === RESPONSE_ERRORS.INVALID_REQUEST, 'an unsupported task → INVALID_REQUEST (only nor.generate in Phase 1)');
  const empty = await svc.handle(norReq('u2', '   '));
  check(empty.response.error.code === RESPONSE_ERRORS.INVALID_REQUEST, 'empty input.text → INVALID_REQUEST');
  const unknown = await svc.handle(norReq('u3', 'halo apa kabar'));
  check(unknown.response.error.code === RESPONSE_ERRORS.UNKNOWN_INTENT, 'an unclassifiable utterance → UNKNOWN_INTENT, never a fabricated draft');
}

reset();
console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'} — ${fail} failing check(s).`);
process.exit(fail === 0 ? 0 : 1);
