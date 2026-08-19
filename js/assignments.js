/* ============================================================
   ASSIGNMENTS.JS — Assignment CRUD & Form Logic
   
   Add/edit/delete assignments, form validation, conflict detection,
   time input formatting, form modal handlers.
   ============================================================ */

'use strict';

import { generateId, timeToMinutes, minutesToTime, showToast, initCustomTimeInputPair, getCombinedTimeFromPair, setTimeFieldsFromValue, normalizeTimeValue, expandDateRange, formatDateShort, addHoursToTime, todayString, offsetDate } from './utils.js';
import { getDriverByName } from './drivers.js';
import { hasPermission, getCurrentUser } from './auth.js';
import { initFormGuard, resetDirty } from './form-guard.js';
import { syncPbsiSelect } from './pbsi-select.js';
import { initPbsiDatepicker, syncPbsiDatepicker } from './pbsi-datepicker.js';
import { runSaveFeedback } from './components/save-feedback.js';
import { validateRequired, validateTimeFormat, validateTimeRange, validateDateRange } from './validation.js';
import { anIcon } from './analytics/analytics-shell.js';

/* ── Module State ── */
// v1.15.6: UI-only sentinel for the "Tanpa Kendaraan" dropdown option. NEVER
// persisted — handleFormSubmit normalizes it to the official representation
// `vehicle: ''` (assignment performed with a requester / non-PBSI vehicle).
const NO_VEHICLE_SENTINEL = '__none__';
// v1.27.0: same convention for the driver select's "Tanpa Driver" (Self-Drive
// Assignment) option. NEVER persisted — normalized to `driver: ''` below.
const NO_DRIVER_SENTINEL = '__none__';
let assignments = [];
let editingId = null; // null = add mode, or ID = edit mode
let onSaveCallback = null;
let onPersistCallback = null; // v1.28.4: async (records) => {ok, error} — actual Firebase write, awaited BEFORE local state changes
let currentDate = null;

/**
 * Register callback untuk saat save assignment
 * @param {Function} callback - callback(assignments, isNewAssignment)
 */
export function registerSaveCallback(callback) {
  onSaveCallback = callback;
}

/**
 * v1.28.4 — Register the PERSIST callback: the actual Firebase write for
 * assignment create/edit. Must be an async function that takes an array of
 * assignment records (length 1 for single-day create or edit, length N for
 * a multi-day create) and resolves `{ok:true}` or `{ok:false, error}`.
 *
 * This runs BEFORE any local state mutation. Firebase is the source of
 * truth: `handleFormSubmit` awaits this and only updates the in-memory
 * `assignments` array / fires the success toast / calls onSaveCallback
 * AFTER it resolves `{ok:true}`. On `{ok:false, ...}` nothing local changes
 * — no ghost assignment, modal stays open, user input is preserved, and
 * the Simpan button re-enables for retry.
 * @param {Function} callback - async (records: Array<Object>) => {ok, error?}
 */
export function registerPersistCallback(callback) {
  onPersistCallback = callback;
}

/**
 * Set assignments array
 * @param {Array} newAssignments
 */
export function setAssignments(newAssignments) {
  assignments = newAssignments;
}

/**
 * Set current date untuk default di form add
 * @param {string} dateStr
 */
export function setCurrentDate(dateStr) {
  currentDate = dateStr;
}

/**
 * Get the operational assignments array (read-only consumers, e.g. the
 * read-only Request Intelligence panel). Same array app.js pushes via
 * setAssignments — exposed so additive read-only features need no new plumbing.
 * @returns {Array}
 */
export function getAssignments() {
  return assignments;
}

/**
 * Get ID assignment yang sedang diedit
 * @returns {string|null}
 */
export function getEditingId() {
  return editingId;
}

/**
 * Initialize form handlers dan time input formatting
 */
export function initFormHandlers() {
  // Submit form
  const form = document.getElementById('assignmentForm');
  if (form) {
    form.addEventListener('submit', handleFormSubmit);
  }

  // Custom time input behavior untuk mobile
  initTimeInputs();

  // PBSI Stepper for passenger count
  initPaxStepper();

  // Multi-day checkbox
  const multiDayCheckbox = document.getElementById('assignmentMultiDay');
  if (multiDayCheckbox) {
    multiDayCheckbox.addEventListener('change', syncAssignmentMultiDayUI);
  }

  // Full-day checkbox
  const fullDayCheckbox = document.getElementById('assignmentFullDay');
  if (fullDayCheckbox) {
    fullDayCheckbox.addEventListener('change', syncFullDayUI);
  }

  // Real-time conflict preview
  initConflictPreview();

  // Design System Program Phase 5 — blur doesn't bubble, so this listens in
  // the CAPTURE phase on the form itself. Only clears/refreshes a field that
  // is CURRENTLY showing an error (revalidateFieldOnBlur no-ops otherwise) —
  // never introduces a new error for a field the user hasn't submitted
  // against yet.
  if (form) {
    form.addEventListener('blur', (ev) => {
      const fieldId = ev.target?.id;
      if (!fieldId) return;
      const owner = VALIDATED_FIELD_IDS.includes(fieldId)
        ? fieldId
        : VALIDATED_FIELD_IDS.find((id) => _fieldErrorInputs(id).includes(ev.target));
      if (owner) revalidateFieldOnBlur(owner);
    }, true);
  }

  // Data-loss guard: disables backdrop close, intercepts X/Cancel, shows
  // confirmation dialog when form is dirty. Owns btnCloseForm + btnCancelForm.
  initFormGuard({
    formId:    'assignmentForm',
    overlayId: 'modalForm',
    closeIds:  ['btnCloseForm', 'btnCancelForm'],
    closeFn:   closeFormModal,
  });

  // PBSI Date Picker — start date
  initPbsiDatepicker(document.getElementById('fieldDate'), {
    presets: [
      { label: 'Hari Ini', getValue: () => todayString() },
      { label: 'Besok',    getValue: () => offsetDate(todayString(), 1) },
      { label: 'Lusa',     getValue: () => offsetDate(todayString(), 2) },
      { label: 'Pilih Tanggal', openCalendar: true },
    ],
  });

  // PBSI Date Picker — end date (presets relative to current start date)
  initPbsiDatepicker(document.getElementById('fieldEndDate'), {
    presets: [
      { label: 'Sama Hari', getValue: () => document.getElementById('fieldDate').value || todayString() },
      { label: '+1 Hari',   getValue: () => offsetDate(document.getElementById('fieldDate').value || todayString(), 1) },
      { label: '+2 Hari',   getValue: () => offsetDate(document.getElementById('fieldDate').value || todayString(), 2) },
      { label: 'Pilih Tanggal', openCalendar: true },
    ],
  });

  // When start date changes, re-evaluate end date preset active states
  document.getElementById('fieldDate')?.addEventListener('change', () => {
    syncPbsiDatepicker(document.getElementById('fieldEndDate'));
  });
}

function syncAssignmentMultiDayUI() {
  const checked = document.getElementById('assignmentMultiDay')?.checked;
  const endDateGroup = document.getElementById('assignmentEndDateGroup');
  const fieldDateLabel = document.getElementById('fieldDateLabel');
  const endDateInput = document.getElementById('fieldEndDate');
  if (!endDateGroup) return;

  if (checked) {
    endDateGroup.classList.add('visible');
    if (endDateInput) endDateInput.required = true;
    if (fieldDateLabel) fieldDateLabel.textContent = 'Tanggal Mulai *';
  } else {
    endDateGroup.classList.remove('visible');
    if (endDateInput) {
      endDateInput.required = false;
      endDateInput.value = '';
      syncPbsiDatepicker(endDateInput);
    }
    if (fieldDateLabel) fieldDateLabel.textContent = 'Tanggal *';
  }
}

function syncFullDayUI() {
  const checked = document.getElementById('assignmentFullDay')?.checked;
  const timeStart = document.getElementById('assignmentTimeStart');
  const timeEnd   = document.getElementById('assignmentTimeEnd');
  [timeStart, timeEnd].forEach(group => {
    if (!group) return;
    group.classList.toggle('time-group-disabled', !!checked);
    group.querySelectorAll('input').forEach(el => { el.disabled = !!checked; });
  });
}

/**
 * Open form modal dalam mode add atau edit
 * @param {string|null} asgnId - Assignment ID untuk edit, atau null untuk add
 */
export function openFormModal(asgnId = null) {
  if (asgnId && !hasPermission('edit')) {
    showToast('Anda tidak punya akses untuk mengedit jadwal');
    return;
  }

  if (!asgnId && !hasPermission('create')) {
    showToast('Anda tidak punya akses untuk menambah jadwal');
    return;
  }

  editingId = asgnId;
  const form = document.getElementById('assignmentForm');
  if (form) form.reset();
  clearAllFieldErrors(); // Design System Program Phase 5 — no stale errors from a previous open
  _syncPaxDisplay(0); // reset stepper display after form.reset()
  syncPbsiSelect(document.getElementById('fieldDriver'));
  syncPbsiSelect(document.getElementById('fieldVehicle'));
  syncPbsiDatepicker(document.getElementById('fieldDate'));
  syncPbsiDatepicker(document.getElementById('fieldEndDate'));

  const warning = document.getElementById('conflictWarning');
  if (warning) warning.style.display = 'none';
  const saveBtn = document.getElementById('btnSaveForm');
  if (saveBtn) saveBtn.disabled = false;

  // Always open in single-day mode (edit is always single-date) — reset without animation
  const multiDayCheckbox = document.getElementById('assignmentMultiDay');
  if (multiDayCheckbox) multiDayCheckbox.checked = false;
  const endDateGroupReset = document.getElementById('assignmentEndDateGroup');
  const fieldDateLabelReset = document.getElementById('fieldDateLabel');
  const fieldEndDateReset = document.getElementById('fieldEndDate');
  if (endDateGroupReset) endDateGroupReset.classList.remove('visible');
  if (fieldDateLabelReset) fieldDateLabelReset.textContent = 'Tanggal *';
  if (fieldEndDateReset) { fieldEndDateReset.required = false; fieldEndDateReset.value = ''; }

  // Reset full-day
  const fullDayCb = document.getElementById('assignmentFullDay');
  if (fullDayCb) fullDayCb.checked = false;
  syncFullDayUI();

  const title = document.getElementById('modalFormTitle');
  if (title) {
    title.textContent = asgnId ? 'Edit Jadwal' : 'Tambah Jadwal';
  }

  if (asgnId) {
    // Mode edit: isi form dengan data existing
    const a = assignments.find(x => x.id === asgnId);
    if (a) {
      document.getElementById('fieldId').value          = a.id;
      // v1.27.0: a stored empty driver ('') is the "Tanpa Driver" (Self-Drive)
      // state — select the sentinel option so it shows correctly in edit mode.
      document.getElementById('fieldDriver').value      = (a.driver == null || a.driver === '') ? NO_DRIVER_SENTINEL : a.driver;
      syncPbsiSelect(document.getElementById('fieldDriver'));
      document.getElementById('fieldPhone').value       = a.phone;
      // v1.15.6: a stored empty vehicle ('') is the "Tanpa Kendaraan" state —
      // select the sentinel option so it shows correctly in edit mode.
      document.getElementById('fieldVehicle').value     = (a.vehicle == null || a.vehicle === '') ? NO_VEHICLE_SENTINEL : a.vehicle;
      syncPbsiSelect(document.getElementById('fieldVehicle'));
      document.getElementById('fieldDate').value        = a.date;
      syncPbsiDatepicker(document.getElementById('fieldDate'));
      setTimeFieldsFromValue('fieldStartHour', 'fieldStartMinute', a.startTime);
      setTimeFieldsFromValue('fieldEndHour', 'fieldEndMinute', a.endTime);
      document.getElementById('fieldDestination').value = a.destination;
      document.getElementById('fieldPurpose').value     = a.purpose;
      document.getElementById('fieldPIC').value         = a.pic;
      _syncPaxDisplay(a.pax);
      document.getElementById('fieldNotes').value       = a.notes;

      // Restore full-day state
      const fullDayEdit = document.getElementById('assignmentFullDay');
      if (fullDayEdit) fullDayEdit.checked = !!a.fullDay;
      syncFullDayUI();
    }
  } else {
    // Mode add: default to today's date
    document.getElementById('fieldDate').value = todayString();
    syncPbsiDatepicker(document.getElementById('fieldDate'));
  }

  const modal = document.getElementById('modalForm');
  if (modal) {
    resetDirty('assignmentForm');
    modal.style.display = 'flex';
  }
}

/**
 * Close form modal dan reset state
 */
export function closeFormModal() {
  const modal = document.getElementById('modalForm');
  if (modal) modal.style.display = 'none';
  editingId = null;
  const previewEl = document.getElementById('conflictPreview');
  if (previewEl) previewEl.style.display = 'none';
}

/* ============================================================
   Design System Program Phase 5 — per-field inline validation for the
   flagship Assignment Create/Edit form. Each validated field has a sibling
   `<div class="sf-field-error" id="err-{fieldId}" hidden>` in index.html.
   A "fieldId" is either a single input's own id (`fieldDriver`) or a
   paired-input group container's id (`assignmentTimeStart` — Jam Mulai is
   two <input>s, both described by the same error node).
   ============================================================ */
const VALIDATED_FIELD_IDS = [
  'fieldDriver', 'fieldVehicle', 'fieldDate', 'fieldEndDate',
  'assignmentTimeStart', 'assignmentTimeEnd', 'fieldDestination', 'fieldPurpose',
];

function _fieldErrorInputs(fieldId) {
  const el = document.getElementById(fieldId);
  if (!el) return [];
  return (el.tagName === 'INPUT' || el.tagName === 'SELECT') ? [el] : Array.from(el.querySelectorAll('input,select'));
}

function showFieldError(fieldId, message) {
  const errEl = document.getElementById(`err-${fieldId}`);
  if (!errEl) return;
  errEl.innerHTML = '';
  const iconSpan = document.createElement('span');
  iconSpan.innerHTML = anIcon('alert', { size: 12 });
  iconSpan.style.cssText = 'display:inline-flex;vertical-align:-2px;margin-right:5px;';
  const textSpan = document.createElement('span');
  textSpan.textContent = message;
  errEl.append(iconSpan, textSpan);
  errEl.hidden = false;
  for (const el of _fieldErrorInputs(fieldId)) {
    el.setAttribute('aria-invalid', 'true');
    el.setAttribute('aria-describedby', errEl.id);
  }
}

function clearFieldError(fieldId) {
  const errEl = document.getElementById(`err-${fieldId}`);
  if (errEl) { errEl.hidden = true; errEl.textContent = ''; }
  for (const el of _fieldErrorInputs(fieldId)) {
    el.removeAttribute('aria-invalid');
    el.removeAttribute('aria-describedby');
  }
}

function clearAllFieldErrors() {
  VALIDATED_FIELD_IDS.forEach(clearFieldError);
}

/** Re-runs ONLY the given field's own check (submit-time re-validates
 *  everything regardless via `runFieldChecks` below). Never introduces a
 *  new error on blur for a field that hasn't been submitted against yet —
 *  only clears/refreshes a field that is CURRENTLY showing an error. */
function revalidateFieldOnBlur(fieldId) {
  const errEl = document.getElementById(`err-${fieldId}`);
  if (!errEl || errEl.hidden) return;
  const [, result] = runFieldChecks().find(([id]) => id === fieldId) || [];
  if (result && result.valid) clearFieldError(fieldId);
  else if (result) showFieldError(fieldId, result.errors[0]);
}

/** Builds the [fieldId, ValidationResult] pairs for every currently-relevant
 *  field (skips fields hidden by Multi Hari / Penuh Hari toggles). Pure read
 *  of current DOM values — safe to call from blur or submit alike. */
function runFieldChecks() {
  const driverRaw   = document.getElementById('fieldDriver').value;
  const vehicleRaw  = document.getElementById('fieldVehicle').value;
  const startDate   = document.getElementById('fieldDate').value;
  const destination = document.getElementById('fieldDestination').value.trim();
  const purpose     = document.getElementById('fieldPurpose').value.trim();
  const isFullDay   = document.getElementById('assignmentFullDay')?.checked ?? false;
  const isMultiDay  = !editingId && (document.getElementById('assignmentMultiDay')?.checked ?? false);
  const startTime   = isFullDay ? '00:00' : getCombinedTimeFromPair('fieldStartHour', 'fieldStartMinute');
  const endTime     = isFullDay ? '23:59' : getCombinedTimeFromPair('fieldEndHour', 'fieldEndMinute');

  const checks = [
    // v1.15.6/v1.27.0: the sentinel option ("Tanpa Kendaraan"/"Tanpa Driver")
    // is itself a valid selection — only an untouched dropdown (raw '') fails.
    ['fieldDriver', validateRequired(driverRaw, 'Driver')],
    ['fieldVehicle', validateRequired(vehicleRaw, 'Kendaraan')],
    ['fieldDate', validateRequired(startDate, 'Tanggal')],
    ['fieldDestination', validateRequired(destination, 'Tujuan')],
    ['fieldPurpose', validateRequired(purpose, 'Keperluan')],
  ];
  if (isMultiDay) {
    const endDate = document.getElementById('fieldEndDate').value;
    checks.push(['fieldEndDate', validateRequired(endDate, 'Tanggal selesai')]);
    checks.push(['fieldEndDate', validateDateRange(startDate, endDate)]);
  }
  if (!isFullDay) {
    checks.push(['assignmentTimeStart', validateTimeFormat(startTime, 'Jam mulai', true)]);
    checks.push(['assignmentTimeEnd', validateTimeFormat(endTime, 'Jam selesai', true)]);
    checks.push(['assignmentTimeEnd', validateTimeRange(startTime, endTime)]);
  }
  return checks;
}

/**
 * Handle form submit (add atau update assignment)
 */
async function handleFormSubmit(e) {
  e.preventDefault();

  // Design System Program Phase 3 — re-entrancy guard against a double-click
  // or Enter-key repeat firing a second overlapping submit before the first
  // has visibly started saving. Reads the SAME dataset flag
  // runSaveFeedback() itself uses (js/components/save-feedback.js) rather
  // than a second, parallel guard variable — this is a cheap early-exit
  // only (skips redoing validation/conflict-checking on a rapid double-fire);
  // the actual duplicate-write prevention is runSaveFeedback's own
  // synchronous guard further down, which is authoritative regardless.
  if (document.getElementById('btnSaveForm')?.dataset.sfBusy === '1') return;

  // Safety net: only admin can ever write directly to assignments.
  if (!hasPermission('create')) {
    showToast('Bidang harus membuat request jadwal, bukan jadwal langsung');
    closeFormModal();
    return;
  }

  if (editingId && !hasPermission('edit')) {
    showToast('Anda tidak punya akses untuk mengedit jadwal');
    return;
  }

  // v1.27.0: `driverRaw` is the dropdown value (may be the UI sentinel); `driver`
  // is the persisted value — the sentinel normalizes to '' (Tanpa Driver / Self-Drive).
  const driverRaw   = document.getElementById('fieldDriver').value;
  const driver      = driverRaw === NO_DRIVER_SENTINEL ? '' : driverRaw;
  const phone       = document.getElementById('fieldPhone').value;
  // v1.15.6: `vehicleRaw` is the dropdown value (may be the UI sentinel); `vehicle`
  // is the persisted value — the sentinel normalizes to '' (Tanpa Kendaraan).
  const vehicleRaw  = document.getElementById('fieldVehicle').value;
  const vehicle     = vehicleRaw === NO_VEHICLE_SENTINEL ? '' : vehicleRaw;
  const startDate   = document.getElementById('fieldDate').value;
  const isFullDay   = document.getElementById('assignmentFullDay')?.checked ?? false;
  const startTime   = isFullDay ? '00:00' : getCombinedTimeFromPair('fieldStartHour', 'fieldStartMinute');
  const endTime     = isFullDay ? '23:59' : getCombinedTimeFromPair('fieldEndHour', 'fieldEndMinute');
  const destination = document.getElementById('fieldDestination').value.trim();
  const purpose     = document.getElementById('fieldPurpose').value.trim();
  const pic         = document.getElementById('fieldPIC').value.trim();
  const rawPax      = parseInt(document.getElementById('fieldPax').value, 10);
  const pax         = Number.isNaN(rawPax) ? 0 : rawPax;
  const notes       = document.getElementById('fieldNotes').value.trim();
  const isMultiDay  = !editingId && (document.getElementById('assignmentMultiDay')?.checked ?? false);

  // Design System Program Phase 5 — field-level validation replaces the old
  // all-or-nothing "Lengkapi semua field wajib (*)" toast (which never said
  // WHICH field). Wires js/validation.js's existing pure primitives — see
  // runFieldChecks() above — instead of reimplementing the rules. Gates
  // BEFORE conflict-checking runs and before runSaveFeedback ever fires (no
  // busy-state flash for a client-side validation failure).
  const fieldChecks = runFieldChecks();
  const failedChecks = fieldChecks.filter(([, result]) => !result.valid);
  clearAllFieldErrors();
  if (failedChecks.length > 0) {
    failedChecks.forEach(([fieldId, result]) => showFieldError(fieldId, result.errors[0]));
    // Focus the first failing field's actual input — for a paired-input
    // group (assignmentTimeStart/End) that's the group's first <input>,
    // never the container div itself (not natively focusable).
    _fieldErrorInputs(failedChecks[0][0])[0]?.focus();
    return;
  }

  // Determine date range (validated above: endDate is present and >= startDate when Multi Hari)
  const datesToCreate = isMultiDay
    ? expandDateRange(startDate, document.getElementById('fieldEndDate').value)
    : [startDate];

  // Cek konflik untuk semua tanggal dalam rentang (driver dan kendaraan).
  // v1.15.6: vehicle conflict is SKIPPED for "Tanpa Kendaraan" (vehicle === '') —
  // a requester vehicle is not a bookable PBSI resource, so two such assignments
  // may run concurrently. v1.27.0: driver conflict is likewise SKIPPED for
  // "Tanpa Driver" (driver === '') — there is no real driver to double-book.
  // Vehicle conflict checking always applies when a vehicle is chosen.
  const conflictDates = datesToCreate.filter(d =>
    (driver !== '' && checkConflict(driver, startTime, endTime, d, editingId)) ||
    (vehicle !== '' && checkVehicleConflict(vehicle, startTime, endTime, d, editingId))
  );
  const warningEl     = document.getElementById('conflictWarning');
  const warningDatesEl = document.getElementById('conflictWarningDates');

  if (conflictDates.length > 0) {
    if (warningEl) warningEl.style.display = 'block';
    if (warningDatesEl) {
      warningDatesEl.textContent = conflictDates.length > 1
        ? `Tanggal konflik: ${conflictDates.map(d => formatDateShort(d)).join(', ')}`
        : '';
    }
    return;
  } else {
    if (warningEl) warningEl.style.display = 'none';
    if (warningDatesEl) warningDatesEl.textContent = '';
  }

  const currentUser = getCurrentUser();
  const now = new Date().toISOString();

  // v1.28.4 REQUIRED FLOW: build the record(s) first (pure, no state
  // mutation yet), PERSIST to Firebase, and only touch local `assignments` /
  // fire the success toast / notify onSaveCallback AFTER persistence is
  // confirmed. Firebase is the source of truth — nothing here shows success
  // before the write actually succeeds, and a failure leaves no local ghost
  // record: local state is untouched, the modal stays open, the user's
  // input is preserved, and Simpan re-enables for retry.
  let records;          // the record(s) this submit will persist
  let kind;              // 'edit' | 'multi' | 'single' — drives the commit step below
  let previousAssignment = null;
  let editIdx = -1;

  if (editingId) {
    kind = 'edit';
    editIdx = assignments.findIndex(a => a.id === editingId);
    if (editIdx === -1) {
      showToast('⚠️ Jadwal tidak ditemukan (mungkin sudah dihapus di tempat lain)');
      return;
    }
    const existing = assignments[editIdx];
    previousAssignment = existing;
    const edited = {
      id: editingId,
      driver, phone, vehicle, date: startDate,
      startTime, endTime, destination, purpose, pic, pax, notes,
      fullDay: isFullDay,
      createdAt:   existing.createdAt,
      createdBy:   existing.createdBy   ?? null,  // preserve — set at creation time only
      updatedAt:   now,
      requestId:   existing.requestId   ?? null,
      status:      existing.status      ?? 'assigned',
      approvedAt:  existing.approvedAt  ?? null,
      approvedBy:  existing.approvedBy  ?? null,
      assignedAt:  existing.assignedAt  ?? null,
      assignedBy:  existing.assignedBy  ?? null,
      startedAt:   existing.startedAt   ?? null,
      startedBy:   existing.startedBy   ?? null,
      completedAt: existing.completedAt ?? null,
      completedBy: existing.completedBy ?? null,
      startOdometer:     existing.startOdometer     ?? null,
      endOdometer:       existing.endOdometer       ?? null,
      distanceTravelled: existing.distanceTravelled ?? null,
    };
    records = [edited];
  } else if (datesToCreate.length > 1) {
    kind = 'multi';
    const creatorName = currentUser ? currentUser.name : '';
    records = datesToCreate.map(date => ({
      id: generateId(),
      driver, phone, vehicle, date,
      startTime, endTime, destination, purpose, pic, pax, notes,
      fullDay: isFullDay,
      createdAt: now, createdBy: creatorName, updatedAt: now,
      status: 'assigned',
      assignedAt: now, assignedBy: creatorName,
      approvedAt: null, approvedBy: null,
      startedAt: null, startedBy: null,
      completedAt: null, completedBy: null,
      startOdometer: null, endOdometer: null, distanceTravelled: null,
    }));
  } else {
    kind = 'single';
    const creatorName = currentUser ? currentUser.name : '';
    records = [{
      id: generateId(),
      driver, phone, vehicle, date: startDate,
      startTime, endTime, destination, purpose, pic, pax, notes,
      fullDay: isFullDay,
      createdAt: now, createdBy: creatorName, updatedAt: now,
      status: 'assigned',
      assignedAt: now, assignedBy: creatorName,
      approvedAt: null, approvedBy: null,
      startedAt: null, startedBy: null,
      completedAt: null, completedBy: null,
      startOdometer: null, endOdometer: null, distanceTravelled: null,
    }];
  }

  // Design System Program Phase 3 — the real Firebase write is awaited
  // INSIDE runSaveFeedback's operation(); success/error/the record-pulse are
  // all driven by the shared primitive (js/components/save-feedback.js), not
  // hand-rolled here. Same persist call, same success/failure branching as
  // before this phase — only the visual/state-machine plumbing moved.
  await runSaveFeedback({
    button: document.getElementById('btnSaveForm'),
    alsoDisable: [document.getElementById('btnCancelForm')].filter(Boolean),
    errorRegion: document.getElementById('assignmentFormError'),
    operation: async () => (onPersistCallback
      ? await onPersistCallback(records)
      : { ok: true }), // no persist callback registered (e.g. isolated/test usage) — degrade to local-only, unchanged from pre-v1.28.4 behavior
    onSuccess: () => {
      // Firebase has confirmed the write. Only now does local state change,
      // immutably (see v1.28.3 note below on why in-place push()/index-
      // mutation was the original bug).
      if (kind === 'edit') {
        assignments = assignments.map((a, i) => (i === editIdx ? records[0] : a));
        showToast('✅ Jadwal berhasil diperbarui');
        if (onSaveCallback) onSaveCallback(assignments, false, startDate, records[0], previousAssignment);
      } else if (kind === 'multi') {
        // v1.28.3 CRITICAL FIX (kept from the prior hardening pass): build a
        // NEW array instead of `assignments.push(...records)` in place, and
        // pass `records` explicitly to onSaveCallback instead of `null` —
        // in-place mutation of the array app.js also references made a
        // before/after diff in app.js always return empty, so multi-day
        // Firebase writes were silently skipped entirely. See CLAUDE.md /
        // commit history v1.28.3 for the full root-cause writeup.
        assignments = [...assignments, ...records];
        showToast(`✅ ${records.length} jadwal berhasil ditambahkan`);
        if (onSaveCallback) onSaveCallback(assignments, true, startDate, records);
      } else {
        assignments = [...assignments, records[0]];
        showToast('✅ Jadwal berhasil ditambahkan');
        if (onSaveCallback) onSaveCallback(assignments, true, startDate, records[0]);
      }

      // Reset edit mode dan update current date — only reached on success.
      editingId = null;
      if (currentDate !== startDate) currentDate = startDate;

      resetDirty('assignmentForm');
      closeFormModal();
    },
    onError: () => {
      // FAILURE: no local mutation happened, so there is nothing to roll
      // back. Modal stays open (runSaveFeedback's onSuccess, which calls
      // closeFormModal(), never fires), the user's entered data is
      // untouched, and Simpan is already re-enabled so they can retry.
      // Design System Program Phase 5 — the inline `errorRegion` (wired
      // below via runSaveFeedback's own `errorRegion` option) is now the
      // SOLE error surface for this save; this used to also fire its own
      // generic toast on top, showing two uncoordinated messages for one
      // failure. The curated, non-raw message now comes from
      // js/firebase.js's _curateFirebaseError via onPersistCallback.
    },
    pulseTarget: () => {
      // The board (js/timeline.js:226) and list view (js/app.js:3750) both
      // fully tear down and rebuild on every render — query the FRESH node
      // AFTER onSuccess's re-render, never a pre-render reference (already
      // detached by the time this resolves). Multi-day create has no single
      // "the" record to point at, so it's skipped (returns null).
      const id = (kind === 'edit' || kind === 'single') ? records[0].id : null;
      if (!id) return null;
      return document.querySelector(`.assignment-block[data-id="${CSS.escape(id)}"]`)
        || document.querySelector(`[data-list-id="${CSS.escape(id)}"]`);
    },
  });
}

/**
 * Check apakah ada konflik jadwal untuk driver tertentu
 * di tanggal dan rentang waktu yang diberikan
 * @param {string} driverName
 * @param {string} startTime - Format HH:MM
 * @param {string} endTime   - Format HH:MM
 * @param {string} date      - Format YYYY-MM-DD
 * @param {string|null} excludeId - ID assignment untuk ignore (saat edit)
 * @returns {boolean} - true jika ada konflik
 */
export function checkConflict(driverName, startTime, endTime, date, excludeId = null) {
  const startMin = timeToMinutes(startTime);
  const endMin   = timeToMinutes(endTime);

  return assignments.some(a => {
    if (a.id === excludeId) return false; // Ignore diri sendiri
    if (a.status === 'cancelled') return false; // Dibatalkan tidak memakai kapasitas
    if (a.driver !== driverName) return false; // Beda driver
    if (a.date !== date) return false; // Beda tanggal

    const aStart = timeToMinutes(a.startTime);
    const aEnd   = timeToMinutes(a.endTime);

    // Cek overlap: range baru overlap dengan range yang ada?
    return startMin < aEnd && endMin > aStart;
  });
}

/**
 * Check whether a vehicle is already assigned to another assignment that overlaps
 * the given time window on the given date.
 * @param {string} vehicleName
 * @param {string} startTime - HH:MM
 * @param {string} endTime   - HH:MM
 * @param {string} date      - YYYY-MM-DD
 * @param {string|null} excludeId
 * @returns {boolean}
 */
export function checkVehicleConflict(vehicleName, startTime, endTime, date, excludeId = null) {
  const startMin = timeToMinutes(startTime);
  const endMin   = timeToMinutes(endTime);

  return assignments.some(a => {
    if (a.id === excludeId) return false;
    if (a.status === 'cancelled') return false; // Dibatalkan tidak memakai kapasitas
    if (a.vehicle !== vehicleName) return false;
    if (a.date !== date) return false;
    const aStart = timeToMinutes(a.startTime);
    const aEnd   = timeToMinutes(a.endTime);
    return startMin < aEnd && endMin > aStart;
  });
}

/**
 * Create and persist a single assignment from a plain field object — the
 * non-form entry point used by the Timeline's Paste/Duplicate context-menu
 * actions (js/timeline-interactions.js). Runs the SAME conflict guards
 * (checkConflict/checkVehicleConflict) and the SAME onSaveCallback pipeline
 * (localStorage + surgical Firebase write + audit log) as the manual form's
 * single-day create path — never a second, divergent persistence path.
 * @param {Object} fields { driver, phone?, vehicle, date, startTime, endTime, destination, purpose, pic?, pax?, notes?, fullDay? }
 * @returns {{ok:true, assignment:Object}|{ok:false, reason:string}}
 */
export function createAssignmentDirect(fields = {}) {
  if (!hasPermission('create')) return { ok: false, reason: 'permission' };

  const {
    driver = '', phone = '', vehicle = '', date, startTime, endTime,
    destination = '', purpose = '', pic = '', pax = 0, notes = '', fullDay = false,
  } = fields;

  if (!date || !startTime || !endTime || !destination || !purpose) {
    return { ok: false, reason: 'invalid' };
  }
  if (!fullDay && timeToMinutes(endTime) <= timeToMinutes(startTime)) {
    return { ok: false, reason: 'invalid' };
  }
  if (driver !== '' && checkConflict(driver, startTime, endTime, date)) {
    return { ok: false, reason: 'driver_conflict' };
  }
  if (vehicle !== '' && checkVehicleConflict(vehicle, startTime, endTime, date)) {
    return { ok: false, reason: 'vehicle_conflict' };
  }

  const currentUser = getCurrentUser();
  const now = new Date().toISOString();
  const creatorName = currentUser ? currentUser.name : '';
  const newAssignment = {
    id: generateId(),
    driver, phone, vehicle, date, startTime, endTime, destination, purpose, pic, pax, notes,
    fullDay: !!fullDay,
    createdAt: now, createdBy: creatorName, updatedAt: now,
    status: 'assigned',
    assignedAt: now, assignedBy: creatorName,
    approvedAt: null, approvedBy: null,
    startedAt: null, startedBy: null,
    completedAt: null, completedBy: null,
    startOdometer: null, endOdometer: null, distanceTravelled: null,
  };
  assignments.push(newAssignment);
  if (onSaveCallback) onSaveCallback(assignments, true, date, newAssignment);
  return { ok: true, assignment: newAssignment };
}

/**
 * Update an existing assignment's date/time/driver from a plain patch — the
 * non-form entry point used by the Timeline's drag (move/reassign) and
 * resize (duration change) interactions. Only Planned ('assigned' status)
 * assignments should ever reach this (the caller gates that); it still runs
 * the SAME conflict guards as the manual edit form so a drag/resize can never
 * silently create an overlap, and persists through the SAME onSaveCallback
 * pipeline as every other edit path.
 * @param {string} id
 * @param {{driver?:string, date?:string, startTime?:string, endTime?:string}} patch
 * @returns {{ok:true, assignment:Object}|{ok:false, reason:string}}
 */
export function updateAssignmentDirect(id, patch = {}) {
  if (!hasPermission('edit')) return { ok: false, reason: 'permission' };

  const idx = assignments.findIndex(a => a.id === id);
  if (idx === -1) return { ok: false, reason: 'not_found' };
  const existing = assignments[idx];

  const driver    = patch.driver    ?? existing.driver;
  const date      = patch.date      ?? existing.date;
  const startTime = patch.startTime ?? existing.startTime;
  const endTime   = patch.endTime   ?? existing.endTime;

  if (!existing.fullDay && timeToMinutes(endTime) <= timeToMinutes(startTime)) {
    return { ok: false, reason: 'invalid' };
  }
  if (driver !== '' && checkConflict(driver, startTime, endTime, date, id)) {
    return { ok: false, reason: 'driver_conflict' };
  }
  if (existing.vehicle !== '' && checkVehicleConflict(existing.vehicle, startTime, endTime, date, id)) {
    return { ok: false, reason: 'vehicle_conflict' };
  }

  const now = new Date().toISOString();
  assignments[idx] = { ...existing, driver, date, startTime, endTime, updatedAt: now };
  if (onSaveCallback) onSaveCallback(assignments, false, date, assignments[idx], existing);
  return { ok: true, assignment: assignments[idx] };
}

/**
 * Delete assignment by ID
 * @param {string} id
 */
export function deleteAssignment(id) {
  assignments = assignments.filter(a => a.id !== id);
  if (onSaveCallback) {
    onSaveCallback(assignments, false);
  }
}

/**
 * Set up real-time conflict preview listeners on the assignment form.
 * Called once from initFormHandlers.
 */
function initConflictPreview() {
  const watchIds = [
    'fieldDriver', 'fieldVehicle', 'fieldDate', 'fieldEndDate',
    'fieldStartHour', 'fieldStartMinute', 'fieldEndHour', 'fieldEndMinute',
  ];
  watchIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('change', runConflictPreview);
      el.addEventListener('blur',   runConflictPreview);
    }
  });
  document.getElementById('assignmentMultiDay')?.addEventListener('change', runConflictPreview);
  document.getElementById('assignmentFullDay')?.addEventListener('change',  runConflictPreview);
}

/**
 * Run the advisory conflict preview — checks driver AND vehicle overlaps
 * across all selected dates. Updates #conflictPreview. Advisory only; does
 * not block submission (the hard block happens on submit via checkConflict).
 */
function runConflictPreview() {
  const previewEl = document.getElementById('conflictPreview');
  if (!previewEl) return;

  // v1.27.0: normalize the sentinel so the driver preview is skipped for
  // "Tanpa Driver" (driver === '') exactly like the hard check on submit.
  const driverRaw  = document.getElementById('fieldDriver')?.value;
  const driver     = driverRaw === NO_DRIVER_SENTINEL ? '' : driverRaw;
  // v1.15.6: normalize the sentinel so the vehicle preview is skipped for
  // "Tanpa Kendaraan" (vehicle === '') exactly like the hard check on submit.
  const vehicleRaw = document.getElementById('fieldVehicle')?.value;
  const vehicle    = vehicleRaw === NO_VEHICLE_SENTINEL ? '' : vehicleRaw;
  const date       = document.getElementById('fieldDate')?.value;
  const isFullDay  = document.getElementById('assignmentFullDay')?.checked ?? false;
  const isMultiDay = document.getElementById('assignmentMultiDay')?.checked ?? false;

  if (!date) { previewEl.style.display = 'none'; return; }

  const startTime = isFullDay ? '00:00' : getCombinedTimeFromPair('fieldStartHour', 'fieldStartMinute');
  const endTime   = isFullDay ? '23:59' : getCombinedTimeFromPair('fieldEndHour', 'fieldEndMinute');

  if (!isFullDay && (!startTime || !endTime)) { previewEl.style.display = 'none'; return; }

  const endDateVal = isMultiDay ? (document.getElementById('fieldEndDate')?.value || date) : date;
  const dates = (isMultiDay && endDateVal >= date)
    ? expandDateRange(date, endDateVal)
    : [date];

  const warnings = [];

  if (driver) {
    const hits = dates.filter(d => checkConflict(driver, startTime, endTime, d, editingId));
    if (hits.length > 0) {
      warnings.push(
        `⚠ Driver <b>${escPreview(driver)}</b> sudah memiliki jadwal pada ${hits.map(formatDateShort).join(', ')}`
      );
    }
  }

  if (vehicle) {
    const hits = dates.filter(d => checkVehicleConflict(vehicle, startTime, endTime, d, editingId));
    if (hits.length > 0) {
      warnings.push(
        `⚠ Kendaraan <b>${escPreview(vehicle)}</b> sudah digunakan pada ${hits.map(formatDateShort).join(', ')}`
      );
    }
  }

  const saveBtn = document.getElementById('btnSaveForm');
  if (warnings.length > 0) {
    previewEl.innerHTML = warnings.join('<br>');
    previewEl.style.display = 'block';
    if (saveBtn) saveBtn.disabled = true;
  } else {
    previewEl.style.display = 'none';
    if (saveBtn) saveBtn.disabled = false;
  }
}

function escPreview(value) {
  return String(value || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* ── PBSI Stepper (#fieldPax) ─────────────────────────────── */

const PAX_MIN = 0;
const PAX_MAX = 20;

const _clampPax = (val) => Math.max(PAX_MIN, Math.min(PAX_MAX, parseInt(val, 10) || PAX_MIN));

/**
 * Commit a pax value: clamp to [PAX_MIN, PAX_MAX] and write it to the canonical
 * hidden field, the visible (now editable) display, and the +/- disabled state.
 * This is the single COMMIT path — buttons, arrows, Enter, blur, reset and the
 * edit-populate path all go through it, so the visible input is normalised.
 */
function _syncPaxDisplay(val) {
  const n = _clampPax(val);
  const hidden  = document.getElementById('fieldPax');
  const display = document.getElementById('paxDisplay');
  const minus   = document.getElementById('btnPaxMinus');
  const plus    = document.getElementById('btnPaxPlus');
  if (hidden)  hidden.value = n;
  if (display) display.value = n;
  if (minus)   minus.disabled = n <= PAX_MIN;
  if (plus)    plus.disabled  = n >= PAX_MAX;
}

function initPaxStepper() {
  const minus   = document.getElementById('btnPaxMinus');
  const plus    = document.getElementById('btnPaxPlus');
  const display = document.getElementById('paxDisplay');
  if (!minus || !plus) return;

  const current = () => parseInt(document.getElementById('fieldPax')?.value, 10) || PAX_MIN;

  minus.addEventListener('click', () => _syncPaxDisplay(current() - 1));
  plus.addEventListener('click',  () => _syncPaxDisplay(current() + 1));

  // Arrow key support when a stepper button has keyboard focus
  [minus, plus].forEach(btn => {
    btn.addEventListener('keydown', e => {
      if (e.key === 'ArrowUp')   { e.preventDefault(); _syncPaxDisplay(current() + 1); }
      if (e.key === 'ArrowDown') { e.preventDefault(); _syncPaxDisplay(current() - 1); }
    });
  });

  // ── Manual numeric input (v1.18.3.3) ──
  // The middle display is now an editable numeric field. While the user types
  // we only strip non-digits and live-update the canonical hidden value +
  // button states; we do NOT rewrite the visible field mid-typing (so e.g.
  // clearing it to retype, or typing a second digit, is not clobbered). The
  // value is normalised (empty/NaN/negative → 0, clamped to max) on commit
  // (blur / Enter) and on every button/arrow press via _syncPaxDisplay.
  if (display) {
    display.addEventListener('input', () => {
      const cleaned = display.value.replace(/[^0-9]/g, '');
      if (cleaned !== display.value) {
        const caret = Math.max(0, (display.selectionStart || 0) - 1);
        display.value = cleaned;
        try { display.setSelectionRange(caret, caret); } catch (_) { /* ignore */ }
      }
      const n = _clampPax(cleaned);
      const hidden = document.getElementById('fieldPax');
      if (hidden) hidden.value = n;
      minus.disabled = n <= PAX_MIN;
      plus.disabled  = n >= PAX_MAX;
    });

    // Commit on blur and Enter; Enter must not submit the form.
    display.addEventListener('blur', () => _syncPaxDisplay(display.value));
    display.addEventListener('keydown', e => {
      if (e.key === 'Enter')     { e.preventDefault(); display.blur(); }
      if (e.key === 'ArrowUp')   { e.preventDefault(); _syncPaxDisplay(current() + 1); }
      if (e.key === 'ArrowDown') { e.preventDefault(); _syncPaxDisplay(current() - 1); }
    });

    // Prevent the scroll wheel from changing the value while focused.
    display.addEventListener('wheel', e => { if (document.activeElement === display) e.preventDefault(); }, { passive: false });
  }
}

/**
 * Initialize custom numeric time inputs for mobile/time entry.
 */
function initTimeInputs() {
  initCustomTimeInputPair('fieldStartHour', 'fieldStartMinute');
  initCustomTimeInputPair('fieldEndHour', 'fieldEndMinute');

  // Auto-fill Jam Selesai = Jam Mulai + 2h jika Jam Selesai masih kosong
  const startMin = document.getElementById('fieldStartMinute');
  if (startMin) {
    startMin.addEventListener('blur', () => {
      autoFillEndTime('fieldStartHour', 'fieldStartMinute', 'fieldEndHour', 'fieldEndMinute');
    });
  }
}

function autoFillEndTime(startHourId, startMinId, endHourId, endMinId) {
  const startTime = getCombinedTimeFromPair(startHourId, startMinId);
  if (!startTime) return;
  const endHourEl = document.getElementById(endHourId);
  const endMinEl  = document.getElementById(endMinId);
  if (!endHourEl || !endMinEl) return;
  if (endHourEl.value || endMinEl.value) return; // sudah diisi manual
  setTimeFieldsFromValue(endHourId, endMinId, addHoursToTime(startTime, 2));
}

/**
 * Validate format time from custom fields.
 */
function validateTimeInput(input) {
  const val = normalizeTimeValue(input);

  if (val && !/^([01]\d|2[0-3]):([0-5]\d)$/.test(val)) {
    showToast('⚠️ Format jam tidak valid (gunakan HH:MM)');
    input.focus();
  }
}

console.info('Assignments module loaded');
