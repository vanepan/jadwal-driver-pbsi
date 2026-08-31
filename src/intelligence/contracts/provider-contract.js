/* ============================================================
   PROVIDER-CONTRACT.JS — Sarpras Intelligence Foundation (V2, Phase 0)

   PURPOSE: fix the ONE interface between the Sarpras Intelligence layer and
   whatever actually produces an IntelligenceResponse (PART 4). Deliberately
   mirrors js/prediction/prediction-provider.js's contract shape (registry +
   never-throws + explicit success/failure result) so swapping the model
   behind the platform is a registry selection, not a caller-code change.

       Sarpras Intelligence layer
              │  (depends ONLY on this contract + provider-registry.js)
              ▼
       AI Provider  (id, version, kind, description, generate)
              │
        ┌─────┴──────────────┐
        ▼                    ▼
     Null Provider      Server-backed provider (FUTURE)
     (Phase 0 default)   → calls the authenticated Sarpras backend, which
      NOT_IMPLEMENTED      holds the OpenAI/other credential in Secret
                          Manager. The browser NEVER sees the secret.

   RESPONSIBILITY: define PROVIDER_KIND, PROVIDER_ERRORS, PROVIDER_CONTRACT
   (as data), the ProviderResult builders `providerSuccess` /
   `providerFailure`, and `isIntelligenceProvider`.

   DEPENDENCIES: none (kept import-free like prediction-provider.js's
   contract half, so a provider file and a test share one source of truth).

   NON-GOALS: registers nothing (see provider-registry.js), implements no
   provider (see providers/null-provider.js), and — critically — contains
   no endpoint URL, no API key, no provider SDK import. A provider that
   talks to a model does so via the server boundary only.

   FUTURE EVOLUTION: a real provider file implements `generate(request)`,
   returning a ProviderResult whose `response` is an IntelligenceResponse
   (see intelligence-response-contract.js). It never throws to the caller.
   ============================================================ */

'use strict';

export const PROVIDER_SCHEMA = 'intelligence-provider@1';

/** Informational classification of a provider (never a gate). */
export const PROVIDER_KIND = Object.freeze({
  INERT: 'inert',     // does nothing real (the Null Provider)
  REMOTE: 'remote',   // reaches an external model via the server boundary
  LOCAL: 'local',     // an on-device / self-hosted model, also via a server boundary
});

/** Closed set of provider error codes carried in a failed ProviderResult. */
export const PROVIDER_ERRORS = Object.freeze({
  NOT_IMPLEMENTED: 'NOT_IMPLEMENTED', // provider is a stub / not wired up
  DISABLED: 'DISABLED',               // intelligence.enabled === false
  DATA_NOT_SENDABLE: 'DATA_NOT_SENDABLE', // request carried RESTRICTED-classified data (PART 20)
  NETWORK: 'NETWORK',
  TIMEOUT: 'TIMEOUT',
  AUTH: 'AUTH',                       // server rejected the caller, or provider rejected the server credential
  QUOTA: 'QUOTA',
  PROVIDER_ERROR: 'PROVIDER_ERROR',   // the model/backend returned an error
  INVALID_OUTPUT: 'INVALID_OUTPUT',   // a reply came back but not in a usable shape
  GENERATE_FAILED: 'GENERATE_FAILED', // the provider implementation itself threw and was captured
});

/** Registry-level error codes — thrown for programmer errors, never during generate(). */
export const REGISTRY_ERRORS = Object.freeze({
  INVALID_PROVIDER: 'INVALID_PROVIDER',
  UNKNOWN_PROVIDER: 'UNKNOWN_PROVIDER',
});

/** The contract, as data, so tests and future providers have one source of truth. */
export const PROVIDER_CONTRACT = Object.freeze({
  schema: PROVIDER_SCHEMA,
  provider: Object.freeze(['id', 'version', 'kind', 'description', 'generate']),
  result: Object.freeze(['ok', 'response', 'error', 'providerId', 'modelVersion']),
  errorCodes: PROVIDER_ERRORS,
});

/**
 * @typedef {Object} ProviderResult
 * @property {boolean} ok
 * @property {import('./intelligence-response-contract.js').IntelligenceResponse|null} response
 * @property {{code: string, message: string}|null} error
 * @property {string|null} providerId
 * @property {string|null} modelVersion
 */

/** A successful generate(). `response` is an IntelligenceResponse. */
export function providerSuccess(response, { providerId = null, modelVersion = null } = {}) {
  return Object.freeze({
    ok: true,
    response: response ?? null,
    error: null,
    providerId,
    modelVersion,
  });
}

/** A predictable generate() failure. Providers return this instead of throwing. */
export function providerFailure(code, message, { providerId = null, modelVersion = null } = {}) {
  return Object.freeze({
    ok: false,
    response: null,
    error: Object.freeze({ code: code || PROVIDER_ERRORS.PROVIDER_ERROR, message: String(message || '') }),
    providerId,
    modelVersion,
  });
}

/** Structural check that an object satisfies the provider contract. */
export function isIntelligenceProvider(p) {
  return !!p
    && typeof p === 'object'
    && typeof p.id === 'string' && p.id.length > 0
    && typeof p.version === 'string' && p.version.length > 0
    && typeof p.generate === 'function';
}
