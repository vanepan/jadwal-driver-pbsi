'use strict';

/**
 * Telegram helper module.
 *
 * Calls the Telegram Bot API directly from the browser.
 * Token is loaded at startup from Firebase /settings/telegram/botToken
 * via setTelegramBotToken(). Falls back to window.TELEGRAM_BOT_TOKEN for
 * backward compatibility during migration.
 *
 * Fallback: if  window.TELEGRAM_API_BASE_URL  is set, requests are forwarded
 * to that backend proxy instead (legacy / server-side mode).
 */

const DIRECT_API = 'https://api.telegram.org';
const CUSTOM_PROXY = () => window.TELEGRAM_API_BASE_URL || '';

let _botToken = '';

export function setTelegramBotToken(token) {
  _botToken = String(token || '').trim();
}

const getBotToken = () => _botToken || window.TELEGRAM_BOT_TOKEN || '';

/**
 * Send a single message to one chat ID.
 * @param {string|number} chatId
 * @param {string} message  — Telegram Markdown v1 formatting accepted
 */
export async function sendTelegramMessage(chatId, message) {
  if (!chatId) throw new Error('Telegram Chat ID diperlukan.');
  if (!message || typeof message !== 'string') throw new Error('Pesan Telegram diperlukan.');

  const id   = String(chatId).trim();
  const text = String(message);

  const proxy = CUSTOM_PROXY();
  let url, headers, fetchBody;

  if (proxy) {
    // ── Backend-proxy mode (JSON) ──
    url       = proxy;
    headers   = { 'Content-Type': 'application/json' };
    fetchBody = JSON.stringify({ chatId: id, message: text });
  } else {
    // ── Direct Telegram API mode ──
    // Use application/x-www-form-urlencoded (a CORS "simple" content-type)
    // to avoid the OPTIONS preflight that Telegram's API does not handle.
    const token = getBotToken();
    if (!token) {
      throw new Error(
        'Telegram Bot Token belum dikonfigurasi. ' +
        'Simpan token di Firebase /settings/telegram/botToken.'
      );
    }
    url       = `${DIRECT_API}/bot${token}/sendMessage`;
    headers   = { 'Content-Type': 'application/x-www-form-urlencoded' };
    fetchBody = new URLSearchParams({ chat_id: id, text, parse_mode: 'Markdown' }).toString();
  }

  let response;
  try {
    response = await fetch(url, { method: 'POST', headers, body: fetchBody });
  } catch (networkErr) {
    throw new Error(`Koneksi gagal: ${networkErr.message}`);
  }

  let data;
  try { data = await response.json(); } catch { data = null; }

  if (!response.ok || (data && data.ok === false)) {
    // Telegram API returns { ok: false, description: "..." } on error
    const detail = data?.description || data?.error || data?.message || `HTTP ${response.status}`;
    throw new Error(detail);
  }

  return data;
}

/**
 * Send a notification message to every configured Telegram Chat ID for a user.
 *
 * - Skips silently if  notificationsEnabled  is falsy.
 * - Supports both  telegramChatIds  (object) and legacy  telegramChatId  (string).
 * - Returns  { skipped: true }  when disabled, or an array of per-chatId results.
 */
export async function sendNotification(user, message) {
  if (!user) throw new Error('User diperlukan untuk mengirim notifikasi.');
  if (!user.notificationsEnabled) return { skipped: true, reason: 'Notifications disabled' };

  const chatIds = [];

  if (user.telegramChatIds && typeof user.telegramChatIds === 'object') {
    Object.values(user.telegramChatIds).forEach(v => { if (v) chatIds.push(String(v).trim()); });
  }
  // Legacy single-field fallback
  if (!chatIds.length && user.telegramChatId) {
    chatIds.push(String(user.telegramChatId).trim());
  }

  const unique = Array.from(new Set(chatIds.filter(Boolean)));
  if (unique.length === 0) throw new Error('Tidak ada Telegram Chat ID untuk user ini.');

  const results = [];
  for (const id of unique) {
    try {
      const res = await sendTelegramMessage(id, message);
      results.push({ chatId: id, ok: true, result: res });
    } catch (err) {
      console.error('[Telegram] sendNotification error for', id, ':', err.message);
      results.push({ chatId: id, ok: false, error: String(err?.message || err) });
    }
  }

  return results;
}
