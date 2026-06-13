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

     • PUSH_VAPID_PUBLIC_KEY / PUSH_VAPID_PRIVATE_KEY — Web Push (VAPID)
       application-server keypair (v1.11.3). Generate ONCE, offline:
         npx web-push generate-vapid-keys
       Then set BOTH before deploying v1.11.3:
         firebase functions:secrets:set PUSH_VAPID_PUBLIC_KEY
         firebase functions:secrets:set PUSH_VAPID_PRIVATE_KEY
       The PUBLIC key is also placed (unencrypted — it is an identity,
       not a secret) in js/config.js#VAPID_PUBLIC_KEY so the browser can
       call pushManager.subscribe(). The PRIVATE key NEVER leaves the
       server. The contact subject is the non-secret constant
       config/constants.js#PUSH_VAPID_SUBJECT.

   Until then, Telegram continues to send from the browser using the
   token at /settings/telegram/botToken — unchanged in this release.
   ============================================================ */

const { defineSecret } = require('firebase-functions/params');

/** Telegram bot token — bound to a function only in v1.11.1.3. */
const TELEGRAM_BOT_TOKEN = defineSecret('TELEGRAM_BOT_TOKEN');

/** Web Push VAPID keypair — bound to onEventWrite in v1.11.3 (push send). */
const PUSH_VAPID_PUBLIC_KEY = defineSecret('PUSH_VAPID_PUBLIC_KEY');
const PUSH_VAPID_PRIVATE_KEY = defineSecret('PUSH_VAPID_PRIVATE_KEY');

module.exports = { TELEGRAM_BOT_TOKEN, PUSH_VAPID_PUBLIC_KEY, PUSH_VAPID_PRIVATE_KEY };
