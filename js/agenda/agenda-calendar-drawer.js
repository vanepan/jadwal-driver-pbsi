/* ============================================================
   agenda-calendar-drawer.js — create/edit Calendar drawer
   (V1.31.1 "Agenda, Kalender & To-Do")

   Same architecture as agenda-event-drawer.js — single-instance
   js/components/drawer.js, in-place picker body-swap, the Focus-Preserving
   Render Pattern for plain fields (agenda-forms.js#wirePlainFields) — see
   that file's header for the full shared design rationale, not repeated
   here.

   Calendar-specific difference: a DATE RANGE (startDate..endDate), not a
   single `date` — "Tanggal mulai"/"Tanggal selesai" per the spec (§S), and
   startTime/endTime (when not all-day) label explicitly which end of the
   range they apply to, since a multi-day timed item's start/end instants
   are NOT "same-day 09:00-10:00" the way an Agenda event's are.

   Status badge (Terjadwal/Berlangsung/Selesai/Dibatalkan) is DERIVED
   (agenda-calendar-lifecycle.js), shown read-only — never an editable
   field, per the spec's own "never force a status the range doesn't
   support" instruction (§E).
   ============================================================ */

'use strict';

import { openDrawer, closeDrawer, refreshDrawerBody, setDrawerBusy, showDrawerError } from '../components/drawer.js';
import { createCalendarItem, updateCalendarItem, cancelCalendarItem, deleteCalendarItem, getCalendarItemById, setMyCalendarRsvpStatus } from './agenda-store.js';
import { getAgendaCandidates, registerDirectoryChangeListener, unregisterDirectoryChangeListener } from './agenda-directory.js';
import { renderPickerHTML, renderPersonChipsHTML } from './agenda-participant-picker.js';
import { wirePlainFields, validateCalendarDraft, fieldError, combineDateTimeToEpoch } from './agenda-forms.js';
import { writableScopes, canManageSharedAgenda, canManageKabidAgenda, canWriteCalendarItem } from './agenda-permissions.js';
import { calendarItemDisplayState, calendarStateLabel } from './agenda-calendar-lifecycle.js';
import { getCurrentUser } from '../auth.js';
import { todayString } from '../utils.js';

const RSVP_LABELS = { invited: 'Belum merespons', accepted: 'Hadir', declined: 'Tidak hadir', tentative: 'Tentatif' };
const RSVP_OPTIONS = [
  { value: 'accepted', label: 'Hadir' },
  { value: 'declined', label: 'Tidak hadir' },
  { value: 'tentative', label: 'Tentatif' },
];
const STATE_BADGE_CLASS = { terjadwal: 'cal-pill--scheduled', berlangsung: 'cal-pill--active', selesai: 'cal-pill--done', dibatalkan: 'cal-pill--cancelled' };

let _draft = null;
let _errors = {};
let _pickerOpen = false;
let _pickerQuery = '';
let _editingId = null;
let _editingItem = null; // raw /agendaCalendars record, needed for canWriteCalendarItem()
let _onSaved = null;
let _editOriginalDraftJSON = null; // snapshot at open time, for real isDirty comparison in edit mode

function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

function newParticipantEntry() {
  const user = getCurrentUser();
  const actor = (user && (user.username || user.id)) || null;
  return { isPic: false, status: 'invited', invitedBy: actor, invitedAt: new Date().toISOString() };
}

function blankDraft(defaultScope) {
  const today = todayString();
  return {
    title: '', description: '', location: '',
    startDate: today, endDate: today, allDay: false, startTime: '09:00', endTime: '10:00',
    scope: defaultScope, participants: {},
  };
}

function draftFromItem(item) {
  return {
    title: item.title || '', description: item.description || '', location: item.location || '',
    startDate: item.startDate || todayString(), endDate: item.endDate || item.startDate || todayString(),
    allDay: Boolean(item.allDay), startTime: item.startTime || '09:00', endTime: item.endTime || '10:00',
    scope: item.scope, participants: { ...(item.participants || {}) }, status: item.status,
  };
}

function renderScopeNote(scope) {
  if (scope !== 'kabid') return '';
  return `<div class="cal-scope-note">Kalender ini berada di cakupan Kabid Sarana dan Prasarana.</div>`;
}

function renderStatusBadge() {
  if (!_editingItem) return '';
  const state = calendarItemDisplayState(_editingItem, Date.now());
  return `<div class="cal-form-field"><span class="cal-pill ${STATE_BADGE_CLASS[state] || ''}">${esc(calendarStateLabel(state))}</span></div>`;
}

/** Mirrors agenda-event-drawer.js#renderMyRsvpHTML() exactly. */
function renderMyRsvpHTML() {
  const user = getCurrentUser();
  const uid = user && (user.username || user.id);
  const entry = uid && _draft.participants && _draft.participants[uid];
  if (!entry) return '';
  const currentStatus = entry.status || 'invited';
  return `
    <div class="cal-form-field cal-rsvp-field">
      <label class="cal-form-label">Kehadiran Saya${entry.isPic ? ' <span class="cal-pill cal-pill--pic">PIC</span>' : ''}</label>
      <div class="cal-rsvp-buttons" role="group" aria-label="Status kehadiran saya">
        ${RSVP_OPTIONS.map((opt) => `<button type="button" class="cal-chip cal-rsvp-chip cal-rsvp-chip--${opt.value}" aria-pressed="${currentStatus === opt.value}" data-drawer-action="calendar:rsvp:${opt.value}">${esc(opt.label)}</button>`).join('')}
      </div>
      <div class="cal-form-hint" data-rsvp-hint>${currentStatus === 'invited' ? 'Anda belum merespons undangan ini.' : `Status Anda saat ini: <strong>${esc(RSVP_LABELS[currentStatus] || currentStatus)}</strong>`}</div>
    </div>`;
}

function renderFormBody() {
  const candidates = getAgendaCandidates();
  const scopes = writableScopes();
  const showScopeSelect = scopes.length > 1;
  const readOnly = Boolean(_editingId) && !canWriteCalendarItem(_editingItem);
  const dis = readOnly ? 'disabled' : '';

  const scopeField = showScopeSelect
    ? `<div class="cal-form-field">
        <label class="cal-form-label cal-form-label--req">Cakupan</label>
        <select class="cal-form-select" data-field="scope" ${dis}>
          ${canManageSharedAgenda() ? `<option value="sarpras_shared" ${_draft.scope === 'sarpras_shared' ? 'selected' : ''}>Sarpras Bersama</option>` : ''}
          ${canManageKabidAgenda() ? `<option value="kabid" ${_draft.scope === 'kabid' ? 'selected' : ''}>Kabid Sarana dan Prasarana</option>` : ''}
        </select>
      </div>`
    : '';

  return `
    ${renderScopeNote(_draft.scope)}
    ${renderStatusBadge()}
    ${_editingId ? renderMyRsvpHTML() : ''}
    <div class="cal-form-field">
      <label class="cal-form-label cal-form-label--req">Judul</label>
      <input type="text" class="cal-form-input" data-field="title" value="${esc(_draft.title)}" placeholder="Evan - Sirnas C Piala Raja" maxlength="140" ${dis}>
      ${fieldError(_errors, 'title')}
    </div>
    ${scopeField}
    <div class="cal-form-field">
      <label class="cal-form-check"><input type="checkbox" data-field="allDay" data-drawer-action="calendar:toggleallday" ${_draft.allDay ? 'checked' : ''} ${dis}> Sepanjang hari</label>
    </div>
    <div class="cal-form-row">
      <div class="cal-form-field">
        <label class="cal-form-label cal-form-label--req">Tanggal Mulai</label>
        <input type="date" class="cal-form-input" data-field="startDate" value="${esc(_draft.startDate)}" ${dis}>
        ${fieldError(_errors, 'startDate')}
      </div>
      <div class="cal-form-field">
        <label class="cal-form-label cal-form-label--req">Tanggal Selesai</label>
        <input type="date" class="cal-form-input" data-field="endDate" value="${esc(_draft.endDate)}" ${dis}>
        ${fieldError(_errors, 'endDate')}
      </div>
    </div>
    ${_draft.allDay ? '' : `
    <div class="cal-form-row">
      <div class="cal-form-field">
        <label class="cal-form-label cal-form-label--req">Jam Mulai${_draft.startDate !== _draft.endDate ? ' (hari pertama)' : ''}</label>
        <input type="time" class="cal-form-input" data-field="startTime" value="${esc(_draft.startTime)}" ${dis}>
        ${fieldError(_errors, 'startTime')}
      </div>
      <div class="cal-form-field">
        <label class="cal-form-label cal-form-label--req">Jam Selesai${_draft.startDate !== _draft.endDate ? ' (hari terakhir)' : ''}</label>
        <input type="time" class="cal-form-input" data-field="endTime" value="${esc(_draft.endTime)}" ${dis}>
        ${fieldError(_errors, 'endTime')}
      </div>
    </div>`}
    <div class="cal-form-field">
      <label class="cal-form-label">Lokasi</label>
      <input type="text" class="cal-form-input" data-field="location" value="${esc(_draft.location)}" placeholder="Opsional" ${dis}>
    </div>
    <div class="cal-form-field">
      <label class="cal-form-label">Keterangan</label>
      <textarea class="cal-form-textarea" data-field="description" placeholder="Opsional" ${dis}>${esc(_draft.description)}</textarea>
    </div>
    <div class="cal-form-field">
      <label class="cal-form-label">Peserta &amp; PIC</label>
      ${renderPersonChipsHTML(candidates, _draft.participants, 'participant')}
      ${readOnly ? '' : `<div style="margin-top:8px"><button type="button" class="cal-btn cal-btn--sm" data-drawer-action="picker:open">+ Tambah Peserta</button></div>`}
      <div class="cal-form-hint">${readOnly ? 'Anda peserta biasa pada kalender ini — hanya dapat melihat dan mengisi Kehadiran Saya di atas.' : 'PIC dapat mengubah kalender ini; peserta biasa hanya dapat melihat.'}</div>
    </div>`;
}

function renderPickerBody() {
  return `
    <button type="button" class="cal-btn cal-btn--ghost cal-btn--sm" data-drawer-action="picker:back">&larr; Kembali ke form</button>
    ${renderPickerHTML({ candidates: getAgendaCandidates(), selected: _draft.participants, mode: 'participant', query: _pickerQuery })}`;
}

function currentBodyHTML() { return _pickerOpen ? renderPickerBody() : renderFormBody(); }

function footer() {
  if (_pickerOpen) return [];
  if (_editingId && !canWriteCalendarItem(_editingItem)) return [{ label: 'Tutup', action: 'calendar:cancelform' }];
  const actions = [{ label: 'Batal', action: 'calendar:cancelform' }];
  if (_editingId && _draft.status === 'scheduled') actions.push({ label: 'Batalkan', action: 'calendar:cancelitem', variant: 'danger' });
  if (_editingId) actions.push({ label: 'Hapus', action: 'calendar:deleteitem', variant: 'danger' });
  actions.push({ label: _editingId ? 'Simpan Perubahan' : 'Simpan', action: 'calendar:save', variant: 'primary' });
  return actions;
}

function rerender() { refreshDrawerBody(currentBodyHTML()); wireAfterRender(); }

function wireAfterRender() {
  const bodyEl = document.querySelector('[data-drawer-body]');
  if (!bodyEl) return;
  wirePlainFields(bodyEl, _draft);
  if (_pickerOpen) {
    const search = bodyEl.querySelector('[data-field="pickerQuery"]');
    if (search) {
      search.addEventListener('input', () => { _pickerQuery = search.value; rerenderPickerListOnly(bodyEl); });
      search.focus();
      search.setSelectionRange(search.value.length, search.value.length);
    }
  }
}

function rerenderPickerListOnly(bodyEl) {
  const list = bodyEl.querySelector('.cal-picker-list');
  const wrap = document.createElement('div');
  wrap.innerHTML = renderPickerHTML({ candidates: getAgendaCandidates(), selected: _draft.participants, mode: 'participant', query: _pickerQuery });
  const newList = wrap.querySelector('.cal-picker-list');
  if (list && newList) list.innerHTML = newList.innerHTML;
}

/** Mirrors agenda-event-drawer.js#onDirectoryChange() exactly. */
function onDirectoryChange() {
  if (!_pickerOpen) return;
  const bodyEl = document.querySelector('[data-drawer-body]');
  if (bodyEl) rerenderPickerListOnly(bodyEl);
}

async function handleSave(close) {
  _errors = {};
  const { valid, errors } = validateCalendarDraft(_draft);
  if (!valid) { _errors = errors; rerender(); return; }

  setDrawerBusy(true, { busyLabel: 'Menyimpan…' });
  try {
    const startAt = combineDateTimeToEpoch(_draft.startDate, _draft.allDay ? '00:00' : _draft.startTime);
    const endAt = _draft.allDay ? combineDateTimeToEpoch(_draft.endDate, '23:59') : combineDateTimeToEpoch(_draft.endDate, _draft.endTime);
    const payload = {
      title: _draft.title.trim(), description: _draft.description || '', location: _draft.location || '',
      startDate: _draft.startDate, endDate: _draft.endDate, allDay: _draft.allDay,
      startAt, endAt, participants: _draft.participants,
    };
    if (_editingId) {
      await updateCalendarItem(_editingId, payload);
    } else {
      payload.scope = _draft.scope;
      await createCalendarItem(payload);
    }
    setDrawerBusy(false);
    if (typeof _onSaved === 'function') _onSaved();
    close();
  } catch (err) {
    setDrawerBusy(false);
    showDrawerError(err && err.message ? err.message : 'Gagal menyimpan kalender. Coba lagi.');
  }
}

function onAction(action, close) {
  const [ns, verb, arg] = action.split(':');
  if (ns !== 'calendar' && ns !== 'picker') return;

  if (ns === 'calendar') {
    if (verb === 'toggleallday') {
      // The checkbox carries BOTH data-field (wirePlainFields' own 'change'
      // listener) and data-drawer-action (this delegated 'click' listener,
      // drawer.js#openDrawer()). For a checkbox, the native 'click' event
      // fires BEFORE 'change' — so relying on wirePlainFields to have
      // already written the new value into _draft by the time THIS handler
      // runs is a race it always loses; rerender() would render the OLD
      // allDay state one click late. Reading the checkbox's own .checked
      // directly (already flipped by the time 'click' dispatches, per the
      // checkbox's pre-activation behavior) sidesteps the race entirely.
      const cb = document.querySelector('[data-field="allDay"]');
      if (cb) _draft.allDay = cb.checked;
      rerender();
      return;
    }
    if (verb === 'cancelform') { close(); return; }
    if (verb === 'save') { handleSave(close); return; }
    if (verb === 'rsvp') {
      const status = arg;
      setDrawerBusy(true, { busyLabel: 'Menyimpan…' });
      setMyCalendarRsvpStatus(_editingId, status).then(() => {
        const user = getCurrentUser();
        const uid = user && (user.username || user.id);
        if (uid && _draft.participants[uid]) _draft.participants[uid] = { ..._draft.participants[uid], status };
        setDrawerBusy(false);
        if (typeof _onSaved === 'function') _onSaved();
        rerender();
      }).catch((err) => {
        setDrawerBusy(false);
        showDrawerError(err && err.message ? err.message : 'Gagal menyimpan RSVP. Coba lagi.');
      });
      return;
    }
    if (verb === 'cancelitem') {
      if (!confirm('Batalkan kalender ini? Riwayat tetap tersimpan.')) return;
      const reason = prompt('Alasan pembatalan (opsional):') || null;
      setDrawerBusy(true, { busyLabel: 'Membatalkan…' });
      cancelCalendarItem(_editingId, reason).then(() => {
        setDrawerBusy(false);
        if (typeof _onSaved === 'function') _onSaved();
        close();
      }).catch((err) => { setDrawerBusy(false); showDrawerError(err && err.message ? err.message : 'Gagal membatalkan.'); });
      return;
    }
    if (verb === 'deleteitem') {
      if (!confirm('Hapus kalender ini? Kalender tidak akan lagi muncul di Kalender, pencarian, PDF, atau notifikasi. Riwayat tetap tersimpan untuk audit.')) return;
      const reason = prompt('Alasan penghapusan (opsional):') || null;
      setDrawerBusy(true, { busyLabel: 'Menghapus…' });
      deleteCalendarItem(_editingId, reason).then(() => {
        setDrawerBusy(false);
        if (typeof _onSaved === 'function') _onSaved();
        close();
      }).catch((err) => { setDrawerBusy(false); showDrawerError(err && err.message ? err.message : 'Gagal menghapus.'); });
      return;
    }
    return;
  }

  // ns === 'picker'
  if (verb === 'open') { _pickerOpen = true; _pickerQuery = ''; rerender(); return; }
  if (verb === 'back' || verb === 'done') { _pickerOpen = false; rerender(); return; }
  if (verb === 'toggle') {
    if (_draft.participants[arg]) delete _draft.participants[arg];
    else _draft.participants[arg] = newParticipantEntry();
    rerender();
    return;
  }
  if (verb === 'togglepic') {
    const entry = _draft.participants[arg];
    if (entry) entry.isPic = !entry.isPic;
    rerender();
    return;
  }
  if (verb === 'remove') { delete _draft.participants[arg]; rerender(); return; }
  if (verb === 'selectall') {
    getAgendaCandidates().forEach((c) => { if (!_draft.participants[c.username]) _draft.participants[c.username] = newParticipantEntry(); });
    rerender();
    return;
  }
  if (verb === 'clear') { _draft.participants = {}; rerender(); return; }
}

/** @param {{defaultScope?: string, defaultDate?: string, onSaved?: () => void, sourceEl?: HTMLElement}} [opts] */
export function openCreateCalendarDrawer(opts = {}) {
  const scopes = writableScopes();
  const defaultScope = opts.defaultScope && scopes.includes(opts.defaultScope) ? opts.defaultScope : scopes[0];
  if (!defaultScope) return; // no writable scope — caller should have already hidden the create action
  _draft = blankDraft(defaultScope);
  if (opts.defaultDate) { _draft.startDate = opts.defaultDate; _draft.endDate = opts.defaultDate; }
  _editingItem = null;
  _errors = {}; _pickerOpen = false; _pickerQuery = ''; _editingId = null; _onSaved = opts.onSaved || null;
  registerDirectoryChangeListener(onDirectoryChange);
  openDrawer({
    title: 'Kalender Baru', icon: 'calendar', body: currentBodyHTML(), footer: footer(),
    onAction, sourceEl: opts.sourceEl,
    onClose: () => unregisterDirectoryChangeListener(onDirectoryChange),
    isDirty: () => Boolean(_draft && (_draft.title || Object.keys(_draft.participants).length)),
  });
  wireAfterRender();
}

/** @param {string} calendarId @param {{onSaved?: () => void, sourceEl?: HTMLElement}} [opts] */
export function openEditCalendarDrawer(calendarId, opts = {}) {
  const item = getCalendarItemById(calendarId);
  if (!item) {
    // SS12 — mirrors agenda-event-drawer.js's identical fix (itself
    // mirroring js/modal.js's SS10 openDetailModal fix): an honest drawer
    // instead of a silent no-op for a deleted/no-longer-accessible item.
    openDrawer({
      title: 'Kalender',
      icon: 'calendar',
      body: '<div style="padding:8px 0;color:var(--text-muted);">Item kalender ini tidak ditemukan &mdash; mungkin sudah dihapus atau tidak lagi dapat diakses.</div>',
      sourceEl: opts.sourceEl,
    });
    return;
  }
  _draft = draftFromItem(item);
  _editingItem = item;
  _errors = {}; _pickerOpen = false; _pickerQuery = ''; _editingId = calendarId; _onSaved = opts.onSaved || null;
  // V1.31.3 §13 finding: this used to be `() => !readOnly` — true for
  // every writable item regardless of whether anything was actually
  // edited, so simply opening then closing an editable Calendar item
  // (no changes made) triggered the "unsaved changes" confirm() on every
  // close. Real comparison against the draft's state AT OPEN TIME, same
  // idea the create-mode isDirty above already uses, just against a
  // snapshot instead of "started blank".
  _editOriginalDraftJSON = JSON.stringify(_draft);
  const readOnly = !canWriteCalendarItem(item);
  registerDirectoryChangeListener(onDirectoryChange);
  openDrawer({
    title: readOnly ? 'Detail Kalender' : 'Ubah Kalender', icon: 'calendar', body: currentBodyHTML(), footer: footer(),
    onAction, sourceEl: opts.sourceEl,
    onClose: () => unregisterDirectoryChangeListener(onDirectoryChange),
    isDirty: () => !readOnly && JSON.stringify(_draft) !== _editOriginalDraftJSON,
  });
  wireAfterRender();
}

export { closeDrawer as closeCalendarDrawer };
