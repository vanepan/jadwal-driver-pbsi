/* ============================================================
   GUDANG-CATEGORIES.JS — Gudang Item Foundation (Phase 2, Part 3)

   Authorized by: Phase 2 brief, Part 3 ("Implement lightweight Categories.
   No hierarchy. No tree. No parent-child. Just stable categorization...
   Categories remain data. Not behavior.")

   OWNERSHIP NOTE: Category is NOT a 16th Gudang domain. Document 3 Ch.03's
   ratified table lists exactly Item, Movement, Stock, Asset, Consumable,
   Analytics, Forecast, Recommendation, Audit, Search, Location, Department,
   Supplier, NOR, QR/Barcode/NFC — Category is not among them, and Doc 4's
   Forbidden Ledger F-02 rejects creating a new top-level domain without
   architectural justification. Category is scoped data OWNED BY Item,
   exactly the way MOVEMENT_TYPE/MOVEMENT_REASON are enums owned by Movement
   without being domains of their own — it lives in config/, not a new
   contracts/repository pair, and config/gudang-domain-registry.js (Doc 3
   Ch.03's table, frozen since Phase 1) is intentionally left untouched.

   Each category belongs to exactly one ItemType — a Consumable category is
   never valid for an Asset and vice versa (Doc 1 Art.V: the two lifecycles
   never share a model, including their categorization).

   DEPENDENCY DIRECTION: item-contract.js imports FROM this file (to validate
   an Item's category at construction time) — so this file must never import
   FROM item-contract.js, or the two would depend on each other (Doc 4 F-11,
   circular ownership). The two ItemType strings below are literal mirrors of
   contracts/item-contract.js's ITEM_TYPE.CONSUMABLE/ASSET values, not a live
   import — Item's contract is the sole owner of that enum; this file only
   ever quotes its two known values.

   PURE: plain frozen data + lookups. No DOM, no Firebase, no `window`.
   ============================================================ */

'use strict';

function deepFreeze(value) {
  if (Array.isArray(value)) { value.forEach(deepFreeze); return Object.freeze(value); }
  if (value && typeof value === 'object') { Object.values(value).forEach(deepFreeze); return Object.freeze(value); }
  return value;
}

/** The complete, stable category list. No hierarchy — every entry is a flat leaf. */
export const CATEGORY_SEED = deepFreeze([
  // Consumable categories
  { id: 'atk', label: 'ATK', itemType: 'consumable' },
  { id: 'cleaning', label: 'Cleaning', itemType: 'consumable' },
  { id: 'gym', label: 'Gym', itemType: 'consumable' },
  { id: 'food', label: 'Food', itemType: 'consumable' },
  { id: 'beverage', label: 'Beverage', itemType: 'consumable' },
  { id: 'medical', label: 'Medical', itemType: 'consumable' },
  // Asset categories
  { id: 'vehicle', label: 'Vehicle', itemType: 'asset' },
  { id: 'furniture', label: 'Furniture', itemType: 'asset' },
  { id: 'electronics', label: 'Electronics', itemType: 'asset' },
  { id: 'printer', label: 'Printer', itemType: 'asset' },
  { id: 'laptop', label: 'Laptop', itemType: 'asset' },
  { id: 'gym_equipment', label: 'Gym Equipment', itemType: 'asset' },
  { id: 'hvac', label: 'HVAC', itemType: 'asset' },
  { id: 'audio', label: 'Audio', itemType: 'asset' },
]);

const _byId = new Map(CATEGORY_SEED.map((c) => [c.id, c]));

/** The category record, or null when `categoryId` is unknown. */
export function getCategory(categoryId) {
  return _byId.get(categoryId) || null;
}

/** Whether `categoryId` is a real category belonging to `itemType`. */
export function isValidCategory(categoryId, itemType) {
  const cat = _byId.get(categoryId);
  return !!cat && cat.itemType === itemType;
}

/** Every category valid for a given ItemType — a flat list, never a tree. */
export function categoriesForItemType(itemType) {
  return CATEGORY_SEED.filter((c) => c.itemType === itemType);
}

/** Human label for a category id (falls back to the id itself). */
export function categoryLabel(categoryId) {
  const cat = _byId.get(categoryId);
  return cat ? cat.label : (categoryId || '');
}
