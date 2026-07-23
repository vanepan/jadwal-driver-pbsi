/* ============================================================
   INCREMENTAL-CURSOR-CONTRACT.JS — Knowledge Observability (V2, Phase 9.1)

   PURPOSE: formalize the persisted form of
   builder/contracts/context-contract.js's IndexWatermark
   (`{connectorId, lastIndexedAt}`) — that typedef already fixes the SHAPE
   a BuilderContext carries in memory; this contract fixes what gets
   PERSISTED between runs (see acquisition/cursor-store.js) and adds an
   optional `cursorToken` for a future connector whose source needs
   offset/pagination cursors beyond a timestamp watermark. Deliberately
   interoperable with IndexWatermark, not a competing shape — see
   `toWatermark`/`fromWatermark`.

   RESPONSIBILITY: define IncrementalCursor, a validity check, and
   converters to/from IndexWatermark.

   DEPENDENCIES: none (converters are structural, not an import of
   context-contract.js, to avoid coupling this contract to the Builder).
   ============================================================ */

'use strict';

export const INCREMENTAL_CURSOR_SCHEMA = 'knowledge-incremental-cursor@1';

/**
 * @typedef {Object} IncrementalCursor
 * @property {string} connectorId
 * @property {string|null} lastIndexedAt - ISO 8601, or null if never acquired
 * @property {string|null} cursorToken   - opaque pagination token, unused by nor (single-shot fetch)
 */

export function makeCursor(connectorId, { lastIndexedAt = null, cursorToken = null } = {}) {
  return Object.freeze({ connectorId, lastIndexedAt, cursorToken });
}

export function isIncrementalCursor(c) {
  return !!c && typeof c === 'object' && typeof c.connectorId === 'string' && c.connectorId.length > 0;
}

/** @returns {import('../../builder/contracts/context-contract.js').IndexWatermark} */
export function toWatermark(cursor) {
  return Object.freeze({ connectorId: cursor.connectorId, lastIndexedAt: cursor.lastIndexedAt });
}

/** @param {import('../../builder/contracts/context-contract.js').IndexWatermark} watermark */
export function fromWatermark(watermark) {
  return makeCursor(watermark.connectorId, { lastIndexedAt: watermark.lastIndexedAt });
}
