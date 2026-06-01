/* ============================================================
   COMMENTS.JS — Request-Level Comment Thread

   Lightweight comment thread attached to a driver request.
   Supports Admin, Bidang (own requests), and Assigned Driver.

   Data structure per request:
     comments: [{ id, userId, displayName, role, message, timestamp }]

   Entry points:
     openCommentModal(requestId)  — called from app.js
     initCommentHandlers()        — called once on DOMContentLoaded
   ============================================================ */

'use strict';

import { generateId, formatDateTime, showToast } from './utils.js';
import { getCurrentUser, isAdmin, isBidang, isDriver } from './auth.js';

/* ── Module State ── */
let requests = [];
let onCommentSaveCallback = null;

const ROLE_LABELS = {
  admin: 'Admin', bidang: 'Bidang', driver: 'Driver', viewer: 'Viewer',
};

export function setRequests(newRequests) {
  requests = newRequests;
}

export function registerCommentSaveCallback(callback) {
  onCommentSaveCallback = callback;
}

/**
 * Open the comment thread modal for a specific request.
 * Anyone with view access can open it; posting requires extra check.
 */
export function openCommentModal(requestId) {
  const req = requests.find(r => r.id === requestId);
  if (!req) {
    showToast('Request tidak ditemukan');
    return;
  }

  const modal = document.getElementById('modalCommentThread');
  if (!modal) return;

  modal.dataset.requestId = requestId;
  _renderThread(req);
  modal.style.display = 'flex';

  // Auto-focus the textarea if allowed to comment
  if (_canComment(req)) {
    setTimeout(() => document.getElementById('commentInput')?.focus(), 60);
  }
}

export function closeCommentModal() {
  const modal = document.getElementById('modalCommentThread');
  if (modal) {
    modal.style.display = 'none';
    delete modal.dataset.requestId;
  }
}

export function initCommentHandlers() {
  document.getElementById('btnCloseCommentThread')
    ?.addEventListener('click', closeCommentModal);

  document.getElementById('modalCommentThread')
    ?.addEventListener('click', e => {
      if (e.target === document.getElementById('modalCommentThread')) closeCommentModal();
    });

  document.getElementById('btnSendComment')
    ?.addEventListener('click', _handleSend);

  document.getElementById('commentInput')
    ?.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); _handleSend(); }
    });
}

/* ── Private ── */

function _canComment(req) {
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

function _renderThread(req) {
  const titleEl = document.getElementById('commentThreadTitle');
  if (titleEl) titleEl.textContent = req.purpose || 'Komentar';

  const listEl = document.getElementById('commentThreadList');
  if (!listEl) return;

  const comments = Array.isArray(req.comments) ? [...req.comments] : [];
  comments.sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));

  if (comments.length === 0) {
    listEl.innerHTML = '<div class="comment-empty">Belum ada komentar. Mulai percakapan di sini.</div>';
  } else {
    listEl.innerHTML = comments.map(_buildCommentItem).join('');
  }

  requestAnimationFrame(() => { listEl.scrollTop = listEl.scrollHeight; });

  // Show/hide input based on permission
  const inputArea = document.getElementById('commentInputArea');
  if (inputArea) inputArea.style.display = _canComment(req) ? 'flex' : 'none';
}

function _buildCommentItem(comment) {
  const user = getCurrentUser();
  const isOwn = comment.userId === user?.id;
  const roleLabel = ROLE_LABELS[comment.role] || '';
  const roleBadge = roleLabel
    ? `<span class="comment-role-badge">${esc(roleLabel)}</span>` : '';

  return `
    <div class="comment-item${isOwn ? ' comment-item--own' : ''}">
      <div class="comment-header">
        <span class="comment-author">${esc(comment.displayName)}</span>
        ${roleBadge}
        <span class="comment-time">${formatDateTime(comment.timestamp)}</span>
      </div>
      <div class="comment-body">${esc(comment.message)}</div>
    </div>`;
}

function _handleSend() {
  const input = document.getElementById('commentInput');
  const message = input?.value?.trim();
  if (!message) return;

  const modal = document.getElementById('modalCommentThread');
  const requestId = modal?.dataset?.requestId;
  if (!requestId) return;

  const req = requests.find(r => r.id === requestId);
  if (!req || !_canComment(req)) {
    showToast('Anda tidak dapat berkomentar di sini');
    return;
  }

  const user = getCurrentUser();
  const newComment = {
    id: generateId(),
    userId:      user.id,
    displayName: user.name || user.username,
    role:        user.role,
    message,
    timestamp:   new Date().toISOString(),
  };

  const updatedComments = [...(Array.isArray(req.comments) ? req.comments : []), newComment];
  const updatedRequest  = { ...req, comments: updatedComments };

  // Append optimistically to the thread UI
  const listEl = document.getElementById('commentThreadList');
  if (listEl) {
    const emptyEl = listEl.querySelector('.comment-empty');
    if (emptyEl) emptyEl.remove();
    listEl.insertAdjacentHTML('beforeend', _buildCommentItem(newComment));
    requestAnimationFrame(() => { listEl.scrollTop = listEl.scrollHeight; });
  }

  input.value = '';

  // Persist via app.js callback
  if (onCommentSaveCallback) onCommentSaveCallback(updatedRequest);
}

function esc(value) {
  const d = document.createElement('div');
  d.textContent = String(value ?? '');
  return d.innerHTML;
}

console.info('Comments module loaded');
