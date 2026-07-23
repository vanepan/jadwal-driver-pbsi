/* ============================================================
   LOCATION-REPOSITORY.JS — Gudang Foundation (Phase 1, Part 4)

   Authorized by: Doc 3 Ch.03/Part 4 (Location — "Core, lightweight")

   firebase.js is imported LAZILY — see item-repository.js's header for why.
   ============================================================ */

'use strict';

import { GUDANG_PATHS } from '../config/gudang-paths.js';
import { isLocation } from '../contracts/location-contract.js';
import { success, failure, REPOSITORY_ERROR } from './repository-result.js';

let _fbPromise = null;
function fb() {
  if (!_fbPromise) _fbPromise = import('../../firebase.js');
  return _fbPromise;
}

/** Create a new Location. Fails on a duplicate locationId. */
export async function createLocation(location) {
  if (!isLocation(location)) return failure(REPOSITORY_ERROR.INVALID_INPUT, 'createLocation: location does not satisfy the Location contract.');
  const { readNode, storeFirebaseData } = await fb();
  const existing = await readNode(`${GUDANG_PATHS.locations}/${location.locationId}`);
  if (existing.status === 'ok' && existing.value != null) {
    return failure(REPOSITORY_ERROR.DUPLICATE_ID, `A location with id "${location.locationId}" already exists.`);
  }
  await storeFirebaseData(`${GUDANG_PATHS.locations}/${location.locationId}`, location);
  return success(location);
}

/** One-shot read of a single Location by id. */
export async function getLocation(locationId) {
  if (typeof locationId !== 'string' || !locationId) return failure(REPOSITORY_ERROR.INVALID_INPUT, 'getLocation: locationId is required.');
  const { readNode } = await fb();
  const res = await readNode(`${GUDANG_PATHS.locations}/${locationId}`);
  if (res.status !== 'ok') return failure(REPOSITORY_ERROR.READ_FAILED, `getLocation: read failed (${res.status}).`);
  if (res.value == null) return failure(REPOSITORY_ERROR.NOT_FOUND, `No location with id "${locationId}".`);
  return success(res.value);
}

/** All Locations, as a plain array. */
export async function listLocations() {
  const { readNode } = await fb();
  const res = await readNode(GUDANG_PATHS.locations);
  if (res.status !== 'ok') return failure(REPOSITORY_ERROR.READ_FAILED, `listLocations: read failed (${res.status}).`);
  return success(Object.values(res.value || {}));
}
