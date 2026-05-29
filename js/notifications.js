'use strict';

/* ── Operational whitelist: only these actions appear in the notification center ── */
const OPERATIONAL_ACTIONS = new Set([
  'request_created',
  'request_approved',
  'request_rejected',
  'assignment_created',
  'assignment_completed',
]);

const ACTION_META = {
  request_created: {
    title: 'Request Baru',
    desc: e => `${e.displayName || e.username} mengajukan request driver`,
    priority: 'high',
    icon: '📋',
  },
  request_approved: {
    title: 'Request Disetujui',
    desc: e => `Request disetujui oleh ${e.displayName || e.username}`,
    priority: 'medium',
    icon: '✅',
  },
  request_rejected: {
    title: 'Request Ditolak',
    desc: e => `Request ditolak oleh ${e.displayName || e.username}`,
    priority: 'high',
    icon: '❌',
  },
  assignment_created: {
    title: 'Jadwal Dibuat',
    desc: e => `Jadwal baru dibuat oleh ${e.displayName || e.username}${e.metadata?.date ? ` untuk ${e.metadata.date}` : ''}`,
    priority: 'medium',
    icon: '🚗',
  },
  assignment_completed: {
    title: 'Pengantaran Selesai',
    desc: e => `Penugasan diselesaikan${e.metadata?.completedBy ? ` oleh ${e.metadata.completedBy}` : ''}`,
    priority: 'medium',
    icon: '✔️',
  },
};

const READ_AT_KEY = 'pbsi_notif_read_at';

let allLogs = [];
let pendingCount = 0;

function getReadAt() {
  try { return parseInt(localStorage.getItem(READ_AT_KEY), 10) || 0; } catch { return 0; }
}

function markAllRead() {
  try { localStorage.setItem(READ_AT_KEY, String(Date.now())); } catch {}
}

function filterOperational(logs) {
  return logs.filter(e => OPERATIONAL_ACTIONS.has(e.action));
}

function countUnread(operationalLogs) {
  const readAt = getReadAt();
  return operationalLogs.filter(e => new Date(e.timestamp).getTime() > readAt).length;
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

function escapeHTML(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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

/* ── Badge ── */

function renderNotificationBadge() {
  const badge = document.getElementById('notificationDot');
  const btn = document.getElementById('btnNotifications');
  if (!btn || !badge) return;

  const unread = countUnread(filterOperational(allLogs));
  const total = pendingCount + unread;
  badge.style.display = total > 0 ? 'inline-flex' : 'none';
  badge.textContent = total > 0 ? String(total) : '';
}

/* ── Notification Center ── */

export function openNotificationsModal() {
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

function renderNotificationsList() {
  const container = document.getElementById('notificationsContent');
  if (!container) return;

  const operational = filterOperational(allLogs).slice(0, 20);

  if (operational.length === 0) {
    container.innerHTML = '<div class="empty-request-state">Belum ada notifikasi operasional.</div>';
    return;
  }

  container.innerHTML = operational.map(entry => {
    const meta = ACTION_META[entry.action];
    if (!meta) return '';
    return `
      <div class="notif-card notif-priority-${meta.priority}">
        <div class="notif-card-top">
          <span class="notif-card-title">${meta.icon} ${escapeHTML(meta.title)}</span>
          <span class="notif-card-time">${escapeHTML(timeAgo(entry.timestamp))}</span>
        </div>
        <div class="notif-card-desc">${escapeHTML(meta.desc(entry))}</div>
      </div>
    `;
  }).join('');
}

/* ── Activity Log ── */

export function openActivityLogModal() {
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
      </div>
    `;
  }).join('');
}
