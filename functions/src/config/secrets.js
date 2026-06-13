'use strict';

/* ============================================================
   Secret Manager foundation.

   Declares the secrets the backend will consume in later phases.
   IMPORTANT: this module is intentionally NOT imported by index.js,
   so no deployed function binds these secrets yet. Declaring a
   secret here has no runtime effect until a function references it
   via `onRequest({ secrets: [TELEGRAM_BOT_TOKEN] }, ...)`.

   Expected secrets (set before the phase that uses them):
     • TELEGRAM_BOT_TOKEN  — used in v1.11.1.3 when Telegram send
       moves server-side. Set with:
         firebase functions:secrets:set TELEGRAM_BOT_TOKEN
       (or: gcloud secrets create TELEGRAM_BOT_TOKEN --data-file=-)

   Until then, Telegram continues to send from the browser using the
   token at /settings/telegram/botToken — unchanged in this release.
   ============================================================ */

const { defineSecret } = require('firebase-functions/params');

/** Telegram bot token — bound to a function only in v1.11.1.3. */
const TELEGRAM_BOT_TOKEN = defineSecret('TELEGRAM_BOT_TOKEN');

module.exports = { TELEGRAM_BOT_TOKEN };
