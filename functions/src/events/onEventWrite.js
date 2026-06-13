'use strict';

/* ============================================================
   events/onEventWrite.js — NOTIFICATION ENGINE entrypoint (v1.11.2)

   Fires on every new /events/{eventId}. Upgraded from the v1.11.1.3
   validation-only subscriber into the single notification path:

     validate envelope
        ↓
     processEvent(event)   (notifications/engine.js)
        ↓
     resolve recipients → generate notifications → persist → dispatch

   Migration is shadow-first (config/constants.js#NOTIFICATION_FLAGS):
   in-app records are written from day one but invisible (the bell
   still reads /logs until Phase C); Telegram stays OFF (the browser
   remains the live sender until the Phase D cutover). Engine fan-out
   creates NO double-send while telegram is OFF.

   notification.sent (a delivery record, not a business event) is
   validated only and never re-processed — preventing any loop.
   ============================================================ */

const { onValueCreated } = require('firebase-functions/v2/database');
const logger = require('firebase-functions/logger');
const { REGION, DB_INSTANCE, NOTIFICATION_FLAGS } = require('../config/constants');
const { TELEGRAM_BOT_TOKEN } = require('../config/secrets');
const { validateEnvelope } = require('./schema');
const { processEvent } = require('../notifications/engine');

const onEventWrite = onValueCreated(
  { ref: '/events/{eventId}', region: REGION, instance: DB_INSTANCE, secrets: [TELEGRAM_BOT_TOKEN] },
  async (event) => {
    const envelope = event.data.val();
    const eventId = event.params.eventId;

    /* 1. Envelope integrity */
    const { valid, errors } = validateEnvelope(envelope);
    if (!valid) {
      logger.warn('[onEventWrite] INVALID envelope', { eventId, type: envelope && envelope.type, errors });
      return;
    }

    /* notification.sent is a delivery record — validate only, never process. */
    if (envelope.type === 'notification.sent') {
      logger.info('[onEventWrite] delivery record validated', { eventId, type: envelope.type });
      return;
    }

    if (!NOTIFICATION_FLAGS.enabled) {
      logger.info('[onEventWrite] engine disabled — skipping', { eventId, type: envelope.type });
      return;
    }

    /* 2. Run the notification engine. The bot token is only resolved when
       the telegram channel is actually enabled (it stays dormant this
       release), so a dormant deploy never requires the secret at runtime. */
    try {
      const token = NOTIFICATION_FLAGS.channels.telegram ? TELEGRAM_BOT_TOKEN.value() : null;
      const result = await processEvent({ ...envelope, id: envelope.id || eventId }, { token });
      logger.info('[onEventWrite] engine result', { eventId, ...result });
    } catch (err) {
      logger.error('[onEventWrite] engine failed', { eventId, type: envelope.type, error: err.message });
    }
  }
);

module.exports = { onEventWrite };
