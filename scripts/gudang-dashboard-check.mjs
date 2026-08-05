/* gudang-dashboard-check.mjs — Gudang v1.29.7, Warehouse Dashboard.

   Same check()/read() harness as scripts/gudang-activity-check.mjs. Parts:
     A. dashboard-engine.js (pure) — Overview counts (Total = Consumable +
        Asset, Low/Out from the bulk map, Archived), Warehouse Health's
        stated Critical/Attention/Healthy threshold (all four branches),
        the mirrored forecast bucket boundaries (0/6/7/29/30), Forecast
        Summary counts, Category/Location Distribution (grouping + "Tanpa
        Kategori"/"Tanpa Lokasi" + sort + cap), Low Stock ordering (Out
        before Low, then soonest-to-run-out), Recent Activity composition
        (Item Created + Movement entries, sorted, capped).
     B. Architecture — dashboard-engine.js is a pure composition layer
        (no DOM/Firebase/window); the full DO NOT MODIFY surface for this
        release shows no trace of it; js/gudang/ui/gudang-dashboard.js
        never re-derives a threshold itself; gudang-center.js/app.js wiring
        (screen routed, default screen, refresh busts the activity cache,
        nav button + land() target + the three screen-key maps all know
        "dashboard").
     C. Live render sweep — renderDashboard() for an empty catalog (Quick
        Actions still visible — the actual v1.29.7 regression a live
        Puppeteer run caught: it was hidden behind the old empty-state
        early-return) and a populated one spanning Out/Low/Safe stock,
        both item types, and a Recent Activity feed, no exceptions.
     D. Operational-metrics consistency audit (post-review) — activeStock-
        Bulk() drops an archived item's entry and any entry for an id no
        longer in the catalog; a direct reproduction of the reported bug
        ("Total Items = 3" next to "Forecast Summary total = 4") with an
        archived Consumable still present in the raw stockBulk map
        (classifyStockBulk has no active/archived opinion), asserting
        Overview/Health/Low-Stock/Forecast-Summary all agree once
        activeStockBulk() is applied — the archived item counts ONLY in
        Archived Items, nowhere else; a live render sweep proving the
        same end to end through gudang-dashboard.js itself, not just the
        pure functions in isolation.

   Deterministic. No live Firebase, no AI.
   Run: node scripts/gudang-dashboard-check.mjs   (exit 0 = pass) */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  computeOverviewCounts, HEALTH_LEVEL, computeWarehouseHealth, _forecastBucket, computeForecastSummary,
  computeCategoryDistribution, computeLocationDistribution, computeLowStockList, buildRecentActivity,
  activeStockBulk,
} from '../js/gudang/dashboard/dashboard-engine.js';
import { STOCK_STATUS_FILTER } from '../js/gudang/filters/filter-engine.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0; let fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); }
}
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

function isoDaysAgo(n) { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString(); }
function item(itemId, over = {}) {
  return { itemId, name: over.name || `Item ${itemId}`, itemType: 'consumable', category: null, defaultLocationId: null, active: true, createdAt: isoDaysAgo(30), ...over };
}
function asset(assetId, itemId, over = {}) { return { assetId, itemId, status: 'available', ...over }; }

/* ── Part A — dashboard-engine.js: pure aggregation ───────────────────── */
console.log('\n[Part A — dashboard-engine.js: Overview/Health/Forecast/Distribution/Low-Stock/Recent-Activity]');
{
  const items = [
    item('i1', { itemType: 'consumable', active: true }),
    item('i2', { itemType: 'consumable', active: true }),
    item('i3', { itemType: 'asset', active: true }),
    item('i4', { itemType: 'consumable', active: false }), // archived
  ];
  const assets = [asset('a1', 'i3'), asset('a2', 'i3')];
  const bulk = {
    i1: { status: STOCK_STATUS_FILTER.OUT, quantity: 0, forecastDays: null },
    i2: { status: STOCK_STATUS_FILTER.LOW, quantity: 4, forecastDays: 12 },
  };
  const counts = computeOverviewCounts(items, assets, bulk);
  check('computeOverviewCounts(): Total Items counts only ACTIVE entries (3, not 4)', counts.totalItems === 3);
  check('computeOverviewCounts(): Total = Consumable + Asset by construction', counts.totalItems === counts.totalConsumables + counts.totalAssets);
  check('computeOverviewCounts(): Total Consumables is 2, Total Assets is 1 (distinct items, not units)', counts.totalConsumables === 2 && counts.totalAssets === 1);
  check('computeOverviewCounts(): Total Asset UNITS is a separate figure (2), not conflated with the Asset item count', counts.totalAssetUnits === 2);
  check('computeOverviewCounts(): Low/Out come straight from the bulk classification map (1 each)', counts.lowStock === 1 && counts.outOfStock === 1);
  check('computeOverviewCounts(): Archived is items.length - active.length (1)', counts.archived === 1);

  // Warehouse Health — all three branches of the stated threshold.
  check('computeWarehouseHealth(): any Out of Stock item -> Critical', computeWarehouseHealth({ x: { status: STOCK_STATUS_FILTER.OUT, forecastDays: null } }).level === HEALTH_LEVEL.CRITICAL);
  check('computeWarehouseHealth(): any forecast < 7 days (no Out) -> Critical', computeWarehouseHealth({ x: { status: STOCK_STATUS_FILTER.AVAILABLE, forecastDays: 3 } }).level === HEALTH_LEVEL.CRITICAL);
  check('computeWarehouseHealth(): any Low Stock (no Out, no <7d forecast) -> Attention', computeWarehouseHealth({ x: { status: STOCK_STATUS_FILTER.LOW, forecastDays: null } }).level === HEALTH_LEVEL.ATTENTION);
  check('computeWarehouseHealth(): a forecast in [7,30) (no Out/Low) -> Attention', computeWarehouseHealth({ x: { status: STOCK_STATUS_FILTER.AVAILABLE, forecastDays: 20 } }).level === HEALTH_LEVEL.ATTENTION);
  check('computeWarehouseHealth(): everything Available, no near-term forecast -> Healthy', computeWarehouseHealth({ x: { status: STOCK_STATUS_FILTER.AVAILABLE, forecastDays: 90 } }).level === HEALTH_LEVEL.HEALTHY);
  check('computeWarehouseHealth(): an empty catalog -> Healthy (vacuously, never Critical/Attention)', computeWarehouseHealth({}).level === HEALTH_LEVEL.HEALTHY);

  // Forecast bucket boundaries — exact mirror of filter-engine.js's own (frozen, unexported) forecastBucket().
  check('_forecastBucket(): null -> "none" (no history, same as filter-engine.js\'s NONE)', _forecastBucket(null) === 'none');
  check('_forecastBucket(): 6 -> "critical" (< 7), 7 -> "low" (boundary flips exactly at 7, not 6 or 8)', _forecastBucket(6) === 'critical' && _forecastBucket(7) === 'low');
  check('_forecastBucket(): 29 -> "low" (< 30), 30 -> "safe" (boundary flips exactly at 30)', _forecastBucket(29) === 'low' && _forecastBucket(30) === 'safe');

  const fc = computeForecastSummary({
    a: { forecastDays: 3 }, b: { forecastDays: 15 }, c: { forecastDays: 45 }, d: { forecastDays: null },
  });
  check('computeForecastSummary(): one item per bucket lands in exactly that bucket', fc.critical === 1 && fc.low === 1 && fc.safe === 1 && fc.none === 1 && fc.total === 4);

  // Category/Location Distribution.
  const catItems = [
    item('c1', { category: 'atk', active: true }), item('c2', { category: 'atk', active: true }),
    item('c3', { category: null, active: true }), item('c4', { category: 'atk', active: false }),
  ];
  const catDist = computeCategoryDistribution(catItems);
  check('computeCategoryDistribution(): groups by label, excludes archived, sorts highest first (ATK=2 before Tanpa Kategori=1)', catDist[0].label === 'ATK' && catDist[0].count === 2 && catDist[1].label === 'Tanpa Kategori' && catDist[1].count === 1);

  const locItems = [item('l1', { defaultLocationId: 'loc1', active: true }), item('l2', { defaultLocationId: null, active: true })];
  const locDist = computeLocationDistribution(locItems, [{ locationId: 'loc1', name: 'Gudang Utama' }]);
  check('computeLocationDistribution(): resolves locationId to a real name, "Tanpa Lokasi" for null', locDist.some((r) => r.label === 'Gudang Utama') && locDist.some((r) => r.label === 'Tanpa Lokasi'));

  // Low Stock ordering: Out before Low; within a tier, soonest-to-run-out first; no-forecast sorts last within its tier.
  const lsItems = [
    item('low-far', { itemType: 'consumable' }), item('low-near', { itemType: 'consumable' }),
    item('out-item', { itemType: 'consumable' }), item('healthy', { itemType: 'consumable' }),
    item('asset-item', { itemType: 'asset' }),
  ];
  const lsBulk = {
    'low-far': { status: STOCK_STATUS_FILTER.LOW, quantity: 5, forecastDays: 25 },
    'low-near': { status: STOCK_STATUS_FILTER.LOW, quantity: 2, forecastDays: 9 },
    'out-item': { status: STOCK_STATUS_FILTER.OUT, quantity: 0, forecastDays: null },
    healthy: { status: STOCK_STATUS_FILTER.AVAILABLE, quantity: 50, forecastDays: 90 },
  };
  const lowStockRows = computeLowStockList(lsItems, lsBulk);
  check('computeLowStockList(): excludes Assets (no stock concept) and Available items', lowStockRows.every((r) => r.itemId !== 'asset-item' && r.itemId !== 'healthy'));
  check('computeLowStockList(): Out of Stock ranks first regardless of forecast, then Low by soonest-to-run-out', lowStockRows.map((r) => r.itemId).join(',') === 'out-item,low-near,low-far');
  check('computeLowStockList(): quantity remaining is carried through (not just a forecast day count)', lowStockRows.find((r) => r.itemId === 'low-near').quantity === 2);

  // Recent Activity composition.
  const raItems = [item('new1', { createdAt: isoDaysAgo(0) }), item('old1', { createdAt: isoDaysAgo(60) })];
  const movements = [
    { movementId: 'mv1', itemId: 'old1', departmentId: null, when: isoDaysAgo(1), who: 'u1', what: 'Goods Out', why: 'Issued', quantityDelta: -3, price: null, type: 'goods_out', reason: 'issue', purpose: null, notes: null },
  ];
  const activity = buildRecentActivity(movements, raItems, [], { limit: 10 });
  check('buildRecentActivity(): includes both a synthesized Item Created entry and a real Movement entry', activity.some((a) => a.type === 'item_created') && activity.some((a) => a.type === 'goods_out'));
  check('buildRecentActivity(): newest first (today\'s Item Created before yesterday\'s Goods Out)', activity[0].id === 'created-new1');
  const capped = buildRecentActivity(movements, raItems, [], { limit: 1 });
  check('buildRecentActivity(): respects the `limit` option', capped.length === 1);
}

/* ── Part B — Architecture ─────────────────────────────────────────────── */
console.log('\n[Part B — Architecture: dashboard-engine.js is a pure composition layer; Do Not Modify untouched; wiring complete]');
{
  const engineCode = read('js/gudang/dashboard/dashboard-engine.js');
  check('dashboard-engine.js touches no DOM/Firebase/window (pure composition over already-decided figures)', !/document\.|window\.|firebase\.js/.test(engineCode));
  check('dashboard-engine.js never hardcodes a "gudang/..." RTDB path literal', !/['"`]gudang\//.test(engineCode));

  const doNotModify = [
    'js/gudang/repository/item-repository.js', // Inventory Engine
    'js/gudang/search/search-resolver.js', // Search Engine
    'js/gudang/filters/filter-engine.js', 'js/gudang/filters/stock-status-bulk.js', // Filter Engine
    'js/gudang/selection/selection-engine.js', // Selection Engine
    'js/gudang/bulk/bulk-executor.js', 'js/gudang/bulk/bulk-goods-out.js', 'js/gudang/bulk/bulk-archive.js', 'js/gudang/bulk/bulk-edit.js', 'js/gudang/bulk/bulk-export.js', 'js/gudang/ui/gudang-bulk-ui.js', // Bulk Operations
    'js/gudang/upload/upload-engine.js', 'js/gudang/ui/gudang-item-image.js', 'js/gudang/ui/gudang-photo-upload.js', // Upload Engine
    'js/gudang/analytics/analytics-engine.js', // Forecast Engine
    'js/gudang/activity/activity-engine.js', 'js/gudang/activity/gudang-activities.js', 'js/gudang/ui/gudang-timeline.js', // Activity Timeline
    'js/vehicles-store.js', // Vehicle Module
    'database.rules.json', // Firebase Schema
    'js/auth.js',
  ];
  for (const rel of doNotModify) {
    const code = read(rel);
    check(`${rel} (Do Not Modify) shows no trace of the Warehouse Dashboard`, !code.includes('dashboard-engine') && !code.includes('gudang-dashboard'));
  }

  const dashCode = read('js/gudang/ui/gudang-dashboard.js');
  check('gudang-dashboard.js imports its computation from dashboard-engine.js', dashCode.includes("from '../dashboard/dashboard-engine.js'"));
  check('gudang-dashboard.js contains no forecast/health threshold comparison itself (e.g. "forecastDays <" or "days <")', !/\bdays\s*[<>]=?\s*\d/.test(dashCode) && !/forecastDays\s*[<>]=?/.test(dashCode));
  check('gudang-dashboard.js declares no new acts — every data-act is a literal gud-goto/gud-open-item/gud-quick-goods-*/gud-cat-add-item-home', !/data-act="gud-dash-/.test(dashCode));

  const centerCode = read('js/gudang/ui/gudang-center.js');
  check('gudang-center.js imports renderDashboard and routes the "dashboard" screen', centerCode.includes('renderDashboard') && /case 'dashboard':/.test(centerCode));
  check('gudang-center.js defaults to the Dashboard (both st.screen\'s initial value and setGudangScreen\'s fallback)', /screen:\s*'dashboard'/.test(centerCode) && /next = screen \|\| 'dashboard'/.test(centerCode));
  check('refreshCatalog() busts the Dashboard\'s own Recent Activity cache (Section 10: Live Refresh)', /st\.dashboardActivity = null/.test(centerCode));

  const homeCode = read('js/gudang/ui/gudang-home.js');
  check('gudang-home.js\'s ensureStockBulk is exported (shared cache slot, not duplicated by the Dashboard)', /export function ensureStockBulk/.test(homeCode));

  const appCode = read('js/app.js');
  check('app.js has a v2NavGudDashboard nav button with a real click listener', /getElementById\('v2NavGudDashboard'\)\?\.addEventListener\('click'/.test(appCode));
  check('app.js\'s gudang land() target is now the Dashboard, not Home', /land:\s*\(\)\s*=>\s*navGudang\('dashboard',\s*'v2NavGudDashboard'\)/.test(appCode));
  check('app.js\'s three Gudang screen-key maps (titles/bottom-nav/nav-id) all know "dashboard"', /dashboard:\s*'Dashboard'/.test(appCode) && /dashboard:\s*'navGudDashboard'/.test(appCode) && /dashboard:\s*'v2NavGudDashboard'/.test(appCode));
}

/* ── Part C — Live render sweep ───────────────────────────────────────── */
console.log('\n[Part C — renderDashboard(): empty catalog and a populated one, no exceptions]');
{
  const { renderDashboard } = await import('../js/gudang/ui/gudang-dashboard.js');

  let threw = null;
  try {
    // Empty catalog — the exact v1.29.7 regression a live Puppeteer run
    // caught: Quick Actions must stay visible even here (mirrors
    // gudang-home.js's own unconditionally-visible FAB row), so "Tambah
    // Item" is always reachable, especially on a brand-new install.
    const emptySt = { data: { items: [], locations: [], departments: [], assets: [] }, loading: false, homeStockBulk: null, homeStockBulkLoading: false };
    const emptyHtml = renderDashboard(emptySt, {}, () => {});
    check('empty catalog: renders the empty state', emptyHtml.includes('Gudang siap digunakan'));
    check('empty catalog: Quick Actions still renders (Tambah Item reachable) — the actual bug the Puppeteer interaction check caught', emptyHtml.includes('data-act="gud-cat-add-item-home"') && emptyHtml.includes('AKSI CEPAT'));
    check('empty catalog: does not render Overview Cards (nothing to summarize yet)', !emptyHtml.includes('gud-ov-grid'));

    // Populated catalog — both item types, Out/Low/Safe stock, a Recent Activity feed.
    const items = [
      item('p1', { name: 'Kertas A4', itemType: 'consumable', category: 'atk', defaultLocationId: 'loc1' }),
      item('p2', { name: 'Tinta Printer', itemType: 'consumable', category: 'atk' }),
      item('p3', { name: 'Laptop Dell', itemType: 'asset', category: 'laptop' }),
    ];
    const popSt = {
      data: { items, locations: [{ locationId: 'loc1', name: 'Gudang Utama' }], departments: [{ departmentId: 'd1', name: 'Engineering' }], assets: [asset('a1', 'p3')] },
      loading: false,
      homeStockBulk: {
        p1: { status: STOCK_STATUS_FILTER.OUT, quantity: 0, forecastDays: null },
        p2: { status: STOCK_STATUS_FILTER.LOW, quantity: 3, forecastDays: 18 },
      },
      homeStockBulkLoading: false,
      dashboardActivity: { movements: [
        { movementId: 'mv1', itemId: 'p1', departmentId: 'd1', when: isoDaysAgo(0), who: 'u1', what: 'Goods Out', why: 'Issued', quantityDelta: -5, price: null, type: 'goods_out', reason: 'issue', purpose: null, notes: null },
      ] },
      dashboardActivityLoading: false,
    };
    const popHtml = renderDashboard(popSt, {}, () => {});
    check('populated catalog: renders Overview Cards, Health banner, Low Stock, Recent Activity, Quick Actions, Distributions, Forecast Summary', ['gud-ov-grid', 'gud-health-banner', 'STOK RENDAH', 'AKTIVITAS TERBARU', 'AKSI CEPAT', 'Distribusi Kategori', 'Distribusi Lokasi', 'Forecast Summary'].every((s) => popHtml.includes(s)));
    check('populated catalog: Health banner reads Critical (an Out of Stock item is present)', popHtml.includes('data-tone="crit"') && popHtml.includes('Kritis'));
    check('populated catalog: Low Stock row shows the item name and a real quantity, not just a forecast sentence', popHtml.includes('Kertas A4') && popHtml.includes('Stok Habis'));
    check('populated catalog: a Recent Activity row for the Goods Out movement is clickable back to its item', /data-act="gud-open-item" data-id="p1"/.test(popHtml));
    check('populated catalog: no raw "undefined"/"NaN" leaked into the markup', !popHtml.includes('undefined') && !popHtml.includes('NaN'));
  } catch (err) {
    threw = err;
  }
  check('the entire render sweep threw no exception', threw === null);
  if (threw) console.log('    ', threw.stack || threw);
}

/* ── Part D — Operational-metrics consistency audit (post-review) ──────── */
console.log('\n[Part D — Consistency audit: archived items count ONLY in Archived Items, nowhere else]');
{
  // classifyStockBulk (Filter Engine, frozen) classifies every Consumable
  // regardless of active state — it has no active/archived opinion. This
  // RAW map (as gudang-home.js's ensureStockBulk would actually hand back)
  // still contains an entry for 'archived1', even though that item is no
  // longer active. Reproduces the exact reported bug: without
  // activeStockBulk(), Forecast Summary's total (2) would exceed Overview's
  // totalConsumables (1) — "Total Items = 3, Forecast = 4" in miniature.
  const items = [
    item('active1', { itemType: 'consumable', active: true }),
    item('archived1', { itemType: 'consumable', active: false }),
    item('asset1', { itemType: 'asset', active: true }),
  ];
  const rawStockBulk = {
    active1: { status: STOCK_STATUS_FILTER.AVAILABLE, quantity: 50, forecastDays: 45 },
    // Still OUT and still classified — item-repository.js#archiveItem never
    // touches Movement/Stock, so a just-archived item can easily still be
    // sitting at zero, or worse, still be the one item dragging Health into
    // "Kritis" for stock nobody is operationally tracking anymore.
    archived1: { status: STOCK_STATUS_FILTER.OUT, quantity: 0, forecastDays: null },
  };

  const scoped = activeStockBulk(items, rawStockBulk);
  check('activeStockBulk(): drops the archived item\'s entry entirely', !('archived1' in scoped));
  check('activeStockBulk(): keeps the active item\'s entry untouched', scoped.active1 && scoped.active1.quantity === 50);
  const staleBulk = { ...rawStockBulk, ghost: { status: STOCK_STATUS_FILTER.OUT, quantity: 0, forecastDays: null } };
  check('activeStockBulk(): also drops an entry for an id no longer in `items` at all (stale cache hygiene)', !('ghost' in activeStockBulk(items, staleBulk)));

  const counts = computeOverviewCounts(items, [], scoped);
  const health = computeWarehouseHealth(scoped);
  const forecast = computeForecastSummary(scoped);
  const lowStock = computeLowStockList(items, scoped);
  check('FIXED: Overview totalConsumables (1) now matches Forecast Summary total (1) — the reported inconsistency, reproduced and closed', counts.totalConsumables === 1 && forecast.total === 1 && counts.totalConsumables === forecast.total);
  check('FIXED: outOfStock is 0 (the only Out item is archived) — Overview and the archived item\'s stale status no longer agree by accident', counts.outOfStock === 0);
  check('FIXED: Warehouse Health is Healthy, not Kritis, for an archived item\'s stale Out-of-Stock status', health.level === HEALTH_LEVEL.HEALTHY);
  check('FIXED: the archived item never appears in the Low Stock list', lowStock.every((r) => r.itemId !== 'archived1'));
  check('archived count still reflects it — Archived Items is the ONE card allowed to count it', counts.archived === 1);

  // End-to-end proof through the actual screen render, not just the pure
  // functions in isolation — a real archived item, still present in
  // st.homeStockBulk exactly as ensureStockBulk() would leave it (nothing
  // in gudang-home.js prunes archived entries out of that cache either).
  const { renderDashboard } = await import('../js/gudang/ui/gudang-dashboard.js');
  const liveSt = {
    data: {
      items: [
        item('v1', { name: 'Item Aktif', itemType: 'consumable', active: true }),
        item('v2', { name: 'Item Terarsip', itemType: 'consumable', active: false }),
      ],
      locations: [], departments: [], assets: [],
    },
    loading: false,
    homeStockBulk: {
      v1: { status: STOCK_STATUS_FILTER.AVAILABLE, quantity: 20, forecastDays: 40 },
      v2: { status: STOCK_STATUS_FILTER.OUT, quantity: 0, forecastDays: null },
    },
    homeStockBulkLoading: false,
    dashboardActivity: { movements: [] },
    dashboardActivityLoading: false,
  };
  const liveHtml = renderDashboard(liveSt, {}, () => {});
  check('live render: Total Item reads 1 (only the active item)', liveHtml.includes('<div class="gud-ov-val">1</div>\n    <div class="gud-ov-title">Total Item</div>'));
  check('live render: Stok Habis (Out of Stock) overview card reads 0, not 1 — the archived item\'s Out status is excluded', liveHtml.includes('<div class="gud-ov-val">0</div>\n    <div class="gud-ov-title">Stok Habis</div>'));
  // Forecast Summary always renders a "Kritis" CELL LABEL regardless of its
  // count (0 is still a valid, always-shown bucket) — so this checks the
  // health BANNER specifically (data-tone="ok", the Healthy tone), not mere
  // absence of the word "Kritis" anywhere on the page.
  check('live render: Warehouse Health banner is Healthy (tone "ok"), not Critical', /gud-health-banner" data-tone="ok"/.test(liveHtml) && liveHtml.includes('Sehat'));
  check('live render: the archived item\'s name never appears anywhere on the page', !liveHtml.includes('Item Terarsip'));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
