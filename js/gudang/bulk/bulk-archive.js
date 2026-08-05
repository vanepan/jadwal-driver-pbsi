/* ============================================================
   BULK-ARCHIVE.JS — Warehouse Bulk Operations, Phase 2 (v1.29.4)

   Thin adapter over bulk-executor.js: reuses item-repository.js's
   EXISTING archiveItem() (itself `updateItem(itemId, {active:false})`,
   Phase 2's own ratified "identity is never deleted, only deactivated"
   rule) for every selected id, unchanged. No new persistence, no second
   archive path.

   PERFORMANCE NOTE (Phase 8): archiveItem()/updateItem() each already do
   their own full listItems() scan for identity-collision checking before
   writing — this file does not try to work around that (Inventory
   Engine's persistence layer is explicitly Do Not Modify), it only
   avoids making it WORSE by keeping concurrency low (bulk-executor.js's
   own DEFAULT_CONCURRENCY) rather than firing every archive call at once.
   ============================================================ */

'use strict';

import { archiveItem } from '../repository/item-repository.js';

/**
 * @param {{data:{items:object[]}}} st
 * @returns {{validate:Function, execute:Function}}
 */
export function createBulkArchiveOperation(st) {
  const itemsById = new Map(st.data.items.map((i) => [i.itemId, i]));

  return {
    async validate(itemId) {
      const item = itemsById.get(itemId);
      if (!item) return { ok: false, reason: 'Item tidak ditemukan (mungkin sudah dihapus).' };
      if (!item.active) return { ok: false, reason: 'Item sudah diarsipkan.' };
      return { ok: true };
    },
    async execute(itemId) {
      const res = await archiveItem(itemId);
      if (!res.ok) return { ok: false, reason: res.error.message };
      return { ok: true };
    },
  };
}
