/* ============================================================
   agenda-directory.js — candidate people for the participant/PIC/
   responsible picker (V1.31 Agenda & To-Do, Phase C3)

   Candidates are Sarpras staff (userProfiles.agendaParticipantType ===
   'sarpras_staff' — V1.31 C5.2; NOT role==='admin', which production
   showed is shared by real staff, an invited Kabid, and a system account)
   and Kabid, which can come from EITHER agendaParticipantType==='kabid'
   OR any non-archived Custom Role whose permissions include
   agenda.kabid.view/agenda.kabid.manage — the same buckets functions/src/
   agenda/scopeClassifier.js applies server-side, re-derived here client-
   side because the picker needs a NAMED LIST to render, not just a
   boolean check. Reads /userProfiles (broadly readable, .read: auth !=
   null — never /users, which is narrowly admin/self-scoped and would
   need a permission this feature has no reason to require) and
   /customRoles (admin/developer-readable — confirmed in
   database.rules.json; a non-admin session simply gets an empty
   Custom-Role-derived Kabid set, which is correct: a non-admin can't
   invite Kabid to anything they can't manage).

   Does NOT decide who may be INVITED to a given event's scope (that's
   still the Rules' job on write) — this only decides who to SHOW in the
   picker, a presentation concern.
   ============================================================ */

'use strict';

import { subscribeNode } from '../firebase.js';

let _initialized = false;
let _profiles = {};       // username -> {username, displayName, role, active, archived, agendaParticipantType?}
let _kabidRoleIds = new Set();
const _listeners = new Set();

function notify() { _listeners.forEach((cb) => { try { cb(); } catch (err) { console.error('[agenda-directory] listener failed', err); } }); }

export function registerDirectoryChangeListener(cb) { _listeners.add(cb); }
export function unregisterDirectoryChangeListener(cb) { _listeners.delete(cb); }

export function initAgendaDirectory() {
  if (_initialized) return;
  _initialized = true;
  subscribeNode('userProfiles', (snap) => { _profiles = snap.val() || {}; notify(); }, { onDenied: () => {}, onError: () => {} });
  subscribeNode('customRoles', (snap) => {
    const raw = snap.val() || {};
    const ids = new Set();
    for (const [roleId, record] of Object.entries(raw)) {
      if (!record || record.archived === true) continue;
      const perms = Array.isArray(record.permissions) ? record.permissions : [];
      if (perms.includes('agenda.kabid.view') || perms.includes('agenda.kabid.manage')) ids.add(roleId);
    }
    _kabidRoleIds = ids;
    notify();
  }, { onDenied: () => {}, onError: () => {} });
}

/**
 * Candidate scope is decided by the explicit, authoritative
 * `agendaParticipantType` field (V1.31 C5.2) — NOT by Firebase `role`.
 * `role==='admin'` is a Firebase-authorization concept and, in production,
 * is shared by real Sarpras staff, an invited external Kabid, and a
 * system/administrative account — it was never a safe proxy for "who to
 * show in the Agenda picker." `agendaParticipantType` is presentation/
 * eligibility metadata only (mirrored from /users the same way any other
 * userProfiles field is — see functions/src/users/profile-fields.js) and
 * carries zero permission meaning: it is never read by agenda-permissions.js,
 * database.rules.json, or verifyPin.js's claim derivation.
 *
 *   'sarpras_staff' -> shown under SARPRAS, a normal PIC/participant candidate
 *   'kabid'         -> shown under KABID / UNDANGAN (an explicitly classified
 *                      admin-role account, e.g. a department head invited
 *                      into Sarpras's Agenda — distinct from the OTHER,
 *                      already-approved Kabid path below)
 *   'system'        -> excluded entirely (a shared/administrative login,
 *                      never an operational human participant)
 *   missing/anything else -> excluded (unclassified is not assumed to be
 *                      staff — prevents a future admin account from being
 *                      silently exposed as a PIC before someone classifies it)
 *
 * A user can ALSO land in 'kabid' via the original, still-supported C5
 * mechanism — a non-archived Custom Role whose permissions include
 * agenda.kabid.view/manage (_kabidRoleIds, populated from /customRoles).
 * The two signals are independent and OR'd: agendaParticipantType classifies
 * an existing System-Role (typically admin) account for Agenda purposes
 * without touching its role; the Custom Role path is how a genuinely
 * separate, permission-bearing Kabid identity gets provisioned. Neither
 * widens the other.
 * @returns {Array<{username: string, displayName: string, scope: 'sarpras_shared'|'kabid'}>}
 */
export function getAgendaCandidates() {
  const out = [];
  for (const [username, p] of Object.entries(_profiles)) {
    if (!p || p.active === false || p.archived === true) continue;
    if (p.agendaParticipantType === 'sarpras_staff') out.push({ username, displayName: p.displayName || username, scope: 'sarpras_shared' });
    else if (p.agendaParticipantType === 'kabid' || _kabidRoleIds.has(p.role)) out.push({ username, displayName: p.displayName || username, scope: 'kabid' });
    // 'system', any other value, or missing -> not an Agenda candidate at all
  }
  return out.sort((a, b) => a.displayName.localeCompare(b.displayName, 'id'));
}

/** Resolve one username's display name, falling back to the raw username
 *  — used everywhere a stored username needs to render as a human label. */
export function displayNameFor(username) {
  const p = _profiles[username];
  return (p && p.displayName) || username;
}

/**
 * Classifies a username using this file's own two-bucket candidate model
 * (see getAgendaCandidates() above) — 'sarpras' (agendaParticipantType ===
 * 'sarpras_staff'), 'kabid' (agendaParticipantType === 'kabid', or a
 * non-archived Custom Role whose permissions include
 * agenda.kabid.view/agenda.kabid.manage), or 'unknown' (no matching
 * /userProfiles entry, inactive/archived, or unclassified — e.g.
 * driver/bidang/viewer, or an admin-role account nobody has classified
 * yet). Phase C4's PDF identity
 * transform (agenda-pdf-view-model.js) uses this to decide who collapses
 * into an organizational label vs who is shown individually — 'unknown'
 * is treated by that caller as "show individually" (the safe default:
 * this function only ever asserts 'sarpras' when it is genuinely
 * confident, it never silently hides a real name behind an org label it
 * didn't actually classify).
 * @param {string} username
 * @returns {'sarpras'|'kabid'|'unknown'}
 */
export function resolveParticipantClass(username) {
  const p = _profiles[username];
  if (!p || p.active === false || p.archived === true) return 'unknown';
  if (p.agendaParticipantType === 'sarpras_staff') return 'sarpras';
  if (p.agendaParticipantType === 'kabid' || _kabidRoleIds.has(p.role)) return 'kabid';
  return 'unknown';
}

/**
 * TEST-ONLY. Directly seeds the candidate directory, bypassing the
 * Firebase subscription entirely — used by scripts/agenda-*-check.mjs so
 * picker interactions (select/mark-PIC/remove) can be verified in a
 * browser harness with no live Firebase/emulator connection. Never
 * called from any production code path (no import of this function
 * exists outside scripts/).
 */
export function __setDirectoryForTest(profiles, kabidRoleIds = []) {
  _profiles = profiles || {};
  _kabidRoleIds = new Set(kabidRoleIds);
  _initialized = true;
  notify();
}
