'use strict';

/* ============================================================
   notifications/engine.js — the single notification entrypoint

   processEvent(event) is the one path from a canonical /events row
   to delivered notifications. No notification is created anywhere
   else. Responsibilities (objective Phase 4):

     1. validate the event envelope
     2. resolve recipients          (notifications/recipients.js)
     3. generate a notification per recipient (registry + templates)
     4. persist each notification   (notifications/model.js)
     5. invoke the dispatcher       (notifications/dispatcher.js)

   No channel-specific logic lives here — that is the dispatcher's job.

   Idempotency: a notification's id is derived from the eventId, so
   reprocessing the same event neither duplicates the record nor (via
   the dispatcher's per-channel delivery guard) re-sends. Re-dispatch
   on an already-persisted notification is safe and lets a partially
   delivered event recover.
   ============================================================ */

const logger = require('firebase-functions/logger');
const { validateEnvelope } = require('../events/schema');
const { resolveRecipients, loadUserDirectory } = require('./recipients');
const { getRegistryEntry } = require('./registry');
const { render } = require('./templates');
const { buildNotification, persistNotification } = require('./model');
const { dispatch } = require('./dispatcher');

const lc = (v) => String(v || '').trim().toLowerCase();

/**
 * Turn one canonical event into notifications + deliveries.
 *
 * @param {Object} event  canonical envelope (must carry its id)
 * @param {Object} [opts] { token, vapid } — Telegram bot token (Phase D)
 *                        and Web Push VAPID details (push send), each
 *                        resolved only when its channel is live.
 * @returns {Promise<Object>} a structured outcome for logging
 */
async function processEvent(event, opts = {}) {
  if (!event) return { skipped: 'no event' };

  /* 1. Validate */
  const { valid, errors } = validateEnvelope(event);
  if (!valid) {
    logger.warn('[engine] invalid envelope — skipping', { type: event.type, errors });
    return { skipped: 'invalid envelope', errors };
  }
  // Delivery records are not business events — never notify on them.
  if (event.type === 'notification.sent') return { skipped: 'delivery record' };

  const entry = getRegistryEntry(event.type);
  if (!entry) return { skipped: 'not notifiable', type: event.type };

  if (!event.id) {
    logger.warn('[engine] event missing id — cannot key notification', { type: event.type });
    return { skipped: 'missing event id', type: event.type };
  }

  /* 2. Resolve recipients (unified resolver) */
  const users = await loadUserDirectory();
  const { users: recipientIds } = resolveRecipients(event, users);
  if (!recipientIds.length) {
    return { processed: true, type: event.type, recipients: 0, created: 0 };
  }
  const userMap = new Map(users.map(u => [lc(u.username), u]));

  /* 3–5. Generate, persist, dispatch — one notification per recipient */
  let created = 0;
  for (const recipientId of recipientIds) {
    const recipient = userMap.get(lc(recipientId)) || { username: recipientId, role: null };

    const copy = render(event.type, event, recipient, 'inApp');
    const notification = buildNotification({
      type:        event.type,
      eventId:     event.id,
      recipientId,
      title:       (copy && copy.title) || event.type,
      body:        (copy && copy.body) || '',
      channels:    entry.channels,
    });

    const { created: wasCreated } = await persistNotification(notification);
    if (wasCreated) created += 1;

    await dispatch(notification, { event, recipient, token: opts.token, vapid: opts.vapid });
  }

  logger.info('[engine] processed event', {
    type: event.type, eventId: event.id, recipients: recipientIds.length, created,
  });
  return { processed: true, type: event.type, recipients: recipientIds.length, created };
}

module.exports = { processEvent };
