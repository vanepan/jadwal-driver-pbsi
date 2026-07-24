/* ============================================================
   GOODS-IN-ENGINE.JS — Gudang Consumable Engine (Phase 5, Part 1)

   Authorized by: Doc 1 Art.IV/V · Doc 2 §07 (Goods In) · Doc 3 Ch.04/07
   (Movement Engine / Consumable Engine). Uses the optional `price` field
   added to contracts/movement-contract.js this phase (Doc 2 §07 — see
   that file's header for why the field was missing and how it's scoped).

   PURPOSE: Consumable Engine's Receiving workflow — the mirror of Phase
   4's Goods Out (Doc 2 §07: "the identical search -> quantity -> confirm
   rhythm from §06"). One structural difference, both straight from the
   Blueprint: Goods Out's one up-front choice is a department; Goods In's
   is a REASON (Purchase / Return / Transfer / Adjustment — never Stock
   Opname's own reason, and never Goods Out's Issue — those belong to
   Phase 7 and Phase 4 respectively, not to this workflow). Price is
   per-line, optional, and validated only when present — never required
   (Doc 2 §07: "Never force a user to enter financial information").

   Same whole-batch-validate-then-execute shape as goods-out-engine.js,
   for the same reason (no real multi-path RTDB transaction exists to
   make this atomic any other way) — see that file's header for the full
   reasoning, not repeated here.

   Goods In is also Consumable-only (Doc 1 Art.V, Doc 3 Ch.07): an Asset is
   never received through this workflow, exactly mirroring Goods Out's
   same boundary check.

   PURE where possible; I/O only in executeGoodsIn.
   ============================================================ */

'use strict';

import { getItem } from '../repository/item-repository.js';
import { appendMovement } from '../repository/movement-repository.js';
import { recalculateStock } from '../projection/stock-projection-engine.js';
import { makeMovement, MOVEMENT_TYPE, MOVEMENT_REASON } from '../contracts/movement-contract.js';
import { ITEM_TYPE } from '../contracts/item-contract.js';
import { success, failure, REPOSITORY_ERROR } from '../repository/repository-result.js';

/** The reasons Doc 2 §07 actually offers for Goods In — a strict subset of
 *  MOVEMENT_REASON. STOCK_OPNAME (Phase 7) and ISSUE (Goods Out, Phase 4)
 *  are valid Movement reasons elsewhere but never a Goods In choice. */
const GOODS_IN_REASONS = new Set([
  MOVEMENT_REASON.PURCHASE, MOVEMENT_REASON.RETURN, MOVEMENT_REASON.TRANSFER, MOVEMENT_REASON.ADJUSTMENT,
]);

function generateMovementId() {
  return `mv-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** Shape-only validation — no I/O. */
function validateShape({ reason, lines, actorId } = {}) {
  if (!GOODS_IN_REASONS.has(reason)) return `reason must be one of ${[...GOODS_IN_REASONS].join(', ')}.`;
  if (typeof actorId !== 'string' || !actorId) return 'actorId is required.';
  if (!Array.isArray(lines) || lines.length === 0) return 'lines must be a non-empty array.';
  for (const [i, line] of lines.entries()) {
    if (!line || typeof line.itemId !== 'string' || !line.itemId) return `lines[${i}].itemId is required.`;
    if (typeof line.quantity !== 'number' || !Number.isFinite(line.quantity) || line.quantity <= 0) {
      return `lines[${i}].quantity must be a positive finite number.`;
    }
    if (line.price != null && (typeof line.price !== 'number' || !Number.isFinite(line.price) || line.price < 0)) {
      return `lines[${i}].price, when provided, must be a non-negative finite number (Doc 2 §07: optional, never required).`;
    }
  }
  return null;
}

/**
 * Validate a whole batch against real data: every item exists and is a
 * Consumable (Doc 1 Art.V). Read-only — appends nothing.
 * @param {{reason:string, lines:Array<{itemId:string, quantity:number, price?:?number}>, actorId:string}} batch
 * @returns {Promise<{ok:boolean, data:?object, error:*}>}
 */
export async function validateGoodsInBatch(batch) {
  const shapeError = validateShape(batch);
  if (shapeError) return failure(REPOSITORY_ERROR.INVALID_INPUT, `validateGoodsInBatch: ${shapeError}`);

  for (const [i, line] of batch.lines.entries()) {
    const itemRes = await getItem(line.itemId);
    if (!itemRes.ok) return failure(itemRes.error.code, `lines[${i}]: ${itemRes.error.message}`);
    if (itemRes.data.itemType !== ITEM_TYPE.CONSUMABLE) {
      return failure(REPOSITORY_ERROR.INVALID_INPUT, `lines[${i}]: "${itemRes.data.name}" is an Asset, not a Consumable — Goods In never receives Assets this way (Doc 1 Art.V).`);
    }
  }
  return success(batch);
}

/**
 * Validate, then execute: append one Movement per line (price carried
 * through only when the line provided one), then recalculate Stock for
 * every distinct item touched.
 * @param {{reason:string, lines:Array<{itemId:string, quantity:number, price?:?number}>, actorId:string}} batch
 * @returns {Promise<{ok:boolean, data:?{movements:object[]}, error:*}>}
 */
export async function executeGoodsIn(batch) {
  const validated = await validateGoodsInBatch(batch);
  if (!validated.ok) return validated;

  const movements = [];
  for (const line of batch.lines) {
    const movement = makeMovement({
      movementId: generateMovementId(),
      itemId: line.itemId,
      type: MOVEMENT_TYPE.GOODS_IN,
      quantityDelta: Math.abs(line.quantity),
      reason: batch.reason,
      actorId: batch.actorId,
      price: line.price == null ? null : line.price,
    });
    const appended = await appendMovement(movement);
    if (!appended.ok) {
      return failure(appended.error.code, `executeGoodsIn: failed after ${movements.length} of ${batch.lines.length} lines committed — ${appended.error.message}`);
    }
    movements.push(appended.data);
  }

  const touchedItemIds = Array.from(new Set(movements.map((m) => m.itemId)));
  for (const itemId of touchedItemIds) {
    const recalculated = await recalculateStock(itemId);
    if (!recalculated.ok) {
      return failure(recalculated.error.code, `executeGoodsIn: all ${movements.length} movements were recorded, but Stock recalculation failed for item "${itemId}" — ${recalculated.error.message}`);
    }
  }

  return success({ movements });
}
