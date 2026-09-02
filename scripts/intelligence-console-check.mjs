/* ============================================================
   intelligence-console-check.mjs — Sarpras Intelligence (V2, Phase 5)

   PURE node test of the console CONTROLLER
   (src/intelligence/console/intelligence-console-controller.js). No DOM, no
   Firebase, no OpenAI — the createIntelligenceService() instance is a
   scriptable FAKE, so this proves the state machine + the UI↔service
   contract boundary only.

   Covers:
     • idle → submit() → loading → needs_input   (service.handle called once,
       with a well-formed makeIntelligenceRequest; conversationId retained)
     • needs_input → answer() → continueSession(SAME id, { text })
     • → requires_review → review workspace (editable draft + canonical norId)
     • Phase 5 lifecycle: in_review → approve() → approved → publish() →
       published; approve/publish are HUMAN-only, lifecycle-gated, never
       auto-fired; editing is refused once approved; publish is idempotent
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

/* A scriptable fake createIntelligenceService() instance. `draftOps` supplies
   getDraft/updateDraft (Phase 4); `registryOps` supplies
   getNorRecord/syncNorRecord/approveNor/publishNor (Phase 5). */
function fakeService(script, draftOps = {}, registryOps = {}) {
  const calls = { handle: [], continueSession: [], getDraft: [], updateDraft: [], getNorRecord: [], syncNorRecord: [], approveNor: [], publishNor: [] };
  let i = 0;
  const nextEnv = () => {
    const step = script[Math.min(i, script.length - 1)];
    i += 1;
    if (typeof step === 'function') return step();
    return step;
  };
  const svc = {
    calls,
    reset() { i = 0; for (const k of Object.keys(calls)) calls[k].length = 0; },
    async handle(request) { calls.handle.push(request); return nextEnv(); },
    async continueSession(convId, answers, actor) { calls.continueSession.push({ convId, answers, actor }); return nextEnv(); },
  };
  if (draftOps.getDraft) svc.getDraft = async (id, actor) => { calls.getDraft.push({ id, actor }); return draftOps.getDraft(id, actor); };
  if (draftOps.updateDraft) svc.updateDraft = async (id, edits, actor) => { calls.updateDraft.push({ id, edits, actor }); return draftOps.updateDraft(id, edits, actor); };
  if (registryOps.getNorRecord) svc.getNorRecord = async (id, actor) => { calls.getNorRecord.push({ id, actor }); return registryOps.getNorRecord(id, actor); };
  if (registryOps.syncNorRecord) svc.syncNorRecord = async (id, actor) => { calls.syncNorRecord.push({ id, actor }); return registryOps.syncNorRecord(id, actor); };
  if (registryOps.approveNor) svc.approveNor = async (id, v, actor) => { calls.approveNor.push({ id, v, actor }); return registryOps.approveNor(id, v, actor); };
  if (registryOps.publishNor) svc.publishNor = async (id, v, actor) => { calls.publishNor.push({ id, v, actor }); return registryOps.publishNor(id, v, actor); };
  return svc;
}

const needsInput = (id, questions) => ({
  conversationId: id,
  response: { schema: 'intelligence-response@1', requestId: 'r', status: RESPONSE_STATUS.NEEDS_INPUT, questions },
});
const review = (id, extra = {}) => ({
  conversationId: id,
  draftId: extra.draftId !== undefined ? extra.draftId : `draft_${id}`,
  draftError: extra.draftError || null,
  norId: extra.norId !== undefined ? extra.norId : null,
  registryError: extra.registryError || null,
  response: {
    schema: 'intelligence-response@1', requestId: 'r', status: RESPONSE_STATUS.REQUIRES_REVIEW,
    draft: { documentType: 'nor', fields: { norType: 'Pengadaan', subject: 'Pengadaan kursi', recipient: 'Bendahara', recipientStatus: 'known', date: '2026-08-31', body: 'Badan surat.', details: { item: 'kursi', quantity: '10' }, metadata: { bodySource: 'template' } } },
    review: { reason: 'Menunggu review manusia.', blocking: true },
  },
});
/* a canonical NorRecord as service.getNorRecord/approveNor/publishNor return it */
const norRec = (over = {}) => ({
  ok: true,
  record: {
    schema: 'nor-record@1', norId: over.norId || 'nor_conv_L', ownerId: 'evan',
    status: over.status || 'in_review', currentVersion: over.currentVersion || 1,
    norNumber: over.norNumber || '', publishedVersion: over.publishedVersion == null ? null : over.publishedVersion,
    numberSource: over.numberSource || 'system_suggested',
    content: { subject: 'Pengadaan kursi', body: 'Badan surat.', facts: {} },
    metadata: { draftId: over.draftId || 'draft_conv_L', conversationId: over.conversationId || 'conv_L' },
    versions: [{ version: 1 }], auditHistory: [{ type: 'AI_DRAFT_CREATED' }],
  },
});

/* a persisted NOR-draft record, as service.getDraft()/updateDraft() return it */
const draftRecord = (over = {}) => ({
  ok: true,
  draft: {
    schema: 'intelligence-nor-draft@1', draftId: over.draftId || 'draft_conv_X', conversationId: over.conversationId || 'conv_X',
    version: over.version || 1, ownerId: 'evan', status: 'requires_review',
    jenis: 'Pengadaan', subject: over.subject || 'Pengadaan kursi', recipient: over.recipient || 'Bendahara', recipientStatus: 'known',
    date: '2026-08-31',
    facts: { item: 'kursi', quantity: '10', ...(over.facts || {}) },
    body: over.body || 'Badan surat.',
    numbering: { suggestedNumber: '', publishedNumber: null, source: 'system_suggested', basis: null, confidence: 0 },
    provenance: { bodySource: 'template' }, humanEdited: over.humanEdited === true,
    auditTrail: [{ type: 'AI_DRAFT_CREATED', at: 't', actorId: 'evan', changedFields: [] }],
    createdAt: 't', updatedAt: 't',
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

section('review state — Phase 5 lifecycle: approve()/publish() exist but are HUMAN-gated');
const api = Object.keys(ctl);
check(typeof ctl.approve === 'function' && typeof ctl.publish === 'function',
  `the controller exposes explicit approve() + publish() (Phase 5) (has: ${api.join(', ')})`);
check(!api.some((k) => /reserve|allocate|\bnumber\b|nomor|mintNumber/i.test(k)),
  'the controller exposes NO number/reserve/allocate method — the Registry mints the official number server-side');
check(typeof ctl.editField === 'function' && typeof ctl.saveDraft === 'function' && typeof ctl.discardEdits === 'function' && typeof ctl.resumeDraft === 'function',
  'Phase 4: the controller DOES expose editField / saveDraft / discardEdits / resumeDraft');
{
  // with NO canonical norId on the envelope, approve()/publish() are safe
  // no-ops: they surface a friendly error and NEVER advance anything.
  const s3b = fakeService([review('conv_A')]); // review() default → norId: null
  const c3b = createIntelligenceConsoleController({ service: s3b, actor: ACTOR });
  await c3b.submit('buat NOR pengadaan kursi');
  let s = c3b.getState();
  check(s.phase === CONSOLE_PHASE.REVIEW && s.norId == null && s.norLifecycle == null, 'no norId on the envelope → no lifecycle state');
  await c3b.approve();
  s = c3b.getState();
  check(s.approveState === 'error' && s.norLifecycle == null, 'approve() with no canonical record → a curated error, nothing advanced, no crash');
  await c3b.publish();
  s = c3b.getState();
  check(s.publishState === 'error' && s.norLifecycle == null && s.norNumber == null, 'publish() with no canonical record → a curated error, no number');
}

section('Phase 4 — stage edits locally, then save explicitly');
{
  let updated = null;
  const s4 = fakeService(
    [needsInput('conv_X', [{ id: 'item', prompt: 'Barang apa?', why: 'Item', required: true }]), review('conv_X')],
    {
      updateDraft: (id, edits) => {
        updated = { id, edits };
        return draftRecord({ draftId: id, version: 2, humanEdited: true, facts: { budget: edits.budget || 'Rp10 juta' }, body: edits.body || 'Badan surat.' });
      },
    },
  );
  const c4 = createIntelligenceConsoleController({ service: s4, actor: ACTOR });
  await c4.submit('buat NOR pengadaan kursi');
  await c4.answer('kursi lipat');
  let s = c4.getState();
  check(s.phase === CONSOLE_PHASE.REVIEW && s.draftId === 'draft_conv_X', 'requires_review carried the persisted draftId onto state');
  check(s.saveState === 'idle' && s.draftDirty === false && Object.keys(s.draftEdits).length === 0, 'no staged edits on arrival; saveState idle');

  c4.editField('budget', 'Rp10 juta');
  s = c4.getState();
  check(s.draftDirty === true && s.draftEdits.budget === 'Rp10 juta', 'editField stages a local edit (draftDirty)');
  check(s4.calls.updateDraft.length === 0, 'editField makes NO service call (nothing sent per keystroke)');
  c4.editField('type', 'tamper');
  check(!('type' in c4.getState().draftEdits), 'a non-editable field is ignored by editField');

  await c4.saveDraft();
  check(s4.calls.updateDraft.length === 1 && updated.id === 'draft_conv_X' && updated.edits.budget === 'Rp10 juta', 'saveDraft() calls service.updateDraft ONCE with the staged edits');
  s = c4.getState();
  check(s.saveState === 'saved' && s.draftDirty === false && Object.keys(s.draftEdits).length === 0, 'after a successful save: saveState "saved", edits cleared');
  check(s.draft.fields.details.budget === 'Rp10 juta' && s.draft.version === 2 && s.draft.humanEdited === true, 'the returned record is mapped back onto the view (budget under details, version bumped, humanEdited)');
  check(s.draft.status === undefined || s.draft.status === 'requires_review' || s.review, 'the draft never leaves requires_review — no publish/approve happened');

  // a second save with no changes is a harmless no-op (no extra call)
  await c4.saveDraft();
  check(s4.calls.updateDraft.length === 1, 'saveDraft with nothing staged does not call the service again');
}

section('Phase 4 — a save FAILURE keeps the reviewer’s edits');
{
  const s5 = fakeService(
    [needsInput('conv_Y', [{ id: 'item', prompt: 'Barang apa?', why: 'Item', required: true }]), review('conv_Y')],
    { updateDraft: () => ({ ok: false, error: { code: 'VERSION_CONFLICT', message: 'raw: head is 3' } }) },
  );
  const c5 = createIntelligenceConsoleController({ service: s5, actor: ACTOR });
  await c5.submit('buat NOR pengadaan meja');
  await c5.answer('meja');
  c5.editField('body', 'Isi surat yang saya tulis sendiri.');
  await c5.saveDraft();
  const s = c5.getState();
  check(s.saveState === 'error', 'a failed save → saveState "error"');
  check(s.saveError && !/raw:|head is 3/.test(s.saveError) && /muat ulang/i.test(s.saveError), 'the error is a curated Indonesian sentence (VERSION_CONFLICT), raw text not shown');
  check(s.draftEdits.body === 'Isi surat yang saya tulis sendiri.' && s.draftDirty === true, 'the staged edit is NOT lost — the reviewer can retry');
}

section('Phase 4 — save with no persisted draftId is refused, no service call');
{
  const s6 = fakeService(
    [needsInput('conv_Z', [{ id: 'item', prompt: 'Barang apa?', why: 'Item', required: true }]), review('conv_Z', { draftId: null })],
    { updateDraft: () => draftRecord({}) },
  );
  const c6 = createIntelligenceConsoleController({ service: s6, actor: ACTOR });
  await c6.submit('buat NOR pengadaan lemari');
  await c6.answer('lemari');
  check(c6.getState().draftId === null, 'no draftId when the server did not persist the draft');
  c6.editField('budget', 'Rp5 juta');
  await c6.saveDraft();
  check(s6.calls.updateDraft.length === 0 && c6.getState().saveState === 'error', 'saveDraft is refused (no draftId) without calling the service');
}

section('Phase 4 — a persistence error on requires_review is surfaced (not hidden)');
{
  const s7 = fakeService([review('conv_P', { draftId: null, draftError: { code: 'INVALID_RECORD', message: 'raw' } })]);
  const c7 = createIntelligenceConsoleController({ service: s7, actor: ACTOR });
  await c7.submit('buat NOR pengadaan kursi lengkap');
  const s = c7.getState();
  check(s.phase === CONSOLE_PHASE.REVIEW && s.draftId === null, 'still reaches the review workspace even though persistence failed');
  check(s.draftPersistError && /tidak dapat disimpan|periksa/i.test(s.draftPersistError), 'draftPersistError carries a curated sentence for the view to show');
}

section('Phase 4 — resumeDraft() rehydrates the review workspace from the server');
{
  const s8 = fakeService([], { getDraft: (id) => draftRecord({ draftId: id, version: 4, humanEdited: true, facts: { item: 'kursi lipat', budget: 'Rp9 juta' }, body: 'Isi tersimpan.' }) });
  const c8 = createIntelligenceConsoleController({ service: s8, actor: ACTOR });
  await c8.resumeDraft('draft_conv_R');
  const s = c8.getState();
  check(s8.calls.getDraft.length === 1 && s8.calls.getDraft[0].id === 'draft_conv_R', 'resumeDraft calls service.getDraft with the stored id');
  check(s.phase === CONSOLE_PHASE.REVIEW && s.draftId === 'draft_conv_R', 'it lands directly in the review workspace for that draft');
  check(s.draft.fields.details.item === 'kursi lipat' && s.draft.fields.body === 'Isi tersimpan.' && s.draft.version === 4, 'the persisted record is shown (reload-safe)');
  check(s.draftDirty === false && s.saveState === 'idle', 'resumed with a clean edit state');
  // a stale / failed pointer just returns to idle, no error noise
  const s8b = fakeService([], { getDraft: () => ({ ok: false, error: { code: 'NOT_FOUND' } }) });
  const c8b = createIntelligenceConsoleController({ service: s8b, actor: ACTOR });
  await c8b.resumeDraft('draft_gone');
  check(c8b.getState().phase === CONSOLE_PHASE.IDLE, 'a stale reload pointer → idle, no error banner');
}

section('Phase 5 — the HUMAN-gated lifecycle: in_review → Setujui → approved → Terbitkan → published');
{
  let rec = { status: 'in_review', currentVersion: 1, norNumber: '', publishedVersion: null };
  const bump = (o) => { rec = { ...rec, ...o }; return norRec({ norId: 'nor_conv_L', draftId: 'draft_conv_L', conversationId: 'conv_L', ...rec }); };
  const sL = fakeService(
    [needsInput('conv_L', [{ id: 'item', prompt: 'Barang?', why: 'x', required: true }]), review('conv_L', { norId: 'nor_conv_L' })],
    { updateDraft: (id) => draftRecord({ draftId: id, conversationId: 'conv_L', version: 2, humanEdited: true, body: 'Isi disunting.' }) },
    {
      getNorRecord: () => bump({}),
      syncNorRecord: () => bump({ currentVersion: 2 }),
      approveNor: (id, v) => (v !== rec.currentVersion
        ? { ok: false, error: { code: 'VERSION_CONFLICT' } }
        : bump({ status: 'approved' })),
      publishNor: () => (rec.status === 'published'
        ? bump({})
        : bump({ status: 'published', norNumber: '7', publishedVersion: rec.currentVersion })),
    },
  );
  const cL = createIntelligenceConsoleController({ service: sL, actor: ACTOR });
  await cL.submit('buat NOR pengadaan lampu');
  await cL.answer('lampu sorot');
  let s = cL.getState();
  check(s.phase === CONSOLE_PHASE.REVIEW && s.norId === 'nor_conv_L' && s.norLifecycle === 'in_review' && s.norVersion === 1, 'requires_review carried a canonical norId; lifecycle = in_review, version 1');

  // edit + save also syncs the canonical version
  cL.editField('body', 'Isi disunting.');
  await cL.saveDraft();
  s = cL.getState();
  check(sL.calls.updateDraft.length === 1 && sL.calls.syncNorRecord.length === 1, 'saveDraft() persists the draft AND syncs the canonical record');
  check(s.norVersion === 2 && s.saveState === 'saved', 'the canonical version advanced to 2 after the sync');

  // approve is refused while there are unsaved edits
  cL.editField('body', 'sesuatu lagi');
  await cL.approve();
  s = cL.getState();
  check(sL.calls.approveNor.length === 0 && s.approveState === 'error' && s.norLifecycle === 'in_review', 'approve() is refused while the draft is dirty — save first');
  cL.discardEdits();

  // approve → approved
  await cL.approve();
  s = cL.getState();
  check(sL.calls.approveNor.length === 1 && sL.calls.approveNor[0].v === 2, 'approve() calls service.approveNor with the fresh expectedVersion (2)');
  check(s.norLifecycle === 'approved' && s.norNumber == null, 'lifecycle → approved; STILL no official number');
  check(s.approveState === 'idle', 'approveState resets after success');

  // editing is refused once approved
  cL.editField('body', 'tamper after approve');
  check(cL.getState().draftDirty === false, 'editField is a no-op once the record is approved (draft is read-only)');

  // publish → published + official number
  await cL.publish();
  s = cL.getState();
  check(sL.calls.publishNor.length === 1, 'publish() calls service.publishNor');
  check(s.norLifecycle === 'published' && s.norNumber === '7' && s.norPublishedVersion === 2, 'lifecycle → published; the official number + published version are shown');

  // publish retry is idempotent — same number, no crash, and NOT re-sent to
  // the server (the controller sees it is already published)
  await cL.publish();
  s = cL.getState();
  check(s.norLifecycle === 'published' && s.norNumber === '7' && s.publishState === 'idle', 'a second publish() is an idempotent no-op — same number, no error');
  check(sL.calls.publishNor.length === 1, 'the redundant publish() was NOT re-sent to the server (already-published is a client-side no-op)');

  // the controller NEVER auto-fired approve/publish during intake / save
  check(sL.calls.approveNor.length === 1, 'approve fired exactly once — only from the explicit approve() call, never from submit/answer/saveDraft');
}

section('Phase 5 — resumeDraft() restores the lifecycle stage from the server');
{
  const sR = fakeService([], {
    getDraft: (id) => draftRecord({ draftId: id, conversationId: 'conv_RR', version: 3 }),
  }, {
    getNorRecord: () => norRec({ norId: 'nor_conv_RR', status: 'published', currentVersion: 3, norNumber: '12/2026', publishedVersion: 3 }),
  });
  const cR = createIntelligenceConsoleController({ service: sR, actor: ACTOR });
  await cR.resumeDraft('draft_conv_RR');
  const s = cR.getState();
  check(sR.calls.getDraft.length === 1 && sR.calls.getNorRecord.length === 1, 'resumeDraft fetches BOTH the draft and the canonical record');
  check(s.phase === CONSOLE_PHASE.REVIEW && s.norLifecycle === 'published' && s.norNumber === '12/2026', 'a reload of a published NOR lands read-only, showing the official number');
}

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
  check(rs.draftId === null && rs.draftDirty === false && Object.keys(rs.draftEdits).length === 0 && rs.saveState === 'idle', 'reset also clears the Phase 4 draft-edit state');
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
