'use strict';

/**
 * Bottom Navigation Registry — v1.20.8, Native App Experience Objective 5.
 *
 * PURE: plain data + a small local icon set. No DOM, no Firebase, no `window`.
 * Same shape discipline as js/config/role-registry.js and
 * js/workspace/workspace-registry.js.
 *
 * Keyed by WORKSPACE id (js/workspace/workspace-registry.js's WORKSPACES),
 * NOT by role — this is the same join key resolveWorkspaceForRole() already
 * uses, so a role never needs a second lookup table to find its nav.
 *
 * Each item's `action` is a string key resolved against the actions map built
 * in js/app.js's renderBottomNav() — mirrors the exact declarative-binding
 * idiom buildHomeContext().actions already uses for Home widgets, and
 * workspace-renderer.js's data-wsp-action delegated-click pattern.
 */

/** 20x20 viewBox path data, fill=currentColor — matches the existing
 *  bottom-nav icon style already in index.html. Decorative only. */
const ICON_PATHS = {
  home: 'M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z',
  clock: 'M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v5a1 1 0 00.293.707l3 3a1 1 0 001.414-1.414L11 9.586V5z',
  grid: 'M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z',
  clipboard: 'M9 2a1 1 0 000 2h2a1 1 0 100-2H9zM4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5z',
  plus: 'M10 18a8 8 0 100-16 8 8 0 000 16zM11 6a1 1 0 10-2 0v3H6a1 1 0 100 2h3v3a1 1 0 102 0v-3h3a1 1 0 100-2h-3V6z',
  truck: 'M3 4a1 1 0 00-1 1v9a2 2 0 002 2 3 3 0 016 0h2a3 3 0 016 0 2 2 0 002-2V9a1 1 0 00-.293-.707l-3-3A1 1 0 0016 5h-3V5a1 1 0 00-1-1H3zM8 16a2 2 0 11-4 0 2 2 0 014 0zM17 16a2 2 0 11-4 0 2 2 0 014 0z',
  chart: 'M2 11a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1H3a1 1 0 01-1-1v-6zM8 7a1 1 0 011-1h2a1 1 0 011 1v10a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 3a1 1 0 011-1h2a1 1 0 011 1v14a1 1 0 01-1 1h-2a1 1 0 01-1-1V3z',
  bell: 'M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z',
  profile: 'M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z',
  more: 'M6 10a2 2 0 11-4 0 2 2 0 014 0zM12 10a2 2 0 11-4 0 2 2 0 014 0zM16 12a2 2 0 100-4 2 2 0 000 4z',
};

export function bottomNavIconPath(name) {
  return ICON_PATHS[name] || ICON_PATHS.grid;
}

/** @type {Record<string, Array<{id:string,label:string,icon:string,action:string,badge?:'requests'|'notif'}>>} */
export const BOTTOM_NAV_ITEMS = {
  driver: [
    { id: 'nav-today',    label: 'Hari Ini',   icon: 'home',      action: 'navHome' },
    { id: 'nav-timeline', label: 'Timeline',   icon: 'clock',     action: 'navDriverTimeline' },
    { id: 'nav-dash',     label: 'Dashboard',  icon: 'grid',      action: 'navDriverList' },
    { id: 'nav-history',  label: 'Riwayat',    icon: 'clipboard', action: 'navDriverHistory' },
    { id: 'nav-profile',  label: 'Profil',     icon: 'profile',   action: 'openProfile' },
  ],
  engineering: [
    { id: 'nav-eng-dash',     label: 'Dashboard', icon: 'grid',      action: 'navEngDashboard' },
    { id: 'nav-eng-timeline', label: 'Timeline',  icon: 'clock',     action: 'navEngTimeline' },
    { id: 'nav-eng-jobs',     label: 'Pekerjaan', icon: 'clipboard', action: 'navEngMyJobs' },
    { id: 'nav-eng-history',  label: 'Riwayat',   icon: 'chart',     action: 'navEngHistory' },
    { id: 'nav-eng-profile',  label: 'Profil',    icon: 'profile',   action: 'openProfile' },
  ],
  request: [
    { id: 'nav-req-new',     label: 'Permintaan', icon: 'plus',      action: 'openRequestForm' },
    { id: 'nav-req-history', label: 'Riwayat',    icon: 'clipboard', action: 'openRequestsList', badge: 'requests' },
    { id: 'nav-req-notif',   label: 'Notifikasi', icon: 'bell',      action: 'openNotifications', badge: 'notif' },
    { id: 'nav-req-profile', label: 'Profil',     icon: 'profile',   action: 'openProfile' },
  ],
  executive: [
    { id: 'nav-exec-dash',  label: 'Dashboard',   icon: 'home',  action: 'navHome' },
    { id: 'nav-exec-ops',   label: 'Operasional', icon: 'truck', action: 'navOperasional' },
    { id: 'nav-exec-an',    label: 'Analytics',   icon: 'chart', action: 'navAnalytics' },
    { id: 'nav-exec-notif', label: 'Notifikasi',  icon: 'bell',  action: 'openNotifications', badge: 'notif' },
    { id: 'nav-exec-more',  label: 'Lainnya',     icon: 'more',  action: 'openMoreSheet' },
  ],
};
