/* ============================================================
   NUMBERING-CONTRACT.JS — Organizational Memory Foundation (V2.0.7, Phase 10)

   PURPOSE: fix the shape of a numbering suggestion ("Automatic Numbering",
   "Editable Numbering"). Research confirmed `norNumber` is free-text today
   (petty-cash-service.js#generateNor() only checks non-empty) — no
   auto-numbering exists. This contract's shape is always a SUGGESTION a
   human may accept, edit, or ignore — it is never written back to V1;
   generateNor()'s `norNumber` parameter remains exactly as
   free-text/manual as it is today.

   RESPONSIBILITY: define NumberingSuggestion and a constructor.

   DEPENDENCIES: none.
   ============================================================ */

'use strict';

export const NUMBERING_SCHEMA = 'archive-numbering-suggestion@1';

/**
 * @typedef {Object} NumberingSuggestion
 * @property {string} domainType
 * @property {string} suggestedNumber
 * @property {string} basis          - human-readable, e.g. "next in sequence after NOR-2026-014"
 * @property {number} confidence     - 0-1; 0 when no real sequence pattern could be inferred
 * @property {string} computedAt     - ISO 8601
 */

export function makeNumberingSuggestion({ domainType, suggestedNumber, basis, confidence }) {
  return Object.freeze({ domainType, suggestedNumber, basis, confidence, computedAt: new Date().toISOString() });
}
