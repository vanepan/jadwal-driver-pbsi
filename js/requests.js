/* ============================================================
   REQUESTS.JS - Driver Request Workflow

   Bidang creates requests here. Admin reviews pending requests.
   Approved requests become real assignments from app.js.
   ============================================================ */

'use strict';

import { getDriverByName, getVehicleColor } from './drivers.js';
import { getDrivers, getActiveDrivers, registerDriversChangeListener } from './drivers-store.js';
import { getActiveVehicleNames, getActiveVehicles, registerVehiclesChangeListener } from './vehicles-store.js';
import { getAssignments } from './assignments.js';
import { getOverrideLogs, saveRequestRecommendation } from './stores/dispatch-intelligence-store.js';
import { buildRequestRecommendation } from './services/request-intelligence-service.js';
import { generateId, timeToMinutes, showToast, initCustomTimeInputPair, getCombinedTimeFromPair, setTimeFieldsFromValue, normalizeTimeValue, expandDateRange, formatDateShort, addHoursToTime, todayString, offsetDate } from './utils.js';
import { getCurrentUser, hasPermission, isAdmin } from './auth.js';
import { initFormGuard, resetDirty } from './form-guard.js';
import { syncPbsiSelect } from './pbsi-select.js';
import { initPbsiDatepicker, syncPbsiDatepicker } from './pbsi-datepicker.js';

let requests = [];
let editingRequestId = null;

let onCreateCallback      = null;
let onUpdateCallback      = null;
let onApproveCallback     = null;  // "Setujui Sesuai Rekomendasi" (direct, ACCEPTED)
let onApproveEditCallback = null;  // "Edit & Setujui" (opens approval/override modal)
let onRejectCallback      = null;
let onCommentCallback     = null;

/**
 * Normalize a request object to the multi-day data model.
 * Converts legacy { date } → { startDate, endDate }.
 * Safe to call on already-normalized requests (no-op).
 * @param {Object} r
 * @returns {Object}
 */
/**
 * Generate the background Dispatch Intelligence recommendation for a request
 * (beta.3). Computed at submit over the live drivers/vehicles/assignments and
 * stored WITH the request — the requester never sees it; the admin does at
 * approval. Pure-failure-safe: returns null (and logs) if anything goes wrong,
 * so a recommendation hiccup can never block a request submission.
 * @param {Object} reqShape  { startDate, startTime, endTime, pax, fullDay, purpose }
 * @returns {Object|null} the compact storable recommendation (buildRequestRecommendation)
 */
function generateBackgroundRecommendation(reqShape) {
  try {
    return buildRequestRecommendation({
      request: reqShape,
      drivers: getActiveDrivers(),
      vehicles: getActiveVehicles(),
      assignments: getAssignments(),
      overrideLogs: getOverrideLogs(),
    });
  } catch (err) {
    console.warn('[Request] background recommendation failed', err);
    return null;
  }
}

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

export function registerRequestApproveEditCallback(callback) {
  onApproveEditCallback = callback;
}

export function registerRequestRejectCallback(callback) {
  onRejectCallback = callback;
}

export function registerCommentCallback(callback) {
  onCommentCallback = callback;
}

/* ── Request passenger stepper (#requestFieldPax) ──────────────────────
   Mirrors the assignment form's pax stepper but a request must carry at least
   one passenger (min 1, default 1) so Dispatch Intelligence readiness can be
   satisfied — the recommendation needs a party size to fit a vehicle to. */
const REQUEST_PAX_MIN = 1;
const REQUEST_PAX_MAX = 20;

function _syncRequestPaxDisplay(val) {
  const n = Math.max(REQUEST_PAX_MIN, Math.min(REQUEST_PAX_MAX, parseInt(val, 10) || REQUEST_PAX_MIN));
  const hidden  = document.getElementById('requestFieldPax');
  const display = document.getElementById('requestPaxDisplay');
  const minus   = document.getElementById('btnRequestPaxMinus');
  const plus    = document.getElementById('btnRequestPaxPlus');
  if (hidden)  hidden.value = n;
  if (display) display.textContent = n;
  if (minus)   minus.disabled = n <= REQUEST_PAX_MIN;
  if (plus)    plus.disabled  = n >= REQUEST_PAX_MAX;
}

function initRequestPaxStepper() {
  const minus = document.getElementById('btnRequestPaxMinus');
  const plus  = document.getElementById('btnRequestPaxPlus');
  if (!minus || !plus) return;

  minus.addEventListener('click', () => {
    _syncRequestPaxDisplay(parseInt(document.getElementById('requestFieldPax')?.value, 10) - 1);
  });
  plus.addEventListener('click', () => {
    _syncRequestPaxDisplay(parseInt(document.getElementById('requestFieldPax')?.value, 10) + 1);
  });

  [minus, plus].forEach(btn => {
    btn.addEventListener('keydown', e => {
      if (e.key === 'ArrowUp')   { e.preventDefault(); _syncRequestPaxDisplay(parseInt(document.getElementById('requestFieldPax')?.value, 10) + 1); }
      if (e.key === 'ArrowDown') { e.preventDefault(); _syncRequestPaxDisplay(parseInt(document.getElementById('requestFieldPax')?.value, 10) - 1); }
    });
  });

  _syncRequestPaxDisplay(REQUEST_PAX_MIN);
}

export function initRequestHandlers() {
  initRequestDriverSelect();
  initRequestVehicleSelect();
  initRequestPaxStepper();
  // Keep #requestFieldDriver / #requestFieldVehicle in sync with create/
  // deactivate/reactivate. MutationObserver in PBSI Select picks up option
  // changes automatically. The vehicles listener also covers the case where the
  // vehicles store finishes loading AFTER this form is initialized (fresh
  // login) — otherwise the Bidang role is left with an empty dropdown.
  registerDriversChangeListener(initRequestDriverSelect);
  registerVehiclesChangeListener(initRequestVehicleSelect);
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

  // List-modal close buttons only (form close buttons are owned by form-guard)
  const closeButtons = [
    ['btnCloseRequestsList', closeRequestsListModal],
    ['btnCloseRequestsList2', closeRequestsListModal],
  ];

  closeButtons.forEach(([id, handler]) => {
    const button = document.getElementById(id);
    if (button) button.addEventListener('click', handler);
  });

  const modalRequestsList = document.getElementById('modalRequestsList');
  if (modalRequestsList) {
    modalRequestsList.addEventListener('click', (event) => {
      if (event.target === modalRequestsList) closeRequestsListModal();
    });
  }

  // Data-loss guard: disables backdrop close, intercepts X/Cancel, shows
  // confirmation dialog when form is dirty. Owns btnCloseRequestForm + btnCancelRequestForm.
  initFormGuard({
    formId:    'requestForm',
    overlayId: 'modalRequestForm',
    closeIds:  ['btnCloseRequestForm', 'btnCancelRequestForm'],
    closeFn:   closeRequestFormModal,
  });

  // PBSI Date Picker — request start date
  initPbsiDatepicker(document.getElementById('requestFieldStartDate'), {
    presets: [
      { label: 'Hari Ini', getValue: () => todayString() },
      { label: 'Besok',    getValue: () => offsetDate(todayString(), 1) },
      { label: 'Lusa',     getValue: () => offsetDate(todayString(), 2) },
      { label: 'Pilih Tanggal', openCalendar: true },
    ],
  });

  // PBSI Date Picker — request end date (presets relative to current start date)
  initPbsiDatepicker(document.getElementById('requestFieldEndDate'), {
    presets: [
      { label: 'Sama Hari', getValue: () => document.getElementById('requestFieldStartDate').value || todayString() },
      { label: '+1 Hari',   getValue: () => offsetDate(document.getElementById('requestFieldStartDate').value || todayString(), 1) },
      { label: '+2 Hari',   getValue: () => offsetDate(document.getElementById('requestFieldStartDate').value || todayString(), 2) },
      { label: 'Pilih Tanggal', openCalendar: true },
    ],
  });

  // When request start date changes, re-evaluate end date preset active states
  document.getElementById('requestFieldStartDate')?.addEventListener('change', () => {
    syncPbsiDatepicker(document.getElementById('requestFieldEndDate'));
  });
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
      syncPbsiDatepicker(endDateInput);
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
  // beta.3: driver/vehicle are no longer requester-facing — they are decided by
  // the admin at approval. No driver/vehicle selectors to sync here.
  syncPbsiDatepicker(document.getElementById('requestFieldStartDate'));
  syncPbsiDatepicker(document.getElementById('requestFieldEndDate'));

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
    document.getElementById('requestFieldStartDate').value = norm.startDate || '';
    syncPbsiDatepicker(document.getElementById('requestFieldStartDate'));
    document.getElementById('requestFieldEndDate').value   = norm.endDate   || '';
    syncPbsiDatepicker(document.getElementById('requestFieldEndDate'));
    setTimeFieldsFromValue('requestFieldStartHour', 'requestFieldStartMinute', norm.startTime);
    setTimeFieldsFromValue('requestFieldEndHour',   'requestFieldEndMinute',   norm.endTime);
    document.getElementById('requestFieldPurpose').value = norm.purpose || '';
    document.getElementById('requestFieldNotes').value   = norm.notes   || '';
    _syncRequestPaxDisplay(norm.pax);

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
    if (endInput) { endInput.required = false; endInput.value = ''; syncPbsiDatepicker(endInput); }

    // Default start date to today
    const startDateInput = document.getElementById('requestFieldStartDate');
    if (startDateInput) { startDateInput.value = todayString(); syncPbsiDatepicker(startDateInput); }

    // Reset full-day
    const fullDayCb = document.getElementById('requestFullDay');
    if (fullDayCb) fullDayCb.checked = false;
    syncRequestFullDayUI();

    // Reset passenger count to the minimum (form.reset restores the hidden
    // input; this re-syncs the visible display + button disabled states).
    _syncRequestPaxDisplay(REQUEST_PAX_MIN);
  }

  const modal = document.getElementById('modalRequestForm');
  if (modal) {
    resetDirty('requestForm');
    modal.style.display = 'flex';
  }
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

  // requesterId was added later; fall back to requesterName for legacy records
  return requests.filter(request =>
    request.requesterId === user.id ||
    request.requesterName === user.name
  );
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

  // beta.3: the requester no longer chooses driver/vehicle — the admin decides
  // at approval, aided by a background recommendation. These stay '' on the
  // request until approval resolves them.
  const driver     = '';
  const vehicle    = '';
  const startDate  = document.getElementById('requestFieldStartDate').value;
  const isFullDay  = document.getElementById('requestFullDay')?.checked ?? false;
  const startTime  = isFullDay ? '00:00' : getCombinedTimeFromPair('requestFieldStartHour', 'requestFieldStartMinute');
  const endTime    = isFullDay ? '23:59' : getCombinedTimeFromPair('requestFieldEndHour', 'requestFieldEndMinute');
  const purpose    = document.getElementById('requestFieldPurpose').value.trim();
  const notes      = document.getElementById('requestFieldNotes').value.trim();
  const rawPax     = parseInt(document.getElementById('requestFieldPax')?.value, 10);
  const pax        = Number.isNaN(rawPax) ? REQUEST_PAX_MIN : Math.max(REQUEST_PAX_MIN, rawPax);
  const isMultiDay = document.getElementById('requestMultiDay')?.checked ?? false;
  const endDate    = isMultiDay
    ? document.getElementById('requestFieldEndDate').value
    : startDate;

  if (!startDate || !purpose) {
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

  // Background Dispatch Intelligence recommendation (admin-only at approval).
  const recommendation = generateBackgroundRecommendation({ startDate, startTime, endTime, pax, fullDay: isFullDay, purpose });
  const recFields = recommendation ? {
    recommendedDriver:  recommendation.recommendedDriver,
    recommendedVehicle: recommendation.recommendedVehicle,
    dispatchScore:      recommendation.dispatchScore,
    recommendation,
  } : {};

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
      pax,
      ...recFields,
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
      pax,
      ...recFields,
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      approvedBy: '',
      approvedAt: '',
    };

    if (onCreateCallback) onCreateCallback(newRequest);

    // Record the recommendation in the persisted history (rc.1). Keyed by request
    // id; the persistence layer write-through mirrors it to RTDB. Best-effort.
    if (recommendation && recommendation.hasRecommendation) {
      try {
        saveRequestRecommendation({
          requestId:            newRequest.id,
          recommendedDriverId:  recommendation.recommendedDriverId,
          recommendedVehicleId: recommendation.recommendedVehicleId,
          dispatchScore:        recommendation.dispatchScore,
          reasonSummary:        recommendation.reasonSummary,
          availabilitySummary:  recommendation.availabilitySummary,
          generatedAt:          recommendation.generatedAt,
        }, newRequest.id);
      } catch (err) {
        console.warn('[Request] recording recommendation history failed', err);
      }
    }

    showToast(totalDays > 1 ? `Request ${totalDays} hari terkirim` : 'Request jadwal terkirim');
  }

  resetDirty('requestForm');
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

  if (action === 'approve-direct' && onApproveCallback) {
    onApproveCallback(requestId);
    return;
  }

  if (action === 'approve-edit' && onApproveEditCallback) {
    onApproveEditCallback(requestId);
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
  const vehicleColor = getVehicleColor(r.vehicle);

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
        <button class="btn-secondary" data-request-action="edit"           data-request-id="${r.id}">Edit</button>
        <button class="btn-secondary" data-request-action="reject"         data-request-id="${r.id}">Tolak</button>
        <button class="btn-secondary" data-request-action="approve-edit"   data-request-id="${r.id}">Edit &amp; Setujui</button>
        <button class="btn-primary"   data-request-action="approve-direct" data-request-id="${r.id}">Setujui Sesuai Rekomendasi${totalDays > 1 ? ` (${totalDays} hari)` : ''}</button>
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
        ${(r.driver || r.vehicle)
          ? `<span class="vehicle-badge" style="background:${vehicleColor}">${escapeHTML(r.vehicle || '—')}</span><span>${escapeHTML(r.driver || '—')}</span>`
          : ''}
        ${(isAdmin() && r.recommendedDriver)
          ? `<span class="request-rec">🧭 Rekomendasi: ${escapeHTML(r.recommendedDriver)} · ${escapeHTML(r.recommendedVehicle)}${r.dispatchScore ? ` · skor ${r.dispatchScore}` : ''}</span>`
          : ''}
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
  const driverOptions = getActiveDrivers();
  driverOptions.forEach(driver => {
    const option = document.createElement('option');
    option.value = driver.name;
    option.textContent = driver.name;
    select.appendChild(option);
  });
}

/* Vehicle dropdown for the request form (Bidang's only vehicle-selection path).
   Split out from the driver select and driven by registerVehiclesChangeListener
   so it survives the vehicles store loading AFTER the form is initialized — on a
   fresh login it was previously populated once from an empty cache and never
   refreshed, leaving Bidang with an empty "Pilih Kendaraan". Rebuilds
   idempotently, preserves the current selection; the PBSI Select MutationObserver
   rebuilds the custom option list and syncPbsiSelect refreshes the trigger. */
function initRequestVehicleSelect() {
  const vehicleSelect = document.getElementById('requestFieldVehicle');
  if (!vehicleSelect) return;

  const prev = vehicleSelect.value;
  const names = getActiveVehicleNames();
  vehicleSelect.innerHTML = '<option value="">-- Pilih Kendaraan --</option>';
  names.forEach(name => {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = name;
    vehicleSelect.appendChild(option);
  });
  if (prev && names.includes(prev)) vehicleSelect.value = prev;
  syncPbsiSelect(vehicleSelect);
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
export function requestToAssignment(request, approvedByUser, dateOverride = null, decision = {}) {
  const r = normalizeRequest(request);
  // beta.3: the request itself carries no requester-chosen driver/vehicle. The
  // effective values come from the admin's decision (override) when present,
  // otherwise the background recommendation, otherwise any legacy request value.
  const effectiveDriver = ('driver' in decision)
    ? (decision.driver || '')
    : (r.driver || r.recommendedDriver || '');
  const effectiveVehicle = ('vehicle' in decision)
    ? (decision.vehicle || '')
    : (r.vehicle || r.recommendedVehicle || '');
  const driver = getDriverByName(effectiveDriver);
  const assignmentDate = dateOverride || r.startDate || r.date;
  const now = new Date().toISOString();
  const adminName = approvedByUser ? approvedByUser.name : '';

  return {
    id: generateId(),
    driver: effectiveDriver,
    phone: driver ? driver.phone : '',
    vehicle: effectiveVehicle,
    date: assignmentDate,
    startTime: r.fullDay ? '00:00' : r.startTime,
    endTime: r.fullDay ? '23:59' : r.endTime,
    fullDay: r.fullDay || false,
    destination: r.purpose,
    purpose: r.purpose,
    pic: r.requesterName,
    pax: Number(r.pax) || 0, // carried from the request's passenger count (legacy requests → 0)
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
