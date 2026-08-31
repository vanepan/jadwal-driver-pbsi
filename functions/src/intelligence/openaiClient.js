'use strict';

/* ============================================================
   functions/src/intelligence/openaiClient.js — Phase 1

   The ONLY place a real model API is touched. Raw `fetch` (Node 20 global)
   — no `openai` SDK dependency, so functions/package.json stays minimal and
   every byte sent/received is visible here. Mirrors the "raw HTTP + retry"
   shape of functions/src/telegram/proxyEndpoint.js.

   callChatCompletion() NEVER throws: a network error, an abort/timeout, an
   HTTP error, or a malformed body all come back as a normalised
   ModelCompletionResult error. The API key is passed in as an argument
   (from Secret Manager, by the callable) and is NEVER logged.

   Defensive (PART 13): a single AbortController timeout, NO retry in
   Phase 1 (a 429/503 is surfaced as QUOTA/PROVIDER_ERROR for the caller to
   handle), no streaming, no unbounded reads.
   ============================================================ */

const { modelCompletionResult, modelCompletionError, MODEL_COMPLETION_ERRORS } = require('./model-completion-contract');

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

/** Map an OpenAI/HTTP failure to a typed code — never leak provider internals. */
function classify(status) {
  if (status === 401 || status === 403) return MODEL_COMPLETION_ERRORS.AUTH;
  if (status === 429) return MODEL_COMPLETION_ERRORS.QUOTA;
  if (status >= 500) return MODEL_COMPLETION_ERRORS.PROVIDER_ERROR;
  return MODEL_COMPLETION_ERRORS.PROVIDER_ERROR;
}

/**
 * @param {Object} args
 * @param {string} args.apiKey        from Secret Manager — never logged
 * @param {string} args.model
 * @param {{role:string,content:string}[]} args.messages
 * @param {number} args.determinism   0..1 (1 = most deterministic) → mapped to temperature
 * @param {number|null} args.maxOutputTokens
 * @param {number} args.timeoutMs
 * @param {typeof fetch} [args.fetchImpl]  injectable for tests
 * @returns {Promise<object>}  a ModelCompletionResult
 */
async function callChatCompletion({ apiKey, model, messages, determinism = 0.7, maxOutputTokens = null, timeoutMs = 30000, fetchImpl }) {
  const doFetch = typeof fetchImpl === 'function' ? fetchImpl : (typeof fetch === 'function' ? fetch : null);
  if (!doFetch) {
    return modelCompletionError(MODEL_COMPLETION_ERRORS.NETWORK, 'No fetch implementation available in this runtime.');
  }
  if (!apiKey) {
    return modelCompletionError(MODEL_COMPLETION_ERRORS.NOT_CONFIGURED, 'OpenAI credential is not configured on the server.');
  }

  const temperature = Math.max(0, Math.min(2, (1 - Math.max(0, Math.min(1, Number(determinism)))) * 2));
  const body = {
    model,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    temperature,
  };
  if (Number.isFinite(Number(maxOutputTokens)) && Number(maxOutputTokens) > 0) {
    body.max_tokens = Math.floor(Number(maxOutputTokens));
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1000, Number(timeoutMs) || 30000));
  const startedAt = Date.now();
  let res;
  try {
    res = await doFetch(OPENAI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    const durationMs = Date.now() - startedAt;
    if (err && (err.name === 'AbortError' || /abort/i.test(String(err.message)))) {
      return modelCompletionError(MODEL_COMPLETION_ERRORS.TIMEOUT, `OpenAI request timed out after ${timeoutMs}ms.`, { durationMs });
    }
    return modelCompletionError(MODEL_COMPLETION_ERRORS.NETWORK, 'OpenAI request failed at the network layer.', { durationMs });
  }
  clearTimeout(timer);
  const durationMs = Date.now() - startedAt;

  let json;
  try {
    json = await res.json();
  } catch {
    return modelCompletionError(MODEL_COMPLETION_ERRORS.INVALID_OUTPUT, 'OpenAI response body was not valid JSON.', { durationMs });
  }

  if (!res.ok) {
    // Do NOT echo json.error verbatim — a generic, typed message only.
    return modelCompletionError(classify(res.status), `OpenAI returned HTTP ${res.status}.`, { durationMs });
  }

  const text = json && json.choices && json.choices[0] && json.choices[0].message && typeof json.choices[0].message.content === 'string'
    ? json.choices[0].message.content
    : null;
  if (typeof text !== 'string' || !text.trim()) {
    return modelCompletionError(MODEL_COMPLETION_ERRORS.INVALID_OUTPUT, 'OpenAI response contained no usable completion text.', { durationMs });
  }

  const usage = json.usage || {};
  return modelCompletionResult({
    text,
    usage: { inputTokens: usage.prompt_tokens ?? null, outputTokens: usage.completion_tokens ?? null },
    model: json.model || model,
    durationMs,
  });
}

module.exports = { callChatCompletion, OPENAI_URL };
