'use strict';

/* ============================================================
   notifications/model.js — notification + delivery persistence

   The canonical, channel-agnostic notification record and its
   per-channel delivery records. Two RTDB nodes:

     /notifications/{recipientId}/{notificationId}
       The user-facing record. Read by the bell (per-recipient
       subscription). Per-record read state (readAt) — NO global
       unread timestamp.

     /notification_deliveries/{deliveryId}
       Per-(event,recipient,channel) delivery audit. Generalizes
       the Telegram-only /telegram_deliveries to every channel.

   Idempotency is structural:
     • notificationId = eventId  → one notification per recipient
       per event; reprocessing the same event overwrites nothing
       (persistNotification skips if it already exists, preserving
       readAt).
     • deliveryId = eventId__recipientId__channel → one delivery
       row per channel; the dispatcher checks it before sending.

   Both nodes are server-written only (Admin SDK bypasses rules).
   ============================================================ */

const { db } = require('../config/admin');

const NOTIFICATIONS_PATH = 'notifications';
const DELIVERIES_PATH = 'notification_deliveries';

/** Notification lifecycle (coarse — per-channel detail lives in deliveries). */
const NOTIFICATION_STATUS = { QUEUED: 'queued', DISPATCHED: 'dispatched' };

/** Per-channel delivery lifecycle. `delivered` reserved for push receipts (v1.11.3). */
const DELIVERY_STATUS = { QUEUED: 'queued', SENT: 'sent', FAILED: 'failed', DELIVERED: 'delivered' };

/** Channel identifiers. push is scaffold-only this release. */
const CHANNELS = { IN_APP: 'inApp', TELEGRAM: 'telegram', PUSH: 'push' };

/** RTDB keys may not contain . # $ / [ ]. Replace any with _. */
function keySafe(value) {
  return String(value == null ? '' : value).replace(/[.#$/[\]]/g, '_');
}

/**
 * Build a canonical notification record (id derived from eventId for
 * idempotency). status starts queued; the engine flips it to dispatched.
 */
function buildNotification({ type, eventId, recipientId, title, body, channels }) {
  return {
    id:          keySafe(eventId),
    type:        String(type || ''),
    eventId:     eventId || null,
    recipientId: recipientId || null,
    title:       title || '',
    body:        body || '',
    channels:    Array.isArray(channels) ? channels : [],
    status:      NOTIFICATION_STATUS.QUEUED,
    createdAt:   new Date().toISOString(),
    readAt:      null,
  };
}

/**
 * Persist a notification idempotently. If a record already exists for
 * this (recipient, event), it is returned untouched (readAt preserved).
 * @returns {Promise<{created:boolean, notification:Object}>}
 */
async function persistNotification(notification) {
  const ref = db.ref(
    `${NOTIFICATIONS_PATH}/${keySafe(notification.recipientId)}/${notification.id}`
  );
  const snap = await ref.once('value');
  if (snap.exists()) return { created: false, notification: snap.val() };
  await ref.set(notification);
  return { created: true, notification };
}

/** Update the coarse notification status (queued → dispatched). */
async function setNotificationStatus(recipientId, notificationId, status) {
  await db
    .ref(`${NOTIFICATIONS_PATH}/${keySafe(recipientId)}/${keySafe(notificationId)}/status`)
    .set(status);
}

/** Deterministic delivery id: one row per (event, recipient, channel). */
function deliveryId({ eventId, recipientId, channel }) {
  return keySafe(`${eventId}__${recipientId}__${channel}`);
}

/** Fetch an existing delivery record (idempotency guard). */
async function getDelivery(id) {
  const snap = await db.ref(`${DELIVERIES_PATH}/${id}`).once('value');
  return snap.exists() ? snap.val() : null;
}

/**
 * Write (upsert) a delivery record. Keyed deterministically so a retry
 * overwrites rather than duplicates.
 */
async function recordDelivery({
  eventId, notificationId = null, recipientId, channel,
  status, attempts = 0, terminal = false, error = null, target = null, shadow = false,
}) {
  const id = deliveryId({ eventId, recipientId, channel });
  const record = {
    id,
    eventId:        eventId || null,
    notificationId: notificationId || null,
    recipientId:    recipientId || null,
    channel,
    status,
    attempts,
    terminal:       Boolean(terminal),
    error:          error || null,
    target:         target || null,
    shadow:         Boolean(shadow),
    updatedAt:      new Date().toISOString(),
  };
  await db.ref(`${DELIVERIES_PATH}/${id}`).set(record);
  return record;
}

module.exports = {
  NOTIFICATIONS_PATH,
  DELIVERIES_PATH,
  NOTIFICATION_STATUS,
  DELIVERY_STATUS,
  CHANNELS,
  keySafe,
  buildNotification,
  persistNotification,
  setNotificationStatus,
  deliveryId,
  getDelivery,
  recordDelivery,
};
