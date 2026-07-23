/* ============================================================
   PACK-QUALITY-ENGINE.JS — Synthetic Dataset Builder Foundation (V2.0.13.5)

   PURPOSE: "Dataset Quality" — a real, honest completeness read on a
   DatasetPack: `itemCount / targetItemCount`. Since this milestone builds
   framework only (no generator exists), every real pack's completeness is
   genuinely 0 today — this engine reports that truthfully rather than
   fabricating a placeholder score.

   "Dataset Statistics" (the roadmap's other quality-adjacent ask) is
   deliberately NOT reimplemented here — once a pack has real numeric
   payload fields, machine-learning/statistics-engine.js#computeFieldStatistics
   already computes exactly that; a second statistics engine would be the
   duplication the roadmap forbids.

   RESPONSIBILITY: `computePackQuality(pack)`.

   DEPENDENCIES: contracts/dataset-pack-contract.js (isDatasetPack).
   ============================================================ */

'use strict';

import { isDatasetPack } from './contracts/dataset-pack-contract.js';

export const PACK_QUALITY_SCHEMA = 'dataset-pack-quality@1';

/**
 * @param {import('./contracts/dataset-pack-contract.js').DatasetPack} pack
 * @returns {{ok: boolean, packId: string, completeness: number, isEmpty: boolean, issues: string[], computedAt: string, error: object|null}}
 */
export function computePackQuality(pack) {
  if (!isDatasetPack(pack)) {
    return { ok: false, packId: null, completeness: 0, isEmpty: true, issues: [], computedAt: new Date().toISOString(), error: { code: 'INVALID_PACK', message: 'computePackQuality: pack must satisfy the DatasetPack contract.' } };
  }

  const issues = [];
  if (pack.targetItemCount === 0) issues.push('No targetItemCount set — completeness cannot be measured against a plan.');
  if (pack.itemCount === 0) issues.push('Pack has zero items — framework only, no generator has populated it yet.');
  if (pack.itemCount > pack.targetItemCount && pack.targetItemCount > 0) issues.push('itemCount exceeds targetItemCount — the target may be stale.');

  const completeness = pack.targetItemCount > 0 ? Math.round((pack.itemCount / pack.targetItemCount) * 100) / 100 : 0;

  return {
    ok: true,
    packId: pack.packId,
    completeness,
    isEmpty: pack.itemCount === 0,
    issues,
    computedAt: new Date().toISOString(),
    error: null,
  };
}
