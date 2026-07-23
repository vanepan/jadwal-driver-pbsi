/* ============================================================
   ITEM-IDENTITY-RULES.JS — Gudang Item Foundation (Phase 2, Part 5/8)

   Authorized by: Phase 2 brief Part 5 ("Identity Rules") / Part 8
   ("Validation" — "prevent duplicate aliases, duplicate normalized names")

   PURPOSE: the one deterministic rule for what counts as an identity
   collision between two Items — normalizedName/normalizedAliases overlap.
   Pulled out of item-repository.js as a PURE function (plain Items in,
   an itemId or null out) so it is directly unit-testable without Firebase,
   and so the repository visibly contains orchestration (read the catalog,
   call this rule, write) rather than the rule itself (Phase 2 Part 10:
   "Repositories own persistence only... No business rules").

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
 * normalizedName or any normalizedAlias overlaps with `candidate`'s own set
 * of {normalizedName, ...normalizedAliases} — or null when there is none.
 * @param {import('./item-contract.js').Item} candidate
 * @param {import('./item-contract.js').Item[]} allItems
 * @returns {?string}
 */
export function findIdentityCollision(candidate, allItems) {
  const candidateKeys = new Set([candidate.normalizedName, ...(candidate.normalizedAliases || [])]);
  for (const other of allItems) {
    if (other.itemId === candidate.itemId) continue;
    if (other.normalizedName && candidateKeys.has(other.normalizedName)) return other.itemId;
    for (const alias of other.normalizedAliases || []) {
      if (candidateKeys.has(alias)) return other.itemId;
    }
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
