/* ============================================================
   MOVEMENT-HISTORY-VIEW.JS — Gudang Audit Engine (Phase 6, Part 1)

   Authorized by: Doc 2 §09 (Movement History) · Doc 3 Ch.11 (Audit
   Engine), whose own text names this exact screen as its job: "Its only
   real job is presentation: making that already-complete trail readable,
   searchable, and fast (Blueprint §09)."

   PURPOSE: the Movement-specific reading of the audit trail Phase 1's
   audit/audit-view.js already derives. audit-view.js stays untouched —
   it is the cross-source (Movement + Asset History) primitive Doc 3
   Ch.11 fixed permanently. This file is Movement-only, reverse-
   chronological, filterable, and translates raw type/reason enum values
   into the plain words Doc 2 §09 requires ("never adopts ledger
   vocabulary — debits, credits, postings — that belongs to accounting
   software, not a warehouse"). It writes nothing and stores nothing new
   — same "presentation, not a subsystem" discipline as audit-view.js,
   reading straight from repository/movement-repository.js.

   "Searchable" (Phase 6 brief) is delivered here as the FUNCTIONAL
   capability Doc 2 §09 asks for — filtering by date/type/person — not as
   a UI decision about which search bar a future screen reuses. Doc 2 §09
   says this is "searched... through the SAME search bar the rest of the
   product uses," which (per js/services/adaptive-search.js, the app's
   actual convention) is a per-module adapter over the one global topbar
   input, not automatically a new Universal Search Engine (Phase 3)
   result type. No Gudang search adapter is registered yet, and no
   Movement History screen exists yet to register one — that wiring
   decision is left to whichever phase actually builds this screen, not
   guessed here. search-resolver.js is therefore NOT modified this phase.

   PURE where possible; I/O only in getMovementHistory (a real read).
   ============================================================ */

'use strict';

import { listMovements } from '../repository/movement-repository.js';
import { success } from '../repository/repository-result.js';

/** Doc 3 Ch.04's seven Movement types, in plain words. An unmapped type
 *  (e.g. the dormant FUTURE_RESERVATION seam) falls back to its raw value
 *  rather than throwing — this file never branches on that seam by name.
 *  Exported (V1.28.0 Experience Layer) so the Movement History screen's
 *  type-filter chips reuse this exact vocabulary instead of a second copy
 *  (Doc 4 Art.III: one owner). */
export const MOVEMENT_TYPE_LABEL = Object.freeze({
  goods_in: 'Goods In',
  goods_out: 'Goods Out',
  transfer: 'Transfer',
  adjustment: 'Adjustment',
  stock_opname_adjustment: 'Stock Opname Adjustment',
  return: 'Return',
});

/** MOVEMENT_REASON in plain words (includes Phase 4/5's ISSUE amendment). */
export const MOVEMENT_REASON_LABEL = Object.freeze({
  purchase: 'Purchase',
  return: 'Return',
  transfer: 'Transfer',
  adjustment: 'Adjustment',
  stock_opname: 'Stock Opname',
  issue: 'Issued',
});

function label(map, key) {
  return map[key] || key;
}

/**
 * One Movement, translated into the who/what/why/when Doc 1 Art.VI
 * requires and Doc 2 §09 wants readable, in plain words. Pure — no I/O.
 * Item/department are left as ids, not names: resolving a display name is
 * a cross-domain join this file does not own (Doc 4 Art.IV) — a future
 * screen resolves it via item-repository/department-repository or Search.
 * @param {import('../contracts/movement-contract.js').Movement} movement
 */
export function formatMovementEntry(movement) {
  return Object.freeze({
    movementId: movement.movementId,
    itemId: movement.itemId,
    departmentId: movement.departmentId,
    when: movement.createdAt,
    who: movement.actorId,
    what: label(MOVEMENT_TYPE_LABEL, movement.type),
    why: label(MOVEMENT_REASON_LABEL, movement.reason),
    quantityDelta: movement.quantityDelta,
    price: movement.price,
  });
}

/**
 * The Movement History feed: reverse-chronological (Doc 2 §09), optionally
 * filtered by item, type, actor (person), and/or a date range.
 * @param {{itemId?:string, type?:string, actorId?:string, since?:string, until?:string}} [filter]
 * @returns {Promise<{ok:boolean, data:?object[], error:*}>}
 */
export async function getMovementHistory(filter = {}) {
  const { itemId, type, actorId, since, until } = filter;
  const res = await listMovements(itemId ? { itemId } : {});
  if (!res.ok) return res;

  let movements = res.data;
  if (type) movements = movements.filter((m) => m.type === type);
  if (actorId) movements = movements.filter((m) => m.actorId === actorId);
  if (since) { const t = new Date(since).getTime(); movements = movements.filter((m) => new Date(m.createdAt).getTime() >= t); }
  if (until) { const t = new Date(until).getTime(); movements = movements.filter((m) => new Date(m.createdAt).getTime() <= t); }

  const reverseChronological = [...movements].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return success(reverseChronological.map(formatMovementEntry));
}
