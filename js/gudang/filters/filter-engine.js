/* ============================================================
   FILTER-ENGINE.JS — Warehouse Smart Filtering (v1.29.1, Phase 2)

   PURE. No DOM, no Firebase, no window, no localStorage — same
   discipline as search/search-resolver.js's matchTier() and
   search-session-engine.js. Owns three things only: the filter STATE
   shape, the item PREDICATE, and CHIP derivation for display.

   ARCHITECTURE (Phase 2 spec, "filtering independent from Search"):
   Search (Phase 1) narrows the catalog to CANDIDATES via its own
   ranking (search-resolver.js, untouched by this file). Filtering
   REDUCES that candidate set further. This module never ranks, never
   fetches, never touches Firebase — callers hand it an items array
   (already the Search result, or the full catalog when no query is
   active) and get a smaller array back. That makes it reusable
   unmodified by future phases (Bulk Operations, Warehouse
   Intelligence, Saved Views) per the spec's own Architecture
   requirement — none of them need to know this file exists inside
   "Warehouse Search & Discovery" or be rewritten to call it.

   Stock Status / Forecast need a per-item classification that isn't on
   the raw Item record (../filters/stock-status-bulk.js supplies it,
   one bulk read instead of Analytics Engine's per-item pattern) — this
   file is handed that map, it never computes stock/forecast itself
   (Doc 4 Art.V: UI/filtering layers never re-derive what an engine
   already owns).
   ============================================================ */

'use strict';

import { ITEM_TYPE } from '../contracts/item-contract.js';
import { categoryLabel } from '../config/gudang-categories.js';

export const STOCK_STATUS_FILTER = Object.freeze({ ALL: 'all', LOW: 'low', OUT: 'out', AVAILABLE: 'available' });

/*
 * Forecast buckets are NOT named anywhere in Doc 1-3 with an exact
 * numeric definition — the Phase 2 spec only lists the four option
 * LABELS ("<7 days/<30 days/Available/None"). To keep this a real
 * filter (every Consumable falls into exactly one bucket, no overlap,
 * no double-count — the same mutually-exclusive shape Stock Status
 * already has) rather than four independently-toggleable thresholds,
 * this file adopts one explicit, stated partition:
 *   LT7       -> 0 <= forecastDays < 7
 *   LT30      -> 7 <= forecastDays < 30
 *   AVAILABLE -> forecastDays >= 30           ("healthy runway")
 *   NONE      -> forecastDays == null         (not enough history —
 *                the exact same "null" analytics-engine.js's own
 *                getForecastDaysRemaining() JSDoc already defines as
 *                "not enough history to forecast")
 * A stated assumption, not an invented rule hidden inside the math —
 * same discipline analytics-engine.js's own header uses for its
 * restock threshold.
 */
export const FORECAST_FILTER = Object.freeze({ ALL: 'all', LT7: 'lt7', LT30: 'lt30', AVAILABLE: 'available', NONE: 'none' });

const STOCK_STATUS_LABEL = { low: 'Stok Rendah', out: 'Stok Habis', available: 'Stok Tersedia' };
const FORECAST_FILTER_LABEL = { lt7: '< 7 Hari', lt30: '< 30 Hari', available: 'Forecast Aman', none: 'Tanpa Forecast' };

/** Fresh, empty filter state — every dimension at its neutral/no-op value. */
export function createFilterState() {
  return { type: 'all', locationId: '', category: '', stockStatus: STOCK_STATUS_FILTER.ALL, forecast: FORECAST_FILTER.ALL };
}

/** True if any dimension is actively narrowing the catalog. */
export function isFilterActive(f) {
  return f.type !== 'all' || !!f.locationId || !!f.category
    || f.stockStatus !== STOCK_STATUS_FILTER.ALL || f.forecast !== FORECAST_FILTER.ALL;
}

/** Reset every dimension to neutral, in place (same object identity — callers hold a reference in their own state tree). */
export function clearAllFilters(f) {
  f.type = 'all'; f.locationId = ''; f.category = ''; f.stockStatus = STOCK_STATUS_FILTER.ALL; f.forecast = FORECAST_FILTER.ALL;
}

function forecastBucket(days) {
  if (days == null) return FORECAST_FILTER.NONE;
  if (days < 7) return FORECAST_FILTER.LT7;
  if (days < 30) return FORECAST_FILTER.LT30;
  return FORECAST_FILTER.AVAILABLE;
}

/**
 * The single predicate. `stockById` is stock-status-bulk.js's
 * classification map (itemId -> {status, forecastDays}); pass {} while
 * it's still loading — Stock Status/Forecast simply exclude every
 * Consumable until classified (unknown treated as non-match, never as
 * a false positive — same discipline Phase 10.4.2 established for the
 * old lowStock filter's "loading" gap).
 */
export function itemMatchesFilter(item, f, stockById) {
  if (f.type === 'consumable' && item.itemType !== ITEM_TYPE.CONSUMABLE) return false;
  if (f.type === 'asset' && item.itemType !== ITEM_TYPE.ASSET) return false;
  if (f.locationId && item.defaultLocationId !== f.locationId) return false;
  if (f.category && (!item.category || categoryLabel(item.category) !== f.category)) return false;

  const needsStock = f.stockStatus !== STOCK_STATUS_FILTER.ALL;
  const needsForecast = f.forecast !== FORECAST_FILTER.ALL;
  if (needsStock || needsForecast) {
    // Stock Status / Forecast have no meaning for Assets (Doc 1 Art.V: identity-tracked, not quantity-tracked).
    if (item.itemType !== ITEM_TYPE.CONSUMABLE) return false;
    const s = stockById[item.itemId];
    if (!s) return false;
    if (needsStock && s.status !== f.stockStatus) return false;
    if (needsForecast && forecastBucket(s.forecastDays) !== f.forecast) return false;
  }
  return true;
}

/** items -> filtered items. Always excludes inactive (soft-deleted) items, matching the pre-Phase-2 behavior this supersedes. */
export function filterItems(items, f, stockById) {
  return items.filter((i) => i.active && itemMatchesFilter(i, f, stockById));
}

/**
 * Derive the removable chip row (Feature 2: individually removable).
 * `locations` is the already-loaded locations array (st.data.locations)
 * — passed explicitly rather than a whole state object, so this stays
 * usable by any future caller with its own state shape.
 */
export function activeFilterChips(f, locations) {
  const chips = [];
  if (f.type !== 'all') chips.push({ key: 'type', label: f.type === 'consumable' ? 'Consumable' : 'Asset' });
  if (f.locationId) {
    const loc = (locations || []).find((l) => l.locationId === f.locationId);
    chips.push({ key: 'locationId', label: loc ? loc.name : f.locationId });
  }
  if (f.category) chips.push({ key: 'category', label: f.category });
  if (f.stockStatus !== STOCK_STATUS_FILTER.ALL) chips.push({ key: 'stockStatus', label: STOCK_STATUS_LABEL[f.stockStatus] });
  if (f.forecast !== FORECAST_FILTER.ALL) chips.push({ key: 'forecast', label: FORECAST_FILTER_LABEL[f.forecast] });
  return chips;
}

/** Clear exactly one dimension, by the `key` activeFilterChips() attached to its chip. */
export function clearFilterKey(f, key) {
  if (key === 'type') f.type = 'all';
  else if (key === 'locationId') f.locationId = '';
  else if (key === 'category') f.category = '';
  else if (key === 'stockStatus') f.stockStatus = STOCK_STATUS_FILTER.ALL;
  else if (key === 'forecast') f.forecast = FORECAST_FILTER.ALL;
}
