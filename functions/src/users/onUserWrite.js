'use strict';

/* ============================================================
   users/onUserWrite.js — userProfiles mirror trigger (v1.30.6.10 —
   RTDB Security Hardening Program, Phase 6)

   Mirrors /users/{username} into a minimal, broadly-readable
   /userProfiles/{username} — exactly the fields listed in
   profile-fields.js#PROFILE_FIELDS (displayName, role, active, archived,
   archivedAt, agendaParticipantType as of V1.31 C5.2) — never credential
   fields (pin/pinHash), never telegramChatIds, never notificationsEnabled,
   never timestamps. The field list is owned by profile-fields.js, not
   duplicated here, specifically so a standalone script can import the
   same extractProfile() this trigger uses (see that file's own header).

   Same "trigger mirrors a rich admin node into a skinny public one"
   pattern already used elsewhere in this backend (onAssignmentWrite,
   onRequestWrite deriving canonical events from a data write) and
   already recommended as the "Future Runtime Architecture" for exactly
   this kind of problem in js/role-management/runtime-role-provider.js's
   own header comment (v1.30.6).

   /users itself keeps every field, including the ones this mirror
   deliberately omits — it becomes narrow (admin/self-only) once
   database.rules.json's /users rule binds for real (Phase 7). This
   trigger's own write target, /userProfiles, is .write: false to every
   client — only this trigger, via the Admin SDK, ever writes it.
   ============================================================ */

const { onValueWritten } = require('firebase-functions/v2/database');
const logger = require('firebase-functions/logger');
const { REGION, DB_INSTANCE } = require('../config/constants');
const { db } = require('../config/admin');
const { extractProfile } = require('./profile-fields');

const onUserWrite = onValueWritten(
  { ref: '/users/{username}', region: REGION, instance: DB_INSTANCE },
  async (event) => {
    const username = event.params.username;
    const after = event.data.after.val();

    try {
      if (!after) {
        await db.ref(`userProfiles/${username}`).remove();
        return;
      }
      await db.ref(`userProfiles/${username}`).set(extractProfile(username, after));
    } catch (err) {
      logger.error('[users/mirror] failed', { username, error: err.message });
    }
  }
);

module.exports = { onUserWrite };
