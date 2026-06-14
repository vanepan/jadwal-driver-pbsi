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
const SERVICE_VERSION = '1.11.3';

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
  subject: 'mailto:ops@sarpras.pbsi',
  deviceCap: 10,
  endpointAllowOrigins: [
    'fcm.googleapis.com',
    'updates.push.services.mozilla.com',
    'push.services.mozilla.com',
    'web.push.apple.com',
  ],
  pilotAllowlist: ['evan'],
};

module.exports = { SERVICE_NAME, SERVICE_VERSION, REGION, DB_INSTANCE, NOTIFICATION_FLAGS, PUSH_CONFIG };
