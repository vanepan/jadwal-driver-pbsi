/* ============================================================
   intelligence-nor-draft-service-check.mjs — Sarpras Intelligence (V2, Phase 4)

   PURE node integration test for the Intelligence Service ⇄ NOR-draft store
   seam. No browser, no Firebase, no network — the conversation store uses
   its in-memory backend and the NOR-draft store uses its in-memory backend.
   Proves the Phase 4 lifecycle the user must be able to walk:

     intake → requires_review → a STRUCTURED, persisted NOR draft
            → getDraft            (the same record comes back)
            → updateDraft (≥2 fields)  → version 2, humanEdited, audited
            → getDraft            (the human edits SURVIVED a reload)
     • structured facts (item/quantity/unit/purpose/budget) are NEVER
       overwritten by the generated body, nor by an edit to another field
     • numbering.publishedNumber stays null throughout — no publish, no number
     • cross-owner getDraft / updateDraft → FORBIDDEN
     • a non-admin caller → FORBIDDEN (same gate as every entry point)
     • updateDraft never calls the model provider (no regeneration this phase)
     • a persistence FAILURE is recoverable: the requires_review response
       still returns, with draftError set and no draftId
     • an unconfigured (null) draft backend is silent: requires_review with
       no draftId and no draftError

   Run:  node scripts/intelligence-nor-draft-service-check.mjs   (exit 0 = pass)
   ============================================================ */

import { createIntelligenceService } from '../src/intelligence/service/intelligence-service.js';
import { buildDefaultPorts } from '../src/intelligence/service/default-ports.js';
import { makeIntelligenceRequest, REQUEST_TASK } from '../src/intelligence/contracts/intelligence-request-contract.js';
import { RESPONSE_STATUS } from '../src/intelligence/contracts/intelligence-response-contract.js';
import {
  registerIcBackend, setActiveIcBackend, resetIcStore,
} from '../src/intelligence/conversation/intelligence-conversation-store.js';
import {
  memoryIntelligenceConversationBackend, resetMemoryIntelligenceConversationBackend,
} from '../src/intelligence/conversation/backends/memory-intelligence-conversation-backend.js';
import {
  registerNorDraftBackend, setActiveNorDraftBackend, resetNorDraftStore, getActiveNorDraftBackendId,
} from '../src/intelligence/nor-draft/nor-draft-store.js';
import {
  memoryNorDraftBackend, resetMemoryNorDraftBackend,
} from '../src/intelligence/nor-draft/backends/memory-nor-draft-backend.js';
import { DRAFT_STORE_ERRORS } from '../src/intelligence/nor-draft/contracts/nor-draft-store-contract.js';
import * as cfg from '../src/intelligence/config/intelligence-config.js';
import { resetConversationRepository } from '../src/conversation/repository/conversation-repository.js';

let fail = 0;
const check = (cond, msg) => { console.log(`${cond ? '✓' : '✗'} ${msg}`); if (!cond) fail++; };
const section = (t) => console.log(`\n── ${t} ──`);

let _n = 0;
const idgen = () => `conv_${++_n}`;
const ADMIN = { userId: 'evan', role: 'admin', sourceModule: 'intelligence' };
const authz = { canUseIntelligence: (a) => !!a && a.role === 'admin', canAccessKnowledge: () => true };

let modelCalls = 0;
const spyProvider = {
  async complete() {
    modelCalls += 1;
    return { schema: 'model-completion@1', ok: true, text: 'Dengan hormat, bersama ini diajukan pengadaan mesin potong rumput untuk perawatan lapangan.', usage: { inputTokens: 8, outputTokens: 18 }, model: 'fake-model', durationMs: 2, error: null };
  },
};

function useMemoryBackends() {
  resetIcStore();
  registerIcBackend(memoryIntelligenceConversationBackend);
  setActiveIcBackend('memory');
  resetMemoryIntelligenceConversationBackend();
  resetNorDraftStore();
  registerNorDraftBackend(memoryNorDraftBackend);
  setActiveNorDraftBackend('memory');
  resetMemoryNorDraftBackend();
  resetConversationRepository();
  cfg.resetIntelligenceConfig();
  cfg.setIntelligenceConfig({ enabled: true }); // exercise the model-body path too
  modelCalls = 0;
}

function newSvc(extra = {}) {
  return createIntelligenceService({
    ports: buildDefaultPorts(),
    provider: spyProvider,
    authz,
    config: { isEnabled: () => cfg.isIntelligenceEnabled(), get: () => cfg.getIntelligenceConfig() },
    idgen,
    ...extra,
  });
}

const norReq = (requestId, text, fields = {}) => makeIntelligenceRequest({
  requestId, actor: ADMIN, task: REQUEST_TASK.NOR_GENERATE, domainType: 'nor', input: { text, fields },
});

const FULL = { item: 'mesin potong rumput', quantity: '2', unit: 'unit', purpose: 'perawatan lapangan PBSI', budget: 'Rp8.000.000', recipient: 'Bendahara' };

/* ════════════════════════════════════════════════════════════════════════ */

section('requires_review → a STRUCTURED draft is persisted');
useMemoryBackends();
let svc = newSvc();
const t1 = await svc.handle(norReq('p4-t1', 'Buatkan NOR pembelian mesin potong rumput.', FULL));
check(t1.response.status === RESPONSE_STATUS.REQUIRES_REVIEW, 'turn 1 with every fact supplied → requires_review');
const convId = t1.conversationId;
const draftId = t1.draftId;
check(typeof draftId === 'string' && draftId === `draft_${convId}`, `a draftId is returned, keyed to the conversation (${draftId})`);
check(t1.draftError == null, 'no draftError on the happy path');
check(t1.response.draft && t1.response.draft.fields && typeof t1.response.draft.fields.body === 'string', 'the response still carries the structured draft view');
check(modelCalls === 1, 'the model was called once for the body');

section('getDraft — the persisted record is structured + review-gated');
const g1 = await svc.getDraft(draftId, ADMIN);
check(g1.ok === true, 'getDraft(owner) → ok');
const d = g1.draft;
check(d.schema === 'intelligence-nor-draft@1' && d.status === 'requires_review', 'schema + status are the Phase 4 contract (requires_review)');
check(d.conversationId === convId && d.ownerId === 'evan' && d.version === 1, 'draftId/conversationId/ownerId/version present');
check(d.facts.item === 'mesin potong rumput' && String(d.facts.quantity) === '2' && d.facts.purpose === 'perawatan lapangan PBSI' && d.facts.budget === 'Rp8.000.000', 'structured facts are stored SEPARATELY from the body, verbatim from intake');
check(d.recipient === 'Bendahara' && !('recipient' in d.facts), 'recipient is its OWN field — never folded into the fact bag / purpose');
check(typeof d.body === 'string' && d.body.length > 0 && d.body !== d.facts.purpose, 'the generated body is a distinct field');
check(d.numbering.publishedNumber === null, 'numbering.publishedNumber is null (no publication, no number)');
check(Array.isArray(d.auditTrail) && d.auditTrail.length === 1 && d.auditTrail[0].type === 'AI_DRAFT_CREATED', 'the auditTrail opens with AI_DRAFT_CREATED');
check(d.humanEdited === false, 'humanEdited is false before any edit');

section('updateDraft — human edits ≥2 fields, are audited, and SURVIVE a reload');
const beforeEditModelCalls = modelCalls;
const u1 = await svc.updateDraft(draftId, { budget: 'Rp10.000.000', body: 'Isi surat yang telah disunting oleh reviewer.', item: 'mesin potong rumput Honda GX35' }, ADMIN);
check(u1.ok === true && u1.draft.version === 2, 'updateDraft → version 2');
check(u1.draft.humanEdited === true, 'humanEdited flips to true');
check(modelCalls === beforeEditModelCalls, 'updateDraft did NOT call the model (no regeneration this phase)');
const ev = u1.draft.auditTrail[u1.draft.auditTrail.length - 1];
check(ev.type === 'AI_DRAFT_EDITED' && ev.actorId === 'evan' && ev.changedFields.slice().sort().join(',') === 'body,budget,item', 'an AI_DRAFT_EDITED entry records actor + the changed fields');
const g2 = await svc.getDraft(draftId, ADMIN);
check(g2.draft.facts.budget === 'Rp10.000.000' && g2.draft.body === 'Isi surat yang telah disunting oleh reviewer.' && g2.draft.facts.item === 'mesin potong rumput Honda GX35', 'a fresh getDraft shows the human edits — they persisted (reload-safe)');
check(g2.draft.facts.quantity && String(g2.draft.facts.quantity) === '2' && g2.draft.facts.purpose === 'perawatan lapangan PBSI', 'the fields the reviewer did NOT touch are unchanged');
check(g2.draft.recipient === 'Bendahara', 'recipient still intact');
check(g2.draft.numbering.publishedNumber === null, 'still no publishedNumber after the edit');

section('AI generation never overwrites the structured facts');
check(g2.draft.facts.purpose === 'perawatan lapangan PBSI' && !/Dengan hormat/.test(g2.draft.facts.purpose), 'the model prose lives ONLY in body — the structured purpose is the human value');

section('a no-op / empty edit is harmless');
const u2 = await svc.updateDraft(draftId, { budget: 'Rp10.000.000' }, ADMIN);
check(u2.ok === true && u2.draft.version === 2 && u2.draft.auditTrail.length === g2.draft.auditTrail.length, 'an edit that changes nothing does not bump the version or append audit');

section('get-or-create is idempotent across a further turn');
const t1b = await svc.continueSession(convId, { text: 'lanjut' }, ADMIN);
check(t1b.response.status === RESPONSE_STATUS.REQUIRES_REVIEW, 'a further turn on a drafted conversation still resolves to requires_review');
check(t1b.draftId === draftId && t1b.draftError == null, 'the SAME draft is reused (no duplicate, no error)');
const g3 = await svc.getDraft(draftId, ADMIN);
check(g3.draft.version === 2 && g3.draft.humanEdited === true, 'the further turn did NOT clobber the human-edited draft');

section('ownership + authz');
const mGet = await svc.getDraft(draftId, { userId: 'mallory', role: 'admin' });
check(mGet.ok === false && mGet.error.code === DRAFT_STORE_ERRORS.FORBIDDEN, 'another admin CANNOT read this draft (owner-scoped)');
const mUpd = await svc.updateDraft(draftId, { body: 'tamper' }, { userId: 'mallory', role: 'admin' });
check(mUpd.ok === false && mUpd.error.code === DRAFT_STORE_ERRORS.FORBIDDEN, 'another admin CANNOT edit this draft');
const bGet = await svc.getDraft(draftId, { userId: 'bob', role: 'driver' });
check(bGet.ok === false && bGet.error.code === 'FORBIDDEN', 'a non-admin caller is refused at the authz gate');
const stillClean = await svc.getDraft(draftId, ADMIN);
check(stillClean.draft.body === 'Isi surat yang telah disunting oleh reviewer.', 'the stored draft was not mutated by the cross-owner / non-admin attempts');

section('a persistence FAILURE is recoverable (requires_review still returns)');
useMemoryBackends();
const failingStore = {
  create: async () => ({ ok: false, data: null, error: { code: DRAFT_STORE_ERRORS.INVALID_RECORD, message: 'simulated write failure' } }),
  get: async () => ({ ok: false, data: null, error: { code: DRAFT_STORE_ERRORS.NOT_FOUND, message: 'none' } }),
  update: async () => ({ ok: false, data: null, error: { code: DRAFT_STORE_ERRORS.INVALID_RECORD, message: 'simulated' } }),
};
svc = newSvc({ draftStore: failingStore });
const f1 = await svc.handle(norReq('p4-fail', 'Buatkan NOR pembelian kursi.', { ...FULL, item: 'kursi rapat' }));
check(f1.response.status === RESPONSE_STATUS.REQUIRES_REVIEW, 'draft persistence failed → the conversation is still safe at requires_review');
check(f1.draftId == null, 'no draftId is claimed when the write failed');
check(f1.draftError && f1.draftError.code === DRAFT_STORE_ERRORS.INVALID_RECORD, 'draftError surfaces the failure for a recoverable retry');

section('an unconfigured (null) draft backend is silent');
useMemoryBackends();
resetNorDraftStore(); // back to the inert null backend
check(getActiveNorDraftBackendId() === 'null', 'the null backend is active');
svc = newSvc();
const n1 = await svc.handle(norReq('p4-null', 'Buatkan NOR pembelian meja.', { ...FULL, item: 'meja rapat' }));
check(n1.response.status === RESPONSE_STATUS.REQUIRES_REVIEW && n1.draftId == null && n1.draftError == null, 'no backend → requires_review with neither a draftId nor a (noisy) draftError');

console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'} — ${fail} failing check(s).`);
process.exit(fail === 0 ? 0 : 1);
