'use strict';

/* ============================================================
   telegram/sendMessage.js — core server-side Telegram send

   Reproduces js/telegram.js#sendTelegramMessage on the wire:
   POST to api.telegram.org with application/x-www-form-urlencoded
   and parse_mode=Markdown. The bot token is supplied by the caller
   from Secret Manager (TELEGRAM_BOT_TOKEN) — it never lives in code
   and never reaches the browser.

   Returns a structured RESULT (does not throw on Telegram errors) so
   retry.js can classify the outcome:

     { ok, status, description, retryAfter, data }
   ============================================================ */

const DIRECT_API = 'https://api.telegram.org';

/**
 * Send one Telegram message. Network failures throw; Telegram API
 * errors are returned as { ok:false, ... } for the caller to classify.
 *
 * @param {string} token   bot token (from Secret Manager)
 * @param {string|number} chatId
 * @param {string} message Markdown v1 text
 * @returns {Promise<{ok:boolean,status:number,description:string,retryAfter:?number,data:any}>}
 */
async function sendTelegramMessage(token, chatId, message) {
  if (!token) throw new Error('Telegram bot token tidak tersedia.');
  if (!chatId) throw new Error('Telegram Chat ID diperlukan.');
  if (!message || typeof message !== 'string') throw new Error('Pesan Telegram diperlukan.');

  const url = `${DIRECT_API}/bot${token}/sendMessage`;
  const body = new URLSearchParams({
    chat_id: String(chatId).trim(),
    text: String(message),
    parse_mode: 'Markdown',
  }).toString();

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  let data = null;
  try { data = await response.json(); } catch { data = null; }

  const ok = response.ok && !(data && data.ok === false);
  return {
    ok,
    status: response.status,
    description: data && (data.description || data.error || data.message) || '',
    retryAfter: data && data.parameters && data.parameters.retry_after
      ? Number(data.parameters.retry_after)
      : null,
    data,
  };
}

module.exports = { sendTelegramMessage };
