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
 * Workspace profiles. `widgets` is an ordered list of widget ids resolved
 * against the Widget Registry (js/workspace/widget-registry.js).
 * @type {Record<string, {id:string, role:string, title:string, subtitle:string, widgets:string[]}>}
 */
export const WORKSPACES = {
  // Admin → Executive Command Center. Answers: "What requires my attention today?"
  executive: {
    id: 'executive',
    role: 'admin',
    title: 'Executive Command Center',
    subtitle: 'Ringkasan operasional — apa yang membutuhkan perhatian Anda hari ini.',
    // v1.19.10 briefing order: Hero → Priority → Decision → Recommendation →
    // Simulation → Snapshot → Activity → Launcher. Answers "how healthy? / what
    // needs attention? / what next?" top-to-bottom.
    widgets: [
      'exec-hero',
      'exec-priority',
      'exec-attention',
      'exec-decision',
      'exec-recommendation',
      'exec-simulation',
      'exec-snapshot',
      'exec-activity',
      'exec-quick',
    ],
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
