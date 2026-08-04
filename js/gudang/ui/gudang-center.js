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
import { esc, icon } from './gudang-atoms.js';

import { listItems } from '../repository/item-repository.js';
import { listLocations } from '../repository/location-repository.js';
import { listAssets } from '../repository/asset-repository.js';
// Phase 10.1: "Departemen diganti dengan Bidang" — the picker reads the
// real Bidang-role roster from User Management (see gudang-bidang-source.js
// header), not department-repository.js, which nothing had ever populated.
import { listBidang } from '../config/gudang-bidang-source.js';

import { createInitialSessionState, applySessionEvent } from '../search/search-session-engine.js';
import { searchAndResolve } from '../search/search-resolver.js';
import { addRecentSearch, clearRecentSearches } from '../search/recent-searches-store.js';

import { renderHome, homeHandlers } from './gudang-home.js';
import { renderSearchOverlay, renderMobileSearchSheet, SEARCH_LISTBOX_ID } from './gudang-search-overlay.js';
import { renderGoodsOut, goodsOutHandlers } from './gudang-goods-out.js';
import { renderGoodsIn, goodsInHandlers } from './gudang-goods-in.js';
import { renderMovementHistory, historyHandlers } from './gudang-movement-history.js';
import { renderStockOpname, opnameHandlers } from './gudang-stock-opname.js';
import { renderAnalytics, analyticsOnChange } from './gudang-analytics.js';
import { renderItemDetail, renderAssetDetail, detailHandlers, renderDeleteItemConfirm } from './gudang-item-detail.js';
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
  toast: null, // transient success message (Delete Item) — see showToast()
};

let host = null, mounted = false, loaded = false, lastAnimatedScreen = null, toastTimer = null, searchDebounceTimer = null;

/** v1.29.0 Feature 2 (Instant Search): 250-300ms recommended range — the
 *  "dropdown is open" feedback in setGudangSearch() below is NOT delayed by
 *  this, only the (potentially Firebase-touching) resolve itself is. */
const SEARCH_DEBOUNCE_MS = 275;

/** Scoped, self-dismissing toast (mirrors petty-cash-center.js's own local
 *  toast() — same render-driven module-center idiom, no shared #toast DOM
 *  element the way js/utils.js#showToast uses, since that element lives
 *  outside Gudang's own root and this module renders its own tree wholesale. */
function showToast(msg) {
  if (toastTimer) clearTimeout(toastTimer);
  st.toast = msg;
  render();
  toastTimer = setTimeout(() => { st.toast = null; render(); }, 2600);
}

/** Phase 10.4.1 root cause ("breadcrumb/sidebar out of sync"): js/app.js's
 *  navGudang() sets the breadcrumb/sidebar-active-state/bottom-nav ONLY when
 *  the SIDE-NAV itself is clicked. Every in-content navigation (Home's FAB,
 *  a catalog card's quick-action, "Lihat semua di Movement History") changes
 *  st.screen directly and never calls back out to app.js, so the shell's
 *  chrome went stale while the actual content underneath it was correct.
 *  One listener, set once by app.js, fired from the ONE place every single
 *  screen change already flows through before the user sees anything. */
let _onScreenChange = null;
export function onGudangScreenChange(cb) { _onScreenChange = cb; }

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
    host.addEventListener('keydown', onHostKeydown);
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
    // v1.29.0 Feature 6 ("When the search field gains focus and is empty:
    // display recent searches") — the shared field lives outside .gud-root,
    // so this can't be a delegated `host` listener the way every other
    // Gudang interaction is; scoped by checking Gudang is actually the
    // visible workspace before acting, same discipline onGlobalKeydown
    // already uses, so it's a no-op while any other module owns this field.
    const sharedInput = document.getElementById('v2SearchInput');
    if (sharedInput) sharedInput.addEventListener('focus', onSharedSearchInputFocus);
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
  // Phase 10.4.1 root cause ("Catalog stock never refreshes"): per-item
  // stock/forecast figures are cached once-per-fetch by Home
  // (st.homeCardData/st.homeLowStockIds, gudang-home.js#ensureCardData/
  // ensureLowStockSet) and by Item Detail (st.detail's own cache.loaded
  // guard, gudang-item-detail.js#ensureConsumableData). Every mutating
  // action (Goods In/Out, Stock Opname) already calls refreshCatalog() on
  // save, but it only ever refreshed st.data.items/locations/assets —
  // never these DERIVED per-item caches — so a just-saved stock change
  // never showed up anywhere without a full page reload, even though the
  // underlying Stock Projection was already correct. Busting both here,
  // the one place every mutating action already funnels through.
  st.homeCardData = null;
  st.homeLowStockIds = null;
  st.analyticsTop = null; // same staleness class — Top Consumed/Top Departments (gudang-analytics.js)
  st.historyData = null; // same staleness class — the feed itself (gudang-movement-history.js)
  if (st.detail) { st.detail.loaded = null; st.detail.historyLoaded = null; }
  st.loading = false;
  render();
}

// Phase 10.4.2 root cause ("old rows/errors survive navigation away and
// back"): st.goodsOut/goodsIn/opname are each lazily created once by their
// own screen's ensure(st) and never invalidated except by an explicit
// save/new-batch action — leaving a screen without saving (e.g. to check
// something on Home) left the whole draft, including any error message,
// sitting there indefinitely for the next visit to inherit.
const EPHEMERAL_SCREEN_STATE_KEY = { goodsOut: 'goodsOut', goodsIn: 'goodsIn', opname: 'opname' };
export function setGudangScreen(screen) {
  const next = screen || 'home';
  if (st.screen !== next) {
    // Nulling the field here lets each screen's own existing ensure()
    // guard recreate a fresh blank draft on next visit — the same
    // lazy-init it already does for a screen's very first visit, simply
    // re-triggered on every subsequent departure too. No new state shape.
    const key = EPHEMERAL_SCREEN_STATE_KEY[st.screen];
    if (key) st[key] = null;
  }
  st.screen = next;
  st.detail = null;
  render();
}

/** Adaptive global search adapter hook (js/services/adaptive-search.js).
 *  Phase 10.1 redesign (Doc 2 §05: Search IS the product here): the shared
 *  topbar #v2SearchInput IS the query field — every keystroke there drives
 *  this dropdown, exactly the same "one box, per-module adapter" shape
 *  every other module already uses (js/app.js#registerSearchAdapters).
 *  v1.29.0: an empty query (typed-then-deleted) now opens Recent Searches
 *  instead of closing outright — see openRecentSearchesView() below. */
export function setGudangSearch(q) {
  if (!q) { openRecentSearchesView(); return; }
  if (st.search.status !== 'open') st.search = applySessionEvent(st.search, { type: 'open' }).state;
  render();
  // v1.29.0 Feature 2 (debounce): only the potentially-expensive resolve is
  // delayed — the render() above already shows the dropdown as open the
  // instant a key is pressed, so typing never feels laggy.
  if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => driveSearchQuery(q), SEARCH_DEBOUNCE_MS);
}

/** v1.29.0 Feature 6 (Recent Searches): "When the search field gains focus
 *  and is empty: display recent searches." Reused for both the shared
 *  input's own focus event (see mountGudang) and setGudangSearch's
 *  empty-query branch above — same state, same trigger condition. Always
 *  dispatches 'open' (not 'resultsLoaded') since that reducer event already
 *  guarantees a fully blank session (query/results reset), regardless of
 *  whatever was there before. */
function openRecentSearchesView() {
  if (searchDebounceTimer) { clearTimeout(searchDebounceTimer); searchDebounceTimer = null; }
  st.search = applySessionEvent(st.search, { type: 'open' }).state;
  render();
}

/** v1.29.0 root-cause fix: js/app.js#setRailModule() calls the active
 *  adapter's `clear()` (js/services/adaptive-search.js#clearModuleSearch)
 *  on EVERY navigation TO Gudang, not only when a user empties an active
 *  query — before this existed, Gudang's adapter had no `clear`, so that
 *  call fell through to run(''), which is setGudangSearch(''), which
 *  (after Feature 6) now OPENS Recent Searches — meaning simply navigating
 *  to Gudang from the sidebar popped an uninvited search dropdown open
 *  every time, confirmed live against the real app. The fix belongs at
 *  the adapter boundary (js/app.js's own 'gudang' registration now passes
 *  this as `clear`), not inside setGudangSearch() itself, since "the
 *  module is being deactivated/reset" and "the user emptied the query
 *  while actively searching" are genuinely different events that happened
 *  to share one code path before Feature 6 made them behave differently. */
export function closeGudangSearch() {
  if (searchDebounceTimer) { clearTimeout(searchDebounceTimer); searchDebounceTimer = null; }
  if (st.search.status === 'open') {
    st.search = applySessionEvent(st.search, { type: 'close' }).state;
    render();
  }
}

/** Ctrl+K/Ctrl+F's entire job now (Doc 2 §12, v1.29.0 Feature 7): move
 *  focus to the real search field. It does not open anything itself —
 *  typing is what opens the dropdown, via setGudangSearch above, same as
 *  every other module's adapter. */
export function openGudangSearch() {
  openSearchEntry();
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

// Ctrl+K/Ctrl+F/the Home button all share one tested, deliberate contract
// (Phase 10.1): programmatically focusing the shared field NEVER opens
// anything by itself — only typing (or, v1.29.0, a genuine user-initiated
// focus) does. Without this flag, .focus() below would synchronously fire
// the 'focus' listener registered in mountGudang and incorrectly open
// Recent Searches on every Ctrl+K press (gudang-ui-interaction-check.mjs
// caught this exact regression). One-shot: set immediately before the
// programmatic .focus() call, consumed by the very next focus event.
let suppressNextSearchFocusOpen = false;

function focusSharedSearchInput() {
  const input = document.getElementById('v2SearchInput');
  if (!input) return;
  suppressNextSearchFocusOpen = true;
  input.focus(); input.select(); pulseSharedSearchInput(input);
}

/** v1.29.0 Feature 6: the shared field gained focus — if it's currently
 *  empty and Gudang is the visible workspace, open Recent Searches (a no-op
 *  otherwise: not Gudang's turn, a suppressed programmatic focus per above,
 *  or the user tabbed in with text already there, which setGudangSearch's
 *  own non-empty path already handles). This only ever fires for a REAL,
 *  user-initiated focus (a direct click/tap on the field, or Tab landing on
 *  it) — exactly the case the brief describes, distinct from a keyboard
 *  shortcut whose own contract is "just focus." */
function onSharedSearchInputFocus(e) {
  if (suppressNextSearchFocusOpen) { suppressNextSearchFocusOpen = false; return; }
  if (!host || host.offsetParent === null) return;
  if (e.target.value) return;
  if (st.search.status !== 'open') openRecentSearchesView();
}

/** v1.29.0 Feature 9 (Responsive Experience): #v2SearchInput is CSS-hidden
 *  below 1280px, but via its ANCESTOR .v2-topbar-search's `display:none`
 *  (platform.css), never on the input element itself — the input's own
 *  computed `display` (e.g. "inline-block") is unaffected by an ancestor
 *  being hidden, so an earlier version of this check
 *  (`getComputedStyle(input).display !== 'none'`) always returned true
 *  regardless of actual visibility, confirmed live at 768px/390px: the
 *  mobile sheet never opened because this thought the desktop field was
 *  visible and just silently focused a field that couldn't accept it.
 *  `offsetParent` is the correct check — it returns null when the element
 *  OR any ancestor is display:none — and is the same technique already
 *  used everywhere else in this file (e.g. `host.offsetParent === null`). */
function sharedSearchInputVisible() {
  const input = document.getElementById('v2SearchInput');
  return !!input && input.offsetParent !== null;
}

/** Every search entry point (Home's "Cari..." button, Ctrl+K, Ctrl+F)
 *  routes through here: focus the real shared field where it's visible, or
 *  open Gudang's own full-screen mobile sheet where it isn't (confirmed:
 *  no separate mobile search UI existed before this) — so the keyboard
 *  shortcuts and the visible tap target always agree on what "open search"
 *  means on the current viewport. */
function openSearchEntry() {
  if (sharedSearchInputVisible()) focusSharedSearchInput();
  else openMobileSearchSheet();
}

function openMobileSearchSheet() {
  st.search = applySessionEvent(st.search, { type: 'open' }).state;
  st._focusAct = 'gud-mobile-search-field'; // restoreFocus() (end of render()) focuses it
  render();
}

function closeMobileSearchSheet() {
  st.search = applySessionEvent(st.search, { type: 'close' }).state;
  render();
}

/** Both possible inputs (shared desktop field, Gudang-owned mobile sheet
 *  field) may be showing the query at once in principle — only one is ever
 *  actually visible, so syncing both unconditionally is safe and avoids
 *  needing to know which presentation is currently on screen. */
function syncVisibleSearchInputs(query) {
  const shared = document.getElementById('v2SearchInput');
  if (shared) shared.value = query;
  const mobile = host && host.querySelector('[data-act="gud-mobile-search-field"]');
  if (mobile) mobile.value = query;
}

/** v1.29.0 Feature 8 (Performance): searchAndResolve() now takes the
 *  catalog st.data ALREADY has in memory (populated by refreshCatalog() at
 *  mount and after every write) instead of forcing search-resolver.js to
 *  re-read Firebase on every keystroke — the single biggest lever here,
 *  ahead of the debounce above. See search-resolver.js's own header for
 *  why this is a safe, additive change to that file's signature. */
async function driveSearchQuery(query) {
  const res = await searchAndResolve(query, { items: st.data.items, locations: st.data.locations });
  st.search = applySessionEvent(st.search, { type: 'resultsLoaded', query, results: res.ok ? res.data : [] }).state;
  render();
}

/** A Recent Searches row was clicked (v1.29.0 Feature 6) — re-runs that
 *  exact query immediately, not debounced (this is a deliberate re-search,
 *  not live typing), and syncs whichever input is actually visible so the
 *  field doesn't look empty while showing that query's results. */
function applyRecentSearchQuery(query) {
  if (!query) return;
  syncVisibleSearchInputs(query);
  if (st.search.status !== 'open') st.search = applySessionEvent(st.search, { type: 'open' }).state;
  render();
  driveSearchQuery(query);
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
  // v1.29.0 Feature 9: below the shared field's own breakpoint, its dropdown
  // presentation makes no sense (nothing to anchor under) — the full-screen
  // sheet takes over instead. Both render the exact same session state.
  const mobilePresentation = st.search.status === 'open' && !sharedSearchInputVisible();
  const overlay = st.search.status === 'open'
    ? (mobilePresentation ? renderMobileSearchSheet(st, c) : renderSearchOverlay(st, c, searchAnchorRect()))
    : '';
  const modal = st.modal
    ? (st.modal.kind === 'confirmDeleteItem' ? renderDeleteItemConfirm(st) : renderCatalogModal(st, c))
    : '';
  const toast = st.toast ? `<div class="gud-toast">${icon('check-circle', { size: 16 })} ${esc(st.toast)}</div>` : '';
  // Entrance animation plays only when the screen itself changes — every
  // render() call (e.g. one per keystroke while typing) replaces this whole
  // div, so an unconditional animation class replayed the fade-up on every
  // character typed (Phase 10.1 UAT finding).
  const isNewScreen = st.screen !== lastAnimatedScreen;
  if (isNewScreen && _onScreenChange) _onScreenChange(st.screen);
  lastAnimatedScreen = st.screen;
  host.innerHTML = `<div class="gud-content${isNewScreen ? ' -enter' : ''}">${screen}</div>${detail}${overlay}${modal}${toast}`;
  restoreFocus();
  syncSearchInputAria();
}

/** v1.29.0 Accessibility: wires the shared field into a real ARIA combobox
 *  pattern (role=combobox + aria-expanded/aria-controls/aria-activedescendant
 *  pointing at the listbox gudang-search-overlay.js renders) while Gudang's
 *  own dropdown owns it — listbox/option roles already existed on the rows
 *  (Phase 3), but nothing ever linked the INPUT side of that pattern. Scoped
 *  tightly (host mounted AND visible, dropdown genuinely open) and cleared
 *  the instant either stops holding, since #v2SearchInput is a SHARED
 *  element every other module also searches through — these attributes
 *  must never leak onto it once Gudang isn't the one using it. */
function syncSearchInputAria() {
  const input = document.getElementById('v2SearchInput');
  if (!input || !host || host.offsetParent === null) return;
  const open = st.search.status === 'open' && sharedSearchInputVisible();
  if (open) {
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-expanded', 'true');
    input.setAttribute('aria-controls', SEARCH_LISTBOX_ID);
    if (st.search.focusedIndex >= 0) input.setAttribute('aria-activedescendant', `gud-result-${st.search.focusedIndex}`);
    else input.removeAttribute('aria-activedescendant');
  } else {
    input.removeAttribute('role');
    input.removeAttribute('aria-expanded');
    input.removeAttribute('aria-controls');
    input.removeAttribute('aria-activedescendant');
  }
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
    // Home's search "button": focuses the real shared search field where
    // it's visible (Phase 10.1), or opens Gudang's own mobile sheet where
    // it isn't (v1.29.0 Feature 9) — openSearchEntry() decides which.
    case 'gud-search-open': openSearchEntry(); break;
    case 'gud-search-key': handleSearchKeyClick(el, c); break;
    case 'gud-result-row': handleResultFocus(el, false); break;
    case 'gud-result-chip': handleResultFocus(el, true); break;
    case 'gud-result-reveal': handleResultReveal(el); break;
    case 'gud-mobile-search-close': closeMobileSearchSheet(); break;
    case 'gud-recent-search-item': applyRecentSearchQuery(val); break;
    case 'gud-recent-search-clear': clearRecentSearches(); render(); break;
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
      if (act.startsWith('gud-asset-action-') || act.startsWith('gud-item-delete-')) { detailHandlers.onClick(st, act, el, c, render, refreshCatalog, showToast); return; }
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
  // v1.29.0 Feature 9: the mobile search sheet's own input drives the exact
  // same debounced search path the shared desktop field's adapter uses.
  if (ds.act === 'gud-mobile-search-field') { setGudangSearch(t.value); return; }
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

/** Enter-in-a-line-item-input -> the SAME confirm button a click would hit
 *  ("desktop should require almost zero mouse usage"). None of Goods Out/
 *  In/Stock Opname wrap their inputs in a <form>, so Enter did nothing
 *  before this — clicking the actual button (never reimplementing its
 *  logic here) keeps every business rule exactly where it already lived. */
const ENTER_CONFIRMS = {
  'gud-go-qty': 'gud-go-confirm-line',
  'gud-gi-qty': 'gud-gi-confirm-line',
  'gud-op-count': 'gud-op-confirm-count',
};
function onHostKeydown(e) {
  // A clickable <div role="button"> (Home's catalog cards, Analytics'
  // top-list rows, Movement History rows) must answer Enter AND Space the
  // same way a real <button> would — WAI-ARIA APG requirement for any
  // custom role="button", not optional polish.
  if ((e.key === 'Enter' || e.key === ' ') && e.target && e.target.getAttribute('role') === 'button' && e.target.dataset.act) {
    e.preventDefault();
    e.target.click();
    return;
  }
  if (e.key !== 'Enter') return;
  const ds = e.target && e.target.dataset;
  const confirmAct = ds && ENTER_CONFIRMS[ds.act];
  if (!confirmAct) return;
  e.preventDefault();
  const selector = ds.id != null ? `[data-act="${confirmAct}"][data-id="${CSS.escape(ds.id)}"]` : `[data-act="${confirmAct}"]`;
  const el = host.querySelector(selector);
  if (el && !el.disabled) el.click();
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
  // Ctrl+K focuses the real search field (Doc 2 §12, Phase 10.1) — it does
  // not open a dropdown itself; typing there is what does that, via
  // setGudangSearch (same "one box" contract every other module uses).
  // v1.29.0 Feature 7: Ctrl+F is ADDITIVE alongside it, never a replacement
  // (brief: "must not interfere with existing shortcuts") — confirmed
  // before adding this that no binding anywhere in the app already claims
  // Ctrl+F, so overriding the browser's native find-in-page here is new
  // territory, not a collision with anything else. Both route through
  // openSearchEntry() so keyboard and the visible "Cari..." button always
  // agree on what "open search" means on the current viewport (Feature 9).
  const ctrlK = (e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K');
  const ctrlF = (e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F');
  if (ctrlK || ctrlF) { e.preventDefault(); openSearchEntry(); return; }

  if (e.key === 'Escape' && st.modal) { e.preventDefault(); e.stopPropagation(); st.modal = null; render(); return; }

  // v1.28.11 ESC priority (Warehouse UX Enhancement): only one UI layer is
  // ever dismissed per press. When the Spotlight dropdown itself is open
  // (st.search.status === 'open'), it already owns Escape end-to-end via its
  // own two-stage clear-then-close reducer further below — these two
  // branches exist for the two states that reducer never covered: the
  // search field focused with NO dropdown showing (just remove focus), and
  // the Item Detail/Asset Detail drawer open with search untouched (close
  // it). Search wins when both could apply, per spec.
  if (e.key === 'Escape' && st.search.status !== 'open') {
    const searchInput = document.getElementById('v2SearchInput');
    if (searchInput && document.activeElement === searchInput) {
      e.preventDefault(); e.stopPropagation();
      searchInput.blur();
      return;
    }
    if (st.detail) {
      e.preventDefault(); e.stopPropagation();
      st.detail = null;
      render();
      return;
    }
  }

  // Ctrl+Enter — save the whole batch (Doc 2 §12: scoped to Goods In/Out/
  // Stock Opname, "not just the current line") — from anywhere in the flow.
  const ctrlEnter = (e.ctrlKey || e.metaKey) && e.key === 'Enter';
  if (ctrlEnter && st.search.status !== 'open') {
    if (st.screen === 'goodsOut') { e.preventDefault(); goodsOutHandlers.trySave(st, ctx(), render, refreshCatalog); return; }
    if (st.screen === 'goodsIn') { e.preventDefault(); goodsInHandlers.trySave(st, ctx(), render, refreshCatalog); return; }
    if (st.screen === 'opname') { e.preventDefault(); opnameHandlers.trySave(st, ctx(), render, refreshCatalog); return; }
  }

  if (st.search.status !== 'open') return;
  // v1.29.0 root-cause fix: this used to forward Arrow/Enter/Tab to the
  // session reducer whenever st.search.status === 'open', regardless of
  // WHERE focus actually was. That was a latent gap even before v1.29.0.
  // Feature 6 (Recent Searches keeps an empty dropdown open instead of
  // closing it) made it trivial to hit: with the dropdown open but focus on
  // some OTHER control (e.g. Home's own "Cari..." button), a plain Enter
  // press hit this capture-phase listener FIRST, got preventDefault()'d
  // here (silently no-op'd by the reducer, since focusedIndex is -1 with
  // zero results), and the render() below then destroyed that still-
  // focused button by regenerating host.innerHTML — dropping focus to
  // document.body (gudang-ui-interaction-check.mjs caught this exact
  // regression). Arrow/Enter/Tab only ever belong to the search box
  // itself; Escape is left able to close an open dropdown from anywhere,
  // which is the one case where "state says open" alone is the right test.
  const searchInputHasFocus = document.activeElement != null && (
    document.activeElement.id === 'v2SearchInput'
    || document.activeElement.dataset?.act === 'gud-mobile-search-field'
  );
  if (e.key !== 'Escape' && !searchInputHasFocus) return;
  if (!['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(e.key)) return;
  // Enter inside the query input still submits the form otherwise (Tab moves
  // focus) — both are meaningful only inside the Spotlight, so prevent default.
  e.preventDefault();
  // Phase 10.4.1 root cause ("Esc closes immediately" instead of Spotlight's
  // clear-then-close): #v2SearchInput has its OWN generic Escape listener
  // (js/app.js, registered directly on the input, bubble/at-target phase)
  // that unconditionally clears the value and closes whatever dropdown is
  // open — it always fired right after this capture-phase handler and
  // stomped on the two-stage result the session-engine had just decided.
  // stopPropagation() keeps this key event from ever reaching that second
  // listener once Gudang's own reducer has claimed it.
  e.stopPropagation();
  const { state, intent } = applySessionEvent(st.search, { type: 'key', key: e.key });
  st.search = state;
  // Phase 10.4.2 root cause ("results disappear, query text remains"): the
  // reducer above already clears state.query correctly on Escape — but the
  // visible textbox is #v2SearchInput, a shared element gudang-center.js's
  // own render() never touches (it only writes host.innerHTML). Clearing
  // it used to be a SIDE EFFECT of js/app.js's generic Escape listener —
  // the one Phase 10.4.1's stopPropagation() fix (correctly) stops from
  // ever running once this handler claims the key. That fix closed one gap
  // and opened this one: nothing was left to clear the actual textbox.
  // Syncing it here, to whatever the reducer just decided query should be,
  // makes this handler fully own Escape's visible effect end to end,
  // rather than depending on a side effect of a listener it deliberately
  // silences.
  if (e.key === 'Escape') {
    // v1.29.0: syncVisibleSearchInputs() covers both possible textboxes now
    // (the shared field AND the mobile sheet's own input) — see that
    // function's own comment for why syncing both unconditionally is safe.
    syncVisibleSearchInputs(state.query);
    const clearBtn = document.getElementById('v2SearchClear');
    if (clearBtn && !state.query) clearBtn.style.display = 'none';
  }
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
  // v1.29.0 Feature 6: recorded here, the one chokepoint every committed
  // search (Enter, a clicked row, a tapped action chip) already funnels
  // through — never on every keystroke, only on an actual, intentional
  // "I searched for this and opened something" commit. Must read
  // st.search.query BEFORE the 'close' event below resets it to ''.
  if (st.search.query) addRecentSearch(st.search.query);
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
