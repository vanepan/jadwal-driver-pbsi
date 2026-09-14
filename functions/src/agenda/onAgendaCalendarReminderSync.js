'use strict';

/* ============================================================
   agenda/onAgendaCalendarReminderSync.js — timer-queue maintenance for
   /agendaCalendars (V1.31.1 "Agenda, Kalender & To-Do")

   A THIRD trigger on /agendaCalendars/{calendarId} (alongside
   onAgendaCalendarWrite and onAgendaCalendarIndexSync) — same "N triggers
   on one node, each with a single job" pattern onAgendaEventReminderSync.js
   already established. Maintains the SAME /reminders timer queue via the
   'ended' offset (functions/src/reminders/schedule.js's AGENDA_OFFSETS,
   V1.31.1 extension) — planForCalendarItem() OMITS 'h1' entirely for an
   all-day item (no arbitrary midnight reminder), a decision made once in
   reminderPlan.js, not duplicated here.

   Both 'cancelled' AND 'deleted' tombstone pending rows — see
   onAgendaEventReminderSync.js's identical V1.31.1 addition for the same
   reasoning (a deleted item is not one anyone should still be reminded
   about). Rescheduling (startDate/endDate/allDay change) re-syncs a fresh
   plan via the same "only 'fired' survives a re-sync" rule.
   ============================================================ */

const { onValueWritten } = require('firebase-functions/v2/database');
const logger = require('firebase-functions/logger');
const { REGION, DB_INSTANCE } = require('../config/constants');
const { syncAgendaOffsets, tombstoneAgendaOffsets } = require('../reminders/schedule');
const { planForCalendarItem } = require('./reminderPlan');

const ENTITY_TYPE = 'agendaCalendar';

const onAgendaCalendarReminderSync = onValueWritten(
  { ref: '/agendaCalendars/{calendarId}', region: REGION, instance: DB_INSTANCE },
  async (event) => {
    const before = event.data.before.val();
    const after = event.data.after.val();
    const calendarId = event.params.calendarId;

    try {
      if (!before && after) {
        const plan = planForCalendarItem(after);
        if (plan) await syncAgendaOffsets(ENTITY_TYPE, calendarId, plan);
        return;
      }
      if (!after) return; // Rules forbid hard delete — defensive only

      if (after.status === 'cancelled' || after.status === 'deleted') {
        await tombstoneAgendaOffsets(ENTITY_TYPE, calendarId);
        return;
      }

      const scheduleChanged = !before
        || before.startAt !== after.startAt
        || before.endAt !== after.endAt
        || before.allDay !== after.allDay
        || before.status === 'cancelled'
        || before.status === 'deleted';
      if (scheduleChanged) {
        const plan = planForCalendarItem(after);
        if (plan) await syncAgendaOffsets(ENTITY_TYPE, calendarId, plan);
      }
    } catch (err) {
      logger.error('[onAgendaCalendarReminderSync] failed', { calendarId, error: err.message });
    }
  }
);

module.exports = { onAgendaCalendarReminderSync };
