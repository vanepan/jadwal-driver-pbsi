/* ============================================================
   ITEM-REPOSITORY.JS — Gudang Foundation (Phase 1, Part 4)

   Authorized by: Doc 3 Ch.03 (Item) / Ch.04 Part 4 ("Repositories own
   persistence only. No business rules. No analytics.")

   PURPOSE: persistence for Item, nothing else. Validates shape against
   contracts/item-contract.js and writes/reads RTDB — it does not decide
   whether an Item is a Consumable or an Asset (the caller already knows
   that; Doc 3 Ch.14 rejects "God objects" making that call here).

   firebase.js is imported LAZILY so this file stays Node-importable with
   zero transitive Firebase dependency until a function actually runs —
   same discipline as js/engineering/providers/firebase-adapter.js.

   OWNERSHIP: writes are surgical (gudang/items/{id}); one Item never
   overwrites another.
   ============================================================ */

'use strict';

import { GUDANG_PATHS } from '../config/gudang-paths.js';
import { isItem } from '../contracts/item-contract.js';
import { success, failure, REPOSITORY_ERROR } from './repository-result.js';

let _fbPromise = null;
function fb() {
  if (!_fbPromise) _fbPromise = import('../../firebase.js');
  return _fbPromise;
}

/** Create a new Item. Fails on a duplicate itemId (never overwrites). */
export async function createItem(item) {
  if (!isItem(item)) return failure(REPOSITORY_ERROR.INVALID_INPUT, 'createItem: item does not satisfy the Item contract.');
  const { readNode, storeFirebaseData } = await fb();
  const existing = await readNode(`${GUDANG_PATHS.items}/${item.itemId}`);
  if (existing.status === 'ok' && existing.value != null) {
    return failure(REPOSITORY_ERROR.DUPLICATE_ID, `An item with id "${item.itemId}" already exists.`);
  }
  await storeFirebaseData(`${GUDANG_PATHS.items}/${item.itemId}`, item);
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
