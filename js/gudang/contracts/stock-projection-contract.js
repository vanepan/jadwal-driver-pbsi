/* ============================================================
   STOCK-PROJECTION-CONTRACT.JS — Gudang Foundation (Phase 1, Part 3)

   Authorized by: Doc 1 Art.IV (Stock is derived, never edited) · Doc 3 Ch.05
   (Stock Engine — Projection/Rebuild/Recovery/Recalculation/Consistency)

   PURPOSE: fix the shape of a StockProjection — "Current Stock as it is
   normally read: a number kept ready in advance so no one waits for it to be
   computed on demand" (Doc 3 Ch.05). This contract fixes the SHAPE only; the
   actual derivation (movements[] -> quantity) is
   projection/stock-projection-engine.js's job (Part 5), never this file's.

   `consistent` is Doc 3 Ch.05's Consistency term made checkable: true when
   this projection was last rebuilt from the complete Movement history with
   no Movement written since; a caller that finds it false knows Recovery
   (a Rebuild) is owed before the number can be trusted — never that the
   number itself should be hand-edited (Doc 4 Art.III/F-04).

   PURE: no DOM, no Firebase, no `window`.
   ============================================================ */

'use strict';

export const STOCK_PROJECTION_SCHEMA = 'gudang.stockProjection@1';

/**
 * @typedef {Object} StockProjection
 * @property {string} itemId
 * @property {number} quantity        - the derived on-hand quantity; NEVER hand-set (Doc 1 Art.IV)
 * @property {?string} lastMovementId - the last Movement folded into this number, if any
 * @property {string} rebuiltAt       - ISO timestamp of the last full/partial recalculation
 * @property {boolean} consistent     - Doc 3 Ch.05's Consistency guarantee, made checkable
 */

/** @param {{itemId:string, quantity:number, lastMovementId?:?string, consistent?:boolean}} seed
 *  @returns {StockProjection} */
export function makeStockProjection({ itemId, quantity, lastMovementId = null, consistent = true }) {
  if (typeof itemId !== 'string' || !itemId) throw new Error('makeStockProjection: itemId is required.');
  if (typeof quantity !== 'number' || !Number.isFinite(quantity)) {
    throw new Error('makeStockProjection: quantity must be a finite number.');
  }
  return Object.freeze({
    itemId,
    quantity,
    lastMovementId: lastMovementId == null ? null : String(lastMovementId),
    rebuiltAt: new Date().toISOString(),
    consistent: Boolean(consistent),
  });
}

/** @param {*} projection @returns {boolean} */
export function isStockProjection(projection) {
  return !!projection && typeof projection === 'object'
    && typeof projection.itemId === 'string' && projection.itemId.length > 0
    && typeof projection.quantity === 'number' && Number.isFinite(projection.quantity)
    && (projection.lastMovementId === null || typeof projection.lastMovementId === 'string')
    && typeof projection.rebuiltAt === 'string' && projection.rebuiltAt.length > 0
    && typeof projection.consistent === 'boolean';
}
