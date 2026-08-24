/* ============================================================
   COMMAND PALETTE (domainShellV1) — Redesign Phase 1
   ============================================================

   Genuinely new capability (the whole-product audit confirmed no global
   cross-domain search exists anywhere — the only Ctrl/Cmd+K binding in the
   app is inside gudang-center.js, and it's document-global today, scoped
   to focusing the ONE shared #v2SearchInput regardless of which module is
   active). To avoid a fragile race between two document-level keydown
   handlers (and to leave that existing, subtly-coupled behavior completely
   untouched), this palette is deliberately CLICK-TRIGGERED ONLY in this
   phase — a small button in the topbar, not a keyboard shortcut. Wiring an
   actual global shortcut is a separately-scoped decision (which key, and
   how it should interact with Gudang's existing Ctrl+K) — documented here
   as a disclosed deferral, not silently dropped.

   Data source: driver/vehicle/assignment state that's already resident in
   memory (passed in as read-only accessor functions) — no new Firebase
   reads. Selecting a result routes through domain-shell.js's goToScreen()
   and the real openDetailModal() from js/modal.js — never re-implements
   navigation or rendering.
   ============================================================ */

import { anIcon } from '../analytics/analytics-shell.js';
import { prefersReducedMotion } from '../components/motion-tokens.js';

'use strict';

let cfg = null;
let overlayEl = null;
let inputEl = null;
let resultsEl = null;
let triggerEl = null;
// Phase 8.1 — true only for the render() immediately after an open();
// gates the result-list entrance stagger so it plays once per open, not
// on every keystroke re-render (the same replay anti-pattern already
// fixed elsewhere in this codebase, e.g. Gudang's lastAnimatedScreen
// guard). Reset in both open() and close() so the NEXT open() (not just
// a page reload) always gets a fresh stagger.
let staggerNext = true;

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function computeResults(query) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const out = [];

  for (const d of cfg.getDrivers()) {
    const name = d.name || d.nama || '';
    if (name.toLowerCase().includes(q)) {
      out.push({
        type: 'Driver', label: name, sub: d.phone || d.telepon || '',
        onClick: () => { close(); cfg.goToScreen('operations', 'drivers'); },
      });
    }
  }
  for (const v of cfg.getVehicles()) {
    const name = v.name || v.nama || '';
    if (name.toLowerCase().includes(q)) {
      out.push({
        type: 'Kendaraan', label: name, sub: v.type || v.jenis || '',
        onClick: () => { close(); cfg.goToScreen('operations', 'vehicles'); },
      });
    }
  }
  for (const a of cfg.getAssignments()) {
    const tujuan = a.tujuan || a.destination || '';
    const hay = `${tujuan} ${a.driver || ''} ${a.vehicle || ''}`.toLowerCase();
    if (hay.includes(q)) {
      out.push({
        type: 'Jadwal', label: tujuan || '(tanpa tujuan)', sub: `${a.driver || ''} · ${a.vehicle || ''}`.trim(),
        onClick: () => {
          close();
          cfg.goToScreen('operations', 'board');
          if (a.id != null) cfg.openDetailModal(a.id);
        },
      });
    }
  }
  return out.slice(0, 30);
}

function render(query) {
  const items = computeResults(query);
  if (!query.trim()) {
    resultsEl.innerHTML = '<div class="domshell-palette-empty">Ketik untuk mencari driver, kendaraan, atau jadwal.</div>';
    return;
  }
  if (!items.length) {
    resultsEl.innerHTML = '<div class="domshell-palette-empty">Tidak ada hasil.</div>';
    return;
  }
  // Phase 8.1 — stagger only the render() right after open(); typing
  // (which re-renders on every keystroke) never replays it.
  const stagger = staggerNext && !prefersReducedMotion();
  staggerNext = false;
  resultsEl.innerHTML = items.map((r, i) => `
    <button type="button" class="domshell-palette-item${stagger ? ' domshell-palette-item--enter' : ''}" data-idx="${i}">
      <span class="domshell-palette-item-type">${escapeHtml(r.type)}</span>
      <span class="domshell-palette-item-text">
        <span class="domshell-palette-item-label">${escapeHtml(r.label)}</span>
        <span class="domshell-palette-item-sub">${escapeHtml(r.sub)}</span>
      </span>
    </button>
  `).join('');
  resultsEl.querySelectorAll('.domshell-palette-item').forEach((btn) => {
    btn.addEventListener('click', () => items[Number(btn.dataset.idx)]?.onClick());
  });
}

function open() {
  if (!overlayEl) return;
  overlayEl.style.display = 'flex';
  // Phase 8.1 — the box's entrance animation (v2FadeInScale) is applied
  // via a class selector, not toggled; a display:none↔flex cycle on this
  // ancestor does NOT restart it on its own (verified empirically — the
  // underlying Animation object survives and its currentTime keeps
  // advancing while hidden, so a quick reopen shows it partway/finished
  // instead of replaying from 0). Force a fresh run with the same
  // reflow-restart idiom already used in js/app.js for the analytics
  // deep-panel replay.
  const box = overlayEl.querySelector('.domshell-palette-box');
  if (box) { box.style.animation = 'none'; void box.offsetWidth; box.style.animation = ''; }
  inputEl.value = '';
  staggerNext = true;
  render('');
  setTimeout(() => inputEl.focus(), 0);
  document.addEventListener('keydown', onKeydown, true);
}

function close() {
  if (!overlayEl) return;
  overlayEl.style.display = 'none';
  staggerNext = true;
  document.removeEventListener('keydown', onKeydown, true);
}

function onKeydown(e) {
  if (e.key === 'Escape') { e.preventDefault(); close(); }
}

/**
 * @param {object} c
 * @param {()=>Array} c.getDrivers
 * @param {()=>Array} c.getVehicles
 * @param {()=>Array} c.getAssignments
 * @param {(domainId:string, topId:string)=>boolean} c.goToScreen - from domain-shell.js
 * @param {(id:string)=>void} c.openDetailModal - real function from js/modal.js
 * @param {HTMLElement} c.topbarSearchEl - existing .v2-topbar-search element, trigger inserted right after it
 */
export function initCommandPalette(c) {
  cfg = c;

  triggerEl = document.createElement('button');
  triggerEl.type = 'button';
  triggerEl.className = 'domshell-palette-trigger';
  triggerEl.setAttribute('aria-label', 'Cari cepat di seluruh workspace');
  triggerEl.innerHTML = `${anIcon('search', { size: 14, stroke: 1.8 })}<span>Cari Cepat</span>`;
  triggerEl.addEventListener('click', open);
  if (cfg.topbarSearchEl && cfg.topbarSearchEl.parentElement) {
    cfg.topbarSearchEl.parentElement.insertBefore(triggerEl, cfg.topbarSearchEl.nextSibling);
  } else {
    // Defensive fallback — should not happen given the documented call
    // ordering (after initV2Topbar()), but never leave the trigger
    // un-mounted and un-clickable with no visible failure.
    document.querySelector('.v2-topbar')?.appendChild(triggerEl);
  }

  overlayEl = document.createElement('div');
  overlayEl.className = 'domshell-palette-overlay';
  overlayEl.style.display = 'none';
  overlayEl.innerHTML = `
    <div class="domshell-palette-box">
      <div class="domshell-palette-inputwrap">
        <input type="text" class="domshell-palette-input" placeholder="Cari driver, kendaraan, jadwal..." />
      </div>
      <div class="domshell-palette-results"></div>
    </div>
  `;
  document.body.appendChild(overlayEl);
  overlayEl.addEventListener('click', (e) => { if (e.target === overlayEl) close(); });

  inputEl = overlayEl.querySelector('.domshell-palette-input');
  resultsEl = overlayEl.querySelector('.domshell-palette-results');
  inputEl.addEventListener('input', () => render(inputEl.value));
}
