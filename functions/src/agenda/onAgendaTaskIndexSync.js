'use strict';

/* ============================================================
   agenda/onAgendaTaskIndexSync.js — derived-index maintenance for
   /agendaTasks (V1.31 Agenda & To-Do, Phase C2)

   Identical shape to onAgendaEventIndexSync.js — see that file's header
   for the full design rationale. Differences only: member field is
   `responsible` (not `participants`), there is no separate organizer
   (createdBy plays that role), and the index value is `dueAt || 0` per
   the approved data model (a task with no due date still gets an index
   entry — 0 sorts first under orderByValue(), which is an acceptable,
   documented convention, not an accident).
   ============================================================ */

const { onValueWritten } = require('firebase-functions/v2/database');
const logger = require('firebase-functions/logger');
const { REGION, DB_INSTANCE } = require('../config/constants');
const { db } = require('../config/admin');
const { resolveUserScope } = require('./scopeClassifier');

async function computeVisible(record) {
  if (!record) return { users: new Set(), scopes: new Set() };
  const users = new Set([record.createdBy, ...Object.keys(record.responsible || {})].filter(Boolean));
  const scopes = new Set([record.scope].filter(Boolean));
  for (const username of users) {
    const scope = await resolveUserScope(username);
    if (scope) scopes.add(scope);
  }
  return { users, scopes };
}

const onAgendaTaskIndexSync = onValueWritten(
  { ref: '/agendaTasks/{taskId}', region: REGION, instance: DB_INSTANCE },
  async (event) => {
    const before = event.data.before.val();
    const after = event.data.after.val();
    const taskId = event.params.taskId;

    try {
      const beforeVisible = await computeVisible(before);
      const afterVisible = await computeVisible(after);

      const updates = {};
      const value = after ? (after.dueAt || 0) : null;

      for (const username of afterVisible.users) {
        updates[`agendaTasksByUser/${username}/${taskId}`] = value;
      }
      for (const username of beforeVisible.users) {
        if (!afterVisible.users.has(username)) updates[`agendaTasksByUser/${username}/${taskId}`] = null;
      }
      for (const scope of afterVisible.scopes) {
        updates[`agendaTasksByScope/${scope}/${taskId}`] = value;
      }
      for (const scope of beforeVisible.scopes) {
        if (!afterVisible.scopes.has(scope)) updates[`agendaTasksByScope/${scope}/${taskId}`] = null;
      }

      if (Object.keys(updates).length > 0) {
        await db.ref().update(updates);
      }
    } catch (err) {
      logger.error('[onAgendaTaskIndexSync] failed', { taskId, error: err.message });
    }
  }
);

module.exports = { onAgendaTaskIndexSync, computeVisible };
