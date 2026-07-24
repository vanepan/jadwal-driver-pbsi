/* ============================================================
   ASSET-REPOSITORY.JS — Gudang Foundation (Phase 1, Part 4)

   Authorized by: Doc 1 Art.V (Assets vs. Consumables) · Doc 3 Ch.06/Part 4

   PURPOSE: persistence for Asset — the "Asset Status" tier of Doc 3 Ch.02's
   engine map (ASSET ENGINE → creates → ASSET HISTORY [truth] → derives →
   ASSET STATUS [this file]), the exact same three-tier shape Movement/Stock
   already use. It does not record lifecycle events — that is
   asset-history-repository.js's job. createAsset() only establishes
   IDENTITY (Doc 1 Art.V), never a status transition, the same way
   createItem() establishes an Item's existence without needing a Movement.

   UPDATED — Phase 9 (Asset Foundation): added saveAssetStatus(), the write
   path for the derived Status tier — exactly parallel to stock-
   repository.js's saveProjection() for Stock. Through Phase 1-8 this file
   truthfully had NO status-mutation export, because no lifecycle workflow
   was authorized yet; asset/asset-lifecycle-engine.js is that workflow now,
   and it is the ONLY legitimate caller (same one-writer discipline Part 3
   of gudang-ownership-check.mjs already enforces for saveProjection).
   saveAssetStatus() never writes without a corresponding AssetHistoryEntry
   already having been appended FIRST by its caller — an unattributed
   status change would be the "Movement bypass" pattern Doc 4 F-09 rejects,
   applied here to Asset instead of Stock; this file cannot enforce that
   ordering itself (it only persists what it's given), so the guarantee
   lives in asset-lifecycle-engine.js's own call order, not here.

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

/**
 * Persist (overwrite) an Asset's current status/holderId/locationId — the
 * Status tier's write path (Phase 9; see header). Overwrite is correct
 * here the same way it is for saveProjection(): Status is a derived
 * projection over AssetHistory, not a second truth. Only
 * asset-lifecycle-engine.js is meant to call this, and only after already
 * appending the AssetHistoryEntry that justifies the change.
 */
export async function saveAssetStatus(asset) {
  if (!isAsset(asset)) return failure(REPOSITORY_ERROR.INVALID_INPUT, 'saveAssetStatus: asset does not satisfy the Asset contract.');
  const { storeFirebaseData } = await fb();
  try {
    await storeFirebaseData(`${GUDANG_PATHS.assets}/${asset.assetId}`, asset);
  } catch (err) {
    return failure(REPOSITORY_ERROR.WRITE_FAILED, `saveAssetStatus: write rejected (${err?.code || err?.message || 'unknown error'}).`);
  }
  return success(asset);
}
