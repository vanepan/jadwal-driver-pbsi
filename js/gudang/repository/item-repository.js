/* ============================================================
   ITEM-REPOSITORY.JS — Gudang Foundation (Phase 1, Part 4; completed Phase 2)

   Authorized by: Doc 3 Ch.03 (Item) / Ch.04 Part 4 ("Repositories own
   persistence only. No business rules. No analytics.") · Phase 2 brief
   Part 6 ("Repository") / Part 8 ("Validation")

   PURPOSE: persistence for Item, nothing else. Validates shape against
   contracts/item-contract.js and writes/reads RTDB — it does not decide
   whether an Item is a Consumable or an Asset (the caller already knows
   that; Doc 3 Ch.14 rejects "God objects" making that call here).

   ALLOWED (Phase 2 Part 6): createItem, getItem, listItems, updateItem,
   archiveItem, findByAlias.
   FORBIDDEN, on purpose, no exports exist for them: deleteItem (identity
   is never removed, only deactivated — archiveItem sets active:false),
   replaceItem (a full bypass-the-merge overwrite would let a caller skip
   updateItemModel's immutability guards), mergeItems (combining two
   identities would retroactively reassign every Movement/AssetHistory
   record already pointing at either itemId — not authorized here, and
   dangerous enough that it should never be one repository call).

   IDENTITY UNIQUENESS (Phase 2 Part 8): "duplicate aliases" / "duplicate
   normalized names" are enforced here, not in the contract — a single Item
   object can only validate itself, never see the rest of the catalog. This
   is persistence-integrity enforcement (the RTDB analogue of a unique
   index), not a business rule: it protects the guarantee that a
   normalizedName/alias resolves to exactly one Item, never a workflow
   decision about what an Item IS.

   firebase.js is imported LAZILY so this file stays Node-importable with
   zero transitive Firebase dependency until a function actually runs —
   same discipline as js/engineering/providers/firebase-adapter.js.

   OWNERSHIP: writes are surgical (gudang/items/{id}); one Item never
   overwrites another except through updateItem's merge path.
   ============================================================ */

'use strict';

import { GUDANG_PATHS } from '../config/gudang-paths.js';
import { isItem, updateItemModel } from '../contracts/item-contract.js';
import { normalizeText } from '../contracts/text-normalization.js';
import { findIdentityCollision, findItemByNormalizedAlias } from '../contracts/item-identity-rules.js';
import { success, failure, REPOSITORY_ERROR } from './repository-result.js';

let _fbPromise = null;
function fb() {
  if (!_fbPromise) _fbPromise = import('../../firebase.js');
  return _fbPromise;
}

/** Create a new Item. Fails on a duplicate itemId, or a name/alias another Item already owns. */
export async function createItem(item) {
  if (!isItem(item)) return failure(REPOSITORY_ERROR.INVALID_INPUT, 'createItem: item does not satisfy the Item contract.');
  const { readNode, storeFirebaseData } = await fb();
  const existing = await readNode(`${GUDANG_PATHS.items}/${item.itemId}`);
  if (existing.status === 'ok' && existing.value != null) {
    return failure(REPOSITORY_ERROR.DUPLICATE_ID, `An item with id "${item.itemId}" already exists.`);
  }

  const allRes = await listItems();
  if (!allRes.ok) return allRes;
  const collision = findIdentityCollision(item, allRes.data);
  if (collision) {
    return failure(REPOSITORY_ERROR.DUPLICATE_IDENTITY, `"${item.name}" (or one of its aliases) already resolves to item "${collision}".`);
  }

  try {
    await storeFirebaseData(`${GUDANG_PATHS.items}/${item.itemId}`, item);
  } catch (err) {
    return failure(REPOSITORY_ERROR.WRITE_FAILED, `createItem: write rejected (${err?.code || err?.message || 'unknown error'}).`);
  }
  return success(item);
}

/** One-shot read of a single Item by id. */
export async function getItem(itemId) {
  if (typeof itemId !== 'string' || !itemId) return failure(REPOSITORY_ERROR.INVALID_INPUT, 'getItem: itemId is required.');
  const { readNode } = await fb();
  const res = await readNode(`${GUDANG_PATHS.items}/${itemId}`);
  if (res.status !== 'ok') return failure(REPOSITORY_ERROR.READ_FAILED, `getItem: read failed (${res.status}).`);
  if (res.value == null) return failure(REPOSITORY_ERROR.NOT_FOUND, `No item with id "${itemId}".`);
  return success(res.value);
}

/** All Items, as a plain array. */
export async function listItems() {
  const { readNode } = await fb();
  const res = await readNode(GUDANG_PATHS.items);
  if (res.status !== 'ok') return failure(REPOSITORY_ERROR.READ_FAILED, `listItems: read failed (${res.status}).`);
  const value = res.value || {};
  return success(Object.values(value));
}

/**
 * Merge `patch` into the Item at `itemId`. Rejects attempts to change itemId
 * or itemType (contracts/item-contract.js#updateItemModel throws; caught and
 * returned as INVALID_INPUT here), and rejects a resulting name/alias that
 * collides with a DIFFERENT Item.
 * @param {string} itemId
 * @param {Partial<import('../contracts/item-contract.js').Item>} patch
 */
export async function updateItem(itemId, patch = {}) {
  const existingRes = await getItem(itemId);
  if (!existingRes.ok) return existingRes;

  let updated;
  try {
    updated = updateItemModel(existingRes.data, patch);
  } catch (err) {
    return failure(REPOSITORY_ERROR.INVALID_INPUT, `updateItem: ${err.message}`);
  }

  const allRes = await listItems();
  if (!allRes.ok) return allRes;
  const collision = findIdentityCollision(updated, allRes.data);
  if (collision) {
    return failure(REPOSITORY_ERROR.DUPLICATE_IDENTITY, `"${updated.name}" (or one of its aliases) already resolves to item "${collision}".`);
  }

  const { storeFirebaseData } = await fb();
  try {
    await storeFirebaseData(`${GUDANG_PATHS.items}/${itemId}`, updated);
  } catch (err) {
    return failure(REPOSITORY_ERROR.WRITE_FAILED, `updateItem: write rejected (${err?.code || err?.message || 'unknown error'}).`);
  }
  return success(updated);
}

/**
 * Deactivate an Item. Identity is never deleted (Phase 2 Part 6) — this is
 * the only supported way to make an item stop being active, and it is
 * nothing more than updateItem(itemId, { active: false }).
 */
export async function archiveItem(itemId) {
  return updateItem(itemId, { active: false });
}

/**
 * Resolve an exact (normalized) name or alias to its owning Item. Exact
 * match only — no fuzzy matching, no ranking (Phase 2 Part 7); a broader
 * search is search/search-resolver.js's job, not this repository's.
 * @param {string} alias
 */
export async function findByAlias(alias) {
  const needle = normalizeText(alias);
  if (!needle) return failure(REPOSITORY_ERROR.INVALID_INPUT, 'findByAlias: alias is required.');
  const allRes = await listItems();
  if (!allRes.ok) return allRes;
  const match = findItemByNormalizedAlias(needle, allRes.data);
  if (!match) return failure(REPOSITORY_ERROR.NOT_FOUND, `No item resolves to alias "${alias}".`);
  return success(match);
}
