/* ============================================================
   DEPARTMENT-DIRECTORY.JS — read-only view over the platform's existing
   organizational master (Bidang / Department)

   Sarpras Operations already has a global organizational master used by
   User Management: every account with role='bidang' represents one
   Department (id = username, name = displayName). This is NOT a new
   entity — it is the same roster `js/petty-cash/petty-cash-service.js`'s
   bidangRoster() has always read (that function now delegates here).

   Consumers (Overtime Management's Operational Unit, Petty Cash's
   "Others" unit matching, and any future module) MUST resolve Department
   through this file rather than re-deriving their own filter over
   getUserList() — one read path, one place to extend if Department ever
   grows a dedicated data model of its own.

   PURE: no DOM, no Firebase, no side effects — getUserList() already
   returns the live in-memory roster kept in sync elsewhere.
   ============================================================ */

'use strict';

import { getUserList } from '../users.js';

/** Every Department (Bidang) — { id, name }, id = username, name = displayName. */
export function listDepartments() {
  return getUserList()
    .filter(u => u && u.role === 'bidang' && u.archived !== true)
    .map(u => ({ id: u.username, name: u.displayName || u.username }))
    .filter(d => d.name);
}

/** A single Department by id, or null. */
export function getDepartmentById(id) {
  if (!id) return null;
  return listDepartments().find(d => d.id === id) || null;
}

/** Case-insensitive exact name lookup — resolves a sensible default parent
    (e.g. "Sarpras") without ever hardcoding an id. Null when not found (a
    fresh/dev environment may not have that Bidang account yet). */
export function findDepartmentByName(name) {
  const norm = String(name || '').trim().toLowerCase();
  if (!norm) return null;
  return listDepartments().find(d => d.name.trim().toLowerCase() === norm) || null;
}
