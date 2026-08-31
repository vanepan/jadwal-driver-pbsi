/* ============================================================
   OPENAI-PROVIDER.JS — Sarpras Intelligence (V2, Phase 1)

   PURPOSE: the client-safe OpenAI provider. It satisfies the Phase 0
   provider contract and adds the Phase 1 `complete()` capability — but it
   NEVER calls a model API itself. It builds a ModelCompletionRequest and
   hands it to an INJECTED `callModel` port. In production that port is the
   authenticated Cloud Function boundary (js/firebase.js#callGenerateCompletion);
   in tests it is a fake. No API key, no endpoint, no OpenAI SDK anywhere
   in this file — it is safe to ship to the browser.

       Intelligence Service
             │  provider.complete(ModelCompletionRequest)
             ▼
       openai-provider  ──callModel(req)──▶  Cloud Function (holds the key)  ──▶  OpenAI API
             ◀──────────  ModelCompletionResult  ──────────────────────────────────┘

   RESPONSIBILITY: createOpenAiProvider({ callModel, config }) → a frozen
   provider object { id:'openai', version, kind:'remote', description,
   generate(), complete() }.

   DEPENDENCIES: intelligence/contracts/provider-contract.js,
   intelligence/providers/model-completion-contract.js.

   NON-GOALS: no network call, no secret, no prompt authoring (the
   Intelligence Service builds the messages). `generate(IntelligenceRequest)`
   is NOT the Phase 1 entry point — the service composes responses from
   `complete()` — so it returns a typed pointer, never a real generation.
   ============================================================ */

'use strict';

import { PROVIDER_KIND, PROVIDER_ERRORS, providerFailure } from '../contracts/provider-contract.js';
import {
  MODEL_COMPLETION_ERRORS,
  isModelCompletionRequest,
  isModelCompletionResult,
  modelCompletionError,
} from './model-completion-contract.js';

export const OPENAI_PROVIDER_ID = 'openai';
export const OPENAI_PROVIDER_VERSION = 'intelligence-openai-provider@1';

/**
 * @param {Object} opts
 * @param {(req: import('./model-completion-contract.js').ModelCompletionRequest) => Promise<import('./model-completion-contract.js').ModelCompletionResult>} opts.callModel
 *   The ONLY link to a real model — an authenticated server call. Required.
 * @param {{maxPromptChars?: number}} [opts.config]
 * @returns {Object} a frozen provider satisfying the provider contract + complete()
 */
export function createOpenAiProvider({ callModel, config = {} } = {}) {
  const maxPromptChars = Number(config.maxPromptChars) > 0 ? Math.floor(Number(config.maxPromptChars)) : 24000;

  return Object.freeze({
    id: OPENAI_PROVIDER_ID,
    version: OPENAI_PROVIDER_VERSION,
    kind: PROVIDER_KIND.REMOTE,
    description: 'OpenAI provider. Delegates every model call to the authenticated Sarpras backend; holds no credential.',

    /**
     * Not the Phase 1 entry point. The Intelligence Service composes an
     * IntelligenceResponse from `complete()` calls — it does not ask a
     * provider to do the whole orchestration. Returns a typed pointer so a
     * mis-wired caller fails loudly and safely.
     */
    generate(_request) {
      return providerFailure(
        PROVIDER_ERRORS.PROVIDER_ERROR,
        'openai-provider.generate() is not the Phase 1 entry point — use the Intelligence Service, which calls provider.complete().',
        { providerId: OPENAI_PROVIDER_ID, modelVersion: OPENAI_PROVIDER_VERSION },
      );
    },

    /**
     * The low-level capability the Intelligence Service uses. Validates the
     * request, enforces the prompt-size ceiling, delegates to `callModel`,
     * and guarantees a well-formed ModelCompletionResult back (never throws).
     * @param {import('./model-completion-contract.js').ModelCompletionRequest} req
     * @returns {Promise<import('./model-completion-contract.js').ModelCompletionResult>}
     */
    async complete(req) {
      if (typeof callModel !== 'function') {
        return modelCompletionError(MODEL_COMPLETION_ERRORS.NOT_CONFIGURED, 'openai-provider: no callModel port was injected.');
      }
      if (!isModelCompletionRequest(req)) {
        return modelCompletionError(MODEL_COMPLETION_ERRORS.INVALID_REQUEST, 'openai-provider: malformed ModelCompletionRequest.');
      }
      const totalChars = req.messages.reduce((n, m) => n + m.content.length, 0);
      if (totalChars > maxPromptChars) {
        return modelCompletionError(
          MODEL_COMPLETION_ERRORS.INVALID_REQUEST,
          `openai-provider: prompt is ${totalChars} chars, over the ${maxPromptChars} ceiling.`,
        );
      }
      let result;
      try {
        result = await callModel(req);
      } catch (err) {
        // A transport that throws (network, aborted) is normalised, never propagated.
        return modelCompletionError(MODEL_COMPLETION_ERRORS.NETWORK, `openai-provider: model call failed (${err && err.message ? err.message : 'unknown'}).`);
      }
      if (!isModelCompletionResult(result)) {
        return modelCompletionError(MODEL_COMPLETION_ERRORS.INVALID_OUTPUT, 'openai-provider: model boundary returned a malformed result.');
      }
      return result;
    },
  });
}
