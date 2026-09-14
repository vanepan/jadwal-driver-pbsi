'use strict';

/* ============================================================
   agenda/onAgendaCalendarWrite.js — server-authoritative audit +
   creation/lifecycle events for /agendaCalendars
   (V1.31.1 "Agenda, Kalender & To-Do")

   Structurally identical to onAgendaEventWrite.js — see that file's header
   for the full design rationale (shared diffToAuditActions, actor-
   attribution trust boundary via database.rules.json's agendaCalendars
   .write rule, event.time-based idempotency). The only differences: entity
   kind ('agendaCalendar'), audit entityId field ('calendarId'), event-type
   prefix ('calendar.*' instead of 'agenda.*'), and the payload carries the
   date-RANGE fields (startDate/endDate/allDay) instead of a single date.

   'deleted' ("Dihapus") status transitions ARE diffed (diffToAuditActions
   -> action 'deleted') and always get an /agendaAudit row, but 'calendar.
   deleted' is deliberately NOT in EVENT_TYPE_SET — no notification is
   minted for a deletion, matching the same choice already made for
   agendaEvent/agendaTask (audit-only, by construction, same as
   'acknowledged'/generic 'status_changed').
   ============================================================ */

const { onValueWritten } = require('firebase-functions/v2/database');
const logger = require('firebase-functions/logger');
const { REGION, DB_INSTANCE } = require('../config/constants');
const { db } = require('../config/admin');
const { buildEnvelope, writeEventWithId, EVENT_TYPE_SET, keySafe } = require('../events/schema');
const { diffToAuditActions } = require('./auditActions');

function buildCalendarPayload(after, before) {
  return {
    title: after ? after.title : before && before.title,
    organizerUsername: after ? after.organizerUsername : before && before.organizerUsername,
    participants: after ? after.participants : before && before.participants,
    scope: after ? after.scope : before && before.scope,
    startDate: after ? after.startDate : before && before.startDate,
    endDate: after ? after.endDate : before && before.endDate,
    allDay: after ? after.allDay : before && before.allDay,
    startAt: after ? after.startAt : null,
  };
}

const onAgendaCalendarWrite = onValueWritten(
  { ref: '/agendaCalendars/{calendarId}', region: REGION, instance: DB_INSTANCE },
  async (event) => {
    const before = event.data.before.val();
    const after = event.data.after.val();
    const calendarId = event.params.calendarId;
    const actorUsername = (after || before || {}).updatedBy || null;
    let actorLabel = actorUsername;
    if (actorUsername) {
      try {
        const snap = await db.ref(`userProfiles/${actorUsername}/displayName`).once('value');
        actorLabel = snap.val() || actorUsername;
      } catch {
        actorLabel = actorUsername; // never blocks the audit write on a profile-read failure
      }
    }

    const actions = diffToAuditActions(before, after);
    if (actions.length === 0) return;

    for (const a of actions) {
      const auditId = keySafe(`${calendarId}__${event.time}__${a.action}${a.affectedUsername ? '__' + a.affectedUsername : ''}`);
      try {
        await db.ref(`agendaAudit/${auditId}`).set({
          id: auditId,
          action: a.action,
          note: a.note || null,
          affectedUsername: a.affectedUsername || null,
          actorUsername,
          actorLabel,
          entityType: 'agendaCalendar',
          entityId: calendarId,
          entityScope: after ? after.scope : before.scope,
          timestamp: event.time ? new Date(event.time).getTime() : Date.now(),
        });
      } catch (err) {
        logger.error('[onAgendaCalendarWrite] audit write failed', { calendarId, action: a.action, error: err.message });
      }

      const type = `calendar.${a.action}`;
      if (!EVENT_TYPE_SET.has(type)) continue; // audit-only action (e.g. 'deleted', generic 'status_changed')

      const payload = { ...buildCalendarPayload(after, before), affectedUsername: a.affectedUsername || null };
      const envelope = buildEnvelope({
        type,
        actor: { uid: actorUsername, role: null, displayName: actorLabel },
        entity: { kind: 'agendaCalendar', id: calendarId },
        payload,
        timestamp: event.time || new Date().toISOString(),
      });

      try {
        if (a.action === 'created') {
          await writeEventWithId(`calendar_created__${calendarId}`, envelope);
        } else {
          const evtId = keySafe(`calendar_${a.action}__${calendarId}__${event.time}${a.affectedUsername ? '__' + a.affectedUsername : ''}`);
          await writeEventWithId(evtId, envelope);
        }
      } catch (err) {
        logger.error('[onAgendaCalendarWrite] event mint failed', { calendarId, type, error: err.message });
      }
    }
  }
);

module.exports = { onAgendaCalendarWrite, buildCalendarPayload };
