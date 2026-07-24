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

   Phase 10.1 (Experience Review, Part 3/4 — "Kategori... FREEFORM,
   Autocomplete... no heavyweight master-data management"): item-contract.js
   no longer validates an Item's category against this seed — category is
   now optional freeform text. This list stops being an enforcement source
   and becomes a SUGGESTIONS source for the Add Item autocomplete (still
   scoped per itemType, still useful as a starting point) — isValidCategory()
   was removed since nothing calls it anymore; getCategory/categoriesForItemType/
   categoryLabel keep working unchanged for that purpose (categoryLabel
   already fell back to the raw id for anything outside the seed, which is
   now the common case for a freeform value, not an edge case).

   DEPENDENCY DIRECTION: this file has no dependents left in item-contract.js
   (category is no longer validated at construction time), but the direction
   rule still holds for anything that DOES read it — this file must never
   import FROM item-contract.js (Doc 4 F-11, circular ownership). The two
   ItemType strings below are literal mirrors of contracts/item-contract.js's
   ITEM_TYPE.CONSUMABLE/ASSET values, not a live import.

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

/** Every category valid for a given ItemType — a flat list, never a tree. */
export function categoriesForItemType(itemType) {
  return CATEGORY_SEED.filter((c) => c.itemType === itemType);
}

/** Human label for a category id (falls back to the id itself). */
export function categoryLabel(categoryId) {
  const cat = _byId.get(categoryId);
  return cat ? cat.label : (categoryId || '');
}
