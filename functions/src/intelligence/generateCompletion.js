'use strict';

/* ============================================================
   functions/src/intelligence/generateCompletion.js — Phase 1

   The THIN OpenAI server boundary (PART 3, PART 5). Its ONLY jobs:
     1. authenticate the caller (Firebase Auth context)
     2. authorize (admin pilot — serverPermissions.js)
     3. check the feature flag (config.js — live /feature_flags/intelligence)
     4. validate the ModelCompletionRequest envelope + enforce prompt bounds
     5. read the OPENAI_API_KEY from Secret Manager
     6. call OpenAI (openaiClient.js — raw fetch, one timeout, no retry)
     7. return a ModelCompletionResult, logging METADATA ONLY

   It does NO orchestration, NO knowledge retrieval, NO NOR logic — that all
   lives in the reusable ESM src/intelligence/ layer. The browser never sees
   the key; a provider error never leaks provider internals or the key.

   NOT WIRED INTO functions/index.js in Phase 1 (staged, like telegramProxy
   was). Wiring it — and deploying the /intelligence_conversations rules —
   are explicit steps in a later phase, AFTER `firebase functions:secrets:set
   OPENAI_API_KEY`. Until then this file is inert.
   ============================================================ */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
const { REGION } = require('../config/constants');
const { OPENAI_API_KEY } = require('../config/secrets');
const { canUseIntelligence } = require('./serverPermissions');
const { getIntelligenceRuntimeConfig } = require('./config');
const { callChatCompletion } = require('./openaiClient');
const {
  isModelCompletionRequest, modelCompletionError, MODEL_COMPLETION_ERRORS,
} = require('./model-completion-contract');

const generateCompletion = onCall({ region: REGION, secrets: [OPENAI_API_KEY] }, async (request) => {
  const auth = request.auth;
  if (!auth || !auth.uid) {
    throw new HttpsError('unauthenticated', 'Login diperlukan.');
  }
  // WHO: Sarpras Intelligence is a capability of the ADMIN role
  // (role === 'admin' || adminEquivalent) — verified token claim only,
  // never the client's isV2Enabled(). The feature flag (WHAT/WHEN) is
  // checked separately below and still blocks model execution when OFF.
  const gate = canUseIntelligence(auth.token);
  if (!gate.ok) {
    throw new HttpsError('permission-denied', gate.reason || 'Tidak berhak menggunakan Sarpras Intelligence.');
  }

  const payload = (request.data && typeof request.data === 'object' && request.data.completion) || request.data || {};
  const requestId = typeof payload.requestId === 'string' ? payload.requestId : null;

  if (!isModelCompletionRequest(payload)) {
    throw new HttpsError('invalid-argument', 'Envelope ModelCompletionRequest tidak valid.');
  }

  const cfg = await getIntelligenceRuntimeConfig();
  if (!cfg.enabled) {
    return modelCompletionError(MODEL_COMPLETION_ERRORS.DISABLED, 'Sarpras Intelligence dinonaktifkan.');
  }

  const totalChars = payload.messages.reduce((n, m) => n + m.content.length, 0);
  if (totalChars > cfg.maxPromptChars) {
    return modelCompletionError(MODEL_COMPLETION_ERRORS.INVALID_REQUEST, `Prompt ${totalChars} karakter melebihi batas ${cfg.maxPromptChars}.`);
  }

  const apiKey = OPENAI_API_KEY.value();
  if (!apiKey) {
    logger.warn('[intelligence/generateCompletion] enabled but OPENAI_API_KEY is not set', { actor: auth.uid });
    return modelCompletionError(MODEL_COMPLETION_ERRORS.NOT_CONFIGURED, 'Kredensial penyedia AI belum dikonfigurasi di server.');
  }

  const model = payload.model || cfg.model;
  const result = await callChatCompletion({
    apiKey,
    model,
    messages: payload.messages,
    determinism: payload.determinism,
    maxOutputTokens: payload.maxOutputTokens || cfg.maxOutputTokens,
    timeoutMs: cfg.requestTimeoutMs,
  });

  // METADATA ONLY — never the key, never the prompt or completion text.
  logger.info('[intelligence/generateCompletion]', {
    requestId,
    purpose: payload.purpose,
    model,
    ok: result.ok,
    errorCode: result.ok ? null : (result.error && result.error.code),
    inputTokens: result.usage && result.usage.inputTokens,
    outputTokens: result.usage && result.usage.outputTokens,
    durationMs: result.durationMs,
    actor: auth.uid,
  });

  return result;
});

module.exports = { generateCompletion };
