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
const SERVICE_VERSION = '1.12.2';

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
    // Phase D (v1.12.2): lifecycle Web Push ACTIVATED globally. Every resolved
    // recipient of a notifiable event (request.created → all admins, assignment
    // lifecycle → driver/requester, etc.) now receives a real push popup, not a
    // shadow row. Safe to flip without a Telegram-style cutover: push is
    // server-only (no browser sender), so there is no double-send. The dead
    // endpoints self-prune on 404/410 (dispatcher.dispatchPush). Roll back by
    // setting this false — recipients fall back to in-app + Telegram only.
    push: true,
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
  // Phase D: emptied — NOTIFICATION_FLAGS.channels.push now governs lifecycle
  // push for everyone, so the pilot allowlist is no longer needed. (Kept as an
  // empty array so liveFor's _inAllowlist OR-clause stays a harmless no-op.)
  pilotAllowlist: [],
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
 *
 * Phase C+D CUTOVER (v1.25.x Driver Notification V2, Part 1 + Part 5): both
 * channels flipped true in THIS change, together with retiring the browser
 * reminder path (js/notification-service.js checkAndSendH1Reminders /
 * checkAndSendHoursReminders — no longer called from js/app.js) in the SAME
 * deploy, exactly as this file's own migration note required. No double-send:
 * the browser sender is gone the instant this deploys, and reminder push has
 * no browser equivalent to begin with.
 */
const REMINDER_FLAGS = {
  enabled: true,
  channels: {
    inApp: true,
    telegram: true,
    push: true,
  },
  pilotAllowlist: [],
  // Role-based reminder PUSH pilot (v1.11.4). A recipient receives REAL
  // reminder push if their role is listed here (OR channels.push true OR an
  // exact-case pilotAllowlist match). Consulted ONLY for assignment.reminder
  // PUSH — by BOTH dispatcher.liveFor and the onEventWrite credential gate
  // (they must read the same predicate). Lifecycle push is unaffected
  // (it never consults REMINDER_FLAGS). Reminder push has NO browser
  // equivalent, so this cannot double-send; reminder Telegram stays shadow.
  // NOTE: reminder recipients are the assigned driver + the requester
  // (role 'bidang') only — admins are NOT reminder recipients today, so
  // 'admin' here is forward-compatible (no admin reminder exists to send).
  // Effective live target: drivers. 'bidang'/requester stays shadow.
  pushRoles: ['admin', 'driver'],
};

/**
 * Driver Notification V2 — FALLBACK DEFAULTS ONLY (v1.25.x Final Hardening,
 * Part 1). These are no longer the runtime source of truth: that is
 * /settings/notifications in Firebase (the SAME node js/settings-store.js
 * already owns and live-syncs client-side). This object is consulted ONLY
 * by config/runtimeSettings.js#getAssignmentNotifyConfig() when that live
 * read is empty or fails — a resilience fallback, not a second copy of the
 * config an operator is expected to tune. To change these values for real,
 * edit them in the app's Settings screen (js/app.js, Part 3) or directly at
 * /settings/notifications; editing this object only changes what happens
 * during a Firebase outage.
 *
 *   changeThresholdMinutes — Part 3: a departure-time-only nudge smaller than
 *     this many minutes is NOT independently "meaningful" (onAssignmentWrite
 *     emits no event/notification for it). driver / date / destination /
 *     vehicle changes are ALWAYS meaningful regardless of this value.
 *   debounceMs — Part 2/4: onAssignmentWrite sleeps this long before emitting
 *     an assignment.updated/assignment.reassigned event, then re-reads the
 *     live assignment; if a newer write has already superseded this one, it
 *     skips (the newer invocation's own debounce window emits the coalesced,
 *     final-state event instead). Persistence itself is never delayed —
 *     only the notification-worthy event this triggers. Deliberately SHORT
 *     (2s, was 10s) — a real trailing-edge debounce only needs to be long
 *     enough to catch a rapid follow-up edit, not to feel like a delay.
 *   enableTelegramFallback — Part 1/4: master switch for whether Telegram is
 *     live at all for assignment.* lifecycle events (created/reassigned/
 *     updated/completed/cancelled) — see notifications/dispatcher.js#liveFor.
 *     When true, a DRIVER recipient additionally only gets it when they have
 *     no live Push coverage (dispatchTelegram's push-coverage gate);
 *     admin/requester recipients get it whenever this is true. Telegram for
 *     request.created/approved/rejected and comment.added is a SEPARATE,
 *     unrelated flag (NOTIFICATION_FLAGS.channels.telegram, still false) —
 *     unaffected by this value.
 *   enablePushNotification — Part 3: master switch for Push specifically for
 *     assignment.* lifecycle events, ANDed with the existing global
 *     NOTIFICATION_FLAGS.channels.push (so this can only narrow, never widen,
 *     what the global flag already allows).
 */
const ASSIGNMENT_NOTIFY_DEFAULTS = {
  changeThresholdMinutes: 15,
  debounceMs: 2000,
  enableTelegramFallback: true,
  enablePushNotification: true,
};

module.exports = {
  SERVICE_NAME, SERVICE_VERSION, REGION, DB_INSTANCE,
  NOTIFICATION_FLAGS, PUSH_CONFIG, REMINDER_FLAGS, ASSIGNMENT_NOTIFY_DEFAULTS,
};
