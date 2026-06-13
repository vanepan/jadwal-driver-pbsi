'use strict';

/* ============================================================
   push/callables.js — subscription register/unregister (v1.11.3)

   The ONLY write path into /push_subscriptions. Clients call these
   over the Firebase callable channel; the Admin SDK performs the write
   after verifying ownership — so RTDB rules keep .write:false and no
   client ever writes a device token directly (architecture §9).

   Mirrors the verifyPin / publishEvent callable pattern:
     • request.auth is required (real Firebase Auth session).
     • userId is taken from request.auth.uid — NEVER from the payload,
       so a caller cannot register a token under another user.
     • endpoint origin is validated against an allowlist (abuse guard).
     • device count is capped (oldest-by-lastSeen pruned beyond cap).
   ============================================================ */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
const { REGION, PUSH_CONFIG } = require('../config/constants');
const {
  saveSubscription, loadSubscriptions, deleteSubscription,
} = require('./model');

const DEVICE_ID_RE = /^[a-zA-Z0-9._-]{8,128}$/;

function _assertAuthed(request) {
  if (!request.auth || !request.auth.uid) {
    throw new HttpsError('unauthenticated', 'Sesi tidak valid.');
  }
  return request.auth.uid;
}

function _endpointAllowed(endpoint) {
  try {
    const host = new URL(endpoint).hostname;
    return PUSH_CONFIG.endpointAllowOrigins.some(o => host === o || host.endsWith(`.${o}`));
  } catch {
    return false;
  }
}

/**
 * registerPushSubscription({ deviceId, subscription, platform, appVersion })
 *   subscription = PushSubscription.toJSON() → { endpoint, keys:{p256dh,auth} }
 * Returns { ok, created }.
 */
const registerPushSubscription = onCall({ region: REGION }, async (request) => {
  const uid = _assertAuthed(request);
  const data = request.data || {};
  const deviceId = String(data.deviceId || '').trim();
  const sub = data.subscription || {};

  if (!DEVICE_ID_RE.test(deviceId)) {
    throw new HttpsError('invalid-argument', 'deviceId tidak valid.');
  }
  if (!sub.endpoint || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) {
    throw new HttpsError('invalid-argument', 'Subscription tidak lengkap.');
  }
  if (!_endpointAllowed(sub.endpoint)) {
    logger.warn('[push/register] rejected endpoint origin', { uid });
    throw new HttpsError('invalid-argument', 'Endpoint push tidak dikenal.');
  }

  // Device cap: prune the oldest-seen records beyond the cap (excluding
  // the device being (re)registered, which upserts in place).
  const existing = await loadSubscriptions(uid, { includeDisabled: true });
  const others = existing.filter(s => s.deviceId !== deviceId);
  if (others.length >= PUSH_CONFIG.deviceCap) {
    const overflow = others
      .sort((a, b) => String(a.lastSeenAt || '').localeCompare(String(b.lastSeenAt || '')))
      .slice(0, others.length - PUSH_CONFIG.deviceCap + 1);
    for (const s of overflow) await deleteSubscription(uid, s.deviceId);
  }

  const { created, subscription } = await saveSubscription(uid, deviceId, {
    endpoint:   sub.endpoint,
    keys:       sub.keys,
    platform:   data.platform,
    userAgent:  request.rawRequest && request.rawRequest.headers
      ? request.rawRequest.headers['user-agent'] : null,
    appVersion: data.appVersion,
  });

  logger.info('[push/register] subscription stored', { uid, deviceId, created, platform: subscription.platform });
  return { ok: true, created };
});

/**
 * unregisterPushSubscription({ deviceId })
 * Deletes ONLY this device's record (logout / opt-out). Siblings keep working.
 */
const unregisterPushSubscription = onCall({ region: REGION }, async (request) => {
  const uid = _assertAuthed(request);
  const deviceId = String((request.data || {}).deviceId || '').trim();
  if (!DEVICE_ID_RE.test(deviceId)) {
    throw new HttpsError('invalid-argument', 'deviceId tidak valid.');
  }
  await deleteSubscription(uid, deviceId);
  logger.info('[push/unregister] subscription deleted', { uid, deviceId });
  return { ok: true };
});

module.exports = { registerPushSubscription, unregisterPushSubscription };
