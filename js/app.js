/* ============================================================
   APP.JS — Main Application Entry Point
   
   Orchestrates all modules:
   - Initializes data from Firebase/LocalStorage
   - Sets up event listeners and callbacks
   - Manages state and re-rendering
   - Handles data synchronization
   ============================================================ */

'use strict';

// Import all modules
import { loadAssignments, saveAssignments, loadRequests, saveRequests, initFirebaseSync, registerDataChangeListener, registerRequestsChangeListener } from './firebase.js';
import { initDriverSelect } from './drivers.js';
import { renderTimeline, setCurrentDate, setAssignments as setTimelineAssignments, initDateControls, getCurrentDate } from './timeline.js';
import { initModalHandlers, registerEditCallback, registerDeleteCallback, setAssignments as setModalAssignments, updateDetailActionButtons } from './modal.js';
import { initFormHandlers, openFormModal, closeFormModal, registerSaveCallback, setAssignments as setAssignmentsForm, setCurrentDate as setCurrentDateForm, checkConflict, deleteAssignment } from './assignments.js';
import { initAuthUI, hasPermission, getCurrentUser } from './auth.js';
import {
  initRequestHandlers,
  openRequestFormModal,
  openRequestsListModal,
  registerRequestCreateCallback,
  registerRequestUpdateCallback,
  registerRequestApproveCallback,
  registerRequestRejectCallback,
  setRequests as setRequestsModule,
  getPendingRequestCount,
  renderRequestsList,
  requestToAssignment,
} from './requests.js';

const APP_VERSION = '20260524-firebase-sync-modular';

console.info(`PBSI Scheduler ${APP_VERSION}`);

/* ── Global App State ── */
let assignments = [];
let requests = [];

/**
 * Update all modules dengan data assignments terbaru
 * Dipanggil setiap kali ada perubahan data (Firebase sync, form submit, delete, etc)
 */
function updateAllModules() {
  setTimelineAssignments(assignments);
  setModalAssignments(assignments);
  setAssignmentsForm(assignments);
  setRequestsModule(requests);
}

/**
 * Update tombol-tombol berdasarkan role login saat ini.
 */
function updatePermissionUI() {
  const btnAdd = document.getElementById('btnAddAssignment');
  const btnRequests = document.getElementById('btnRequests');
  const btnRequestsLabel = document.getElementById('btnRequestsLabel');
  const requestCountBadge = document.getElementById('requestCountBadge');

  if (btnAdd) {
    const canCreateSchedule = hasPermission('create');
    const canRequestSchedule = hasPermission('request');
    const btnText = document.getElementById('btnAddAssignmentLabel');

    btnAdd.disabled = !canCreateSchedule && !canRequestSchedule;
    btnAdd.title = canRequestSchedule
      ? 'Request jadwal driver'
      : canCreateSchedule
        ? 'Tambah jadwal'
        : 'Role ini hanya bisa melihat jadwal';

    if (btnText) {
      btnText.textContent = canRequestSchedule ? 'Request Jadwal' : 'Tambah Jadwal';
    }
  }

  if (btnRequests) {
    const shouldShowRequests = hasPermission('approve') || hasPermission('request');
    btnRequests.style.display = shouldShowRequests ? 'flex' : 'none';
  }

  if (btnRequestsLabel) {
    btnRequestsLabel.textContent = hasPermission('approve') ? 'Pending' : 'Riwayat Request';
  }

  if (requestCountBadge) {
    const pendingCount = getPendingRequestCount();
    const showCount = hasPermission('approve') && pendingCount > 0;
    requestCountBadge.textContent = String(pendingCount);
    requestCountBadge.style.display = showCount ? 'inline-flex' : 'none';
  }

  updateDetailActionButtons();
  renderRequestsList();
}

/**
 * Main initialization saat DOM ready
 */
document.addEventListener('DOMContentLoaded', () => {
  console.log('Initializing PBSI Scheduler app...');

  // Load assignments dari localStorage (cache lokal)
  assignments = loadAssignments();
  requests = loadRequests();
  updateAllModules();

  // Initialize UI modules
  initAuthUI(updatePermissionUI); // Setup login modal, badge, logout
  initDriverSelect();           // Isi dropdown driver
  initDateControls();           // Setup date navigation buttons
  initFormHandlers();           // Setup form events
  initModalHandlers();          // Setup modal events
  initRequestHandlers();        // Setup request workflow events
  renderTimeline();             // Render timeline pertama kali
  updatePermissionUI();         // Disable tombol sesuai role

  const btnAdd = document.getElementById('btnAddAssignment');
  if (btnAdd) {
    btnAdd.addEventListener('click', () => {
      if (hasPermission('request')) {
        openRequestFormModal();
      }
    });
  }

  const btnRequests = document.getElementById('btnRequests');
  if (btnRequests) {
    btnRequests.addEventListener('click', openRequestsListModal);
  }

  // Setup callbacks untuk cross-module communication

  // ── Callback: Firebase data berubah (dari device lain) ──
  registerDataChangeListener((updatedAssignments) => {
    console.log('Firebase data updated from another device');
    assignments = updatedAssignments;
    updateAllModules();
    renderTimeline(); // Re-render timeline
  });

  // ── Callback: Firebase requests berubah (dari device lain) ──
  registerRequestsChangeListener((updatedRequests) => {
    console.log('Firebase requests updated from another device');
    requests = updatedRequests;
    updateAllModules();
    updatePermissionUI();
  });

  // ── Callback: Form save (add/update assignment) ──
  registerSaveCallback((updatedAssignments, isNewAssignment, assignmentDate) => {
    assignments = updatedAssignments;
    updateAllModules();

    // Update current date ke tanggal assignment jika add baru
    if (isNewAssignment) {
      setCurrentDate(assignmentDate);
      setCurrentDateForm(assignmentDate);
    }

    // Save ke Firebase dan localStorage
    saveAssignments(assignments);

    // Re-render timeline
    renderTimeline();
  });

  // ── Callback: Bidang submit request ──
  registerRequestCreateCallback((newRequest) => {
    requests = [...requests, newRequest];
    updateAllModules();
    saveRequests(requests);
    updatePermissionUI();
  });

  // ── Callback: Admin edit pending request sebelum approval ──
  registerRequestUpdateCallback((updatedRequest) => {
    requests = requests.map(request =>
      request.id === updatedRequest.id ? updatedRequest : request
    );
    updateAllModules();
    saveRequests(requests);
    updatePermissionUI();
  });

  // ── Callback: Admin approve request ──
  registerRequestApproveCallback((requestId) => {
    if (!hasPermission('approve')) return;

    const request = requests.find(item => item.id === requestId);
    const admin = getCurrentUser();
    if (!request || request.status !== 'pending') return;

    if (checkConflict(request.driver, request.startTime, request.endTime, request.date)) {
      alert('Request konflik dengan jadwal driver yang sudah ada. Edit request dulu sebelum approve.');
      return;
    }

    const assignment = requestToAssignment(request, admin);
    assignments = [...assignments, assignment];
    requests = requests.map(item => item.id === requestId
      ? {
          ...item,
          status: 'approved',
          approvedBy: admin ? admin.name : '',
          approvedAt: new Date().toISOString(),
        }
      : item
    );

    updateAllModules();
    setCurrentDate(request.date);
    setCurrentDateForm(request.date);
    saveAssignments(assignments);
    saveRequests(requests);
    renderTimeline();
    updatePermissionUI();
  });

  // ── Callback: Admin reject request ──
  registerRequestRejectCallback((requestId) => {
    if (!hasPermission('reject')) return;
    if (!confirm('Reject request ini?')) return;

    const admin = getCurrentUser();
    requests = requests.map(item => item.id === requestId
      ? {
          ...item,
          status: 'rejected',
          approvedBy: admin ? admin.name : '',
          approvedAt: new Date().toISOString(),
        }
      : item
    );

    updateAllModules();
    saveRequests(requests);
    updatePermissionUI();
  });

  // ── Callback: Edit button di detail modal ──
  registerEditCallback((assignmentId) => {
    if (!hasPermission('edit')) return;
    openFormModal(assignmentId);
  });

  // ── Callback: Delete button di detail modal ──
  registerDeleteCallback((assignmentId) => {
    if (!hasPermission('delete')) return;

    deleteAssignment(assignmentId);
    assignments = assignments.filter(a => a.id !== assignmentId);
    updateAllModules();

    // Save ke Firebase dan localStorage
    saveAssignments(assignments);

    // Re-render timeline
    renderTimeline();

    console.log(`Assignment ${assignmentId} deleted`);
  });

  // Initialize Firebase real-time sync
  // Ini akan set up listener yang update assignments dan requests.
  initFirebaseSync();

  console.log('✅ App initialized successfully');
});

// Export untuk debugging di console
window.appDebug = {
  getAssignments: () => assignments,
  getRequests: () => requests,
  getAppVersion: () => APP_VERSION,
  getCurrentDate: () => getCurrentDate(),
  getCurrentUser,
  hasPermission,
  checkConflict,
  renderTimeline,
};

console.info(`Jadwal Driver PBSI v${APP_VERSION} loaded`);
