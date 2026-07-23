/* ============================================================
   CURSOR-STORE.JS — Knowledge Acquisition (V2, Phase 9.1)

   PURPOSE: persist the IncrementalCursor (observability/contracts/
   incremental-cursor-contract.js) each connector needs to acquire only
   what's changed since its last run — the piece
   knowledge/builder/contracts/context-contract.js's own header explicitly
   deferred ("Future Evolution: Phase 4+ populates watermarks from wherever
   the Builder decides to persist them"). This IS that "wherever": a
   process-wide Map, the exact same non-durable singleton idiom already
   used by every registry in this tree (connector-registry.js,
   stage-registry.js, domain-type-registry.js) — not a new persistence
   strategy, the same one, applied to a new piece of state.

   RESPONSIBILITY: get/set/list/reset cursors, keyed by connectorId.

   DEPENDENCIES: observability/contracts/incremental-cursor-contract.js.

   NON-GOALS: does not decide WHEN to advance a cursor — see
   acquisition-engine.js, which calls `setCursor()` once per successful run.
   Non-durable: a process restart forgets every cursor, exactly like every
   other registry in this tree (MemoryRepository included).
   ============================================================ */

'use strict';

import { makeCursor, isIncrementalCursor } from '../observability/contracts/incremental-cursor-contract.js';

/** @type {Map<string, import('./contracts/incremental-cursor-contract.js').IncrementalCursor>} */
const _cursors = new Map();

export function getCursor(connectorId) {
  return _cursors.get(connectorId) || null;
}

export function setCursor(connectorId, { lastIndexedAt, cursorToken = null } = {}) {
  const cursor = makeCursor(connectorId, { lastIndexedAt, cursorToken });
  if (!isIncrementalCursor(cursor)) throw new Error('setCursor: resulting cursor is invalid.');
  _cursors.set(connectorId, cursor);
  return cursor;
}

export function listCursors() {
  return Object.freeze([..._cursors.values()]);
}

/** Test/teardown helper. Not used by any runtime path. */
export function resetCursorStore() {
  _cursors.clear();
}
