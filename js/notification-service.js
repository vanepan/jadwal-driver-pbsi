/* ============================================================
   NOTIFICATION-SERVICE.JS - Centralized Telegram Notification Service

   Role-based notification system for operational events.
   Sends messages to Telegram based on user roles and events.

   Architecture:
   - Frontend service (ready for backend migration)
   - Centralized notification logic
   - Clean message templates for mobile
   - Future: Firebase Functions / External API backend
   ============================================================ */

'use strict';

import { sendNotification } from './telegram.js';

/* ── Date helpers ── */
function formatTanggal(dateStr) {
  if (!dateStr) return '-';
  try {
    const [y, m, d] = String(dateStr).split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('id-ID', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

/* Build "Senin, 29 Mei 2026" or "Senin, 29 – Rabu, 31 Mei 2026" for messages */
function buildDateRangeStr(request) {
  const start = request.startDate || request.date || '';
  const end   = request.endDate   || start;
  if (!start) return '-';
  if (start === end) return formatTanggal(start);
  return `${formatTanggal(start)} → ${formatTanggal(end)}`;
}


function buildRequestApprovedMessage(request, driver) {
  const dateStr = buildDateRangeStr(request);
  return (
    '✅ *Request Jadwal Disetujui*\n\n' +
    `*Keperluan:* ${request.purpose || '-'}\n` +
    `*Tanggal:* ${dateStr}\n` +
    `*Waktu:* ${request.startTime || '-'} – ${request.endTime || '-'}\n` +
    `*Driver:* ${driver || request.driver || 'TBD'}\n` +
    `*Kendaraan:* ${request.vehicle || '-'}\n` +
    (request.notes ? `*Catatan:* ${request.notes}\n` : '') +
    '\n✨ Jadwal Anda telah dikonfirmasi!'
  );
}

function buildRequestRejectedMessage(request) {
  const dateStr = buildDateRangeStr(request);
  return (
    '❌ *Request Jadwal Ditolak*\n\n' +
    `*Keperluan:* ${request.purpose || '-'}\n` +
    `*Tanggal:* ${dateStr}\n` +
    `*Waktu:* ${request.startTime || '-'} – ${request.endTime || '-'}\n\n` +
    '_Silakan buat request baru atau hubungi admin._'
  );
}

/**
 * Send notifikasi ke requester saat request di-approve.
 * @param {Object} request - Request object
 * @param {Object} requesterUser - Requester user object
 * @param {string} driverName - Nama driver yang assign
 */
export async function notifyRequesterApproved(request, requesterUser, driverName) {
  if (!requesterUser || !requesterUser.notificationsEnabled) return null;

  const message = buildRequestApprovedMessage(request, driverName);

  try {
    return await sendNotification(requesterUser, message);
  } catch (error) {
    console.error('notifyRequesterApproved error:', error);
    return { error: String(error?.message || error) };
  }
}

/**
 * Send notifikasi ke requester saat request di-reject.
 * @param {Object} request - Request object
 * @param {Object} requesterUser - Requester user object
 * @param {string} reason - Alasan rejection
 */
export async function notifyRequesterRejected(request, requesterUser) {
  if (!requesterUser || !requesterUser.notificationsEnabled) return null;

  const message = buildRequestRejectedMessage(request);

  try {
    return await sendNotification(requesterUser, message);
  } catch (error) {
    console.error('notifyRequesterRejected error:', error);
    return { error: String(error?.message || error) };
  }
}

/**
 * Notify requester (bidang) when their request is approved.
 * Looks up the requester user internally — caller only needs the request and a getUserFn.
 * Fire-and-forget safe: all errors are caught internally.
 *
 * @param {Object} request - The approved request object
 * @param {Function} getUserFn - async (username: string) => user | null
 */
export async function sendRequestApprovedNotification(request, getUserFn) {
  if (!request?.requesterId || typeof getUserFn !== 'function') return;
  try {
    const user = await getUserFn(request.requesterId);
    if (!user) return;
    await notifyRequesterApproved(request, user, request.driver);
    console.log('[Notif] Approved → sent to', request.requesterId);
  } catch (err) {
    console.error('[Notif] sendRequestApprovedNotification failed:', err);
  }
}

/**
 * Notify requester (bidang) when their request is rejected.
 * Fire-and-forget safe: all errors are caught internally.
 *
 * @param {Object} request - The rejected request object
 * @param {Function} getUserFn - async (username: string) => user | null
 */
export async function sendRequestRejectedNotification(request, getUserFn) {
  if (!request?.requesterId || typeof getUserFn !== 'function') return;
  try {
    const user = await getUserFn(request.requesterId);
    if (!user) return;
    await notifyRequesterRejected(request, user);
    console.log('[Notif] Rejected → sent to', request.requesterId);
  } catch (err) {
    console.error('[Notif] sendRequestRejectedNotification failed:', err);
  }
}

// v1.30.6.10 — RTDB Security Hardening Program, Phase 6:
// sendNewRequestNotificationToAdmins() was removed. It required a bidang
// session to read every admin's telegramChatIds/notificationsEnabled
// directly out of the full /users collection — exactly the broad-read
// exposure the userProfiles/users split closes. Replaced by the
// notifyAdminsOfNewRequest Cloud Function (functions/src/notifications/
// notifyAdminsOfNewRequest.js), called via js/firebase.js#callNotifyAdminsOfNewRequest().

// v1.25.x Driver Notification V2 — Final Hardening (Part 4 — single event
// pipeline). sendNewAssignmentNotificationToDriver, sendAssignmentUpdateNotifications,
// and sendAssignmentCancelledNotification (plus their exclusive helpers —
// buildAssignmentReassignedAwayMessage, buildAssignmentUpdatedMessage,
// buildAssignmentCancelledMessage, findDriverUser, isMeaningfulAssignmentChange,
// safeTimeToMinutes, the debounce timer map) were REMOVED here: they were each
// an independent, client-side notification creator running in parallel with
// the server pipeline (functions/src/events/onAssignmentWrite.js → registry →
// dispatcher), which is exactly the "Assignment → Push, Assignment → Telegram
// through independent paths" duplication this hardening pass eliminates. The
// server now derives assignment.created/reassigned/updated/cancelled directly
// from the SAME /assignments write these callers used to piggyback on, and
// dispatches Push + Telegram + the in-app record from that ONE canonical event.
//
// checkAndSendH1Reminders/checkAndSendHoursReminders (the browser setInterval
// reminder path) were retired in the same earlier change, alongside
// functions/src/config/constants.js#REMINDER_FLAGS.channels.{telegram,push}
// flipping to true — see docs/REMINDER_PRODUCTION_ACTIVATION_REVIEW.md Phase C.
//
// Final verification sweep (Part 6) found a SECOND, already-orphaned chain
// rooted at sendNotificationByType: NOTIFICATION_TYPES, notifyAdminNewRequest,
// notifyDriverAssignment, shouldFallBackToTelegram, sendReminder24h,
// sendReminder2h, buildAssignmentCreatedMessage, buildReminder24hMessage,
// buildReminder2hMessage — none had a caller anywhere outside this file
// (confirmed by grep across js/), so they were removed too, along with the
// vehicleLabel/fetchFirebaseData/getSetting imports that existed only to
// support them. notifyRequesterApproved/notifyRequesterRejected survive:
// sendRequestApprovedNotification/sendRequestRejectedNotification (called
// from app.js's request-review flow) still reach them directly.

console.info('Notification Service module loaded');
