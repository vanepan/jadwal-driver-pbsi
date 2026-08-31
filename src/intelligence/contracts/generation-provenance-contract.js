/* ============================================================
   GENERATION-PROVENANCE-CONTRACT.JS — Sarpras Intelligence Foundation (V2, Phase 0)

   PURPOSE: fix the metadata that makes any AI output reproducible and
   auditable (PART 16) — enough to answer, later, "which model / which
   prompt version / which knowledge context / when / who / what".

   RESPONSIBILITY: define GenerationProvenance and a constructor. This is a
   record ABOUT a generation; it is attached to an IntelligenceResponse
   (see intelligence-response-contract.js) and referenced by audit events
   (see audit-contract.js).

   DEPENDENCIES: none.

   NON-GOALS: contains NO provider secret and no provider-specific request
   parameters — only the versioned identifiers needed for the audit trail.
   Does not itself persist anything.

   FUTURE EVOLUTION: a real provider fills `model` / `modelVersion` from the
   server-side call it made; `promptVersion` / `knowledgeVersion` come from
   whichever prompt template and Approved-Knowledge snapshot were used.
   ============================================================ */

'use strict';

export const GENERATION_PROVENANCE_SCHEMA = 'intelligence-generation-provenance@1';

export const GENERATION_PROVENANCE_FIELDS = Object.freeze([
  'schema', 'requestId', 'model', 'modelVersion', 'promptVersion',
  'knowledgeVersion', 'generatedAt', 'userId', 'sourceModule',
]);

/**
 * @typedef {Object} GenerationProvenance
 * @property {string} schema
 * @property {string} requestId        - links back to the IntelligenceRequest that produced this
 * @property {string|null} model             - provider-neutral model id (e.g. the value from intelligence-config.js), or null
 * @property {string|null} modelVersion      - the provider's own version string for that model, if known
 * @property {string|null} promptVersion     - version of the prompt/instruction template used
 * @property {string|null} knowledgeVersion  - identifier of the Approved-Knowledge snapshot used as context
 * @property {string|null} generatedAt       - ISO 8601 of the generation, or null
 * @property {string|null} userId
 * @property {string|null} sourceModule      - the app module that made the request (e.g. 'petty_cash', 'intelligence')
 */

/**
 * @param {Object} p
 * @returns {GenerationProvenance}
 */
export function makeGenerationProvenance({
  requestId,
  model = null,
  modelVersion = null,
  promptVersion = null,
  knowledgeVersion = null,
  generatedAt = null,
  userId = null,
  sourceModule = null,
} = {}) {
  return Object.freeze({
    schema: GENERATION_PROVENANCE_SCHEMA,
    requestId: requestId || null,
    model,
    modelVersion,
    promptVersion,
    knowledgeVersion,
    generatedAt,
    userId,
    sourceModule,
  });
}

/** Structural check — every field present, `requestId` non-empty. */
export function isGenerationProvenance(p) {
  if (!p || typeof p !== 'object') return false;
  if (p.schema !== GENERATION_PROVENANCE_SCHEMA) return false;
  if (typeof p.requestId !== 'string' || !p.requestId) return false;
  return GENERATION_PROVENANCE_FIELDS.every((f) => f in p);
}
