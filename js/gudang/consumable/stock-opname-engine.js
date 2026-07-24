/* ============================================================
   STOCK-OPNAME-ENGINE.JS — Gudang Consumable Engine (Phase 7, Part 1)

   Authorized by: Doc 1 Art.IV (Movement First) / Art.V · Doc 2 §10 (Stock
   Opname) · Doc 3 Ch.03 ("consumable: the receive/issue/adjust/OPNAME
   workflow that produces Movements") / Ch.04 (MOVEMENT_TYPE.
   STOCK_OPNAME_ADJUSTMENT) / Ch.07

   PURPOSE: turn a physical count into Movements, never into a direct
   Stock edit (Doc 2 §10: "Discrepancy becomes an adjustment movement.
   Never a direct stock edit" — this is the same law as Doc 1 Art.IV, R-02/
   R-03, restated for this specific workflow). Expected quantity is
   computed FRESH from Movement history for every line (deriveQuantity over
   a live listMovements() read) rather than trusted from the Stock
   Projection cache — Doc 3 Ch.05's own rule ("if the projection and
   Movement disagree, Movement wins") means comparing a physical count
   against a possibly-stale cached number would be exactly the kind of
   silent drift Ch.05 exists to prevent.

   ZERO DISCREPANCY -> NO MOVEMENT: if a counted quantity matches expected,
   nothing happened, so nothing is recorded — this falls out of Movement's
   own contract (makeMovement rejects quantityDelta:0) rather than being a
   rule invented here.

   PARTIAL OPNAME (Phase 7 brief): this engine has no concept of "a slice"
   (location/category) at all — it only processes whatever lines the
   caller submits, one item at a time or many. Doc 2 §10's "counted in
   whatever slice the user chooses... never forced into a single sitting"
   is therefore satisfied structurally: nothing here requires a complete
   slice before it will accept a batch. Choosing WHICH items belong to a
   slice is a query concern for whichever phase builds the counting screen
   (filtering Item by location/category, both of which Item and
   config/gudang-categories.js already support) — not this engine's job.

   Same whole-batch-validate-then-execute shape as goods-out/goods-in, for
   the same reason (no real multi-path RTDB transaction exists) — see
   those files' headers for the full reasoning.

   Stock Opname is also Consumable-only (Doc 1 Art.V): an Asset's presence/
   condition is verified through Asset Engine's own lifecycle (Phase 9),
   never through a quantity count.

   PURE where possible; I/O only in executeStockOpname (and its expected-
   quantity read).
   ============================================================ */

'use strict';

import { getItem } from '../repository/item-repository.js';
import { appendMovement, listMovements } from '../repository/movement-repository.js';
import { deriveQuantity, recalculateStock } from '../projection/stock-projection-engine.js';
import { makeMovement, MOVEMENT_TYPE, MOVEMENT_REASON } from '../contracts/movement-contract.js';
import { ITEM_TYPE } from '../contracts/item-contract.js';
import { success, failure, REPOSITORY_ERROR } from '../repository/repository-result.js';

function generateMovementId() {
  return `mv-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** Shape-only validation — no I/O. */
function validateShape({ lines, actorId } = {}) {
  if (typeof actorId !== 'string' || !actorId) return 'actorId is required.';
  if (!Array.isArray(lines) || lines.length === 0) return 'lines must be a non-empty array.';
  for (const [i, line] of lines.entries()) {
    if (!line || typeof line.itemId !== 'string' || !line.itemId) return `lines[${i}].itemId is required.`;
    if (typeof line.countedQuantity !== 'number' || !Number.isFinite(line.countedQuantity) || line.countedQuantity < 0) {
      return `lines[${i}].countedQuantity must be a non-negative finite number (a physical count can be zero, never negative).`;
    }
    if (line.locationId != null && typeof line.locationId !== 'string') return `lines[${i}].locationId, when provided, must be a string.`;
  }
  return null;
}

/**
 * The current expected quantity for one item, computed fresh from Movement
 * history (Doc 3 Ch.05: Movement always wins over a cached Projection).
 * @param {string} itemId
 * @returns {Promise<{ok:boolean, data:?number, error:*}>}
 */
export async function getExpectedQuantity(itemId) {
  if (typeof itemId !== 'string' || !itemId) return failure(REPOSITORY_ERROR.INVALID_INPUT, 'getExpectedQuantity: itemId is required.');
  const res = await listMovements({ itemId });
  if (!res.ok) return res;
  return success(deriveQuantity(res.data));
}

/**
 * Validate a whole batch against real data: every item exists and is a
 * Consumable (Doc 1 Art.V). Read-only — appends nothing.
 * @param {{lines:Array<{itemId:string, countedQuantity:number, locationId?:?string}>, actorId:string}} batch
 */
export async function validateStockOpnameBatch(batch) {
  const shapeError = validateShape(batch);
  if (shapeError) return failure(REPOSITORY_ERROR.INVALID_INPUT, `validateStockOpnameBatch: ${shapeError}`);

  for (const [i, line] of batch.lines.entries()) {
    const itemRes = await getItem(line.itemId);
    if (!itemRes.ok) return failure(itemRes.error.code, `lines[${i}]: ${itemRes.error.message}`);
    if (itemRes.data.itemType !== ITEM_TYPE.CONSUMABLE) {
      return failure(REPOSITORY_ERROR.INVALID_INPUT, `lines[${i}]: "${itemRes.data.name}" is an Asset, not a Consumable — Stock Opname never counts Assets this way (Doc 1 Art.V).`);
    }
  }
  return success(batch);
}

/**
 * Validate, then execute: for each line, compare the counted quantity
 * against the FRESH expected quantity; append a Stock Opname Adjustment
 * Movement only where they disagree (Doc 2 §10); recalculate Stock for
 * every item that actually got a Movement.
 * @param {{lines:Array<{itemId:string, countedQuantity:number, locationId?:?string}>, actorId:string}} batch
 * @returns {Promise<{ok:boolean, data:?{movements:object[], unchanged:string[]}, error:*}>}
 */
export async function executeStockOpname(batch) {
  const validated = await validateStockOpnameBatch(batch);
  if (!validated.ok) return validated;

  const movements = [];
  const unchanged = [];
  for (const line of batch.lines) {
    const expectedRes = await getExpectedQuantity(line.itemId);
    if (!expectedRes.ok) return expectedRes;

    const discrepancy = line.countedQuantity - expectedRes.data;
    if (discrepancy === 0) {
      unchanged.push(line.itemId);
      continue;
    }

    const movement = makeMovement({
      movementId: generateMovementId(),
      itemId: line.itemId,
      type: MOVEMENT_TYPE.STOCK_OPNAME_ADJUSTMENT,
      quantityDelta: discrepancy,
      reason: MOVEMENT_REASON.STOCK_OPNAME,
      locationId: line.locationId ?? null,
      actorId: batch.actorId,
    });
    const appended = await appendMovement(movement);
    if (!appended.ok) {
      return failure(appended.error.code, `executeStockOpname: failed after ${movements.length} of ${batch.lines.length} lines committed — ${appended.error.message}`);
    }
    movements.push(appended.data);
  }

  const touchedItemIds = Array.from(new Set(movements.map((m) => m.itemId)));
  for (const itemId of touchedItemIds) {
    const recalculated = await recalculateStock(itemId);
    if (!recalculated.ok) {
      return failure(recalculated.error.code, `executeStockOpname: all ${movements.length} adjustments were recorded, but Stock recalculation failed for item "${itemId}" — ${recalculated.error.message}`);
    }
  }

  return success({ movements, unchanged });
}
