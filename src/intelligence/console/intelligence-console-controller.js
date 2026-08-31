/* ============================================================
   INTELLIGENCE-CONSOLE-CONTROLLER.JS — Sarpras Intelligence (V2, Phase 3B)

   PURPOSE: the minimal, PURE state machine behind the first user-facing
   Sarpras Intelligence surface. It proves ONE flow and nothing more:

     idle → submit(text) → loading → needs_input
          → answer(text) → loading → needs_input | review
                                              (requires_review draft)
     any step → error (recoverable — the input is restored, retry resumes)

   It is a thin adapter over the EXISTING createIntelligenceService():
     • first turn   → service.handle(makeIntelligenceRequest(...))
     • later turns  → service.continueSession(conversationId, answers, actor)
   It never talks to Firebase, OpenAI, RTDB, or the DOM. The host view
   (js/intelligence-console.js) owns rendering; the wiring bridge
   (js/intelligence-backend-wiring.js) owns building the real service.

   RESPONSIBILITY: createIntelligenceConsoleController({ service, actor,
   onChange?, requestIdFactory? }) → { getState, submit, answer, reset,
   destroy }.

   NON-GOALS (Phase 3B): NO editable preview, NO publish, NO NOR Registry,
   NO numbering, NO knowledge ingestion, NO autonomous action. The review
   state is DISPLAY ONLY.

   DEPENDENCIES: the two Phase 0 contracts (request + response). Pure.
   ============================================================ */

'use strict';

import { makeIntelligenceRequest, REQUEST_TASK } from '../contracts/intelligence-request-contract.js';
import { RESPONSE_STATUS } from '../contracts/intelligence-response-contract.js';

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
   *   modelError:object|null}} */
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
  });
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
      pushMessage('intelligence', questionsToText(state.questions));
      return;
    }
    if (res.status === RESPONSE_STATUS.REQUIRES_REVIEW || res.status === RESPONSE_STATUS.DRAFT) {
      state.draft = res.draft || null;
      state.review = res.review || null;
      state.questions = [];
      state.modelError = env && env.modelError ? env.modelError : null;
      state.phase = CONSOLE_PHASE.REVIEW;
      state.error = null;
      pushMessage('intelligence', 'Draf sudah siap. Silakan tinjau ringkasannya di bawah.');
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
        const field = state.questions[0] && state.questions[0].id ? state.questions[0].id : 'answer';
        env = await service.continueSession(state.conversationId, { [field]: value }, { userId: who.userId, role: who.role });
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

    /** Abandon the current conversation locally and return to idle. The
     *  server-owned conversation is left untouched (Phase 3B does not cancel
     *  or delete). */
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
      emit();
      return snapshot();
    },

    destroy() { /* nothing to tear down — no timers, no listeners, no I/O */ },
  });
}
