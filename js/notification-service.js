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
import { getCurrentUser } from './auth.js';

/* ── Date helper (no external import needed) ── */
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

/* ── H-1 reminder deduplication via localStorage ── */
const H1_REMINDER_KEY = 'pbsi_h1_reminders';

function getTodayStr() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}

function getTomorrowStr() {
  const t = new Date();
  t.setDate(t.getDate() + 1);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}

function loadH1State() {
  try {
    const raw = JSON.parse(localStorage.getItem(H1_REMINDER_KEY)) || {};
    return raw.date === getTodayStr() ? raw : { date: getTodayStr(), sent: [] };
  } catch {
    return { date: getTodayStr(), sent: [] };
  }
}

function saveH1State(state) {
  try { localStorage.setItem(H1_REMINDER_KEY, JSON.stringify(state)); } catch { /* ignore */ }
}

/* ── Notification Types ── */
export const NOTIFICATION_TYPES = {
  REQUEST_PENDING: 'REQUEST_PENDING',           // Admin menerima
  REQUEST_APPROVED: 'REQUEST_APPROVED',         // Requester menerima
  REQUEST_REJECTED: 'REQUEST_REJECTED',         // Requester menerima
  ASSIGNMENT_CREATED: 'ASSIGNMENT_CREATED',     // Driver menerima
  REMINDER_24H: 'REMINDER_24H',                 // Requester + Driver
  REMINDER_2H: 'REMINDER_2H',                   // Requester + Driver
};

/**
 * Build Telegram message untuk notifikasi request pending.
 * Dikirim ke Admin/Sarpras saat ada request baru.
 */
function buildRequestPendingMessage(request) {
  return (
    '📋 *Request Jadwal Baru*\n\n' +
    `*Dari:* ${request.requesterName || 'Unknown'}\n` +
    `*Keperluan:* ${request.purpose || '-'}\n` +
    `*Tanggal:* ${formatTanggal(request.date)}\n` +
    `*Waktu:* ${request.startTime || '-'} – ${request.endTime || '-'}\n` +
    `*Kendaraan:* ${request.vehicle || '-'}\n` +
    (request.notes ? `*Catatan:* ${request.notes}\n` : '') +
    '\n_Silakan login untuk approve/reject._'
  );
}

/**
 * Build Telegram message untuk notifikasi request approved.
 * Dikirim ke Requester/Bidang saat request di-approve.
 */
function buildRequestApprovedMessage(request, driver) {
  return (
    '✅ *Request Jadwal Disetujui*\n\n' +
    `*Keperluan:* ${request.purpose || '-'}\n` +
    `*Tanggal:* ${formatTanggal(request.date)}\n` +
    `*Waktu:* ${request.startTime || '-'} – ${request.endTime || '-'}\n` +
    `*Driver:* ${driver || request.driver || 'TBD'}\n` +
    `*Kendaraan:* ${request.vehicle || '-'}\n` +
    (request.notes ? `*Catatan:* ${request.notes}\n` : '') +
    '\n✨ Jadwal Anda telah dikonfirmasi!'
  );
}

/**
 * Build Telegram message untuk notifikasi request rejected.
 * Dikirim ke Requester/Bidang saat request di-reject.
 */
function buildRequestRejectedMessage(request) {
  return (
    '❌ *Request Jadwal Ditolak*\n\n' +
    `*Keperluan:* ${request.purpose || '-'}\n` +
    `*Tanggal:* ${formatTanggal(request.date)}\n` +
    `*Waktu:* ${request.startTime || '-'} – ${request.endTime || '-'}\n\n` +
    '_Silakan buat request baru atau hubungi admin._'
  );
}

/**
 * Build Telegram message untuk notifikasi assignment baru.
 * Dikirim ke Driver saat mendapat assignment.
 */
function buildAssignmentCreatedMessage(assignment, requester) {
  return (
    '🚗 *Assignment Baru*\n\n' +
    `*Dari:* ${requester || 'Bidang'}\n` +
    `*Tanggal:* ${assignment.date || '-'}\n` +
    `*Waktu:* ${assignment.startTime || '-'} - ${assignment.endTime || '-'}\n` +
    `*Tujuan:* ${assignment.destination || '-'}\n` +
    `*Kendaraan:* ${assignment.vehicle || '-'}\n` +
    `*Catatan:* ${assignment.notes || '(tidak ada)'}\n\n` +
    '_Check dashboard Anda untuk detail lebih lanjut_'
  );
}

/**
 * Build Telegram message untuk reminder H-1 (24 jam sebelum).
 * Dikirim ke Requester + Driver.
 */
function buildReminder24hMessage(assignment) {
  return (
    '🔔 *Reminder Jadwal – Besok*\n\n' +
    `*Keperluan:* ${assignment.purpose || assignment.destination || '-'}\n` +
    `*Tanggal:* ${formatTanggal(assignment.date)}\n` +
    `*Waktu:* ${assignment.startTime || '-'} – ${assignment.endTime || '-'}\n` +
    `*Driver:* ${assignment.driver || '-'}\n` +
    `*Kendaraan:* ${assignment.vehicle || '-'}\n` +
    (assignment.notes ? `*Catatan:* ${assignment.notes}\n` : '') +
    '\n⏰ Jadwal Anda besok. Pastikan semua siap!'
  );
}

/**
 * Build Telegram message untuk reminder 2 jam sebelumnya.
 * Dikirim ke Requester + Driver.
 */
function buildReminder2hMessage(assignment) {
  return (
    '⏰ *Reminder Jadwal - 2 Jam Lagi*\n\n' +
    `*Tanggal:* ${assignment.date || '-'}\n` +
    `*Waktu:* ${assignment.startTime || '-'} - ${assignment.endTime || '-'}\n` +
    `*Tujuan:* ${assignment.destination || '-'}\n` +
    `*Driver:* ${assignment.driver || '-'}\n` +
    `*Kendaraan:* ${assignment.vehicle || '-'}\n\n` +
    '🚗 Keberangkatan dalam 2 jam. Siap-siap ya!'
  );
}

/**
 * Send notifikasi ke admin saat ada request baru.
 * @param {Object} request - Request object
 * @param {Object} adminUser - Admin user object
 */
export async function notifyAdminNewRequest(request, adminUser) {
  if (!adminUser || !adminUser.notificationsEnabled) return null;

  const message = buildRequestPendingMessage(request);

  try {
    return await sendNotification(adminUser, message);
  } catch (error) {
    console.error('notifyAdminNewRequest error:', error);
    return { error: String(error?.message || error) };
  }
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
 * Send notifikasi ke driver saat mendapat assignment baru.
 * @param {Object} assignment - Assignment object
 * @param {Object} driverUser - Driver user object
 * @param {string} requesterName - Nama requester/bidang
 */
export async function notifyDriverAssignment(assignment, driverUser, requesterName) {
  if (!driverUser || !driverUser.notificationsEnabled) return null;

  const message = buildAssignmentCreatedMessage(assignment, requesterName);

  try {
    return await sendNotification(driverUser, message);
  } catch (error) {
    console.error('notifyDriverAssignment error:', error);
    return { error: String(error?.message || error) };
  }
}

/**
 * Send reminder 24 jam sebelum keberangkatan.
 * Dikirim ke requester + driver.
 * @param {Object} assignment - Assignment object
 * @param {Object} requesterUser - Requester user object
 * @param {Object} driverUser - Driver user object
 */
export async function sendReminder24h(assignment, requesterUser, driverUser) {
  const message = buildReminder24hMessage(assignment);
  const results = [];

  if (requesterUser && requesterUser.notificationsEnabled) {
    try {
      const result = await sendNotification(requesterUser, message);
      results.push({ recipient: 'requester', result });
    } catch (error) {
      console.error('sendReminder24h to requester failed:', error);
      results.push({ recipient: 'requester', error: String(error?.message || error) });
    }
  }

  if (driverUser && driverUser.notificationsEnabled) {
    try {
      const result = await sendNotification(driverUser, message);
      results.push({ recipient: 'driver', result });
    } catch (error) {
      console.error('sendReminder24h to driver failed:', error);
      results.push({ recipient: 'driver', error: String(error?.message || error) });
    }
  }

  return results.length > 0 ? results : null;
}

/**
 * Send reminder 2 jam sebelum keberangkatan.
 * Dikirim ke requester + driver.
 * @param {Object} assignment - Assignment object
 * @param {Object} requesterUser - Requester user object
 * @param {Object} driverUser - Driver user object
 */
export async function sendReminder2h(assignment, requesterUser, driverUser) {
  const message = buildReminder2hMessage(assignment);
  const results = [];

  if (requesterUser && requesterUser.notificationsEnabled) {
    try {
      const result = await sendNotification(requesterUser, message);
      results.push({ recipient: 'requester', result });
    } catch (error) {
      console.error('sendReminder2h to requester failed:', error);
      results.push({ recipient: 'requester', error: String(error?.message || error) });
    }
  }

  if (driverUser && driverUser.notificationsEnabled) {
    try {
      const result = await sendNotification(driverUser, message);
      results.push({ recipient: 'driver', result });
    } catch (error) {
      console.error('sendReminder2h to driver failed:', error);
      results.push({ recipient: 'driver', error: String(error?.message || error) });
    }
  }

  return results.length > 0 ? results : null;
}

/**
 * Generic notification sender untuk extensibility.
 * Useful untuk custom messages atau future event types.
 * @param {string} type - Notification type (dari NOTIFICATION_TYPES)
 * @param {Object} users - { requester, admin, driver, etc }
 * @param {Object} data - Request/Assignment data
 */
export async function sendNotificationByType(type, users, data) {
  let results = [];

  switch (type) {
    case NOTIFICATION_TYPES.REQUEST_PENDING:
      if (users.admin) {
        const result = await notifyAdminNewRequest(data.request, users.admin);
        if (result) results.push({ type, recipient: 'admin', result });
      }
      break;

    case NOTIFICATION_TYPES.REQUEST_APPROVED:
      if (users.requester) {
        const result = await notifyRequesterApproved(data.request, users.requester, data.driverName);
        if (result) results.push({ type, recipient: 'requester', result });
      }
      break;

    case NOTIFICATION_TYPES.REQUEST_REJECTED:
      if (users.requester) {
        const result = await notifyRequesterRejected(data.request, users.requester, data.reason);
        if (result) results.push({ type, recipient: 'requester', result });
      }
      break;

    case NOTIFICATION_TYPES.ASSIGNMENT_CREATED:
      if (users.driver) {
        const result = await notifyDriverAssignment(data.assignment, users.driver, data.requesterName);
        if (result) results.push({ type, recipient: 'driver', result });
      }
      break;

    case NOTIFICATION_TYPES.REMINDER_24H:
      const results24h = await sendReminder24h(data.assignment, users.requester, users.driver);
      if (results24h) results = results.concat(results24h.map(r => ({ type, ...r })));
      break;

    case NOTIFICATION_TYPES.REMINDER_2H:
      const results2h = await sendReminder2h(data.assignment, users.requester, users.driver);
      if (results2h) results = results.concat(results2h.map(r => ({ type, ...r })));
      break;

    default:
      console.warn(`Unknown notification type: ${type}`);
  }

  return results.length > 0 ? results : null;
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

/**
 * Check all assignments scheduled for tomorrow and send H-1 reminders
 * to the requester (bidang) who created each request.
 *
 * Uses localStorage to prevent duplicate sends within the same calendar day.
 * Safe to call multiple times (on load, on data change, on timer).
 *
 * @param {Array}    assignments - Current assignments array
 * @param {Array}    requests    - Current requests array (to resolve requesterId)
 * @param {Function} getUserFn  - async (username: string) => user | null
 */
export async function checkAndSendH1Reminders(assignments, requests, getUserFn) {
  if (!Array.isArray(assignments) || !Array.isArray(requests) || typeof getUserFn !== 'function') return;

  const tomorrow = getTomorrowStr();
  const state = loadH1State();

  const pending = assignments.filter(a =>
    a.date === tomorrow && a.requestId && !state.sent.includes(a.id)
  );

  if (pending.length === 0) return;

  console.log(`[H-1 Reminder] Checking ${pending.length} assignment(s) for ${tomorrow}`);

  for (const assignment of pending) {
    const origRequest = requests.find(r => r.id === assignment.requestId);

    if (!origRequest?.requesterId) {
      state.sent.push(assignment.id);
      continue;
    }

    try {
      const user = await getUserFn(origRequest.requesterId);
      if (user) {
        await sendNotification(user, buildReminder24hMessage(assignment));
        console.log(`[H-1 Reminder] Sent to ${origRequest.requesterId} for ${assignment.id}`);
      }
    } catch (err) {
      console.error(`[H-1 Reminder] Failed for ${origRequest.requesterId}:`, err);
    }

    state.sent.push(assignment.id);
  }

  saveH1State(state);
}

console.info('Notification Service module loaded');
