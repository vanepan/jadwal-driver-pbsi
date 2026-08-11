'use strict';

/* ============================================================
   notifications/notifyAdminsOfNewRequest.js (v1.30.6.10 — RTDB Security
   Hardening Program, Phase 6)

   Replaces js/notification-service.js#sendNewRequestNotificationToAdmins()'s
   client-side fan-out. That function required a BIDANG session's browser
   to read every admin's telegramChatIds/notificationsEnabled directly out
   of the full /users collection — exactly the broad-read exposure the
   userProfiles/users split (this same phase) closes. The server already
   has, and always needed, Admin SDK access to /users; this moves the SEND
   here too so the client never needs that read again for this flow.

   Deliberately narrow: this is NOT the "Telegram Phase D" cutover
   (NOTIFICATION_FLAGS.channels.telegram, still false) — that is a larger,
   separately-owned migration affecting every notification type at once
   ("must flip the browser send OFF in the same change — no double-send").
   This callable only replaces ONE specific client-side send with a
   server-side equivalent, reusing the already-deployed, already-tested
   send primitives (sendWithRetry, recordDelivery, the same Secret
   Manager-bound bot token) telegramProxy already uses.
   ============================================================ */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
const { REGION } = require('../config/constants');
const { TELEGRAM_BOT_TOKEN } = require('../config/secrets');
const { db } = require('../config/admin');
const { sendWithRetry } = require('../telegram/retry');
const { recordDelivery } = require('../telegram/deliveryLog');

function buildDateRangeStr(request) {
  const { startDate, endDate } = request || {};
  if (!startDate) return '-';
  return startDate === endDate || !endDate ? startDate : `${startDate} s/d ${endDate}`;
}

/** Verbatim mirror of js/notification-service.js#buildRequestPendingMessage(). */
function buildRequestPendingMessage(request) {
  const dateStr = buildDateRangeStr(request);
  return (
    '📋 *Request Jadwal Baru*\n\n' +
    `*Dari:* ${request.requesterName || 'Unknown'}\n` +
    `*Keperluan:* ${request.purpose || '-'}\n` +
    `*Tanggal:* ${dateStr}\n` +
    `*Waktu:* ${request.startTime || '-'} – ${request.endTime || '-'}\n` +
    `*Kendaraan:* ${request.vehicle || '-'}\n` +
    (request.notes ? `*Catatan:* ${request.notes}\n` : '') +
    '\n_Silakan login untuk approve/reject._'
  );
}

const notifyAdminsOfNewRequest = onCall({ region: REGION, secrets: [TELEGRAM_BOT_TOKEN] }, async (callRequest) => {
  if (!callRequest.auth || !callRequest.auth.uid) {
    throw new HttpsError('unauthenticated', 'Sesi tidak valid.');
  }
  const requestId = String((callRequest.data || {}).requestId || '').trim();
  if (!requestId) {
    throw new HttpsError('invalid-argument', 'requestId diperlukan.');
  }

  const reqSnap = await db.ref(`driver_requests/${requestId}`).once('value');
  const driverRequest = reqSnap.val();
  if (!driverRequest) {
    throw new HttpsError('not-found', 'Request tidak ditemukan.');
  }
  if (
    callRequest.auth.token?.role !== 'admin' &&
    callRequest.auth.token?.adminEquivalent !== true &&
    driverRequest.requesterId !== callRequest.auth.uid
  ) {
    throw new HttpsError('permission-denied', 'Anda tidak berhak memicu notifikasi untuk request ini.');
  }

  const usersSnap = await db.ref('users').once('value');
  const allUsers = usersSnap.val() || {};
  const admins = Object.entries(allUsers)
    .map(([username, u]) => ({ username, ...u }))
    .filter((u) => u.role === 'admin' && u.active !== false && u.notificationsEnabled);

  const message = buildRequestPendingMessage(driverRequest);
  const token = TELEGRAM_BOT_TOKEN.value();
  let sent = 0;

  for (const admin of admins) {
    const chatId = admin.telegramChatIds?.primary || admin.telegramChatId;
    if (!chatId) continue;
    try {
      const result = await sendWithRetry(token, chatId, message);
      await recordDelivery({
        eventId: `request.created.${requestId}.${admin.username}`,
        chatId,
        ok: result.ok,
        status: result.status,
        error: result.ok ? '' : result.description,
        attempts: result.attempts,
        terminal: result.terminal,
      });
      if (result.ok) sent += 1;
    } catch (err) {
      logger.error('[notify/newRequest] send failed', { admin: admin.username, error: err.message });
    }
  }

  logger.info('[notify/newRequest] done', { requestId, adminCount: admins.length, sent });
  return { ok: true, sent };
});

module.exports = { notifyAdminsOfNewRequest };
