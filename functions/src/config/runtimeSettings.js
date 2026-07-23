'use strict';

/* ============================================================
   config/runtimeSettings.js — the ONE runtime source of truth for
   Driver Notification V2's tunables (v1.25.x Final Hardening, Part 1).

   Before this file, the threshold/debounce/telegram-fallback/push-enable
   values were duplicated as hardcoded literals in BOTH
   functions/src/config/constants.js (server) AND js/config/notification-config.js
   (client — now DELETED). That file is gone; the client reads these same
   four values from js/settings-store.js, which live-syncs
   /settings/notifications from Firebase (js/settings-store.js DEFAULTS —
   same keys, same defaults, kept in sync by being the SAME data).

   This module is the server-side mirror of that read: Cloud Functions have
   no persistent connection to piggyback on settings-store's live listener,
   so getAssignmentNotifyConfig() does a direct Admin SDK read of the SAME
   /settings/notifications node on demand, short-TTL-cached to avoid a
   round trip on every single /assignments write. ASSIGNMENT_NOTIFY_DEFAULTS
   (constants.js) is used ONLY as the fail-safe when that read is empty or
   errors — never as an independent, silently-diverging copy.

   OWNERSHIP (final):
     /settings/notifications/{assignmentChangeThresholdMinutes,
       notificationDebounceMs, enableTelegramFallback, enablePushNotification}
     — the ONE source of truth, editable from the app's existing Settings
     screen (js/app.js, Part 3), read by:
       • client:  js/settings-store.js#getSetting() (synchronous, cached, live)
       • server:  this file's getAssignmentNotifyConfig() (async, short-TTL
                  cached, live), consumed by onAssignmentWrite.js (Parts 2/3)
                  and notifications/dispatcher.js (Part 1/4)
   ============================================================ */

const logger = require('firebase-functions/logger');
const { db } = require('./admin');
const { ASSIGNMENT_NOTIFY_DEFAULTS } = require('./constants');

const SETTINGS_NOTIFICATIONS_PATH = 'settings/notifications';

/** How long a successful live read is trusted before re-fetching. Balances
 *  "settings changes take effect quickly" against "don't read RTDB on every
 *  single assignment write". Not itself a user-facing setting — retuning it
 *  is a code change, unlike the four values it caches. */
const CACHE_TTL_MS = 30000;

let cache = null;
let cacheAt = 0;

function coerceNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function coerceBoolean(value, fallback) {
  return typeof value === 'boolean' ? value : fallback;
}

/**
 * The live assignment-notification config, merging /settings/notifications
 * onto ASSIGNMENT_NOTIFY_DEFAULTS field-by-field (a partial/missing node
 * never loses a field to `undefined`). Cached for CACHE_TTL_MS; falls back
 * to defaults entirely on a read error (never throws — a config outage
 * must never take down assignment event processing).
 * @returns {Promise<{changeThresholdMinutes:number, debounceMs:number, enableTelegramFallback:boolean, enablePushNotification:boolean}>}
 */
async function getAssignmentNotifyConfig() {
  const now = Date.now();
  if (cache && (now - cacheAt) < CACHE_TTL_MS) return cache;

  try {
    const snap = await db.ref(SETTINGS_NOTIFICATIONS_PATH).once('value');
    const live = snap.val() || {};
    cache = {
      changeThresholdMinutes: coerceNumber(live.assignmentChangeThresholdMinutes, ASSIGNMENT_NOTIFY_DEFAULTS.changeThresholdMinutes),
      debounceMs: coerceNumber(live.notificationDebounceMs, ASSIGNMENT_NOTIFY_DEFAULTS.debounceMs),
      enableTelegramFallback: coerceBoolean(live.enableTelegramFallback, ASSIGNMENT_NOTIFY_DEFAULTS.enableTelegramFallback),
      enablePushNotification: coerceBoolean(live.enablePushNotification, ASSIGNMENT_NOTIFY_DEFAULTS.enablePushNotification),
    };
    cacheAt = now;
    return cache;
  } catch (err) {
    logger.error('[runtimeSettings] live settings read failed — using defaults', { error: err.message });
    return { ...ASSIGNMENT_NOTIFY_DEFAULTS };
  }
}

/** Test/teardown helper — forces the next call to re-read live. */
function resetAssignmentNotifyConfigCache() {
  cache = null;
  cacheAt = 0;
}

module.exports = { getAssignmentNotifyConfig, resetAssignmentNotifyConfigCache, SETTINGS_NOTIFICATIONS_PATH };
