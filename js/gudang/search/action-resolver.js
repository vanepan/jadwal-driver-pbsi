/* ============================================================
   ACTION-RESOLVER.JS — Gudang Search Foundation (Phase 3, Part 1)

   Authorized by: Doc 1 Art.III / R-13 (search resolves into action) ·
   Doc 3 Ch.08 (Search Engine — Action Resolution facet) · Doc 4 Art.IV
   (Search may resolve into any engine, but may never become the engine
   it resolves into)

   PURPOSE: give Action Resolution — one of Search Engine's five facets
   (Doc 3 Ch.08) — its own shape. search-resolver.js (Phase 1) already
   NAMES which actions a SearchResult offers (today: 'open' only, per its
   own header: "adding a real action here belongs to the phase that
   builds the engine which owns it"). This file does not add new actions.
   It turns a named action into an INTENT — a plain, inert description of
   what should happen next — that some future engine's UI can act on.
   Resolving an intent is not performing it: nothing here calls a
   repository, touches Firebase, or renders anything (Doc 4 F-07/F-08).

   Doc 1 Art.III names the full set of actions a search result may one day
   resolve into: open, issue, receive, adjustment, stock opname, scan
   (future). ACTION_OWNERSHIP below lists all of them so that seam is
   visible in code — but only 'open' is marked available, because only
   Search + Item/Location/Department exist today. Marking issue/receive/
   adjustment/stockOpname available before Phase 4/5/7 build the engines
   that own them would be Search inventing a destination that doesn't
   exist yet (Doc 4 F-06 business logic inside UI, F-07 inside Search,
   F-08 Search becoming a God Object).

   PURE: no DOM, no Firebase, no `window`.
   ============================================================ */

'use strict';

import { isSearchResult } from '../contracts/search-result-contract.js';
import { success, failure } from '../repository/repository-result.js';

/** Every action Doc 1 Art.III names a search result may resolve into, and
 *  which engine would own performing it. `available: false` means that
 *  engine does not exist yet — the seam stays dormant until the phase
 *  that ratifies it activates it (Doc 4 Art.VI). */
export const ACTION_OWNERSHIP = Object.freeze({
  open: Object.freeze({ label: 'Open', ownerEngine: 'item', available: true }),
  issue: Object.freeze({ label: 'Goods Out', ownerEngine: 'consumable', available: false }),
  receive: Object.freeze({ label: 'Goods In', ownerEngine: 'consumable', available: false }),
  adjustment: Object.freeze({ label: 'Adjustment', ownerEngine: 'consumable', available: false }),
  stockOpname: Object.freeze({ label: 'Stock Opname', ownerEngine: 'consumable', available: false }),
  scan: Object.freeze({ label: 'Scan', ownerEngine: 'search', available: false }),
});

/** @param {string} actionId @returns {boolean} */
export function isKnownAction(actionId) {
  return Object.prototype.hasOwnProperty.call(ACTION_OWNERSHIP, actionId);
}

/** @param {string} actionId @returns {boolean} */
export function isActionAvailable(actionId) {
  return isKnownAction(actionId) && ACTION_OWNERSHIP[actionId].available === true;
}

/**
 * Turn one of a SearchResult's offered actions into an inert intent.
 * Never executes anything — the caller decides what, if anything, to do
 * with the intent (Doc 4 Art.IV: Search hands off, it never performs).
 * @param {import('../contracts/search-result-contract.js').SearchResult} result
 * @param {string} actionId
 * @returns {{ok:true, data:{type:string, ownerDomain:string, refId:string, ownerEngine:string}, error:null}|{ok:false, data:null, error:{code:string, message:string}}}
 */
export function resolveAction(result, actionId) {
  if (!isSearchResult(result)) {
    return failure('INVALID_RESULT', 'resolveAction: result does not satisfy the SearchResult contract.');
  }
  if (!isKnownAction(actionId)) {
    return failure('UNKNOWN_ACTION', `resolveAction: "${actionId}" is not one of the actions Doc 1 Art.III names.`);
  }
  if (!result.actions.includes(actionId)) {
    return failure('ACTION_NOT_OFFERED', `resolveAction: "${actionId}" is not among this result's offered actions.`);
  }
  if (!isActionAvailable(actionId)) {
    return failure('ACTION_UNAVAILABLE', `resolveAction: "${actionId}" has no owning engine yet.`);
  }
  const owner = ACTION_OWNERSHIP[actionId];
  return success(Object.freeze({
    type: actionId,
    ownerDomain: result.ownerDomain,
    refId: result.refId,
    ownerEngine: owner.ownerEngine,
  }));
}

/**
 * The result's primary action — the first entry in its actions[] list
 * (Doc 2 §05/§12: Enter triggers "the focused row's primary action").
 * @param {import('../contracts/search-result-contract.js').SearchResult} result
 * @returns {?string}
 */
export function primaryAction(result) {
  if (!isSearchResult(result) || result.actions.length === 0) return null;
  return result.actions[0];
}
