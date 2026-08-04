/* ============================================================
   GUDANG-HOME.JS — Home screen (Doc 2 §04)

   Phase 10.2 (Catalog Experience Redesign) — UAT: "it still feels like an
   administration system instead of a warehouse operating system... the
   first feeling should be 'I'm looking at my warehouse,' not 'I'm looking
   at software.'" Home is no longer Search + 3 big dashboard cards + Low
   Stock list + Recent Activity list. It is now:

     Search (hero, the shared topbar field, unchanged mechanism)
       -> Filter chips (All/Consumable/Asset/Low Stock + Location/Category)
       -> Catalog grid (dense product-style cards, Doc 1 Art.VII's Quiet
          Intelligence now lives PER CARD, not as a separate dashboard list)
       -> Floating actions (Goods Out/In/Add Item — demoted from primary
          equal-weight tiles to small, secondary, always-reachable buttons)

   "Recent Activity" is dropped from Home entirely — Movement History is
   already its dedicated, better home (Doc 2 §09) and duplicating it here
   was the dashboard-y redundancy UAT flagged. "Low Stock" survives as a
   FILTER over the same catalog, not a separate list.

   PERFORMANCE (Doc 1 Art.IX): Current Stock + Quiet Intelligence per card
   need one Stock read + one Forecast computation per CONSUMABLE item
   (analytics-engine.js has no bulk variant — see that file's own
   getLowStockAlerts() header, which already accepts and documents this
   exact per-item cost, capped at a limit, as the existing tradeoff this
   file now extends rather than invents). Bounded here the same way: only
   the current page's items get their figures computed; a "muat lebih
   banyak" button reveals more of the already-loaded catalog (no new
   query — st.data.items is already fully loaded) rather than computing
   every item's figures unconditionally on a large catalog.

   UI never computes analytics/stock itself: every figure comes from
   stock-repository.js#getProjection / analytics-engine.js#getForecastDaysRemaining
   / getLowStockAlerts, all already built and tested. Asset units come
   straight from already-loaded st.data.assets (a raw count, not a
   computed insight) — no engine call needed for that half.
   ============================================================ */

'use strict';

import { esc, icon, emptyState, kbdRow, fmtQty } from './gudang-atoms.js';
import { ITEM_TYPE } from '../contracts/item-contract.js';
import { categoryLabel } from '../config/gudang-categories.js';
import { getProjection } from '../repository/stock-repository.js';
import { getForecastDaysRemaining } from '../analytics/analytics-engine.js';
import { forecastSentence } from '../analytics/quiet-intelligence-engine.js';
import { itemHasPhoto, loadItemPhotoUrl } from './gudang-item-image.js';
// v1.29.1 (Warehouse Smart Filtering, Phase 2): filter STATE/predicate/chip
// logic lives in filter-engine.js (pure, reusable by future phases per that
// file's own header) — Home only renders controls and calls into it. Stock
// Status / Forecast classification is a bulk read (stock-status-bulk.js),
// replacing analytics-engine.js#getLowStockAlerts' capped per-item scan for
// filtering purposes; that function itself is untouched and still used
// elsewhere.
import {
  createFilterState, isFilterActive, clearAllFilters, filterItems,
  activeFilterChips, clearFilterKey, STOCK_STATUS_FILTER, FORECAST_FILTER,
} from '../filters/filter-engine.js';
import { classifyStockBulk } from '../filters/stock-status-bulk.js';

const PAGE_SIZE = 48;
const ASSET_STATUS_LABEL = { available: 'tersedia', assigned: 'ditugaskan', maintenance: 'maintenance', retired: 'pensiun' };

function ensureFilter(st) {
  if (!st.homeFilter) st.homeFilter = { ...createFilterState(), page: PAGE_SIZE };
  return st.homeFilter;
}

/** One Stock + one Forecast read per Consumable item, only for the page
 *  actually being rendered — see file header on why this is bounded. */
function ensureCardData(st, itemIds, requestRender) {
  if (!st.homeCardData) st.homeCardData = {};
  const need = itemIds.filter((id) => !(id in st.homeCardData));
  if (!need.length) return;
  need.forEach((id) => { st.homeCardData[id] = { loading: true }; });
  Promise.all(need.map((id) => Promise.all([getProjection(id), getForecastDaysRemaining(id)]))).then((results) => {
    results.forEach(([stockRes, forecastRes], i) => {
      st.homeCardData[need[i]] = {
        loading: false,
        stock: stockRes.ok ? stockRes.data.quantity : null,
        forecast: forecastRes.ok ? forecastRes.data : null,
      };
    });
    requestRender();
  });
}

/** One Storage download per item that actually HAS a photo, only for the
 *  page being rendered (Phase 10.3) — same bounded-per-page discipline as
 *  ensureCardData above, not a new pattern. Items with no
 *  metadata.imageStoragePath never touch Storage at all; they always
 *  render the placeholder. */
function ensureCardImages(st, items, requestRender) {
  if (!st.homeImageCache) st.homeImageCache = {};
  const need = items.filter((i) => itemHasPhoto(i) && !(i.itemId in st.homeImageCache));
  if (!need.length) return;
  need.forEach((i) => { st.homeImageCache[i.itemId] = { loading: true }; });
  Promise.all(need.map((i) => loadItemPhotoUrl(i.metadata.imageStoragePath, i.metadata.imageContentType))).then((results) => {
    results.forEach((res, idx) => {
      st.homeImageCache[need[idx].itemId] = { loading: false, url: res.ok ? res.url : null };
    });
    requestRender();
  });
}

/** Bulk stock+forecast classification (Feature 13: Performance — one pair
 *  of bulk reads, fetched at most once per session, never on every filter
 *  change), fetched lazily the first time Stock Status or Forecast is
 *  actually used — same "only when needed" discipline the old
 *  ensureLowStockSet had for the lowStock chip it replaces. */
function ensureStockBulk(st, requestRender) {
  if (st.homeStockBulk || st.homeStockBulkLoading) return;
  st.homeStockBulkLoading = true;
  classifyStockBulk(st.data.items).then((res) => {
    st.homeStockBulk = res.ok ? res.data : {};
    st.homeStockBulkLoading = false;
    requestRender();
  });
}

export function renderHome(st, c, requestRender) {
  const f = ensureFilter(st);
  const hasCatalog = st.data.items.length > 0;
  if (f.stockStatus !== STOCK_STATUS_FILTER.ALL || f.forecast !== FORECAST_FILTER.ALL) ensureStockBulk(st, requestRender);

  return `
    <div class="gud-home">
      <button type="button" class="gud-home-search" data-act="gud-search-open">
        ${icon('search', { size: 20, tone: 'text-faint' })}
        <span class="gud-home-search-ph">Cari item, lokasi, aset…</span>
        <span class="gud-home-search-kbd">${kbdRow(['Ctrl', 'K'])}</span>
      </button>

      ${hasCatalog ? renderFilterBar(st, f) : ''}
      ${hasCatalog ? renderMobileFilterTrigger(st, f) : ''}
      ${hasCatalog ? renderFilterSummary(st, f) : ''}

      ${!hasCatalog && !st.loading
        ? emptyState({
            iconName: 'box', title: 'Gudang siap digunakan',
            hint: 'Tambahkan item pertama untuk mulai membangun katalog.',
            ctaLabel: 'Tambah Item', ctaAct: 'gud-cat-add-item-home',
          })
        : renderCatalogSection(st, f, requestRender)}
    </div>
    <div class="gud-fab-row">
      <button type="button" class="gud-fab" data-act="gud-quick-goods-out" aria-label="Goods Out" title="Goods Out">${icon('arrow-out', { size: 18 })}</button>
      <button type="button" class="gud-fab" data-act="gud-quick-goods-in" aria-label="Goods In" title="Goods In">${icon('arrow-in', { size: 18 })}</button>
      <button type="button" class="gud-fab -primary" data-act="gud-cat-add-item-home" aria-label="Tambah Item" title="Tambah Item">${icon('plus', { size: 20 })}</button>
    </div>`;
}

/** The controls themselves — Type/Location/Category/Stock Status/Forecast —
 *  with NO surrounding chrome. "Shared body, different chrome" (the same
 *  pattern v1.29.0 established for the search dropdown vs. its mobile
 *  sheet): renderFilterBar wraps this for desktop/tablet, renderMobileFilterSheet
 *  wraps the identical markup for the mobile bottom sheet — one definition
 *  of what a filter control looks like and does, two presentations. */
function renderFilterPanelBody(st, f) {
  const categories = uniqueSorted(st.data.items.map((i) => i.category).filter(Boolean).map((cat) => categoryLabel(cat)));
  return `
    <div class="gud-chips">
      <button type="button" class="gud-chip" data-on="${f.type === 'all'}" data-act="gud-home-type" data-val="all">Semua</button>
      <button type="button" class="gud-chip" data-on="${f.type === 'consumable'}" data-act="gud-home-type" data-val="consumable">Consumable</button>
      <button type="button" class="gud-chip" data-on="${f.type === 'asset'}" data-act="gud-home-type" data-val="asset">Asset</button>
    </div>
    <div class="gud-chips">
      <select class="gud-chip-select" data-act="gud-home-location">
        <option value="">Semua Lokasi</option>
        ${st.data.locations.map((l) => `<option value="${esc(l.locationId)}" ${f.locationId === l.locationId ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}
      </select>
      <select class="gud-chip-select" data-act="gud-home-category">
        <option value="">Semua Kategori</option>
        ${categories.map((cat) => `<option value="${esc(cat)}" ${f.category === cat ? 'selected' : ''}>${esc(cat)}</option>`).join('')}
      </select>
      <select class="gud-chip-select" data-act="gud-home-stockstatus" aria-label="Filter Status Stok">
        <option value="all" ${f.stockStatus === 'all' ? 'selected' : ''}>Semua Stok</option>
        <option value="low" ${f.stockStatus === 'low' ? 'selected' : ''}>Stok Rendah</option>
        <option value="out" ${f.stockStatus === 'out' ? 'selected' : ''}>Stok Habis</option>
        <option value="available" ${f.stockStatus === 'available' ? 'selected' : ''}>Stok Tersedia</option>
      </select>
      <select class="gud-chip-select" data-act="gud-home-forecast" aria-label="Filter Forecast">
        <option value="all" ${f.forecast === 'all' ? 'selected' : ''}>Semua Forecast</option>
        <option value="lt7" ${f.forecast === 'lt7' ? 'selected' : ''}>&lt; 7 Hari</option>
        <option value="lt30" ${f.forecast === 'lt30' ? 'selected' : ''}>&lt; 30 Hari</option>
        <option value="available" ${f.forecast === 'available' ? 'selected' : ''}>Forecast Aman</option>
        <option value="none" ${f.forecast === 'none' ? 'selected' : ''}>Tanpa Forecast</option>
      </select>
    </div>`;
}

/** Desktop/tablet presentation (Feature 11: "same capability, different
 *  presentation") — the controls stay inline, always visible, exactly as
 *  before Phase 2 just with two more selects. CSS-hidden below the mobile
 *  breakpoint (gudang.css), where renderMobileFilterTrigger + the sheet
 *  take over. */
function renderFilterBar(st, f) {
  return `<div class="gud-filterbar gud-mt">${renderFilterPanelBody(st, f)}</div>`;
}

/** Mobile presentation, part 1: a compact trigger (CSS-visible only below
 *  the same breakpoint that hides renderFilterBar) showing how many
 *  filters are active, opening the bottom sheet gudang-center.js owns
 *  (openMobileFilterSheet — mirrors openMobileSearchSheet's split: Home
 *  renders the entry point, gudang-center.js owns the overlay itself). */
function renderMobileFilterTrigger(st, f) {
  const activeCount = activeFilterChips(f, st.data.locations).length;
  return `<button type="button" class="gud-filter-trigger gud-mt" data-act="gud-filter-open">
    ${icon('filter', { size: 15 })} Filter${activeCount ? ` <span class="gud-filter-trigger-badge">${activeCount}</span>` : ''}
  </button>`;
}

/** Mobile presentation, part 2: the sheet body itself — same "shared body,
 *  different chrome" as renderFilterBar above, called from
 *  gudang-center.js's own render() (mirrors renderMobileSearchSheet's
 *  split across gudang-search-overlay.js / gudang-center.js exactly).
 *  Exported (not local like renderFilterBar) because gudang-center.js is
 *  the one that decides WHEN it's on screen (st.filterSheetOpen), the same
 *  ownership split the mobile search sheet already uses. */
export function renderMobileFilterSheet(st) {
  const f = ensureFilter(st);
  const total = st.data.items.filter((i) => i.active).length;
  const shown = filteredItems(st, f).length;
  return `<div class="gud-scrim -open gud-filter-sheet-scrim" data-act="gud-scrim">
    <div class="gud-filter-sheet" role="dialog" aria-modal="true" aria-label="Filter">
      <div class="gud-filter-sheet-head">
        <span class="gud-filter-sheet-title">Filter</span>
        <button type="button" class="gud-icon-btn" data-act="gud-filter-close" aria-label="Tutup" title="Tutup">${icon('close', { size: 16 })}</button>
      </div>
      <div class="gud-filter-sheet-body">${renderFilterPanelBody(st, f)}</div>
      <div class="gud-filter-sheet-foot">
        <button type="button" class="gud-btn" data-act="gud-home-clear-filters" ${isFilterActive(f) ? '' : 'disabled'}>Hapus Semua</button>
        <button type="button" class="gud-btn -primary" data-act="gud-filter-close">${fmtQty(shown)} dari ${fmtQty(total)} Item</button>
      </div>
    </div>
  </div>`;
}

/** Feature 2 (removable chips + Clear All) + Feature 9 (result count),
 *  combined into one summary row — active-filter chips are what's
 *  currently NARROWING the catalog, distinct from renderFilterBar's
 *  always-visible controls above. Nothing renders here at all when no
 *  filter is active (Instant Filtering, Feature 3 — no clutter when idle). */
function renderFilterSummary(st, f) {
  const total = st.data.items.filter((i) => i.active).length;
  const chips = activeFilterChips(f, st.data.locations);
  if (!chips.length) return `<div class="gud-filter-summary gud-mt gud-muted">${fmtQty(total)} Item</div>`;
  const shown = filteredItems(st, f).length;
  return `<div class="gud-filter-summary gud-mt">
    <div class="gud-filter-count">${fmtQty(shown)} dari ${fmtQty(total)} Item</div>
    <div class="gud-filter-chips-active">
      ${chips.map((chip) => `<span class="gud-chip-active">${esc(chip.label)}<button type="button" class="gud-chip-remove" data-act="gud-home-chip-remove" data-key="${esc(chip.key)}" aria-label="Hapus filter ${esc(chip.label)}">${icon('close', { size: 10 })}</button></span>`).join('')}
      <button type="button" class="gud-filter-clear-all" data-act="gud-home-clear-filters">Hapus Semua</button>
    </div>
  </div>`;
}

function uniqueSorted(arr) {
  return Array.from(new Set(arr)).sort((a, b) => a.localeCompare(b));
}

function filteredItems(st, f) {
  return filterItems(st.data.items, f, st.homeStockBulk || {});
}

function renderCatalogSection(st, f, requestRender) {
  // Phase 10.4.2 root cause ("Semua + Stok Rendah -> 0 items even though
  // qualifying items exist"), same class of bug this generalizes the fix
  // for: filterItems()'s Stock Status/Forecast predicate treats "bulk
  // classification hasn't loaded yet" (st.homeStockBulk undefined)
  // identically to "loaded, and this item just doesn't qualify" — both
  // filter every Consumable out. The first render after turning on Stock
  // Status/Forecast always hits the undefined case, since ensureStockBulk's
  // fetch is still in flight — "unknown" must never be shown as "empty".
  const needsStockBulk = f.stockStatus !== STOCK_STATUS_FILTER.ALL || f.forecast !== FORECAST_FILTER.ALL;
  if (needsStockBulk && !st.homeStockBulk) {
    return `<div class="gud-mt gud-muted">Memuat status stok…</div>`;
  }
  const all = filteredItems(st, f);
  if (!all.length) {
    // Feature 10 (Empty Filter State): a distinct message + Clear Filters
    // action when a FILTER is why nothing matches, vs. the generic
    // no-catalog-at-all state — Doc 2 §14: every empty state points to a
    // next operational action, and "add a new item" is the wrong one when
    // the catalog already has items that just don't match right now.
    if (isFilterActive(f)) {
      return `<div class="gud-mt">${emptyState({
        iconName: 'search', title: 'Tidak ada item yang cocok dengan filter',
        hint: 'Coba ubah atau hapus salah satu filter yang aktif.',
        ctaLabel: 'Hapus Semua Filter', ctaAct: 'gud-home-clear-filters', ctaIcon: 'close',
      })}</div>`;
    }
    return `<div class="gud-mt">${emptyState({
      iconName: 'search', title: 'Tidak ada yang cocok',
      hint: 'Coba filter lain, atau langsung tambahkan sebagai item baru.',
      ctaLabel: 'Tambah Item', ctaAct: 'gud-cat-add-item-home',
    })}</div>`;
  }
  const page = all.slice(0, f.page);
  const consumableIdsOnPage = page.filter((i) => i.itemType === ITEM_TYPE.CONSUMABLE).map((i) => i.itemId);
  ensureCardData(st, consumableIdsOnPage, requestRender);
  ensureCardImages(st, page, requestRender);

  const remaining = all.length - page.length;
  return `
    <div class="gud-catalog-grid gud-mt">${page.map((item) => catalogCard(item, st)).join('')}</div>
    ${remaining > 0 ? `<div class="gud-catalog-more"><button type="button" class="gud-btn" data-act="gud-home-load-more">Muat ${Math.min(PAGE_SIZE, remaining)} Item Lagi (${remaining} tersisa)</button></div>` : ''}`;
}

function catalogCard(item, st) {
  const loc = item.defaultLocationId ? st.data.locations.find((l) => l.locationId === item.defaultLocationId) : null;
  const catLabel = item.category ? categoryLabel(item.category) : '';
  const isAsset = item.itemType === ITEM_TYPE.ASSET;

  let stockLine, qiLine;
  if (isAsset) {
    const units = st.data.assets.filter((a) => a.itemId === item.itemId);
    const available = units.filter((a) => a.status === 'available').length;
    stockLine = `${units.length} unit`;
    qiLine = units.length ? `${available} ${ASSET_STATUS_LABEL.available}` : '';
  } else {
    const d = st.homeCardData && st.homeCardData[item.itemId];
    stockLine = !d ? '' : d.loading ? '…' : (d.stock != null ? `${fmtQty(d.stock)} pcs` : '—');
    qiLine = d && !d.loading ? (forecastSentence(d.forecast) || '') : '';
  }

  // Phase 10.4.1 (Part 10): Location must always show, never silently
  // disappear when unset — every other meta segment is fine to omit, but
  // "where is it?" is one of a card's 4 required answers (Part 2).
  const metaLine = [catLabel, loc ? loc.name : '—'].filter(Boolean).map(esc).join(' · ');
  // Phase 10.4.2 root cause ("item appears inside Low Stock filter, but
  // card has no warning indicator"): the card render never read the same
  // membership signal the filter itself used. v1.29.1: that signal is now
  // st.homeStockBulk (stock-status-bulk.js's OUT+LOW classification,
  // consistent with Analytics' isRestockRecommended()) instead of the old
  // homeLowStockIds Set — reused as-is here, never recomputed.
  const bulk = st.homeStockBulk && st.homeStockBulk[item.itemId];
  const isLowStock = !isAsset && bulk && (bulk.status === STOCK_STATUS_FILTER.LOW || bulk.status === STOCK_STATUS_FILTER.OUT);
  return `<div class="gud-catalog-card" data-act="gud-open-item" data-id="${esc(item.itemId)}" role="button" tabindex="0" aria-label="${esc(item.name)}">
    ${catalogCardImage(item, st)}
    <div class="gud-catalog-card-name">${esc(item.name)}</div>
    <div class="gud-catalog-card-meta">${metaLine}</div>
    <div class="gud-catalog-card-stock">${esc(stockLine)} ${isLowStock ? `<span class="gud-pill" data-pill="warn">${icon('gauge', { size: 10 })} Stok Rendah</span>` : ''}</div>
    ${qiLine ? `<div class="gud-catalog-card-qi">${esc(qiLine)}</div>` : ''}
    <div class="gud-catalog-card-quick">
      <span class="gud-catalog-quick-btn" data-act="gud-home-quick-out" data-id="${esc(item.itemId)}" title="Goods Out">${icon('arrow-out', { size: 13 })}</span>
      <span class="gud-catalog-quick-btn" data-act="gud-home-quick-in" data-id="${esc(item.itemId)}" title="Goods In">${icon('arrow-in', { size: 13 })}</span>
      <span class="gud-catalog-quick-btn" data-act="gud-home-quick-opname" data-id="${esc(item.itemId)}" title="Stock Opname">${icon('clipboard', { size: 13 })}</span>
      <span class="gud-catalog-quick-btn" data-act="gud-open-item" data-id="${esc(item.itemId)}" title="Detail">${icon('chevron-right', { size: 13 })}</span>
    </div>
  </div>`;
}

/** Image occupies ~40-50% of the card's own height (Phase 10.3 spec) — an
 *  aspect-ratio box, not a fixed px height, so it scales with the grid's
 *  responsive column width instead of fighting it. Placeholder (never a
 *  broken-image icon): the existing `package` glyph, same family as every
 *  other Gudang icon — no new asset. */
function catalogCardImage(item, st) {
  const cached = st.homeImageCache && st.homeImageCache[item.itemId];
  if (itemHasPhoto(item) && cached && !cached.loading && cached.url) {
    return `<div class="gud-catalog-card-img"><img src="${esc(cached.url)}" alt="" loading="lazy" /></div>`;
  }
  return `<div class="gud-catalog-card-img -placeholder">${icon('package', { size: 26, tone: 'text-faint' })}</div>`;
}

export const homeHandlers = {
  onClick(st, act, el, c, render) {
    const f = ensureFilter(st);
    switch (act) {
      case 'gud-home-type': f.type = el.dataset.val; render(); break;
      // Feature 2 (individually removable chips + Clear All) — reuses the
      // same filter-engine.js helpers the mobile filter sheet
      // (gudang-center.js) also calls, so both surfaces stay identical.
      case 'gud-home-chip-remove': clearFilterKey(f, el.dataset.key); render(); break;
      case 'gud-home-clear-filters': clearAllFilters(f); render(); break;
      case 'gud-home-load-more': f.page += PAGE_SIZE; render(); break;
      // Quick actions (hover on desktop, tap on mobile — Doc 2 §13): jump
      // straight into the flow with this item already selected, skipping
      // the search step (Doc 2: "Movement before Form"). The flow's own
      // existing gate (Goods Out/In still ask for department/reason first)
      // is untouched — this only pre-fills what happens after that.
      // Phase 10.3: Item Detail's own Quick Actions section (gudang-item-
      // detail.js) reuses these SAME act names/handlers — st.detail is
      // cleared here too so triggering one from inside the Detail drawer
      // actually navigates there instead of leaving the drawer covering
      // the destination screen. A no-op when already null (Home's own case).
      case 'gud-home-quick-out': {
        const item = st.data.items.find((i) => i.itemId === el.dataset.id);
        if (!st.goodsOut) st.goodsOut = { departmentId: null, departmentQuery: '', itemQuery: '', selectedItemId: null, quantity: '', lines: [], saving: false, error: null, savedCount: null };
        if (item) { st.goodsOut.selectedItemId = item.itemId; st.goodsOut.itemQuery = ''; }
        st.screen = 'goodsOut'; st.detail = null; render(); break;
      }
      case 'gud-home-quick-in': {
        const item = st.data.items.find((i) => i.itemId === el.dataset.id);
        if (!st.goodsIn) st.goodsIn = { reason: null, itemQuery: '', selectedItemId: null, quantity: '', priceOpen: false, price: '', lines: [], saving: false, error: null, savedCount: null };
        if (item) { st.goodsIn.selectedItemId = item.itemId; st.goodsIn.itemQuery = ''; }
        st.screen = 'goodsIn'; st.detail = null; render(); break;
      }
      case 'gud-home-quick-opname': {
        const item = st.data.items.find((i) => i.itemId === el.dataset.id);
        if (!st.opname) st.opname = { locationId: null, q: '', open: {}, counted: {}, saving: false, error: null, savedResult: null };
        if (item) st.opname.q = item.name;
        st.screen = 'opname'; st.detail = null; render(); break;
      }
      default: break;
    }
  },
  onInput(st, act, t, render) {
    const f = ensureFilter(st);
    if (act === 'gud-home-location') { f.locationId = t.value; render(); }
    else if (act === 'gud-home-category') { f.category = t.value; render(); }
    else if (act === 'gud-home-stockstatus') { f.stockStatus = t.value; render(); }
    else if (act === 'gud-home-forecast') { f.forecast = t.value; render(); }
  },
};
