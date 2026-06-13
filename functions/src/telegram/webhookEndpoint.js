'use strict';

/* ============================================================
   telegram/webhookEndpoint.js — Telegram INBOUND webhook handler

   This is the endpoint Telegram POSTs updates to (setWebhook). It is
   the inverse of proxyEndpoint.js:

     • telegramProxy   — OUTBOUND. App → Telegram. POST { chatId,
                         message }, requires a Firebase ID token.
                         UNCHANGED by this module.
     • telegramWebhook — INBOUND. Telegram → Sarpras Operations.
                         Receives bot updates and answers commands.

   Security: Telegram cannot attach a Firebase token, so inbound auth
   uses Telegram's own webhook mechanism — a shared secret echoed in
   the `X-Telegram-Bot-Api-Secret-Token` header, set via
   setWebhook(secret_token=...). Requests without the matching secret
   are rejected, so this is not an open relay.

   Commands: /start, /help, /myid.

   Sending is delegated to the existing server helpers (sendMessage →
   retry → deliveryLog) — no Telegram send logic is duplicated here.
   The handler ALWAYS returns 200 on a valid (authenticated) request so
   Telegram never retries and pending_update_count stays at 0.

   Engine safety: deliveryLog emits a `notification.sent` event, which
   the Notification Engine explicitly treats as a non-notifiable
   "delivery record" (engine.js) — these command replies cannot trigger
   any fan-out loop.
   ============================================================ */

const { onRequest } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
const { REGION } = require('../config/constants');
const { TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET } = require('../config/secrets');
const { sendWithRetry } = require('./retry');
const { recordDelivery } = require('./deliveryLog');

/* ── Command replies ──────────────────────────────────────── */

const START_REPLY =
  'Selamat datang di *PBSI Assistant Bot*.\n\n' +
  'Perintah tersedia:\n' +
  '• /myid\n' +
  '• /help';

const HELP_REPLY =
  'Daftar perintah *PBSI Assistant Bot*:\n\n' +
  '• /start — Mulai & perkenalan\n' +
  '• /myid — Tampilkan Chat ID Anda\n' +
  '• /help — Tampilkan bantuan ini';

function myIdReply(chatId) {
  // Backticks render the ID as tap-to-copy monospace in Telegram.
  return (
    'Chat ID Anda:\n' +
    `\`${chatId}\`\n\n` +
    'Salin dan tempel ke Sarpras Operations.'
  );
}

/** Resolve a command string to its reply text, or null if unknown. */
function replyFor(command, chatId) {
  switch (command) {
    case '/start': return START_REPLY;
    case '/help':  return HELP_REPLY;
    case '/myid':  return myIdReply(chatId);
    default:       return null;
  }
}

/* ── Handler ──────────────────────────────────────────────── */

const telegramWebhook = onRequest(
  { region: REGION, cors: false, secrets: [TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET] },
  async (req, res) => {
    // Telegram only ever POSTs updates.
    if (req.method !== 'POST') {
      res.status(405).send('Method not allowed');
      return;
    }

    // Authenticate via Telegram's shared-secret header.
    const expected = TELEGRAM_WEBHOOK_SECRET.value();
    const got = req.get('X-Telegram-Bot-Api-Secret-Token') || '';
    if (!expected || got !== expected) {
      logger.warn('[telegramWebhook] rejected: secret token mismatch');
      res.status(401).send('Unauthorized');
      return;
    }

    const update = req.body || {};
    const msg = update.message || update.edited_message;
    const text = msg && typeof msg.text === 'string' ? msg.text.trim() : '';
    const chatId = msg && msg.chat && msg.chat.id;

    // Nothing actionable — acknowledge so Telegram drops the update.
    if (!chatId || !text) {
      res.status(200).json({ ok: true });
      return;
    }

    // `/command@BotName arg` → `/command` (strip @suffix + args, lowercase).
    const command = text.split(/\s+/)[0].split('@')[0].toLowerCase();
    const reply = replyFor(command, chatId);

    if (reply) {
      try {
        const token = TELEGRAM_BOT_TOKEN.value();
        const result = await sendWithRetry(token, chatId, reply);
        // Audit via the shared delivery log (same path telegramProxy uses).
        await recordDelivery({
          eventId: null,
          chatId,
          ok: result.ok,
          status: result.status,
          error: result.ok ? '' : result.description,
          attempts: result.attempts,
          terminal: result.terminal,
        });
        if (!result.ok) {
          logger.error('[telegramWebhook] reply send failed', {
            chatId: String(chatId), command, status: result.status, description: result.description,
          });
        }
      } catch (err) {
        logger.error('[telegramWebhook] reply threw', { command, error: err.message });
      }
    }

    // Always 200 on an authenticated request — never make Telegram retry.
    res.status(200).json({ ok: true });
  }
);

module.exports = { telegramWebhook };
