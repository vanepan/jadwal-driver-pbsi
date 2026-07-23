/* ============================================================
   LOCATION-CONTRACT.JS — Gudang Foundation (Phase 1, Part 3)

   Authorized by: Doc 3 Ch.03 (Location — "where a thing is, referenced by
   Movement and Asset, owns nothing beyond its own name")

   PURPOSE: fix the shape of a Location. Deliberately the lightest contract
   in the module — Document 3 calls it "Core, lightweight" for a reason: it
   is a name Movement and Asset point at, never a business rule of its own.

   PURE: no DOM, no Firebase, no `window`.
   ============================================================ */

'use strict';

export const LOCATION_SCHEMA = 'gudang.location@1';

/**
 * @typedef {Object} Location
 * @property {string} locationId
 * @property {string} name
 * @property {?string} parentLocationId - optional hierarchy (e.g. a shelf under a room)
 * @property {string} createdAt
 */

/** @param {{locationId:string, name:string, parentLocationId?:?string}} seed
 *  @returns {Location} */
export function makeLocation({ locationId, name, parentLocationId = null }) {
  if (typeof locationId !== 'string' || !locationId) throw new Error('makeLocation: locationId is required.');
  if (typeof name !== 'string' || !name) throw new Error('makeLocation: name is required.');
  return Object.freeze({
    locationId,
    name,
    parentLocationId: parentLocationId == null ? null : String(parentLocationId),
    createdAt: new Date().toISOString(),
  });
}

/** @param {*} location @returns {boolean} */
export function isLocation(location) {
  return !!location && typeof location === 'object'
    && typeof location.locationId === 'string' && location.locationId.length > 0
    && typeof location.name === 'string' && location.name.length > 0
    && (location.parentLocationId === null || typeof location.parentLocationId === 'string')
    && typeof location.createdAt === 'string' && location.createdAt.length > 0;
}
