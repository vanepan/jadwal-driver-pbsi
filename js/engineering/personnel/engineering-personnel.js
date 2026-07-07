/* ============================================================
   ENGINEERING-PERSONNEL.JS — Engineering personnel resolver (v1.20.6)

   The SINGLE bridge between Engineering (assignments + work reports) and User
   Management. Engineering personnel are NOT a separate registry — they ARE the
   platform users whose role is an Engineering role. This module reads the live
   users cache (js/users.js) and exposes:

     • listEngineeringPersonnel() — the selectable roster (active Engineering
       users, Coordinator-first) for the personnel picker.
     • resolveAssignedUsers(uids) — resolve stored uid REFERENCES back to display
       identities at RENDER time (names/roles always come from User Management,
       never denormalized into the assignment/report record).

   Role labels always route through the shared roleLabel() formatter (Objective
   5) — no raw role ids leak. PURE reads + lookups; no DOM, no Firebase, no writes.
   ============================================================ */

'use strict';

import { ENGINEERING_ROLE, roleLabel, isEngineeringRole } from '../../config/role-registry.js';

/* Users source injection (v1.20.6). This module does NOT statically import
   js/users.js — that module pulls in js/firebase.js (browser-only CDN imports),
   which would break Node analytics/UI harnesses. Instead app.js injects the live
   getUserList at startup; unset, it resolves to an empty roster (pure + safe). */
let _usersSource = () => [];

/** Wire the live User Management source (app.js calls this once at startup). */
export function setEngineeringUsersSource(fn) {
  if (typeof fn === 'function') _usersSource = fn;
}

/** The current users list (from the injected source; [] until wired). */
function getUserList() {
  try { return _usersSource() || []; } catch (_) { return []; }
}

/** Coordinator sorts before Member; anything else after. */
const ROLE_ORDER = {
  [ENGINEERING_ROLE.COORDINATOR]: 0,
  [ENGINEERING_ROLE.MEMBER]: 1,
};

/** Two-letter initials for an avatar chip. */
export function personnelInitials(name) {
  return String(name || '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => (w[0] || '').toUpperCase())
    .join('') || '?';
}

/** The stable uid for a user record (username is the RTDB key / uid). */
function userUid(u) {
  return u.id || u.username || '';
}

/** Shape a raw user record into a personnel entry (labels via roleLabel). */
function toPersonnel(u) {
  const name = u.displayName || u.username || userUid(u);
  return {
    uid: userUid(u),
    name,
    role: u.role || null,
    roleLabel: u.role ? roleLabel(u.role) : 'Guest',
    initials: personnelInitials(name),
    active: u.active !== false && u.archived !== true,
  };
}

/**
 * The selectable Engineering roster: active, non-archived users whose role is an
 * Engineering role, ordered Coordinator → Member → (name). Empty when the users
 * cache has not loaded yet.
 * @returns {Array<{uid:string,name:string,role:string,roleLabel:string,initials:string,active:boolean}>}
 */
export function listEngineeringPersonnel() {
  return (getUserList() || [])
    .filter((u) => u && isEngineeringRole(u.role) && u.active !== false && u.archived !== true)
    .map(toPersonnel)
    .sort((a, b) => {
      const ra = ROLE_ORDER[a.role] ?? 99;
      const rb = ROLE_ORDER[b.role] ?? 99;
      return ra - rb || a.name.localeCompare(b.name);
    });
}

/**
 * Resolve stored assignedUsers uid references to display identities. Resolves
 * against the FULL user list (not just active Engineering users) so a technician
 * whose role/active-state later changed still renders a name. Unknown uids fall
 * back to the raw uid so nothing renders blank.
 * @param {string[]} uids
 * @returns {Array<{uid:string,name:string,role:?string,roleLabel:string,initials:string,active:boolean}>}
 */
export function resolveAssignedUsers(uids = []) {
  const list = getUserList() || [];
  const byUid = new Map(list.map((u) => [userUid(u), u]));
  return uids.map((uid) => {
    const u = byUid.get(uid);
    return u ? toPersonnel(u)
      : { uid, name: uid, role: null, roleLabel: 'Guest', initials: personnelInitials(uid), active: false };
  });
}

/** Display name for a single uid (resolved from User Management). */
export function personnelName(uid) {
  const [entry] = resolveAssignedUsers([uid]);
  return entry ? entry.name : uid;
}
