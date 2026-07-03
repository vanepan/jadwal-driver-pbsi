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
import { APP_NAME, APP_VERSION, RELEASE_NAME } from './config.js';
import { loadAssignments, saveAssignments, saveOneAssignment, removeOneAssignment, loadRequests, saveRequests, initFirebaseSync, registerDataChangeListener, registerRequestsChangeListener, checkAssignmentSafety, fetchFirebaseData, storeFirebaseData, isFirebaseConfigured, onAuthAvailable, onAuthLost } from './firebase.js';
// rc.1: persist Dispatch Intelligence history (override logs / recommendations / capacity) to RTDB.
import { hydrateDispatchIntelligence, initDispatchIntelligencePersistence } from './services/dispatch-intelligence-persistence.js';
import { recoverAssignmentsFromRequests } from './recovery.js';
import { initDriverSelect, refreshDriverSelect } from './drivers.js';
import {
  initDriversStore,
  getDrivers,
  getActiveDrivers,
  registerDriversChangeListener,
  createDriver,
  updateDriver,
  archiveDriver,
  restoreDriver,
  deleteDriver,
  DRIVER_STATUS,
  isLeaveStatus,
  deriveStatus,
  effectiveStatus,
  setDriverStatus,
  autoReactivateDueDrivers,
} from './drivers-store.js';
import {
  initVehiclesStore,
  getVehicles,
  getActiveVehicles as getActiveVehiclesFromStore,
  registerVehiclesChangeListener,
  createVehicle,
  updateVehicle,
  deactivateVehicle,
  reactivateVehicle,
  archiveVehicle,
  restoreVehicle,
  deleteVehicle,
  addMaintenanceRecord,
  updateMaintenanceRecord,
  deleteMaintenanceRecord,
  getMaintenanceRecords,
} from './vehicles-store.js';
import { initSettingsStore, getSetting, updateSetting, registerSettingsChangeListener } from './settings-store.js';
import { initPWA, getPWAState, registerPWAStateListener, triggerInstallPrompt, showIOSInstallModal } from './pwa.js';
import { initPush } from './push.js';
import { initPbsiSelect } from './pbsi-select.js';
import { initPbsiDatepicker, syncPbsiDatepicker } from './pbsi-datepicker.js';
import { renderTimeline, setCurrentDate, setAssignments as setTimelineAssignments, initDateControls, getCurrentDate } from './timeline.js';
import { initModalHandlers, openDetailModal, registerEditCallback, registerDeleteCallback, registerStartCallback, registerCompleteCallback, registerCommentCallback as registerModalCommentCallback, registerCancelCallback, registerOvertimeOverrideCallback, setAssignments as setModalAssignments, updateDetailActionButtons } from './modal.js';
import { initFormHandlers, openFormModal, closeFormModal, registerSaveCallback, setAssignments as setAssignmentsForm, setCurrentDate as setCurrentDateForm, checkConflict, deleteAssignment } from './assignments.js';
// Request Auto-Fill Intelligence (v1.16.4.11-beta.2): read-only dispatch suggestion panel.
import { initAssignmentDispatchHints } from './components/assignment-dispatch-hints.js';
// beta.3: admin approval override → records the decision in the existing override log.
import { saveOverrideLog, getOverrideLogs, getAllRequestRecommendations } from './stores/dispatch-intelligence-store.js';
import { computeDispatchAnalyticsModel } from './analytics/dispatch-analytics-engine.js';
import { injectDispatchAnalyticsStyles, renderDispatchAnalyticsDashboard } from './components/dispatch-analytics-dashboard.js';
// v1.17.1 Recommendation Accuracy Engine — read-only accuracy analytics rendered
// beside the Dispatch Analytics dashboard (same admin section).
import { computeRecommendationAccuracyModel } from './analytics/recommendation-accuracy-engine.js';
import { injectRecommendationAccuracyStyles, renderRecommendationAccuracyDashboard } from './components/recommendation-accuracy-dashboard.js';
// v1.17.2 Dispatch Intelligence Policy Engine — the single eligibility-rule layer.
// applyAnalyticsPolicy filters the analytics INPUTS (ambulance + Akuntes) without
// touching any analytics formula; operational data is never deleted.
import { applyAnalyticsPolicy } from './services/dispatch-policy-engine.js';
// beta.3.1: pure approval-decision helpers (effective dispatch, classification, audit record).
import {
  resolveEffectiveDispatch,
  isApprovalOverride,
  buildApprovalOverrideRecord,
  buildRecommendationPackage,
  requestToEngineRequest,
} from './services/request-intelligence-service.js';
// v1.16.4.12 Auto Assignment Assistant: premium approval intelligence panel
// (recommendation card, confidence, apply, comparison, breakdown, timeline).
import { mountApprovalIntelligencePanel, updateApprovalComparison } from './components/approval-intelligence-panel.js';
import { openDecisionReplay, closeDecisionReplayDrawer } from './components/decision-replay-drawer.js'; // v1.17.5 — Decision Replay & Explainable AI drawer
// v1.17.6 Driver Wellness Intelligence — read-only wellness interpretation layer
// (health score, fatigue, burnout, capacity health) rendered as its own admin
// section in the Analytics module. Reuses capacity + workload + unified scoring.
import { computeDriverWellnessModel, findDriverWellness } from './services/driver-wellness-service.js';
import { injectDriverWellnessStyles, renderDriverWellnessDashboard } from './components/driver-wellness-dashboard.js';
import { openDriverWellnessDrawer } from './components/driver-wellness-drawer.js';
// v1.18.0 Vehicle Asset Intelligence — the Vehicle Store is the single asset
// source; this layer interprets it (health, tax/insurance status, eligibility,
// timeline) and renders the Fleet Dashboard + Apple-style detail drawer. Reuses
// Unified Scoring + the Dispatch Policy Engine (no dispatch/recommendation change).
import { validateMaintenanceRecord, normalizeMaintenanceRecord } from './services/maintenance-service.js';
import { computeFleetAssetModel, findVehicleAsset, searchFilterVehicles } from './services/vehicle-asset-service.js';
import { injectFleetDashboardStyles, renderFleetDashboard } from './components/fleet-dashboard.js';
import { renderIcon, vehicleTypeIconName } from './components/icon-system.js';
import { openVehicleDetailDrawer } from './components/vehicle-detail-drawer.js';
import { renderVehiclePredictionDashboard, injectVehiclePredictionStyles, getCertifiedVehiclePredictions } from './components/vehicle-prediction-dashboard.js';
import { FUEL_TYPES, TRANSMISSION_TYPES, VEHICLE_TYPE_REGISTRY, VEHICLE_STATUS_REGISTRY } from './config/vehicle-asset-config.js';
import { initAuthUI, hasPermission, getCurrentUser, isAdmin, isBidang, isDriver } from './auth.js';
import * as DocumentEngine from './docs/doc-engine.js';
import './docs/templates/analytics-summary.js';   // registers 'analytics-summary'
import './exports/analytics/analytics-export-client.js'; // Analytics Export Phase A — window.exportAnalyticsPoc()
import './exports/analytics/dispatch-analytics-export.js'; // v1.17.0 — window.exportDispatchAnalyticsPdf/Excel()
import './exports/analytics/recommendation-accuracy-export.js'; // v1.17.1 — window.exportRecommendationAccuracyPdf/Excel()
import './exports/analytics/decision-replay-export.js'; // v1.17.5 — window.exportDecisionReplayPdf/Excel()
import './exports/analytics/driver-wellness-export.js'; // v1.17.6 — window.exportDriverWellnessPdf/Excel()
import './exports/analytics/executive-dashboard-export.js'; // v1.18.8 — window.exportExecutiveDashboardPdf/Excel()
import { listExportReports, getExportReport, runExportReport } from './exports/export-registry.js'; // single source of truth for report exports
import { logExportSuccess, logExportFailure, ensureExportHistoryLoadedAndSubscribed, resetExportHistorySync, getExportHistoryCache, subscribeExportHistoryChangeListener } from './exports/export-history.js'; // metadata logging for every export
import { renderExportCenter as renderModernExportCenter } from './exports/export-center.js'; // v1.12.1C modern Export Center (registry + metadata)
import {
  computeAnalyticsModel,
  normDestKey as _normDestKey,
  getAliasCanonical as _getAliasCanonical,
  dqPairKey as _dqPairKey,
} from './analytics/analytics-engine.js';
// v1.16.4.11-rc.1.1: single sanitization boundary — the engine receives only
// clean, fully-typed data so its business logic carries no null-guards.
import {
  sanitizeDrivers,
  sanitizeVehicles,
  sanitizeRequests,
  sanitizeAssignments,
  sanitizeSettings,
} from './analytics/analytics-sanitizer.js';
import {
  validateCustomAlias as _validateCustomAlias,
  normalizeCanonical as _normalizeCanonical,
  aliasConfidence as _aliasConfidence,
  decodeSafeKey as _decodeSafeKey,
  ALIAS_AUDIT as _ALIAS_AUDIT,
  buildAliasEntry as _buildAliasEntry,
  aliasSaveAction as _aliasSaveAction,
  applyAlias as _applyAlias,
  removeAlias as _removeAlias,
} from './analytics/engines/alias-engine.js';
import { classificationOf } from './analytics/analytics-governance.js';
import {
  renderAnalyticsEmptyState,
  renderAnalyticsErrorState,
  renderAnalyticsChart,
  renderAnalyticsTabPanels,
  anIcon,
  renderEyebrow,
  renderHeroSection,
  renderHighlights,
  renderInsightRow,
  renderInsightDividerList,
  renderSeg,
} from './analytics/analytics-shell.js';
import { renderExecutiveStatusPill as ExecutiveStatusPill, bindExecutiveTable } from './analytics/executive-table.js';
import { derivePreviousPeriod } from './analytics/analytics-period.js';
import {
  initRequestHandlers,
  openRequestFormModal,
  openRequestsListModal,
  registerRequestCreateCallback,
  registerRequestUpdateCallback,
  registerRequestApproveCallback,
  registerRequestApproveEditCallback,
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
import {
  mountPettyCash, setPettyCashScreen, closePettyCashCenter, openPettyCashAddExpense,
} from './petty-cash/petty-cash-center.js';
import { mountAnalyticsPettyCash, closeAnalyticsPettyCash, refreshAnalyticsPettyCash } from './analytics/views/analytics-petty-cash-view.js';
// v1.18.8: mountAnalyticsExecutive is retired — the "Analytics Executive" entry
// now renders the new Executive Analytics Dashboard sibling section (below). The
// close/refresh hooks stay imported for the dormant analyticsExec workspace guard.
import { closeAnalyticsExecutive, refreshAnalyticsExecutive } from './analytics/views/analytics-executive-view.js';
// v1.18.8 Executive Analytics Dashboard — the platform's executive home page. It
// REUSES existing engine outputs only (no new business logic): the Operational
// Health Score (computeExecutiveAnalytics over the driver + petty models), plus
// the Dispatch / Recommendation / Wellness / Fleet models already built below.
import { renderExecutiveDashboard, injectExecutiveDashboardStyles } from './components/executive-dashboard.js';
import { computeExecutiveAnalytics } from './analytics/executive-analytics.js';
// v1.19.4 Driver Prediction — the FIRST consumer of the Prediction Service. A
// PURE presentation dashboard that answers "what is likely to happen to driver
// operational readiness over the next several days?". It consumes ONLY the
// Prediction Service (via the dashboard component) — never the prediction
// engine / validator / provider — so the UI stays decoupled from every
// prediction implementation. Adds NO business logic; the service is called
// exactly once per refresh from inside the component.
import { renderDriverPredictionDashboard, injectDriverPredictionStyles } from './components/driver-prediction-dashboard.js';
import { computePettyCashAnalytics } from './analytics/petty-cash-analytics.js';
import { bidangRoster } from './petty-cash/petty-cash-service.js';
import {
  isReady as pcReady, getExpenses as getPcExpenses, getNors as getPcNors,
  getActiveCycle as getPcActiveCycle, getSettings as getPcSettings,
} from './petty-cash/petty-cash-store.js';
import { initNotificationUI, setNotificationData, openNotificationsModal } from './notifications.js';
import { setTelegramBotToken } from './telegram.js';
import { subscribeLogsChangeListener, getLogs, logAction, ensureLogsLoadedAndSubscribed, resetLogsSync } from './logs.js';
import { publishEvent } from './events.js';
import { getUserByUsername, getUsers, createUser, getUserList, activateUser, deactivateUser, registerUsersChangeListener, archiveUser, restoreUser, deleteUser, initUsersSync, ensureUsersLoadedAndSubscribed, resetUsersSync } from './users.js';
import { expandDateRange, showToast, formatDateShort, vehicleLabel, computeWorkTime } from './utils.js';
import {
  sendRequestApprovedNotification,
  sendRequestRejectedNotification,
  sendNewRequestNotificationToAdmins,
  sendNewAssignmentNotificationToDriver,
  sendAssignmentCancelledNotification,
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
//        | 'pettycash' | 'placeholder'  (v1.14.0 platform modules)
let currentWorkspace = 'dashboard';
// v1.14.0: which rail module is active —
//   'driverops' | 'pettycash' | 'analytics' | 'konfigurasi'
//   ('administration' retained in code for rollback but no longer reachable)
let activeRailModule = 'driverops';
// v1.14.0: which module is currently driving the (shared) administration
// workspace — controls which sub-nav tabs render on mobile.
let activeAdminModule = 'konfigurasi';
// v1.14.0: lazy mount flag for the embedded Petty Cash module.
let pettyCashMounted = false;
// v1.15.0: lazy mount flags for the new Analytics workspaces.
let analyticsPettyMounted = false;
let analyticsExecMounted = false;

// V1.5.0 Phase 2.5.1: Administration workspace section state
let activeAdminSection = 'users';
// V1.5.0 Phase 3.1: Driver management workspace state
let driverSearch = '';
let driverStatusFilter = 'all'; // 'all' | 'active' | 'inactive' | 'archived'
let editingDriverId = null;
// V1.5.2: Vehicle management workspace state
let vehicleSearch = '';
let vehicleStatusFilter = 'all'; // 'all' | 'active' | 'inactive' | 'archived' | status keys
let editingVehicleId = null;
// v1.18.0 Vehicle Asset Intelligence — asset search/filter (Feature 13) + cached
// fleet model (rebuilt on each render from the Vehicle Store, the single source).
let vehicleTypeFilter = 'all';
let vehicleFuelFilter = 'all';
let vehicleTransmissionFilter = 'all';
let _fleetAssetModel = null;
// v1.19.5 — Vehicle Management is a multi-view module. 'inventory' (the vehicle
// list) or 'prediction' (the Vehicle Prediction dashboard, a read-only forecast
// view that consumes ONLY the Prediction Service). A sub-view of the same
// module — NOT a new sidebar section.
let vehicleView = 'inventory';
let _vehiclePredictionById = {}; // id → certified per-vehicle projection (for the drawer)
// V1.5.3: Archive & deletion state
let userStatusFilter = 'all';    // 'all' | 'active' | 'inactive' | 'archived'
let pendingDeleteEntity = null;  // { type, id, name } — set before opening delete confirm modal
// V1.6.0: Audit Center state
let auditSearch = '';
let auditCategoryFilter = 'all';
let auditActorFilter = '';
let auditDateFilter = '';
// V1.8.1: Analytics filter state
let analyticsDateRange    = '30d'; // 'today' | '7d' | '30d' | '90d' | 'all'
let analyticsDriverFilter  = '';
let analyticsVehicleFilter = '';
let analyticsBidangFilter  = '';
const _analyticsCharts = new Map();
/* Snapshot of the latest analytics compute — consumed by the PDF export so
   the report matches exactly what is on screen (no recomputation, no drift). */
let _lastAnalyticsModel = null;
const ADMIN_SECTION_DEFS = [
  { key: 'users', label: 'Manajemen User', subtitle: 'Tambah, edit, atau nonaktifkan akun pengguna.' },
  { key: 'drivers', label: 'Manajemen Driver', subtitle: 'Kelola registrasi, status, dan data identitas driver.' },
  { key: 'vehicles', label: 'Manajemen Kendaraan', subtitle: 'Kelola registrasi, status, dan data armada kendaraan operasional.' },
  { key: 'audit', label: 'Audit Center', subtitle: 'Telusuri dan verifikasi aktivitas sistem dan catatan operasional.' },
  { key: 'config', label: 'Konfigurasi', subtitle: 'Atur parameter operasional, notifikasi, sistem, dan integrasi Telegram.' },
  { key: 'analytics', label: 'Analytics', subtitle: 'Ringkasan operasional berbasis data aktual — assignment, driver, kendaraan, dan bidang.' },
  { key: 'dispatchanalytics', label: 'Dispatch Analytics', subtitle: 'Dashboard eksekutif Dispatch Intelligence — akurasi, override, confidence, intelijen driver/kendaraan, dan tren.' },
  { key: 'recommendationaccuracy', label: 'Recommendation Accuracy', subtitle: 'Seberapa akurat rekomendasi dispatch — akurasi, kalibrasi confidence, severity override, dan tren pembelajaran.' },
  { key: 'wellness', label: 'Driver Wellness', subtitle: 'Keberlanjutan operasional — skor kesehatan, kelelahan, burnout, dan capacity health per driver.' },
  { key: 'prediction', label: 'Driver Prediction', subtitle: 'Proyeksi kesiapan operasional driver beberapa hari ke depan — status, risiko mendatang, tindakan, dan linimasa prediksi.' },
  { key: 'executive', label: 'Executive Analytics', subtitle: 'Kondisi operasional hari ini — status, indikator utama, sorotan, dan navigasi ke setiap laporan.' },
];

/* v1.14.0: which admin sections belong to which platform module. Drives the
   mobile sub-nav tab strip so it mirrors the new module structure rather than
   the retired flat Administration list. (Desktop hides the strip — the panel
   menu navigates.) */
const ADMIN_MODULE_SECTIONS = {
  driverops:   ['drivers', 'vehicles', 'audit'],
  konfigurasi: ['users', 'config'],
  analytics:   ['analytics', 'dispatchanalytics', 'recommendationaccuracy', 'wellness', 'prediction', 'executive'],
};

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
  syncV2ResponsiveNavReuse();
}

/**
 * Reuse the same V2 navigation renderer on desktop and mobile.
 * Desktop: rail + panel mounted in .app-layout.
 * Mobile:  rail + panel mounted inside the legacy sidebar drawer container.
 */
function initV2ResponsiveNavReuse() {
  if (!window.__pbsiV2NavReuseBound) {
    window.addEventListener('resize', syncV2ResponsiveNavReuse);
    window.__pbsiV2NavReuseBound = true;
  }
  syncV2ResponsiveNavReuse();
}

function syncV2ResponsiveNavReuse() {
  const panel = document.getElementById('v2Panel');
  const rail = document.getElementById('v2Rail');
  const sidebar = document.getElementById('sidebar');
  const sidebarNav = sidebar?.querySelector('.sidebar-nav');
  const appLayout = document.querySelector('.app-layout');
  if (!panel || !rail || !sidebar || !sidebarNav || !appLayout) return;

  const isMobile = window.matchMedia('(max-width: 767px)').matches;
  const logoutDirect = document.getElementById('v2FooterLogoutDirect');
  const footerUser = document.getElementById('v2FooterUser');

  if (isMobile) {
    // Mobile drawer = the SAME live #v2Rail + #v2Panel relocated into the
    // sidebar. The active module's menu (panel) renders expanded; the rail
    // becomes the "Bottom Modules" switcher list; the legacy sidebar nav
    // groups are hidden. Module/permission visibility is owned entirely by
    // updatePermissionUI() — this function only moves DOM + toggles layout.
    sidebarNav.querySelectorAll('.sidebar-nav-group').forEach(group => {
      group.dataset.v2LegacyNav = 'true';
      group.style.display = 'none';
    });

    let host = document.getElementById('v2MobileNavHost');
    if (!host) {
      host = document.createElement('div');
      host.id = 'v2MobileNavHost';
      sidebarNav.insertBefore(host, sidebarNav.firstChild);
    }

    // Order inside the drawer: active module menu → Bottom Modules → Logout.
    if (panel.parentElement !== host) host.appendChild(panel);
    if (rail.parentElement !== host) host.appendChild(rail);
    if (logoutDirect && logoutDirect.parentElement !== host) host.appendChild(logoutDirect);
    panel.classList.add('v2-panel--mobile-drawer');
    rail.classList.add('v2-rail--mobile-drawer');

    // Hide the rail ("Bottom Modules") when the current role has no module to
    // switch to beyond the active one. Reads the permission-driven rail-item
    // visibility already set by updatePermissionUI — no duplicate gating here.
    const switchable = Array.from(rail.querySelectorAll('.v2-rail-item')).filter(item =>
      !item.classList.contains('v2-rail-item--active')
      && item.style.display !== 'none'
      && item.getAttribute('aria-hidden') !== 'true'
    ).length;
    rail.classList.toggle('v2-rail--mobile-empty', switchable === 0);
    return;
  }

  // ── Desktop: restore the rail + panel to .app-layout ──
  sidebarNav.querySelectorAll('.sidebar-nav-group[data-v2-legacy-nav="true"]').forEach(group => {
    group.style.display = '';
  });

  panel.classList.remove('v2-panel--mobile-drawer');
  rail.classList.remove('v2-rail--mobile-drawer', 'v2-rail--mobile-empty');

  if (rail.parentElement !== appLayout) appLayout.insertBefore(rail, sidebar);
  if (panel.parentElement !== appLayout) appLayout.insertBefore(panel, sidebar);
  // Return the direct-logout button to its panel home (hidden on desktop).
  if (logoutDirect && footerUser && logoutDirect.previousElementSibling !== footerUser) {
    footerUser.after(logoutDirect);
  }
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
    pendingRequests: getMyPendingRequestCount(),
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

  // FAB (mobile primary action): v1.15.2 — driven by the SAME module-aware
  // resolver as the desktop panel CTA (resolvePrimaryCta), so it is hidden on
  // read-only workspaces (Analytics / Konfigurasi) and labelled per module.
  // Called unconditionally here; setRailModule() refreshes it on module switch.
  updateFabCta();

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

    // Primary CTA is module-aware (v1.14.1): role + active module decide which
    // (if any) CTA shows. updatePanelCta() owns #v2PanelCta + its buttons.
    updatePanelCta();

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

    // ── Rail modules: Petty Cash, Analytics, Konfigurasi are admin-only ──
    const adminOnly = isAdmin();
    const v2RailPettyCash = document.getElementById('v2RailPettyCash');
    if (v2RailPettyCash) v2RailPettyCash.style.display = adminOnly ? 'flex' : 'none';
    const v2RailAnalytics = document.getElementById('v2RailAnalytics');
    if (v2RailAnalytics) v2RailAnalytics.style.display = adminOnly ? 'flex' : 'none';
    const v2RailKonfig = document.getElementById('v2RailKonfigurasi');
    if (v2RailKonfig) v2RailKonfig.style.display = adminOnly ? 'flex' : 'none';

    // Administration rail module: RETIRED (v1.14.0) — always hidden.
    const v2RailAdmin = document.getElementById('v2RailAdmin');
    if (v2RailAdmin) v2RailAdmin.style.display = 'none';

    // Driver Operations panel — Master Data + Audit sections are admin-only.
    const v2PanelDriverMaster = document.getElementById('v2PanelDriverMaster');
    if (v2PanelDriverMaster) v2PanelDriverMaster.style.display = adminOnly ? '' : 'none';
    const v2PanelDriverAudit = document.getElementById('v2PanelDriverAudit');
    if (v2PanelDriverAudit) v2PanelDriverAudit.style.display = adminOnly ? '' : 'none';

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
    syncV2ResponsiveNavReuse();
  }

  // Reset bottom nav only on auth changes — same reasoning as panel nav above.
  if (resetNavActive) setBottomNavActive('bottomNavDashboard');
  renderKPIStrip();
  syncV2ResponsiveNavReuse();
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
/* ──────────────────────────────────────────────────────────────────
   v1.14.0 — Platform module model

   Four user-facing MODULES live in the rail. Each owns a panel-nav block
   and a default MENU. Administration is retired from navigation but kept
   in code (its workspace is reused, headless, by the new modules).

   MODULE_DEFS drives setRailModule(): rail item id, panel nav id, label,
   subtitle, breadcrumb label and the default landing action.
   ────────────────────────────────────────────────────────────────── */
const MODULE_DEFS = {
  driverops: {
    railId: 'v2RailDriverOps', navId: 'v2PanelDriverOpsNav',
    title: 'Driver Operations', subtitle: 'Operasional Kendaraan', crumb: 'DRIVER OPS',
    land: () => navJadwalDriver(),
  },
  pettycash: {
    railId: 'v2RailPettyCash', navId: 'v2PanelPettyCashNav',
    title: 'Petty Cash Center', subtitle: 'Kas Operasional', crumb: 'PETTY CASH',
    /* v1.16.2.7 fix: pass the nav id so the Dashboard menu highlights on landing
       (other modules self-highlight inside their land fn; navPettyCash only
       highlights when given navId — without it the active state was set only
       after the user clicked Dashboard). */
    land: () => navPettyCash('dashboard', 'v2NavPcDashboard'),
  },
  analytics: {
    railId: 'v2RailAnalytics', navId: 'v2PanelAnalyticsNav',
    title: 'Analytics', subtitle: 'Intelijen Operasional', crumb: 'ANALYTICS',
    land: () => navAnalyticsDriver(),
  },
  konfigurasi: {
    railId: 'v2RailKonfigurasi', navId: 'v2PanelKonfigurasiNav',
    title: 'Konfigurasi', subtitle: 'Manajemen Platform', crumb: 'KONFIGURASI',
    land: () => navManajemenUser(),
  },
};

/** Set the two-line topbar breadcrumb (module label + section title). */
function setCrumb(moduleLabel, title) {
  const crumb = document.getElementById('v2TopbarCrumb');
  if (!crumb) return;
  const lab = crumb.querySelector('.v2-topbar-label');
  const ttl = crumb.querySelector('.v2-topbar-title');
  if (lab && moduleLabel != null) lab.textContent = moduleLabel;
  if (ttl && title != null) ttl.textContent = title;
}

/**
 * v1.15.2: SINGLE source of truth for the module-aware primary CTA.
 *
 * Both the desktop context-panel CTA (updatePanelCta) and the mobile FAB
 * (updateFabCta) read THIS resolver — the workspace→CTA mapping is defined in
 * exactly one place, so mobile and desktop can never drift apart again.
 *
 * Mapping (role + active module):
 *   Driver Operations → 'jadwal' (admin) / 'ajukan' (bidang)
 *   Petty Cash Center → 'pengeluaran' (admin)
 *   Analytics (Driver/Petty/Executive) → null (read-only)
 *   Konfigurasi → null (configuration)
 *
 * @returns {{kind:'jadwal'|'ajukan'|'pengeluaran', label:string}|null}
 *          null ⇒ no CTA / FAB on this workspace.
 */
function resolvePrimaryCta() {
  if (activeRailModule === 'driverops') {
    if (isAdmin())  return { kind: 'jadwal', label: 'Tambah Jadwal' };
    if (isBidang()) return { kind: 'ajukan', label: 'Ajukan Jadwal' };
    return null;
  }
  if (activeRailModule === 'pettycash') {
    if (isAdmin())  return { kind: 'pengeluaran', label: 'Tambah Pengeluaran' };
    return null;
  }
  // analytics + konfigurasi → read-only, no primary CTA
  return null;
}

/**
 * Run the resolved primary CTA's action. Shared by the desktop panel CTA
 * buttons and the mobile FAB so the click behaviour matches the visible label.
 */
function runPrimaryCta() {
  const resolved = resolvePrimaryCta();
  if (!resolved) return;
  if (resolved.kind === 'jadwal')      openFormModal();
  else if (resolved.kind === 'ajukan') openRequestFormModal();
  else if (resolved.kind === 'pengeluaran') {
    // Guard: ensure the Petty Cash module is mounted/active before opening.
    if (activeRailModule !== 'pettycash') { navPettyCash('dashboard', 'v2NavPcDashboard'); }
    openPettyCashAddExpense();
  }
}

/**
 * Mobile FAB (#fabAdd) — mirrors the desktop CTA via the shared resolver.
 * Hidden on every read-only workspace (Analytics Driver/Petty/Executive,
 * Konfigurasi); labelled + shown on Driver Operations / Petty Cash.
 */
function updateFabCta(resolved = resolvePrimaryCta()) {
  const fabAdd   = document.getElementById('fabAdd');
  const fabLabel = document.getElementById('fabLabel');
  if (!fabAdd) return;
  if (resolved) {
    fabAdd.style.display = 'flex';
    if (fabLabel) fabLabel.textContent = resolved.label;
  } else {
    fabAdd.style.display = 'none';
  }
}

/**
 * v1.14.1: Module-aware panel primary CTA — now driven by resolvePrimaryCta().
 * Called on module switch (setRailModule) and on auth/data refresh
 * (updatePermissionUI), so role + active module stay in sync. Keeps the mobile
 * FAB in lockstep by routing it through the same resolver.
 */
function updatePanelCta() {
  const resolved = resolvePrimaryCta();

  // Desktop context-panel CTA buttons.
  const cta      = document.getElementById('v2PanelCta');
  const btnJadwal = document.getElementById('v2BtnTambahJadwal');
  const btnAjukan = document.getElementById('v2BtnAjukanRequest');
  const btnPc     = document.getElementById('v2BtnTambahPengeluaran');
  if (cta) {
    if (btnJadwal) btnJadwal.style.display = (resolved && resolved.kind === 'jadwal')      ? 'flex' : 'none';
    if (btnAjukan) btnAjukan.style.display = (resolved && resolved.kind === 'ajukan')      ? 'flex' : 'none';
    if (btnPc)     btnPc.style.display     = (resolved && resolved.kind === 'pengeluaran') ? 'flex' : 'none';
    cta.style.display = resolved ? 'flex' : 'none';
  }

  // Mobile FAB — same resolver, no duplicated mapping.
  updateFabCta(resolved);
}

/**
 * Switch the active rail module: highlight its rail item, reveal its panel-nav
 * block, set the panel header + breadcrumb, and run its default landing menu.
 * @param {'driverops'|'pettycash'|'analytics'|'konfigurasi'|'administration'} name
 */
function setRailModule(name) {
  // 'administration' is no longer a visible module — fold legacy callers into
  // Konfigurasi (which now owns user management + global config).
  if (name === 'administration') name = 'konfigurasi';
  const def = MODULE_DEFS[name];
  if (!def) return;
  activeRailModule = name;

  // Rail item active state — only one module highlighted at a time.
  Object.values(MODULE_DEFS).forEach(d => {
    const item = document.getElementById(d.railId);
    if (item) {
      const on = d === def;
      item.classList.toggle('v2-rail-item--active', on);
      item.setAttribute('aria-current', String(on));
    }
  });

  // Panel-nav block visibility — show only the active module's menu.
  ['v2PanelDriverOpsNav', 'v2PanelPettyCashNav', 'v2PanelAnalyticsNav', 'v2PanelKonfigurasiNav']
    .forEach(id => { const el = document.getElementById(id); if (el) el.style.display = (id === def.navId) ? '' : 'none'; });

  const panelTitle    = document.getElementById('v2PanelTitle');
  const panelSubtitle = document.getElementById('v2PanelSubtitle');
  if (panelTitle)    panelTitle.textContent    = def.title;
  if (panelSubtitle) panelSubtitle.textContent = def.subtitle;

  // Module-aware primary CTA (v1.14.1) — also re-syncs the mobile FAB (v1.15.2).
  updatePanelCta();

  // Land on the module's default menu.
  def.land();
  syncV2ResponsiveNavReuse();
}

/* ──────────────────────────────────────────────────────────────────
   Navigation routing layer (v1.14.0)

   One function per MENU item. Panel buttons, the mobile sidebar drawer and
   any mobile sub-nav all call these — single source of truth for routing.
   Each sets the active panel item, breadcrumb, workspace and any sub-state.
   ────────────────────────────────────────────────────────────────── */

/* ── MODUL: Driver Operations ── */
function navJadwalDriver() {
  setV2PanelNavActive('v2NavDashboard');
  setCrumb('DRIVER OPS', 'Jadwal Driver');
  setCurrentDate(getCurrentDate());
  setWorkspace('dashboard');
  renderViews();
  if (isDriver()) renderDriverDashboard();
}
function navPending() {
  setV2PanelNavActive('v2NavPending');
  setCrumb('DRIVER OPS', isAdmin() ? 'Pending — Antrian' : 'Pending — Riwayat');
  setWorkspace('pending');
}
function navJadwalSaya() {
  setV2PanelNavActive('v2NavJadwalSaya');
  setCrumb('DRIVER OPS', 'Jadwal Saya');
  setWorkspace('dashboard');
  setTimeout(() => document.getElementById('driverDashboard')?.scrollIntoView({ behavior: 'smooth' }), 50);
}
function navManajemenDriver() {
  activeAdminModule = 'driverops';
  activeAdminSection = 'drivers';
  setV2PanelNavActive('v2NavMasterDrivers');
  setCrumb('DRIVER OPS', 'Manajemen Driver');
  setWorkspace('administration');
}
function navManajemenKendaraan() {
  activeAdminModule = 'driverops';
  activeAdminSection = 'vehicles';
  vehicleView = 'inventory'; // land on the inventory view; re-renders keep the active view
  setV2PanelNavActive('v2NavMasterVehicles');
  setCrumb('DRIVER OPS', 'Manajemen Kendaraan');
  setWorkspace('administration');
}
function navAuditDriver() {
  activeAdminModule = 'driverops';
  activeAdminSection = 'audit';
  auditCategoryFilter = 'drivers';
  const sel = document.getElementById('v2AuditCategoryFilter');
  if (sel) sel.value = 'drivers';
  setV2PanelNavActive('v2NavAuditDriver');
  setCrumb('DRIVER OPS', 'Audit Driver');
  setWorkspace('administration');
}
function navAuditKendaraan() {
  activeAdminModule = 'driverops';
  activeAdminSection = 'audit';
  auditCategoryFilter = 'vehicles';
  const sel = document.getElementById('v2AuditCategoryFilter');
  if (sel) sel.value = 'vehicles';
  setV2PanelNavActive('v2NavAuditVehicle');
  setCrumb('DRIVER OPS', 'Audit Kendaraan');
  setWorkspace('administration');
}

/* ── MODUL: Petty Cash Center ── (embedded native module) */
async function navPettyCash(screen, navId) {
  setCrumb('PETTY CASH', PC_MENU_TITLES[screen] || 'Petty Cash Center');
  if (navId) setV2PanelNavActive(navId);
  setWorkspace('pettycash');
  if (!pettyCashMounted) {
    pettyCashMounted = true;
    await mountPettyCash(document.getElementById('v2PettyCashWorkspace'));
  }
  setPettyCashScreen(screen);
}
const PC_MENU_TITLES = {
  dashboard: 'Dashboard', expenses: 'Pengeluaran', norGenerate: 'Generate NOR',
  norHistory: 'Riwayat NOR', settings: 'Pengaturan',
};

/* ── MODUL: Analytics ── */
function navAnalyticsDriver() {
  activeAdminModule = 'analytics';
  activeAdminSection = 'analytics';
  setV2PanelNavActive('v2NavAnalyticsDriver');
  setCrumb('ANALYTICS', 'Analytics Driver');
  setWorkspace('administration');
}
async function navAnalyticsPettyCash() {
  setV2PanelNavActive('v2NavAnalyticsPetty');
  setCrumb('ANALYTICS', 'Analytics Petty Cash');
  setWorkspace('analyticsPetty');
  analyticsPettyMounted = true;
  await mountAnalyticsPettyCash(document.getElementById('v2AnalyticsPettyWorkspace'));
}
/* v1.18.8 — "Analytics Executive" is repointed to the new Executive Analytics
   Dashboard (the platform's executive home page), rendered as a SIBLING admin
   section in the Analytics module — exactly like Dispatch Analytics, Recommendation
   Accuracy, and Driver Wellness. The legacy combined driver+petty executive view
   (analyticsExec workspace / analytics-executive-view.js) is retired from
   navigation; its Operational Health Score ENGINE (computeExecutiveAnalytics) is
   reused by the new dashboard. */
function navAnalyticsExecutive() {
  activeAdminModule = 'analytics';
  activeAdminSection = 'executive';
  setV2PanelNavActive('v2NavAnalyticsGabungan');
  setCrumb('ANALYTICS', 'Executive Analytics');
  setWorkspace('administration');
}

/* v1.17.6.1 Analytics Navigation Integration — desktop panel entry points for
   the Dispatch Intelligence sections (Dispatch Analytics, Recommendation
   Accuracy, Driver Wellness). They REUSE the exact navAnalyticsDriver pattern:
   set the analytics module + the target admin section, then render the shared
   administration workspace (setWorkspace('administration') → renderV2AdminWorkspace
   → the section's existing render branch). No new section, render fn, or logic.
   v1.18.1: Recommendation Accuracy is now its OWN render page/section
   (activeAdminSection='recommendationaccuracy') instead of an anchor-scroll
   inside Dispatch Analytics — each Analytics surface is independently rendered. */
function navDispatchAnalytics() {
  activeAdminModule = 'analytics';
  activeAdminSection = 'dispatchanalytics';
  setV2PanelNavActive('v2NavDispatchAnalytics');
  setCrumb('ANALYTICS', 'Dispatch Analytics');
  setWorkspace('administration');
}
function navRecommendationAccuracy() {
  activeAdminModule = 'analytics';
  activeAdminSection = 'recommendationaccuracy'; // v1.18.1 — its own render page (no anchor scroll)
  setV2PanelNavActive('v2NavRecommendationAccuracy');
  setCrumb('ANALYTICS', 'Recommendation Accuracy');
  setWorkspace('administration');
}
function navDriverWellness() {
  activeAdminModule = 'analytics';
  activeAdminSection = 'wellness';
  setV2PanelNavActive('v2NavDriverWellness');
  setCrumb('ANALYTICS', 'Driver Wellness');
  setWorkspace('administration');
}
// v1.19.4 — Driver Prediction sibling section (Analytics module). Same pattern
// as its siblings; the render layer consumes ONLY the Prediction Service.
function navDriverPrediction() {
  activeAdminModule = 'analytics';
  activeAdminSection = 'prediction';
  setV2PanelNavActive('v2NavDriverPrediction');
  setCrumb('ANALYTICS', 'Driver Prediction');
  setWorkspace('administration');
}

/* ── MODUL: Konfigurasi ── */
function navManajemenUser() {
  activeAdminModule = 'konfigurasi';
  activeAdminSection = 'users';
  setV2PanelNavActive('v2NavKonfUsers');
  setCrumb('KONFIGURASI', 'Manajemen User');
  setWorkspace('administration');
}
function navKonfigurasiGlobal() {
  activeAdminModule = 'konfigurasi';
  activeAdminSection = 'config';
  setV2PanelNavActive('v2NavKonfGlobal');
  setCrumb('KONFIGURASI', 'Konfigurasi Global');
  setWorkspace('administration');
}

/** Render a "coming soon" placeholder into the shared placeholder workspace. */
function showModulePlaceholder(title, message) {
  setWorkspace('placeholder');
  const el = document.getElementById('v2PlaceholderWorkspace');
  if (!el) return;
  el.innerHTML = `
    <div class="v2-module-placeholder">
      <div class="v2-module-placeholder-card">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"
             stroke-linecap="round" stroke-linejoin="round" width="40" height="40" aria-hidden="true">
          <path d="M3 3v18h18"/><path d="M7 14l3-3 3 3 5-6"/>
        </svg>
        <h2 class="v2-module-placeholder-title">${esc(title)}</h2>
        <p class="v2-module-placeholder-text">${esc(message)}</p>
      </div>
    </div>`;
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

      <!-- Petty Cash Center — admin only; shown by updatePermissionUI() (v1.13.2) -->
      <div class="v2-rail-item" id="v2RailPettyCash"
           role="button" tabindex="0"
           aria-label="Petty Cash Center" aria-current="false" style="display:none;">
        <svg class="v2-rail-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M19 7V5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>
          <path d="M21 7H8a2 2 0 0 0 0 4h13a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1z"/>
          <circle cx="17.5" cy="9" r="1" fill="currentColor"/>
        </svg>
        <div class="v2-rail-tooltip" aria-hidden="true">Petty Cash Center</div>
      </div>

      <!-- Analytics — admin only; shown by updatePermissionUI() (v1.14.0) -->
      <div class="v2-rail-item" id="v2RailAnalytics"
           role="button" tabindex="0"
           aria-label="Analytics" aria-current="false" style="display:none;">
        <svg class="v2-rail-icon" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z"/>
        </svg>
        <div class="v2-rail-tooltip" aria-hidden="true">Analytics</div>
      </div>

      <!-- Konfigurasi — admin only; shown by updatePermissionUI() (v1.14.0) -->
      <div class="v2-rail-item" id="v2RailKonfigurasi"
           role="button" tabindex="0"
           aria-label="Konfigurasi" aria-current="false" style="display:none;">
        <svg class="v2-rail-icon" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fill-rule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clip-rule="evenodd"/>
        </svg>
        <div class="v2-rail-tooltip" aria-hidden="true">Konfigurasi</div>
      </div>

      <!-- Administration — RETIRED from navigation (v1.14.0). Element kept in
           the DOM for rollback compatibility but permanently hidden; no module
           activates it. Its content lives under Driver Operations / Konfigurasi
           / Analytics now. -->
      <div class="v2-rail-item" id="v2RailAdmin"
           role="button" tabindex="-1" aria-hidden="true"
           aria-label="Administration" aria-current="false" style="display:none !important;">
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

  const crest       = document.getElementById('v2RailCrest');
  const driverOps   = document.getElementById('v2RailDriverOps');
  const railPetty   = document.getElementById('v2RailPettyCash');
  const railAnalytics = document.getElementById('v2RailAnalytics');
  const railKonfig  = document.getElementById('v2RailKonfigurasi');
  const railTheme   = document.getElementById('v2RailThemeBtn');

  crest?.addEventListener('click', () => {
    document.querySelector('.main-content')?.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // ── Rail MODULE switching (v1.14.0) ──
  driverOps?.addEventListener('click', () => setRailModule('driverops'));
  railPetty?.addEventListener('click', () => setRailModule('pettycash'));
  railAnalytics?.addEventListener('click', () => setRailModule('analytics'));
  railKonfig?.addEventListener('click', () => setRailModule('konfigurasi'));

  // Mobile (rail hidden <768px): repointed sidebar drawer buttons are the
  // module entry points. Sidebar auto-closes on .sidebar-nav-item click.
  document.getElementById('btnUserMgmt')?.addEventListener('click', () => setRailModule('konfigurasi'));
  document.getElementById('btnPettyCash')?.addEventListener('click', () => setRailModule('pettycash'));
  document.getElementById('btnAnalytics')?.addEventListener('click', () => setRailModule('analytics'));

  railTheme?.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    applyTheme(current === 'dark' ? 'light' : 'dark', true);
  });

  // Theme hook retained for any module that delegates to the app-wide theme
  // (single source of truth).
  window.__pbsiToggleTheme = () => {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    applyTheme(current === 'dark' ? 'light' : 'dark', true);
  };

  // Keyboard: Enter/Space activates any focusable rail element
  [crest, driverOps, railPetty, railAnalytics, railKonfig].forEach(el => {
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
      <!-- Petty Cash primary CTA (v1.14.1) — shown only when the Petty Cash module is active -->
      <button class="v2-panel-btn v2-panel-btn--primary" id="v2BtnTambahPengeluaran" type="button" style="display:none;">
        <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14" aria-hidden="true">
          <path d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"/>
        </svg>
        Tambah Pengeluaran
      </button>
    </div>

    <!-- ═══ MODUL: Driver Operations ═══ -->
    <nav class="v2-panel-nav v2-panel-nav--driverops" id="v2PanelDriverOpsNav"
         aria-label="Driver Operations menu">

      <div class="v2-panel-section">Operasional</div>

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

      <!-- Master Data + Audit: admin only — toggled by updatePermissionUI() -->
      <div id="v2PanelDriverMaster" style="display:none;">
        <div class="v2-panel-section">Master Data</div>
        <button class="v2-panel-nav-item" id="v2NavMasterDrivers" type="button">
          <svg class="v2-panel-nav-icon" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z"/>
          </svg>
          Manajemen Driver
        </button>
        <button class="v2-panel-nav-item" id="v2NavMasterVehicles" type="button">
          <svg class="v2-panel-nav-icon" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path d="M4 4a2 2 0 00-2 2v6a2 2 0 002 2h1a2 2 0 104 0h2a2 2 0 104 0 2 2 0 002-2V8a2 2 0 00-.586-1.414l-2-2A2 2 0 0014 4H4zm9 2.586L14.414 8H13V6.586zM6 15a1 1 0 110-2 1 1 0 010 2zm8 0a1 1 0 110-2 1 1 0 010 2z"/>
          </svg>
          Manajemen Kendaraan
        </button>
      </div>

      <div id="v2PanelDriverAudit" style="display:none;">
        <div class="v2-panel-section">Audit</div>
        <button class="v2-panel-nav-item" id="v2NavAuditDriver" type="button">
          <svg class="v2-panel-nav-icon" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fill-rule="evenodd" d="M6 2a2 2 0 00-2 2v12a2 2 0 002 2h8a2 2 0 002-2V4a2 2 0 00-2-2H6zm1 5a1 1 0 011-1h4a1 1 0 110 2H8a1 1 0 01-1-1zm1 3a1 1 0 100 2h3a1 1 0 100-2H8z" clip-rule="evenodd"/>
          </svg>
          Audit Driver
        </button>
        <button class="v2-panel-nav-item" id="v2NavAuditVehicle" type="button">
          <svg class="v2-panel-nav-icon" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fill-rule="evenodd" d="M6 2a2 2 0 00-2 2v12a2 2 0 002 2h8a2 2 0 002-2V4a2 2 0 00-2-2H6zm1 5a1 1 0 011-1h4a1 1 0 110 2H8a1 1 0 01-1-1zm1 3a1 1 0 100 2h3a1 1 0 100-2H8z" clip-rule="evenodd"/>
          </svg>
          Audit Kendaraan
        </button>
      </div>

    </nav>

    <!-- ═══ MODUL: Petty Cash Center ═══ (admin only) -->
    <nav class="v2-panel-nav v2-panel-nav--pettycash" id="v2PanelPettyCashNav"
         aria-label="Petty Cash Center menu" style="display:none;">
      <button class="v2-panel-nav-item v2-panel-nav-item--active" id="v2NavPcDashboard" type="button">
        <svg class="v2-panel-nav-icon" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M3 4a1 1 0 011-1h5a1 1 0 011 1v5a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM11 4a1 1 0 011-1h4a1 1 0 011 1v2a1 1 0 01-1 1h-4a1 1 0 01-1-1V4zM11 10a1 1 0 011-1h4a1 1 0 011 1v6a1 1 0 01-1 1h-4a1 1 0 01-1-1v-6zM3 13a1 1 0 011-1h5a1 1 0 011 1v3a1 1 0 01-1 1H4a1 1 0 01-1-1v-3z"/></svg>
        Dashboard
      </button>
      <button class="v2-panel-nav-item" id="v2NavPcExpenses" type="button">
        <svg class="v2-panel-nav-icon" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M3 5a2 2 0 012-2h10a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V5zm3 2a1 1 0 000 2h8a1 1 0 100-2H6zm0 3a1 1 0 100 2h8a1 1 0 100-2H6zm0 3a1 1 0 100 2h4a1 1 0 100-2H6z" clip-rule="evenodd"/></svg>
        Pengeluaran
      </button>
      <button class="v2-panel-nav-item" id="v2NavPcNorGenerate" type="button">
        <svg class="v2-panel-nav-icon" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h4a1 1 0 100-2H7z" clip-rule="evenodd"/></svg>
        Generate NOR
      </button>
      <button class="v2-panel-nav-item" id="v2NavPcNorHistory" type="button">
        <svg class="v2-panel-nav-icon" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clip-rule="evenodd"/></svg>
        Riwayat NOR
      </button>
      <button class="v2-panel-nav-item" id="v2NavPcSettings" type="button">
        <svg class="v2-panel-nav-icon" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clip-rule="evenodd"/></svg>
        Pengaturan
      </button>
    </nav>

    <!-- ═══ MODUL: Analytics ═══ (admin only) -->
    <nav class="v2-panel-nav v2-panel-nav--analytics" id="v2PanelAnalyticsNav"
         aria-label="Analytics menu" style="display:none;">
      <button class="v2-panel-nav-item v2-panel-nav-item--active" id="v2NavAnalyticsDriver" type="button">
        <svg class="v2-panel-nav-icon" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z"/></svg>
        Analytics Driver
      </button>
      <!-- v1.17.6.1 Analytics Navigation Integration — desktop panel entries for
           the Dispatch Intelligence sections that were previously reachable only
           from the mobile-only in-content tab strip (.v2-admin-nav). Reuses the
           existing nav-item style + an already-used bar-chart icon. -->
      <button class="v2-panel-nav-item" id="v2NavDispatchAnalytics" type="button">
        <svg class="v2-panel-nav-icon" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z"/></svg>
        Dispatch Analytics
      </button>
      <button class="v2-panel-nav-item" id="v2NavRecommendationAccuracy" type="button">
        <svg class="v2-panel-nav-icon" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z"/></svg>
        Recommendation Accuracy
      </button>
      <button class="v2-panel-nav-item" id="v2NavDriverWellness" type="button">
        <svg class="v2-panel-nav-icon" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z"/></svg>
        Driver Wellness
      </button>
      <button class="v2-panel-nav-item" id="v2NavDriverPrediction" type="button">
        <svg class="v2-panel-nav-icon" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M3.293 9.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l3.293 3.293 4.293-4.293a1 1 0 111.414 1.414l-5 5a1 1 0 01-1.414 0L8 6.414l-3.293 3.293a1 1 0 01-1.414 0zM3 13a1 1 0 011-1h12a1 1 0 011 1v3a1 1 0 01-1 1H4a1 1 0 01-1-1v-3z" clip-rule="evenodd"/></svg>
        Driver Prediction
      </button>
      <button class="v2-panel-nav-item" id="v2NavAnalyticsPetty" type="button">
        <svg class="v2-panel-nav-icon" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clip-rule="evenodd"/></svg>
        Analytics Petty Cash
      </button>
      <button class="v2-panel-nav-item" id="v2NavAnalyticsGabungan" type="button">
        <svg class="v2-panel-nav-icon" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M5 3a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2V5a2 2 0 00-2-2H5zm2.5 9a1.5 1.5 0 100-3 1.5 1.5 0 000 3zm5 0a1.5 1.5 0 100-3 1.5 1.5 0 000 3z"/></svg>
        Executive Analytics
      </button>
    </nav>

    <!-- ═══ MODUL: Konfigurasi ═══ (admin only) -->
    <nav class="v2-panel-nav v2-panel-nav--konfigurasi" id="v2PanelKonfigurasiNav"
         aria-label="Konfigurasi menu" style="display:none;">
      <button class="v2-panel-nav-item v2-panel-nav-item--active" id="v2NavKonfUsers" type="button">
        <svg class="v2-panel-nav-icon" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z"/>
        </svg>
        Manajemen User
      </button>
      <button class="v2-panel-nav-item" id="v2NavKonfGlobal" type="button">
        <svg class="v2-panel-nav-icon" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clip-rule="evenodd"/></svg>
        Konfigurasi Global
      </button>
    </nav>

    <!-- Legacy Administration nav — retired from navigation (hidden), kept for
         rollback compatibility. No rail entry activates this block. -->
    <nav class="v2-panel-nav v2-panel-nav--admin" id="v2PanelAdminNav"
         aria-label="Administration menu" style="display:none;" hidden>
      <button class="v2-panel-nav-item" id="v2NavAdminUsers" type="button">
        <svg class="v2-panel-nav-icon" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z"/>
        </svg>
        Administration Workspace
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
    <button class="v2-panel-footer-logout-direct" id="v2FooterLogoutDirect" type="button" style="display:none;">
      <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14" aria-hidden="true">
        <path fill-rule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 102 0V4a1 1 0 00-1-1zm10.293 9.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L14.586 9H7a1 1 0 100 2h7.586l-1.293 1.293z" clip-rule="evenodd"/>
      </svg>
      Keluar
    </button>

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

  // Tambah Pengeluaran (v1.14.1): Petty Cash primary CTA → open the add-expense
  // modal. Ensure the module is mounted/active first (covers a direct click).
  document.getElementById('v2BtnTambahPengeluaran')?.addEventListener('click', async () => {
    if (!isAdmin()) return;
    if (activeRailModule !== 'pettycash') await navPettyCash('dashboard', 'v2NavPcDashboard');
    openPettyCashAddExpense();
  });

  // ── Panel MENU handlers — all delegate to the v1.14.0 routing layer ──
  // MODUL Driver Operations
  document.getElementById('v2NavDashboard')?.addEventListener('click', navJadwalDriver);
  document.getElementById('v2NavPending')?.addEventListener('click', navPending);
  document.getElementById('v2NavJadwalSaya')?.addEventListener('click', navJadwalSaya);
  document.getElementById('v2NavMasterDrivers')?.addEventListener('click', navManajemenDriver);
  document.getElementById('v2NavMasterVehicles')?.addEventListener('click', navManajemenKendaraan);
  document.getElementById('v2NavAuditDriver')?.addEventListener('click', navAuditDriver);
  document.getElementById('v2NavAuditVehicle')?.addEventListener('click', navAuditKendaraan);

  // MODUL Petty Cash Center
  document.getElementById('v2NavPcDashboard')?.addEventListener('click', () => navPettyCash('dashboard', 'v2NavPcDashboard'));
  document.getElementById('v2NavPcExpenses')?.addEventListener('click', () => navPettyCash('expenses', 'v2NavPcExpenses'));
  document.getElementById('v2NavPcNorGenerate')?.addEventListener('click', () => navPettyCash('norGenerate', 'v2NavPcNorGenerate'));
  document.getElementById('v2NavPcNorHistory')?.addEventListener('click', () => navPettyCash('norHistory', 'v2NavPcNorHistory'));
  document.getElementById('v2NavPcSettings')?.addEventListener('click', () => navPettyCash('settings', 'v2NavPcSettings'));

  // MODUL Analytics
  document.getElementById('v2NavAnalyticsDriver')?.addEventListener('click', navAnalyticsDriver);
  // v1.17.6.1 Analytics Navigation Integration — desktop entries for the Dispatch
  // Intelligence sections (previously reachable only from the mobile tab strip).
  document.getElementById('v2NavDispatchAnalytics')?.addEventListener('click', navDispatchAnalytics);
  document.getElementById('v2NavRecommendationAccuracy')?.addEventListener('click', navRecommendationAccuracy);
  document.getElementById('v2NavDriverWellness')?.addEventListener('click', navDriverWellness);
  document.getElementById('v2NavDriverPrediction')?.addEventListener('click', navDriverPrediction);
  document.getElementById('v2NavAnalyticsPetty')?.addEventListener('click', navAnalyticsPettyCash);
  document.getElementById('v2NavAnalyticsGabungan')?.addEventListener('click', navAnalyticsExecutive);

  // MODUL Konfigurasi
  document.getElementById('v2NavKonfUsers')?.addEventListener('click', navManajemenUser);
  document.getElementById('v2NavKonfGlobal')?.addEventListener('click', navKonfigurasiGlobal);

  // Legacy Administration entry (hidden) — kept wired for rollback safety.
  document.getElementById('v2NavAdminUsers')?.addEventListener('click', navManajemenUser);

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

  document.getElementById('v2FooterLogoutDirect')?.addEventListener('click', () => {
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
      <span class="v2-kpi-label" data-short="Aktif">Trip Aktif</span>
      <span class="v2-kpi-value" id="v2KpiTripAktif" aria-live="polite">—</span>
      <span class="v2-kpi-sub">Sedang berlangsung</span>
    </div>
    <div class="v2-kpi-card" data-kpi="bertugas">
      <div class="v2-kpi-icon" aria-hidden="true">
        <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
          <path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd"/>
        </svg>
      </div>
      <span class="v2-kpi-label" data-short="Driver">Driver Bertugas</span>
      <span class="v2-kpi-value" id="v2KpiDriverBertugas" aria-live="polite">—</span>
      <span class="v2-kpi-sub">Sedang ditugaskan</span>
    </div>
    <div class="v2-kpi-card" data-kpi="menunggu">
      <div class="v2-kpi-icon" aria-hidden="true">
        <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clip-rule="evenodd"/>
        </svg>
      </div>
      <span class="v2-kpi-label" data-short="Pending">Menunggu Approval</span>
      <span class="v2-kpi-value" id="v2KpiMenunggu" aria-live="polite">—</span>
      <span class="v2-kpi-sub">Perlu ditinjau</span>
    </div>
    <div class="v2-kpi-card" data-kpi="selesai">
      <div class="v2-kpi-icon" aria-hidden="true">
        <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
        </svg>
      </div>
      <span class="v2-kpi-label" data-short="Selesai">Selesai Hari Ini</span>
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
  const vehicle     = esc(vehicleLabel(a.vehicle));   // v1.15.6: '' → "Tanpa Kendaraan"
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
  const _wStart = getSetting('operations.workStartMins');
  const _wEnd   = getSetting('operations.workEndMins');
  const _wHours = Math.round((_wEnd - _wStart) / 60);
  const _fmt = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  tlSub.textContent = `${_wHours} jam • ${_fmt(_wStart)}–${_fmt(_wEnd)}`;
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
  // Cancelled assignments are terminal — they drop off the active schedule board,
  // KPI strip, and list view (they no longer occupy capacity). Records are retained
  // in the master `assignments` array for audit, history, and analytics.
  const active = assignments.filter(a => a.status !== 'cancelled');
  if (!searchQuery) return active;
  const q = searchQuery.toLowerCase();
  return active.filter(a =>
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
  const isPc    = name === 'pettycash';
  const isPh    = name === 'placeholder';
  const isAnPc  = name === 'analyticsPetty';
  const isAnEx  = name === 'analyticsExec';

  const timelineSurface = document.getElementById('v2TimelineSurface');
  const driverDash      = document.getElementById('driverDashboard');
  const pendingWs       = document.getElementById('v2PendingWorkspace');
  const adminWs         = document.getElementById('v2AdministrationWorkspace');
  const pcWs            = document.getElementById('v2PettyCashWorkspace');
  const phWs            = document.getElementById('v2PlaceholderWorkspace');
  const anPcWs          = document.getElementById('v2AnalyticsPettyWorkspace');
  const anExWs          = document.getElementById('v2AnalyticsExecWorkspace');

  if (timelineSurface) timelineSurface.style.display = isDash ? ''      : 'none';
  if (driverDash)      driverDash.style.display      = isDash && isDriver() ? 'block' : 'none';
  if (pendingWs)       pendingWs.style.display       = isPend  ? 'block' : 'none';
  if (adminWs)         adminWs.style.display         = isAdmWs ? 'block' : 'none';
  if (pcWs)            pcWs.style.display            = isPc    ? 'block' : 'none';
  if (phWs)            phWs.style.display            = isPh    ? 'block' : 'none';
  if (anPcWs)          anPcWs.style.display          = isAnPc  ? 'block' : 'none';
  if (anExWs)          anExWs.style.display          = isAnEx  ? 'block' : 'none';

  // Pause the embedded Petty Cash module's live re-render when it is hidden;
  // navPettyCash()/setPettyCashScreen() resume it on return.
  if (!isPc && pettyCashMounted) closePettyCashCenter();
  // Pause the new Analytics workspaces' live re-render when hidden, and force a
  // fresh recompute whenever one becomes visible — so a data change made while it
  // was hidden (e.g. a NOR Official↔Test convert) is always reflected without a
  // page refresh, on every show path (desktop panel-nav + shared mobile sub-nav).
  if (!isAnPc && analyticsPettyMounted) closeAnalyticsPettyCash();
  if (!isAnEx && analyticsExecMounted) closeAnalyticsExecutive();
  if (isAnPc && analyticsPettyMounted) refreshAnalyticsPettyCash();
  if (isAnEx && analyticsExecMounted) refreshAnalyticsExecutive();

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

  // Keep the mobile Analytics sub-nav in lockstep with the active screen.
  syncAnalyticsMobileNav();
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
                data-action="approve-direct" data-id="${esc(r.id)}" type="button">Setujui Sesuai Rekomendasi</button>
        <button class="v2-pending-btn v2-pending-btn--edit"
                data-action="approve-edit" data-id="${esc(r.id)}" type="button">Edit &amp; Setujui</button>
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
          <div class="v2-pending-field v2-pending-field--full">
            <span class="v2-pending-label">Rekomendasi Dispatch</span>
            <span class="v2-pending-value">${r.recommendedDriver
              ? `${esc(r.recommendedDriver)} · ${esc(r.recommendedVehicle)} · skor ${esc(String(r.dispatchScore || 0))}`
              : (r.driver ? `${esc(r.driver)} · ${esc(r.vehicle || '—')}` : 'Tidak ada rekomendasi')}</span>
          </div>
          ${r.recommendation && r.recommendation.availabilitySummary ? `<div class="v2-pending-field v2-pending-field--full"><span class="v2-pending-label">Ketersediaan</span><span class="v2-pending-value">${esc(r.recommendation.availabilitySummary)}</span></div>` : ''}
          <div class="v2-pending-field">
            <span class="v2-pending-label">Penumpang</span>
            <span class="v2-pending-value">${esc(String(r.pax || 0))}</span>
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
      if (btn.dataset.action === 'approve-direct') handleRequestApproveDirect(btn.dataset.id);
      else if (btn.dataset.action === 'approve-edit') handleRequestApproveEdit(btn.dataset.id);
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
 * v1.14.0: Inject the embedded Petty Cash module host (#v2PettyCashWorkspace).
 * Carries class .pc-root so the module's scoped design tokens resolve. The
 * module mounts lazily into this container on first navigation (navPettyCash).
 */
function initV2PettyCashWorkspace() {
  const ws = document.createElement('div');
  ws.id = 'v2PettyCashWorkspace';
  ws.className = 'v2-workspace pc-root';
  ws.style.display = 'none';
  document.querySelector('.main-content')?.appendChild(ws);
  console.log('[v1.14.0] Petty Cash workspace host injected');
}

/**
 * v1.14.0: Inject a shared placeholder workspace used by "coming soon" menus.
 * Content is set by showModulePlaceholder().
 */
function initV2PlaceholderWorkspace() {
  const ws = document.createElement('div');
  ws.id = 'v2PlaceholderWorkspace';
  ws.className = 'v2-workspace';
  ws.style.display = 'none';
  document.querySelector('.main-content')?.appendChild(ws);
  console.log('[v1.14.0] Placeholder workspace injected');
}

/**
 * v1.15.0: Inject the two new Analytics workspace hosts (Petty Cash + Executive).
 * Each carries the .v2-analytics-claude scope so the Analytics design tokens
 * resolve, and is mounted lazily on first navigation.
 */
function initV2AnalyticsWorkspaces() {
  ['v2AnalyticsPettyWorkspace', 'v2AnalyticsExecWorkspace'].forEach(id => {
    const ws = document.createElement('div');
    ws.id = id;
    ws.className = 'v2-workspace';
    ws.style.display = 'none';
    document.querySelector('.main-content')?.appendChild(ws);
  });
  console.log('[v1.15.0] Analytics Petty Cash + Executive workspaces injected');
}

/* ──────────────────────────────────────────────────────────────────
   v1.15.2 — Mobile Analytics sub-nav

   On mobile (<768px) the desktop rail + context panel are hidden, so the
   panel's three Analytics menu buttons (Driver / Petty Cash / Executive)
   are unreachable. The in-content admin tab strip only covers Analytics
   Driver (the lone admin section), leaving Petty Cash + Executive — which
   live in their own lazily-mounted workspaces — with NO mobile entry point.

   This injects a single, module-level segmented strip that gives mobile
   users parity. It is presentation only: each tab delegates to the SAME
   nav* routing function the desktop panel uses (no duplicated business
   logic). Mirrors the .v2-admin-nav pattern — hidden on desktop (the panel
   navigates), shown on mobile only when the Analytics module is active. */
function initV2AnalyticsMobileNav() {
  const mainContent = document.querySelector('.main-content');
  if (!mainContent) return;
  const nav = document.createElement('nav');
  nav.id = 'v2AnalyticsMobileNav';
  nav.className = 'v2-admin-nav v2-an-mnav';
  nav.setAttribute('aria-label', 'Analytics');
  nav.style.display = 'none';
  nav.innerHTML = `
    <button type="button" class="v2-admin-nav-tab" data-analytics-mnav="driver"><span class="v2-admin-nav-tab-label">Driver</span></button>
    <button type="button" class="v2-admin-nav-tab" data-analytics-mnav="petty"><span class="v2-admin-nav-tab-label">Petty Cash</span></button>
    <button type="button" class="v2-admin-nav-tab" data-analytics-mnav="exec"><span class="v2-admin-nav-tab-label">Executive</span></button>
  `;
  // First child so it sits above whichever Analytics workspace is visible
  // (the KPI strip / timeline / dashboard are all hidden on Analytics screens).
  mainContent.insertBefore(nav, mainContent.firstChild);

  nav.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-analytics-mnav]');
    if (!btn) return;
    const key = btn.dataset.analyticsMnav;
    if (key === 'driver')      navAnalyticsDriver();
    else if (key === 'petty')  navAnalyticsPettyCash();
    else if (key === 'exec')   navAnalyticsExecutive();
  });
  console.log('[v1.15.2] Analytics mobile sub-nav injected');
}

/**
 * Sync the mobile Analytics sub-nav: shown only while the Analytics module is
 * active (CSS keeps it mobile-only), with the tab matching the active screen.
 * Called from setWorkspace() so every entry path (desktop panel, mobile drawer,
 * the strip itself) keeps it in lockstep.
 */
function syncAnalyticsMobileNav() {
  const nav = document.getElementById('v2AnalyticsMobileNav');
  if (!nav) return;
  const inAnalytics = activeRailModule === 'analytics';
  nav.style.display = inAnalytics ? 'flex' : 'none';
  if (!inAnalytics) return;
  let key = 'driver';
  if (currentWorkspace === 'analyticsPetty')     key = 'petty';
  // v1.18.8: Executive is now a sibling admin section (administration workspace),
  // not the retired analyticsExec workspace — detect it by the active section.
  else if (currentWorkspace === 'administration' && activeAdminSection === 'executive') key = 'exec';
  nav.querySelectorAll('[data-analytics-mnav]').forEach(btn => {
    btn.classList.toggle('v2-admin-nav-tab--active', btn.dataset.analyticsMnav === key);
  });
}

const V2_ROLE_CONFIG = [
  { key: 'admin',       label: 'ADMIN',       defaultExpanded: true,  visible: true  },
  { key: 'bidang',      label: 'BIDANG',       defaultExpanded: false, visible: true  },
  { key: 'driver',      label: 'DRIVER',       defaultExpanded: false, visible: true  },
  { key: 'viewer',      label: 'VIEWER',       defaultExpanded: false, visible: true  },
  { key: 'engineering', label: 'ENGINEERING',  defaultExpanded: false, visible: false },
];
const v2GroupExpanded = {};

/**
 * Wrap all native <select> elements with PBSI Select component.
 * Called once after initDriverSelect + initRequestHandlers have
 * populated dynamic option lists.
 */
function _initAllPbsiSelects() {
  [
    'fieldDriver', 'fieldVehicle',
    'requestFieldDriver', 'requestFieldVehicle',
    'userFieldRole', 'v2AdminRoleFilter',
  ].forEach(id => {
    const el = document.getElementById(id);
    if (el) initPbsiSelect(el);
  });
}

/**
 * Wrap the timeline filterDate input with PBSI Datepicker.
 * Form date fields (fieldDate, fieldEndDate, requestField*) are
 * initialized inside their respective initFormHandlers / initRequestHandlers.
 */
function _initAllPbsiDatepickers() {
  const filterDateEl = document.getElementById('filterDate');
  if (!filterDateEl) return;

  initPbsiDatepicker(filterDateEl, { presets: [] });

  // timeline.js sets filterDate.value directly without dispatching change events
  // (btnPrevDate, btnNextDate, btnToday). Sync PBSI display after each click.
  ['btnPrevDate', 'btnNextDate', 'btnToday'].forEach(id => {
    document.getElementById(id)?.addEventListener('click', () => {
      requestAnimationFrame(() => syncPbsiDatepicker(filterDateEl));
    });
  });
}

/**
 * Inject #v2AdministrationWorkspace into .main-content. Admin-only visibility.
 */
function initV2AdministrationWorkspace() {
  const ws = document.createElement('div');
  ws.id = 'v2AdministrationWorkspace';
  ws.className = 'v2-workspace';
  ws.style.display = 'none';

  const tabsHtml = ADMIN_SECTION_DEFS.map(section => `
      <button type="button" class="v2-admin-nav-tab${section.key === activeAdminSection ? ' v2-admin-nav-tab--active' : ''}"
              data-admin-section="${section.key}" role="tab">
        <span class="v2-admin-nav-tab-label">${esc(section.label)}</span>
      </button>
    `).join('');

  ws.innerHTML = `
    <div class="v2-admin-workspace-layout">
      <div class="v2-admin-page-header">
        <h1 class="v2-admin-page-title">Administration</h1>
        <p class="v2-admin-page-subtitle">Manajemen platform dan pengguna</p>
      </div>
      
      <div id="v2AdminOverviewRow" class="v2-admin-overview-row"></div>
      
      <nav class="v2-admin-nav" aria-label="Administrasi">
        ${tabsHtml}
      </nav>
      
      <div class="v2-admin-content">
        <div id="v2AdminSectionUsers">
          <div class="v2-admin-toolbar">
            <input type="search" id="v2AdminSearch" class="v2-admin-search"
                   placeholder="Cari nama atau username…" autocomplete="off" />
            <select id="v2AdminUserStatusFilter" class="v2-admin-filter">
              <option value="all">Semua Status</option>
              <option value="active">Aktif</option>
              <option value="inactive">Nonaktif</option>
              <option value="archived">Diarsipkan</option>
            </select>
            <select id="v2AdminRoleFilter" class="v2-admin-filter">
              <option value="">Semua Peran</option>
              <option value="admin">Admin</option>
              <option value="bidang">Bidang</option>
              <option value="driver">Driver</option>
              <option value="viewer">Viewer</option>
            </select>
            <button id="v2AdminAddUser" class="v2-admin-add-btn" type="button">+ Tambah User</button>
          </div>
          <div id="v2AdminStats"></div>
          <div id="v2AdminUserList" class="v2-admin-user-list"></div>
        </div>
        <div id="v2AdminSectionDrivers" style="display:none;">
          <div class="v2-admin-toolbar">
            <input type="search" id="v2AdminDriverSearch" class="v2-admin-search"
                   placeholder="Cari nama atau telepon driver…" autocomplete="off" />
            <select id="v2AdminDriverStatusFilter" class="v2-admin-filter">
              <option value="all">Semua Status</option>
              <option value="active">Aktif</option>
              <option value="leave">Cuti / Izin</option>
              <option value="inactive">Nonaktif</option>
              <option value="archived">Diarsipkan</option>
            </select>
            <button id="v2AdminAddDriver" class="v2-admin-add-btn" type="button">+ Tambah Driver</button>
          </div>
          <div id="v2AdminDriverStats"></div>
          <div id="v2AdminDriverList" class="v2-admin-user-list"></div>
        </div>
        <div id="v2AdminSectionVehicles" class="exec-ui v2-analytics-claude" style="display:none;">
          <div class="v2-analytics-tabs" id="v2VehicleViewTabs" role="tablist" aria-label="Tampilan Manajemen Kendaraan">
            <button type="button" class="v2-analytics-tab is-active" data-vehicle-view="inventory" role="tab" aria-selected="true">${anIcon('vehicle-car', { size: 14 })}<span>Inventaris</span></button>
            <button type="button" class="v2-analytics-tab" data-vehicle-view="prediction" role="tab" aria-selected="false">${anIcon('pulse', { size: 14 })}<span>Prediksi</span></button>
          </div>
          <div id="v2VehicleInventoryView">
          <div id="v2FleetDashboard"></div>
          <div class="exec-head">
            <div class="exec-head__l">
              <h2 class="exec-head__title">Inventaris Kendaraan</h2>
              <p class="exec-head__sub">Kelola seluruh aset kendaraan. Klik kartu untuk membuka detail dan tindakan.</p>
            </div>
          </div>
          <div class="exec-toolbar">
            <div class="exec-toolbar__l">
              <div class="exec-search">
                <span class="exec-search__ico" aria-hidden="true">${anIcon('search', { size: 14 })}</span>
                <input type="search" id="v2AdminVehicleSearch" class="exec-search__input"
                       placeholder="Cari nama, plat, merek, atau tahun…" autocomplete="off" aria-label="Cari kendaraan" />
              </div>
              <select id="v2AdminVehicleTypeFilter" class="v2-admin-filter">
                <option value="all">Semua Tipe</option>
                ${VEHICLE_TYPE_REGISTRY.map(t => `<option value="${t.key}">${t.label}</option>`).join('')}
              </select>
              <select id="v2AdminVehicleStatusFilter" class="v2-admin-filter">
                <option value="all">Semua Status</option>
                ${VEHICLE_STATUS_REGISTRY.map(s => `<option value="${s.key}">${s.labelId}</option>`).join('')}
                <option value="archived">Diarsipkan</option>
              </select>
              <select id="v2AdminVehicleFuelFilter" class="v2-admin-filter">
                <option value="all">Semua BBM</option>
                ${FUEL_TYPES.map(f => `<option value="${f}">${f}</option>`).join('')}
              </select>
              <select id="v2AdminVehicleTransmissionFilter" class="v2-admin-filter">
                <option value="all">Semua Transmisi</option>
                ${TRANSMISSION_TYPES.map(t => `<option value="${t}">${t}</option>`).join('')}
              </select>
            </div>
            <div class="exec-toolbar__r">
              <button id="v2AdminVehicleReset" class="exec-reset" type="button">
                <span class="exec-reset__ico" aria-hidden="true">${anIcon('reset', { size: 14 })}</span>Reset Filter
              </button>
              <div class="v2-analytics-export" id="v2VehicleExport">
                <button id="v2VehicleExportBtn" class="v2-analytics-export-btn" type="button" aria-haspopup="true" aria-expanded="false" title="Ekspor laporan armada">
                  ${anIcon('download', { size: 14 })}
                  <span class="v2-analytics-export-label">Export</span>
                  <svg class="v2-analytics-export-caret" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>
                </button>
                <div id="v2VehicleExportMenu" class="v2-analytics-export-menu" role="menu" aria-label="Pilih laporan armada" hidden></div>
              </div>
              <button id="v2AdminAddVehicle" class="v2-admin-add-btn" type="button">+ Tambah Kendaraan</button>
            </div>
          </div>
          <div id="v2AdminVehicleList" class="vm-grid"></div>
          </div>
          <div id="v2VehiclePredictionView" style="display:none;">
            <div id="v2VehiclePredictionDashboard"></div>
          </div>
        </div>
        <div id="v2AdminSectionAudit" style="display:none;">
          <div class="v2-admin-toolbar">
            <input type="search" id="v2AuditSearch" class="v2-admin-search"
                   placeholder="Cari aktor, aksi, atau ringkasan…" autocomplete="off" />
            <select id="v2AuditCategoryFilter" class="v2-admin-filter">
              <option value="all">Semua Kategori</option>
              <option value="users">Users</option>
              <option value="drivers">Drivers</option>
              <option value="vehicles">Vehicles</option>
              <option value="assignments">Assignments</option>
              <option value="requests">Requests</option>
              <option value="authentication">Authentication</option>
              <option value="system">System</option>
              <option value="archive">Archive &amp; Restore</option>
            </select>
            <select id="v2AuditActorFilter" class="v2-admin-filter"></select>
            <input type="date" id="v2AuditDateFilter" class="v2-admin-filter v2-audit-date-input" />
          </div>
          <div id="v2AuditList" class="v2-audit-list"></div>
        </div>
        <div id="v2AdminSectionConfig" style="display:none;"></div>
        <div id="v2AdminSectionDispatchAnalytics" style="display:none;">
          <div id="v2DispatchAnalyticsDashboard"></div>
        </div>
        <div id="v2AdminSectionRecommendationAccuracy" style="display:none;">
          <div id="v2RecommendationAccuracyDashboard"></div>
        </div>
        <div id="v2AdminSectionWellness" style="display:none;">
          <div id="v2DriverWellnessDashboard"></div>
        </div>
        <div id="v2AdminSectionPrediction" style="display:none;">
          <div id="v2DriverPredictionDashboard"></div>
        </div>
        <div id="v2AdminSectionExecutive" style="display:none;">
          <div id="v2ExecutiveDashboard"></div>
        </div>
        <div id="v2AdminSectionAnalytics" class="v2-analytics-claude v2-analytics-shell" style="display:none;">
          <!-- Analytics Header (command area): title + date range + filters + export -->
          <div class="v2-analytics-header" id="v2AnalyticsHeader">
            <div class="v2-analytics-header-titles">
              <h2 class="v2-analytics-header-title" style="font-size:18px;font-weight:700;margin:0 0 4px;">Analytics Operasional</h2>
              <p class="v2-analytics-header-sub" style="margin:0 0 14px;color:var(--text-dim,#5b5b64);font-size:13px;line-height:1.5;">Analisis kinerja operasional, utilisasi sumber daya, dan tren aktivitas.</p>
            </div>
            <div class="v2-admin-toolbar">
              <select id="v2AnalyticsDateRange" class="v2-admin-filter">
                <option value="today">Hari Ini</option>
                <option value="7d">7 Hari Terakhir</option>
                <option value="30d" selected>30 Hari Terakhir</option>
                <option value="90d">90 Hari Terakhir</option>
                <option value="all">Semua Data</option>
              </select>
              <select id="v2AnalyticsDriverFilter" class="v2-admin-filter">
                <option value="">Semua Driver</option>
              </select>
              <select id="v2AnalyticsVehicleFilter" class="v2-admin-filter">
                <option value="">Semua Kendaraan</option>
              </select>
              <select id="v2AnalyticsBidangFilter" class="v2-admin-filter">
                <option value="">Semua Bidang</option>
              </select>
              <button id="v2AnalyticsResetFilters" class="v2-analytics-reset-btn" type="button">Reset Semua Filter</button>
              <div class="v2-analytics-export" id="v2AnalyticsExport">
                <button id="v2AnalyticsExportPdf" class="v2-analytics-export-btn" type="button" aria-haspopup="true" aria-expanded="false" title="Ekspor laporan analytics ke PDF">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12M7 11l5 5 5-5M5 21h14"/></svg>
                  <span class="v2-analytics-export-label">Export PDF</span>
                  <svg class="v2-analytics-export-caret" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>
                </button>
                <!-- Items rendered from the export registry at init
                     (see listExportReports() in initV2AdminWorkspace). -->
                <div id="v2AnalyticsExportMenu" class="v2-analytics-export-menu" role="menu" aria-label="Pilih laporan" hidden></div>
              </div>
            </div>
            <div id="v2AnalyticsFilterSummary" class="v2-analytics-filter-summary"></div>
          </div>
          <div id="v2AnalyticsContent"></div>
        </div>
        <div id="v2AdminSectionPlaceholder" style="display:none;"></div>
      </div>
    </div>
  `;
  document.querySelector('.main-content')?.appendChild(ws);

  ws.addEventListener('click', e => {
    if (e.target.closest('#v2AnalyticsResetFilters')) {
      analyticsDateRange    = '30d';
      analyticsDriverFilter  = '';
      analyticsVehicleFilter = '';
      analyticsBidangFilter  = '';
      renderV2AdminAnalytics();
      return;
    }

    // Resource Analytics segmented tabs (Sprint 7) — switch panels in place.
    const tabBtn = e.target.closest('[data-tab-id]');
    if (tabBtn) {
      _switchAnalyticsTab(tabBtn.dataset.tabGroup, tabBtn.dataset.tabId);
      return;
    }

    const actionBtn = e.target.closest('[data-action]');
    if (actionBtn) {
      const action = actionBtn.dataset.action;
      if (action === 'export-pdf') {
        if (activeAdminSection === 'analytics') exportAnalyticsReport(actionBtn);
        return;
      }
      if (action === 'ec-generate') {
        // Export Center catalog card → registry-driven export + metadata log,
        // showing the clicked card's own busy state.
        if (activeAdminSection === 'analytics') runAnalyticsExport(actionBtn.dataset.report, actionBtn);
        return;
      }
      if (action === 'goto-health') {
        _scrollAnalyticsTo('analyticsHealth');
        return;
      }
      if (action === 'goto-resource') {
        const target = actionBtn.dataset.tabTarget;
        if (target) _switchAnalyticsTab('resource', target);
        _scrollAnalyticsTo('analyticsResource');
        return;
      }
      if (action === 'alias-merge') {
        openAliasResolutionModal(
          actionBtn.dataset.type,
          actionBtn.dataset.a,
          actionBtn.dataset.b,
          actionBtn.dataset.countA || null,
          actionBtn.dataset.countB || null,
        );
        return;
      }
      if (action === 'alias-delete') {
        const type = actionBtn.dataset.type;
        const key  = actionBtn.dataset.key;
        if (confirm(`Hapus alias "${key}"? Analytics akan dihitung ulang secara otomatis.`)) {
          _deleteAnalyticsAlias(type, key);
        }
        return;
      }
      if (action === 'alias-undo') {
        const type = actionBtn.dataset.type;
        const key  = actionBtn.dataset.key;
        const src  = actionBtn.dataset.restore || _decodeSafeKey(key);
        if (confirm(`Batalkan merge ini? "${src}" akan dipulihkan dan analytics dihitung ulang.`)) {
          _undoAliasMerge(type, key);
        }
        return;
      }
      if (action === 'alias-dismiss') {
        const type = actionBtn.dataset.type;
        const a    = actionBtn.dataset.a;
        const b    = actionBtn.dataset.b;
        if (confirm(`Abaikan warning untuk "${a}" & "${b}"?`)) {
          _dismissDqWarning(type, a, b);
        }
        return;
      }
      if (action === 'alias-restore') {
        const type    = actionBtn.dataset.type;
        const pairKey = actionBtn.dataset.key;
        _restoreDqWarning(type, pairKey);
        return;
      }
      if (action === 'dest-review') {
        openDestinationReviewModal();
        return;
      }
      if (action === 'assignment-review') {
        openAssignmentReviewModal();
        return;
      }
      if (action === 'request-review') {
        openRequestReviewModal();
        return;
      }
    }

    // v1.17.0: Dispatch Analytics trend-window toggle + export buttons.
    const daaWindowBtn = e.target.closest('[data-daa-window]');
    if (daaWindowBtn) {
      const w = daaWindowBtn.dataset.daaWindow;
      if (w && w !== dispatchAnalyticsTrendWindow) {
        dispatchAnalyticsTrendWindow = w;
        renderDispatchAnalyticsSection();
      }
      return;
    }
    const daaExportBtn = e.target.closest('[data-daa-export]');
    if (daaExportBtn) {
      exportDispatchAnalytics(daaExportBtn.dataset.daaExport, daaExportBtn);
      return;
    }

    // v1.17.6: Driver Wellness window toggle + export buttons + row → drawer.
    const dwiWindowBtn = e.target.closest('[data-dwi-window]');
    if (dwiWindowBtn) {
      const w = dwiWindowBtn.dataset.dwiWindow;
      if (w && w !== driverWellnessWindow) {
        driverWellnessWindow = w;
        renderDriverWellnessSection();
      }
      return;
    }
    const dwiExportBtn = e.target.closest('[data-dwi-export]');
    if (dwiExportBtn) {
      exportDriverWellness(dwiExportBtn.dataset.dwiExport, dwiExportBtn);
      return;
    }
    // v1.18.7: Driver Wellness table rows are now Executive-table clickable rows
    // (data-row-id = driverId). Scoped to `.dwi` so no other exec-table is caught.
    const dwiRow = e.target.closest('.dwi .exec-tr--click');
    if (dwiRow) {
      openDriverWellnessDetail(dwiRow.dataset.rowId);
      return;
    }

    // v1.17.1: Recommendation Accuracy learning-trend toggle + export buttons.
    const raaWindowBtn = e.target.closest('[data-raa-window]');
    if (raaWindowBtn) {
      const w = raaWindowBtn.dataset.raaWindow;
      if (w && w !== recommendationAccuracyTrendWindow) {
        recommendationAccuracyTrendWindow = w;
        renderRecommendationAccuracySection();
      }
      return;
    }
    const raaExportBtn = e.target.closest('[data-raa-export]');
    if (raaExportBtn) {
      exportRecommendationAccuracy(raaExportBtn.dataset.raaExport, raaExportBtn);
      return;
    }

    // v1.18.8: Executive Analytics Report export buttons (PDF | Excel).
    const exaExportBtn = e.target.closest('[data-exa-export]');
    if (exaExportBtn) {
      exportExecutiveDashboard(exaExportBtn.dataset.exaExport, exaExportBtn);
      return;
    }

    // v1.18.8: Executive Analytics quick-navigation cards → one-click routing to
    // each detailed report page. Reuses the existing nav* routing (no new logic).
    const exaNavBtn = e.target.closest('[data-exa-nav]');
    if (exaNavBtn) {
      const dest = exaNavBtn.dataset.exaNav;
      if (dest === 'driver') navAnalyticsDriver();
      else if (dest === 'dispatch') navDispatchAnalytics();
      else if (dest === 'recommendation') navRecommendationAccuracy();
      else if (dest === 'wellness') navDriverWellness();
      else if (dest === 'vehicle') navManajemenKendaraan();
      else if (dest === 'petty') navAnalyticsPettyCash();
      return;
    }

    const button = e.target.closest('[data-admin-section]');
    if (button) {
      const sectionKey = button.dataset.adminSection;
      if (sectionKey && sectionKey !== activeAdminSection) {
        activeAdminSection = sectionKey;
        renderV2AdminWorkspace();
      }
      return;
    }
  });

  // v1.18.7: keyboard-open the Driver Wellness detail drawer (Executive-table
  // clickable rows are role=button/tabindex=0; data-row-id = driverId).
  ws.addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const dwiRow = e.target.closest && e.target.closest('.dwi .exec-tr--click');
    if (dwiRow) {
      e.preventDefault();
      openDriverWellnessDetail(dwiRow.dataset.rowId);
    }
  });

  ws.addEventListener('input', e => {
    if (e.target.id === 'v2AdminSearch') renderV2AdminWorkspace();
    if (e.target.id === 'v2AdminDriverSearch') {
      driverSearch = e.target.value;
      renderV2AdminWorkspace();
    }
    if (e.target.id === 'v2AdminVehicleSearch') {
      vehicleSearch = e.target.value;
      renderV2AdminWorkspace();
    }
    if (e.target.id === 'v2AuditSearch') {
      auditSearch = e.target.value;
      if (activeAdminSection === 'audit') renderAuditCenter();
    }
    // v1.17.1: Recommendation Accuracy live search (driver / vehicle tables).
    const raaSearch = e.target.closest && e.target.closest('[data-raa-search]');
    if (raaSearch) {
      if (raaSearch.dataset.raaSearch === 'driver') recommendationAccuracyDriverSearch = raaSearch.value;
      else recommendationAccuracyVehicleSearch = raaSearch.value;
      renderRecommendationAccuracySection();
    }
  });
  ws.addEventListener('change', e => {
    if (e.target.id === 'v2AdminUserStatusFilter') {
      userStatusFilter = e.target.value;
      renderV2AdminWorkspace();
    }
    if (e.target.id === 'v2AdminRoleFilter') renderV2AdminWorkspace();
    if (e.target.id === 'v2AdminDriverStatusFilter') {
      driverStatusFilter = e.target.value;
      renderV2AdminWorkspace();
    }
    if (e.target.id === 'v2AdminVehicleStatusFilter') {
      vehicleStatusFilter = e.target.value;
      renderV2AdminWorkspace();
    }
    if (e.target.id === 'v2AdminVehicleTypeFilter') {
      vehicleTypeFilter = e.target.value;
      renderV2AdminWorkspace();
    }
    if (e.target.id === 'v2AdminVehicleFuelFilter') {
      vehicleFuelFilter = e.target.value;
      renderV2AdminWorkspace();
    }
    if (e.target.id === 'v2AdminVehicleTransmissionFilter') {
      vehicleTransmissionFilter = e.target.value;
      renderV2AdminWorkspace();
    }
    if (e.target.id === 'v2AuditCategoryFilter') {
      auditCategoryFilter = e.target.value;
      if (activeAdminSection === 'audit') renderAuditCenter();
    }
    if (e.target.id === 'v2AuditActorFilter') {
      auditActorFilter = e.target.value;
      if (activeAdminSection === 'audit') renderAuditCenter();
    }
    if (e.target.id === 'v2AuditDateFilter') {
      auditDateFilter = e.target.value;
      if (activeAdminSection === 'audit') renderAuditCenter();
    }
    if (e.target.id === 'v2AnalyticsDateRange') {
      analyticsDateRange = e.target.value;
      if (activeAdminSection === 'analytics') refreshAnalyticsDisplay();
    }
    if (e.target.id === 'v2AnalyticsDriverFilter') {
      analyticsDriverFilter = e.target.value;
      if (activeAdminSection === 'analytics') refreshAnalyticsDisplay();
    }
    if (e.target.id === 'v2AnalyticsVehicleFilter') {
      analyticsVehicleFilter = e.target.value;
      if (activeAdminSection === 'analytics') refreshAnalyticsDisplay();
    }
    if (e.target.id === 'v2AnalyticsBidangFilter') {
      analyticsBidangFilter = e.target.value;
      if (activeAdminSection === 'analytics') refreshAnalyticsDisplay();
    }
    // v1.17.1: Recommendation Accuracy sort selects (driver / vehicle tables).
    const raaSort = e.target.closest && e.target.closest('[data-raa-sort]');
    if (raaSort) {
      if (raaSort.dataset.raaSort === 'driver') recommendationAccuracyDriverSort = raaSort.value;
      else recommendationAccuracyVehicleSort = raaSort.value;
      renderRecommendationAccuracySection();
    }
  });
  document.getElementById('v2AdminAddUser')?.addEventListener('click', () => {
    if (activeAdminSection === 'users') openUserFormModal(null);
  });
  document.getElementById('v2AdminAddDriver')?.addEventListener('click', () => {
    if (activeAdminSection === 'drivers') openDriverFormModal(null);
  });
  document.getElementById('v2AdminAddVehicle')?.addEventListener('click', () => {
    if (activeAdminSection === 'vehicles') openVehicleFormModal(null);
  });
  // Analytics Export dropdown — 4 server-rendered reports via the validated
  // window.export*Analytics() pipeline. Filters/period flow through unchanged
  // (the export functions read the live model + meta set by refreshAnalyticsDisplay).
  const _analyticsExportBtn  = document.getElementById('v2AnalyticsExportPdf');
  const _analyticsExportMenu = document.getElementById('v2AnalyticsExportMenu');
  // Build the menu items from the shared export registry (single source of
  // truth). Produces the same markup as the previous static buttons, so the
  // styling and behavior are unchanged — only the id/title source moved.
  if (_analyticsExportMenu) {
    _analyticsExportMenu.innerHTML = listExportReports().map((r) =>
      `<button class="v2-analytics-export-item" type="button" role="menuitem" data-report="${r.id}">${r.title}</button>`
    ).join('');
  }
  const _closeAnalyticsExportMenu = () => {
    if (_analyticsExportMenu) _analyticsExportMenu.hidden = true;
    _analyticsExportBtn?.setAttribute('aria-expanded', 'false');
  };
  _analyticsExportBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (activeAdminSection !== 'analytics' || !_analyticsExportMenu) return;
    if (_analyticsExportBtn.disabled) return;
    const willOpen = _analyticsExportMenu.hidden;
    _analyticsExportMenu.hidden = !willOpen;
    _analyticsExportBtn.setAttribute('aria-expanded', String(willOpen));
  });
  _analyticsExportMenu?.addEventListener('click', (e) => {
    const item = e.target.closest('[data-report]');
    if (!item) return;
    _closeAnalyticsExportMenu();
    runAnalyticsExport(item.dataset.report);
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#v2AnalyticsExport')) _closeAnalyticsExportMenu();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') _closeAnalyticsExportMenu();
  });

  // v1.19.5 — Vehicle Management view selector (Inventaris / Prediksi). A sub-view
  // switch inside the module, not a sidebar navigation. Delegated so it survives
  // the section's single injection.
  document.getElementById('v2VehicleViewTabs')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-vehicle-view]');
    if (btn) setVehicleView(btn.dataset.vehicleView);
  });

  // Vehicle Inventory toolbar — Reset + Export reuse the Analytics components
  // (v2-analytics-reset-btn / v2-analytics-export). Export delegates to the
  // shared runAnalyticsExport() pipeline (the existing "Laporan Armada" report),
  // so no new export logic is introduced here.
  document.getElementById('v2AdminVehicleReset')?.addEventListener('click', () => {
    vehicleSearch = '';
    vehicleStatusFilter = 'all';
    vehicleTypeFilter = 'all';
    vehicleFuelFilter = 'all';
    vehicleTransmissionFilter = 'all';
    renderV2AdminWorkspace();
  });
  const _vehExportBtn  = document.getElementById('v2VehicleExportBtn');
  const _vehExportMenu = document.getElementById('v2VehicleExportMenu');
  if (_vehExportMenu) {
    _vehExportMenu.innerHTML =
      '<button class="v2-analytics-export-item" type="button" role="menuitem" data-report="vehicle">Laporan Armada (PDF)</button>';
  }
  const _closeVehExportMenu = () => {
    if (_vehExportMenu) _vehExportMenu.hidden = true;
    _vehExportBtn?.setAttribute('aria-expanded', 'false');
  };
  _vehExportBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (activeAdminSection !== 'vehicles' || !_vehExportMenu) return;
    if (_vehExportBtn.disabled) return;
    const willOpen = _vehExportMenu.hidden;
    _vehExportMenu.hidden = !willOpen;
    _vehExportBtn.setAttribute('aria-expanded', String(willOpen));
  });
  _vehExportMenu?.addEventListener('click', (e) => {
    const item = e.target.closest('[data-report]');
    if (!item) return;
    _closeVehExportMenu();
    runAnalyticsExport(item.dataset.report, _vehExportBtn);
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#v2VehicleExport')) _closeVehExportMenu();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') _closeVehExportMenu();
  });

  // Export Center live refresh — when an export record is written, re-render
  // the §06 history + summary in place from the metadata cache (no Firebase
  // query from the UI). outerHTML keeps #ecRoot stable for the next update.
  subscribeExportHistoryChangeListener((records) => {
    const root = document.getElementById('ecRoot');
    if (root) root.outerHTML = renderModernExportCenter(records);
  });

  registerUsersChangeListener(() => {
    if (currentWorkspace === 'administration') renderV2AdminWorkspace();
  });
  registerDriversChangeListener(() => {
    // Always keep #fieldDriver in sync regardless of active workspace.
    // #requestFieldDriver is handled by requests.js's own listener.
    refreshDriverSelect();
    maybeAutoReactivateDrivers();
    if (currentWorkspace === 'administration' && activeAdminSection === 'drivers') renderV2AdminWorkspace();
  });
  registerVehiclesChangeListener(() => {
    if (currentWorkspace === 'administration' && activeAdminSection === 'vehicles') renderV2AdminWorkspace();
  });
  registerSettingsChangeListener(() => {
    if (activeAdminSection === 'analytics') refreshAnalyticsDisplay();
  });

  initDriverFormModal();
  initVehicleFormModal();
  initDeleteConfirmModal();
  initAuditDetailModal();
  initAliasResolutionModal();
  initDestinationReviewModal();
  initAssignmentReviewModal();
  initRequestReviewModal();
  console.log('[VSM-12] Administration workspace injected');
}

function buildUserCard(user) {
  const initials = (user.displayName || user.username || '?')
    .split(' ').slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '?';
  const role = user.role || 'viewer';
  const active = user.active !== false;
  const archived = user.archived === true;
  const roleLabel = { admin: 'Admin', bidang: 'Bidang', driver: 'Driver', viewer: 'Viewer' }[role] || role;

  if (archived) {
    const refCount = countUserReferences(user);
    const deleteBtnHtml = refCount === 0
      ? `<button class="v2-user-btn v2-user-btn--delete"
                data-user-delete="${esc(user.username)}" type="button">Hapus Permanen</button>`
      : `<span class="v2-delete-blocked-hint">${refCount} referensi</span>`;
    return `
      <div class="v2-user-card v2-user-card--archived">
        <div class="v2-user-avatar-ring v2-user-avatar--${esc(role)}">
          <span class="v2-user-avatar-initials">${esc(initials)}</span>
        </div>
        <div class="v2-user-info">
          <span class="v2-user-display-name">${esc(user.displayName || user.username)}</span>
          <span class="v2-user-username">@${esc(user.username)}</span>
        </div>
        <div class="v2-user-meta">
          <span class="v2-user-role-pill v2-role-pill--${esc(role)}">${esc(roleLabel)}</span>
          <span class="v2-entity-badge v2-entity-badge--archived">Arsip</span>
        </div>
        <div class="v2-user-card-actions">
          <button class="v2-user-btn v2-user-btn--restore"
                  data-user-restore="${esc(user.username)}" type="button">Pulihkan</button>
          ${deleteBtnHtml}
        </div>
      </div>`;
  }

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
        <button class="v2-user-btn v2-user-btn--archive"
                data-user-archive="${esc(user.username)}" type="button">Arsipkan</button>
      </div>
    </div>`;
}

function renderV2AdminStats(allUsers) {
  const el = document.getElementById('v2AdminStats');
  if (!el) return;

  const nonArchived = allUsers.filter(u => u.archived !== true);
  const counts = {};
  for (const user of nonArchived) counts[user.role] = (counts[user.role] || 0) + 1;
  const archivedCount = allUsers.length - nonArchived.length;

  const visibleRoles = V2_ROLE_CONFIG.filter(r => r.visible);
  const chips = visibleRoles.map(r => {
    const label = r.label.charAt(0) + r.label.slice(1).toLowerCase();
    return `<span class="v2-admin-stats-chip">
      <span class="v2-admin-stats-chip-label">${esc(label)}</span>
      <span class="v2-admin-stats-chip-count">${counts[r.key] || 0}</span>
    </span>`;
  }).join('');
  const archivedChip = archivedCount > 0
    ? `<span class="v2-admin-stats-chip v2-stats-chip--archived">
        <span class="v2-admin-stats-chip-label">Arsip</span>
        <span class="v2-admin-stats-chip-count">${archivedCount}</span>
      </span>` : '';

  el.innerHTML = `<div class="v2-admin-stats">
    <div class="v2-admin-stats-total">Total Pengguna <strong>${nonArchived.length}</strong></div>
    <div class="v2-admin-stats-chips">${chips}${archivedChip}</div>
  </div>`;
}

function handleV2RoleGroupToggle(event) {
  const btn = event.currentTarget;
  const role = btn.dataset.v2RoleToggle;
  const body = btn.nextElementSibling;
  if (!body) return;

  const wasExpanded = v2GroupExpanded[role] ?? (V2_ROLE_CONFIG.find(r => r.key === role)?.defaultExpanded ?? false);
  const nowExpanded = !wasExpanded;

  v2GroupExpanded[role] = nowExpanded;
  body.style.display = nowExpanded ? '' : 'none';
  btn.setAttribute('aria-expanded', String(nowExpanded));
  btn.querySelector('.user-role-arrow').textContent = nowExpanded ? '▼' : '▶';
}

function renderV2AdminWorkspace() {
  const section = ADMIN_SECTION_DEFS.find(s => s.key === activeAdminSection) || ADMIN_SECTION_DEFS[0];
  const usersSection       = document.getElementById('v2AdminSectionUsers');
  const driversSection     = document.getElementById('v2AdminSectionDrivers');
  const vehiclesSection    = document.getElementById('v2AdminSectionVehicles');
  const configSection      = document.getElementById('v2AdminSectionConfig');
  const analyticsSection   = document.getElementById('v2AdminSectionAnalytics');
  const dispatchAnalyticsSection = document.getElementById('v2AdminSectionDispatchAnalytics');
  const wellnessSection    = document.getElementById('v2AdminSectionWellness');
  const placeholderSection = document.getElementById('v2AdminSectionPlaceholder');
  const overviewRow        = document.getElementById('v2AdminOverviewRow');

  // v1.17.0: the Dispatch Analytics section is hidden in every branch except its
  // own — set centrally so the per-section branches below don't each need a line.
  if (dispatchAnalyticsSection) {
    dispatchAnalyticsSection.style.display = (activeAdminSection === 'dispatchanalytics') ? '' : 'none';
  }
  // v1.18.1: Recommendation Accuracy is now its OWN render page (was an in-section
  // anchor inside Dispatch Analytics) — same central-hide pattern.
  const recommendationAccuracySection = document.getElementById('v2AdminSectionRecommendationAccuracy');
  if (recommendationAccuracySection) {
    recommendationAccuracySection.style.display = (activeAdminSection === 'recommendationaccuracy') ? '' : 'none';
  }
  // v1.17.6: the Driver Wellness section follows the same central-hide pattern.
  if (wellnessSection) {
    wellnessSection.style.display = (activeAdminSection === 'wellness') ? '' : 'none';
  }
  // v1.19.4: the Driver Prediction section follows the same central-hide pattern.
  const predictionSection = document.getElementById('v2AdminSectionPrediction');
  if (predictionSection) {
    predictionSection.style.display = (activeAdminSection === 'prediction') ? '' : 'none';
  }
  // v1.18.8: the Executive Analytics section follows the same central-hide pattern.
  const executiveSection = document.getElementById('v2AdminSectionExecutive');
  if (executiveSection) {
    executiveSection.style.display = (activeAdminSection === 'executive') ? '' : 'none';
  }

  // v1.14.0: the tab strip is the mobile sub-nav — show only the tabs that
  // belong to the active platform module so it mirrors the new module IA.
  const moduleSections = ADMIN_MODULE_SECTIONS[activeAdminModule] || null;
  document.querySelectorAll('[data-admin-section]').forEach(btn => {
    const key = btn.dataset.adminSection;
    btn.classList.toggle('v2-admin-nav-tab--active', key === activeAdminSection);
    btn.style.display = (!moduleSections || moduleSections.includes(key)) ? '' : 'none';
  });

  // v1.15.2: Analytics has a single admin section (Analytics Driver), so its
  // in-content tab strip would render a lone redundant "Analytics" tab on
  // mobile. The dedicated mobile Analytics sub-nav (#v2AnalyticsMobileNav)
  // owns that navigation, so hide the admin strip while in the Analytics module.
  // v1.17.0: the Analytics module now has TWO sections (Analytics + Dispatch
  // Analytics), so keep the in-content tab strip visible to switch between them
  // (it was hidden only when the module had a single, redundant tab).
  const adminNavStrip = document.querySelector('#v2AdministrationWorkspace .v2-admin-nav');
  if (adminNavStrip) {
    const moduleTabCount = (ADMIN_MODULE_SECTIONS[activeAdminModule] || []).length;
    adminNavStrip.style.display = (activeAdminModule === 'analytics' && moduleTabCount <= 1) ? 'none' : '';
  }

  const pageSubtitle = document.querySelector('.v2-admin-page-subtitle');
  if (pageSubtitle) pageSubtitle.textContent = section.subtitle;

  if (activeAdminSection === 'users') {
    if (usersSection)       usersSection.style.display       = '';
    if (driversSection)     driversSection.style.display     = 'none';
    if (vehiclesSection)    vehiclesSection.style.display    = 'none';
    if (configSection)      configSection.style.display      = 'none';
    if (analyticsSection)   analyticsSection.style.display   = 'none';
    if (placeholderSection) placeholderSection.style.display = 'none';
    const _auditSec = document.getElementById('v2AdminSectionAudit');
    if (_auditSec) _auditSec.style.display = 'none';
    if (overviewRow) {
      const allUsers = getUserList();
      const nonArchived = allUsers.filter(u => u.archived !== true);
      const counts = {};
      for (const user of nonArchived) counts[user.role] = (counts[user.role] || 0) + 1;
      const archivedCount = allUsers.length - nonArchived.length;
      overviewRow.innerHTML = `
        <div class="v2-admin-overview-cards">
          <div class="v2-admin-overview-card">
            <span class="v2-admin-overview-value">${nonArchived.length}</span>
            <span class="v2-admin-overview-label">Total Pengguna</span>
          </div>
          <div class="v2-admin-overview-card">
            <span class="v2-admin-overview-value">${counts['driver'] || 0}</span>
            <span class="v2-admin-overview-label">Driver Aktif</span>
          </div>
          <div class="v2-admin-overview-card">
            <span class="v2-admin-overview-value">${counts['admin'] || 0}</span>
            <span class="v2-admin-overview-label">Administrator</span>
          </div>
          ${archivedCount > 0 ? `<div class="v2-admin-overview-card v2-admin-overview-card--archived">
            <span class="v2-admin-overview-value">${archivedCount}</span>
            <span class="v2-admin-overview-label">Diarsipkan</span>
          </div>` : ''}
        </div>
      `;
    }
    const statusFilterEl = document.getElementById('v2AdminUserStatusFilter');
    if (statusFilterEl) statusFilterEl.value = userStatusFilter;
    renderV2AdminUsers();

  } else if (activeAdminSection === 'drivers') {
    if (usersSection)       usersSection.style.display       = 'none';
    if (driversSection)     driversSection.style.display     = '';
    if (vehiclesSection)    vehiclesSection.style.display    = 'none';
    if (configSection)      configSection.style.display      = 'none';
    if (analyticsSection)   analyticsSection.style.display   = 'none';
    if (placeholderSection) placeholderSection.style.display = 'none';
    const _auditSec = document.getElementById('v2AdminSectionAudit');
    if (_auditSec) _auditSec.style.display = 'none';
    if (overviewRow) {
      const allDrivers = getDrivers();
      const nonArchived  = allDrivers.filter(d => d.archived !== true);
      const activeCount  = nonArchived.filter(d => d.active !== false).length;
      const linkedCount  = nonArchived.filter(d => d.linkedUserUsername).length;
      const archivedCount = allDrivers.length - nonArchived.length;
      overviewRow.innerHTML = `
        <div class="v2-admin-overview-cards">
          <div class="v2-admin-overview-card">
            <span class="v2-admin-overview-value">${nonArchived.length}</span>
            <span class="v2-admin-overview-label">Total Driver</span>
          </div>
          <div class="v2-admin-overview-card">
            <span class="v2-admin-overview-value">${activeCount}</span>
            <span class="v2-admin-overview-label">Driver Aktif</span>
          </div>
          <div class="v2-admin-overview-card">
            <span class="v2-admin-overview-value">${linkedCount}</span>
            <span class="v2-admin-overview-label">Akun Tertaut</span>
          </div>
          ${archivedCount > 0 ? `<div class="v2-admin-overview-card v2-admin-overview-card--archived">
            <span class="v2-admin-overview-value">${archivedCount}</span>
            <span class="v2-admin-overview-label">Diarsipkan</span>
          </div>` : ''}
        </div>
      `;
    }
    const searchEl = document.getElementById('v2AdminDriverSearch');
    if (searchEl) searchEl.value = driverSearch;
    const filterEl = document.getElementById('v2AdminDriverStatusFilter');
    if (filterEl) filterEl.value = driverStatusFilter;
    renderV2AdminDrivers();

  } else if (activeAdminSection === 'vehicles') {
    if (usersSection)       usersSection.style.display       = 'none';
    if (driversSection)     driversSection.style.display     = 'none';
    if (vehiclesSection)    vehiclesSection.style.display    = '';
    if (configSection)      configSection.style.display      = 'none';
    if (analyticsSection)   analyticsSection.style.display   = 'none';
    if (placeholderSection) placeholderSection.style.display = 'none';
    const _auditSec = document.getElementById('v2AdminSectionAudit');
    if (_auditSec) _auditSec.style.display = 'none';
    // v1.19.5 — Vehicle Management is multi-view. applyVehicleView() renders
    // whichever sub-view (inventory / prediction) is active, and owns the overview
    // strip + filter sync for the inventory view.
    applyVehicleView(overviewRow);

  } else if (activeAdminSection === 'audit') {
    if (usersSection)       usersSection.style.display       = 'none';
    if (driversSection)     driversSection.style.display     = 'none';
    if (vehiclesSection)    vehiclesSection.style.display    = 'none';
    if (configSection)      configSection.style.display      = 'none';
    if (analyticsSection)   analyticsSection.style.display   = 'none';
    if (placeholderSection) placeholderSection.style.display = 'none';
    const auditSection = document.getElementById('v2AdminSectionAudit');
    if (auditSection) auditSection.style.display = '';
    if (overviewRow) {
      const today = new Date().toISOString().split('T')[0];
      const totalLogs     = auditLogs.length;
      const todayLogs     = auditLogs.filter(l => (l.timestamp || '').startsWith(today)).length;
      const userEventsCount = auditLogs.filter(l => inferAuditCategory(l) === 'Users').length;
      const opEventsCount = auditLogs.filter(l => {
        const cat = inferAuditCategory(l);
        return cat === 'Assignments' || cat === 'Requests';
      }).length;
      overviewRow.innerHTML = `
        <div class="v2-admin-overview-cards">
          <div class="v2-admin-overview-card">
            <span class="v2-admin-overview-value">${totalLogs}</span>
            <span class="v2-admin-overview-label">Total Log</span>
          </div>
          <div class="v2-admin-overview-card">
            <span class="v2-admin-overview-value">${todayLogs}</span>
            <span class="v2-admin-overview-label">Aktivitas Hari Ini</span>
          </div>
          <div class="v2-admin-overview-card">
            <span class="v2-admin-overview-value">${userEventsCount}</span>
            <span class="v2-admin-overview-label">User Events</span>
          </div>
          <div class="v2-admin-overview-card">
            <span class="v2-admin-overview-value">${opEventsCount}</span>
            <span class="v2-admin-overview-label">Operational Events</span>
          </div>
        </div>
      `;
    }
    const auditSearchEl = document.getElementById('v2AuditSearch');
    if (auditSearchEl) auditSearchEl.value = auditSearch;
    const auditCatEl = document.getElementById('v2AuditCategoryFilter');
    if (auditCatEl) auditCatEl.value = auditCategoryFilter;
    const auditActorEl = document.getElementById('v2AuditActorFilter');
    if (auditActorEl) {
      const actors = [...new Set(auditLogs.map(l => l.username || '').filter(Boolean))].sort();
      auditActorEl.innerHTML = '<option value="">Semua Aktor</option>' +
        actors.map(a => `<option value="${esc(a)}">${esc(a)}</option>`).join('');
      auditActorEl.value = auditActorFilter;
    }
    const auditDateEl = document.getElementById('v2AuditDateFilter');
    if (auditDateEl) auditDateEl.value = auditDateFilter;
    renderAuditCenter();

  } else if (activeAdminSection === 'config') {
    if (usersSection)       usersSection.style.display       = 'none';
    if (driversSection)     driversSection.style.display     = 'none';
    if (vehiclesSection)    vehiclesSection.style.display    = 'none';
    if (analyticsSection)   analyticsSection.style.display   = 'none';
    if (placeholderSection) placeholderSection.style.display = 'none';
    const auditSection = document.getElementById('v2AdminSectionAudit');
    if (auditSection) auditSection.style.display = 'none';
    if (configSection) configSection.style.display = '';
    if (overviewRow) {
      const telegramToken = getSetting('telegram.botToken');
      const _tStart = _cfgMinsToTime(getSetting('operations.workStartMins'));
      const _tEnd   = _cfgMinsToTime(getSetting('operations.workEndMins'));
      overviewRow.innerHTML = `
        <div class="v2-admin-overview-cards">
          <div class="v2-admin-overview-card">
            <span class="v2-admin-overview-value">${esc(_tStart)} – ${esc(_tEnd)}</span>
            <span class="v2-admin-overview-label">Jam Operasional</span>
            <span class="v2-admin-overview-desc">Operasional harian aktif</span>
          </div>
          <div class="v2-admin-overview-card">
            <span class="v2-admin-overview-value">${Number(getSetting('operations.odometerWarnJumpKm')).toLocaleString('id')} km</span>
            <span class="v2-admin-overview-label">Batas Odometer</span>
            <span class="v2-admin-overview-desc">Deteksi lonjakan jarak</span>
          </div>
          <div class="v2-admin-overview-card">
            <span class="v2-admin-overview-value">${getSetting('system.backupRetentionDays')} Hari</span>
            <span class="v2-admin-overview-label">Retensi Backup</span>
            <span class="v2-admin-overview-desc">Penyimpanan cadangan</span>
          </div>
          <div class="v2-admin-overview-card">
            <span class="v2-admin-overview-value">${telegramToken ? 'Terhubung' : 'Belum Diatur'}</span>
            <span class="v2-admin-overview-label">Telegram</span>
            <span class="v2-admin-overview-desc">${telegramToken ? 'Bot aktif dan tersedia' : 'Bot belum terhubung'}</span>
          </div>
        </div>
      `;
    }
    renderV2AdminConfig();

  } else if (activeAdminSection === 'analytics') {
    if (usersSection)       usersSection.style.display       = 'none';
    if (driversSection)     driversSection.style.display     = 'none';
    if (vehiclesSection)    vehiclesSection.style.display    = 'none';
    if (configSection)      configSection.style.display      = 'none';
    if (analyticsSection)   analyticsSection.style.display   = '';
    if (placeholderSection) placeholderSection.style.display = 'none';
    const _auditSec2 = document.getElementById('v2AdminSectionAudit');
    if (_auditSec2) _auditSec2.style.display = 'none';
    renderV2AdminAnalytics();

  } else if (activeAdminSection === 'dispatchanalytics') {
    if (usersSection)       usersSection.style.display       = 'none';
    if (driversSection)     driversSection.style.display     = 'none';
    if (vehiclesSection)    vehiclesSection.style.display    = 'none';
    if (configSection)      configSection.style.display      = 'none';
    if (analyticsSection)   analyticsSection.style.display   = 'none';
    if (placeholderSection) placeholderSection.style.display = 'none';
    const _auditSec3 = document.getElementById('v2AdminSectionAudit');
    if (_auditSec3) _auditSec3.style.display = 'none';
    if (overviewRow) overviewRow.innerHTML = '';
    renderDispatchAnalyticsSection();

  } else if (activeAdminSection === 'recommendationaccuracy') {
    if (usersSection)       usersSection.style.display       = 'none';
    if (driversSection)     driversSection.style.display     = 'none';
    if (vehiclesSection)    vehiclesSection.style.display    = 'none';
    if (configSection)      configSection.style.display      = 'none';
    if (analyticsSection)   analyticsSection.style.display   = 'none';
    if (placeholderSection) placeholderSection.style.display = 'none';
    const _auditSecRA = document.getElementById('v2AdminSectionAudit');
    if (_auditSecRA) _auditSecRA.style.display = 'none';
    if (overviewRow) overviewRow.innerHTML = '';
    renderRecommendationAccuracySection();

  } else if (activeAdminSection === 'wellness') {
    if (usersSection)       usersSection.style.display       = 'none';
    if (driversSection)     driversSection.style.display     = 'none';
    if (vehiclesSection)    vehiclesSection.style.display    = 'none';
    if (configSection)      configSection.style.display      = 'none';
    if (analyticsSection)   analyticsSection.style.display   = 'none';
    if (placeholderSection) placeholderSection.style.display = 'none';
    const _auditSec4 = document.getElementById('v2AdminSectionAudit');
    if (_auditSec4) _auditSec4.style.display = 'none';
    if (overviewRow) overviewRow.innerHTML = '';
    renderDriverWellnessSection();

  } else if (activeAdminSection === 'prediction') {
    if (usersSection)       usersSection.style.display       = 'none';
    if (driversSection)     driversSection.style.display     = 'none';
    if (vehiclesSection)    vehiclesSection.style.display    = 'none';
    if (configSection)      configSection.style.display      = 'none';
    if (analyticsSection)   analyticsSection.style.display   = 'none';
    if (placeholderSection) placeholderSection.style.display = 'none';
    const _auditSecDP = document.getElementById('v2AdminSectionAudit');
    if (_auditSecDP) _auditSecDP.style.display = 'none';
    if (overviewRow) overviewRow.innerHTML = '';
    renderDriverPredictionSection();

  } else if (activeAdminSection === 'executive') {
    if (usersSection)       usersSection.style.display       = 'none';
    if (driversSection)     driversSection.style.display     = 'none';
    if (vehiclesSection)    vehiclesSection.style.display    = 'none';
    if (configSection)      configSection.style.display      = 'none';
    if (analyticsSection)   analyticsSection.style.display   = 'none';
    if (placeholderSection) placeholderSection.style.display = 'none';
    const _auditSec5 = document.getElementById('v2AdminSectionAudit');
    if (_auditSec5) _auditSec5.style.display = 'none';
    if (overviewRow) overviewRow.innerHTML = '';
    renderExecutiveDashboardSection();

  } else {
    if (usersSection)       usersSection.style.display       = 'none';
    if (driversSection)     driversSection.style.display     = 'none';
    if (vehiclesSection)    vehiclesSection.style.display    = 'none';
    if (configSection)      configSection.style.display      = 'none';
    if (analyticsSection)   analyticsSection.style.display   = 'none';
    const auditSection = document.getElementById('v2AdminSectionAudit');
    if (auditSection) auditSection.style.display = 'none';
    if (overviewRow) overviewRow.innerHTML = '';
    if (placeholderSection) {
      placeholderSection.style.display = '';
      placeholderSection.innerHTML = `
        <div class="v2-admin-placeholder-module">
          <div class="v2-admin-placeholder-header">
            <h3 class="v2-admin-placeholder-module-title">${esc(section.label)}</h3>
            <span class="v2-admin-placeholder-badge">Planned Capabilities</span>
          </div>
          <ul class="v2-admin-placeholder-features">
            ${(section.features || []).map(feature => `<li>${esc(feature)}</li>`).join('')}
          </ul>
        </div>
      `;
    }
  }
}

function renderV2AdminUsers() {
  const list = document.getElementById('v2AdminUserList');
  if (!list) return;

  const q = (document.getElementById('v2AdminSearch')?.value || '').toLowerCase().trim();
  const roleFilter = document.getElementById('v2AdminRoleFilter')?.value || '';
  const allUsers = getUserList();

  // Stats always reflect global totals — unaffected by search / role filter
  renderV2AdminStats(allUsers);

  const filtered = allUsers.filter(u => {
    const matchesSearch = !q ||
      (u.displayName || '').toLowerCase().includes(q) ||
      (u.username    || '').toLowerCase().includes(q);
    const matchesRole = !roleFilter || u.role === roleFilter;
    const matchesStatus =
      userStatusFilter === 'all'      ? (u.archived !== true || (!!q && matchesSearch)) :
      userStatusFilter === 'active'   ? (u.archived !== true && u.active !== false) :
      userStatusFilter === 'inactive' ? (u.archived !== true && u.active === false) :
      userStatusFilter === 'archived' ? (u.archived === true) : (u.archived !== true);
    return matchesSearch && matchesRole && matchesStatus;
  });

  if (!filtered.length) {
    list.innerHTML = '<div class="v2-admin-empty">Tidak ada pengguna ditemukan.</div>';
    return;
  }

  // Group filtered users by role, sort each group A→Z by displayName
  const byRole = {};
  for (const user of filtered) {
    const key = user.role || 'viewer';
    if (!byRole[key]) byRole[key] = [];
    byRole[key].push(user);
  }
  for (const key of Object.keys(byRole)) {
    byRole[key].sort((a, b) =>
      (a.displayName || a.username).localeCompare(b.displayName || b.username, 'id')
    );
  }

  // Unknown roles (not in V2_ROLE_CONFIG) appended after configured roles
  const knownKeys = new Set(V2_ROLE_CONFIG.map(r => r.key));
  const unknownRoles = Object.keys(byRole).filter(k => !knownKeys.has(k));
  const allRoles = [
    ...V2_ROLE_CONFIG,
    ...unknownRoles.map(k => ({ key: k, label: k.toUpperCase(), defaultExpanded: false, visible: true })),
  ];

  // When role filter is active show only that group; otherwise show all visible
  const rolesToRender = roleFilter
    ? allRoles.filter(r => r.key === roleFilter)
    : allRoles.filter(r => r.visible);

  let html = '';
  for (const roleInfo of rolesToRender) {
    const roleUsers = byRole[roleInfo.key] || [];
    const expanded = v2GroupExpanded[roleInfo.key] ?? roleInfo.defaultExpanded;
    const arrow = expanded ? '▼' : '▶';

    html += `<div class="user-role-group">
      <button class="user-role-header" data-v2-role-toggle="${esc(roleInfo.key)}" type="button" aria-expanded="${expanded}">
        <span class="user-role-arrow">${arrow}</span>
        <span class="user-role-label">${esc(roleInfo.label)}</span>
        <span class="user-role-count-badge">${roleUsers.length}</span>
      </button>
      <div class="user-role-body"${expanded ? '' : ' style="display:none;"'}>
        ${roleUsers.length === 0
          ? '<div class="user-role-empty">Tidak ada user di grup ini.</div>'
          : roleUsers.map(buildUserCard).join('')}
      </div>
    </div>`;
  }

  list.innerHTML = html;

  list.querySelectorAll('[data-v2-role-toggle]').forEach(btn => {
    btn.addEventListener('click', handleV2RoleGroupToggle);
  });
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
  list.querySelectorAll('[data-user-archive]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const username = btn.dataset.userArchive;
      btn.disabled = true;
      try {
        await archiveUser(username);
        logAction({ userId: getCurrentUser()?.id, username: getCurrentUser()?.username, action: 'user_archived', targetId: username });
        showToast('User berhasil diarsipkan.');
      } catch (err) {
        showToast(err.message || 'Gagal mengarsipkan user.', 'error');
        btn.disabled = false;
      }
    });
  });
  list.querySelectorAll('[data-user-restore]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const username = btn.dataset.userRestore;
      btn.disabled = true;
      try {
        await restoreUser(username);
        logAction({ userId: getCurrentUser()?.id, username: getCurrentUser()?.username, action: 'user_restored', targetId: username });
        showToast('User berhasil dipulihkan.');
      } catch (err) {
        showToast(err.message || 'Gagal memulihkan user.', 'error');
        btn.disabled = false;
      }
    });
  });
  list.querySelectorAll('[data-user-delete]').forEach(btn => {
    btn.addEventListener('click', () => {
      const username = btn.dataset.userDelete;
      const user = getUserList().find(u => u.username === username);
      if (!user) return;
      openDeleteConfirmModal({ type: 'user', id: username, name: user.displayName || user.username, refCount: countUserReferences(user) });
    });
  });
}

/* ============================================================
   V1.5.0 Phase 3.1 — Driver Management Workspace
   ============================================================ */

function initDriverFormModal() {
  const modal = document.createElement('div');
  modal.id = 'modalDriverForm';
  modal.className = 'modal-overlay';
  modal.style.display = 'none';
  modal.innerHTML = `
    <div class="modal-box">
      <div class="modal-header">
        <h2 class="modal-title" id="driverFormTitle">Tambah Driver</h2>
        <button class="modal-close" id="btnCloseDriverForm" type="button">&times;</button>
      </div>
      <div class="modal-body">
        <form id="driverForm" novalidate>
          <div class="form-grid">
            <div class="form-group">
              <label for="driverFieldName">Nama *</label>
              <input type="text" id="driverFieldName" placeholder="Nama driver" required />
            </div>
            <div class="form-group">
              <label for="driverFieldPhone">No. Telepon *</label>
              <input type="tel" id="driverFieldPhone" placeholder="08xx-xxxx-xxxx" required />
            </div>
            <div class="form-group form-full">
              <label for="driverFieldLinkedUser">Username Akun Tertaut <span style="font-weight:400;color:var(--muted)">(opsional)</span></label>
              <input type="text" id="driverFieldLinkedUser"
                     placeholder="Username akun yang ditautkan" autocomplete="off" />
            </div>
            <div class="form-group form-full">
              <label for="driverFieldStatus">Status</label>
              <select id="driverFieldStatus">
                <option value="Aktif">Aktif</option>
                <option value="Cuti">Cuti</option>
                <option value="Sakit">Sakit</option>
                <option value="Izin">Izin</option>
                <option value="Nonaktif">Nonaktif</option>
              </select>
            </div>
            <div class="form-group form-full" id="driverLeaveFields" style="display:none">
              <div class="form-grid">
                <div class="form-group">
                  <label for="driverFieldLeaveStart">Tanggal Mulai *</label>
                  <input type="date" id="driverFieldLeaveStart" />
                </div>
                <div class="form-group">
                  <label for="driverFieldLeaveEnd">Tanggal Selesai *</label>
                  <input type="date" id="driverFieldLeaveEnd" />
                </div>
                <div class="form-group form-full">
                  <label for="driverFieldLeaveNote">Keterangan</label>
                  <input type="text" id="driverFieldLeaveNote" placeholder="Mis. Cuti tahunan, sakit, keperluan keluarga" autocomplete="off" />
                </div>
              </div>
            </div>
          </div>
          <div class="form-actions">
            <button type="button" class="btn-secondary" id="btnCancelDriverForm">Batal</button>
            <button type="submit" class="btn-primary" id="btnSaveDriverForm">Tambah Driver</button>
          </div>
        </form>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  document.getElementById('btnCloseDriverForm')?.addEventListener('click', closeDriverFormModal);
  document.getElementById('btnCancelDriverForm')?.addEventListener('click', closeDriverFormModal);
  modal.addEventListener('click', e => { if (e.target === modal) closeDriverFormModal(); });
  document.getElementById('driverForm')?.addEventListener('submit', handleDriverFormSubmit);
  document.getElementById('driverFieldStatus')?.addEventListener('change', e => {
    toggleDriverLeaveFields(e.target.value);
  });
}

/** Show the leave-period fields only for leave statuses (Cuti/Sakit/Izin). */
function toggleDriverLeaveFields(status) {
  const grp = document.getElementById('driverLeaveFields');
  if (grp) grp.style.display = isLeaveStatus(status) ? '' : 'none';
}

function openDriverFormModal(driverId = null) {
  editingDriverId = driverId;
  const form = document.getElementById('driverForm');
  if (!form) return;
  form.reset();

  const title  = document.getElementById('driverFormTitle');
  const btnSave = document.getElementById('btnSaveDriverForm');

  const statusEl = document.getElementById('driverFieldStatus');
  const leaveStartEl = document.getElementById('driverFieldLeaveStart');
  const leaveEndEl   = document.getElementById('driverFieldLeaveEnd');
  const leaveNoteEl  = document.getElementById('driverFieldLeaveNote');

  if (driverId) {
    const driver = getDrivers().find(d => d.id === driverId);
    if (!driver) return;
    if (title)   title.textContent   = 'Edit Driver';
    if (btnSave) btnSave.textContent = 'Simpan Perubahan';
    const nameEl   = document.getElementById('driverFieldName');
    const phoneEl  = document.getElementById('driverFieldPhone');
    const linkedEl = document.getElementById('driverFieldLinkedUser');
    if (nameEl)   nameEl.value   = driver.name || '';
    if (phoneEl)  phoneEl.value  = driver.phone || '';
    if (linkedEl) linkedEl.value = driver.linkedUserUsername || '';
    // Arsip is managed via the card action, not this dropdown — fall back to Aktif.
    const st = deriveStatus(driver);
    if (statusEl) statusEl.value = st === DRIVER_STATUS.ARSIP ? DRIVER_STATUS.ACTIVE : st;
    const leave = driver.leave || {};
    if (leaveStartEl) leaveStartEl.value = leave.start || '';
    if (leaveEndEl)   leaveEndEl.value   = leave.end || '';
    if (leaveNoteEl)  leaveNoteEl.value  = leave.note || '';
  } else {
    if (title)   title.textContent   = 'Tambah Driver';
    if (btnSave) btnSave.textContent = 'Tambah Driver';
    if (statusEl) statusEl.value = DRIVER_STATUS.ACTIVE;
    if (leaveStartEl) leaveStartEl.value = '';
    if (leaveEndEl)   leaveEndEl.value   = '';
    if (leaveNoteEl)  leaveNoteEl.value  = '';
  }
  toggleDriverLeaveFields(statusEl ? statusEl.value : DRIVER_STATUS.ACTIVE);

  const modal = document.getElementById('modalDriverForm');
  if (modal) modal.style.display = 'flex';
}

function closeDriverFormModal() {
  const modal = document.getElementById('modalDriverForm');
  if (modal) modal.style.display = 'none';
  editingDriverId = null;
}

async function handleDriverFormSubmit(event) {
  event.preventDefault();
  const name               = document.getElementById('driverFieldName')?.value.trim() || '';
  const phone              = document.getElementById('driverFieldPhone')?.value.trim() || '';
  const linkedUserUsername = document.getElementById('driverFieldLinkedUser')?.value.trim() || '';
  const status             = document.getElementById('driverFieldStatus')?.value || DRIVER_STATUS.ACTIVE;
  const leave = isLeaveStatus(status) ? {
    start: document.getElementById('driverFieldLeaveStart')?.value || '',
    end:   document.getElementById('driverFieldLeaveEnd')?.value || '',
    note:  document.getElementById('driverFieldLeaveNote')?.value.trim() || '',
  } : null;

  const btn = document.getElementById('btnSaveDriverForm');
  if (btn) btn.disabled = true;

  try {
    const currentUser = getCurrentUser();
    if (editingDriverId) {
      const prevStatus = deriveStatus(getDrivers().find(d => d.id === editingDriverId));
      await updateDriver(editingDriverId, { name, phone, linkedUserUsername, status, leave });
      logAction({
        userId:   currentUser?.id,
        username: currentUser?.username,
        action:   'driver_updated',
        targetId: editingDriverId,
        metadata: { name, status },
      });
      if (status !== prevStatus) {
        logAction({
          userId:   currentUser?.id,
          username: currentUser?.username,
          action:   'DRIVER_STATUS_CHANGED',
          targetId: editingDriverId,
          metadata: { name, from: prevStatus, to: status, leave },
        });
      }
      showToast('Driver berhasil diperbarui.');
    } else {
      const newDriver = await createDriver({ name, phone, linkedUserUsername, status, leave });
      logAction({
        userId:   currentUser?.id,
        username: currentUser?.username,
        action:   'driver_created',
        targetId: newDriver.id,
        metadata: { name, status },
      });
      if (status !== DRIVER_STATUS.ACTIVE) {
        logAction({
          userId:   currentUser?.id,
          username: currentUser?.username,
          action:   'DRIVER_STATUS_CHANGED',
          targetId: newDriver.id,
          metadata: { name, from: DRIVER_STATUS.ACTIVE, to: status, leave },
        });
      }
      showToast('Driver baru berhasil ditambahkan.');
    }
    closeDriverFormModal();
    // No explicit render here: the registerDriversChangeListener callback renders
    // after the drivers cache is updated (local: synchronous; Firebase: on subscription).
  } catch (err) {
    showToast(err.message || 'Gagal menyimpan driver.');
  } finally {
    if (btn) btn.disabled = false;
  }
}

const LEAVE_MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
function fmtLeaveDate(iso) {
  if (!iso) return '';
  const p = String(iso).split('-');
  return `${+p[2]} ${LEAVE_MONTHS_SHORT[+p[1] - 1] || ''}`.trim();
}
function fmtLeaveRange(leave) {
  if (!leave || !leave.start || !leave.end) return '';
  return `${fmtLeaveDate(leave.start)}–${fmtLeaveDate(leave.end)}`;
}

function buildDriverCard(driver) {
  const initials = (driver.name || '?')
    .split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '?';
  const archived = driver.archived === true;
  const linked   = Boolean(driver.linkedUserUsername);

  if (archived) {
    const refCount = countDriverReferences(driver);
    const deleteBtnHtml = refCount === 0
      ? `<button class="v2-user-btn v2-user-btn--delete"
                data-driver-delete="${esc(driver.id)}" type="button">Hapus Permanen</button>`
      : `<span class="v2-delete-blocked-hint">${refCount} referensi</span>`;
    return `
      <div class="v2-user-card v2-user-card--archived">
        <div class="v2-user-avatar-ring v2-user-avatar--driver">
          <span class="v2-user-avatar-initials">${esc(initials)}</span>
        </div>
        <div class="v2-user-info">
          <span class="v2-user-display-name">${esc(driver.name)}</span>
          <span class="v2-user-username">${esc(driver.phone || '—')}</span>
        </div>
        <div class="v2-user-meta">
          ${linked ? `<span class="v2-user-role-pill v2-driver-linked-pill">@${esc(driver.linkedUserUsername)}</span>` : ''}
          <span class="v2-entity-badge v2-entity-badge--archived">Arsip</span>
        </div>
        <div class="v2-user-card-actions">
          <button class="v2-user-btn v2-user-btn--restore"
                  data-driver-restore="${esc(driver.id)}" type="button">Pulihkan</button>
          ${deleteBtnHtml}
        </div>
      </div>`;
  }

  const effStatus = effectiveStatus(driver);
  const eligible  = effStatus === DRIVER_STATUS.ACTIVE;
  const onLeave   = isLeaveStatus(effStatus);
  const pillClass = onLeave ? ' v2-status-pill--leave' : (eligible ? '' : ' v2-status-pill--inactive');
  const range     = onLeave ? fmtLeaveRange(driver.leave) : '';
  const pillText  = onLeave ? `${effStatus}${range ? ' · ' + range : ''}` : effStatus;

  return `
    <div class="v2-user-card${eligible ? '' : ' v2-user-card--inactive'}">
      <div class="v2-user-avatar-ring v2-user-avatar--driver">
        <span class="v2-user-avatar-initials">${esc(initials)}</span>
      </div>
      <div class="v2-user-info">
        <span class="v2-user-display-name">${esc(driver.name)}</span>
        <span class="v2-user-username">${esc(driver.phone || '—')}</span>
      </div>
      <div class="v2-user-meta">
        ${linked ? `<span class="v2-user-role-pill v2-driver-linked-pill">@${esc(driver.linkedUserUsername)}</span>` : ''}
        <span class="v2-user-status-pill${pillClass}">${esc(pillText)}</span>
      </div>
      <div class="v2-user-card-actions">
        <button class="v2-user-btn v2-user-btn--edit"
                data-driver-edit="${esc(driver.id)}" type="button">Edit</button>
        <button class="v2-user-btn v2-user-btn--toggle"
                data-driver-toggle="${esc(driver.id)}" type="button">
          ${eligible ? 'Nonaktifkan' : 'Aktifkan'}
        </button>
        <button class="v2-user-btn v2-user-btn--archive"
                data-driver-archive="${esc(driver.id)}" type="button">Arsipkan</button>
      </div>
    </div>`;
}

function renderV2AdminDriverStats(allDrivers) {
  const el = document.getElementById('v2AdminDriverStats');
  if (!el) return;

  const nonArchived   = allDrivers.filter(d => d.archived !== true);
  // Counts follow the effective status so they match the cards/eligibility.
  const activeCount   = nonArchived.filter(d => effectiveStatus(d) === DRIVER_STATUS.ACTIVE).length;
  const leaveCount    = nonArchived.filter(d => isLeaveStatus(effectiveStatus(d))).length;
  const inactiveCount = nonArchived.filter(d => effectiveStatus(d) === DRIVER_STATUS.NONAKTIF).length;
  const linkedCount   = nonArchived.filter(d => d.linkedUserUsername).length;
  const archivedCount = allDrivers.length - nonArchived.length;
  const leaveChip = leaveCount > 0
    ? `<span class="v2-admin-stats-chip">
        <span class="v2-admin-stats-chip-label">Cuti/Izin</span>
        <span class="v2-admin-stats-chip-count">${leaveCount}</span>
      </span>` : '';
  const archivedChip  = archivedCount > 0
    ? `<span class="v2-admin-stats-chip v2-stats-chip--archived">
        <span class="v2-admin-stats-chip-label">Arsip</span>
        <span class="v2-admin-stats-chip-count">${archivedCount}</span>
      </span>` : '';

  el.innerHTML = `<div class="v2-admin-stats">
    <div class="v2-admin-stats-total">Total Driver <strong>${nonArchived.length}</strong></div>
    <div class="v2-admin-stats-chips">
      <span class="v2-admin-stats-chip">
        <span class="v2-admin-stats-chip-label">Aktif</span>
        <span class="v2-admin-stats-chip-count">${activeCount}</span>
      </span>
      ${leaveChip}
      <span class="v2-admin-stats-chip">
        <span class="v2-admin-stats-chip-label">Nonaktif</span>
        <span class="v2-admin-stats-chip-count">${inactiveCount}</span>
      </span>
      <span class="v2-admin-stats-chip">
        <span class="v2-admin-stats-chip-label">Tertaut</span>
        <span class="v2-admin-stats-chip-count">${linkedCount}</span>
      </span>
      ${archivedChip}
    </div>
  </div>`;
}

/* Auto-reactivation sweep (v1.16.4.4): when a driver's leave period has ended,
   return them to Aktif and audit it. Only an admin session persists/audits the
   change (writes require admin); other sessions still see the effective status
   via effectiveStatus(). Re-entrancy guarded — the sweep is idempotent, so the
   write-triggered re-fire finds nothing and stops. */
let _driverSweepRunning = false;
async function maybeAutoReactivateDrivers() {
  if (!isAdmin() || _driverSweepRunning) return;
  _driverSweepRunning = true;
  try {
    const restored = await autoReactivateDueDrivers({ persist: true });
    if (restored.length) {
      const currentUser = getCurrentUser();
      restored.forEach(d => {
        logAction({
          userId: currentUser?.id, username: currentUser?.username,
          action: 'DRIVER_STATUS_AUTO_RESTORED', targetId: d.id,
          metadata: { name: d.name, leaveEnd: d.leave && d.leave.end },
        });
      });
    }
  } catch (err) {
    console.warn('[Drivers] auto-reactivation sweep failed:', err);
  } finally {
    _driverSweepRunning = false;
  }
}

function renderV2AdminDrivers() {
  const list = document.getElementById('v2AdminDriverList');
  if (!list) return;

  const q = driverSearch.toLowerCase().trim();
  const allDrivers = getDrivers();

  renderV2AdminDriverStats(allDrivers);

  const filtered = allDrivers.filter(d => {
    const matchesSearch = !q ||
      (d.name  || '').toLowerCase().includes(q) ||
      (d.phone || '').toLowerCase().includes(q) ||
      (d.linkedUserUsername || '').toLowerCase().includes(q);
    const eff = effectiveStatus(d);
    const matchesStatus =
      driverStatusFilter === 'all'      ? (d.archived !== true || (!!q && matchesSearch)) :
      driverStatusFilter === 'active'   ? (d.archived !== true && eff === DRIVER_STATUS.ACTIVE) :
      driverStatusFilter === 'leave'    ? (d.archived !== true && isLeaveStatus(eff)) :
      driverStatusFilter === 'inactive' ? (d.archived !== true && eff === DRIVER_STATUS.NONAKTIF) :
      driverStatusFilter === 'archived' ? (d.archived === true) : (d.archived !== true);
    return matchesSearch && matchesStatus;
  });

  if (!filtered.length) {
    list.innerHTML = '<div class="v2-admin-empty">Tidak ada driver ditemukan.</div>';
    return;
  }

  list.innerHTML = filtered.map(buildDriverCard).join('');

  list.querySelectorAll('[data-driver-edit]').forEach(btn => {
    btn.addEventListener('click', () => openDriverFormModal(btn.dataset.driverEdit));
  });

  list.querySelectorAll('[data-driver-toggle]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const driverId = btn.dataset.driverToggle;
      const driver = getDrivers().find(d => d.id === driverId);
      if (!driver) return;
      btn.disabled = true;
      try {
        const currentUser = getCurrentUser();
        // Quick toggle works on the EFFECTIVE status: eligible → Nonaktif,
        // otherwise → Aktif (which also ends/clears any leave early).
        const from = effectiveStatus(driver);
        const to = from === DRIVER_STATUS.ACTIVE ? DRIVER_STATUS.NONAKTIF : DRIVER_STATUS.ACTIVE;
        await setDriverStatus(driverId, to, null);
        logAction({
          userId: currentUser?.id, username: currentUser?.username,
          action: 'DRIVER_STATUS_CHANGED', targetId: driverId,
          metadata: { name: driver.name, from, to },
        });
        // Render is handled by registerDriversChangeListener callback once cache is updated.
      } catch (err) {
        showToast(err.message || 'Gagal mengubah status driver.');
        btn.disabled = false;
      }
    });
  });
  list.querySelectorAll('[data-driver-archive]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const driverId = btn.dataset.driverArchive;
      btn.disabled = true;
      try {
        await archiveDriver(driverId);
        logAction({ userId: getCurrentUser()?.id, username: getCurrentUser()?.username, action: 'driver_archived', targetId: driverId });
        showToast('Driver berhasil diarsipkan.');
      } catch (err) {
        showToast(err.message || 'Gagal mengarsipkan driver.', 'error');
        btn.disabled = false;
      }
    });
  });
  list.querySelectorAll('[data-driver-restore]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const driverId = btn.dataset.driverRestore;
      btn.disabled = true;
      try {
        await restoreDriver(driverId);
        logAction({ userId: getCurrentUser()?.id, username: getCurrentUser()?.username, action: 'driver_restored', targetId: driverId });
        showToast('Driver berhasil dipulihkan.');
      } catch (err) {
        showToast(err.message || 'Gagal memulihkan driver.', 'error');
        btn.disabled = false;
      }
    });
  });
  list.querySelectorAll('[data-driver-delete]').forEach(btn => {
    btn.addEventListener('click', () => {
      const driverId = btn.dataset.driverDelete;
      const driver = getDrivers().find(d => d.id === driverId);
      if (!driver) return;
      openDeleteConfirmModal({ type: 'driver', id: driverId, name: driver.name, refCount: countDriverReferences(driver) });
    });
  });
}

/* ============================================================
   V1.5.2 — Vehicle Management Workspace
   ============================================================ */

function initVehicleFormModal() {
  const modal = document.createElement('div');
  modal.id = 'modalVehicleForm';
  modal.className = 'modal-overlay';
  modal.style.display = 'none';
  modal.innerHTML = `
    <div class="modal-box">
      <div class="modal-header">
        <h2 class="modal-title" id="vehicleFormTitle">Tambah Kendaraan</h2>
        <button class="modal-close" id="btnCloseVehicleForm" type="button">&times;</button>
      </div>
      <div class="modal-body">
        <form id="vehicleForm" novalidate>
          <div class="form-section-label">Identitas Aset</div>
          <div class="form-grid">
            <div class="form-group">
              <label for="vehicleFieldName">Nama Kendaraan *</label>
              <input type="text" id="vehicleFieldName" placeholder="Contoh: Innova" required />
            </div>
            <div class="form-group">
              <label for="vehicleFieldType">Tipe Kendaraan *</label>
              <select id="vehicleFieldType">
                ${VEHICLE_TYPE_REGISTRY.map(t => `<option value="${t.key}">${t.label}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label for="vehicleFieldStatus">Status *</label>
              <select id="vehicleFieldStatus">
                ${VEHICLE_STATUS_REGISTRY.map(s => `<option value="${s.key}">${s.labelId}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label for="vehicleFieldCapacity">Kapasitas (kursi) *</label>
              <input type="number" id="vehicleFieldCapacity" placeholder="7" min="1" required />
            </div>
            <div class="form-group">
              <label for="vehicleFieldColor">Warna Timeline</label>
              <div class="v2-vehicle-color-row">
                <input type="color" id="vehicleFieldColor" class="v2-vehicle-color-input" value="#1565C0" />
                <span class="v2-vehicle-color-preview" id="vehicleColorPreview" style="background:#1565C0;"></span>
                <span class="v2-vehicle-color-hex" id="vehicleColorHex">#1565C0</span>
              </div>
            </div>
          </div>
          <div class="form-section-label">Registrasi</div>
          <div class="form-grid">
            <div class="form-group">
              <label for="vehicleFieldPlate">Plat Nomor</label>
              <input type="text" id="vehicleFieldPlate" placeholder="Contoh: B 1234 XYZ" autocomplete="off" />
            </div>
            <div class="form-group">
              <label for="vehicleFieldBrand">Merek</label>
              <input type="text" id="vehicleFieldBrand" placeholder="Toyota" autocomplete="off" />
            </div>
            <div class="form-group">
              <label for="vehicleFieldModel">Model</label>
              <input type="text" id="vehicleFieldModel" placeholder="Innova Reborn" autocomplete="off" />
            </div>
            <div class="form-group">
              <label for="vehicleFieldYear">Tahun</label>
              <input type="number" id="vehicleFieldYear" placeholder="2022" min="1950" max="2100" />
            </div>
            <div class="form-group">
              <label for="vehicleFieldFuel">Bahan Bakar</label>
              <select id="vehicleFieldFuel">
                <option value="">—</option>
                ${FUEL_TYPES.map(f => `<option value="${f}">${f}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label for="vehicleFieldTransmission">Transmisi</label>
              <select id="vehicleFieldTransmission">
                <option value="">—</option>
                ${TRANSMISSION_TYPES.map(t => `<option value="${t}">${t}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label for="vehicleFieldEngineNumber">No. Mesin</label>
              <input type="text" id="vehicleFieldEngineNumber" autocomplete="off" />
            </div>
            <div class="form-group">
              <label for="vehicleFieldChassisNumber">No. Rangka</label>
              <input type="text" id="vehicleFieldChassisNumber" autocomplete="off" />
            </div>
            <div class="form-group">
              <label for="vehicleFieldOwner">Pemilik</label>
              <input type="text" id="vehicleFieldOwner" placeholder="PBSI" autocomplete="off" />
            </div>
            <div class="form-group">
              <label for="vehicleFieldRegion">Wilayah Registrasi</label>
              <input type="text" id="vehicleFieldRegion" placeholder="DKI Jakarta" autocomplete="off" />
            </div>
            <div class="form-group">
              <label for="vehicleFieldOdometer">Odometer (km)</label>
              <input type="number" id="vehicleFieldOdometer" min="0" />
            </div>
            <div class="form-group">
              <label for="vehicleFieldAcqDate">Tgl Akuisisi</label>
              <input type="date" id="vehicleFieldAcqDate" />
            </div>
            <div class="form-group">
              <label for="vehicleFieldAcqValue">Nilai Akuisisi (Rp)</label>
              <input type="text" id="vehicleFieldAcqValue" autocomplete="off" />
            </div>
          </div>
          <div class="form-section-label">Legal &amp; Pajak</div>
          <div class="form-grid">
            <div class="form-group">
              <label for="vehicleFieldStnkNumber">No. STNK</label>
              <input type="text" id="vehicleFieldStnkNumber" autocomplete="off" />
            </div>
            <div class="form-group">
              <label for="vehicleFieldStnkExpiry">Masa Berlaku STNK</label>
              <input type="date" id="vehicleFieldStnkExpiry" />
            </div>
            <div class="form-group">
              <label for="vehicleFieldAnnualTax">Pajak Tahunan Jatuh Tempo</label>
              <input type="date" id="vehicleFieldAnnualTax" />
            </div>
            <div class="form-group">
              <label for="vehicleFieldFiveYearTax">Pajak 5 Tahunan Jatuh Tempo</label>
              <input type="date" id="vehicleFieldFiveYearTax" />
            </div>
          </div>
          <div class="form-section-label">Asuransi</div>
          <div class="form-grid">
            <div class="form-group">
              <label for="vehicleFieldInsCompany">Perusahaan Asuransi</label>
              <input type="text" id="vehicleFieldInsCompany" autocomplete="off" />
            </div>
            <div class="form-group">
              <label for="vehicleFieldPolicyNumber">No. Polis</label>
              <input type="text" id="vehicleFieldPolicyNumber" autocomplete="off" />
            </div>
            <div class="form-group">
              <label for="vehicleFieldCoverage">Cakupan</label>
              <input type="text" id="vehicleFieldCoverage" placeholder="All Risk / TLO" autocomplete="off" />
            </div>
            <div class="form-group">
              <label for="vehicleFieldInsExpiry">Masa Berlaku Asuransi</label>
              <input type="date" id="vehicleFieldInsExpiry" />
            </div>
          </div>
          <div class="form-actions">
            <button type="button" class="btn-secondary" id="btnCancelVehicleForm">Batal</button>
            <button type="submit" class="btn-primary" id="btnSaveVehicleForm">Tambah Kendaraan</button>
          </div>
        </form>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  document.getElementById('btnCloseVehicleForm')?.addEventListener('click', closeVehicleFormModal);
  document.getElementById('btnCancelVehicleForm')?.addEventListener('click', closeVehicleFormModal);
  modal.addEventListener('click', e => { if (e.target === modal) closeVehicleFormModal(); });
  document.getElementById('vehicleForm')?.addEventListener('submit', handleVehicleFormSubmit);
  document.getElementById('vehicleFieldColor')?.addEventListener('input', e => {
    const hex = e.target.value;
    const preview = document.getElementById('vehicleColorPreview');
    const hexLabel = document.getElementById('vehicleColorHex');
    if (preview) preview.style.background = hex;
    if (hexLabel) hexLabel.textContent = hex;
  });
}

function openVehicleFormModal(vehicleId = null) {
  editingVehicleId = vehicleId;
  const form = document.getElementById('vehicleForm');
  if (!form) return;
  form.reset();

  const title   = document.getElementById('vehicleFormTitle');
  const btnSave = document.getElementById('btnSaveVehicleForm');

  const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val == null ? '' : val; };
  const syncColor = (color) => {
    const preview = document.getElementById('vehicleColorPreview');
    const hexLabel = document.getElementById('vehicleColorHex');
    if (preview)  preview.style.background = color;
    if (hexLabel) hexLabel.textContent = color;
  };

  if (vehicleId) {
    const vehicle = getVehicles().find(v => v.id === vehicleId);
    if (!vehicle) return;
    if (title)   title.textContent   = 'Edit Kendaraan';
    if (btnSave) btnSave.textContent = 'Simpan Perubahan';
    const color = vehicle.color || '#1565C0';
    setVal('vehicleFieldName', vehicle.name);
    setVal('vehicleFieldType', vehicle.type || 'mobil');
    setVal('vehicleFieldStatus', vehicle.status || (vehicle.active === false ? 'inactive' : 'active'));
    setVal('vehicleFieldCapacity', vehicle.capacity);
    setVal('vehicleFieldColor', color);
    setVal('vehicleFieldPlate', vehicle.plateNumber);
    setVal('vehicleFieldBrand', vehicle.brand);
    setVal('vehicleFieldModel', vehicle.model);
    setVal('vehicleFieldYear', vehicle.year);
    setVal('vehicleFieldFuel', vehicle.fuel);
    setVal('vehicleFieldTransmission', vehicle.transmission);
    setVal('vehicleFieldEngineNumber', vehicle.engineNumber);
    setVal('vehicleFieldChassisNumber', vehicle.chassisNumber);
    setVal('vehicleFieldOwner', vehicle.owner);
    setVal('vehicleFieldRegion', vehicle.registrationRegion);
    setVal('vehicleFieldOdometer', vehicle.odometer);
    setVal('vehicleFieldAcqDate', vehicle.acquisitionDate);
    setVal('vehicleFieldAcqValue', vehicle.acquisitionValue);
    setVal('vehicleFieldStnkNumber', vehicle.stnkNumber);
    setVal('vehicleFieldStnkExpiry', vehicle.stnkExpiry);
    setVal('vehicleFieldAnnualTax', vehicle.annualTaxDue);
    setVal('vehicleFieldFiveYearTax', vehicle.fiveYearTaxDue);
    setVal('vehicleFieldInsCompany', vehicle.insuranceCompany);
    setVal('vehicleFieldPolicyNumber', vehicle.policyNumber);
    setVal('vehicleFieldCoverage', vehicle.coverage);
    setVal('vehicleFieldInsExpiry', vehicle.insuranceExpiry);
    syncColor(color);
  } else {
    if (title)   title.textContent   = 'Tambah Kendaraan';
    if (btnSave) btnSave.textContent = 'Tambah Kendaraan';
    setVal('vehicleFieldType', 'mobil');
    setVal('vehicleFieldStatus', 'active');
    const defaultColor = '#1565C0';
    setVal('vehicleFieldColor', defaultColor);
    syncColor(defaultColor);
  }

  const modal = document.getElementById('modalVehicleForm');
  if (modal) modal.style.display = 'flex';
}

function closeVehicleFormModal() {
  const modal = document.getElementById('modalVehicleForm');
  if (modal) modal.style.display = 'none';
  editingVehicleId = null;
}

async function handleVehicleFormSubmit(event) {
  event.preventDefault();
  const val = (id) => (document.getElementById(id)?.value ?? '').trim();
  const name        = val('vehicleFieldName');
  const plateNumber = val('vehicleFieldPlate');
  const capacity    = document.getElementById('vehicleFieldCapacity')?.value || '';
  const color       = document.getElementById('vehicleFieldColor')?.value || '#1565C0';
  const type        = val('vehicleFieldType') || 'mobil';
  const status      = val('vehicleFieldStatus') || 'active';
  const assetFields = {
    brand: val('vehicleFieldBrand'),
    model: val('vehicleFieldModel'),
    year: val('vehicleFieldYear'),
    fuel: val('vehicleFieldFuel'),
    transmission: val('vehicleFieldTransmission'),
    engineNumber: val('vehicleFieldEngineNumber'),
    chassisNumber: val('vehicleFieldChassisNumber'),
    owner: val('vehicleFieldOwner'),
    registrationRegion: val('vehicleFieldRegion'),
    odometer: val('vehicleFieldOdometer'),
    acquisitionDate: val('vehicleFieldAcqDate'),
    acquisitionValue: val('vehicleFieldAcqValue'),
    stnkNumber: val('vehicleFieldStnkNumber'),
    stnkExpiry: val('vehicleFieldStnkExpiry'),
    annualTaxDue: val('vehicleFieldAnnualTax'),
    fiveYearTaxDue: val('vehicleFieldFiveYearTax'),
    insuranceCompany: val('vehicleFieldInsCompany'),
    policyNumber: val('vehicleFieldPolicyNumber'),
    coverage: val('vehicleFieldCoverage'),
    insuranceExpiry: val('vehicleFieldInsExpiry'),
  };

  const btn = document.getElementById('btnSaveVehicleForm');
  if (btn) btn.disabled = true;

  try {
    const currentUser = getCurrentUser();
    if (editingVehicleId) {
      await updateVehicle(editingVehicleId, { name, plateNumber, capacity, color, type, status, ...assetFields });
      logAction({
        userId:   currentUser?.id,
        username: currentUser?.username,
        action:   'vehicle_updated',
        targetId: editingVehicleId,
        metadata: { name, type, status },
      });
      showToast('Kendaraan berhasil diperbarui.');
    } else {
      const newVehicle = await createVehicle({ name, plateNumber, capacity, color, type, status, ...assetFields });
      logAction({
        userId:   currentUser?.id,
        username: currentUser?.username,
        action:   'vehicle_created',
        targetId: newVehicle.id,
        metadata: { name, type, status },
      });
      showToast('Kendaraan baru berhasil ditambahkan.');
    }
    closeVehicleFormModal();
  } catch (err) {
    showToast(err.message || 'Gagal menyimpan kendaraan.');
  } finally {
    if (btn) btn.disabled = false;
  }
}

/* ── Vehicle Inventory presentation helpers (v1.18.2) ────────────────────────
   The asset card is a pure NAVIGATION object: the whole card opens the detail
   drawer; it carries NO inline action buttons (all lifecycle actions live in the
   drawer footer). It reuses the platform pill vocabulary and tokens — a vehicle
   is an asset, so it does NOT reuse the People card (.v2-user-card). */

function _vmShortDate(s) {
  if (!s) return '—';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return String(s);
  const mo = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'][d.getMonth()];
  return `${String(d.getDate()).padStart(2,'0')} ${mo} ${d.getFullYear()}`;
}

// Read-only VIEW index: the latest assignment per vehicle NAME, derived from the
// already-loaded in-memory `assignments` (no service/analytics/dispatch call).
// Used only to render the card's "last activity" line.
function _latestAssignmentByVehicle() {
  const map = new Map();
  for (const a of (Array.isArray(assignments) ? assignments : [])) {
    const key = String(a.vehicle || '').trim();
    if (!key) continue;
    const ts = `${a.date || ''} ${a.startTime || ''}`;
    const cur = map.get(key);
    if (!cur || ts > cur.ts) map.set(key, { ts, driver: String(a.driver || '').trim(), date: a.date || '' });
  }
  return map;
}

// v1.18.2 — executive ASSET card. Accepts a NORMALIZED asset
// (vehicle-asset-service) + an optional last-activity record. Entire card opens
// the Apple-style detail drawer (data-vehicle-detail). No inline buttons.
function buildVehicleCard(asset, lastActivity) {
  const archived = asset.archived === true;
  const active   = asset.status === 'active';
  const plate    = asset.plateNumber || 'Tanpa plat';
  // Single icon engine (anIcon) — vehicle-type glyph (1.45rem ≈ 23px).
  const typeIcon = anIcon(vehicleTypeIconName(asset.type), { size: 23 });
  const healthTone = ['ok','warn','danger'].includes(asset.health.color) ? asset.health.color : '';
  // Executive Badge System — one pill grammar (tone falls back to neutral).
  const toneClass = (t) => (t === 'ok' || t === 'warn' || t === 'danger' || t === 'info') ? t : 'neutral';
  const pill = (tone, text) => ExecutiveStatusPill(text, tone);

  const meta = [asset.typeInfo.label, asset.year, asset.transmission, asset.fuel]
    .filter(Boolean).map(esc).join(' · ');

  const identity = `
    <div class="vm-asset__top">
      <span class="vm-asset__ico">${typeIcon}</span>
      <div class="vm-asset__id">
        <span class="vm-asset__name">${esc(asset.name || 'Tanpa nama')}</span>
        <span class="vm-asset__plate">${esc(plate)}</span>
      </div>
      <span class="vm-asset__health"><b${healthTone ? ` data-tone="${healthTone}"` : ''}>${esc(asset.health.overall)}</b><i>Health</i></span>
    </div>`;

  if (archived) {
    return `
      <article class="vm-asset vm-asset--archived" data-vehicle-detail="${esc(asset.id)}" role="button" tabindex="0" aria-label="Detail kendaraan ${esc(asset.name)}">
        ${identity}
        ${meta ? `<div class="vm-asset__meta">${meta}</div>` : ''}
        <div class="vm-asset__strip">
          ${ExecutiveStatusPill('Diarsipkan', 'neutral')}
        </div>
        <div class="vm-asset__foot">${anIcon('time-clock', { size: 11 })} <span>Buka untuk pulihkan atau hapus</span></div>
      </article>`;
  }

  const maint = asset.status === 'maintenance'
    ? { tone: 'warn', text: 'Servis' }
    : ((asset.maintenanceSummary?.totalRecords || 0) > 0
        ? { tone: 'ok', text: 'Terawat' }
        : { tone: 'neutral', text: 'Belum ada' });

  const strip = `
    <div class="vm-asset__strip">
      ${pill(toneClass(asset.statusInfo.tone), asset.statusInfo.labelId)}
      ${pill(toneClass(asset.tax.tone), `Pajak: ${asset.tax.label}`)}
      ${pill(toneClass(asset.stnk.tone), `STNK: ${asset.stnk.label}`)}
      ${pill(toneClass(asset.insurance.tone), `Asuransi: ${asset.insurance.label}`)}
      ${pill(maint.tone, maint.text)}
    </div>`;

  const foot = lastActivity
    ? `<div class="vm-asset__foot">${anIcon('time-clock', { size: 11 })} <span>Terakhir: <b>${esc(lastActivity.driver || '—')}</b> · ${esc(_vmShortDate(lastActivity.date))}</span></div>`
    : `<div class="vm-asset__foot">${anIcon('time-clock', { size: 11 })} <span>Belum pernah ditugaskan</span></div>`;

  return `
    <article class="vm-asset${active ? '' : ' vm-asset--inactive'}" data-vehicle-detail="${esc(asset.id)}" role="button" tabindex="0" aria-label="Detail kendaraan ${esc(asset.name)}">
      ${identity}
      ${meta ? `<div class="vm-asset__meta">${meta}</div>` : ''}
      ${strip}
      ${foot}
    </article>`;
}

function renderV2AdminVehicles() {
  const list = document.getElementById('v2AdminVehicleList');
  if (!list) return;

  const allVehicles = getVehicles();

  // v1.18.1 — production hardening. Normalizing the fleet model can throw on a
  // single malformed store record (e.g. a maintenanceRecords RTDB hole). Before,
  // that aborted the whole function AFTER the overview "Total Kendaraan" count
  // had rendered, leaving the Fleet Dashboard + inventory silently blank. Now any
  // failure renders a VISIBLE, diagnosable error state instead of a blank list,
  // and never takes down the surrounding workspace.
  try {
    // Feature 10/11/12 — executive Fleet Dashboard (non-archived inventory).
    injectFleetDashboardStyles();
    const dashHost = document.getElementById('v2FleetDashboard');
    const dashModel = computeFleetAssetModel({ vehicles: allVehicles });
    if (dashHost) dashHost.innerHTML = renderFleetDashboard(dashModel);

    // Full normalized model (incl. archived) — drives the cards + detail drawer.
    _fleetAssetModel = computeFleetAssetModel({ vehicles: allVehicles, includeArchived: true });
  } catch (err) {
    console.error('[VehicleInventory] render failed', err);
    list.innerHTML = '<div class="v2-admin-empty">Gagal memuat inventaris kendaraan. Data armada mungkin tidak valid. Muat ulang halaman; jika berlanjut, hubungi admin sistem.</div>';
    return;
  }

  // Feature 13 — search & filter (type / status / fuel / transmission / query).
  let assets = _fleetAssetModel.vehicles.filter(v => {
    if (vehicleStatusFilter === 'archived') return v.archived;
    if (v.archived) return false;
    if (vehicleStatusFilter === 'all' || vehicleStatusFilter === '') return true;
    if (vehicleStatusFilter === 'inactive') return v.status === 'inactive';
    return v.status === vehicleStatusFilter;
  });
  assets = searchFilterVehicles(assets, {
    query: vehicleSearch,
    type: vehicleTypeFilter,
    fuel: vehicleFuelFilter,
    transmission: vehicleTransmissionFilter,
  });

  if (!assets.length) {
    list.innerHTML = '<div class="v2-admin-empty">Tidak ada kendaraan ditemukan.</div>';
    return;
  }

  const lastByVehicle = _latestAssignmentByVehicle();

  // v1.18.1 — per-card resilience + runtime instrumentation. The previous code
  // built every card in a single .map().join(); if ONE asset made buildVehicleCard
  // throw, the whole expression threw and the grid was left silently blank while
  // the dashboard + toolbar above (already rendered) survived — the exact reported
  // symptom. Now each card is built in isolation: a failure is logged WITH the
  // offending asset and skipped, so every well-formed vehicle still renders.
  const cards = [];
  let cardFailures = 0;
  for (const a of assets) {
    try {
      cards.push(buildVehicleCard(a, lastByVehicle.get(String(a.name || '').trim())));
    } catch (err) {
      cardFailures++;
      console.error('[VehicleInventory] buildVehicleCard threw for asset id=%s', a && a.id, { asset: a, error: err });
    }
  }
  console.log('[VehicleInventory] raw=%d normalized=%d afterFilter=%d cardsBuilt=%d failures=%d container=%o',
    allVehicles.length,
    (_fleetAssetModel && _fleetAssetModel.vehicles ? _fleetAssetModel.vehicles.length : -1),
    assets.length, cards.length, cardFailures, list);

  if (!cards.length) {
    list.innerHTML = '<div class="v2-admin-empty">Inventaris kendaraan gagal dirender — lihat console (Filter [VehicleInventory]) untuk asset yang bermasalah.</div>';
    return;
  }
  list.innerHTML = cards.join('');

  // Card → Apple-style detail drawer. Lifecycle actions live in the drawer footer
  // (cards are pure navigation objects). The handlers are the module-level
  // vehicleDrawerHandlers() — the SINGLE source of truth shared with the
  // Prediction view drawer; the registerVehiclesChangeListener callback re-renders
  // once the cache updates.
  const openDetail = (id) => {
    const asset = findVehicleAsset(_fleetAssetModel, id);
    if (!asset) return;
    openVehicleDetailDrawer(asset, vehicleDrawerHandlers());
  };
  list.querySelectorAll('[data-vehicle-detail]').forEach(card => {
    card.addEventListener('click', () => openDetail(card.dataset.vehicleDetail));
    card.addEventListener('keydown', e => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      openDetail(card.dataset.vehicleDetail);
    });
  });
}

/* ============================================================
   V1.6.0 — Audit Center
   ============================================================ */

const AUDIT_ACTION_LABELS = {
  driver_created:       'Driver Dibuat',
  driver_updated:       'Driver Diperbarui',
  driver_archived:      'Driver Diarsipkan',
  driver_restored:      'Driver Dipulihkan',
  driver_deleted:       'Driver Dihapus',
  driver_deactivated:   'Driver Dinonaktifkan',
  driver_reactivated:   'Driver Diaktifkan',
  user_created:         'User Dibuat',
  user_updated:         'User Diperbarui',
  user_archived:        'User Diarsipkan',
  user_restored:        'User Dipulihkan',
  user_deleted:         'User Dihapus',
  vehicle_created:      'Kendaraan Dibuat',
  vehicle_updated:      'Kendaraan Diperbarui',
  vehicle_archived:     'Kendaraan Diarsipkan',
  vehicle_restored:     'Kendaraan Dipulihkan',
  vehicle_deleted:      'Kendaraan Dihapus',
  vehicle_deactivated:  'Kendaraan Dinonaktifkan',
  vehicle_reactivated:  'Kendaraan Diaktifkan',
  assignment_created:   'Penugasan Dibuat',
  assignment_updated:   'Penugasan Diperbarui',
  assignment_deleted:   'Penugasan Dihapus',
  assignment_started:   'Penugasan Dimulai',
  assignment_completed: 'Penugasan Selesai',
  assignment_cancelled: 'Penugasan Dibatalkan',
  request_created:      'Request Dibuat',
  request_approved:     'Request Disetujui',
  request_rejected:     'Request Ditolak',
  request_updated:      'Request Diperbarui',
  settings_updated:     'Konfigurasi Diperbarui',
};

function inferAuditCategory(log) {
  const action = String(log.action || log.type || '').toLowerCase();
  if (action.includes('user'))       return 'Users';
  if (action.includes('driver'))     return 'Drivers';
  if (action.includes('vehicle'))    return 'Vehicles';
  if (action.includes('assignment')) return 'Assignments';
  if (action.includes('request'))    return 'Requests';
  if (action.includes('login') || action.includes('logout') || action.includes('auth'))
                                     return 'Authentication';
  return 'System';
}

function auditMatchesCategory(log, filter) {
  if (filter === 'all') return true;
  if (filter === 'archive') {
    const action = String(log.action || '').toLowerCase();
    return action.includes('archive') || action.includes('restore');
  }
  const catMap = {
    users: 'Users', drivers: 'Drivers', vehicles: 'Vehicles',
    assignments: 'Assignments', requests: 'Requests',
    authentication: 'Authentication', system: 'System',
  };
  return inferAuditCategory(log) === (catMap[filter] || '');
}

function formatAuditTimestamp(isoString) {
  if (!isoString) return '—';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return String(isoString);
  const months = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agt','Sep','Okt','Nov','Des'];
  const day = String(d.getDate()).padStart(2, '0');
  const mon = months[d.getMonth()];
  const yr  = d.getFullYear();
  const hh  = String(d.getHours()).padStart(2, '0');
  const mm  = String(d.getMinutes()).padStart(2, '0');
  return `${day} ${mon} ${yr} ${hh}:${mm}`;
}

function getAuditActionLabel(action) {
  if (!action) return '—';
  return AUDIT_ACTION_LABELS[action] || String(action)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

function buildAuditSummary(log) {
  const meta   = log.metadata || {};
  const action = String(log.action || '').toLowerCase();
  if (action.includes('driver')) {
    const name = meta.name || log.targetId;
    if (name) return `Driver: ${name}`;
  }
  if (action.includes('vehicle')) {
    const name = meta.name || log.targetId;
    if (name) return `Kendaraan: ${name}`;
  }
  if (action.includes('user')) {
    const name = meta.name || meta.displayName || log.targetId;
    if (name) return `User: ${name}`;
  }
  if (action.includes('assignment')) {
    const parts = [];
    if (meta.driver)      parts.push(`Driver: ${meta.driver}`);
    if (meta.destination) parts.push(`Tujuan: ${meta.destination}`);
    if (meta.date)        parts.push(meta.date);
    if (parts.length)     return parts.join(' · ');
    if (log.targetId)     return `ID: ${log.targetId}`;
  }
  if (action.includes('request')) {
    const parts = [];
    if (meta.driver)          parts.push(`Driver: ${meta.driver}`);
    if (meta.assignmentCount > 1) parts.push(`${meta.assignmentCount} assignment`);
    if (parts.length)         return parts.join(' · ');
    if (log.targetId)         return `ID: ${log.targetId}`;
  }
  if (log.targetId) return `ID: ${log.targetId}`;
  return '—';
}

function buildAuditRow(log) {
  const category = inferAuditCategory(log);
  const catKey   = category.toLowerCase().replace(/[^a-z]/g, '');
  const ts       = esc(formatAuditTimestamp(log.timestamp));
  const actor    = esc(log.displayName || log.username || log.userId || '—');
  const action   = esc(getAuditActionLabel(log.action || log.type));
  const summary  = esc(buildAuditSummary(log));
  return `
    <div class="v2-audit-row" data-audit-id="${esc(log.id || '')}" role="button" tabindex="0">
      <div class="v2-audit-col v2-audit-col--time">${ts}</div>
      <div class="v2-audit-col v2-audit-col--actor">${actor}</div>
      <div class="v2-audit-col v2-audit-col--action">${action}</div>
      <div class="v2-audit-col v2-audit-col--category">
        <span class="v2-audit-cat-pill v2-audit-cat--${esc(catKey)}">${esc(category)}</span>
      </div>
      <div class="v2-audit-col v2-audit-col--summary">${summary}</div>
    </div>`;
}

function renderAuditCenter() {
  const list = document.getElementById('v2AuditList');
  if (!list) return;

  const q       = auditSearch.toLowerCase().trim();
  const dateStr = auditDateFilter;

  const filtered = auditLogs.filter(log => {
    if (!auditMatchesCategory(log, auditCategoryFilter)) return false;
    if (auditActorFilter) {
      if ((log.username || '') !== auditActorFilter) return false;
    }
    if (dateStr) {
      if (!(log.timestamp || '').startsWith(dateStr)) return false;
    }
    if (q) {
      const actor   = (log.username || log.displayName || '').toLowerCase();
      const action  = (log.action   || log.type        || '').toLowerCase();
      const metaStr = JSON.stringify(log.metadata || {}).toLowerCase();
      const summary = buildAuditSummary(log).toLowerCase();
      if (!actor.includes(q) && !action.includes(q) && !metaStr.includes(q) && !summary.includes(q)) return false;
    }
    return true;
  });

  if (!filtered.length) {
    list.innerHTML = '<div class="v2-admin-empty">Tidak ada log ditemukan.</div>';
    return;
  }

  list.innerHTML = `
    <div class="v2-audit-header-row" aria-hidden="true">
      <div class="v2-audit-col v2-audit-col--time">Waktu</div>
      <div class="v2-audit-col v2-audit-col--actor">Aktor</div>
      <div class="v2-audit-col v2-audit-col--action">Aksi</div>
      <div class="v2-audit-col v2-audit-col--category">Kategori</div>
      <div class="v2-audit-col v2-audit-col--summary">Ringkasan</div>
    </div>
    ${filtered.map(buildAuditRow).join('')}
  `;

  list.querySelectorAll('[data-audit-id]').forEach(row => {
    const open = () => {
      const log = auditLogs.find(l => l.id === row.dataset.auditId);
      if (log) openAuditDetailModal(log);
    };
    row.addEventListener('click', open);
    row.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
    });
  });
}

function initAuditDetailModal() {
  const modal = document.createElement('div');
  modal.id = 'modalAuditDetail';
  modal.className = 'modal-overlay';
  modal.style.display = 'none';
  modal.innerHTML = `
    <div class="modal-box v2-audit-detail-box">
      <div class="modal-header">
        <h2 class="modal-title">Detail Log</h2>
        <button class="modal-close" id="btnCloseAuditDetail" type="button">&times;</button>
      </div>
      <div class="modal-body" id="auditDetailBody"></div>
    </div>
  `;
  document.body.appendChild(modal);
  document.getElementById('btnCloseAuditDetail')?.addEventListener('click', closeAuditDetailModal);
  modal.addEventListener('click', e => { if (e.target === modal) closeAuditDetailModal(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && modal.style.display !== 'none') closeAuditDetailModal();
  });
}

function buildAuditHumanDetails(log) {
  const meta   = log.metadata || {};
  const action = String(log.action || log.type || '');
  const humanFields = [];
  const changeItems = [];

  const f = (label, value, bold = false) => {
    const v = value == null ? '' : String(value);
    if (v !== '' && v !== 'null' && v !== 'undefined') humanFields.push({ label, value: v, bold });
  };
  const chg = (label, from, to) => changeItems.push({ label, from: String(from), to: String(to) });

  switch (action) {
    case 'driver_created':
    case 'driver_updated':
      f('Nama Driver',  meta.name,                             true);
      f('Status',       meta.active !== false ? 'Aktif' : 'Nonaktif');
      break;
    case 'driver_archived':
      chg('Status Driver', 'Aktif / Nonaktif', 'Diarsipkan');
      break;
    case 'driver_restored':
      chg('Status Driver', 'Diarsipkan', 'Aktif');
      break;
    case 'driver_deactivated':
      chg('Status Driver', 'Aktif', 'Nonaktif');
      break;
    case 'driver_reactivated':
      chg('Status Driver', 'Nonaktif', 'Aktif');
      break;
    case 'driver_deleted':
      f('Nama Driver', meta.name, true);
      f('Operasi',     'Dihapus Permanen');
      break;

    case 'user_created':
    case 'user_updated':
      f('Nama',    meta.displayName || meta.name);
      f('Username', meta.username || log.targetId);
      f('Role',    meta.role);
      break;
    case 'user_archived':
      chg('Status User', 'Aktif / Nonaktif', 'Diarsipkan');
      break;
    case 'user_restored':
      chg('Status User', 'Diarsipkan', 'Aktif');
      break;
    case 'user_deleted':
      f('Nama User', meta.name, true);
      f('Operasi',   'Dihapus Permanen');
      break;

    case 'vehicle_created':
    case 'vehicle_updated':
      f('Nama Kendaraan', meta.name,                             true);
      f('Status',         meta.active !== false ? 'Aktif' : 'Nonaktif');
      break;
    case 'vehicle_archived':
      chg('Status Kendaraan', 'Aktif / Nonaktif', 'Diarsipkan');
      break;
    case 'vehicle_restored':
      chg('Status Kendaraan', 'Diarsipkan', 'Aktif');
      break;
    case 'vehicle_deactivated':
      chg('Status Kendaraan', 'Aktif', 'Nonaktif');
      break;
    case 'vehicle_reactivated':
      chg('Status Kendaraan', 'Nonaktif', 'Aktif');
      break;
    case 'vehicle_deleted':
      f('Nama Kendaraan', meta.name, true);
      f('Operasi',        'Dihapus Permanen');
      break;

    case 'assignment_created':
      f('Driver',     meta.driver,      true);
      f('Kendaraan',  meta.vehicle);
      f('Tujuan',     meta.destination);
      f('Tanggal',    meta.date);
      if (meta.startTime && meta.endTime) f('Waktu', `${meta.startTime} – ${meta.endTime}`);
      f('Sumber', meta.requestId ? 'Dari Request' : 'Langsung oleh Admin');
      break;
    case 'assignment_started':
      f('Dimulai Oleh',  meta.startedBy);
      if (meta.startedAt)      f('Waktu Mulai',   formatAuditTimestamp(meta.startedAt));
      if (meta.startOdometer != null) f('Odometer Awal', `${meta.startOdometer} km`);
      chg('Status Penugasan', 'Dijadwalkan', 'Berlangsung');
      break;
    case 'assignment_completed':
      f('Driver',            meta.driver,       true);
      f('Tujuan',            meta.destination);
      if (meta.completedAt)  f('Waktu Selesai', formatAuditTimestamp(meta.completedAt));
      f('Diselesaikan Oleh', meta.completedBy);
      if (meta.endOdometer != null)       f('Odometer Akhir', `${meta.endOdometer} km`);
      if (meta.distanceTravelled != null) f('Jarak Tempuh',   `${meta.distanceTravelled} km`);
      chg('Status Penugasan', 'Berlangsung', 'Selesai');
      break;
    case 'assignment_deleted':
      if (meta.beforeCount != null) chg('Jumlah Assignment', `${meta.beforeCount} penugasan`, `${meta.afterCount} penugasan`);
      break;
    case 'assignment_cancelled':
      f('Driver',         meta.driver, true);
      if (meta.destination) f('Tujuan', meta.destination);
      f('Dibatalkan Oleh', meta.cancelledByName || meta.cancelledBy);
      if (meta.cancelledAt) f('Waktu Pembatalan', formatAuditTimestamp(meta.cancelledAt));
      if (meta.reason)     f('Alasan', meta.reason);
      chg('Status Penugasan', 'Aktif', 'Dibatalkan');
      break;

    case 'request_approved':
      f('Driver',            meta.driver, true);
      if (meta.assignmentCount) f('Assignment Dibuat', `${meta.assignmentCount} penugasan`);
      break;

    case 'request_rejected':
      f('Status Request', 'Ditolak oleh Admin');
      break;

    case 'settings_updated': {
      const _groupLabels = {
        operations:    'Pengaturan Operasional',
        notifications: 'Pengaturan Notifikasi',
        system:        'Pengaturan Sistem',
        telegram:      'Pengaturan Telegram',
      };
      f('Konfigurasi', _groupLabels[meta.group] || meta.group || log.targetId || 'Sistem', true);
      if (Array.isArray(meta.changes)) {
        meta.changes.forEach(c => chg(c.field, c.from, c.to));
      }
      break;
    }

    default:
      // For unknown actions, extract any obvious name fields from metadata
      if (meta.name) f('Nama', meta.name, true);
      break;
  }

  return { humanFields, changeItems };
}

function openAuditDetailModal(log) {
  const body = document.getElementById('auditDetailBody');
  if (!body) return;

  const category = inferAuditCategory(log);
  const catKey   = category.toLowerCase().replace(/[^a-z]/g, '');
  const meta     = log.metadata || {};
  const metaJson = JSON.stringify(meta, null, 2);
  const actor    = log.displayName || log.username || '—';
  const showSub  = log.username && log.displayName && log.username !== log.displayName;

  const { humanFields, changeItems } = buildAuditHumanDetails(log);

  const humanHtml = humanFields.length ? `
    <div class="v2-audit-section">
      <div class="v2-audit-section-title">Detail Aktivitas</div>
      <div class="v2-audit-human-grid">
        ${humanFields.map(({ label, value, bold }) => `
          <div class="v2-audit-human-item">
            <span class="v2-audit-human-label">${esc(label)}</span>
            <span class="v2-audit-human-value${bold ? ' v2-audit-human-value--bold' : ''}">${esc(value)}</span>
          </div>`).join('')}
      </div>
    </div>` : '';

  const changesHtml = changeItems.length ? `
    <div class="v2-audit-section">
      <div class="v2-audit-section-title">Perubahan Status</div>
      <div class="v2-audit-changes">
        ${changeItems.map(({ label, from, to }) => `
          <div class="v2-audit-change-item">
            <span class="v2-audit-change-label">${esc(label)}</span>
            <div class="v2-audit-change-flow">
              <span class="v2-audit-change-old">${esc(from)}</span>
              <span class="v2-audit-change-arrow" aria-label="menjadi">↓</span>
              <span class="v2-audit-change-new">${esc(to)}</span>
            </div>
          </div>`).join('')}
      </div>
    </div>` : '';

  const anomalyHtml = log.safety_anomaly ? `
    <div class="v2-audit-section v2-audit-section--warn">
      <div class="v2-audit-section-title v2-audit-section-title--warn">Safety Anomaly</div>
      <span class="v2-audit-human-value v2-audit-detail-warn">${esc(String(log.safety_anomaly))}</span>
    </div>` : '';

  body.innerHTML = `
    <div class="v2-audit-detail">

      <!-- Section 1: Activity Summary -->
      <div class="v2-audit-section v2-audit-section--summary">
        <div class="v2-audit-summary-grid">
          <div class="v2-audit-summary-item">
            <span class="v2-audit-summary-label">Aksi</span>
            <span class="v2-audit-summary-value v2-audit-summary-value--action">${esc(getAuditActionLabel(log.action || log.type))}</span>
          </div>
          <div class="v2-audit-summary-item">
            <span class="v2-audit-summary-label">Aktor</span>
            <span class="v2-audit-summary-value">
              ${esc(actor)}${showSub ? ` <span class="v2-audit-summary-sub">@${esc(log.username)}</span>` : ''}
            </span>
          </div>
          <div class="v2-audit-summary-item">
            <span class="v2-audit-summary-label">Waktu</span>
            <span class="v2-audit-summary-value">${esc(formatAuditTimestamp(log.timestamp))}</span>
          </div>
          <div class="v2-audit-summary-item">
            <span class="v2-audit-summary-label">Kategori</span>
            <span class="v2-audit-summary-value">
              <span class="v2-audit-cat-pill v2-audit-cat--${esc(catKey)}">${esc(category)}</span>
            </span>
          </div>
          ${log.targetId ? `
          <div class="v2-audit-summary-item">
            <span class="v2-audit-summary-label">Target</span>
            <span class="v2-audit-summary-value v2-audit-summary-mono">${esc(log.targetId)}</span>
          </div>` : ''}
        </div>
      </div>

      <!-- Section 2: Human-Readable Details -->
      ${humanHtml}

      <!-- Section 3: Change Detection -->
      ${changesHtml}

      <!-- Safety anomaly warning -->
      ${anomalyHtml}

      <!-- Section 4: Technical Details (collapsed) -->
      <details class="v2-audit-tech-details">
        <summary class="v2-audit-tech-summary">
          <span>Detail Teknis (JSON)</span>
          <svg class="v2-audit-tech-chevron" viewBox="0 0 20 20" fill="currentColor" width="14" height="14" aria-hidden="true">
            <path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd"/>
          </svg>
        </summary>
        <pre class="v2-audit-meta-json">${esc(metaJson)}</pre>
      </details>

    </div>
  `;

  const modal = document.getElementById('modalAuditDetail');
  if (modal) modal.style.display = 'flex';
}

function closeAuditDetailModal() {
  const modal = document.getElementById('modalAuditDetail');
  if (modal) modal.style.display = 'none';
}

/* ============================================================
   V1.7.1 — Configuration Center
   ============================================================ */

function _cfgMinsToTime(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function _cfgTimeToMins(timeStr) {
  const [h, m] = String(timeStr || '00:00').split(':').map(Number);
  return ((h || 0) * 60) + (m || 0);
}

function _cfgMaskToken(token) {
  if (!token) return '—';
  if (token.length <= 10) return '****';
  return token.slice(0, 6) + '****' + token.slice(-4);
}

function renderV2AdminConfig() {
  const container = document.getElementById('v2AdminSectionConfig');
  if (!container) return;

  container.innerHTML = `
    <div class="v2-admin-config-groups">

      <div class="v2-admin-config-group">
        <h3 class="v2-admin-config-group-title">Pengaturan Operasional</h3>
        <div class="v2-admin-config-fields">
          <div class="v2-admin-config-field">
            <label class="v2-admin-config-label" for="cfgWorkStart">Jam Mulai Operasi</label>
            <input type="time" id="cfgWorkStart" class="v2-admin-config-input">
            <p class="v2-admin-config-hint">Digunakan untuk menentukan rentang operasional timeline.</p>
          </div>
          <div class="v2-admin-config-field">
            <label class="v2-admin-config-label" for="cfgWorkEnd">Jam Selesai Operasi</label>
            <input type="time" id="cfgWorkEnd" class="v2-admin-config-input">
            <p class="v2-admin-config-hint">Digunakan untuk menghitung durasi operasional harian.</p>
          </div>
          <div class="v2-admin-config-field">
            <label class="v2-admin-config-label" for="cfgOdometerWarn">Batas Lompatan Odometer</label>
            <div class="v2-admin-config-input-row">
              <input type="number" id="cfgOdometerWarn" class="v2-admin-config-input" min="1" step="1">
              <span class="v2-admin-config-unit">km</span>
            </div>
            <p class="v2-admin-config-hint">Perubahan di atas nilai ini akan ditandai sebagai anomali.</p>
          </div>
        </div>
        <div class="v2-admin-config-footer">
          <button id="cfgResetOps" class="v2-admin-config-ghost-btn" type="button">Reset</button>
          <button id="cfgSaveOps"  class="v2-admin-add-btn" type="button">Simpan</button>
        </div>
      </div>

      <div class="v2-admin-config-group">
        <h3 class="v2-admin-config-group-title">Pengaturan Notifikasi</h3>
        <div class="v2-admin-config-fields">
          <div class="v2-admin-config-field">
            <label class="v2-admin-config-label" for="cfgH2From">H-2 Window Mulai</label>
            <div class="v2-admin-config-input-row">
              <input type="number" id="cfgH2From" class="v2-admin-config-input" min="1" step="1">
              <span class="v2-admin-config-unit">menit</span>
            </div>
            <p class="v2-admin-config-hint">Batas awal pengiriman pengingat H-2.</p>
          </div>
          <div class="v2-admin-config-field">
            <label class="v2-admin-config-label" for="cfgH2To">H-2 Window Selesai</label>
            <div class="v2-admin-config-input-row">
              <input type="number" id="cfgH2To" class="v2-admin-config-input" min="1" step="1">
              <span class="v2-admin-config-unit">menit</span>
            </div>
            <p class="v2-admin-config-hint">Batas akhir pengiriman pengingat H-2.</p>
          </div>
          <div class="v2-admin-config-field">
            <label class="v2-admin-config-label" for="cfgH1Interval">Interval Pengingat H-1</label>
            <div class="v2-admin-config-input-row">
              <input type="number" id="cfgH1Interval" class="v2-admin-config-input" min="1" step="1">
              <span class="v2-admin-config-unit">menit</span>
            </div>
            <p class="v2-admin-config-hint">Frekuensi pengecekan reminder H-1.</p>
          </div>
          <div class="v2-admin-config-field">
            <label class="v2-admin-config-label" for="cfgH2Interval">Interval Pengingat H-2</label>
            <div class="v2-admin-config-input-row">
              <input type="number" id="cfgH2Interval" class="v2-admin-config-input" min="1" step="1">
              <span class="v2-admin-config-unit">menit</span>
            </div>
            <p class="v2-admin-config-hint">Frekuensi pengecekan reminder H-2.</p>
          </div>
        </div>
        <div class="v2-admin-config-footer">
          <button id="cfgResetNotif" class="v2-admin-config-ghost-btn" type="button">Reset</button>
          <button id="cfgSaveNotif"  class="v2-admin-add-btn" type="button">Simpan</button>
        </div>
      </div>

      <div class="v2-admin-config-group">
        <h3 class="v2-admin-config-group-title">Pengaturan Sistem</h3>
        <div class="v2-admin-config-fields">
          <div class="v2-admin-config-field">
            <label class="v2-admin-config-label" for="cfgBackupDays">Retensi Backup</label>
            <div class="v2-admin-config-input-row">
              <input type="number" id="cfgBackupDays" class="v2-admin-config-input" min="1" step="1">
              <span class="v2-admin-config-unit">hari</span>
            </div>
            <p class="v2-admin-config-hint">Jumlah hari data backup dipertahankan.</p>
          </div>
        </div>
        <div class="v2-admin-config-footer">
          <button id="cfgResetSystem" class="v2-admin-config-ghost-btn" type="button">Reset</button>
          <button id="cfgSaveSystem"  class="v2-admin-add-btn" type="button">Simpan</button>
        </div>
      </div>

      <div class="v2-admin-config-group">
        <h3 class="v2-admin-config-group-title">Pengaturan Telegram</h3>
        <div class="v2-admin-config-fields">
          <div class="v2-admin-config-field">
            <label class="v2-admin-config-label">Status Telegram</label>
            <div class="v2-admin-config-status" id="cfgTelegramStatus"></div>
          </div>
          <div class="v2-admin-config-field">
            <label class="v2-admin-config-label">Bot Token</label>
            <div class="v2-admin-config-token-display" id="cfgTokenDisplay"></div>
            <div class="v2-admin-config-token-actions">
              <button id="cfgTokenToggle" class="v2-admin-config-ghost-btn" type="button">Tampilkan</button>
              <button id="cfgTokenEdit"   class="v2-admin-config-ghost-btn" type="button">Perbarui Token</button>
            </div>
          </div>
          <div class="v2-admin-config-field" id="cfgTokenEditField" style="display:none;">
            <label class="v2-admin-config-label" for="cfgTokenInput">Token Baru</label>
            <input type="text" id="cfgTokenInput" class="v2-admin-config-input"
                   placeholder="Masukkan bot token baru…" autocomplete="off" spellcheck="false">
          </div>
        </div>
        <div class="v2-admin-config-footer">
          <button id="cfgResetTelegram" class="v2-admin-config-ghost-btn" type="button" style="display:none;">Batal</button>
          <button id="cfgSaveTelegram"  class="v2-admin-add-btn" type="button" style="display:none;">Simpan Token</button>
        </div>
      </div>

      <!-- PWA group — read-only diagnostics, dynamic content filled by _refreshPwaConfigGroup() -->
      <div class="v2-admin-config-group">
        <h3 class="v2-admin-config-group-title">Progressive Web App</h3>
        <p class="v2-admin-config-hint" style="margin-bottom:14px;">Status instalasi dan diagnostik PWA. Hanya baca.</p>
        <div class="v2-pwa-status-grid" id="cfgPwaStatusGrid"></div>
        <div class="v2-admin-config-footer v2-pwa-action-footer" id="cfgPwaActionFooter"></div>
      </div>

    </div>
  `;

  // ── Set field values (programmatic — no user-controlled data in innerHTML) ──
  document.getElementById('cfgWorkStart').value    = _cfgMinsToTime(getSetting('operations.workStartMins'));
  document.getElementById('cfgWorkEnd').value      = _cfgMinsToTime(getSetting('operations.workEndMins'));
  document.getElementById('cfgOdometerWarn').value = getSetting('operations.odometerWarnJumpKm');
  document.getElementById('cfgH2From').value       = getSetting('notifications.h2WindowMinFrom');
  document.getElementById('cfgH2To').value         = getSetting('notifications.h2WindowMinTo');
  document.getElementById('cfgH1Interval').value   = Math.round(getSetting('notifications.h1ReminderCheckIntervalMs') / 60000);
  document.getElementById('cfgH2Interval').value   = Math.round(getSetting('notifications.h2ReminderCheckIntervalMs') / 60000);
  document.getElementById('cfgBackupDays').value   = getSetting('system.backupRetentionDays');

  // ── Telegram status block ─────────────────────────────────────
  const telegramStatusEl = document.getElementById('cfgTelegramStatus');
  const _setTelegramStatus = () => {
    const tok = getSetting('telegram.botToken') || '';
    telegramStatusEl.textContent = '';
    const dot = document.createElement('span');
    dot.className = `v2-admin-config-status-dot${tok ? ' v2-admin-config-status-dot--online' : ''}`;
    dot.setAttribute('aria-hidden', 'true');
    telegramStatusEl.appendChild(dot);
    telegramStatusEl.append(tok ? ' Terhubung' : ' Tidak terhubung');
  };
  _setTelegramStatus();

  // ── Token display: masked by default ─────────────────────────
  let _tokenVisible = false;
  const tokenDisplay   = document.getElementById('cfgTokenDisplay');
  const tokenToggleBtn = document.getElementById('cfgTokenToggle');
  const _refreshTokenDisplay = () => {
    const tok = getSetting('telegram.botToken') || '';
    tokenDisplay.textContent   = _tokenVisible ? (tok || '—') : _cfgMaskToken(tok);
    tokenToggleBtn.textContent = _tokenVisible ? 'Sembunyikan' : 'Tampilkan';
    tokenToggleBtn.disabled    = !tok;
  };
  _refreshTokenDisplay();

  tokenToggleBtn.addEventListener('click', () => {
    _tokenVisible = !_tokenVisible;
    _refreshTokenDisplay();
  });

  // ── Token edit toggle ─────────────────────────────────────────
  const tokenEditBtn    = document.getElementById('cfgTokenEdit');
  const tokenEditField  = document.getElementById('cfgTokenEditField');
  const tokenSaveBtn    = document.getElementById('cfgSaveTelegram');
  const tokenResetBtn   = document.getElementById('cfgResetTelegram');
  let _editingToken = false;

  const _closeTokenEdit = () => {
    _editingToken = false;
    tokenEditField.style.display = 'none';
    tokenSaveBtn.style.display   = 'none';
    tokenResetBtn.style.display  = 'none';
    tokenEditBtn.textContent     = 'Perbarui Token';
    document.getElementById('cfgTokenInput').value = '';
  };

  tokenEditBtn.addEventListener('click', () => {
    _editingToken = !_editingToken;
    tokenEditField.style.display = _editingToken ? '' : 'none';
    tokenSaveBtn.style.display   = _editingToken ? '' : 'none';
    tokenResetBtn.style.display  = _editingToken ? '' : 'none';
    tokenEditBtn.textContent     = _editingToken ? 'Batal' : 'Perbarui Token';
    if (_editingToken) {
      const inp = document.getElementById('cfgTokenInput');
      inp.value = '';
      inp.focus();
    }
  });

  tokenResetBtn.addEventListener('click', () => {
    _closeTokenEdit();
    _tokenVisible = false;
    _refreshTokenDisplay();
    showToast('Perubahan dibatalkan.');
  });

  tokenSaveBtn.addEventListener('click', async function() {
    const btn = this;
    const newToken = (document.getElementById('cfgTokenInput')?.value || '').trim();
    if (!newToken) { showToast('Token tidak boleh kosong.'); return; }
    btn.disabled = true;
    try {
      await updateSetting('telegram.botToken', newToken);
      setTelegramBotToken(newToken);
      logAction({
        userId: getCurrentUser()?.id, username: getCurrentUser()?.username,
        action: 'settings_updated', targetId: 'telegram',
        metadata: { group: 'telegram', changes: [{ field: 'Bot Token', from: '(tersembunyi)', to: '(diperbarui)' }] },
      });
      showToast('Token Telegram berhasil disimpan.');
      _closeTokenEdit();
      _tokenVisible = false;
      _refreshTokenDisplay();
      _setTelegramStatus();
    } catch (err) {
      showToast(err.message || 'Gagal menyimpan token Telegram.');
    } finally { btn.disabled = false; }
  });

  // ── Operational save ─────────────────────────────────────────
  document.getElementById('cfgResetOps')?.addEventListener('click', () => {
    document.getElementById('cfgWorkStart').value    = _cfgMinsToTime(getSetting('operations.workStartMins'));
    document.getElementById('cfgWorkEnd').value      = _cfgMinsToTime(getSetting('operations.workEndMins'));
    document.getElementById('cfgOdometerWarn').value = getSetting('operations.odometerWarnJumpKm');
    showToast('Perubahan dibatalkan.');
  });

  document.getElementById('cfgSaveOps')?.addEventListener('click', async function() {
    const btn = this;
    const newStart = _cfgTimeToMins(document.getElementById('cfgWorkStart').value);
    const newEnd   = _cfgTimeToMins(document.getElementById('cfgWorkEnd').value);
    const newOdom  = parseInt(document.getElementById('cfgOdometerWarn').value, 10);

    if (isNaN(newStart) || isNaN(newEnd) || newStart >= newEnd) {
      showToast('Jam mulai harus lebih awal dari jam selesai.'); return;
    }
    if (!Number.isFinite(newOdom) || newOdom < 1) {
      showToast('Batas lompatan odometer harus lebih dari 0 km.'); return;
    }
    btn.disabled = true;
    try {
      const prevStart = getSetting('operations.workStartMins');
      const prevEnd   = getSetting('operations.workEndMins');
      const prevOdom  = getSetting('operations.odometerWarnJumpKm');
      const saves = [];
      const changes = [];
      if (newStart !== prevStart) {
        saves.push(updateSetting('operations.workStartMins', newStart));
        changes.push({ field: 'Jam Mulai Operasi', from: _cfgMinsToTime(prevStart), to: _cfgMinsToTime(newStart) });
      }
      if (newEnd !== prevEnd) {
        saves.push(updateSetting('operations.workEndMins', newEnd));
        changes.push({ field: 'Jam Selesai Operasi', from: _cfgMinsToTime(prevEnd), to: _cfgMinsToTime(newEnd) });
      }
      if (newOdom !== prevOdom) {
        saves.push(updateSetting('operations.odometerWarnJumpKm', newOdom));
        changes.push({ field: 'Batas Odometer', from: `${prevOdom} km`, to: `${newOdom} km` });
      }
      if (!saves.length) { showToast('Tidak ada perubahan.'); return; }
      await Promise.all(saves);
      logAction({
        userId: getCurrentUser()?.id, username: getCurrentUser()?.username,
        action: 'settings_updated', targetId: 'operations',
        metadata: { group: 'operations', changes },
      });
      showToast('Pengaturan operasional berhasil disimpan.');
    } catch (err) {
      showToast(err.message || 'Gagal menyimpan pengaturan operasional.');
    } finally { btn.disabled = false; }
  });

  // ── Notification save ─────────────────────────────────────────
  document.getElementById('cfgResetNotif')?.addEventListener('click', () => {
    document.getElementById('cfgH2From').value      = getSetting('notifications.h2WindowMinFrom');
    document.getElementById('cfgH2To').value        = getSetting('notifications.h2WindowMinTo');
    document.getElementById('cfgH1Interval').value  = Math.round(getSetting('notifications.h1ReminderCheckIntervalMs') / 60000);
    document.getElementById('cfgH2Interval').value  = Math.round(getSetting('notifications.h2ReminderCheckIntervalMs') / 60000);
    showToast('Perubahan dibatalkan.');
  });

  document.getElementById('cfgSaveNotif')?.addEventListener('click', async function() {
    const btn = this;
    const newH2From = parseInt(document.getElementById('cfgH2From').value, 10);
    const newH2To   = parseInt(document.getElementById('cfgH2To').value, 10);
    const newH1Mins = parseInt(document.getElementById('cfgH1Interval').value, 10);
    const newH2Mins = parseInt(document.getElementById('cfgH2Interval').value, 10);

    if (!Number.isFinite(newH2From) || newH2From < 1 || !Number.isFinite(newH2To) || newH2To < 1 || newH2From >= newH2To) {
      showToast('H-2 Window Mulai harus lebih kecil dari H-2 Window Selesai.'); return;
    }
    if (!Number.isFinite(newH1Mins) || newH1Mins < 1) { showToast('Interval H-1 harus lebih dari 0 menit.'); return; }
    if (!Number.isFinite(newH2Mins) || newH2Mins < 1) { showToast('Interval H-2 harus lebih dari 0 menit.'); return; }

    btn.disabled = true;
    try {
      const prevH2From = getSetting('notifications.h2WindowMinFrom');
      const prevH2To   = getSetting('notifications.h2WindowMinTo');
      const prevH1Mins = Math.round(getSetting('notifications.h1ReminderCheckIntervalMs') / 60000);
      const prevH2Mins = Math.round(getSetting('notifications.h2ReminderCheckIntervalMs') / 60000);
      const saves = [];
      const changes = [];
      if (newH2From !== prevH2From) {
        saves.push(updateSetting('notifications.h2WindowMinFrom', newH2From));
        changes.push({ field: 'H-2 Window Mulai', from: `${prevH2From} menit`, to: `${newH2From} menit` });
      }
      if (newH2To !== prevH2To) {
        saves.push(updateSetting('notifications.h2WindowMinTo', newH2To));
        changes.push({ field: 'H-2 Window Selesai', from: `${prevH2To} menit`, to: `${newH2To} menit` });
      }
      if (newH1Mins !== prevH1Mins) {
        saves.push(updateSetting('notifications.h1ReminderCheckIntervalMs', newH1Mins * 60000));
        changes.push({ field: 'Interval Pengingat H-1', from: `${prevH1Mins} menit`, to: `${newH1Mins} menit` });
      }
      if (newH2Mins !== prevH2Mins) {
        saves.push(updateSetting('notifications.h2ReminderCheckIntervalMs', newH2Mins * 60000));
        changes.push({ field: 'Interval Pengingat H-2', from: `${prevH2Mins} menit`, to: `${newH2Mins} menit` });
      }
      if (!saves.length) { showToast('Tidak ada perubahan.'); return; }
      await Promise.all(saves);
      logAction({
        userId: getCurrentUser()?.id, username: getCurrentUser()?.username,
        action: 'settings_updated', targetId: 'notifications',
        metadata: { group: 'notifications', changes },
      });
      showToast('Pengaturan notifikasi berhasil disimpan.');
    } catch (err) {
      showToast(err.message || 'Gagal menyimpan pengaturan notifikasi.');
    } finally { btn.disabled = false; }
  });

  // ── System save ───────────────────────────────────────────────
  document.getElementById('cfgResetSystem')?.addEventListener('click', () => {
    document.getElementById('cfgBackupDays').value = getSetting('system.backupRetentionDays');
    showToast('Perubahan dibatalkan.');
  });

  document.getElementById('cfgSaveSystem')?.addEventListener('click', async function() {
    const btn = this;
    const newDays = parseInt(document.getElementById('cfgBackupDays').value, 10);
    if (!Number.isFinite(newDays) || newDays < 1) {
      showToast('Retensi backup harus lebih dari 0 hari.'); return;
    }
    const prevDays = getSetting('system.backupRetentionDays');
    if (newDays === prevDays) { showToast('Tidak ada perubahan.'); return; }
    btn.disabled = true;
    try {
      await updateSetting('system.backupRetentionDays', newDays);
      logAction({
        userId: getCurrentUser()?.id, username: getCurrentUser()?.username,
        action: 'settings_updated', targetId: 'system',
        metadata: { group: 'system', changes: [{ field: 'Retensi Backup', from: `${prevDays} hari`, to: `${newDays} hari` }] },
      });
      showToast('Pengaturan sistem berhasil disimpan.');
    } catch (err) {
      showToast(err.message || 'Gagal menyimpan pengaturan sistem.');
    } finally { btn.disabled = false; }
  });

  // ── PWA diagnostics group ─────────────────────────────────────
  const _platformLabels = {
    'ios-safari':      'iPhone / iPad (Safari)',
    'android-chrome':  'Android (Chrome)',
    'desktop-chrome':  'Desktop (Chrome)',
    'other':           'Browser',
  };

  const _swStatusLabels = {
    unsupported: 'Tidak Didukung',
    registering: 'Mendaftar…',
    active:      'Aktif',
    failed:      'Gagal',
  };

  const _refreshPwaConfigGroup = () => {
    const state       = getPWAState();
    const statusGrid  = document.getElementById('cfgPwaStatusGrid');
    const actionFooter = document.getElementById('cfgPwaActionFooter');
    if (!statusGrid || !actionFooter) return;

    const swOk      = state.swStatus === 'active';
    const cacheText = state.swCacheCount !== null ? `${state.swCacheCount} aset` : '—';
    const swLabel   = _swStatusLabels[state.swStatus] || state.swStatus;

    statusGrid.innerHTML = `
      <div class="v2-pwa-stat-row">
        <span class="v2-pwa-stat-label">Status</span>
        <span class="v2-pwa-stat-value${state.isInstalled ? ' v2-pwa-stat--ok' : ''}">
          ${state.isInstalled ? '✓ Terinstal' : 'Browser Mode'}
        </span>
      </div>
      <div class="v2-pwa-stat-row">
        <span class="v2-pwa-stat-label">Platform</span>
        <span class="v2-pwa-stat-value">${_platformLabels[state.platform] || state.platform}</span>
      </div>
      <div class="v2-pwa-stat-row">
        <span class="v2-pwa-stat-label">Install Tersedia</span>
        <span class="v2-pwa-stat-value">${state.canInstall ? 'Ya' : 'Tidak'}</span>
      </div>
      <div class="v2-pwa-stat-row">
        <span class="v2-pwa-stat-label">Display Mode</span>
        <span class="v2-pwa-stat-value">${state.displayMode}</span>
      </div>
      <div class="v2-pwa-stat-row v2-pwa-stat-divider">
        <span class="v2-pwa-stat-label">Service Worker</span>
        <span class="v2-pwa-stat-value${swOk ? ' v2-pwa-stat--ok' : ''}">${swLabel}</span>
      </div>
      <div class="v2-pwa-stat-row">
        <span class="v2-pwa-stat-label">Cache</span>
        <span class="v2-pwa-stat-value${swOk ? ' v2-pwa-stat--ok' : ''}">${swOk ? cacheText : '—'}</span>
      </div>
      <div class="v2-pwa-stat-row">
        <span class="v2-pwa-stat-label">Versi</span>
        <span class="v2-pwa-stat-value">v${state.appVersion}</span>
      </div>
      <div class="v2-pwa-stat-row">
        <span class="v2-pwa-stat-label">Update Tersedia</span>
        <span class="v2-pwa-stat-value${state.swUpdateAvailable ? ' v2-pwa-stat--warn' : ''}">${state.swUpdateAvailable ? 'Ya' : 'Tidak'}</span>
      </div>
    `;

    actionFooter.innerHTML = '';
    if (state.isInstalled) {
      const badge = document.createElement('span');
      badge.className = 'v2-pwa-installed-badge';
      badge.textContent = '✓ Aplikasi Terinstal';
      actionFooter.appendChild(badge);
    } else if (state.canInstall) {
      const btn = document.createElement('button');
      btn.className = 'v2-admin-add-btn';
      btn.type = 'button';
      btn.textContent = 'Install Sarpras Operations';
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        btn.textContent = 'Menginstal…';
        const accepted = await triggerInstallPrompt();
        if (!accepted) {
          showToast('Instalasi dibatalkan.', 'info');
          btn.disabled = false;
          btn.textContent = 'Install Sarpras Operations';
        }
        _refreshPwaConfigGroup();
      });
      actionFooter.appendChild(btn);
    } else if (state.isIOSSafari && !state.isInstalled) {
      const btn = document.createElement('button');
      btn.className = 'v2-admin-add-btn';
      btn.type = 'button';
      btn.textContent = 'Cara Instal di iPhone';
      btn.addEventListener('click', () => showIOSInstallModal());
      actionFooter.appendChild(btn);
    }
  };

  _refreshPwaConfigGroup();
  registerPWAStateListener(_refreshPwaConfigGroup);
}

/* ============================================================
   V1.8.0 — Analytics Foundation
   ============================================================ */

function _destroyAnalyticsCharts() {
  for (const c of _analyticsCharts.values()) { try { c.destroy(); } catch (_) {} }
  _analyticsCharts.clear();
}

/* Resource Analytics tab switch (Sprint 7) — presentation only. Toggles the
   active segmented button + visible panel for a tab group, then resizes any
   Chart.js charts inside the newly shown panel (canvases that were in a
   display:none panel render at 0px until resized). No data is recomputed. */
/* Smooth-scroll to an analytics section (used by the hero "Tinjau sekarang" and
   the editorial highlights deep-links). Presentation only. */
function _scrollAnalyticsTo(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const reduce = _analyticsMotionOff();
  try { el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' }); }
  catch (_) { el.scrollIntoView(); }
}

function _switchAnalyticsTab(group, id) {
  if (!group || !id) return;
  const root = document.getElementById('v2AnalyticsContent');
  if (!root) return;
  root.querySelectorAll(`[data-tab-id][data-tab-group="${group}"]`).forEach(b => {
    const on = b.dataset.tabId === id;
    b.classList.toggle('on', on);            // prototype .seg button.on
    b.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  let shown = null;
  root.querySelectorAll(`.v2-analytics-tab-panel[data-tab-group="${group}"]`).forEach(p => {
    const on = p.dataset.tabPanel === id;
    if (on) { p.removeAttribute('hidden'); shown = p; }
    else p.setAttribute('hidden', '');
  });
  if (shown) {
    // Replay the panel-enter animation, resize charts (canvases that were in a
    // display:none panel render at 0px), and re-run the bar/count-up draw.
    shown.classList.remove('deep-panel');
    void shown.offsetWidth;                  // force reflow so the animation restarts
    shown.classList.add('deep-panel');
    for (const chart of _analyticsCharts.values()) {
      const c = chart && chart.canvas;
      if (c && shown.contains(c)) { try { chart.resize(); } catch (_) {} }
    }
    _animateAnalyticsRegion(shown);
  }
}

/* ── Sprint 7B micro-animations (calm, premium) ──────────────────────────────
   Presentation-only. Count-up numbers ease from 0 to target; ring gauges draw
   their stroke from empty. All respect prefers-reduced-motion / [data-anim="off"]
   (in which case values are set immediately, fully visible — capture/print safe). */
function _analyticsMotionOff() {
  if (document.documentElement.getAttribute('data-anim') === 'off') return true;
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) { return false; }
}

function _animateCountUp(el, target, { duration = 1100, decimals = 0 } = {}) {
  const f = Math.pow(10, decimals);
  const fmt = (v) => (Math.round(v * f) / f).toLocaleString('id-ID', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  if (_analyticsMotionOff()) { el.textContent = fmt(target); return; }
  const ease = (x) => 1 - Math.pow(1 - x, 3);
  const t0 = performance.now();
  const tick = (now) => {
    const p = Math.min(1, (now - t0) / duration);
    el.textContent = fmt(target * ease(p));
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function _animateAnalyticsRegion(root) {
  if (!root) return;
  root.querySelectorAll('[data-countup]').forEach(el => {
    const target = parseFloat(el.getAttribute('data-countup'));
    if (!isFinite(target)) return;
    const decimals = parseInt(el.getAttribute('data-countup-decimals') || '0', 10) || 0;
    _animateCountUp(el, target, { decimals });
  });
  // Ring gauges: animate stroke-dasharray from "0 circ" to "len circ".
  root.querySelectorAll('.an-ring-val[data-ring-len]').forEach(el => {
    const len = el.getAttribute('data-ring-len');
    const circ = el.getAttribute('data-ring-circ');
    if (len == null || circ == null) return;
    const apply = () => { el.setAttribute('stroke-dasharray', `${len} ${circ}`); };
    if (_analyticsMotionOff()) apply();
    else requestAnimationFrame(() => requestAnimationFrame(apply));
  });
}

/* ── Dispatch Intelligence Analytics (v1.17.0) ─────────────────────────────
   A dedicated, READ-ONLY executive dashboard over the Dispatch Intelligence
   decision history. It computes nothing operational — it aggregates the
   existing override log + stored recommendations + live request/assignment data
   into the analytics model and renders it. No engine, workflow, or schema is
   touched. */
let dispatchAnalyticsTrendWindow = '30d';

/** Build the analytics model from live subsystem + operational data. The
 *  Dispatch Policy Engine filters the INPUTS first so ambulance (F5) and Akuntes
 *  (F6) never participate in analytics — without changing any analytics math and
 *  without deleting operational data (history/audit/export still see everything). */
function buildDispatchAnalyticsModel() {
  const filtered = applyAnalyticsPolicy({
    vehicles: getVehicles(), requests, assignments, overrideLogs: getOverrideLogs(),
  });
  return computeDispatchAnalyticsModel({
    overrideLogs:           filtered.overrideLogs,
    requestRecommendations: getAllRequestRecommendations(),
    requests:               filtered.requests,
    drivers:                getDrivers(),
    vehicles:               filtered.vehicles,
    assignments:            filtered.assignments,
  });
}

/** Render (or re-render) the Dispatch Analytics section into its container. */
function renderDispatchAnalyticsSection() {
  const host = document.getElementById('v2DispatchAnalyticsDashboard');
  if (host) {
    injectDispatchAnalyticsStyles();
    try {
      const model = buildDispatchAnalyticsModel();
      // Publish for the export hooks (mirrors the operational analytics exports).
      window._lastDispatchAnalyticsModel = model;
      window._dispatchAnalyticsMeta = { generatedBy: (getCurrentUser() && (getCurrentUser().name || getCurrentUser().username)) || '—', appVersion: APP_VERSION, periodLabel: 'Semua riwayat' };
      host.innerHTML = renderDispatchAnalyticsDashboard(model, { trendWindow: dispatchAnalyticsTrendWindow });
    } catch (err) {
      console.warn('[DispatchAnalytics] render failed', err);
      host.innerHTML = '<div class="daa exec-ui v2-analytics-claude"><div class="daa-sec"><div class="daa-empty"><div class="daa-empty__ic">' + anIcon('alert', { size: 26 }) + '</div><div class="daa-empty__t">Gagal memuat Dispatch Analytics</div><div class="daa-empty__d">Terjadi kesalahan saat menyusun data. Coba muat ulang halaman.</div></div></div></div>';
    }
  }
}

/* ── Recommendation Accuracy (v1.17.1) ─────────────────────────────────────
   A read-only accuracy dashboard rendered beside Dispatch Analytics. It REUSES
   the override log + stored recommendations to measure HOW ACCURATE the
   recommendations are over time — no engine, workflow, or schema is touched. */
let recommendationAccuracyTrendWindow = '30d';
let recommendationAccuracyDriverSort = 'ranking';
let recommendationAccuracyDriverSearch = '';
let recommendationAccuracyVehicleSort = 'ranking';
let recommendationAccuracyVehicleSearch = '';

/** Build the accuracy model from the live subsystem + registry data. The Policy
 *  Engine filters the INPUTS first (ambulance F5 + Akuntes F6) so excluded
 *  entities never enter Recommendation Accuracy — analytics math is untouched. */
function buildRecommendationAccuracyModel() {
  const filtered = applyAnalyticsPolicy({
    vehicles: getVehicles(), requests, overrideLogs: getOverrideLogs(),
  });
  return computeRecommendationAccuracyModel({
    overrideLogs:           filtered.overrideLogs,
    requestRecommendations: getAllRequestRecommendations(),
    requests:               filtered.requests,
    drivers:                getDrivers(),
    vehicles:               filtered.vehicles,
  });
}

/** Render (or re-render) the Recommendation Accuracy dashboard. Restores focus
 *  + caret to the active search field so live search does not lose focus. */
function renderRecommendationAccuracySection() {
  const host = document.getElementById('v2RecommendationAccuracyDashboard');
  if (!host) return;
  injectRecommendationAccuracyStyles();

  // Remember which search field (if any) is being edited so we can restore it.
  const active = document.activeElement;
  const editingKind = active && active.matches && active.matches('[data-raa-search]') ? active.dataset.raaSearch : null;
  const caret = editingKind ? active.selectionStart : null;

  try {
    const model = buildRecommendationAccuracyModel();
    window._lastRecommendationAccuracyModel = model;
    window._recommendationAccuracyMeta = { generatedBy: (getCurrentUser() && (getCurrentUser().name || getCurrentUser().username)) || '—', appVersion: APP_VERSION, periodLabel: 'Semua riwayat' };
    host.innerHTML = renderRecommendationAccuracyDashboard(model, {
      trendWindow: recommendationAccuracyTrendWindow,
      driverSort: recommendationAccuracyDriverSort, driverSearch: recommendationAccuracyDriverSearch,
      vehicleSort: recommendationAccuracyVehicleSort, vehicleSearch: recommendationAccuracyVehicleSearch,
    });
  } catch (err) {
    console.warn('[RecommendationAccuracy] render failed', err);
    host.innerHTML = '<div class="daa raa"><div class="daa-sec"><div class="daa-empty"><div class="daa-empty__ic">⚠️</div><div class="daa-empty__t">Gagal memuat Recommendation Accuracy</div><div class="daa-empty__d">Terjadi kesalahan saat menyusun data. Coba muat ulang halaman.</div></div></div></div>';
    return;
  }

  if (editingKind) {
    const field = host.querySelector(`[data-raa-search="${editingKind}"]`);
    if (field) {
      field.focus();
      if (caret != null) { try { field.setSelectionRange(caret, caret); } catch (_) { /* number/email inputs reject caret */ } }
    }
  }
}

/** Export the Recommendation Accuracy report (PDF | Excel) via the export
 *  registry + export-history log (mirrors exportDispatchAnalytics). */
async function exportRecommendationAccuracy(format, btn) {
  const isExcel = format === 'excel';
  const reportId = isExcel ? 'recommendation-accuracy-excel' : 'recommendation-accuracy-pdf';
  const def = getExportReport(reportId);
  if (!def) return;
  const prev = btn ? btn.textContent : null;
  if (btn) { btn.disabled = true; btn.textContent = isExcel ? '⏳ Excel…' : '⏳ PDF…'; }

  const u = getCurrentUser();
  const exportCtx = {
    reportId: def.id, reportTitle: def.title,
    periodLabel: 'Semua riwayat', dateRangeKey: 'all', filters: {},
    generatedBy: (u && (u.displayName || u.name || u.username)) || '—',
    userId: u?.id, username: u?.username, appVersion: APP_VERSION,
  };
  const startedAt = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const elapsed = () => Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt);

  try {
    const result = await runExportReport(reportId);
    if (result && result.blob) {
      const url = URL.createObjectURL(result.blob);
      const a = document.createElement('a');
      a.href = url; a.download = result.filename || `${reportId}.${isExcel ? 'xlsx' : 'pdf'}`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    }
    logExportSuccess(exportCtx, { fileSize: result?.blob?.size, durationMs: elapsed() });
    showToast(isExcel ? 'Excel berhasil dibuat.' : 'PDF berhasil dibuat.');
  } catch (err) {
    console.error('[RecommendationAccuracy] export failed:', err);
    logExportFailure(exportCtx, { error: err, durationMs: elapsed() });
    showToast(isExcel ? 'Gagal membuat Excel.' : 'Gagal membuat PDF.');
  } finally {
    if (btn) { btn.disabled = false; if (prev != null) btn.textContent = prev; }
  }
}

/** Export the Dispatch Analytics report (PDF | Excel). Reuses the export
 *  registry (single source of truth) + the export-history metadata log, then
 *  downloads the resulting blob. The dashboard owns its own buttons, so this is
 *  a small dedicated runner rather than the operational analytics runner. */
async function exportDispatchAnalytics(format, btn) {
  const isExcel = format === 'excel';
  const reportId = isExcel ? 'dispatch-analytics-excel' : 'dispatch-analytics-pdf';
  const def = getExportReport(reportId);
  if (!def) return;
  const prev = btn ? btn.textContent : null;
  if (btn) { btn.disabled = true; btn.textContent = isExcel ? '⏳ Excel…' : '⏳ PDF…'; }

  const u = getCurrentUser();
  const exportCtx = {
    reportId: def.id, reportTitle: def.title,
    periodLabel: 'Semua riwayat', dateRangeKey: 'all', filters: {},
    generatedBy: (u && (u.displayName || u.name || u.username)) || '—',
    userId: u?.id, username: u?.username, appVersion: APP_VERSION,
  };
  const startedAt = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const elapsed = () => Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt);

  try {
    const result = await runExportReport(reportId);
    if (result && result.blob) {
      const url = URL.createObjectURL(result.blob);
      const a = document.createElement('a');
      a.href = url; a.download = result.filename || `${reportId}.${isExcel ? 'xlsx' : 'pdf'}`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    }
    logExportSuccess(exportCtx, { fileSize: result?.blob?.size, durationMs: elapsed() });
    showToast(isExcel ? 'Excel berhasil dibuat.' : 'PDF berhasil dibuat.');
  } catch (err) {
    console.error('[DispatchAnalytics] export failed:', err);
    logExportFailure(exportCtx, { error: err, durationMs: elapsed() });
    showToast(isExcel ? 'Gagal membuat Excel.' : 'Gagal membuat PDF.');
  } finally {
    if (btn) { btn.disabled = false; if (prev != null) btn.textContent = prev; }
  }
}

/* ── Driver Wellness Intelligence (v1.17.6) ────────────────────────────────
   A read-only wellness INTERPRETATION dashboard in the Analytics module. It
   REUSES the driver capacity + workload engines + unified scoring to derive a
   Driver Health Score, fatigue, burnout, and capacity health from operational
   data — it changes no recommendation, dispatch, policy, scoring, or schema. */
let driverWellnessWindow = '30d';

/** Build the wellness model from the live drivers + operational assignments. */
function buildDriverWellnessModel() {
  return computeDriverWellnessModel({
    drivers: getDrivers(),
    assignments,
    window: driverWellnessWindow,
  });
}

/** Render (or re-render) the Driver Wellness section into its container. */
function renderDriverWellnessSection() {
  const host = document.getElementById('v2DriverWellnessDashboard');
  if (!host) return;
  injectDriverWellnessStyles();
  try {
    const model = buildDriverWellnessModel();
    // Publish for the export hooks (mirrors the Dispatch Analytics exports).
    window._lastDriverWellnessModel = model;
    window._driverWellnessMeta = { generatedBy: (getCurrentUser() && (getCurrentUser().name || getCurrentUser().username)) || '—', appVersion: APP_VERSION, periodLabel: `Jendela ${model.windowDays} hari` };
    host.innerHTML = renderDriverWellnessDashboard(model);
  } catch (err) {
    console.warn('[DriverWellness] render failed', err);
    host.innerHTML = '<div class="dwi daa exec-ui v2-analytics-claude"><div class="daa-status daa-status--warn"><div class="daa-status__eye">Driver Wellness</div><div class="daa-status__level">Gagal memuat</div><div class="daa-status__msg">Terjadi kesalahan saat menyusun data. Coba muat ulang halaman.</div></div></div>';
  }
}

/* ── Driver Prediction (v1.19.4) ───────────────────────────────────────────
   The first consumer of the Prediction Service. app.js only AGGREGATES the
   existing platform models into the service INPUT; it imports NO prediction
   engine / validator / provider. The dashboard component calls the Prediction
   Service exactly once per refresh and renders the certified result. No new
   business logic, no new prediction — presentation only. */

/** Aggregate the existing engine outputs into the Prediction Service input. Each
 *  domain model is built by the SAME function its sibling page uses (no new math),
 *  and every source is best-effort so a missing module degrades gracefully. Driver
 *  signals come primarily from the Driver Wellness model. No `now` is passed → the
 *  service uses the wall clock for generatedAt (a live view), while the cache key
 *  stays stable across re-renders until the underlying data changes. */
function buildDriverPredictionInput() {
  const safe = (label, fn) => { try { return fn(); } catch (err) { console.warn(`[DriverPrediction] ${label} unavailable`, err); return null; } };
  return {
    drivers: getDrivers(),
    vehicles: getVehicles(),
    wellness: safe('wellness', () => buildDriverWellnessModel()),
    dispatch: safe('dispatch', () => buildDispatchAnalyticsModel()),
    recommendation: safe('recommendation', () => buildRecommendationAccuracyModel()),
    finance: buildPettyAnalyticsModelIfReady(),
  };
}

/** Render (or re-render) the Driver Prediction dashboard into its container. */
function renderDriverPredictionSection() {
  const host = document.getElementById('v2DriverPredictionDashboard');
  if (!host) return;
  injectDriverPredictionStyles();
  try {
    const input = buildDriverPredictionInput();
    // The dashboard calls the Prediction Service exactly once and renders the
    // certified result; we publish the input for parity/diagnostics only.
    window._lastDriverPredictionInput = input;
    host.innerHTML = renderDriverPredictionDashboard(input);
  } catch (err) {
    console.warn('[DriverPrediction] render failed', err);
    host.innerHTML = '<div class="dpr daa exec-ui v2-analytics-claude"><div class="daa-status daa-status--warn"><div class="daa-status__eye">Driver Prediction</div><div class="daa-status__level">Gagal memuat</div><div class="daa-status__msg">Terjadi kesalahan saat menyusun data. Coba muat ulang halaman.</div></div></div>';
  }
}

/* ── Vehicle Prediction (v1.19.5) ───────────────────────────────────────────
   A VIEW inside Vehicle Management (not a new section). It consumes ONLY the
   Prediction Service — the SAME certified gateway the Driver Prediction sibling
   uses — and the engine already emits `model.vehicles`, so no new prediction
   logic lives here. The service input is identical to the driver one (the model
   holds every domain), so we reuse the SAME builder rather than duplicate it. */

/** Aggregate the platform models into the Prediction Service input (shared with
 *  Driver Prediction — one input, one cached certified model per refresh). */
function buildVehiclePredictionInput() {
  return buildDriverPredictionInput();
}

/** Vehicle lifecycle action handlers — the SINGLE source of truth shared by the
 *  Inventory cards and the Prediction view drawer. Each reads the live Vehicle
 *  Store and re-renders via the registered vehicles-change listener. */
async function _vehicleActionToggle(id) {
  const vehicle = getVehicles().find(v => v.id === id);
  if (!vehicle) return;
  try {
    const u = getCurrentUser();
    if (vehicle.active !== false) {
      await deactivateVehicle(id);
      logAction({ userId: u?.id, username: u?.username, action: 'vehicle_deactivated', targetId: id });
    } else {
      await reactivateVehicle(id);
      logAction({ userId: u?.id, username: u?.username, action: 'vehicle_reactivated', targetId: id });
    }
  } catch (err) { showToast(err.message || 'Gagal mengubah status kendaraan.'); }
}
async function _vehicleActionArchive(id) {
  try {
    await archiveVehicle(id);
    logAction({ userId: getCurrentUser()?.id, username: getCurrentUser()?.username, action: 'vehicle_archived', targetId: id });
    showToast('Kendaraan berhasil diarsipkan.');
  } catch (err) { showToast(err.message || 'Gagal mengarsipkan kendaraan.', 'error'); }
}
async function _vehicleActionRestore(id) {
  try {
    await restoreVehicle(id);
    logAction({ userId: getCurrentUser()?.id, username: getCurrentUser()?.username, action: 'vehicle_restored', targetId: id });
    showToast('Kendaraan berhasil dipulihkan.');
  } catch (err) { showToast(err.message || 'Gagal memulihkan kendaraan.', 'error'); }
}
function _vehicleActionDelete(id) {
  const vehicle = getVehicles().find(v => v.id === id);
  if (!vehicle) return;
  openDeleteConfirmModal({ type: 'vehicle', id, name: vehicle.name, refCount: countVehicleReferences(vehicle) });
}
/** The standard vehicle drawer footer handlers (used by both views). */
function vehicleDrawerHandlers() {
  return {
    onEdit:    openVehicleFormModal,
    onToggle:  _vehicleActionToggle,
    onArchive: _vehicleActionArchive,
    onRestore: _vehicleActionRestore,
    onDelete:  _vehicleActionDelete,
  };
}

/** Open the vehicle detail drawer from the Prediction view — the SAME drawer as
 *  Inventory, enriched with the certified per-vehicle projection when available. */
function openVehiclePredictionDetail(id) {
  if (!id) return;
  // The prediction view can be opened before the inventory ever renders, so make
  // sure the normalized fleet model (the drawer's data source) exists.
  if (!_fleetAssetModel) {
    try { _fleetAssetModel = computeFleetAssetModel({ vehicles: getVehicles(), includeArchived: true }); }
    catch (err) { console.warn('[VehiclePrediction] fleet model unavailable', err); return; }
  }
  const asset = findVehicleAsset(_fleetAssetModel, id);
  if (!asset) return;
  openVehicleDetailDrawer(asset, { ...vehicleDrawerHandlers(), prediction: _vehiclePredictionById[String(id)] });
}

/** Wire prediction cards / spotlight / table rows to open the enriched drawer. */
function bindVehiclePredictionInteractions(host) {
  if (!host) return;
  host.querySelectorAll('[data-vehicle-predict]').forEach((el) => {
    el.addEventListener('click', () => openVehiclePredictionDetail(el.dataset.vehiclePredict));
    el.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      openVehiclePredictionDetail(el.dataset.vehiclePredict);
    });
  });
  // Risk Ranking table — the kit enhancer emits 'exec-table:row' with detail.id.
  // Bind the persistent host ONCE: delegation survives the innerHTML re-render, so
  // re-binding on every refresh would stack duplicate listeners.
  if (!host.__vprTableBound) {
    host.__vprTableBound = true;
    bindExecutiveTable(host);
    host.addEventListener('exec-table:row', (e) => openVehiclePredictionDetail(e.detail && e.detail.id));
  }
}

/** Render (or re-render) the Vehicle Prediction dashboard into its container. */
function renderVehiclePredictionSection() {
  const host = document.getElementById('v2VehiclePredictionDashboard');
  if (!host) return;
  injectVehiclePredictionStyles();
  try {
    const input = buildVehiclePredictionInput();
    // The dashboard calls the Prediction Service exactly once and renders the
    // certified result; we publish the input for parity/diagnostics only.
    window._lastVehiclePredictionInput = input;
    host.innerHTML = renderVehiclePredictionDashboard(input);
    // The drawer index comes from the SAME service call (cached — a structurally
    // equal input returns the same frozen result), so the drawer never touches an
    // engine either.
    _vehiclePredictionById = getCertifiedVehiclePredictions(input).byId || {};
    bindVehiclePredictionInteractions(host);
  } catch (err) {
    console.warn('[VehiclePrediction] render failed', err);
    _vehiclePredictionById = {};
    host.innerHTML = '<div class="vpr daa exec-ui v2-analytics-claude"><div class="daa-status daa-status--warn"><div class="daa-status__eye">Vehicle Prediction</div><div class="daa-status__level">Gagal memuat</div><div class="daa-status__msg">Terjadi kesalahan saat menyusun data. Coba muat ulang halaman.</div></div></div>';
  }
}

/** Switch the active Vehicle Management sub-view and re-apply it. */
function setVehicleView(view) {
  vehicleView = view === 'prediction' ? 'prediction' : 'inventory';
  applyVehicleView();
}

/** Apply the active Vehicle Management sub-view: toggle the tab state + the two
 *  view containers, and render the active one. Owns the inventory overview strip
 *  + filter sync (moved here from the section switch) so the two views stay
 *  cleanly separated. */
function applyVehicleView(overviewRow) {
  if (!overviewRow) overviewRow = document.getElementById('v2AdminOverviewRow');
  const inventoryView  = document.getElementById('v2VehicleInventoryView');
  const predictionView = document.getElementById('v2VehiclePredictionView');
  const tabs = document.getElementById('v2VehicleViewTabs');
  if (tabs) tabs.querySelectorAll('[data-vehicle-view]').forEach((b) => {
    const active = b.dataset.vehicleView === vehicleView;
    b.classList.toggle('is-active', active);
    b.setAttribute('aria-selected', String(active));
  });

  if (vehicleView === 'prediction') {
    if (inventoryView)  inventoryView.style.display  = 'none';
    if (predictionView) predictionView.style.display = '';
    if (overviewRow) overviewRow.innerHTML = '';   // the dashboard carries its own hero
    renderVehiclePredictionSection();
    return;
  }

  // Inventory (default) view.
  if (predictionView) predictionView.style.display = 'none';
  if (inventoryView)  inventoryView.style.display  = '';
  if (overviewRow) {
    const allVehicles   = getVehicles();
    const nonArchived   = allVehicles.filter(v => v.archived !== true);
    const activeCount   = nonArchived.filter(v => v.active !== false).length;
    const inactiveCount = nonArchived.length - activeCount;
    const archivedCount = allVehicles.length - nonArchived.length;
    overviewRow.innerHTML = `
      <div class="v2-admin-overview-cards">
        <div class="v2-admin-overview-card">
          <span class="v2-admin-overview-value">${nonArchived.length}</span>
          <span class="v2-admin-overview-label">Total Kendaraan</span>
        </div>
        <div class="v2-admin-overview-card">
          <span class="v2-admin-overview-value">${activeCount}</span>
          <span class="v2-admin-overview-label">Kendaraan Aktif</span>
        </div>
        <div class="v2-admin-overview-card">
          <span class="v2-admin-overview-value">${inactiveCount}</span>
          <span class="v2-admin-overview-label">Kendaraan Nonaktif</span>
        </div>
        ${archivedCount > 0 ? `<div class="v2-admin-overview-card v2-admin-overview-card--archived">
          <span class="v2-admin-overview-value">${archivedCount}</span>
          <span class="v2-admin-overview-label">Diarsipkan</span>
        </div>` : ''}
      </div>
    `;
  }
  const searchEl = document.getElementById('v2AdminVehicleSearch');
  if (searchEl) searchEl.value = vehicleSearch;
  const filterEl = document.getElementById('v2AdminVehicleStatusFilter');
  if (filterEl) filterEl.value = vehicleStatusFilter;
  const typeFilterEl = document.getElementById('v2AdminVehicleTypeFilter');
  if (typeFilterEl) typeFilterEl.value = vehicleTypeFilter;
  const fuelFilterEl = document.getElementById('v2AdminVehicleFuelFilter');
  if (fuelFilterEl) fuelFilterEl.value = vehicleFuelFilter;
  const transFilterEl = document.getElementById('v2AdminVehicleTransmissionFilter');
  if (transFilterEl) transFilterEl.value = vehicleTransmissionFilter;
  renderV2AdminVehicles();
}

/* ── Executive Analytics Dashboard (v1.18.8) ───────────────────────────────
   The platform's executive HOME page — it answers "Bagaimana kondisi operasional
   hari ini?" by AGGREGATING existing engine outputs into one briefing. It adds
   NO new score and duplicates NO calculation: every domain model here is the
   SAME one that domain's own page builds. Presentation happens in
   js/components/executive-dashboard.js. */

/** Best-effort petty model — included ONLY when the petty store is already
 *  loaded (e.g. the Petty Cash Center was opened). Never forces a load, so this
 *  stays synchronous and side-effect-free. When absent, computeExecutiveAnalytics
 *  cleanly re-normalizes the Operational Health Score over driver + vehicle. */
function buildPettyAnalyticsModelIfReady() {
  try {
    if (typeof pcReady !== 'function' || !pcReady()) return null;
    return computePettyCashAnalytics({
      expenses: getPcExpenses(), nors: getPcNors(), activeCycle: getPcActiveCycle(),
      settings: getPcSettings(), bidangRoster: bidangRoster(), range: '30d',
    });
  } catch (err) { console.warn('[ExecutiveDashboard] petty model unavailable', err); return null; }
}

/** Aggregate the existing engine outputs into the executive model. Each domain
 *  is built by the SAME function its sibling page uses — no duplicated math. */
function buildExecutiveDashboardModel() {
  const safe = (label, fn) => { try { return fn(); } catch (err) { console.warn(`[ExecutiveDashboard] ${label} unavailable`, err); return null; } };
  const dispatch       = safe('dispatch', () => buildDispatchAnalyticsModel());
  const recommendation = safe('recommendation', () => buildRecommendationAccuracyModel());
  const wellness       = safe('wellness', () => buildDriverWellnessModel());
  const fleet          = safe('fleet', () => computeFleetAssetModel({ vehicles: getVehicles() }));
  const petty          = buildPettyAnalyticsModelIfReady();
  // The ONE cross-domain verdict — Operational Health Score from the existing
  // Executive Score Engine (driver + petty). Driver model via the shared builder.
  const exec = safe('exec', () => {
    const driverModel = computeDriverModelForRange('30d', {});
    return computeExecutiveAnalytics({ driverModel, pettyModel: petty, meta: { periodLabel: '30 Hari' } });
  });
  return { generatedAt: new Date().toISOString(), exec, dispatch, recommendation, wellness, fleet, petty };
}

/** Render (or re-render) the Executive Analytics dashboard into its container. */
function renderExecutiveDashboardSection() {
  const host = document.getElementById('v2ExecutiveDashboard');
  if (!host) return;
  injectExecutiveDashboardStyles();
  try {
    const model = buildExecutiveDashboardModel();
    window._lastExecutiveDashboardModel = model;
    // Publish for the export hooks (mirrors the sibling analytics exports).
    window._executiveDashboardMeta = { generatedBy: (getCurrentUser() && (getCurrentUser().name || getCurrentUser().username)) || '—', appVersion: APP_VERSION, periodLabel: 'Kondisi terkini' };
    host.innerHTML = renderExecutiveDashboard(model);
  } catch (err) {
    console.warn('[ExecutiveDashboard] render failed', err);
    host.innerHTML = '<div class="exa daa exec-ui v2-analytics-claude"><div class="daa-status daa-status--warn"><div class="daa-status__eye">Executive Analytics</div><div class="daa-status__level">Gagal memuat</div><div class="daa-status__msg">Terjadi kesalahan saat menyusun data. Coba muat ulang halaman.</div></div></div>';
  }
}

/** Export the Executive Analytics Report (PDF | Excel) via the export registry
 *  + export-history log (mirrors exportDriverWellness). */
async function exportExecutiveDashboard(format, btn) {
  const isExcel = format === 'excel';
  const reportId = isExcel ? 'executive-dashboard-excel' : 'executive-dashboard-pdf';
  const def = getExportReport(reportId);
  if (!def) return;
  const prev = btn ? btn.textContent : null;
  if (btn) { btn.disabled = true; btn.textContent = isExcel ? '⏳ Excel…' : '⏳ PDF…'; }

  const u = getCurrentUser();
  const exportCtx = {
    reportId: def.id, reportTitle: def.title,
    periodLabel: 'Kondisi terkini', dateRangeKey: 'all', filters: {},
    generatedBy: (u && (u.displayName || u.name || u.username)) || '—',
    userId: u?.id, username: u?.username, appVersion: APP_VERSION,
  };
  const startedAt = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const elapsed = () => Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt);

  try {
    const result = await runExportReport(reportId);
    if (result && result.blob) {
      const url = URL.createObjectURL(result.blob);
      const a = document.createElement('a');
      a.href = url; a.download = result.filename || `${reportId}.${isExcel ? 'xlsx' : 'pdf'}`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    }
    logExportSuccess(exportCtx, { fileSize: result?.blob?.size, durationMs: elapsed() });
    showToast(isExcel ? 'Excel berhasil dibuat.' : 'PDF berhasil dibuat.');
  } catch (err) {
    console.error('[ExecutiveDashboard] export failed:', err);
    logExportFailure(exportCtx, { error: err, durationMs: elapsed() });
    showToast(isExcel ? 'Gagal membuat Excel.' : 'Gagal membuat PDF.');
  } finally {
    if (btn) { btn.disabled = false; if (prev != null) btn.textContent = prev; }
  }
}

/** Open the Apple-style detail drawer for one driver (Feature 7). Resolves the
 *  driver from the published model so the drawer reuses the SAME computed object
 *  (nothing is recomputed for the drawer). */
function openDriverWellnessDetail(driverId) {
  const model = window._lastDriverWellnessModel || buildDriverWellnessModel();
  const driver = findDriverWellness(model, driverId);
  if (driver) openDriverWellnessDrawer(driver);
}

/** Export the Driver Wellness report (PDF | Excel) via the export registry +
 *  export-history log (mirrors exportDispatchAnalytics). */
async function exportDriverWellness(format, btn) {
  const isExcel = format === 'excel';
  const reportId = isExcel ? 'driver-wellness-excel' : 'driver-wellness-pdf';
  const def = getExportReport(reportId);
  if (!def) return;
  const prev = btn ? btn.textContent : null;
  if (btn) { btn.disabled = true; btn.textContent = isExcel ? '⏳ Excel…' : '⏳ PDF…'; }

  const u = getCurrentUser();
  const exportCtx = {
    reportId: def.id, reportTitle: def.title,
    periodLabel: 'Semua riwayat', dateRangeKey: 'all', filters: {},
    generatedBy: (u && (u.displayName || u.name || u.username)) || '—',
    userId: u?.id, username: u?.username, appVersion: APP_VERSION,
  };
  const startedAt = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const elapsed = () => Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt);

  try {
    const result = await runExportReport(reportId);
    if (result && result.blob) {
      const url = URL.createObjectURL(result.blob);
      const a = document.createElement('a');
      a.href = url; a.download = result.filename || `${reportId}.${isExcel ? 'xlsx' : 'pdf'}`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    }
    logExportSuccess(exportCtx, { fileSize: result?.blob?.size, durationMs: elapsed() });
    showToast(isExcel ? 'Excel berhasil dibuat.' : 'PDF berhasil dibuat.');
  } catch (err) {
    console.error('[DriverWellness] export failed:', err);
    logExportFailure(exportCtx, { error: err, durationMs: elapsed() });
    showToast(isExcel ? 'Gagal membuat Excel.' : 'Gagal membuat PDF.');
  } finally {
    if (btn) { btn.disabled = false; if (prev != null) btn.textContent = prev; }
  }
}

function renderV2AdminAnalytics() {
  // Populate driver dropdown (dynamic — from drivers-store)
  const driverEl = document.getElementById('v2AnalyticsDriverFilter');
  if (driverEl) {
    const drvList = getDrivers().filter(d => d.active !== false && !d.archived);
    driverEl.innerHTML = '<option value="">Semua Driver</option>' +
      drvList.map(d => `<option value="${esc(d.name)}"${d.name === analyticsDriverFilter ? ' selected' : ''}>${esc(d.name)}</option>`).join('');
  }
  // Populate vehicle dropdown (dynamic — from vehicles-store)
  const vehicleEl = document.getElementById('v2AnalyticsVehicleFilter');
  if (vehicleEl) {
    const vehList = getActiveVehiclesFromStore().filter(v => !v.archived);
    vehicleEl.innerHTML = '<option value="">Semua Kendaraan</option>' +
      vehList.map(v => `<option value="${esc(v.name)}"${v.name === analyticsVehicleFilter ? ' selected' : ''}>${esc(v.name)}</option>`).join('');
  }
  // Populate bidang dropdown (dynamic — from requests requesterName)
  const bidangEl = document.getElementById('v2AnalyticsBidangFilter');
  if (bidangEl) {
    const bidangNames = [...new Set(requests.map(r => r.requesterName || '').filter(Boolean))].sort();
    bidangEl.innerHTML = '<option value="">Semua Bidang</option>' +
      bidangNames.map(n => `<option value="${esc(n)}"${n === analyticsBidangFilter ? ' selected' : ''}>${esc(n)}</option>`).join('');
  }
  // Restore date range select
  const dateRangeEl = document.getElementById('v2AnalyticsDateRange');
  if (dateRangeEl) dateRangeEl.value = analyticsDateRange;

  refreshAnalyticsDisplay();
}

/* _normDestKey / _strSimilarity / _detectSimilarPairs moved to
   ./analytics/analytics-engine.js (Sprint 0). _normDestKey is re-imported
   above (aliased) for the alias/review modals below. */

function _getAnalyticsAliases(type) {
  const aa = getSetting('analyticsAliases') || {};
  const map = aa[type];
  return (map && typeof map === 'object') ? map : {};
}

/* _getAliasCanonical / _getAliasMeta moved to analytics-engine.js (Sprint 0).
   _getAliasCanonical is re-imported above (aliased) for the modals below. */

function _getDismissedWarnings(type) {
  const aq = getSetting('analyticsQuality') || {};
  const dw = aq.dismissedWarnings || {};
  return (dw[type] && typeof dw[type] === 'object') ? dw[type] : {};
}

/* _dqPairKey moved to analytics-engine.js (Sprint 0); re-imported above. */

/**
 * v1.15.0: Build a Driver AnalyticsModel for a given date range, WITHOUT the
 * on-screen entity filters, for the Analytics Executive view (which owns no
 * assignment/request data). Reuses the same engine + previous-period logic as
 * refreshAnalyticsDisplay; pure with respect to the UI (renders nothing).
 * @param {'today'|'7d'|'30d'|'90d'|'ytd'|'all'} dateRange
 * @returns {import('./analytics/analytics-types.js').AnalyticsModel}
 */
function computeDriverModelForRange(dateRange, scope = {}) {
  const range = ['today', '7d', '30d', '90d', 'ytd', 'all'].includes(dateRange) ? dateRange : '30d';
  // v1.15.3: Executive Analytics passes optional scope (driver/vehicle/bidang).
  // The driver engine already honours these filters; default '' = Semua (all).
  const baseCtx = {
    // rc.1.1: sanitization boundary (see refreshAnalyticsDisplay) — clean data in.
    assignments: sanitizeAssignments(assignments),
    requests:    sanitizeRequests(requests),
    drivers:     sanitizeDrivers(getDrivers()),
    vehicles:    sanitizeVehicles(getActiveVehiclesFromStore()),
    // v1.16.4.7 — office-hours window (overtime boundary) from Konfigurasi.
    office: sanitizeSettings({ workStartMins: getSetting('operations.workStartMins'), workEndMins: getSetting('operations.workEndMins') }),
    filters: {
      dateRange: range,
      driver:  scope.driver  || '',
      vehicle: scope.vehicle || '',
      bidang:  scope.bidang  || '',
    },
    aliases: {
      destinations: _getAnalyticsAliases('destinations'),
      bidang: _getAnalyticsAliases('bidang'),
      drivers: _getAnalyticsAliases('drivers'),
      vehicles: _getAnalyticsAliases('vehicles'),
    },
    dismissed: {
      destinations: _getDismissedWarnings('destinations'),
      bidang: _getDismissedWarnings('bidang'),
      drivers: _getDismissedWarnings('drivers'),
      vehicles: _getDismissedWarnings('vehicles'),
    },
    normalizeAssignmentStatus,
  };
  const prev = derivePreviousPeriod(range);
  let previousModel = null;
  if (prev.available) {
    previousModel = computeAnalyticsModel({ ...baseCtx, now: prev.prevNow, windowEnd: prev.windowEnd });
  }
  return computeAnalyticsModel({ ...baseCtx, previousModel });
}
if (typeof window !== 'undefined') {
  window.__computeDriverAnalyticsModel = computeDriverModelForRange;
  window.__APP_VERSION__ = APP_VERSION;
}

function refreshAnalyticsDisplay() {
  _destroyAnalyticsCharts();
  const overviewRow = document.getElementById('v2AdminOverviewRow');
  const contentEl   = document.getElementById('v2AnalyticsContent');
  if (!contentEl) return;

  // ── Compute the analytics model via the Analytics Engine (Sprint 0) ─────
  //    All KPI / aggregation / DQ logic now lives in analytics-engine.js as
  //    pure functions. This call replaces the former ~300-line inline compute
  //    block; rendering below consumes the returned model. Parity-preserving.
  let _analyticsModel;
  let _trendState = 'unavailable';   // 'available' | 'insufficient' | 'unavailable'
  try {
    // Shared engine context — identical inputs for the current and (optional)
    // previous-period computations; only the time window differs.
    const _baseCtx = {
      // rc.1.1: every analytics input crosses the sanitization boundary so the
      // engine only ever sees clean, fully-typed records (no null holes, no
      // numeric requesterName/destination, defaulted active/archived/status).
      assignments: sanitizeAssignments(assignments),
      requests:    sanitizeRequests(requests),
      drivers:     sanitizeDrivers(getDrivers()),
      vehicles:    sanitizeVehicles(getActiveVehiclesFromStore()),
      // v1.16.4.7 — office-hours window (overtime boundary) from Konfigurasi.
      office: sanitizeSettings({ workStartMins: getSetting('operations.workStartMins'), workEndMins: getSetting('operations.workEndMins') }),
      filters: {
        dateRange: analyticsDateRange,
        driver:    analyticsDriverFilter,
        vehicle:   analyticsVehicleFilter,
        bidang:    analyticsBidangFilter,
      },
      aliases: {
        destinations: _getAnalyticsAliases('destinations'),
        bidang:       _getAnalyticsAliases('bidang'),
        drivers:      _getAnalyticsAliases('drivers'),
        vehicles:     _getAnalyticsAliases('vehicles'),
      },
      dismissed: {
        destinations: _getDismissedWarnings('destinations'),
        bidang:       _getDismissedWarnings('bidang'),
        drivers:      _getDismissedWarnings('drivers'),
        vehicles:     _getDismissedWarnings('vehicles'),
      },
      normalizeAssignmentStatus,
    };

    // Trend Engine (Sprint 6): compute the previous equal-length period and feed
    // it in as `previousModel`, so the engine diffs the existing KPIs into
    // model.trends. The current-period computation is unchanged when no previous
    // period exists ('Semua Data'), so on-screen KPIs never change.
    const _prevPeriod = derivePreviousPeriod(analyticsDateRange);
    let _previousModel = null;
    if (_prevPeriod.available) {
      _previousModel = computeAnalyticsModel({
        ..._baseCtx, now: _prevPeriod.prevNow, windowEnd: _prevPeriod.windowEnd,
      });
      _trendState = (_previousModel.kpis.total || 0) > 0 ? 'available' : 'insufficient';
    }

    _analyticsModel = computeAnalyticsModel({ ..._baseCtx, previousModel: _previousModel });
  } catch (err) {
    console.error('[Analytics] compute failed:', err);
    if (overviewRow) overviewRow.innerHTML = '';
    contentEl.innerHTML = renderAnalyticsErrorState({
      message: 'Gagal memuat analytics.',
      detail: 'Terjadi kesalahan saat menghitung data. Silakan muat ulang halaman atau hubungi administrator.',
    });
    return;
  }

  // Side effects the engine deliberately leaves to the caller (stays pure):
  window._analyticsFilteredAsg = _analyticsModel.diagnostics.filteredAsg;
  _lastAnalyticsModel          = _analyticsModel.exportSnapshot;   // PDF export snapshot

  // Analytics Export V2 (Phase B): expose the FULL model + render context so
  // the report projections (Driver, …) can build a DriverReportModel. The
  // legacy exportSnapshot above stays the source for the pdfmake summary.
  const _dateRangeLabels = {
    today: 'Hari Ini', '7d': '7 Hari Terakhir', '30d': '30 Hari Terakhir',
    '90d': '90 Hari Terakhir', all: 'Semua Data',
  };
  const _exportUser = getCurrentUser();
  window._lastAnalyticsFullModel = _analyticsModel;
  window._analyticsExportMeta = {
    periodLabel: _dateRangeLabels[analyticsDateRange] || analyticsDateRange,
    dateRangeKey: analyticsDateRange,   // raw key for the Complete appendix period range
    generatedBy: (_exportUser && (_exportUser.displayName || _exportUser.name || _exportUser.username)) || '—',
    appVersion: APP_VERSION,
    filters: {
      driver:  analyticsDriverFilter  || 'Semua Pengemudi',
      vehicle: analyticsVehicleFilter || 'Semua Kendaraan',
      bidang:  analyticsBidangFilter  || 'Semua Bidang',
    },
  };

  // ── Per-bidang distance (Sprint 7C, presentation-only) ─────────────────
  // Surfaces the existing `distanceTravelled` values aggregated per bidang so
  // the Bidang views can lead with distance (operationally more valuable than
  // request count). Uses the engine's own filtered assignment set + the same
  // bidang-alias resolution as the engine — no analytics computation changes.
  const _bidangAliasMap = _getAnalyticsAliases('bidang');
  const _bidangKm = new Map();
  for (const a of (_analyticsModel.diagnostics.filteredAsg || [])) {
    const km = a.distanceTravelled;
    if (km == null || km <= 0 || !a.requestId) continue;
    const req = requests.find(r => r.id === a.requestId);
    const rawName = req && req.requesterName;
    if (!rawName || !rawName.trim()) continue;
    const resolved = _getAliasCanonical(_bidangAliasMap[_normDestKey(rawName)]) || rawName;
    _bidangKm.set(resolved, (_bidangKm.get(resolved) || 0) + km);
  }
  const _bidangKmOf = (name) => _bidangKm.get(name) || 0;
  const _bidangKmFmt = (name) => {
    const km = _bidangKmOf(name);
    return km > 0 ? `${km.toLocaleString('id-ID')} km` : '—';
  };

  // Analytics Export V2 (Phase D): hand the already-aggregated per-bidang
  // distance to the Bidang report projection (it is not held by the engine).
  if (window._analyticsExportMeta) {
    window._analyticsExportMeta.bidangKm = Object.fromEntries(_bidangKm);
  }

  /* Flat projection consumed by the renderer below. Identifiers match the
     names used verbatim inside the HTML templates, so the rendering code is
     unchanged — guaranteeing visual + numerical parity with the old compute. */
  const {
    total, completed, inProgress, scheduled, cancelled, compRate, openRate, filteredReqs,
    driversWithTrips, vehiclesWithTrips, mostActiveDrv, leastActiveDrv, mostUsedVeh, leastUsedVeh,
    activeDrivers, activeVehicles, activeDriversInPeriod, inactiveDrivers, inactiveVehicles,
    wlBalancedCount, wlOverCount, wlUnderCount,
    bidangEnhanced, mostActiveBidang, leastActiveBidang,
    destSorted, hasDestData, _destFreq,
    driverOdoList, vehicleOdoList, totalKm, hasOdoData, odoTripCount, avgKmPerTrip,
    _dqMainWarnings, _dqUnresolvedCount, _dqResolvedCount, _allDismissed, _allAliases,
  } = _analyticsModel.render;

  // v1.16.4.7 — Actual Working Time & Overtime (kept in diagnostics, not render,
  // so the parity-preserving render projection is unchanged).
  const _wt = (_analyticsModel.diagnostics && _analyticsModel.diagnostics.workingTime) || {};
  const {
    totalActualHours = 0, overtimeAssignments = 0,
    totalOvertimeHours = 0, workingHourUtilization = null,
  } = _wt;
  const _driverWT = _wt.byDriver || {};

  // v1.16.4.8 — Driver Workload Intelligence (kept in diagnostics, not render).
  const _workload  = (_analyticsModel.diagnostics && _analyticsModel.diagnostics.workload) || {};
  const _wlDrivers = _workload.drivers || [];
  const _wlWeights = _workload.weights || { hours: 0.45, distance: 0.30, assignments: 0.25 };
  const _weekendAssignments = (_analyticsModel.kpis && _analyticsModel.kpis.weekendAssignments) || 0;

  // ── Trends (Sprint 6 data) ─────────────────────────────────────────────
  const _trends = _analyticsModel.trends || {};
  // Build a hero/stat trend delta from an existing trend metric. Never fabricates
  // a comparison: returns null when there is no valid period-over-period data.
  const _trendDelta = (metric, { sub = '' } = {}) => {
    if (!metric || metric.percentChange == null || metric.direction === 'neutral') return null;
    const toneCls = metric.tone === 'positive' ? 'up' : metric.tone === 'negative' ? 'down' : '';
    const ico = metric.direction === 'up' ? anIcon('arrowUR', { size: 13 }) : anIcon('arrowDR', { size: 13 });
    return { tone: toneCls, icon: ico, text: `${Math.abs(metric.percentChange)}%`, sub };
  };

  // ── Overview row superseded by the keynote hero (Sprint 7B) ────────────
  if (overviewRow) overviewRow.innerHTML = '';

  // ── Filter summary chips ───────────────────────────────────────────────
  const summaryEl = document.getElementById('v2AnalyticsFilterSummary');
  if (summaryEl) {
    const dateLabels = { today: 'Hari Ini', '7d': '7 Hari', '30d': '30 Hari', '90d': '90 Hari', all: 'Semua Data' };
    const chips = [`<span class="v2-analytics-filter-chip v2-analytics-filter-chip--date">${dateLabels[analyticsDateRange] || analyticsDateRange}</span>`];
    if (analyticsDriverFilter)  chips.push(`<span class="v2-analytics-filter-chip v2-analytics-filter-chip--active">Driver: ${esc(analyticsDriverFilter)}</span>`);
    if (analyticsVehicleFilter) chips.push(`<span class="v2-analytics-filter-chip v2-analytics-filter-chip--active">Kendaraan: ${esc(analyticsVehicleFilter)}</span>`);
    if (analyticsBidangFilter)  chips.push(`<span class="v2-analytics-filter-chip v2-analytics-filter-chip--active">Bidang: ${esc(analyticsBidangFilter)}</span>`);
    summaryEl.innerHTML = chips.join('');
  }

  // ── Global empty state ─────────────────────────────────────────────────
  if (total === 0 && filteredReqs.length === 0) {
    const hasEntityFilter = analyticsDriverFilter || analyticsVehicleFilter || analyticsBidangFilter;
    const emptyMsg = hasEntityFilter
      ? 'Tidak ada data yang sesuai dengan filter yang dipilih.'
      : analyticsDateRange === 'today'
        ? 'Tidak ada assignment pada hari ini.'
        : 'Tidak ada assignment pada periode yang dipilih.';
    contentEl.innerHTML = renderAnalyticsEmptyState({
      message: emptyMsg,
      hint: 'Coba ubah rentang waktu atau hapus filter entitas lainnya.',
    });
    return;
  }

  // ── Render helpers ─────────────────────────────────────────────────────
  function kpiRow(label, value, mod = '') {
    return `<div class="v2-analytics-kpi-row">
      <span class="v2-analytics-kpi-label">${esc(label)}</span>
      <span class="v2-analytics-kpi-val${mod ? ` v2-analytics-kpi-val--${mod}` : ''}">${esc(String(value))}</span>
    </div>`;
  }

  function wlBadge(wl) {
    const map = { over: ['Melebihi', 'over'], under: ['Di Bawah', 'under'], idle: ['Tidak Aktif', 'idle'] };
    const [label, cls] = map[wl] || ['Seimbang', 'balanced'];
    return `<span class="v2-analytics-wl-badge v2-analytics-wl-badge--${cls}">${label}</span>`;
  }

  const fmtDrv = d => d ? `${d.displayName} (${d.count} asg)` : '—';
  const fmtVeh = v => v ? `${v.displayName} (${v.count} asg)` : '—';

  // v1.16.4.7 — format actual working hours (e.g. 12.5 → "12,5 jam").
  const fmtHours = h => (h == null) ? '—'
    : `${Number(h).toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 1 })} jam`;

  // ── Insight highlights (top 3) ─────────────────────────────────────────
  const insightItems = [];
  if (mostActiveDrv)
    insightItems.push(`Driver paling aktif: <strong>${esc(mostActiveDrv.displayName)}</strong> &mdash; ${mostActiveDrv.count} penugasan`);
  if (mostUsedVeh)
    insightItems.push(`Kendaraan paling sering digunakan: <strong>${esc(mostUsedVeh.displayName)}</strong> &mdash; ${mostUsedVeh.count} penugasan`);
  if (bidangEnhanced[0] && bidangEnhanced[0].name !== '—')
    insightItems.push(`Bidang dengan permintaan terbanyak: <strong>${esc(bidangEnhanced[0].name)}</strong> &mdash; ${bidangEnhanced[0].reqCount} permintaan`);
  const insightsHtml = insightItems.length > 0 ? `
    <div class="v2-analytics-insights">
      ${insightItems.slice(0, 3).map(i => `<div class="v2-analytics-insight-item">${i}</div>`).join('')}
    </div>` : '';

  // ── Driver breakdown (Module 1) ────────────────────────────────────────
  // activeDriversInPeriod is provided by the Analytics Engine (destructured above).
  const driverWlHtml = activeDriversInPeriod.length > 0
    ? activeDriversInPeriod.map((d, i) => {
        const pct = total > 0 ? Math.round((d.count / total) * 100) : 0;
        const topBadge = i === 0 ? '<span class="v2-analytics-top-badge">#1 Driver</span>' : '';
        // v1.16.4.7 — Normal / Lembur indicator from the driver's overtime count.
        const wt = _driverWT[(d.displayName || '').toLowerCase()] || { actualHours: 0, overtimeCount: 0, overtimeHours: 0 };
        const otBadge = (wt.overtimeCount || 0) > 0
          ? `<span class="v2-analytics-ot-badge v2-analytics-ot-badge--lembur" title="${wt.overtimeCount} assignment lembur · ${fmtHours(wt.overtimeHours)} lembur">Lembur</span>`
          : `<span class="v2-analytics-ot-badge v2-analytics-ot-badge--normal">Normal</span>`;
        return `<div class="v2-analytics-breakdown-row">
          <span class="v2-analytics-breakdown-name">${esc(d.displayName)}${topBadge ? ' ' + topBadge : ''}</span>
          <span class="v2-analytics-breakdown-count">${d.count} asg</span>
          <span class="v2-analytics-breakdown-count v2-analytics-breakdown-count--muted">${fmtHours(wt.actualHours)}</span>
          <span class="v2-analytics-breakdown-pct">${pct}%</span>
          ${otBadge}
          ${wlBadge(d.wl)}
        </div>`;
      }).join('')
    : `<p class="v2-analytics-empty">Tidak ada assignment pada periode yang dipilih.</p>`;

  // ── Vehicle breakdown (Module 2) ───────────────────────────────────────
  const vehicleWlHtml = vehiclesWithTrips.length > 0
    ? vehiclesWithTrips.map((v, i) => {
        const pct = total > 0 ? Math.round((v.count / total) * 100) : 0;
        const topBadge = i === 0 ? '<span class="v2-analytics-top-badge">#1 Kendaraan</span>' : '';
        return `<div class="v2-analytics-breakdown-row">
          <span class="v2-analytics-breakdown-name">${esc(v.displayName)}${topBadge ? ' ' + topBadge : ''}</span>
          <span class="v2-analytics-breakdown-count">${v.count} asg</span>
          <span class="v2-analytics-breakdown-pct">${pct}%</span>
        </div>`;
      }).join('')
    : `<p class="v2-analytics-empty">Tidak ada data kendaraan yang sesuai dengan filter aktif.</p>`;

  // ── Inactive resources ─────────────────────────────────────────────────
  const inactiveDrvHtml = inactiveDrivers.length > 0
    ? inactiveDrivers.map(d => `<div class="v2-analytics-breakdown-row">
        <span class="v2-analytics-breakdown-name">${esc(d.displayName)}</span>
        <span class="v2-analytics-breakdown-count">0 asg</span>
      </div>`).join('')
    : `<p class="v2-analytics-empty">Semua driver aktif memiliki penugasan dalam periode ini.</p>`;

  const inactiveVehHtml = inactiveVehicles.length > 0
    ? inactiveVehicles.map(v => `<div class="v2-analytics-breakdown-row">
        <span class="v2-analytics-breakdown-name">${esc(v.displayName)}</span>
        <span class="v2-analytics-breakdown-count">0 asg</span>
      </div>`).join('')
    : `<p class="v2-analytics-empty">Semua kendaraan aktif digunakan dalam periode ini.</p>`;

  // ── Destination breakdown (Module 4) ──────────────────────────────────
  const destBreakdownHtml = destSorted.map(([dest, freq], i) =>
    `<div class="v2-analytics-breakdown-row">
      <span class="v2-analytics-breakdown-rank">${i + 1}</span>
      <span class="v2-analytics-breakdown-name">${esc(dest)}</span>
      <span class="v2-analytics-breakdown-count">${freq}x</span>
    </div>`).join('');

  // ── Bidang breakdown (Module 5) ────────────────────────────────────────
  // mostActiveBidang / leastActiveBidang are provided by the Analytics Engine (destructured above).
  const bidangDemandHtml = bidangEnhanced.length > 0
    ? bidangEnhanced.map((b, i) => {
        const topBadge = i === 0 ? '<span class="v2-analytics-top-badge">#1 Bidang</span>' : '';
        return `<div class="v2-analytics-breakdown-row">
          <span class="v2-analytics-breakdown-rank">${i + 1}</span>
          <span class="v2-analytics-breakdown-name">${esc(b.name)}${topBadge ? ' ' + topBadge : ''}</span>
          <span class="v2-analytics-breakdown-count v2-analytics-breakdown-count--primary">${_bidangKmFmt(b.name)}</span>
          <span class="v2-analytics-breakdown-count">${b.asgCount} asg</span>
          <span class="v2-analytics-breakdown-count v2-analytics-breakdown-count--muted">${b.reqCount} req</span>
        </div>`;
      }).join('')
    : `<p class="v2-analytics-empty">Tidak ada permintaan bidang pada rentang waktu ini.</p>`;

  // ── Chart canvas fragments (unified container — Sprint 3). The Chart.js
  //    rendering + datasets are unchanged; only the wrapper is standardized.
  //    Hidden metadata is attached for future PDF/Excel/AI/governance use. ───
  const chartMeta = {
    generatedAt: _analyticsModel.metadata.generatedAt,
    period: _analyticsModel.metadata.dateRange,
    source: 'analytics-engine',
  };

  const chartStatusHtml = total > 0
    ? renderAnalyticsChart({ title: 'Distribusi Status Assignment', canvasId: 'chartAssignmentStatus', boxVariant: 'donut', metadata: chartMeta })
    : '';

  const chartDriverHtml = activeDriversInPeriod.length > 0
    ? renderAnalyticsChart({ title: 'Distribusi Penugasan per Driver', canvasId: 'chartDriverWorkload', height: Math.max(150, activeDriversInPeriod.length * 30), metadata: chartMeta })
    : '';

  const chartVehicleHtml = vehiclesWithTrips.length > 0
    ? renderAnalyticsChart({ title: 'Utilisasi per Kendaraan', canvasId: 'chartVehicleUtil', height: Math.max(150, vehiclesWithTrips.length * 30), metadata: chartMeta })
    : '';

  const chartBidangHtml = bidangEnhanced.length > 1
    ? renderAnalyticsChart({ title: 'Distribusi Permintaan per Bidang', canvasId: 'chartBidangDemand', boxVariant: 'donut', metadata: chartMeta })
    : '';

  // ── Odometer section HTML ──────────────────────────────────────────────
  const odoDriverBdHtml = driverOdoList.length > 0
    ? `<div class="v2-analytics-breakdown-row v2-analytics-breakdown-row--header">
        <span class="v2-analytics-breakdown-name">Driver</span>
        <span class="v2-analytics-breakdown-count">Jarak</span>
      </div>` +
      driverOdoList.map((d, i) =>
        `<div class="v2-analytics-breakdown-row">
          <span class="v2-analytics-breakdown-name">${esc(d.name)}${i === 0 ? ' <span class="v2-analytics-top-badge">#1</span>' : ''}</span>
          <span class="v2-analytics-breakdown-count">${d.km.toLocaleString('id-ID')} km</span>
        </div>`).join('')
    : `<p class="v2-analytics-empty">—</p>`;

  const odoVehicleBdHtml = vehicleOdoList.length > 0
    ? `<div class="v2-analytics-breakdown-row v2-analytics-breakdown-row--header">
        <span class="v2-analytics-breakdown-name">Kendaraan</span>
        <span class="v2-analytics-breakdown-count">Jarak</span>
      </div>` +
      vehicleOdoList.map((v, i) =>
        `<div class="v2-analytics-breakdown-row">
          <span class="v2-analytics-breakdown-name">${esc(v.name)}${i === 0 ? ' <span class="v2-analytics-top-badge">#1</span>' : ''}</span>
          <span class="v2-analytics-breakdown-count">${v.km.toLocaleString('id-ID')} km</span>
        </div>`).join('')
    : `<p class="v2-analytics-empty">Belum ada data jarak kendaraan.</p>`;

  const chartOdoDriverHtml = driverOdoList.length > 0
    ? renderAnalyticsChart({ title: 'Jarak Tempuh per Driver (km)', canvasId: 'chartOdoDriver', height: Math.max(140, driverOdoList.length * 32), metadata: chartMeta })
    : '';

  const chartOdoVehicleHtml = vehicleOdoList.length > 0
    ? renderAnalyticsChart({ title: 'Jarak Tempuh per Kendaraan (km)', canvasId: 'chartOdoVehicle', height: Math.max(140, vehicleOdoList.length * 32), metadata: chartMeta })
    : '';

  const odoBodyHtml = hasOdoData
    ? `<div class="v2-analytics-subtitle">Jarak Tempuh per Driver</div>
      <div class="v2-analytics-breakdown">${odoDriverBdHtml}</div>
      ${chartOdoDriverHtml}
      <div class="v2-analytics-subtitle v2-analytics-subtitle--mt">Jarak Tempuh per Kendaraan</div>
      <div class="v2-analytics-breakdown">${odoVehicleBdHtml}</div>
      ${chartOdoVehicleHtml}`
    : `<p class="v2-analytics-empty" style="margin-top:12px;">Belum ada data jarak tempuh pada periode ini. Odometer dicatat saat driver memulai dan menyelesaikan assignment.</p>`;

  const odoContent = `
        <div class="v2-analytics-groups">
          <div class="v2-admin-config-group">
            <h3 class="v2-admin-config-group-title">Ringkasan Jarak Tempuh</h3>
            <div class="v2-analytics-kpi-list">
              ${kpiRow('Total Jarak Tempuh', hasOdoData ? totalKm.toLocaleString('id-ID') + ' km' : '—')}
              ${kpiRow('Rata-rata per Trip', hasOdoData ? avgKmPerTrip.toLocaleString('id-ID') + ' km' : '—')}
              ${kpiRow('Trip dengan Odometer', odoTripCount)}
            </div>
            ${odoBodyHtml}
          </div>
        </div>`;

  // ── Section content fragments (computed values unchanged — layout only) ────
  // ── §01 Executive — keynote hero (Sprint 7B) ───────────────────────────
  // De-boxed hero: a derived health verdict + 0–100 score + 3 big stats. The
  // score is computed HERE in the presentation layer purely from values the
  // engine already produced (compRate, openRate, cancellation, Priority-1
  // findings) — no engine change, no fabricated data.
  const k = _analyticsModel.kpis;
  // Canonical cancellation rate (cancelled / all assignments) from the engine.
  const _cancRateExec = k.cancellationRate ?? (total + cancelled > 0 ? Math.round((cancelled / (total + cancelled)) * 100) : 0);
  const _p1Count =
    (_analyticsModel.insights || []).filter(i => i.priority === 1).length +
    (_analyticsModel.recommendations || []).filter(r => r.priority === 1).length;
  const _healthScore = Math.max(0, Math.min(100, Math.round(
    0.45 * k.compRate + 0.25 * (100 - k.openRate) + 0.20 * (100 - _cancRateExec) + 0.10 * Math.max(0, 100 - _p1Count * 25)
  )));
  const _healthTone = _healthScore >= 70 ? 'green' : _healthScore >= 50 ? 'amber' : 'crit';
  const _ringColor = _healthTone === 'green' ? 'var(--c-green)' : _healthTone === 'amber' ? 'var(--c-amber)' : 'var(--crit)';
  const _verdictWord = _healthScore >= 85 ? 'sangat efisien' : _healthScore >= 70 ? 'berjalan sehat' : _healthScore >= 50 ? 'cukup stabil' : 'perlu perhatian';
  const _healthGrade = _healthScore >= 85 ? 'Sangat Baik' : _healthScore >= 70 ? 'Sehat' : _healthScore >= 50 ? 'Cukup' : 'Perlu Perhatian';

  const _complTrend = _trends.completionRate;
  let _heroTrendSub = '';
  if (_complTrend && _complTrend.percentChange != null && _complTrend.direction !== 'neutral') {
    _heroTrendSub = ` · ${_complTrend.direction === 'up' ? 'naik' : 'turun'} ${Math.abs(_complTrend.percentChange)}% dari periode sebelumnya`;
  }
  const heroHeadline = `Operasi <span class="hl">${esc(_verdictWord)}</span>.`;
  const heroSub = `${total} penugasan · <span class="up">${compRate}% penyelesaian</span>${_heroTrendSub}.`;

  const heroSection = renderHeroSection({
    headline: heroHeadline, sub: heroSub,
    attn: _p1Count > 0 ? { label: `${_p1Count} area memerlukan perhatian` } : null,
    score: _healthScore, grade: _healthGrade, ringValue: _healthScore / 100, ringColor: _ringColor, tone: _healthTone,
    stats: [
      { lbl: 'Total Penugasan', big: `<span data-countup="${total}">0</span>`, delta: _trendDelta(_trends.totalAssignments, { sub: 'vs periode lalu' }) },
      { lbl: 'Tingkat Penyelesaian', big: `${compRate}<span class="u">%</span>`, delta: _trendDelta(_trends.completionRate, { sub: `${k.completed}/${k.total}` }) },
      { lbl: 'Peringatan Kritis', big: `<span data-countup="${_p1Count}">0</span>`, alertStat: true, alert: _p1Count > 0 ? 'Tinjau sekarang' : '' },
    ],
  });

  // Editorial highlights trio (Level 2) — existing analytics in executive form.
  const _drvAvatar = mostActiveDrv ? (String(mostActiveDrv.displayName || '?').trim()[0] || '?').toUpperCase() : '?';
  const _volTrend = _trends.totalAssignments;
  const _thirdHl = (_volTrend && _volTrend.percentChange != null && _volTrend.direction !== 'neutral')
    ? { label: 'Perubahan Operasional', value: `${_volTrend.direction === 'up' ? '+' : '−'}${Math.abs(_volTrend.percentChange)}`, unit: '%', tone: _volTrend.tone === 'positive' ? 'up' : '', context: 'Volume penugasan · vs periode lalu', tag: _volTrend.direction === 'up' ? 'tren menguat' : 'tren melemah', tagTone: _volTrend.tone === 'negative' ? 'crit' : 'up', tab: 'driver' }
    : (mostActiveBidang ? { label: 'Bidang Teraktif', value: mostActiveBidang.name, context: `${_bidangKmFmt(mostActiveBidang.name)} (${mostActiveBidang.asgCount} assignment)`, tab: 'bidang' } : null);
  const highlightsBlock = renderHighlights([
    mostActiveDrv ? { label: 'Driver Paling Aktif', avatar: _drvAvatar, value: mostActiveDrv.displayName, context: `${mostActiveDrv.count} penugasan`, tag: 'beban tertinggi', tagTone: 'up', tab: 'driver' } : null,
    mostUsedVeh ? { label: 'Kendaraan Terutilisasi', value: mostUsedVeh.displayName, context: `${mostUsedVeh.count} penugasan`, tab: 'vehicle' } : null,
    _thirdHl,
  ]);

  // ── Driver Workload Intelligence (v1.16.4.8) ───────────────────────────
  // Explainable, normalized 0–100 workload score per driver (Jam 45% · Jarak
  // 30% · Assignment 25%, each indexed against the period's busiest driver).
  // "Paling Aktif" = highest workload score, NOT most assignments.
  const _fmtKm = km => (km > 0) ? `${Math.round(km).toLocaleString('id-ID')} km` : '0 km';
  const _wHrsPct = Math.round((_wlWeights.hours || 0) * 100);
  const _wDstPct = Math.round((_wlWeights.distance || 0) * 100);
  const _wAsgPct = Math.round((_wlWeights.assignments || 0) * 100);
  const _fmtWlDrv = d => d ? `${d.name} — Skor ${d.score}` : '—';

  const workloadListHtml = _wlDrivers.length > 0
    ? `<div class="v2-wl-list">
        ${_wlDrivers.map((d, i) => {
          const c = d.contribution || { hours: 0, distance: 0, assignments: 0 };
          const idxTitle = `Indeks (relatif driver tersibuk): Jam ${d.hoursIndex} · Jarak ${d.distanceIndex} · Assignment ${d.assignmentIndex}`;
          return `<div class="v2-wl-item${i === 0 ? ' v2-wl-item--top' : ''}">
            <div class="v2-wl-head">
              <span class="v2-wl-rank">#${i + 1}</span>
              <span class="v2-wl-name">${esc(d.name)}</span>
              <span class="v2-wl-score" title="${esc(idxTitle)}">${d.score}<span class="v2-wl-score-unit">/100</span></span>
            </div>
            <div class="v2-wl-metrics">${d.completed} asg · ${fmtHours(d.hours)} · ${_fmtKm(d.distance)}${(d.weekend || 0) > 0 ? ` · ${d.weekend} weekend` : ''}${d.utilization != null ? ` · utilisasi ${d.utilization}%` : ''}</div>
            <div class="v2-wl-bars" title="${esc(idxTitle)}">
              <span class="v2-wl-seg v2-wl-seg--hours" style="width:${c.hours}%"></span>
              <span class="v2-wl-seg v2-wl-seg--dist" style="width:${c.distance}%"></span>
              <span class="v2-wl-seg v2-wl-seg--asg" style="width:${c.assignments}%"></span>
            </div>
            <div class="v2-wl-legend">
              <span class="v2-wl-legend-item"><span class="v2-wl-dot v2-wl-dot--hours"></span>Jam Kerja ${c.hours}%</span>
              <span class="v2-wl-legend-item"><span class="v2-wl-dot v2-wl-dot--dist"></span>Jarak ${c.distance}%</span>
              <span class="v2-wl-legend-item"><span class="v2-wl-dot v2-wl-dot--asg"></span>Assignment ${c.assignments}%</span>
            </div>
          </div>`;
        }).join('')}
      </div>`
    : `<p class="v2-analytics-empty">Belum ada data beban kerja pada periode ini. Skor dihitung dari assignment selesai, jam kerja aktual, dan jarak tempuh.</p>`;

  const workloadGroupHtml = `
      <div class="v2-admin-config-group">
        <h3 class="v2-admin-config-group-title">Beban Kerja Driver (Workload Intelligence)</h3>
        <div class="v2-analytics-kpi-list">
          ${kpiRow('Driver Paling Aktif', _fmtWlDrv(_workload.palingAktif))}
          ${kpiRow('Beban Kerja Tertinggi', _fmtWlDrv(_workload.bebanTertinggi))}
          ${kpiRow('Beban Kerja Terendah', _fmtWlDrv(_workload.bebanTerendah))}
          ${kpiRow('Rata-rata Skor Beban', _workload.averageScore != null ? String(_workload.averageScore) : '—')}
          ${kpiRow('Assignment Weekend', `${_weekendAssignments} assignment`, _weekendAssignments > 0 ? 'warn' : '')}
        </div>
        <p class="v2-analytics-note">Skor Beban Kerja (0–100) menggabungkan tiga indikator yang dinormalisasi terhadap driver tersibuk pada periode ini: Jam Kerja Aktual (${_wHrsPct}%), Jarak Tempuh (${_wDstPct}%), dan Jumlah Assignment Selesai (${_wAsgPct}%). "Paling Aktif" berarti skor beban tertinggi — bukan sekadar jumlah assignment terbanyak. Tugas tanpa kendaraan tetap dihitung lewat jam kerja &amp; assignment (jarak nol).</p>
        <div class="v2-analytics-subtitle">Peringkat &amp; Penjelasan Skor per Driver</div>
        ${workloadListHtml}
      </div>`;

  const driverContent = `
    <div class="v2-analytics-groups">
      ${workloadGroupHtml}
      <div class="v2-admin-config-group">
        <h3 class="v2-admin-config-group-title">Jam Kerja Aktual & Lembur</h3>
        <div class="v2-analytics-kpi-list">
          ${kpiRow('Total Jam Kerja Aktual', fmtHours(totalActualHours))}
          ${kpiRow('Assignment Lembur', `${overtimeAssignments || 0} assignment`, (overtimeAssignments || 0) > 0 ? 'warn' : '')}
          ${kpiRow('Jam Lembur Total', fmtHours(totalOvertimeHours), (totalOvertimeHours || 0) > 0 ? 'warn' : '')}
          ${kpiRow('Utilisasi Jam Kerja', workingHourUtilization != null ? `${workingHourUtilization}%` : '—')}
        </div>
        <p class="v2-analytics-note">Lembur dihitung berdasarkan kalender: assignment di akhir pekan (Sabtu/Minggu) atau di luar jam operasional. Jam aktual dihitung dari waktu mulai &amp; selesai driver — termasuk tugas tanpa kendaraan.</p>
      </div>
      <div class="v2-admin-config-group">
        <h3 class="v2-admin-config-group-title">Driver Workload Distribution</h3>
        <div class="v2-analytics-kpi-list">
          ${kpiRow('Driver Aktif Bertugas', activeDriversInPeriod.length)}
          ${kpiRow('Driver Tidak Bertugas', inactiveDrivers.length)}
          ${kpiRow('Driver Paling Aktif', fmtDrv(mostActiveDrv))}
          ${kpiRow('Driver Paling Jarang', fmtDrv(leastActiveDrv))}
          ${kpiRow('Seimbang', `${wlBalancedCount} driver`)}
          ${kpiRow('Melebihi Rata-rata', `${wlOverCount} driver`, wlOverCount > 0 ? 'warn' : '')}
          ${kpiRow('Di Bawah Rata-rata', `${wlUnderCount} driver`)}
        </div>
        <div class="v2-analytics-subtitle">Distribusi Penugasan Per Driver</div>
        <div class="v2-analytics-breakdown">
          ${activeDriversInPeriod.length > 0 ? `
          <div class="v2-analytics-breakdown-row v2-analytics-breakdown-row--header">
            <span class="v2-analytics-breakdown-name">Driver</span>
            <span class="v2-analytics-breakdown-count">Asg</span>
            <span class="v2-analytics-breakdown-count v2-analytics-breakdown-count--muted">Jam</span>
            <span class="v2-analytics-breakdown-pct">%</span>
            <span class="v2-analytics-breakdown-wl"></span>
            <span class="v2-analytics-breakdown-wl"></span>
          </div>` : ''}
          ${driverWlHtml}
        </div>
        <div class="v2-analytics-subtitle v2-analytics-subtitle--mt">Driver Tanpa Penugasan</div>
        <div class="v2-analytics-breakdown">${inactiveDrvHtml}</div>
        ${chartDriverHtml}
      </div>
    </div>`;

  const vehicleContent = `
    <div class="v2-analytics-groups">
      <div class="v2-admin-config-group">
        <h3 class="v2-admin-config-group-title">Vehicle Utilization</h3>
        <div class="v2-analytics-kpi-list">
          ${kpiRow('Total Kendaraan Aktif', activeVehicles.length)}
          ${kpiRow('Kendaraan Terbanyak', fmtVeh(mostUsedVeh))}
          ${kpiRow('Kendaraan Paling Jarang', fmtVeh(leastUsedVeh))}
        </div>
        <div class="v2-analytics-subtitle">Utilisasi Per Kendaraan</div>
        <div class="v2-analytics-breakdown">
          ${vehiclesWithTrips.length > 0 ? `
          <div class="v2-analytics-breakdown-row v2-analytics-breakdown-row--header">
            <span class="v2-analytics-breakdown-name">Kendaraan</span>
            <span class="v2-analytics-breakdown-count">Asg</span>
            <span class="v2-analytics-breakdown-pct">%</span>
          </div>` : ''}
          ${vehicleWlHtml}
        </div>
        <div class="v2-analytics-subtitle v2-analytics-subtitle--mt">Kendaraan Tanpa Penggunaan</div>
        <div class="v2-analytics-breakdown">${inactiveVehHtml}</div>
        ${chartVehicleHtml}
      </div>
    </div>`;

  const bidangContent = `
    <div class="v2-analytics-groups">
      <div class="v2-admin-config-group">
        <h3 class="v2-admin-config-group-title">Bidang Demand Analysis</h3>
        <div class="v2-analytics-kpi-list">
          ${kpiRow('Total Bidang', bidangEnhanced.length)}
          ${mostActiveBidang  ? kpiRow('Bidang Teraktif',      `${mostActiveBidang.name} — ${_bidangKmFmt(mostActiveBidang.name)} (${mostActiveBidang.asgCount} asg)`) : ''}
          ${leastActiveBidang ? kpiRow('Bidang Paling Jarang', `${leastActiveBidang.name} — ${_bidangKmFmt(leastActiveBidang.name)} (${leastActiveBidang.asgCount} asg)`) : ''}
        </div>
        <div class="v2-analytics-breakdown">
          ${bidangEnhanced.length > 0 ? `
          <div class="v2-analytics-breakdown-row v2-analytics-breakdown-row--header">
            <span class="v2-analytics-breakdown-rank"></span>
            <span class="v2-analytics-breakdown-name">Bidang</span>
            <span class="v2-analytics-breakdown-count">Jarak</span>
            <span class="v2-analytics-breakdown-count">Asg</span>
            <span class="v2-analytics-breakdown-count">Req</span>
          </div>` : ''}
          ${bidangDemandHtml}
        </div>
        ${chartBidangHtml}
      </div>
    </div>`;

  // Destination is now its own section (was nested in Bidang). Shows an empty
  // state — instead of vanishing — when there is no destination data.
  const destContent = hasDestData ? `
    <div class="v2-analytics-groups">
      <div class="v2-admin-config-group">
        <h3 class="v2-admin-config-group-title">Destination Analytics</h3>
        <div class="v2-analytics-kpi-list">
          ${kpiRow('Total Tujuan Unik', _destFreq.size)}
          ${destSorted[0] ? kpiRow('Tujuan Paling Sering', `${destSorted[0][0]} (${destSorted[0][1]}x)`) : ''}
        </div>
        <div class="v2-analytics-subtitle">Top ${Math.min(10, destSorted.length)} Tujuan</div>
        <div class="v2-analytics-breakdown">
          <div class="v2-analytics-breakdown-row v2-analytics-breakdown-row--header">
            <span class="v2-analytics-breakdown-rank"></span>
            <span class="v2-analytics-breakdown-name">Tujuan</span>
            <span class="v2-analytics-breakdown-count">Frekuensi</span>
          </div>
          ${destBreakdownHtml}
        </div>
      </div>
    </div>`
    : `
    <div class="v2-analytics-groups">
      <div class="v2-admin-config-group">
        ${renderAnalyticsEmptyState({ message: 'Belum ada data tujuan pada periode ini.', hint: 'Tujuan tercatat dari kolom destination pada tiap assignment.' })}
      </div>
    </div>`;

  // Data Quality Resolution Center inner content (unchanged markup/behavior).
  const dqContent = `
        <div class="v2-admin-config-group v2-dq-center">

          <!-- Stats bar -->
          <div class="v2-dq-stats">
            <div class="v2-dq-stat-card${_dqUnresolvedCount > 0 ? ' v2-dq-stat-card--warn' : ''}">
              <span class="v2-dq-stat-value">${_dqUnresolvedCount}</span>
              <span class="v2-dq-stat-label">Potensi Duplikasi</span>
            </div>
            <div class="v2-dq-stat-card">
              <span class="v2-dq-stat-value">${_allDismissed.length}</span>
              <span class="v2-dq-stat-label">Warning Diabaikan</span>
            </div>
            <div class="v2-dq-stat-card${_allAliases.length > 0 ? ' v2-dq-stat-card--ok' : ''}">
              <span class="v2-dq-stat-value">${_allAliases.length}</span>
              <span class="v2-dq-stat-label">Alias Aktif</span>
            </div>
            <div class="v2-dq-stat-card${_dqResolvedCount > 0 ? ' v2-dq-stat-card--ok' : ''}">
              <span class="v2-dq-stat-value">${_dqResolvedCount}</span>
              <span class="v2-dq-stat-label">Duplikasi Diselesaikan</span>
            </div>
          </div>

          <!-- Manual review actions -->
          <div class="v2-dq-actions-row">
            <button class="v2-dq-review-btn" data-action="dest-review" type="button">Tinjau Tujuan</button>
            <button class="v2-dq-review-btn" data-action="assignment-review" type="button">Tinjau Assignment</button>
            <button class="v2-dq-review-btn" data-action="request-review" type="button">Tinjau Request</button>
          </div>

          <!-- Detected duplicate pairs -->
          <h3 class="v2-admin-config-group-title">Deteksi Duplikasi</h3>
          ${_dqMainWarnings.length > 0 ? `
          <div class="v2-dq-pair-list">
            ${(() => {
              // Phase F (v1.16.4.10) — score each unresolved pair with the
              // deterministic confidence model and present highest-confidence
              // suggestions first. Pairs below "Jangan Sarankan" (<50%) are
              // hidden. Resolved (alias-active) rows always show. Computed here
              // in the view (render projection stays parity-locked).
              const _confTone = { green: '#2f7d5b', yellow: '#a9781a', red: '#9a1b2d', none: '#8b857c' };
              const scored = _dqMainWarnings.map(w => ({
                w, conf: w.aliasActive ? null : _aliasConfidence(w.a, w.b),
              })).filter(x => x.conf === null || x.conf.recommend)
                .sort((x, y) => (y.conf?.score ?? 101) - (x.conf?.score ?? 101));
              const typeLabels = { destinations: 'Tujuan', bidang: 'Bidang', drivers: 'Driver', vehicles: 'Kendaraan' };
              return scored.map(({ w, conf }) => {
                const typeLabel = typeLabels[w.type] || w.type;
                if (w.aliasActive) {
                  return `<div class="v2-dq-pair-row v2-dq-pair-row--resolved">
                    <span class="v2-dq-type-badge">${typeLabel}</span>
                    <div class="v2-dq-pair-names">
                      <span class="v2-dq-name">${esc(w.a)}</span>
                      <span class="v2-dq-arrow">→</span>
                      <span class="v2-dq-name v2-dq-name--canonical">${esc(w.aliasActive)}</span>
                    </div>
                    <span class="v2-dq-resolved-badge">✓ Alias Aktif</span>
                  </div>`;
                }
                const tone = _confTone[conf.tone] || _confTone.none;
                const confBadge = `<span class="v2-dq-conf-badge" title="Skor keyakinan: kemiripan teks + tumpang-tindih kata + deteksi singkatan" style="display:inline-flex;align-items:center;gap:5px;padding:2px 9px;border-radius:999px;font-size:11px;font-weight:800;color:#fff;background:${tone}">${conf.score}% · ${esc(conf.label)}</span>`;
                return `<div class="v2-dq-pair-row">
                  <span class="v2-dq-type-badge">${typeLabel}</span>
                  <div class="v2-dq-pair-names">
                    <span class="v2-dq-name">${esc(w.a)}</span>
                    <span class="v2-dq-sep">&amp;</span>
                    <span class="v2-dq-name">${esc(w.b)}</span>
                  </div>
                  ${confBadge}
                  <div class="v2-dq-pair-actions">
                    <button class="v2-dq-merge-btn"
                      data-action="alias-merge"
                      data-type="${esc(w.type)}"
                      data-a="${esc(w.a)}"
                      data-b="${esc(w.b)}"
                      data-count-a="${w.countA ?? ''}"
                      data-count-b="${w.countB ?? ''}"
                      type="button">Gabungkan</button>
                    <button class="v2-dq-dismiss-btn"
                      data-action="alias-dismiss"
                      data-type="${esc(w.type)}"
                      data-a="${esc(w.a)}"
                      data-b="${esc(w.b)}"
                      type="button">Abaikan</button>
                  </div>
                </div>`;
              }).join('');
            })()}
          </div>` : `
          <p class="v2-analytics-empty" style="padding:8px 0 12px;">Tidak ada potensi duplikasi terdeteksi pada periode ini.</p>`}

          <!-- Dismissed warnings section -->
          ${_allDismissed.length > 0 ? `
          <h3 class="v2-admin-config-group-title v2-dq-section-divider">Warning Diabaikan</h3>
          <div class="v2-dq-dismissed-list">
            ${_allDismissed.map(d => {
              const typeLabels = { destinations: 'Tujuan', bidang: 'Bidang', drivers: 'Driver', vehicles: 'Kendaraan' };
              const typeLabel  = typeLabels[d.type] || d.type;
              const dismissedAtStr = d.dismissedAt
                ? new Date(d.dismissedAt).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
                : '—';
              return `<div class="v2-dq-dismissed-row">
                <span class="v2-dq-type-badge">${typeLabel}</span>
                <div class="v2-dq-pair-names">
                  <span class="v2-dq-name">${esc(d.a || '')}</span>
                  <span class="v2-dq-sep">&amp;</span>
                  <span class="v2-dq-name">${esc(d.b || '')}</span>
                </div>
                <div class="v2-dq-dismissed-meta">
                  <span class="v2-dq-dismissed-by">Diabaikan oleh ${esc(d.dismissedBy || '—')}</span>
                  <span class="v2-dq-dismissed-at">${dismissedAtStr}</span>
                </div>
                <button class="v2-dq-restore-btn"
                  data-action="alias-restore"
                  data-type="${esc(d.type)}"
                  data-key="${esc(d.pairKey)}"
                  type="button">Tampilkan Lagi</button>
              </div>`;
            }).join('')}
          </div>` : ''}

          <!-- Kelola Alias table -->
          ${_allAliases.length > 0 ? `
          <h3 class="v2-admin-config-group-title v2-dq-section-divider">Kelola Alias</h3>
          <div class="v2-dq-alias-table-wrap">
            <table class="v2-dq-alias-table">
              <thead>
                <tr>
                  <th>Alias (Raw)</th>
                  <th>Nilai Kanonik</th>
                  <th>Tipe</th>
                  <th>Penggunaan</th>
                  <th>Dibuat</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                ${_allAliases.map(al => {
                  const typeLabels = { destinations: 'Tujuan', bidang: 'Bidang', drivers: 'Driver', vehicles: 'Kendaraan' };
                  const usageStr   = al.usageCount !== null ? `${al.usageCount} asg` : '—';
                  const createdStr = al.createdAt
                    ? new Date(al.createdAt).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })
                    : '—';
                  // Merge provenance is read live from the alias map (NOT the
                  // parity-locked render projection) so the frozen snapshot shape
                  // is preserved. v1.16.4.10.
                  const _rawEntry = _getAnalyticsAliases(al.type)[al.aliasKey] || {};
                  const _mergedFrom = _rawEntry.mergedFrom || '';
                  const _mergedBy   = _rawEntry.mergedBy || '';
                  const _mergedAt   = _rawEntry.mergedAt || '';
                  return `<tr>
                    <td class="v2-dq-alias-key">${esc(al.aliasKey)}</td>
                    <td class="v2-dq-alias-canonical">${esc(al.canonical || '')}</td>
                    <td><span class="v2-dq-type-badge">${typeLabels[al.type] || al.type}</span></td>
                    <td class="v2-dq-alias-usage">${usageStr}</td>
                    <td class="v2-dq-alias-created" title="Dibuat oleh ${esc(al.createdBy || '—')}&#10;${esc(al.createdAt || '')}${_mergedFrom ? `&#10;Merge dari: ${esc(_mergedFrom)}` : ''}${_mergedBy ? `&#10;Oleh ${esc(_mergedBy)} · ${esc(_mergedAt)}` : ''}">${createdStr}${_mergedFrom ? ' <span class="v2-dq-merge-tag" title="Hasil merge" style="font-size:10px;opacity:.7">⤵</span>' : ''}</td>
                    <td class="v2-dq-alias-actions">
                      <button class="v2-dq-undo-btn"
                        data-action="alias-undo"
                        data-type="${esc(al.type)}"
                        data-key="${esc(al.aliasKey)}"
                        data-restore="${esc(_mergedFrom || _decodeSafeKey(al.aliasKey))}"
                        title="Pulihkan nilai sumber dan hitung ulang analytics"
                        type="button">Batalkan Merge</button>
                      <button class="v2-dq-delete-btn"
                        data-action="alias-delete"
                        data-type="${esc(al.type)}"
                        data-key="${esc(al.aliasKey)}"
                        type="button">Hapus</button>
                    </td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>` : ''}

        </div>`;

  // ── §02 Operational Trends — de-boxed stat row (Sprint 7B) ─────────────
  // The 4 Trend-Engine KPIs as a de-boxed statrow with real period-over-period
  // deltas; never fabricates a comparison ('Semua Data' / insufficient history).
  const _cancRate = k.cancellationRate ?? (total + cancelled > 0 ? Math.round((cancelled / (total + cancelled)) * 100) : 0);
  const _activeCount = inProgress + scheduled;
  const _trendStat = (label, value, metric) => {
    const d = _trendDelta(metric);
    const deltaHtml = d
      ? `<div class="delta ${d.tone}">${d.icon} ${d.text}</div>`
      : `<div class="delta delta--none">—</div>`;
    return `<div class="st st--trend"><div class="l">${esc(label)}</div><div class="v">${value}</div>${deltaHtml}</div>`;
  };
  const _trendNote = _trendState === 'available' ? '' : (() => {
    const msg = _trendState === 'insufficient'
      ? 'Riwayat periode sebelumnya belum cukup untuk perbandingan.'
      : 'Perbandingan antar-periode tidak tersedia untuk “Semua Data”.';
    const hint = _trendState === 'insufficient'
      ? 'Indikator tren akan muncul saat tersedia data periode sebelumnya yang setara.'
      : 'Pilih rentang waktu tertentu (mis. 30 Hari) untuk melihat perubahan dibanding periode sebelumnya.';
    return `<p class="an-note">${esc(msg)} <span>${esc(hint)}</span></p>`;
  })();
  // Phase 4 (v1.10.8): operational status summary — counts, with cancelled
  // visible but clearly separated from active operations. Total = all
  // assignments (operational + cancelled) so the four figures reconcile.
  const _statusSummary = `
    <div class="statrow statrow--status">
      <div class="st"><div class="l">Total Penugasan</div><div class="v">${total + cancelled}</div></div>
      <div class="st"><div class="l">Selesai</div><div class="v">${completed}</div></div>
      <div class="st"><div class="l">Aktif</div><div class="v">${_activeCount}</div></div>
      <div class="st st--cancelled"><div class="l">Dibatalkan</div><div class="v">${cancelled}</div></div>
    </div>`;
  const trendsContent = `
    ${_statusSummary}
    ${_trendNote}
    <div class="statrow statrow--trends">
      ${_trendStat('Total Penugasan', total, _trends.totalAssignments)}
      ${_trendStat('Tingkat Penyelesaian', `${compRate}%`, _trends.completionRate)}
      ${_trendStat('Tingkat Open', `${openRate}%`, _trends.openRate)}
      ${_trendStat('Tingkat Pembatalan', `${_cancRate}%`, _trends.cancellationRate)}
    </div>
    ${chartStatusHtml ? `<div class="card">${chartStatusHtml}</div>` : ''}`;

  // ── §03 Operational Health — de-boxed divider list (Sprint 7B) ─────────
  // Merges the Insight Engine + Recommendation Engine into one prioritized
  // divider list (no nested boxes). Both arrays carry a `priority` already; we
  // render insights then recommendations, ordered P1 → P3 (highest first), each
  // tagged Wawasan / Rekomendasi. No new computation — values read from the model.
  const _insights = _analyticsModel.insights || [];
  const _recs     = _analyticsModel.recommendations || [];
  const _toneIns = (t) => (t === 'warning' ? 'warn' : t === 'success' ? 'good' : 'info');
  const _toneRec = (t) => (t === 'warning' ? 'warn' : t === 'optimization' ? 'good' : 'info');
  const _sevByPriority = (p) => (p === 1 ? 'Prioritas 1' : p === 2 ? 'Prioritas 2' : '');
  const _healthRows = [
    ..._insights.map(ins => ({
      priority: ins.priority || 3, kind: 'insight',
      html: renderInsightRow({ tone: _toneIns(ins.type), title: ins.title, desc: ins.description, sevLabel: _sevByPriority(ins.priority || 3), kind: 'Wawasan' }),
    })),
    ..._recs.map(rec => ({
      priority: rec.priority || 3, kind: 'recommendation',
      html: renderInsightRow({ tone: _toneRec(rec.type), title: rec.title, desc: rec.description, sevLabel: _sevByPriority(rec.priority || 3), kind: 'Rekomendasi' }),
    })),
  ].sort((a, b) => (a.priority - b.priority) || (a.kind === b.kind ? 0 : a.kind === 'insight' ? -1 : 1));
  const healthContent = _healthRows.length > 0
    ? renderInsightDividerList(_healthRows.map(r => r.html))
    : renderAnalyticsEmptyState({
        message: 'Belum ada temuan operasional untuk periode ini.',
        hint: 'Wawasan dan rekomendasi muncul otomatis dari data analytics yang tersedia.',
      });

  // ── §04 Resource Analytics — premium segmented control (Sprint 7B) ─────
  // The five existing fragments, one panel visible at a time (default Driver),
  // each wrapped in a prototype card. Chart canvas ids unchanged; tab switching +
  // chart resize handled by the delegated listener.
  const _resourceGroup = 'resource';
  const _wrapCard = (html) => `<div class="card">${html}</div>`;
  const resourceContent =
    renderSeg({
      groupId: _resourceGroup, activeId: 'driver',
      tabs: [
        { id: 'driver', label: 'Driver', icon: 'user' },
        { id: 'vehicle', label: 'Kendaraan', icon: 'car' },
        { id: 'bidang', label: 'Bidang', icon: 'building' },
        { id: 'destination', label: 'Tujuan', icon: 'pin' },
        { id: 'odometer', label: 'Jarak Tempuh', icon: 'ruler' },
      ],
    }) +
    renderAnalyticsTabPanels({
      groupId: _resourceGroup, activeId: 'driver',
      panels: [
        { id: 'driver', content: _wrapCard(driverContent) },
        { id: 'vehicle', content: _wrapCard(vehicleContent) },
        { id: 'bidang', content: _wrapCard(bidangContent) },
        { id: 'destination', content: _wrapCard(destContent) },
        { id: 'odometer', content: _wrapCard(odoContent) },
      ],
    });

  // ── §06 Export Center (v1.12.1C modernization) ────────────────────────────
  // Built entirely on the Registry (catalog) + Metadata (history/summary)
  // foundations: report cards come from listExportReports(), history + the
  // headline figures from the export metadata cache. Generate buttons dispatch
  // through runExportReport() (the ec-generate action). The realtime history
  // listener re-renders #ecRoot in place. No PDF/template/engine code here.
  const exportContent = renderModernExportCenter(getExportHistoryCache());

  // ── Compose the Claude Design experience — keynote hero + de-boxed eyebrow
  //    sections (Sprint 7B). Typography-first, hairline dividers, no card-in-card. ──
  contentEl.innerHTML = `
    <div class="v2-analytics-sections an-sections">
      ${heroSection}
      <section class="level an-level fade-up" id="analyticsHighlights">
        ${renderEyebrow({ title: 'Sorotan Operasional', sub: 'Temuan paling menentukan' })}
        ${highlightsBlock}
      </section>
      <section class="level an-level fade-up" id="analyticsTrends">
        ${renderEyebrow({ tag: '02', title: 'Operational Trends', sub: 'Perubahan dibanding periode sebelumnya' })}
        ${trendsContent}
      </section>
      <section class="level an-level fade-up" id="analyticsHealth">
        ${renderEyebrow({ tag: '03', title: 'Operational Health', sub: 'Wawasan & rekomendasi — prioritas tertinggi di atas' })}
        ${healthContent}
      </section>
      <section class="level an-level fade-up" id="analyticsResource">
        ${renderEyebrow({ tag: '04', title: 'Resource Analytics', sub: 'Driver · Kendaraan · Bidang · Tujuan · Jarak' })}
        ${resourceContent}
      </section>
      <section class="level an-level fade-up" id="analyticsDataQuality">
        ${renderEyebrow({ tag: '05', title: 'Data Quality Center', sub: 'Tinjau duplikasi data & tata kelola record (assignment + request)' })}
        <div class="card">${dqContent}</div>
      </section>
      <section class="level an-level fade-up" id="analyticsExport">
        ${renderEyebrow({ tag: '06', title: 'Export Center', sub: 'Katalog laporan · riwayat ekspor · ringkasan aktivitas' })}
        ${exportContent}
      </section>
    </div>
  `;
  // Phase 6: the chart layer consumes model.charts (same datasets, same values
  // — the Chart.js configuration in _renderAnalyticsCharts is unchanged).
  const _charts = _analyticsModel.charts;
  _renderAnalyticsCharts({
    completed:  _charts.status.completed,
    inProgress: _charts.status.inProgress,
    scheduled:  _charts.status.scheduled,
    cancelled:  _charts.status.cancelled,
    total:      _charts.status.total,
    activeDriversInPeriod: _charts.driverWorkload,
    vehiclesWithTrips:     _charts.vehicleUtil,
    bidangEnhanced:        _charts.bidangDemand,
    driverOdoList:         _charts.odoDriver,
    vehicleOdoList:        _charts.odoVehicle,
    totalKm:    _analyticsModel.kpis.totalKm,
    hasOdoData: _analyticsModel.render.hasOdoData,
  });

  // Sprint 7B micro-animations: count-up numbers + ring draw (calm, premium).
  _animateAnalyticsRegion(contentEl);
}

// ── Alias Resolution ──────────────────────────────────────────────────────

/**
 * Save (create / update / merge) an alias mapping. v1.16.4.10: writes
 * non-destructive merge provenance and a standardized audit event with
 * before/after so every change is traceable (Phase C/D).
 * @param {string} type
 * @param {string} aliasKey - RTDB-safe key (from _normDestKey)
 * @param {string} canonical
 * @param {{ sourceName?:string, reason?:string }} [meta]
 */
async function _saveAnalyticsAlias(type, aliasKey, canonical, meta = {}) {
  const cu = getCurrentUser();
  const who = cu?.displayName || cu?.username || '';
  const now = new Date().toISOString();
  const current = _getAnalyticsAliases(type);
  const before  = current[aliasKey] || null;          // prior mapping (for audit + UPDATED detection)

  // Phase C/D — entry construction (incl. non-destructive merge provenance) and
  // map application live in the pure alias engine; here we only persist + audit.
  const entry = _buildAliasEntry({ canonical, before, who, now, sourceName: meta.sourceName || null, reason: meta.reason });
  const updated = _applyAlias(current, aliasKey, entry);
  await updateSetting(`analyticsAliases.${type}`, updated);

  const action = _aliasSaveAction(before, meta.sourceName);
  logAction({
    userId: cu?.id, username: cu?.username, displayName: cu?.displayName,
    action, targetId: aliasKey,
    metadata: {
      type, aliasKey,
      before: before ? _getAliasCanonical(before) : null,
      after: canonical,
      sourceName: meta.sourceName || null,
      reason: meta.reason || null,
    },
  });
  showToast(`Alias disimpan: "${canonical}"`);
}

async function _deleteAnalyticsAlias(type, aliasKey) {
  const before   = _getAnalyticsAliases(type)[aliasKey] || null;
  const canonical = _getAliasCanonical(before) || aliasKey;
  const next     = _removeAlias(_getAnalyticsAliases(type), aliasKey);
  await updateSetting(`analyticsAliases.${type}`, Object.keys(next).length > 0 ? next : null);
  const cu = getCurrentUser();
  logAction({
    userId: cu?.id, username: cu?.username, displayName: cu?.displayName,
    action: _ALIAS_AUDIT.DELETED, targetId: aliasKey,
    metadata: { type, aliasKey, before: canonical, after: null },
  });
  showToast('Alias dihapus.');
}

/**
 * Undo a merge (Phase D). Because the merge is non-destructive (raw names are
 * preserved on every assignment), reverting is simply removing the alias
 * mapping — the source name then resolves to itself and analytics recompute.
 * Emits an ALIAS_RESTORED audit event carrying the reverted mapping.
 * @param {string} type
 * @param {string} aliasKey
 */
async function _undoAliasMerge(type, aliasKey) {
  const before   = _getAnalyticsAliases(type)[aliasKey] || null;
  if (!before) { showToast('Alias sudah tidak ada.'); return; }
  const canonical = _getAliasCanonical(before) || aliasKey;
  const restored  = (before && before.mergedFrom) || _decodeSafeKey(aliasKey);
  const next     = _removeAlias(_getAnalyticsAliases(type), aliasKey);
  await updateSetting(`analyticsAliases.${type}`, Object.keys(next).length > 0 ? next : null);
  const cu = getCurrentUser();
  logAction({
    userId: cu?.id, username: cu?.username, displayName: cu?.displayName,
    action: _ALIAS_AUDIT.RESTORED, targetId: aliasKey,
    metadata: { type, aliasKey, before: canonical, after: restored, restored },
  });
  showToast(`Merge dibatalkan: "${restored}" dipulihkan.`);
}

async function _dismissDqWarning(type, a, b) {
  const pairKey = _dqPairKey(a, b);
  const current = _getDismissedWarnings(type);
  const cu = getCurrentUser();
  const entry = { dismissedBy: cu?.displayName || cu?.username || '', dismissedAt: new Date().toISOString(), a, b };
  const updated = { ...current, [pairKey]: entry };
  await updateSetting(`analyticsQuality.dismissedWarnings.${type}`, updated);
  logAction({
    userId: cu?.id, username: cu?.username, displayName: cu?.displayName,
    action: 'warning_dismissed', targetId: pairKey,
    metadata: { type, a, b },
  });
  showToast('Warning diabaikan.');
}

async function _restoreDqWarning(type, pairKey) {
  const current = { ..._getDismissedWarnings(type) };
  delete current[pairKey];
  await updateSetting(`analyticsQuality.dismissedWarnings.${type}`, Object.keys(current).length > 0 ? current : null);
  const cu = getCurrentUser();
  logAction({
    userId: cu?.id, username: cu?.username, displayName: cu?.displayName,
    action: 'warning_restored', targetId: pairKey,
    metadata: { type, pairKey },
  });
  showToast('Warning ditampilkan kembali.');
}

/* ── Analytics PDF export ──────────────────────────────────────
   Builds the report view model from the latest analytics snapshot
   (so it matches the screen exactly) and hands off to the Document
   Engine — the same pipeline reimbursement uses. No new PDF code. */
async function exportAnalyticsReport(triggerBtn) {
  if (!_lastAnalyticsModel) refreshAnalyticsDisplay();
  if (!_lastAnalyticsModel) { showToast('Data analytics belum siap.'); return; }

  // Legacy pdfmake summary — invoked from the Export Center. The header
  // "Export PDF" control is now the dropdown (runAnalyticsExport), so this
  // path operates only on its own trigger button to avoid clobbering it.
  const btn = triggerBtn || null;
  if (btn) btn.disabled = true;

  const dateRangeLabels = {
    today: 'Hari Ini', '7d': '7 Hari Terakhir', '30d': '30 Hari Terakhir',
    '90d': '90 Hari Terakhir', all: 'Semua Data',
  };
  const user = getCurrentUser();
  const vm = {
    ..._lastAnalyticsModel,
    filters: {
      dateRange: dateRangeLabels[analyticsDateRange] || analyticsDateRange,
      driver:   analyticsDriverFilter  || 'Semua Driver',
      vehicle:  analyticsVehicleFilter || 'Semua Kendaraan',
      bidang:   analyticsBidangFilter  || 'Semua Bidang',
    },
    generatedAt: new Date().toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' }),
    generatedBy: (user && (user.displayName || user.name || user.username)) || '—',
    appVersion:  APP_VERSION,
  };

  try {
    await DocumentEngine.generateAndOpen('analytics-summary', vm, {
      viewer: { title: 'Laporan Analytics Operasional' },
    });
  } catch (err) {
    console.error('[Analytics] PDF export failed:', err);
    showToast('Gagal membuat PDF.');
  } finally {
    if (btn) btn.disabled = false;
  }
}

/* Analytics Export — runs one of the server-rendered reports
   (Driver/Vehicle/Bidang/Complete) through the validated window.export*
   pipeline. The id→handler mapping lives in the shared export registry
   (js/exports/export-registry.js), the single source of truth; metadata is
   logged to export-history afterwards. Shared by the header dropdown and the
   Export Center catalog cards — pass the clicked button as `triggerBtn` so its
   own busy state is shown. Filters & period pass through unchanged. */
async function runAnalyticsExport(report, triggerBtn = null) {
  const def = getExportReport(report);
  if (!def) return;
  const btn   = triggerBtn || document.getElementById('v2AnalyticsExportPdf');
  const label = btn ? (btn.querySelector('.v2-analytics-export-label, [data-busy-label]') || btn) : null;
  const prev  = label ? label.textContent : null;
  if (btn) btn.disabled = true;
  if (label) label.textContent = 'Memproses PDF…';

  // Build the metadata context from the registry + live export meta that
  // refreshAnalyticsDisplay publishes. Metadata only — no PDF/blob content.
  const meta = window._analyticsExportMeta || {};
  const u = getCurrentUser();
  const exportCtx = {
    reportId:     def.id,
    reportTitle:  def.title,
    periodLabel:  meta.periodLabel,
    dateRangeKey: meta.dateRangeKey,
    filters:      meta.filters,
    generatedBy:  meta.generatedBy || (u && (u.displayName || u.name || u.username)) || '—',
    userId:       u?.id,
    username:     u?.username,
    appVersion:   meta.appVersion || APP_VERSION,
  };
  const _startedAt = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const _elapsed = () => Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - _startedAt);

  try {
    const result = await runExportReport(report);
    const fileSize = result?.blob?.size;
    // Log metadata after a successful export. Never block/break the export on
    // a logging failure (logExportSuccess swallows its own errors).
    logExportSuccess(exportCtx, { fileSize, durationMs: _elapsed() });
  } catch (err) {
    console.error('[Analytics] PDF export failed:', err);
    logExportFailure(exportCtx, { error: err, durationMs: _elapsed() });
    showToast('Gagal membuat PDF.');
  } finally {
    if (btn) btn.disabled = false;
    if (label) label.textContent = prev || 'Export PDF';
  }
}

function initAliasResolutionModal() {
  if (document.getElementById('modalAliasResolution')) return;
  const modal = document.createElement('div');
  modal.id        = 'modalAliasResolution';
  modal.className = 'modal-overlay';
  modal.style.display = 'none';
  modal.innerHTML = `
    <div class="modal-box v2-alias-modal-box">
      <div class="modal-header">
        <h2 class="modal-title" id="aliasModalTitle">Gabungkan Alias</h2>
        <button class="modal-close" id="btnCloseAliasModal" type="button">&times;</button>
      </div>
      <div class="modal-body">
        <div class="v2-alias-detected-values" id="aliasDetectedValues"></div>
        <div class="v2-alias-form">
          <p class="v2-alias-form-label">Pilih nilai kanonik:</p>
          <label class="v2-alias-radio-row" id="aliasOptionA">
            <input type="radio" name="aliasCanonical" value="a"> <span id="aliasLabelA"></span>
          </label>
          <label class="v2-alias-radio-row" id="aliasOptionB">
            <input type="radio" name="aliasCanonical" value="b"> <span id="aliasLabelB"></span>
          </label>
          <label class="v2-alias-radio-row">
            <input type="radio" name="aliasCanonical" value="custom"> Nilai Kustom
          </label>
          <input type="text" class="v2-alias-custom-input" id="aliasCustomInput"
            placeholder="Masukkan nilai kanonik..." style="display:none;">
        </div>
        <div id="aliasImpactPreview" class="v2-alias-impact-preview" style="display:none;"></div>
      </div>
      <div class="v2-alias-modal-footer">
        <button class="p-btn p-btn-muted" id="btnAliasCancel" type="button">Batal</button>
        <button class="p-btn" id="btnAliasSave" type="button">Simpan Alias</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const closeModal = () => { modal.style.display = 'none'; };
  document.getElementById('btnCloseAliasModal')?.addEventListener('click', closeModal);
  document.getElementById('btnAliasCancel')?.addEventListener('click', closeModal);
  modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && modal.style.display !== 'none') closeModal();
  });

  modal.querySelectorAll('input[name="aliasCanonical"]').forEach(radio => {
    radio.addEventListener('change', () => {
      const customInput = document.getElementById('aliasCustomInput');
      if (customInput) customInput.style.display = radio.value === 'custom' ? 'block' : 'none';
    });
  });

  document.getElementById('btnAliasSave')?.addEventListener('click', async () => {
    const type     = modal.dataset.aliasType;
    const nameA    = modal.dataset.aliasA;
    const nameB    = modal.dataset.aliasB;
    const selected = modal.querySelector('input[name="aliasCanonical"]:checked')?.value;
    if (!selected) { showToast('Pilih nilai kanonik terlebih dahulu.', 'error'); return; }

    let canonical;
    if (selected === 'a')      canonical = nameA;
    else if (selected === 'b') canonical = nameB;
    else {
      // Phase B: a custom value must be real — not empty, not just punctuation
      // ("-", "_", ".", spaces). validateCustomAlias also returns the canonical
      // (Title-Cased, acronym-preserving) display form so casing variants agree.
      const v = _validateCustomAlias(document.getElementById('aliasCustomInput')?.value);
      if (!v.valid) { showToast(v.reason, 'error'); return; }
      canonical = v.value;
    }

    const aliasName = selected === 'b' ? nameA : nameB;
    const aliasKey  = _normDestKey(aliasName);

    const btn = document.getElementById('btnAliasSave');
    if (btn) { btn.disabled = true; btn.textContent = 'Menyimpan…'; }
    try {
      await _saveAnalyticsAlias(type, aliasKey, canonical, { sourceName: aliasName });
      closeModal();
    } catch (err) {
      showToast('Gagal menyimpan alias.', 'error');
      console.error('[Alias] save error:', err);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Simpan Alias'; }
    }
  });
}

function openAliasResolutionModal(type, a, b, countA = null, countB = null) {
  const modal = document.getElementById('modalAliasResolution');
  if (!modal) return;

  const typeLabels = { destinations: 'Tujuan', bidang: 'Bidang', drivers: 'Driver', vehicles: 'Kendaraan' };
  document.getElementById('aliasModalTitle').textContent = `Gabungkan Alias ${typeLabels[type] || type}`;
  document.getElementById('aliasDetectedValues').innerHTML = `
    <div class="v2-alias-detected-row">
      <span class="v2-alias-detected-label">Nilai yang terdeteksi:</span>
      <div class="v2-alias-detected-pair">
        <span class="v2-alias-detected-value">${esc(a)}</span>
        <span class="v2-alias-detected-sep">&amp;</span>
        <span class="v2-alias-detected-value">${esc(b)}</span>
      </div>
    </div>`;
  document.getElementById('aliasLabelA').textContent = a;
  document.getElementById('aliasLabelB').textContent = b;

  modal.querySelectorAll('input[name="aliasCanonical"]').forEach(r => { r.checked = false; });
  const customInput = document.getElementById('aliasCustomInput');
  if (customInput) { customInput.value = ''; customInput.style.display = 'none'; }

  const impactDiv = document.getElementById('aliasImpactPreview');
  if (impactDiv) {
    if (countA !== null && countB !== null) {
      const cA = parseInt(countA, 10) || 0;
      const cB = parseInt(countB, 10) || 0;
      impactDiv.innerHTML = `
        <div class="v2-alias-impact-row">
          <span class="v2-alias-impact-item"><strong>${esc(a)}</strong>: ${cA} asg</span>
          <span class="v2-alias-impact-sep">+</span>
          <span class="v2-alias-impact-item"><strong>${esc(b)}</strong>: ${cB} asg</span>
          <span class="v2-alias-impact-sep">→</span>
          <span class="v2-alias-impact-total">Gabungan: <strong>${cA + cB} asg</strong></span>
        </div>`;
      impactDiv.style.display = 'block';
    } else {
      impactDiv.style.display = 'none';
    }
  }

  modal.dataset.aliasType = type;
  modal.dataset.aliasA    = a;
  modal.dataset.aliasB    = b;
  modal.style.display     = 'flex';
}

// ── Destination Review Modal ───────────────────────────────────────────────

let _destReviewAllData = [];

function initDestinationReviewModal() {
  if (document.getElementById('modalDestReview')) return;
  const modal = document.createElement('div');
  modal.id        = 'modalDestReview';
  modal.className = 'modal-overlay';
  modal.style.display = 'none';
  modal.innerHTML = `
    <div class="modal-box v2-dest-review-modal-box">
      <div class="modal-header">
        <h2 class="modal-title">Tinjau Semua Tujuan</h2>
        <button class="modal-close" id="btnCloseDestReview" type="button">&times;</button>
      </div>
      <div class="modal-body">
        <input type="text" id="destReviewSearch" class="v2-dest-review-search"
          placeholder="Cari tujuan…" autocomplete="off">
        <p class="v2-dest-review-hint" id="destReviewHint">Pilih 2 tujuan untuk digabungkan.</p>
        <div class="v2-dest-review-list" id="destReviewList"></div>
      </div>
      <div class="v2-alias-modal-footer">
        <button class="p-btn p-btn-muted" id="btnDestReviewCancel" type="button">Tutup</button>
        <button class="p-btn" id="btnDestReviewMerge" type="button" disabled>Gabungkan Terpilih</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const closeModal = () => {
    modal.style.display = 'none';
    _destReviewAllData = [];
  };
  document.getElementById('btnCloseDestReview')?.addEventListener('click', closeModal);
  document.getElementById('btnDestReviewCancel')?.addEventListener('click', closeModal);
  modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && modal.style.display !== 'none') closeModal();
  });

  document.getElementById('destReviewSearch')?.addEventListener('input', e => {
    _renderDestReviewList(_destReviewAllData, e.target.value.trim().toLowerCase());
  });

  document.getElementById('btnDestReviewMerge')?.addEventListener('click', () => {
    const checked = document.querySelectorAll('#destReviewList input[type="checkbox"]:checked');
    if (checked.length !== 2) return;
    const [rawA, rawB] = Array.from(checked).map(c => c.dataset.raw);
    const countA = parseInt(checked[0].dataset.count, 10) || 0;
    const countB = parseInt(checked[1].dataset.count, 10) || 0;
    closeModal();
    openAliasResolutionModal('destinations', rawA, rawB, countA, countB);
  });
}

function openDestinationReviewModal() {
  const modal = document.getElementById('modalDestReview');
  if (!modal) return;

  const destAliases = _getAnalyticsAliases('destinations');
  const freqMap = new Map();
  for (const a of (window._analyticsFilteredAsg || [])) {
    const raw = (a.destination || '').trim();
    if (!raw) continue;
    let key = _normDestKey(raw);
    let label = raw;
    const canonical = _getAliasCanonical(destAliases[key]);
    if (canonical) { label = canonical; key = _normDestKey(label); }
    freqMap.set(label, (freqMap.get(label) || 0) + 1);
  }

  _destReviewAllData = Array.from(freqMap.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);

  const searchEl = document.getElementById('destReviewSearch');
  if (searchEl) searchEl.value = '';
  _renderDestReviewList(_destReviewAllData, '');

  const mergeBtn = document.getElementById('btnDestReviewMerge');
  if (mergeBtn) mergeBtn.disabled = true;

  modal.style.display = 'flex';
}

function _renderDestReviewList(allData, query) {
  const list = document.getElementById('destReviewList');
  if (!list) return;

  const filtered = query
    ? allData.filter(d => d.label.toLowerCase().includes(query))
    : allData;

  list.innerHTML = filtered.map(d => `
    <label class="v2-dest-review-row">
      <input type="checkbox" class="v2-dest-review-check"
        data-raw="${esc(d.label)}"
        data-count="${d.count}">
      <span class="v2-dest-review-name">${esc(d.label)}</span>
      <span class="v2-dest-review-count">${d.count} asg</span>
    </label>`).join('');

  if (filtered.length === 0) {
    list.innerHTML = '<p class="v2-analytics-empty" style="padding:12px;">Tidak ada tujuan ditemukan.</p>';
  }

  list.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', () => {
      const allChecked = list.querySelectorAll('input:checked');
      if (allChecked.length > 2) { cb.checked = false; return; }
      const mergeBtn = document.getElementById('btnDestReviewMerge');
      const hint     = document.getElementById('destReviewHint');
      if (mergeBtn) mergeBtn.disabled = allChecked.length !== 2;
      if (hint) {
        hint.textContent = allChecked.length === 2
          ? 'Klik "Gabungkan Terpilih" untuk membuat alias.'
          : `${allChecked.length}/2 tujuan dipilih.`;
      }
      list.querySelectorAll('.v2-dest-review-row').forEach(row => {
        const rowCb = row.querySelector('input');
        row.classList.toggle('v2-dest-review-row--selected', rowCb?.checked || false);
        if (!rowCb?.checked && allChecked.length >= 2) {
          rowCb.disabled = true;
        } else {
          rowCb.disabled = false;
        }
      });
    });
  });
}

/* ============================================================================
   ASSIGNMENT REVIEW — Analytics Governance Layer (Sprint 7D)

   The first operational UI for record-level analytics governance. Lets an admin
   review individual assignments and classify each as production / test data, or
   explicitly include/exclude it from analytics — WITHOUT deleting anything. The
   classification is written to `assignment.governance` (see analytics-governance.js,
   GOVERNANCE_RECOMMENDATION.md). The engine already consumes this via
   `filterEligible()` at its boundary, so excluding a record removes it from every
   downstream surface (KPIs, trends, insights, recommendations, health score, export)
   while it stays in the database, visible and editable operationally.

   This is built as the foundation for future analytics classification & governance
   controls — not a temporary fix.
   ============================================================================ */

// Review-scoped filters (independent from the on-screen analytics filters so the
// admin can audit the full record set, including currently-excluded records).
let _asgReviewFilters = { range: 'all', driver: '', vehicle: '', bidang: '', governance: 'all' };
let _asgReviewSearch  = '';

const _ASG_STATUS_META = {
  assigned:  { label: 'Ditugaskan',  cls: 'neutral' },
  scheduled: { label: 'Dijadwalkan', cls: 'info' },
  started:   { label: 'Berlangsung', cls: 'info' },
  completed: { label: 'Selesai',     cls: 'ok' },
  cancelled: { label: 'Dibatalkan',  cls: 'danger' },
  dibatalkan:{ label: 'Dibatalkan',  cls: 'danger' },
};

const _ASG_CLASS_LABELS = {
  production: 'Produksi',
  testing:    'Data Uji',
  training:   'Pelatihan',
  demo:       'Demo',
};

/** Resolve an assignment's bidang the same way the engine does (via its request). */
function _asgReviewBidangFor(a) {
  if (a.requestId) {
    const req = requests.find(r => r.id === a.requestId);
    if (req && (req.requesterName || '').trim()) return req.requesterName.trim();
  }
  return '';
}

/** Date-range membership for the review filter (relative to today; future-inclusive). */
function _asgReviewWithinRange(dateStr, range) {
  if (range === 'all' || !range) return true;
  if (!dateStr) return false;
  const days = range === 'today' ? 0 : range === '7d' ? 6 : range === '30d' ? 29 : range === '90d' ? 89 : null;
  if (days == null) return true;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const cutoff = new Date(today); cutoff.setDate(cutoff.getDate() - days);
  const d = new Date(`${dateStr}T00:00:00`);
  return !isNaN(d) && d >= cutoff;
}

/**
 * Write a governance classification onto one assignment (surgical, audited).
 * `gov` carries { classification, analyticsEligible }; provenance is stamped here.
 * Mirrors the existing single-record write pattern (saveAssignments + saveOneAssignment).
 */
function _setAssignmentGovernance(id, gov, actionLabel) {
  const idx = assignments.findIndex(a => a.id === id);
  if (idx === -1) return;
  const cu  = getCurrentUser();
  const now = new Date().toISOString();
  assignments[idx] = {
    ...assignments[idx],
    governance: {
      classification:   gov.classification,
      analyticsEligible: gov.analyticsEligible,
      classifiedBy:     cu?.name || cu?.displayName || cu?.username || '',
      classifiedAt:     now,
    },
    updatedAt: now,
  };
  saveAssignments(assignments);          // localStorage
  saveOneAssignment(assignments[idx]);   // surgical Firebase write of /assignments/{id}

  logAction({
    userId: cu?.id, username: cu?.username, displayName: cu?.name,
    action: 'assignment_classified', targetId: id,
    metadata: {
      classification:    gov.classification,
      analyticsEligible: gov.analyticsEligible,
      action:            actionLabel,
    },
  });

  // The governance change re-filters analytics immediately; refresh the live view
  // and the open review table so both reflect the new eligibility.
  if (activeAdminSection === 'analytics') refreshAnalyticsDisplay();
  _renderAssignmentReviewList();
  showToast(actionLabel);
}

function initAssignmentReviewModal() {
  if (document.getElementById('modalAsgReview')) return;
  const modal = document.createElement('div');
  modal.id        = 'modalAsgReview';
  modal.className = 'modal-overlay';
  modal.style.display = 'none';
  modal.innerHTML = `
    <div class="modal-box v2-asg-review-modal-box">
      <div class="modal-header">
        <h2 class="modal-title">Tinjau Assignment</h2>
        <button class="modal-close" id="btnCloseAsgReview" type="button">&times;</button>
      </div>
      <div class="modal-body">
        <p class="v2-asg-review-intro">Tata kelola data analytics tingkat-record. Klasifikasikan assignment sebagai data produksi atau data uji, atau keluarkan/pulihkan dari analytics. Record tetap tersimpan & dapat diedit secara operasional — hanya partisipasinya dalam analytics yang berubah.</p>
        <div class="v2-asg-review-filters">
          <select id="asgReviewRange" class="v2-admin-filter">
            <option value="today">Hari Ini</option>
            <option value="7d">7 Hari Terakhir</option>
            <option value="30d">30 Hari Terakhir</option>
            <option value="90d">90 Hari Terakhir</option>
            <option value="all" selected>Semua Data</option>
          </select>
          <select id="asgReviewDriver" class="v2-admin-filter"><option value="">Semua Driver</option></select>
          <select id="asgReviewVehicle" class="v2-admin-filter"><option value="">Semua Kendaraan</option></select>
          <select id="asgReviewBidang" class="v2-admin-filter"><option value="">Semua Bidang</option></select>
          <select id="asgReviewGovernance" class="v2-admin-filter">
            <option value="all" selected>Semua Klasifikasi</option>
            <option value="included">Disertakan</option>
            <option value="excluded">Dikecualikan</option>
          </select>
          <input type="text" id="asgReviewSearch" class="v2-asg-review-search" placeholder="Cari ID / tujuan…" autocomplete="off">
        </div>
        <p class="v2-asg-review-summary" id="asgReviewSummary"></p>
        <div class="v2-asg-review-table-wrap">
          <table class="v2-asg-review-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Tanggal</th>
                <th>Driver</th>
                <th>Kendaraan</th>
                <th>Bidang</th>
                <th>Tujuan</th>
                <th>Status</th>
                <th>Klasifikasi</th>
                <th class="v2-asg-review-actions-th">Tata Kelola</th>
              </tr>
            </thead>
            <tbody id="asgReviewBody"></tbody>
          </table>
        </div>
      </div>
      <div class="v2-alias-modal-footer">
        <button class="p-btn p-btn-muted" id="btnAsgReviewClose" type="button">Tutup</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const closeModal = () => { modal.style.display = 'none'; };
  document.getElementById('btnCloseAsgReview')?.addEventListener('click', closeModal);
  document.getElementById('btnAsgReviewClose')?.addEventListener('click', closeModal);
  modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && modal.style.display !== 'none') closeModal();
  });

  // Filter wiring
  document.getElementById('asgReviewRange')?.addEventListener('change', e => {
    _asgReviewFilters.range = e.target.value; _renderAssignmentReviewList();
  });
  document.getElementById('asgReviewDriver')?.addEventListener('change', e => {
    _asgReviewFilters.driver = e.target.value; _renderAssignmentReviewList();
  });
  document.getElementById('asgReviewVehicle')?.addEventListener('change', e => {
    _asgReviewFilters.vehicle = e.target.value; _renderAssignmentReviewList();
  });
  document.getElementById('asgReviewBidang')?.addEventListener('change', e => {
    _asgReviewFilters.bidang = e.target.value; _renderAssignmentReviewList();
  });
  document.getElementById('asgReviewGovernance')?.addEventListener('change', e => {
    _asgReviewFilters.governance = e.target.value; _renderAssignmentReviewList();
  });
  document.getElementById('asgReviewSearch')?.addEventListener('input', e => {
    _asgReviewSearch = e.target.value.trim().toLowerCase(); _renderAssignmentReviewList();
  });

  // Delegated governance-action clicks (one listener for the whole table body).
  document.getElementById('asgReviewBody')?.addEventListener('click', e => {
    const btn = e.target.closest('[data-gov-action]');
    if (!btn || btn.disabled) return;
    const id  = btn.dataset.id;
    const act = btn.dataset.govAction;
    if (act === 'produksi') {
      _setAssignmentGovernance(id, { classification: 'production', analyticsEligible: true }, 'Ditandai sebagai data produksi');
    } else if (act === 'uji') {
      _setAssignmentGovernance(id, { classification: 'testing', analyticsEligible: false }, 'Ditandai sebagai data uji');
    } else if (act === 'keluarkan') {
      const cur = classificationOf(assignments.find(a => a.id === id) || {});
      _setAssignmentGovernance(id, { classification: cur.classification || 'production', analyticsEligible: false }, 'Dikeluarkan dari analytics');
    } else if (act === 'pulihkan') {
      _setAssignmentGovernance(id, { classification: 'production', analyticsEligible: true }, 'Dipulihkan ke analytics');
    }
  });
}

function _populateAsgReviewFilters() {
  const drvSel = document.getElementById('asgReviewDriver');
  if (drvSel) {
    const drvList = getDrivers().filter(d => d.active !== false && !d.archived);
    drvSel.innerHTML = '<option value="">Semua Driver</option>' +
      drvList.map(d => `<option value="${esc(d.name)}"${d.name === _asgReviewFilters.driver ? ' selected' : ''}>${esc(d.name)}</option>`).join('');
  }
  const vehSel = document.getElementById('asgReviewVehicle');
  if (vehSel) {
    const vehList = getActiveVehiclesFromStore().filter(v => !v.archived);
    vehSel.innerHTML = '<option value="">Semua Kendaraan</option>' +
      vehList.map(v => `<option value="${esc(v.name)}"${v.name === _asgReviewFilters.vehicle ? ' selected' : ''}>${esc(v.name)}</option>`).join('');
  }
  const bidSel = document.getElementById('asgReviewBidang');
  if (bidSel) {
    const bidangNames = [...new Set(requests.map(r => r.requesterName || '').filter(Boolean))].sort();
    bidSel.innerHTML = '<option value="">Semua Bidang</option>' +
      bidangNames.map(n => `<option value="${esc(n)}"${n === _asgReviewFilters.bidang ? ' selected' : ''}>${esc(n)}</option>`).join('');
  }
  const rangeSel = document.getElementById('asgReviewRange');
  if (rangeSel) rangeSel.value = _asgReviewFilters.range;
  const govSel = document.getElementById('asgReviewGovernance');
  if (govSel) govSel.value = _asgReviewFilters.governance;
  const searchEl = document.getElementById('asgReviewSearch');
  if (searchEl) searchEl.value = _asgReviewSearch;
}

function openAssignmentReviewModal() {
  const modal = document.getElementById('modalAsgReview');
  if (!modal) return;
  _populateAsgReviewFilters();
  _renderAssignmentReviewList();
  modal.style.display = 'flex';
}

function _renderAssignmentReviewList() {
  const body = document.getElementById('asgReviewBody');
  const summaryEl = document.getElementById('asgReviewSummary');
  if (!body) return;

  const f = _asgReviewFilters;
  const q = _asgReviewSearch;

  const rows = assignments.filter(a => {
    if (!_asgReviewWithinRange(a.date, f.range)) return false;
    if (f.driver && (a.driver || '') !== f.driver) return false;
    if (f.vehicle && (a.vehicle || '') !== f.vehicle) return false;
    if (f.bidang && _asgReviewBidangFor(a) !== f.bidang) return false;
    const cls = classificationOf(a);
    if (f.governance === 'included' && !cls.eligible) return false;
    if (f.governance === 'excluded' && cls.eligible) return false;
    if (q) {
      const hay = `${a.id || ''} ${a.destination || ''} ${a.driver || ''} ${a.vehicle || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));

  if (summaryEl) {
    const excluded = rows.filter(a => !classificationOf(a).eligible).length;
    summaryEl.textContent = rows.length === 0
      ? 'Tidak ada assignment yang cocok dengan filter.'
      : `${rows.length} assignment · ${excluded} dikecualikan dari analytics`;
  }

  if (rows.length === 0) {
    body.innerHTML = `<tr><td colspan="9" class="v2-asg-review-empty">Tidak ada assignment yang cocok dengan filter.</td></tr>`;
    return;
  }

  body.innerHTML = rows.map(a => {
    const cls    = classificationOf(a);
    const statM  = _ASG_STATUS_META[a.status] || { label: a.status || '—', cls: 'neutral' };
    const dateStr = a.date
      ? new Date(`${a.date}T00:00:00`).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: '2-digit' })
      : '—';
    const bidang = _asgReviewBidangFor(a) || '—';
    const idShort = (a.id || '—');

    const classChip = cls.eligible
      ? `<span class="v2-asg-class-chip v2-asg-class-chip--included">Disertakan</span>`
      : `<span class="v2-asg-class-chip v2-asg-class-chip--excluded">Dikecualikan</span>`;
    const classLabel = cls.explicit
      ? `<span class="v2-asg-class-sub">${esc(_ASG_CLASS_LABELS[cls.classification] || cls.classification)}</span>`
      : '';

    const isProdEligible = cls.eligible && cls.classification === 'production';
    const btn = (act, label, disabled) =>
      `<button type="button" class="v2-asg-act-btn v2-asg-act-btn--${act}" data-gov-action="${act}" data-id="${esc(a.id)}"${disabled ? ' disabled' : ''}>${label}</button>`;

    return `<tr class="${cls.eligible ? '' : 'v2-asg-review-row--excluded'}">
      <td class="v2-asg-id" title="${esc(a.id || '')}">${esc(idShort)}</td>
      <td class="v2-asg-date">${esc(dateStr)}</td>
      <td>${esc(a.driver || '—')}</td>
      <td>${esc(vehicleLabel(a.vehicle))}</td>
      <td>${esc(bidang)}</td>
      <td class="v2-asg-dest" title="${esc(a.destination || '')}">${esc(a.destination || '—')}</td>
      <td><span class="v2-asg-status-chip v2-asg-status-chip--${statM.cls}">${esc(statM.label)}</span></td>
      <td>${classChip}${classLabel}</td>
      <td class="v2-asg-review-actions">
        ${btn('produksi', 'Produksi', isProdEligible)}
        ${btn('uji', 'Uji', cls.classification === 'testing' && !cls.eligible)}
        ${btn('keluarkan', 'Keluarkan', !cls.eligible)}
        ${btn('pulihkan', 'Pulihkan', cls.eligible)}
      </td>
    </tr>`;
  }).join('');
}

/* ============================================================================
   REQUEST REVIEW — Analytics Governance Layer, driver_requests (Sprint 7D)

   Governance is record-level and must cover BOTH record kinds. Many analytics
   test records originate from driver_requests (pending/rejected/cancelled/test
   workflows) rather than finalized assignments. This screen mirrors Assignment
   Review for `/driver_requests`: the same governance block, the same four actions,
   the same engine gate (`filterEligible` now also runs over ctx.requests). Writes
   go through the existing request persistence path (saveRequests) and are audited.
   ============================================================================ */

let _reqReviewFilters = { range: 'all', driver: '', vehicle: '', bidang: '', status: 'all', governance: 'all' };
let _reqReviewSearch  = '';

const _REQ_STATUS_META = {
  pending:    { label: 'Menunggu',   cls: 'info' },
  approved:   { label: 'Disetujui',  cls: 'ok' },
  rejected:   { label: 'Ditolak',    cls: 'danger' },
  cancelled:  { label: 'Dibatalkan', cls: 'danger' },
  dibatalkan: { label: 'Dibatalkan', cls: 'danger' },
};

/** A request's analytics date — same rule the engine uses (_reqDate). */
function _reqReviewDate(r) { return r.startDate || (r.createdAt || '').slice(0, 10) || ''; }
/** A request's destination — requests carry `purpose`; some legacy carry `destination`. */
function _reqReviewDest(r) { return r.destination || r.purpose || ''; }

/**
 * Write a governance classification onto one driver_request (audited).
 * Requests persist as a whole collection (saveRequests) — the established path —
 * so we map the array and write it; the engine re-filters on the next refresh.
 */
function _setRequestGovernance(id, gov, actionLabel) {
  const idx = requests.findIndex(r => r.id === id);
  if (idx === -1) return;
  const cu  = getCurrentUser();
  const now = new Date().toISOString();
  requests = requests.map(r => r.id === id ? {
    ...r,
    governance: {
      classification:    gov.classification,
      analyticsEligible: gov.analyticsEligible,
      classifiedBy:      cu?.name || cu?.displayName || cu?.username || '',
      classifiedAt:      now,
    },
    updatedAt: now,
  } : r);
  saveRequests(requests);

  logAction({
    userId: cu?.id, username: cu?.username, displayName: cu?.name,
    action: 'request_classified', targetId: id,
    metadata: {
      classification:    gov.classification,
      analyticsEligible: gov.analyticsEligible,
      action:            actionLabel,
    },
  });

  if (activeAdminSection === 'analytics') refreshAnalyticsDisplay();
  _renderRequestReviewList();
  showToast(actionLabel);
}

function initRequestReviewModal() {
  if (document.getElementById('modalReqReview')) return;
  const modal = document.createElement('div');
  modal.id        = 'modalReqReview';
  modal.className = 'modal-overlay';
  modal.style.display = 'none';
  modal.innerHTML = `
    <div class="modal-box v2-asg-review-modal-box v2-req-review-modal-box">
      <div class="modal-header">
        <h2 class="modal-title">Tinjau Request</h2>
        <button class="modal-close" id="btnCloseReqReview" type="button">&times;</button>
      </div>
      <div class="modal-body">
        <p class="v2-asg-review-intro">Tata kelola data analytics untuk driver_requests. Banyak data uji berasal dari request (menunggu / ditolak / dibatalkan / alur uji bidang). Klasifikasikan tiap request atau keluarkan/pulihkan dari analytics — record tetap tersimpan di Firebase, dapat diedit, dan terlihat secara operasional. Ketuk baris untuk detail pemohon, driver &amp; kendaraan.</p>
        <div class="v2-asg-review-filters">
          <select id="reqReviewRange" class="v2-admin-filter">
            <option value="today">Hari Ini</option>
            <option value="7d">7 Hari Terakhir</option>
            <option value="30d">30 Hari Terakhir</option>
            <option value="90d">90 Hari Terakhir</option>
            <option value="all" selected>Semua Data</option>
          </select>
          <select id="reqReviewDriver" class="v2-admin-filter"><option value="">Semua Driver</option></select>
          <select id="reqReviewVehicle" class="v2-admin-filter"><option value="">Semua Kendaraan</option></select>
          <select id="reqReviewBidang" class="v2-admin-filter"><option value="">Semua Bidang</option></select>
          <select id="reqReviewStatus" class="v2-admin-filter">
            <option value="all" selected>Semua Status</option>
            <option value="pending">Menunggu</option>
            <option value="approved">Disetujui</option>
            <option value="rejected">Ditolak</option>
          </select>
          <select id="reqReviewGovernance" class="v2-admin-filter">
            <option value="all" selected>Semua Klasifikasi</option>
            <option value="included">Disertakan</option>
            <option value="excluded">Dikecualikan</option>
          </select>
          <input type="text" id="reqReviewSearch" class="v2-asg-review-search" placeholder="Cari ID / tujuan / pemohon…" autocomplete="off">
        </div>
        <p class="v2-asg-review-summary" id="reqReviewSummary"></p>
        <div class="v2-asg-review-table-wrap">
          <table class="v2-asg-review-table v2-req-review-table">
            <thead>
              <tr>
                <th class="v2-req-exp-th" aria-hidden="true"></th>
                <th>Tanggal</th>
                <th>Bidang</th>
                <th>Tujuan</th>
                <th>Status</th>
                <th>Klasifikasi</th>
                <th class="v2-asg-review-actions-th">Tata Kelola</th>
              </tr>
            </thead>
            <tbody id="reqReviewBody"></tbody>
          </table>
        </div>
      </div>
      <div class="v2-alias-modal-footer">
        <button class="p-btn p-btn-muted" id="btnReqReviewClose" type="button">Tutup</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const closeModal = () => { modal.style.display = 'none'; };
  document.getElementById('btnCloseReqReview')?.addEventListener('click', closeModal);
  document.getElementById('btnReqReviewClose')?.addEventListener('click', closeModal);
  modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && modal.style.display !== 'none') closeModal();
  });

  document.getElementById('reqReviewRange')?.addEventListener('change', e => {
    _reqReviewFilters.range = e.target.value; _renderRequestReviewList();
  });
  document.getElementById('reqReviewDriver')?.addEventListener('change', e => {
    _reqReviewFilters.driver = e.target.value; _renderRequestReviewList();
  });
  document.getElementById('reqReviewVehicle')?.addEventListener('change', e => {
    _reqReviewFilters.vehicle = e.target.value; _renderRequestReviewList();
  });
  document.getElementById('reqReviewBidang')?.addEventListener('change', e => {
    _reqReviewFilters.bidang = e.target.value; _renderRequestReviewList();
  });
  document.getElementById('reqReviewStatus')?.addEventListener('change', e => {
    _reqReviewFilters.status = e.target.value; _renderRequestReviewList();
  });
  document.getElementById('reqReviewGovernance')?.addEventListener('change', e => {
    _reqReviewFilters.governance = e.target.value; _renderRequestReviewList();
  });
  document.getElementById('reqReviewSearch')?.addEventListener('input', e => {
    _reqReviewSearch = e.target.value.trim().toLowerCase(); _renderRequestReviewList();
  });

  document.getElementById('reqReviewBody')?.addEventListener('click', e => {
    // Row expand/collapse — reveals the secondary fields (Pemohon/Driver/Kendaraan).
    const toggle = e.target.closest('[data-req-toggle]');
    if (toggle) {
      const id = toggle.dataset.reqToggle;
      const detail = document.querySelector(`#reqReviewBody tr[data-detail-for="${CSS.escape(id)}"]`);
      const open = toggle.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (detail) detail.hidden = !open;
      return;
    }
    const btn = e.target.closest('[data-gov-action]');
    if (!btn || btn.disabled) return;
    const id  = btn.dataset.id;
    const act = btn.dataset.govAction;
    if (act === 'produksi') {
      _setRequestGovernance(id, { classification: 'production', analyticsEligible: true }, 'Ditandai sebagai data produksi');
    } else if (act === 'uji') {
      _setRequestGovernance(id, { classification: 'testing', analyticsEligible: false }, 'Ditandai sebagai data uji');
    } else if (act === 'keluarkan') {
      const cur = classificationOf(requests.find(r => r.id === id) || {});
      _setRequestGovernance(id, { classification: cur.classification || 'production', analyticsEligible: false }, 'Dikeluarkan dari analytics');
    } else if (act === 'pulihkan') {
      _setRequestGovernance(id, { classification: 'production', analyticsEligible: true }, 'Dipulihkan ke analytics');
    }
  });
}

function _populateReqReviewFilters() {
  const drvSel = document.getElementById('reqReviewDriver');
  if (drvSel) {
    const drvList = getDrivers().filter(d => d.active !== false && !d.archived);
    drvSel.innerHTML = '<option value="">Semua Driver</option>' +
      drvList.map(d => `<option value="${esc(d.name)}"${d.name === _reqReviewFilters.driver ? ' selected' : ''}>${esc(d.name)}</option>`).join('');
  }
  const vehSel = document.getElementById('reqReviewVehicle');
  if (vehSel) {
    const vehList = getActiveVehiclesFromStore().filter(v => !v.archived);
    vehSel.innerHTML = '<option value="">Semua Kendaraan</option>' +
      vehList.map(v => `<option value="${esc(v.name)}"${v.name === _reqReviewFilters.vehicle ? ' selected' : ''}>${esc(v.name)}</option>`).join('');
  }
  const bidSel = document.getElementById('reqReviewBidang');
  if (bidSel) {
    const bidangNames = [...new Set(requests.map(r => r.requesterName || '').filter(Boolean))].sort();
    bidSel.innerHTML = '<option value="">Semua Bidang</option>' +
      bidangNames.map(n => `<option value="${esc(n)}"${n === _reqReviewFilters.bidang ? ' selected' : ''}>${esc(n)}</option>`).join('');
  }
  const rangeSel = document.getElementById('reqReviewRange');
  if (rangeSel) rangeSel.value = _reqReviewFilters.range;
  const statusSel = document.getElementById('reqReviewStatus');
  if (statusSel) statusSel.value = _reqReviewFilters.status;
  const govSel = document.getElementById('reqReviewGovernance');
  if (govSel) govSel.value = _reqReviewFilters.governance;
  const searchEl = document.getElementById('reqReviewSearch');
  if (searchEl) searchEl.value = _reqReviewSearch;
}

function openRequestReviewModal() {
  const modal = document.getElementById('modalReqReview');
  if (!modal) return;
  _populateReqReviewFilters();
  _renderRequestReviewList();
  modal.style.display = 'flex';
}

function _renderRequestReviewList() {
  const body = document.getElementById('reqReviewBody');
  const summaryEl = document.getElementById('reqReviewSummary');
  if (!body) return;

  const f = _reqReviewFilters;
  const q = _reqReviewSearch;

  const rows = requests.filter(r => {
    if (!_asgReviewWithinRange(_reqReviewDate(r), f.range)) return false;
    if (f.driver && (r.driver || '') !== f.driver) return false;
    if (f.vehicle && (r.vehicle || '') !== f.vehicle) return false;
    if (f.bidang && (r.requesterName || '') !== f.bidang) return false;
    if (f.status !== 'all' && (r.status || '') !== f.status) return false;
    const cls = classificationOf(r);
    if (f.governance === 'included' && !cls.eligible) return false;
    if (f.governance === 'excluded' && cls.eligible) return false;
    if (q) {
      const hay = `${r.id || ''} ${_reqReviewDest(r)} ${r.requesterName || ''} ${r.driver || ''} ${r.vehicle || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }).sort((a, b) => String(_reqReviewDate(b)).localeCompare(String(_reqReviewDate(a))));

  if (summaryEl) {
    const excluded = rows.filter(r => !classificationOf(r).eligible).length;
    summaryEl.textContent = rows.length === 0
      ? 'Tidak ada request yang cocok dengan filter.'
      : `${rows.length} request · ${excluded} dikecualikan dari analytics`;
  }

  if (rows.length === 0) {
    body.innerHTML = `<tr><td colspan="7" class="v2-asg-review-empty">Tidak ada request yang cocok dengan filter.</td></tr>`;
    return;
  }

  const chevron = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>`;

  body.innerHTML = rows.map(r => {
    const cls    = classificationOf(r);
    const statM  = _REQ_STATUS_META[r.status] || { label: r.status || '—', cls: 'neutral' };
    const dRaw   = _reqReviewDate(r);
    const dateStr = dRaw
      ? new Date(`${dRaw}T00:00:00`).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: '2-digit' })
      : '—';
    const dest = _reqReviewDest(r);

    const classChip = cls.eligible
      ? `<span class="v2-asg-class-chip v2-asg-class-chip--included">Disertakan</span>`
      : `<span class="v2-asg-class-chip v2-asg-class-chip--excluded">Dikecualikan</span>`;
    const classLabel = cls.explicit
      ? `<span class="v2-asg-class-sub">${esc(_ASG_CLASS_LABELS[cls.classification] || cls.classification)}</span>`
      : '';

    const isProdEligible = cls.eligible && cls.classification === 'production';
    const btn = (act, label, disabled) =>
      `<button type="button" class="v2-asg-act-btn v2-asg-act-btn--${act}" data-gov-action="${act}" data-id="${esc(r.id)}"${disabled ? ' disabled' : ''}>${label}</button>`;

    // Primary row (fits the viewport, no horizontal scroll); secondary fields
    // live in the expandable detail row below — operational review, not a DB dump.
    const mainRow = `<tr class="v2-req-main-row ${cls.eligible ? '' : 'v2-asg-review-row--excluded'}">
      <td class="v2-req-exp-cell">
        <button type="button" class="v2-req-exp-btn" data-req-toggle="${esc(r.id)}" aria-expanded="false" aria-label="Tampilkan detail">${chevron}</button>
      </td>
      <td class="v2-asg-date">${esc(dateStr)}</td>
      <td class="v2-req-bidang" title="${esc(r.requesterName || '')}">${esc(r.requesterName || '—')}</td>
      <td class="v2-asg-dest" title="${esc(dest)}">${esc(dest || '—')}</td>
      <td><span class="v2-asg-status-chip v2-asg-status-chip--${statM.cls}">${esc(statM.label)}</span></td>
      <td>${classChip}${classLabel}</td>
      <td class="v2-asg-review-actions">
        ${btn('produksi', 'Produksi', isProdEligible)}
        ${btn('uji', 'Uji', cls.classification === 'testing' && !cls.eligible)}
        ${btn('keluarkan', 'Keluarkan', !cls.eligible)}
        ${btn('pulihkan', 'Pulihkan', cls.eligible)}
      </td>
    </tr>`;

    const detailField = (label, value) =>
      `<div class="v2-req-detail-item"><span class="v2-req-detail-label">${label}</span><span class="v2-req-detail-value">${esc(value || '—')}</span></div>`;
    const detailRow = `<tr class="v2-req-detail-row" data-detail-for="${esc(r.id)}" hidden>
      <td></td>
      <td colspan="6">
        <div class="v2-req-detail-grid">
          ${detailField('Request ID', r.id)}
          ${detailField('Pemohon', r.requesterName)}
          ${detailField('Driver', r.driver)}
          ${detailField('Kendaraan', r.vehicle)}
        </div>
      </td>
    </tr>`;

    return mainRow + detailRow;
  }).join('');
}

function _renderAnalyticsCharts({ completed, inProgress, scheduled, cancelled, total,
    activeDriversInPeriod, vehiclesWithTrips, bidangEnhanced,
    driverOdoList, vehicleOdoList, totalKm, hasOdoData }) {
  if (typeof Chart === 'undefined') return;

  const isDark    = document.documentElement.getAttribute('data-theme') === 'dark';
  const textColor = isDark ? '#9A9690' : '#5B5953';
  const gridColor = isDark ? '#31333C' : '#E8E6E2';
  const surfBg    = isDark ? '#262830' : '#FBFAF8';

  Chart.defaults.font.family = "'Inter', sans-serif";
  Chart.defaults.font.size   = 11;

  const PALETTE = ['#3B5BA9','#2F7D62','#946420','#6B4E9E','#1E7A8A','#A8292F','#7A6E2A','#2A7A6E'];

  function _makeChart(id, config) {
    const el = document.getElementById(id);
    if (!el) return;
    try { _analyticsCharts.set(id, new Chart(el, config)); } catch (_) {}
  }

  // 1. Assignment status donut — cancelled shown as its own labelled slice.
  //    Percentages are over the sum of all slices (operational + cancelled),
  //    so the donut's segments add up to 100%.
  const _statusSum = completed + inProgress + scheduled + cancelled;
  if (_statusSum > 0) {
    _makeChart('chartAssignmentStatus', {
      type: 'doughnut',
      data: {
        labels: ['Selesai', 'Berlangsung', 'Dijadwalkan', 'Dibatalkan'],
        datasets: [{ data: [completed, inProgress, scheduled, cancelled],
          backgroundColor: ['#2F7D62','#3B5BA9','#7A7D8A','#A8292F'],
          borderColor: surfBg, borderWidth: 2, hoverOffset: 4 }]
      },
      options: { responsive: true, maintainAspectRatio: true, cutout: '62%',
        plugins: {
          legend: { position: 'bottom', labels: { color: textColor, padding: 14, boxWidth: 12 } },
          tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.parsed} (${_statusSum > 0 ? Math.round(ctx.parsed / _statusSum * 100) : 0}%)` } }
        }
      }
    });
  }

  // 2. Driver workload horizontal bar
  const topDrv = activeDriversInPeriod.slice(0, 12);
  if (topDrv.length > 0) {
    _makeChart('chartDriverWorkload', {
      type: 'bar',
      data: {
        labels: topDrv.map(d => d.displayName),
        datasets: [{ label: 'Penugasan', data: topDrv.map(d => d.count),
          backgroundColor: '#A8292FCC', borderColor: '#A8292F', borderWidth: 1, borderRadius: 3 }]
      },
      options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: gridColor }, ticks: { color: textColor, precision: 0 }, border: { color: gridColor } },
          y: { grid: { display: false }, ticks: { color: textColor }, border: { color: gridColor } }
        }
      }
    });
  }

  // 3. Vehicle utilization horizontal bar
  const topVeh = vehiclesWithTrips.slice(0, 10);
  if (topVeh.length > 0) {
    _makeChart('chartVehicleUtil', {
      type: 'bar',
      data: {
        labels: topVeh.map(v => v.displayName),
        datasets: [{ label: 'Penugasan', data: topVeh.map(v => v.count),
          backgroundColor: '#3B5BA9CC', borderColor: '#3B5BA9', borderWidth: 1, borderRadius: 3 }]
      },
      options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: gridColor }, ticks: { color: textColor, precision: 0 }, border: { color: gridColor } },
          y: { grid: { display: false }, ticks: { color: textColor }, border: { color: gridColor } }
        }
      }
    });
  }

  // 4. Bidang demand donut
  const topBidang = bidangEnhanced.slice(0, 8).filter(b => b.reqCount > 0);
  if (topBidang.length > 1) {
    _makeChart('chartBidangDemand', {
      type: 'doughnut',
      data: {
        labels: topBidang.map(b => b.name),
        datasets: [{ data: topBidang.map(b => b.reqCount),
          backgroundColor: PALETTE.slice(0, topBidang.length),
          borderColor: surfBg, borderWidth: 2, hoverOffset: 4 }]
      },
      options: { responsive: true, maintainAspectRatio: true, cutout: '58%',
        plugins: {
          legend: { position: 'bottom', labels: { color: textColor, padding: 12, boxWidth: 12 } },
          tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.parsed} permintaan` } }
        }
      }
    });
  }

  // 5. Odometer per driver horizontal bar
  if (driverOdoList.length > 0) {
    _makeChart('chartOdoDriver', {
      type: 'bar',
      data: {
        labels: driverOdoList.map(d => d.name),
        datasets: [{ label: 'Jarak (km)', data: driverOdoList.map(d => d.km),
          backgroundColor: '#2F7D62CC', borderColor: '#2F7D62', borderWidth: 1, borderRadius: 3 }]
      },
      options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: gridColor }, ticks: { color: textColor }, border: { color: gridColor } },
          y: { grid: { display: false }, ticks: { color: textColor }, border: { color: gridColor } }
        }
      }
    });
  }

  // 6. Odometer per vehicle horizontal bar
  if (vehicleOdoList.length > 0) {
    _makeChart('chartOdoVehicle', {
      type: 'bar',
      data: {
        labels: vehicleOdoList.map(v => v.name),
        datasets: [{ label: 'Jarak (km)', data: vehicleOdoList.map(v => v.km),
          backgroundColor: '#946420CC', borderColor: '#946420', borderWidth: 1, borderRadius: 3 }]
      },
      options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: gridColor }, ticks: { color: textColor }, border: { color: gridColor } },
          y: { grid: { display: false }, ticks: { color: textColor }, border: { color: gridColor } }
        }
      }
    });
  }
}

/* ============================================================
   V1.5.3 — Archive & Safe Deletion Framework
   ============================================================ */

function countDriverReferences(driver) {
  const name = (driver.name || '').toLowerCase();
  return assignments.filter(a => (a.driver || '').toLowerCase() === name).length
       + requests.filter(r => (r.driver || '').toLowerCase() === name).length;
}

function countVehicleReferences(vehicle) {
  const name = (vehicle.name || '').toLowerCase();
  return assignments.filter(a => (a.vehicle || '').toLowerCase() === name).length
       + requests.filter(r => (r.vehicle || '').toLowerCase() === name).length;
}

function countUserReferences(user) {
  return requests.filter(r =>
    r.requesterId === user.id ||
    (r.requesterName && r.requesterName === (user.displayName || user.username))
  ).length;
}

function initDeleteConfirmModal() {
  const modal = document.createElement('div');
  modal.id = 'modalDeleteConfirm';
  modal.className = 'modal-overlay';
  modal.style.display = 'none';
  modal.innerHTML = `
    <div class="modal-box modal-box--narrow">
      <div class="modal-header">
        <h2 class="modal-title" id="deleteConfirmTitle">Hapus Permanen</h2>
        <button class="modal-close" id="btnCloseDeleteConfirm" type="button">&times;</button>
      </div>
      <div class="modal-body">
        <p class="v2-delete-confirm-desc" id="deleteConfirmDesc"></p>
        <div class="v2-delete-confirm-refs" id="deleteConfirmRefs"></div>
        <div class="form-group" id="deleteConfirmInputGroup">
          <label for="deleteConfirmInput">Ketik <strong>DELETE</strong> untuk konfirmasi:</label>
          <input type="text" id="deleteConfirmInput" placeholder="DELETE" autocomplete="off" />
        </div>
        <div class="form-actions">
          <button type="button" class="btn-secondary" id="btnCancelDeleteConfirm">Batal</button>
          <button type="button" class="btn-danger" id="btnConfirmDelete" disabled>Hapus Permanen</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  document.getElementById('btnCloseDeleteConfirm')?.addEventListener('click', closeDeleteConfirmModal);
  document.getElementById('btnCancelDeleteConfirm')?.addEventListener('click', closeDeleteConfirmModal);
  modal.addEventListener('click', e => { if (e.target === modal) closeDeleteConfirmModal(); });
  document.getElementById('deleteConfirmInput')?.addEventListener('input', e => {
    const btn = document.getElementById('btnConfirmDelete');
    if (btn) btn.disabled = e.target.value.trim() !== 'DELETE';
  });
  document.getElementById('btnConfirmDelete')?.addEventListener('click', handlePermanentDelete);
}

function openDeleteConfirmModal({ type, id, name, refCount }) {
  pendingDeleteEntity = { type, id, name };
  const title  = document.getElementById('deleteConfirmTitle');
  const desc   = document.getElementById('deleteConfirmDesc');
  const refs   = document.getElementById('deleteConfirmRefs');
  const input  = document.getElementById('deleteConfirmInput');
  const btn    = document.getElementById('btnConfirmDelete');
  const group  = document.getElementById('deleteConfirmInputGroup');
  if (title) title.textContent = `Hapus Permanen — ${name}`;
  if (desc)  desc.textContent  = 'Tindakan ini tidak dapat dibatalkan. Data akan dihapus secara permanen dari sistem.';
  if (refs)  refs.innerHTML    = refCount > 0
    ? `<div class="v2-delete-refs-warning">Ditemukan ${refCount} referensi di riwayat operasional. Hapus tidak tersedia selama ada referensi aktif.</div>`
    : `<div class="v2-delete-refs-ok">Tidak ada referensi aktif ditemukan. Data ini aman untuk dihapus.</div>`;
  if (input) { input.value = ''; input.disabled = refCount > 0; }
  if (group) group.style.display = refCount > 0 ? 'none' : '';
  if (btn)   btn.disabled = true;
  const modal = document.getElementById('modalDeleteConfirm');
  if (modal) modal.style.display = 'flex';
}

function closeDeleteConfirmModal() {
  const modal = document.getElementById('modalDeleteConfirm');
  if (modal) modal.style.display = 'none';
  pendingDeleteEntity = null;
}

async function handlePermanentDelete() {
  if (!pendingDeleteEntity) return;
  const { type, id, name } = pendingDeleteEntity;
  const btn = document.getElementById('btnConfirmDelete');
  if (btn) btn.disabled = true;
  try {
    const cu = getCurrentUser();
    if (type === 'user') {
      await deleteUser(id);
      logAction({ userId: cu?.id, username: cu?.username, action: 'user_deleted', targetId: id, metadata: { name } });
    } else if (type === 'driver') {
      await deleteDriver(id);
      logAction({ userId: cu?.id, username: cu?.username, action: 'driver_deleted', targetId: id, metadata: { name } });
    } else if (type === 'vehicle') {
      await deleteVehicle(id);
      logAction({ userId: cu?.id, username: cu?.username, action: 'vehicle_deleted', targetId: id, metadata: { name } });
    }
    showToast(`${name} berhasil dihapus permanen.`);
    closeDeleteConfirmModal();
  } catch (err) {
    showToast(err.message || 'Gagal menghapus.', 'error');
    if (btn) btn.disabled = false;
  }
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

  const topbarBtn    = document.getElementById('v2TopbarThemeBtn');
  const railBtn      = document.getElementById('v2RailThemeBtn');
  const profileToggle = document.getElementById('profileDarkModeToggle');
  const darkStatus    = document.getElementById('statusDarkModeToggle');

  const isDark = theme === 'dark';
  if (topbarBtn) { topbarBtn.setAttribute('aria-label', isDark ? 'Ganti ke tema terang' : 'Ganti ke tema gelap'); topbarBtn.innerHTML = isDark ? ICON_SUN : ICON_MOON; }
  if (railBtn)   { railBtn.setAttribute('aria-label',   isDark ? 'Ganti ke tema terang' : 'Ganti ke tema gelap'); railBtn.innerHTML   = isDark ? ICON_SUN : ICON_MOON; }
  if (profileToggle) profileToggle.checked = isDark;
  if (darkStatus)  { darkStatus.textContent = isDark ? 'Aktif' : 'Nonaktif'; darkStatus.classList.toggle('is-active', isDark); }
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
/**
 * "Setujui Sesuai Rekomendasi" (beta.3.1): immediately approve using the stored
 * recommendation (or a legacy requester choice) — outcome ACCEPTED, no modal.
 */
function handleRequestApproveDirect(requestId) {
  if (!isAdmin()) return;
  commitApproval(requestId); // no decision → effective = recommendation/baseline → ACCEPTED
}

/**
 * "Edit & Setujui" (beta.3.1): open the Approve/Override modal so the admin can
 * adjust the driver/vehicle (reason required) before approving.
 */
function handleRequestApproveEdit(requestId) {
  if (!isAdmin()) return;
  openApproveRequestModal(requestId);
}

/**
 * Commit an approval: convert the request to assignment(s) using the admin's
 * decision (driver/vehicle override) or the background recommendation, and
 * record the outcome in the override log (Part 4). The dispatch decision is the
 * single source of the effective driver/vehicle.
 * @param {string} requestId
 * @param {{driver?:string, vehicle?:string, reason?:string}} [decision]
 */
function commitApproval(requestId, decision = {}) {
  if (!isAdmin()) return;

  checkAssignmentSafety(assignments.length);

  const request = requests.find(item => item.id === requestId);
  const admin   = getCurrentUser();
  if (!request || request.status !== 'pending') return;

  // Effective driver/vehicle from the admin's decision (override) or the
  // baseline (recommendation → legacy requester choice). Single source of truth.
  const eff = resolveEffectiveDispatch(request, decision);
  const effDriver  = eff.selectedDriver;
  const effVehicle = eff.selectedVehicle;

  if (!effDriver) {
    showToast('Tidak ada driver untuk request ini — gunakan "Edit & Setujui".');
    return;
  }

  const dates = expandDateRange(request.startDate, request.endDate);
  if (dates.length === 0) {
    showToast('Request tidak memiliki tanggal yang valid.');
    return;
  }

  const conflictingDates = dates.filter(date =>
    checkConflict(effDriver, request.startTime, request.endTime, date)
  );
  if (conflictingDates.length > 0) {
    const dateList = conflictingDates.map(d => formatDateShort(d)).join(', ');
    alert(
      `Konflik jadwal terdeteksi pada:\n${dateList}\n\n` +
      `Driver ${effDriver} sudah memiliki jadwal di waktu tersebut.\n` +
      `Pilih driver lain lewat Override sebelum approve.`
    );
    return;
  }

  const dispatchDecision = { driver: effDriver, vehicle: effVehicle };
  const newAssignments = dates.map(date => requestToAssignment(request, admin, date, dispatchDecision));
  assignments = [...assignments, ...newAssignments];

  // Record the acceptance/override outcome in the EXISTING override log (Part 4/7).
  try {
    saveOverrideLog(buildApprovalOverrideRecord(request, decision, admin ? admin.name : ''));
  } catch (err) {
    console.warn('[Approval] override log failed', err);
  }

  requests = requests.map(item => item.id === requestId
    ? { ...item, status: 'approved', driver: effDriver, vehicle: effVehicle, approvedBy: admin ? admin.name : '', approvedAt: new Date().toISOString() }
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
      requesterId:     request.requesterId,
      driver:          effDriver,
      assignmentCount: newAssignments.length,
      assignmentIds:   newAssignments.map(a => a.id),
      beforeCount:     assignments.length - newAssignments.length,
      afterCount:      assignments.length,
      operationType:   'bulk_create',
    },
  });

  // Log assignment_created for each assignment produced by this approval.
  // The notification center (drivers) reads these entries to build its feed —
  // without them drivers see "Belum ada notifikasi untuk Anda."
  const approvalDriverNameLower = (effDriver || '').trim().toLowerCase();
  const approvalDriverUser = approvalDriverNameLower
    ? getUserList().find(u => u.role === 'driver' &&
        ((u.displayName || '').trim().toLowerCase() === approvalDriverNameLower ||
         (u.username   || '').trim().toLowerCase() === approvalDriverNameLower))
    : null;
  for (const asgn of newAssignments) {
    logAction({
      userId:      currentUser?.id,
      username:    currentUser?.username,
      action:      'assignment_created',
      targetId:    asgn.id,
      metadata: {
        driver:         asgn.driver,
        driverUsername: approvalDriverUser?.username || null,
        vehicle:        asgn.vehicle,
        destination:    asgn.destination,
        date:           asgn.date,
        startTime:      asgn.startTime,
        endTime:        asgn.endTime,
        requestId:      asgn.requestId,
        requesterId:    request.requesterId,
      },
    });
  }

  renderViews();
  updatePermissionUI();
  if (currentWorkspace === 'pending') renderPendingWorkspace();
  if (dates.length > 1) showToast(`✅ ${dates.length} assignment berhasil dibuat`);

  sendRequestApprovedNotification(request, getUserByUsername);
  if (newAssignments.length > 0) sendNewAssignmentNotificationToDriver(newAssignments[0], getUsers);
}

/* ── Approve / Override modal (beta.3) ──────────────────────────────────
   The admin's decision point: shows the background recommendation and lets the
   admin approve as-is or OVERRIDE the driver/vehicle (reason required). On
   confirm, commitApproval() records the outcome in the override log. */
let approveModalRequestId = null;

function _escAttr(v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

/**
 * Live-recompute the dispatch recommendation PACKAGE for a request at approval
 * time — read-only, reusing the engines (no scoring duplicated). Powers the
 * transparent score breakdown + explanation in the intelligence panel. Returns
 * an empty object on any failure so the modal can never be blocked by it.
 */
function buildLiveApprovalPackage(request) {
  try {
    return buildRecommendationPackage({
      request: requestToEngineRequest(request),
      drivers: getActiveDrivers(),
      vehicles: getActiveVehiclesFromStore(),
      assignments,
      overrideLogs: getOverrideLogs(),
    }, {
      // Re-apply the request's Dispatch Policy (v1.17.2) so the admin sees the
      // recommendation under the same rules the requester chose (medical /
      // "Tanpa Driver"). The admin's own selection is never blocked (Feature 4).
      policy: { medicalMode: !!request.useAmbulance, driverOptional: !!request.noDriver },
    });
  } catch (err) {
    console.warn('[Approval] live recommendation package failed', err);
    return {};
  }
}

function openApproveRequestModal(requestId) {
  const request = requests.find(item => item.id === requestId);
  if (!request || request.status !== 'pending') return;
  approveModalRequestId = requestId;

  const recDriver  = request.recommendedDriver  || '';
  const recVehicle = request.recommendedVehicle || '';

  // Premium Dispatch Intelligence panel (Auto Assignment Assistant). Headline is
  // the STORED recommendation (no recalculation); the breakdown/explanation read
  // engine sub-scores from a live read-only recompute for the same pairing.
  mountApprovalIntelligencePanel('approveIntelligence', {
    pkg: buildLiveApprovalPackage(request),
    stored: request.recommendation || null,
    request,
    recommended: { driver: recDriver, vehicle: recVehicle },
    selection: { driver: '', vehicle: '' },
  });

  // Populate selects from the active drivers/vehicles. NEW FLOW: leave them
  // unselected — the admin applies the recommendation with one click
  // ("Terapkan Rekomendasi") or picks manually. The human always decides.
  const driverSel  = document.getElementById('approveDriverSelect');
  const vehicleSel = document.getElementById('approveVehicleSelect');
  if (driverSel) {
    driverSel.innerHTML = '<option value="">-- Pilih Driver --</option>'
      + getActiveDrivers().map(d => `<option value="${_escAttr(d.name)}">${_escAttr(d.name)}</option>`).join('');
    driverSel.value = '';
  }
  if (vehicleSel) {
    vehicleSel.innerHTML = '<option value="">-- Pilih Kendaraan --</option>'
      + getActiveVehiclesFromStore().map(v => `<option value="${_escAttr(v.name)}">${_escAttr(v.name)}</option>`).join('');
    vehicleSel.value = '';
  }

  // Wire the panel's "Terapkan Rekomendasi" button (re-rendered each open).
  const applyBtn = document.getElementById('aipApplyBtn');
  if (applyBtn) {
    applyBtn.disabled = !recDriver && !recVehicle;
    applyBtn.addEventListener('click', applyRecommendationToApprove);
  }

  const reason = document.getElementById('approveReason');
  if (reason) reason.value = '';
  _syncApproveReasonVisibility();
  _syncApproveComparison();

  const modal = document.getElementById('modalApproveRequest');
  if (modal) modal.style.display = 'flex';
}

/**
 * Feature 3 — Apply Recommendation: one click pre-fills the driver + vehicle
 * selects with the stored recommendation. The admin may still edit them.
 */
function applyRecommendationToApprove() {
  const request = requests.find(item => item.id === approveModalRequestId);
  if (!request) return;
  const driverSel  = document.getElementById('approveDriverSelect');
  const vehicleSel = document.getElementById('approveVehicleSelect');
  if (driverSel)  driverSel.value  = request.recommendedDriver  || '';
  if (vehicleSel) vehicleSel.value = request.recommendedVehicle || '';

  const applyBtn = document.getElementById('aipApplyBtn');
  if (applyBtn) { applyBtn.setAttribute('data-applied', 'true'); applyBtn.textContent = '✓ Rekomendasi Diterapkan'; }

  _syncApproveReasonVisibility();
  _syncApproveComparison();
  showToast('Rekomendasi diterapkan — periksa lalu setujui.');
}

/** Refresh the panel's AI↔Admin comparison from the current selects (Feature 4). */
function _syncApproveComparison() {
  const driverSel  = document.getElementById('approveDriverSelect');
  const vehicleSel = document.getElementById('approveVehicleSelect');
  updateApprovalComparison('approveIntelligence', {
    driver:  driverSel  ? driverSel.value  : '',
    vehicle: vehicleSel ? vehicleSel.value : '',
  });
}

function closeApproveRequestModal() {
  approveModalRequestId = null;
  closeDecisionReplayDrawer();
  const modal = document.getElementById('modalApproveRequest');
  if (modal) modal.style.display = 'none';
}

/**
 * Decision Replay & Explainable AI (v1.17.5). Open the side drawer that replays
 * the CURRENT request's recommendation step-by-step. Read-only: it reuses the
 * live recommendation package + the stored recommendation + the admin's current
 * selection; it recomputes nothing. Export reuses the registered blob pipeline.
 */
function openDecisionReplayForApproval() {
  const request = requests.find(item => item.id === approveModalRequestId);
  if (!request) return;
  const driverSel  = document.getElementById('approveDriverSelect');
  const vehicleSel = document.getElementById('approveVehicleSelect');

  openDecisionReplay({
    pkg: buildLiveApprovalPackage(request),
    stored: request.recommendation || null,
    request,
    recommended: { driver: request.recommendedDriver || '', vehicle: request.recommendedVehicle || '' },
    selection: {
      driver:  driverSel  ? driverSel.value  : '',
      vehicle: vehicleSel ? vehicleSel.value : '',
    },
  }, {
    onExport: (format, model) => { _downloadDecisionReplay(format, model); },
  });
}

/** Download the Decision Replay as PDF/Excel through the registered exporter. */
async function _downloadDecisionReplay(format, model) {
  const isExcel = format === 'excel';
  const reportId = isExcel ? 'decision-replay-excel' : 'decision-replay-pdf';
  const def = getExportReport(reportId);
  if (!def) return;

  // Publish the model for the window-hook exporter (mirrors the analytics hooks).
  window._lastDecisionReplayModel = model;
  const u = getCurrentUser();
  window._decisionReplayMeta = {
    generatedBy: (u && (u.displayName || u.name || u.username)) || '—',
    appVersion: APP_VERSION,
  };
  const exportCtx = {
    reportId: def.id, reportTitle: def.title,
    periodLabel: model && model.requestId ? `Request ${model.requestId}` : '—', dateRangeKey: 'single', filters: {},
    generatedBy: window._decisionReplayMeta.generatedBy,
    userId: u?.id, username: u?.username, appVersion: APP_VERSION,
  };
  const startedAt = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const elapsed = () => Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt);
  try {
    const result = await runExportReport(reportId);
    if (result && result.blob) {
      const url = URL.createObjectURL(result.blob);
      const a = document.createElement('a');
      a.href = url; a.download = result.filename || `${reportId}.${isExcel ? 'xlsx' : 'pdf'}`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    }
    logExportSuccess(exportCtx, { fileSize: result?.blob?.size, durationMs: elapsed() });
    showToast(isExcel ? 'Excel berhasil dibuat.' : 'PDF berhasil dibuat.');
  } catch (err) {
    console.error('[DecisionReplay] export failed:', err);
    logExportFailure(exportCtx, { error: err, durationMs: elapsed() });
    showToast(isExcel ? 'Gagal membuat Excel.' : 'Gagal membuat PDF.');
  }
}

/** Is the current selection an override (differs from the recommendation)? */
function _approveIsOverride() {
  const request = requests.find(item => item.id === approveModalRequestId);
  if (!request) return false;
  const driverSel  = document.getElementById('approveDriverSelect');
  const vehicleSel = document.getElementById('approveVehicleSelect');
  return isApprovalOverride(request, {
    driver:  driverSel  ? driverSel.value  : '',
    vehicle: vehicleSel ? vehicleSel.value : '',
  });
}

/** Show + require the reason field only when overriding. */
function _syncApproveReasonVisibility() {
  const group = document.getElementById('approveReasonGroup');
  if (group) group.hidden = !_approveIsOverride();
}

function confirmApproveRequest(event) {
  if (event) event.preventDefault();
  const requestId = approveModalRequestId;
  if (!requestId) return;

  const driverSel  = document.getElementById('approveDriverSelect');
  const vehicleSel = document.getElementById('approveVehicleSelect');
  const reasonEl   = document.getElementById('approveReason');
  const selDriver  = driverSel  ? driverSel.value  : '';
  const selVehicle = vehicleSel ? vehicleSel.value : '';
  const reason     = reasonEl ? reasonEl.value.trim() : '';

  if (!selDriver) { showToast('Pilih driver dulu.'); return; }
  if (_approveIsOverride() && !reason) {
    showToast('Alasan override wajib diisi.');
    return;
  }

  closeApproveRequestModal();
  commitApproval(requestId, { driver: selDriver, vehicle: selVehicle, reason });
}

function _onApproveSelectChange() {
  _syncApproveReasonVisibility();
  _syncApproveComparison();
}

function initApproveRequestModal() {
  document.getElementById('btnCloseApprove')?.addEventListener('click', closeApproveRequestModal);
  document.getElementById('btnCancelApprove')?.addEventListener('click', closeApproveRequestModal);
  document.getElementById('approveForm')?.addEventListener('submit', confirmApproveRequest);
  document.getElementById('approveDriverSelect')?.addEventListener('change', _onApproveSelectChange);
  document.getElementById('approveVehicleSelect')?.addEventListener('change', _onApproveSelectChange);
  document.getElementById('btnOpenDecisionReplay')?.addEventListener('click', openDecisionReplayForApproval);
  const overlay = document.getElementById('modalApproveRequest');
  overlay?.addEventListener('click', (e) => { if (e.target === overlay) closeApproveRequestModal(); });
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
  const rejectedRequest = requests.find(item => item.id === requestId);
  logAction({
    userId:      currentUser?.id,
    username:    currentUser?.username,
    displayName: currentUser?.name,
    action:      'request_rejected',
    targetId:    requestId,
    metadata: {
      requesterId: rejectedRequest?.requesterId,
    },
  });
  updatePermissionUI();
  if (currentWorkspace === 'pending') renderPendingWorkspace();

  if (rejectedRequest) sendRequestRejectedNotification(rejectedRequest, getUserByUsername);
}

/**
 * Main initialization saat DOM ready
 */
document.addEventListener('DOMContentLoaded', async () => {
  console.log('Initializing PBSI Scheduler app...');
  initPWA();

  // ── Feature flags — read once before any UI init ──
  // If visualShellV2 is true: inject the V2 rail and activate v2-shell-active.
  // If false (default): nothing changes — app is identical to v1.2.5.
  appFlags = await loadFeatureFlags();
  if (appFlags.visualShellV2 === true) {
    initV2Rail();
    initV2Panel();
    initV2ResponsiveNavReuse();
    // VSM-3: must run before sidebar-toggle and initDateControls() handler binding
    initV2Topbar();
    initV2KpiStrip();             // VSM-4: inject KPI strip placeholder above timeline
    initV2TimelineContainer();    // VSM-5: wrap timeline in elevated surface card
    initV2DriverAvatars();        // VSM-5C Part 7: observer stamps data-initials onto driver rows
    initV2PendingWorkspace();     // VSM-9: inline pending workspace
    initV2AdministrationWorkspace(); // VSM-9: admin-only administration workspace
    initV2PettyCashWorkspace();   // v1.14.0: embedded Petty Cash module host
    initV2PlaceholderWorkspace(); // v1.14.0: shared "coming soon" placeholder
    initV2AnalyticsWorkspaces();  // v1.15.0: Analytics Petty Cash + Executive hosts
    initV2AnalyticsMobileNav();   // v1.15.2: mobile parity sub-nav for the 3 Analytics screens
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
    el.textContent = `Versi ${APP_VERSION} — ${RELEASE_NAME}`;
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

  // V2 parity: close drawer when interacting with V2 nav nodes on mobile.
  sidebar?.addEventListener('click', (e) => {
    if (window.innerWidth >= 768) return;
    if (e.target.closest('.v2-panel-nav-item, .v2-rail-item, #v2FooterLogoutDirect')) {
      closeSidebar();
    }
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

  // ── Profile: Appearance — dark mode toggle (mobile + desktop) ──
  // Works independently of the topbar button. applyTheme() keeps both in sync.
  document.getElementById('profileDarkModeToggle')?.addEventListener('change', (e) => {
    applyTheme(e.target.checked ? 'dark' : 'light', true);
  });

  // ── FAB (mobile primary action) — v1.15.2: runs the shared module-aware
  // CTA so the click always matches the visible label (Tambah Jadwal /
  // Ajukan Jadwal / Tambah Pengeluaran). No-op on read-only workspaces. ──
  document.getElementById('fabAdd')?.addEventListener('click', runPrimaryCta);

  // ── Bottom nav: Dashboard (scroll timeline to focus) ──
  document.getElementById('bottomNavDashboard')?.addEventListener('click', () => {
    setBottomNavActive('bottomNavDashboard');
    // Always restore the Driver Operations workspace. Previously this only
    // re-rendered the timeline, which stayed display:none while the user was
    // in Administration — stranding them there (iPhone PWA nav trap). Resetting
    // the rail + workspace guarantees the timeline becomes visible again.
    if (activeRailModule !== 'driverops') setRailModule('driverops');
    setV2PanelNavActive('v2NavDashboard');
    setWorkspace('dashboard');
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
  // ── Auth-ready gate (v1.11.1.2) ─────────────────────────────────
  // No RTDB access until authentication resolves. initAuthUI() registers
  // onAuthStateChanged + awaits authReady() (Firebase mode), or resolves
  // immediately (AUTH_DIRECT_PIN break-glass). startAuthenticatedSession()
  // runs exactly once — now if already signed in, else on first login —
  // so all RTDB reads/listeners are gated behind a signed-in user and
  // there are no permission_denied storms under auth != null rules.
  // ── Auth-gated admin data (v1.11.3.3) ──────────────────────────
  // RE-ENTRANT: runs on EVERY auth-available signal so /users and /logs
  // load+subscribe only while authenticated, and recover after an iPhone
  // PWA cold launch / delayed session restore / fresh PIN login. The store
  // ensure* helpers are idempotent (already-subscribed = no-op).
  async function loadAuthedAdminData() {
    await ensureUsersLoadedAndSubscribed();
    await ensureLogsLoadedAndSubscribed();
    await ensureExportHistoryLoadedAndSubscribed(); // v1.12.1B export metadata cache
    // Refresh an already-open admin view (e.g. user logged in while on it).
    if (currentWorkspace === 'administration') renderV2AdminWorkspace();
  }

  let _sessionInfraStarted = false;
  async function startAuthenticatedSession() {
    // Always (re)drive the auth-gated data load first.
    await loadAuthedAdminData();

    // One-shot infrastructure: stores, real-time sync, reminder timers, push.
    if (_sessionInfraStarted) return;
    _sessionInfraStarted = true;

    await initDriversStore();              // v1.5.0: seed/sync Firebase driver registry
    await initVehiclesStore();             // v1.5.2: seed/sync Firebase vehicle registry
    await initSettingsStore();             // v1.7.0: centralized settings foundation

    const _telegramSettings = await fetchFirebaseData('settings/telegram');
    if (_telegramSettings?.botToken) setTelegramBotToken(_telegramSettings.botToken);

    initFirebaseSync();                    // real-time assignments + requests listeners

    // rc.1: hydrate Dispatch Intelligence history from RTDB (read-through), then
    // enable write-through. Failure-safe: a Firebase hiccup never blocks the
    // session — the subsystem keeps running on in-memory state.
    const _diAdapter = { isConfigured: isFirebaseConfigured, fetchData: fetchFirebaseData, storeData: storeFirebaseData };
    try {
      await hydrateDispatchIntelligence(_diAdapter);
      initDispatchIntelligencePersistence(_diAdapter);
    } catch (err) {
      console.warn('[DI Persistence] init failed — continuing on memory.', err);
    }

    // Re-render with authoritative data + refresh permissioned UI
    updateAllModules();
    renderViews();
    updatePermissionUI(true);
    updateAdminButtons();
    setNotificationData({
      pendingRequests: getMyPendingRequestCount(),
      recentLogs: auditLogs,
    });

    // H-1 / H-2 reminder timers (read assignments/requests/users)
    const runH1Check = () => checkAndSendH1Reminders(assignments, requests, getUserByUsername, getUsers);
    runH1Check();
    setInterval(runH1Check, getSetting('notifications.h1ReminderCheckIntervalMs'));
    const runH2Check = () => checkAndSendHoursReminders(assignments, requests, getUserByUsername, getUsers);
    runH2Check();
    setInterval(runH2Check, getSetting('notifications.h2ReminderCheckIntervalMs'));

    // Push (v1.11.3): wire deep-link nav, refresh/heal an existing
    // subscription, and offer the soft-ask once. No-op where unsupported.
    initPush();
  }

  // Auth-presence orchestration (Firebase custom-auth mode). onAuthAvailable
  // fires on warm launch, delayed restore, AND fresh login — so the admin
  // datasets recover whenever a live session appears, not only at boot.
  onAuthAvailable(() => { startAuthenticatedSession(); });
  onAuthLost(() => { resetUsersSync(); resetLogsSync(); resetExportHistorySync(); });

  await initAuthUI(() => {
    updatePermissionUI(true); // auth change → reset nav to Dashboard
    setSidebarActive(null);
    if (getCurrentUser()) startAuthenticatedSession(); // login transition (covers direct-PIN mode)
  });

  // Returning user (persisted session restored) → start immediately.
  // (onAuthAvailable also covers this in Firebase mode; startAuthenticatedSession
  // is idempotent so a double-trigger is harmless.)
  if (getCurrentUser()) {
    await startAuthenticatedSession();
  }

  await initAdminUI();                   // Setup admin user management (UI wiring only)
  initNotificationUI();                  // Setup notification badge & modal
  initDriverSelect();                    // Isi dropdown driver
  initDateControls();                    // Setup date navigation buttons
  initFormHandlers();                    // Setup form events
  initModalHandlers();                   // Setup modal events
  initRequestHandlers();                 // Setup request workflow events
  // beta.3 Request Workflow Separation: Dispatch Intelligence is no longer shown
  // to requesters. Instead it (a) runs in the BACKGROUND at request submit and
  // is surfaced to the ADMIN at approval, and (b) provides compact hints in the
  // admin direct-assignment form.
  initAssignmentDispatchHints();         // Compact driver/vehicle hints (Tambah Jadwal)
  initApproveRequestModal();             // Admin approve/override modal events
  _initAllPbsiSelects();                 // Wrap all native selects after options are populated
  _initAllPbsiDatepickers();             // Wrap filterDate + wire nav button sync
  initCommentHandlers();                 // Setup comment thread events
  renderViews();                         // Render timeline + list view pertama kali
  updatePermissionUI(true);              // startup → reset nav to Dashboard
  updateAdminButtons();                  // Show admin controls properly
  setNotificationData({
    pendingRequests: getMyPendingRequestCount(),
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

  // /logs is loaded + subscribed behind the authenticated-session gate
  // (loadAuthedAdminData → ensureLogsLoadedAndSubscribed). Here we only
  // register the change listener; it fires once the gated subscription
  // delivers its first authenticated snapshot.
  subscribeLogsChangeListener((updatedLogs) => {
    auditLogs = updatedLogs;
    setNotificationData({
      pendingRequests: getMyPendingRequestCount(),
      recentLogs: auditLogs,
    });
    if (currentWorkspace === 'administration' && activeAdminSection === 'audit') {
      renderV2AdminWorkspace();
    }
  });

  // Setup callbacks untuk cross-module communication

  // ── Callback: Firebase data berubah (dari device lain) ──
  registerDataChangeListener((updatedAssignments) => {
    console.log('Firebase data updated from another device');
    assignments = updatedAssignments.map(normalizeAssignmentStatus);
    updateAllModules();   // also calls setDashboardAssignments + renderDriverDashboard
    renderViews();
    if (activeAdminSection === 'dispatchanalytics') renderDispatchAnalyticsSection();
    if (activeAdminSection === 'recommendationaccuracy') renderRecommendationAccuracySection();
    if (activeAdminSection === 'wellness') renderDriverWellnessSection();
    if (activeAdminSection === 'prediction') renderDriverPredictionSection();
    if (activeAdminSection === 'executive') renderExecutiveDashboardSection();
    checkAndSendH1Reminders(assignments, requests, getUserByUsername, getUsers);
    checkAndSendHoursReminders(assignments, requests, getUserByUsername, getUsers);
  });

  // ── Callback: Firebase requests berubah (dari device lain) ──
  registerRequestsChangeListener((updatedRequests) => {
    console.log('Firebase requests updated from another device');
    requests = updatedRequests.map(normalizeRequest);
    updateAllModules();
    updatePermissionUI();
    if (activeAdminSection === 'dispatchanalytics') renderDispatchAnalyticsSection();
    if (activeAdminSection === 'recommendationaccuracy') renderRecommendationAccuracySection();
    if (activeAdminSection === 'wellness') renderDriverWellnessSection();
    if (activeAdminSection === 'prediction') renderDriverPredictionSection();
    if (activeAdminSection === 'executive') renderExecutiveDashboardSection();
    // Refresh comment modal if open for one of the updated requests
    refreshCommentThreadIfOpen(requests);
  });

  // ── Callback: Form save (add/update assignment) ──
  registerSaveCallback((updatedAssignments, isNewAssignment, assignmentDate, newAssignment) => {
    // Guard: assignments.js memanggil onSaveCallback dari deleteAssignment() tanpa assignmentDate.
    // Operasi delete sudah ditangani sepenuhnya oleh registerDeleteCallback — abaikan path ini.
    if (!isNewAssignment && assignmentDate === undefined) return;

    const prevAssignments = assignments; // used only for multi-day new-assignment detection (prevIds)
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
      // Edit: assignments.js passes the edited object directly as newAssignment.
      // The shared-array mutation means a diff on prevAssignments is unreliable.
      if (newAssignment) saveOneAssignment(newAssignment);
      // Jika tidak ada yang berubah (misal dipanggil dari deleteAssignment internal),
      // removeOneAssignment sudah ditangani di registerDeleteCallback.
    }

    const currentUser = getCurrentUser();
    // Resolve representative assignment for ownership metadata
    let repAssignment = newAssignment;
    if (!repAssignment && isNewAssignment) {
      const prevIds = new Set(prevAssignments.map(p => p.id));
      repAssignment = updatedAssignments.find(a => !prevIds.has(a.id)) || null;
    }
    const repRequesterId = repAssignment?.requestId
      ? (requests.find(r => r.id === repAssignment.requestId)?.requesterId || null)
      : null;
    const repDriverName = (repAssignment?.driver || '').trim().toLowerCase();
    const repDriverUser = repDriverName
      ? getUserList().find(u => u.role === 'driver' &&
          ((u.displayName || '').trim().toLowerCase() === repDriverName ||
           (u.username   || '').trim().toLowerCase() === repDriverName))
      : null;
    logAction({
      userId:      currentUser?.id,
      username:    currentUser?.username,
      displayName: currentUser?.name,
      action:      isNewAssignment ? 'assignment_created' : 'assignment_edited',
      targetId:    repAssignment?.id || '',
      metadata: {
        driver:         repAssignment?.driver,
        driverUsername: repDriverUser?.username || null,
        vehicle:        repAssignment?.vehicle,
        destination:    repAssignment?.destination,
        date:           assignmentDate || repAssignment?.date,
        startTime:      repAssignment?.startTime,
        endTime:        repAssignment?.endTime,
        requestId:      repAssignment?.requestId,
        requesterId:    repRequesterId,
        beforeCount,
        afterCount:     assignments.length,
        operationType:  isNewAssignment ? 'create' : 'edit',
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
  registerRequestApproveCallback(handleRequestApproveDirect);   // Setujui Sesuai Rekomendasi
  registerRequestApproveEditCallback(handleRequestApproveEdit); // Edit & Setujui
  registerRequestRejectCallback(handleRequestReject);

  // ── Callback: Comment thread — from request card (admin/bidang) ──
  registerRequestCommentCallback((requestId) => openCommentModal(requestId));

  // ── Callback: Comment thread — from assignment detail (driver/admin) ──
  registerModalCommentCallback((requestId) => openCommentModal(requestId));

  // ── Callback: Save a new comment to a request ──
  registerCommentSaveCallback((updatedRequest, newComment) => {
    requests = requests.map(r => r.id === updatedRequest.id ? updatedRequest : r);
    setCommentRequests(requests);
    saveRequests(requests);
    renderRequestsList();

    // ── Comment Event Foundation (v1.11.1.3) ──
    // comment.added has no authoritative data-node trigger (comments are an
    // embedded array), so emit it explicitly: a /logs entry for the in-app
    // center + a canonical comment.added event for the foundation. Both are
    // additive and fire-and-forget — no push notification in this release.
    if (newComment) {
      const currentUser = getCurrentUser();
      const driverNameLower = (updatedRequest.driver || '').trim().toLowerCase();
      const driverUser = driverNameLower
        ? getUserList().find(u => u.role === 'driver' &&
            ((u.displayName || '').trim().toLowerCase() === driverNameLower ||
             (u.username   || '').trim().toLowerCase() === driverNameLower))
        : null;
      const meta = {
        requestId:      updatedRequest.id,
        commentId:      newComment.id,
        authorUsername: currentUser?.username || null,
        requesterId:    updatedRequest.requesterId || null,
        driver:         updatedRequest.driver || null,
        driverUsername: driverUser?.username || null,
        purpose:        updatedRequest.purpose || null,
      };
      logAction({
        userId:      currentUser?.id,
        username:    currentUser?.username,
        displayName: currentUser?.name,
        action:      'comment_added',
        targetId:    updatedRequest.id,
        metadata:    meta,
      });
      publishEvent('comment.added', 'comment', newComment.id, meta);
    }
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

    const completedAssignment = assignments[idx];
    const completedRequesterId = completedAssignment.requestId
      ? (requests.find(r => r.id === completedAssignment.requestId)?.requesterId || null)
      : null;
    const completedDriverName = (completedAssignment.driver || '').trim().toLowerCase();
    const completedDriverUser = completedDriverName
      ? getUserList().find(u => u.role === 'driver' &&
          ((u.displayName || '').trim().toLowerCase() === completedDriverName ||
           (u.username   || '').trim().toLowerCase() === completedDriverName))
      : null;
    logAction({
      userId:      currentUser?.id,
      username:    currentUser?.username,
      displayName: currentUser?.name,
      action:      'assignment_completed',
      targetId:    assignmentId,
      metadata: {
        driver:            completedAssignment.driver,
        driverUsername:    completedDriverUser?.username || null,
        vehicle:           completedAssignment.vehicle,
        destination:       completedAssignment.destination,
        date:              completedAssignment.date || completedAssignment.startDate,
        requestId:         completedAssignment.requestId,
        requesterId:       completedRequesterId,
        completedAt:       completedAssignment.completedAt,
        completedBy:       completedAssignment.completedBy,
        endOdometer:       completedAssignment.endOdometer,
        distanceTravelled: completedAssignment.distanceTravelled,
      },
    });

    showToast('✅ Penugasan selesai');
  });

  // ── Callback: Batalkan button di detail modal (v1.10.7) ──
  // reason = string (already validated ≥10 chars di modal). Cancelled adalah
  // terminal state: record tetap disimpan untuk audit & analytics.
  registerCancelCallback((assignmentId, reason) => {
    if (!hasPermission('cancel')) { showToast('Anda tidak punya akses untuk membatalkan'); return; }

    const idx = assignments.findIndex(a => a.id === assignmentId);
    if (idx === -1) return;

    const existing = assignments[idx];
    const existingStatus = normalizeAssignmentStatus(existing).status;

    // Re-validate state server-side: terminal states can't be cancelled.
    if (existingStatus === 'completed' || existingStatus === 'cancelled') {
      showToast('Assignment ini tidak dapat dibatalkan');
      return;
    }
    // Bidang may only cancel their own request-derived assignment before it starts.
    const currentUser = getCurrentUser();
    if (currentUser?.role === 'bidang') {
      const owner = String(existing.createdBy || '').trim().toLowerCase();
      const me = [currentUser.name, currentUser.username].filter(Boolean).map(v => String(v).trim().toLowerCase());
      if (existingStatus !== 'assigned' || !existing.requestId || !me.includes(owner)) {
        showToast('Anda tidak dapat membatalkan assignment ini');
        return;
      }
    }

    const now = new Date().toISOString();
    assignments[idx] = {
      ...existing,
      status: 'cancelled',
      cancelledAt: now,
      cancelledBy: {
        uid:  currentUser?.id || null,
        name: currentUser?.name || '',
        role: currentUser?.role || '',
      },
      cancellationReason: reason,
      updatedAt: now,
    };

    updateAllModules();
    saveAssignments(assignments);          // localStorage only
    saveOneAssignment(assignments[idx]);   // surgical Firebase write
    renderViews();

    const cancelledAssignment = assignments[idx];
    const requesterId = cancelledAssignment.requestId
      ? (requests.find(r => r.id === cancelledAssignment.requestId)?.requesterId || null)
      : null;
    const cancelledDriverName = (cancelledAssignment.driver || '').trim().toLowerCase();
    const cancelledDriverUser = cancelledDriverName
      ? getUserList().find(u => u.role === 'driver' &&
          ((u.displayName || '').trim().toLowerCase() === cancelledDriverName ||
           (u.username   || '').trim().toLowerCase() === cancelledDriverName))
      : null;

    logAction({
      userId:      currentUser?.id,
      username:    currentUser?.username,
      displayName: currentUser?.name,
      action:      'assignment_cancelled',
      targetId:    assignmentId,
      metadata: {
        driver:          cancelledAssignment.driver,
        driverUsername:  cancelledDriverUser?.username || null,
        vehicle:         cancelledAssignment.vehicle,
        destination:     cancelledAssignment.destination,
        date:            cancelledAssignment.date,
        requestId:       cancelledAssignment.requestId,
        requesterId:     requesterId,
        cancelledByRole: currentUser?.role || '',
        cancelledByName: currentUser?.name || '',
        cancelledAt:     now,
        reason,
      },
    });

    // Notify affected parties (driver always; admins or requester depending on who cancelled).
    sendAssignmentCancelledNotification(
      cancelledAssignment,
      { reason, cancelledByRole: currentUser?.role || '', cancelledByName: currentUser?.name || '' },
      getUserByUsername,
      getUsers,
      requests,
    );

    showToast('✕ Assignment dibatalkan');
  });

  // ── Callback: Override Lembur button di detail modal (v1.16.4.9) ──
  // targetStatus ∈ {'NORMAL','LEMBUR'} — the administrative final status forced
  // by an admin; reason is mandatory (validated ≥10 chars in the modal). The
  // system detection (AUTO_*) is never overwritten — only the override fields
  // are written, so computeWorkTime() keeps both the detection and the final.
  registerOvertimeOverrideCallback((assignmentId, targetStatus, reason) => {
    if (!hasPermission('override_overtime')) {
      showToast('Hanya admin yang bisa override status lembur');
      return;
    }
    if (targetStatus !== 'NORMAL' && targetStatus !== 'LEMBUR') return;
    const cleanReason = String(reason || '').trim();
    if (!cleanReason) { showToast('Alasan override wajib diisi'); return; }

    const idx = assignments.findIndex(a => a.id === assignmentId);
    if (idx === -1) return;

    const existing = assignments[idx];
    // Override is only meaningful for a completed assignment (detection needs
    // the actual start/end timestamps).
    if (normalizeAssignmentStatus(existing).status !== 'completed') {
      showToast('Override hanya untuk penugasan yang sudah selesai');
      return;
    }

    const office = {
      workStartMins: getSetting('operations.workStartMins'),
      workEndMins:   getSetting('operations.workEndMins'),
    };
    const before = computeWorkTime(existing, office);
    const oldFinalStatus = before.finalStatus;          // pre-override final
    if (oldFinalStatus === targetStatus && before.overtimeSource === 'MANUAL') {
      showToast('Status sudah sesuai'); return;
    }

    const currentUser = getCurrentUser();
    const now = new Date().toISOString();
    assignments[idx] = {
      ...existing,
      overtimeOverride:       targetStatus,
      overtimeOverrideReason: cleanReason,
      overtimeOverriddenBy: {
        uid:  currentUser?.id || null,
        name: currentUser?.name || '',
        role: currentUser?.role || '',
      },
      overtimeOverriddenAt: now,
      updatedAt: now,
    };

    updateAllModules();
    saveAssignments(assignments);        // localStorage only
    saveOneAssignment(assignments[idx]); // surgical Firebase write
    renderViews();

    const overridden = assignments[idx];
    logAction({
      userId:      currentUser?.id,
      username:    currentUser?.username,
      displayName: currentUser?.name,
      action:      'assignment_overtime_overridden',
      targetId:    assignmentId,
      metadata: {
        driver:           overridden.driver,
        vehicle:          overridden.vehicle,
        date:             overridden.date || overridden.startDate,
        detectionStatus:  before.detectionStatus, // AUTO_NORMAL | AUTO_LEMBUR
        oldStatus:        oldFinalStatus,          // NORMAL | LEMBUR (pre)
        newStatus:        targetStatus,            // NORMAL | LEMBUR (post)
        source:           'MANUAL',
        reason:           cleanReason,
      },
    });

    if (openDetailModal) openDetailModal(assignmentId); // refresh detail view
    showToast(targetStatus === 'LEMBUR' ? '⏱ Status diubah ke Lembur' : '✓ Status diubah ke Normal');
  });

  // NOTE (v1.11.1.2): Firebase real-time sync + H-1/H-2 reminder timers
  // moved into startAuthenticatedSession() above so they run only after
  // authentication resolves (auth-ready gate). Do not re-add RTDB calls here.

  // ── Startup complete: reveal V2 shell, dismiss splash ──────────
  // Adding .app-ready lifts visibility: hidden from body (set in
  // the <style> block in <head>) and triggers the splash fade-out
  // transition defined in platform.css.  The splash element is
  // removed from DOM after the 0.18s transition finishes.
  document.body.classList.add('app-ready');
  setTimeout(() => document.getElementById('app-splash')?.remove(), 250);

  console.log('✅ App initialized successfully');
});

// Export untuk debugging di console
window.appDebug = {
  getAssignments: () => assignments,
  getRequests: () => requests,
  getAppVersion: () => APP_VERSION,
  getReleaseName: () => RELEASE_NAME,
  getCurrentDate: () => getCurrentDate(),
  getCurrentUser,
  hasPermission,
  isAdmin,
  isBidang,
  checkConflict,
  renderTimeline,
};

console.info(`Jadwal Driver PBSI v${APP_VERSION} — ${RELEASE_NAME} loaded`);
