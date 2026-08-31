/* ============================================================
   INTELLIGENCE-SERVICE.JS — Sarpras Intelligence (V2, Phase 1)

   PURPOSE: the ONE orchestrator every module goes through to reach the
   Intelligence layer (PART 2A). It never talks to a model API directly and
   never re-implements a domain — it composes the EXISTING pieces:

     IntelligenceRequest
        │  authz gate (PART 11)
        ▼
     src/conversation/conversation-service   (deterministic intent +
        │  questionnaire + knowledge-informed Question Optimizer — reused wholesale)
        ▼
     ACTIVE  ─▶  needs_input  (deterministic questions, optionally model-rephrased)
     READY   ─▶  recipient gate (PART 8 — ask, never invent)
        │            ├─ ambiguous ─▶ needs_input (one recipient question)
        │            └─ known/proposed ─▶
        ▼
     retrieve Approved Knowledge + Organizational Memory (read-only, PART 7)
     numbering SUGGESTION from the Registry (never authority, PART 9)
     provider.complete()  — model prose for the body; failure degrades to a
        │                   deterministic template, never a crash (PART 13)
        ▼
     assembleNorDraft  ─▶  requires_review   (human approval before publish — PART 1)

   Durable multi-turn state lives in intelligence-conversation-store.js
   (PART 10) — never only in the browser.

   RESPONSIBILITY: createIntelligenceService(deps) →
     { handle(request), continueSession(convId, answers, actor),
       getSession(convId, actor), cancelSession(convId, actor) }

   DEPENDENCIES: Phase 0 contracts (request/response/provenance/audit),
   conversation-store, retrieval/*, clarification, nor-draft-assembler.
   The four heavy domain ports are INJECTED (default-ports.js wires the
   real services) so the service is unit-testable with fakes.

   NON-GOALS: no model API call, no publish, no number issuance, no
   knowledge write, no UI.
   ============================================================ */

'use strict';

import { REQUEST_TASK } from '../contracts/intelligence-request-contract.js';
import {
  RESPONSE_ERRORS,
  needsInputResponse, requiresReviewResponse, errorResponse,
} from '../contracts/intelligence-response-contract.js';
import { makeGenerationProvenance } from '../contracts/generation-provenance-contract.js';
import { INTELLIGENCE_EVENT, makeIntelligenceAuditEvent } from '../contracts/audit-contract.js';
import { makeModelCompletionRequest, MESSAGE_ROLE } from '../providers/model-completion-contract.js';
import {
  IC_STATUS, makeIntelligenceConversation, appendTurn,
  getConversation, createConversation, appendConversation,
} from '../conversation/intelligence-conversation-store.js';
import { retrieveApprovedKnowledge } from '../retrieval/knowledge-retrieval.js';
import { retrieveRecentArchive, summarizeRecipientPatterns } from '../retrieval/memory-retrieval.js';
import { factQuestions, resolveRecipient, recipientQuestion } from './clarification.js';
import { assembleNorDraft } from './nor-draft-assembler.js';

const TASK_TO_INTENT = Object.freeze({ [REQUEST_TASK.NOR_GENERATE]: 'create_nor' });

/** Default config port — the Phase 0 config module. */
async function defaultConfig() {
  const m = await import('../config/intelligence-config.js');
  return {
    isEnabled: () => m.isIntelligenceEnabled(),
    get: () => m.getIntelligenceConfig(),
  };
}

/**
 * @param {Object} deps
 * @param {Object} deps.ports              conversation / knowledgeReader / memoryReader / norTypes / numbering
 * @param {{ complete: (req:object)=>Promise<object> }} deps.provider   the ACTIVE provider (Null by default)
 * @param {{ canUseIntelligence:(actor)=>boolean, canAccessKnowledge?:(actor,domainType)=>boolean }} deps.authz
 * @param {{ isEnabled:()=>boolean, get:()=>object }} [deps.config]
 * @param {()=>string} [deps.clock]         ISO-now
 * @param {()=>string} deps.idgen           convId generator (required — keeps the service pure)
 * @param {{ create:Function, append:Function, get:Function }} [deps.store]
 *   defaults to the conversation-store facade. Each may be sync OR return a
 *   Promise of the { ok, data, error } envelope — the service awaits them,
 *   so the 'memory' backend and the Phase 2C server-owned 'callable' backend
 *   (RTDB via the intelligenceConversation Cloud Function) both work.
 */
export function createIntelligenceService(deps) {
  const {
    ports,
    provider,
    authz,
    config,
    clock = () => new Date().toISOString(),
    idgen,
    store = { create: createConversation, append: appendConversation, get: getConversation },
  } = deps || {};

  if (!ports || !ports.conversation || typeof ports.conversation.start !== 'function') {
    throw new Error('createIntelligenceService: ports.conversation.start is required.');
  }
  if (typeof idgen !== 'function') {
    throw new Error('createIntelligenceService: idgen() is required (the service does not generate ids itself).');
  }

  const cfg = config || null;
  const isEnabled = () => (cfg ? !!cfg.isEnabled() : false);
  const limits = () => {
    const c = cfg && cfg.get ? cfg.get() : {};
    return {
      maxTurns: (c.limits && c.limits.maxTurns) || 12,
      maxPromptChars: (c.limits && c.limits.maxPromptChars) || 24000,
      model: (c.openai && c.openai.model) || c.defaultModel || null,
      determinism: (c.openai && c.openai.determinism) != null ? c.openai.determinism : 0.7,
      maxOutputTokens: (c.request && c.request.maxOutputTokens) || null,
    };
  };

  /* ── audit (PART 12) — events describe a turn; no framework, no sink here ── */
  function turnAudit({ requestId, actorId, sourceModule, status, questionCount, hasDraft }) {
    const at = clock();
    const ev = [makeIntelligenceAuditEvent({ type: INTELLIGENCE_EVENT.AI_REQUESTED, requestId, actorId, sourceModule, at })];
    ev.push(makeIntelligenceAuditEvent({ type: INTELLIGENCE_EVENT.AI_RESPONSE_RECEIVED, requestId, actorId, sourceModule, at, detail: { status } }));
    if (questionCount > 0) ev.push(makeIntelligenceAuditEvent({ type: INTELLIGENCE_EVENT.AI_QUESTION_ASKED, requestId, actorId, sourceModule, at, detail: { count: questionCount } }));
    if (hasDraft) ev.push(makeIntelligenceAuditEvent({ type: INTELLIGENCE_EVENT.AI_DRAFT_CREATED, requestId, actorId, sourceModule, at }));
    return Object.freeze(ev);
  }

  function provenanceFor(requestId, actor, sourceModule, modelInfo) {
    return makeGenerationProvenance({
      requestId,
      model: modelInfo ? modelInfo.model : null,
      modelVersion: modelInfo ? modelInfo.modelVersion : null,
      promptVersion: modelInfo ? 'nor-draft@1' : null,
      knowledgeVersion: modelInfo ? modelInfo.knowledgeVersion : null,
      generatedAt: clock(),
      userId: actor && actor.userId ? actor.userId : null,
      sourceModule: sourceModule || null,
    });
  }

  /* ── run the deterministic conversation for the accumulated facts ────── */
  function runConversation(utterance, actor, accumulatedFacts) {
    const res = ports.conversation.start({
      utterance,
      actorId: actor.userId,
      additionalFacts: accumulatedFacts && typeof accumulatedFacts === 'object' ? accumulatedFacts : {},
    });
    if (!res || !res.ok) {
      return { kind: 'error', code: RESPONSE_ERRORS.INVALID_REQUEST, message: (res && res.error && res.error.message) || 'Conversation could not start.' };
    }
    const c = res.data;
    if (c.state === ports.conversation.STATE.FAILED) {
      return { kind: 'error', code: RESPONSE_ERRORS.UNKNOWN_INTENT, message: 'Maaf, permintaan ini belum bisa dipahami. Coba jelaskan lebih spesifik.' };
    }
    // c.missingFacts entries are RequiredFact objects {field,label,prompt,...}
    const missing = Array.isArray(c.missingFacts) ? c.missingFacts : [];
    return {
      kind: c.state === ports.conversation.STATE.READY && missing.length === 0 ? 'ready' : 'active',
      gatheredFacts: c.gatheredFacts || {},
      missing,
      norType: (c.gatheredFacts && c.gatheredFacts.type) || null,
    };
  }

  /* ── enabled-mode: ask the model for the NOR body prose ──────────────── */
  async function modelBodyFor({ requestId, norType, facts, recipient, knowledgeItems }) {
    if (!isEnabled() || !provider || typeof provider.complete !== 'function') {
      return { body: null, modelInfo: null, error: { code: 'DISABLED', message: 'deterministic mode' } };
    }
    const l = limits();
    const knowledgeSummary = (knowledgeItems || []).slice(0, 12)
      .map((k) => `- (${k.kind}) ${typeof k.payload === 'string' ? k.payload : JSON.stringify(k.payload)}`)
      .join('\n')
      .slice(0, Math.floor(l.maxPromptChars / 2));
    const factLines = Object.entries(facts || {}).filter(([k]) => k !== 'type').map(([k, v]) => `- ${k}: ${v}`).join('\n');
    const system = [
      'Anda membantu menyusun BADAN SURAT Nota Dinas (NOR) organisasi PBSI dalam Bahasa Indonesia yang formal dan ringkas.',
      'Gunakan HANYA fakta yang diberikan. JANGAN mengarang nomor NOR, tanggal, penerima, atau nilai anggaran yang tidak diberikan.',
      'Keluarkan hanya teks badan surat, tanpa kop, tanpa nomor, tanpa tanda tangan.',
    ].join(' ');
    const user = [
      `Jenis NOR: ${norType || '(umum)'}`,
      `Penerima (untuk konteks saja, jangan diubah): ${recipient && recipient.value ? recipient.value : '(belum ditentukan)'}`,
      'Fakta:',
      factLines || '(tidak ada)',
      knowledgeSummary ? `\nPola/istilah dari pengetahuan yang disetujui:\n${knowledgeSummary}` : '',
    ].join('\n');

    const req = makeModelCompletionRequest({
      requestId,
      purpose: 'nor.draft',
      messages: [
        { role: MESSAGE_ROLE.SYSTEM, content: system },
        { role: MESSAGE_ROLE.USER, content: user },
      ],
      expectJson: false,
      maxOutputTokens: l.maxOutputTokens,
      determinism: l.determinism,
    });
    let result;
    try {
      result = await provider.complete(req);
    } catch (err) {
      return { body: null, modelInfo: null, error: { code: 'NETWORK', message: String(err && err.message || 'provider threw') } };
    }
    if (!result || !result.ok) {
      return { body: null, modelInfo: null, error: (result && result.error) || { code: 'PROVIDER_ERROR', message: 'no result' } };
    }
    return {
      body: result.text,
      modelInfo: { model: result.model || l.model, modelVersion: result.model || null, knowledgeVersion: `k:${(knowledgeItems || []).length}` },
      error: null,
    };
  }

  /* ── produce the READY draft (recipient already resolved) ────────────── */
  async function buildDraftResponse({ requestId, actor, sourceModule, domainType, norType, facts, recipient }) {
    const kn = retrieveApprovedKnowledge({
      domainType, norType,
      knowledgeReader: ports.knowledgeReader,
      authz: { canAccessKnowledge: authz && authz.canAccessKnowledge },
      actor,
    });
    if (!kn.ok && kn.error && kn.error.code === 'FORBIDDEN') {
      return { response: errorResponse({ requestId, code: RESPONSE_ERRORS.FORBIDDEN, message: kn.error.message }), record: null };
    }
    const knowledgeItems = kn.ok ? kn.items : [];
    const knowledgeRefs = kn.ok ? kn.refs : [];

    const arch = retrieveRecentArchive({ domainType, memoryReader: ports.memoryReader });
    const memoryRefs = arch.ok ? arch.refs : [];

    let numberingSuggestion = null;
    try {
      if (ports.numbering && typeof ports.numbering.suggestNextNumber === 'function') {
        numberingSuggestion = ports.numbering.suggestNextNumber(domainType);
      }
    } catch { numberingSuggestion = null; }

    const mb = await modelBodyFor({ requestId, norType, facts, recipient, knowledgeItems });

    const { draft, numbering } = assembleNorDraft({
      norType,
      collectedFields: facts,
      recipient,
      modelBody: mb.body,
      numberingSuggestion,
      knowledgeRefs,
      memoryRefs,
    });

    const provenance = provenanceFor(requestId, actor, sourceModule, mb.modelInfo);
    const reason = 'Draf NOR memerlukan peninjauan dan persetujuan manusia sebelum diterbitkan. Nomor resmi ditetapkan oleh Registry, bukan AI.';
    const response = requiresReviewResponse({ requestId, draft, reason, blocking: true, provenance });
    return { response, draft, numbering, knowledgeRefs, memoryRefs, provenance, modelError: mb.error && mb.error.code !== 'DISABLED' ? mb.error : null };
  }

  /* ══ PUBLIC API ═════════════════════════════════════════════════════ */

  async function handle(request) {
    const actor = request && request.actor ? { userId: request.actor.userId, role: request.actor.role } : null;
    const requestId = request && request.requestId ? request.requestId : null;
    const sourceModule = (request && request.actor && request.actor.sourceModule) || 'intelligence';

    if (!authz || typeof authz.canUseIntelligence !== 'function' || !authz.canUseIntelligence(actor)) {
      return { response: errorResponse({ requestId, code: RESPONSE_ERRORS.FORBIDDEN, message: 'Anda tidak berhak menggunakan Sarpras Intelligence.' }), conversationId: null };
    }
    if (!request || typeof request.requestId !== 'string' || !request.requestId) {
      return { response: errorResponse({ requestId: requestId || 'unknown', code: RESPONSE_ERRORS.INVALID_REQUEST, message: 'requestId wajib diisi.' }), conversationId: null };
    }
    const intent = TASK_TO_INTENT[request.task];
    if (!intent) {
      return { response: errorResponse({ requestId, code: RESPONSE_ERRORS.INVALID_REQUEST, message: `Task "${request.task}" belum didukung di Phase 1.` }), conversationId: null };
    }
    const utterance = request.input && typeof request.input.text === 'string' ? request.input.text.trim() : '';
    if (!utterance) {
      return { response: errorResponse({ requestId, code: RESPONSE_ERRORS.INVALID_REQUEST, message: 'input.text kosong.' }), conversationId: null };
    }

    const domainType = request.domainType || 'nor';
    const seedFacts = request.input && request.input.fields && typeof request.input.fields === 'object' ? request.input.fields : {};
    const run = runConversation(utterance, actor, seedFacts);
    const convId = idgen();
    const now = clock();

    if (run.kind === 'error') {
      const rec = makeIntelligenceConversation({
        convId, actorId: actor.userId, actorRole: actor.role, sourceModule,
        sourceFeature: request.actor && request.actor.sourceFeature, task: request.task, domainType,
        openingUtterance: utterance, collectedFields: seedFacts, missingFields: [],
        status: IC_STATUS.ERROR, requestId, now,
      });
      await store.create(rec);
      return { response: errorResponse({ requestId, code: run.code, message: run.message }), conversationId: convId, audit: turnAudit({ requestId, actorId: actor.userId, sourceModule, status: 'error', questionCount: 0, hasDraft: false }) };
    }

    if (run.kind === 'active') {
      const questions = factQuestions(run.missing);
      const rec = makeIntelligenceConversation({
        convId, actorId: actor.userId, actorRole: actor.role, sourceModule,
        sourceFeature: request.actor && request.actor.sourceFeature, task: request.task, domainType,
        openingUtterance: utterance, collectedFields: run.gatheredFacts,
        missingFields: run.missing.map((m) => m.field), status: IC_STATUS.NEEDS_INPUT, requestId, now,
      });
      await store.create(rec);
      return {
        response: needsInputResponse({ requestId, questions, provenance: provenanceFor(requestId, actor, sourceModule, null) }),
        conversationId: convId,
        audit: turnAudit({ requestId, actorId: actor.userId, sourceModule, status: 'needs_input', questionCount: questions.length, hasDraft: false }),
      };
    }

    // READY on the first turn — go straight to the recipient gate + draft.
    return finishReady({ requestId, actor, sourceModule, domainType, convId, isNew: true, now, facts: run.gatheredFacts, norType: run.norType, task: request.task, sourceFeature: request.actor && request.actor.sourceFeature, utterance });
  }

  async function continueSession(convId, answers, actorArg) {
    const actor = actorArg ? { userId: actorArg.userId, role: actorArg.role } : null;
    if (!authz || typeof authz.canUseIntelligence !== 'function' || !authz.canUseIntelligence(actor)) {
      return { response: errorResponse({ requestId: convId, code: RESPONSE_ERRORS.FORBIDDEN, message: 'Tidak berhak.' }), conversationId: convId };
    }
    const got = await store.get(convId, actor && actor.userId);
    if (!got.ok) {
      const code = got.error && got.error.code === 'FORBIDDEN' ? RESPONSE_ERRORS.FORBIDDEN : RESPONSE_ERRORS.INVALID_REQUEST;
      return { response: errorResponse({ requestId: convId, code, message: (got.error && got.error.message) || 'Sesi tidak ditemukan.' }), conversationId: convId };
    }
    const ic = got.data;
    if (ic.status === IC_STATUS.CANCELLED) {
      return { response: errorResponse({ requestId: convId, code: RESPONSE_ERRORS.INVALID_REQUEST, message: 'Sesi ini sudah dibatalkan.' }), conversationId: convId };
    }
    const l = limits();
    if (ic.turnCount >= l.maxTurns) {
      const next = appendTurn(ic, { answers: answers || {}, status: IC_STATUS.ERROR, collectedFields: ic.collectedFields, missingFields: ic.missingFields, requestId: convId }, clock());
      await store.append(next, actor.userId);
      return { response: errorResponse({ requestId: convId, code: RESPONSE_ERRORS.LIMIT, message: `Batas ${l.maxTurns} giliran tercapai. Mulai sesi baru.` }), conversationId: convId };
    }

    const merged = { ...ic.collectedFields };
    for (const [k, v] of Object.entries(answers || {})) {
      if (v !== undefined && v !== null && v !== '') merged[k] = v;
    }

    const run = runConversation(ic.openingUtterance, actor, merged);
    const now = clock();

    if (run.kind === 'error') {
      const next = appendTurn(ic, { answers, status: IC_STATUS.ERROR, collectedFields: merged, missingFields: [], requestId: convId }, now);
      await store.append(next, actor.userId);
      return { response: errorResponse({ requestId: convId, code: run.code, message: run.message }), conversationId: convId };
    }
    if (run.kind === 'active') {
      const questions = factQuestions(run.missing);
      const next = appendTurn(ic, { answers, status: IC_STATUS.NEEDS_INPUT, collectedFields: run.gatheredFacts, missingFields: run.missing.map((m) => m.field), requestId: convId }, now);
      await store.append(next, actor.userId);
      return {
        response: needsInputResponse({ requestId: convId, questions, provenance: provenanceFor(convId, actor, ic.sourceModule, null) }),
        conversationId: convId,
        audit: turnAudit({ requestId: convId, actorId: actor.userId, sourceModule: ic.sourceModule, status: 'needs_input', questionCount: questions.length, hasDraft: false }),
      };
    }
    return finishReady({ requestId: convId, actor, sourceModule: ic.sourceModule, domainType: ic.domainType || 'nor', convId, isNew: false, now, facts: run.gatheredFacts, norType: run.norType, prevIc: ic, answers, task: ic.task, sourceFeature: ic.sourceFeature, utterance: ic.openingUtterance });
  }

  /* READY → recipient gate → draft. Shared by handle() (first turn) and continueSession(). */
  async function finishReady({ requestId, actor, sourceModule, domainType, convId, isNew, now, facts, norType, prevIc = null, answers = {}, task, sourceFeature, utterance }) {
    // recipient gate — ASK, never invent (PART 8)
    const arch = retrieveRecentArchive({ domainType, memoryReader: ports.memoryReader });
    const patterns = summarizeRecipientPatterns(arch.ok ? arch.records : []);
    const recipient = resolveRecipient({ collectedFields: facts, recipientPatterns: patterns });

    if (recipient.status === 'ask') {
      const q = [recipientQuestion(recipient.options)];
      if (isNew) {
        const rec = makeIntelligenceConversation({
          convId, actorId: actor.userId, actorRole: actor.role, sourceModule, sourceFeature, task, domainType,
          openingUtterance: utterance, collectedFields: facts, missingFields: ['recipient'], status: IC_STATUS.NEEDS_INPUT, requestId, now,
        });
        await store.create(rec);
      } else {
        const next = appendTurn(prevIc, { answers, status: IC_STATUS.NEEDS_INPUT, collectedFields: facts, missingFields: ['recipient'], requestId }, now);
        await store.append(next, actor.userId);
      }
      return {
        response: needsInputResponse({ requestId, questions: q, provenance: provenanceFor(requestId, actor, sourceModule, null) }),
        conversationId: convId,
        audit: turnAudit({ requestId, actorId: actor.userId, sourceModule, status: 'needs_input', questionCount: 1, hasDraft: false }),
      };
    }

    const built = await buildDraftResponse({ requestId, actor, sourceModule, domainType, norType, facts, recipient });
    if (built && built.response && built.response.status === 'error') {
      return { response: built.response, conversationId: convId };
    }

    // persist DRAFTED state
    const base = isNew
      ? makeIntelligenceConversation({
          convId, actorId: actor.userId, actorRole: actor.role, sourceModule, sourceFeature, task, domainType,
          openingUtterance: utterance, collectedFields: facts, missingFields: [], status: IC_STATUS.READY, requestId, now,
        })
      : prevIc;
    const drafted = isNew
      ? appendTurn(base, { answers: {}, status: IC_STATUS.DRAFTED, collectedFields: facts, missingFields: [], draft: built.draft, numbering: built.numbering, knowledgeRefs: built.knowledgeRefs, memoryRefs: built.memoryRefs, requestId }, now)
      : appendTurn(prevIc, { answers, status: IC_STATUS.DRAFTED, collectedFields: facts, missingFields: [], draft: built.draft, numbering: built.numbering, knowledgeRefs: built.knowledgeRefs, memoryRefs: built.memoryRefs, requestId }, now);
    if (isNew) await store.create(base);
    await store.append(drafted, actor.userId);

    return {
      response: built.response,
      conversationId: convId,
      numbering: built.numbering,
      modelError: built.modelError || null,
      audit: turnAudit({ requestId, actorId: actor.userId, sourceModule, status: 'requires_review', questionCount: 0, hasDraft: true }),
    };
  }

  async function getSession(convId, actorArg) {
    const actor = actorArg ? { userId: actorArg.userId } : null;
    const got = await store.get(convId, actor && actor.userId);
    if (!got.ok) return { ok: false, error: got.error };
    return { ok: true, conversation: got.data };
  }

  async function cancelSession(convId, actorArg) {
    const actor = actorArg ? { userId: actorArg.userId, role: actorArg.role } : null;
    const got = await store.get(convId, actor && actor.userId);
    if (!got.ok) return { ok: false, error: got.error };
    const ic = got.data;
    if (ic.status === IC_STATUS.CANCELLED) return { ok: true, conversation: ic };
    const next = appendTurn(ic, { answers: {}, status: IC_STATUS.CANCELLED, collectedFields: ic.collectedFields, missingFields: ic.missingFields, requestId: convId }, clock());
    const saved = await store.append(next, actor.userId);
    return saved.ok ? { ok: true, conversation: saved.data } : { ok: false, error: saved.error };
  }

  return Object.freeze({ handle, continueSession, getSession, cancelSession });
}

export { defaultConfig };
