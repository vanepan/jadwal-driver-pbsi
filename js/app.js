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
import { loadAssignments, saveAssignments, saveOneAssignment, removeOneAssignment, loadRequests, saveRequests, initFirebaseSync, registerDataChangeListener, registerRequestsChangeListener, checkAssignmentSafety, fetchFirebaseData } from './firebase.js';
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
// Feature flags — read once at startup from Firebase /feature_flags.
// Default: all false. Populated by loadFeatureFlags() before any UI init.
let appFlags = {};

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
 * Set the active tab in the mobile bottom navigation.
 * Removes bottom-nav-active from every item, then adds it to the target.
 * Safe to call when the bottom nav is not visible (desktop / modal open).
 * @param {string} id - Element ID of the tab to mark active.
 */
function setBottomNavActive(id) {
  document.querySelectorAll('#bottomNav .bottom-nav-item').forEach(btn => {
    btn.classList.toggle('bottom-nav-active', btn.id === id);
  });
}

/**
 * Set the active item in the desktop sidebar navigation.
 * Removes sidebar-nav-item--active from every nav item, then adds it to the
 * target.  Pass null to clear all active states (login / logout).
 *
 * IMPORTANT: only called from user-interaction click handlers and the auth
 * change callback.  Never called from updatePermissionUI() so Firebase
 * real-time refreshes do not disturb the active state.
 *
 * @param {string|null} id - Element ID of the item to mark active, or null to clear.
 */
function setSidebarActive(id) {
  document.querySelectorAll('#sidebar .sidebar-nav-item').forEach(btn => {
    btn.classList.toggle('sidebar-nav-item--active', Boolean(id) && btn.id === id);
  });
}

/**
 * VSM-2: Set the active item in the V2 context panel navigation.
 * Removes v2-panel-nav-item--active from every nav item then adds it to
 * the target. Safe to call when the panel does not exist (flag off).
 * @param {string|null} id - Element ID of the item to mark active, or null to reset to timeline.
 */
function setV2PanelNavActive(id) {
  document.querySelectorAll('#v2Panel .v2-panel-nav-item').forEach(btn => {
    btn.classList.toggle('v2-panel-nav-item--active', btn.id === id);
  });
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
  // Notification bell: all authenticated users (content is already role-filtered)
  if (bottomNavNotifications) {
    bottomNavNotifications.style.display = currentUser ? 'flex' : 'none';
  }
  if (bottomNavProfile) {
    bottomNavProfile.style.display = currentUser ? 'flex' : 'none';
  }

  // Header notification bell — all authenticated users, desktop only (CSS hides on mobile)
  const btnHeaderNotif = document.getElementById('btnHeaderNotif');
  if (btnHeaderNotif) {
    btnHeaderNotif.style.display = currentUser ? 'flex' : 'none';
  }

  // Bottom nav label — admin sees pending queue ("Antrian"), bidang sees history ("Riwayat")
  const bottomNavRequestsLabel = document.getElementById('bottomNavRequestsLabel');
  if (bottomNavRequestsLabel) {
    bottomNavRequestsLabel.textContent = isAdmin() ? 'Antrian' : 'Riwayat';
  }

  // ── VSM-1: V2 rail avatar initials — update on every auth change ──
  // The element only exists when visualShellV2 flag is on; guard with getElementById.
  const railInitials = document.getElementById('v2RailAvatarInitials');
  if (railInitials) {
    const displayName = currentUser?.name || currentUser?.displayName || currentUser?.username || '';
    const initials = displayName
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map(w => (w[0] ?? '').toUpperCase())
      .join('') || '?';
    railInitials.textContent = initials;
  }

  // ── VSM-2: V2 context panel role-gating ──
  // Only runs when the panel element exists (visualShellV2 flag is on).
  const v2Panel = document.getElementById('v2Panel');
  if (v2Panel) {
    const canAdd = isAdmin() || isBidang();

    // CTA area: visible only for roles that can create/request assignments
    const v2PanelCta = document.getElementById('v2PanelCta');
    if (v2PanelCta) v2PanelCta.style.display = canAdd ? 'flex' : 'none';

    // Primary CTA label: admin → "Tambah Jadwal", bidang → "Request Jadwal"
    const v2BtnTambahLabel = document.getElementById('v2BtnTambahLabel');
    if (v2BtnTambahLabel) {
      v2BtnTambahLabel.textContent = isAdmin() ? 'Tambah Jadwal' : 'Request Jadwal';
    }

    // Ajukan Request: bidang only (admin already has Tambah Jadwal)
    const v2BtnAjukanRequest = document.getElementById('v2BtnAjukanRequest');
    if (v2BtnAjukanRequest) {
      v2BtnAjukanRequest.style.display = isBidang() ? 'flex' : 'none';
    }

    // Pending nav item: admin (approval queue) + bidang (own request history)
    const v2NavPending = document.getElementById('v2NavPending');
    if (v2NavPending) {
      v2NavPending.style.display = canAdd ? 'flex' : 'none';
    }

    // Jadwal Saya: driver only (personal schedule dashboard)
    const v2NavJadwalSaya = document.getElementById('v2NavJadwalSaya');
    if (v2NavJadwalSaya) {
      v2NavJadwalSaya.style.display = isDriver() ? 'flex' : 'none';
    }

    // Pending badge: admin only, shows count of pending requests
    const v2PanelBadge = document.getElementById('v2PanelBadge');
    if (v2PanelBadge) {
      const pendingCount = getPendingRequestCount();
      const showBadge = isAdmin() && pendingCount > 0;
      v2PanelBadge.textContent = String(pendingCount);
      v2PanelBadge.style.display = showBadge ? 'inline-flex' : 'none';
    }

    // Reset active state to Dashboard on every auth/permission change.
    // The active tab is updated per-click in initV2Panel() handlers.
    setV2PanelNavActive('v2NavDashboard');
  }

  // Reset bottom nav to Dashboard on every auth/permission change.
  // The active tab is updated per-tap in click handlers below; this ensures
  // a clean state after login, logout, or a Firebase-triggered UI refresh.
  setBottomNavActive('bottomNavDashboard');
}

/**
 * Load feature flags once at startup.
 *
 * Priority (highest → lowest):
 *   1. localStorage override  — developer device only, never production.
 *      Set:   localStorage.setItem('pbsi_flag_visualShellV2', 'true')
 *      Clear: localStorage.removeItem('pbsi_flag_visualShellV2')
 *   2. Firebase RTDB /feature_flags — authoritative source.
 *   3. Empty object (all flags default false) — Firebase timeout or error.
 *
 * 3-second timeout prevents Firebase latency from blocking app startup.
 */
async function loadFeatureFlags() {
  const LS_PREFIX = 'pbsi_flag_';
  const flagNames = ['visualShellV2'];

  // Check localStorage overrides first
  const overrides = {};
  let hasOverride = false;
  for (const name of flagNames) {
    const val = localStorage.getItem(LS_PREFIX + name);
    if (val !== null) {
      overrides[name] = val === 'true';
      hasOverride = true;
    }
  }
  if (hasOverride) {
    console.log('[flags] using localStorage overrides:', overrides);
    return overrides;
  }

  // Firebase read with 3-second timeout
  try {
    const flagsData = await Promise.race([
      fetchFirebaseData('feature_flags'),
      new Promise(resolve => setTimeout(() => resolve(null), 3000)),
    ]);
    const flags = (flagsData && typeof flagsData === 'object') ? flagsData : {};
    if (Object.keys(flags).length > 0) {
      console.log('[flags] loaded from Firebase:', flags);
    }
    return flags;
  } catch (err) {
    console.warn('[flags] Firebase read failed, using defaults:', err);
    return {};
  }
}

/**
 * VSM-1: Inject the V2 navigation rail and activate the v2-shell-active
 * body class. Called only when flags.visualShellV2 === true.
 *
 * The rail element does not exist in the DOM when the flag is off —
 * this satisfies the "hidden means absent" feature flag rule.
 *
 * Wiring: all click handlers proxy to existing V1 DOM elements so no
 * V1 event listeners, modals, or workflows are touched.
 */
function initV2Rail() {
  // Build the rail element
  const rail = document.createElement('div');
  rail.className = 'v2-rail';
  rail.id = 'v2Rail';
  rail.innerHTML = `
    <div class="v2-rail-crest" id="v2RailCrest"
         role="button" tabindex="0"
         aria-label="PBSI Operations — kembali ke timeline">
      <img src="assets/Logo-PBSI.png" alt="" class="v2-rail-crest-img"
           onerror="this.style.display='none'" />
    </div>

    <nav class="v2-rail-modules" aria-label="Navigasi modul">
      <!-- Driver Operations — only active module; other modules hidden (flags off) -->
      <div class="v2-rail-item v2-rail-item--active" id="v2RailDriverOps"
           role="button" tabindex="0"
           aria-label="Driver Operations" aria-current="true">
        <svg class="v2-rail-icon" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fill-rule="evenodd"
                d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0
                   002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0
                   00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z"
                clip-rule="evenodd"/>
        </svg>
        <div class="v2-rail-tooltip" aria-hidden="true">Driver Operations</div>
      </div>
    </nav>

    <div class="v2-rail-avatar" id="v2RailAvatar"
         role="button" tabindex="0"
         aria-label="Buka profil">
      <span class="v2-rail-avatar-initials" id="v2RailAvatarInitials"
            aria-hidden="true"></span>
    </div>
  `;

  // Insert before #sidebar so it appears at the start of .app-layout
  const appLayout = document.querySelector('.app-layout');
  const sidebar = document.getElementById('sidebar');
  if (appLayout && sidebar) {
    appLayout.insertBefore(rail, sidebar);
  } else {
    document.body.insertBefore(rail, document.body.firstChild);
  }

  // Activate the CSS gate — hides V1 sidebar (desktop) and shifts .main-area
  document.body.classList.add('v2-shell-active');

  // ── Event handlers — all proxy to existing V1 elements ──

  const crest     = document.getElementById('v2RailCrest');
  const driverOps = document.getElementById('v2RailDriverOps');
  const avatar    = document.getElementById('v2RailAvatar');

  // Crest: scroll timeline body to top
  crest?.addEventListener('click', () => {
    document.querySelector('.main-content')?.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // Driver Ops icon: already the active module; scroll to top (no routing)
  driverOps?.addEventListener('click', () => {
    document.querySelector('.main-content')?.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // Avatar: proxy click to V1 profile button (preserves all profile modal logic)
  avatar?.addEventListener('click', () => {
    document.getElementById('btnProfile')?.click();
  });

  // Keyboard: Enter/Space activates any focusable rail element
  [crest, driverOps, avatar].forEach(el => {
    el?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        el.click();
      }
    });
  });

  console.log('[VSM-1] Navigation rail initialised');
}

/**
 * VSM-2: Inject the V2 context panel (218px) and wire all nav/CTA buttons
 * to their V1 proxy targets. Called only when flags.visualShellV2 === true,
 * immediately after initV2Rail().
 *
 * Proxy pattern: every button calls the matching V1 element's .click() or
 * the already-imported module function directly. Zero V1 event listeners
 * are modified or duplicated.
 *
 * Role-gating is deferred to updatePermissionUI() which runs after auth
 * resolves. All role-dependent items start hidden (style="display:none").
 */
function initV2Panel() {
  const panel = document.createElement('div');
  panel.className = 'v2-panel';
  panel.id = 'v2Panel';
  panel.innerHTML = `
    <!-- Module title -->
    <div class="v2-panel-header">
      <span class="v2-panel-title">Driver Operations</span>
    </div>
    <div class="v2-panel-divider"></div>

    <!-- CTAs — role-gated; hidden until updatePermissionUI() resolves auth -->
    <div class="v2-panel-cta" id="v2PanelCta" style="display:none;">
      <button class="v2-panel-btn v2-panel-btn--primary" id="v2BtnTambahJadwal" type="button">
        <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14" aria-hidden="true">
          <path d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"/>
        </svg>
        <span id="v2BtnTambahLabel">Tambah Jadwal</span>
      </button>
      <button class="v2-panel-btn v2-panel-btn--ghost" id="v2BtnAjukanRequest" type="button" style="display:none;">
        <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14" aria-hidden="true">
          <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z"/>
          <path fill-rule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5z" clip-rule="evenodd"/>
        </svg>
        Ajukan Request
      </button>
    </div>

    <!-- Navigation list -->
    <nav class="v2-panel-nav" aria-label="Driver Operations menu">

      <!-- Dashboard: all authenticated roles -->
      <button class="v2-panel-nav-item v2-panel-nav-item--active" id="v2NavDashboard" type="button">
        <svg class="v2-panel-nav-icon" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z"/>
        </svg>
        Dashboard
      </button>

      <!-- Pending: admin (approval queue) + bidang (request history) -->
      <button class="v2-panel-nav-item" id="v2NavPending" type="button" style="display:none;">
        <svg class="v2-panel-nav-icon" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z"/>
          <path fill-rule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clip-rule="evenodd"/>
        </svg>
        Pending
        <span class="v2-panel-badge" id="v2PanelBadge" style="display:none;"></span>
      </button>

      <!-- Jadwal Saya: driver role only -->
      <button class="v2-panel-nav-item" id="v2NavJadwalSaya" type="button" style="display:none;">
        <svg class="v2-panel-nav-icon" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fill-rule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clip-rule="evenodd"/>
        </svg>
        Jadwal Saya
      </button>

    </nav>

    <div class="v2-panel-spacer"></div>
    <div class="v2-panel-divider"></div>

    <!-- Footer — always visible when logged in -->
    <div class="v2-panel-footer">
      <button class="v2-panel-footer-btn" id="v2FooterProfil" type="button">
        <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14" aria-hidden="true">
          <path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd"/>
        </svg>
        Profil
      </button>
      <button class="v2-panel-footer-btn v2-panel-footer-btn--logout" id="v2FooterKeluar" type="button">
        <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14" aria-hidden="true">
          <path fill-rule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 102 0V4a1 1 0 00-1-1zm10.293 9.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L14.586 9H7a1 1 0 100 2h7.586l-1.293 1.293z" clip-rule="evenodd"/>
        </svg>
        Keluar
      </button>
    </div>
  `;

  // Insert immediately after .v2-rail (before #sidebar)
  const rail = document.getElementById('v2Rail');
  if (rail) {
    rail.after(panel);
  } else {
    const appLayout = document.querySelector('.app-layout');
    const sidebar   = document.getElementById('sidebar');
    if (appLayout && sidebar) appLayout.insertBefore(panel, sidebar);
    else document.body.appendChild(panel);
  }

  // ── Event handlers — all proxy to V1 elements or imported functions ──

  // Tambah Jadwal: admin → assignment form; bidang → request form
  document.getElementById('v2BtnTambahJadwal')?.addEventListener('click', () => {
    if (isAdmin()) {
      openFormModal();
    } else if (isBidang()) {
      openRequestFormModal();
    }
  });

  // Ajukan Request: bidang only — direct call to request form
  document.getElementById('v2BtnAjukanRequest')?.addEventListener('click', () => {
    openRequestFormModal();
  });

  // Dashboard nav: scroll timeline to top (same as bottomNavDashboard)
  document.getElementById('v2NavDashboard')?.addEventListener('click', () => {
    setV2PanelNavActive('v2NavDashboard');
    setCurrentDate(getCurrentDate());
    renderTimeline();
    if (isDriver()) renderDriverDashboard();
  });

  // Pending nav: proxy to V1 #btnRequests (role-aware handler already wired)
  document.getElementById('v2NavPending')?.addEventListener('click', () => {
    setV2PanelNavActive('v2NavPending');
    document.getElementById('btnRequests')?.click();
  });

  // Jadwal Saya: scroll to driver dashboard section
  document.getElementById('v2NavJadwalSaya')?.addEventListener('click', () => {
    setV2PanelNavActive('v2NavJadwalSaya');
    document.getElementById('driverDashboard')?.scrollIntoView({ behavior: 'smooth' });
  });

  // Profil footer: proxy to V1 #btnProfile
  document.getElementById('v2FooterProfil')?.addEventListener('click', () => {
    document.getElementById('btnProfile')?.click();
  });

  // Keluar footer: proxy to V1 #btnLogout
  document.getElementById('v2FooterKeluar')?.addEventListener('click', () => {
    document.getElementById('btnLogout')?.click();
  });

  console.log('[VSM-2] Context panel initialised');
}

/**
 * VSM-3: Create the V2 sticky topbar and migrate existing DOM nodes from
 * the V1 .header into it. Called only when flags.visualShellV2 === true,
 * immediately after initV2Panel().
 *
 * CRITICAL ORDERING: this function MUST run before any getElementById-based
 * handler binding in DOMContentLoaded. initDateControls(), initNotificationUI(),
 * and the sidebarToggle click handler all run later and will find the migrated
 * elements in their new (topbar) location via getElementById — no rebinding needed.
 *
 * DOM migration (existing nodes, listeners travel with them):
 *   #sidebarToggle     ← hamburger; existing openSidebar handler binds later
 *   .date-nav          ← date controls; initDateControls() binds later
 *   .header-user-area  ← display name + role badge + notif bell; binds later
 *
 * New decorative nodes (no event listeners):
 *   #v2TopbarCrumb     ← "Driver Operations" breadcrumb, desktop only
 *   .v2-topbar-spacer  ← flex: 1 push
 *
 * Rollback: page reload with flag off → fresh HTML, no migration occurs.
 */
function initV2Topbar() {
  // ── Build topbar shell ──
  const topbar = document.createElement('div');
  topbar.className = 'v2-topbar';
  topbar.id = 'v2Topbar';

  // ── Create new elements (breadcrumb + spacer) ──
  const crumb = document.createElement('span');
  crumb.id = 'v2TopbarCrumb';
  crumb.textContent = 'Driver Operations';
  crumb.setAttribute('aria-hidden', 'true'); // decorative — rail already labels module

  const spacer = document.createElement('div');
  spacer.className = 'v2-topbar-spacer';
  spacer.setAttribute('aria-hidden', 'true');

  // ── Locate existing DOM elements to migrate ──
  // Scope to .main-area .header to avoid matching elements outside the header.
  const header   = document.querySelector('.main-area .header');
  const toggler  = header?.querySelector('#sidebarToggle')
                   ?? document.getElementById('sidebarToggle');
  const dateNav  = header?.querySelector('.date-nav')
                   ?? document.querySelector('.date-nav');
  const userArea = header?.querySelector('.header-user-area')
                   ?? document.querySelector('.header-user-area');

  // Guard: abort if header is not found — V1 layout must be intact
  if (!header) {
    console.warn('[VSM-3] .header not found — topbar skipped');
    return;
  }

  // ── Assemble topbar — DOM order drives flex layout ──
  // Desktop (≥768px): [hamburger-hidden] [crumb] [date-nav] [spacer] [user-area]
  // Mobile  (≤767px): [hamburger] [spacer] [user-area] row-1
  //                   [date-nav full-width]             row-2  (via CSS order)
  if (toggler)  topbar.appendChild(toggler);
  topbar.appendChild(crumb);
  if (dateNav)  topbar.appendChild(dateNav);
  topbar.appendChild(spacer);
  if (userArea) topbar.appendChild(userArea);

  // ── Insert as first child of .main-area, before the V1 .header shell ──
  // The V1 .header is hidden via CSS (body.v2-shell-active .header { display:none })
  // but stays in the DOM as a harmless empty shell for rollback safety.
  const mainArea = document.querySelector('.main-area');
  if (mainArea) {
    mainArea.insertBefore(topbar, header);
  }

  console.log('[VSM-3] V2 topbar initialised — DOM nodes migrated from .header');
}

/**
 * Main initialization saat DOM ready
 */
document.addEventListener('DOMContentLoaded', async () => {
  console.log('Initializing PBSI Scheduler app...');

  // ── Feature flags — read once before any UI init ──
  // If visualShellV2 is true: inject the V2 rail and activate v2-shell-active.
  // If false (default): nothing changes — app is identical to v1.2.5.
  appFlags = await loadFeatureFlags();
  if (appFlags.visualShellV2 === true) {
    initV2Rail();
    initV2Panel();
    // VSM-3: must run before sidebar-toggle and initDateControls() handler binding
    initV2Topbar();
  }

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
    // Move keyboard focus to the first visible, enabled button in the drawer.
    // setTimeout defers until after the CSS slide-in transition begins.
    setTimeout(() => {
      const btns = sidebar ? [...sidebar.querySelectorAll('button')] : [];
      const first = btns.find(b => !b.disabled && b.offsetParent !== null);
      first?.focus();
    }, 50);
  }

  function closeSidebar() {
    sidebar?.classList.remove('sidebar-open');
    sidebarOverlay?.classList.remove('overlay-visible');
    document.body.classList.remove('sidebar-is-open');
    // Return focus to the hamburger button so keyboard users are not stranded.
    // On desktop the toggle is hidden (display:none) and focus() is a no-op.
    sidebarToggle?.focus();
  }

  sidebarToggle?.addEventListener('click', openSidebar);
  sidebarClose?.addEventListener('click', closeSidebar);
  sidebarOverlay?.addEventListener('click', closeSidebar);

  // Escape key closes the drawer (keyboard accessibility, P2.3)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sidebar?.classList.contains('sidebar-open')) {
      closeSidebar();
    }
  });

  // Close sidebar when any nav item is clicked on mobile
  sidebar?.querySelectorAll('.sidebar-nav-item').forEach(item => {
    item.addEventListener('click', () => {
      if (window.innerWidth < 768) closeSidebar();
    });
  });

  // ── Sidebar active state: set per click, never reset by data refreshes ──
  // Tambah Jadwal (CTA) and Logout are intentionally excluded.
  document.getElementById('btnRequests')?.addEventListener('click', () => setSidebarActive('btnRequests'));
  document.getElementById('btnProfile')?.addEventListener('click',   () => setSidebarActive('btnProfile'));
  document.getElementById('btnUserMgmt')?.addEventListener('click',  () => setSidebarActive('btnUserMgmt'));

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
    setBottomNavActive('bottomNavDashboard');
    setCurrentDate(getCurrentDate()); // resets lastAutoFocusedDate
    renderTimeline();
    if (isDriver()) renderDriverDashboard();
  });

  // ── Bottom nav proxy buttons ──
  document.getElementById('bottomNavRequests')?.addEventListener('click', () => {
    setBottomNavActive('bottomNavRequests');
    document.getElementById('btnRequests')?.click();
  });
  document.getElementById('bottomNavNotifications')?.addEventListener('click', () => {
    setBottomNavActive('bottomNavNotifications');
    document.getElementById('btnNotifications')?.click();
  });
  document.getElementById('bottomNavProfile')?.addEventListener('click', () => {
    setBottomNavActive('bottomNavProfile');
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
  // Auth callback: updatePermissionUI + clear sidebar active state.
  // Sidebar is cleared on login/logout but NOT on Firebase data refreshes,
  // which call updatePermissionUI() directly and bypass this wrapper.
  await initAuthUI(() => {
    updatePermissionUI();
    setSidebarActive(null);
  });
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
