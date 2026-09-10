/* ============================================================
   DOMAIN SHELL (domainShellV1) — Consolidated 7-domain navigation
   ============================================================

   Additive replacement for the flat 10-item V2 rail/panel
   (initV2Rail()/initV2Panel() in app.js), gated behind its own feature
   flag. Ports the "Today / Operations / Warehouse / Finance /
   Engineering / Insights / Control" information architecture from the
   Claude Design "Sarpras Operations" prototype (project 28f0fd6b) onto
   the EXISTING app — every domain/tab renders through the real,
   unmodified nav functions passed in at init(). This file owns chrome
   and routing only; zero business logic lives here.

   Why every module gets a full screen-tab strip, not just the
   prototype's illustrative subset: the prototype's mockup shows e.g.
   Finance as 3 tabs (Cash/NOR/Overtime), but the real Petty Cash module
   has 5 screens (dashboard/expenses/norGenerate/norHistory/settings)
   and Overtime has 10 — all reached today via the old external v2Panel
   nav buttons this shell replaces. Exposing only the prototype's subset
   would make real screens unreachable, which the implementation brief
   explicitly forbids ("preserve business correctness" outranks "adopt
   the new IA"). So each module's *_MENU_TITLES map (the same source of
   truth the old panel nav buttons were hand-built from) drives a
   second-level screen-tab strip wherever a module has >1 screen.

   Mounting: this module does NOT create content containers. Every
   existing land() function already toggles visibility of its own
   pre-existing workspace container via setWorkspace() — this shell only
   has to decide WHICH domain/module/screen is active and call the same
   functions the old panel nav buttons called.
   ============================================================ */

import { anIcon } from '../analytics/analytics-shell.js';

'use strict';

let cfg = null;           // init() config (function refs from app.js)
let railEl = null;
let tabBarEl = null;
let domains = [];         // built once per init/permission refresh
let activeDomainId = null;
let activeModuleKey = null;   // which module within the active domain
let activeScreenId = null;    // which screen within the active module

/* ── Design System Program Phase 4: rail icons now render through the
   canonical anIcon() glyph set instead of this file's own local SVG
   fragments — fixes a pre-existing 1.6/2.2 stroke-width inconsistency and
   drops the filled-accent-dot quirk as part of consolidation. Domain ids
   map 1:1 onto anIcon() names (today/operations/warehouse/finance/
   engineering/insights/control/sarprasIntelligence all resolve). ── */
function svgIcon(name) {
  return anIcon(name, { size: 20, stroke: 1.8 });
}

/**
 * Build the domain registry from injected function refs. Called once at
 * init and again whenever permissions might have changed (role switch),
 * since which screens are visible per role is computed here, not cached.
 */
function buildDomains() {
  const { land, can, isAdmin, isBidang } = cfg;
  const adminOnly = () => can('system.admin');
  const requestsVisible = () => isAdmin() || isBidang();

  return [
    {
      id: 'today', label: 'Today', icon: 'today', module: 'home',
      screens: [{ id: 'today', label: 'Today', land: land.navHome }],
    },
    {
      id: 'operations', label: 'Operations', icon: 'operations', module: 'driverops',
      screens: [
        { id: 'board', label: 'Board', land: land.navJadwalDriver },
        // v1.30.10.7 — found by the old-shell/new-shell screen equivalence
        // check: the old v2Panel gives drivers a dedicated "Jadwal Saya"
        // shortcut (navJadwalSaya — same #driverDashboard content as Board,
        // but auto-scrolled + its own breadcrumb/nav-active state), distinct
        // from both Board and Riwayat/History below. Missing here entirely
        // before this fix — the underlying content was still reachable via
        // Board, but the dedicated entry point was silently dropped.
        { id: 'jadwalSaya', label: 'Jadwal Saya', land: land.navJadwalSaya, visible: cfg.isDriver },
        { id: 'requests', label: 'Requests', land: land.navPending, visible: requestsVisible },
        { id: 'drivers', label: 'Drivers', land: land.navManajemenDriver, visible: adminOnly },
        { id: 'vehicles', label: 'Vehicles', land: land.navManajemenKendaraan, visible: adminOnly },
        { id: 'auditDriver', label: 'Audit Driver', land: land.navAuditDriver, visible: adminOnly },
        { id: 'auditVehicle', label: 'Audit Kendaraan', land: land.navAuditKendaraan, visible: adminOnly },
        { id: 'history', label: 'Riwayat', land: land.navDriverHistory, visible: cfg.isDriver },
      ],
    },
    {
      id: 'warehouse', label: 'Warehouse', icon: 'warehouse', module: 'gudang',
      screens: Object.entries(cfg.gudMenuTitles).map(([id, label]) => ({
        id, label, land: () => land.navGudang(id),
      })),
    },
    {
      id: 'finance', label: 'Finance', icon: 'finance', module: 'pettycash',
      screens: Object.entries(cfg.pcMenuTitles).map(([id, label]) => ({
        id, label, land: () => land.navPettyCash(id),
      })),
    },
    {
      // Overtime restored to a standalone top-level domain (it was demoted
      // to a nested Finance → Overtime tab in v1.30.10.5). The
      // module has its own permission (overtime.view, gated by
      // canAccessModule('overtime')), its own MODULE_DEFS entry, and its own
      // navOvertime() handler, so it is a first-class domain here just like
      // Warehouse/Engineering — no new handler, permission, or module. The
      // former nested Finance tab was removed with this change so the user
      // never sees two identical Overtime entry points. Mobile "Lainnya"
      // (js/app.js BOTTOM_NAV_MORE_ITEMS) is unaffected — it proxies
      // #btnOvertime and is still gated by the same canAccessModule('overtime').
      id: 'overtime', label: 'Overtime', icon: 'overtime', module: 'overtime',
      screens: Object.entries(cfg.otMenuTitles).map(([id, label]) => ({
        id, label, land: () => land.navOvertime(id),
      })),
    },
    {
      id: 'engineering', label: 'Engineering', icon: 'engineering', module: 'engineering',
      screens: Object.entries(cfg.engMenuTitles).map(([id, label]) => ({
        id, label, land: () => land.navEngineering(id),
        visible: id === 'settings' ? () => can('eng.settings') : undefined,
      })),
    },
    {
      id: 'insights', label: 'Insights', icon: 'insights', module: 'analytics',
      screens: [
        { id: 'driver', label: 'Driver', land: land.navAnalyticsDriver },
        { id: 'dispatch', label: 'Dispatch', land: land.navDispatchAnalytics },
        { id: 'recommendation', label: 'Rekomendasi', land: land.navRecommendationAccuracy },
        { id: 'wellness', label: 'Wellness', land: land.navDriverWellness },
        { id: 'prediction', label: 'Prediksi', land: land.navDriverPrediction },
        { id: 'pettyCash', label: 'Petty Cash', land: land.navAnalyticsPettyCash },
        { id: 'executive', label: 'Executive', land: land.navAnalyticsExecutive },
        { id: 'engineering', label: 'Engineering', land: land.navAnalyticsEngineering, visible: () => can('eng.analytics') },
      ],
    },
    {
      // v1.30.10.7 — found by the old-shell/new-shell equivalence check: the
      // Sarpras Intelligence module (SIC_MENU_TITLES, app.js) had no home
      // anywhere in the 7-domain IA at all, and its gate (isV2Enabled(), a
      // pilot allowlist check) is completely orthogonal to every other
      // domain's role-permission gate (canAccessModule('sarprasIntelligence')
      // resolves BEFORE the normal MODULE_PERMISSIONS lookup — see
      // app.js's canAccessModule()). Nesting it under an existing domain
      // (e.g. Insights, alongside Analytics) would reintroduce exactly the
      // bug the original Finance->Overtime/Control->Roles nested-gate fix
      // was for: domainVisible() gates the WHOLE domain on its primary
      // module first, so a pilot user lacking that domain's own permission
      // would lose Sarpras Intelligence entirely. A standalone domain with
      // its own single clean gate avoids that class of bug altogether,
      // same as Today's module:'home'.
      id: 'sarprasIntelligence', label: 'Sarpras Intelligence', icon: 'sarprasIntelligence', module: 'sarprasIntelligence',
      screens: Object.entries(cfg.sicMenuTitles).map(([id, label]) => ({
        id, label, land: () => land.navSarprasIntelligence(id),
      })),
    },
    {
      id: 'control', label: 'Control', icon: 'control', module: 'konfigurasi',
      screens: [
        { id: 'users', label: 'Users', land: land.navManajemenUser },
        // Nested cross-module entry — Control's own gate is konfigurasi.view,
        // but Role Management is a separately-permissioned module
        // (system.admin), so it needs its own visibility check too: a
        // nested screen that belongs to a different module gates on that
        // module's own canAccessModule(), not the parent domain's.
        { id: 'roles', label: 'Roles', land: land.navRoleManagement, module: 'roleManagement',
          visible: () => cfg.canAccessModule('roleManagement') },
        { id: 'settings', label: 'Settings', land: land.navKonfigurasiGlobal },
      ],
    },
  ];
}

function moduleForDomain(domain) { return domain.module; }

/** Resolve which of a domain's flat/nested screens is currently reachable. */
function visibleScreens(list) {
  return list.filter(s => !s.visible || s.visible());
}

function domainVisible(domain) {
  return cfg.canAccessModule(moduleForDomain(domain)) && visibleScreens(domain.screens).length > 0;
}

/* ── Rendering ─────────────────────────────────────────────────────── */

let railListEl = null;

function renderRail() {
  if (!railListEl) return;
  const visible = domains.filter(domainVisible);
  railListEl.innerHTML = visible.map(d => `
    <button type="button" class="domshell-rail-item${d.id === activeDomainId ? ' domshell-rail-item--active' : ''}"
            data-domain="${d.id}" aria-current="${d.id === activeDomainId ? 'page' : 'false'}">
      <span class="domshell-rail-icon">${svgIcon(d.icon)}</span>
      <span class="domshell-rail-label">${d.label}</span>
    </button>
  `).join('');
  railListEl.querySelectorAll('.domshell-rail-item').forEach(btn => {
    btn.addEventListener('click', () => enterDomain(btn.dataset.domain));
  });
}

/** Real user avatar/name/role in the rail footer — same computation
 *  updatePermissionUI() already does for the old rail/topbar avatars
 *  (js/app.js, initials from displayName, formatRole() from
 *  config/role-registry.js), just re-run here so this rail doesn't need
 *  app.js to know about its internal DOM. Called on init (pre-auth, renders
 *  an empty placeholder) and from refreshDomainShell() (post-auth and on
 *  every subsequent permission refresh). */
function renderUserFooter() {
  if (!cfg || !cfg.getCurrentUser) return;
  const avatarEl = document.getElementById('domshellRailAvatar');
  const nameEl = document.getElementById('domshellRailName');
  const roleEl = document.getElementById('domshellRailRole');
  if (!avatarEl || !nameEl || !roleEl) return;
  const user = cfg.getCurrentUser();
  const displayName = user?.name || user?.displayName || user?.username || '';
  const initials = displayName.trim().split(/\s+/).slice(0, 2).map((w) => (w[0] ?? '').toUpperCase()).join('') || '?';
  avatarEl.textContent = initials;
  nameEl.textContent = displayName || '—';
  roleEl.textContent = user?.role && cfg.formatRole ? cfg.formatRole(user.role) : '';
}

function currentDomain() { return domains.find(d => d.id === activeDomainId) || null; }

/** The screen list currently on-view: either a domain's top-level
 *  screens, or — when the active top-level screen is itself a nested
 *  module (e.g. Finance → Overtime) — that nested module's screens. */
function currentScreenLevel() {
  const domain = currentDomain();
  if (!domain) return { screens: [], parentId: null };
  const top = visibleScreens(domain.screens);
  const activeTop = top.find(s => s.id === activeModuleKey) || top[0];
  if (activeTop && Array.isArray(activeTop.screens)) {
    return { screens: visibleScreens(activeTop.screens), parentId: activeTop.id, top, activeTop };
  }
  return { screens: top, parentId: null, top, activeTop };
}

function renderTabBar() {
  if (!tabBarEl) return;
  const domain = currentDomain();
  if (!domain) { tabBarEl.innerHTML = ''; tabBarEl.style.display = 'none'; return; }
  const { screens, parentId, top } = currentScreenLevel();
  const showTopRow = top.length > 1;
  const showSubRow = parentId && screens.length > 1;
  if (!showTopRow && !showSubRow) { tabBarEl.innerHTML = ''; tabBarEl.style.display = 'none'; return; }
  // Must be an explicit value, not '' — the base CSS rule is
  // `.domshell-tabbar { display: none; ... }` (hidden until JS decides
  // there's something to show), so clearing the inline override falls
  // straight back through to that same display:none in the cascade.
  tabBarEl.style.display = 'flex';
  let html = '';
  if (showTopRow) {
    html += `<div class="domshell-tabrow">${top.map(s => `
      <button type="button" class="domshell-tab${s.id === (parentId || activeScreenId) ? ' domshell-tab--active' : ''}" data-top="${s.id}">${s.label}</button>
    `).join('')}</div>`;
  }
  if (showSubRow) {
    html += `<div class="domshell-tabrow domshell-tabrow--sub">${screens.map(s => `
      <button type="button" class="domshell-tab domshell-tab--sub${s.id === activeScreenId ? ' domshell-tab--active' : ''}" data-sub="${s.id}">${s.label}</button>
    `).join('')}</div>`;
  }
  tabBarEl.innerHTML = html;
  tabBarEl.querySelectorAll('[data-top]').forEach(btn => {
    btn.addEventListener('click', () => enterTopScreen(btn.dataset.top));
  });
  tabBarEl.querySelectorAll('[data-sub]').forEach(btn => {
    btn.addEventListener('click', () => enterSubScreen(btn.dataset.sub));
  });
}

/* ── Navigation ────────────────────────────────────────────────────── */

function enterDomain(domainId) {
  const domain = domains.find(d => d.id === domainId);
  if (!domain || !domainVisible(domain)) return;
  activeDomainId = domainId;
  const top = visibleScreens(domain.screens);
  enterTopScreen(top[0]?.id, /* fromDomainSwitch */ true);
}

function enterTopScreen(topId, fromDomainSwitch = false) {
  const domain = currentDomain();
  if (!domain) return;
  const top = visibleScreens(domain.screens);
  const entry = top.find(s => s.id === topId) || top[0];
  if (!entry) return;
  activeModuleKey = entry.id;
  const nestedModule = entry.module || domain.module;
  if (fromDomainSwitch || nestedModule !== cfg.getActiveRailModule()) {
    cfg.setRailModule(nestedModule);
  }
  if (Array.isArray(entry.screens)) {
    const sub = visibleScreens(entry.screens);
    enterSubScreen(sub[0]?.id, entry);
  } else {
    activeScreenId = entry.id;
    entry.land();
  }
  renderRail();
  renderTabBar();
}

function enterSubScreen(screenId, parentEntry) {
  const { screens, activeTop } = currentScreenLevel();
  const parent = parentEntry || activeTop;
  const list = Array.isArray(parent?.screens) ? visibleScreens(parent.screens) : screens;
  const entry = list.find(s => s.id === screenId) || list[0];
  if (!entry) return;
  if (parent?.module && parent.module !== cfg.getActiveRailModule()) {
    cfg.setRailModule(parent.module);
  }
  activeScreenId = entry.id;
  entry.land();
  renderTabBar();
}

/**
 * Jump directly to a specific domain + top-level screen — used by
 * command-palette.js so a search result can land the user on the exact
 * tab it's describing (e.g. a driver result → Operations/Drivers), not
 * just the domain's own default landing screen.
 * @returns {boolean} whether the jump was possible (domain visible)
 */
export function goToScreen(domainId, topScreenId) {
  const domain = domains.find(d => d.id === domainId);
  if (!domain || !domainVisible(domain)) return false;
  activeDomainId = domainId;
  enterTopScreen(topScreenId, /* fromDomainSwitch */ true);
  return true;
}

/**
 * Called from app.js's setRailModule() (guarded, no-op when this shell
 * isn't active) so the rail highlight stays correct even when navigation
 * happens through an existing call site this shell doesn't own directly
 * (e.g. a "Lihat di Board" deep link from a driver/vehicle card).
 */
export function syncDomainShellActiveState() {
  if (!cfg) return;
  const mod = cfg.getActiveRailModule();
  const domain = domains.find(d => moduleForDomain(d) === mod
    || (d.screens || []).some(s => s.module === mod));
  if (domain && domain.id !== activeDomainId) {
    activeDomainId = domain.id;
    const entry = (domain.screens || []).find(s => (s.module || domain.module) === mod);
    activeModuleKey = entry ? entry.id : activeModuleKey;
  }
  renderRail();
  renderTabBar();
}

/* ── Responsive: mobile drawer relocation ─────────────────────────────
   Mirrors app.js's syncV2ResponsiveNavReuse() for the old rail/panel: same
   live railEl/tabBarEl nodes get physically reparented into the existing
   legacy sidebar drawer below 768px, not a second parallel nav tree. The
   old function's own early-return guard (missing #v2Rail/#v2Panel) means
   it never runs its V1-legacy-nav-hiding step when this shell is active —
   so this replicates that one step too, using the same dataset tagging
   convention, rather than leaving V1's legacy groups visible alongside
   this shell's own mobile nav. ── */

function syncResponsive() {
  if (!cfg || !railEl || !tabBarEl) return;
  const sidebar = document.getElementById('sidebar');
  const sidebarNav = sidebar?.querySelector('.sidebar-nav');
  const appLayout = document.querySelector('.app-layout');
  if (!sidebar || !sidebarNav || !appLayout) return;

  const isMobile = window.matchMedia('(max-width: 767px)').matches;

  if (isMobile) {
    sidebarNav.querySelectorAll('.sidebar-nav-group').forEach((group) => {
      group.dataset.v2LegacyNav = 'true';
      group.style.display = 'none';
    });
    let host = document.getElementById('domshellMobileNavHost');
    if (!host) {
      host = document.createElement('div');
      host.id = 'domshellMobileNavHost';
      sidebarNav.insertBefore(host, sidebarNav.firstChild);
    }
    if (railEl.parentElement !== host) host.appendChild(railEl);
    if (tabBarEl.parentElement !== host) host.appendChild(tabBarEl);
    railEl.classList.add('domshell-rail--mobile-drawer');
    tabBarEl.classList.add('domshell-tabbar--mobile-drawer');
    return;
  }

  sidebarNav.querySelectorAll('.sidebar-nav-group[data-v2-legacy-nav="true"]').forEach((group) => {
    group.style.display = '';
  });
  railEl.classList.remove('domshell-rail--mobile-drawer');
  tabBarEl.classList.remove('domshell-tabbar--mobile-drawer');
  if (railEl.parentElement !== appLayout) appLayout.insertBefore(railEl, sidebar);
  if (tabBarEl.parentElement !== appLayout) {
    const header = document.querySelector('header.header');
    if (header && header.parentElement) header.parentElement.insertBefore(tabBarEl, header.nextSibling);
    else cfg.mountBefore.parentElement.appendChild(tabBarEl);
  }
}

let responsiveBound = false;
function initResponsive() {
  if (!responsiveBound) {
    window.addEventListener('resize', syncResponsive);
    responsiveBound = true;
  }
  syncResponsive();
}

/* ── Init ──────────────────────────────────────────────────────────── */

/**
 * @param {object} c
 * @param {(name:string)=>boolean} c.canAccessModule  - reused from app.js, single auth gate
 * @param {(perm:string)=>boolean} c.can
 * @param {()=>boolean} c.isAdmin
 * @param {()=>boolean} c.isBidang
 * @param {()=>boolean} c.isDriver
 * @param {(name:string)=>void} c.setRailModule       - reused wholesale for CTA/search/bottom-nav bookkeeping
 * @param {()=>string} c.getActiveRailModule
 * @param {()=>string} c.defaultModuleForRole
 * @param {object} c.land                              - map of existing nav functions (unmodified)
 * @param {object} c.pcMenuTitles  - PC_MENU_TITLES
 * @param {object} c.otMenuTitles  - OT_MENU_TITLES
 * @param {object} c.engMenuTitles - ENG_MENU_TITLES
 * @param {object} c.gudMenuTitles - GUD_MENU_TITLES
 * @param {HTMLElement} c.mountBefore - element the rail is inserted before (existing #sidebar)
 * @param {()=>object} c.getCurrentUser - real signed-in user (js/auth.js), for the rail's footer identity block
 * @param {(role:string)=>string} c.formatRole - real role-label formatter (config/role-registry.js)
 * @param {string} c.logoSrc - real PBSI logo asset path (same one the sidebar/login already use)
 * @param {string} c.brandLabel - short brand text for the rail header (e.g. "Sarpras Ops")
 * @param {string} c.versionLabel - real APP_VERSION, shown under the brand label
 */
export function initDomainShell(c) {
  cfg = c;
  document.body.classList.add('v2-shell-active', 'domain-shell-active');

  railEl = document.createElement('nav');
  railEl.className = 'domshell-rail';
  railEl.setAttribute('aria-label', 'Domain utama');
  railEl.innerHTML = `
    <div class="domshell-rail-brand">
      <div class="domshell-rail-logo"><img src="${cfg.logoSrc}" alt="PBSI" onerror="this.style.display='none'" /></div>
      <div class="domshell-rail-brandtext">
        <div class="domshell-rail-brandname">${cfg.brandLabel || 'Sarpras Ops'}</div>
        <div class="domshell-rail-brandver">${cfg.versionLabel || ''}</div>
      </div>
    </div>
    <div class="domshell-rail-list"></div>
    <div class="domshell-rail-footer">
      <div class="domshell-rail-avatar" id="domshellRailAvatar" aria-hidden="true">?</div>
      <div class="domshell-rail-usertext">
        <div class="domshell-rail-username" id="domshellRailName"></div>
        <div class="domshell-rail-userrole" id="domshellRailRole"></div>
      </div>
    </div>`;
  railListEl = railEl.querySelector('.domshell-rail-list');
  cfg.mountBefore.parentElement.insertBefore(railEl, cfg.mountBefore);

  tabBarEl = document.createElement('div');
  tabBarEl.className = 'domshell-tabbar';
  const header = document.querySelector('header.header') || document.querySelector('.main-area header');
  if (header && header.parentElement) {
    header.parentElement.insertBefore(tabBarEl, header.nextSibling);
  } else {
    cfg.mountBefore.parentElement.appendChild(tabBarEl);
  }

  // Deliberately does NOT navigate here — mirrors initV2Rail()/initV2Panel(),
  // which only build DOM at this (pre-auth) point. activeRailModule's own
  // pre-auth default is documented as unused in practice because the real
  // first landing always happens post-auth via updatePermissionUI(true) ->
  // refreshDomainShell(true). Doing it here too would land on a no-user
  // permission state (only 'today' visible) that gets immediately redone.
  domains = buildDomains();
  renderRail();
  renderTabBar();
  renderUserFooter();
  initResponsive();
}

/**
 * Re-derive visibility (role/permission changed). Mirrors the old rail's
 * `if (resetNavActive) setRailModule(defaultModuleForRole())` semantics:
 * on auth changes (login/logout/startup) force-land on the role's default
 * domain; on a plain data refresh, only recompute which domains/tabs are
 * visible without moving the user off their current screen.
 * @param {boolean} forceRelocate
 */
export function refreshDomainShell(forceRelocate = false) {
  if (!cfg) return;
  const prevDomain = activeDomainId;
  domains = buildDomains();
  renderUserFooter();
  const stillValid = domains.find(d => d.id === prevDomain && domainVisible(d));
  if (forceRelocate || !stillValid) {
    const target = domains.find(d => moduleForDomain(d) === cfg.defaultModuleForRole() && domainVisible(d))
      || domains.find(domainVisible);
    if (target) { enterDomain(target.id); return; }
  }
  renderRail();
  renderTabBar();
}
