/* ============================================================
   MOVEMENT-CONTRACT.JS — Gudang Foundation (Phase 1, Part 3)

   Authorized by: Doc 1 Art.IV (Movement First) · Doc 3 Ch.04 (Movement
   Engine) · Doc 2 §06/§07 (movement reasons named in the Blueprint)

   PURPOSE: fix the shape of a Movement — the one atomic unit of quantity
   truth in Gudang (Doc 1 Art.IV: "Stock is never manually edited. Stock is
   always derived from movements."). A Movement is created once and never
   edited or deleted; a correction is itself a new Movement (same Article).
   This contract enforces that by construction: makeMovement has no update
   path, and every Movement returned is frozen.

   MOVEMENT_TYPE is exactly the seven types Doc 3 Ch.04 names — no more, no
   fewer. FUTURE_RESERVATION is reserved vocabulary only (Doc 3 Ch.04's own
   words): it exists here as a name a future phase may use, not a behavior
   this phase implements — nothing computes a Stock effect for it yet.

   MOVEMENT_REASON mirrors the reason vocabulary Document 2 already ratified
   for Goods In (§07: Purchase / Return / Transfer / Adjustment) plus Stock
   Opname's pre-filled reason (§10). It is not a new business rule invented
   here — it is Document 2's own words given a shape.

   AMENDED — Phase 4 (Goods Out), user-approved 2026-07-24: added ISSUE.
   Doc 2 §06 (Goods Out) never asks the user to choose a reason — its only
   up-front choice is a department — yet makeMovement() requires every
   Movement to carry one. None of the original 5 values fit: TRANSFER is
   specifically defined (via §07) as a Goods-In-direction reason ("received
   via transfer"), so reusing it for the opposite direction would later
   read backwards in Movement History (Phase 6). Rather than silently
   guess a value or reinterpret an existing one to mean two opposite
   things, this was raised to the user as a real gap between two already-
   ratified documents; ISSUE ("issued to a department for use") was their
   explicit choice. This is a small, on-the-record amendment (Doc 4
   Art.IX), not a redesign — the other five values and every other rule in
   this file are untouched.

   AMENDED — Phase 5 (Goods In): added an optional `price` field. Doc 2 §07
   is explicit and unambiguous — "Price is optional, always... If entered,
   it feeds Monthly Cost and Restock Trend in Analytics (§11)... Never force
   a user to enter financial information" — but Phase 1's Movement shape had
   nowhere to hold it. Doc 3 Ch.09 says Analytics computes from "Movement,
   Stock, and Asset History," and Monthly Cost is a per-period aggregate
   (price × quantity across movements), which needs price captured per
   Movement at receipt time — a single running Item.metadata.averageCost
   could not reconstruct history correctly. Unlike the Goods Out reason gap
   (Phase 4), this isn't a contradiction needing a user decision: Doc 2 §07
   already fully specifies the behavior, this only gives it a field to live
   in. `price` is nullable and never validated as required.

   PURE: no DOM, no Firebase, no `window`.
   ============================================================ */

'use strict';

export const MOVEMENT_SCHEMA = 'gudang.movement@1';

/** Doc 3 Ch.04 — exactly these seven. */
export const MOVEMENT_TYPE = Object.freeze({
  GOODS_IN: 'goods_in',
  GOODS_OUT: 'goods_out',
  TRANSFER: 'transfer',
  ADJUSTMENT: 'adjustment',
  STOCK_OPNAME_ADJUSTMENT: 'stock_opname_adjustment',
  RETURN: 'return',
  FUTURE_RESERVATION: 'future_reservation', // reserved — no Stock effect implemented yet
});

/** Doc 2 §07/§10 — the reason vocabulary already ratified in the Blueprint,
 *  plus ISSUE (Phase 4 amendment — see header note above). */
export const MOVEMENT_REASON = Object.freeze({
  PURCHASE: 'purchase',
  RETURN: 'return',
  TRANSFER: 'transfer',
  ADJUSTMENT: 'adjustment',
  STOCK_OPNAME: 'stock_opname',
  ISSUE: 'issue',
});

const MOVEMENT_TYPES = new Set(Object.values(MOVEMENT_TYPE));
const MOVEMENT_REASONS = new Set(Object.values(MOVEMENT_REASON));

/**
 * @typedef {Object} Movement
 * @property {string} movementId
 * @property {string} itemId
 * @property {string} type          - one of MOVEMENT_TYPE
 * @property {number} quantityDelta - signed; +in, -out (Doc 3 Ch.05 sums these to derive Stock)
 * @property {string} reason        - one of MOVEMENT_REASON
 * @property {?string} locationId
 * @property {?string} departmentId
 * @property {string} actorId       - who (Doc 1 Art.VI)
 * @property {?number} price        - optional unit price at receipt (Doc 2 §07); null when not entered; never required
 * @property {string} createdAt     - ISO timestamp; immutable once written
 */

/** @param {{movementId:string, itemId:string, type:string, quantityDelta:number,
 *   reason:string, locationId?:?string, departmentId?:?string, actorId:string, price?:?number}} seed
 *  @returns {Movement} */
export function makeMovement({
  movementId, itemId, type, quantityDelta, reason,
  locationId = null, departmentId = null, actorId, price = null,
}) {
  if (typeof movementId !== 'string' || !movementId) throw new Error('makeMovement: movementId is required.');
  if (typeof itemId !== 'string' || !itemId) throw new Error('makeMovement: itemId is required.');
  if (!MOVEMENT_TYPES.has(type)) throw new Error(`makeMovement: unknown movement type "${type}".`);
  if (typeof quantityDelta !== 'number' || !Number.isFinite(quantityDelta) || quantityDelta === 0) {
    throw new Error('makeMovement: quantityDelta must be a non-zero finite number.');
  }
  if (!MOVEMENT_REASONS.has(reason)) throw new Error(`makeMovement: unknown movement reason "${reason}".`);
  if (typeof actorId !== 'string' || !actorId) throw new Error('makeMovement: actorId is required (Doc 1 Art.VI — every movement is attributed).');
  if (price != null && (typeof price !== 'number' || !Number.isFinite(price) || price < 0)) {
    throw new Error('makeMovement: price, when provided, must be a non-negative finite number (Doc 2 §07: optional, never required).');
  }

  return Object.freeze({
    movementId,
    itemId,
    type,
    quantityDelta,
    reason,
    locationId: locationId == null ? null : String(locationId),
    departmentId: departmentId == null ? null : String(departmentId),
    actorId,
    price: price == null ? null : price,
    createdAt: new Date().toISOString(),
  });
}

/** @param {*} movement @returns {boolean} */
export function isMovement(movement) {
  return !!movement && typeof movement === 'object'
    && typeof movement.movementId === 'string' && movement.movementId.length > 0
    && typeof movement.itemId === 'string' && movement.itemId.length > 0
    && MOVEMENT_TYPES.has(movement.type)
    && typeof movement.quantityDelta === 'number' && Number.isFinite(movement.quantityDelta) && movement.quantityDelta !== 0
    && MOVEMENT_REASONS.has(movement.reason)
    && (movement.locationId === null || typeof movement.locationId === 'string')
    && (movement.departmentId === null || typeof movement.departmentId === 'string')
    && typeof movement.actorId === 'string' && movement.actorId.length > 0
    && (movement.price === null || (typeof movement.price === 'number' && Number.isFinite(movement.price) && movement.price >= 0))
    && typeof movement.createdAt === 'string' && movement.createdAt.length > 0;
}
