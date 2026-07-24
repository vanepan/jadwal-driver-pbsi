/* ============================================================
   ANALYTICS-ENGINE.JS — Gudang Analytics Engine (Phase 8, Part 1)

   Authorized by: Doc 1 Art.VII (Analytics as Intelligence) · Doc 2 §11 ·
   Doc 3 Ch.09 (Analytics Engine)

   PURPOSE: Doc 3 Ch.09's named outputs, each a fixed, deterministic
   calculation over Movement + Stock — "run the same way every time on the
   same input. None is a model's estimate" (Ch.09). This file OWNS every
   decision a figure requires (Doc 3 Ch.10: Quiet Intelligence "never
   decides a threshold... those are Analytics Engine's decisions") — the
   sibling quiet-intelligence-engine.js only phrases what this file has
   already decided; it is never handed raw Movement or Stock.

   SCOPE — implemented this phase, each traceable to Ch.09's taglist:
     Average Monthly Consumption, Department Consumption, Average Monthly
     Cost, Forecast (days remaining), Restock Recommendation, Top Consumed
     Items, Top Departments.

   DELIBERATELY NOT IMPLEMENTED this phase: Stock Turnover, Average Stock
   Lifetime. Both are named in Ch.09's taglist, but neither Doc 1-3 nor
   Doc 4 gives (or implies) a specific formula for either, and both are
   real inventory-accounting terms with more than one defensible
   definition (turnover over what period, against which stock baseline;
   lifetime measured how). Guessing one and shipping it as "the" Gudang
   definition risks a warehouse decision resting on an invented formula
   nobody ratified — exactly the kind of unratified business rule
   Principle 7 forbids, dressed up as a computation instead of a workflow
   rule. Flagged here and in the Phase 8 report, not silently skipped.

   RESTOCK RECOMMENDATION'S THRESHOLD: Doc 1/2 give worked EXAMPLES
   ("124 units -> ~18 days remaining", "Restock recommended") but no
   numeric threshold anywhere. This file uses the simplest parameter-free
   reading available — recommend restock when Current Stock has fallen to
   one month of consumption or less at the item's own historical pace
   (`currentStock <= averageMonthlyConsumption`) — rather than inventing an
   arbitrary day-count cutoff (e.g. "14 days") that appears nowhere in the
   ratified documents. Documented here as a stated assumption, not hidden
   inside the math.

   "Consumption" is defined as GOODS_OUT movements only (never Adjustment
   or Stock Opname corrections) — the one reading that cannot be confused
   with correcting a miscount rather than genuine use.

   All functions read Movement/Stock through existing repositories/engines
   only (Doc 4 Art.IV: "Analytics never owns business data... reads,
   never becomes the record of anything") — nothing here writes anything.
   ============================================================ */

'use strict';

import { listMovements } from '../repository/movement-repository.js';
import { getProjection } from '../repository/stock-repository.js';
import { listItems } from '../repository/item-repository.js';
import { recalculateStock } from '../projection/stock-projection-engine.js';
import { MOVEMENT_TYPE } from '../contracts/movement-contract.js';
import { ITEM_TYPE } from '../contracts/item-contract.js';
import { success, failure, REPOSITORY_ERROR } from '../repository/repository-result.js';

const DAYS_PER_MONTH = 30;

/** How many distinct calendar months a set of Movements spans, minimum 1
 *  (never divide by zero, and a single day of history still counts as
 *  "one month" of observation rather than an undefined rate). Pure. */
function monthsSpanned(movements) {
  if (movements.length === 0) return 1;
  const times = movements.map((m) => new Date(m.createdAt).getTime());
  const earliest = Math.min(...times);
  const latest = Math.max(...times);
  const days = Math.max(1, (latest - earliest) / (1000 * 60 * 60 * 24));
  return Math.max(1, days / DAYS_PER_MONTH);
}

/** Current Stock for one item — Analytics reads this, it never derives it
 *  independently (Doc 3 Ch.05 remains Stock's sole owner). Recalculates
 *  first so a stale cache never silently skews a figure downstream. */
async function currentStockFor(itemId) {
  const recalculated = await recalculateStock(itemId);
  if (recalculated.ok) return success(recalculated.data.quantity);
  const cached = await getProjection(itemId);
  if (cached.ok) return success(cached.data.quantity);
  return cached;
}

/**
 * Average Monthly Consumption for one item: total GOODS_OUT quantity
 * issued, divided by the number of months that history spans.
 * @param {string} itemId
 * @returns {Promise<{ok:boolean, data:?number, error:*}>}
 */
export async function getAverageMonthlyConsumption(itemId) {
  if (typeof itemId !== 'string' || !itemId) return failure(REPOSITORY_ERROR.INVALID_INPUT, 'getAverageMonthlyConsumption: itemId is required.');
  const res = await listMovements({ itemId });
  if (!res.ok) return res;
  const goodsOut = res.data.filter((m) => m.type === MOVEMENT_TYPE.GOODS_OUT);
  if (goodsOut.length === 0) return success(0);
  const total = goodsOut.reduce((sum, m) => sum + Math.abs(m.quantityDelta), 0);
  return success(total / monthsSpanned(goodsOut));
}

/**
 * Department Consumption for one item: total GOODS_OUT quantity, grouped
 * by department, sorted highest-consuming first.
 * @param {string} itemId
 * @returns {Promise<{ok:boolean, data:?Array<{departmentId:string, quantity:number}>, error:*}>}
 */
export async function getDepartmentConsumption(itemId) {
  if (typeof itemId !== 'string' || !itemId) return failure(REPOSITORY_ERROR.INVALID_INPUT, 'getDepartmentConsumption: itemId is required.');
  const res = await listMovements({ itemId });
  if (!res.ok) return res;
  const byDept = new Map();
  for (const m of res.data) {
    if (m.type !== MOVEMENT_TYPE.GOODS_OUT || !m.departmentId) continue;
    byDept.set(m.departmentId, (byDept.get(m.departmentId) || 0) + Math.abs(m.quantityDelta));
  }
  const rows = [...byDept.entries()].map(([departmentId, quantity]) => ({ departmentId, quantity }));
  rows.sort((a, b) => b.quantity - a.quantity);
  return success(rows);
}

/**
 * Average Monthly Cost for one item: total (price x quantity) across
 * GOODS_IN movements that carried a price (Doc 2 §07: price is optional —
 * movements without one are excluded, never treated as zero-cost),
 * divided by the number of months that priced history spans.
 * @param {string} itemId
 * @returns {Promise<{ok:boolean, data:?number, error:*}>}
 */
export async function getAverageMonthlyCost(itemId) {
  if (typeof itemId !== 'string' || !itemId) return failure(REPOSITORY_ERROR.INVALID_INPUT, 'getAverageMonthlyCost: itemId is required.');
  const res = await listMovements({ itemId });
  if (!res.ok) return res;
  const priced = res.data.filter((m) => m.type === MOVEMENT_TYPE.GOODS_IN && m.price != null);
  if (priced.length === 0) return success(0);
  const total = priced.reduce((sum, m) => sum + m.price * Math.abs(m.quantityDelta), 0);
  return success(total / monthsSpanned(priced));
}

/**
 * Forecast: days remaining at the item's own historical consumption pace.
 * null means "not enough history to forecast" (Doc 2 §14 empty state),
 * never a guess.
 * @param {string} itemId
 * @returns {Promise<{ok:boolean, data:?number, error:*}>}
 */
export async function getForecastDaysRemaining(itemId) {
  if (typeof itemId !== 'string' || !itemId) return failure(REPOSITORY_ERROR.INVALID_INPUT, 'getForecastDaysRemaining: itemId is required.');
  const [stockRes, consumptionRes] = await Promise.all([currentStockFor(itemId), getAverageMonthlyConsumption(itemId)]);
  if (!stockRes.ok) return stockRes;
  if (!consumptionRes.ok) return consumptionRes;
  if (consumptionRes.data <= 0) return success(null);
  const dailyRate = consumptionRes.data / DAYS_PER_MONTH;
  return success(Math.round(stockRes.data / dailyRate));
}

/**
 * Restock Recommendation: a boolean decision (Analytics decides — Doc 3
 * Ch.10), true when Current Stock has fallen to one month of consumption
 * or less at the item's own pace. See header for why this threshold, not
 * a different one.
 * @param {string} itemId
 * @returns {Promise<{ok:boolean, data:?boolean, error:*}>}
 */
export async function isRestockRecommended(itemId) {
  if (typeof itemId !== 'string' || !itemId) return failure(REPOSITORY_ERROR.INVALID_INPUT, 'isRestockRecommended: itemId is required.');
  const [stockRes, consumptionRes] = await Promise.all([currentStockFor(itemId), getAverageMonthlyConsumption(itemId)]);
  if (!stockRes.ok) return stockRes;
  if (!consumptionRes.ok) return consumptionRes;
  if (consumptionRes.data <= 0) return success(false); // no consumption history — nothing to recommend against yet
  return success(stockRes.data <= consumptionRes.data);
}

/**
 * Top Consumed Items across the whole catalog: total GOODS_OUT quantity,
 * grouped by item, highest first, capped at `limit`.
 * @param {number} [limit]
 * @returns {Promise<{ok:boolean, data:?Array<{itemId:string, quantity:number}>, error:*}>}
 */
export async function getTopConsumedItems(limit = 5) {
  const res = await listMovements({});
  if (!res.ok) return res;
  const byItem = new Map();
  for (const m of res.data) {
    if (m.type !== MOVEMENT_TYPE.GOODS_OUT) continue;
    byItem.set(m.itemId, (byItem.get(m.itemId) || 0) + Math.abs(m.quantityDelta));
  }
  const rows = [...byItem.entries()].map(([itemId, quantity]) => ({ itemId, quantity }));
  rows.sort((a, b) => b.quantity - a.quantity);
  return success(rows.slice(0, Math.max(0, limit)));
}

/**
 * Top Departments across the whole catalog: total GOODS_OUT quantity,
 * grouped by department, highest first, capped at `limit`.
 * @param {number} [limit]
 * @returns {Promise<{ok:boolean, data:?Array<{departmentId:string, quantity:number}>, error:*}>}
 */
export async function getTopDepartments(limit = 5) {
  const res = await listMovements({});
  if (!res.ok) return res;
  const byDept = new Map();
  for (const m of res.data) {
    if (m.type !== MOVEMENT_TYPE.GOODS_OUT || !m.departmentId) continue;
    byDept.set(m.departmentId, (byDept.get(m.departmentId) || 0) + Math.abs(m.quantityDelta));
  }
  const rows = [...byDept.entries()].map(([departmentId, quantity]) => ({ departmentId, quantity }));
  rows.sort((a, b) => b.quantity - a.quantity);
  return success(rows.slice(0, Math.max(0, limit)));
}

/**
 * UPDATED — V1.28.0 Experience Layer. Home (Doc 2 §04) needs a catalog-wide
 * "Low Stock / Restock Recommendation" list — every function above answers
 * for ONE item, and no bulk shape existed. This composes the same,
 * already-decided isRestockRecommended()/getForecastDaysRemaining() per
 * Consumable item (never Assets — restock has no meaning for an identity-
 * tracked thing, Doc 1 Art.V) and returns the ones needing attention,
 * most-urgent first. It decides nothing new: every item's restock flag is
 * the exact same computation Phase 8 already shipped and tested.
 *
 * Capped at `limit` items scanned (default 50) — Doc 1 Art.IX (Performance)
 * requires Home to feel instant, and this makes one pair of reads per item
 * scanned with no cached/indexed low-stock list to query instead. This is a
 * real, named scaling limitation for a large catalog, not hidden behind the
 * cap; see the Experience Layer report.
 * @param {number} [limit]
 * @returns {Promise<{ok:boolean, data:?Array<{itemId:string, name:string, daysRemaining:?number}>, error:*}>}
 */
export async function getLowStockAlerts(limit = 50) {
  const itemsRes = await listItems();
  if (!itemsRes.ok) return itemsRes;
  const consumables = itemsRes.data.filter((i) => i.itemType === ITEM_TYPE.CONSUMABLE && i.active).slice(0, limit);

  const alerts = [];
  for (const item of consumables) {
    const [recommendedRes, daysRes] = await Promise.all([
      isRestockRecommended(item.itemId), getForecastDaysRemaining(item.itemId),
    ]);
    if (recommendedRes.ok && recommendedRes.data) {
      alerts.push({ itemId: item.itemId, name: item.name, daysRemaining: daysRes.ok ? daysRes.data : null });
    }
  }
  alerts.sort((a, b) => (a.daysRemaining ?? Infinity) - (b.daysRemaining ?? Infinity));
  return success(alerts);
}

/** Pure — exposed so tests can verify the month-span rule directly without
 *  needing Firebase (Doc 4 Art.III: one definition, reused, not copied). */
export { monthsSpanned as _monthsSpanned };
