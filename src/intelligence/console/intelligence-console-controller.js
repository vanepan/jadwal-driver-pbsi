/* ============================================================
   INTELLIGENCE-CONSOLE-CONTROLLER.JS — Sarpras Intelligence (V2, Phase 5)

   PURPOSE: the PURE state machine behind the user-facing Sarpras
   Intelligence surface. Phase 3B proved the intake flow; Phase 4 added a
   persistent, human-editable NOR draft; Phase 5 adds the canonical NOR
   Registry lifecycle on top:

     idle → submit(text) → loading → needs_input
          → answer(text) → loading → needs_input | review
                            (requires_review + persisted draftId + canonical norId, in_review)
          in review:  editField(f, v)  → stage a local edit (no network)
                      saveDraft()      → persist the edits + sync the canonical version
                      discardEdits()   → drop the staged edits
                      approve()        → HUMAN: in_review → approved (draft locks)
          approved:   publish()        → HUMAN: approved → published (Registry reserves the number)
          published:  read-only — the official number is shown
          on reload:  resumeDraft(id)  → re-fetch draft + canonical record → the right stage
     any step → error (recoverable — the input / the staged edits are kept)

   It is a thin adapter over the EXISTING createIntelligenceService():
     • first turn   → service.handle(makeIntelligenceRequest(...))
     • later turns  → service.continueSession(conversationId, answers, actor)
     • draft edits  → service.updateDraft(draftId, edits, actor)
     • canonical    → service.getNorRecord / syncNorRecord / approveNor / publishNor
     • reload       → service.getDraft(draftId, actor)
   It never talks to Firebase, OpenAI, RTDB, the DOM, or storage. The host
   view (js/intelligence-console.js) owns rendering + the reload pointer;
   the wiring bridge (js/intelligence-backend-wiring.js) builds the service.

   RESPONSIBILITY: createIntelligenceConsoleController({ service, actor,
   onChange?, requestIdFactory? }) → { getState, submit, answer, editField,
   saveDraft, discardEdits, approve, publish, resumeDraft, reset, destroy }.

   BOUNDARY: approve() / publish() are the ONLY lifecycle-advancing calls and
   they run ONLY from an explicit user gesture — the controller never invokes
   them itself, never auto-approves, never auto-publishes, never mints a
   number (the Registry does, server-side, at publish). Editing is refused
   once the record leaves `in_review`.

   DEPENDENCIES: the Phase 0 contracts + the NOR-draft record contract + the
   pure `norIdFromConversation` helper. Pure.
   ============================================================ */

'use strict';

import { makeIntelligenceRequest, REQUEST_TASK } from '../contracts/intelligence-request-contract.js';
import { RESPONSE_STATUS } from '../contracts/intelligence-response-contract.js';
import { DRAFT_EDITABLE_FIELDS } from '../nor-draft/contracts/nor-draft-record-contract.js';
import { norIdFromConversation } from '../nor-registry/nor-registry-record.js';

const EDITABLE = new Set(DRAFT_EDITABLE_FIELDS);

/** The canonical NOR lifecycle the review workspace surfaces (PART H).
 *  `in_review` → Edit / Save / Approve.  `approved` → Publish (no editing).
 *  `published` → the official number, read-only. */
export const NOR_LIFECYCLE = Object.freeze({
  IN_REVIEW: 'in_review',
  APPROVED: 'approved',
  PUBLISHED: 'published',
});

export const CONSOLE_PHASE = Object.freeze({
  IDLE: 'idle',
  LOADING: 'loading',
  NEEDS_INPUT: 'needs_input',
  REVIEW: 'review',
  ERROR: 'error',
});

/** Every code the service (or the callable backend beneath it) can surface,
 *  mapped to ONE concise Indonesian sentence. The raw `error.message` is
 *  never shown — a transport failure can carry a raw Firebase string, so
 *  display is always by CODE. */
const ERROR_TEXT = Object.freeze({
  FORBIDDEN: 'Anda tidak memiliki akses ke Sarpras Intelligence.',
  AUTH: 'Sesi Anda perlu diperbarui. Silakan masuk kembali.',
  INVALID_REQUEST: 'Permintaan tidak dapat diproses. Coba jelaskan kembali secara singkat dan spesifik.',
  UNKNOWN_INTENT: 'Permintaan ini belum dapat dipahami. Jelaskan lebih spesifik, mis. "buat NOR pengadaan kursi rapat".',
  NOT_FOUND: 'Sesi percakapan tidak ditemukan. Mulai permintaan baru.',
  LIMIT: 'Percakapan sudah terlalu panjang. Mulai permintaan baru.',
  DISABLED: 'Layanan Intelligence sedang tidak aktif.',
  NOT_IMPLEMENTED: 'Layanan Intelligence sedang tidak aktif.',
  NETWORK: 'Layanan Intelligence sedang tidak tersedia. Coba lagi sebentar lagi.',
  TIMEOUT: 'Layanan Intelligence sedang tidak tersedia. Coba lagi sebentar lagi.',
  PROVIDER_ERROR: 'Layanan Intelligence sedang tidak tersedia. Coba lagi sebentar lagi.',
  QUOTA: 'Layanan Intelligence sedang sibuk. Coba lagi nanti.',
  INVALID_OUTPUT: 'Layanan Intelligence memberi hasil yang tidak dapat dibaca. Coba lagi.',
  DATA_NOT_SENDABLE: 'Permintaan memuat data yang tidak dapat diproses secara otomatis.',
  // Phase 4 — NOR draft persistence
  VERSION_CONFLICT: 'Draf ini sudah berubah di tempat lain. Muat ulang untuk melihat versi terbaru sebelum menyunting.',
  INVALID_RECORD: 'Perubahan tidak dapat disimpan. Periksa kembali isian Anda.',
  NO_BACKEND: 'Penyimpanan draf sedang tidak tersedia. Coba lagi sebentar lagi.',
  NO_BACKEND_CONFIGURED: 'Penyimpanan draf sedang tidak tersedia. Coba lagi sebentar lagi.',
  INTERNAL: 'Perubahan tidak dapat disimpan saat ini. Coba lagi sebentar lagi.',
  UNKNOWN: 'Perubahan tidak dapat disimpan saat ini.',
  // Phase 5 — canonical NOR Registry lifecycle
  ILLEGAL_TRANSITION: 'Tindakan ini tidak sesuai dengan tahap NOR saat ini. Muat ulang untuk melihat status terbaru.',
  ALREADY_PUBLISHED: 'NOR ini sudah diterbitkan dan tidak dapat diubah lagi.',
  NUMBER_RESERVATION_FAILED: 'Nomor resmi gagal dipesan. Coba terbitkan lagi sebentar lagi.',
});
const ERROR_FALLBACK = 'Intelligence tidak dapat memproses permintaan saat ini.';

function errorText(code) {
  return (code && ERROR_TEXT[code]) || ERROR_FALLBACK;
}

let _seq = 0;
function defaultRequestId() {
  _seq += 1;
  return `sic3b_${Date.now().toString(36)}_${_seq}`;
}

/**
 * @param {Object} opts
 * @param {{ handle:Function, continueSession:Function }} opts.service   an EXISTING createIntelligenceService() instance
 * @param {{ userId:string|null, role:string|null }} opts.actor          the signed-in identity (server re-verifies — this is not authz)
 * @param {(state:object)=>void} [opts.onChange]                         called after every transition
 * @param {()=>string} [opts.requestIdFactory]
 */
export function createIntelligenceConsoleController({ service, actor, onChange, requestIdFactory } = {}) {
  if (!service || typeof service.handle !== 'function' || typeof service.continueSession !== 'function') {
    throw new Error('createIntelligenceConsoleController: a service with handle() + continueSession() is required.');
  }
  const nextRequestId = typeof requestIdFactory === 'function' ? requestIdFactory : defaultRequestId;
  let _onChange = typeof onChange === 'function' ? onChange : null;
  const notify = (snap) => { if (_onChange) { try { _onChange(snap); } catch { /* a view error must not break the controller */ } } };
  const who = { userId: (actor && actor.userId) || null, role: (actor && actor.role) || null };

  /** @type {{phase:string, busy:boolean, messages:Array, questions:Array, draft:object|null,
   *   review:object|null, conversationId:string|null, error:string|null, pendingInput:string,
   *   modelError:object|null, draftId:string|null, draftEdits:object, draftDirty:boolean,
   *   saveState:'idle'|'saving'|'saved'|'error', saveError:string|null, draftPersistError:string|null}} */
  const state = {
    phase: CONSOLE_PHASE.IDLE,
    busy: false,
    messages: [],
    questions: [],
    draft: null,
    review: null,
    conversationId: null,
    error: null,
    pendingInput: '',
    modelError: null,
    // Phase 4 — the persistent NOR draft
    draftId: null,
    draftEdits: {},        // staged, un-saved {field: value}
    draftDirty: false,
    saveState: 'idle',
    saveError: null,       // curated sentence when saveState === 'error'
    draftPersistError: null, // set if requires_review returned but the draft did NOT persist
    // Phase 5 — the canonical NOR Registry lifecycle
    norId: null,
    norLifecycle: null,   // 'in_review' | 'approved' | 'published' | null
    norVersion: null,     // the canonical record's currentVersion (expectedVersion for approve/publish)
    norNumber: null,      // the official number — only set once 'published'
    norPublishedVersion: null,
    registryPersistError: null, // set if requires_review returned but the canonical record did NOT register
    approveState: 'idle', // 'idle' | 'busy' | 'error'
    approveError: null,
    publishState: 'idle', // 'idle' | 'busy' | 'error'
    publishError: null,
    registrySyncError: null, // a soft warning: the draft saved but the canonical version-sync failed
  };

  const snapshot = () => ({
    phase: state.phase,
    busy: state.busy,
    messages: state.messages.map((m) => ({ ...m })),
    questions: state.questions.map((q) => ({ ...q })),
    draft: state.draft,
    review: state.review,
    conversationId: state.conversationId,
    error: state.error,
    pendingInput: state.pendingInput,
    modelError: state.modelError,
    draftId: state.draftId,
    draftEdits: { ...state.draftEdits },
    draftDirty: state.draftDirty,
    saveState: state.saveState,
    saveError: state.saveError,
    draftPersistError: state.draftPersistError,
    norId: state.norId,
    norLifecycle: state.norLifecycle,
    norVersion: state.norVersion,
    norNumber: state.norNumber,
    norPublishedVersion: state.norPublishedVersion,
    registryPersistError: state.registryPersistError,
    approveState: state.approveState,
    approveError: state.approveError,
    publishState: state.publishState,
    publishError: state.publishError,
    registrySyncError: state.registrySyncError,
  });

  /** Normalise BOTH draft shapes the view may receive — the assembler's
   *  `requires_review` draft and the persisted NOR-draft record — into the
   *  ONE `{ documentType, fields:{…}, draftId, version, humanEdited }` shape
   *  the view renders. Structured facts live under fields.details; the
   *  generated prose stays a separate fields.body. */
  function draftRecordToView(rec) {
    if (!rec || typeof rec !== 'object') return null;
    // already the assembler shape?
    if (rec.fields && typeof rec.fields === 'object' && 'body' in rec.fields) {
      return { ...rec, draftId: rec.draftId || state.draftId, version: rec.version || 1 };
    }
    const facts = rec.facts && typeof rec.facts === 'object' ? rec.facts : {};
    const details = {};
    for (const k of ['item', 'quantity', 'unit', 'purpose', 'budget']) {
      if (facts[k] !== undefined && facts[k] !== null && facts[k] !== '') details[k] = facts[k];
    }
    return {
      documentType: 'nor',
      draftId: rec.draftId || null,
      version: rec.version || 1,
      humanEdited: rec.humanEdited === true,
      fields: {
        norType: rec.jenis || null,
        subject: rec.subject || '',
        recipient: rec.recipient || null,
        recipientStatus: rec.recipientStatus || null,
        date: rec.date || null,
        body: rec.body || '',
        details,
        metadata: { bodySource: (rec.provenance && rec.provenance.bodySource) || null },
      },
    };
  }
  const emit = () => notify(snapshot());

  /** Late-bind the change listener (the DOM view wires itself after mount,
   *  whether the controller came from the bridge or was injected by a test). */
  function setOnChange(fn) { _onChange = typeof fn === 'function' ? fn : null; }

  function pushMessage(role, text) {
    state.messages.push({ role, text: String(text == null ? '' : text), at: Date.now() });
  }

  /** Turn a needs_input response's questions into ONE Intelligence message. */
  function questionsToText(questions) {
    if (questions.length === 1) return questions[0].prompt;
    return ['Saya membutuhkan beberapa informasi:', ...questions.map((q) => `• ${q.prompt}`)].join('\n');
  }

  /** Map a { response, conversationId, modelError } envelope onto the state. */
  function applyEnvelope(env) {
    const res = env && env.response ? env.response : null;
    if (env && typeof env.conversationId === 'string' && env.conversationId) {
      state.conversationId = env.conversationId;
    }
    if (!res || !res.status) {
      state.phase = CONSOLE_PHASE.ERROR;
      state.error = ERROR_FALLBACK;
      pushMessage('intelligence', ERROR_FALLBACK);
      return;
    }
    if (res.status === RESPONSE_STATUS.NEEDS_INPUT) {
      state.questions = (Array.isArray(res.questions) ? res.questions : []).map((q) => ({
        id: q.id, prompt: q.prompt, why: q.why || null, required: q.required !== false,
      }));
      state.phase = CONSOLE_PHASE.NEEDS_INPUT;
      state.error = null;
      const prefix = env && env.unmatchedAnswer ? 'Maaf, itu belum menjawab pertanyaan di bawah.\n' : '';
      pushMessage('intelligence', prefix + questionsToText(state.questions));
      return;
    }
    if (res.status === RESPONSE_STATUS.REQUIRES_REVIEW || res.status === RESPONSE_STATUS.DRAFT) {
      state.draft = draftRecordToView(res.draft);
      state.review = res.review || null;
      state.questions = [];
      state.modelError = env && env.modelError ? env.modelError : null;
      // Phase 4 — the server-owned draft record (get-or-created at requires_review)
      state.draftId = (env && typeof env.draftId === 'string' && env.draftId) ? env.draftId : null;
      state.draftPersistError = (env && env.draftError && env.draftError.code)
        ? errorText(env.draftError.code) : null;
      state.draftEdits = {};
      state.draftDirty = false;
      state.saveState = 'idle';
      state.saveError = null;
      // Phase 5 — the canonical NorRecord (get-or-created at requires_review,
      // status `in_review`, NO official number). AI made the draft; a human
      // must review, then approve, then publish.
      state.norId = (env && typeof env.norId === 'string' && env.norId) ? env.norId : null;
      state.norLifecycle = state.norId ? NOR_LIFECYCLE.IN_REVIEW : null;
      state.norVersion = state.norId ? 1 : null;
      state.norNumber = null;
      state.norPublishedVersion = null;
      state.registryPersistError = (env && env.registryError && env.registryError.code)
        ? errorText(env.registryError.code) : null;
      state.approveState = 'idle';
      state.approveError = null;
      state.publishState = 'idle';
      state.publishError = null;
      state.registrySyncError = null;
      state.phase = CONSOLE_PHASE.REVIEW;
      state.error = null;
      pushMessage('intelligence', state.norId
        ? 'AI membuat draft NOR. Silakan tinjau, sunting bila perlu, lalu Setujui. Nomor resmi baru ditetapkan Registry saat Anda menekan Terbitkan.'
        : (state.draftId
          ? 'Draf NOR sudah dibuat dan tersimpan. Silakan tinjau, sunting bila perlu, lalu simpan. Status tetap "Menunggu review".'
          : 'Draf NOR sudah dibuat. Silakan tinjau di bawah. (Draf belum tersimpan otomatis — mulai permintaan baru bila perlu.)'));
      return;
    }
    if (res.status === RESPONSE_STATUS.COMPLETED) {
      state.questions = [];
      state.phase = CONSOLE_PHASE.REVIEW;
      state.error = null;
      pushMessage('intelligence', 'Selesai.');
      return;
    }
    // error
    const code = res.error && res.error.code ? res.error.code : null;
    state.phase = CONSOLE_PHASE.ERROR;
    state.error = errorText(code);
    pushMessage('intelligence', state.error);
  }

  /** Shared guarded runner — owns the busy flag + double-submit protection +
   *  the never-throw guarantee + input restore on failure. */
  async function run(kind, text) {
    if (state.busy) return snapshot();
    const value = String(text == null ? '' : text).trim();
    if (!value) return snapshot();

    state.busy = true;
    state.error = null;
    state.pendingInput = value;              // kept so the view can restore it on failure
    pushMessage('user', value);
    state.phase = CONSOLE_PHASE.LOADING;
    emit();

    let env;
    try {
      if (kind === 'submit') {
        const request = makeIntelligenceRequest({
          requestId: nextRequestId(),
          actor: { userId: who.userId, role: who.role, sourceModule: 'intelligence' },
          task: REQUEST_TASK.NOR_GENERATE,
          domainType: 'nor',
          input: { text: value },
        });
        env = await service.handle(request);
      } else {
        // Hand the raw message to the service — it extracts the facts this
        // reply answers by SEMANTIC meaning (item / quantity / purpose /
        // budget / recipient), merging into the conversation's known facts.
        // A message may answer one field, several, an earlier field, or a
        // later one — never blindly the first unanswered question.
        env = await service.continueSession(state.conversationId, { text: value }, { userId: who.userId, role: who.role });
      }
      applyEnvelope(env);
      if (state.phase !== CONSOLE_PHASE.ERROR) state.pendingInput = '';
    } catch (err) {
      // A thrown/rejected service call must never crash the surface.
      state.phase = CONSOLE_PHASE.ERROR;
      state.error = ERROR_FALLBACK;
      pushMessage('intelligence', ERROR_FALLBACK);
    } finally {
      state.busy = false;
      emit();
    }
    return snapshot();
  }

  /* ── Phase 5 — canonical NOR Registry lifecycle helpers ──────────────── */

  /** Fold a canonical NorRecord into the lifecycle slice of the state. */
  function applyNorRecord(rec) {
    if (!rec || typeof rec !== 'object') return;
    state.norId = rec.norId || state.norId;
    state.norLifecycle = rec.status || state.norLifecycle;
    state.norVersion = typeof rec.currentVersion === 'number' ? rec.currentVersion : state.norVersion;
    state.norNumber = rec.norNumber || null;
    state.norPublishedVersion = typeof rec.publishedVersion === 'number' ? rec.publishedVersion : null;
  }

  /** Best-effort re-read of the canonical record (never throws). */
  async function refreshNorRecord() {
    if (!state.norId || typeof service.getNorRecord !== 'function') return null;
    try {
      const res = await service.getNorRecord(state.norId, { userId: who.userId, role: who.role });
      if (res && res.ok && res.record) { applyNorRecord(res.record); return res.record; }
    } catch { /* leave the last-known lifecycle in place */ }
    return null;
  }

  /** Shared runner for the two HUMAN lifecycle actions (approve / publish).
   *  `expectStatus` is the stage the action legally starts from (PART H);
   *  `goalStatuses` are the stages where the action's outcome is ALREADY
   *  true (so a redundant click is an idempotent success, not an error) —
   *  approve's goal is met once `approved` OR `published`, publish's once
   *  `published`. `call` is the service method; `stateKey` is
   *  'approve' | 'publish'. */
  async function lifecycleAction({ stateKey, expectStatus, goalStatuses, requireClean, call, done }) {
    if (state.busy) return snapshot();
    if (state.phase !== CONSOLE_PHASE.REVIEW) return snapshot();
    const busyKey = `${stateKey}State`;
    const errKey = `${stateKey}Error`;
    if (!state.norId || typeof call !== 'function') {
      state[busyKey] = 'error';
      state[errKey] = ERROR_TEXT.NO_BACKEND;
      emit();
      return snapshot();
    }
    if (requireClean && state.draftDirty) {
      state[busyKey] = 'error';
      state[errKey] = 'Simpan perubahan terlebih dahulu sebelum melanjutkan.';
      emit();
      return snapshot();
    }
    state.busy = true;
    state[busyKey] = 'busy';
    state[errKey] = null;
    emit();
    try {
      const fresh = await refreshNorRecord();
      if (fresh && Array.isArray(goalStatuses) && goalStatuses.includes(fresh.status)) {
        // the outcome already holds — an idempotent no-op, not a server call.
        applyNorRecord(fresh);
        state[busyKey] = 'idle';
        state[errKey] = null;
        return snapshot();
      }
      if (fresh && fresh.status !== expectStatus) {
        state[busyKey] = 'error';
        state[errKey] = ERROR_TEXT.ILLEGAL_TRANSITION;
        return snapshot();
      }
      const version = state.norVersion;
      let res;
      try { res = await call(state.norId, version); } catch { res = { ok: false, error: { code: 'NETWORK' } }; }
      if (res && res.ok && res.record) {
        applyNorRecord(res.record);
        state[busyKey] = 'idle';
        state[errKey] = null;
        if (typeof done === 'function') done(res.record);
      } else {
        state[busyKey] = 'error';
        state[errKey] = errorText(res && res.error && res.error.code);
      }
    } finally {
      state.busy = false;
      emit();
    }
    return snapshot();
  }

  return Object.freeze({
    getState: snapshot,
    setOnChange,

    /** First turn — describe the need in free text. */
    submit(text) { return run('submit', text); },

    /** A later turn — answer the current question in free text. Falls back to
     *  submit() when there is no live conversation yet (e.g. retry after an
     *  error on the very first turn). */
    answer(text) {
      if (!state.conversationId || state.phase === CONSOLE_PHASE.IDLE) return run('submit', text);
      return run('answer', text);
    },

    /* ── Phase 4 — the persistent, human-editable NOR draft ────────────── */

    /** Stage a local edit to ONE editable draft field. Pure — no network,
     *  never per-keystroke work beyond bookkeeping. The reviewer's edits are
     *  held here until saveDraft(). Non-editable fields are ignored. Editing
     *  is only permitted while the canonical record is `in_review` (PART H):
     *  once approved / published the draft is read-only. */
    editField(field, value) {
      if (state.phase !== CONSOLE_PHASE.REVIEW) return snapshot();
      if (state.norLifecycle && state.norLifecycle !== NOR_LIFECYCLE.IN_REVIEW) return snapshot();
      const f = String(field == null ? '' : field);
      if (!EDITABLE.has(f)) return snapshot();
      state.draftEdits = { ...state.draftEdits, [f]: value };
      state.draftDirty = true;
      if (state.saveState !== 'saving') state.saveState = 'idle';
      state.saveError = null;
      emit();
      return snapshot();
    },

    /** Persist the staged edits to the server-owned draft via
     *  service.updateDraft(). EXPLICIT — the view calls this from a "Simpan
     *  Draf" button, never on input. On failure the staged edits are KEPT
     *  (the reviewer never loses work) and saveState becomes 'error'. This
     *  never publishes, numbers, or approves — the draft stays
     *  `requires_review`. */
    async saveDraft() {
      if (state.busy) return snapshot();
      if (state.phase !== CONSOLE_PHASE.REVIEW) return snapshot();
      if (state.norLifecycle && state.norLifecycle !== NOR_LIFECYCLE.IN_REVIEW) {
        state.saveState = 'error';
        state.saveError = ERROR_TEXT.ALREADY_PUBLISHED;
        emit();
        return snapshot();
      }
      if (!state.draftId) {
        state.saveState = 'error';
        state.saveError = 'Draf belum tersimpan di server sehingga belum bisa disunting. Mulai permintaan baru.';
        emit();
        return snapshot();
      }
      if (!state.draftDirty || Object.keys(state.draftEdits).length === 0) {
        state.saveState = 'saved';
        state.saveError = null;
        emit();
        return snapshot();
      }
      if (typeof service.updateDraft !== 'function') {
        state.saveState = 'error';
        state.saveError = ERROR_TEXT.NO_BACKEND;
        emit();
        return snapshot();
      }
      state.busy = true;
      state.saveState = 'saving';
      state.saveError = null;
      emit();
      let res;
      try {
        res = await service.updateDraft(state.draftId, { ...state.draftEdits }, { userId: who.userId, role: who.role });
      } catch {
        res = { ok: false, error: { code: 'NETWORK' } };
      }
      if (res && res.ok && res.draft) {
        state.draft = draftRecordToView(res.draft);
        state.draftId = res.draft.draftId || state.draftId;
        state.draftEdits = {};
        state.draftDirty = false;
        state.saveState = 'saved';
        state.saveError = null;
        state.registrySyncError = null;
        // Phase 5 — keep the canonical record's immutable version history in
        // step with the just-saved draft. Best-effort: a sync failure is a
        // SOFT warning (the draft IS saved); it never blocks or publishes.
        if (state.norId && typeof service.syncNorRecord === 'function') {
          try {
            const sync = await service.syncNorRecord(state.norId, { userId: who.userId, role: who.role });
            if (sync && sync.ok && sync.record) applyNorRecord(sync.record);
            else state.registrySyncError = errorText(sync && sync.error && sync.error.code);
          } catch { state.registrySyncError = ERROR_TEXT.NETWORK; }
        }
        pushMessage('intelligence', 'Perubahan draf tersimpan. Status tetap "Menunggu review".');
      } else {
        // keep state.draftEdits — the reviewer's work is not thrown away
        state.saveState = 'error';
        state.saveError = errorText(res && res.error && res.error.code);
      }
      state.busy = false;
      emit();
      return snapshot();
    },

    /* ── Phase 5 — HUMAN approval + publication (PART E–H) ─────────────────
       Both are EXPLICIT, from their own buttons. The controller never calls
       them itself. Approve is only offered while `in_review`; publish only
       while `approved`. Publish reserves the official number server-side and
       is idempotent. AI membuat draft; manusia meninjau; manusia menyetujui;
       Registry menetapkan nomor resmi saat diterbitkan. */

    /** in_review → approved. Requires a clean (saved) draft. */
    approve() {
      return lifecycleAction({
        stateKey: 'approve',
        expectStatus: NOR_LIFECYCLE.IN_REVIEW,
        goalStatuses: [NOR_LIFECYCLE.APPROVED, NOR_LIFECYCLE.PUBLISHED],
        requireClean: true,
        call: (norId, version) => service.approveNor(norId, version, { userId: who.userId, role: who.role }),
        done: () => pushMessage('intelligence', 'NOR disetujui oleh Anda. Belum ada nomor resmi — tekan "Terbitkan" untuk menetapkannya melalui Registry.'),
      });
    },

    /** approved → published. Reserves exactly one official number. */
    publish() {
      return lifecycleAction({
        stateKey: 'publish',
        expectStatus: NOR_LIFECYCLE.APPROVED,
        goalStatuses: [NOR_LIFECYCLE.PUBLISHED],
        requireClean: false,
        call: (norId, version) => service.publishNor(norId, version, { userId: who.userId, role: who.role }),
        done: (rec) => pushMessage('intelligence', `NOR diterbitkan. Nomor resmi: ${rec.norNumber} (ditetapkan oleh Registry). Versi terbit tidak dapat diubah lagi.`),
      });
    },

    /** Drop the staged edits and revert the form to the last saved draft. */
    discardEdits() {
      state.draftEdits = {};
      state.draftDirty = false;
      state.saveState = 'idle';
      state.saveError = null;
      emit();
      return snapshot();
    },

    /** Reload path — the host view kept a draftId (session pointer). Re-fetch
     *  the server-owned record and land straight in the review workspace, so
     *  a page refresh shows the SAME persisted draft. A stale/failed pointer
     *  just returns to idle without noise. */
    async resumeDraft(draftId) {
      if (state.busy) return snapshot();
      const id = String(draftId == null ? '' : draftId);
      if (!id || typeof service.getDraft !== 'function') return snapshot();
      state.busy = true;
      state.phase = CONSOLE_PHASE.LOADING;
      state.error = null;
      emit();
      let res;
      try {
        res = await service.getDraft(id, { userId: who.userId, role: who.role });
      } catch {
        res = { ok: false, error: { code: 'NETWORK' } };
      }
      if (res && res.ok && res.draft) {
        state.draft = draftRecordToView(res.draft);
        state.draftId = res.draft.draftId || id;
        state.conversationId = res.draft.conversationId || state.conversationId;
        state.review = { reason: 'Draf NOR memerlukan peninjauan manusia sebelum diterbitkan.', blocking: true };
        state.questions = [];
        state.draftEdits = {};
        state.draftDirty = false;
        state.saveState = 'idle';
        state.saveError = null;
        state.draftPersistError = null;
        state.approveState = 'idle';
        state.approveError = null;
        state.publishState = 'idle';
        state.publishError = null;
        state.registrySyncError = null;
        state.registryPersistError = null;
        state.phase = CONSOLE_PHASE.REVIEW;
        // Phase 5 — restore the canonical lifecycle (status / version /
        // official number) so a reload lands on Approve, Publish, or the
        // read-only published view exactly as the user left it.
        state.norId = res.draft.conversationId ? norIdFromConversation(res.draft.conversationId) : null;
        state.norLifecycle = state.norId ? NOR_LIFECYCLE.IN_REVIEW : null;
        state.norVersion = state.norId ? 1 : null;
        state.norNumber = null;
        state.norPublishedVersion = null;
        await refreshNorRecord();
        pushMessage('intelligence', state.norLifecycle === NOR_LIFECYCLE.PUBLISHED
          ? `NOR yang tersimpan dimuat kembali. Sudah diterbitkan — nomor resmi: ${state.norNumber}.`
          : 'Draf NOR yang tersimpan dimuat kembali. Silakan lanjutkan peninjauan.');
      } else {
        state.phase = CONSOLE_PHASE.IDLE;
      }
      state.busy = false;
      emit();
      return snapshot();
    },

    /** Abandon the current conversation + draft locally and return to idle.
     *  The server-owned conversation and draft are left untouched (no cancel,
     *  no delete). */
    reset() {
      state.phase = CONSOLE_PHASE.IDLE;
      state.busy = false;
      state.messages = [];
      state.questions = [];
      state.draft = null;
      state.review = null;
      state.conversationId = null;
      state.error = null;
      state.pendingInput = '';
      state.modelError = null;
      state.draftId = null;
      state.draftEdits = {};
      state.draftDirty = false;
      state.saveState = 'idle';
      state.saveError = null;
      state.draftPersistError = null;
      state.norId = null;
      state.norLifecycle = null;
      state.norVersion = null;
      state.norNumber = null;
      state.norPublishedVersion = null;
      state.registryPersistError = null;
      state.approveState = 'idle';
      state.approveError = null;
      state.publishState = 'idle';
      state.publishError = null;
      state.registrySyncError = null;
      emit();
      return snapshot();
    },

    destroy() { /* nothing to tear down — no timers, no listeners, no I/O */ },
  });
}
