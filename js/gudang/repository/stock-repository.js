/* ============================================================
   STOCK-REPOSITORY.JS — Gudang Foundation (Phase 1, Part 4)

   Authorized by: Doc 1 Art.IV · Doc 3 Ch.05/Part 4

   PURPOSE: persistence for the StockProjection CACHE only. Unlike Movement
   and Asset History, overwriting here is correct and expected — Doc 3 Ch.05
   explicitly allows a Projection to be rebuilt from scratch; that is what
   `saveProjection` does every time it is called. This file never computes a
   quantity itself (that is projection/stock-projection-engine.js's job,
   Part 5) — it only persists whatever that pure engine already derived.

   firebase.js is imported LAZILY — see item-repository.js's header for why.
   ============================================================ */

'use strict';

import { GUDANG_PATHS } from '../config/gudang-paths.js';
import { isStockProjection } from '../contracts/stock-projection-contract.js';
import { success, failure, REPOSITORY_ERROR } from './repository-result.js';

let _fbPromise = null;
function fb() {
  if (!_fbPromise) _fbPromise = import('../../firebase.js');
  return _fbPromise;
}

/** Persist (or replace) the cached StockProjection for one item. */
export async function saveProjection(projection) {
  if (!isStockProjection(projection)) return failure(REPOSITORY_ERROR.INVALID_INPUT, 'saveProjection: projection does not satisfy the StockProjection contract.');
  const { storeFirebaseData } = await fb();
  await storeFirebaseData(`${GUDANG_PATHS.stock}/${projection.itemId}`, projection);
  return success(projection);
}

/** One-shot read of the cached StockProjection for one item (NOT_FOUND if never rebuilt). */
export async function getProjection(itemId) {
  if (typeof itemId !== 'string' || !itemId) return failure(REPOSITORY_ERROR.INVALID_INPUT, 'getProjection: itemId is required.');
  const { readNode } = await fb();
  const res = await readNode(`${GUDANG_PATHS.stock}/${itemId}`);
  if (res.status !== 'ok') return failure(REPOSITORY_ERROR.READ_FAILED, `getProjection: read failed (${res.status}).`);
  if (res.value == null) return failure(REPOSITORY_ERROR.NOT_FOUND, `No projection cached for item "${itemId}".`);
  return success(res.value);
}
