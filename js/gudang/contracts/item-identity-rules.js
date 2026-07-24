/* ============================================================
   ITEM-IDENTITY-RULES.JS — Gudang Item Foundation (Phase 2, Part 5/8)

   Authorized by: Phase 2 brief Part 5 ("Identity Rules") / Part 8
   ("Validation" — "prevent duplicate aliases, duplicate normalized names")

   PURPOSE: the one deterministic rule for what counts as an identity
   collision between two Items — normalizedName overlap. Pulled out of
   item-repository.js as a PURE function (plain Items in, an itemId or null
   out) so it is directly unit-testable without Firebase, and so the
   repository visibly contains orchestration (read the catalog, call this
   rule, write) rather than the rule itself (Phase 2 Part 10: "Repositories
   own persistence only... No business rules").

   Phase 10.1 (Experience Review, Part 3 — "Aliases are NOT unique. This is
   intentional... Remove any uniqueness validation that contradicts this."):
   this rule used to ALSO block a shared alias between two different Items
   (either direction: alias-vs-alias, alias-vs-name). That's gone — "Super
   Glue 25gr", "Super Glue 5gr", and "Glue Stick" may all alias to "lem";
   Universal Search already returns every match for a query (search/
   search-resolver.js never assumed one-alias-one-item), so the only thing
   standing in the way was THIS creation-time check. Two Items still cannot
   share the exact same normalizedName — the brief only asked to stop
   blocking shared *aliases*, not exact-name duplicates.

   This is a deterministic UNIQUENESS CHECK, not a workflow decision — the
   same distinction Phase 1's repositories already draw for duplicate-id
   checks (movement-repository.js, item-repository.js's own DUPLICATE_ID
   path). It does not decide what an Item IS (that's item-contract.js); it
   only refuses two different Items from resolving to the same search
   identity.

   PURE: no DOM, no Firebase, no `window`.
   ============================================================ */

'use strict';

/**
 * The itemId of the first OTHER item (not `candidate.itemId`) whose
 * normalizedName exactly matches `candidate`'s — or null when there is none.
 * Aliases are deliberately excluded (Phase 10.1): they are shared,
 * many-to-many labels, never an identity collision on their own.
 * @param {import('./item-contract.js').Item} candidate
 * @param {import('./item-contract.js').Item[]} allItems
 * @returns {?string}
 */
export function findIdentityCollision(candidate, allItems) {
  for (const other of allItems) {
    if (other.itemId === candidate.itemId) continue;
    if (other.normalizedName && other.normalizedName === candidate.normalizedName) return other.itemId;
  }
  return null;
}

/**
 * The Item whose normalizedName or normalizedAliases contains
 * `normalizedNeedle` exactly — or null. `normalizedNeedle` must already be
 * normalized (repository/item-repository.js#findByAlias normalizes the raw
 * query text before calling this); this function does no normalization of
 * its own so there is exactly one place that happens
 * (contracts/text-normalization.js), never two.
 * @param {string} normalizedNeedle
 * @param {import('./item-contract.js').Item[]} allItems
 * @returns {?import('./item-contract.js').Item}
 */
export function findItemByNormalizedAlias(normalizedNeedle, allItems) {
  if (!normalizedNeedle) return null;
  return allItems.find((item) =>
    item.normalizedName === normalizedNeedle || (item.normalizedAliases || []).includes(normalizedNeedle)
  ) || null;
}
