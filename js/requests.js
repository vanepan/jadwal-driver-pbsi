/* ============================================================
   REQUESTS.JS - Driver Request Workflow

   Bidang creates requests here. Admin reviews pending requests.
   Approved requests become real assignments from app.js.
   ============================================================ */

'use strict';

import { DEFAULT_DRIVERS, VEHICLES, getDriverByName } from './drivers.js';
import { generateId, timeToMinutes, showToast } from './utils.js';
import { getCurrentUser, hasPermission, isAdmin } from './auth.js';

let requests = [];
let editingRequestId = null;

let onCreateCallback = null;
let onUpdateCallback = null;
let onApproveCallback = null;
let onRejectCallback = null;

export function setRequests(nextRequests) {
  requests = nextRequests;
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

export function initRequestHandlers() {
  initRequestDriverSelect();

  const form = document.getElementById('requestForm');
  if (form) {
    form.addEventListener('submit', handleRequestSubmit);
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
    document.getElementById('requestFieldDriver').value = request.driver || '';
    document.getElementById('requestFieldVehicle').value = request.vehicle || '';
    document.getElementById('requestFieldDate').value = request.date || '';
    document.getElementById('requestFieldStart').value = request.startTime || '';
    document.getElementById('requestFieldEnd').value = request.endTime || '';
    document.getElementById('requestFieldPurpose').value = request.purpose || '';
    document.getElementById('requestFieldNotes').value = request.notes || '';
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
    return requests.filter(request => request.status === 'pending');
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

  const driver = document.getElementById('requestFieldDriver').value;
  const vehicle = document.getElementById('requestFieldVehicle').value;
  const date = document.getElementById('requestFieldDate').value;
  const startTime = document.getElementById('requestFieldStart').value;
  const endTime = document.getElementById('requestFieldEnd').value;
  const purpose = document.getElementById('requestFieldPurpose').value.trim();
  const notes = document.getElementById('requestFieldNotes').value.trim();

  if (!driver || !vehicle || !date || !startTime || !endTime || !purpose) {
    showToast('Lengkapi semua field request wajib (*)');
    return;
  }

  if (timeToMinutes(endTime) <= timeToMinutes(startTime)) {
    showToast('Jam selesai harus lebih dari jam mulai');
    return;
  }

  if (editingRequestId) {
    const existing = requests.find(item => item.id === editingRequestId);
    if (!existing || !isAdmin()) return;

    const updatedRequest = {
      ...existing,
      driver,
      vehicle,
      date,
      startTime,
      endTime,
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

    const newRequest = {
      id: generateId(),
      requesterId: user.id,
      requesterName: user.name,
      date,
      startTime,
      endTime,
      driver,
      vehicle,
      purpose,
      notes,
      status: 'pending',
      createdAt: new Date().toISOString(),
      approvedBy: '',
      approvedAt: '',
    };

    if (onCreateCallback) onCreateCallback(newRequest);
    showToast('Request jadwal terkirim');
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
  }
}

function createRequestCardHTML(request) {
  const vehicleColor = VEHICLES[request.vehicle] || '#555';
  const actions = request.status === 'pending' && isAdmin()
    ? `
      <div class="request-card-actions">
        <button class="btn-secondary" data-request-action="edit" data-request-id="${request.id}">Edit</button>
        <button class="btn-secondary" data-request-action="reject" data-request-id="${request.id}">Reject</button>
        <button class="btn-primary" data-request-action="approve" data-request-id="${request.id}">Approve</button>
      </div>
    `
    : '';

  return `
    <div class="request-card" data-status="${request.status}">
      <div class="request-card-header">
        <div>
          <div class="request-title">${escapeHTML(request.purpose)}</div>
          <div class="request-meta">${escapeHTML(request.requesterName)} - ${escapeHTML(request.date)} - ${escapeHTML(request.startTime)}-${escapeHTML(request.endTime)}</div>
        </div>
        <span class="request-status">${escapeHTML(request.status)}</span>
      </div>
      <div class="request-details">
        <span class="vehicle-badge" style="background:${vehicleColor}">${escapeHTML(request.vehicle)}</span>
        <span>${escapeHTML(request.driver)}</span>
      </div>
      ${request.notes ? `<div class="request-notes">${escapeHTML(request.notes)}</div>` : ''}
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

export function requestToAssignment(request, approvedByUser) {
  const driver = getDriverByName(request.driver);

  return {
    id: generateId(),
    driver: request.driver,
    phone: driver ? driver.phone : '',
    vehicle: request.vehicle,
    date: request.date,
    startTime: request.startTime,
    endTime: request.endTime,
    destination: request.purpose,
    purpose: request.purpose,
    pic: request.requesterName,
    pax: 1,
    notes: request.notes,
    requestId: request.id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    approvedBy: approvedByUser ? approvedByUser.name : '',
  };
}

console.info('Requests module loaded');
