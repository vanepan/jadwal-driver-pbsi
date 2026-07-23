/* ============================================================
   TEXT-NORMALIZATION.JS — Gudang Item Foundation (Phase 2, Part 7)

   Authorized by: Doc 1 Art.III (Search First) · Doc 3 Ch.08 (Search Engine)

   PURPOSE: the one deterministic normalization algorithm Item's identity
   fields (name, aliases) are reduced through, so "Tisu Gulung" and "tisu
   gulung " compare equal and tokenize the same way every time.

   OWNERSHIP NOTE: this lives under contracts/, not search/, on purpose.
   Search Engine (Doc 3 Ch.08) READS an Item's already-normalized fields —
   it must never be a dependency Item's own contract needs just to construct
   itself, or Item and Search would depend on each other (Doc 4 F-11,
   circular ownership). item-contract.js imports this file; nothing here
   imports anything Search-owned.

   Deliberately dumb: lowercase, trim, collapse whitespace, split on
   non-alphanumerics. No stemming, no fuzzy matching, no locale-aware
   folding, no AI — the Phase 2 brief is explicit that Search preparation
   stays "pure deterministic," not "smart."

   PURE: no DOM, no Firebase, no `window`.
   ============================================================ */

'use strict';

/** Lowercase, trim, collapse internal whitespace. Deterministic, no locale magic. */
export function normalizeText(text) {
  return String(text || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Split normalized text into non-empty alphanumeric tokens. */
export function tokenize(text) {
  return normalizeText(text).split(/[^a-z0-9]+/).filter(Boolean);
}
