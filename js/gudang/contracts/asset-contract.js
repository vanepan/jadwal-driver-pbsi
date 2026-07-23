/* ============================================================
   ASSET-CONTRACT.JS — Gudang Foundation (Phase 1, Part 3)

   Authorized by: Doc 1 Art.V (Assets vs. Consumables) · Doc 3 Ch.06 (Asset
   Engine)

   PURPOSE: fix the shape of an Asset and its AssetHistoryEntry. An Asset's
   truth is answered by "which one, and what is happening to it right now" —
   an identity, never summed, never depleted, only ever in exactly one status
   at a time (Doc 3 Ch.06). AssetHistoryEntry is the Asset Engine's own
   equivalent of Movement — append-only, attributed — structurally identical
   in spirit, but explicitly never the same model as Movement (Doc 1 Art.V:
   "must never share a data model out of convenience").

   ASSET_STATUS is exactly the four states Doc 3 Ch.06 names ("Lifecycle —
   never a quantity, always a state"). ASSET_EVENT_TYPE mirrors the four
   lifecycle facets that Chapter names (Assignment, Return, Maintenance,
   Retirement) as the vocabulary AssetHistoryEntry.eventType may take — no
   assignment/maintenance WORKFLOW is implemented behind these in Phase 1
   (STRICTLY FORBIDDEN list), only the permanent shape.

   PURE: no DOM, no Firebase, no `window`.
   ============================================================ */

'use strict';

export const ASSET_SCHEMA = 'gudang.asset@1';
export const ASSET_HISTORY_SCHEMA = 'gudang.assetHistoryEntry@1';

/** Doc 3 Ch.06 — a finite set of states; never a quantity. */
export const ASSET_STATUS = Object.freeze({
  AVAILABLE: 'available',
  ASSIGNED: 'assigned',
  MAINTENANCE: 'maintenance',
  RETIRED: 'retired',
});

/** Doc 3 Ch.06's four lifecycle facets, as the vocabulary a history entry names. */
export const ASSET_EVENT_TYPE = Object.freeze({
  ASSIGN: 'assign',
  RETURN: 'return',
  MAINTAIN: 'maintain',
  RETIRE: 'retire',
});

const ASSET_STATUSES = new Set(Object.values(ASSET_STATUS));
const ASSET_EVENT_TYPES = new Set(Object.values(ASSET_EVENT_TYPE));

/**
 * @typedef {Object} Asset
 * @property {string} assetId
 * @property {string} itemId    - the Item this Asset is the identity-lifecycle for
 * @property {string} identity  - the one unchanging fact (tag/serial) that survives every status change
 * @property {'available'|'assigned'|'maintenance'|'retired'} status
 * @property {?string} locationId
 * @property {?string} holderId - who currently holds it, when status is 'assigned'
 * @property {string} createdAt - ISO timestamp
 */

/** @param {{assetId:string, itemId:string, identity:string, status?:string,
 *   locationId?:?string, holderId?:?string}} seed
 *  @returns {Asset} */
export function makeAsset({ assetId, itemId, identity, status = ASSET_STATUS.AVAILABLE, locationId = null, holderId = null }) {
  if (typeof assetId !== 'string' || !assetId) throw new Error('makeAsset: assetId is required.');
  if (typeof itemId !== 'string' || !itemId) throw new Error('makeAsset: itemId is required.');
  if (typeof identity !== 'string' || !identity) throw new Error('makeAsset: identity is required.');
  if (!ASSET_STATUSES.has(status)) throw new Error(`makeAsset: unknown status "${status}".`);
  return Object.freeze({
    assetId,
    itemId,
    identity,
    status,
    locationId: locationId == null ? null : String(locationId),
    holderId: holderId == null ? null : String(holderId),
    createdAt: new Date().toISOString(),
  });
}

/** @param {*} asset @returns {boolean} */
export function isAsset(asset) {
  return !!asset && typeof asset === 'object'
    && typeof asset.assetId === 'string' && asset.assetId.length > 0
    && typeof asset.itemId === 'string' && asset.itemId.length > 0
    && typeof asset.identity === 'string' && asset.identity.length > 0
    && ASSET_STATUSES.has(asset.status)
    && (asset.locationId === null || typeof asset.locationId === 'string')
    && (asset.holderId === null || typeof asset.holderId === 'string')
    && typeof asset.createdAt === 'string' && asset.createdAt.length > 0;
}

/**
 * @typedef {Object} AssetHistoryEntry
 * @property {string} historyId
 * @property {string} assetId
 * @property {'assign'|'return'|'maintain'|'retire'} eventType
 * @property {string} actorId  - who (Doc 1 Art.VI, applied to Assets via Doc 3 Ch.11)
 * @property {string} reason
 * @property {string} occurredAt - ISO timestamp; immutable once written
 */

/** @param {{historyId:string, assetId:string, eventType:string, actorId:string, reason:string}} seed
 *  @returns {AssetHistoryEntry} */
export function makeAssetHistoryEntry({ historyId, assetId, eventType, actorId, reason }) {
  if (typeof historyId !== 'string' || !historyId) throw new Error('makeAssetHistoryEntry: historyId is required.');
  if (typeof assetId !== 'string' || !assetId) throw new Error('makeAssetHistoryEntry: assetId is required.');
  if (!ASSET_EVENT_TYPES.has(eventType)) throw new Error(`makeAssetHistoryEntry: unknown eventType "${eventType}".`);
  if (typeof actorId !== 'string' || !actorId) throw new Error('makeAssetHistoryEntry: actorId is required.');
  if (typeof reason !== 'string' || !reason) throw new Error('makeAssetHistoryEntry: reason is required.');
  return Object.freeze({
    historyId,
    assetId,
    eventType,
    actorId,
    reason,
    occurredAt: new Date().toISOString(),
  });
}

/** @param {*} entry @returns {boolean} */
export function isAssetHistoryEntry(entry) {
  return !!entry && typeof entry === 'object'
    && typeof entry.historyId === 'string' && entry.historyId.length > 0
    && typeof entry.assetId === 'string' && entry.assetId.length > 0
    && ASSET_EVENT_TYPES.has(entry.eventType)
    && typeof entry.actorId === 'string' && entry.actorId.length > 0
    && typeof entry.reason === 'string' && entry.reason.length > 0
    && typeof entry.occurredAt === 'string' && entry.occurredAt.length > 0;
}
