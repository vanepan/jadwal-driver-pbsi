/* ============================================================
   ITEM-CONTRACT.JS — Gudang Foundation (Phase 1, Part 3; completed Phase 2)

   Authorized by: Doc 3 Ch.03 (Item — "identity only, whether it is a
   Consumable or an Asset, nothing else") · Phase 2 brief Part 1 ("Item
   Domain") / Part 5 ("Identity Rules")

   PURPOSE: fix the shape of an Item — Gudang's single identity owner.
   Movement references it. Assets reference it. Search resolves it.
   Analytics will compute from it. Future QR/Barcode/NFC will resolve into
   it. Nothing else may redefine identity (Phase 2 Mission).

   Item owns ONLY identity: id, type, display name, aliases, category,
   default location, active state, and an open metadata bag. It never owns
   quantity, movement, analytics, or lifecycle — those stay exactly where
   Document 3 already put them (Stock, Movement/Consumable Engine, Analytics
   Engine, Asset Engine). Doc 3 Ch.14's "God objects" rejection is the reason
   this file stays this thin even though it just grew five fields.

   IMMUTABLE ONCE SET: itemId (never changes — repository/item-repository.js
   enforces this at the RTDB key level) and itemType (Phase 2 Part 1/8:
   changing what an Item IS would retroactively reinterpret every Movement/
   AssetHistory record that already points at it — updateItemModel() below
   refuses to change either).

   MUTABLE: name, aliases, category, defaultLocationId, active, metadata —
   updateItemModel() is the one place these change, always recomputing
   normalizedName/normalizedAliases/searchTokens so they never drift from
   the fields they are derived from.

   Phase 10.1 (Experience Review) relaxed two rules at the user's explicit
   direction, given directly against this file (not a UI-only change, but a
   deliberate, confirmed exception — see that phase's report):
     • `category` is now optional freeform text, not a required id validated
       against config/gudang-categories.js's fixed seed list. The seed stays,
       now feeding autocomplete SUGGESTIONS rather than enforcement — "no
       heavyweight master-data management" for Kategori/Jenis/Lokasi.
     • Aliases are no longer required to be unique across Items (see
       item-identity-rules.js#findIdentityCollision) — "Super Glue 25gr",
       "Super Glue 5gr", and "Glue Stick" may all alias to "lem"; searching
       "lem" is meant to resolve all three, not exactly one.

   SEARCH PREPARATION (Phase 2 Part 7): normalizedName/normalizedAliases/
   searchTokens are computed here, at construction/update time, using
   contracts/text-normalization.js — a neutral, Item-owned utility, not a
   dependency on search/ (seethat file's header for why the direction
   matters). Nothing here ranks, fuzzy-matches, or builds an index; that is
   search/item-keyword-index.js's job, reading these fields, never
   recomputing them.

   NON-GOALS: this contract does not decide Consumable vs Asset business
   rules — that split lives in Doc 3 Ch.05/Ch.06 and is enforced by which
   repository/engine a future phase builds on top of `itemType`, never by a
   branch inside Item itself.

   PURE: no DOM, no Firebase, no `window`.
   ============================================================ */

'use strict';

import { normalizeText, tokenize } from './text-normalization.js';

export const ITEM_SCHEMA = 'gudang.item@2';

/** Doc 3 Ch.03/06: the only two lifecycles an Item may declare. */
export const ITEM_TYPE = Object.freeze({
  CONSUMABLE: 'consumable',
  ASSET: 'asset',
});

function computeSearchFields(name, aliases) {
  const normalizedName = normalizeText(name);
  const normalizedAliases = Object.freeze(
    Array.from(new Set(aliases.map(normalizeText).filter(Boolean)))
  );
  const searchTokens = Object.freeze(
    Array.from(new Set([...tokenize(name), ...aliases.flatMap(tokenize)]))
  );
  return { normalizedName, normalizedAliases, searchTokens };
}

/**
 * @typedef {Object} Item
 * @property {string} itemId                  - immutable
 * @property {string} name                    - display name
 * @property {'consumable'|'asset'} itemType   - immutable; never both, never neither (Doc 1 Art.V)
 * @property {string[]} aliases               - alternate names Search later resolves; never identities themselves
 * @property {?string} category               - freeform, optional (Phase 10.1); no longer validated against a fixed list
 * @property {?string} defaultLocationId       - nullable; where it normally lives
 * @property {boolean} active                 - false once archived; identity is never deleted, only deactivated
 * @property {Object} metadata                 - open bag for future harmless fields (barcode, qrCode, averageCost,
 *                                                minimumStock, maximumStock, preferredSupplier, analytics metadata,
 *                                                future V2 references, ...) — see database.rules.json's Phase 1.2.1
 *                                                review: rules stay open to this by design, never enumerated here
 * @property {string} normalizedName           - derived, lowercase/trimmed; Search preparation (Phase 2 Part 7)
 * @property {string[]} normalizedAliases      - derived from `aliases`
 * @property {string[]} searchTokens           - derived from `name` + `aliases`
 * @property {string} createdAt                - ISO timestamp; immutable
 */

/**
 * @param {{itemId:string, name:string, itemType:string, aliases?:string[], category:string,
 *   defaultLocationId?:?string, active?:boolean, metadata?:Object}} seed
 * @returns {Item}
 */
export function makeItem({
  itemId, name, itemType, aliases = [], category = null,
  defaultLocationId = null, active = true, metadata = {},
}) {
  if (typeof itemId !== 'string' || !itemId) throw new Error('makeItem: itemId is required.');
  if (typeof name !== 'string' || !name.trim()) throw new Error('makeItem: name is required.');
  if (itemType !== ITEM_TYPE.CONSUMABLE && itemType !== ITEM_TYPE.ASSET) {
    throw new Error('makeItem: itemType must be "consumable" or "asset".');
  }
  if (!Array.isArray(aliases) || !aliases.every((a) => typeof a === 'string')) {
    throw new Error('makeItem: aliases must be an array of strings.');
  }
  if (category != null && (typeof category !== 'string' || !category.trim())) {
    throw new Error('makeItem: category, when provided, must be a non-empty string.');
  }
  if (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata)) {
    throw new Error('makeItem: metadata must be a plain object.');
  }

  const { normalizedName, normalizedAliases, searchTokens } = computeSearchFields(name, aliases);
  if (searchTokens.length === 0) {
    // A name of only punctuation/whitespace (e.g. "!!!") passes the trim()
    // check above but tokenizes to nothing — effectively unsearchable, which
    // is what Part 8's "empty names" prevention is actually protecting
    // against, not merely a blank string.
    throw new Error('makeItem: name must contain at least one searchable character.');
  }

  return Object.freeze({
    itemId,
    name,
    itemType,
    aliases: Object.freeze([...aliases]),
    category: category == null ? null : category.trim(),
    defaultLocationId: defaultLocationId == null ? null : String(defaultLocationId),
    active: Boolean(active),
    metadata: Object.freeze({ ...metadata }),
    normalizedName,
    normalizedAliases,
    searchTokens,
    createdAt: new Date().toISOString(),
  });
}

/**
 * Apply a patch to an existing Item, recomputing derived search fields.
 * Refuses to change itemId or itemType (Phase 2 Part 8: "identity
 * mutation" is exactly what this contract must prevent) — pass either in
 * `patch` with a DIFFERENT value than the existing Item's and this throws.
 * `createdAt` is never touched. Only name/aliases/category/
 * defaultLocationId/active/metadata may change.
 * @param {Item} existingItem
 * @param {Partial<Item>} patch
 * @returns {Item}
 */
export function updateItemModel(existingItem, patch = {}) {
  if (!isItem(existingItem)) throw new Error('updateItemModel: existingItem does not satisfy the Item contract.');
  if ('itemId' in patch && patch.itemId !== existingItem.itemId) {
    throw new Error('updateItemModel: itemId is immutable and cannot be changed.');
  }
  if ('itemType' in patch && patch.itemType !== existingItem.itemType) {
    throw new Error('updateItemModel: itemType is immutable and cannot be changed.');
  }

  const merged = {
    itemId: existingItem.itemId,
    name: 'name' in patch ? patch.name : existingItem.name,
    itemType: existingItem.itemType,
    aliases: 'aliases' in patch ? patch.aliases : existingItem.aliases,
    category: 'category' in patch ? patch.category : existingItem.category,
    defaultLocationId: 'defaultLocationId' in patch ? patch.defaultLocationId : existingItem.defaultLocationId,
    active: 'active' in patch ? patch.active : existingItem.active,
    metadata: 'metadata' in patch ? patch.metadata : existingItem.metadata,
  };

  const rebuilt = makeItem(merged);
  return Object.freeze({ ...rebuilt, createdAt: existingItem.createdAt });
}

/** @param {*} item @returns {boolean} */
export function isItem(item) {
  return !!item && typeof item === 'object'
    && typeof item.itemId === 'string' && item.itemId.length > 0
    && typeof item.name === 'string' && item.name.length > 0
    && (item.itemType === ITEM_TYPE.CONSUMABLE || item.itemType === ITEM_TYPE.ASSET)
    && Array.isArray(item.aliases) && item.aliases.every((a) => typeof a === 'string')
    && (item.category === null || (typeof item.category === 'string' && item.category.length > 0))
    && (item.defaultLocationId === null || typeof item.defaultLocationId === 'string')
    && typeof item.active === 'boolean'
    && !!item.metadata && typeof item.metadata === 'object' && !Array.isArray(item.metadata)
    && typeof item.normalizedName === 'string'
    && Array.isArray(item.normalizedAliases)
    && Array.isArray(item.searchTokens)
    && typeof item.createdAt === 'string' && item.createdAt.length > 0;
}
