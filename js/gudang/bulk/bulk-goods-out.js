/* ============================================================
   BULK-GOODS-OUT.JS — Warehouse Bulk Operations, Phase 1 (v1.29.4)

   Thin adapter over bulk-executor.js. Reuses the exact Movement/Stock
   pipeline goods-out-engine.js already established (makeMovement ->
   appendMovement -> recalculateStock) — this file adds no second way to
   change a quantity, exactly matching that engine's own stated discipline.

   NOT a call to executeGoodsOut() itself: that function validates the
   WHOLE batch then writes sequentially and stops at the first failure
   (see its own header) — the opposite of what Bulk Goods Out needs
   ("continues even if some items fail," brief Phase 1). So this file
   calls the same underlying primitives (appendMovement/recalculateStock)
   directly, through bulk-executor.js's own partial-success-tolerant
   worker pool, instead of routing through executeGoodsOut's fail-fast
   loop.

   QUANTITY — a gap in the brief's own flow diagram: "Selected Items ->
   Goods Out -> Modal -> Purpose -> Requested By -> Notes -> Review ->
   Execute" never lists a Quantity step, but Movement.quantityDelta is
   required and non-zero (movement-contract.js) — there is no sensible
   single default across a heterogeneous selection (different items,
   different current stock levels). Added as a required per-item quantity
   field in the Review step, mirroring the existing single-item Goods Out
   UI's own per-line quantity requirement (gudang-goods-out.js) rather
   than inventing a new convention.

   PURPOSE/NOTES: new optional Movement fields (movement-contract.js
   v1.29.4 amendment — see that file's header). "Requested By" maps onto
   the existing departmentId (Bidang) picker, unchanged from single Goods
   Out.
   ============================================================ */

'use strict';

import { ITEM_TYPE } from '../contracts/item-contract.js';
import { listBidang } from '../config/gudang-bidang-source.js';
import { makeMovement, MOVEMENT_TYPE, MOVEMENT_REASON } from '../contracts/movement-contract.js';
import { appendMovement } from '../repository/movement-repository.js';
import { recalculateStock } from '../projection/stock-projection-engine.js';

/** Same id recipe as goods-out-engine.js's own local generateMovementId()
 *  and gudang-catalog.js's own local generateId() — each Gudang file that
 *  needs one keeps its own trivial copy (see either file's header for
 *  why); a third copy here follows that established convention, not a
 *  new one. */
function generateBulkMovementId() {
  return `mv-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function createBulkGoodsOutForm() {
  return {
    departmentId: null, departmentQuery: '',
    purpose: '', notes: '',
    quantities: {}, // itemId -> string (as typed)
  };
}

/**
 * @param {{data:{items:object[]}}} st
 * @param {ReturnType<typeof createBulkGoodsOutForm>} form
 * @param {string} actorId
 */
export function createBulkGoodsOutOperation(st, form, actorId) {
  const itemsById = new Map(st.data.items.map((i) => [i.itemId, i]));
  const touchedItemIds = new Set();

  return {
    /** Department existence is checked ONCE, not per item (brief: "group
     *  identical failures" — a missing department is one shared cause,
     *  not N independent ones). Throwing here fails every id with the
     *  same reason, via bulk-executor.js's own prepare-failure handling. */
    async prepare() {
      const dept = listBidang().find((d) => d.departmentId === form.departmentId);
      if (!dept) throw new Error('Bidang tidak ditemukan.');
      return { department: dept };
    },
    async validate(itemId) {
      const item = itemsById.get(itemId);
      if (!item) return { ok: false, reason: 'Item tidak ditemukan (mungkin sudah dihapus).' };
      if (item.itemType !== ITEM_TYPE.CONSUMABLE) return { ok: false, reason: 'Hanya Consumable yang bisa dikeluarkan (Goods Out).' };
      const raw = form.quantities[itemId];
      const qty = Number(raw);
      if (!raw || !Number.isFinite(qty) || qty <= 0) return { ok: false, reason: 'Kuantitas tidak valid.' };
      return { ok: true };
    },
    async execute(itemId) {
      const qty = Number(form.quantities[itemId]);
      let movement;
      try {
        movement = makeMovement({
          movementId: generateBulkMovementId(),
          itemId,
          type: MOVEMENT_TYPE.GOODS_OUT,
          quantityDelta: -Math.abs(qty),
          reason: MOVEMENT_REASON.ISSUE,
          departmentId: form.departmentId,
          actorId,
          purpose: form.purpose ? form.purpose.trim() : null,
          notes: form.notes ? form.notes.trim() : null,
        });
      } catch (err) {
        return { ok: false, reason: err.message };
      }
      const res = await appendMovement(movement);
      if (!res.ok) return { ok: false, reason: res.error.message };
      touchedItemIds.add(itemId);
      return { ok: true };
    },
    /** Best-effort Stock recalculation for every successfully-touched item,
     *  once each — called by the UI AFTER runBulkOperation() settles, not
     *  per item during execution (recalculating after every single write
     *  when N items may share nothing in common is wasted work; once per
     *  distinct item, at the end, mirrors executeGoodsOut's own final
     *  loop). A recalc failure does NOT retroactively fail an already-
     *  appended Movement — the movement is still true (Doc 1 Art.IV);
     *  failures are reported separately so nothing is silently lost. */
    async finalizeStock() {
      const recalcFailures = [];
      for (const itemId of touchedItemIds) {
        const r = await recalculateStock(itemId);
        if (!r.ok) recalcFailures.push({ itemId, reason: r.error.message });
      }
      return recalcFailures;
    },
  };
}
