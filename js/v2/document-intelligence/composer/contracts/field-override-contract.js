/* ============================================================
   FIELD-OVERRIDE-CONTRACT.JS — Live Editable Composer Foundation (V2.0.15)

   PURPOSE: fix the shape of ONE explicit human edit to a single Composer
   section — "Field Override." Deliberately mirrors
   knowledge/learning/contracts/correction-contract.js's own framing (a
   human statement, not a bulk source read) without importing it — a
   FieldOverride is scoped to ONE document session's editing surface; it
   only becomes a Correction (and only then touches Knowledge) via
   V2.0.16's Diff Learning Foundation, kept a deliberate, later step.

   RESPONSIBILITY: define FieldOverride and a constructor.

   DEPENDENCIES: none.

   NON-GOALS: does not write to Knowledge. Does not decide whether an
   override is "correct" — a human made it, same trust posture as
   Correction.
   ============================================================ */

'use strict';

export const FIELD_OVERRIDE_SCHEMA = 'field-override@1';

/**
 * @typedef {Object} FieldOverride
 * @property {string} sectionId
 * @property {string} field
 * @property {*} originalValue
 * @property {*} overrideValue
 * @property {string} overriddenBy   - human identity, same role-agnostic style as review-contract.js's approverId
 * @property {string} overriddenAt   - ISO 8601
 */

export function makeFieldOverride({ sectionId, field, originalValue, overrideValue, overriddenBy }) {
  return Object.freeze({
    sectionId, field, originalValue, overrideValue, overriddenBy,
    overriddenAt: new Date().toISOString(),
  });
}

export function isFieldOverride(o) {
  return !!o && typeof o === 'object'
    && typeof o.sectionId === 'string' && o.sectionId.length > 0
    && typeof o.field === 'string' && o.field.length > 0
    && typeof o.overriddenBy === 'string' && o.overriddenBy.length > 0
    && typeof o.overriddenAt === 'string' && o.overriddenAt.length > 0;
}
