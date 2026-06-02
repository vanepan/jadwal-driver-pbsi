/* ============================================================
   REQUESTS.JS - Driver Request Workflow

   Bidang creates requests here. Admin reviews pending requests.
   Approved requests become real assignments from app.js.
   ============================================================ */

'use strict';

import { DEFAULT_DRIVERS, VEHICLES, getDriverByName } from './drivers.js';
import { generateId, timeToMinutes, showToast, initCustomTimeInputPair, getCombinedTimeFromPair, setTimeFieldsFromValue, normalizeTimeValue, expandDateRange, formatDateShort, addHoursToTime } from './utils.js';
import { getCurrentUser, hasPermission, isAdmin } from './auth.js';

let requests = [];
let editingRequestId = null;

let onCreateCallback  = null;
let onUpdateCallback  = null;
let onApproveCallback = null;
let onRejectCallback  = null;
let onCommentCallback = null;

/**
 * Normalize a request object to the multi-day data model.
 * Converts legacy { date } → { startDate, endDate }.
 * Safe to call on already-normalized requests (no-op).
 * @param {Object} r
 * @returns {Object}
 */
export function normalizeRequest(r) {
  if (!r) return r;
  if (!r.startDate) {
    const d = r.date || '';
    return { ...r, startDate: d, endDate: r.endDate || d };
  }
  if (!r.endDate) {
    return { ...r, endDate: r.startDate };
  }
  return r;
}

export function setRequests(nextRequests) {
  requests = Array.isArray(nextRequests) ? nextRequests.map(normalizeRequest) : [];
}

export function registerRequestCreateCallback(callback) {
  onCreateCallback = callback;
}

export function registerRequestUpdateCallback(callback) {
  onUpdateCallback = callback;
}

export function registerRequestApproveCallback(callback) {
  onApproveCallback = callback;
}

export function registerRequestRejectCallback(callback) {
  onRejectCallback = callback;
}

export function registerCommentCallback(callback) {
  onCommentCallback = callback;
}

export function initRequestHandlers() {
  initRequestDriverSelect();
  initCustomTimeInputPair('requestFieldStartHour', 'requestFieldStartMinute');
  initCustomTimeInputPair('requestFieldEndHour', 'requestFieldEndMinute');

  const form = document.getElementById('requestForm');
  if (form) {
    form.addEventListener('submit', handleRequestSubmit);
  }

  const multiDayCheckbox = document.getElementById('requestMultiDay');
  if (multiDayCheckbox) {
    multiDayCheckbox.addEventListener('change', syncRequestMultiDayUI);
  }

  const fullDayCheckbox = document.getElementById('requestFullDay');
  if (fullDayCheckbox) {
    fullDayCheckbox.addEventListener('change', syncRequestFullDayUI);
  }

  // Auto-fill Jam Selesai = Jam Mulai + 2h jika Jam Selesai masih kosong
  const requestStartMin = document.getElementById('requestFieldStartMinute');
  if (requestStartMin) {
    requestStartMin.addEventListener('blur', () => {
      const startTime = getCombinedTimeFromPair('requestFieldStartHour', 'requestFieldStartMinute');
      if (!startTime) return;
      const endH = document.getElementById('requestFieldEndHour');
      const endM = document.getElementById('requestFieldEndMinute');
      if (!endH || !endM) return;
      if (endH.value || endM.value) return; // sudah diisi manual
      setTimeFieldsFromValue('requestFieldEndHour', 'requestFieldEndMinute', addHoursToTime(startTime, 2));
    });
  }

  const closeButtons = [
    ['btnCloseRequestForm', closeRequestFormModal],
    ['btnCancelRequestForm', closeRequestFormModal],
    ['btnCloseRequestsList', closeRequestsListModal],
    ['btnCloseRequestsList2', closeRequestsListModal],
  ];

  closeButtons.forEach(([id, handler]) => {
    const button = document.getElementById(id);
    if (button) button.addEventListener('click', handler);
  });

  const modalRequestForm = document.getElementById('modalRequestForm');
  if (modalRequestForm) {
    modalRequestForm.addEventListener('click', (event) => {
      if (event.target === modalRequestForm) closeRequestFormModal();
    });
  }

  const modalRequestsList = document.getElementById('modalRequestsList');
  if (modalRequestsList) {
    modalRequestsList.addEventListener('click', (event) => {
      if (event.target === modalRequestsList) closeRequestsListModal();
    });
  }
}

function syncRequestFullDayUI() {
  const checked = document.getElementById('requestFullDay')?.checked;
  const timeStart = document.getElementById('requestTimeStart');
  const timeEnd   = document.getElementById('requestTimeEnd');
  [timeStart, timeEnd].forEach(group => {
    if (!group) return;
    group.classList.toggle('time-group-disabled', !!checked);
    group.querySelectorAll('input').forEach(el => { el.disabled = !!checked; });
  });
}

function syncRequestMultiDayUI(instant = false) {
  const checked = document.getElementById('requestMultiDay')?.checked;
  const endDateGroup = document.getElementById('requestEndDateGroup');
  const startDateLabel = document.getElementById('requestStartDateLabel');
  const endDateInput = document.getElementById('requestFieldEndDate');
  if (!endDateGroup) return;

  // CSS handles visibility (desktop: visibility:hidden keeps grid space;
  // mobile: display:none collapses space). Never set style.display here.
  if (checked) {
    requestAnimationFrame(() => endDateGroup.classList.add('visible'));
    if (endDateInput) endDateInput.required = true;
    if (startDateLabel) startDateLabel.textContent = 'Tanggal Mulai *';
  } else {
    endDateGroup.classList.remove('visible');
    if (endDateInput) {
      endDateInput.required = false;
      endDateInput.value = '';
    }
    if (startDateLabel) startDateLabel.textContent = 'Tanggal *';
  }
}

export function openRequestFormModal(requestId = null) {
  if (requestId && !isAdmin()) {
    showToast('Hanya admin yang bisa edit request sebelum approval');
    return;
  }

  const request = requests.find(item => item.id === requestId);
  if (requestId && request && request.status !== 'pending') {
    showToast('Request yang sudah diproses tidak bisa diedit');
    return;
  }

  if (!requestId && !hasPermission('request')) {
    showToast('Role ini tidak bisa membuat request jadwal');
    return;
  }

  editingRequestId = requestId;

  const form = document.getElementById('requestForm');
  if (form) form.reset();

  const title = document.getElementById('modalRequestFormTitle');
  if (title) {
    title.textContent = requestId ? 'Edit Request Jadwal' : 'Request Jadwal';
  }

  const saveButton = document.getElementById('btnSaveRequestForm');
  if (saveButton) {
    saveButton.textContent = requestId ? 'Simpan Perubahan' : 'Kirim Request';
  }

  if (request) {
    const norm = normalizeRequest(request);
    document.getElementById('requestFieldDriver').value    = norm.driver    || '';
    document.getElementById('requestFieldVehicle').value   = norm.vehicle   || '';
    document.getElementById('requestFieldStartDate').value = norm.startDate || '';
    document.getElementById('requestFieldEndDate').value   = norm.endDate   || '';
    setTimeFieldsFromValue('requestFieldStartHour', 'requestFieldStartMinute', norm.startTime);
    setTimeFieldsFromValue('requestFieldEndHour',   'requestFieldEndMinute',   norm.endTime);
    document.getElementById('requestFieldPurpose').value = norm.purpose || '';
    document.getElementById('requestFieldNotes').value   = norm.notes   || '';

    // Restore multi-day checkbox state based on date range
    const isMultiDay = !!(norm.startDate && norm.endDate && norm.startDate !== norm.endDate);
    const multiDayCheckbox = document.getElementById('requestMultiDay');
    if (multiDayCheckbox) {
      multiDayCheckbox.checked = isMultiDay;
      syncRequestMultiDayUI(true); // instant = no animation on open
    }

    // Restore full-day checkbox state
    const fullDayCb = document.getElementById('requestFullDay');
    if (fullDayCb) fullDayCb.checked = !!norm.fullDay;
    syncRequestFullDayUI();
  } else {
    // New request — reset to single-day mode without animation
    const multiDayCb = document.getElementById('requestMultiDay');
    if (multiDayCb) multiDayCb.checked = false;
    const endGrp = document.getElementById('requestEndDateGroup');
    const startLbl = document.getElementById('requestStartDateLabel');
    const endInput = document.getElementById('requestFieldEndDate');
    if (endGrp) { endGrp.classList.remove('visible'); }
    if (startLbl) startLbl.textContent = 'Tanggal *';
    if (endInput) { endInput.required = false; endInput.value = ''; }

    // Reset full-day
    const fullDayCb = document.getElementById('requestFullDay');
    if (fullDayCb) fullDayCb.checked = false;
    syncRequestFullDayUI();
  }

  const modal = document.getElementById('modalRequestForm');
  if (modal) modal.style.display = 'flex';
}

export function closeRequestFormModal() {
  const modal = document.getElementById('modalRequestForm');
  if (modal) modal.style.display = 'none';
  editingRequestId = null;
}

export function openRequestsListModal() {
  renderRequestsList();

  const title = document.getElementById('requestsListTitle');
  if (title) {
    title.textContent = isAdmin() ? 'Pending Requests' : 'Riwayat Request';
  }

  const modal = document.getElementById('modalRequestsList');
  if (modal) modal.style.display = 'flex';
}

export function closeRequestsListModal() {
  const modal = document.getElementById('modalRequestsList');
  if (modal) modal.style.display = 'none';
}

export function getPendingRequestCount() {
  return requests.filter(request => request.status === 'pending').length;
}

export function getVisibleRequestsForCurrentUser() {
  const user = getCurrentUser();
  if (!user) return [];

  if (isAdmin()) {
    return requests;
  }

  return requests.filter(request => request.requesterId === user.id);
}

export function renderRequestsList() {
  const container = document.getElementById('requestsListContent');
  if (!container) return;

  const visibleRequests = getVisibleRequestsForCurrentUser();

  if (visibleRequests.length === 0) {
    container.innerHTML = '<div class="empty-request-state">Tidak ada request.</div>';
    return;
  }

  container.innerHTML = visibleRequests.map(request => createRequestCardHTML(request)).join('');

  container.querySelectorAll('[data-request-action]').forEach(button => {
    button.addEventListener('click', handleRequestActionClick);
  });
}

function handleRequestSubmit(event) {
  event.preventDefault();

  const user = getCurrentUser();
  if (!user) {
    showToast('Silakan login dulu');
    return;
  }

  const driver     = document.getElementById('requestFieldDriver').value;
  const vehicle    = document.getElementById('requestFieldVehicle').value;
  const startDate  = document.getElementById('requestFieldStartDate').value;
  const isFullDay  = document.getElementById('requestFullDay')?.checked ?? false;
  const startTime  = isFullDay ? '00:00' : getCombinedTimeFromPair('requestFieldStartHour', 'requestFieldStartMinute');
  const endTime    = isFullDay ? '23:59' : getCombinedTimeFromPair('requestFieldEndHour', 'requestFieldEndMinute');
  const purpose    = document.getElementById('requestFieldPurpose').value.trim();
  const notes      = document.getElementById('requestFieldNotes').value.trim();
  const isMultiDay = document.getElementById('requestMultiDay')?.checked ?? false;
  const endDate    = isMultiDay
    ? document.getElementById('requestFieldEndDate').value
    : startDate;

  if (!driver || !vehicle || !startDate || !purpose) {
    showToast('Lengkapi semua field request wajib (*)');
    return;
  }

  if (!isFullDay && (!startTime || !endTime)) {
    showToast('Lengkapi semua field request wajib (*)');
    return;
  }

  if (isMultiDay) {
    if (!endDate) {
      showToast('Tanggal selesai wajib diisi untuk multi-day request');
      return;
    }
    if (endDate < startDate) {
      showToast('Tanggal selesai tidak boleh sebelum tanggal mulai');
      return;
    }
  }

  if (!isFullDay) {
    if (!/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime)) {
      showToast('Format waktu tidak valid');
      return;
    }
    if (timeToMinutes(endTime) <= timeToMinutes(startTime)) {
      showToast('Jam selesai harus lebih dari jam mulai');
      return;
    }
  }

  if (editingRequestId) {
    const existing = requests.find(item => item.id === editingRequestId);
    if (!existing || !isAdmin()) return;

    const updatedRequest = {
      ...existing,
      driver,
      vehicle,
      startDate,
      endDate,
      startTime,
      endTime,
      fullDay: isFullDay,
      purpose,
      notes,
      updatedAt: new Date().toISOString(),
    };

    if (onUpdateCallback) onUpdateCallback(updatedRequest);
    showToast('Request berhasil diperbarui');
  } else {
    if (!hasPermission('request')) {
      showToast('Role ini tidak bisa membuat request jadwal');
      return;
    }

    const totalDays = expandDateRange(startDate, endDate).length;
    const newRequest = {
      id: generateId(),
      requesterId: user.id,
      requesterName: user.name,
      startDate,
      endDate,
      startTime,
      endTime,
      fullDay: isFullDay,
      driver,
      vehicle,
      purpose,
      notes,
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      approvedBy: '',
      approvedAt: '',
    };

    if (onCreateCallback) onCreateCallback(newRequest);
    showToast(totalDays > 1 ? `Request ${totalDays} hari terkirim` : 'Request jadwal terkirim');
  }

  closeRequestFormModal();
}

function handleRequestActionClick(event) {
  const button = event.currentTarget;
  const requestId = button.dataset.requestId;
  const action = button.dataset.requestAction;

  if (action === 'edit') {
    openRequestFormModal(requestId);
    return;
  }

  if (action === 'approve' && onApproveCallback) {
    onApproveCallback(requestId);
    return;
  }

  if (action === 'reject' && onRejectCallback) {
    onRejectCallback(requestId);
    return;
  }

  if (action === 'comment' && onCommentCallback) {
    onCommentCallback(requestId);
  }
}

function createRequestCardHTML(request) {
  const r = normalizeRequest(request);
  const vehicleColor = VEHICLES[r.vehicle] || '#555';

  // Date range display
  const isSameDay = r.startDate === r.endDate;
  const dateDisplay = isSameDay
    ? formatDateShort(r.startDate)
    : `${formatDateShort(r.startDate)} → ${formatDateShort(r.endDate)}`;
  const totalDays = expandDateRange(r.startDate, r.endDate).length;
  const durationChip = totalDays > 1
    ? `<span class="request-duration">${totalDays} hari</span>`
    : '';
  const fullDayChip = r.fullDay
    ? `<span class="request-duration">Penuh Hari</span>`
    : '';
  const timeMeta = r.fullDay ? 'Penuh Hari' : `${r.startTime}–${r.endTime}`;

  const statusLabels = { pending: 'Menunggu', approved: 'Disetujui', rejected: 'Ditolak' };
  const statusLabel = statusLabels[r.status] || r.status;

  const adminActionButtons = r.status === 'pending' && isAdmin()
    ? `
        <button class="btn-secondary" data-request-action="edit"    data-request-id="${r.id}">Edit</button>
        <button class="btn-secondary" data-request-action="reject"  data-request-id="${r.id}">Tolak</button>
        <button class="btn-primary"   data-request-action="approve" data-request-id="${r.id}">Setujui${totalDays > 1 ? ` (${totalDays} hari)` : ''}</button>
    ` : '';

  const commentCount = Array.isArray(r.comments) ? r.comments.length : 0;
  const commentLabel = commentCount > 0 ? `💬 ${commentCount}` : '💬';

  const actions = `
    <div class="request-card-actions">
      ${adminActionButtons}
      <button class="btn-secondary" data-request-action="comment" data-request-id="${r.id}" title="Komentar">${commentLabel}</button>
    </div>
  `;

  return `
    <div class="request-card" data-status="${r.status}">
      <div class="request-card-header">
        <div class="request-card-info">
          <div class="request-title">${escapeHTML(r.purpose)}</div>
          <div class="request-meta">${escapeHTML(r.requesterName)} · ${escapeHTML(dateDisplay)} · ${escapeHTML(timeMeta)}</div>
        </div>
        <div class="request-card-badges">
          <span class="request-status">${escapeHTML(statusLabel)}</span>
          ${durationChip}${fullDayChip}
        </div>
      </div>
      <div class="request-details">
        <span class="vehicle-badge" style="background:${vehicleColor}">${escapeHTML(r.vehicle)}</span>
        <span>${escapeHTML(r.driver)}</span>
      </div>
      ${r.notes ? `<div class="request-notes">${escapeHTML(r.notes)}</div>` : ''}
      ${actions}
    </div>
  `;
}

function initRequestDriverSelect() {
  const select = document.getElementById('requestFieldDriver');
  if (!select) return;

  select.innerHTML = '<option value="">-- Pilih Driver --</option>';
  DEFAULT_DRIVERS.forEach(driver => {
    const option = document.createElement('option');
    option.value = driver.name;
    option.textContent = driver.name;
    select.appendChild(option);
  });

  const vehicleSelect = document.getElementById('requestFieldVehicle');
  if (vehicleSelect && vehicleSelect.options.length <= 1) {
    Object.keys(VEHICLES).forEach(vehicle => {
      const option = document.createElement('option');
      option.value = vehicle;
      option.textContent = vehicle;
      vehicleSelect.appendChild(option);
    });
  }
}

function escapeHTML(value) {
  const div = document.createElement('div');
  div.textContent = value || '';
  return div.innerHTML;
}

/**
 * Convert a request into an assignment record.
 * @param {Object}      request         - Normalized request object
 * @param {Object|null} approvedByUser  - Admin user who approved
 * @param {string|null} dateOverride    - Specific date for multi-day expansion (YYYY-MM-DD)
 */
export function requestToAssignment(request, approvedByUser, dateOverride = null) {
  const r = normalizeRequest(request);
  const driver = getDriverByName(r.driver);
  const assignmentDate = dateOverride || r.startDate || r.date;
  const now = new Date().toISOString();
  const adminName = approvedByUser ? approvedByUser.name : '';

  return {
    id: generateId(),
    driver: r.driver,
    phone: driver ? driver.phone : '',
    vehicle: r.vehicle,
    date: assignmentDate,
    startTime: r.fullDay ? '00:00' : r.startTime,
    endTime: r.fullDay ? '23:59' : r.endTime,
    fullDay: r.fullDay || false,
    destination: r.purpose,
    purpose: r.purpose,
    pic: r.requesterName,
    pax: 1,
    notes: r.notes,
    requestId: r.id,
    createdAt: r.createdAt || now,   // preserve original request creation time
    createdBy: r.requesterName || '', // bidang who submitted the request
    updatedAt: now,
    // Lifecycle tracking
    status: 'assigned',
    approvedAt: r.approvedAt || now,
    approvedBy: adminName,
    assignedAt: now,
    assignedBy: adminName,
    startedAt: null,
    startedBy: null,
    completedAt: null,
    completedBy: null,
    startOdometer: null,
    endOdometer: null,
    distanceTravelled: null,
  };
}

console.info('Requests module loaded');
