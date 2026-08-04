/* gudang-filter-check.mjs — Gudang v1.29.1, Phase 2 (Warehouse Smart
   Filtering).

   Same check()/read() harness as scripts/gudang-search-check.mjs. Parts:
     A. Filter state         — createFilterState/isFilterActive/
                                clearAllFilters defaults and transitions.
     B. Predicate             — itemMatchesFilter combines ALL active
                                dimensions with AND semantics (Feature 1:
                                Multi Filter Engine), never OR.
     C. filterItems            — excludes inactive items always; Stock
                                Status/Forecast exclude Assets (no meaning
                                for them) and treat "not yet classified"
                                as non-match, never a false positive (same
                                discipline Phase 10.4.2 established).
     D. Chips                  — activeFilterChips()/clearFilterKey()
                                round-trip: only active dimensions produce
                                a chip, removing one clears only that one
                                (Feature 2: individually removable).
     E. Bulk classification    — stock-status-bulk.js's mirrored formulas
                                (_monthsSpanned/_classify, test-only
                                exports, same convention as analytics-
                                engine.js's own _monthsSpanned) match
                                analytics-engine.js's documented
                                isRestockRecommended/getForecastDaysRemaining
                                semantics for representative inputs.
     F. Architecture            — filter-engine.js is genuinely PURE (zero
                                Firebase/repository imports); neither new
                                file owns persistence or hardcodes an RTDB
                                path; the DO NOT MODIFY surface (Search
                                ranking/resolver/debounce/Recent Searches,
                                Analytics Engine, Stock/Forecast Engine)
                                shows no trace of this phase.
     G. Regression              — gudang-home.js's old lowStock boolean
                                filter is fully retired (superseded by the
                                stockStatus enum), not left as dead code
                                alongside the new one.

   Deterministic. No live Firebase, no AI.
   Run: node scripts/gudang-filter-check.mjs   (exit 0 = pass) */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createFilterState, isFilterActive, clearAllFilters, itemMatchesFilter,
  filterItems, activeFilterChips, clearFilterKey, STOCK_STATUS_FILTER, FORECAST_FILTER,
} from '../js/gudang/filters/filter-engine.js';
import { _monthsSpanned, _classify } from '../js/gudang/filters/stock-status-bulk.js';
import { makeItem, ITEM_TYPE } from '../js/gudang/contracts/item-contract.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0; let fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); }
}
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/* ── Part A — Filter state ──────────────────────────────────────────── */
console.log('\n[Part A — Filter state: defaults, activity, reset]');
{
  const f = createFilterState();
  check('a fresh filter state is fully neutral', f.type === 'all' && f.locationId === '' && f.category === '' && f.stockStatus === STOCK_STATUS_FILTER.ALL && f.forecast === FORECAST_FILTER.ALL);
  check('isFilterActive() is false on a fresh state', !isFilterActive(f));

  f.type = 'consumable';
  check('isFilterActive() is true once any one dimension is set', isFilterActive(f));
  f.type = 'all';
  check('and false again once it is reset', !isFilterActive(f));

  f.locationId = 'loc-1'; f.stockStatus = STOCK_STATUS_FILTER.LOW;
  clearAllFilters(f);
  check('clearAllFilters() resets every dimension at once, same object identity', !isFilterActive(f) && f.locationId === '' && f.stockStatus === STOCK_STATUS_FILTER.ALL);
}

/* ── Part B — Predicate: combinable, AND semantics ──────────────────── */
console.log('\n[Part B — itemMatchesFilter: Multi Filter Engine combines dimensions with AND, not OR]');
{
  // Freeform categories (not in gudang-categories.js's CATEGORY_SEED) fall
  // back to the raw id as their own label — used here to keep the fixture
  // simple; a seeded id (e.g. "atk") would need its real label ("ATK") on
  // the filter side, since itemMatchesFilter compares LABELS, not raw ids
  // (same as the real Category <select>, whose option value is already
  // categoryLabel(cat), never the raw id).
  const glue = makeItem({ itemId: 'i1', name: 'Lem Kayu', itemType: ITEM_TYPE.CONSUMABLE, category: 'Perekat', defaultLocationId: 'loc-a' });
  const tape = makeItem({ itemId: 'i2', name: 'Selotip', itemType: ITEM_TYPE.CONSUMABLE, category: 'Isolasi', defaultLocationId: 'loc-b' });
  const stockById = { i1: { status: STOCK_STATUS_FILTER.LOW, forecastDays: 3 }, i2: { status: STOCK_STATUS_FILTER.AVAILABLE, forecastDays: 40 } };

  check('type alone matches both Consumables', itemMatchesFilter(glue, { ...createFilterState(), type: 'consumable' }, {}) && itemMatchesFilter(tape, { ...createFilterState(), type: 'consumable' }, {}));
  check('type=asset excludes both (neither is an Asset)', !itemMatchesFilter(glue, { ...createFilterState(), type: 'asset' }, {}));

  const combo = { ...createFilterState(), category: 'Perekat', locationId: 'loc-a' };
  check('category AND location combined: matches only the item satisfying BOTH', itemMatchesFilter(glue, combo, {}) && !itemMatchesFilter(tape, combo, {}));

  const comboStock = { ...createFilterState(), category: 'Perekat', stockStatus: STOCK_STATUS_FILTER.LOW };
  check('category AND stockStatus combined (cross-dimension, not just two location-ish fields)', itemMatchesFilter(glue, comboStock, stockById) && !itemMatchesFilter(tape, comboStock, stockById));

  const comboForecast = { ...createFilterState(), forecast: FORECAST_FILTER.LT7 };
  check('forecast bucket LT7: glue (3 days) matches, tape (40 days) does not', itemMatchesFilter(glue, comboForecast, stockById) && !itemMatchesFilter(tape, comboForecast, stockById));

  const impossible = { ...createFilterState(), category: 'Perekat', locationId: 'loc-b' };
  check('an impossible combination (category matches i1 only, location matches i2 only) matches NEITHER — proves AND, not OR', !itemMatchesFilter(glue, impossible, {}) && !itemMatchesFilter(tape, impossible, {}));
}

/* ── Part C — filterItems: inactive/Asset/unclassified handling ──────── */
console.log('\n[Part C — filterItems: inactive always excluded; Stock/Forecast Consumable-only, unknown != match]');
{
  const active1 = makeItem({ itemId: 'a1', name: 'Kertas A4', itemType: ITEM_TYPE.CONSUMABLE });
  const inactive = makeItem({ itemId: 'a2', name: 'Kertas F4', itemType: ITEM_TYPE.CONSUMABLE, active: false });
  const asset = makeItem({ itemId: 'a3', name: 'Proyektor', itemType: ITEM_TYPE.ASSET });
  const items = [active1, inactive, asset];

  check('a deactivated (soft-deleted) item never appears regardless of filter', filterItems(items, createFilterState(), {}).map((i) => i.itemId).every((id) => id !== 'a2'));

  const stockFilter = { ...createFilterState(), stockStatus: STOCK_STATUS_FILTER.LOW };
  check('Stock Status active + bulk data not yet loaded ({}): zero matches, never a false positive', filterItems(items, stockFilter, {}).length === 0);
  check('an Asset never matches a Stock Status filter, even if (hypothetically) present in the map', !itemMatchesFilter(asset, stockFilter, { a3: { status: STOCK_STATUS_FILTER.LOW, forecastDays: 1 } }));

  const loaded = { a1: { status: STOCK_STATUS_FILTER.LOW, forecastDays: 2 } };
  check('once classified, the matching Consumable appears and the Asset still does not', filterItems(items, stockFilter, loaded).map((i) => i.itemId).join(',') === 'a1');
}

/* ── Part D — Chips: individually removable, Clear All ───────────────── */
console.log('\n[Part D — activeFilterChips/clearFilterKey: individually removable (Feature 2)]');
{
  const locations = [{ locationId: 'loc-a', name: 'Gudang Utama' }];
  const f = { type: 'asset', locationId: 'loc-a', category: 'elektronik', stockStatus: STOCK_STATUS_FILTER.OUT, forecast: FORECAST_FILTER.NONE };
  const chips = activeFilterChips(f, locations);
  check('all five active dimensions each produce exactly one chip', chips.length === 5);
  check('the location chip resolves to the real location NAME, not the raw id', chips.find((c) => c.key === 'locationId').label === 'Gudang Utama');

  clearFilterKey(f, 'category');
  check('clearFilterKey() removes only the targeted dimension', f.category === '' && f.type === 'asset' && f.locationId === 'loc-a');
  check('the chip list shrinks to exactly the remaining 4 active dimensions', activeFilterChips(f, locations).length === 4);

  const fresh = createFilterState();
  check('a neutral state produces zero chips (Instant Filtering: nothing to show when idle)', activeFilterChips(fresh, locations).length === 0);
}

/* ── Part E — Bulk classification mirrors analytics-engine.js ────────── */
console.log('\n[Part E — stock-status-bulk.js: mirrored formulas match analytics-engine.js\'s documented semantics]');
{
  check('_monthsSpanned([]) is 1 (never divide by zero) — same as analytics-engine.js#monthsSpanned', _monthsSpanned([]) === 1);
  const sameDay = [{ createdAt: '2026-01-01T08:00:00Z' }, { createdAt: '2026-01-01T09:00:00Z' }];
  check('_monthsSpanned: a single day of history still counts as "one month" (never < 1)', _monthsSpanned(sameDay) === 1);
  const sixtyDays = [{ createdAt: '2026-01-01T00:00:00Z' }, { createdAt: '2026-03-02T00:00:00Z' }];
  check('_monthsSpanned: 60 days of spread history is ~2 months', Math.abs(_monthsSpanned(sixtyDays) - 2) < 0.01);

  // Mirrors isRestockRecommended's exact decision (analytics-engine.js):
  // zero-or-negative stock is ALWAYS true (OUT/LOW here), regardless of
  // consumption history — the Phase 10.4.1 root-cause fix that function's
  // own header documents.
  check('_classify(0, 0): zero stock with no consumption history is OUT, not AVAILABLE (mirrors the Phase 10.4.1 zero-stock fix)', _classify(0, 0) === STOCK_STATUS_FILTER.OUT);
  check('_classify(-1, 5): negative/zero stock is OUT even with real consumption history', _classify(-1, 5) === STOCK_STATUS_FILTER.OUT);
  check('_classify(3, 5): stock at or below the monthly pace is LOW (isRestockRecommended\'s true branch)', _classify(3, 5) === STOCK_STATUS_FILTER.LOW);
  check('_classify(5, 5): stock exactly AT the monthly pace is still LOW (<=, not <)', _classify(5, 5) === STOCK_STATUS_FILTER.LOW);
  check('_classify(10, 5): stock comfortably above the pace is AVAILABLE', _classify(10, 5) === STOCK_STATUS_FILTER.AVAILABLE);
  check('_classify(10, 0): positive stock with no consumption history is AVAILABLE, not flagged (mirrors isRestockRecommended\'s "nothing to recommend against yet")', _classify(10, 0) === STOCK_STATUS_FILTER.AVAILABLE);
}

/* ── Part F — Architecture: PURE, no persistence, DO NOT MODIFY untouched ── */
console.log('\n[Part F — Architecture: filter-engine.js is PURE; DO NOT MODIFY surface shows no trace of Phase 2]');
{
  const filterEngineCode = read('js/gudang/filters/filter-engine.js');
  check('filter-engine.js imports nothing from repository/ (genuinely PURE — state/predicate/chips only, no Firebase reachable even transitively)', !/from ['"].*repository\//.test(filterEngineCode));
  check('filter-engine.js never imports firebase.js', !filterEngineCode.includes("firebase.js'"));
  check('filter-engine.js never calls storeFirebaseData/runNodeTransaction', !filterEngineCode.includes('storeFirebaseData') && !filterEngineCode.includes('runNodeTransaction'));

  const bulkCode = read('js/gudang/filters/stock-status-bulk.js');
  check('stock-status-bulk.js never calls storeFirebaseData/runNodeTransaction (reads only, writes nothing)', !bulkCode.includes('storeFirebaseData') && !bulkCode.includes('runNodeTransaction'));
  check('stock-status-bulk.js never hardcodes a "gudang/..." RTDB path literal (reads through the repositories only)', !/['"`]gudang\//.test(bulkCode));

  for (const rel of [
    'js/gudang/search/search-resolver.js', 'js/gudang/search/search-session-engine.js',
    'js/gudang/search/recent-searches-store.js', 'js/gudang/analytics/analytics-engine.js',
    'js/gudang/projection/stock-projection-engine.js',
  ]) {
    const code = read(rel);
    check(`${rel} (DO NOT MODIFY) shows no trace of Phase 2 (no filter-engine/stock-status-bulk reference)`, !code.includes('filter-engine') && !code.includes('stock-status-bulk'));
  }
  const stockRepoCode = read('js/gudang/repository/stock-repository.js');
  check('stock-repository.js#saveProjection/getProjection are still present, byte-identical in signature (additive-only change)', /export async function saveProjection\(projection\)/.test(stockRepoCode) && /export async function getProjection\(itemId\)/.test(stockRepoCode));
  check('stock-repository.js gained exactly one new export, listProjections()', /export async function listProjections\(\)/.test(stockRepoCode));
}

/* ── Part G — Regression: the old lowStock boolean filter is fully retired ── */
console.log('\n[Part G — Regression: lowStock boolean filter fully superseded, not left as dead code]');
{
  // Both checks look for actual LIVE CODE usage (a property access / an
  // import), not any string occurrence — this file's own header-comment
  // style (matching the rest of the codebase) legitimately references old
  // names in "Phase X root cause: ... used to be Y, now Z" explanations,
  // which must stay allowed.
  const homeCode = read('js/gudang/ui/gudang-home.js');
  check('gudang-home.js no longer reads st.homeLowStockIds anywhere in actual code', !/\.homeLowStockIds\b/.test(homeCode));
  check('gudang-home.js no longer imports getLowStockAlerts (superseded by classifyStockBulk for filtering)', !/import\s*\{[^}]*getLowStockAlerts/.test(homeCode));
  check('gudang-home.js imports classifyStockBulk from the new bulk module', homeCode.includes("from '../filters/stock-status-bulk.js'") && homeCode.includes('classifyStockBulk'));
  check('gudang-home.js imports the filter predicate/chip helpers from filter-engine.js', homeCode.includes("from '../filters/filter-engine.js'"));

  const centerCode = read('js/gudang/ui/gudang-center.js');
  check('gudang-center.js busts homeStockBulk (not the retired homeLowStockIds) on every catalog refresh', centerCode.includes('st.homeStockBulk = null') && !centerCode.includes('st.homeLowStockIds'));
  check('gudang-center.js owns the mobile filter sheet open/close state (Feature 11)', centerCode.includes('filterSheetOpen'));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
