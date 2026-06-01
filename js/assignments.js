/* ============================================================
   ASSIGNMENTS.JS — Assignment CRUD & Form Logic
   
   Add/edit/delete assignments, form validation, conflict detection,
   time input formatting, form modal handlers.
   ============================================================ */

'use strict';

import { generateId, timeToMinutes, minutesToTime, showToast, initCustomTimeInputPair, getCombinedTimeFromPair, setTimeFieldsFromValue, normalizeTimeValue, expandDateRange, formatDateShort, addHoursToTime } from './utils.js';
import { getDriverByName } from './drivers.js';
import { hasPermission, getCurrentUser } from './auth.js';

/* ── Module State ── */
let assignments = [];
let editingId = null; // null = add mode, or ID = edit mode
let onSaveCallback = null;
let currentDate = null;

/**
 * Register callback untuk saat save assignment
 * @param {Function} callback - callback(assignments, isNewAssignment)
 */
export function registerSaveCallback(callback) {
  onSaveCallback = callback;
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
  // Button "Batal" di form
  const btnCancel = document.getElementById('btnCancelForm');
  if (btnCancel) {
    btnCancel.addEventListener('click', closeFormModal);
  }

  // Button "X" (close) di form
  const btnClose = document.getElementById('btnCloseForm');
  if (btnClose) {
    btnClose.addEventListener('click', closeFormModal);
  }

  // Submit form
  const form = document.getElementById('assignmentForm');
  if (form) {
    form.addEventListener('submit', handleFormSubmit);
  }

  // Custom time input behavior untuk mobile
  initTimeInputs();

  // Multi-day checkbox
  const multiDayCheckbox = document.getElementById('assignmentMultiDay');
  if (multiDayCheckbox) {
    multiDayCheckbox.addEventListener('change', syncAssignmentMultiDayUI);
  }

  // Click di luar modal untuk tutup
  const modalForm = document.getElementById('modalForm');
  if (modalForm) {
    modalForm.addEventListener('click', (e) => {
      if (e.target === modalForm) closeFormModal();
    });
  }
}

function syncAssignmentMultiDayUI() {
  const checked = document.getElementById('assignmentMultiDay')?.checked;
  const endDateGroup = document.getElementById('assignmentEndDateGroup');
  const fieldDateLabel = document.getElementById('fieldDateLabel');
  const endDateInput = document.getElementById('fieldEndDate');
  if (!endDateGroup) return;

  if (checked) {
    endDateGroup.style.display = 'flex';
    requestAnimationFrame(() => endDateGroup.classList.add('visible'));
    if (endDateInput) endDateInput.required = true;
    if (fieldDateLabel) fieldDateLabel.textContent = 'Tanggal Mulai *';
  } else {
    endDateGroup.classList.remove('visible');
    if (endDateInput) {
      endDateInput.required = false;
      endDateInput.value = '';
    }
    if (fieldDateLabel) fieldDateLabel.textContent = 'Tanggal *';
    endDateGroup.addEventListener('transitionend', () => {
      if (!document.getElementById('assignmentMultiDay')?.checked) {
        endDateGroup.style.display = 'none';
      }
    }, { once: true });
  }
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

  const warning = document.getElementById('conflictWarning');
  if (warning) warning.style.display = 'none';

  // Always open in single-day mode (edit is always single-date) — reset without animation
  const multiDayCheckbox = document.getElementById('assignmentMultiDay');
  if (multiDayCheckbox) multiDayCheckbox.checked = false;
  const endDateGroupReset = document.getElementById('assignmentEndDateGroup');
  const fieldDateLabelReset = document.getElementById('fieldDateLabel');
  const fieldEndDateReset = document.getElementById('fieldEndDate');
  if (endDateGroupReset) { endDateGroupReset.classList.remove('visible'); endDateGroupReset.style.display = 'none'; }
  if (fieldDateLabelReset) fieldDateLabelReset.textContent = 'Tanggal *';
  if (fieldEndDateReset) { fieldEndDateReset.required = false; fieldEndDateReset.value = ''; }

  const title = document.getElementById('modalFormTitle');
  if (title) {
    title.textContent = asgnId ? 'Edit Jadwal' : 'Tambah Jadwal';
  }

  if (asgnId) {
    // Mode edit: isi form dengan data existing
    const a = assignments.find(x => x.id === asgnId);
    if (a) {
      document.getElementById('fieldId').value          = a.id;
      document.getElementById('fieldDriver').value      = a.driver;
      document.getElementById('fieldPhone').value       = a.phone;
      document.getElementById('fieldVehicle').value     = a.vehicle;
      document.getElementById('fieldDate').value        = a.date;
      setTimeFieldsFromValue('fieldStartHour', 'fieldStartMinute', a.startTime);
      setTimeFieldsFromValue('fieldEndHour', 'fieldEndMinute', a.endTime);
      document.getElementById('fieldDestination').value = a.destination;
      document.getElementById('fieldPurpose').value     = a.purpose;
      document.getElementById('fieldPIC').value         = a.pic;
      document.getElementById('fieldPax').value         = a.pax;
      document.getElementById('fieldNotes').value       = a.notes;
    }
  } else {
    // Mode add: set default date ke current date
    if (currentDate) {
      document.getElementById('fieldDate').value = currentDate;
    }
  }

  const modal = document.getElementById('modalForm');
  if (modal) modal.style.display = 'flex';
}

/**
 * Close form modal dan reset state
 */
export function closeFormModal() {
  const modal = document.getElementById('modalForm');
  if (modal) modal.style.display = 'none';
  editingId = null;
}

/**
 * Handle form submit (add atau update assignment)
 */
function handleFormSubmit(e) {
  e.preventDefault();

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

  const driver      = document.getElementById('fieldDriver').value;
  const phone       = document.getElementById('fieldPhone').value;
  const vehicle     = document.getElementById('fieldVehicle').value;
  const startDate   = document.getElementById('fieldDate').value;
  const startTime   = getCombinedTimeFromPair('fieldStartHour', 'fieldStartMinute');
  const endTime     = getCombinedTimeFromPair('fieldEndHour', 'fieldEndMinute');
  const destination = document.getElementById('fieldDestination').value.trim();
  const purpose     = document.getElementById('fieldPurpose').value.trim();
  const pic         = document.getElementById('fieldPIC').value.trim();
  const pax         = parseInt(document.getElementById('fieldPax').value) || 1;
  const notes       = document.getElementById('fieldNotes').value.trim();
  const isMultiDay  = !editingId && (document.getElementById('assignmentMultiDay')?.checked ?? false);

  // Determine date range
  let datesToCreate = [startDate];
  if (isMultiDay) {
    const endDate = document.getElementById('fieldEndDate').value;
    if (!endDate) {
      showToast('⚠️ Tanggal selesai wajib diisi untuk multi-day');
      return;
    }
    if (endDate < startDate) {
      showToast('⚠️ Tanggal selesai tidak boleh sebelum tanggal mulai');
      return;
    }
    datesToCreate = expandDateRange(startDate, endDate);
  }

  // Validasi dasar
  if (!driver || !vehicle || !startDate || !startTime || !endTime || !destination || !purpose) {
    showToast('⚠️ Lengkapi semua field wajib (*)');
    return;
  }

  if (!/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime)) {
    showToast('⚠️ Format waktu tidak valid');
    return;
  }

  if (timeToMinutes(endTime) <= timeToMinutes(startTime)) {
    showToast('⚠️ Jam selesai harus lebih dari jam mulai');
    return;
  }

  // Cek konflik untuk semua tanggal dalam rentang
  const conflictDates = datesToCreate.filter(d => checkConflict(driver, startTime, endTime, d, editingId));
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

  if (editingId) {
    // Update assignment yang ada (selalu single-date) — preserve all lifecycle fields
    const idx = assignments.findIndex(a => a.id === editingId);
    if (idx !== -1) {
      const existing = assignments[idx];
      assignments[idx] = {
        id: editingId,
        driver, phone, vehicle, date: startDate,
        startTime, endTime, destination, purpose, pic, pax, notes,
        createdAt: existing.createdAt,
        updatedAt: now,
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
      };
    }
    showToast('✅ Jadwal berhasil diperbarui');
    if (onSaveCallback) onSaveCallback(assignments, false, startDate, null);
  } else if (datesToCreate.length > 1) {
    // Multi-day: buat satu assignment per tanggal
    const newAssignments = datesToCreate.map(date => ({
      id: generateId(),
      driver, phone, vehicle, date,
      startTime, endTime, destination, purpose, pic, pax, notes,
      createdAt: now, updatedAt: now,
      status: 'assigned',
      assignedAt: now,
      assignedBy: currentUser ? currentUser.name : '',
      approvedAt: null, approvedBy: null,
      startedAt: null, startedBy: null,
      completedAt: null, completedBy: null,
    }));
    assignments.push(...newAssignments);
    showToast(`✅ ${datesToCreate.length} jadwal berhasil ditambahkan`);
    if (onSaveCallback) onSaveCallback(assignments, true, startDate, null);
  } else {
    // Single-day baru
    const newAssignment = {
      id: generateId(),
      driver, phone, vehicle, date: startDate,
      startTime, endTime, destination, purpose, pic, pax, notes,
      createdAt: now, updatedAt: now,
      status: 'assigned',
      assignedAt: now,
      assignedBy: currentUser ? currentUser.name : '',
      approvedAt: null, approvedBy: null,
      startedAt: null, startedBy: null,
      completedAt: null, completedBy: null,
    };
    assignments.push(newAssignment);
    showToast('✅ Jadwal berhasil ditambahkan');
    if (onSaveCallback) onSaveCallback(assignments, true, startDate, newAssignment);
  }

  // Reset edit mode dan update current date
  editingId = null;
  if (currentDate !== startDate) currentDate = startDate;

  closeFormModal();
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
    if (a.driver !== driverName) return false; // Beda driver
    if (a.date !== date) return false; // Beda tanggal

    const aStart = timeToMinutes(a.startTime);
    const aEnd   = timeToMinutes(a.endTime);

    // Cek overlap: range baru overlap dengan range yang ada?
    return startMin < aEnd && endMin > aStart;
  });
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
