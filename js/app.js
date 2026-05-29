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
import { initAuthUI, hasPermission, getCurrentUser, isAdmin, isBidang, isDriver } from './auth.js';
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
  normalizeRequest,
} from './requests.js';
import { initAdminUI, updateAdminButtons } from './admin.js';
import { initNotificationUI, setNotificationData, openNotificationsModal } from './notifications.js';
import { subscribeLogsChangeListener, getLogs, logAction } from './logs.js';
import { getUserByUsername, getUsers } from './users.js';
import { expandDateRange, showToast, formatDateShort } from './utils.js';
import {
  sendRequestApprovedNotification,
  sendRequestRejectedNotification,
  sendNewRequestNotificationToAdmins,
  sendNewAssignmentNotificationToDriver,
  checkAndSendH1Reminders,
  checkAndSendHoursReminders,
} from './notification-service.js';

const APP_VERSION = '20260526-request-permissions';

console.info(`PBSI Scheduler ${APP_VERSION}`);

/* ── Global App State ── */
let assignments = [];
let requests = [];
let auditLogs = [];

/**
 * Filter assignments berdasarkan user role saat ini.
 * - Admin & Bidang: lihat semua assignments
 * - Driver: lihat hanya assignments untuk driver itu sendiri
 * - Viewer: lihat semua (read-only)
 * @param {Array} allAssignments
 * @returns {Array} - Filtered assignments
 */
function filterAssignmentsForUser(allAssignments) {
  const currentUser = getCurrentUser();
  if (!currentUser) return [];

  if (isDriver()) {
    const identityCandidates = [
      currentUser.username,
      currentUser.name,
      currentUser.displayName,
      currentUser.username ? currentUser.username.charAt(0).toUpperCase() + currentUser.username.slice(1).toLowerCase() : '',
    ]
      .filter(Boolean)
      .flatMap(value => {
        const normalized = String(value).trim().toLowerCase();
        return normalized.startsWith('driver ')
          ? [normalized, normalized.replace(/^driver\s+/, '')]
          : [normalized];
      });

    const uniqueDriverIdentities = new Set(identityCandidates);

    return allAssignments.filter(assignment => {
      const assignedDriver = String(assignment.driver || '').trim().toLowerCase();
      return uniqueDriverIdentities.has(assignedDriver);
    });
  }

  // Admin, Bidang, Viewer lihat semua
  return allAssignments;
}

/**
 * Update all modules dengan data assignments terbaru
 * Dipanggil setiap kali ada perubahan data (Firebase sync, form submit, delete, etc)
 */
function updateAllModules() {
  // Filter assignments berdasarkan role user
  const filteredAssignments = filterAssignmentsForUser(assignments);

  setTimelineAssignments(filteredAssignments);
  setModalAssignments(filteredAssignments);
  setAssignmentsForm(filteredAssignments);
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
    const btnText = document.getElementById('btnAddAssignmentLabel');

    if (isAdmin()) {
      btnAdd.style.display = 'flex';
      btnAdd.disabled = false;
      btnAdd.title = 'Tambah jadwal';
      if (btnText) btnText.textContent = 'Tambah Jadwal';
    } else if (isBidang()) {
      btnAdd.style.display = 'flex';
      btnAdd.disabled = false;
      btnAdd.title = 'Request jadwal driver';
      if (btnText) btnText.textContent = 'Request Jadwal';
    } else if (isDriver()) {
      btnAdd.style.display = 'none';
      btnAdd.disabled = true;
      btnAdd.title = 'Driver tidak bisa membuat jadwal';
      if (btnText) btnText.textContent = 'Lihat Assignment';
    } else {
      btnAdd.style.display = 'none';
      btnAdd.disabled = true;
      btnAdd.title = 'Role ini hanya bisa melihat jadwal';
      if (btnText) btnText.textContent = 'Tambah Jadwal';
    }
  }

  if (btnRequests) {
    const shouldShowRequests = isAdmin() || isBidang();
    btnRequests.style.display = shouldShowRequests ? 'flex' : 'none';
  }

  if (btnRequestsLabel) {
    btnRequestsLabel.textContent = isAdmin() ? 'Pending' : 'Riwayat Request';
  }

  if (requestCountBadge) {
    const pendingCount = getPendingRequestCount();
    const showCount = isAdmin() && pendingCount > 0;
    requestCountBadge.textContent = String(pendingCount);
    requestCountBadge.style.display = showCount ? 'inline-flex' : 'none';
  }

  const btnNotifications = document.getElementById('btnNotifications');
  if (btnNotifications) {
    btnNotifications.style.display = isAdmin() ? 'flex' : 'none';
  }

  updateAdminButtons();
  setNotificationData({
    pendingRequests: getPendingRequestCount(),
    recentLogs: auditLogs,
  });

  updateDetailActionButtons();
  renderRequestsList();
}

/**
 * Main initialization saat DOM ready
 */
document.addEventListener('DOMContentLoaded', async () => {
  console.log('Initializing PBSI Scheduler app...');

  // Setup global debug namespace for console/legacy access
  window.appDebug = window.appDebug || {};
  window.appDebug.openFormModal = openFormModal;
  window.appDebug.closeFormModal = closeFormModal;
  window.appDebug.openNotificationsModal = openNotificationsModal;

  // Load assignments dari localStorage (cache lokal)
  // Normalize requests on load: convert legacy { date } → { startDate, endDate }
  assignments = loadAssignments();
  requests = loadRequests().map(normalizeRequest);
  updateAllModules();

  // Initialize UI modules
  await initAuthUI(updatePermissionUI);  // Setup login modal, badge, logout
  await initAdminUI();                   // Setup admin user management
  initNotificationUI();                  // Setup notification badge & modal
  initDriverSelect();                    // Isi dropdown driver
  initDateControls();                    // Setup date navigation buttons
  initFormHandlers();                    // Setup form events
  initModalHandlers();                   // Setup modal events
  initRequestHandlers();                 // Setup request workflow events
  renderTimeline();                      // Render timeline pertama kali
  updatePermissionUI();                  // Disable tombol sesuai role
  updateAdminButtons();                  // Show admin controls properly
  setNotificationData({
    pendingRequests: getPendingRequestCount(),
    recentLogs: auditLogs,
  });

  const btnAdd = document.getElementById('btnAddAssignment');
  if (btnAdd) {
    btnAdd.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      ev.stopImmediatePropagation();
      console.log('[CLICK] ADD SCHEDULE');

      if (isAdmin()) {
        openFormModal();
        return;
      }

      if (isBidang()) {
        openRequestFormModal();
      }
    });
  }

  const btnRequests = document.getElementById('btnRequests');
  if (btnRequests) {
    btnRequests.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      console.log('[CLICK] REQUESTS');
      openRequestsListModal();
    });
  }

  getLogs().then((loadedLogs) => {
    auditLogs = loadedLogs;
    setNotificationData({
      pendingRequests: getPendingRequestCount(),
      recentLogs: auditLogs,
    });
  });

  subscribeLogsChangeListener((updatedLogs) => {
    auditLogs = updatedLogs;
    setNotificationData({
      pendingRequests: getPendingRequestCount(),
      recentLogs: auditLogs,
    });
  });

  // Setup callbacks untuk cross-module communication

  // ── Callback: Firebase data berubah (dari device lain) ──
  registerDataChangeListener((updatedAssignments) => {
    console.log('Firebase data updated from another device');
    assignments = updatedAssignments;
    updateAllModules();
    renderTimeline();
    checkAndSendH1Reminders(assignments, requests, getUserByUsername, getUsers);
    checkAndSendHoursReminders(assignments, requests, getUserByUsername, getUsers);
  });

  // ── Callback: Firebase requests berubah (dari device lain) ──
  registerRequestsChangeListener((updatedRequests) => {
    console.log('Firebase requests updated from another device');
    requests = updatedRequests.map(normalizeRequest);
    updateAllModules();
    updatePermissionUI();
  });

  // ── Callback: Form save (add/update assignment) ──
  registerSaveCallback((updatedAssignments, isNewAssignment, assignmentDate, newAssignment) => {
    assignments = updatedAssignments;
    updateAllModules();

    if (isNewAssignment) {
      setCurrentDate(assignmentDate);
      setCurrentDateForm(assignmentDate);
    }

    saveAssignments(assignments);
    const currentUser = getCurrentUser();
    logAction({ userId: currentUser?.id, username: currentUser?.username, action: isNewAssignment ? 'assignment_created' : 'assignment_edited', metadata: { date: assignmentDate } });

    renderTimeline();

    // Notify driver when admin creates a new assignment directly — non-blocking
    if (isNewAssignment && newAssignment) {
      sendNewAssignmentNotificationToDriver(newAssignment, getUsers);
    }
  });

  // ── Callback: Bidang submit request ──
  registerRequestCreateCallback((newRequest) => {
    requests = [...requests, normalizeRequest(newRequest)];
    updateAllModules();
    saveRequests(requests);
    const currentUser = getCurrentUser();
    logAction({ userId: currentUser?.id, username: currentUser?.username, action: 'request_created', targetId: newRequest.id, metadata: { status: newRequest.status } });
    updatePermissionUI();

    // Notify all admins that a new request arrived — non-blocking
    sendNewRequestNotificationToAdmins(newRequest, getUsers);
  });

  // ── Callback: Admin edit pending request sebelum approval ──
  registerRequestUpdateCallback((updatedRequest) => {
    requests = requests.map(request =>
      request.id === updatedRequest.id ? updatedRequest : request
    );
    updateAllModules();
    saveRequests(requests);
    const currentUser = getCurrentUser();
    logAction({ userId: currentUser?.id, username: currentUser?.username, action: 'request_updated', targetId: updatedRequest.id, metadata: { status: updatedRequest.status } });
    updatePermissionUI();
  });

  // ── Callback: Admin approve request ──
  registerRequestApproveCallback((requestId) => {
    if (!isAdmin()) return;

    const request = requests.find(item => item.id === requestId);
    const admin = getCurrentUser();
    if (!request || request.status !== 'pending') return;

    // Expand the date range (works for single-day too)
    const dates = expandDateRange(request.startDate, request.endDate);
    if (dates.length === 0) {
      showToast('Request tidak memiliki tanggal yang valid.');
      return;
    }

    // ── Phase 5: Conflict detection across ALL dates ──
    const conflictingDates = dates.filter(date =>
      checkConflict(request.driver, request.startTime, request.endTime, date)
    );

    if (conflictingDates.length > 0) {
      const dateList = conflictingDates
        .map(d => formatDateShort(d))
        .join(', ');
      alert(
        `Konflik jadwal terdeteksi pada:\n${dateList}\n\n` +
        `Driver ${request.driver} sudah memiliki jadwal di waktu tersebut.\n` +
        `Edit request sebelum approve.`
      );
      return;
    }

    // ── Phase 4: Create one assignment per date ──
    const newAssignments = dates.map(date => requestToAssignment(request, admin, date));
    assignments = [...assignments, ...newAssignments];

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
    setCurrentDate(request.startDate);
    setCurrentDateForm(request.startDate);
    saveAssignments(assignments);
    saveRequests(requests);

    const currentUser = getCurrentUser();
    logAction({
      userId: currentUser?.id,
      username: currentUser?.username,
      action: 'request_approved',
      targetId: requestId,
      metadata: { assignmentCount: newAssignments.length, assignmentIds: newAssignments.map(a => a.id) },
    });

    renderTimeline();
    updatePermissionUI();

    if (dates.length > 1) {
      showToast(`✅ ${dates.length} assignment berhasil dibuat`);
    }

    // Notify requester (bidang) — non-blocking
    sendRequestApprovedNotification(request, getUserByUsername);
    // Notify driver once about the approved request — non-blocking
    if (newAssignments.length > 0) {
      sendNewAssignmentNotificationToDriver(newAssignments[0], getUsers);
    }
  });

  // ── Callback: Admin reject request ──
  registerRequestRejectCallback((requestId) => {
    if (!isAdmin()) return;
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
    const currentUser = getCurrentUser();
    logAction({ userId: currentUser?.id, username: currentUser?.username, action: 'request_rejected', targetId: requestId });
    updatePermissionUI();

    // Notify requester (bidang) via Telegram — non-blocking
    const rejectedRequest = requests.find(item => item.id === requestId);
    if (rejectedRequest) sendRequestRejectedNotification(rejectedRequest, getUserByUsername);
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
    const currentUser = getCurrentUser();
    logAction({ userId: currentUser?.id, username: currentUser?.username, action: 'assignment_deleted', targetId: assignmentId });

    // Re-render timeline
    renderTimeline();

    console.log(`Assignment ${assignmentId} deleted`);
  });

  // Initialize Firebase real-time sync
  // Ini akan set up listener yang update assignments dan requests.
  initFirebaseSync();

  // H-1 reminder (D-1): check on load, then every 60 minutes
  const runH1Check = () => checkAndSendH1Reminders(assignments, requests, getUserByUsername, getUsers);
  runH1Check();
  setInterval(runH1Check, 60 * 60 * 1000);

  // H-2 hours reminder: check every 5 minutes for assignments starting ~2 hours from now
  const runH2Check = () => checkAndSendHoursReminders(assignments, requests, getUserByUsername, getUsers);
  runH2Check();
  setInterval(runH2Check, 5 * 60 * 1000);

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
  isAdmin,
  isBidang,
  checkConflict,
  renderTimeline,
};

console.info(`Jadwal Driver PBSI v${APP_VERSION} loaded`);
