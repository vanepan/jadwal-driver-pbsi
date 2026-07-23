/* ============================================================
   DATASET-CONTRACT.JS — Bootstrap Dataset Foundation (V2.0.13)

   PURPOSE: fix the shape of a DatasetSpec — a registered SPECIFICATION of
   a named, classified, versioned collection of Knowledge, kept separate
   from any actual dataset content (Decision, V2 roadmap: this milestone
   builds the spec layer only; no dataset exists yet). A DatasetSpec sits
   ABOVE a KnowledgeSource (acquisition/contracts/source-contract.js) —
   "Official NOR" and "Bootstrap Sarpras NOR" may both eventually read
   through the same nor-connector.js Source, but are two different
   Datasets with two different classifications and weights.

   RESPONSIBILITY: define DatasetSpec, DATASET_TYPE (the closed set of
   five types the roadmap names), and a structural validator. Versioning
   reuses knowledge/contracts/identity-contract.js's `nextVersion` — a
   DatasetSpec revision (e.g. re-scoping which domainType it covers) is a
   new version, never an in-place overwrite, exactly like a KnowledgeItem.

   DEPENDENCIES: knowledge/contracts/identity-contract.js (nextVersion,
   re-exported — no second version-increment rule invented),
   knowledge/registry/domain-type-registry.js (a Dataset's domainType must
   already be registered vocabulary, same rule knowledge-item-contract.js
   enforces).

   NON-GOALS: does not create, import, or hold any dataset content — see
   V2.0.13.5 (Synthetic Dataset Builder Foundation, packs only) and
   V2.0.14 (Dataset Import Foundation, wiring only). Does not decide
   trust/weight — see dataset-classification-contract.js.

   FUTURE EVOLUTION: V2.0.14's dataset-import-service.js reads a
   DatasetSpec's `sourceId` to know which registered KnowledgeSource to
   acquire through; this contract should not need to change for that.
   ============================================================ */

'use strict';

import { hasDomainType } from '../../registry/domain-type-registry.js';
import { nextVersion } from '../../contracts/identity-contract.js';

export const DATASET_SCHEMA = 'dataset-spec@1';

/** The closed set of five Dataset types the roadmap names. */
export const DATASET_TYPE = Object.freeze({
  OFFICIAL: 'official',
  HISTORICAL: 'historical',
  SYNTHETIC: 'synthetic',
  TRAINING: 'training',
  CORRECTION: 'correction',
});

/**
 * @typedef {Object} DatasetSpec
 * @property {string} datasetId     - stable identity across versions
 * @property {number} version       - append-only, same invariants as KnowledgeItem
 * @property {string} name          - human-readable, e.g. "Sarpras NOR — Official Archive"
 * @property {string} datasetType   - one of DATASET_TYPE
 * @property {string} domainType    - registry-backed (registry/domain-type-registry.js)
 * @property {string|null} sourceId - a registered KnowledgeSource id (acquisition/contracts/source-contract.js) this dataset reads through, or null if not yet wired
 * @property {string} description
 * @property {string} createdAt     - ISO 8601
 * @property {string} updatedAt     - ISO 8601
 */

export function makeDatasetSpec({ datasetId, name, datasetType, domainType, sourceId = null, description = '' }) {
  const now = new Date().toISOString();
  return Object.freeze({
    datasetId, version: 1, name, datasetType, domainType, sourceId,
    description, createdAt: now, updatedAt: now,
  });
}

/** A revision is a NEW version — never an in-place field overwrite. */
export function reviseDatasetSpec(spec, patch) {
  return Object.freeze({
    ...spec, ...patch, datasetId: spec.datasetId,
    version: nextVersion(spec.version),
    updatedAt: new Date().toISOString(),
  });
}

/** @param {*} spec @returns {boolean} */
export function isDatasetSpec(spec) {
  return !!spec && typeof spec === 'object'
    && typeof spec.datasetId === 'string' && spec.datasetId.length > 0
    && typeof spec.version === 'number' && spec.version >= 1
    && typeof spec.name === 'string' && spec.name.length > 0
    && Object.values(DATASET_TYPE).includes(spec.datasetType)
    && typeof spec.domainType === 'string' && hasDomainType(spec.domainType)
    && (spec.sourceId === null || typeof spec.sourceId === 'string')
    && typeof spec.createdAt === 'string' && typeof spec.updatedAt === 'string';
}
