'use strict';

/* ============================================================
   telegram/proxyEndpoint.js — server Telegram ingress (DORMANT)

   HTTP endpoint that accepts the EXACT contract js/telegram.js proxy
   mode already sends: POST { chatId, message }. Pointing the browser's
   window.TELEGRAM_API_BASE_URL at this URL is the one-line cutover
   lever — but that flip belongs to v1.11.2. This release deploys the
   endpoint DORMANT (the client flag stays unset; browser Telegram
   remains primary).

   Token: bound from Secret Manager (TELEGRAM_BOT_TOKEN) — never in the
   browser, never in code.

   Safety: even while dormant this must not be an open Telegram relay.
   It requires a valid Firebase ID token (Authorization: Bearer <token>)
   and rejects anonymous callers. The future cutover teaches telegram.js
   to attach the token.
   ============================================================ */

const { onRequest } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
const { REGION } = require('../config/constants');
const { TELEGRAM_BOT_TOKEN } = require('../config/secrets');
const { auth } = require('../config/admin');
const { sendWithRetry } = require('./retry');
const { recordDelivery } = require('./deliveryLog');

async function requireAuth(req) {
  const header = req.get('Authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  try {
    return await auth.verifyIdToken(match[1]);
  } catch {
    return null;
  }
}

const telegramProxy = onRequest(
  { region: REGION, cors: true, secrets: [TELEGRAM_BOT_TOKEN] },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ ok: false, description: 'Method not allowed' });
      return;
    }

    const caller = await requireAuth(req);
    if (!caller) {
      res.status(401).json({ ok: false, description: 'Authentication required' });
      return;
    }

    const body = req.body || {};
    const chatId = body.chatId;
    const message = body.message;
    if (!chatId || !message) {
      res.status(400).json({ ok: false, description: 'chatId dan message diperlukan' });
      return;
    }

    const token = TELEGRAM_BOT_TOKEN.value();
    const eventId = body.eventId || null;

    try {
      const result = await sendWithRetry(token, chatId, message);
      await recordDelivery({
        eventId,
        chatId,
        ok: result.ok,
        status: result.status,
        error: result.ok ? '' : result.description,
        attempts: result.attempts,
        terminal: result.terminal,
      });

      if (result.ok) {
        res.status(200).json({ ok: true });
      } else {
        res.status(result.terminal ? 400 : 502).json({ ok: false, description: result.description });
      }
    } catch (err) {
      logger.error('[telegramProxy] send failed', { error: err.message });
      res.status(500).json({ ok: false, description: 'Internal error' });
    }
  }
);

module.exports = { telegramProxy };
