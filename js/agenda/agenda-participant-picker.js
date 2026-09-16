/* ============================================================
   agenda-participant-picker.js — pure render functions for the
   participant/PIC (events) and responsible (tasks) picker
   (V1.31 Agenda & To-Do, Phase C3)

   PURE HTML builders only — no DOM side effects, no Firebase. Rendered
   as an IN-PLACE swap of the host drawer's body (js/components/drawer.js
   is explicitly single-instance — confirmed by reading its source this
   phase — so a second STACKED drawer is not an option; this is the
   documented reason the picker is a body-swap, not a nested drawer).

   Two modes:
     'participant' — events. selected = {username: {isPic: boolean}}.
                      Borrows the checkbox-square + full-row-click +
                      Select-All/Clear visual idiom already established
                      by Overtime's employee-rekap grid and Petty Cash's
                      transaction multi-select (Phase A §11's own finding
                      — no compact picker precedent exists, so this reuses
                      the closest local idiom rather than inventing a new
                      visual language).
     'responsible' — tasks. selected = {username: true}. No PIC concept
                      (tasks have no participant/PIC distinction per the
                      approved C1 data model) — the PIC-toggle chip is
                      simply omitted in this mode.
   ============================================================ */

'use strict';

// SS9 R1 — pure, zero-import (safe alongside this file's own "no DOM, no
// Firebase" contract).
import { agendaIdentityColorVar, buildAgendaIdentityColorMap } from './agenda-identity-colors.js';

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** One candidate row — extracted so the grouped renderer below and any
 *  future ungrouped caller share the exact same row markup. */
function pickerRowHTML(c, selected, mode, colorMap) {
  const sel = selected[c.username];
  const isSelected = Boolean(sel);
  const isPic = mode === 'participant' && sel && sel.isPic === true;
  const scopeTag = c.scope === 'kabid' ? '<span class="cal-pill cal-pill--kabid">Kabid</span>' : '';
  const picToggle = mode === 'participant'
    ? `<button type="button" class="cal-picker-pic-toggle" aria-pressed="${isPic}" data-drawer-action="picker:togglepic:${esc(c.username)}" ${isSelected ? '' : 'disabled'}>PIC</button>`
    : '';
  const dot = `<span class="cal-identity-dot" style="background:${agendaIdentityColorVar(c.username, colorMap)}" aria-hidden="true"></span>`;
  return `
    <div class="cal-picker-row${isSelected ? ' cal-picker-row--selected' : ''}" data-drawer-action="picker:toggle:${esc(c.username)}" role="checkbox" aria-checked="${isSelected}" tabindex="0">
      <span class="cal-picker-check" aria-hidden="true">${isSelected ? '&#10003;' : ''}</span>
      ${dot}
      <span class="cal-picker-name">${esc(c.displayName)}</span>
      ${scopeTag}
      ${picToggle}
    </div>`;
}

/**
 * @param {Object} opts
 * @param {Array<{username,displayName,scope}>} opts.candidates
 * @param {Object} opts.selected
 * @param {'participant'|'responsible'} opts.mode
 * @param {string} [opts.query] current search-filter text
 */
export function renderPickerHTML({ candidates, selected, mode, query = '' }) {
  const q = query.trim().toLowerCase();
  const filtered = q ? candidates.filter((c) => c.displayName.toLowerCase().includes(q)) : candidates;
  // SS9 R1 — built once from the FULL (unfiltered) roster so a color never
  // shifts as the search query narrows the visible list.
  const colorMap = buildAgendaIdentityColorMap(candidates);

  // Grouped by scope (SARPRAS / KABID & UNDANGAN) — purely a rendering
  // concern over the SAME data-driven `candidates` array
  // (agenda-directory.js#getAgendaCandidates() already tags each entry
  // with its scope; no new classification, no hardcoded names). Search
  // filters BEFORE grouping, so "Leo"/"Kabid" both still work regardless
  // of which group they land in. A group with nothing in it (e.g. no
  // Kabid Custom Role configured yet, or a search query that matches
  // nothing in that group) is omitted entirely rather than shown empty.
  const sarpras = filtered.filter((c) => c.scope === 'sarpras_shared');
  const kabid = filtered.filter((c) => c.scope === 'kabid');
  const other = filtered.filter((c) => c.scope !== 'sarpras_shared' && c.scope !== 'kabid');
  const group = (label, list) => (list.length
    ? `<div class="cal-picker-group"><div class="cal-picker-group-label">${esc(label)}</div>${list.map((c) => pickerRowHTML(c, selected, mode, colorMap)).join('')}</div>`
    : '');
  const rows = (sarpras.length || kabid.length || other.length)
    ? `${group('SARPRAS', sarpras)}${group('KABID / UNDANGAN', kabid)}${other.map((c) => pickerRowHTML(c, selected, mode, colorMap)).join('')}`
    : `<div class="cal-empty"><div class="cal-empty-sub">Tidak ada nama yang cocok.</div></div>`;

  return `
    <input type="search" class="cal-picker-search" placeholder="Cari nama…" value="${esc(query)}" data-field="pickerQuery" data-live-filter="1" autocomplete="off">
    <div class="cal-picker-bulk">
      <button type="button" class="cal-btn cal-btn--sm cal-btn--ghost" data-drawer-action="picker:selectall">Pilih Semua</button>
      <button type="button" class="cal-btn cal-btn--sm cal-btn--ghost" data-drawer-action="picker:clear">Kosongkan</button>
      <span style="flex:1"></span>
      <button type="button" class="cal-btn cal-btn--primary cal-btn--sm" data-drawer-action="picker:done">Selesai</button>
    </div>
    <div class="cal-picker-list">${rows}</div>`;
}

/**
 * Compact chip row shown INSIDE the main form (not the picker itself) —
 * summarizes the current selection with a remove [x] per chip.
 * @param {Array<{username,displayName}>} candidates
 * @param {Object} selected
 * @param {'participant'|'responsible'} mode
 */
export function renderPersonChipsHTML(candidates, selected, mode) {
  const byUsername = new Map(candidates.map((c) => [c.username, c]));
  const entries = Object.keys(selected || {});
  if (!entries.length) return `<div class="cal-form-hint">Belum ada yang dipilih.</div>`;
  const colorMap = buildAgendaIdentityColorMap(candidates);
  return `<div class="cal-chiprow">${entries.map((username) => {
    const c = byUsername.get(username);
    const name = c ? c.displayName : username;
    const isPic = mode === 'participant' && selected[username] && selected[username].isPic === true;
    const dot = `<span class="cal-identity-dot cal-identity-dot--sm" style="background:${agendaIdentityColorVar(username, colorMap)}" aria-hidden="true"></span>`;
    return `<span class="cal-person-chip${isPic ? ' cal-person-chip--pic' : ''}">${dot}${esc(name)}${isPic ? ' · PIC' : ''}<button type="button" aria-label="Hapus ${esc(name)}" data-drawer-action="picker:remove:${esc(username)}">&times;</button></span>`;
  }).join('')}</div>`;
}
