/* ============================================================
   intelligence-nor-registry-service-check.mjs — Sarpras Intelligence (V2, Phase 5)

   PURE node integration test for the Intelligence Service ⇄ canonical NOR
   Registry seam. No browser, no Firebase, no network — conversation,
   NOR-draft, and NOR-Registry stores all use their in-memory backends.
   Proves the Phase 5 lifecycle a human must be able to walk:

     intake → requires_review → a Phase 4 draft AND a canonical NorRecord
            (status in_review, NO official number)
       → getNorRecord            (the same record comes back)
       → updateDraft (Phase 4) + syncNorRecord → registry v2, immutable v1
       → approveNor              (human, in_review → approved, still NO number)
       → publishNor              (human, approved → published, ONE official number)
       → publishNor again        (idempotent — the SAME number, no 2nd allocation)
       → syncNorRecord / approveNor after publish → REJECTED (immutable)

     • the service NEVER auto-approves or auto-publishes
     • cross-owner getNorRecord / approveNor / publishNor → FORBIDDEN
     • a non-admin caller → FORBIDDEN (same gate as every entry point)
     • a registration FAILURE is recoverable: requires_review still returns,
       with registryError set and no norId
     • an unconfigured (null) registry backend is silent: requires_review
       with neither a norId nor a registryError
     • Phase 4 remains intact: the draft is still created + editable, and
       service.updateDraft still returns { ok, draft } unchanged

   Run:  node scripts/intelligence-nor-registry-service-check.mjs   (exit 0 = pass)
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
  registerNorDraftBackend, setActiveNorDraftBackend, resetNorDraftStore,
} from '../src/intelligence/nor-draft/nor-draft-store.js';
import {
  memoryNorDraftBackend, resetMemoryNorDraftBackend,
} from '../src/intelligence/nor-draft/backends/memory-nor-draft-backend.js';
import {
  registerBackend as registerRegistryBackend, setActiveBackend as setActiveRegistryBackend,
  resetNorRegistry, getActiveBackendId as getActiveRegistryBackendId,
} from '../src/intelligence/nor-registry/nor-registry.js';
import {
  memoryNorRegistryBackend, resetMemoryNorRegistryBackend,
} from '../src/intelligence/nor-registry/backends/memory-nor-registry-backend.js';
import { NOR_REGISTRY_ERRORS } from '../src/intelligence/nor-registry/contracts/registry-contract.js';
import * as cfg from '../src/intelligence/config/intelligence-config.js';
import { resetConversationRepository } from '../src/conversation/repository/conversation-repository.js';

let fail = 0;
const check = (cond, msg) => { console.log(`${cond ? '✓' : '✗'} ${msg}`); if (!cond) fail++; };
const section = (t) => console.log(`\n── ${t} ──`);

let _n = 0;
const idgen = () => `conv_${++_n}`;
const ADMIN = { userId: 'evan', role: 'admin', sourceModule: 'intelligence' };
const authz = { canUseIntelligence: (a) => !!a && a.role === 'admin', canAccessKnowledge: () => true };

const spyProvider = {
  async complete() {
    return { schema: 'model-completion@1', ok: true, text: 'Dengan hormat, bersama ini diajukan pengadaan mesin potong rumput.', usage: { inputTokens: 8, outputTokens: 18 }, model: 'fake-model', durationMs: 2, error: null };
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
  resetNorRegistry();
  registerRegistryBackend(memoryNorRegistryBackend);
  setActiveRegistryBackend('memory');
  resetMemoryNorRegistryBackend();
  resetConversationRepository();
  cfg.resetIntelligenceConfig();
  cfg.setIntelligenceConfig({ enabled: true });
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

const FULL = { item: 'mesin potong rumput', quantity: '2', unit: 'unit', purpose: 'perawatan lapangan PBSI', budget: 'Rp8.000.000', recipient: 'Bendahara' };
const norReq = (requestId, text, fields = {}) => makeIntelligenceRequest({
  requestId, actor: ADMIN, task: REQUEST_TASK.NOR_GENERATE, domainType: 'nor', input: { text, fields },
});

/* ════════════════════════════════════════════════════════════════════════ */

section('requires_review → a canonical NorRecord is registered (in_review, NO number)');
useMemoryBackends();
let svc = newSvc();
const t1 = await svc.handle(norReq('p5-t1', 'Buatkan NOR pembelian mesin potong rumput.', FULL));
check(t1.response.status === RESPONSE_STATUS.REQUIRES_REVIEW, 'turn 1 with every fact → requires_review');
const convId = t1.conversationId;
check(typeof t1.draftId === 'string' && t1.draftId === `draft_${convId}`, 'a Phase 4 draftId is still returned');
check(typeof t1.norId === 'string' && t1.norId === `nor_${convId}`, `a canonical norId is returned, keyed to the conversation (${t1.norId})`);
check(t1.registryError == null, 'no registryError on the happy path');
const norId = t1.norId;

section('getNorRecord — the canonical record is in_review, content-snapshotted, review-gated');
const g1 = await svc.getNorRecord(norId, ADMIN);
check(g1.ok === true, 'getNorRecord(owner) → ok');
const r = g1.record;
check(r.schema === 'nor-record@1' && r.status === 'in_review', 'schema + status are the Phase 5 contract (in_review)');
check(r.norNumber === '' && r.numberSource === 'system_suggested' && r.publishedVersion === null, 'NO official number, NO publishedVersion at in_review');
check(r.currentVersion === 1 && Array.isArray(r.versions) && r.versions.length === 1, 'version 1, one versions[] entry');
check(r.content.facts.item === 'mesin potong rumput' && r.content.body.length > 0, 'the content snapshot carries the structured facts + generated body');
check(r.content.recipient === 'Bendahara', 'recipient is snapshotted');
check(r.auditHistory.length === 1 && r.auditHistory[0].type === 'AI_DRAFT_CREATED' && r.auditHistory[0].actorId === 'evan', 'auditHistory opens with AI_DRAFT_CREATED by the actor');
check(r.metadata.draftId === `draft_${convId}` && r.metadata.conversationId === convId, 'the record is linked to the Phase 4 draft + conversation');

section('the service NEVER auto-approves or auto-publishes');
check(r.status === 'in_review', 'straight after handle() the canonical record is in_review — a human decision is mandatory');
check(Object.is(r.publishedVersion, null), 'a fresh registered record has publishedVersion === null (strict, not 0)');
check(typeof svc.publishNor === 'function' && svc.publishNor.length === 3, 'service.publishNor(norId, expectedVersion, actor) takes NO official-number argument — the browser cannot supply one');

section('edit (Phase 4) + syncNorRecord → a NEW immutable registry version');
const u1 = await svc.updateDraft(t1.draftId, { body: 'Isi surat yang telah disunting reviewer.', budget: 'Rp10.000.000' }, ADMIN);
check(u1.ok === true && u1.draft.version === 2, 'Phase 4 updateDraft still returns { ok, draft } and bumps the draft version (Phase 4 intact)');
const s1 = await svc.syncNorRecord(norId, ADMIN);
check(s1.ok === true && s1.record.currentVersion === 2 && s1.record.versions.length === 2, 'syncNorRecord → registry v2, a new versions[] entry');
check(s1.record.versions[0].content.body !== s1.record.versions[1].content.body, 'the v1 snapshot is UNCHANGED — history is append-only');
check(s1.record.content.body === 'Isi surat yang telah disunting reviewer.' && s1.record.content.facts.budget === 'Rp10.000.000', 'the head snapshot is the latest edit');
const sEv = s1.record.auditHistory[s1.record.auditHistory.length - 1];
check(sEv.type === 'AI_DRAFT_EDITED' && sEv.version === 2, 'an AI_DRAFT_EDITED audit entry is appended');
const s2 = await svc.syncNorRecord(norId, ADMIN);
check(s2.ok === true && s2.record.currentVersion === 2, 'a second sync with no further draft edit does NOT bump the version');

section('approveNor — HUMAN-gated: in_review → approved, still NO number');
const apStale = await svc.approveNor(norId, 1, ADMIN);
check(apStale.ok === false && apStale.error.code === NOR_REGISTRY_ERRORS.VERSION_CONFLICT, 'approve with a stale expectedVersion → VERSION_CONFLICT');
const ap = await svc.approveNor(norId, 2, ADMIN);
check(ap.ok === true && ap.record.status === 'approved', 'approveNor(expectedVersion=2) → approved');
check(ap.record.norNumber === '' && Object.is(ap.record.publishedVersion, null), 'approve reserves NO number and publishedVersion is a GENUINE null (not 0) — PART E');
check(ap.record.auditHistory[ap.record.auditHistory.length - 1].type === 'AI_DRAFT_APPROVED', 'an AI_DRAFT_APPROVED audit entry is appended');
const editAfterApprove = await svc.syncNorRecord(norId, ADMIN);
check(editAfterApprove.ok === false && editAfterApprove.error.code === NOR_REGISTRY_ERRORS.ILLEGAL_TRANSITION, 'syncNorRecord after approve → ILLEGAL_TRANSITION (only in_review is editable)');

section('publishNor — HUMAN-gated: approved → published, ONE SERVER-authoritative official number');
// pass an extra 4th arg to prove the service ignores any would-be number input
const pub = await svc.publishNor(norId, 2, ADMIN, '999999');
check(pub.ok === true && pub.record.status === 'published', 'publishNor(expectedVersion=2) → published');
check(typeof pub.record.norNumber === 'string' && pub.record.norNumber.length > 0 && pub.record.numberSource === 'reserved', 'an official number is set, numberSource=reserved (PART F/G)');
check(pub.record.norNumber === String(pub.record.metadata.numberAllocation.sequence), 'norNumber IS the server-reserved allocator sequence — the extra "999999" argument was ignored');
check(pub.record.norNumber !== '999999', 'no caller-supplied string can become the official NOR number (server-authoritative)');
check(pub.record.publishedVersion === 2, 'publishedVersion is the version that was published');
check(pub.record.metadata.numberAllocation && typeof pub.record.metadata.numberAllocation.sequence === 'number', 'the atomic allocation is recorded (audit source)');
const pubEvs = pub.record.auditHistory.map((e) => e.type);
check(pubEvs.includes('NOR_NUMBER_RESERVED') && pubEvs.includes('NOR_PUBLISHED'), 'audit: NOR_NUMBER_RESERVED + NOR_PUBLISHED appended');
const firstNumber = pub.record.norNumber;

section('publishNor retry — idempotent (SAME number, no 2nd allocation)');
const retry = await svc.publishNor(norId, 2, ADMIN);
check(retry.ok === true && retry.record.norNumber === firstNumber, 'a second publishNor → the SAME record, the SAME official number');
check(retry.record.auditHistory.filter((e) => e.type === 'NOR_PUBLISHED').length === 1, 'no duplicate NOR_PUBLISHED audit entry on retry');

section('published is immutable');
const editAfterPublish = await svc.syncNorRecord(norId, ADMIN);
check(editAfterPublish.ok === false && editAfterPublish.error.code === NOR_REGISTRY_ERRORS.ALREADY_PUBLISHED, 'syncNorRecord after publish → ALREADY_PUBLISHED');
const approveAfterPublish = await svc.approveNor(norId, 2, ADMIN);
check(approveAfterPublish.ok === false && approveAfterPublish.error.code === NOR_REGISTRY_ERRORS.ALREADY_PUBLISHED, 'approveNor after publish → ALREADY_PUBLISHED');

section('ownership + authz');
const mGet = await svc.getNorRecord(norId, { userId: 'mallory', role: 'admin' });
check(mGet.ok === false && mGet.error.code === NOR_REGISTRY_ERRORS.FORBIDDEN, 'another admin CANNOT read this record (owner-scoped)');
const bAny = await svc.approveNor(norId, 2, { userId: 'bob', role: 'driver' });
check(bAny.ok === false && bAny.error.code === 'FORBIDDEN', 'a non-admin caller is refused at the authz gate (before any store call)');

section('a registration FAILURE is recoverable (requires_review still returns)');
useMemoryBackends();
const failingRegistry = {
  register: async () => ({ ok: false, data: null, error: { code: NOR_REGISTRY_ERRORS.INVALID_RECORD, message: 'simulated' } }),
  get: async () => ({ ok: false, data: null, error: { code: NOR_REGISTRY_ERRORS.NOT_FOUND, message: 'none' } }),
  appendVersion: async () => ({ ok: false, data: null, error: { code: 'X', message: 'x' } }),
  approve: async () => ({ ok: false, data: null, error: { code: 'X', message: 'x' } }),
  publish: async () => ({ ok: false, data: null, error: { code: 'X', message: 'x' } }),
  getHistory: async () => ({ ok: false, data: null, error: { code: 'X', message: 'x' } }),
};
svc = newSvc({ registryStore: failingRegistry });
const f1 = await svc.handle(norReq('p5-fail', 'Buatkan NOR pembelian kursi.', { ...FULL, item: 'kursi rapat' }));
check(f1.response.status === RESPONSE_STATUS.REQUIRES_REVIEW, 'registration failed → the conversation is still safe at requires_review');
check(f1.draftId != null, 'the Phase 4 draft still persisted (independent of the registry)');
check(f1.norId == null && f1.registryError && f1.registryError.code === NOR_REGISTRY_ERRORS.INVALID_RECORD, 'no norId is claimed; registryError surfaces the failure for a recoverable retry');

section('an unconfigured (null) registry backend is silent');
useMemoryBackends();
resetNorRegistry(); // back to the inert null backend
check(getActiveRegistryBackendId() === 'null', 'the null registry backend is active');
svc = newSvc();
const n1 = await svc.handle(norReq('p5-null', 'Buatkan NOR pembelian meja.', { ...FULL, item: 'meja rapat' }));
check(n1.response.status === RESPONSE_STATUS.REQUIRES_REVIEW && n1.norId == null && n1.registryError == null, 'no registry backend → requires_review with neither a norId nor a (noisy) registryError');

console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'} — ${fail} failing check(s).`);
process.exit(fail === 0 ? 0 : 1);
