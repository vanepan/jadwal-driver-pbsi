/* ============================================================
   BULK-EDIT.JS — Warehouse Bulk Operations, Phase 3 (v1.29.4)

   Thin adapter over bulk-executor.js, reusing item-repository.js's
   EXISTING updateItem() for every field — no new repository, no new
   validation path. Each field is independently OPT-IN (a checkbox next
   to it in the UI) — a Bulk Edit run only ever patches the fields the
   user actually enabled, never overwrites the rest.

   FIELDS, per the brief: Category, Location, Alias, Minimum Stock.
   Do NOT allow: Name, Type, Photo, ID (unchanged — this file never
   builds a patch containing any of those keys).

   ALIAS — a real conflict found during design, not an oversight: Item
   identity (item-identity-rules.js) requires every alias to be UNIQUE
   across the whole catalog, and updateItem() re-checks that on every
   single call by re-scanning the full live catalog. Setting the SAME
   alias on N selected items would make every item after the first fail
   that uniqueness check the instant the first one commits (the second
   item's check would see the first item's alias already collide with
   itself). "Bulk Edit Alias" as a literal "set them all to X" is
   therefore incompatible with a Do Not Modify business rule (identity
   uniqueness) — rather than silently breaking most of the batch or
   quietly dropping the field, this ships the one Alias operation that
   IS safe and still useful: clear all aliases for every selected item
   (aliases: [] never collides with anything). Flagged here and in the
   v1.29.4 changelog entry, not hidden.

   MINIMUM STOCK — did not exist on Item before this release.
   item-contract.js's own `metadata` docstring already names
   `minimumStock` as an example of a future field the open metadata bag
   is designed to accommodate — this is that field, finally given a
   writer. Lives at `item.metadata.minimumStock` (a plain number, or
   absent/cleared when set to empty). NOTHING ELSE reads this field yet
   (Low Stock classification — filters/stock-status-bulk.js — still
   derives status purely from consumption pace, unchanged) — a
   deliberate scope boundary, not an oversight: wiring it into Low
   Stock/Quiet Intelligence is a follow-up decision for a future
   release, not something to fold in silently here.

   METADATA FOOTGUN, handled: updateItemModel replaces `metadata`
   WHOLESALE, never deep-merges it (item-contract.js) — every execute()
   call below spreads the item's OWN CURRENT metadata first (mirroring
   gudang-catalog.js#confirmEditItem's identical pattern) before setting
   minimumStock, so a photo/variant/jenis already on that item is never
   silently wiped just because Bulk Edit only exposes 4 fields.
   ============================================================ */

'use strict';

import { updateItem } from '../repository/item-repository.js';
import { resolveOrCreateLocationId } from '../ui/gudang-catalog.js';

export function createBulkEditForm() {
  return {
    applyCategory: false, category: '',
    applyLocation: false, locationName: '',
    applyClearAliases: false,
    applyMinimumStock: false, minimumStock: '',
  };
}

/** At least one field must be opted into before Review/Execute is reachable. */
export function bulkEditHasAnyField(form) {
  return !!(form.applyCategory || form.applyLocation || form.applyClearAliases || form.applyMinimumStock);
}

/**
 * @param {{data:{items:object[], locations:object[]}}} st
 * @param {ReturnType<typeof createBulkEditForm>} form
 */
export function createBulkEditOperation(st, form) {
  const itemsById = new Map(st.data.items.map((i) => [i.itemId, i]));

  return {
    /** The Location resolves/creates ONCE for the whole run, not once per
     *  item (all selected items share the same new location) — mirrors
     *  Bulk Goods Out's department-prepare exactly. */
    async prepare() {
      if (!form.applyLocation) return { locationId: null };
      const res = await resolveOrCreateLocationId(st, form.locationName);
      if (!res.ok) throw new Error(res.error);
      return { locationId: res.locationId };
    },
    async validate(itemId) {
      if (!itemsById.has(itemId)) return { ok: false, reason: 'Item tidak ditemukan (mungkin sudah dihapus).' };
      return { ok: true };
    },
    async execute(itemId, ctx) {
      const item = itemsById.get(itemId);
      const patch = {};
      if (form.applyCategory) patch.category = form.category.trim() || null;
      if (form.applyLocation) patch.defaultLocationId = ctx.locationId;
      if (form.applyClearAliases) patch.aliases = [];
      if (form.applyMinimumStock) {
        const metadata = { ...(item.metadata || {}) };
        const n = Number(form.minimumStock);
        if (form.minimumStock.trim() === '' || !Number.isFinite(n) || n < 0) delete metadata.minimumStock;
        else metadata.minimumStock = n;
        patch.metadata = metadata;
      }
      const res = await updateItem(itemId, patch);
      if (!res.ok) return { ok: false, reason: res.error.message };
      return { ok: true };
    },
  };
}
