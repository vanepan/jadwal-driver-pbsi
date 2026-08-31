/* ============================================================
   MODEL-COMPLETION-CONTRACT.JS — Sarpras Intelligence (V2, Phase 1)

   PURPOSE: the ONE small envelope that crosses the browser ↔ server
   boundary. The ESM Intelligence layer builds a ModelCompletionRequest and
   hands it to a provider; a server-backed provider forwards it, verbatim,
   to the Cloud Function boundary, which is the only place a real model API
   is ever touched. The function returns a ModelCompletionResult.

   This is DELIBERATELY tiny and provider-neutral — no model API parameter
   NAMES, no key, no endpoint. It is the single shape duplicated on the CJS
   side (functions/src/intelligence/model-completion-contract.js), kept
   byte-equivalent by scripts/intelligence-functions-check.cjs's drift test.

   RESPONSIBILITY: MODEL_COMPLETION_SCHEMA, MODEL_COMPLETION_ERRORS,
   makeModelCompletionRequest / isModelCompletionRequest,
   modelCompletionResult (ok) / modelCompletionError (fail), and
   isModelCompletionResult.

   DEPENDENCIES: none.

   NON-GOALS: does not call a model, does not know about OpenAI, does not
   define prompts. `messages` is a neutral role/content list; the server
   maps it to whatever the configured provider expects.
   ============================================================ */

'use strict';

export const MODEL_COMPLETION_SCHEMA = 'model-completion@1';

/** Closed set of failure codes a completion can carry (aligned with
 *  provider-contract.js PROVIDER_ERRORS). */
export const MODEL_COMPLETION_ERRORS = Object.freeze({
  DISABLED: 'DISABLED',
  NOT_CONFIGURED: 'NOT_CONFIGURED',   // enabled but no credential in the server environment
  AUTH: 'AUTH',
  QUOTA: 'QUOTA',
  TIMEOUT: 'TIMEOUT',
  NETWORK: 'NETWORK',
  PROVIDER_ERROR: 'PROVIDER_ERROR',
  INVALID_OUTPUT: 'INVALID_OUTPUT',
  INVALID_REQUEST: 'INVALID_REQUEST',
});

export const MESSAGE_ROLE = Object.freeze({ SYSTEM: 'system', USER: 'user', ASSISTANT: 'assistant' });

/**
 * @typedef {Object} ModelCompletionRequest
 * @property {string} schema
 * @property {string} requestId          - links to the IntelligenceRequest (audit)
 * @property {string} purpose            - neutral tag, e.g. 'nor.questions' | 'nor.draft' (for logging/limits)
 * @property {{role: string, content: string}[]} messages  - neutral chat turns; content is plain text
 * @property {boolean} expectJson        - whether the caller will JSON.parse the reply
 * @property {number|null} maxOutputTokens
 * @property {number} determinism        - 0..1 hint (1 = most deterministic); server maps to its own param
 */

function normMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter((m) => m && typeof m.content === 'string' && m.content.length > 0)
    .map((m) => Object.freeze({
      role: Object.values(MESSAGE_ROLE).includes(m.role) ? m.role : MESSAGE_ROLE.USER,
      content: m.content,
    }));
}

/**
 * @param {Object} r
 * @returns {ModelCompletionRequest}
 */
export function makeModelCompletionRequest({
  requestId,
  purpose = 'generic',
  messages = [],
  expectJson = false,
  maxOutputTokens = null,
  determinism = 0.7,
} = {}) {
  const d = Number(determinism);
  return Object.freeze({
    schema: MODEL_COMPLETION_SCHEMA,
    requestId: requestId || null,
    purpose: String(purpose || 'generic'),
    messages: Object.freeze(normMessages(messages)),
    expectJson: expectJson === true,
    maxOutputTokens: Number.isFinite(Number(maxOutputTokens)) && Number(maxOutputTokens) > 0 ? Math.floor(Number(maxOutputTokens)) : null,
    determinism: Number.isFinite(d) && d >= 0 && d <= 1 ? d : 0.7,
  });
}

/** Structural check — non-empty requestId, at least one message with content. */
export function isModelCompletionRequest(r) {
  if (!r || typeof r !== 'object') return false;
  if (r.schema !== MODEL_COMPLETION_SCHEMA) return false;
  if (typeof r.requestId !== 'string' || !r.requestId) return false;
  if (!Array.isArray(r.messages) || r.messages.length === 0) return false;
  return r.messages.every((m) => m && typeof m.content === 'string' && m.content.length > 0);
}

/**
 * @typedef {Object} ModelCompletionResult
 * @property {string} schema
 * @property {boolean} ok
 * @property {string|null} text          - the model's reply text (ok only)
 * @property {{inputTokens:number|null, outputTokens:number|null}} usage
 * @property {string|null} model         - the model id that actually served the request
 * @property {number|null} durationMs
 * @property {{code:string, message:string}|null} error
 */

export function modelCompletionResult({ text, usage = {}, model = null, durationMs = null } = {}) {
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

export function modelCompletionError(code, message, { durationMs = null } = {}) {
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

export function isModelCompletionResult(r) {
  if (!r || typeof r !== 'object' || r.schema !== MODEL_COMPLETION_SCHEMA) return false;
  if (typeof r.ok !== 'boolean') return false;
  return r.ok ? typeof r.text === 'string' : (!!r.error && typeof r.error.code === 'string');
}
