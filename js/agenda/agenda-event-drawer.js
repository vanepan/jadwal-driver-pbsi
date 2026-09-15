/* ============================================================
   agenda-event-drawer.js — create/edit event drawer
   (V1.31 Agenda & To-Do, Phase C3)

   Uses js/components/drawer.js exclusively (single-instance — see
   agenda-participant-picker.js's header for why the picker is an
   in-place body-swap, not a stacked drawer). Follows this project's own
   documented Focus-Preserving Render Pattern throughout: plain fields
   never trigger a re-render on keystroke (agenda-forms.js#wirePlainFields);
   only discrete actions (toggle all-day, open/close picker, a picker
   selection, cancel) call refreshDrawerBody().

   DATE/TIME INPUT — deliberate simplification: uses plain native
   <input type="date">/<input type="time"> rather than wiring in
   js/pbsi-datepicker.js. That component wraps its target input in place
   and tracks it in a module-level registry keyed by the DOM node — a
   static-lifecycle assumption this drawer's own refreshDrawerBody()
   re-renders would violate on every discrete action (each re-render
   destroys and recreates the input node, leaking registry entries and
   requiring re-init call discipline that was not worth the added risk
   for this phase). Native date/time inputs are fully mobile-friendly
   (arguably more so — no custom overlay to fit into 390px) and produce
   the same YYYY-MM-DD / HH:MM value shape; they simply lack the preset-
   strip desktop polish pbsi-datepicker provides elsewhere. Flagged in
   the C3 report, not silently dropped.
   ============================================================ */

'use strict';

import { openDrawer, closeDrawer, refreshDrawerBody, setDrawerBusy, showDrawerError } from '../components/drawer.js';
import { createEvent, updateEvent, cancelEvent, deleteEvent, getEventById, setMyRsvpStatus } from './agenda-store.js';
import { getAgendaCandidates, registerDirectoryChangeListener, unregisterDirectoryChangeListener } from './agenda-directory.js';
import { renderPickerHTML, renderPersonChipsHTML } from './agenda-participant-picker.js';
import { wirePlainFields, validateEventDraft, fieldError, combineDateTimeToEpoch } from './agenda-forms.js';
import { typeLabel } from './agenda-view-model.js';
import { writableScopes, canManageSharedAgenda, canManageKabidAgenda, canWriteEvent } from './agenda-permissions.js';
import { getCurrentUser } from '../auth.js';
import { todayString } from '../utils.js';

const EVENT_TYPES = ['rapat', 'kegiatan', 'kunjungan', 'perjalanan', 'maintenance', 'deadline', 'lainnya'];
const RSVP_LABELS = { invited: 'Belum merespons', accepted: 'Hadir', declined: 'Tidak hadir', tentative: 'Tentatif' };
const RSVP_OPTIONS = [
  { value: 'accepted', label: 'Hadir' },
  { value: 'declined', label: 'Tidak hadir' },
  { value: 'tentative', label: 'Tentatif' },
];

let _draft = null;
let _errors = {};
let _pickerOpen = false;
let _pickerQuery = '';
let _editingId = null;
let _editingEvent = null; // raw /agendaEvents record (organizerUsername etc. — _draft doesn't carry it), needed for canWriteEvent()
let _onSaved = null;
let _editOriginalDraftJSON = null; // snapshot at open time, for real isDirty comparison in edit mode

function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

/** A freshly-picked participant's entry — matches the C1 schema
 *  (isPic/status/invitedBy/invitedAt, same shape agenda-store.js's own
 *  setEventParticipant() constructs) and matters beyond completeness:
 *  the C3.1 Rules equality-lock invitedBy/invitedAt on a self-RSVP write,
 *  and Firebase rejects a set() containing `undefined` outright — an
 *  entry missing these fields would make that participant permanently
 *  unable to RSVP. */
function newParticipantEntry() {
  const user = getCurrentUser();
  const actor = (user && (user.username || user.id)) || null;
  return { isPic: false, status: 'invited', invitedBy: actor, invitedAt: new Date().toISOString() };
}

function blankDraft(defaultScope) {
  return {
    title: '', description: '', type: 'rapat', location: '',
    date: todayString(), allDay: false, startTime: '09:00', endTime: '10:00',
    scope: defaultScope, participants: {},
  };
}

function draftFromEvent(event) {
  return {
    title: event.title || '', description: event.description || '', type: event.type || 'rapat',
    location: event.location || '', date: event.date || todayString(), allDay: Boolean(event.allDay),
    startTime: event.startTime || '09:00', endTime: event.endTime || '10:00',
    scope: event.scope, participants: { ...(event.participants || {}) },
    status: event.status,
  };
}

function renderScopeNote(scope) {
  if (scope !== 'kabid') return '';
  return `<div class="cal-scope-note">Agenda ini berada di cakupan Kabid Sarana dan Prasarana.</div>`;
}

/** Shown only when editing AND the current user has a participant entry
 *  (organizer/PIC included — anyone listed may RSVP). Writes go straight
 *  through setMyRsvpStatus(), bypassing handleSave() entirely, so an
 *  ordinary participant's RSVP click never resubmits fields they have no
 *  write access to (the C3.1 Rules would reject that atomic write anyway —
 *  this just avoids ever attempting it). */
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
        ${RSVP_OPTIONS.map((opt) => `<button type="button" class="cal-chip cal-rsvp-chip cal-rsvp-chip--${opt.value}" aria-pressed="${currentStatus === opt.value}" data-drawer-action="event:rsvp:${opt.value}">${esc(opt.label)}</button>`).join('')}
      </div>
      <div class="cal-form-hint" data-rsvp-hint>${currentStatus === 'invited' ? 'Anda belum merespons undangan ini.' : `Status Anda saat ini: <strong>${esc(RSVP_LABELS[currentStatus] || currentStatus)}</strong>`}</div>
    </div>`;
}

function renderFormBody() {
  const candidates = getAgendaCandidates();
  const scopes = writableScopes();
  const showScopeSelect = scopes.length > 1;
  const readOnly = Boolean(_editingId) && !canWriteEvent(_editingEvent);
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
    ${_editingId ? renderMyRsvpHTML() : ''}
    <div class="cal-form-field">
      <label class="cal-form-label cal-form-label--req">Judul</label>
      <input type="text" class="cal-form-input" data-field="title" value="${esc(_draft.title)}" placeholder="Rapat Koordinasi" maxlength="140" ${dis}>
      ${fieldError(_errors, 'title')}
    </div>
    <div class="cal-form-field">
      <label class="cal-form-label">Jenis</label>
      <select class="cal-form-select" data-field="type" ${dis}>
        ${EVENT_TYPES.map((t) => `<option value="${t}" ${_draft.type === t ? 'selected' : ''}>${esc(typeLabel(t))}</option>`).join('')}
      </select>
    </div>
    ${scopeField}
    <div class="cal-form-field">
      <label class="cal-form-check"><input type="checkbox" data-field="allDay" data-drawer-action="event:toggleallday" ${_draft.allDay ? 'checked' : ''} ${dis}> Sepanjang hari</label>
    </div>
    <div class="cal-form-row">
      <div class="cal-form-field">
        <label class="cal-form-label cal-form-label--req">Tanggal</label>
        <input type="date" class="cal-form-input" data-field="date" value="${esc(_draft.date)}" ${dis}>
        ${fieldError(_errors, 'date')}
      </div>
      ${_draft.allDay ? '' : `
      <div class="cal-form-field">
        <label class="cal-form-label cal-form-label--req">Jam Mulai</label>
        <input type="time" class="cal-form-input" data-field="startTime" value="${esc(_draft.startTime)}" ${dis}>
        ${fieldError(_errors, 'startTime')}
      </div>`}
    </div>
    ${_draft.allDay ? '' : `
    <div class="cal-form-field">
      <label class="cal-form-label cal-form-label--req">Jam Selesai</label>
      <input type="time" class="cal-form-input" data-field="endTime" value="${esc(_draft.endTime)}" ${dis}>
      ${fieldError(_errors, 'endTime')}
    </div>`}
    <div class="cal-form-field">
      <label class="cal-form-label">Lokasi</label>
      <input type="text" class="cal-form-input" data-field="location" value="${esc(_draft.location)}" placeholder="Ruang Rapat" ${dis}>
    </div>
    <div class="cal-form-field">
      <label class="cal-form-label">Deskripsi</label>
      <textarea class="cal-form-textarea" data-field="description" placeholder="Opsional" ${dis}>${esc(_draft.description)}</textarea>
    </div>
    <div class="cal-form-field">
      <label class="cal-form-label">Peserta &amp; PIC</label>
      ${renderPersonChipsHTML(candidates, _draft.participants, 'participant')}
      ${readOnly ? '' : `<div style="margin-top:8px"><button type="button" class="cal-btn cal-btn--sm" data-drawer-action="picker:open">+ Tambah Peserta</button></div>`}
      <div class="cal-form-hint">${readOnly ? 'Anda peserta biasa pada agenda ini — hanya dapat melihat dan mengisi Kehadiran Saya di atas.' : 'PIC dapat mengubah agenda ini; peserta biasa hanya dapat melihat.'}</div>
    </div>`;
}

function renderPickerBody() {
  return `
    <button type="button" class="cal-btn cal-btn--ghost cal-btn--sm" data-drawer-action="picker:back">&larr; Kembali ke form</button>
    ${renderPickerHTML({ candidates: getAgendaCandidates(), selected: _draft.participants, mode: 'participant', query: _pickerQuery })}`;
}

function currentBodyHTML() {
  return _pickerOpen ? renderPickerBody() : renderFormBody();
}

function footer() {
  if (_pickerOpen) return [];
  if (_editingId && !canWriteEvent(_editingEvent)) return [{ label: 'Tutup', action: 'event:cancelform' }];
  const actions = [{ label: 'Batal', action: 'event:cancelform' }];
  if (_editingId && _draft.status === 'scheduled') actions.push({ label: 'Batalkan Event', action: 'event:cancelevent', variant: 'danger' });
  // V1.31.1 soft-delete ("Dihapus") — a SEPARATE, always-available action
  // from "Batalkan" above (spec §T: both Batalkan and Hapus are listed as
  // independent actions, not a sequential state machine). Available
  // whenever the actor may write this event at all, regardless of its
  // current status.
  if (_editingId) actions.push({ label: 'Hapus Agenda', action: 'event:deleteevent', variant: 'danger' });
  actions.push({ label: _editingId ? 'Simpan Perubahan' : 'Simpan', action: 'event:save', variant: 'primary' });
  return actions;
}

function rerender() {
  refreshDrawerBody(currentBodyHTML());
  wireAfterRender();
}

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

/** Re-renders ONLY the picker's row list on search-as-you-type — a full
 *  refreshDrawerBody() would steal focus from the search input mid-typing
 *  (the exact bug class the Focus-Preserving Render Pattern exists to
 *  avoid), so this patches just the list container instead. */
function rerenderPickerListOnly(bodyEl) {
  const list = bodyEl.querySelector('.cal-picker-list');
  const wrap = document.createElement('div');
  wrap.innerHTML = renderPickerHTML({ candidates: getAgendaCandidates(), selected: _draft.participants, mode: 'participant', query: _pickerQuery });
  const newList = wrap.querySelector('.cal-picker-list');
  if (list && newList) list.innerHTML = newList.innerHTML;
}

/** Fixes the exact race C3.1 named but didn't fix: agenda-directory.js's
 *  own /userProfiles or /customRoles Firebase listener can resolve AFTER
 *  the picker is already open (a real, reported symptom — a newly-loaded
 *  or slower-to-sync candidate appearing to be "missing" from an
 *  already-open picker, permanently, since nothing previously reacted to
 *  the late arrival). Reacts ONLY while the picker sub-view is open, and
 *  ONLY patches the list (never a full rerender()) — a live directory
 *  update must never steal focus from whatever the user is typing in the
 *  wider form (Judul/Deskripsi/etc.), the same Focus-Preserving discipline
 *  the search-as-you-type handler already follows. */
function onDirectoryChange() {
  if (!_pickerOpen) return;
  const bodyEl = document.querySelector('[data-drawer-body]');
  if (bodyEl) rerenderPickerListOnly(bodyEl);
}

async function handleSave(close) {
  const errEl = document.querySelector('[data-drawer-error]');
  _errors = {};
  if (!_draft.allDay) {
    const { valid, errors } = validateEventDraft(_draft);
    if (!valid) { _errors = errors; rerender(); return; }
  } else if (!_draft.title.trim() || !_draft.date || !_draft.scope) {
    _errors = { title: !_draft.title.trim() ? 'Judul wajib diisi.' : undefined, date: !_draft.date ? 'Tanggal wajib diisi.' : undefined };
    rerender();
    return;
  }

  setDrawerBusy(true, { busyLabel: 'Menyimpan…' });
  try {
    const startAt = combineDateTimeToEpoch(_draft.date, _draft.allDay ? '00:00' : _draft.startTime);
    const endAt = _draft.allDay ? combineDateTimeToEpoch(_draft.date, '23:59') : combineDateTimeToEpoch(_draft.date, _draft.endTime);
    const payload = {
      title: _draft.title.trim(), description: _draft.description || '', type: _draft.type,
      location: _draft.location || '', date: _draft.date, allDay: _draft.allDay,
      startAt, endAt, participants: _draft.participants,
    };
    if (_editingId) {
      await updateEvent(_editingId, payload);
    } else {
      payload.scope = _draft.scope;
      await createEvent(payload);
    }
    setDrawerBusy(false);
    if (typeof _onSaved === 'function') _onSaved();
    close();
  } catch (err) {
    setDrawerBusy(false);
    showDrawerError(err && err.message ? err.message : 'Gagal menyimpan agenda. Coba lagi.');
  }
}

function onAction(action, close) {
  const [ns, verb, arg] = action.split(':');
  if (ns !== 'event' && ns !== 'picker') return;

  if (ns === 'event') {
    if (verb === 'toggleallday') {
      // V1.31.1 fix — see agenda-calendar-drawer.js's identical fix for the
      // full reasoning: a checkbox's native 'click' fires BEFORE 'change',
      // so trusting wirePlainFields' 'change' listener to have already
      // updated _draft.allDay by the time this 'click'-triggered rerender()
      // runs was a one-click-late race (found via this phase's new Calendar
      // drawer test coverage, then confirmed present here too — the exact
      // same dual-binding pattern, shipped). Read the checkbox directly.
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
      setMyRsvpStatus(_editingId, status).then(() => {
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
    if (verb === 'cancelevent') {
      if (!confirm('Batalkan agenda ini? Riwayat tetap tersimpan.')) return;
      const reason = prompt('Alasan pembatalan (opsional):') || null;
      setDrawerBusy(true, { busyLabel: 'Membatalkan…' });
      cancelEvent(_editingId, reason).then(() => {
        setDrawerBusy(false);
        if (typeof _onSaved === 'function') _onSaved();
        close();
      }).catch((err) => { setDrawerBusy(false); showDrawerError(err && err.message ? err.message : 'Gagal membatalkan.'); });
      return;
    }
    if (verb === 'deleteevent') {
      // Soft-delete ("Dihapus") — permanently removes this event from every
      // normal projection (agenda-store.js#getVisibleEvents() filters it
      // out); the underlying record and its full agendaAudit history remain
      // for administrative forensic purposes. Rules forbid hard delete —
      // there is no other way to make an event disappear.
      if (!confirm('Hapus agenda ini? Agenda tidak akan lagi muncul di Agenda, Kalender, To-Do, pencarian, PDF, atau notifikasi. Riwayat tetap tersimpan untuk audit.')) return;
      const reason = prompt('Alasan penghapusan (opsional):') || null;
      setDrawerBusy(true, { busyLabel: 'Menghapus…' });
      deleteEvent(_editingId, reason).then(() => {
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

/** @param {{defaultScope?: string, onSaved?: () => void, sourceEl?: HTMLElement}} [opts] */
export function openCreateEventDrawer(opts = {}) {
  const scopes = writableScopes();
  const defaultScope = opts.defaultScope && scopes.includes(opts.defaultScope) ? opts.defaultScope : scopes[0];
  if (!defaultScope) return; // no writable scope — caller should have already hidden the create action
  _draft = blankDraft(defaultScope);
  _editingEvent = null;
  _errors = {}; _pickerOpen = false; _pickerQuery = ''; _editingId = null; _onSaved = opts.onSaved || null;
  registerDirectoryChangeListener(onDirectoryChange);
  openDrawer({
    title: 'Agenda Baru', icon: 'calendar', body: currentBodyHTML(), footer: footer(),
    onAction, sourceEl: opts.sourceEl,
    onClose: () => unregisterDirectoryChangeListener(onDirectoryChange),
    isDirty: () => Boolean(_draft && (_draft.title || Object.keys(_draft.participants).length)),
  });
  wireAfterRender();
}

/** @param {string} eventId @param {{onSaved?: () => void, sourceEl?: HTMLElement}} [opts] */
export function openEditEventDrawer(eventId, opts = {}) {
  const event = getEventById(eventId);
  if (!event) return;
  _draft = draftFromEvent(event);
  _editingEvent = event;
  _errors = {}; _pickerOpen = false; _pickerQuery = ''; _editingId = eventId; _onSaved = opts.onSaved || null;
  // V1.31.3 §13 finding: this used to be `() => !readOnly` — true for
  // every writable event regardless of whether anything was actually
  // edited, so simply opening then closing an editable event (no changes
  // made) triggered the "unsaved changes" confirm() on every close. Real
  // comparison against the draft's state AT OPEN TIME, same idea the
  // create-mode isDirty above already uses, just against a snapshot
  // instead of "started blank".
  _editOriginalDraftJSON = JSON.stringify(_draft);
  const readOnly = !canWriteEvent(event);
  registerDirectoryChangeListener(onDirectoryChange);
  openDrawer({
    title: readOnly ? 'Detail Agenda' : 'Ubah Agenda', icon: 'calendar', body: currentBodyHTML(), footer: footer(),
    onAction, sourceEl: opts.sourceEl,
    onClose: () => unregisterDirectoryChangeListener(onDirectoryChange),
    isDirty: () => !readOnly && JSON.stringify(_draft) !== _editOriginalDraftJSON,
  });
  wireAfterRender();
}

export { closeDrawer as closeEventDrawer };
