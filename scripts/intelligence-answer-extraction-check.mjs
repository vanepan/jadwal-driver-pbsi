/* ============================================================
   intelligence-answer-extraction-check.mjs — Sarpras Intelligence (V2)

   Proves multi-turn fact ACCUMULATION: a free-text conversation reply is
   parsed into the {field: value} facts it answers by SEMANTIC meaning and
   MERGED into the conversation's canonical state — never dumped onto
   "whichever question is first in the queue".

   PURE node. The conversation engine + intelligence-service run for real
   against the in-memory conversation repository (no Firebase, no OpenAI).

   Cases:
     A  multi-fact answer   "2 unit Honda GX35."  → item + quantity + unit
     B  purpose             "Untuk perawatan lapangan PBSI." → purpose
     C  recipient distinct  "Bendahara." (recipient gate) → recipient, purpose untouched
     D  answer out of order (budget before item) still captured
     E  several facts in one message all captured
     F  facts survive the next turn (persistence)
     G  the reported 4-turn E2E, end to end
     +  structured {field: value} answers still work unchanged (no regression)
     +  a non-answer ("Bendahara" where budget is asked) is NOT mis-assigned

   Run:  node scripts/intelligence-answer-extraction-check.mjs
   ============================================================ */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let fail = 0;
const check = (cond, msg) => { console.log(`${cond ? '✓' : '✗'} ${msg}`); if (!cond) fail++; };
const section = (t) => console.log(`\n── ${t} ──`);

const { extractAnswerFacts } = await import('../src/intelligence/service/answer-extractor.js');
const { createIntelligenceService } = await import('../src/intelligence/service/intelligence-service.js');
const { buildDefaultPorts } = await import('../src/intelligence/service/default-ports.js');
const store = await import('../src/intelligence/conversation/intelligence-conversation-store.js');
const { memoryIntelligenceConversationBackend, resetMemoryIntelligenceConversationBackend } =
  await import('../src/intelligence/conversation/backends/memory-intelligence-conversation-backend.js');
const { makeIntelligenceRequest, REQUEST_TASK } = await import('../src/intelligence/contracts/intelligence-request-contract.js');
const { RESPONSE_STATUS } = await import('../src/intelligence/contracts/intelligence-response-contract.js');
const cfg = await import('../src/intelligence/config/intelligence-config.js');
const { resetConversationRepository } = await import('../src/conversation/repository/conversation-repository.js');

const PENGADAAN_FIELDS = ['item', 'quantity', 'purpose', 'budget'];

/* ════════════════════════════════════════════════════════════════════════
   1. THE PURE EXTRACTOR
   ════════════════════════════════════════════════════════════════════════ */

section('A — a multi-fact answer fills several slots at once');
{
  const f = extractAnswerFacts('2 unit Honda GX35.', { pendingFields: PENGADAAN_FIELDS, knownFacts: { type: 'Pengadaan' } });
  check(f.item === 'Honda GX35', `item = "${f.item}"  (expected "Honda GX35")`);
  check(f.quantity === 2, `quantity = ${JSON.stringify(f.quantity)}  (expected 2)`);
  check(f.unit === 'unit', `unit = "${f.unit}"  (expected "unit")`);
  check(f.purpose === undefined && f.budget === undefined, 'purpose + budget NOT invented from this message');
}

section('B — a purpose answer is captured as purpose (user phrasing kept)');
{
  const f = extractAnswerFacts('Untuk perawatan lapangan PBSI.', { pendingFields: ['purpose', 'budget'], knownFacts: { item: 'x', quantity: 2 } });
  check(f.purpose === 'Untuk perawatan lapangan PBSI', `purpose = "${f.purpose}"`);
  check(!('budget' in f) && !('item' in f) && !('quantity' in f), 'nothing else touched');
}

section('C — recipient is a DISTINCT field, never folded into purpose');
{
  // recipient gate: the only thing being asked is the recipient
  const f = extractAnswerFacts('Bendahara.', { pendingFields: ['recipient'], knownFacts: { item: 'x', quantity: 2, purpose: 'perawatan lapangan' } });
  check(f.recipient === 'Bendahara', `recipient = "${f.recipient}"`);
  check(f.purpose === undefined, 'purpose is NOT set to "Bendahara"');
  // explicit "Kepada X" anywhere
  const g = extractAnswerFacts('Kepada Bendahara', { pendingFields: ['recipient'] });
  check(g.recipient === 'Bendahara' && g.purpose === undefined, '"Kepada Bendahara" → recipient, not purpose');
  // "Bendahara" where a BUDGET is asked → NOT accepted as budget
  const h = extractAnswerFacts('Bendahara.', { pendingFields: ['budget'], knownFacts: { item: 'x', quantity: 2, purpose: 'y' } });
  check(Object.keys(h).length === 0, 'a name where a budget amount is asked → extracts nothing (not mis-assigned to budget)');
}

section('D — an answer for a LATER field, given before an earlier one, is still captured');
{
  const f = extractAnswerFacts('anggaran sekitar 8 juta', { pendingFields: PENGADAAN_FIELDS, knownFacts: {} });
  check(/8\s*juta/i.test(String(f.budget || '')), `budget captured out of order = "${f.budget}"`);
  check(f.quantity === undefined, 'the "8" in the budget is NOT mistaken for a quantity');
}

section('E — several facts in one message are ALL captured');
{
  const f = extractAnswerFacts('Beli 4 unit Honda GX35 untuk perawatan lapangan, estimasi 20 juta', { pendingFields: PENGADAAN_FIELDS });
  check(f.quantity === 4, `quantity = ${JSON.stringify(f.quantity)}`);
  check(f.unit === 'unit', `unit = "${f.unit}"`);
  check(f.item === 'Honda GX35', `item = "${f.item}"`);
  check(f.purpose === 'perawatan lapangan', `purpose = "${f.purpose}"`);
  check(/20\s*juta/i.test(String(f.budget || '')), `budget = "${f.budget}"`);
}

section('generalization — not overfit to the four test strings');
{
  const c1 = extractAnswerFacts('3 unit mesin potong rumput Honda GX35', { pendingFields: PENGADAAN_FIELDS });
  check(c1.quantity === 3 && c1.item === 'mesin potong rumput Honda GX35', 'variant quantities + multi-word items');
  const c2 = extractAnswerFacts('Tujuannya untuk perawatan lapangan PBSI', { pendingFields: ['purpose', 'budget'] });
  check(/^Tujuannya untuk perawatan lapangan PBSI$/.test(c2.purpose || ''), '"Tujuannya untuk …" → whole phrase as purpose');
  const c3 = extractAnswerFacts('Untuk Bendahara, anggaran sekitar 10 juta', { pendingFields: ['recipient', 'budget'] });
  check(c3.recipient === 'Bendahara' && /10\s*juta/i.test(String(c3.budget || '')), '"Untuk <Name>, anggaran …" → recipient + budget');
  const c4 = extractAnswerFacts('10', { pendingFields: ['quantity'] });
  check(c4.quantity === 10 && c4.unit === 'unit', 'a bare number answering "quantity" → quantity + default unit');
  const c5 = extractAnswerFacts('kursi', { pendingFields: PENGADAAN_FIELDS });
  check(c5.item === 'kursi' && Object.keys(c5).length === 1, 'a bare noun with item still open → item only');
}

/* ════════════════════════════════════════════════════════════════════════
   2. END-TO-END THROUGH THE INTELLIGENCE SERVICE (persistence + merge)
   ════════════════════════════════════════════════════════════════════════ */

function newService() {
  store.resetIcStore();
  store.registerIcBackend(memoryIntelligenceConversationBackend);
  store.setActiveIcBackend('memory');
  resetMemoryIntelligenceConversationBackend();
  resetConversationRepository();
  cfg.resetIntelligenceConfig();
  let n = 0;
  return createIntelligenceService({
    ports: buildDefaultPorts(),
    provider: { async complete() { return { schema: 'model-completion@1', ok: true, text: 'Badan surat.', usage: {}, model: 'stub', durationMs: 1, error: null }; } },
    authz: { canUseIntelligence: (a) => !!a && a.role === 'admin', canAccessKnowledge: () => true },
    config: { isEnabled: () => cfg.isIntelligenceEnabled(), get: () => cfg.getIntelligenceConfig() },
    idgen: () => `conv_ax_${++n}`,
  });
}
const ACTOR = { userId: 'evan', role: 'admin' };
const req = (id, text) => makeIntelligenceRequest({ requestId: id, actor: { userId: 'evan', role: 'admin', sourceModule: 'intelligence' }, task: REQUEST_TASK.NOR_GENERATE, domainType: 'nor', input: { text } });

section('F — a fact given on one turn SURVIVES into the next turn');
{
  const svc = newService();
  const t1 = await svc.handle(req('f1', 'Buatkan NOR pembelian mesin potong rumput.'));
  const conv = t1.conversationId;
  check(t1.response.status === RESPONSE_STATUS.NEEDS_INPUT, 'turn 1 → needs_input');
  await svc.continueSession(conv, { text: '2 unit Honda GX35.' }, ACTOR);
  const s2 = await svc.getSession(conv, { userId: 'evan' });
  check(s2.ok && s2.conversation.collectedFields.item === 'Honda GX35' && Number(s2.conversation.collectedFields.quantity) === 2,
    'after turn 2 the persisted conversation holds item=Honda GX35, quantity=2');
  const t3 = await svc.continueSession(conv, { text: 'Untuk perawatan lapangan PBSI.' }, ACTOR);
  const s3 = await svc.getSession(conv, { userId: 'evan' });
  check(s3.conversation.collectedFields.item === 'Honda GX35' && Number(s3.conversation.collectedFields.quantity) === 2,
    'turn 3 did NOT discard the turn-2 facts');
  check(s3.conversation.collectedFields.purpose === 'Untuk perawatan lapangan PBSI', 'turn 3 added purpose');
  const stillAsked = t3.response.status === RESPONSE_STATUS.NEEDS_INPUT ? t3.response.questions.map((q) => q.id) : [];
  check(!stillAsked.includes('item') && !stillAsked.includes('quantity') && !stillAsked.includes('purpose'),
    `turn 3 no longer asks for already-known fields (still asks: ${stillAsked.join(', ') || 'none'})`);
}

section('G — the reported four-turn conversation, end to end');
{
  const svc = newService();
  const t1 = await svc.handle(req('g1', 'Buatkan NOR pembelian mesin potong rumput.'));
  const conv = t1.conversationId;
  const q1 = t1.response.questions.map((q) => q.id);
  check(q1.includes('item') && q1.includes('quantity') && q1.includes('purpose') && q1.includes('budget'), `TURN 1 asks item/quantity/purpose/budget (${q1.join(',')})`);

  const t2 = await svc.continueSession(conv, { text: '2 unit Honda GX35.' }, ACTOR);
  const q2 = t2.response.status === RESPONSE_STATUS.NEEDS_INPUT ? t2.response.questions.map((q) => q.id) : ['<' + t2.response.status + '>'];
  check(!q2.includes('item') && !q2.includes('quantity'), `TURN 2 → item+quantity satisfied, remaining: ${q2.join(',')}`);

  const t3 = await svc.continueSession(conv, { text: 'Untuk perawatan lapangan PBSI.' }, ACTOR);
  const q3 = t3.response.status === RESPONSE_STATUS.NEEDS_INPUT ? t3.response.questions.map((q) => q.id) : ['<' + t3.response.status + '>'];
  check(q3.length === 1 && q3[0] === 'budget', `TURN 3 → only budget remains (${q3.join(',')})`);

  const t4 = await svc.continueSession(conv, { text: 'Bendahara.' }, ACTOR);
  check(t4.response.status === RESPONSE_STATUS.NEEDS_INPUT && t4.response.questions.map((q) => q.id).join(',') === 'budget',
    'TURN 4 → "Bendahara" does NOT answer the budget question; budget is still asked');
  check(t4.unmatchedAnswer === true, 'TURN 4 → the service flags the reply as not matching any pending question');
  const s4 = await svc.getSession(conv, { userId: 'evan' });
  check(s4.conversation.collectedFields.budget === undefined && s4.conversation.collectedFields.purpose === 'Untuk perawatan lapangan PBSI',
    'TURN 4 → budget was NOT set to "Bendahara"; purpose was NOT overwritten');

  // the honest completion: a real budget, then the recipient
  const t5 = await svc.continueSession(conv, { text: 'Rp 4 juta per unit' }, ACTOR);
  check(t5.response.status === RESPONSE_STATUS.NEEDS_INPUT && t5.response.questions.map((q) => q.id).includes('recipient'),
    'TURN 5 (budget supplied) → conversation READY, recipient now asked');
  const t6 = await svc.continueSession(conv, { text: 'Bendahara' }, ACTOR);
  check(t6.response.status === RESPONSE_STATUS.REQUIRES_REVIEW, 'TURN 6 (recipient supplied) → requires_review');
  const d = t6.response.draft.fields;
  check(d.recipient === 'Bendahara' && d.recipientStatus === 'known', `draft recipient = "${d.recipient}" (${d.recipientStatus})`);
  check(d.details && d.details.item === 'Honda GX35' && Number(d.details.quantity) === 2 && /perawatan lapangan/.test(d.details.purpose || ''),
    'draft carries item / quantity / purpose from the earlier turns');
  check(t6.numbering && typeof t6.numbering.suggestedNumber === 'string' && t6.numbering.publishedNumber === null,
    'suggestedNumber only — publishedNumber is null (no publication)');
}

section('no regression — a structured { field: value } answer still works');
{
  const svc = newService();
  const t1 = await svc.handle(req('r1', 'buat NOR pengadaan kursi'));
  const conv = t1.conversationId;
  const t2 = await svc.continueSession(conv, { item: 'kursi lipat', quantity: '10', purpose: 'rapat', budget: '5jt' }, ACTOR);
  check(t2.response.status === RESPONSE_STATUS.NEEDS_INPUT && t2.response.questions.map((q) => q.id).includes('recipient'),
    'structured answers merge exactly as before → recipient gate');
  const t3 = await svc.continueSession(conv, { recipient: 'Bendahara' }, ACTOR);
  check(t3.response.status === RESPONSE_STATUS.REQUIRES_REVIEW && t3.response.draft.fields.recipient === 'Bendahara',
    'structured recipient answer → requires_review');
}

section('static — the extractor is pure');
{
  const src = fs.readFileSync(path.join(ROOT, 'src/intelligence/service/answer-extractor.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  check(!/\bfetch\s*\(|firebase|localStorage|document\.|window\.|process\.env|import\s+.*from/.test(src.replace(/^'use strict';$/m, '')),
    'answer-extractor.js: no I/O, no imports — a pure function');
}

console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'} — ${fail} failing check(s).`);
process.exit(fail === 0 ? 0 : 1);
