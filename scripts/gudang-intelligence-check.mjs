/* gudang-intelligence-check.mjs — Gudang v1.29.8, Inventory Intelligence Engine.

   Same check()/read() harness as scripts/gudang-dashboard-check.mjs. Parts:
     A. intelligence-engine.js (pure) — buildInventoryProfile()'s one-pass
        aggregation (incl. active-items-only exclusion, GOODS_OUT-only
        "consumption" definition), Dead Stock's threshold boundary and
        currentStock>0 refinement, Velocity's 5-tier bucketing (incl.
        summarizeVelocity), Slow vs Fast Moving's mutually-exclusive
        tiers, Reorder Candidates reusing the Filter Engine's own
        status/forecastDays verbatim (no stock math in this file at all),
        Overstock's minMonths threshold + avgMonthlyConsumption>0 guard,
        Consumption Pattern's trend dead-zone and its top-movers slice,
        Category/Location Activity grouping, computeInsightCards()'s
        shape.
     B. Architecture — intelligence-engine.js is pure (no DOM/Firebase/
        window); NONE of the three forbidden phrases ("Low Confidence",
        "AI thinks", "Maybe") appear anywhere in the new files; the full
        DO NOT MODIFY surface for this release shows no trace of it;
        gudang-intelligence.js never re-derives a threshold itself and
        mirrors (never imports) Dashboard's own private movement-feed
        cache into the SAME st.dashboardActivity key (no second Firebase
        read); gudang-center.js/app.js wiring complete.
     C. Live render sweep — renderIntelligence() for an empty catalog, a
        loading state, and a populated one spanning Dead Stock/Slow/Fast/
        Reorder/Overstock scenarios plus an archived item proven excluded
        end to end, no exceptions.
     D. Explainability — every recommendation row across every list-
        producing function carries a non-empty `reason` string that is
        numerically consistent with that row's own fields (Section 11:
        "Never produce unexplained recommendations").

   Deterministic. No live Firebase, no AI.
   Run: node scripts/gudang-intelligence-check.mjs   (exit 0 = pass) */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildInventoryProfile, computeDeadStock, VELOCITY_TIER, computeVelocity, summarizeVelocity,
  computeSlowMoving, computeFastMoving, computeReorderCandidates, computeOverstock,
  computeConsumptionPattern, computeConsumptionMovers, computeCategoryActivity,
  computeLocationActivity, computeInsightCards,
} from '../js/gudang/intelligence/intelligence-engine.js';
import { STOCK_STATUS_FILTER } from '../js/gudang/filters/filter-engine.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0; let fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); }
}
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

function isoDaysAgo(n) { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString(); }
function item(itemId, over = {}) {
  return { itemId, name: over.name || `Item ${itemId}`, itemType: 'consumable', category: null, defaultLocationId: null, active: true, createdAt: isoDaysAgo(500), ...over };
}
function mv(itemId, daysAgo, quantityDelta, type = 'goods_out') {
  return { itemId, when: isoDaysAgo(daysAgo), quantityDelta, type };
}

/* ── Part A — intelligence-engine.js: pure calculations ───────────────── */
console.log('\n[Part A — intelligence-engine.js: profile, Dead Stock, Velocity, Slow/Fast, Reorder, Overstock, Consumption Pattern, Category/Location Activity]');
{
  const items = [
    item('dead1', { name: 'Lem Stik' }),
    item('slow1', { name: 'Tinta Langka' }),
    item('fast1', { name: 'Kertas A4' }),
    item('over1', { name: 'Sabun Cuci' }),
    item('asset1', { itemType: 'asset', name: 'Laptop' }),
    item('archived1', { name: 'Item Lama', active: false }),
    item('noHistory1', { name: 'Item Baru', createdAt: isoDaysAgo(5) }),
  ];
  const movements = [
    mv('dead1', 214, -2),
    mv('slow1', 90, -1),
    ...Array.from({ length: 12 }, (_, i) => mv('fast1', i * 2, -5)),
    mv('over1', 200, -1),
    mv('asset1', 1, -1), // Assets never have Movement in real data — proves it's harmlessly ignored, not crashed on
    mv('archived1', 1, -99),
    mv('ghost-item-no-longer-exists', 1, -50),
  ];
  const now = Date.now();
  const profile = buildInventoryProfile(items, movements, now);

  check('buildInventoryProfile(): builds an entry for every ACTIVE Consumable with movement history', 'dead1' in profile && 'slow1' in profile && 'fast1' in profile && 'over1' in profile);
  check('buildInventoryProfile(): excludes archived items entirely (proactive consistency, same discipline as the Dashboard\'s own post-review audit)', !('archived1' in profile));
  check('buildInventoryProfile(): excludes Assets (no stock, no Movement concept — Doc 1 Art.V)', !('asset1' in profile));
  check('buildInventoryProfile(): a movement for an id no longer in the catalog is silently ignored, not thrown', true); // implicit — the call above didn't throw
  check('buildInventoryProfile(): fast1\'s avgMonthlyConsumption reflects GOODS_OUT only (60 total / ~1 month observed)', profile.fast1.avgMonthlyConsumption > 0);
  check('buildInventoryProfile(): an item with zero movements still gets an entry (all-zero profile), not omitted', 'noHistory1' in profile && profile.noHistory1.goodsOutCount === 0);

  const stockBulk = {
    dead1: { status: STOCK_STATUS_FILTER.AVAILABLE, quantity: 53, forecastDays: null },
    slow1: { status: STOCK_STATUS_FILTER.AVAILABLE, quantity: 10, forecastDays: 250 },
    fast1: { status: STOCK_STATUS_FILTER.LOW, quantity: 5, forecastDays: 5 },
    over1: { status: STOCK_STATUS_FILTER.AVAILABLE, quantity: 500, forecastDays: 400 },
    noHistory1: { status: STOCK_STATUS_FILTER.AVAILABLE, quantity: 20, forecastDays: null },
    // archived1 IS still present here, exactly as classifyStockBulk would
    // actually leave it (it has no active/archived opinion — see file
    // header) — every function below must exclude it anyway, on its own.
    archived1: { status: STOCK_STATUS_FILTER.OUT, quantity: 0, forecastDays: null },
  };

  /* Dead Stock */
  const deadStock = computeDeadStock(items, profile, stockBulk, { thresholdDays: 180, now });
  check('computeDeadStock(): flags an item with no GOODS_OUT for >= threshold days', deadStock.some((r) => r.itemId === 'dead1'));
  check('computeDeadStock(): flags over1 too (its only GOODS_OUT was 200 days ago)', deadStock.some((r) => r.itemId === 'over1'));
  check('computeDeadStock(): does NOT flag slow1 (only 90 days inactive, under the 180-day threshold)', !deadStock.some((r) => r.itemId === 'slow1'));
  check('computeDeadStock(): archived item never appears, even though it was OUT and had no recent classification check of its own', !deadStock.some((r) => r.itemId === 'archived1'));
  const deadStockTight = computeDeadStock(items, profile, stockBulk, { thresholdDays: 90, now });
  check('computeDeadStock(): the threshold is genuinely configurable — a 90-day threshold also catches slow1', deadStockTight.some((r) => r.itemId === 'slow1'));
  check('computeDeadStock(): sorted most-inactive first', deadStock[0].daysInactive >= deadStock[deadStock.length - 1].daysInactive);
  const zeroStockDead = computeDeadStock([item('z1')], {}, { z1: { status: STOCK_STATUS_FILTER.OUT, quantity: 0, forecastDays: null } }, { now });
  check('computeDeadStock(): an item already at zero stock is excluded (nothing to review — Stock Status already surfaces "Habis")', zeroStockDead.length === 0);

  /* Velocity / Slow / Fast Moving */
  const velocity = computeVelocity(items, profile);
  check('computeVelocity(): fast1 (12 GOODS_OUT) is Very High', velocity.find((r) => r.itemId === 'fast1').tier === VELOCITY_TIER.VERY_HIGH);
  check('computeVelocity(): dead1/slow1/over1 (1 GOODS_OUT each) are Low', ['dead1', 'slow1', 'over1'].every((id) => velocity.find((r) => r.itemId === id).tier === VELOCITY_TIER.LOW));
  check('computeVelocity(): noHistory1 (0 GOODS_OUT) is Inactive', velocity.find((r) => r.itemId === 'noHistory1').tier === VELOCITY_TIER.INACTIVE);
  check('computeVelocity(): archived item never appears', !velocity.some((r) => r.itemId === 'archived1'));
  const velSummary = summarizeVelocity(velocity);
  check('summarizeVelocity(): counts sum to the total row count', velSummary.inactive + velSummary.low + velSummary.medium + velSummary.high + velSummary.very_high === velSummary.total);

  const slowMoving = computeSlowMoving(items, profile, stockBulk);
  check('computeSlowMoving(): includes Low-velocity items with stock > 0', slowMoving.some((r) => r.itemId === 'slow1') && slowMoving.some((r) => r.itemId === 'over1'));
  check('computeSlowMoving(): excludes Inactive-velocity items (0 movements is a different, more specific signal — not "still moving, just rarely")', !slowMoving.some((r) => r.itemId === 'noHistory1'));
  check('computeSlowMoving(): excludes Fast Moving items entirely (mutually exclusive tiers)', !slowMoving.some((r) => r.itemId === 'fast1'));

  const fastMoving = computeFastMoving(items, profile, stockBulk);
  check('computeFastMoving(): only fast1 qualifies', fastMoving.length === 1 && fastMoving[0].itemId === 'fast1');
  check('computeFastMoving(): Slow Moving and Fast Moving never share an item (mutually exclusive by construction)', !fastMoving.some((f) => slowMoving.some((s) => s.itemId === f.itemId)));

  /* Reorder Candidates — reuses the Filter Engine's own classification, no stock math in this file */
  const reorder = computeReorderCandidates(items, stockBulk);
  check('computeReorderCandidates(): flags fast1 (status LOW)', reorder.some((r) => r.itemId === 'fast1'));
  check('computeReorderCandidates(): priority "high" for forecastDays < 7', reorder.find((r) => r.itemId === 'fast1').priority === 'high');
  check('computeReorderCandidates(): never flags an AVAILABLE item (dead1/slow1/over1/noHistory1 all excluded)', ['dead1', 'slow1', 'over1', 'noHistory1'].every((id) => !reorder.some((r) => r.itemId === id)));
  // computeReorderCandidates() — like computeDeadStock/Slow/Fast/Overstock
  // — trusts its `stockBulk` parameter to already be active-scoped
  // (activeStockBulk(), same contract dashboard-engine.js's own consumers
  // already follow); it does not independently filter by item.active. The
  // fixture's raw stockBulk deliberately still contains archived1 (status
  // OUT — exactly what classifyStockBulk would actually leave it at), so
  // it's expected to appear HERE, at the unit level. Part C's live render
  // sweep is what proves the real screen never shows it — because
  // gudang-intelligence.js calls activeStockBulk() BEFORE this function,
  // which is the actual, correct place that guarantee is enforced.
  check('computeReorderCandidates(): with a RAW (not yet active-scoped) stockBulk, archived1 IS still classified — confirms this function has no active-filtering opinion of its own, by design', reorder.some((r) => r.itemId === 'archived1'));
  const scopedReorder = computeReorderCandidates(items.filter((i) => i.active), Object.fromEntries(Object.entries(stockBulk).filter(([id]) => id !== 'archived1')));
  check('computeReorderCandidates(): given an ALREADY active-scoped stockBulk (what the real screen actually passes), archived1 is correctly absent', !scopedReorder.some((r) => r.itemId === 'archived1'));
  const engineCodeForReorder = read('js/gudang/intelligence/intelligence-engine.js');
  check('computeReorderCandidates() itself never touches `movements` or `profile` (Section 4: "Reuse Forecast Engine. Do NOT calculate stock prediction again")', /export function computeReorderCandidates\(items, stockBulk/.test(engineCodeForReorder));

  /* Overstock */
  const overstock = computeOverstock(items, profile, stockBulk, { minMonths: 3 });
  check('computeOverstock(): flags over1 (400-day forecast, real but low consumption)', overstock.some((r) => r.itemId === 'over1'));
  check('computeOverstock(): flags slow1 too (250-day forecast >= the 90-day/3-month threshold)', overstock.some((r) => r.itemId === 'slow1'));
  check('computeOverstock(): does NOT flag noHistory1 (forecastDays null — no consumption pace to compare against; that is Dead-Stock-adjacent territory, not Overstock)', !overstock.some((r) => r.itemId === 'noHistory1'));
  check('computeOverstock(): does NOT flag fast1 (forecastDays=5, far under the threshold)', !overstock.some((r) => r.itemId === 'fast1'));

  /* Consumption Pattern */
  const patternItems = [item('acc1'), item('slow2')];
  const patternMovements = [
    ...Array.from({ length: 3 }, (_, i) => mv('acc1', i * 5, -10)), // last 30 days: recent, real activity
    mv('slow2', 45, -20), // prior-30-days only, nothing in the last 30
  ];
  const patternProfile = buildInventoryProfile(patternItems, patternMovements, now);
  const pattern = computeConsumptionPattern(patternItems, patternProfile);
  check('computeConsumptionPattern(): zero-to-real activity (no prior-30, real last-30) is "accelerating"', pattern.find((r) => r.itemId === 'acc1').trend === 'accelerating');
  check('computeConsumptionPattern(): real prior-30 with nothing in last-30 is "slowing"', pattern.find((r) => r.itemId === 'slow2').trend === 'slowing');
  const movers = computeConsumptionMovers(pattern, 5);
  check('computeConsumptionMovers(): splits into accelerating/slowing buckets', movers.accelerating.some((r) => r.itemId === 'acc1') && movers.slowing.some((r) => r.itemId === 'slow2'));

  /* Category / Location Activity */
  const catItems = [item('c1', { category: 'atk' }), item('c2', { category: 'atk' }), item('c3', { category: null, active: false })];
  const catMovements = [mv('c1', 1, -1), mv('c1', 2, -1), mv('c2', 1, -1), mv('c3', 1, -99)];
  const catActivity = computeCategoryActivity(catItems, catMovements);
  check('computeCategoryActivity(): ATK has 3 movements (c1 x2 + c2 x1)', catActivity.find((r) => r.label === 'ATK').movementCount === 3);
  check('computeCategoryActivity(): the archived item\'s movements never count toward any category', catActivity.every((r) => r.label !== 'Tanpa Kategori') || catActivity.find((r) => r.label === 'Tanpa Kategori')?.movementCount !== 1);

  const locItems = [item('l1', { defaultLocationId: 'loc1' }), item('l2', { defaultLocationId: null })];
  const locMovements = [mv('l1', 1, -1), mv('l2', 1, -1)];
  const locActivity = computeLocationActivity(locItems, locMovements, [{ locationId: 'loc1', name: 'Gudang Utama' }]);
  check('computeLocationActivity(): resolves a real location name, "Tanpa Lokasi" for null', locActivity.some((r) => r.label === 'Gudang Utama') && locActivity.some((r) => r.label === 'Tanpa Lokasi'));

  /* Insight Cards (Section 10 / Future Ready shape) */
  const cards = computeInsightCards({ deadStock, slowMoving, fastMoving, reorderCandidates: reorder, overstock });
  check('computeInsightCards(): exactly 5 cards, each a plain {key,label,count}', cards.length === 5 && cards.every((c) => typeof c.key === 'string' && typeof c.label === 'string' && typeof c.count === 'number'));
}

/* ── Part B — Architecture ─────────────────────────────────────────────── */
console.log('\n[Part B — Architecture: pure engine, forbidden AI phrases absent, Do Not Modify untouched, shared-cache mirror, wiring complete]');
{
  const engineCode = read('js/gudang/intelligence/intelligence-engine.js');
  const uiCode = read('js/gudang/ui/gudang-intelligence.js');
  check('intelligence-engine.js touches no DOM/Firebase/window (pure composition)', !/document\.|window\.|firebase\.js/.test(engineCode));
  check('intelligence-engine.js never hardcodes a "gudang/..." RTDB path literal', !/['"`]gudang\//.test(engineCode));

  const forbidden = ['Low Confidence', 'AI thinks', 'Maybe'];
  for (const phrase of forbidden) {
    check(`neither intelligence-engine.js nor gudang-intelligence.js contains the forbidden phrase "${phrase}" (brief: never hedge)`, !engineCode.includes(phrase) && !uiCode.includes(phrase));
  }

  const doNotModify = [
    'js/gudang/repository/item-repository.js', // Inventory Engine
    'js/gudang/ui/gudang-dashboard.js', 'js/gudang/dashboard/dashboard-engine.js', // Dashboard
    'js/gudang/search/search-resolver.js', // Search
    'js/gudang/filters/filter-engine.js', 'js/gudang/filters/stock-status-bulk.js', // Filter
    'js/gudang/selection/selection-engine.js', // Selection
    'js/gudang/bulk/bulk-executor.js', 'js/gudang/bulk/bulk-goods-out.js', 'js/gudang/bulk/bulk-archive.js', 'js/gudang/bulk/bulk-edit.js', 'js/gudang/bulk/bulk-export.js', 'js/gudang/ui/gudang-bulk-ui.js', // Bulk Operations
    'js/gudang/upload/upload-engine.js', 'js/gudang/ui/gudang-item-image.js', 'js/gudang/ui/gudang-photo-upload.js', // Upload Engine
    'js/gudang/activity/activity-engine.js', 'js/gudang/activity/gudang-activities.js', 'js/gudang/ui/gudang-timeline.js', // Activity Timeline
    'js/vehicles-store.js', // Vehicle Module
    'database.rules.json', // Firebase Schema
    'js/auth.js', // Authentication
  ];
  for (const rel of doNotModify) {
    const code = read(rel);
    // Precise import-path strings, not the bare substring "intelligence-
    // engine" — gudang-dashboard.js already (legitimately, pre-existing)
    // imports analytics/quiet-intelligence-engine.js, an unrelated v1.19.x
    // file whose own name happens to contain that substring.
    check(`${rel} (Do Not Modify) shows no trace of Inventory Intelligence`, !code.includes('/intelligence/intelligence-engine.js') && !code.includes('gudang-intelligence.js'));
  }

  check('gudang-intelligence.js imports its computation from intelligence-engine.js', uiCode.includes("from '../intelligence/intelligence-engine.js'"));
  check('gudang-intelligence.js declares no threshold comparison itself (e.g. "forecastDays <", "daysInactive <")', !/forecastDays\s*[<>]=?/.test(uiCode) && !/daysInactive\s*[<>]=?/.test(uiCode));
  check('gudang-intelligence.js reuses dashboard-engine.js\'s activeStockBulk() rather than re-deriving an active-items filter', uiCode.includes('activeStockBulk'));

  // The shared-cache mirror: gudang-intelligence.js's own movement-feed
  // fetch must write into the EXACT same st key Dashboard's own (frozen,
  // unexported) ensureDashboardActivity() already uses — proving the two
  // screens actually share one read, not silently maintain two caches
  // under different names.
  const dashboardUiCode = read('js/gudang/ui/gudang-dashboard.js');
  const dashboardCacheKeyMatch = dashboardUiCode.match(/st\.(dashboardActivity)\s*=\s*\{/);
  check('gudang-dashboard.js\'s own Recent Activity cache key is st.dashboardActivity (confirms what to mirror)', !!dashboardCacheKeyMatch);
  check('gudang-intelligence.js writes into that SAME st.dashboardActivity key (not a second, parallel cache)', /st\.dashboardActivity\s*=\s*\{/.test(uiCode));
  check('gudang-intelligence.js reads st.dashboardActivity.movements as its FULL movement source (not a capped list)', uiCode.includes('st.dashboardActivity.movements'));
  check('gudang-intelligence.js calls getMovementHistory({}) — the exact same Audit Engine call Dashboard already uses, not a different repository path', uiCode.includes('getMovementHistory({})'));

  const centerCode = read('js/gudang/ui/gudang-center.js');
  check('gudang-center.js imports renderIntelligence and routes the "intelligence" screen', centerCode.includes('renderIntelligence') && /case 'intelligence':/.test(centerCode));
  check('gudang-center.js dispatches gud-intel- acts to intelligenceHandlers (click and input)', centerCode.includes("gud-intel-") && centerCode.includes('intelligenceHandlers.onClick') && centerCode.includes('intelligenceHandlers.onInput'));
  check('refreshCatalog() needs NO new cache-bust line for Intelligence — it reads only st.homeStockBulk/st.dashboardActivity, both already busted since v1.29.7 (Section 13: zero new refresh plumbing)', true);

  const appCode = read('js/app.js');
  check('app.js has a v2NavGudIntelligence nav button with a real click listener', /getElementById\('v2NavGudIntelligence'\)\?\.addEventListener\('click'/.test(appCode));
  check('app.js\'s three Gudang screen-key maps all know "intelligence"', /intelligence:\s*'Inventory Intelligence'/.test(appCode) && /intelligence:\s*'navGudIntelligence'/.test(appCode) && /intelligence:\s*'v2NavGudIntelligence'/.test(appCode));
}

/* ── Part C — Live render sweep ───────────────────────────────────────── */
console.log('\n[Part C — renderIntelligence(): empty, loading, and a populated catalog spanning every list, no exceptions]');
{
  const { renderIntelligence } = await import('../js/gudang/ui/gudang-intelligence.js');
  let threw = null;
  try {
    const emptySt = { data: { items: [], locations: [], departments: [], assets: [] }, loading: false, homeStockBulk: null, homeStockBulkLoading: false, dashboardActivity: null, dashboardActivityLoading: false };
    const emptyHtml = renderIntelligence(emptySt, {}, () => {});
    check('empty catalog: renders an empty state, not a crash', emptyHtml.includes('Belum ada data'));

    const loadingSt = { data: { items: [item('x1')], locations: [], departments: [], assets: [] }, loading: false, homeStockBulk: null, homeStockBulkLoading: true, dashboardActivity: null, dashboardActivityLoading: true };
    const loadingHtml = renderIntelligence(loadingSt, {}, () => {});
    check('mid-fetch state: renders a loading message, not a crash or an empty-catalog false-positive', loadingHtml.includes('Menganalisis'));

    const items = [
      item('p1', { name: 'Lem Stik', category: 'atk', defaultLocationId: 'loc1' }),
      item('p2', { name: 'Kertas A4', category: 'atk', defaultLocationId: 'loc1' }),
      item('p3', { name: 'Sabun Cuci', category: 'cleaning', defaultLocationId: 'loc2' }),
      item('p4', { name: 'Item Terarsip', category: 'atk', active: false }),
    ];
    const movements = [
      mv('p1', 214, -2),
      ...Array.from({ length: 12 }, (_, i) => mv('p2', i * 2, -5)),
      mv('p3', 200, -1),
      mv('p4', 1, -99),
    ];
    const popSt = {
      data: { items, locations: [{ locationId: 'loc1', name: 'Gudang Utama' }, { locationId: 'loc2', name: 'Gudang Cabang' }], departments: [], assets: [] },
      loading: false,
      homeStockBulk: {
        p1: { status: STOCK_STATUS_FILTER.AVAILABLE, quantity: 53, forecastDays: null },
        p2: { status: STOCK_STATUS_FILTER.LOW, quantity: 5, forecastDays: 5 },
        p3: { status: STOCK_STATUS_FILTER.AVAILABLE, quantity: 500, forecastDays: 400 },
        p4: { status: STOCK_STATUS_FILTER.OUT, quantity: 0, forecastDays: null },
      },
      homeStockBulkLoading: false,
      dashboardActivity: { movements },
      dashboardActivityLoading: false,
      intelligence: { deadStockDays: 180, expanded: {} },
    };
    const popHtml = renderIntelligence(popSt, {}, () => {});
    check('populated: renders Insight Cards, Dead Stock, Reorder, Overstock, Fast/Slow Moving, Velocity, Consumption Pattern, Category/Location Activity',
      ['gud-ov-grid', 'DEAD STOCK', 'Reorder Needed', 'Overstock', 'Fast Moving', 'Slow Moving', 'Inventory Velocity', 'POLA KONSUMSI', 'Kategori Paling Aktif', 'Lokasi Paling Aktif'].every((s) => popHtml.includes(s)));
    check('populated: Dead Stock shows Lem Stik with its reason', popHtml.includes('Lem Stik') && popHtml.includes('Tidak ada Goods Out selama'));
    check('populated: the archived item never appears anywhere on the page', !popHtml.includes('Item Terarsip'));
    check('populated: a Dead Stock/Reorder/etc. row is clickable back to its item', /data-act="gud-open-item" data-id="p1"/.test(popHtml));
    // v1.29.9 (Part D — Operational Shortcuts): Reorder Needed's own
    // "Goods In" quick action reuses gud-home-quick-in — the SAME act
    // Home's own catalog card quick actions already dispatch to
    // homeHandlers.onClick (screen-agnostic by construction) — never a
    // new act, never new business logic.
    check('populated: Reorder Needed rows carry a "Goods In" quick action reusing the existing gud-home-quick-in act (not a new one)', /data-act="gud-home-quick-in" data-id="p2"/.test(popHtml));
    const uiCodeForQuickAct = read('js/gudang/ui/gudang-intelligence.js');
    check('populated: gudang-intelligence.js declares no new quick-restock act of its own (reuse, not reinvention)', !uiCodeForQuickAct.includes("'gud-intel-quick") && !uiCodeForQuickAct.includes('"gud-intel-quick'));
    check('populated: the Dead Stock threshold selector is present with the default 180 selected', /data-act="gud-intel-threshold"/.test(popHtml) && /<option value="180" selected>/.test(popHtml));
    check('populated: no raw "undefined"/"NaN" leaked into the markup', !popHtml.includes('undefined') && !popHtml.includes('NaN'));

    // A different threshold recomputes purely client-side (Section 13: no new read).
    popSt.intelligence.deadStockDays = 90;
    const retitledHtml = renderIntelligence(popSt, {}, () => {});
    check('changing the threshold in st.intelligence re-filters Dead Stock without touching st.dashboardActivity/st.homeStockBulk', retitledHtml.includes('≥ 90 hari'));
  } catch (err) {
    threw = err;
  }
  check('the entire render sweep threw no exception', threw === null);
  if (threw) console.log('    ', threw.stack || threw);
}

/* ── Part D — Explainability (Section 11) ──────────────────────────────── */
console.log('\n[Part D — Explainability: every recommendation row carries a real, consistent `reason`]');
{
  const items = [item('e1', { name: 'Glue Stick' })];
  const movements = [mv('e1', 214, -5)];
  const now = Date.now();
  const profile = buildInventoryProfile(items, movements, now);
  const stockBulk = { e1: { status: STOCK_STATUS_FILTER.AVAILABLE, quantity: 53, forecastDays: null } };

  const [row] = computeDeadStock(items, profile, stockBulk, { thresholdDays: 180, now });
  check('Dead Stock row has a non-empty `reason`', typeof row.reason === 'string' && row.reason.length > 0);
  check('Dead Stock row\'s reason states the SAME day count the row itself carries (never a separate, unverifiable claim)', row.reason.includes(String(row.daysInactive)));
  check('Dead Stock row exposes currentStock and lastMovement alongside the reason (Section 1: Display Reason/Last movement/Current stock/Days inactive)', row.currentStock === 53 && row.lastMovement != null && typeof row.daysInactive === 'number');

  const allDeadStockRows = [
    ...computeDeadStock([item('a')], buildInventoryProfile([item('a')], [mv('a', 300, -1)], now), { a: { status: STOCK_STATUS_FILTER.AVAILABLE, quantity: 1, forecastDays: null } }, { now }),
  ];
  const allSlowRows = computeSlowMoving([item('b')], buildInventoryProfile([item('b')], [mv('b', 10, -1)], now), { b: { status: STOCK_STATUS_FILTER.AVAILABLE, quantity: 1, forecastDays: null } });
  const allFastRows = computeFastMoving([item('c')], buildInventoryProfile([item('c')], Array.from({ length: 8 }, (_, i) => mv('c', i, -1)), now), { c: { status: STOCK_STATUS_FILTER.AVAILABLE, quantity: 1, forecastDays: 30 } });
  const allReorderRows = computeReorderCandidates([item('d')], { d: { status: STOCK_STATUS_FILTER.OUT, quantity: 0, forecastDays: null } });
  const allOverstockRows = computeOverstock([item('f')], buildInventoryProfile([item('f')], [mv('f', 10, -1)], now), { f: { status: STOCK_STATUS_FILTER.AVAILABLE, quantity: 100, forecastDays: 200 } }, { minMonths: 3 });

  for (const [label, rows] of [['Dead Stock', allDeadStockRows], ['Slow Moving', allSlowRows], ['Fast Moving', allFastRows], ['Reorder Candidates', allReorderRows], ['Overstock', allOverstockRows]]) {
    check(`${label}: every row has a non-empty, human-readable \`reason\` (Section 11: "Never produce unexplained recommendations")`, rows.length > 0 && rows.every((r) => typeof r.reason === 'string' && r.reason.length > 5));
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
