/* ============================================================
   STOCK-STATUS-BULK.JS — Warehouse Smart Filtering (v1.29.1, Phase 2)

   PURPOSE: classify EVERY Consumable's stock status + forecast in ONE
   Movement read + ONE Projection read, for the Stock Status / Forecast
   filters (Features 5-6). analytics-engine.js's own functions are all
   per-item (one Firebase read per item per figure) — its
   getLowStockAlerts() header already names that as "a real, named
   scaling limitation" for a large catalog. This file exists so
   Filtering doesn't inherit that limitation: one bulk read of Movement
   + one bulk read of the Stock Projection cache, then everything else
   is computed in memory.

   MIRRORS, DOES NOT IMPORT OR MODIFY, analytics-engine.js's formulas
   (monthsSpanned, the Average-Monthly-Consumption divisor,
   getForecastDaysRemaining's day-rate math, isRestockRecommended's
   decision). That file keeps monthsSpanned module-private (only
   test-exported as _monthsSpanned) and every public function is
   per-item/async, so there is no bulk-shaped export to reuse without
   changing that file — which is on the Phase 2 DO NOT MODIFY list. If
   analytics-engine.js's formulas ever change, this file's copy must be
   updated by hand to match. Stated here, not hidden — same discipline
   analytics-engine.js's own header uses for its restock threshold
   (CLAUDE.md Principle 6/7: explainable, never an invented rule).

   STOCK SOURCE: the CACHED StockProjection (stock-repository.js's new
   listProjections(), one request for the whole catalog) — NOT
   analytics-engine.js's live recalculateStock() per item. This is the
   explicit, user-approved tradeoff for Filtering (see Phase 2 planning
   discussion): the projection cache is Doc 3 Ch.05's own steady-state
   source of truth, rebuilt on every Movement, so a bulk read of it is
   correct in the overwhelmingly common case and avoids one live
   recalculation per item on every filter render. gudang-home.js's
   existing per-card ensureCardData() already reads this same cache
   (getProjection), not a live recalculation, for the identical
   performance reason — this is consistent with existing practice.

   Consumable-only: Assets have no stock (Doc 1 Art.V) and are simply
   absent from the returned map — callers treat "not in the map" as
   "not applicable / not yet classified", never as a false match.
   ============================================================ */

'use strict';

import { ITEM_TYPE } from '../contracts/item-contract.js';
import { MOVEMENT_TYPE } from '../contracts/movement-contract.js';
import { listMovements } from '../repository/movement-repository.js';
import { listProjections } from '../repository/stock-repository.js';
import { success } from '../repository/repository-result.js';
import { STOCK_STATUS_FILTER } from './filter-engine.js';

const DAYS_PER_MONTH = 30;

// Mirrors analytics-engine.js#monthsSpanned exactly — see file header.
function monthsSpanned(movements) {
  if (movements.length === 0) return 1;
  const times = movements.map((m) => new Date(m.createdAt).getTime());
  const earliest = Math.min(...times);
  const latest = Math.max(...times);
  const days = Math.max(1, (latest - earliest) / (1000 * 60 * 60 * 24));
  return Math.max(1, days / DAYS_PER_MONTH);
}

// Mirrors analytics-engine.js#isRestockRecommended's decision, split into
// a 3-way partition instead of one boolean — OUT+LOW together are that
// function's `true`, AVAILABLE is its `false`.
function classify(quantity, avgMonthlyConsumption) {
  if (quantity <= 0) return STOCK_STATUS_FILTER.OUT;
  if (avgMonthlyConsumption > 0 && quantity <= avgMonthlyConsumption) return STOCK_STATUS_FILTER.LOW;
  return STOCK_STATUS_FILTER.AVAILABLE;
}

/**
 * Classify every Consumable in `items` (typically st.data.items, already
 * loaded — no extra Item read needed).
 * @param {Array<{itemId:string, itemType:string}>} items
 * @returns {Promise<{ok:boolean, data?:Object<string,{status:string, quantity:number, forecastDays:?number}>}>}
 */
export async function classifyStockBulk(items) {
  const consumableIds = new Set(items.filter((i) => i.itemType === ITEM_TYPE.CONSUMABLE).map((i) => i.itemId));
  if (consumableIds.size === 0) return success({});

  const [movementsRes, projectionsRes] = await Promise.all([listMovements({}), listProjections()]);
  if (!movementsRes.ok) return movementsRes;
  if (!projectionsRes.ok) return projectionsRes;

  const goodsOutByItem = new Map();
  for (const m of movementsRes.data) {
    if (m.type !== MOVEMENT_TYPE.GOODS_OUT || !consumableIds.has(m.itemId)) continue;
    if (!goodsOutByItem.has(m.itemId)) goodsOutByItem.set(m.itemId, []);
    goodsOutByItem.get(m.itemId).push(m);
  }

  const data = {};
  for (const itemId of consumableIds) {
    const projection = projectionsRes.data[itemId];
    const quantity = projection && typeof projection.quantity === 'number' ? projection.quantity : 0;
    const goodsOut = goodsOutByItem.get(itemId) || [];
    const totalConsumed = goodsOut.reduce((sum, m) => sum + Math.abs(m.quantityDelta), 0);
    const avgMonthlyConsumption = goodsOut.length === 0 ? 0 : totalConsumed / monthsSpanned(goodsOut);
    const forecastDays = avgMonthlyConsumption > 0 ? Math.round(quantity / (avgMonthlyConsumption / DAYS_PER_MONTH)) : null;
    data[itemId] = { status: classify(quantity, avgMonthlyConsumption), quantity, forecastDays };
  }
  return success(data);
}

/** Pure — exposed so tests can verify the mirrored formulas directly
 *  without Firebase, same convention as analytics-engine.js's own
 *  `_monthsSpanned` test-only export. */
export { monthsSpanned as _monthsSpanned, classify as _classify };
