/* ============================================================
   agenda-export-drawer.js — PDF export filter dialog
   (V1.31 Agenda & To-Do, Phase C4)

   Same canonical drawer every other Agenda dialog uses
   (js/components/drawer.js) — no new dialog primitive. Presets/mode/
   status/priority reuse the SAME chip idiom + label vocabulary already
   established by agenda-workspace-view.js's own filter chips (imported,
   not duplicated). "Buat PDF" calls agenda-pdf-export.js#runAgendaPdfExport
   directly; DocumentEngine's own viewer (Preview -> Print/Download/Share)
   takes over from there — this drawer's only job is collecting filters.
   ============================================================ */

'use strict';

import { openDrawer, closeDrawer, refreshDrawerBody, setDrawerBusy, showDrawerError } from '../components/drawer.js';
import { AGENDA_REPORT_PRESETS, presetLabel } from './agenda-date-range.js';
import { STATUS_FILTERS, PRIORITY_FILTERS } from './agenda-workspace-view.js';
import { validateDateRange } from '../validation.js';
import { todayString } from '../utils.js';

const MODES = [
  { key: 'semua', label: 'Semua' },
  { key: 'agenda', label: 'Agenda' },
  { key: 'todo', label: 'To-Do' },
];

let _draft = null;
let _errors = {};

function blankDraft() {
  return { preset: 'this_week', customFrom: todayString(), customTo: todayString(), mode: 'semua', status: 'all', priority: 'all' };
}

function chipRow(items, current, actionPrefix) {
  // cal-filters--wrap: the drawer panel is narrower than the workspace
  // section this chip idiom was designed for — wrap instead of hiding
  // options behind an unlabeled horizontal scroll (found by screenshotting).
  return `<div class="cal-filters cal-filters--wrap" role="radiogroup">
    ${items.map((it) => `<button type="button" class="cal-chip" aria-pressed="${current === it.key}" data-drawer-action="${actionPrefix}:${it.key}">${it.label}</button>`).join('')}
  </div>`;
}

function renderBody() {
  const showCustom = _draft.preset === 'custom';
  const showTaskFilters = _draft.mode !== 'agenda';
  return `
    <div class="cal-form-field">
      <label class="cal-form-label cal-form-label--req">Rentang Tanggal</label>
      ${chipRow(AGENDA_REPORT_PRESETS.map((p) => ({ key: p, label: presetLabel(p) })), _draft.preset, 'export:preset')}
    </div>
    ${showCustom ? `
    <div class="cal-form-row">
      <div class="cal-form-field">
        <label class="cal-form-label cal-form-label--req">Dari</label>
        <input type="date" class="cal-form-input" data-field="customFrom" value="${_draft.customFrom}">
      </div>
      <div class="cal-form-field">
        <label class="cal-form-label cal-form-label--req">Sampai</label>
        <input type="date" class="cal-form-input" data-field="customTo" value="${_draft.customTo}">
      </div>
    </div>
    ${_errors.range ? `<div class="cal-form-error">${_errors.range}</div>` : ''}` : ''}
    <div class="cal-form-field">
      <label class="cal-form-label">Isi Laporan</label>
      ${chipRow(MODES, _draft.mode, 'export:mode')}
    </div>
    ${showTaskFilters ? `
    <div class="cal-form-field">
      <label class="cal-form-label">Status Tugas</label>
      ${chipRow(STATUS_FILTERS, _draft.status, 'export:status')}
    </div>
    <div class="cal-form-field">
      <label class="cal-form-label">Prioritas Tugas</label>
      ${chipRow(PRIORITY_FILTERS, _draft.priority, 'export:priority')}
    </div>` : ''}
    <div class="cal-form-hint">PDF hanya berisi agenda/tugas yang sudah terlihat oleh Anda saat ini — tidak ada data di luar cakupan akses Anda yang dimuat.</div>`;
}

function rerender() {
  refreshDrawerBody(renderBody());
  wireAfterRender();
}

function wireAfterRender() {
  const bodyEl = document.querySelector('[data-drawer-body]');
  if (!bodyEl) return;
  bodyEl.querySelectorAll('[data-field]').forEach((el) => {
    el.addEventListener('change', () => { _draft[el.dataset.field] = el.value; });
  });
}

async function handleGenerate(close) {
  _errors = {};
  if (_draft.preset === 'custom') {
    const { valid, errors } = validateDateRange(_draft.customFrom, _draft.customTo);
    if (!valid) { _errors.range = errors[0]; rerender(); return; }
  }
  setDrawerBusy(true, { busyLabel: 'Membuat PDF…' });
  try {
    const { runAgendaPdfExport } = await import('./agenda-pdf-export.js');
    await runAgendaPdfExport({ ..._draft });
    setDrawerBusy(false);
    close();
  } catch (err) {
    setDrawerBusy(false);
    showDrawerError(err && err.message ? err.message : 'Gagal membuat PDF. Coba lagi.');
  }
}

function onAction(action, close) {
  const [ns, verb, arg] = action.split(':');
  if (ns !== 'export') return;
  if (verb === 'cancel') { close(); return; }
  if (verb === 'generate') { handleGenerate(close); return; }
  if (verb === 'preset') { _draft.preset = arg; rerender(); return; }
  if (verb === 'mode') { _draft.mode = arg; rerender(); return; }
  if (verb === 'status') { _draft.status = arg; rerender(); return; }
  if (verb === 'priority') { _draft.priority = arg; rerender(); return; }
}

export function openAgendaExportDrawer(opts = {}) {
  _draft = blankDraft();
  _errors = {};
  openDrawer({
    title: 'Export PDF', icon: 'download', body: renderBody(),
    footer: [
      { label: 'Batal', action: 'export:cancel' },
      { label: 'Buat PDF', action: 'export:generate', variant: 'primary' },
    ],
    onAction, sourceEl: opts.sourceEl,
    isDirty: () => false,
  });
  wireAfterRender();
}

export { closeDrawer as closeAgendaExportDrawer };
