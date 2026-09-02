/* ============================================================
   INTELLIGENCE-CONSOLE-CONTROLLER.JS — Sarpras Intelligence (V2, Phase 3B)

   PURPOSE: the minimal, PURE state machine behind the first user-facing
   Sarpras Intelligence surface. Phase 3B proved the intake flow; Phase 4
   adds a persistent, human-editable NOR draft on top:

     idle → submit(text) → loading → needs_input
          → answer(text) → loading → needs_input | review
                                              (requires_review + persisted draftId)
          in review:  editField(f, v)  → stage a local edit (no network)
                      saveDraft()      → persist the staged edits (explicit)
                      discardEdits()   → drop the staged edits
          on reload:  resumeDraft(id)  → re-fetch the server draft → review
     any step → error (recoverable — the input / the staged edits are kept)

   It is a thin adapter over the EXISTING createIntelligenceService():
     • first turn   → service.handle(makeIntelligenceRequest(...))
     • later turns  → service.continueSession(conversationId, answers, actor)
     • draft edits  → service.updateDraft(draftId, edits, actor)
     • reload       → service.getDraft(draftId, actor)
   It never talks to Firebase, OpenAI, RTDB, the DOM, or storage. The host
   view (js/intelligence-console.js) owns rendering + the reload pointer;
   the wiring bridge (js/intelligence-backend-wiring.js) builds the service.

   RESPONSIBILITY: createIntelligenceConsoleController({ service, actor,
   onChange?, requestIdFactory? }) → { getState, submit, answer, editField,
   saveDraft, discardEdits, resumeDraft, reset, destroy }.

   HARD BOUNDARY (unchanged): NO publish / "Terbitkan" / approve / official
   numbering / NOR Registry / knowledge write / autonomous action. The draft
   stays `requires_review`; a human review is mandatory. saveDraft() only
   persists the reviewer's own edits to their own draft.

   DEPENDENCIES: the two Phase 0 contracts + the NOR-draft record contract
   (all pure). Pure.
   ============================================================ */

'use strict';

import { makeIntelligenceRequest, REQUEST_TASK } from '../contracts/intelligence-request-contract.js';
import { RESPONSE_STATUS } from '../contracts/intelligence-response-contract.js';
import { DRAFT_EDITABLE_FIELDS } from '../nor-draft/contracts/nor-draft-record-contract.js';

const EDITABLE = new Set(DRAFT_EDITABLE_FIELDS);

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
      state.phase = CONSOLE_PHASE.REVIEW;
      state.error = null;
      pushMessage('intelligence', state.draftId
        ? 'Draf NOR sudah dibuat dan tersimpan. Silakan tinjau, sunting bila perlu, lalu simpan. Status tetap "Menunggu review".'
        : 'Draf NOR sudah dibuat. Silakan tinjau di bawah. (Draf belum tersimpan otomatis — mulai permintaan baru bila perlu.)');
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
     *  held here until saveDraft(). Non-editable fields are ignored. */
    editField(field, value) {
      if (state.phase !== CONSOLE_PHASE.REVIEW) return snapshot();
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
        state.phase = CONSOLE_PHASE.REVIEW;
        pushMessage('intelligence', 'Draf NOR yang tersimpan dimuat kembali. Silakan lanjutkan peninjauan.');
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
      emit();
      return snapshot();
    },

    destroy() { /* nothing to tear down — no timers, no listeners, no I/O */ },
  });
}
