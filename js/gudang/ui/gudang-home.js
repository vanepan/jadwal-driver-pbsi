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
import { getForecastDaysRemaining, getLowStockAlerts } from '../analytics/analytics-engine.js';
import { forecastSentence } from '../analytics/quiet-intelligence-engine.js';
import { itemHasPhoto, loadItemPhotoUrl } from './gudang-item-image.js';

const PAGE_SIZE = 48;
const ASSET_STATUS_LABEL = { available: 'tersedia', assigned: 'ditugaskan', maintenance: 'maintenance', retired: 'pensiun' };

function ensureFilter(st) {
  if (!st.homeFilter) st.homeFilter = { type: 'all', locationId: '', category: '', lowStock: false, page: PAGE_SIZE };
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

function ensureLowStockSet(st, requestRender) {
  if (st.homeLowStockIds || st.homeLowStockLoading) return;
  st.homeLowStockLoading = true;
  getLowStockAlerts(200).then((res) => {
    st.homeLowStockIds = new Set(res.ok ? res.data.map((a) => a.itemId) : []);
    st.homeLowStockLoading = false;
    requestRender();
  });
}

export function renderHome(st, c, requestRender) {
  const f = ensureFilter(st);
  const hasCatalog = st.data.items.length > 0;
  if (f.lowStock) ensureLowStockSet(st, requestRender);

  return `
    <div class="gud-home">
      <button type="button" class="gud-home-search" data-act="gud-search-open">
        ${icon('search', { size: 20, tone: 'text-faint' })}
        <span class="gud-home-search-ph">Cari item, lokasi, aset…</span>
        <span class="gud-home-search-kbd">${kbdRow(['Ctrl', 'K'])}</span>
      </button>

      ${hasCatalog ? renderFilterBar(st, f) : ''}

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

function renderFilterBar(st, f) {
  const categories = uniqueSorted(st.data.items.map((i) => i.category).filter(Boolean).map((cat) => categoryLabel(cat)));
  return `<div class="gud-filterbar gud-mt">
    <div class="gud-chips">
      <button type="button" class="gud-chip" data-on="${f.type === 'all'}" data-act="gud-home-type" data-val="all">Semua</button>
      <button type="button" class="gud-chip" data-on="${f.type === 'consumable'}" data-act="gud-home-type" data-val="consumable">Consumable</button>
      <button type="button" class="gud-chip" data-on="${f.type === 'asset'}" data-act="gud-home-type" data-val="asset">Asset</button>
      <button type="button" class="gud-chip" data-on="${f.lowStock}" data-act="gud-home-lowstock">${icon('gauge', { size: 11 })} Stok Rendah</button>
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
    </div>
  </div>`;
}

function uniqueSorted(arr) {
  return Array.from(new Set(arr)).sort((a, b) => a.localeCompare(b));
}

function filteredItems(st, f) {
  return st.data.items.filter((i) => {
    if (!i.active) return false;
    if (f.type === 'consumable' && i.itemType !== ITEM_TYPE.CONSUMABLE) return false;
    if (f.type === 'asset' && i.itemType !== ITEM_TYPE.ASSET) return false;
    if (f.locationId && i.defaultLocationId !== f.locationId) return false;
    if (f.category && (!i.category || categoryLabel(i.category) !== f.category)) return false;
    if (f.lowStock && !(st.homeLowStockIds && st.homeLowStockIds.has(i.itemId))) return false;
    return true;
  });
}

function renderCatalogSection(st, f, requestRender) {
  const all = filteredItems(st, f);
  if (!all.length) {
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

  return `<div class="gud-catalog-card" data-act="gud-open-item" data-id="${esc(item.itemId)}">
    ${catalogCardImage(item, st)}
    <div class="gud-catalog-card-name">${esc(item.name)}</div>
    ${catLabel || loc ? `<div class="gud-catalog-card-meta">${[catLabel, loc?.name].filter(Boolean).map(esc).join(' · ')}</div>` : ''}
    <div class="gud-catalog-card-stock">${esc(stockLine)}</div>
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
      case 'gud-home-lowstock': f.lowStock = !f.lowStock; render(); break;
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
  },
};
