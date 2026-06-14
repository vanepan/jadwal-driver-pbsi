'use strict';

/* ============================================================
   Shared constants for the Cloud Functions backend.
   ============================================================ */

/** Logical service name surfaced by the health endpoint. */
const SERVICE_NAME = 'sarpras-operations';

/**
 * Backend scaffold version. Tracked independently of the frontend
 * APP_VERSION (js/config.js) so deploying the backend never triggers
 * the PWA "Versi baru tersedia" update banner.
 */
const SERVICE_VERSION = '1.11.4';

/**
 * Deploy region. Must match the RTDB region (asia-southeast1) so that
 * database-triggered functions run with the lowest latency.
 */
const REGION = 'asia-southeast1';

/**
 * RTDB instance name (the part before .<region>.firebasedatabase.app in
 * the databaseURL). v2 database triggers bind to a specific instance.
 */
const DB_INSTANCE = 'schedule-driver-pbsi-default-rtdb';

/**
 * Notification Engine migration flags (v1.11.2, Phase 8 — shadow-first).
 *
 *   enabled            — master switch: run processEvent on /events at all.
 *   channels.inApp     — write /notifications records. Safe to enable from
 *                        day one: the bell still reads /logs (Phase A), so
 *                        these records are invisible until the UI switches
 *                        (Phase C). Provides the shadow comparison data.
 *   channels.telegram  — OFF. The browser remains the live Telegram sender;
 *                        enabling this is the Phase D cutover (must flip the
 *                        browser send OFF in the same change — no double-send).
 *   channels.push      — OFF. Scaffold only; push lifecycle is v1.11.3.
 *
 * Flip a single boolean to advance/rollback a migration stage.
 */
const NOTIFICATION_FLAGS = {
  enabled: true,
  channels: {
    inApp: true,
    telegram: false,
    push: false,
  },
};

/**
 * Push (Web Push / VAPID) configuration (v1.11.3).
 *
 *   subject     — VAPID contact (mailto: or https URL). REQUIRED by
 *                 web-push.setVapidDetails. Not a secret.
 *   deviceCap   — max subscriptions retained per user (abuse/storage
 *                 bound; oldest-by-lastSeen pruned beyond this).
 *   endpointAllowOrigins — accepted push-service hosts (subscription
 *                 abuse guard in registerPushSubscription).
 *   pilotAllowlist — Phase B/C ONLY. uids here receive REAL push even
 *                 while NOTIFICATION_FLAGS.channels.push is false. Empty
 *                 = pure shadow (Phase A). Phase D flips the flag true
 *                 and empties this list.
 */
const PUSH_CONFIG = {
  // VAPID contact. MUST be a real mailto: domain or https: URL — Apple Web
  // Push (web.push.apple.com) validates this claim and rejects an invalid
  // domain with 403 BadJwtToken (FCM/Mozilla ignore it). 'sarpras.pbsi' is
  // not a routable TLD, so iOS push failed; the project hosting URL is valid
  // and Apple-accepted (verified against evan's iOS subscription, v1.11.3).
  subject: 'https://schedule-driver-pbsi.web.app',
  deviceCap: 10,
  endpointAllowOrigins: [
    'fcm.googleapis.com',
    'updates.push.services.mozilla.com',
    'push.services.mozilla.com',
    'web.push.apple.com',
  ],
  pilotAllowlist: ['evan'],
};

/**
 * Reminder Engine flags (v1.11.4 — shadow-first, INDEPENDENT of the
 * lifecycle NOTIFICATION_FLAGS). Reminders have no legacy SERVER sender,
 * so reminder Telegram/Push can go live without the lifecycle cutover —
 * but they DO have a legacy BROWSER reminder path
 * (notification-service.js checkAndSendH1/HoursReminders) that must be
 * retired in the SAME deploy that flips channels.telegram true (Phase C),
 * or they double-send (REV2 §1.4).
 *
 *   enabled         — master: does the scheduler maintain rows + the tick
 *                     emit reminder events at all? Ships FALSE → the whole
 *                     subsystem is dormant on deploy (no production change
 *                     until ops flips it). Phase A (shadow) = flip true.
 *   channels.inApp  — reminders inherit the shared in-app surface
 *                     (NOTIFICATION_FLAGS.channels.inApp gates the actual
 *                     in-app delivery; recorded-but-invisible until the
 *                     bell Phase C). Declared here for symmetry.
 *   channels.telegram / .push — reminder-only send gates, consulted by BOTH
 *                     the onEventWrite credential load AND dispatcher.liveFor
 *                     (the two must read identical predicates — REV2 §2.2).
 *   pilotAllowlist  — exact-case /users keys that get REAL reminder Push
 *                     while channels.push is false (Phase B). Mirrors
 *                     PUSH_CONFIG.pilotAllowlist; same exact-case gotcha.
 *
 * Rollout: A(enabled) → B(pilotAllowlist) → C(channels.telegram + retire
 * browser reminders) → D(channels.push). Flip one field per phase.
 */
const REMINDER_FLAGS = {
  // Phase A — SHADOW ACTIVATION (v1.11.4 production activation, 2026-06-14).
  // enabled:true starts row materialization + the tick emitting reminder
  // events; channels stay OFF so EVERY reminder records a shadow delivery and
  // SENDS NOTHING. The browser reminder path (notification-service.js
  // checkAndSendH1/HoursReminders) remains the live sender — no double-send,
  // no gap. Advancing to telegram/push delivery (Phase C/D) is GATED on
  // retiring the browser reminders in the SAME deploy + a /reminders backfill
  // (see REMINDER_PRODUCTION_ACTIVATION_REVIEW.md). Do NOT flip channels.*
  // true until then.
  enabled: true,
  channels: {
    inApp: true,
    telegram: false,
    push: false,
  },
  pilotAllowlist: [],
};

module.exports = { SERVICE_NAME, SERVICE_VERSION, REGION, DB_INSTANCE, NOTIFICATION_FLAGS, PUSH_CONFIG, REMINDER_FLAGS };
