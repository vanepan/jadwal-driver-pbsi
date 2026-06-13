'use strict';

/* ============================================================
   telegram/deliveryLog.js — delivery tracking + notification.sent

   Closes the audit loop the browser Telegram path never had. For each
   server send it:
     1. Appends a record to /telegram_deliveries/{id} (admin/developer
        read; server-only write).
     2. Emits a canonical notification.sent event into /events.

   Both are append-only and server-written (Admin SDK bypasses rules).
   ============================================================ */

const { db } = require('../config/admin');
const logger = require('firebase-functions/logger');
const { buildEnvelope, writeEvent } = require('../events/schema');

const DELIVERIES_PATH = 'telegram_deliveries';

/**
 * Record one Telegram delivery attempt and emit notification.sent.
 *
 * @param {Object} info
 * @param {?string} info.eventId    source business event id (if any)
 * @param {string|number} info.chatId
 * @param {boolean} info.ok
 * @param {number} info.status      HTTP/Telegram status
 * @param {string} [info.error]     description on failure
 * @param {number} [info.attempts]
 * @param {boolean} [info.terminal] terminal (stale chat) flag
 * @returns {Promise<{deliveryId:string, eventId:?string}>}
 */
async function recordDelivery(info) {
  const {
    eventId = null, chatId, ok, status = 0, error = '', attempts = 1, terminal = false,
  } = info || {};

  const record = {
    eventId,
    channel: 'telegram',
    chatId: String(chatId),
    ok: Boolean(ok),
    status,
    error: error || null,
    attempts,
    terminal: Boolean(terminal),
    sentAt: new Date().toISOString(),
  };

  let deliveryId = null;
  try {
    const ref = db.ref(DELIVERIES_PATH).push();
    deliveryId = ref.key;
    await ref.set({ id: deliveryId, ...record });
  } catch (err) {
    logger.error('[deliveryLog] failed to write delivery record', { chatId: record.chatId, error: err.message });
  }

  let sentEventId = null;
  try {
    const stored = await writeEvent(buildEnvelope({
      type: 'notification.sent',
      actor: { uid: 'system', role: 'system', displayName: 'Notification Service' },
      entity: { kind: 'notification', id: deliveryId || `telegram_${Date.now()}` },
      payload: {
        channel: 'telegram',
        sourceEventId: eventId,
        chatId: record.chatId,
        ok: record.ok,
        status,
        terminal: record.terminal,
      },
    }));
    sentEventId = stored.id;
  } catch (err) {
    logger.error('[deliveryLog] failed to emit notification.sent', { error: err.message });
  }

  return { deliveryId, eventId: sentEventId };
}

module.exports = { recordDelivery, DELIVERIES_PATH };
