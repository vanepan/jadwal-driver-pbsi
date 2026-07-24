/* ============================================================
   GUDANG-SEARCH-OVERLAY.JS — Universal Search / Spotlight overlay
   (Doc 2 §05/§12, Doc 3 Ch.08)

   Pure presentation over search-session-engine.js's state — every
   keystroke/arrow/enter/tab/esc is already decided by that reducer
   (js/gudang/ui/gudang-center.js drives it); this file only renders
   whatever state comes back (Doc 4 Art.V: "a screen displays a decision,
   it does not make one"). Result rows use the SAME aria-activedescendant
   highlighting convention as js/pbsi-select.js so the interaction feels
   native to the app, not invented.
   ============================================================ */

'use strict';

import { esc, icon, kbdRow } from './gudang-atoms.js';
import { ACTION_OWNERSHIP } from '../search/action-resolver.js';

const DOMAIN_ICON = { item: 'box', location: 'pin', department: 'users', asset: 'tag' };
const DOMAIN_LABEL = { item: 'Item', location: 'Lokasi', department: 'Departemen', asset: 'Aset' };

export function renderSearchOverlay(st, _c) {
  const s = st.search;
  const rows = s.results.map((r, i) => resultRow(r, i, s)).join('');
  const body = !s.query
    ? `<div class="gud-spotlight-hint">${icon('search', { size: 16, tone: 'text-faint' })} Ketik untuk mencari item, lokasi, atau departemen…</div>`
    : (s.results.length
      ? `<div class="gud-spotlight-results" role="listbox">${rows}</div>`
      : `<div class="gud-spotlight-hint">Tidak ada hasil untuk "${esc(s.query)}".</div>`);

  return `<div class="gud-scrim gud-spotlight-scrim -open" data-act="gud-scrim">
    <div class="gud-spotlight">
      <div class="gud-spotlight-bar">
        ${icon('search', { size: 18, tone: 'text-faint' })}
        <input class="gud-spotlight-input" data-act="gud-search-input" type="text" value="${esc(s.query)}"
               placeholder="Cari item, lokasi, aset…" autocomplete="off" autofocus />
        <button type="button" class="gud-icon-btn -sm" data-act="gud-search-close" aria-label="Tutup">${icon('close', { size: 15 })}</button>
      </div>
      ${body}
      <div class="gud-spotlight-foot">
        <span class="gud-hint">${kbdRow(['↑', '↓'])} pilih</span>
        <span class="gud-hint">${kbdRow(['Enter'])} buka</span>
        <span class="gud-hint">${kbdRow(['Tab'])} aksi lain</span>
        <span class="gud-hint">${kbdRow(['Esc'])} tutup</span>
      </div>
    </div>
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
    ? `<button type="button" class="gud-spotlight-chevron" data-act="gud-result-reveal" data-index="${index}" aria-label="Aksi lain">${icon('chevron-right', { size: 14 })}</button>`
    : '';
  return `<div class="gud-spotlight-row${focused ? ' -focused' : ''}${revealed ? ' -revealed' : ''}" id="gud-result-${index}"
       role="option" aria-selected="${focused}" data-act="gud-result-row" data-index="${index}">
    <span class="gud-spotlight-row-ic">${icon(domainIcon, { size: 16 })}</span>
    <span class="gud-spotlight-row-main">
      <span class="gud-spotlight-row-label">${esc(result.label)}</span>
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
