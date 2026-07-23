'use strict';

import { getUserList } from './users.js';
import { getCurrentUser } from './auth.js';
import { subscribeNode, updateFirebaseData } from './firebase.js';
import { wireSheetSwipeDismiss, lockBodyScroll, unlockBodyScroll } from './ui/sheet-gesture.js'; // Phase 11K

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

/* ── Operational whitelist ──
   v1.25.x Final Hardening (Part 4 — single event pipeline): assignment_created
   / assignment_completed / assignment_cancelled were REMOVED from here. They
   now arrive exclusively through the server outbox (serverNotifs below,
   fed by the SAME functions/src/notifications/engine.js canonical event
   Push and Telegram already use) instead of this legacy /logs path — having
   BOTH render the same fact was exactly the "independent notification
   creator" duplication this hardening pass eliminates. request.*/comment_added
   are unchanged (still /logs-only; their server-side Telegram/Push cutover
   is a separate, not-yet-scoped migration). */
const OPERATIONAL_ACTIONS = new Set([
  'request_created',
  'request_approved',
  'request_rejected',
  'comment_added',
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
  // assignment_created/completed/cancelled ACTION_META removed (v1.25.x Part 4/6)
  // — those actions no longer reach this renderer (see OPERATIONAL_ACTIONS
  // above); assignment.* now renders via the generic _server branch in
  // renderCard(), with copy from functions/src/notifications/templates.js.
  comment_added: {
    title: 'Komentar Baru',
    desc: e => `${resolveDisplayName(e)} menambahkan komentar`,
    detail: e => {
      const m = e.metadata || {};
      const rows = [];
      if (m.purpose) rows.push({ label: 'Request', value: m.purpose });
      return rows.length > 0 ? rows : null;
    },
    priority: 'medium',
    icon: '💬',
  },
};

/* ── Read state ── */
const READ_AT_KEY = 'pbsi_notif_read_at';

let allLogs = [];
let pendingCount = 0;

/* ── Server notification outbox (v1.20.5, widened v1.25.x Part 4) ─────────
   The legacy bell above is /logs-based and covers Request lifecycle +
   comments only now. The notification ENGINE (Cloud Functions) persists
   every recipient's records to /notifications/{uid} — Engineering lifecycle
   AND (as of Driver Notification V2 Final Hardening) assignment lifecycle
   (created/reassigned/updated/completed/cancelled) live ONLY there; the old
   /logs-derived assignment_* entries were removed from OPERATIONAL_ACTIONS
   above specifically so this is the ONE place they render — no double-count,
   because there is no longer a second path for them to render from. */
let serverNotifs = [];            // normalized /notifications records for the current user
let _serverNotifUnsub = null;     // realtime unsubscribe
let _serverNotifUid = null;       // uid we are currently subscribed for
let _diagLastNotifAt = null;      /* DIAGNOSTIC (removable) */
let _diagLastNotifTitle = null;   /* DIAGNOSTIC (removable) */

/** Normalize a server /notifications record into the bell's entry shape. */
function normalizeServerNotif(id, rec) {
  return {
    id,
    _server: true,
    action: rec.type || 'notification',          // e.g. 'engineering.published'
    title: rec.title || 'Notifikasi',
    desc: rec.body || '',
    timestamp: rec.createdAt || new Date().toISOString(),
  };
}

/**
 * (Re)subscribe the bell to /notifications/{currentUid}. Idempotent per uid;
 * detaches cleanly on user change / logout. Safe when Firebase is unconfigured
 * (subscribeNode no-ops). Feeds the badge + list in realtime — no refresh.
 */
export function syncServerNotifications() {
  const u = getCurrentUser();
  const uid = (u && (u.username || u.id)) || null;
  if (uid === _serverNotifUid) return;                       // already current
  if (_serverNotifUnsub) { try { _serverNotifUnsub(); } catch (_) {} _serverNotifUnsub = null; }
  serverNotifs = [];
  _serverNotifUid = uid;
  if (!uid) { renderNotificationBadge(); return; }
  _serverNotifUnsub = subscribeNode(
    `notifications/${uid}`,
    (snapshot) => {
      const val = snapshot && typeof snapshot.val === 'function' ? snapshot.val() : null;
      const list = val ? Object.entries(val).map(([id, rec]) => normalizeServerNotif(id, rec)) : [];
      // Surface Engineering AND assignment lifecycle notifications from the
      // outbox (v1.25.x Part 4). request.*/comment.added stay off this list —
      // they still render via the legacy /logs bell (OPERATIONAL_ACTIONS) —
      // so nothing is double-counted in either direction.
      serverNotifs = list
        .filter((n) => String(n.action).startsWith('engineering.') || String(n.action).startsWith('assignment.'))
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      if (serverNotifs.length) {   /* DIAGNOSTIC (removable) */
        _diagLastNotifAt = Date.now(); _diagLastNotifTitle = serverNotifs[0].title;
      }
      renderNotificationBadge();
      if (document.getElementById('modalNotifications')?.style.display === 'flex') renderNotificationsList();
    },
    { onDenied: () => {}, onError: () => {} },
  );
}

/* DIAGNOSTIC (removable): read-only snapshot for the Production Diagnostic panel. */
export function getNotificationRuntimeInfo() {
  return {
    recipientUid: _serverNotifUid,
    serverCount: serverNotifs.length,
    unreadCount: serverNotifs.filter(n => !isEntryArchived(n) && !isEntryRead(n)).length,
    lastReceivedAt: _diagLastNotifAt,
    lastTitle: _diagLastNotifTitle,
    source: _serverNotifUid ? `notifications/${_serverNotifUid} (server) + /logs (legacy)` : '/logs (legacy)',
  };
}

function getReadAt() {
  try { return parseInt(localStorage.getItem(READ_AT_KEY), 10) || 0; } catch { return 0; }
}

function markAllRead() {
  try { localStorage.setItem(READ_AT_KEY, String(Date.now())); } catch {}
}

/* ── Per-item read/archive state (v1.20.8) ────────────────────────────────
   Additive sibling node, /notification_state/{uid}/{notifId}: {read, archived}.
   Mirrors the existing push_subscriptions sibling-node pattern — never touches
   /notifications itself (server-authoritative, client-write-locked). Presentation
   /state layer only; does not change what triggers a send.

   Per-item state takes priority when present; entries without it fall back to
   the legacy global READ_AT_KEY cutoff, so pre-existing notifications from
   before this feature shipped are unaffected. */
let notifState = {};             // { [notifId]: { read?: boolean, archived?: boolean } }
let _notifStateUnsub = null;
let _notifStateUid = null;
let showArchived = false;        // Notification Center: toggled view state

function isEntryRead(entry) {
  const s = notifState[entry.id];
  if (s && typeof s.read === 'boolean') return s.read;
  return new Date(entry.timestamp).getTime() <= getReadAt();
}

function isEntryArchived(entry) {
  return !!(notifState[entry.id] && notifState[entry.id].archived);
}

/** (Re)subscribe to /notification_state/{uid}. Mirrors syncServerNotifications(). */
function syncNotificationState() {
  const u = getCurrentUser();
  const uid = (u && (u.username || u.id)) || null;
  if (uid === _notifStateUid) return;
  if (_notifStateUnsub) { try { _notifStateUnsub(); } catch (_) {} _notifStateUnsub = null; }
  notifState = {};
  _notifStateUid = uid;
  if (!uid) return;
  _notifStateUnsub = subscribeNode(
    `notification_state/${uid}`,
    (snapshot) => {
      const val = snapshot && typeof snapshot.val === 'function' ? snapshot.val() : null;
      notifState = val || {};
      renderNotificationBadge();
      if (document.getElementById('modalNotifications')?.style.display === 'flex') renderNotificationsList();
    },
    { onDenied: () => {}, onError: () => {} },
  );
}

function markItemState(id, patch) {
  const u = getCurrentUser();
  const uid = u && (u.username || u.id);
  if (!uid || !id) return;
  notifState[id] = { ...(notifState[id] || {}), ...patch }; // optimistic — subscription confirms
  updateFirebaseData(`notification_state/${uid}/${id}`, { ...patch, updatedAt: Date.now() });
}

/** Exposed for the push-notification deep-link handler (js/app.js). */
export function markNotificationRead(id) {
  markItemState(id, { read: true });
  renderNotificationBadge();
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

  const action = entry.action;
  const meta   = entry.metadata || {};

  // Comment authors are not notified of their own comment (any role, incl. admin).
  if (action === 'comment_added' && meta.authorUsername && meta.authorUsername === username) {
    return false;
  }

  if (role === 'admin') return true;

  // assignment_created/completed/cancelled cases removed here (v1.25.x
  // Part 4/6) — those actions no longer reach this filter at all (removed
  // from OPERATIONAL_ACTIONS above); assignment.* visibility for
  // bidang/driver is now resolved server-side, functions/src/notifications/recipients.js.
  if (role === 'bidang') {
    switch (action) {
      case 'request_created':
        // Bidang sees their own submissions (they are the actor)
        return entry.username === username;
      case 'request_approved':
      case 'request_rejected':
      case 'comment_added':
        // Admin acted on their request, or a discussion originated from it —
        // match via stored requesterId
        return meta.requesterId === username;
      default:
        return false;
    }
  }

  if (role === 'driver') {
    switch (action) {
      case 'comment_added':
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
  return filteredLogs.filter(e => !isEntryArchived(e) && !isEntryRead(e)).length;
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
  const serverUnread = serverNotifs.filter(n => !isEntryArchived(n) && !isEntryRead(n)).length;
  const total   = pendingCount + unread + serverUnread;

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

function renderCardActions(entry, isUnread) {
  if (showArchived) return ''; // read-only view — no actions
  return `
    <div class="notif-card-actions">
      ${isUnread ? `<button type="button" class="notif-action-btn" data-notif-action="read">Tandai dibaca</button>` : ''}
      <button type="button" class="notif-action-btn" data-notif-action="archive">Arsipkan</button>
    </div>`;
}

/** Icon for a server-outbox record, by canonical event type prefix/exact match
 *  (v1.25.x Part 4 — widened beyond Engineering's fixed 🔧 now that
 *  assignment.* renders through this same generic branch). */
function serverNotifIcon(action) {
  const a = String(action || '');
  if (a.startsWith('engineering.')) return '🔧';
  if (a === 'assignment.created') return '🚗';
  if (a === 'assignment.reassigned') return 'ℹ️';
  if (a === 'assignment.updated') return '✏️';
  if (a === 'assignment.completed') return '✔️';
  if (a === 'assignment.cancelled') return '✕';
  if (a === 'assignment.reminder') return '⏰';
  return '🔔';
}

function renderCard(entry, isUnread) {
  // Server-outbox records (Engineering, assignment lifecycle) carry pre-rendered
  // title/body from the Cloud Functions templates — render them directly (no
  // ACTION_META, which only covers the remaining /logs-derived types).
  if (entry._server) {
    return `
    <div class="notif-card notif-priority-normal${isUnread ? ' notif-unread' : ''}" data-id="${escapeHTML(entry.id)}">
      <div class="notif-card-top">
        <span class="notif-card-title">${serverNotifIcon(entry.action)} ${escapeHTML(entry.title)}${isUnread ? '<span class="notif-new-dot"></span>' : ''}</span>
        <span class="notif-card-time">${escapeHTML(timeAgo(entry.timestamp))}</span>
      </div>
      <div class="notif-card-desc">${escapeHTML(entry.desc)}</div>
      ${renderCardActions(entry, isUnread)}
    </div>`;
  }
  const meta = ACTION_META[entry.action];
  if (!meta) return '';
  return `
    <div class="notif-card notif-priority-${meta.priority}${isUnread ? ' notif-unread' : ''}" data-id="${escapeHTML(entry.id)}">
      <div class="notif-card-top">
        <span class="notif-card-title">${meta.icon} ${escapeHTML(meta.title)}${isUnread ? '<span class="notif-new-dot"></span>' : ''}</span>
        <span class="notif-card-time">${escapeHTML(timeAgo(entry.timestamp))}</span>
      </div>
      <div class="notif-card-desc">${escapeHTML(meta.desc(entry))}</div>
      ${buildDetailHtml(meta.detail, entry)}
      ${renderCardActions(entry, isUnread)}
    </div>`;
}

/* ── Notification Center render ── */

function archiveToggleHtml(archivedCount) {
  if (!archivedCount && !showArchived) return '';
  return `<button type="button" class="notif-archive-toggle" id="btnToggleArchived">${
    showArchived ? '← Kembali ke notifikasi' : `Lihat yang diarsipkan (${archivedCount})`
  }</button>`;
}

function wireNotificationCardActions(container) {
  container.querySelectorAll('[data-notif-action]').forEach((btn) => {
    btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const id = btn.closest('[data-id]')?.dataset.id;
      if (!id) return;
      if (btn.dataset.notifAction === 'read') markItemState(id, { read: true });
      else if (btn.dataset.notifAction === 'archive') markItemState(id, { archived: true });
      renderNotificationsList();
      renderNotificationBadge();
    });
  });
  document.getElementById('btnToggleArchived')?.addEventListener('click', () => {
    showArchived = !showArchived;
    renderNotificationsList();
  });
}

function renderNotificationsList() {
  const container = document.getElementById('notificationsContent');
  if (!container) return;

  // Merge the /logs-derived notifications with the server outbox (Engineering),
  // newest first — one unified, time-ordered list.
  const merged = [...filterForCurrentUser(allLogs), ...serverNotifs]
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, 60);

  const archived = merged.filter(isEntryArchived);
  const active   = merged.filter(e => !isEntryArchived(e));
  const list     = showArchived ? archived : active;

  if (list.length === 0) {
    container.innerHTML = `<div class="empty-request-state">${
      showArchived ? 'Belum ada notifikasi diarsipkan.' : 'Belum ada notifikasi untuk Anda.'
    }</div>${archiveToggleHtml(archived.length)}`;
    wireNotificationCardActions(container);
    return;
  }

  // Unread/Today/Yesterday/Earlier grouping (v1.20.8) — pure reshape of the
  // already-timestamped list, no new subscriptions. Archived view skips the
  // unread bucket entirely (read-only browsing of what's been put away).
  const now = new Date();
  const startOfToday     = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 86400000;

  const buckets = { unread: [], today: [], yesterday: [], earlier: [] };
  list.forEach((e) => {
    if (!showArchived && !isEntryRead(e)) { buckets.unread.push(e); return; }
    const t = new Date(e.timestamp).getTime();
    if (t >= startOfToday) buckets.today.push(e);
    else if (t >= startOfYesterday) buckets.yesterday.push(e);
    else buckets.earlier.push(e);
  });

  let html = '';
  const section = (label, items, withCount) => {
    if (!items.length) return;
    html += `<div class="notif-section-header${html ? ' notif-section-header--gap' : ''}">${label}${withCount ? ` (${items.length})` : ''}</div>`;
    html += items.map(e => renderCard(e, !isEntryRead(e))).join('');
  };
  section('Belum Dibaca', buckets.unread, true);
  section('Hari Ini', buckets.today, false);
  section('Kemarin', buckets.yesterday, false);
  section('Lebih Awal', buckets.earlier, false);

  html += archiveToggleHtml(archived.length);
  container.innerHTML = html;
  wireNotificationCardActions(container);
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
  // Keep the server-outbox subscription pointed at the current user (idempotent
  // per uid): login attaches it, logout detaches it. This is how Engineering
  // in-app notifications arrive in realtime through the shared bell.
  syncServerNotifications();
  syncNotificationState();
  renderNotificationBadge();
}

/* ── Modal open / close ── */

export function openNotificationsModal() {
  // Log Aktivitas is admin-only — hide the button for all other roles
  const actLogBtn = document.getElementById('btnOpenActivityLog');
  if (actLogBtn) {
    actLogBtn.style.display = getCurrentUser()?.role === 'admin' ? '' : 'none';
  }

  showArchived = false;
  renderNotificationsList();
  renderNotificationBadge();
  const modal = document.getElementById('modalNotifications');
  if (modal) {
    const box = modal.querySelector('.modal-box');
    if (box) wireSheetSwipeDismiss(box, modal, closeNotificationsModal);
    modal.style.display = 'flex';
    lockBodyScroll();
  }
}

export function closeNotificationsModal() {
  const modal = document.getElementById('modalNotifications');
  if (modal) modal.style.display = 'none';
  unlockBodyScroll();
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
