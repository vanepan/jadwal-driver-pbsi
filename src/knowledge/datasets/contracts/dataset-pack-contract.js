/* ============================================================
   DATASET-PACK-CONTRACT.JS — Synthetic Dataset Builder Foundation (V2.0.13.5)

   PURPOSE: fix the shape of a DatasetPack — a registered, versioned,
   lineage-tracked UNIT of a Dataset (contracts/dataset-contract.js). A
   Dataset is the specification ("Sarpras NOR — Bootstrap Pack, type
   synthetic"); a DatasetPack is one concrete, versioned cut of it,
   analogous to how a KnowledgeItem's `id` is stable across versions
   while each version is its own row. This milestone builds the FRAMEWORK
   only — `itemCount` is always 0 and `targetItemCount` is a forward-
   looking number a future generation step (explicitly out of scope: "the
   roadmap's 50-100 Sarpras NOR / 10-20 Sarpras Reports do not exist yet")
   would eventually fill.

   RESPONSIBILITY: define DatasetPack and a constructor. Lineage
   (parent/derived-from) is a single `parentPackId` pointer here — walking
   the full chain is pack-lineage-engine.js's job, mirroring how
   identity-contract.js fixes version increment while
   repository/knowledge-repository.js does the actual read.

   DEPENDENCIES: contracts/dataset-contract.js (a pack's datasetId must
   reference a real DatasetSpec shape, though this contract does not
   itself check registry membership — see pack-registry.js for that).

   NON-GOALS: does not generate any content. Does not decide quality — see
   pack-quality-engine.js. Does not compute statistics — reuses
   machine-learning/statistics-engine.js directly once a pack has real
   numeric payload fields; no second statistics engine is built here.

   FUTURE EVOLUTION: a real generator (out of scope for the entire V2
   roadmap through V2.0.17) would call `makePack` once per generated
   batch and set `itemCount`/`targetItemCount` to real, matching numbers.
   ============================================================ */

'use strict';

export const DATASET_PACK_SCHEMA = 'dataset-pack@1';

/**
 * @typedef {Object} DatasetPack
 * @property {string} packId
 * @property {string} datasetId        - the DatasetSpec this pack belongs to
 * @property {number} version          - append-only, starts at 1
 * @property {string|null} parentPackId - lineage: the pack this one was derived from, or null (root)
 * @property {number} targetItemCount  - forward-looking target (e.g. 100) — a plan, not a count
 * @property {number} itemCount        - actual items in this pack; always 0 until a real generator exists
 * @property {string|null} notes
 * @property {string} createdAt        - ISO 8601
 */

let _counter = 0;

export function makePack(datasetId, { parentPackId = null, targetItemCount = 0, notes = null } = {}) {
  _counter += 1;
  return Object.freeze({
    packId: `pack:${datasetId}:${Date.now()}:${_counter}`,
    datasetId, version: 1, parentPackId, targetItemCount, itemCount: 0, notes,
    createdAt: new Date().toISOString(),
  });
}

/** @param {*} p @returns {boolean} */
export function isDatasetPack(p) {
  return !!p && typeof p === 'object'
    && typeof p.packId === 'string' && p.packId.length > 0
    && typeof p.datasetId === 'string' && p.datasetId.length > 0
    && typeof p.version === 'number' && p.version >= 1
    && (p.parentPackId === null || typeof p.parentPackId === 'string')
    && typeof p.targetItemCount === 'number' && p.targetItemCount >= 0
    && typeof p.itemCount === 'number' && p.itemCount >= 0
    && typeof p.createdAt === 'string' && p.createdAt.length > 0;
}
