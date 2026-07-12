/* ============================================================
   DATASET-REGISTRY.JS — Bootstrap Dataset Foundation (V2.0.13)

   PURPOSE: the single process-wide directory of DatasetSpecs, mirroring
   registry/connector-registry.js's exact shape (register/get/list/has,
   idempotent per id, Map-backed, zero bootstrap entries here since this
   milestone creates no real dataset).

   RESPONSIBILITY: register/get/list/has DatasetSpecs against
   contracts/dataset-contract.js. Holds no dataset content and no import
   logic.

   DEPENDENCIES: contracts/dataset-contract.js (isDatasetSpec).

   NON-GOALS: does not create a DatasetSpec (see dataset-contract.js's
   makeDatasetSpec — a caller builds one, this file only holds it). Empty
   at bootstrap by design — "V2.0.13 DOES NOT create datasets."

   FUTURE EVOLUTION: V2.0.13.5 (Synthetic Dataset Builder) and V2.0.14
   (Dataset Import) both read through this registry rather than each
   holding their own dataset map.
   ============================================================ */

'use strict';

import { isDatasetSpec } from '../contracts/dataset-contract.js';

export const DATASET_REGISTRY_ERRORS = Object.freeze({
  INVALID_DATASET_SPEC: 'INVALID_DATASET_SPEC',
});

/** @type {Map<string, object>} */
const _datasets = new Map();

/** Idempotent per id (re-registering the same id replaces it — a
 *  DatasetSpec revision should go through reviseDatasetSpec() first, then
 *  be re-registered under the same datasetId). */
export function registerDataset(spec) {
  if (!isDatasetSpec(spec)) {
    const err = new Error('registerDataset: spec must satisfy the DatasetSpec contract.');
    err.code = DATASET_REGISTRY_ERRORS.INVALID_DATASET_SPEC;
    throw err;
  }
  _datasets.set(spec.datasetId, spec);
  return spec;
}

export function getDataset(datasetId) {
  return _datasets.get(datasetId) || null;
}

export function hasDataset(datasetId) {
  return _datasets.has(datasetId);
}

export function listDatasets(filter = {}) {
  let specs = [..._datasets.values()];
  if (filter.datasetType) specs = specs.filter((s) => s.datasetType === filter.datasetType);
  if (filter.domainType) specs = specs.filter((s) => s.domainType === filter.domainType);
  return Object.freeze(specs);
}

/** Test/teardown helper. Not used by any runtime path. */
export function resetDatasetRegistry() {
  _datasets.clear();
}
