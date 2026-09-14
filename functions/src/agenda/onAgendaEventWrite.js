'use strict';

/* ============================================================
   agenda/onAgendaEventWrite.js — server-authoritative audit + creation/
   lifecycle events for /agendaEvents (V1.31 Agenda & To-Do, Phase C2)

   Fires on every write to /agendaEvents/{eventId}. Two jobs, sharing ONE
   before/after diff (diffToAuditActions) so they can never disagree about
   what happened:

     1. Write one /agendaAudit row per detected action (ALWAYS — audit is
        the complete history, independent of whether anything is
        notifiable).
     2. Mint a canonical /events envelope for whichever of those actions
        has a registered, notifiable EVENT_TYPE ('created', 'cancelled',
        'participant_added', 'participant_removed', a non-degenerate
        'updated') — rides the EXISTING /events -> onEventWrite -> engine
        pipeline. 'acknowledged' and a bare 'status_changed' have no
        registered type (nothing else asked for them to be notifiable) and
        so are audit-only, by construction — no special-casing needed here.

   ACTOR ATTRIBUTION (Phase B.1 §4, unchanged): after.updatedBy is
   trustworthy because database.rules.json's agendaEvents.write rule
   already refuses any write where it doesn't equal the real auth.uid on
   EVERY branch — this trigger only ever READS that field, it does not
   (and structurally cannot) fabricate a trigger-side auth context. RTDB
   v2 onValueWritten events carry no caller identity of their own
   (confirmed against every existing trigger in this codebase before this
   was written — see docs/AGENDA_TODO_PHASE_B1_SECURITY_CORRECTION_v1.31.0.0.md
   §4.1).

   IDEMPOTENCY: audit row ids and non-creation /events ids are keyed on
   `event.time` (the RTDB write's OWN platform-supplied timestamp, stable
   across a retried delivery of the SAME write — NOT a fresh Date.now()/
   new Date() call inside this handler, which would differ between the
   original attempt and a retry). The creation event id needs no
   timestamp at all: exactly one creation can ever happen per entity, so
   `agenda_created__${eventId}` is deterministic by construction, mirroring
   reminders/schedule.js's reminderId()'s per-(entity,offset) philosophy.
   ============================================================ */

const { onValueWritten } = require('firebase-functions/v2/database');
const logger = require('firebase-functions/logger');
const { REGION, DB_INSTANCE } = require('../config/constants');
const { db } = require('../config/admin');
const { buildEnvelope, writeEventWithId, EVENT_TYPE_SET, keySafe } = require('../events/schema');
const { diffToAuditActions } = require('./auditActions');

function buildEventPayload(after, before) {
  return {
    title: after ? after.title : before && before.title,
    organizerUsername: after ? after.organizerUsername : before && before.organizerUsername,
    participants: after ? after.participants : before && before.participants,
    scope: after ? after.scope : before && before.scope,
    startAt: after ? after.startAt : null,
  };
}

const onAgendaEventWrite = onValueWritten(
  { ref: '/agendaEvents/{eventId}', region: REGION, instance: DB_INSTANCE },
  async (event) => {
    const before = event.data.before.val();
    const after = event.data.after.val();
    const eventId = event.params.eventId;
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
      const auditId = keySafe(`${eventId}__${event.time}__${a.action}${a.affectedUsername ? '__' + a.affectedUsername : ''}`);
      try {
        await db.ref(`agendaAudit/${auditId}`).set({
          id: auditId,
          action: a.action,
          note: a.note || null,
          affectedUsername: a.affectedUsername || null,
          actorUsername,
          actorLabel,
          entityType: 'agendaEvent',
          entityId: eventId,
          entityScope: after ? after.scope : before.scope,
          // event.time is ALWAYS a truthy ISO string in practice (both the real
          // Cloud Functions runtime and this suite's fixtures always set it) —
          // the schema (Phase B/B.1) documents `timestamp` as epoch-ms, so this
          // must convert, not store the ISO string raw (a real bug caught by
          // functions/scripts/phase-c-emulator/agenda-triggers-check.js's [2c]
          // check during this phase's own emulator run).
          timestamp: event.time ? new Date(event.time).getTime() : Date.now(),
        });
      } catch (err) {
        logger.error('[onAgendaEventWrite] audit write failed', { eventId, action: a.action, error: err.message });
      }

      const type = `agenda.${a.action}`;
      if (!EVENT_TYPE_SET.has(type)) continue; // audit-only action (e.g. 'acknowledged', generic 'status_changed')

      const payload = { ...buildEventPayload(after, before), affectedUsername: a.affectedUsername || null };
      const envelope = buildEnvelope({
        type,
        actor: { uid: actorUsername, role: null, displayName: actorLabel },
        entity: { kind: 'agendaEvent', id: eventId },
        payload,
        timestamp: event.time || new Date().toISOString(),
      });

      try {
        if (a.action === 'created') {
          await writeEventWithId(`agenda_created__${eventId}`, envelope);
        } else {
          const evtId = keySafe(`agenda_${a.action}__${eventId}__${event.time}${a.affectedUsername ? '__' + a.affectedUsername : ''}`);
          await writeEventWithId(evtId, envelope);
        }
      } catch (err) {
        logger.error('[onAgendaEventWrite] event mint failed', { eventId, type, error: err.message });
      }
    }
  }
);

module.exports = { onAgendaEventWrite, buildEventPayload };
