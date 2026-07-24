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
import { listDepartments } from '../repository/department-repository.js';
import { listAssets } from '../repository/asset-repository.js';

import { createInitialSessionState, applySessionEvent } from '../search/search-session-engine.js';
import { searchAndResolve } from '../search/search-resolver.js';

import { renderHome } from './gudang-home.js';
import { renderSearchOverlay } from './gudang-search-overlay.js';
import { renderGoodsOut, goodsOutHandlers } from './gudang-goods-out.js';
import { renderGoodsIn, goodsInHandlers } from './gudang-goods-in.js';
import { renderMovementHistory, historyHandlers } from './gudang-movement-history.js';
import { renderStockOpname, opnameHandlers } from './gudang-stock-opname.js';
import { renderAnalytics, analyticsOnChange } from './gudang-analytics.js';
import { renderItemDetail, renderAssetDetail, detailHandlers } from './gudang-item-detail.js';

const st = {
  screen: 'home',
  detail: null, // { kind: 'item'|'asset', id: string }
  search: createInitialSessionState(),
  data: { items: [], locations: [], departments: [], assets: [], loadedAt: 0 },
  loading: false,
  goodsOut: null, // lazily created by gudang-goods-out.js's own blank-batch factory
  goodsIn: null,
  opname: null,
  historyFilters: null, // lazily created by gudang-movement-history.js's own ensure pattern
};

let host = null, mounted = false, loaded = false;

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
  const [itemsRes, locationsRes, departmentsRes, assetsRes] = await Promise.all([
    listItems(), listLocations(), listDepartments(), listAssets(),
  ]);
  st.data = {
    items: itemsRes.ok ? itemsRes.data : [],
    locations: locationsRes.ok ? locationsRes.data : [],
    departments: departmentsRes.ok ? departmentsRes.data : [],
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
 *  Doc 2 §05: Search IS the product here — typing in the shared topbar
 *  input while inside Gudang opens/updates the SAME Spotlight overlay
 *  Ctrl+K opens, rather than filtering an in-page list (there is no
 *  separate "search results screen" to filter, by design). */
export function setGudangSearch(q) {
  openSearchOverlay(q);
}

export function openGudangSearch() {
  openSearchOverlay('');
}

function openSearchOverlay(initialQuery) {
  const opened = applySessionEvent(st.search, { type: 'open' }).state;
  st.search = opened;
  render();
  if (initialQuery) driveSearchQuery(initialQuery);
}

async function driveSearchQuery(query) {
  const res = await searchAndResolve(query);
  st.search = applySessionEvent(st.search, { type: 'resultsLoaded', query, results: res.ok ? res.data : [] }).state;
  render();
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
  const overlay = st.search.status === 'open' ? renderSearchOverlay(st, c) : '';
  host.innerHTML = `<div class="gud-content">${screen}</div>${detail}${overlay}`;
  restoreFocus();
}

/* ── delegated events ─────────────────────────────────────────────────── */
function onClick(e) {
  const scrim = e.target.closest('[data-act="gud-scrim"]');
  if (scrim && !e.target.closest('.gud-drawer') && !e.target.closest('.gud-modal-box') && !e.target.closest('.gud-spotlight')) {
    st.detail = null;
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
    case 'gud-search-open': openSearchOverlay(''); break;
    case 'gud-search-close': st.search = applySessionEvent(st.search, { type: 'close' }).state; render(); break;
    case 'gud-search-key': handleSearchKeyClick(el, c); break;
    case 'gud-result-row': handleResultFocus(el, false); break;
    case 'gud-result-chip': handleResultFocus(el, true); break;
    case 'gud-result-reveal': handleResultReveal(el); break;
    case 'gud-open-item': st.detail = { kind: 'item', id }; st.search = applySessionEvent(st.search, { type: 'close' }).state; render(); break;
    case 'gud-open-asset': st.detail = { kind: 'asset', id }; st.search = applySessionEvent(st.search, { type: 'close' }).state; render(); break;
    case 'gud-detail-close': st.detail = null; render(); break;
    case 'gud-quick-goods-out': setGudangScreen('goodsOut'); break;
    case 'gud-quick-goods-in': setGudangScreen('goodsIn'); break;
    default:
      if (act.startsWith('gud-go-')) { goodsOutHandlers.onClick(st, act, el, c, render, refreshCatalog); return; }
      if (act.startsWith('gud-gi-')) { goodsInHandlers.onClick(st, act, el, c, render, refreshCatalog); return; }
      if (act.startsWith('gud-op-')) { opnameHandlers.onClick(st, act, el, c, render, refreshCatalog); return; }
      if (act.startsWith('gud-hist-')) { historyHandlers.onClick(st, act, el, c, render); return; }
      if (act.startsWith('gud-asset-action-')) { detailHandlers.onClick(st, act, el, c, render, refreshCatalog); return; }
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
  if (ds.act === 'gud-search-input') { driveSearchQuery(t.value); return; }
  if (ds.act.startsWith('gud-go-')) { goodsOutHandlers.onInput(st, ds.act, t, render); return; }
  if (ds.act.startsWith('gud-gi-')) { goodsInHandlers.onInput(st, ds.act, t, render); return; }
  if (ds.act.startsWith('gud-op-')) { opnameHandlers.onInput(st, ds.act, t, render); return; }
  if (ds.act.startsWith('gud-hist-')) { historyHandlers.onInput(st, ds.act, t, render); return; }
  if (ds.act === 'gud-an-item-pick') { analyticsOnChange(st, t, render); return; }
  if (ds.act.startsWith('gud-asset-')) { detailHandlers.onInput(st, ds.act, t); return; }
}

function onSubmit(e) {
  const form = e.target.closest('form[data-act]');
  if (!form) return;
  e.preventDefault();
}

/* ── keyboard: Ctrl+K anywhere inside Gudang, plus the Spotlight session ──
   Scoped to when Gudang is the active rail module (document-level listener,
   but a no-op outside Gudang so it never hijacks other modules' shortcuts). */
function onGlobalKeydown(e) {
  if (!host || host.offsetParent === null) return; // Gudang not the visible workspace
  const ctrlK = (e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K');
  if (ctrlK) { e.preventDefault(); st.search = applySessionEvent(st.search, { type: 'key', key: 'k', ctrlKey: true }).state; render(); return; }

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
