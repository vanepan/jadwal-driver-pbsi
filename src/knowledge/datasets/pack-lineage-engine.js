/* ============================================================
   PACK-LINEAGE-ENGINE.JS — Synthetic Dataset Builder Foundation (V2.0.13.5)

   PURPOSE: "Dataset Lineage" — walks a DatasetPack's `parentPackId` chain
   back to its root, the same bounded-walk shape as knowledge/
   dependency-graph/knowledge-graph-engine.js's BFS, but over a strict
   linear parent chain (one parent per pack) rather than a general graph.

   RESPONSIBILITY: `getPackLineage(packId)`.

   DEPENDENCIES: registry/pack-registry.js.

   NON-GOALS: does not create or modify a pack. A cycle (a pack that is
   its own ancestor) is a data-integrity bug elsewhere, not something this
   engine tries to "fix" — it stops walking and reports the cycle instead
   of looping forever.
   ============================================================ */

'use strict';

import { getPack } from './registry/pack-registry.js';

/**
 * @param {string} packId
 * @returns {{ok: boolean, chain: import('./contracts/dataset-pack-contract.js').DatasetPack[], cycleDetected: boolean, error: object|null}}
 *   `chain` is ordered root-first, ending with the pack itself.
 */
export function getPackLineage(packId) {
  const visited = new Set();
  const reverseChain = [];
  let current = getPack(packId);

  if (!current) {
    return { ok: false, chain: [], cycleDetected: false, error: { code: 'NOT_FOUND', message: `No pack registered under "${packId}".` } };
  }

  while (current) {
    if (visited.has(current.packId)) {
      return { ok: false, chain: Object.freeze(reverseChain.reverse()), cycleDetected: true, error: { code: 'CYCLE_DETECTED', message: `Lineage cycle detected at "${current.packId}".` } };
    }
    visited.add(current.packId);
    reverseChain.push(current);
    current = current.parentPackId ? getPack(current.parentPackId) : null;
  }

  return { ok: true, chain: Object.freeze(reverseChain.reverse()), cycleDetected: false, error: null };
}

/** @param {string} packId @returns {number} 0 for a root pack, incrementing per ancestor */
export function getPackDepth(packId) {
  const result = getPackLineage(packId);
  return result.ok ? result.chain.length - 1 : -1;
}
