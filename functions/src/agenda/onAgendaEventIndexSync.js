'use strict';

/* ============================================================
   agenda/onAgendaEventIndexSync.js — derived-index maintenance for
   /agendaEvents (V1.31 Agenda & To-Do, Phase C2)

   A dedicated, SEPARATE trigger from onAgendaEventWrite.js (audit +
   lifecycle events) — mirrors the established "two triggers on one node"
   pattern (onAssignmentWrite vs onAssignmentReminderSync); this trigger's
   job is purely the derived-index fan-out, nothing else.

   Maintains, per docs/AGENDA_TODO_PHASE_B_ARCHITECTURE_VALIDATION_v1.31.0.0.md §3:
     /agendaEventsByUser/{username}/{eventId}          = startAt
     /agendaEventsByScope/{sarpras_shared|kabid}/{eventId} = startAt

   Algorithm: recompute the FULL desired index membership from `after`
   (organizer + participants, each classified to a scope via
   scopeClassifier.js, unioned with the record's own immutable `scope`),
   do the same from `before`, then ADD/REFRESH every entry in the AFTER
   set (a plain .set() naturally also handles "value refreshed after a
   reschedule" — no separate reschedule-detection branch needed) and
   REMOVE every entry that was in BEFORE but is no longer in AFTER, in
   ONE atomic multi-path update(). Status changes (cancel) never touch
   this index at all — per §15's explicit "do not remove historical index
   entries merely because status changed" (historical accountability).
   ============================================================ */

const { onValueWritten } = require('firebase-functions/v2/database');
const logger = require('firebase-functions/logger');
const { REGION, DB_INSTANCE } = require('../config/constants');
const { db } = require('../config/admin');
const { resolveUserScope } = require('./scopeClassifier');

/**
 * @param {Object|null} record
 * @returns {Promise<{users: Set<string>, scopes: Set<string>}>}
 */
async function computeVisible(record) {
  if (!record) return { users: new Set(), scopes: new Set() };
  const users = new Set([record.organizerUsername, ...Object.keys(record.participants || {})].filter(Boolean));
  const scopes = new Set([record.scope].filter(Boolean));
  for (const username of users) {
    const scope = await resolveUserScope(username);
    if (scope) scopes.add(scope);
  }
  return { users, scopes };
}

const onAgendaEventIndexSync = onValueWritten(
  { ref: '/agendaEvents/{eventId}', region: REGION, instance: DB_INSTANCE },
  async (event) => {
    const before = event.data.before.val();
    const after = event.data.after.val();
    const eventId = event.params.eventId;

    try {
      const beforeVisible = await computeVisible(before);
      const afterVisible = await computeVisible(after);

      const updates = {};
      const value = after ? (after.startAt ?? null) : null;

      for (const username of afterVisible.users) {
        updates[`agendaEventsByUser/${username}/${eventId}`] = value;
      }
      for (const username of beforeVisible.users) {
        if (!afterVisible.users.has(username)) updates[`agendaEventsByUser/${username}/${eventId}`] = null;
      }
      for (const scope of afterVisible.scopes) {
        updates[`agendaEventsByScope/${scope}/${eventId}`] = value;
      }
      for (const scope of beforeVisible.scopes) {
        if (!afterVisible.scopes.has(scope)) updates[`agendaEventsByScope/${scope}/${eventId}`] = null;
      }

      if (Object.keys(updates).length > 0) {
        await db.ref().update(updates);
      }
    } catch (err) {
      logger.error('[onAgendaEventIndexSync] failed', { eventId, error: err.message });
    }
  }
);

module.exports = { onAgendaEventIndexSync, computeVisible };
