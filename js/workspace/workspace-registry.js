/* ============================================================
   WORKSPACE-REGISTRY.JS — v1.19.9 Executive Command Center

   The SINGLE source of truth for "role → workspace".

   Role determines the Workspace.
   Workspace determines the Widgets.
   Widgets consume existing business modules (never the reverse).

   This module is PURE: no DOM, no Firebase, no business logic. It only
   describes which workspace a role lands on and, for each workspace, the
   ORDERED list of widget ids to render. Adding a future workspace is a
   data change here + a widget group — the render pipeline never changes.
   ============================================================ */

'use strict';

/**
 * Phase 7 (Executive Command Center Rebuild) — explicit attention hierarchy:
 * Masthead -> NOW -> DECISIONS -> SITUATION -> OUTLOOK -> Deep Dive. This is
 * the SINGLE source of truth for both grouping (workspace-renderer.js's
 * opt-in zone-banding, consumed only when a workspace defines `zones`) and
 * widget order — `widgets` below is derived from it, never hand-duplicated,
 * so the flat loader list and the zoned rendering can never drift apart.
 *
 * A zone with `label: null` renders its widgets straight into the page grid
 * with no eyebrow/heading wrapper: Masthead (exec-hero already owns its own
 * heading treatment) and Explore (a labeled band would compete with, not
 * support, the Launcher's own "the way out arrives last, quietly" motion
 * intent — Phase 6). Every other zone gets a small typography-only eyebrow
 * above its own `.wsp-grid`, no icon, no box (workspace-styles.js `.wsp-zone`).
 *
 * `heading` (an extra `<h2>` between the eyebrow and the grid) is used ONLY
 * for a zone whose grid holds more than one differently-titled widget
 * (Situation: Snapshot/Story/Drivers/Vehicle Flags) — there it earns its
 * place by framing several sections at once. A single-widget zone (Now,
 * Decisions, Outlook) omits it: that widget's own card/section title
 * (Widget Registry `title`, rendered by workspace-renderer.js regardless of
 * zones) already IS the heading immediately below the eyebrow — a second,
 * near-identical `<h2>` between them read as an accidental duplicate in
 * practice (e.g. eyebrow "Keputusan" -> heading "Tindakan yang
 * direkomendasikan" -> widget title "Tindakan Direkomendasikan", three
 * lines saying the same thing), found and fixed during Phase 7's own visual
 * verification pass.
 * @type {Array<{id:string, label:string|null, heading?:string, widgets:string[]}>}
 */
const EXECUTIVE_ZONES = [
  { id: 'masthead', label: null, widgets: ['exec-hero'] },
  { id: 'now', label: 'Sekarang', widgets: ['exec-attention'] },
  { id: 'decisions', label: 'Keputusan', widgets: ['exec-recommendation'] },
  { id: 'situation', label: 'Situasi Operasional', heading: 'Gambaran operasional hari ini', widgets: ['exec-snapshot', 'exec-activity', 'exec-drivers', 'exec-vehicle-flags'] },
  { id: 'outlook', label: 'Proyeksi', widgets: ['exec-outlook'] },
  { id: 'explore', label: null, widgets: ['exec-quick'] },
];

/**
 * Workspace profiles. `widgets` is an ordered list of widget ids resolved
 * against the Widget Registry (js/workspace/widget-registry.js).
 * @type {Record<string, {id:string, role:string, title:string, subtitle:string, widgets:string[], zones?:Array}>}
 */
export const WORKSPACES = {
  // Admin → Executive Command Center. Answers: "What requires my attention today?"
  executive: {
    id: 'executive',
    role: 'admin',
    title: 'Executive Command Center',
    subtitle: 'Ringkasan operasional — apa yang membutuhkan perhatian Anda hari ini.',
    zones: EXECUTIVE_ZONES,
    widgets: EXECUTIVE_ZONES.flatMap(z => z.widgets),
  },

  // Bidang → Request Workspace. Operational consumers: monitor + create requests.
  request: {
    id: 'request',
    role: 'bidang',
    title: 'Ruang Kerja Permintaan',
    subtitle: 'Pantau permintaan, persetujuan, dan penugasan kendaraan Anda.',
    widgets: [
      'req-my-requests',
      'req-approval',
      'req-today',
      'req-vehicle',
      'req-driver',
      'req-announcements',
      'req-quick',
      'req-history',
      'req-activity',
    ],
  },

  // Driver → Driver Workspace. A daily task board for today's operational work.
  driver: {
    id: 'driver',
    role: 'driver',
    title: 'Ruang Kerja Driver',
    subtitle: 'Selesaikan tugas operasional Anda hari ini.',
    widgets: [
      'drv-today',
      'drv-vehicle',
      'drv-schedule',
      'drv-timeline',
      'drv-reminder',
      'drv-quick',
      'drv-reimbursement',
      'drv-history',
    ],
  },

  // Engineering → reserved for future Engineering Operations. Architecture only.
  engineering: {
    id: 'engineering',
    role: 'engineering',
    title: 'Ruang Kerja Teknik',
    subtitle: 'Operasional pemeliharaan aset — segera hadir.',
    widgets: [
      'eng-tasks',
      'eng-progress',
      'eng-maintenance',
      'eng-checklist',
      'eng-calendar',
      'eng-quick',
    ],
  },
};

/** role → workspace id. The ONLY role→workspace decision point in the app.
 *  The Engineering roles (v1.20.x role registry) map to the engineering
 *  workspace; their primary experience is the Engineering MODULE (reached via
 *  the rail), but this keeps Home coherent if they open it. */
const ROLE_TO_WORKSPACE = {
  admin: 'executive',
  bidang: 'request',
  driver: 'driver',
  engineering: 'engineering',
  engineering_coordinator: 'engineering',
  engineering_member: 'engineering',
};

/** Roles without a bespoke workspace fall back to the read-only Request view. */
const FALLBACK_WORKSPACE = 'request';

/**
 * Resolve the workspace profile for a role. Never throws — unknown roles
 * (viewer, future roles) get the safe read-only fallback.
 * @param {string} role
 * @returns {{id:string, role:string, title:string, subtitle:string, widgets:string[]}}
 */
export function resolveWorkspaceForRole(role) {
  const id = ROLE_TO_WORKSPACE[role] || FALLBACK_WORKSPACE;
  return WORKSPACES[id] || WORKSPACES[FALLBACK_WORKSPACE];
}

/** @returns {string[]} every known workspace id (diagnostics / tests). */
export function listWorkspaceIds() {
  return Object.keys(WORKSPACES);
}
