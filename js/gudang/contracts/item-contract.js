/* ============================================================
   ITEM-CONTRACT.JS — Gudang Foundation (Phase 1, Part 3)

   Authorized by: Doc 3 Ch.03 (Item — "identity only, whether it is a
   Consumable or an Asset, nothing else")

   PURPOSE: fix the shape of an Item. An Item is deliberately thin — it never
   knows how to compute a forecast, resolve a search, or record a movement
   (Doc 3 Ch.14, "God objects" is a named Anti-Architecture rejection). It
   only answers one question: is this thing counted (Consumable) or
   identified (Asset)?

   NON-GOALS: this contract does not decide Consumable vs Asset business
   rules — that split lives in Doc 3 Ch.05/Ch.06 and is enforced by which
   repository/engine a future phase builds on top of `itemType`, never by a
   branch inside Item itself.

   PURE: no DOM, no Firebase, no `window`.
   ============================================================ */

'use strict';

export const ITEM_SCHEMA = 'gudang.item@1';

/** Doc 3 Ch.03/06: the only two lifecycles an Item may declare. */
export const ITEM_TYPE = Object.freeze({
  CONSUMABLE: 'consumable',
  ASSET: 'asset',
});

/**
 * @typedef {Object} Item
 * @property {string} itemId
 * @property {string} name
 * @property {'consumable'|'asset'} itemType - never both, never neither (Doc 1 Art.V)
 * @property {?string} locationId            - nullable; where it normally lives
 * @property {string} createdAt              - ISO timestamp
 */

/** @param {{itemId:string, name:string, itemType:string, locationId?:?string}} seed
 *  @returns {Item} */
export function makeItem({ itemId, name, itemType, locationId = null }) {
  if (typeof itemId !== 'string' || !itemId) throw new Error('makeItem: itemId is required.');
  if (typeof name !== 'string' || !name) throw new Error('makeItem: name is required.');
  if (itemType !== ITEM_TYPE.CONSUMABLE && itemType !== ITEM_TYPE.ASSET) {
    throw new Error('makeItem: itemType must be "consumable" or "asset".');
  }
  return Object.freeze({
    itemId,
    name,
    itemType,
    locationId: locationId == null ? null : String(locationId),
    createdAt: new Date().toISOString(),
  });
}

/** @param {*} item @returns {boolean} */
export function isItem(item) {
  return !!item && typeof item === 'object'
    && typeof item.itemId === 'string' && item.itemId.length > 0
    && typeof item.name === 'string' && item.name.length > 0
    && (item.itemType === ITEM_TYPE.CONSUMABLE || item.itemType === ITEM_TYPE.ASSET)
    && (item.locationId === null || typeof item.locationId === 'string')
    && typeof item.createdAt === 'string' && item.createdAt.length > 0;
}
