/* ============================================================
   SUGGESTION-PLACEHOLDER-CONTRACT.JS — Live Editable Composer Foundation (V2.0.15)

   PURPOSE: reserve the shape a future suggestion would fill — "Nothing
   generated yet" (this milestone's explicit bound) means every
   SuggestionPlaceholder constructed here is, and can only be, `status:
   'empty'`. SUGGESTED/ACCEPTED/REJECTED are reserved states for a FUTURE
   recommendation engine to move a placeholder through — no code path in
   this codebase produces them today.

   RESPONSIBILITY: define SuggestionPlaceholder, SUGGESTION_STATUS, and a
   constructor that can only ever produce the EMPTY state.

   DEPENDENCIES: none.

   NON-GOALS: no suggestion is ever generated, scored, or cited here —
   `suggestedValue`/`citedEvidence` are reserved fields, always null.
   ============================================================ */

'use strict';

export const SUGGESTION_PLACEHOLDER_SCHEMA = 'suggestion-placeholder@1';

/** Closed set. Only EMPTY is reachable in this milestone — see header. */
export const SUGGESTION_STATUS = Object.freeze({
  EMPTY: 'empty',
  SUGGESTED: 'suggested',
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
});

/**
 * @typedef {Object} SuggestionPlaceholder
 * @property {string} placeholderId
 * @property {string} field
 * @property {string} status          - one of SUGGESTION_STATUS; always EMPTY today
 * @property {*|null} suggestedValue  - reserved for a future recommendation engine; always null today
 * @property {import('../../../knowledge/contracts/evidence-contract.js').Evidence[]} citedEvidence - reserved; always [] today
 * @property {string} reservedAt      - ISO 8601
 */

export function makeSuggestionPlaceholder(field) {
  return Object.freeze({
    placeholderId: `suggestion:${field}:${Date.now()}`,
    field,
    status: SUGGESTION_STATUS.EMPTY,
    suggestedValue: null,
    citedEvidence: Object.freeze([]),
    reservedAt: new Date().toISOString(),
  });
}

export function isSuggestionPlaceholder(p) {
  return !!p && typeof p === 'object'
    && typeof p.placeholderId === 'string' && p.placeholderId.length > 0
    && typeof p.field === 'string' && p.field.length > 0
    && Object.values(SUGGESTION_STATUS).includes(p.status)
    && Array.isArray(p.citedEvidence);
}
