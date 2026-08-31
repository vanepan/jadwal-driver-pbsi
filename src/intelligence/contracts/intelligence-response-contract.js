/* ============================================================
   INTELLIGENCE-RESPONSE-CONTRACT.JS — Sarpras Intelligence Foundation (V2, Phase 0)

   PURPOSE: fix the ONE shape the Sarpras Intelligence layer returns to the
   application (PART 7). A future conversational UI consumes exactly this —
   no UI is built here.

   The five states an intelligence response can represent:
     completed        — the layer has enough information and finished
     needs_input      — more information is required from the user (questions)
     draft            — a draft was produced (NOT the final official document)
     requires_review  — output was produced but a human MUST approve before use
     error            — the request could not be completed

   RESPONSIBILITY: define RESPONSE_STATUS, RESPONSE_ERRORS, the
   IntelligenceResponse shape, one constructor per status, and
   `isIntelligenceResponse`.

   DEPENDENCIES: intelligence/contracts/generation-provenance-contract.js
   (the `provenance` block — PART 16).

   NON-GOALS: does not render, does not decide whether review is required
   (the caller/provider does), does not persist. A `draft` here is never
   automatically the final document — see the draft → review → publish
   lifecycle in docs/V2_SARPRAS_INTELLIGENCE_ARCHITECTURE.md §8.

   FUTURE EVOLUTION: a real provider returns one of these from every
   generate() call; the NOR editing surface reads a `draft`/`requires_review`
   response's `draft.fields` into an editable preview, never treating it as
   published.
   ============================================================ */

'use strict';

import { isGenerationProvenance } from './generation-provenance-contract.js';

export const INTELLIGENCE_RESPONSE_SCHEMA = 'intelligence-response@1';

export const RESPONSE_STATUS = Object.freeze({
  COMPLETED: 'completed',
  NEEDS_INPUT: 'needs_input',
  DRAFT: 'draft',
  REQUIRES_REVIEW: 'requires_review',
  ERROR: 'error',
});

export const RESPONSE_STATUS_LIST = Object.freeze(Object.values(RESPONSE_STATUS));

/** Closed set of response-level error codes (aligned with provider-contract.js). */
export const RESPONSE_ERRORS = Object.freeze({
  DISABLED: 'DISABLED',               // intelligence.enabled === false
  NOT_IMPLEMENTED: 'NOT_IMPLEMENTED', // no real provider wired (Phase 0 default)
  NETWORK: 'NETWORK',
  TIMEOUT: 'TIMEOUT',
  AUTH: 'AUTH',
  QUOTA: 'QUOTA',
  PROVIDER_ERROR: 'PROVIDER_ERROR',
  INVALID_OUTPUT: 'INVALID_OUTPUT',  // provider replied but not in a usable shape
  DATA_NOT_SENDABLE: 'DATA_NOT_SENDABLE', // request carried RESTRICTED data (PART 20)
});

/**
 * @typedef {Object} IntelligenceQuestion
 * @property {string} id
 * @property {string} prompt     - the question shown to the user (app language)
 * @property {string|null} why   - why the layer needs this to proceed
 * @property {boolean} required
 */

/**
 * @typedef {Object} IntelligenceDraft
 * @property {string} documentType        - e.g. 'nor'
 * @property {Object} fields              - editable fields, shaped for the EXISTING view-model builder, not redefined here
 * @property {string|null} rendersVia     - documentation pointer to the existing renderer (e.g. 'js/petty-cash/nor-document-engine.js#buildNorViewModel')
 * @property {string|null} summary
 */

/**
 * @typedef {Object} IntelligenceResponse
 * @property {string} schema
 * @property {string} requestId
 * @property {string} status              - RESPONSE_STATUS.*
 * @property {string} producedAt          - ISO 8601
 * @property {*} content                  - COMPLETED: the finished result (app-shaped); else null
 * @property {IntelligenceQuestion[]} questions      - NEEDS_INPUT; else []
 * @property {IntelligenceDraft|null} draft          - DRAFT / REQUIRES_REVIEW; else null
 * @property {{reason: string, blocking: boolean}|null} review  - REQUIRES_REVIEW; else null
 * @property {{code: string, message: string}|null} error       - ERROR; else null
 * @property {import('./generation-provenance-contract.js').GenerationProvenance|null} provenance  - present whenever a model actually ran
 * @property {string|null} usageRef       - id/pointer to a UsageRecord (usage-contract.js), if one was emitted
 */

const _base = (requestId, status, producedAt, provenance, usageRef) => ({
  schema: INTELLIGENCE_RESPONSE_SCHEMA,
  requestId: requestId || null,
  status,
  producedAt: producedAt || new Date().toISOString(),
  content: null,
  questions: Object.freeze([]),
  draft: null,
  review: null,
  error: null,
  provenance: provenance && isGenerationProvenance(provenance) ? provenance : null,
  usageRef: usageRef || null,
});

/** COMPLETED — the layer finished and has a result. */
export function completedResponse({ requestId, content, provenance = null, usageRef = null, producedAt } = {}) {
  return Object.freeze({ ..._base(requestId, RESPONSE_STATUS.COMPLETED, producedAt, provenance, usageRef), content: content ?? null });
}

/** NEEDS_INPUT — the layer needs the user to answer questions first. */
export function needsInputResponse({ requestId, questions = [], provenance = null, usageRef = null, producedAt } = {}) {
  const norm = (Array.isArray(questions) ? questions : []).map((q, i) => Object.freeze({
    id: q.id || `q${i + 1}`,
    prompt: typeof q.prompt === 'string' ? q.prompt : String(q || ''),
    why: typeof q.why === 'string' ? q.why : null,
    required: q.required !== false,
  }));
  return Object.freeze({ ..._base(requestId, RESPONSE_STATUS.NEEDS_INPUT, producedAt, provenance, usageRef), questions: Object.freeze(norm) });
}

/** DRAFT — a draft was produced; it is NOT the final official document. */
export function draftResponse({ requestId, draft, provenance = null, usageRef = null, producedAt } = {}) {
  const d = draft && typeof draft === 'object' ? Object.freeze({
    documentType: draft.documentType || null,
    fields: draft.fields && typeof draft.fields === 'object' ? draft.fields : {},
    rendersVia: draft.rendersVia || null,
    summary: typeof draft.summary === 'string' ? draft.summary : null,
  }) : null;
  return Object.freeze({ ..._base(requestId, RESPONSE_STATUS.DRAFT, producedAt, provenance, usageRef), draft: d });
}

/** REQUIRES_REVIEW — output exists but a human must approve it before any use. */
export function requiresReviewResponse({ requestId, draft = null, reason = 'Human approval required.', blocking = true, provenance = null, usageRef = null, producedAt } = {}) {
  const d = draft && typeof draft === 'object' ? Object.freeze({
    documentType: draft.documentType || null,
    fields: draft.fields && typeof draft.fields === 'object' ? draft.fields : {},
    rendersVia: draft.rendersVia || null,
    summary: typeof draft.summary === 'string' ? draft.summary : null,
  }) : null;
  return Object.freeze({
    ..._base(requestId, RESPONSE_STATUS.REQUIRES_REVIEW, producedAt, provenance, usageRef),
    draft: d,
    review: Object.freeze({ reason: String(reason || ''), blocking: blocking !== false }),
  });
}

/** ERROR — the request could not be completed. `code` is a RESPONSE_ERRORS value. */
export function errorResponse({ requestId, code = RESPONSE_ERRORS.PROVIDER_ERROR, message = '', provenance = null, usageRef = null, producedAt } = {}) {
  return Object.freeze({
    ..._base(requestId, RESPONSE_STATUS.ERROR, producedAt, provenance, usageRef),
    error: Object.freeze({ code: code || RESPONSE_ERRORS.PROVIDER_ERROR, message: String(message || '') }),
  });
}

/** Structural check — known status, non-empty requestId, and the state-specific
 *  field populated correctly for that status. */
export function isIntelligenceResponse(r) {
  if (!r || typeof r !== 'object') return false;
  if (r.schema !== INTELLIGENCE_RESPONSE_SCHEMA) return false;
  if (!RESPONSE_STATUS_LIST.includes(r.status)) return false;
  if (typeof r.requestId !== 'string' || !r.requestId) return false;
  switch (r.status) {
    case RESPONSE_STATUS.NEEDS_INPUT: return Array.isArray(r.questions) && r.questions.length > 0;
    case RESPONSE_STATUS.DRAFT: return !!r.draft && typeof r.draft === 'object';
    case RESPONSE_STATUS.REQUIRES_REVIEW: return !!r.review && typeof r.review === 'object';
    case RESPONSE_STATUS.ERROR: return !!r.error && typeof r.error.code === 'string';
    case RESPONSE_STATUS.COMPLETED: return 'content' in r;
    default: return false;
  }
}
