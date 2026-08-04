/* ============================================================
   GUDANG-SEARCH-OVERLAY.JS — Universal Search results dropdown
   (Doc 2 §05/§12, Doc 3 Ch.08)

   Phase 10.1 redesign: this no longer owns its own input box. The query
   comes from the shared topbar #v2SearchInput every other module already
   searches through (Ctrl+K focuses that field directly — gudang-center.js
   handles that, not this file); this is now purely the results dropdown
   that appears anchored underneath it. Previously a second, duplicate
   input lived here inside a full-screen scrim, which — combined with a CSS
   bug that pinned it to the top-right corner — read as a disruptive
   floating panel rather than "the search box showing suggestions."

   v1.29.0 (Warehouse Search & Discovery) added a SECOND presentation,
   renderMobileSearchSheet() below, for viewports where the shared topbar
   field is CSS-hidden (confirmed <1280px, platform.css) — a full-screen,
   Gudang-owned sheet with its own input, so mobile/tablet finally have a
   working search entry point at all. Both presentations render the exact
   SAME session state through the exact same searchDropdownBody() — only
   the surrounding chrome (anchored floating card vs. full-screen sheet)
   differs, so ranking/highlighting/recent-searches/empty-state never need
   to be built (or debugged) twice.

   Pure presentation over search-session-engine.js's state — every
   keystroke/arrow/enter/tab/esc is already decided by that reducer
   (js/gudang/ui/gudang-center.js drives it); this file only renders
   whatever state comes back (Doc 4 Art.V: "a screen displays a decision,
   it does not make one"). Result rows use the SAME aria-activedescendant
   highlighting convention as js/pbsi-select.js so the interaction feels
   native to the app, not invented.
   ============================================================ */

'use strict';

import { esc, icon, kbdRow, highlightMatch } from './gudang-atoms.js';
import { ACTION_OWNERSHIP } from '../search/action-resolver.js';
import { getRecentSearches } from '../search/recent-searches-store.js';

const DOMAIN_ICON = { item: 'box', location: 'pin', department: 'users', asset: 'tag' };
const DOMAIN_LABEL = { item: 'Item', location: 'Lokasi', department: 'Bidang', asset: 'Aset' };

/** The listbox id both presentations render, so gudang-center.js can point
 *  the real input's aria-controls/aria-activedescendant at it regardless of
 *  which chrome is currently on screen. */
export const SEARCH_LISTBOX_ID = 'gud-spotlight-listbox';

/** Shared guts: Recent Searches (query empty, focused, has history) / hint
 *  (query empty, no history) / results list / "no results, add as new item"
 *  empty state. Used by both the desktop dropdown and the mobile sheet —
 *  see this file's header for why that matters. */
function searchDropdownBody(st, s) {
  if (!s.query) {
    const recent = getRecentSearches();
    if (!recent.length) {
      return `<div class="gud-spotlight-hint">${icon('search', { size: 16, tone: 'text-faint' })} Ketik untuk mencari item, lokasi, atau bidang…</div>`;
    }
    return `<div class="gud-recent-searches">
      <div class="gud-recent-searches-head">
        <span>Pencarian Terakhir</span>
        <button type="button" class="gud-link-btn" data-act="gud-recent-search-clear">Hapus Riwayat</button>
      </div>
      ${recent.map((q) => `
        <button type="button" class="gud-recent-search-row" data-act="gud-recent-search-item" data-val="${esc(q)}">
          ${icon('history', { size: 14, tone: 'text-faint' })}
          <span class="gud-recent-search-label">${esc(q)}</span>
        </button>`).join('')}
    </div>`;
  }
  if (s.results.length) {
    const rows = s.results.map((r, i) => resultRow(r, i, s)).join('');
    return `<div class="gud-spotlight-results" role="listbox" id="${SEARCH_LISTBOX_ID}">${rows}</div>`;
  }
  // Phase 10.1 Part 9: "Search resolves into action" (Doc 1) applied to
  // Add Item's own discovery — searching for something that doesn't
  // exist yet IS the moment to offer creating it, not a dead end.
  return `<div class="gud-spotlight-hint -column">
      <div>${icon('search', { size: 16, tone: 'text-faint' })} Tidak ada hasil untuk "${esc(s.query)}".</div>
      <button type="button" class="gud-link-btn" data-act="gud-cat-add-item-search" data-val="${esc(s.query)}">${icon('plus', { size: 12 })} Tambah "${esc(s.query)}" sebagai item baru</button>
    </div>`;
}

const KEYBOARD_FOOT = `<div class="gud-spotlight-foot">
  <span class="gud-hint">${kbdRow(['↑', '↓'])} pilih</span>
  <span class="gud-hint">${kbdRow(['Enter'])} buka</span>
  <span class="gud-hint">${kbdRow(['Tab'])} aksi lain</span>
  <span class="gud-hint">${kbdRow(['Esc'])} tutup</span>
</div>`;

/**
 * @param {*} st
 * @param {*} _c
 * @param {?{top:number,left:number,width:number}} anchorRect — the real
 *   topbar search input's getBoundingClientRect(); gudang-center.js passes
 *   this so the dropdown always tracks wherever that shared field actually
 *   is, on any layout/viewport, instead of a hardcoded position.
 */
export function renderSearchOverlay(st, _c, anchorRect) {
  const s = st.search;
  const style = anchorRect
    ? (() => {
        const width = Math.min(Math.max(anchorRect.width, 320), (typeof window !== 'undefined' ? window.innerWidth : 1280) - anchorRect.left - 16);
        return `top:${Math.round(anchorRect.bottom + 8)}px;left:${Math.round(anchorRect.left)}px;width:${Math.round(width)}px;`;
      })()
    : 'top:64px;left:24px;width:360px;';

  return `<div class="gud-scrim gud-spotlight-scrim -open" data-act="gud-scrim">
    <div class="gud-spotlight" style="${style}">
      ${searchDropdownBody(st, s)}
      ${KEYBOARD_FOOT}
    </div>
  </div>`;
}

/** Mobile/tablet presentation (v1.29.0 Feature 9): a full-screen, Gudang-
 *  owned sheet with its OWN input — the shared topbar field is CSS-hidden
 *  below 1280px (platform.css), so this is the only working search entry
 *  point on those viewports, not a cosmetic variant of the desktop dropdown.
 *  Same session state, same searchDropdownBody() — see this file's header. */
export function renderMobileSearchSheet(st, _c) {
  const s = st.search;
  return `<div class="gud-mobile-search-sheet">
    <div class="gud-mobile-search-head">
      <span class="gud-mobile-search-ic">${icon('search', { size: 18, tone: 'text-faint' })}</span>
      <input type="search" class="gud-mobile-search-input" data-act="gud-mobile-search-field"
        placeholder="Cari item, lokasi, aset…" value="${esc(s.query)}"
        autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"
        role="combobox" aria-expanded="true" aria-controls="${SEARCH_LISTBOX_ID}" aria-autocomplete="list" />
      <button type="button" class="gud-icon-btn" data-act="gud-mobile-search-close" aria-label="Tutup" title="Tutup">${icon('close', { size: 16 })}</button>
    </div>
    <div class="gud-mobile-search-body">${searchDropdownBody(st, s)}</div>
  </div>`;
}

function resultRow(result, index, s) {
  const focused = index === s.focusedIndex;
  const revealed = focused && s.actionFocusIndex != null;
  const domainIcon = DOMAIN_ICON[result.ownerDomain] || 'box';
  const hasSecondary = result.actions.length > 1;
  // Desktop: chips show once Tab reveals them (or always, if there's more
  // than one action, matching the Spotlight's own affordance discovery).
  // Mobile (Doc 2 §05: "one tap primary action... chevron for secondary"):
  // a chevron toggles the SAME reveal state Tab already drives on desktop —
  // one reducer owns "revealed," not a second UI-only flag.
  const chips = hasSecondary || revealed ? actionChips(result, index, s) : '';
  const chevron = hasSecondary
    ? `<button type="button" class="gud-spotlight-chevron" data-act="gud-result-reveal" data-index="${index}" aria-label="Aksi lain" title="Aksi lain">${icon('chevron-right', { size: 14 })}</button>`
    : '';
  return `<div class="gud-spotlight-row${focused ? ' -focused' : ''}${revealed ? ' -revealed' : ''}" id="gud-result-${index}"
       role="option" aria-selected="${focused}" data-act="gud-result-row" data-index="${index}">
    <span class="gud-spotlight-row-ic">${icon(domainIcon, { size: 16 })}</span>
    <span class="gud-spotlight-row-main">
      <span class="gud-spotlight-row-label">${highlightMatch(result.label, s.query)}</span>
      <span class="gud-spotlight-row-domain">${esc(DOMAIN_LABEL[result.ownerDomain] || result.ownerDomain)}</span>
    </span>
    ${result.hint ? `<span class="gud-spotlight-row-hint">${esc(result.hint)}</span>` : ''}
    ${chips}
    ${chevron}
  </div>`;
}

function actionChips(result, rowIndex, s) {
  return `<span class="gud-spotlight-row-actions">${result.actions.map((actionId, ai) => {
    const owner = ACTION_OWNERSHIP[actionId];
    const activeChip = rowIndex === s.focusedIndex && s.actionFocusIndex === ai;
    return `<span class="gud-spotlight-chip${activeChip ? ' -focused' : ''}${owner && !owner.available ? ' -dormant' : ''}"
      data-act="gud-result-chip" data-index="${rowIndex}" data-action-id="${esc(actionId)}"
      title="${owner && !owner.available ? 'Belum tersedia' : ''}">${esc(owner ? owner.label : actionId)}</span>`;
  }).join('')}</span>`;
}
