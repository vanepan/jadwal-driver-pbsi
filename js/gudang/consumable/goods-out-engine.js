/* ============================================================
   GOODS-OUT-ENGINE.JS — Gudang Consumable Engine (Phase 4, Part 1)

   Authorized by: Doc 1 Art.IV (Movement First) / Art.V (Assets vs.
   Consumables) · Doc 2 §06 (Goods Out) · Doc 3 Ch.04/07 (Movement Engine /
   Consumable Engine). Uses MOVEMENT_REASON.ISSUE, added to
   contracts/movement-contract.js this phase (user-approved amendment —
   see that file's header).

   PURPOSE: Consumable Engine's Issuing workflow (Doc 3 Ch.07). Turns one
   gesture — "this department took these items, these quantities" — into a
   batch of attributed Movements (Doc 1 Art.IV: stock is never edited,
   only derived). No wizard, no CRUD (Phase 4 brief): one validate-then-
   execute call, not a multi-step form.

   VALIDATION IS WHOLE-BATCH, UP FRONT: every line is checked — quantity,
   item existence, item is a Consumable (never an Asset issued through a
   Consumable workflow, Doc 1 Art.V) — and the department must exist,
   before any Movement is appended. This is the closest this repository
   layer can get to atomicity without a real multi-path RTDB transaction
   (none of the existing repositories expose one): if validation passes,
   every line gets an equal chance to succeed; if it fails, nothing is
   written. A residual mid-batch WRITE failure (e.g. a network drop after
   some lines already appended) is reported line-by-line, never hidden —
   Movements that did succeed stay recorded (Doc 1 Art.IV: a Movement,
   once true, is never un-happened).

   Deliberately NOT implemented (Doc 4 Art.VI — no invented business rule,
   Principle 7): blocking a line because it would take Stock negative.
   Nothing in Doc 1-3 requires this. Flagged as a known limitation in the
   Phase 4 report, not silently decided either way.

   Composes, never duplicates: appendMovement (repository/movement-
   repository.js) for truth, recalculateStock (projection/stock-
   projection-engine.js) for the resulting Projection — the exact
   Movement -> Stock pipeline Doc 3 Ch.05 already fixed in Phase 1. This
   file adds no second way to change a quantity.

   The movement-id generator below mirrors js/utils.js#generateId's exact
   recipe for consistency with the rest of the app, but is a LOCAL copy —
   Gudang has never imported anything outside js/gudang/ (besides a lazy
   firebase.js), and gudang-ownership-check.mjs Part 10 proves every file
   here still imports cleanly with zero non-Gudang app dependency. One
   trivial function is not worth breaking that boundary for.

   I/O only where a real workflow requires it (repository reads/writes);
   everything else here is a thin, readable orchestration.
   ============================================================ */

'use strict';

import { getItem } from '../repository/item-repository.js';
import { getDepartment } from '../repository/department-repository.js';
import { appendMovement } from '../repository/movement-repository.js';
import { recalculateStock } from '../projection/stock-projection-engine.js';
import { makeMovement, MOVEMENT_TYPE, MOVEMENT_REASON } from '../contracts/movement-contract.js';
import { ITEM_TYPE } from '../contracts/item-contract.js';
import { success, failure, REPOSITORY_ERROR } from '../repository/repository-result.js';

function generateMovementId() {
  return `mv-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** Shape-only validation — no I/O. Existence/type checks need repository
 *  reads and happen in validateGoodsOutBatch below. */
function validateShape({ departmentId, lines, actorId } = {}) {
  if (typeof departmentId !== 'string' || !departmentId) return 'departmentId is required.';
  if (typeof actorId !== 'string' || !actorId) return 'actorId is required.';
  if (!Array.isArray(lines) || lines.length === 0) return 'lines must be a non-empty array.';
  for (const [i, line] of lines.entries()) {
    if (!line || typeof line.itemId !== 'string' || !line.itemId) return `lines[${i}].itemId is required.`;
    if (typeof line.quantity !== 'number' || !Number.isFinite(line.quantity) || line.quantity <= 0) {
      return `lines[${i}].quantity must be a positive finite number.`;
    }
  }
  return null;
}

/**
 * Validate a whole batch against real data: department exists, every item
 * exists and is a Consumable (Doc 1 Art.V — Goods Out never touches an
 * Asset). Read-only — appends nothing.
 * @param {{departmentId:string, lines:Array<{itemId:string, quantity:number}>, actorId:string}} batch
 * @returns {Promise<{ok:boolean, data:?object, error:*}>}
 */
export async function validateGoodsOutBatch(batch) {
  const shapeError = validateShape(batch);
  if (shapeError) return failure(REPOSITORY_ERROR.INVALID_INPUT, `validateGoodsOutBatch: ${shapeError}`);

  const departmentRes = await getDepartment(batch.departmentId);
  if (!departmentRes.ok) return departmentRes;

  for (const [i, line] of batch.lines.entries()) {
    const itemRes = await getItem(line.itemId);
    if (!itemRes.ok) return failure(itemRes.error.code, `lines[${i}]: ${itemRes.error.message}`);
    if (itemRes.data.itemType !== ITEM_TYPE.CONSUMABLE) {
      return failure(REPOSITORY_ERROR.INVALID_INPUT, `lines[${i}]: "${itemRes.data.name}" is an Asset, not a Consumable — Goods Out never issues Assets (Doc 1 Art.V).`);
    }
  }
  return success(batch);
}

/**
 * Validate, then execute: append one Movement per line, then recalculate
 * Stock for every distinct item touched. Returns every appended Movement
 * so a caller (a future UI) can render what actually happened.
 * @param {{departmentId:string, lines:Array<{itemId:string, quantity:number}>, actorId:string}} batch
 * @returns {Promise<{ok:boolean, data:?{movements:object[]}, error:*}>}
 */
export async function executeGoodsOut(batch) {
  const validated = await validateGoodsOutBatch(batch);
  if (!validated.ok) return validated;

  const movements = [];
  for (const line of batch.lines) {
    const movement = makeMovement({
      movementId: generateMovementId(),
      itemId: line.itemId,
      type: MOVEMENT_TYPE.GOODS_OUT,
      quantityDelta: -Math.abs(line.quantity),
      reason: MOVEMENT_REASON.ISSUE,
      departmentId: batch.departmentId,
      actorId: batch.actorId,
    });
    const appended = await appendMovement(movement);
    if (!appended.ok) {
      return failure(appended.error.code, `executeGoodsOut: failed after ${movements.length} of ${batch.lines.length} lines committed — ${appended.error.message}`);
    }
    movements.push(appended.data);
  }

  const touchedItemIds = Array.from(new Set(movements.map((m) => m.itemId)));
  for (const itemId of touchedItemIds) {
    const recalculated = await recalculateStock(itemId);
    if (!recalculated.ok) {
      return failure(recalculated.error.code, `executeGoodsOut: all ${movements.length} movements were recorded, but Stock recalculation failed for item "${itemId}" — ${recalculated.error.message}`);
    }
  }

  return success({ movements });
}
