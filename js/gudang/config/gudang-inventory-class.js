/* ============================================================
   GUDANG-INVENTORY-CLASS.JS — special-inventory classification (V1 Shuttlecock)

   V1 UPDATE (Warehouse / Shuttlecock module): some inventory is "special" —
   it has the same lifecycle as an ordinary Consumable (stock, location,
   goods in/out, movement, opname, analytics) but must only be visible to
   bidang/units that hold a specific permission. Shuttlecock is the first
   such class.

   OWNERSHIP NOTE — mirrors config/gudang-categories.js exactly: this is NOT
   a new Gudang domain (Doc 3 Ch.03's ratified table is untouched, Doc 4
   F-02 rejects a new top-level domain without architectural justification).
   `inventoryClass` is scoped DATA owned by Item, living in its already-open
   `metadata` bag (item-contract.js's header: "open bag for future harmless
   fields") — exactly the way Ukuran/Varian and Jenis already live there.
   No contract change, no repository change, no new RTDB path, no
   database.rules.json change (its items .validate is deliberately open to
   extra metadata keys — see scripts/gudang-security-check.mjs Part 8).

   A "shuttlecock item" is therefore just an ordinary Consumable Item with
   metadata.inventoryClass === 'shuttlecock'. It keeps every existing
   inventory feature; the class only changes WHO may see it and WHERE it
   sorts in the catalog.

   SCALABLE BY DESIGN: `inventoryClass` is a single string, so a future
   special class is a new value here — never a new boolean-per-class field
   on every Item.

   PURE: plain data + lookups. No DOM, no Firebase, no `window`. Importable
   under plain Node with zero transitive Firebase dependency (same
   discipline every other js/gudang/config/ file keeps).
   ============================================================ */

'use strict';

/** Every known special inventory class. `null`/absent = ordinary inventory. */
export const INVENTORY_CLASS = Object.freeze({
  SHUTTLECOCK: 'shuttlecock',
});

/** The raw class string for an item, or null when it is ordinary inventory. */
export function inventoryClassOf(item) {
  const raw = item && item.metadata ? item.metadata.inventoryClass : null;
  return typeof raw === 'string' && raw ? raw : null;
}

/** Whether `item` is a Shuttlecock-class item. Safe on null/partial records. */
export function isShuttlecockItem(item) {
  return inventoryClassOf(item) === INVENTORY_CLASS.SHUTTLECOCK;
}

/** Whether `cls` is a class this build knows about (unknown values are ignored, never trusted). */
export function isKnownInventoryClass(cls) {
  return cls === INVENTORY_CLASS.SHUTTLECOCK;
}

/**
 * Access-control at the data source (V1 requirement §5/§13): given the full
 * item list and whether THIS session may see Shuttlecock, return the list a
 * session is allowed to process — plus the set of ids that were withheld,
 * so movement/analytics surfaces that reference items by id (and therefore
 * never went through this list) can exclude those rows too.
 *
 * When `canSeeShuttlecock` is true this is a pure pass-through (visible ===
 * items, hiddenIds is empty) — a permitted session behaves exactly as
 * before this feature existed.
 *
 * PURE — no permission logic here: the caller passes the already-resolved
 * boolean (see config/gudang-shuttlecock-access.js), keeping this file
 * unit-testable and free of any auth import.
 *
 * @param {Array<object>} items
 * @param {boolean} canSeeShuttlecock
 * @returns {{ visible: Array<object>, hiddenIds: Set<string> }}
 */
export function applyShuttlecockVisibility(items, canSeeShuttlecock) {
  const all = Array.isArray(items) ? items : [];
  if (canSeeShuttlecock === true) {
    return { visible: all, hiddenIds: new Set() };
  }
  const visible = [];
  const hiddenIds = new Set();
  for (const item of all) {
    if (isShuttlecockItem(item)) hiddenIds.add(item.itemId);
    else visible.push(item);
  }
  return { visible, hiddenIds };
}

/**
 * Catalog ordering (V1 requirement §3): Shuttlecock items float to the very
 * top of the catalog, every other item keeps its existing relative order.
 * Stable — a plain partition, never a re-sort of the non-Shuttlecock items.
 * @param {Array<object>} items  already filtered/sorted for display
 * @returns {Array<object>}
 */
export function shuttlecockFirst(items) {
  const all = Array.isArray(items) ? items : [];
  const shuttle = [];
  const rest = [];
  for (const item of all) (isShuttlecockItem(item) ? shuttle : rest).push(item);
  return shuttle.length ? [...shuttle, ...rest] : all;
}
