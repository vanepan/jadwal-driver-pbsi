'use strict';

/* ============================================================
   agenda/scopeClassifier.js — username -> Agenda scope resolution
   (V1.31 Agenda & To-Do, Phase C2)

   Used by onAgendaEventIndexSync.js/onAgendaTaskIndexSync.js to decide
   which agendaEventsByScope/agendaTasksByScope buckets a record's
   organizer/participants belong to — the SAME two-step resolution
   verifyPin.js#resolveRoleClaims() already does at token-mint time
   (System role fast path vs. Custom Role permissions lookup), re-
   implemented here server-side via the Admin SDK (which bypasses Rules,
   so this read is always available to a trigger) because a trigger has
   no access to any user's live auth token — only the RTDB user record.

   Reads /userProfiles (the broadly-readable role mirror — NOT /users,
   which is narrowly scoped and would need an extra permission check the
   Admin SDK doesn't need) and, for a non-'admin' role, /customRoles.
   ============================================================ */

const { db } = require('../config/admin');

/** Pure: given a resolved role id (already known non-'admin') and the
 *  Custom Role record it names (or null/archived), decide the scope.
 *  Separated from the DB read for unit-testability. */
function classifyCustomRole(customRole) {
  if (!customRole || customRole.archived === true) return null;
  const permissions = Array.isArray(customRole.permissions) ? customRole.permissions : [];
  if (permissions.includes('agenda.kabid.view') || permissions.includes('agenda.kabid.manage')) {
    return 'kabid';
  }
  return null;
}

/**
 * Resolve one username to an Agenda scope, or null if they belong to
 * neither (e.g. driver/bidang/viewer, or an unrecognized/archived Custom
 * Role) — a null result is not an error; plenty of legitimate Agenda
 * participants (external guests, a driver invited to one meeting) are
 * not part of either bucket and simply get no scope-index entry.
 * @param {string} username
 * @returns {Promise<'sarpras_shared'|'kabid'|null>}
 */
async function resolveUserScope(username) {
  if (!username) return null;
  let role = null;
  try {
    const snap = await db.ref(`userProfiles/${username}/role`).once('value');
    role = snap.val();
  } catch {
    return null; // fail-safe: an unreadable profile contributes no scope, never a forced grant
  }
  if (!role) return null;
  if (role === 'admin') return 'sarpras_shared';

  let customRole = null;
  try {
    const snap = await db.ref(`customRoles/${role}`).once('value');
    customRole = snap.val();
  } catch {
    return null;
  }
  return classifyCustomRole(customRole);
}

module.exports = { classifyCustomRole, resolveUserScope };
