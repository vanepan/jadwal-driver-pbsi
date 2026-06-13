'use strict';

/* ============================================================
   Cloud Functions entry point — Sarpras Operations backend.

   v1.11.1.2 Identity Foundation.
   Exports:
     • health     — deployment smoke test (active, side-effect free)
     • verifyPin  — ACTIVE custom-auth entry: server-side PIN check
                    + custom token { uid, role } (wired into login)

   No production features, no triggers, no scheduled jobs yet.
   Notification engine, event triggers, server-side Telegram, and
   reminders are added in later sub-phases under src/.
   ============================================================ */

const { health } = require('./src/health');
const { verifyPin } = require('./src/auth/verifyPin');

exports.health = health;
exports.verifyPin = verifyPin;
