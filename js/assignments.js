/* ============================================================
   ASSIGNMENTS.JS — Assignment CRUD & Form Logic
   
   Add/edit/delete assignments, form validation, conflict detection,
   time input formatting, form modal handlers.
   ============================================================ */

'use strict';

import { generateId, timeToMinutes, minutesToTime, showToast } from './utils.js';
import { getDriverByName } from './drivers.js';

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
  // Button "Tambah Jadwal" di header
  const btnAdd = document.getElementById('btnAddAssignment');
  if (btnAdd) {
    btnAdd.addEventListener('click', () => {
      openFormModal();
    });
  }

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

  // Time input formatting
  initTimeInputs();

  // Click di luar modal untuk tutup
  const modalForm = document.getElementById('modalForm');
  if (modalForm) {
    modalForm.addEventListener('click', (e) => {
      if (e.target === modalForm) closeFormModal();
    });
  }
}

/**
 * Open form modal dalam mode add atau edit
 * @param {string|null} asgnId - Assignment ID untuk edit, atau null untuk add
 */
export function openFormModal(asgnId = null) {
  editingId = asgnId;
  const form = document.getElementById('assignmentForm');
  if (form) form.reset();

  const warning = document.getElementById('conflictWarning');
  if (warning) warning.style.display = 'none';

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
      document.getElementById('fieldStart').value       = a.startTime;
      document.getElementById('fieldEnd').value         = a.endTime;
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

  const driver      = document.getElementById('fieldDriver').value;
  const phone       = document.getElementById('fieldPhone').value;
  const vehicle     = document.getElementById('fieldVehicle').value;
  const date        = document.getElementById('fieldDate').value;
  const startTime   = document.getElementById('fieldStart').value;
  const endTime     = document.getElementById('fieldEnd').value;
  const destination = document.getElementById('fieldDestination').value.trim();
  const purpose     = document.getElementById('fieldPurpose').value.trim();
  const pic         = document.getElementById('fieldPIC').value.trim();
  const pax         = parseInt(document.getElementById('fieldPax').value) || 1;
  const notes       = document.getElementById('fieldNotes').value.trim();

  // Validasi dasar
  if (!driver || !vehicle || !date || !startTime || !endTime || !destination || !purpose) {
    showToast('⚠️ Lengkapi semua field wajib (*)');
    return;
  }

  if (timeToMinutes(endTime) <= timeToMinutes(startTime)) {
    showToast('⚠️ Jam selesai harus lebih dari jam mulai');
    return;
  }

  // Cek konflik jadwal
  const hasConflict = checkConflict(driver, startTime, endTime, date, editingId);
  const warningEl   = document.getElementById('conflictWarning');

  if (hasConflict) {
    if (warningEl) warningEl.style.display = 'block';
    return; // Hentikan, jangan simpan
  } else {
    if (warningEl) warningEl.style.display = 'none';
  }

  let isNew = false;

  if (editingId) {
    // Update assignment yang ada
    const idx = assignments.findIndex(a => a.id === editingId);
    if (idx !== -1) {
      assignments[idx] = {
        id: editingId,
        driver, phone, vehicle, date,
        startTime, endTime, destination, purpose, pic, pax, notes,
        createdAt: assignments[idx].createdAt,
        updatedAt: new Date().toISOString(),
      };
    }
    showToast('✅ Jadwal berhasil diperbarui');
  } else {
    // Tambah assignment baru
    const newAssignment = {
      id: generateId(),
      driver, phone, vehicle, date,
      startTime, endTime, destination, purpose, pic, pax, notes,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    assignments.push(newAssignment);
    isNew = true;
    showToast('✅ Jadwal berhasil ditambahkan');
  }

  // Call save callback
  if (onSaveCallback) {
    onSaveCallback(assignments, isNew, date);
  }

  // Reset edit mode
  editingId = null;

  // Update current date jika add assignment baru
  if (isNew && currentDate !== date) {
    currentDate = date;
  }

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
 * Validate time input dan format dengan colon
 */
function initTimeInputs() {
  ['fieldStart', 'fieldEnd'].forEach(id => {
    const input = document.getElementById(id);
    if (!input) return;

    // Format input saat user mengetik
    input.addEventListener('input', () => {
      let value = input.value.replace(/\D/g, '');

      if (value.length >= 3) {
        value =
          value.slice(0, value.length - 2) +
          ':' +
          value.slice(-2);
      }

      if (value.length > 5) {
        value = value.slice(0, 5);
      }

      input.value = value;
    });

    // Validate saat blur (keluar dari input)
    input.addEventListener('blur', () => {
      validateTimeInput(input);
    });
  });
}

/**
 * Validate format waktu (HH:MM)
 */
function validateTimeInput(input) {
  const val = input.value;

  if (val && !/^([01]\d|2[0-3]):([0-5]\d)$/.test(val)) {
    showToast('⚠️ Format jam tidak valid (gunakan HH:MM)');
    input.focus();
  }
}

console.info('Assignments module loaded');
