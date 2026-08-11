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
const { createUserCredential, resetUserCredential, changeMyCredential } = require('./src/auth/credentialCallables');

const { publishEvent } = require('./src/events/publishEvent');
const { onAssignmentWrite } = require('./src/events/onAssignmentWrite');
const { onRequestWrite } = require('./src/events/onRequestWrite');
const { onEngineeringAssignmentWrite } = require('./src/events/onEngineeringAssignmentWrite');
const { onEventWrite } = require('./src/events/onEventWrite');

const { telegramProxy } = require('./src/telegram/proxyEndpoint');
const { telegramWebhook } = require('./src/telegram/webhookEndpoint');

const { registerPushSubscription, unregisterPushSubscription } = require('./src/push/callables');

const { onAssignmentReminderSync } = require('./src/reminders/onAssignmentReminderSync');
const { reminderTick } = require('./src/reminders/tick');

const { exportAnalyticsReport } = require('./src/exports/analytics');

const { backupTick } = require('./src/maintenance/backupTick');
const { acquireReimbursementNumber } = require('./src/reimbursement/counter');

const { onUserWrite } = require('./src/users/onUserWrite');
const { notifyAdminsOfNewRequest } = require('./src/notifications/notifyAdminsOfNewRequest');

exports.health = health;
exports.verifyPin = verifyPin;

/* Credential Service callables (v1.30.6.2, Emergency Credential Security
   Patch) — the only write path into /users/{username}.pin / .pinHash.
   createUserCredential/resetUserCredential are admin-only; changeMyCredential
   is self-service, scoped to the caller's own uid. See
   src/auth/credentialService.js for the shared logic and
   docs/CREDENTIAL_SECURITY_PATCH_v1.30.6.2.md for the full design. */
exports.createUserCredential = createUserCredential;
exports.resetUserCredential = resetUserCredential;
exports.changeMyCredential = changeMyCredential;

exports.publishEvent = publishEvent;
exports.onAssignmentWrite = onAssignmentWrite;
exports.onRequestWrite = onRequestWrite;

/* Engineering Operations (v1.20.4) — /engineering/assignments trigger →
   engineering.* events. Rides the existing /events → onEventWrite → engine
   pipeline (in-app + Web Push). No parallel notification system. */
exports.onEngineeringAssignmentWrite = onEngineeringAssignmentWrite;

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

/* Reminder Engine (v1.11.4) — backend-only, dormant until REMINDER_FLAGS.enabled.
   onAssignmentReminderSync maintains the /reminders timer queue on /assignments
   writes; reminderTick (Cloud Scheduler, every 5 min, Asia/Jakarta) mints
   assignment.reminder events that ride the EXISTING engine→dispatcher pipeline.
   No parallel delivery path. */
exports.onAssignmentReminderSync = onAssignmentReminderSync;
exports.reminderTick = reminderTick;

/* Analytics Export (v1.12.0, Phase A) — server-side PDF render of the
   approved Analytics Export design via headless Chrome (Puppeteer). The
   browser DocumentEngine 'puppeteer' backend calls this; the approved
   HTML/CSS prototype is rendered verbatim so design ≡ output. Phase A
   ships the 'poc' foundation template only. See
   Analytics Export/IMPLEMENTATION_ARCHITECTURE.md §7. */
exports.exportAnalyticsReport = exportAnalyticsReport;

/* RTDB Security Hardening Program, Phase 3 (v1.30.6.6) — moves /backups
   and /reimbursement_counters off client RTDB access entirely, the same
   "Client -> Cloud Function -> Admin SDK -> RTDB, .write: false" pattern
   already used by the Credential Service and push subscriptions.
   backupTick replaces the old client-side, localStorage-guarded
   once-a-day opportunistic backup with a real Cloud Scheduler job.
   acquireReimbursementNumber replaces a client-side runTransaction()
   with a server-side atomic increment. */
exports.backupTick = backupTick;
exports.acquireReimbursementNumber = acquireReimbursementNumber;

/* RTDB Security Hardening Program, Phase 6 (v1.30.6.10) — the /users ->
   /userProfiles split. onUserWrite mirrors the safe display subset into
   the new broadly-readable node; notifyAdminsOfNewRequest replaces the
   one client-side consumer that needed broad admin-record read access
   (Telegram fan-out) with a server-side equivalent, closing that gap
   before it could reopen the exposure this split exists to close. */
exports.onUserWrite = onUserWrite;
exports.notifyAdminsOfNewRequest = notifyAdminsOfNewRequest;
