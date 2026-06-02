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
import { APP_NAME, APP_VERSION } from './config.js';
import { loadAssignments, saveAssignments, saveOneAssignment, removeOneAssignment, loadRequests, saveRequests, initFirebaseSync, registerDataChangeListener, registerRequestsChangeListener, checkAssignmentSafety } from './firebase.js';
import { recoverAssignmentsFromRequests } from './recovery.js';
import { initDriverSelect } from './drivers.js';
import { renderTimeline, setCurrentDate, setAssignments as setTimelineAssignments, initDateControls, getCurrentDate } from './timeline.js';
import { initModalHandlers, registerEditCallback, registerDeleteCallback, registerStartCallback, registerCompleteCallback, registerCommentCallback as registerModalCommentCallback, setAssignments as setModalAssignments, updateDetailActionButtons } from './modal.js';
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
  registerCommentCallback as registerRequestCommentCallback,
  setRequests as setRequestsModule,
  getPendingRequestCount,
  renderRequestsList,
  requestToAssignment,
  normalizeRequest,
} from './requests.js';
import { renderDriverDashboard, setAssignments as setDashboardAssignments } from './driver-dashboard.js';
import { initCommentHandlers, openCommentModal, closeCommentModal, setRequests as setCommentRequests, registerCommentSaveCallback, refreshCommentThreadIfOpen } from './comments.js';
import { initAdminUI, updateAdminButtons } from './admin.js';
import { initNotificationUI, setNotificationData, openNotificationsModal } from './notifications.js';
import { subscribeLogsChangeListener, getLogs, logAction } from './logs.js';
import { getUserByUsername, getUsers, createUser } from './users.js';
import { expandDateRange, showToast, formatDateShort } from './utils.js';
import {
  sendRequestApprovedNotification,
  sendRequestRejectedNotification,
  sendNewRequestNotificationToAdmins,
  sendNewAssignmentNotificationToDriver,
  checkAndSendH1Reminders,
  checkAndSendHoursReminders,
} from './notification-service.js';

console.info(`PBSI Scheduler v${APP_VERSION}`);

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
 * Normalize legacy assignment status values to canonical lifecycle codes.
 * null / 'aktif' → 'assigned'; 'selesai' → 'completed'
 */
function normalizeAssignmentStatus(a) {
  const s = a.status;
  if (!s || s === 'aktif') return { ...a, status: 'assigned' };
  if (s === 'selesai')     return { ...a, status: 'completed' };
  return a;
}

/**
 * Update all modules dengan data assignments terbaru
 * Dipanggil setiap kali ada perubahan data (Firebase sync, form submit, delete, etc)
 */
function updateAllModules() {
  // Timeline, modal, and conflict-check always see ALL assignments
  setTimelineAssignments(assignments);
  setModalAssignments(assignments);
  setAssignmentsForm(assignments);

  // Driver Dashboard shows only assignments for the logged-in driver
  setDashboardAssignments(filterAssignmentsForUser(assignments));

  setRequestsModule(requests);
  setCommentRequests(requests);
  renderDriverDashboard();
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

  // ── Driver Dashboard panel: shown for driver role, hidden for others ──
  // Re-filter and re-set assignments here so the dashboard always has
  // fresh, role-correct data the moment it becomes visible.
  const driverView = isDriver();
  const dashboard = document.getElementById('driverDashboard');
  if (dashboard) dashboard.style.display = driverView ? 'block' : 'none';
  if (driverView) {
    setDashboardAssignments(filterAssignmentsForUser(assignments));
    renderDriverDashboard();
  }

  // ── Sync FAB, Pengaturan, and bottom nav visibility ──
  const currentUser = getCurrentUser();
  const canAdd = isAdmin() || isBidang();

  // FAB: Tambah Jadwal / Buat Request (mobile) — label reflects role
  const fabAdd = document.getElementById('fabAdd');
  const fabLabel = document.getElementById('fabLabel');
  if (fabAdd) fabAdd.style.display = canAdd ? 'flex' : 'none';
  if (fabLabel) fabLabel.textContent = isAdmin() ? 'Tambah Jadwal' : 'Buat Request';

  // Bottom nav items
  const bottomNavRequests = document.getElementById('bottomNavRequests');
  const bottomNavRequestsBadge = document.getElementById('bottomNavRequestsBadge');
  const bottomNavNotifications = document.getElementById('bottomNavNotifications');
  const bottomNavProfile = document.getElementById('bottomNavProfile');

  if (bottomNavRequests) {
    bottomNavRequests.style.display = canAdd ? 'flex' : 'none';
    if (bottomNavRequestsBadge) {
      const pendingCount = getPendingRequestCount();
      const showCount = isAdmin() && pendingCount > 0;
      bottomNavRequestsBadge.textContent = String(pendingCount);
      bottomNavRequestsBadge.style.display = showCount ? 'inline-flex' : 'none';
    }
  }
  if (bottomNavNotifications) {
    bottomNavNotifications.style.display = isAdmin() ? 'flex' : 'none';
  }
  if (bottomNavProfile) {
    bottomNavProfile.style.display = currentUser ? 'flex' : 'none';
  }
}

/**
 * Main initialization saat DOM ready
 */
document.addEventListener('DOMContentLoaded', async () => {
  console.log('Initializing PBSI Scheduler app...');

  // ── Populate version & app name elements from config ──
  document.querySelectorAll('.app-version-text').forEach(el => {
    el.textContent = `v${APP_VERSION}`;
  });
  document.querySelectorAll('.app-version-full').forEach(el => {
    el.textContent = `Versi ${APP_VERSION}`;
  });
  document.querySelectorAll('.app-name-text').forEach(el => {
    el.textContent = APP_NAME;
  });

  // ── Sidebar toggle (mobile drawer) ──
  const sidebar = document.getElementById('sidebar');
  const sidebarToggle = document.getElementById('sidebarToggle');
  const sidebarClose = document.getElementById('sidebarClose');
  const sidebarOverlay = document.getElementById('sidebarOverlay');

  function openSidebar() {
    sidebar?.classList.add('sidebar-open');
    sidebarOverlay?.classList.add('overlay-visible');
    document.body.classList.add('sidebar-is-open');
  }

  function closeSidebar() {
    sidebar?.classList.remove('sidebar-open');
    sidebarOverlay?.classList.remove('overlay-visible');
    document.body.classList.remove('sidebar-is-open');
  }

  sidebarToggle?.addEventListener('click', openSidebar);
  sidebarClose?.addEventListener('click', closeSidebar);
  sidebarOverlay?.addEventListener('click', closeSidebar);

  // Close sidebar when any nav item is clicked on mobile
  sidebar?.querySelectorAll('.sidebar-nav-item').forEach(item => {
    item.addEventListener('click', () => {
      if (window.innerWidth < 769) closeSidebar();
    });
  });

  // ── Profile modal logout button ──
  document.getElementById('btnLogoutProfile')?.addEventListener('click', () => {
    document.getElementById('btnCancelProfile')?.click(); // close profile modal
    document.getElementById('btnLogout')?.click();        // trigger logout
  });

  // ── FAB: Tambah Jadwal / Buat Request (mobile primary action) ──
  document.getElementById('fabAdd')?.addEventListener('click', () => {
    if (isAdmin()) {
      openFormModal();
    } else if (isBidang()) {
      openRequestFormModal();
    }
  });

  // ── Bottom nav: Dashboard (scroll timeline to focus) ──
  document.getElementById('bottomNavDashboard')?.addEventListener('click', () => {
    setCurrentDate(getCurrentDate()); // resets lastAutoFocusedDate
    renderTimeline();
    if (isDriver()) renderDriverDashboard();
  });

  // ── Bottom nav proxy buttons ──
  document.getElementById('bottomNavRequests')?.addEventListener('click', () => {
    document.getElementById('btnRequests')?.click();
  });
  document.getElementById('bottomNavNotifications')?.addEventListener('click', () => {
    document.getElementById('btnNotifications')?.click();
  });
  document.getElementById('bottomNavProfile')?.addEventListener('click', () => {
    document.getElementById('btnProfile')?.click();
  });

  // Setup global debug namespace for console/legacy access
  window.appDebug = window.appDebug || {};
  window.appDebug.openFormModal = openFormModal;
  window.appDebug.closeFormModal = closeFormModal;
  window.appDebug.openNotificationsModal = openNotificationsModal;
  // Recovery: pulihkan assignment historis dari approved driver_requests
  // Cara pakai: await window.appDebug.recoverAssignments(true)  → dry run
  //             await window.appDebug.recoverAssignments()       → pulihkan
  window.appDebug.recoverAssignments = recoverAssignmentsFromRequests;
  // User management (admin only)
  // Cara pakai: await window.appDebug.createUser({ username, displayName, role, pin })
  window.appDebug.createUser = createUser;

  // Load assignments dari localStorage (cache lokal)
  // Normalize requests on load: convert legacy { date } → { startDate, endDate }
  // Normalize assignment status: convert legacy 'selesai'/'aktif' → lifecycle codes
  assignments = loadAssignments().map(normalizeAssignmentStatus);
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
  initCommentHandlers();                 // Setup comment thread events
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
    assignments = updatedAssignments.map(normalizeAssignmentStatus);
    updateAllModules();   // also calls setDashboardAssignments + renderDriverDashboard
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
    // Refresh comment modal if open for one of the updated requests
    refreshCommentThreadIfOpen(requests);
  });

  // ── Callback: Form save (add/update assignment) ──
  registerSaveCallback((updatedAssignments, isNewAssignment, assignmentDate, newAssignment) => {
    // Guard: assignments.js memanggil onSaveCallback dari deleteAssignment() tanpa assignmentDate.
    // Operasi delete sudah ditangani sepenuhnya oleh registerDeleteCallback — abaikan path ini.
    if (!isNewAssignment && assignmentDate === undefined) return;

    const prevAssignments = assignments; // capture sebelum update untuk deteksi perubahan
    const beforeCount = prevAssignments.length;

    // Safety guard: deteksi jika data lokal jauh lebih sedikit dari Firebase
    checkAssignmentSafety(beforeCount);

    assignments = updatedAssignments;
    updateAllModules();

    if (isNewAssignment) {
      setCurrentDate(assignmentDate);
      setCurrentDateForm(assignmentDate);
    }

    saveAssignments(assignments); // localStorage only

    // Surgical Firebase write — hanya tulis yang berubah, tidak overwrite semua
    if (isNewAssignment && newAssignment) {
      // Single-day baru: newAssignment sudah diketahui
      saveOneAssignment(newAssignment);
    } else if (isNewAssignment && !newAssignment) {
      // Multi-day baru: cari assignments yang tidak ada di prevAssignments
      const prevIds = new Set(prevAssignments.map(a => a.id));
      updatedAssignments.filter(a => !prevIds.has(a.id)).forEach(a => saveOneAssignment(a));
    } else {
      // Edit: cari assignment yang berubah
      const edited = updatedAssignments.find(a => {
        const prev = prevAssignments.find(p => p.id === a.id);
        return prev && JSON.stringify(prev) !== JSON.stringify(a);
      });
      if (edited) saveOneAssignment(edited);
      // Jika tidak ada yang berubah (misal dipanggil dari deleteAssignment internal),
      // removeOneAssignment sudah ditangani di registerDeleteCallback.
    }

    const currentUser = getCurrentUser();
    logAction({
      userId: currentUser?.id,
      username: currentUser?.username,
      displayName: currentUser?.name,
      action: isNewAssignment ? 'assignment_created' : 'assignment_edited',
      metadata: {
        date: assignmentDate,
        beforeCount,
        afterCount: assignments.length,
        operationType: isNewAssignment ? 'create' : 'edit',
      },
    });

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
    logAction({ userId: currentUser?.id, username: currentUser?.username, displayName: currentUser?.name, action: 'request_created', targetId: newRequest.id, metadata: { status: newRequest.status } });
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
    logAction({ userId: currentUser?.id, username: currentUser?.username, displayName: currentUser?.name, action: 'request_updated', targetId: updatedRequest.id, metadata: { status: updatedRequest.status } });
    updatePermissionUI();
  });

  // ── Callback: Admin approve request ──
  registerRequestApproveCallback((requestId) => {
    if (!isAdmin()) return;

    // Safety guard sebelum bulk create
    checkAssignmentSafety(assignments.length);

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
    saveAssignments(assignments); // localStorage only
    // Surgical: hanya tulis assignments baru hasil approval, tidak overwrite semua
    newAssignments.forEach(a => saveOneAssignment(a));
    saveRequests(requests);

    const currentUser = getCurrentUser();
    logAction({
      userId: currentUser?.id,
      username: currentUser?.username,
      action: 'request_approved',
      targetId: requestId,
      metadata: {
        assignmentCount: newAssignments.length,
        assignmentIds: newAssignments.map(a => a.id),
        beforeCount: assignments.length - newAssignments.length,
        afterCount: assignments.length,
        operationType: 'bulk_create',
      },
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
    logAction({ userId: currentUser?.id, username: currentUser?.username, displayName: currentUser?.name, action: 'request_rejected', targetId: requestId });
    updatePermissionUI();

    // Notify requester (bidang) via Telegram — non-blocking
    const rejectedRequest = requests.find(item => item.id === requestId);
    if (rejectedRequest) sendRequestRejectedNotification(rejectedRequest, getUserByUsername);
  });

  // ── Callback: Comment thread — from request card (admin/bidang) ──
  registerRequestCommentCallback((requestId) => openCommentModal(requestId));

  // ── Callback: Comment thread — from assignment detail (driver/admin) ──
  registerModalCommentCallback((requestId) => openCommentModal(requestId));

  // ── Callback: Save a new comment to a request ──
  registerCommentSaveCallback((updatedRequest) => {
    requests = requests.map(r => r.id === updatedRequest.id ? updatedRequest : r);
    setCommentRequests(requests);
    saveRequests(requests);
    renderRequestsList();
  });

  // ── Callback: Edit button di detail modal ──
  registerEditCallback((assignmentId) => {
    if (!hasPermission('edit')) return;
    openFormModal(assignmentId);
  });

  // ── Callback: Delete button di detail modal ──
  registerDeleteCallback((assignmentId) => {
    if (!hasPermission('delete')) return;

    const beforeCount = assignments.length;
    deleteAssignment(assignmentId);
    assignments = assignments.filter(a => a.id !== assignmentId);
    updateAllModules();

    saveAssignments(assignments); // localStorage only
    removeOneAssignment(assignmentId); // Surgical: hapus hanya record ini dari Firebase
    const currentUser = getCurrentUser();
    logAction({
      userId: currentUser?.id,
      username: currentUser?.username,
      displayName: currentUser?.name,
      action: 'assignment_deleted',
      targetId: assignmentId,
      metadata: {
        beforeCount,
        afterCount: assignments.length,
        operationType: 'delete',
      },
    });

    renderTimeline();

    console.log(`Assignment ${assignmentId} deleted`);
  });

  // ── Callback: Mulai button di detail modal ──
  // odoData = { startOdometer: number } — diisi dari odometer modal (v1.2.2)
  registerStartCallback((assignmentId, odoData = {}) => {
    if (!hasPermission('start')) return;

    const idx = assignments.findIndex(a => a.id === assignmentId);
    if (idx === -1) return;

    if (assignments[idx].status === 'started') { showToast('Penugasan sudah dimulai'); return; }
    if (assignments[idx].status === 'completed') { showToast('Penugasan sudah selesai'); return; }

    const currentUser = getCurrentUser();
    const now = new Date().toISOString();
    assignments[idx] = {
      ...assignments[idx],
      status: 'started',
      startedAt: now,
      startedBy: currentUser ? currentUser.name : '',
      startOdometer: odoData.startOdometer ?? null,
      updatedAt: now,
    };

    updateAllModules();
    saveAssignments(assignments); // localStorage only
    saveOneAssignment(assignments[idx]); // Surgical: hanya update record ini di Firebase
    renderTimeline();

    logAction({
      userId: currentUser?.id,
      username: currentUser?.username,
      displayName: currentUser?.name,
      action: 'assignment_started',
      targetId: assignmentId,
      metadata: {
        startedAt: assignments[idx].startedAt,
        startedBy: assignments[idx].startedBy,
        startOdometer: assignments[idx].startOdometer,
      },
    });

    showToast('▶ Penugasan dimulai');
  });

  // ── Callback: Selesai button di detail modal ──
  // odoData = { endOdometer: number } — diisi dari odometer modal (v1.2.2)
  registerCompleteCallback((assignmentId, odoData = {}) => {
    if (!hasPermission('complete')) return;

    const idx = assignments.findIndex(a => a.id === assignmentId);
    if (idx === -1) return;

    if (assignments[idx].status === 'completed') { showToast('Penugasan sudah selesai'); return; }

    const currentUser    = getCurrentUser();
    const now            = new Date().toISOString();
    const endOdometer    = odoData.endOdometer ?? null;
    const startOdometer  = assignments[idx].startOdometer ?? null;
    // Only compute if both values are present and end >= start
    const distanceTravelled = (endOdometer != null && startOdometer != null && endOdometer >= startOdometer)
      ? endOdometer - startOdometer
      : null;

    assignments[idx] = {
      ...assignments[idx],
      status: 'completed',
      completedAt: now,
      completedBy: currentUser ? currentUser.name : '',
      endOdometer,
      distanceTravelled,
      updatedAt: now,
    };

    updateAllModules();
    saveAssignments(assignments); // localStorage only
    saveOneAssignment(assignments[idx]); // Surgical: hanya update record ini di Firebase
    renderTimeline();

    logAction({
      userId: currentUser?.id,
      username: currentUser?.username,
      displayName: currentUser?.name,
      action: 'assignment_completed',
      targetId: assignmentId,
      metadata: {
        completedAt: assignments[idx].completedAt,
        completedBy: assignments[idx].completedBy,
        endOdometer: assignments[idx].endOdometer,
        distanceTravelled: assignments[idx].distanceTravelled,
      },
    });

    showToast('✅ Penugasan selesai');
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
