/* ============================================================
   GUDANG-CENTER.JS — Gudang module entry (V1.28.0 Experience Layer)

   Mounts the Gudang UI into a platform-owned host and drives it: loads
   catalog data (items/locations/departments/assets) through the existing
   Phase 1-9 repositories, renders the active screen + search overlay +
   detail drawer, and routes every user action through the existing
   ENGINES (search-resolver, action-resolver, search-session-engine,
   goods-out/in-engine, stock-opname-engine, analytics-engine, quiet-
   intelligence-engine, asset-lifecycle-engine, movement/asset-history-
   view). It contains NO business logic, NO analytics computation, NO
   stock computation — it only orchestrates (Doc 4 Art.V/Experience brief
   Architecture section).

   Rendering model mirrors Engineering: a single innerHTML render per
   state change, one delegated handler reading data-act.
   ============================================================ */

'use strict';

import { getCurrentUser } from '../../auth.js';
import { esc } from './gudang-atoms.js';

import { listItems } from '../repository/item-repository.js';
import { listLocations } from '../repository/location-repository.js';
import { listAssets } from '../repository/asset-repository.js';
// Phase 10.1: "Departemen diganti dengan Bidang" — the picker reads the
// real Bidang-role roster from User Management (see gudang-bidang-source.js
// header), not department-repository.js, which nothing had ever populated.
import { listBidang } from '../config/gudang-bidang-source.js';

import { createInitialSessionState, applySessionEvent } from '../search/search-session-engine.js';
import { searchAndResolve } from '../search/search-resolver.js';

import { renderHome, homeHandlers } from './gudang-home.js';
import { renderSearchOverlay } from './gudang-search-overlay.js';
import { renderGoodsOut, goodsOutHandlers } from './gudang-goods-out.js';
import { renderGoodsIn, goodsInHandlers } from './gudang-goods-in.js';
import { renderMovementHistory, historyHandlers } from './gudang-movement-history.js';
import { renderStockOpname, opnameHandlers } from './gudang-stock-opname.js';
import { renderAnalytics, analyticsOnChange } from './gudang-analytics.js';
import { renderItemDetail, renderAssetDetail, detailHandlers } from './gudang-item-detail.js';
import { renderCatalogModal, catalogHandlers } from './gudang-catalog.js';

const st = {
  screen: 'home',
  detail: null, // { kind: 'item'|'asset', id: string }
  modal: null, // { kind: 'addItem'|'addLocation'|'addDepartment'|'addAssetUnit', ... } — gudang-catalog.js
  search: createInitialSessionState(),
  data: { items: [], locations: [], departments: [], assets: [], loadedAt: 0 },
  loading: false,
  goodsOut: null, // lazily created by gudang-goods-out.js's own blank-batch factory
  goodsIn: null,
  opname: null,
  historyFilters: null, // lazily created by gudang-movement-history.js's own ensure pattern
};

let host = null, mounted = false, loaded = false, lastAnimatedScreen = null;

/* ── context (identity) — mirrors Engineering's ctx() shape ───────────── */
function ctx() {
  const u = getCurrentUser() || {};
  return {
    actorId: u.username || u.id || 'unknown',
    me: { id: u.username || u.id || 'unknown', name: u.name || u.username || 'Pengguna' },
    now: Date.now(),
  };
}

/* ── mount / screen ───────────────────────────────────────────────────── */
export async function mountGudang(hostEl) {
  if (!hostEl) return;
  host = hostEl;
  host.classList.add('gud-root');
  if (!mounted) {
    mounted = true;
    host.addEventListener('click', onClick);
    host.addEventListener('input', onInput);
    host.addEventListener('submit', onSubmit);
    // Phase 10.3 (Item photo): drag & drop and clipboard-paste are the only
    // Gudang interactions that fundamentally require these two DOM event
    // types — there is no way to support "drag a file in" or "Ctrl+V an
    // image" through the existing click/input delegation alone. Still one
    // delegated listener per event type, same discipline as the rest of
    // this file.
    host.addEventListener('dragover', onDragOver);
    host.addEventListener('drop', onDrop);
    host.addEventListener('paste', onPaste);
    document.addEventListener('keydown', onGlobalKeydown, true);
  }
  if (!loaded) {
    loaded = true;
    await refreshCatalog();
  }
  render();
}

/** Re-fetch the catalog lists Search/pickers read from. Called on mount and
 *  after any write that could change what they show (Doc 4: no duplicated
 *  queries — one refresh point, not one per screen). */
async function refreshCatalog() {
  st.loading = true;
  render();
  const [itemsRes, locationsRes, assetsRes] = await Promise.all([
    listItems(), listLocations(), listAssets(),
  ]);
  st.data = {
    items: itemsRes.ok ? itemsRes.data : [],
    locations: locationsRes.ok ? locationsRes.data : [],
    departments: listBidang(),
    assets: assetsRes.ok ? assetsRes.data : [],
    loadedAt: Date.now(),
  };
  st.loading = false;
  render();
}

export function setGudangScreen(screen) {
  st.screen = screen || 'home';
  st.detail = null;
  render();
}

/** Adaptive global search adapter hook (js/services/adaptive-search.js).
 *  Phase 10.1 redesign (Doc 2 §05: Search IS the product here): the shared
 *  topbar #v2SearchInput IS the query field — every keystroke there drives
 *  this dropdown, exactly the same "one box, per-module adapter" shape
 *  every other module already uses (js/app.js#registerSearchAdapters).
 *  An empty query (typed-then-deleted, or the shared Escape/clear-button
 *  handler in app.js) closes the dropdown rather than showing an empty
 *  "type to search" hint — there is no separate query box left to hint at. */
export function setGudangSearch(q) {
  if (!q) { closeSearchDropdown(); return; }
  if (st.search.status !== 'open') st.search = applySessionEvent(st.search, { type: 'open' }).state;
  render();
  driveSearchQuery(q);
}

/** Ctrl+K's entire job now (Doc 2 §12): move focus to the real search field.
 *  It does not open anything itself — typing is what opens the dropdown,
 *  via setGudangSearch above, same as every other module's adapter. */
export function openGudangSearch() {
  focusSharedSearchInput();
}

/** Phase 10.1 Part 6: UAT read "click Home's search -> focus silently jumps
 *  to the real topbar field" as a bug, since nothing showed the connection.
 *  A brief pulse on the field it just focused makes it visible instead of a
 *  silent teleport. Uses the Web Animations API directly (not a gudang.css
 *  class) — #v2SearchInput lives in the shared topbar, outside .gud-root,
 *  and this file's own header is explicit that nothing here leaks scoped
 *  CSS onto the rest of the platform. */
function pulseSharedSearchInput(input) {
  if (typeof input.animate !== 'function') return; // no-op in an environment without WAAPI (still focuses fine)
  input.animate(
    [{ boxShadow: '0 0 0 0 var(--accent-line, rgba(207,74,67,.4))' }, { boxShadow: '0 0 0 6px rgba(207,74,67,0)' }],
    { duration: 500, easing: 'ease-out' }
  );
}

function focusSharedSearchInput() {
  const input = document.getElementById('v2SearchInput');
  if (input) { input.focus(); input.select(); pulseSharedSearchInput(input); }
}

function closeSearchDropdown() {
  if (st.search.status === 'open') {
    st.search = applySessionEvent(st.search, { type: 'close' }).state;
    render();
  }
}

async function driveSearchQuery(query) {
  const res = await searchAndResolve(query);
  st.search = applySessionEvent(st.search, { type: 'resultsLoaded', query, results: res.ok ? res.data : [] }).state;
  render();
}

/** Where the results dropdown anchors — the shared topbar search input's
 *  real on-screen position, not a fixed guess (it must track that field on
 *  any layout/viewport, and that field lives outside #v2GudangWorkspace). */
function searchAnchorRect() {
  const input = document.getElementById('v2SearchInput');
  return input ? input.getBoundingClientRect() : null;
}

/* ── render ───────────────────────────────────────────────────────────── */
function render() {
  if (!host) return;
  const c = ctx();
  let screen;
  switch (st.screen) {
    case 'goodsOut': screen = renderGoodsOut(st, c); break;
    case 'goodsIn': screen = renderGoodsIn(st, c); break;
    case 'history': screen = renderMovementHistory(st, c, render); break;
    case 'opname': screen = renderStockOpname(st, c); break;
    case 'analytics': screen = renderAnalytics(st, c, render); break;
    case 'home':
    default: screen = renderHome(st, c, render);
  }
  const detail = st.detail
    ? (st.detail.kind === 'asset' ? renderAssetDetail(st, c, render) : renderItemDetail(st, c, render))
    : '';
  const overlay = st.search.status === 'open' ? renderSearchOverlay(st, c, searchAnchorRect()) : '';
  const modal = st.modal ? renderCatalogModal(st, c) : '';
  // Entrance animation plays only when the screen itself changes — every
  // render() call (e.g. one per keystroke while typing) replaces this whole
  // div, so an unconditional animation class replayed the fade-up on every
  // character typed (Phase 10.1 UAT finding).
  const isNewScreen = st.screen !== lastAnimatedScreen;
  lastAnimatedScreen = st.screen;
  host.innerHTML = `<div class="gud-content${isNewScreen ? ' -enter' : ''}">${screen}</div>${detail}${overlay}${modal}`;
  restoreFocus();
}

/* ── delegated events ─────────────────────────────────────────────────── */
function onClick(e) {
  const scrim = e.target.closest('[data-act="gud-scrim"]');
  if (scrim && !e.target.closest('.gud-drawer') && !e.target.closest('.gud-modal-box') && !e.target.closest('.gud-spotlight')) {
    st.detail = null;
    st.modal = null;
    st.search = applySessionEvent(st.search, { type: 'close' }).state;
    render();
    return;
  }
  const el = e.target.closest('[data-act]');
  if (!el || !host.contains(el)) return;
  const act = el.dataset.act;
  const id = el.dataset.id;
  const val = el.dataset.val;
  const c = ctx();

  switch (act) {
    case 'gud-goto': setGudangScreen(val); break;
    case 'gud-noop': break;
    // Home's search "button" no longer opens its own overlay — it moves
    // focus to the real shared search field, same as Ctrl+K (Phase 10.1).
    case 'gud-search-open': focusSharedSearchInput(); break;
    case 'gud-search-key': handleSearchKeyClick(el, c); break;
    case 'gud-result-row': handleResultFocus(el, false); break;
    case 'gud-result-chip': handleResultFocus(el, true); break;
    case 'gud-result-reveal': handleResultReveal(el); break;
    case 'gud-open-item': st.detail = { kind: 'item', id }; st.search = applySessionEvent(st.search, { type: 'close' }).state; render(); break;
    case 'gud-open-asset': st.detail = { kind: 'asset', id }; st.search = applySessionEvent(st.search, { type: 'close' }).state; render(); break;
    case 'gud-detail-close': st.detail = null; render(); break;
    case 'gud-quick-goods-out': setGudangScreen('goodsOut'); break;
    case 'gud-quick-goods-in': setGudangScreen('goodsIn'); break;
    // "Search resolves into action" (Doc 1, Phase 10.1 Part 9) — a
    // zero-result search hands off to the Add Item modal; close the
    // dropdown first so the two never render on top of each other.
    case 'gud-cat-add-item-search':
      st.search = applySessionEvent(st.search, { type: 'close' }).state;
      catalogHandlers.onClick(st, act, el, c, render, refreshCatalog);
      break;
    default:
      if (act.startsWith('gud-go-')) { goodsOutHandlers.onClick(st, act, el, c, render, refreshCatalog); return; }
      if (act.startsWith('gud-gi-')) { goodsInHandlers.onClick(st, act, el, c, render, refreshCatalog); return; }
      if (act.startsWith('gud-op-')) { opnameHandlers.onClick(st, act, el, c, render, refreshCatalog); return; }
      if (act.startsWith('gud-hist-')) { historyHandlers.onClick(st, act, el, c, render); return; }
      if (act.startsWith('gud-asset-action-')) { detailHandlers.onClick(st, act, el, c, render, refreshCatalog); return; }
      if (act.startsWith('gud-cat-')) { catalogHandlers.onClick(st, act, el, c, render, refreshCatalog); return; }
      if (act.startsWith('gud-home-')) { homeHandlers.onClick(st, act, el, c, render); return; }
      break;
  }
}

function onInput(e) {
  const t = e.target;
  const ds = t && t.dataset ? t.dataset : null;
  if (!ds || !ds.act) return;
  // Every live-filtering/live-editing input re-renders on each keystroke
  // (the surrounding list/button state depends on the value) — the render
  // that follows would otherwise recreate this exact element and drop
  // focus/cursor position. Track it here, restoreFocus() (end of render())
  // re-focuses + restores the caret. Mirrors Engineering's restoreFocus,
  // generalized to every Gudang live input, not just search.
  st._focusAct = ds.act;
  if (ds.act.startsWith('gud-go-')) { goodsOutHandlers.onInput(st, ds.act, t, render); return; }
  if (ds.act.startsWith('gud-gi-')) { goodsInHandlers.onInput(st, ds.act, t, render); return; }
  if (ds.act.startsWith('gud-op-')) { opnameHandlers.onInput(st, ds.act, t, render); return; }
  if (ds.act.startsWith('gud-hist-')) { historyHandlers.onInput(st, ds.act, t, render); return; }
  if (ds.act === 'gud-an-item-pick') { analyticsOnChange(st, t, render); return; }
  if (ds.act.startsWith('gud-asset-')) { detailHandlers.onInput(st, ds.act, t); return; }
  if (ds.act.startsWith('gud-cat-')) { catalogHandlers.onInput(st, ds.act, t, render); return; }
  if (ds.act.startsWith('gud-home-')) { homeHandlers.onInput(st, ds.act, t, render); return; }
}

function onSubmit(e) {
  const form = e.target.closest('form[data-act]');
  if (!form) return;
  e.preventDefault();
}

/* ── Phase 10.3: photo drag & drop / paste (Add Item / Edit Item only) ──── */
function onDragOver(e) {
  if (!e.target.closest('[data-act="gud-cat-photo-zone"]')) return;
  e.preventDefault(); // required for 'drop' to fire at all
}

function onDrop(e) {
  const zone = e.target.closest('[data-act="gud-cat-photo-zone"]');
  if (!zone) return;
  e.preventDefault();
  const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
  if (file) catalogHandlers.onPhotoFile(st, file, render);
}

/** Paste has no target element to scope by data-act (clipboard events fire
 *  wherever focus is) — scoped instead to "a photo-capable modal is open,"
 *  same as the modal's own Escape-to-cancel keyboard handling below. */
function onPaste(e) {
  if (!st.modal || (st.modal.kind !== 'addItem' && st.modal.kind !== 'editItem')) return;
  const items = (e.clipboardData && e.clipboardData.items) || [];
  const imageItem = Array.from(items).find((it) => it.type && it.type.startsWith('image/'));
  if (!imageItem) return;
  const file = imageItem.getAsFile();
  if (!file) return;
  e.preventDefault();
  catalogHandlers.onPhotoFile(st, file, render);
}

/* ── keyboard: Ctrl+K anywhere inside Gudang, plus the Spotlight session ──
   Scoped to when Gudang is the active rail module (document-level listener,
   but a no-op outside Gudang so it never hijacks other modules' shortcuts). */
function onGlobalKeydown(e) {
  if (!host || host.offsetParent === null) return; // Gudang not the visible workspace
  // Ctrl+K focuses the real search field only (Doc 2 §12, Phase 10.1) — it
  // does not open a dropdown itself; typing there is what does that, via
  // setGudangSearch (same "one box" contract every other module uses).
  const ctrlK = (e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K');
  if (ctrlK) { e.preventDefault(); focusSharedSearchInput(); return; }

  if (e.key === 'Escape' && st.modal) { e.preventDefault(); st.modal = null; render(); return; }

  // Ctrl+Enter — save the whole batch (Doc 2 §12: scoped to Goods In/Out/
  // Stock Opname, "not just the current line") — from anywhere in the flow.
  const ctrlEnter = (e.ctrlKey || e.metaKey) && e.key === 'Enter';
  if (ctrlEnter && st.search.status !== 'open') {
    if (st.screen === 'goodsOut') { e.preventDefault(); goodsOutHandlers.trySave(st, ctx(), render, refreshCatalog); return; }
    if (st.screen === 'goodsIn') { e.preventDefault(); goodsInHandlers.trySave(st, ctx(), render, refreshCatalog); return; }
    if (st.screen === 'opname') { e.preventDefault(); opnameHandlers.trySave(st, ctx(), render, refreshCatalog); return; }
  }

  if (st.search.status !== 'open') return;
  if (!['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(e.key)) return;
  // Enter inside the query input still submits the form otherwise (Tab moves
  // focus) — both are meaningful only inside the Spotlight, so prevent default.
  e.preventDefault();
  const { state, intent } = applySessionEvent(st.search, { type: 'key', key: e.key });
  st.search = state;
  render();
  if (intent && intent.ok) resolveSearchIntent(intent.data);
}

function handleSearchKeyClick(el, _c) {
  const key = el.dataset.key;
  const { state, intent } = applySessionEvent(st.search, { type: 'key', key });
  st.search = state;
  render();
  if (intent && intent.ok) resolveSearchIntent(intent.data);
}

/** Mobile chevron (Doc 2 §05: "chevron for secondary actions") — focus that
 *  row, then send the SAME 'Tab' key event desktop uses to reveal actions.
 *  One reducer, one reveal mechanism, two input methods. */
function handleResultReveal(el) {
  const index = Number(el.dataset.index);
  st.search = applySessionEvent(st.search, { type: 'focusIndex', index }).state;
  st.search = applySessionEvent(st.search, { type: 'key', key: 'Tab' }).state;
  render();
}

/** Mouse/touch: tap a result row (primary action) or a specific action chip
 *  — Doc 2 §05 mobile spec ("one tap primary action... chevron for
 *  secondary"). Focuses that row/action, then commits immediately. */
function handleResultFocus(el, isChip) {
  const index = Number(el.dataset.index);
  st.search = applySessionEvent(st.search, { type: 'focusIndex', index }).state;
  const actionId = isChip ? el.dataset.actionId : undefined;
  const { state, intent } = applySessionEvent(st.search, { type: 'commit', actionId });
  st.search = state;
  render();
  if (intent && intent.ok) resolveSearchIntent(intent.data);
}

/** An Action Resolution intent was committed (Doc 3 Ch.08/Doc 4 Art.IV —
 *  Search hands off, it never performs). Today only 'open' is available
 *  (action-resolver.js), so this is intentionally a single case, not a
 *  dispatch table for actions that don't exist yet. */
function resolveSearchIntent(intent) {
  if (intent.type !== 'open') return; // ACTION_UNAVAILABLE etc. — nothing to do yet
  st.detail = { kind: intent.ownerDomain === 'asset' ? 'asset' : 'item', id: intent.refId };
  st.search = applySessionEvent(st.search, { type: 'close' }).state;
  render();
}

/* ── focus restoration (mirrors Engineering's restoreFocus) ───────────── */
function restoreFocus() {
  const act = st._focusAct;
  if (!act) return;
  const el = host.querySelector(`[data-act="${act}"]`);
  if (el) { el.focus(); try { const n = el.value.length; el.setSelectionRange(n, n); } catch (_) {} }
}

export { esc };
