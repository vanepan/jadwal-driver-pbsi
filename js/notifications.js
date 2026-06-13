'use strict';

import { getUserList } from './users.js';
import { getCurrentUser } from './auth.js';

/* ── Helpers ── */

function resolveDisplayName(entry) {
  if (entry.displayName && entry.displayName !== entry.username) return entry.displayName;
  const user = getUserList().find(u => u.username === entry.username);
  return user?.displayName || entry.username;
}

function formatDateMedium(dateStr) {
  if (!dateStr) return '-';
  try {
    const [y, m, d] = String(dateStr).split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('id-ID', {
      day: 'numeric', month: 'long', year: 'numeric',
    });
  } catch { return dateStr; }
}

function escapeHTML(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function timeAgo(isoString) {
  const ms = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'Baru saja';
  if (mins < 60) return `${mins} menit lalu`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} jam lalu`;
  return new Date(isoString).toLocaleDateString('id-ID', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

/* ── Operational whitelist ── */
const OPERATIONAL_ACTIONS = new Set([
  'request_created',
  'request_approved',
  'request_rejected',
  'assignment_created',
  'assignment_completed',
  'assignment_cancelled',
]);

/* ── Action metadata — desc + optional detail rows ── */
const ACTION_META = {
  request_created: {
    title: 'Request Baru',
    desc: e => `${resolveDisplayName(e)} mengajukan request driver`,
    detail: null,
    priority: 'high',
    icon: '📋',
  },
  request_approved: {
    title: 'Request Disetujui',
    desc: e => {
      const driver = e.metadata?.driver;
      return driver
        ? `Request disetujui. Driver: ${driver}`
        : `Request disetujui oleh ${resolveDisplayName(e)}`;
    },
    detail: null,
    priority: 'medium',
    icon: '✅',
  },
  request_rejected: {
    title: 'Request Ditolak',
    desc: e => `Request ditolak oleh ${resolveDisplayName(e)}`,
    detail: null,
    priority: 'high',
    icon: '❌',
  },
  assignment_created: {
    title: 'Jadwal Dibuat',
    desc: e => {
      const driver = e.metadata?.driver;
      return driver ? `Driver ${driver} telah ditugaskan.` : `Jadwal baru dibuat oleh ${resolveDisplayName(e)}`;
    },
    detail: e => {
      const m = e.metadata || {};
      const rows = [];
      if (m.vehicle)    rows.push({ label: 'Kendaraan', value: m.vehicle });
      if (m.date)       rows.push({ label: 'Tanggal',   value: formatDateMedium(m.date) });
      if (m.startTime && m.endTime) rows.push({ label: 'Jam', value: `${m.startTime} – ${m.endTime}` });
      if (m.destination) rows.push({ label: 'Tujuan',   value: m.destination });
      return rows.length > 0 ? rows : null;
    },
    priority: 'medium',
    icon: '🚗',
  },
  assignment_completed: {
    title: 'Pengantaran Selesai',
    desc: e => {
      const driver = e.metadata?.driver || e.metadata?.completedBy;
      return driver
        ? `Driver ${driver} telah menyelesaikan penugasan.`
        : 'Penugasan telah diselesaikan.';
    },
    detail: e => {
      const m = e.metadata || {};
      const rows = [];
      if (m.vehicle)     rows.push({ label: 'Kendaraan', value: m.vehicle });
      if (m.date)        rows.push({ label: 'Tanggal',   value: formatDateMedium(m.date) });
      if (m.destination) rows.push({ label: 'Tujuan',    value: m.destination });
      return rows.length > 0 ? rows : null;
    },
    priority: 'medium',
    icon: '✔️',
  },
  assignment_cancelled: {
    title: 'Assignment Dibatalkan',
    desc: e => {
      const by = e.metadata?.cancelledByName || resolveDisplayName(e);
      return `Assignment dibatalkan oleh ${by}.`;
    },
    detail: e => {
      const m = e.metadata || {};
      const rows = [];
      if (m.destination) rows.push({ label: 'Tujuan',    value: m.destination });
      if (m.vehicle)     rows.push({ label: 'Kendaraan', value: m.vehicle });
      if (m.date)        rows.push({ label: 'Tanggal',   value: formatDateMedium(m.date) });
      if (m.reason)      rows.push({ label: 'Alasan',    value: m.reason });
      return rows.length > 0 ? rows : null;
    },
    priority: 'high',
    icon: '✕',
  },
};

/* ── Read state ── */
const READ_AT_KEY = 'pbsi_notif_read_at';

let allLogs = [];
let pendingCount = 0;

function getReadAt() {
  try { return parseInt(localStorage.getItem(READ_AT_KEY), 10) || 0; } catch { return 0; }
}

function markAllRead() {
  try { localStorage.setItem(READ_AT_KEY, String(Date.now())); } catch {}
}

/* ── Visibility filter ── */

function filterOperational(logs) {
  return logs.filter(e => OPERATIONAL_ACTIONS.has(e.action));
}

/**
 * Returns true if this log entry is visible to the given user based on role and ownership.
 *
 * Admin   — sees everything.
 * Bidang  — sees own request events and assignments originating from own requests.
 * Driver  — sees own assignments (matched on driver display name).
 * Viewer  — no notifications (read-only access, no action context).
 */
function isVisibleToUser(entry, user) {
  if (!user) return false;
  const { role, username, name } = user;

  if (role === 'admin') return true;

  const action = entry.action;
  const meta   = entry.metadata || {};

  if (role === 'bidang') {
    switch (action) {
      case 'request_created':
        // Bidang sees their own submissions (they are the actor)
        return entry.username === username;
      case 'request_approved':
      case 'request_rejected':
        // Admin acted on their request — match via stored requesterId
        return meta.requesterId === username;
      case 'assignment_created':
      case 'assignment_completed':
      case 'assignment_cancelled':
        // Assignment originated from their request
        return meta.requesterId === username;
      default:
        return false;
    }
  }

  if (role === 'driver') {
    switch (action) {
      case 'assignment_created':
      case 'assignment_completed':
      case 'assignment_cancelled':
        // Prefer stable username match (new log entries carry driverUsername).
        // Fall back to display name for log entries written before this fix.
        if (meta.driverUsername) return meta.driverUsername === username;
        return meta.driver === name;
      default:
        return false;
    }
  }

  return false;
}

function filterForCurrentUser(logs) {
  const user = getCurrentUser();
  return filterOperational(logs).filter(e => isVisibleToUser(e, user));
}

function countUnread(filteredLogs) {
  const readAt = getReadAt();
  return filteredLogs.filter(e => new Date(e.timestamp).getTime() > readAt).length;
}

/* ── Badge ── */

function renderNotificationBadge() {
  const badge      = document.getElementById('notificationDot');
  const btn        = document.getElementById('btnNotifications');
  const bottomDot  = document.getElementById('bottomNavNotifDot');
  const headerDot  = document.getElementById('headerNotifDot');
  if (!btn || !badge) return;

  const visible = filterForCurrentUser(allLogs);
  const unread  = countUnread(visible);
  const total   = pendingCount + unread;

  badge.style.display = total > 0 ? 'inline-flex' : 'none';
  badge.textContent   = total > 0 ? String(total) : '';

  if (bottomDot) bottomDot.style.display = total > 0 ? 'inline-block' : 'none';
  if (headerDot) headerDot.style.display = total > 0 ? 'block' : 'none';
}

/* ── Card renderer ── */

function buildDetailHtml(detailFn, entry) {
  if (!detailFn) return '';
  const rows = detailFn(entry);
  if (!rows || rows.length === 0) return '';
  return `<div class="notif-card-details">${
    rows.map(r => `
      <div class="notif-card-row">
        <span class="notif-card-label">${escapeHTML(r.label)}</span>
        <span class="notif-card-value">${escapeHTML(r.value)}</span>
      </div>`).join('')
  }</div>`;
}

function renderCard(entry, isUnread) {
  const meta = ACTION_META[entry.action];
  if (!meta) return '';
  return `
    <div class="notif-card notif-priority-${meta.priority}${isUnread ? ' notif-unread' : ''}">
      <div class="notif-card-top">
        <span class="notif-card-title">${meta.icon} ${escapeHTML(meta.title)}${isUnread ? '<span class="notif-new-dot"></span>' : ''}</span>
        <span class="notif-card-time">${escapeHTML(timeAgo(entry.timestamp))}</span>
      </div>
      <div class="notif-card-desc">${escapeHTML(meta.desc(entry))}</div>
      ${buildDetailHtml(meta.detail, entry)}
    </div>`;
}

/* ── Notification Center render ── */

function renderNotificationsList() {
  const container = document.getElementById('notificationsContent');
  if (!container) return;

  const readAt  = getReadAt();
  const visible = filterForCurrentUser(allLogs).slice(0, 30);

  if (visible.length === 0) {
    container.innerHTML = '<div class="empty-request-state">Belum ada notifikasi untuk Anda.</div>';
    return;
  }

  const unread  = visible.filter(e => new Date(e.timestamp).getTime() > readAt);
  const history = visible.filter(e => new Date(e.timestamp).getTime() <= readAt);

  let html = '';

  if (unread.length > 0) {
    html += `<div class="notif-section-header">Belum Dibaca (${unread.length})</div>`;
    html += unread.map(e => renderCard(e, true)).join('');
  }

  if (history.length > 0) {
    html += `<div class="notif-section-header${unread.length > 0 ? ' notif-section-header--gap' : ''}">Riwayat</div>`;
    html += history.map(e => renderCard(e, false)).join('');
  }

  container.innerHTML = html;
}

/* ── Init ── */

export function initNotificationUI() {
  document.getElementById('btnNotifications')
    ?.addEventListener('click', ev => {
      ev.preventDefault();
      ev.stopPropagation();
      ev.stopImmediatePropagation();
      openNotificationsModal();
    });

  document.getElementById('btnHeaderNotif')
    ?.addEventListener('click', ev => {
      ev.preventDefault();
      ev.stopPropagation();
      openNotificationsModal();
    });

  document.getElementById('btnCloseNotifications')
    ?.addEventListener('click', closeNotificationsModal);
  document.getElementById('btnCloseNotifications2')
    ?.addEventListener('click', closeNotificationsModal);
  document.getElementById('modalNotifications')
    ?.addEventListener('click', ev => { if (ev.target === ev.currentTarget) closeNotificationsModal(); });

  document.getElementById('btnMarkAllRead')
    ?.addEventListener('click', () => {
      markAllRead();
      renderNotificationBadge();
      renderNotificationsList();
    });

  document.getElementById('btnOpenActivityLog')
    ?.addEventListener('click', () => {
      closeNotificationsModal();
      openActivityLogModal();
    });

  document.getElementById('btnCloseActivityLog')
    ?.addEventListener('click', closeActivityLogModal);
  document.getElementById('btnCloseActivityLog2')
    ?.addEventListener('click', closeActivityLogModal);
  document.getElementById('modalActivityLog')
    ?.addEventListener('click', ev => { if (ev.target === ev.currentTarget) closeActivityLogModal(); });
}

/* ── Data ── */

export function setNotificationData({ pendingRequests = 0, recentLogs = [] }) {
  pendingCount = Number(pendingRequests) || 0;
  allLogs = Array.isArray(recentLogs) ? recentLogs : [];
  renderNotificationBadge();
}

/* ── Modal open / close ── */

export function openNotificationsModal() {
  // Log Aktivitas is admin-only — hide the button for all other roles
  const actLogBtn = document.getElementById('btnOpenActivityLog');
  if (actLogBtn) {
    actLogBtn.style.display = getCurrentUser()?.role === 'admin' ? '' : 'none';
  }

  renderNotificationsList();
  markAllRead();
  renderNotificationBadge();
  const modal = document.getElementById('modalNotifications');
  if (modal) modal.style.display = 'flex';
}

export function closeNotificationsModal() {
  const modal = document.getElementById('modalNotifications');
  if (modal) modal.style.display = 'none';
}

/* ── Activity Log ── */

export function openActivityLogModal() {
  if (getCurrentUser()?.role !== 'admin') return;
  renderActivityLog();
  const modal = document.getElementById('modalActivityLog');
  if (modal) modal.style.display = 'flex';
}

export function closeActivityLogModal() {
  const modal = document.getElementById('modalActivityLog');
  if (modal) modal.style.display = 'none';
}

function renderActivityLog() {
  const container = document.getElementById('activityLogContent');
  if (!container) return;

  if (allLogs.length === 0) {
    container.innerHTML = '<div class="empty-request-state">Belum ada log aktivitas.</div>';
    return;
  }

  container.innerHTML = allLogs.slice(0, 100).map(entry => {
    const timeLabel = escapeHTML(new Date(entry.timestamp).toLocaleString('id-ID', {
      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    }));
    return `
      <div class="activity-log-item">
        <div class="activity-log-top">
          <span class="activity-log-action">${escapeHTML(entry.action)}</span>
          <span class="activity-log-time">${timeLabel}</span>
        </div>
        <div class="activity-log-user">oleh <strong>${escapeHTML(entry.username)}</strong>${entry.targetId ? ` · ID: ${escapeHTML(entry.targetId)}` : ''}</div>
      </div>`;
  }).join('');
}
