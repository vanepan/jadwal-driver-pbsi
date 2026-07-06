/* ============================================================
   WIDGET-REGISTRY.JS — v1.19.9 Executive Command Center

   Centralized Widget Registry. Maps widget id → presentation metadata
   (title, grid span, group) and lazily loads the widget IMPLEMENTATION
   module for a group on first use.

   Lazy loading boundary = the widget GROUP (one module per workspace). A
   role only ever lands on one workspace, so only that workspace's widget
   bundle is imported — unused widgets are never initialized (spec:
   "Load only widgets required for the current workspace").

   The registry owns the card chrome (title/span) so the renderer can draw
   labelled skeletons BEFORE the implementation module resolves. The widget
   module owns only content (`render`/`onMount`).
   ============================================================ */

'use strict';

/**
 * Widget metadata. `group` selects the lazy module loader below; `span`
 * is a grid hint (1 = single column, 2 = wide).
 * @type {Record<string, {id:string, title:string, span:number, group:string}>}
 */
export const WIDGETS = {
  /* ── Executive Command Center (admin) — v1.19.10 Briefing experience ──
     Each widget SUMMARIZES, PRIORIZES, or RECOMMENDS — never plain data.
     Variants: hero (untitled full-width briefing), section (titled full-width
     band), card (default titled card). */
  'exec-hero':           { id: 'exec-hero',           title: 'Ringkasan Eksekutif',    span: 'full', variant: 'hero',    group: 'executive' },
  'exec-priority':       { id: 'exec-priority',       title: 'Prioritas Operasional',  span: 'full', variant: 'section', group: 'executive' },
  'exec-decision':       { id: 'exec-decision',       title: 'Pusat Keputusan',        span: 2,      variant: 'card',    group: 'executive' },
  'exec-recommendation': { id: 'exec-recommendation', title: 'Rekomendasi Hari Ini',   span: 1,      variant: 'card',    group: 'executive' },
  'exec-simulation':     { id: 'exec-simulation',     title: 'Pusat Simulasi',         span: 1,      variant: 'card',    group: 'executive' },
  'exec-snapshot':       { id: 'exec-snapshot',       title: 'Snapshot Operasional',   span: 'full', variant: 'section', group: 'executive' },
  'exec-activity':       { id: 'exec-activity',       title: 'Aktivitas Operasional',  span: 2,      variant: 'card',    group: 'executive' },
  'exec-quick':          { id: 'exec-quick',          title: 'Peluncur Eksekutif',     span: 'full', variant: 'section', group: 'executive' },

  /* ── Request Workspace (bidang) ── */
  'req-my-requests':     { id: 'req-my-requests',     title: 'Permintaan Saya',        span: 2, group: 'request' },
  'req-approval':        { id: 'req-approval',        title: 'Status Persetujuan',     span: 1, group: 'request' },
  'req-today':           { id: 'req-today',           title: 'Jadwal Hari Ini',        span: 1, group: 'request' },
  'req-vehicle':         { id: 'req-vehicle',         title: 'Kendaraan Ditugaskan',   span: 1, group: 'request' },
  'req-driver':          { id: 'req-driver',          title: 'Driver Ditugaskan',      span: 1, group: 'request' },
  'req-announcements':   { id: 'req-announcements',   title: 'Pengumuman',             span: 1, group: 'request' },
  'req-quick':           { id: 'req-quick',           title: 'Permintaan Cepat',       span: 1, group: 'request' },
  'req-history':         { id: 'req-history',         title: 'Riwayat Permintaan',     span: 2, group: 'request' },
  'req-activity':        { id: 'req-activity',        title: 'Aktivitas Terkini',      span: 1, group: 'request' },

  /* ── Driver Workspace (driver) ── */
  'drv-today':           { id: 'drv-today',           title: 'Tugas Hari Ini',         span: 2, group: 'driver' },
  'drv-vehicle':         { id: 'drv-vehicle',         title: 'Kendaraan Ditugaskan',   span: 1, group: 'driver' },
  'drv-schedule':        { id: 'drv-schedule',        title: 'Jadwal Hari Ini',        span: 1, group: 'driver' },
  'drv-timeline':        { id: 'drv-timeline',        title: 'Linimasa Perjalanan',    span: 2, group: 'driver' },
  'drv-reminder':        { id: 'drv-reminder',        title: 'Pengingat',              span: 1, group: 'driver' },
  'drv-quick':           { id: 'drv-quick',           title: 'Aksi Cepat',             span: 1, group: 'driver' },
  'drv-reimbursement':   { id: 'drv-reimbursement',   title: 'Reimbursement',          span: 1, group: 'driver' },
  'drv-history':         { id: 'drv-history',         title: 'Riwayat',                span: 1, group: 'driver' },

  /* ── Engineering Workspace (architecture only) ── */
  'eng-tasks':           { id: 'eng-tasks',           title: 'Tugas Hari Ini',         span: 2, group: 'engineering' },
  'eng-progress':        { id: 'eng-progress',        title: 'Progres Tugas',          span: 1, group: 'engineering' },
  'eng-maintenance':     { id: 'eng-maintenance',     title: 'Jadwal Pemeliharaan',    span: 1, group: 'engineering' },
  'eng-checklist':       { id: 'eng-checklist',       title: 'Checklist Preventif',    span: 1, group: 'engineering' },
  'eng-calendar':        { id: 'eng-calendar',        title: 'Kalender Pemeliharaan',  span: 1, group: 'engineering' },
  'eng-quick':           { id: 'eng-quick',           title: 'Aksi Cepat',             span: 2, group: 'engineering' },
};

/**
 * One lazy import per widget GROUP. `import()` is code-split by the browser;
 * a group's module is fetched at most once and reused for every widget in it.
 */
const GROUP_LOADERS = {
  executive:   () => import('../widgets/executive/index.js'),
  request:     () => import('../widgets/request/index.js'),
  driver:      () => import('../widgets/driver/index.js'),
  engineering: () => import('../widgets/engineering/index.js'),
};

/** In-flight / resolved group-module promises, keyed by group. */
const _groupCache = new Map();

/** @returns {Promise<Record<string, {render:Function, onMount?:Function}>>} */
function loadGroup(group) {
  const loader = GROUP_LOADERS[group];
  if (!loader) return Promise.resolve({});
  if (!_groupCache.has(group)) {
    _groupCache.set(group, loader().then(mod => mod.widgets || {}));
  }
  return _groupCache.get(group);
}

/** @returns {{id:string, title:string, span:number, group:string}|null} */
export function getWidgetDef(widgetId) {
  return WIDGETS[widgetId] || null;
}

/**
 * Resolve a widget's implementation (`{ render, onMount? }`). Returns null if
 * the id is unknown or the module omits it — the renderer skips nulls safely.
 * @param {string} widgetId
 * @returns {Promise<{render:Function, onMount?:Function}|null>}
 */
export async function loadWidgetImpl(widgetId) {
  const def = WIDGETS[widgetId];
  if (!def) return null;
  const widgets = await loadGroup(def.group);
  return widgets[widgetId] || null;
}
