/* ============================================================
   ITEM-KEYWORD-INDEX.JS — Gudang Item Foundation (Phase 2, Part 7)

   Authorized by: Doc 1 Art.III (Search First) · Doc 2 §05 (Search) ·
   Doc 3 Ch.08 (Search Engine) — Phase 2 brief Part 7 ("Search Foundation")

   PURPOSE: build a deterministic inverted index — token → the itemIds whose
   searchTokens contain it — from a plain array of Items. Pure preparation
   only: no ranking, no scoring, no fuzzy matching, no AI (Phase 2 Part 7's
   explicit boundary). Token order within each bucket is insertion order,
   nothing more.

   NOT WIRED IN: this file is prepared, standalone infrastructure — it does
   not touch item-repository.js, and search/search-resolver.js (Phase 1
   Foundation, frozen) is deliberately NOT modified to use it. "Do NOT
   modify Foundation" (Phase 2 Mission) — wiring an index into the live
   search() function is real search behavior, which belongs to whichever
   future phase actually builds Search, not this one.

   Reads Items' ALREADY-COMPUTED searchTokens (from
   contracts/item-contract.js's makeItem/updateItemModel) — it never
   re-normalizes text itself, so there is exactly one place tokenization
   happens, not two independently-maintained copies.

   PURE: no DOM, no Firebase, no `window`.
   ============================================================ */

'use strict';

/**
 * @param {import('../contracts/item-contract.js').Item[]} items
 * @returns {Map<string, string[]>} token -> itemId[] (insertion order, no ranking)
 */
export function buildItemKeywordIndex(items) {
  const index = new Map();
  for (const item of items) {
    for (const token of item.searchTokens || []) {
      if (!index.has(token)) index.set(token, []);
      const bucket = index.get(token);
      if (!bucket.includes(item.itemId)) bucket.push(item.itemId);
    }
  }
  return index;
}

/**
 * Look up itemIds whose searchTokens contain `token` exactly (case-sensitive
 * on the already-normalized token; callers pass normalized text). No fuzzy
 * matching — an unlisted token simply returns an empty array.
 * @param {Map<string, string[]>} index
 * @param {string} token
 * @returns {string[]}
 */
export function lookupItemIdsByToken(index, token) {
  return index.get(token) || [];
}
