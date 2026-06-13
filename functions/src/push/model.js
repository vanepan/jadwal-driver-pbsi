'use strict';

/* ============================================================
   push/model.js — push subscription registry persistence (v1.11.3)

   The device-keyed Web Push subscription store:

     /push_subscriptions/{userId}/{deviceId} = {
       endpoint, keys:{p256dh,auth}, platform, userAgent,
       appVersion, createdAt, lastSeenAt, enabled, expiredAt
     }

   userId === auth.uid === the /users key (Identity Foundation).
   deviceId is a stable client-minted UUID; the rotating endpoint
   lives INSIDE the record so a re-subscribe overwrites the same
   child (no orphan accumulation).

   Server-written ONLY (Admin SDK bypasses rules). Clients never write
   this node directly — they go through the push/callables.js callables.
   ============================================================ */

const { db } = require('../config/admin');

const SUBSCRIPTIONS_PATH = 'push_subscriptions';

/** RTDB keys may not contain . # $ / [ ]. Replace any with _. */
function keySafe(value) {
  return String(value == null ? '' : value).replace(/[.#$/[\]]/g, '_');
}

function _ref(userId, deviceId) {
  return db.ref(`${SUBSCRIPTIONS_PATH}/${keySafe(userId)}/${keySafe(deviceId)}`);
}

/**
 * Upsert a subscription for (userId, deviceId). Rotation-safe: the same
 * deviceId overwrites in place. createdAt is preserved across updates.
 * @returns {Promise<{created:boolean, subscription:Object}>}
 */
async function saveSubscription(userId, deviceId, { endpoint, keys, platform, userAgent, appVersion }) {
  const ref = _ref(userId, deviceId);
  const snap = await ref.once('value');
  const prior = snap.val();
  const now = new Date().toISOString();
  const record = {
    deviceId:   keySafe(deviceId),
    endpoint:   endpoint || null,
    keys:       { p256dh: (keys && keys.p256dh) || null, auth: (keys && keys.auth) || null },
    platform:   platform || 'other',
    userAgent:  userAgent || null,
    appVersion: appVersion || null,
    createdAt:  (prior && prior.createdAt) || now,
    lastSeenAt: now,
    enabled:    true,
    expiredAt:  null,
  };
  await ref.set(record);
  return { created: !prior, subscription: record };
}

/**
 * Load a user's subscriptions. By default only deliverable ones
 * (enabled !== false and not expired).
 * @returns {Promise<Array>} subscriptions, each carrying its deviceId
 */
async function loadSubscriptions(userId, { includeDisabled = false } = {}) {
  const snap = await db.ref(`${SUBSCRIPTIONS_PATH}/${keySafe(userId)}`).once('value');
  const raw = snap.val() || {};
  return Object.entries(raw)
    .map(([deviceId, sub]) => ({ deviceId, ...sub }))
    .filter(sub => includeDisabled || (sub.enabled !== false && !sub.expiredAt));
}

/** Refresh lastSeenAt (drives the future stale-TTL sweep). No-op if absent. */
async function touchLastSeen(userId, deviceId) {
  const ref = _ref(userId, deviceId);
  const snap = await ref.once('value');
  if (!snap.exists()) return false;
  await ref.child('lastSeenAt').set(new Date().toISOString());
  return true;
}

/** Hard-delete a subscription (unsubscribe / logout cleanup). */
async function deleteSubscription(userId, deviceId) {
  await _ref(userId, deviceId).remove();
}

/**
 * Mark a subscription expired (push service returned 404/410 Gone) and
 * remove it. Pruning on send keeps the registry self-healing.
 */
async function pruneSubscription(userId, deviceId) {
  await _ref(userId, deviceId).remove();
}

module.exports = {
  SUBSCRIPTIONS_PATH,
  keySafe,
  saveSubscription,
  loadSubscriptions,
  touchLastSeen,
  deleteSubscription,
  pruneSubscription,
};
