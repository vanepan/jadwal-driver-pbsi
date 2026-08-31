'use strict';

/* ============================================================
   functions/src/intelligence/model-completion-contract.js
   — CJS mirror of src/intelligence/providers/model-completion-contract.js

   The Cloud Functions runtime is CJS and self-contained; it cannot import
   the browser-ESM Phase 0/1 contracts. This is the ONE shape duplicated on
   the server side — deliberately tiny (an envelope, no logic beyond
   validation) and kept byte-equivalent to the ESM original by the drift
   test in scripts/intelligence-functions-check.cjs.

   If you change one, change the other, or the drift test fails.
   ============================================================ */

const MODEL_COMPLETION_SCHEMA = 'model-completion@1';

const MODEL_COMPLETION_ERRORS = Object.freeze({
  DISABLED: 'DISABLED',
  NOT_CONFIGURED: 'NOT_CONFIGURED',
  AUTH: 'AUTH',
  QUOTA: 'QUOTA',
  TIMEOUT: 'TIMEOUT',
  NETWORK: 'NETWORK',
  PROVIDER_ERROR: 'PROVIDER_ERROR',
  INVALID_OUTPUT: 'INVALID_OUTPUT',
  INVALID_REQUEST: 'INVALID_REQUEST',
});

const MESSAGE_ROLE = Object.freeze({ SYSTEM: 'system', USER: 'user', ASSISTANT: 'assistant' });

function isModelCompletionRequest(r) {
  if (!r || typeof r !== 'object') return false;
  if (r.schema !== MODEL_COMPLETION_SCHEMA) return false;
  if (typeof r.requestId !== 'string' || !r.requestId) return false;
  if (!Array.isArray(r.messages) || r.messages.length === 0) return false;
  return r.messages.every((m) => m && typeof m.content === 'string' && m.content.length > 0);
}

function modelCompletionResult({ text, usage = {}, model = null, durationMs = null } = {}) {
  return Object.freeze({
    schema: MODEL_COMPLETION_SCHEMA,
    ok: true,
    text: typeof text === 'string' ? text : null,
    usage: Object.freeze({
      inputTokens: Number.isFinite(Number(usage.inputTokens)) ? Number(usage.inputTokens) : null,
      outputTokens: Number.isFinite(Number(usage.outputTokens)) ? Number(usage.outputTokens) : null,
    }),
    model: model || null,
    durationMs: Number.isFinite(Number(durationMs)) ? Number(durationMs) : null,
    error: null,
  });
}

function modelCompletionError(code, message, { durationMs = null } = {}) {
  return Object.freeze({
    schema: MODEL_COMPLETION_SCHEMA,
    ok: false,
    text: null,
    usage: Object.freeze({ inputTokens: null, outputTokens: null }),
    model: null,
    durationMs: Number.isFinite(Number(durationMs)) ? Number(durationMs) : null,
    error: Object.freeze({ code: code || MODEL_COMPLETION_ERRORS.PROVIDER_ERROR, message: String(message || '') }),
  });
}

function isModelCompletionResult(r) {
  if (!r || typeof r !== 'object' || r.schema !== MODEL_COMPLETION_SCHEMA) return false;
  if (typeof r.ok !== 'boolean') return false;
  return r.ok ? typeof r.text === 'string' : (!!r.error && typeof r.error.code === 'string');
}

module.exports = {
  MODEL_COMPLETION_SCHEMA,
  MODEL_COMPLETION_ERRORS,
  MESSAGE_ROLE,
  isModelCompletionRequest,
  modelCompletionResult,
  modelCompletionError,
  isModelCompletionResult,
};
