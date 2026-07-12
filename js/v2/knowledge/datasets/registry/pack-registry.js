/* ============================================================
   PACK-REGISTRY.JS — Synthetic Dataset Builder Foundation (V2.0.13.5)

   PURPOSE: the process-wide directory of DatasetPacks, mirroring
   dataset-registry.js's own shape exactly (register/get/list/has,
   idempotent per id, Map-backed, empty at bootstrap).

   RESPONSIBILITY: register/get/list/has DatasetPacks against
   contracts/dataset-pack-contract.js.

   DEPENDENCIES: contracts/dataset-pack-contract.js (isDatasetPack).
   ============================================================ */

'use strict';

import { isDatasetPack } from '../contracts/dataset-pack-contract.js';

export const PACK_REGISTRY_ERRORS = Object.freeze({
  INVALID_PACK: 'INVALID_PACK',
});

/** @type {Map<string, object>} */
const _packs = new Map();

export function registerPack(pack) {
  if (!isDatasetPack(pack)) {
    const err = new Error('registerPack: pack must satisfy the DatasetPack contract.');
    err.code = PACK_REGISTRY_ERRORS.INVALID_PACK;
    throw err;
  }
  _packs.set(pack.packId, pack);
  return pack;
}

export function getPack(packId) {
  return _packs.get(packId) || null;
}

export function hasPack(packId) {
  return _packs.has(packId);
}

export function listPacks(filter = {}) {
  let packs = [..._packs.values()];
  if (filter.datasetId) packs = packs.filter((p) => p.datasetId === filter.datasetId);
  return Object.freeze(packs);
}

/** Test/teardown helper. Not used by any runtime path. */
export function resetPackRegistry() {
  _packs.clear();
}
