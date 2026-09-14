'use strict';

/* ============================================================
   users/profile-fields.js — the userProfiles mirror transformation
   (V1.31 C5.2 Production Data Remediation)

   PURE, dependency-free. Extracted out of onUserWrite.js (which still owns
   the trigger effect — reading event data, writing/removing the RTDB node)
   so this exact transformation can be imported by a plain Node script (the
   one-off backfill for accounts whose /userProfiles mirror never got
   created — see scripts/userprofiles-mirror-backfill.mjs) without dragging
   in onUserWrite.js's require('../config/admin'), which eagerly calls
   admin.database() and throws outside the Functions runtime.

   Never touches pin/pinHash/notificationsEnabled/telegramChatIds/
   createdAt/updatedAt — only the fields listed in PROFILE_FIELDS.
   ============================================================ */

const PROFILE_FIELDS = ['displayName', 'role', 'active', 'archived', 'archivedAt', 'agendaParticipantType'];

function extractProfile(username, record) {
  const profile = { username };
  for (const field of PROFILE_FIELDS) {
    if (record[field] !== undefined) profile[field] = record[field];
  }
  return profile;
}

module.exports = { PROFILE_FIELDS, extractProfile };
