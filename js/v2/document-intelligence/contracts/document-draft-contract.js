/* ============================================================
   DOCUMENT-DRAFT-CONTRACT.JS — Document Intelligence Foundation (V2, Phase 7)

   PURPOSE: fix the shapes for a proposed document under construction —
   Draft, Validation (against existing V1 rules, never new ones invented
   here), Explanation (why the draft looks the way it does — reusing
   Knowledge's explainability vocabulary), and Recommendation (a suggested
   next edit).

   RESPONSIBILITY: DocumentDraft, DocumentDraftValidation,
   DocumentExplanation, DocumentRecommendation typedefs.

   DEPENDENCIES: none directly — a real implementation (Phase 7+/8) would
   validate a DocumentDraft against the SAME existing V1 validation an
   existing engine already runs (e.g. NOR's own view-model builder), never
   a duplicate rule set.

   NON-GOALS: no draft is ever generated, validated, or explained here. No
   PDF/Excel/HTML rendering — a DocumentDraft is data, never a rendered
   artifact; rendering remains the existing Document Engine's job
   (js/docs/doc-engine.js), reused, not replaced (architecture doc §4.2.8,
   §4.5).

   FUTURE EVOLUTION: Phase 8's NOR pilot is the first concrete consumer of
   these shapes (document-intelligence/nor/contracts/nor-draft-contract.js
   specializes DocumentDraft for NOR without redefining it).
   ============================================================ */

'use strict';

export const DOCUMENT_DRAFT_SCHEMA = 'document-draft@1';

/**
 * @typedef {Object} DocumentDraft
 * @property {string} sessionId
 * @property {string} domainType
 * @property {object} fields          - the domain view-model fields, shape depends on domainType (opaque here)
 * @property {string} createdAt
 * @property {string} updatedAt
 */

/**
 * A validation result against EXISTING V1 rules — this contract does not
 * define what those rules are, only how a result is reported.
 * @typedef {Object} DocumentDraftValidation
 * @property {boolean} ok
 * @property {{field: string, message: string}[]} issues
 */

/**
 * @typedef {Object} DocumentExplanation
 * @property {string} statement       - human-readable, e.g. "this section follows the standard pattern"
 * @property {string[]} citedKnowledgeIds - Approved KnowledgeItem ids this explanation is grounded in
 */

/**
 * @typedef {Object} DocumentRecommendation
 * @property {string} field
 * @property {string} suggestion
 * @property {string[]} citedKnowledgeIds
 */

export function isDocumentDraft(d) {
  return !!d && typeof d === 'object'
    && typeof d.sessionId === 'string' && d.sessionId.length > 0
    && typeof d.domainType === 'string' && d.domainType.length > 0
    && !!d.fields && typeof d.fields === 'object';
}

export function isDocumentDraftValidation(v) {
  return !!v && typeof v === 'object' && typeof v.ok === 'boolean' && Array.isArray(v.issues);
}
