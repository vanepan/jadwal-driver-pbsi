/* ============================================================
   DASHBOARD-ENGINE.JS — Warehouse Dashboard decision layer (v1.29.7)

   PURE. No DOM, no Firebase, no window — js/gudang/ui/gudang-dashboard.js
   (the screen) imports these, never re-derives them; same "UI never
   computes what an engine already owns" discipline every other Gudang
   screen follows (Doc 4 Art.V), and the reason this file lives outside
   js/gudang/ui/ entirely rather than inline in the screen file.

   This is a COMPOSITION layer, not a new source of stock/forecast truth —
   every function here reads a figure filters/stock-status-bulk.js
   (Filter Engine, frozen) or analytics-engine.js (Forecast Engine, frozen)
   already decided, and lays out/aggregates/thresholds on TOP of it. That
   split — "decide the number" vs. "decide what to call the number" — is
   the exact same shape analytics-engine.js's own isRestockRecommended()
   (a decision layered on Stock+Consumption) and quiet-intelligence-
   engine.js (a sentence layered on an already-decided number) already
   use throughout this codebase.

   MIRRORS, DOES NOT IMPORT, filter-engine.js's own forecastBucket() — see
   that function's own note below. Same "mirrors, does not import"
   discipline filters/stock-status-bulk.js's own header already discloses
   for the identical situation (the source function is frozen/unexported).

   OPERATIONAL-METRICS INVARIANT (post-review consistency audit): every
   operational widget — Overview's Low/Out counts, Warehouse Health, Low
   Stock, Forecast Summary — must describe the SAME dataset: ACTIVE items
   only. classifyStockBulk() (Filter Engine, frozen) classifies every
   Consumable regardless of active state — it has no opinion on archived
   items one way or the other, by design (Home applies its own "active
   only" rule at ITS layer, filter-engine.js#filterItems: `items.filter(i
   => i.active && ...)`). Before this audit, computeLowStockList() applied
   that same rule itself (iterating `items`, skipping `!i.active`), but
   computeOverviewCounts/computeWarehouseHealth/computeForecastSummary all
   iterated the RAW stockBulk map's values directly — an archived
   Consumable's stale OUT/LOW classification and forecast bucket still
   counted there, even though it had already vanished from every ACTIVE
   count (Total Items/Consumables/etc.). That mismatch ("Total Items = 3"
   next to "Forecast Summary total = 4") is exactly the inconsistency a
   dashboard cannot afford — one archived item, four already-wrong
   numbers, no error anywhere. activeStockBulk() below is now the ONE
   place this filtering happens; every function in this file that reads a
   status/forecast map documents that it expects an ALREADY active-scoped
   one, and gudang-dashboard.js computes it exactly ONCE per render and
   threads that same object through Overview, Health, Low Stock, and
   Forecast Summary — one filtering pass, not four independent ones.
   ============================================================ */

'use strict';

import { ITEM_TYPE } from '../contracts/item-contract.js';
import { categoryLabel } from '../config/gudang-categories.js';
// Filter Engine is frozen (Do Not Modify) — STOCK_STATUS_FILTER is a plain
// exported enum (config, not behavior); reading it is not modifying it.
// filters/stock-status-bulk.js's own classification map (this engine's
// one input) uses these exact same values, imported from the same place.
import { STOCK_STATUS_FILTER } from '../filters/filter-engine.js';
import { sortActivitiesDesc } from '../activity/activity-engine.js';
import { itemCreatedActivity, movementToActivity } from '../activity/gudang-activities.js';

/**
 * The one shared filtering step every operational widget's stock/forecast
 * figure must go through first — classifyStockBulk()'s own map, narrowed
 * to the itemIds that are CURRENTLY active in `items` (also naturally
 * drops any entry for an id that no longer exists in the catalog at all,
 * the same "id no longer in inventory" hygiene selection-engine.js's own
 * pruneSelection() already applies elsewhere in Gudang). Called ONCE per
 * render (gudang-dashboard.js), not once per widget — every function
 * below that takes a `stockBulk` parameter assumes it already went
 * through this, and none of them re-derives active-ness itself.
 * @param {object[]} items @param {object} stockBulk
 * @returns {object} the same {status,quantity,forecastDays} shape, active items only
 */
export function activeStockBulk(items, stockBulk) {
  const activeIds = new Set(items.filter((i) => i.active).map((i) => i.itemId));
  const out = {};
  for (const [itemId, v] of Object.entries(stockBulk || {})) {
    if (activeIds.has(itemId)) out[itemId] = v;
  }
  return out;
}

/**
 * Section 1 (Overview Cards). Total Items = Total Consumables + Total
 * Assets by construction (both are counts of ACTIVE catalog entries, the
 * same "active" reading gudang-home.js's own filter summary total already
 * uses) — Total Assets also carries the physical UNIT count separately,
 * since an Asset's operationally meaningful count is "how many units,"
 * not just "how many distinct products" (mirrors gudang-home.js's own
 * per-card asset unit count). `stockBulk` must already be active-scoped
 * (activeStockBulk() above) — Low/Out below would otherwise be able to
 * disagree with totalItems/totalConsumables about which items exist.
 * @param {object[]} items @param {object[]} assets @param {object} stockBulk
 */
export function computeOverviewCounts(items, assets, stockBulk) {
  const active = items.filter((i) => i.active);
  const consumables = active.filter((i) => i.itemType === ITEM_TYPE.CONSUMABLE);
  const assetItems = active.filter((i) => i.itemType === ITEM_TYPE.ASSET);
  const bulkValues = Object.values(stockBulk || {});
  return {
    totalItems: active.length,
    totalConsumables: consumables.length,
    totalAssets: assetItems.length,
    totalAssetUnits: assets.length,
    lowStock: bulkValues.filter((v) => v.status === STOCK_STATUS_FILTER.LOW).length,
    outOfStock: bulkValues.filter((v) => v.status === STOCK_STATUS_FILTER.OUT).length,
    archived: items.length - active.length,
  };
}

export const HEALTH_LEVEL = Object.freeze({ HEALTHY: 'healthy', ATTENTION: 'attention', CRITICAL: 'critical' });

/**
 * Section 2 (Warehouse Health). Reuses ONLY figures Stock/Forecast already
 * decided (classifyStockBulk's status + forecastDays per item) — nothing
 * here recomputes stock or forecast. The tri-state THRESHOLD itself is not
 * named anywhere in the brief (only the three labels are), so — same
 * discipline analytics-engine.js's restock threshold and filter-engine.js's
 * forecast buckets already use — it is stated explicitly here, not hidden:
 *   Critical  -> any item Out of Stock, OR any item's forecast < 7 days.
 *   Attention -> (not Critical) AND (any item Low Stock, OR any forecast
 *                between 7 and 30 days).
 *   Healthy   -> neither of the above.
 * `stockBulk` must already be active-scoped (activeStockBulk() above) — an
 * archived item's stale OUT/critical-forecast classification must never
 * turn the whole warehouse "Kritis" for stock nobody is tracking anymore.
 * @param {object} stockBulk
 */
export function computeWarehouseHealth(stockBulk) {
  const values = Object.values(stockBulk || {});
  const outCount = values.filter((v) => v.status === STOCK_STATUS_FILTER.OUT).length;
  const lowCount = values.filter((v) => v.status === STOCK_STATUS_FILTER.LOW).length;
  const criticalForecast = values.filter((v) => v.forecastDays != null && v.forecastDays < 7).length;
  const lowForecast = values.filter((v) => v.forecastDays != null && v.forecastDays >= 7 && v.forecastDays < 30).length;
  let level = HEALTH_LEVEL.HEALTHY;
  if (outCount > 0 || criticalForecast > 0) level = HEALTH_LEVEL.CRITICAL;
  else if (lowCount > 0 || lowForecast > 0) level = HEALTH_LEVEL.ATTENTION;
  return { level, outCount, lowCount, criticalForecast, lowForecast };
}

/** Mirrors filter-engine.js's own (unexported, frozen) forecastBucket()
 *  boundaries exactly — 0-6 days / 7-29 days / 30+ days / no history — so
 *  Forecast Summary's Safe/Low/Critical buckets always agree with what the
 *  Home filter labels "< 7 Hari"/"< 30 Hari"/"Forecast Aman". Copied, not
 *  imported: filter-engine.js is on the Do Not Modify list and never
 *  exported this function. Exported here as `_forecastBucket` only for
 *  scripts/gudang-dashboard-check.mjs, same test-only-export convention
 *  analytics-engine.js's `_monthsSpanned` already established. */
function forecastBucket(days) {
  if (days == null) return 'none';
  if (days < 7) return 'critical';
  if (days < 30) return 'low';
  return 'safe';
}
export { forecastBucket as _forecastBucket };

/** Section 8 (Forecast Summary). Consumables only — classifyStockBulk's map
 *  already excludes Assets (Doc 1 Art.V: no stock, no forecast).
 *  `stockBulk` must already be active-scoped (activeStockBulk() above) —
 *  otherwise `total` here can exceed Overview's totalConsumables (the
 *  exact "Total Items = 3, Forecast = 4" inconsistency the consistency
 *  audit flagged: an archived Consumable still classified by
 *  classifyStockBulk, no longer counted anywhere else).
 *  @param {object} stockBulk */
export function computeForecastSummary(stockBulk) {
  const values = Object.values(stockBulk || {});
  const out = { safe: 0, low: 0, critical: 0, none: 0 };
  for (const v of values) out[forecastBucket(v.forecastDays)]++;
  return { ...out, total: values.length };
}

/** Sections 6/7 (Category/Location Distribution). Active items of BOTH
 *  types (a Location or Category groups the whole catalog, not just
 *  Consumables) — plain in-memory aggregation over st.data.items, already
 *  loaded, zero new read. Sorted highest-count first; capped at `limit` so
 *  a catalog with many sparse categories never turns into a wall of
 *  one-item rows (Visual Design: "avoid decorative metrics").
 *  @param {object[]} items @param {number} [limit] */
export function computeCategoryDistribution(items, limit = 8) {
  const counts = new Map();
  for (const i of items) {
    if (!i.active) continue;
    const label = i.category ? categoryLabel(i.category) : 'Tanpa Kategori';
    counts.set(label, (counts.get(label) || 0) + 1);
  }
  return [...counts.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count).slice(0, limit);
}

/** @param {object[]} items @param {object[]} locations @param {number} [limit] */
export function computeLocationDistribution(items, locations, limit = 8) {
  const nameById = new Map(locations.map((l) => [l.locationId, l.name]));
  const counts = new Map();
  for (const i of items) {
    if (!i.active) continue;
    const label = i.defaultLocationId ? (nameById.get(i.defaultLocationId) || i.defaultLocationId) : 'Tanpa Lokasi';
    counts.set(label, (counts.get(label) || 0) + 1);
  }
  return [...counts.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count).slice(0, limit);
}

/** Section 3 (Low Stock). Sourced from the SAME classifyStockBulk map as
 *  Overview/Health/Forecast above — this is what makes "quantity
 *  remaining" available at all (analytics-engine.js#getLowStockAlerts, the
 *  only other existing precedent, never returns a quantity, only a days-
 *  remaining figure — see that function's own header). Out of Stock always
 *  ranks above Low Stock (an empty shelf is more urgent than a low one,
 *  regardless of forecast); within a tier, soonest-to-run-out first
 *  (mirrors getLowStockAlerts' own `?? Infinity` sort for items with no
 *  forecast yet). A stated ordering policy, not a new stock/forecast
 *  calculation. `stockBulk` must already be active-scoped (activeStock-
 *  Bulk() above) — this used to apply its own redundant `!i.active` check
 *  here; removed post-audit so there is exactly ONE place in this file
 *  that decides "is this item's stock figure operationally relevant,"
 *  not one embedded in every consumer. A lookup miss (archived, or simply
 *  not Low/Out) is still the correct reason to skip a row either way.
 *  @param {object[]} items @param {object} stockBulk @param {number} [limit] */
export function computeLowStockList(items, stockBulk, limit = 6) {
  const rows = [];
  for (const i of items) {
    if (i.itemType !== ITEM_TYPE.CONSUMABLE) continue;
    const s = (stockBulk || {})[i.itemId];
    if (!s || (s.status !== STOCK_STATUS_FILTER.LOW && s.status !== STOCK_STATUS_FILTER.OUT)) continue;
    rows.push({ itemId: i.itemId, name: i.name, quantity: s.quantity, status: s.status, forecastDays: s.forecastDays });
  }
  const statusRank = (s) => (s === STOCK_STATUS_FILTER.OUT ? 0 : 1);
  rows.sort((a, b) => statusRank(a.status) - statusRank(b.status) || (a.forecastDays ?? Infinity) - (b.forecastDays ?? Infinity));
  return rows.slice(0, limit);
}

/** Section 4 (Recent Activity). Composes the SAME Activity Timeline
 *  building blocks gudang-timeline.js uses per-item (v1.29.6) — never a
 *  second history model. `movements` must already be reverse-chronological
 *  (audit/movement-history-view.js#getMovementHistory's own contract), so
 *  slicing before mapping avoids converting more rows than will ever be
 *  shown.
 *  @param {object[]} movements @param {object[]} items @param {object[]} departments */
export function buildRecentActivity(movements, items, departments, { recentItemLimit = 4, movementLimit = 20, limit = 8 } = {}) {
  const recentItems = [...items].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, recentItemLimit);
  const entries = [
    ...recentItems.map(itemCreatedActivity),
    ...movements.slice(0, movementLimit).map((m) => movementToActivity(m, departments)),
  ];
  return sortActivitiesDesc(entries).slice(0, limit);
}
