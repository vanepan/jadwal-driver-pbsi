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
    `*Tanggal:* ${request.date || '-'}\n` +
    `*Waktu:* ${request.startTime || '-'} - ${request.endTime || '-'}\n` +
    `*Tujuan:* ${request.destination || '-'}\n` +
    `*Kendaraan:* ${request.vehicle || '-'}\n` +
    `*Catatan:* ${request.notes || '(tidak ada)'}\n\n` +
    '_Silakan login untuk approve/reject_'
  );
}

/**
 * Build Telegram message untuk notifikasi request approved.
 * Dikirim ke Requester/Bidang saat request di-approve.
 */
function buildRequestApprovedMessage(request, driver) {
  return (
    '✅ *Request Approved*\n\n' +
    `*Tanggal:* ${request.date || '-'}\n` +
    `*Waktu:* ${request.startTime || '-'} - ${request.endTime || '-'}\n` +
    `*Tujuan:* ${request.destination || '-'}\n` +
    `*Driver:* ${driver || 'TBD'}\n` +
    `*Kendaraan:* ${request.vehicle || '-'}\n\n` +
    '✨ Jadwal Anda telah dikonfirmasi!'
  );
}

/**
 * Build Telegram message untuk notifikasi request rejected.
 * Dikirim ke Requester/Bidang saat request di-reject.
 */
function buildRequestRejectedMessage(request, reason) {
  return (
    '❌ *Request Ditolak*\n\n' +
    `*Tanggal:* ${request.date || '-'}\n` +
    `*Waktu:* ${request.startTime || '-'} - ${request.endTime || '-'}\n` +
    `*Tujuan:* ${request.destination || '-'}\n\n` +
    `*Alasan:* ${reason || '(tidak ada keterangan)'}\n\n` +
    '_Silakan buat request baru atau hubungi admin_'
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
    '🔔 *Reminder Jadwal - H-1*\n\n' +
    `*Tanggal:* ${assignment.date || '-'}\n` +
    `*Waktu:* ${assignment.startTime || '-'} - ${assignment.endTime || '-'}\n` +
    `*Tujuan:* ${assignment.destination || '-'}\n` +
    `*Driver:* ${assignment.driver || '-'}\n` +
    `*Kendaraan:* ${assignment.vehicle || '-'}\n\n` +
    '⏰ Jadwal Anda besok. Pastikan semua siap!'
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
export async function notifyRequesterRejected(request, requesterUser, reason) {
  if (!requesterUser || !requesterUser.notificationsEnabled) return null;

  const message = buildRequestRejectedMessage(request, reason);

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

console.info('Notification Service module loaded');
