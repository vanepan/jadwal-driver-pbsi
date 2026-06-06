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
import { initModalHandlers, openDetailModal, registerEditCallback, registerDeleteCallback, registerStartCallback, registerCompleteCallback, registerCommentCallback as registerModalCommentCallback, setAssignments as setModalAssignments, updateDetailActionButtons } from './modal.js';
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
import { initAdminUI, updateAdminButtons, openUserFormModal } from './admin.js';
import { initNotificationUI, setNotificationData, openNotificationsModal } from './notifications.js';
import { subscribeLogsChangeListener, getLogs, logAction } from './logs.js';
import { getUserByUsername, getUsers, createUser, getUserList, activateUser, deactivateUser, registerUsersChangeListener } from './users.js';
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
// Production defaults applied in loadFeatureFlags(); visualShellV2 defaults to true.
let appFlags = {};

// VSM-8: Dashboard view state — 'timeline' | 'list'. In-memory only; no URL or storage.
// Survives data updates and date navigation. Resets to 'timeline' on page reload.
let currentDashboardView = 'timeline';
let listDirty = true; // true = list view must re-render before next display

// VSM-9: search query (client-side filter, never touches Firebase data)
let searchQuery = '';
// VSM-9: which workspace is visible — 'dashboard' | 'pending' | 'administration'
let currentWorkspace = 'dashboard';
// VSM-9 cleanup: which rail module is active — 'driverops' | 'administration'
let activeRailModule = 'driverops';

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
  // Timeline shows search-filtered view; modal/conflict-check always see ALL
  setTimelineAssignments(getFilteredAssignments());
  setModalAssignments(assignments);
  setAssignmentsForm(assignments);

  // Driver Dashboard shows only assignments for the logged-in driver
  setDashboardAssignments(filterAssignmentsForUser(assignments));

  setRequestsModule(requests);
  setCommentRequests(requests);
  renderDriverDashboard();
  renderKPIStrip();
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
 * @param {boolean} resetNavActive - When true, resets panel + bottom nav to Dashboard.
 *   Pass true only on auth changes (login/logout/startup).
 *   Firebase real-time data listeners must pass false (default) so an incoming
 *   change from another device does not disturb the user's current nav position.
 */
function updatePermissionUI(resetNavActive = false) {
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

  // ── VSM-1 + VSM-5C Part 5: avatar initials — rail and topbar ──
  // Both elements only exist when flag is on; guard with getElementById.
  const displayName = currentUser?.name || currentUser?.displayName || currentUser?.username || '';
  const initials = displayName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(w => (w[0] ?? '').toUpperCase())
    .join('') || '?';

  const railInitials = document.getElementById('v2RailAvatarInitials');
  if (railInitials) railInitials.textContent = initials;

  const topbarAvatar = document.getElementById('v2TopbarAvatar');
  if (topbarAvatar) topbarAvatar.textContent = initials;

  // VSM-7 Part 7: full role name in topbar profile card
  const topbarRole = document.getElementById('v2TopbarRoleLabel');
  if (topbarRole) {
    const roleNames = { admin: 'Administrator', bidang: 'Bidang', driver: 'Driver', viewer: 'Viewer' };
    topbarRole.textContent = roleNames[currentUser?.role] || '';
  }

  // ── VSM-2: V2 context panel role-gating ──
  // Only runs when the panel element exists (visualShellV2 flag is on).
  const v2Panel = document.getElementById('v2Panel');
  if (v2Panel) {
    const canAdd = isAdmin() || isBidang();

    // CTA area: visible only for roles that can create/request assignments
    const v2PanelCta = document.getElementById('v2PanelCta');
    if (v2PanelCta) v2PanelCta.style.display = canAdd ? 'flex' : 'none';

    // Primary CTA: admin only — Tambah Jadwal
    const v2BtnTambahJadwal = document.getElementById('v2BtnTambahJadwal');
    if (v2BtnTambahJadwal) {
      v2BtnTambahJadwal.style.display = isAdmin() ? 'flex' : 'none';
    }

    // Ajukan Request: bidang only — single CTA, no duplicate
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

    // Pending badge: admin (global count) + bidang (own pending count)
    const v2PanelBadge = document.getElementById('v2PanelBadge');
    if (v2PanelBadge) {
      const myCount = getMyPendingRequestCount();
      const showBadge = (isAdmin() || isBidang()) && myCount > 0;
      v2PanelBadge.textContent = String(myCount);
      v2PanelBadge.style.display = showBadge ? 'inline-flex' : 'none';
    }

    // Administration rail module: admin only
    const v2RailAdmin = document.getElementById('v2RailAdmin');
    if (v2RailAdmin) v2RailAdmin.style.display = isAdmin() ? 'flex' : 'none';

    // Footer user info (Part H)
    const v2FooterAvatarInitials = document.getElementById('v2FooterAvatarInitials');
    if (v2FooterAvatarInitials) v2FooterAvatarInitials.textContent = initials;
    const v2FooterDisplayName = document.getElementById('v2FooterDisplayName');
    if (v2FooterDisplayName) v2FooterDisplayName.textContent = displayName;
    const v2FooterRoleLabel = document.getElementById('v2FooterRoleLabel');
    if (v2FooterRoleLabel) {
      const roleNames = { admin: 'Administrator', bidang: 'Bidang', driver: 'Driver', viewer: 'Viewer' };
      v2FooterRoleLabel.textContent = roleNames[currentUser?.role] || '';
    }

    // Reset active state to Dashboard only on auth changes (login/logout/startup).
    // Skipped for Firebase data-refresh calls so another device's update does not
    // disturb the current user's navigation position.
    if (resetNavActive) {
      setV2PanelNavActive('v2NavDashboard');
      if (document.getElementById('v2PendingWorkspace')) setWorkspace('dashboard');
      // Reset rail to Driver Operations module
      if (activeRailModule !== 'driverops') setRailModule('driverops');
    }
  }

  // Reset bottom nav only on auth changes — same reasoning as panel nav above.
  if (resetNavActive) setBottomNavActive('bottomNavDashboard');
  renderKPIStrip();
}

/**
 * Load feature flags once at startup.
 *
 * Priority (highest → lowest):
 *   1. localStorage override  — developer device only, never production.
 *      Set:   localStorage.setItem('pbsi_flag_visualShellV2', 'true')
 *      Clear: localStorage.removeItem('pbsi_flag_visualShellV2')
 *   2. Firebase RTDB /feature_flags — authoritative production source.
 *      Set visualShellV2 = false to force V1 rollback for all users.
 *   3. Production defaults — applied when Firebase key is absent or
 *      on timeout/error. visualShellV2 defaults to TRUE so V2 is the
 *      standard experience without requiring a Firebase write.
 *
 * Rollback path: set /feature_flags/visualShellV2 = false in Firebase.
 * 3-second timeout prevents Firebase latency from blocking app startup.
 */
async function loadFeatureFlags() {
  const LS_PREFIX = 'pbsi_flag_';
  const flagNames = ['visualShellV2'];

  // ── Priority 1: localStorage overrides (developer testing only) ──
  // These are never set for production users; cleared by removing the key.
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
    console.log('[flags] localStorage override active:', overrides);
    console.log(`[VSM] visualShellV2 = ${overrides.visualShellV2 ?? true}`);
    return overrides;
  }

  // ── Priority 2: Firebase RTDB /feature_flags (3-second timeout) ──
  let rawFlags = {};
  try {
    const flagsData = await Promise.race([
      fetchFirebaseData('feature_flags'),
      new Promise(resolve => setTimeout(() => resolve(null), 3000)),
    ]);
    rawFlags = (flagsData && typeof flagsData === 'object') ? flagsData : {};
    if (Object.keys(rawFlags).length > 0) {
      console.log('[flags] loaded from Firebase:', rawFlags);
    }
  } catch (err) {
    console.warn('[flags] Firebase read failed, applying production defaults:', err);
  }

  // ── Priority 3: Production defaults ──
  // Spread order: defaults first, Firebase values second so an explicit
  // Firebase false overrides the default true (emergency rollback path).
  //
  //   Firebase missing → visualShellV2 = true  (V2 is the standard UI)
  //   Firebase = true  → visualShellV2 = true  (explicit enable)
  //   Firebase = false → visualShellV2 = false (emergency rollback to V1)
  const DEFAULTS = {
    visualShellV2: true,  // V2 shell is the production-default experience
  };
  const flags = { ...DEFAULTS, ...rawFlags };

  // Startup verification log — visible in DevTools Console
  console.log(`[VSM] visualShellV2 = ${flags.visualShellV2}`);
  if (flags.visualShellV2) {
    console.log('[VSM] loading Visual Shell V2');
  } else {
    console.log('[VSM] Visual Shell V2 disabled — V1 active (Firebase override)');
  }

  return flags;
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
/**
 * Switch the active rail module and swap the panel nav section accordingly.
 * @param {'driverops'|'administration'} name
 */
function setRailModule(name) {
  activeRailModule = name;

  const isAdm = name === 'administration';

  const driverOpsItem = document.getElementById('v2RailDriverOps');
  const adminItem     = document.getElementById('v2RailAdmin');
  const driverOpsNav  = document.getElementById('v2PanelDriverOpsNav');
  const adminNav      = document.getElementById('v2PanelAdminNav');
  const panelTitle    = document.getElementById('v2PanelTitle');
  const panelSubtitle = document.getElementById('v2PanelSubtitle');
  const crumbTitle    = document.getElementById('v2TopbarCrumb')?.querySelector('.v2-topbar-title');

  if (driverOpsItem) {
    driverOpsItem.classList.toggle('v2-rail-item--active', !isAdm);
    driverOpsItem.setAttribute('aria-current', String(!isAdm));
  }
  if (adminItem) {
    adminItem.classList.toggle('v2-rail-item--active', isAdm);
    adminItem.setAttribute('aria-current', String(isAdm));
  }

  if (driverOpsNav) driverOpsNav.style.display = isAdm ? 'none' : '';
  if (adminNav)     adminNav.style.display     = isAdm ? ''     : 'none';
  if (panelTitle)    panelTitle.textContent    = isAdm ? 'Administration'      : 'Driver Operations';
  if (panelSubtitle) panelSubtitle.textContent = isAdm ? 'Manajemen Platform' : 'Operasional Kendaraan';
  if (crumbTitle)    crumbTitle.textContent    = isAdm ? 'Administration'      : 'Driver Operations';

  if (isAdm) {
    setV2PanelNavActive('v2NavAdminUsers');
    setWorkspace('administration');
  } else {
    setV2PanelNavActive('v2NavDashboard');
    setWorkspace('dashboard');
    renderViews();
    if (isDriver()) renderDriverDashboard();
  }
}

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

      <!-- Administration — admin only; shown by updatePermissionUI() -->
      <div class="v2-rail-item" id="v2RailAdmin"
           role="button" tabindex="0"
           aria-label="Administration" aria-current="false" style="display:none;">
        <svg class="v2-rail-icon" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fill-rule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clip-rule="evenodd"/>
        </svg>
        <div class="v2-rail-tooltip" aria-hidden="true">Administration</div>
      </div>
    </nav>

    <!-- Rail footer: theme toggle (identity stays in panel footer) -->
    <div class="v2-rail-footer">
      <button class="v2-rail-footer-btn" id="v2RailThemeBtn"
              type="button" aria-label="Ganti ke tema gelap">
        <svg viewBox="0 0 20 20" fill="currentColor" width="15" height="15" aria-hidden="true">
          <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z"/>
        </svg>
      </button>
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

  // ── Event handlers ──

  const crest     = document.getElementById('v2RailCrest');
  const driverOps = document.getElementById('v2RailDriverOps');
  const railAdmin = document.getElementById('v2RailAdmin');
  const railTheme = document.getElementById('v2RailThemeBtn');

  crest?.addEventListener('click', () => {
    document.querySelector('.main-content')?.scrollTo({ top: 0, behavior: 'smooth' });
  });

  driverOps?.addEventListener('click', () => setRailModule('driverops'));
  railAdmin?.addEventListener('click', () => setRailModule('administration'));

  railTheme?.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    applyTheme(current === 'dark' ? 'light' : 'dark', true);
  });

  // Keyboard: Enter/Space activates any focusable rail element
  [crest, driverOps, railAdmin].forEach(el => {
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
    <!-- Module title — text updated by setRailModule() -->
    <div class="v2-panel-header">
      <span class="v2-panel-title" id="v2PanelTitle">Driver Operations</span>
      <span class="v2-panel-subtitle" id="v2PanelSubtitle">Operasional Kendaraan</span>
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
        Ajukan Jadwal
      </button>
    </div>

    <!-- Driver Operations navigation — visible when driverops module is active -->
    <nav class="v2-panel-nav v2-panel-nav--driverops" id="v2PanelDriverOpsNav"
         aria-label="Driver Operations menu">

      <!-- Jadwal Driver: all authenticated roles -->
      <button class="v2-panel-nav-item v2-panel-nav-item--active" id="v2NavDashboard" type="button">
        <svg class="v2-panel-nav-icon" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z"/>
        </svg>
        Jadwal Driver
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

    <!-- Administration navigation — visible when administration module is active (admin only) -->
    <nav class="v2-panel-nav v2-panel-nav--admin" id="v2PanelAdminNav"
         aria-label="Administration menu" style="display:none;">

      <!-- Manajemen User: proxies to V1 user management modal -->
      <button class="v2-panel-nav-item v2-panel-nav-item--active" id="v2NavAdminUsers" type="button">
        <svg class="v2-panel-nav-icon" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z"/>
        </svg>
        Manajemen User
      </button>

      <!-- Peran & Izin: coming soon -->
      <button class="v2-panel-nav-item v2-panel-nav-item--disabled" id="v2NavAdminRoles"
              type="button" disabled>
        <svg class="v2-panel-nav-icon" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fill-rule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
        </svg>
        Peran &amp; Izin
        <span class="v2-panel-nav-badge-soon">Soon</span>
      </button>

      <!-- Konfigurasi: coming soon -->
      <button class="v2-panel-nav-item v2-panel-nav-item--disabled" id="v2NavAdminConfig"
              type="button" disabled>
        <svg class="v2-panel-nav-icon" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fill-rule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clip-rule="evenodd"/>
        </svg>
        Konfigurasi
        <span class="v2-panel-nav-badge-soon">Soon</span>
      </button>

    </nav>

    <div class="v2-panel-spacer"></div>
    <div class="v2-panel-divider"></div>

    <!-- Footer user area — avatar + dropdown user menu (Part H) -->
    <div class="v2-panel-footer-user" id="v2FooterUser">
      <button class="v2-footer-avatar" id="v2FooterAvatar" type="button"
              aria-haspopup="menu" aria-expanded="false">
        <span class="v2-footer-avatar-circle" id="v2FooterAvatarInitials" aria-hidden="true">?</span>
        <div class="v2-footer-user-info">
          <span class="v2-footer-display-name" id="v2FooterDisplayName"></span>
          <span class="v2-footer-role-label" id="v2FooterRoleLabel"></span>
          <span class="v2-footer-version-label app-version-text" aria-hidden="true"></span>
        </div>
        <svg class="v2-footer-chevron" viewBox="0 0 20 20" fill="currentColor"
             width="12" height="12" aria-hidden="true">
          <path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd"/>
        </svg>
      </button>
      <div class="v2-footer-menu" id="v2FooterMenu" role="menu" style="display:none;">
        <button class="v2-footer-menu-item" id="v2FooterMenuProfil" role="menuitem" type="button">
          <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14" aria-hidden="true">
            <path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd"/>
          </svg>
          Profil
        </button>
        <button class="v2-footer-menu-item v2-footer-menu-item--danger" id="v2FooterMenuKeluar"
                role="menuitem" type="button">
          <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14" aria-hidden="true">
            <path fill-rule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 102 0V4a1 1 0 00-1-1zm10.293 9.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L14.586 9H7a1 1 0 100 2h7.586l-1.293 1.293z" clip-rule="evenodd"/>
          </svg>
          Keluar
        </button>
      </div>
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

  // Ajukan Jadwal: bidang only — direct call to request form
  document.getElementById('v2BtnAjukanRequest')?.addEventListener('click', () => {
    openRequestFormModal();
  });

  // Dashboard nav: switch to dashboard workspace
  document.getElementById('v2NavDashboard')?.addEventListener('click', () => {
    setV2PanelNavActive('v2NavDashboard');
    const crumbTitle = document.getElementById('v2TopbarCrumb')?.querySelector('.v2-topbar-title');
    if (crumbTitle) crumbTitle.textContent = 'Driver Operations';
    setCurrentDate(getCurrentDate());
    setWorkspace('dashboard');
    renderViews();
    if (isDriver()) renderDriverDashboard();
  });

  // Pending nav: open inline workspace instead of modal
  document.getElementById('v2NavPending')?.addEventListener('click', () => {
    setV2PanelNavActive('v2NavPending');
    const label = isAdmin() ? 'Driver Operations › Antrian' : 'Driver Operations › Riwayat';
    const crumbTitle = document.getElementById('v2TopbarCrumb')?.querySelector('.v2-topbar-title');
    if (crumbTitle) crumbTitle.textContent = label;
    setWorkspace('pending');
  });

  // Jadwal Saya: switch to dashboard then scroll to driver section
  document.getElementById('v2NavJadwalSaya')?.addEventListener('click', () => {
    setV2PanelNavActive('v2NavJadwalSaya');
    const crumbTitle = document.getElementById('v2TopbarCrumb')?.querySelector('.v2-topbar-title');
    if (crumbTitle) crumbTitle.textContent = 'Driver Operations › Jadwal Saya';
    setWorkspace('dashboard');
    setTimeout(() => document.getElementById('driverDashboard')?.scrollIntoView({ behavior: 'smooth' }), 50);
  });

  // Manajemen User: open V2 administration workspace
  document.getElementById('v2NavAdminUsers')?.addEventListener('click', () => {
    setV2PanelNavActive('v2NavAdminUsers');
    setWorkspace('administration');
  });

  // Footer avatar: toggle user menu
  const footerAvatar = document.getElementById('v2FooterAvatar');
  const footerMenu   = document.getElementById('v2FooterMenu');

  footerAvatar?.addEventListener('click', () => {
    const isOpen = footerMenu?.style.display !== 'none';
    if (footerMenu) footerMenu.style.display = isOpen ? 'none' : 'block';
    footerAvatar.setAttribute('aria-expanded', String(!isOpen));
  });

  document.getElementById('v2FooterMenuProfil')?.addEventListener('click', () => {
    if (footerMenu) footerMenu.style.display = 'none';
    footerAvatar?.setAttribute('aria-expanded', 'false');
    document.getElementById('btnProfile')?.click();
  });

  document.getElementById('v2FooterMenuKeluar')?.addEventListener('click', () => {
    if (footerMenu) footerMenu.style.display = 'none';
    footerAvatar?.setAttribute('aria-expanded', 'false');
    document.getElementById('btnLogout')?.click();
  });

  // Close user menu on outside click
  document.addEventListener('click', e => {
    if (footerMenu && footerMenu.style.display !== 'none') {
      if (!footerAvatar?.contains(e.target) && !footerMenu.contains(e.target)) {
        footerMenu.style.display = 'none';
        footerAvatar?.setAttribute('aria-expanded', 'false');
      }
    }
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

  // ── Locate existing DOM elements to migrate ──
  const header   = document.querySelector('.main-area .header');
  const toggler  = header?.querySelector('#sidebarToggle')
                   ?? document.getElementById('sidebarToggle');
  const dateNav  = header?.querySelector('.date-nav')
                   ?? document.querySelector('.date-nav');
  const userArea = header?.querySelector('.header-user-area')
                   ?? document.querySelector('.header-user-area');

  if (!header) {
    console.warn('[VSM-3] .header not found — topbar skipped');
    return;
  }

  // ── Part 1 (VSM-7): Two-line breadcrumb — module label + section title ──
  const crumb = document.createElement('div');
  crumb.id = 'v2TopbarCrumb';
  crumb.setAttribute('aria-hidden', 'true');
  crumb.innerHTML = `
    <span class="v2-topbar-label">DRIVER OPS</span>
    <span class="v2-topbar-title">Driver Operations</span>
  `;

  // ── Part 2 (VSM-5C / VSM-7 / VSM-9): Interactive search field ──
  const searchField = document.createElement('div');
  searchField.className = 'v2-topbar-search v2-topbar-search--active';
  searchField.setAttribute('role', 'search');
  searchField.innerHTML = `
    <svg viewBox="0 0 20 20" fill="currentColor" width="13" height="13" aria-hidden="true">
      <path fill-rule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clip-rule="evenodd"/>
    </svg>
    <input type="search" id="v2SearchInput" class="v2-topbar-search-input"
           placeholder="Cari driver, tujuan..." autocomplete="off" />
    <button class="v2-topbar-search-clear" id="v2SearchClear"
            type="button" aria-label="Hapus pencarian" style="display:none;">&#x2715;</button>
  `;

  // ── Flex spacer ──
  const spacer = document.createElement('div');
  spacer.className = 'v2-topbar-spacer';
  spacer.setAttribute('aria-hidden', 'true');

  // ── Part 5 (VSM-7 / VSM-9): Theme toggle — wired in initThemeManager() ──
  const themeToggle = document.createElement('button');
  themeToggle.id = 'v2TopbarThemeBtn';
  themeToggle.className = 'v2-topbar-icon-btn v2-topbar-theme-btn';
  themeToggle.setAttribute('type', 'button');
  themeToggle.setAttribute('aria-label', 'Ganti ke tema gelap');
  themeToggle.innerHTML = `
    <svg viewBox="0 0 20 20" fill="currentColor" width="15" height="15" aria-hidden="true">
      <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z"/>
    </svg>
  `;

  // ── Parts 6 + 7 (VSM-7): Restructure userArea as profile card ──
  // Extracts #btnHeaderNotif as standalone topbar icon button.
  // Wraps displayName + new role label in a flex column .v2-topbar-user-info.
  // #roleBadge stays in DOM (V1 compat) but is hidden by CSS.
  let notifBtn = null;
  if (userArea) {
    // Extract notif button — it becomes a sibling icon button in the topbar
    notifBtn = userArea.querySelector('#btnHeaderNotif');
    if (notifBtn) notifBtn.remove();

    const displayName = userArea.querySelector('#headerDisplayName');
    const roleBadge   = userArea.querySelector('#roleBadge');

    // Avatar circle (initials filled by updatePermissionUI())
    const topbarAvatar = document.createElement('span');
    topbarAvatar.id = 'v2TopbarAvatar';
    topbarAvatar.className = 'v2-topbar-avatar';
    topbarAvatar.setAttribute('aria-hidden', 'true');
    topbarAvatar.textContent = '?';

    // User info column: display name + full role text
    const userInfo = document.createElement('div');
    userInfo.className = 'v2-topbar-user-info';
    if (displayName) userInfo.appendChild(displayName); // moves existing V1 element
    const roleLabel = document.createElement('span');
    roleLabel.id = 'v2TopbarRoleLabel';
    roleLabel.className = 'v2-topbar-user-role';
    userInfo.appendChild(roleLabel);

    // Rebuild userArea — clear, then avatar | userInfo | roleBadge(hidden)
    while (userArea.firstChild) userArea.removeChild(userArea.firstChild);
    userArea.appendChild(topbarAvatar);
    userArea.appendChild(userInfo);
    if (roleBadge) userArea.appendChild(roleBadge); // hidden by CSS in V2 mode
  }

  // ── Assemble topbar ──
  // Desktop: [hamburger] [crumb] [search] [date-nav] [spacer] [theme] [notif] [user-card]
  // Mobile row-1: [hamburger] [spacer] [user-card]
  // Mobile row-2: [date-nav full-width]
  if (toggler)   topbar.appendChild(toggler);
  topbar.appendChild(crumb);
  topbar.appendChild(searchField);
  if (dateNav)   topbar.appendChild(dateNav);
  topbar.appendChild(spacer);
  topbar.appendChild(themeToggle);
  if (notifBtn)  topbar.appendChild(notifBtn);
  if (userArea)  topbar.appendChild(userArea);

  const mainArea = document.querySelector('.main-area');
  if (mainArea) {
    mainArea.insertBefore(topbar, header);
  }

  console.log('[VSM-3] V2 topbar initialised — DOM nodes migrated from .header');
}

/**
 * VSM-4: Inject the #v2KpiStrip placeholder as the first child of .main-content,
 * above .timeline-date-label. Called only when flags.visualShellV2 === true.
 *
 * The strip is initially hidden (display:none inline). renderKPIStrip() controls
 * visibility and populates values on every data/auth change.
 *
 * Placement: .main-content > #v2KpiStrip > .timeline-date-label > .timeline-wrapper
 */
function initV2KpiStrip() {
  // Gap 3: section label above KPI strip — visibility synced in renderKPIStrip()
  const dashHeader = document.createElement('div');
  dashHeader.id = 'v2DashHeader';
  dashHeader.className = 'v2-dash-header p-shead';
  dashHeader.style.display = 'none';
  dashHeader.innerHTML = '<h2>Operasional</h2><div class="p-line"></div>';

  const strip = document.createElement('div');
  strip.id = 'v2KpiStrip';
  strip.className = 'v2-kpi-strip';
  strip.style.display = 'none'; // renderKPIStrip() reveals it after auth resolves
  strip.setAttribute('aria-label', 'Ringkasan operasional hari ini');

  // Gap 1 + VSM-5C Part 3: icon + hierarchy + subtitle per card
  strip.innerHTML = `
    <div class="v2-kpi-card" data-kpi="aktif">
      <div class="v2-kpi-icon" aria-hidden="true">
        <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
          <path d="M8 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM15 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z"/>
          <path d="M3 4a1 1 0 00-1 1v10a1 1 0 001 1h1.05a2.5 2.5 0 014.9 0H11a1 1 0 001-1V5a1 1 0 00-1-1H3zM14 7a1 1 0 00-1 1v6.05A2.5 2.5 0 0115.95 16H17a1 1 0 001-1v-5a1 1 0 00-.293-.707l-2-2A1 1 0 0015 7h-1z"/>
        </svg>
      </div>
      <span class="v2-kpi-label">Trip Aktif</span>
      <span class="v2-kpi-value" id="v2KpiTripAktif" aria-live="polite">—</span>
      <span class="v2-kpi-sub">Sedang berlangsung</span>
    </div>
    <div class="v2-kpi-card" data-kpi="bertugas">
      <div class="v2-kpi-icon" aria-hidden="true">
        <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
          <path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd"/>
        </svg>
      </div>
      <span class="v2-kpi-label">Driver Bertugas</span>
      <span class="v2-kpi-value" id="v2KpiDriverBertugas" aria-live="polite">—</span>
      <span class="v2-kpi-sub">Sedang ditugaskan</span>
    </div>
    <div class="v2-kpi-card" data-kpi="menunggu">
      <div class="v2-kpi-icon" aria-hidden="true">
        <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clip-rule="evenodd"/>
        </svg>
      </div>
      <span class="v2-kpi-label">Menunggu Approval</span>
      <span class="v2-kpi-value" id="v2KpiMenunggu" aria-live="polite">—</span>
      <span class="v2-kpi-sub">Perlu ditinjau</span>
    </div>
    <div class="v2-kpi-card" data-kpi="selesai">
      <div class="v2-kpi-icon" aria-hidden="true">
        <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
        </svg>
      </div>
      <span class="v2-kpi-label">Selesai Hari Ini</span>
      <span class="v2-kpi-value" id="v2KpiSelesai" aria-live="polite">—</span>
      <span class="v2-kpi-sub">Penugasan tuntas</span>
    </div>
  `;

  const mainContent = document.querySelector('.main-content');
  if (mainContent) {
    mainContent.insertBefore(dashHeader, mainContent.firstChild);
    mainContent.insertBefore(strip, dashHeader.nextSibling);
  }

  console.log('[VSM-4] KPI strip injected');
}

// VSM-4: Operational KPIs only.
// Historical, trend, utilization, forecasting, analytics and AI metrics
// belong to v1.5+ Analytics and v1.6+ AI Assistant modules.
//
// All values derived from in-memory arrays (assignments, requests) already
// loaded by Firebase sync. No new Firebase reads. No new Firebase writes.
// No new collections. No charts. No aggregation beyond today's counts.
//
// KPIs use system date (new Date()) — NOT getCurrentDate() (timeline view date).
// The strip reflects "right now", independent of which date is being viewed.
function renderKPIStrip() {
  const strip = document.getElementById('v2KpiStrip');
  if (!strip) return; // flag off — strip not in DOM

  const currentUser = getCurrentUser();

  // Driver role: personal dashboard is the KPI surface. Strip absent.
  // Unauthenticated: no data to show.
  const dashHeader = document.getElementById('v2DashHeader');
  if (!currentUser || isDriver()) {
    strip.style.display = 'none';
    if (dashHeader) dashHeader.style.display = 'none';
    return;
  }

  strip.style.display = 'grid';
  if (dashHeader) dashHeader.style.display = 'flex';

  // System date — always reflects today, not the timeline's viewed date.
  const sysDate = new Date().toISOString().split('T')[0];

  // ── KPI 1: Trip Aktif ──────────────────────────────────────────────────
  // Assignments currently in progress (status === 'started'), any date.
  const tripAktif = assignments.filter(a => a.status === 'started').length;

  // ── KPI 2: Driver Bertugas ─────────────────────────────────────────────
  // Unique driver names with a started assignment (any date).
  // Uses only live assignment data — no dependency on DEFAULT_DRIVERS list.
  const driverBertugas = new Set(
    assignments.filter(a => a.status === 'started').map(a => a.driver)
  ).size;

  // ── KPI 3: Menunggu ────────────────────────────────────────────────────
  // Admin / Viewer: global pending queue.
  // Bidang: own pending requests only.
  // Legacy requests may lack requesterId — fall back to requesterName match.
  let menunggu;
  if (isBidang()) {
    menunggu = requests.filter(
      r => r.status === 'pending' &&
           (r.requesterId === currentUser.id || r.requesterName === currentUser.name)
    ).length;
  } else {
    menunggu = requests.filter(r => r.status === 'pending').length;
  }

  // ── KPI 4: Selesai Hari Ini ────────────────────────────────────────────
  // Assignments completed on today's system date.
  const selesai = assignments.filter(
    a => a.status === 'completed' && a.date === sysDate
  ).length;

  // ── Update DOM values ──────────────────────────────────────────────────
  const el = id => document.getElementById(id);
  const kv1 = el('v2KpiTripAktif');
  const kv2 = el('v2KpiDriverBertugas');
  const kv3 = el('v2KpiMenunggu');
  const kv4 = el('v2KpiSelesai');

  if (kv1) kv1.textContent = String(tripAktif);
  if (kv2) kv2.textContent = String(driverBertugas);
  if (kv3) kv3.textContent = String(menunggu);
  if (kv4) kv4.textContent = String(selesai);
}

/* ============================================================
   VSM-8 — Timeline / List View
   ============================================================ */

/**
 * HTML-escape helper for safe innerHTML injection.
 * Identical implementation to driver-dashboard.js esc() — defined
 * locally to keep renderListView() free of cross-module dependencies.
 * @param {*} value
 * @returns {string}
 */
function esc(value) {
  const d = document.createElement('div');
  d.textContent = String(value ?? '');
  return d.innerHTML;
}

/** Returns the HTML string for the list-view empty state. */
function buildListEmpty() {
  return `
    <div class="v2-list-empty">
      <div class="v2-list-empty-icon" aria-hidden="true">
        <svg viewBox="0 0 20 20" fill="currentColor" width="22" height="22">
          <path fill-rule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clip-rule="evenodd"/>
        </svg>
      </div>
      <p>Tidak ada jadwal pada tanggal ini</p>
    </div>
  `;
}

/**
 * Returns the HTML string for a single assignment list card.
 * All user-controlled fields are escaped through esc().
 * @param {Object} a - Assignment object from in-memory assignments[]
 */
function buildListCard(a) {
  const status      = a.status || 'assigned';
  const statusMap   = { assigned: 'Dijadwalkan', started: 'Berlangsung', completed: 'Selesai', pending: 'Menunggu', approved: 'Disetujui' };
  const statusLabel = statusMap[status] || status;
  const timeStr     = a.fullDay ? 'Penuh Hari' : `${esc(a.startTime)}–${esc(a.endTime)}`;
  const title       = esc(a.purpose || a.destination || '—');
  const driver      = esc(a.driver  || '—');
  const vehicle     = esc(a.vehicle || '—');
  const dest        = esc(a.destination || '—');

  return `
    <div class="v2-list-card v2-list-card--${esc(status)}"
         data-list-id="${esc(a.id)}"
         role="button" tabindex="0"
         aria-label="${title}">
      <div class="v2-list-card-time">${timeStr}</div>
      <div class="v2-list-card-body">
        <div class="v2-list-card-title">${title}</div>
        <div class="v2-list-card-meta">
          <span>${driver}</span>
          <span class="v2-list-vehicle-chip" data-vehicle="${vehicle}">${vehicle}</span>
          <span>${dest}</span>
        </div>
      </div>
      <div class="v2-list-card-status">
        <span class="v2-list-status-pill v2-list-status-pill--${esc(status)}">${esc(statusLabel)}</span>
      </div>
    </div>
  `;
}

/**
 * Render #v2ListView from the already-loaded in-memory assignments array.
 *
 * Data contract:
 *   assignments[]    — module-scope; already role-filtered by updateAllModules()
 *   getCurrentDate() — imported from timeline.js; the currently viewed date
 *
 * No Firebase reads. No business logic. Pure presentation.
 *
 * Event listeners are wired via delegation on the container in
 * initV2TimelineContainer() and survive every innerHTML replacement here.
 */
function renderListView() {
  const container = document.getElementById('v2ListView');
  if (!container) return; // flag off — container not in DOM

  const date = getCurrentDate();
  const dayAssignments = getFilteredAssignments()
    .filter(a => a.date === date)
    .sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));

  container.innerHTML = dayAssignments.length
    ? dayAssignments.map(buildListCard).join('')
    : buildListEmpty();
}

/**
 * Activate a dashboard view and manage the lazy-render dirty flag.
 *
 * Lazy refresh strategy:
 *   'list'     → render only when listDirty; show list, hide timeline
 *   'timeline' → no render triggered; show timeline, hide list
 *
 * View switching never calls renderTimeline() — the timeline engine
 * is unaffected by view changes.
 *
 * @param {'timeline'|'list'} view
 */
function setDashboardView(view) {
  currentDashboardView = view;

  const tlView  = document.getElementById('v2TimelineView');
  const lstView = document.getElementById('v2ListView');

  if (view === 'list') {
    if (listDirty) { renderListView(); listDirty = false; }
    tlView ?.classList.remove('v2-view-active');
    lstView?.classList.add('v2-view-active');
  } else {
    lstView?.classList.remove('v2-view-active');
    tlView ?.classList.add('v2-view-active');
  }

  // Sync toggle button active state + ARIA
  document.querySelectorAll('.v2-tl-view-btn[data-view]').forEach(btn => {
    const active = btn.dataset.view === view;
    btn.classList.toggle('v2-tl-view-btn--active', active);
    btn.setAttribute('aria-current', active ? 'true' : 'false');
  });
}

/**
 * Lazy-aware render dispatcher — replaces all direct renderTimeline() calls.
 *
 * Timeline always renders (preserves existing engine behaviour).
 * List only renders when it is the active view; otherwise it is marked dirty
 * so the next setDashboardView('list') call renders it before display.
 *
 * This is the single change to the data-update pipeline: every previous
 * renderTimeline() call site now calls renderViews() instead.
 */
function renderViews() {
  renderTimeline(); // always — unchanged behaviour, engine state fully preserved

  if (currentDashboardView === 'list') {
    renderListView();
    listDirty = false;
  } else {
    listDirty = true; // data changed while list is hidden — mark stale
  }
}

/**
 * VSM-5: Wrap .timeline-date-label, .timeline-wrapper, and .legend
 * inside a single elevated #v2TimelineSurface card.
 * Called only when flags.visualShellV2 === true, after initV2KpiStrip().
 *
 * DOM strategy: moves existing nodes — does NOT duplicate or recreate.
 * All element IDs and classes are preserved unchanged.
 *
 * timeline.js safety: every query in timeline.js uses document.getElementById
 * or document.querySelector from the document root, so reparenting elements
 * has zero effect on timeline rendering, autoFocusTimeline(), syncTimelineScroll(),
 * or the pointer-down drag guard.
 *
 * Event listeners on moved elements are preserved — addEventListener binds
 * to the element object, not to its DOM position.
 *
 * Before:
 *   .main-content > #v2KpiStrip
 *   .main-content > .timeline-date-label  (#timelineDateLabel)
 *   .main-content > .timeline-wrapper
 *   .main-content > .legend
 *   .main-content > #driverDashboard
 *
 * After:
 *   .main-content > #v2KpiStrip
 *   .main-content > #v2TimelineSurface
 *                     > .timeline-date-label  (#timelineDateLabel)
 *                     > .timeline-wrapper
 *                     > .legend
 *   .main-content > #driverDashboard  (stays outside surface)
 */
function initV2TimelineContainer() {
  const mainContent = document.querySelector('.main-content');
  if (!mainContent) return;

  const dateLabel = document.getElementById('timelineDateLabel');
  const tlWrapper = mainContent.querySelector('.timeline-wrapper');
  const legend    = mainContent.querySelector('.legend');

  if (!dateLabel || !tlWrapper) {
    console.warn('[VSM-5] initV2TimelineContainer: required elements not found — aborting');
    return;
  }

  const surface = document.createElement('div');
  surface.id = 'v2TimelineSurface';

  // Insert surface at the current position of .timeline-date-label
  mainContent.insertBefore(surface, dateLabel);

  // VSM-5B Gap 2 + VSM-5C Part 6: .v2-tl-header card header.
  // Left: title "Papan Jadwal" + subtitle. Right: view toggle + date badge.
  // #timelineDateLabel is MOVED (not cloned) — ID and timeline.js updates preserved.
  const tlHeader = document.createElement('div');
  tlHeader.className = 'v2-tl-header';

  // Left group: title stack
  const tlLeft = document.createElement('div');
  tlLeft.className = 'v2-tl-header-left';

  const tlTitle = document.createElement('span');
  tlTitle.className = 'v2-tl-title';
  tlTitle.textContent = 'Papan Jadwal';

  const tlSub = document.createElement('span');
  tlSub.className = 'v2-tl-sub';
  tlSub.textContent = '16 jam • 06:00–21:00';
  tlSub.setAttribute('aria-hidden', 'true');

  tlLeft.appendChild(tlTitle);
  tlLeft.appendChild(tlSub);

  // Right group: view toggle + date badge
  const tlRight = document.createElement('div');
  tlRight.className = 'v2-tl-header-right';

  // ── VSM-8: View toggle — fully functional (replaces visual-only from VSM-5C) ──
  // Buttons are created programmatically so data-view attributes and handlers
  // can be attached before they enter the DOM.
  const viewToggle = document.createElement('div');
  viewToggle.className = 'v2-tl-view-toggle';
  viewToggle.setAttribute('role', 'group');
  viewToggle.setAttribute('aria-label', 'Pilih tampilan');

  const tlViewBtn = document.createElement('button');
  tlViewBtn.className = 'v2-tl-view-btn v2-tl-view-btn--active';
  tlViewBtn.type = 'button';
  tlViewBtn.dataset.view = 'timeline';
  tlViewBtn.setAttribute('aria-current', 'true');
  tlViewBtn.textContent = 'Timeline';
  tlViewBtn.addEventListener('click', () => setDashboardView('timeline'));

  const listViewBtn = document.createElement('button');
  listViewBtn.className = 'v2-tl-view-btn';
  listViewBtn.type = 'button';
  listViewBtn.dataset.view = 'list';
  listViewBtn.setAttribute('aria-current', 'false');
  listViewBtn.textContent = 'Daftar';
  listViewBtn.addEventListener('click', () => setDashboardView('list'));

  viewToggle.appendChild(tlViewBtn);
  viewToggle.appendChild(listViewBtn);

  tlRight.appendChild(viewToggle);
  tlRight.appendChild(dateLabel); // moves existing node — event listeners preserved

  tlHeader.appendChild(tlLeft);
  tlHeader.appendChild(tlRight);

  // ── VSM-8: #v2TimelineView — wraps .timeline-wrapper + .legend ──
  // CSS .v2-view-container / .v2-view-active controls display:flex/none.
  // Both containers stay mounted; only CSS class changes on toggle.
  const timelineView = document.createElement('div');
  timelineView.id = 'v2TimelineView';
  timelineView.className = 'v2-view-container v2-view-active';

  timelineView.appendChild(tlWrapper);
  if (legend) timelineView.appendChild(legend);

  // ── VSM-8: #v2ListView — initially hidden; filled by renderListView() ──
  // Event listeners wired HERE via delegation so they survive every
  // renderListView() innerHTML replacement.
  // Opens the SAME openDetailModal() used by timeline blocks — no new modal path.
  const listView = document.createElement('div');
  listView.id = 'v2ListView';
  listView.className = 'v2-view-container';
  listView.setAttribute('aria-live', 'polite');

  listView.addEventListener('click', (e) => {
    const card = e.target.closest('[data-list-id]');
    if (card) openDetailModal(card.dataset.listId);
  });
  listView.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const card = e.target.closest('[data-list-id]');
    if (card) { e.preventDefault(); openDetailModal(card.dataset.listId); }
  });

  surface.appendChild(tlHeader);
  surface.appendChild(timelineView);
  surface.appendChild(listView);

  // Safety assertion — timeline.js must still be able to reach #timelineDateLabel
  console.assert(
    document.getElementById('timelineDateLabel') !== null,
    '[VSM-5B] #timelineDateLabel unreachable after header restructure'
  );

  // #driverDashboard is intentionally left outside the surface

  console.log('[VSM-5] Timeline surface container initialised');
}

/**
 * VSM-5C Part 7: Add data-initials attribute to .driver-label elements so
 * CSS ::before can render an avatar circle without touching timeline.js.
 *
 * Uses MutationObserver on #timelineBody — fires automatically after every
 * renderDriverRows() call. timeline.js is NOT modified.
 *
 * Only called when flags.visualShellV2 === true.
 */
function initV2DriverAvatars() {
  const body = document.getElementById('timelineBody');
  if (!body) return;

  function stamp() {
    body.querySelectorAll('.driver-label:not([data-initials])').forEach(label => {
      const name = label.querySelector('.driver-name')?.textContent?.trim() || '';
      const initials = name
        .split(/\s+/)
        .slice(0, 2)
        .map(w => (w[0] ?? '').toUpperCase())
        .join('') || '?';
      label.setAttribute('data-initials', initials);
    });
  }

  stamp(); // initial pass for any rows already in DOM
  const observer = new MutationObserver(stamp);
  observer.observe(body, { childList: true, subtree: false });
  console.log('[VSM-5C] Driver avatar observer initialised');
}

/* ============================================================
   VSM-9 — Workspace, Search, Dark Mode, Admin
   ============================================================ */

/**
 * Returns assignments filtered by the current search query.
 * Source-of-truth assignments[] is never mutated.
 */
function getFilteredAssignments() {
  if (!searchQuery) return assignments;
  const q = searchQuery.toLowerCase();
  return assignments.filter(a =>
    (a.driver      || '').toLowerCase().includes(q) ||
    (a.destination || '').toLowerCase().includes(q) ||
    (a.purpose     || '').toLowerCase().includes(q) ||
    (a.vehicle     || '').toLowerCase().includes(q) ||
    (a.pic         || '').toLowerCase().includes(q)
  );
}

/**
 * Pending count scoped to the current user's role.
 * Admin → global pending count. Bidang → own pending requests only.
 */
function getMyPendingRequestCount() {
  const user = getCurrentUser();
  if (!user) return 0;
  if (isAdmin()) return getPendingRequestCount();
  return requests.filter(r =>
    r.status === 'pending' &&
    (r.requesterId === user.id || r.requesterName === user.name)
  ).length;
}

/**
 * Show one workspace and hide the rest.
 * @param {'dashboard'|'pending'|'administration'} name
 */
function setWorkspace(name) {
  currentWorkspace = name;
  const isDash  = name === 'dashboard';
  const isPend  = name === 'pending';
  const isAdmWs = name === 'administration';

  const timelineSurface = document.getElementById('v2TimelineSurface');
  const driverDash      = document.getElementById('driverDashboard');
  const pendingWs       = document.getElementById('v2PendingWorkspace');
  const adminWs         = document.getElementById('v2AdministrationWorkspace');

  if (timelineSurface) timelineSurface.style.display = isDash ? ''      : 'none';
  if (driverDash)      driverDash.style.display      = isDash && isDriver() ? 'block' : 'none';
  if (pendingWs)       pendingWs.style.display       = isPend  ? 'block' : 'none';
  if (adminWs)         adminWs.style.display         = isAdmWs ? 'block' : 'none';

  if (isDash) {
    renderKPIStrip();
  } else {
    const kpiStrip   = document.getElementById('v2KpiStrip');
    const dashHeader = document.getElementById('v2DashHeader');
    if (kpiStrip)   kpiStrip.style.display   = 'none';
    if (dashHeader) dashHeader.style.display = 'none';
  }

  if (isPend)  renderPendingWorkspace();
  if (isAdmWs) renderV2AdminWorkspace();
}

/**
 * Render pending request cards into #v2PendingWorkspace.
 * Called on workspace switch and after approve/reject.
 */
function renderPendingWorkspace() {
  const container = document.getElementById('v2PendingWorkspace');
  if (!container) return;

  const q = searchQuery.toLowerCase();
  const pool = searchQuery
    ? requests.filter(r =>
        (r.driver        || '').toLowerCase().includes(q) ||
        (r.requesterName || '').toLowerCase().includes(q) ||
        (r.vehicle       || '').toLowerCase().includes(q) ||
        (r.destination   || '').toLowerCase().includes(q) ||
        (r.purpose       || '').toLowerCase().includes(q))
    : requests;

  const pending = pool.filter(r => r.status === 'pending');
  const canAct  = isAdmin();

  function buildCard(r) {
    const ms  = r.createdAt ? Date.now() - new Date(r.createdAt).getTime() : null;
    const age = ms !== null
      ? ms < 3_600_000   ? `${Math.max(1, Math.floor(ms / 60_000))}m lalu`
      : ms < 86_400_000  ? `${Math.floor(ms / 3_600_000)}j lalu`
      : `${Math.floor(ms / 86_400_000)}h lalu`
      : '';

    const timeStr = r.fullDay
      ? 'Penuh Hari'
      : `${esc(r.startTime || '—')}–${esc(r.endTime || '—')}`;

    const actions = canAct ? `
      <div class="v2-pending-card-actions">
        <button class="v2-pending-btn v2-pending-btn--approve"
                data-action="approve" data-id="${esc(r.id)}" type="button">Setujui</button>
        <button class="v2-pending-btn v2-pending-btn--reject"
                data-action="reject" data-id="${esc(r.id)}" type="button">Tolak</button>
      </div>` : '';

    return `
      <div class="v2-pending-card" data-request-id="${esc(r.id)}">
        <div class="v2-pending-card-header">
          <span class="v2-pending-status-pill">Menunggu</span>
          ${age ? `<span class="v2-pending-age">${esc(age)}</span>` : ''}
        </div>
        <div class="v2-pending-card-body">
          <div class="v2-pending-field">
            <span class="v2-pending-label">Bidang</span>
            <span class="v2-pending-value">${esc(r.requesterName || '—')}</span>
          </div>
          <div class="v2-pending-field">
            <span class="v2-pending-label">Driver</span>
            <span class="v2-pending-value">${esc(r.driver || '—')}</span>
          </div>
          <div class="v2-pending-field">
            <span class="v2-pending-label">Kendaraan</span>
            <span class="v2-pending-value">${esc(r.vehicle || '—')}</span>
          </div>
          <div class="v2-pending-field">
            <span class="v2-pending-label">Tanggal</span>
            <span class="v2-pending-value">${esc(r.startDate || '—')}</span>
          </div>
          <div class="v2-pending-field">
            <span class="v2-pending-label">Waktu</span>
            <span class="v2-pending-value">${timeStr}</span>
          </div>
          ${r.purpose ? `<div class="v2-pending-field v2-pending-field--full"><span class="v2-pending-label">Keperluan</span><span class="v2-pending-value">${esc(r.purpose)}</span></div>` : ''}
          ${r.notes   ? `<div class="v2-pending-field v2-pending-field--full"><span class="v2-pending-label">Catatan</span><span class="v2-pending-value">${esc(r.notes)}</span></div>` : ''}
        </div>
        ${actions}
      </div>`;
  }

  container.innerHTML = `
    <div class="v2-workspace-header">
      <h2 class="v2-workspace-title">Request Menunggu Approval</h2>
      <p class="v2-workspace-subtitle">${pending.length ? `${pending.length} request menunggu` : 'Tidak ada request pending'}</p>
    </div>
    ${pending.length
      ? `<div class="v2-pending-list">${pending.map(buildCard).join('')}</div>`
      : '<div class="v2-pending-empty"><p>Semua request sudah diproses.</p></div>'}
  `;

  container.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.action === 'approve') handleRequestApprove(btn.dataset.id);
      else if (btn.dataset.action === 'reject') handleRequestReject(btn.dataset.id);
    });
  });
}

/**
 * Inject #v2PendingWorkspace into .main-content. Hidden by default.
 */
function initV2PendingWorkspace() {
  const ws = document.createElement('div');
  ws.id = 'v2PendingWorkspace';
  ws.className = 'v2-workspace';
  ws.style.display = 'none';
  document.querySelector('.main-content')?.appendChild(ws);
  console.log('[VSM-9] Pending workspace injected');
}

/**
 * Inject #v2AdministrationWorkspace into .main-content. Admin-only visibility.
 */
function initV2AdministrationWorkspace() {
  const ws = document.createElement('div');
  ws.id = 'v2AdministrationWorkspace';
  ws.className = 'v2-workspace';
  ws.style.display = 'none';
  ws.innerHTML = `
    <div class="v2-workspace-header">
      <h2 class="v2-workspace-title">Manajemen User</h2>
      <p class="v2-workspace-subtitle">Tambah, edit, atau nonaktifkan akun pengguna.</p>
    </div>
    <div class="v2-admin-toolbar">
      <input type="search" id="v2AdminSearch" class="v2-admin-search"
             placeholder="Cari nama atau username…" autocomplete="off" />
      <select id="v2AdminRoleFilter" class="v2-admin-filter">
        <option value="">Semua Peran</option>
        <option value="admin">Admin</option>
        <option value="bidang">Bidang</option>
        <option value="driver">Driver</option>
        <option value="viewer">Viewer</option>
      </select>
      <button id="v2AdminAddUser" class="v2-admin-add-btn" type="button">+ Tambah User</button>
    </div>
    <div id="v2AdminUserList" class="v2-admin-user-list"></div>
  `;
  document.querySelector('.main-content')?.appendChild(ws);

  ws.addEventListener('input', e => {
    if (e.target.id === 'v2AdminSearch') renderV2AdminWorkspace();
  });
  ws.addEventListener('change', e => {
    if (e.target.id === 'v2AdminRoleFilter') renderV2AdminWorkspace();
  });
  document.getElementById('v2AdminAddUser')?.addEventListener('click', () => {
    openUserFormModal(null);
  });

  registerUsersChangeListener(() => {
    if (currentWorkspace === 'administration') renderV2AdminWorkspace();
  });

  console.log('[VSM-12] Administration workspace injected');
}

function buildUserCard(user) {
  const initials = (user.displayName || user.username || '?')
    .split(' ').slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '?';
  const role = user.role || 'viewer';
  const active = user.active !== false;
  const roleLabel = { admin: 'Admin', bidang: 'Bidang', driver: 'Driver', viewer: 'Viewer' }[role] || role;
  const toggleLabel = active ? 'Nonaktifkan' : 'Aktifkan';
  return `
    <div class="v2-user-card${active ? '' : ' v2-user-card--inactive'}">
      <div class="v2-user-avatar-ring v2-user-avatar--${esc(role)}">
        <span class="v2-user-avatar-initials">${esc(initials)}</span>
      </div>
      <div class="v2-user-info">
        <span class="v2-user-display-name">${esc(user.displayName || user.username)}</span>
        <span class="v2-user-username">@${esc(user.username)}</span>
      </div>
      <div class="v2-user-meta">
        <span class="v2-user-role-pill v2-role-pill--${esc(role)}">${esc(roleLabel)}</span>
        <span class="v2-user-status-pill${active ? '' : ' v2-status-pill--inactive'}">${active ? 'Aktif' : 'Nonaktif'}</span>
      </div>
      <div class="v2-user-card-actions">
        <button class="v2-user-btn v2-user-btn--edit"
                data-user-edit="${esc(user.username)}" type="button">Edit</button>
        <button class="v2-user-btn v2-user-btn--toggle"
                data-user-toggle="${esc(user.username)}" type="button">${toggleLabel}</button>
      </div>
    </div>`;
}

function renderV2AdminWorkspace() {
  const list = document.getElementById('v2AdminUserList');
  if (!list) return;

  const q = (document.getElementById('v2AdminSearch')?.value || '').toLowerCase().trim();
  const roleFilter = document.getElementById('v2AdminRoleFilter')?.value || '';
  const allUsers = getUserList();

  const filtered = allUsers.filter(u => {
    const matchesSearch = !q ||
      (u.displayName || '').toLowerCase().includes(q) ||
      (u.username    || '').toLowerCase().includes(q);
    const matchesRole = !roleFilter || u.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  if (!filtered.length) {
    list.innerHTML = '<div class="v2-admin-empty">Tidak ada pengguna ditemukan.</div>';
    return;
  }

  list.innerHTML = filtered.map(buildUserCard).join('');

  list.querySelectorAll('[data-user-edit]').forEach(btn => {
    btn.addEventListener('click', () => openUserFormModal(btn.dataset.userEdit));
  });
  list.querySelectorAll('[data-user-toggle]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const username = btn.dataset.userToggle;
      const user = getUserList().find(u => u.username === username);
      if (!user) return;
      btn.disabled = true;
      try {
        if (user.active !== false) {
          await deactivateUser(username);
        } else {
          await activateUser(username);
        }
      } catch (err) {
        showToast(err.message || 'Gagal mengubah status.', 'error');
        renderV2AdminWorkspace();
      }
    });
  });
}

/**
 * Apply and persist a light/dark theme.
 * @param {'light'|'dark'} theme
 * @param {boolean} animate
 */
function applyTheme(theme, animate = false) {
  if (animate) {
    document.documentElement.classList.add('theme-anim');
    setTimeout(() => document.documentElement.classList.remove('theme-anim'), 700);
  }
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('pbsi_theme', theme);

  const ICON_SUN  = `<svg viewBox="0 0 20 20" fill="currentColor" width="15" height="15" aria-hidden="true"><path fill-rule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clip-rule="evenodd"/></svg>`;
  const ICON_MOON = `<svg viewBox="0 0 20 20" fill="currentColor" width="15" height="15" aria-hidden="true"><path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z"/></svg>`;

  const topbarBtn = document.getElementById('v2TopbarThemeBtn');
  const railBtn   = document.getElementById('v2RailThemeBtn');

  if (theme === 'dark') {
    if (topbarBtn) { topbarBtn.setAttribute('aria-label', 'Ganti ke tema terang'); topbarBtn.innerHTML = ICON_SUN; }
    if (railBtn)   { railBtn.setAttribute('aria-label', 'Ganti ke tema terang');   railBtn.innerHTML   = ICON_SUN; }
  } else {
    if (topbarBtn) { topbarBtn.setAttribute('aria-label', 'Ganti ke tema gelap'); topbarBtn.innerHTML = ICON_MOON; }
    if (railBtn)   { railBtn.setAttribute('aria-label', 'Ganti ke tema gelap');   railBtn.innerHTML   = ICON_MOON; }
  }
}

/**
 * Read saved theme preference and wire the theme toggle button.
 * Must be called after initV2Topbar() so #v2TopbarThemeBtn exists.
 */
function initThemeManager() {
  applyTheme(localStorage.getItem('pbsi_theme') || 'light', false);

  document.getElementById('v2TopbarThemeBtn')?.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    applyTheme(current === 'dark' ? 'light' : 'dark', true);
  });
}

/**
 * Approve a pending request. Extracted from DOMContentLoaded so the
 * pending workspace can call the same path without duplication.
 * @param {string} requestId
 */
function handleRequestApprove(requestId) {
  if (!isAdmin()) return;

  checkAssignmentSafety(assignments.length);

  const request = requests.find(item => item.id === requestId);
  const admin   = getCurrentUser();
  if (!request || request.status !== 'pending') return;

  const dates = expandDateRange(request.startDate, request.endDate);
  if (dates.length === 0) {
    showToast('Request tidak memiliki tanggal yang valid.');
    return;
  }

  const conflictingDates = dates.filter(date =>
    checkConflict(request.driver, request.startTime, request.endTime, date)
  );
  if (conflictingDates.length > 0) {
    const dateList = conflictingDates.map(d => formatDateShort(d)).join(', ');
    alert(
      `Konflik jadwal terdeteksi pada:\n${dateList}\n\n` +
      `Driver ${request.driver} sudah memiliki jadwal di waktu tersebut.\n` +
      `Edit request sebelum approve.`
    );
    return;
  }

  const newAssignments = dates.map(date => requestToAssignment(request, admin, date));
  assignments = [...assignments, ...newAssignments];

  requests = requests.map(item => item.id === requestId
    ? { ...item, status: 'approved', approvedBy: admin ? admin.name : '', approvedAt: new Date().toISOString() }
    : item
  );

  updateAllModules();
  setCurrentDate(request.startDate);
  setCurrentDateForm(request.startDate);
  saveAssignments(assignments);
  newAssignments.forEach(a => saveOneAssignment(a));
  saveRequests(requests);

  const currentUser = getCurrentUser();
  logAction({
    userId:   currentUser?.id,
    username: currentUser?.username,
    action:   'request_approved',
    targetId: requestId,
    metadata: {
      assignmentCount: newAssignments.length,
      assignmentIds:   newAssignments.map(a => a.id),
      beforeCount:     assignments.length - newAssignments.length,
      afterCount:      assignments.length,
      operationType:   'bulk_create',
    },
  });

  renderViews();
  updatePermissionUI();
  if (currentWorkspace === 'pending') renderPendingWorkspace();
  if (dates.length > 1) showToast(`✅ ${dates.length} assignment berhasil dibuat`);

  sendRequestApprovedNotification(request, getUserByUsername);
  if (newAssignments.length > 0) sendNewAssignmentNotificationToDriver(newAssignments[0], getUsers);
}

/**
 * Reject a pending request. Extracted for reuse by renderPendingWorkspace().
 * @param {string} requestId
 */
function handleRequestReject(requestId) {
  if (!isAdmin()) return;
  if (!confirm('Reject request ini?')) return;

  const admin = getCurrentUser();
  requests = requests.map(item => item.id === requestId
    ? { ...item, status: 'rejected', approvedBy: admin ? admin.name : '', approvedAt: new Date().toISOString() }
    : item
  );

  updateAllModules();
  saveRequests(requests);
  const currentUser = getCurrentUser();
  logAction({
    userId:      currentUser?.id,
    username:    currentUser?.username,
    displayName: currentUser?.name,
    action:      'request_rejected',
    targetId:    requestId,
  });
  updatePermissionUI();
  if (currentWorkspace === 'pending') renderPendingWorkspace();

  const rejectedRequest = requests.find(item => item.id === requestId);
  if (rejectedRequest) sendRequestRejectedNotification(rejectedRequest, getUserByUsername);
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
    initV2KpiStrip();             // VSM-4: inject KPI strip placeholder above timeline
    initV2TimelineContainer();    // VSM-5: wrap timeline in elevated surface card
    initV2DriverAvatars();        // VSM-5C Part 7: observer stamps data-initials onto driver rows
    initV2PendingWorkspace();     // VSM-9: inline pending workspace
    initV2AdministrationWorkspace(); // VSM-9: admin-only administration workspace
    initThemeManager();           // VSM-9: dark mode toggle wired to #v2TopbarThemeBtn
  }

  // VSM-9: Search input events — wired after topbar exists
  const v2SearchInput = document.getElementById('v2SearchInput');
  const v2SearchClear = document.getElementById('v2SearchClear');

  if (v2SearchInput) {
    v2SearchInput.addEventListener('input', () => {
      searchQuery = v2SearchInput.value;
      if (v2SearchClear) v2SearchClear.style.display = searchQuery ? 'flex' : 'none';
      updateAllModules();
      renderViews();
      if (currentWorkspace === 'pending') renderPendingWorkspace();
    });
    v2SearchInput.addEventListener('keydown', e => {
      if (e.key !== 'Escape') return;
      searchQuery = '';
      v2SearchInput.value = '';
      if (v2SearchClear) v2SearchClear.style.display = 'none';
      updateAllModules();
      renderViews();
      if (currentWorkspace === 'pending') renderPendingWorkspace();
    });
  }
  if (v2SearchClear) {
    v2SearchClear.addEventListener('click', () => {
      searchQuery = '';
      if (v2SearchInput) v2SearchInput.value = '';
      v2SearchClear.style.display = 'none';
      updateAllModules();
      renderViews();
      if (currentWorkspace === 'pending') renderPendingWorkspace();
    });
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
    renderViews();
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
    updatePermissionUI(true); // auth change → reset nav to Dashboard
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
  renderViews();                         // Render timeline + list view pertama kali
  updatePermissionUI(true);              // startup → reset nav to Dashboard
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
    renderViews();
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

    renderViews();

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

  // ── Callback: Admin approve/reject request — delegate to named handlers ──
  registerRequestApproveCallback(handleRequestApprove);
  registerRequestRejectCallback(handleRequestReject);

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

    renderViews();

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
    renderViews();

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
    renderViews();

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
