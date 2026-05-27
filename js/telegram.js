'use strict';

/**
 * Telegram helper module.
 *
 * NOTE: Bot token must stay on the server-side and never be exposed in frontend source.
 * Provide a secure backend endpoint that stores the token in a private env variable.
 */

const TELEGRAM_API_ENDPOINT = window.TELEGRAM_API_BASE_URL || '/api/telegram';

export async function sendTelegramMessage(chatId, message) {
  if (!chatId) throw new Error('Telegram Chat ID diperlukan.');
  if (!message || typeof message !== 'string') throw new Error('Pesan Telegram diperlukan.');
  if (!TELEGRAM_API_ENDPOINT) throw new Error('Endpoint Telegram belum dikonfigurasi.');

  const payload = { chatId: String(chatId).trim(), message: String(message) };

  const response = await fetch(TELEGRAM_API_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  let data;
  try { data = await response.json(); } catch (e) { data = null; }

  if (!response.ok) {
    const errorDetail = data?.error || data?.message || 'Gagal mengirim pesan Telegram.';
    throw new Error(errorDetail);
  }

  return data;
}

/**
 * Send notification to all configured chat IDs for a user.
 * - Accepts legacy `telegramChatId` (string) or new `telegramChatIds` object.
 * - Skips if `notificationsEnabled` is falsy.
 * - Returns array of results for each attempted send.
 */
export async function sendNotification(user, message) {
  if (!user) throw new Error('User harus diberikan untuk mengirim notifikasi.');
  if (!user.notificationsEnabled) return { skipped: true, reason: 'Notifications disabled' };

  const chatIds = [];
  if (user.telegramChatIds && typeof user.telegramChatIds === 'object') {
    // collect unique, non-empty values
    Object.values(user.telegramChatIds).forEach(v => { if (v) chatIds.push(String(v).trim()); });
  }
  // legacy single-field fallback
  if (user.telegramChatId && !chatIds.length) {
    chatIds.push(String(user.telegramChatId).trim());
  }

  const unique = Array.from(new Set(chatIds.filter(Boolean)));
  if (unique.length === 0) throw new Error('Tidak ada Telegram Chat ID tersedia untuk user ini.');

  const results = [];
  for (const id of unique) {
    try {
      const res = await sendTelegramMessage(id, message);
      results.push({ chatId: id, ok: true, result: res });
    } catch (err) {
      console.error('sendNotification error for', id, err);
      results.push({ chatId: id, ok: false, error: String(err?.message || err) });
    }
  }

  return results;
}
