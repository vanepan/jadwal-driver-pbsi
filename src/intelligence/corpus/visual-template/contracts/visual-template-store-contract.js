/* ============================================================
   VISUAL-TEMPLATE-STORE-CONTRACT.JS — PBSI Visual Template System
   (V2, Phase 5.x.6)

   PURPOSE: fix the ONE interface every Visual Template backend implements
   (Null now; a Memory backend for tests / DISABLED mode; a server-backed
   callable backend later), plus the VisualTemplateResult envelope —
   mirroring src/intelligence/corpus/style-guide/contracts/
   style-guide-store-contract.js.

   THE METHOD SET (§24 — only what this phase justifies):

     list                read templates (organization-wide; status /
                         documentType filters — §22)
     get                 read one template by id
     proposeFromEvidence create a `proposed` template FROM an aggregated
                         visual pattern (§13, §27). NEVER creates an
                         `approved` template.
     approve             proposed → approved. Requires an authenticated
                         actor + a non-empty human rationale (§11). Fails
                         closed on an unresolved slot conflict (§21).
     reject              proposed → rejected (actor + reason preserved — §10)
     deprecate           approved → deprecated (actor + reason preserved;
                         retained + queryable — §12)
     resolve             deterministic effective-template resolution for a
                         slot: resolved | conflict | missing (§21)
     history             the supersession chain for a template id (§12)

   There is deliberately NO method that writes an `approved` template
   directly, no bulk-approve, and no client-authored raw template — every
   template is provably visual-evidence-derived (§13, §21).

   DEPENDENCIES: none.
   ============================================================ */

'use strict';

export const VISUAL_TEMPLATE_STORE_SCHEMA = 'visual-template-store@1';

export const VISUAL_TEMPLATE_ERRORS = Object.freeze({
  NO_BACKEND_CONFIGURED: 'NO_BACKEND_CONFIGURED',
  NOT_FOUND: 'NOT_FOUND',
  FORBIDDEN: 'FORBIDDEN',
  INVALID_RECORD: 'INVALID_RECORD',
  ILLEGAL_TRANSITION: 'ILLEGAL_TRANSITION',
  VERSION_CONFLICT: 'VERSION_CONFLICT',
  RATIONALE_REQUIRED: 'RATIONALE_REQUIRED',
  REASON_REQUIRED: 'REASON_REQUIRED',
  ACTOR_REQUIRED: 'ACTOR_REQUIRED',
  CONFLICT_UNRESOLVED: 'CONFLICT_UNRESOLVED',
  TEMPLATE_EXISTS: 'TEMPLATE_EXISTS',
  PATTERN_NOT_FOUND: 'PATTERN_NOT_FOUND',
  VISUAL_ANALYSIS_UNAVAILABLE: 'VISUAL_ANALYSIS_UNAVAILABLE', // the server-side aggregator is not wired (fail safe)
  NOT_IMPLEMENTED: 'NOT_IMPLEMENTED',
});

/**
 * @typedef {Object} VisualTemplateResult
 * @property {boolean} ok
 * @property {*} data
 * @property {{code: string, message: string}|null} error
 */

export function visualTemplateSuccess(data) {
  return Object.freeze({ ok: true, data: data ?? null, error: null });
}

export function visualTemplateFailure(code, message) {
  return Object.freeze({ ok: false, data: null, error: Object.freeze({ code, message: String(message || '') }) });
}

export const VISUAL_TEMPLATE_STORE_CONTRACT = Object.freeze({
  schema: VISUAL_TEMPLATE_STORE_SCHEMA,
  methods: Object.freeze([
    'list', 'get', 'proposeFromEvidence', 'approve', 'reject', 'deprecate', 'resolve', 'history',
  ]),
  errorCodes: VISUAL_TEMPLATE_ERRORS,
});

export function isVisualTemplateBackend(b) {
  if (!b || typeof b !== 'object') return false;
  if (typeof b.id !== 'string' || !b.id) return false;
  if (typeof b.version !== 'string' || !b.version) return false;
  return VISUAL_TEMPLATE_STORE_CONTRACT.methods.every((m) => typeof b[m] === 'function');
}
