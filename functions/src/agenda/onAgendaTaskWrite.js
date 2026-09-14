'use strict';

/* ============================================================
   agenda/onAgendaTaskWrite.js — server-authoritative audit + creation/
   lifecycle events for /agendaTasks (V1.31 Agenda & To-Do, Phase C2)

   Structurally identical to onAgendaEventWrite.js — see that file's
   header for the full design rationale (shared diffToAuditActions,
   actor-attribution trust boundary, event.time-based idempotency). The
   only differences: entity kind ('agendaTask'), audit entityId field
   ('taskId'), and the member field diffToAuditActions itself already
   auto-detects ('responsible' -> responsible_added/removed instead of
   participant_added/removed — no branching needed here).
   ============================================================ */

const { onValueWritten } = require('firebase-functions/v2/database');
const logger = require('firebase-functions/logger');
const { REGION, DB_INSTANCE } = require('../config/constants');
const { db } = require('../config/admin');
const { buildEnvelope, writeEventWithId, EVENT_TYPE_SET, keySafe } = require('../events/schema');
const { diffToAuditActions } = require('./auditActions');

function buildTaskPayload(after, before) {
  return {
    title: after ? after.title : before && before.title,
    responsible: after ? after.responsible : before && before.responsible,
    scope: after ? after.scope : before && before.scope,
    priority: after ? after.priority : before && before.priority,
    createdBy: after ? after.createdBy : before && before.createdBy,
    dueAt: after ? after.dueAt : null,
  };
}

const onAgendaTaskWrite = onValueWritten(
  { ref: '/agendaTasks/{taskId}', region: REGION, instance: DB_INSTANCE },
  async (event) => {
    const before = event.data.before.val();
    const after = event.data.after.val();
    const taskId = event.params.taskId;
    const actorUsername = (after || before || {}).updatedBy || null;
    let actorLabel = actorUsername;
    if (actorUsername) {
      try {
        const snap = await db.ref(`userProfiles/${actorUsername}/displayName`).once('value');
        actorLabel = snap.val() || actorUsername;
      } catch {
        actorLabel = actorUsername;
      }
    }

    const actions = diffToAuditActions(before, after);
    if (actions.length === 0) return;

    for (const a of actions) {
      const auditId = keySafe(`${taskId}__${event.time}__${a.action}${a.affectedUsername ? '__' + a.affectedUsername : ''}`);
      try {
        await db.ref(`agendaAudit/${auditId}`).set({
          id: auditId,
          action: a.action,
          note: a.note || null,
          affectedUsername: a.affectedUsername || null,
          actorUsername,
          actorLabel,
          entityType: 'agendaTask',
          entityId: taskId,
          entityScope: after ? after.scope : before.scope,
          // See onAgendaEventWrite.js's identical line for why this converts
          // rather than storing event.time (an ISO string) raw.
          timestamp: event.time ? new Date(event.time).getTime() : Date.now(),
        });
      } catch (err) {
        logger.error('[onAgendaTaskWrite] audit write failed', { taskId, action: a.action, error: err.message });
      }

      const type = `task.${a.action}`;
      if (!EVENT_TYPE_SET.has(type)) continue;

      const payload = { ...buildTaskPayload(after, before), affectedUsername: a.affectedUsername || null };
      const envelope = buildEnvelope({
        type,
        actor: { uid: actorUsername, role: null, displayName: actorLabel },
        entity: { kind: 'agendaTask', id: taskId },
        payload,
        timestamp: event.time || new Date().toISOString(),
      });

      try {
        if (a.action === 'created') {
          await writeEventWithId(`task_created__${taskId}`, envelope);
        } else {
          const evtId = keySafe(`task_${a.action}__${taskId}__${event.time}${a.affectedUsername ? '__' + a.affectedUsername : ''}`);
          await writeEventWithId(evtId, envelope);
        }
      } catch (err) {
        logger.error('[onAgendaTaskWrite] event mint failed', { taskId, type, error: err.message });
      }
    }
  }
);

module.exports = { onAgendaTaskWrite, buildTaskPayload };
