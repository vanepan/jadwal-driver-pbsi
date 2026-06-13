'use strict';

/* ============================================================
   Cloud Functions entry point — Sarpras Operations backend.

   v1.11.1.3 Server Telegram + Event Foundation.

   Exports:
     • health        — deployment smoke test (active, side-effect free)
     • verifyPin      — ACTIVE custom-auth entry (login)

     ── Event Foundation (shadow) ──
     • publishEvent       — callable: client → /events (comment.added)
     • onAssignmentWrite  — /assignments trigger → assignment.* events
     • onRequestWrite     — /driver_requests trigger → request.* events
     • onEventWrite       — VALIDATION-ONLY subscriber (no fan-out)

     ── Server Telegram Foundation (dormant/shadow) ──
     • telegramProxy  — HTTP { chatId, message } ingress, Secret Manager
                        token, retry + delivery tracking. NOT wired to the
                        client (browser Telegram remains primary).

   No production cutover. /logs is untouched. Browser Telegram is the
   live notification path. Engine fan-out, push, and reminders are later
   releases (v1.11.2 / .3 / .4 / .5).
   ============================================================ */

const { health } = require('./src/health');
const { verifyPin } = require('./src/auth/verifyPin');

const { publishEvent } = require('./src/events/publishEvent');
const { onAssignmentWrite } = require('./src/events/onAssignmentWrite');
const { onRequestWrite } = require('./src/events/onRequestWrite');
const { onEventWrite } = require('./src/events/onEventWrite');

const { telegramProxy } = require('./src/telegram/proxyEndpoint');
const { telegramWebhook } = require('./src/telegram/webhookEndpoint');

const { registerPushSubscription, unregisterPushSubscription } = require('./src/push/callables');

exports.health = health;
exports.verifyPin = verifyPin;

exports.publishEvent = publishEvent;
exports.onAssignmentWrite = onAssignmentWrite;
exports.onRequestWrite = onRequestWrite;
exports.onEventWrite = onEventWrite;

exports.telegramProxy = telegramProxy;

/* Telegram inbound webhook (/start, /myid). Set Telegram's setWebhook to
   this function's URL with secret_token = TELEGRAM_WEBHOOK_SECRET. This is
   the endpoint Telegram POSTs updates to — NOT telegramProxy (outbound). */
exports.telegramWebhook = telegramWebhook;

/* Push Subscription Registry (v1.11.3) — server-only write path into
   /push_subscriptions. Subscription send lives inside onEventWrite via
   the dispatcher; these only register/unregister devices. */
exports.registerPushSubscription = registerPushSubscription;
exports.unregisterPushSubscription = unregisterPushSubscription;
