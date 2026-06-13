/* ============================================================
   COMMENTS.JS — Request-Level Comment Thread

   Lightweight, chronological comment thread attached to a
   driver request.  Supports Admin, Bidang (own requests),
   and the Assigned Driver.

   Comment data structure (stored inside request document):
     comments: [{
       id, userId, displayName, role, message, createdAt
     }]

   Public API:
     initCommentHandlers()              — call once on DOMContentLoaded
     openCommentModal(requestId)        — open thread for a request
     closeCommentModal()                — close & reset
     refreshCommentThreadIfOpen(reqs)   — call on Firebase requests sync
     setRequests(newRequests)           — keep module state fresh
     registerCommentSaveCallback(cb)    — cb(updatedRequest)

   Security:
     _canView / _canComment:
       Admin          → any request
       Bidang         → own request (requesterId === user.id)
       Driver         → request where req.driver matches their name
       Viewer / other → blocked

   Future compatibility (v1.4.0):
     - Telegram comment notifications: add send to notification-service
       after onCommentSaveCallback fires (no module changes needed)
     - Telegram comment replies: extend _handleSend with a replyToId
       param and an optional parentId on the comment object
   ============================================================ */

'use strict';

import { generateId, formatDateTime, formatDateShort, showToast } from './utils.js';
import { getCurrentUser, isAdmin, isBidang, isDriver } from './auth.js';
import { getVehicleColor } from './drivers.js';

/* ── Module State ── */
let requests = [];
let onCommentSaveCallback = null;

const ROLE_LABELS = {
  admin: 'Admin', bidang: 'Bidang', driver: 'Driver', viewer: 'Viewer',
};

/* ── Public: state setters ── */

export function setRequests(newRequests) {
  requests = newRequests;
}

export function registerCommentSaveCallback(callback) {
  onCommentSaveCallback = callback;
}

/* ── Public: modal lifecycle ── */

/**
 * Open the comment thread for a specific request.
 * Enforces view-permission gate before rendering.
 */
export function openCommentModal(requestId) {
  const req = requests.find(r => r.id === requestId);
  if (!req) { showToast('Request tidak ditemukan'); return; }

  if (!_canView(req)) {
    showToast('Anda tidak memiliki akses ke diskusi ini');
    return;
  }

  const modal = document.getElementById('modalCommentThread');
  if (!modal) return;

  modal.dataset.requestId = requestId;
  _renderThread(req);
  _syncSendButton();
  modal.style.display = 'flex';

  if (_canComment(req)) {
    setTimeout(() => document.getElementById('commentInput')?.focus(), 80);
  }
}

export function closeCommentModal() {
  const modal = document.getElementById('modalCommentThread');
  if (modal) {
    modal.style.display = 'none';
    delete modal.dataset.requestId;
  }
  const input = document.getElementById('commentInput');
  if (input) input.value = '';
  _syncSendButton();
  _syncCharCounter();
}

/**
 * If the comment modal is currently open for a request that appears in
 * updatedRequests with a different comment count, re-render the thread.
 * Called from the Firebase requests-change listener in app.js.
 */
export function refreshCommentThreadIfOpen(updatedRequests) {
  const modal = document.getElementById('modalCommentThread');
  if (!modal || modal.style.display === 'none') return;

  const openId = modal.dataset.requestId;
  if (!openId) return;

  const updatedReq = updatedRequests.find(r => r.id === openId);
  if (!updatedReq) return;

  // Only re-render on actual comment count change to avoid
  // flickering on the Firebase echo of our own saves.
  const listEl = document.getElementById('commentThreadList');
  const rendered = listEl ? listEl.querySelectorAll('.comment-item').length : 0;
  const incoming = Array.isArray(updatedReq.comments) ? updatedReq.comments.length : 0;
  if (incoming !== rendered) _renderThread(updatedReq);
}

/* ── Public: initialise DOM handlers ── */

export function initCommentHandlers() {
  document.getElementById('btnCloseCommentThread')
    ?.addEventListener('click', closeCommentModal);

  document.getElementById('modalCommentThread')
    ?.addEventListener('click', e => {
      if (e.target === document.getElementById('modalCommentThread')) closeCommentModal();
    });

  document.getElementById('btnSendComment')
    ?.addEventListener('click', _handleSend);

  const textarea = document.getElementById('commentInput');
  if (textarea) {
    textarea.addEventListener('input', () => { _syncSendButton(); _syncCharCounter(); });
    textarea.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); _handleSend(); }
    });
  }
}

/* ── Private: permissions ── */

function _canView(req) {
  const user = getCurrentUser();
  if (!user) return false;
  if (isAdmin()) return true;
  if (isBidang() && req.requesterId === user.id) return true;
  if (isDriver()) {
    const driverName = String(req.driver || '').trim().toLowerCase();
    return [user.username, user.name]
      .filter(Boolean)
      .map(v => String(v).trim().toLowerCase())
      .some(c => c === driverName);
  }
  return false;
}

// View and post share the same access rules.
function _canComment(req) {
  return _canView(req);
}

/* ── Private: rendering ── */

function _renderThread(req) {
  // Modal title = request purpose
  const titleEl = document.getElementById('commentThreadTitle');
  if (titleEl) titleEl.textContent = req.purpose || 'Komentar';

  // Context strip: driver, date, status
  _renderContext(req);

  // Comment list
  const listEl = document.getElementById('commentThreadList');
  if (!listEl) return;

  const comments = Array.isArray(req.comments) ? [...req.comments] : [];

  // Sort chronologically; support legacy `timestamp` field for backward compat
  comments.sort((a, b) =>
    String(a.createdAt || a.timestamp || '').localeCompare(String(b.createdAt || b.timestamp || ''))
  );

  listEl.innerHTML = comments.length
    ? comments.map(_buildCommentItem).join('')
    : '<div class="comment-empty">Belum ada komentar. Mulai percakapan di sini.</div>';

  requestAnimationFrame(() => { listEl.scrollTop = listEl.scrollHeight; });

  // Show/hide input area based on role
  const inputArea = document.getElementById('commentInputArea');
  if (inputArea) inputArea.style.display = _canComment(req) ? 'flex' : 'none';
}

function _renderContext(req) {
  const el = document.getElementById('commentContext');
  if (!el) return;

  const vehicleColor  = getVehicleColor(req.vehicle);
  const STATUS_LABELS = { pending: 'Menunggu', approved: 'Disetujui', rejected: 'Ditolak' };
  const statusLabel   = STATUS_LABELS[req.status] || req.status || '-';

  const isSameDay = !req.endDate || req.startDate === req.endDate;
  const dateText  = isSameDay
    ? formatDateShort(req.startDate || req.date)
    : `${formatDateShort(req.startDate)} – ${formatDateShort(req.endDate)}`;
  const timeText = (req.startTime && req.endTime) ? `${req.startTime}–${req.endTime}` : '';

  const vehicleBadge = req.vehicle
    ? `<span class="vehicle-badge" style="background:${vehicleColor};font-size:11px;">${esc(req.vehicle)}</span>`
    : '';

  el.innerHTML = `
    <div class="comment-context-row">
      ${vehicleBadge}
      <span class="comment-context-driver">${esc(req.driver || '-')}</span>
      <span class="comment-context-sep">·</span>
      <span class="comment-context-date">${esc(dateText)}${timeText ? ` ${esc(timeText)}` : ''}</span>
    </div>
    <div class="comment-context-row comment-context-footer">
      <span class="comment-context-requester">Oleh: ${esc(req.requesterName || '-')}</span>
      <span class="comment-context-status-badge comment-context-status--${esc(req.status || 'pending')}">${esc(statusLabel)}</span>
    </div>`;
}

function _buildCommentItem(comment) {
  const user     = getCurrentUser();
  const isOwn    = comment.userId === user?.id;
  const roleLabel = ROLE_LABELS[comment.role] || '';
  const roleBadge = roleLabel ? `<span class="comment-role-badge">${esc(roleLabel)}</span>` : '';

  // Support both `createdAt` (new) and legacy `timestamp` field
  const ts = comment.createdAt || comment.timestamp;

  return `
    <div class="comment-item${isOwn ? ' comment-item--own' : ''}">
      <div class="comment-header">
        <span class="comment-author">${esc(comment.displayName)}</span>
        ${roleBadge}
        <span class="comment-time">${formatDateTime(ts)}</span>
      </div>
      <div class="comment-body">${esc(comment.message)}</div>
    </div>`;
}

/* ── Private: send handler ── */

function _handleSend() {
  const input   = document.getElementById('commentInput');
  const message = input?.value?.trim();
  if (!message) return;

  const modal     = document.getElementById('modalCommentThread');
  const requestId = modal?.dataset?.requestId;
  if (!requestId) return;

  const req = requests.find(r => r.id === requestId);
  if (!req || !_canComment(req)) {
    showToast('Anda tidak dapat berkomentar di sini');
    return;
  }

  const user = getCurrentUser();
  const newComment = {
    id:          generateId(),
    userId:      user.id,
    displayName: user.name || user.username,
    role:        user.role,
    message,
    createdAt:   new Date().toISOString(),
  };

  const updatedComments = [...(Array.isArray(req.comments) ? req.comments : []), newComment];
  const updatedRequest  = { ...req, comments: updatedComments };

  // Optimistic UI: append immediately
  const listEl = document.getElementById('commentThreadList');
  if (listEl) {
    listEl.querySelector('.comment-empty')?.remove();
    listEl.insertAdjacentHTML('beforeend', _buildCommentItem(newComment));
    requestAnimationFrame(() => { listEl.scrollTop = listEl.scrollHeight; });
  }

  input.value = '';
  _syncSendButton();
  _syncCharCounter();

  // Persist: app.js handles saveRequests + renderRequestsList.
  // newComment is passed so app.js can emit the comment_added log + comment.added event.
  if (onCommentSaveCallback) onCommentSaveCallback(updatedRequest, newComment);
}

function _syncSendButton() {
  const input = document.getElementById('commentInput');
  const btn   = document.getElementById('btnSendComment');
  if (btn) btn.disabled = !input?.value?.trim();
}

function _syncCharCounter() {
  const input   = document.getElementById('commentInput');
  const counter = document.getElementById('commentCharCount');
  if (!counter) return;
  const len     = input?.value?.length ?? 0;
  const max     = parseInt(input?.getAttribute('maxlength'), 10) || 500;
  counter.textContent = `${len} / ${max}`;
  counter.classList.toggle('comment-char-counter--warn', len >= 450 && len < max);
  counter.classList.toggle('comment-char-counter--full', len >= max);
}

/* ── Utility ── */

function esc(value) {
  const d = document.createElement('div');
  d.textContent = String(value ?? '');
  return d.innerHTML;
}

console.info('Comments module loaded');
