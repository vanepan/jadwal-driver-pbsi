/* ============================================================
   ASSET-REPOSITORY.JS — Gudang Foundation (Phase 1, Part 4)

   Authorized by: Doc 1 Art.V (Assets vs. Consumables) · Doc 3 Ch.06/Part 4

   PURPOSE: persistence for Asset — the "Asset Status" tier of Doc 3 Ch.02's
   engine map (ASSET ENGINE → creates → ASSET HISTORY [truth] → derives →
   ASSET STATUS [this file]), the exact same three-tier shape Movement/Stock
   already use. It does not record lifecycle events — that is
   asset-history-repository.js's job, and this file has NO status-mutation
   export (no updateStatus, no assignAsset, no setHolder) on purpose: a
   status change with no accompanying AssetHistoryEntry would be an
   unattributed status change, exactly the "Movement bypass" pattern Doc 4's
   Forbidden Ledger F-09 rejects — applied here to Asset instead of Stock.
   createAsset() only establishes IDENTITY (Doc 1 Art.V), never a status
   transition, the same way createItem() establishes an Item's existence
   without needing a Movement. No assign/return/maintain/retire WORKFLOW
   exists here at all (Phase 1 forbids it) — only the shape and the ability
   to persist/read the identity + whatever status it was created with.

   firebase.js is imported LAZILY — see item-repository.js's header for why.
   ============================================================ */

'use strict';

import { GUDANG_PATHS } from '../config/gudang-paths.js';
import { isAsset } from '../contracts/asset-contract.js';
import { success, failure, REPOSITORY_ERROR } from './repository-result.js';

let _fbPromise = null;
function fb() {
  if (!_fbPromise) _fbPromise = import('../../firebase.js');
  return _fbPromise;
}

/** Create a new Asset. Fails on a duplicate assetId. */
export async function createAsset(asset) {
  if (!isAsset(asset)) return failure(REPOSITORY_ERROR.INVALID_INPUT, 'createAsset: asset does not satisfy the Asset contract.');
  const { readNode, storeFirebaseData } = await fb();
  const existing = await readNode(`${GUDANG_PATHS.assets}/${asset.assetId}`);
  if (existing.status === 'ok' && existing.value != null) {
    return failure(REPOSITORY_ERROR.DUPLICATE_ID, `An asset with id "${asset.assetId}" already exists.`);
  }
  await storeFirebaseData(`${GUDANG_PATHS.assets}/${asset.assetId}`, asset);
  return success(asset);
}

/** One-shot read of a single Asset by id. */
export async function getAsset(assetId) {
  if (typeof assetId !== 'string' || !assetId) return failure(REPOSITORY_ERROR.INVALID_INPUT, 'getAsset: assetId is required.');
  const { readNode } = await fb();
  const res = await readNode(`${GUDANG_PATHS.assets}/${assetId}`);
  if (res.status !== 'ok') return failure(REPOSITORY_ERROR.READ_FAILED, `getAsset: read failed (${res.status}).`);
  if (res.value == null) return failure(REPOSITORY_ERROR.NOT_FOUND, `No asset with id "${assetId}".`);
  return success(res.value);
}

/** All Assets, as a plain array. */
export async function listAssets() {
  const { readNode } = await fb();
  const res = await readNode(GUDANG_PATHS.assets);
  if (res.status !== 'ok') return failure(REPOSITORY_ERROR.READ_FAILED, `listAssets: read failed (${res.status}).`);
  return success(Object.values(res.value || {}));
}
