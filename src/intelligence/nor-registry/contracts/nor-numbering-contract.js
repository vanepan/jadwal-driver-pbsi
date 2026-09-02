/* ============================================================
   NOR-NUMBERING-CONTRACT.JS — NOR Registry Foundation (V2, Phase 0)

   PURPOSE: establish the ARCHITECTURAL BOUNDARY for NOR numbering (PART 11,
   12). NOR numbering must have exactly ONE source of truth so two modules
   can never mint the same number. This file names that boundary and
   distinguishes a SUGGESTED number (advisory, editable) from a PUBLISHED
   number (reserved/validated at issuance).

   THE ONE SUGGESTION AUTHORITY — already built, already tested — is
   src/organizational-memory/numbering-engine.js#suggestNextNumber(domainType):
   a pattern-inference engine over the real NOR archive that is honest
   (confidence 0) when no consistent pattern exists, and is ALWAYS advisory
   (never written back to V1). This file re-exports it under the NOR
   Registry namespace so callers reach it through ONE owned path — the same
   discipline src/intake/nor-numbering-context.js already applies.

   THE RESERVATION/VALIDATION step at publication (turning a suggested or
   user-typed number into the official issued number) is NOT IMPLEMENTED in
   Phase 0. Its precedent is functions/src/reimbursement/counter.js#
   acquireReimbursementNumber — a server-side atomic increment. Phase 0
   ships the contract + `reserveNumber()` stub only.

   RESPONSIBILITY: NUMBERING_OWNER, NUMBER_SOURCE re-export, NUMBERING_ERRORS,
   NumberAllocation shape + makeNumberAllocation + isNumberAllocation,
   the re-exported suggestNextNumber, and a NOT_IMPLEMENTED reserveNumber().

   DEPENDENCIES (read-only, one-way — the same edge
   src/intake/nor-numbering-context.js already exercises):
   src/organizational-memory/numbering-engine.js + its numbering-contract.js.

   NON-GOALS: does not reserve, does not persist, does not redesign the
   existing Petty Cash NOR flow (PART 11 — explicitly deferred).
   ============================================================ */

'use strict';

import { suggestNextNumber } from '../../../organizational-memory/numbering-engine.js';
import { NUMBER_SOURCE } from './nor-record-contract.js';

/** The single module that owns NOR-number allocation for the whole platform. */
export const NUMBERING_OWNER = 'src/intelligence/nor-registry/nor-registry.js';

export const NOR_NUMBERING_SCHEMA = 'nor-number-allocation@1';

export { NUMBER_SOURCE };

export const NUMBERING_ERRORS = Object.freeze({
  NOT_IMPLEMENTED: 'NOT_IMPLEMENTED', // reservation is future work (server-side)
  NUMBER_TAKEN: 'NUMBER_TAKEN',       // the requested number is already published
  INVALID_NUMBER: 'INVALID_NUMBER',
});

/** The advisory suggestion authority. Re-exported so no NOR caller imports
 *  organizational-memory/ directly. Returns a NumberingSuggestion
 *  (organizational-memory/contracts/numbering-contract.js): { domainType,
 *  suggestedNumber, basis, confidence, computedAt }. */
export { suggestNextNumber };

/**
 * @typedef {Object} NumberAllocation
 * @property {string} schema
 * @property {string|null} norId
 * @property {string} suggestedNumber   - the advisory value autofilled in the UI ('' when none inferable)
 * @property {string|null} publishedNumber - the official issued number; null until publication reserves it (PART 12)
 * @property {string} source            - NUMBER_SOURCE.*
 * @property {string|null} basis        - human-readable rationale for the suggestion
 * @property {number} confidence        - 0–1; 0 when no sequence pattern could be inferred
 * @property {string} allocatedAt       - ISO 8601
 */

export function makeNumberAllocation({
  norId = null,
  suggestedNumber = '',
  publishedNumber = null,
  source = NUMBER_SOURCE.SYSTEM_SUGGESTED,
  basis = null,
  confidence = 0,
} = {}) {
  const c = Number(confidence);
  return Object.freeze({
    schema: NOR_NUMBERING_SCHEMA,
    norId: norId || null,
    suggestedNumber: typeof suggestedNumber === 'string' ? suggestedNumber : '',
    publishedNumber: publishedNumber == null ? null : String(publishedNumber),
    source: Object.values(NUMBER_SOURCE).includes(source) ? source : NUMBER_SOURCE.SYSTEM_SUGGESTED,
    basis: basis == null ? null : String(basis),
    confidence: Number.isFinite(c) ? Math.min(1, Math.max(0, c)) : 0,
    allocatedAt: new Date().toISOString(),
  });
}

export function isNumberAllocation(a) {
  if (!a || typeof a !== 'object') return false;
  if (a.schema !== NOR_NUMBERING_SCHEMA) return false;
  return typeof a.suggestedNumber === 'string'
    && (a.publishedNumber === null || typeof a.publishedNumber === 'string')
    && Object.values(NUMBER_SOURCE).includes(a.source);
}

/**
 * Reserve + validate an official number at publication time.
 *
 * CLIENT-SIDE: intentionally NOT IMPLEMENTED — there is NO client-side
 * authoritative numbering (PART F). The browser never allocates a NOR
 * number; it calls the server, which owns the atomic counter.
 *
 * SERVER-SIDE (Phase 5, real): the atomic + idempotent allocation lives in
 * functions/src/intelligence/norNumberingCounter.js
 * (`reserveNorNumber({ db, scopeKey, reservationKey })`), invoked only from
 * the `intelligenceNorRegistry` callable's `publish` op. Precedent:
 * functions/src/reimbursement/counter.js#acquireReimbursementNumber. It
 * returns a unique sequence integer; the DECORATED organizational NOR-number
 * format for Sarpras Intelligence is an unresolved organizational rule
 * (docs/NOR-Specification.md §D.7) and is NOT invented here.
 *
 * @param {{norId?: string, requestedNumber?: string}} _input
 * @returns {{ok: boolean, data: null, error: {code: string, message: string}}}
 */
export function reserveNumber(_input = {}) {
  return Object.freeze({
    ok: false,
    data: null,
    error: Object.freeze({
      code: NUMBERING_ERRORS.NOT_IMPLEMENTED,
      message: 'NOR number reservation is not implemented in Phase 0. Publication uses the manually-entered or suggested number as-is.',
    }),
  });
}
