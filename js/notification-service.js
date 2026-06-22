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
import { getSetting }        from './settings-store.js';
import { vehicleLabel }      from './utils.js';

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

function getTodayStr() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}

function getTomorrowStr() {
  const t = new Date();
  t.setDate(t.getDate() + 1);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}

/* ── Unified reminder deduplication (date-keyed, auto-expires daily) ── */
const REMINDERS_KEY = 'pbsi_reminders';

function loadRemindersState() {
  try {
    const raw = JSON.parse(localStorage.getItem(REMINDERS_KEY)) || {};
    return raw.date === getTodayStr() ? { ...raw, sent: raw.sent || [] } : { date: getTodayStr(), sent: [] };
  } catch {
    return { date: getTodayStr(), sent: [] };
  }
}

function saveRemindersState(state) {
  try { localStorage.setItem(REMINDERS_KEY, JSON.stringify(state)); } catch { /* ignore */ }
}

function isReminderSent(state, key) { return state.sent.includes(key); }
function markReminderSent(state, key) { if (!state.sent.includes(key)) state.sent.push(key); }

/* ── Driver user lookup (match by displayName or username, role=driver) ── */
function findDriverUser(allUsers, driverName) {
  if (!driverName || !Array.isArray(allUsers)) return null;
  const name = String(driverName).trim().toLowerCase();
  return allUsers.find(u =>
    u.role === 'driver' && u.active !== false &&
    ((u.displayName || '').trim().toLowerCase() === name ||
     (u.username || '').trim().toLowerCase() === name)
  ) || null;
}

/* ── Minutes from now until assignment starts (null if not today) ── */
function minutesUntilStart(assignment) {
  if (!assignment?.date || !assignment?.startTime) return null;
  if (assignment.date !== getTodayStr()) return null;
  const [h, m] = assignment.startTime.split(':').map(Number);
  const now = new Date();
  return (h * 60 + m) - (now.getHours() * 60 + now.getMinutes());
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
    `*Kendaraan:* ${vehicleLabel(assignment.vehicle)}\n` +
    `*Catatan:* ${assignment.notes || '(tidak ada)'}\n\n` +
    '_Check dashboard Anda untuk detail lebih lanjut_'
  );
}

/**
 * Build Telegram message untuk notifikasi pembatalan assignment (v1.10.7).
 * Dikirim ke pihak terkait (driver + admin/requester tergantung pembatal).
 */
function buildAssignmentCancelledMessage(assignment, { reason, cancelledByName } = {}) {
  return (
    '🚫 *Assignment Dibatalkan*\n\n' +
    `*Tujuan:* ${assignment.destination || '-'}\n` +
    `*Tanggal:* ${formatTanggal(assignment.date)}\n` +
    `*Waktu:* ${assignment.startTime || '-'} – ${assignment.endTime || '-'}\n` +
    `*Driver:* ${assignment.driver || '-'}\n` +
    `*Kendaraan:* ${vehicleLabel(assignment.vehicle)}\n` +
    `*Dibatalkan oleh:* ${cancelledByName || '-'}\n` +
    `*Alasan:* ${reason || '-'}\n`
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
    `*Kendaraan:* ${vehicleLabel(assignment.vehicle)}\n` +
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
    `*Kendaraan:* ${vehicleLabel(assignment.vehicle)}\n\n` +
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
 * Notify all active admin users when a new request comes in from bidang.
 * Sends to every admin who has notificationsEnabled.
 *
 * @param {Object}   request     - The new request object
 * @param {Function} getAllUsersFn - async () => user[]
 */
export async function sendNewRequestNotificationToAdmins(request, getAllUsersFn) {
  if (!request || typeof getAllUsersFn !== 'function') return;
  try {
    const allUsers = await getAllUsersFn();
    const admins = allUsers.filter(u => u.role === 'admin' && u.active !== false && u.notificationsEnabled);
    for (const admin of admins) {
      try {
        await sendNotification(admin, buildRequestPendingMessage(request));
        console.log('[Notif] New request → sent to admin', admin.username);
      } catch (err) {
        console.error('[Notif] Admin notify failed for', admin.username, err);
      }
    }
  } catch (err) {
    console.error('[Notif] sendNewRequestNotificationToAdmins failed:', err);
  }
}

/**
 * Notify the driver when a new assignment is created for them.
 * Matches the driver by displayName or username (role=driver).
 *
 * @param {Object}   assignment  - The new assignment object
 * @param {Function} getAllUsersFn - async () => user[]
 */
export async function sendNewAssignmentNotificationToDriver(assignment, getAllUsersFn) {
  if (!assignment?.driver || typeof getAllUsersFn !== 'function') return;
  try {
    const allUsers = await getAllUsersFn();
    const driverUser = findDriverUser(allUsers, assignment.driver);
    if (!driverUser) return;
    const requesterName = assignment.pic || assignment.approvedBy || '';
    await notifyDriverAssignment(assignment, driverUser, requesterName);
    console.log('[Notif] New assignment → sent to driver', assignment.driver);
  } catch (err) {
    console.error('[Notif] sendNewAssignmentNotificationToDriver failed:', err);
  }
}

/**
 * Notify affected parties when an assignment is cancelled (v1.10.7).
 *
 * Recipients depend on who cancelled:
 *   - Cancelled by Bidang → Admin(s) + assigned Driver
 *   - Cancelled by Admin  → Requester (Bidang) + assigned Driver
 * The driver is always notified. Fire-and-forget safe.
 *
 * @param {Object}   assignment  - The cancelled assignment
 * @param {Object}   info        - { reason, cancelledByRole, cancelledByName }
 * @param {Function} getUserByUsernameFn - async (username) => user | null
 * @param {Function} getAllUsersFn       - async () => user[]
 * @param {Array}    requests    - Current requests (resolve requesterId)
 */
export async function sendAssignmentCancelledNotification(assignment, info, getUserByUsernameFn, getAllUsersFn, requests) {
  if (!assignment || typeof getAllUsersFn !== 'function') return;
  const { cancelledByRole } = info || {};
  const message = buildAssignmentCancelledMessage(assignment, info || {});

  try {
    const allUsers = await getAllUsersFn().catch(() => []);

    // Always notify the assigned driver.
    const driverUser = findDriverUser(allUsers, assignment.driver);
    if (driverUser?.notificationsEnabled) {
      try { await sendNotification(driverUser, message); }
      catch (err) { console.error('[Notif] Cancel → driver failed:', err); }
    }

    if (cancelledByRole === 'bidang') {
      // Notify all active admins.
      const admins = allUsers.filter(u => u.role === 'admin' && u.active !== false && u.notificationsEnabled);
      for (const admin of admins) {
        try { await sendNotification(admin, message); }
        catch (err) { console.error('[Notif] Cancel → admin failed:', err); }
      }
    } else {
      // Cancelled by admin (or other) → notify requester (bidang) of the source request.
      const origRequest = assignment.requestId && Array.isArray(requests)
        ? requests.find(r => r.id === assignment.requestId)
        : null;
      if (origRequest?.requesterId && typeof getUserByUsernameFn === 'function') {
        try {
          const requester = await getUserByUsernameFn(origRequest.requesterId);
          if (requester?.notificationsEnabled) await sendNotification(requester, message);
        } catch (err) {
          console.error('[Notif] Cancel → requester failed:', err);
        }
      }
    }
  } catch (err) {
    console.error('[Notif] sendAssignmentCancelledNotification failed:', err);
  }
}

/**
 * Send H-1 day reminders for assignments scheduled tomorrow.
 * Notifies both the requester (bidang) and the driver.
 * Deduplicates via localStorage; safe to call multiple times.
 *
 * @param {Array}    assignments      - Current assignments
 * @param {Array}    requests         - Current requests (to resolve requesterId)
 * @param {Function} getUserByUsernameFn - async (username) => user | null
 * @param {Function} getAllUsersFn       - async () => user[]
 */
export async function checkAndSendH1Reminders(assignments, requests, getUserByUsernameFn, getAllUsersFn) {
  if (!Array.isArray(assignments) || !Array.isArray(requests)) return;

  const tomorrow = getTomorrowStr();
  const state = loadRemindersState();

  const pending = assignments.filter(a =>
    a.date === tomorrow && a.status !== 'cancelled' && !isReminderSent(state, `${a.id}:h1`)
  );

  if (pending.length === 0) return;
  console.log(`[H-1] Checking ${pending.length} assignment(s) for ${tomorrow}`);

  const allUsers = typeof getAllUsersFn === 'function' ? await getAllUsersFn().catch(() => []) : [];

  for (const assignment of pending) {
    const msg = buildReminder24hMessage(assignment);

    // Notify requester (bidang) if created from a request
    if (assignment.requestId && typeof getUserByUsernameFn === 'function') {
      const origRequest = requests.find(r => r.id === assignment.requestId);
      if (origRequest?.requesterId) {
        try {
          const user = await getUserByUsernameFn(origRequest.requesterId);
          if (user) {
            await sendNotification(user, msg);
            console.log(`[H-1] Requester notified: ${origRequest.requesterId}`);
          }
        } catch (err) {
          console.error(`[H-1] Requester notify failed (${origRequest.requesterId}):`, err);
        }
      }
    }

    // Notify driver
    const driverUser = findDriverUser(allUsers, assignment.driver);
    if (driverUser) {
      try {
        await sendNotification(driverUser, msg);
        console.log(`[H-1] Driver notified: ${assignment.driver}`);
      } catch (err) {
        console.error(`[H-1] Driver notify failed (${assignment.driver}):`, err);
      }
    }

    markReminderSent(state, `${assignment.id}:h1`);
  }

  saveRemindersState(state);
}

/**
 * Send ~2-hour-ahead reminders for assignments starting today.
 * Checks assignments where startTime is within the configured h2 reminder window.
 * Notifies both the requester (bidang) and the driver.
 * Deduplicates via localStorage; safe to call every 5 minutes.
 *
 * @param {Array}    assignments      - Current assignments
 * @param {Array}    requests         - Current requests
 * @param {Function} getUserByUsernameFn - async (username) => user | null
 * @param {Function} getAllUsersFn       - async () => user[]
 */
export async function checkAndSendHoursReminders(assignments, requests, getUserByUsernameFn, getAllUsersFn) {
  if (!Array.isArray(assignments) || !Array.isArray(requests)) return;

  const state = loadRemindersState();

  const pending = assignments.filter(a => {
    if (a.status === 'cancelled') return false;
    const mins = minutesUntilStart(a);
    return mins !== null && mins >= getSetting('notifications.h2WindowMinFrom') && mins <= getSetting('notifications.h2WindowMinTo') && !isReminderSent(state, `${a.id}:h2`);
  });

  if (pending.length === 0) return;
  console.log(`[H-2] ${pending.length} assignment(s) starting in ~2 hours`);

  const allUsers = typeof getAllUsersFn === 'function' ? await getAllUsersFn().catch(() => []) : [];

  for (const assignment of pending) {
    const msg = buildReminder2hMessage(assignment);

    // Notify driver
    const driverUser = findDriverUser(allUsers, assignment.driver);
    if (driverUser) {
      try {
        await sendNotification(driverUser, msg);
        console.log(`[H-2] Driver notified: ${assignment.driver}`);
      } catch (err) {
        console.error(`[H-2] Driver notify failed (${assignment.driver}):`, err);
      }
    }

    // Notify requester (bidang)
    if (assignment.requestId && typeof getUserByUsernameFn === 'function') {
      const origRequest = requests.find(r => r.id === assignment.requestId);
      if (origRequest?.requesterId) {
        try {
          const user = await getUserByUsernameFn(origRequest.requesterId);
          if (user) {
            await sendNotification(user, msg);
            console.log(`[H-2] Requester notified: ${origRequest.requesterId}`);
          }
        } catch (err) {
          console.error(`[H-2] Requester notify failed (${origRequest.requesterId}):`, err);
        }
      }
    }

    markReminderSent(state, `${assignment.id}:h2`);
  }

  saveRemindersState(state);
}

console.info('Notification Service module loaded');
