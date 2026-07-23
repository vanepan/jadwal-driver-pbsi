/* ============================================================
   REPOSITORY-RESULT.JS — Gudang Foundation (Phase 1, Part 4)

   PURPOSE: the one shared {ok, data, error} result shape every Gudang
   repository returns (mirrors js/v2/body/repository/body-event-repository.js's
   local success()/failure(), centralized here because seven repository
   files need it, not invented ahead of need — Doc 4 Art.VI).

   Repositories return this instead of throwing so a caller (Projection,
   Audit, Search) can compose multiple repository calls without a try/catch
   ladder, and so "not found" is a normal data path, not an exception.

   PURE: no DOM, no Firebase, no `window`.
   ============================================================ */

'use strict';

export function success(data) {
  return Object.freeze({ ok: true, data: data ?? null, error: null });
}

export function failure(code, message) {
  return Object.freeze({ ok: false, data: null, error: Object.freeze({ code, message }) });
}

export const REPOSITORY_ERROR = Object.freeze({
  INVALID_INPUT: 'INVALID_INPUT',
  DUPLICATE_ID: 'DUPLICATE_ID',
  NOT_FOUND: 'NOT_FOUND',
  READ_FAILED: 'READ_FAILED',
  WRITE_FAILED: 'WRITE_FAILED',
});
