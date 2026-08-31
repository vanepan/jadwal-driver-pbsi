/* ============================================================
   NULL-PROVIDER.JS — Sarpras Intelligence Foundation (V2, Phase 0)

   PURPOSE: the default, inert AI provider. It exists so the provider
   registry is never empty and every caller gets a predictable, typed
   `NOT_IMPLEMENTED` result instead of a crash — exactly the role
   js/prediction/python-provider.js plays for the Prediction layer today.

   RESPONSIBILITY: satisfy the provider contract
   (intelligence/contracts/provider-contract.js) and return
   providerFailure(NOT_IMPLEMENTED) from generate().

   DEPENDENCIES: intelligence/contracts/provider-contract.js.

   NON-GOALS: PURE — no network, no timers, no randomness, no Firebase, no
   DOM. Contains no endpoint, no credential, no provider SDK. It is safe to
   ship to the browser precisely because it does nothing.

   FUTURE EVOLUTION: a real provider file (server-backed) registers
   alongside this one and is made active via setActiveProvider(); this file
   is never deleted — it stays the safe fallback and the thing tests reset
   the registry to.

   PHASE 1 NOTE: `complete()` was added — the low-level "given a
   ModelCompletionRequest, return a ModelCompletionResult" capability the
   Intelligence Service actually uses. The Null Provider's `complete()`
   returns a typed DISABLED result, so a service running with no real
   provider degrades to deterministic-only responses (no model call, no
   crash). `generate()` is unchanged.
   ============================================================ */

'use strict';

import { PROVIDER_KIND, PROVIDER_ERRORS, providerFailure } from '../contracts/provider-contract.js';
import { MODEL_COMPLETION_ERRORS, modelCompletionError } from './model-completion-contract.js';

export const NULL_PROVIDER_ID = 'null';
export const NULL_PROVIDER_VERSION = 'intelligence-null-provider@1';

/** @type {import('../contracts/provider-contract.js').*} */
export const nullProvider = Object.freeze({
  id: NULL_PROVIDER_ID,
  version: NULL_PROVIDER_VERSION,
  kind: PROVIDER_KIND.INERT,
  description: 'Inert default provider. No model, no network, no secret. Always returns NOT_IMPLEMENTED / DISABLED.',
  /**
   * @param {import('../contracts/intelligence-request-contract.js').IntelligenceRequest} _request
   * @returns {import('../contracts/provider-contract.js').ProviderResult}
   */
  generate(_request) {
    return providerFailure(
      PROVIDER_ERRORS.NOT_IMPLEMENTED,
      'No Sarpras Intelligence provider is implemented in Phase 0. Enable and register a server-backed provider in a later phase.',
      { providerId: NULL_PROVIDER_ID, modelVersion: null },
    );
  },
  /**
   * Phase 1 low-level capability. The inert provider never calls a model.
   * @param {import('./model-completion-contract.js').ModelCompletionRequest} _req
   * @returns {Promise<import('./model-completion-contract.js').ModelCompletionResult>}
   */
  async complete(_req) {
    return modelCompletionError(
      MODEL_COMPLETION_ERRORS.DISABLED,
      'No model provider is active. Sarpras Intelligence is running in deterministic-only mode.',
    );
  },
});
