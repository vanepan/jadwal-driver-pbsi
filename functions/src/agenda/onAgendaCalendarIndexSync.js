'use strict';

/* ============================================================
   agenda/onAgendaCalendarIndexSync.js — derived-index maintenance for
   /agendaCalendars (V1.31.1 "Agenda, Kalender & To-Do")

   Identical shape to onAgendaEventIndexSync.js — see that file's header
   for the full design rationale (same organizer+participants -> scope
   union algorithm, same "status changes never touch this index" historical-
   accountability rule). Only difference: the RTDB paths
   (agendaCalendarsByUser/agendaCalendarsByScope) and the index value
   (startAt, same convention as events — Calendar always has a concrete
   startAt even for an all-day item, per the client-side data model).
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

const onAgendaCalendarIndexSync = onValueWritten(
  { ref: '/agendaCalendars/{calendarId}', region: REGION, instance: DB_INSTANCE },
  async (event) => {
    const before = event.data.before.val();
    const after = event.data.after.val();
    const calendarId = event.params.calendarId;

    try {
      const beforeVisible = await computeVisible(before);
      const afterVisible = await computeVisible(after);

      const updates = {};
      const value = after ? (after.startAt ?? null) : null;

      for (const username of afterVisible.users) {
        updates[`agendaCalendarsByUser/${username}/${calendarId}`] = value;
      }
      for (const username of beforeVisible.users) {
        if (!afterVisible.users.has(username)) updates[`agendaCalendarsByUser/${username}/${calendarId}`] = null;
      }
      for (const scope of afterVisible.scopes) {
        updates[`agendaCalendarsByScope/${scope}/${calendarId}`] = value;
      }
      for (const scope of beforeVisible.scopes) {
        if (!afterVisible.scopes.has(scope)) updates[`agendaCalendarsByScope/${scope}/${calendarId}`] = null;
      }

      if (Object.keys(updates).length > 0) {
        await db.ref().update(updates);
      }
    } catch (err) {
      logger.error('[onAgendaCalendarIndexSync] failed', { calendarId, error: err.message });
    }
  }
);

module.exports = { onAgendaCalendarIndexSync, computeVisible };
