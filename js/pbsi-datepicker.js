/* ============================================================
   PBSI-DATEPICKER.JS — Custom Date Picker Component v1.4.1

   Architecture
   ────────────
   The native <input type="date"> stays in the DOM, hidden
   (display:none). It remains the authoritative form value source.
   All existing code that reads/writes .value or listens to
   'change' on the native input works unchanged.

   A trigger <button> and optional preset strip <div> are placed
   after the native input inside a .pbsi-datepicker wrapper.
   Flatpickr attaches to the hidden native input and is opened
   programmatically via fp.open(). Its calendar panel is appended
   to document.body (z-index 360) to escape modal stacking contexts.

   Public API
   ──────────
   initPbsiDatepicker(inputEl, opts)  — wrap one native date input
     opts.presets: Array<{label, getValue?, openCalendar?}>
                   Omit or [] to render only the trigger (no strip).

   syncPbsiDatepicker(inputEl)        — re-read inputEl.value,
                                        update trigger display and
                                        preset active states.
                                        Call after any external
                                        .value write.
   ============================================================ */

'use strict';

import { todayString, offsetDate } from './utils.js';

/** @type {WeakMap<HTMLInputElement, object>} */
const _registry = new WeakMap();

/* ── Indonesian locale (inline — no separate locale file needed) */
const _MONTHS_ID  = ['Jan','Feb','Mar','Apr','Mei','Jun',
                     'Jul','Agu','Sep','Okt','Nov','Des'];
const _WEEKDAY_ID = ['Min','Sen','Sel','Rab','Kam','Jum','Sab'];

const _ID_LOCALE = {
  firstDayOfWeek: 1,
  weekdays: {
    shorthand: _WEEKDAY_ID,
    longhand: ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'],
  },
  months: {
    shorthand: _MONTHS_ID,
    longhand: ['Januari','Februari','Maret','April','Mei','Juni',
               'Juli','Agustus','September','Oktober','November','Desember'],
  },
};

const _CALENDAR_SVG = `<svg class="pbsi-datepicker-icon" width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
  <rect x="1.5" y="3.5" width="13" height="11" rx="1.5" stroke="currentColor" stroke-width="1.5"/>
  <path d="M1.5 7.5h13" stroke="currentColor" stroke-width="1.5"/>
  <path d="M5 1.5v3M11 1.5v3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
</svg>`;

/* ── Public: init ─────────────────────────────────────────── */

/**
 * @param {HTMLInputElement} inputEl
 * @param {{ presets?: Array<{label:string, getValue?:()=>string, openCalendar?:boolean}> }} opts
 */
export function initPbsiDatepicker(inputEl, opts = {}) {
  if (!inputEl || _registry.has(inputEl)) return;

  const presets = Array.isArray(opts.presets) ? opts.presets : [];

  // 1. Wrapper — takes the input's layout slot
  const wrapper = document.createElement('div');
  wrapper.className = 'pbsi-datepicker';
  inputEl.parentNode.insertBefore(wrapper, inputEl);
  wrapper.appendChild(inputEl);

  // 2. Preset strip (optional)
  let presetsEl = null;
  if (presets.length > 0) {
    presetsEl = document.createElement('div');
    presetsEl.className = 'pbsi-datepicker-presets';
    wrapper.appendChild(presetsEl);
  }

  // 3. Trigger button
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'pbsi-datepicker-trigger';
  trigger.setAttribute('aria-haspopup', 'dialog');
  trigger.setAttribute('autocomplete', 'off');

  const displaySpan = document.createElement('span');
  displaySpan.className = 'pbsi-datepicker-display';

  trigger.insertAdjacentHTML('afterbegin', _CALENDAR_SVG);
  trigger.appendChild(displaySpan);
  wrapper.appendChild(trigger);

  // 4. Hide native input
  inputEl.style.display = 'none';

  // 5. Instance record
  const inst = { inputEl, wrapper, trigger, displaySpan, presetsEl, presets, fp: null };
  _registry.set(inputEl, inst);

  // 6. Build preset buttons
  _buildPresets(inst);
  _updateTrigger(inst);

  // 7. Init Flatpickr (calendar backend)
  _initFlatpickr(inst);

  // 8. Trigger click — open calendar
  trigger.addEventListener('click', () => { if (inst.fp) inst.fp.open(); });
  trigger.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (inst.fp) inst.fp.open(); }
  });
}

/* ── Public: sync ─────────────────────────────────────────── */

/**
 * Re-reads inputEl.value and refreshes the trigger display and
 * preset active states. Call after any external .value write:
 *   inputEl.value = 'YYYY-MM-DD';
 *   syncPbsiDatepicker(inputEl);
 */
export function syncPbsiDatepicker(inputEl) {
  const inst = _registry.get(inputEl);
  if (!inst) return;
  if (inst.fp) inst.fp.setDate(inputEl.value || null, false);
  _updateTrigger(inst);
}

/* ── Private: preset buttons ──────────────────────────────── */

function _buildPresets(inst) {
  if (!inst.presetsEl) return;
  inst.presetsEl.innerHTML = '';

  inst.presets.forEach(preset => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pbsi-datepicker-preset';
    btn.textContent = preset.label;
    btn.dataset.label = preset.label;

    if (preset.openCalendar) {
      btn.addEventListener('click', () => { if (inst.fp) inst.fp.open(); });
    } else {
      btn.addEventListener('click', () => {
        try {
          const v = typeof preset.getValue === 'function' ? preset.getValue() : null;
          if (v) _pick(inst, v);
        } catch (_) {}
      });
    }
    inst.presetsEl.appendChild(btn);
  });
}

/* ── Private: value write ─────────────────────────────────── */

function _pick(inst, value) {
  inst.inputEl.value = value;
  if (inst.fp) inst.fp.setDate(value, false);  // sync Flatpickr without double-dispatch
  inst.inputEl.dispatchEvent(new Event('change', { bubbles: true }));
  inst.inputEl.dispatchEvent(new Event('input',  { bubbles: true }));
  _updateTrigger(inst);
}

/* ── Private: Flatpickr init ──────────────────────────────── */

function _initFlatpickr(inst) {
  if (typeof flatpickr === 'undefined') {
    console.warn('[PBSI Datepicker] flatpickr not found — calendar disabled');
    return;
  }

  inst.fp = flatpickr(inst.inputEl, {
    appendTo: document.body,
    // positionElement: use the visible trigger button, not the hidden native input.
    // inputEl has display:none → getBoundingClientRect() returns all zeros → calendar
    // would appear at top-left of viewport. trigger has correct viewport coordinates.
    positionElement: inst.trigger,
    // disableMobile: true — Flatpickr's setupMobile() creates a new <input> inside
    // our wrapper that conflicts with the PBSI layout. Flatpickr's calendar is
    // touch-optimized and works well on mobile. Preset buttons cover the most
    // common mobile selections without needing the calendar.
    disableMobile: true,
    dateFormat: 'Y-m-d',
    defaultDate: inst.inputEl.value || null,
    locale: _ID_LOCALE,
    allowInput: false,
    onChange(_dates, dateStr) {
      if (!dateStr) return;
      // Flatpickr already wrote dateStr to inputEl.value — dispatch events + refresh UI
      inst.inputEl.dispatchEvent(new Event('change', { bubbles: true }));
      inst.inputEl.dispatchEvent(new Event('input',  { bubbles: true }));
      _updateTrigger(inst);
    },
  });
}

/* ── Private: display update ──────────────────────────────── */

function _updateTrigger(inst) {
  const value = inst.inputEl.value;
  const display = value ? _formatDisplay(value) : 'Pilih Tanggal';
  inst.displaySpan.textContent = display;
  inst.displaySpan.classList.toggle('pbsi-datepicker-display--empty', !value);
  inst.trigger.setAttribute('aria-label',
    value ? `Tanggal: ${display}. Klik untuk ubah` : 'Pilih tanggal'
  );
  _syncActivePreset(inst);
}

function _syncActivePreset(inst) {
  if (!inst.presetsEl) return;
  const activeLabel = _detectActivePreset(inst);
  inst.presetsEl.querySelectorAll('.pbsi-datepicker-preset').forEach(btn => {
    btn.classList.toggle('pbsi-datepicker-preset--active', btn.dataset.label === activeLabel);
  });
}

function _detectActivePreset(inst) {
  const value = inst.inputEl.value;
  if (!value) return null;

  for (const p of inst.presets) {
    if (p.openCalendar) continue;
    try {
      if (typeof p.getValue === 'function' && p.getValue() === value) return p.label;
    } catch (_) {}
  }

  // No value-based preset matched → "Pilih Tanggal" (openCalendar) is active
  const calendarPreset = inst.presets.find(p => p.openCalendar);
  return calendarPreset ? calendarPreset.label : null;
}

function _formatDisplay(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const [y, m, d] = parts.map(Number);
  if (!y || !m || !d) return dateStr;
  const date = new Date(y, m - 1, d);
  return `${_WEEKDAY_ID[date.getDay()]}, ${d} ${_MONTHS_ID[m - 1]} ${y}`;
}

console.info('[PBSI] Datepicker module loaded');
