/* ============================================================
   USAGE-CONTRACT.JS — Sarpras Intelligence Foundation (V2, Phase 0)

   PURPOSE: fix the shape of a per-request usage/cost record (PART 18). This
   is an OPERATIONAL OBSERVABILITY layer, not a billing system — it must
   never block a feature when a provider returns no token or cost numbers.

   RESPONSIBILITY: define UsageRecord and a tolerant constructor.

   DEPENDENCIES: none.

   NON-GOALS: does not compute cost, does not persist, does not aggregate.
   All quantitative fields are optional and default to null; only
   `requestId` and `success` are required.

   FUTURE EVOLUTION: the server-side provider boundary emits one UsageRecord
   per call into whichever sink is chosen later (the existing server event
   outbox, a dedicated node, or logs) — this contract does not care which.
   ============================================================ */

'use strict';

export const USAGE_RECORD_SCHEMA = 'intelligence-usage-record@1';

export const USAGE_RECORD_FIELDS = Object.freeze([
  'schema', 'requestId', 'provider', 'model', 'inputTokens', 'outputTokens',
  'estimatedCost', 'durationMs', 'success', 'errorCode', 'userId', 'sourceModule', 'at',
]);

/**
 * @typedef {Object} UsageRecord
 * @property {string} schema
 * @property {string} requestId
 * @property {string|null} provider       - provider id (see provider-registry.js), or null
 * @property {string|null} model
 * @property {number|null} inputTokens    - null when the provider did not report it
 * @property {number|null} outputTokens
 * @property {number|null} estimatedCost  - platform-side estimate; null when not computable
 * @property {number|null} durationMs
 * @property {boolean} success
 * @property {string|null} errorCode      - a provider-contract error code when success === false
 * @property {string|null} userId
 * @property {string|null} sourceModule
 * @property {string|null} at             - ISO 8601
 */

function numOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {Object} u
 * @returns {UsageRecord}
 */
export function makeUsageRecord({
  requestId,
  provider = null,
  model = null,
  inputTokens = null,
  outputTokens = null,
  estimatedCost = null,
  durationMs = null,
  success = false,
  errorCode = null,
  userId = null,
  sourceModule = null,
  at = null,
} = {}) {
  return Object.freeze({
    schema: USAGE_RECORD_SCHEMA,
    requestId: requestId || null,
    provider,
    model,
    inputTokens: numOrNull(inputTokens),
    outputTokens: numOrNull(outputTokens),
    estimatedCost: numOrNull(estimatedCost),
    durationMs: numOrNull(durationMs),
    success: success === true,
    errorCode: errorCode || null,
    userId,
    sourceModule,
    at,
  });
}

/** Structural check — `requestId` non-empty, `success` a boolean, shape complete. */
export function isUsageRecord(u) {
  if (!u || typeof u !== 'object') return false;
  if (u.schema !== USAGE_RECORD_SCHEMA) return false;
  if (typeof u.requestId !== 'string' || !u.requestId) return false;
  if (typeof u.success !== 'boolean') return false;
  return USAGE_RECORD_FIELDS.every((f) => f in u);
}
