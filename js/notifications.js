'use strict';

let logs = [];
let pendingCount = 0;

export function initNotificationUI() {
  const btnNotifications = document.getElementById('btnNotifications');
  const btnCloseNotifications = document.getElementById('btnCloseNotifications');
  const btnCloseNotifications2 = document.getElementById('btnCloseNotifications2');
  const modal = document.getElementById('modalNotifications');

  if (btnNotifications) {
    btnNotifications.addEventListener('click', openNotificationsModal);
  }

  if (btnCloseNotifications) {
    btnCloseNotifications.addEventListener('click', closeNotificationsModal);
  }

  if (btnCloseNotifications2) {
    btnCloseNotifications2.addEventListener('click', closeNotificationsModal);
  }

  if (modal) {
    modal.addEventListener('click', (event) => {
      if (event.target === modal) closeNotificationsModal();
    });
  }
}

export function setNotificationData({ pendingRequests = 0, recentLogs = [] }) {
  pendingCount = Number(pendingRequests) || 0;
  logs = Array.isArray(recentLogs) ? recentLogs : [];
  renderNotificationBadge();
}

function renderNotificationBadge() {
  const badge = document.getElementById('notificationDot');
  const btnNotifications = document.getElementById('btnNotifications');

  if (!btnNotifications || !badge) return;

  const showBadge = pendingCount > 0 || logs.some(entry => {
    const ageMinutes = (Date.now() - new Date(entry.timestamp).getTime()) / 60000;
    return ageMinutes <= 60;
  });

  badge.style.display = showBadge ? 'inline-flex' : 'none';
  badge.textContent = pendingCount > 0 ? String(pendingCount) : '';
}

function openNotificationsModal() {
  renderNotificationsList();
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

  if (logs.length === 0) {
    container.innerHTML = '<div class="empty-request-state">Belum ada notifikasi terbaru.</div>';
    return;
  }

  container.innerHTML = logs.slice(0, 10).map(entry => {
    const timeLabel = new Date(entry.timestamp).toLocaleString('id-ID', {
      hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short'
    });
    return `
      <div class="notification-item">
        <div class="notification-meta">
          <strong>${escapeHTML(entry.username)}</strong>
          <span>${escapeHTML(entry.action)}</span>
        </div>
        <div class="notification-time">${escapeHTML(timeLabel)}</div>
        ${entry.targetId ? `<div class="notification-target">ID: ${escapeHTML(entry.targetId)}</div>` : ''}
      </div>
    `;
  }).join('');
}

function escapeHTML(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
