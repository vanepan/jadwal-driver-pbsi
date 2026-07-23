/* ============================================================
   STOCK-PROJECTION-ENGINE.JS — Gudang Foundation (Phase 1, Part 5)

   Authorized by: Doc 1 Art.IV (Movement is Truth / Stock is Derived) ·
   Doc 3 Ch.05 (Stock Engine)

   PURPOSE: the permanent guarantee Document 3 Ch.05 requires:

       Movement
         ↓
       Projection
         ↓
       Current Stock

   `deriveQuantity` / `rebuildProjection` / `isProjectionConsistent` are pure
   — plain data in, plain data out, no repository, no Firebase. They ARE the
   "movement always wins" rule made literal: quantity is nothing but the sum
   of every Movement's quantityDelta, recomputed from scratch, never read
   from anywhere else.

   `recalculateStock` is the one thin orchestrator that composes
   repository/movement-repository.js (read Movement) and
   repository/stock-repository.js (persist the resulting Projection) — this
   IS Doc 3 Ch.05's "Rebuild": recomputing a Projection from scratch from the
   complete Movement history, discarding whatever the cache said before. It
   stays Node-importable without Firebase credentials because both
   repositories it calls lazy-import firebase.js internally and only touch
   it once actually invoked.

   Doc 3 Ch.05 deliberately does not prescribe HOW OFTEN or ON WHAT TRIGGER a
   Rebuild runs (Recovery) — that is implementation left to a future phase.
   What this file fixes permanently is direction: Movement is never corrected
   to match a Projection. A Projection is always corrected to match Movement.
   ============================================================ */

'use strict';

import { makeStockProjection } from '../contracts/stock-projection-contract.js';
import { listMovements } from '../repository/movement-repository.js';
import { saveProjection } from '../repository/stock-repository.js';

/** Sum every Movement's signed quantityDelta. Pure. @param {Array} movements @returns {number} */
export function deriveQuantity(movements) {
  return movements.reduce((sum, m) => sum + m.quantityDelta, 0);
}

/**
 * Rebuild a StockProjection from a complete Movement list. Pure — the same
 * movements always produce the same Projection.
 * @param {string} itemId
 * @param {Array} movements - already filtered to this itemId, any order
 * @returns {import('../contracts/stock-projection-contract.js').StockProjection}
 */
export function rebuildProjection(itemId, movements) {
  // Sort by createdAt, then movementId as a tiebreaker — two Movements can
  // share the same millisecond (rapid succession, or clock resolution), and
  // an unstable/ambiguous order would make "the last Movement" meaningless.
  // The tiebreaker keeps this deterministic without needing sub-millisecond
  // timestamps anywhere upstream.
  const ordered = [...movements].sort((a, b) => {
    const byTime = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    return byTime !== 0 ? byTime : String(a.movementId).localeCompare(String(b.movementId));
  });
  const quantity = deriveQuantity(ordered);
  const last = ordered.length ? ordered[ordered.length - 1] : null;
  return makeStockProjection({
    itemId,
    quantity,
    lastMovementId: last ? last.movementId : null,
    consistent: true,
  });
}

/**
 * Doc 3 Ch.05's Consistency check: does `projection` still match what
 * `movements` implies? Pure — never mutates either argument.
 * @param {?import('../contracts/stock-projection-contract.js').StockProjection} projection
 * @param {Array} movements
 * @returns {boolean}
 */
export function isProjectionConsistent(projection, movements) {
  if (!projection) return false;
  const expected = rebuildProjection(projection.itemId, movements);
  return projection.quantity === expected.quantity && projection.lastMovementId === expected.lastMovementId;
}

/**
 * Recalculation: read every Movement for `itemId`, rebuild the Projection,
 * persist it. This is the one place a Rebuild actually runs end-to-end.
 * @param {string} itemId
 * @returns {Promise<{ok:boolean, data:*, error:*}>}
 */
export async function recalculateStock(itemId) {
  const movementsRes = await listMovements({ itemId });
  if (!movementsRes.ok) return movementsRes;
  const projection = rebuildProjection(itemId, movementsRes.data);
  return saveProjection(projection);
}
