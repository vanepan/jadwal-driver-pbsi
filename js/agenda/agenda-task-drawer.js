/* ============================================================
   agenda-task-drawer.js — create/edit task drawer
   (V1.31 Agenda & To-Do, Phase C3)

   Same architecture as agenda-event-drawer.js (single-instance drawer,
   in-place picker body-swap, Focus-Preserving Render Pattern for plain
   fields) — see that file's header for the shared design rationale, not
   repeated here. Task-specific additions: priority, checklist/subtasks,
   `responsible` picker (no PIC concept — tasks have none per the
   approved C1 data model, §16's own explicit instruction not to invent
   one).
   ============================================================ */

'use strict';

import { openDrawer, closeDrawer, refreshDrawerBody, setDrawerBusy, showDrawerError } from '../components/drawer.js';
import { createTask, updateTask, completeTask, reopenTask, getTaskById } from './agenda-store.js';
import { getAgendaCandidates, registerDirectoryChangeListener, unregisterDirectoryChangeListener } from './agenda-directory.js';
import { renderPickerHTML, renderPersonChipsHTML } from './agenda-participant-picker.js';
import { wirePlainFields, validateTaskDraft, fieldError, combineDateTimeToEpoch } from './agenda-forms.js';
import { writableScopes, canManageSharedAgenda, canManageKabidAgenda } from './agenda-permissions.js';
import { generateId } from '../utils.js';

let _draft = null;
let _errors = {};
let _pickerOpen = false;
let _pickerQuery = '';
let _editingId = null;
let _onSaved = null;
let _newChecklistLabel = '';

function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

function blankDraft(defaultScope) {
  return { title: '', description: '', dueDate: '', dueTime: '', priority: 'normal', scope: defaultScope, responsible: {}, checklist: [] };
}

function draftFromTask(task) {
  return {
    title: task.title || '', description: task.description || '', dueDate: task.dueDate || '', dueTime: task.dueTime || '',
    priority: task.priority || 'normal', scope: task.scope, responsible: { ...(task.responsible || {}) },
    checklist: [...(task.checklist || [])], status: task.status,
  };
}

function renderChecklistHTML() {
  const items = _draft.checklist || [];
  const rows = items.map((item) => `
    <div class="cal-checklist-row">
      <span class="cal-checkbox" role="checkbox" aria-checked="${item.done}" data-drawer-action="task:checkitem:${esc(item.id)}">${item.done ? '&#10003;' : ''}</span>
      <span class="cal-checklist-label${item.done ? ' cal-checklist-label--done' : ''}">${esc(item.label)}</span>
      <button type="button" class="cal-btn cal-btn--ghost cal-btn--sm" aria-label="Hapus" data-drawer-action="task:removeitem:${esc(item.id)}">&times;</button>
    </div>`).join('');
  return `
    ${rows}
    <div class="cal-checklist-add">
      <input type="text" class="cal-form-input" data-field="newChecklistLabel" value="${esc(_newChecklistLabel)}" placeholder="Tambah item checklist…" maxlength="140">
      <button type="button" class="cal-btn cal-btn--sm" data-drawer-action="task:additem">Tambah</button>
    </div>`;
}

function renderFormBody() {
  const candidates = getAgendaCandidates();
  const scopes = writableScopes();
  const showScopeSelect = scopes.length > 1;
  const scopeField = showScopeSelect
    ? `<div class="cal-form-field">
        <label class="cal-form-label cal-form-label--req">Cakupan</label>
        <select class="cal-form-select" data-field="scope">
          ${canManageSharedAgenda() ? `<option value="sarpras_shared" ${_draft.scope === 'sarpras_shared' ? 'selected' : ''}>Sarpras Bersama</option>` : ''}
          ${canManageKabidAgenda() ? `<option value="kabid" ${_draft.scope === 'kabid' ? 'selected' : ''}>Kabid Sarana dan Prasarana</option>` : ''}
        </select>
      </div>`
    : '';

  return `
    ${_draft.scope === 'kabid' ? '<div class="cal-scope-note">Tugas ini berada di cakupan Kabid Sarana dan Prasarana.</div>' : ''}
    <div class="cal-form-field">
      <label class="cal-form-label cal-form-label--req">Judul</label>
      <input type="text" class="cal-form-input" data-field="title" value="${esc(_draft.title)}" placeholder="Persiapan Rapat Sekjen" maxlength="140">
      ${fieldError(_errors, 'title')}
    </div>
    ${scopeField}
    <div class="cal-form-row">
      <div class="cal-form-field">
        <label class="cal-form-label">Tenggat</label>
        <input type="date" class="cal-form-input" data-field="dueDate" value="${esc(_draft.dueDate)}">
        ${fieldError(_errors, 'dueDate')}
      </div>
      <div class="cal-form-field">
        <label class="cal-form-label">Jam</label>
        <input type="time" class="cal-form-input" data-field="dueTime" value="${esc(_draft.dueTime)}">
        <div class="cal-form-hint">Pengingat 1 jam sebelum hanya aktif jika jam diisi.</div>
      </div>
    </div>
    <div class="cal-form-field">
      <label class="cal-form-label">Prioritas</label>
      <div class="cal-filters" role="radiogroup" aria-label="Prioritas">
        ${['normal', 'penting', 'urgent'].map((p) => `<button type="button" class="cal-chip" role="radio" aria-checked="${_draft.priority === p}" aria-pressed="${_draft.priority === p}" data-drawer-action="task:priority:${p}">${p === 'normal' ? 'Normal' : p === 'penting' ? 'Penting' : 'Urgent'}</button>`).join('')}
      </div>
    </div>
    <div class="cal-form-field">
      <label class="cal-form-label">Deskripsi</label>
      <textarea class="cal-form-textarea" data-field="description" placeholder="Opsional">${esc(_draft.description)}</textarea>
    </div>
    <div class="cal-form-field">
      <label class="cal-form-label">Penanggung Jawab</label>
      ${renderPersonChipsHTML(candidates, _draft.responsible, 'responsible')}
      <div style="margin-top:8px"><button type="button" class="cal-btn cal-btn--sm" data-drawer-action="picker:open">+ Tambah Penanggung Jawab</button></div>
    </div>
    <details class="cal-disclosure">
      <summary>Checklist / Subtugas</summary>
      ${renderChecklistHTML()}
    </details>`;
}

function renderPickerBody() {
  return `
    <button type="button" class="cal-btn cal-btn--ghost cal-btn--sm" data-drawer-action="picker:back">&larr; Kembali ke form</button>
    ${renderPickerHTML({ candidates: getAgendaCandidates(), selected: _draft.responsible, mode: 'responsible', query: _pickerQuery })}`;
}

function currentBodyHTML() { return _pickerOpen ? renderPickerBody() : renderFormBody(); }

function footer() {
  if (_pickerOpen) return [];
  const actions = [{ label: 'Batal', action: 'task:cancelform' }];
  if (_editingId) {
    actions.push(_draft.status === 'done'
      ? { label: 'Buka Kembali', action: 'task:reopen' }
      : { label: 'Tandai Selesai', action: 'task:complete' });
  }
  actions.push({ label: _editingId ? 'Simpan Perubahan' : 'Simpan', action: 'task:save', variant: 'primary' });
  return actions;
}

function rerender() { refreshDrawerBody(currentBodyHTML()); wireAfterRender(); }

function wireAfterRender() {
  const bodyEl = document.querySelector('[data-drawer-body]');
  if (!bodyEl) return;
  wirePlainFields(bodyEl, _draft);
  const newItemInput = bodyEl.querySelector('[data-field="newChecklistLabel"]');
  if (newItemInput) newItemInput.addEventListener('input', () => { _newChecklistLabel = newItemInput.value; });
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
  wrap.innerHTML = renderPickerHTML({ candidates: getAgendaCandidates(), selected: _draft.responsible, mode: 'responsible', query: _pickerQuery });
  const newList = wrap.querySelector('.cal-picker-list');
  if (list && newList) list.innerHTML = newList.innerHTML;
}

/** Same late-directory-data fix as agenda-event-drawer.js's own
 *  onDirectoryChange() — see that file's comment. Reacts only while the
 *  responsible-person picker sub-view is open, patching only the list. */
function onDirectoryChange() {
  if (!_pickerOpen) return;
  const bodyEl = document.querySelector('[data-drawer-body]');
  if (bodyEl) rerenderPickerListOnly(bodyEl);
}

async function handleSave(close) {
  _errors = {};
  const { valid, errors } = validateTaskDraft(_draft);
  if (!valid) { _errors = errors; rerender(); return; }

  setDrawerBusy(true, { busyLabel: 'Menyimpan…' });
  try {
    const dueAt = _draft.dueDate ? combineDateTimeToEpoch(_draft.dueDate, _draft.dueTime || '23:59') : null;
    const payload = {
      title: _draft.title.trim(), description: _draft.description || '',
      dueDate: _draft.dueDate || null, dueTime: _draft.dueTime || null, dueAt,
      priority: _draft.priority, responsible: _draft.responsible, checklist: _draft.checklist,
    };
    if (_editingId) {
      await updateTask(_editingId, payload);
    } else {
      payload.scope = _draft.scope;
      await createTask(payload);
    }
    setDrawerBusy(false);
    if (typeof _onSaved === 'function') _onSaved();
    close();
  } catch (err) {
    setDrawerBusy(false);
    showDrawerError(err && err.message ? err.message : 'Gagal menyimpan tugas. Coba lagi.');
  }
}

function onAction(action, close) {
  const [ns, verb, arg] = action.split(':');
  if (ns !== 'task' && ns !== 'picker') return;

  if (ns === 'task') {
    if (verb === 'cancelform') { close(); return; }
    if (verb === 'save') { handleSave(close); return; }
    if (verb === 'priority') { _draft.priority = arg; rerender(); return; }
    if (verb === 'additem') {
      const label = (_newChecklistLabel || '').trim();
      if (!label) return;
      _draft.checklist = [...(_draft.checklist || []), { id: `chk_${generateId()}`, label, done: false }];
      _newChecklistLabel = '';
      rerender();
      return;
    }
    if (verb === 'checkitem') {
      _draft.checklist = (_draft.checklist || []).map((i) => (i.id === arg ? { ...i, done: !i.done } : i));
      rerender();
      return;
    }
    if (verb === 'removeitem') {
      _draft.checklist = (_draft.checklist || []).filter((i) => i.id !== arg);
      rerender();
      return;
    }
    if (verb === 'complete') {
      setDrawerBusy(true, { busyLabel: 'Menyimpan…' });
      completeTask(_editingId).then(() => {
        setDrawerBusy(false);
        if (typeof _onSaved === 'function') _onSaved();
        close();
      }).catch((err) => { setDrawerBusy(false); showDrawerError(err && err.message ? err.message : 'Gagal menandai selesai.'); });
      return;
    }
    if (verb === 'reopen') {
      setDrawerBusy(true, { busyLabel: 'Menyimpan…' });
      reopenTask(_editingId).then(() => {
        setDrawerBusy(false);
        if (typeof _onSaved === 'function') _onSaved();
        close();
      }).catch((err) => { setDrawerBusy(false); showDrawerError(err && err.message ? err.message : 'Gagal membuka kembali.'); });
      return;
    }
    return;
  }

  // ns === 'picker'
  if (verb === 'open') { _pickerOpen = true; _pickerQuery = ''; rerender(); return; }
  if (verb === 'back' || verb === 'done') { _pickerOpen = false; rerender(); return; }
  if (verb === 'toggle') {
    if (_draft.responsible[arg]) delete _draft.responsible[arg];
    else _draft.responsible[arg] = true;
    rerender();
    return;
  }
  if (verb === 'remove') { delete _draft.responsible[arg]; rerender(); return; }
  if (verb === 'selectall') {
    getAgendaCandidates().forEach((c) => { _draft.responsible[c.username] = true; });
    rerender();
    return;
  }
  if (verb === 'clear') { _draft.responsible = {}; rerender(); return; }
}

export function openCreateTaskDrawer(opts = {}) {
  const scopes = writableScopes();
  const defaultScope = opts.defaultScope && scopes.includes(opts.defaultScope) ? opts.defaultScope : scopes[0];
  if (!defaultScope) return;
  _draft = blankDraft(defaultScope);
  _errors = {}; _pickerOpen = false; _pickerQuery = ''; _editingId = null; _onSaved = opts.onSaved || null; _newChecklistLabel = '';
  registerDirectoryChangeListener(onDirectoryChange);
  openDrawer({
    title: 'Tugas Baru', icon: 'check', body: currentBodyHTML(), footer: footer(),
    onAction, sourceEl: opts.sourceEl,
    onClose: () => unregisterDirectoryChangeListener(onDirectoryChange),
    isDirty: () => Boolean(_draft && (_draft.title || Object.keys(_draft.responsible).length)),
  });
  wireAfterRender();
}

export function openEditTaskDrawer(taskId, opts = {}) {
  const task = getTaskById(taskId);
  if (!task) return;
  _draft = draftFromTask(task);
  _errors = {}; _pickerOpen = false; _pickerQuery = ''; _editingId = taskId; _onSaved = opts.onSaved || null; _newChecklistLabel = '';
  registerDirectoryChangeListener(onDirectoryChange);
  openDrawer({
    title: 'Ubah Tugas', icon: 'check', body: currentBodyHTML(), footer: footer(),
    onAction, sourceEl: opts.sourceEl,
    onClose: () => unregisterDirectoryChangeListener(onDirectoryChange),
    isDirty: () => true,
  });
  wireAfterRender();
}

export { closeDrawer as closeTaskDrawer };
