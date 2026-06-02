/* ============================================================
   MODAL.JS — Detail Modal & WhatsApp Preview

   Open/close detail modal, render assignment details,
   generate WhatsApp text, delete/edit/start/complete actions.
   ============================================================ */

'use strict';

import { formatDateLong, formatDateTime, getTimePeriod, parseLocalDate, showToast } from './utils.js';
import { VEHICLES } from './drivers.js';
import { hasPermission, getCurrentUser } from './auth.js';

/* ── Status Constants ── */
const STATUS_LABELS = {
  pending:   'Menunggu',
  approved:  'Disetujui',
  assigned:  'Ditugaskan',
  started:   'Berlangsung',
  completed: 'Selesai',
};

/* ── Module State ── */
let viewingId = null;
let assignments = [];
let onEditCallback = null;
let onDeleteCallback = null;
let onStartCallback = null;
let onCompleteCallback = null;
let onCommentCallback = null;

/** Normalize legacy status values to canonical lifecycle codes. */
function normalizeStatus(status) {
  if (!status || status === 'aktif') return 'assigned';
  if (status === 'selesai') return 'completed';
  return status;
}

/**
 * Check if current user can perform a lifecycle action on a specific assignment.
 * Admin: always allowed. Driver: only their own assignment.
 */
function canActOnAssignment(permission, assignment) {
  if (!hasPermission(permission)) return false;
  const user = getCurrentUser();
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (user.role === 'driver' && assignment) {
    const driverName = String(assignment.driver || '').trim().toLowerCase();
    const candidates = [user.username, user.name]
      .filter(Boolean)
      .map(v => String(v).trim().toLowerCase());
    return candidates.some(c => c === driverName);
  }
  return false;
}

export function registerEditCallback(callback) { onEditCallback = callback; }
export function registerDeleteCallback(callback) { onDeleteCallback = callback; }
export function registerStartCallback(callback) { onStartCallback = callback; }
export function registerCompleteCallback(callback) { onCompleteCallback = callback; }
export function registerCommentCallback(callback) { onCommentCallback = callback; }

export function setAssignments(newAssignments) {
  assignments = newAssignments;
}

export function initModalHandlers() {
  document.getElementById('btnCloseDetail')?.addEventListener('click', closeDetailModal);
  document.getElementById('btnCloseDetail2')?.addEventListener('click', closeDetailModal);

  // Edit
  document.getElementById('btnEditAssignment')?.addEventListener('click', () => {
    if (!hasPermission('edit')) {
      showToast('Anda tidak punya akses untuk mengedit jadwal');
      return;
    }
    const editId = viewingId;
    closeDetailModal();
    setTimeout(() => { if (onEditCallback) onEditCallback(editId); }, 50);
  });

  // Delete
  document.getElementById('btnDeleteAssignment')?.addEventListener('click', () => {
    if (!hasPermission('delete')) {
      showToast('Anda tidak punya akses untuk menghapus jadwal');
      return;
    }
    if (confirm('Yakin ingin menghapus jadwal ini?')) {
      if (onDeleteCallback) onDeleteCallback(viewingId);
      closeDetailModal();
    }
  });

  // Start
  document.getElementById('btnStartAssignment')?.addEventListener('click', () => {
    const a = assignments.find(x => x.id === viewingId);
    if (!canActOnAssignment('start', a)) {
      showToast('Hanya Admin atau Driver yang ditugaskan yang bisa memulai');
      return;
    }
    const status = normalizeStatus(a?.status);
    if (status === 'started') { showToast('Penugasan sudah dimulai'); return; }
    if (status === 'completed') { showToast('Penugasan sudah selesai'); return; }
    if (confirm('Mulai penugasan ini sekarang?')) {
      if (onStartCallback) onStartCallback(viewingId);
      closeDetailModal();
    }
  });

  // Complete
  document.getElementById('btnCompleteAssignment')?.addEventListener('click', () => {
    const a = assignments.find(x => x.id === viewingId);
    if (!canActOnAssignment('complete', a)) {
      showToast('Hanya Admin atau Driver yang ditugaskan yang bisa menyelesaikan');
      return;
    }
    const status = normalizeStatus(a?.status);
    if (status === 'completed') { showToast('Penugasan sudah selesai'); return; }
    if (confirm('Tandai penugasan ini sebagai selesai?')) {
      if (onCompleteCallback) onCompleteCallback(viewingId);
      closeDetailModal();
    }
  });

  // Comment thread — only shown when assignment has a requestId
  document.getElementById('btnCommentThread')?.addEventListener('click', () => {
    const a = assignments.find(x => x.id === viewingId);
    if (a?.requestId && onCommentCallback) {
      closeDetailModal();
      setTimeout(() => onCommentCallback(a.requestId), 50);
    }
  });

  // Copy WhatsApp
  document.getElementById('btnCopyWA')?.addEventListener('click', copyWAText);

  // Click outside to close
  document.getElementById('modalDetail')?.addEventListener('click', (e) => {
    if (e.target === document.getElementById('modalDetail')) closeDetailModal();
  });
}

export function openDetailModal(id) {
  const a = assignments.find(x => x.id === id);
  if (!a) return;

  viewingId = id;
  const status = normalizeStatus(a.status);
  const statusLabel = STATUS_LABELS[status] || status;

  const content = document.getElementById('detailContent');
  if (content) {
    content.innerHTML = `
      <div class="detail-row">
        <span class="detail-label">Driver</span>
        <span class="detail-value">${escapeHTML(a.driver)}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">No. HP</span>
        <span class="detail-value">${escapeHTML(a.phone || '-')}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Kendaraan</span>
        <span class="detail-value">
          <span class="vehicle-badge" style="background:${VEHICLES[a.vehicle]||'#555'}">${escapeHTML(a.vehicle)}</span>
        </span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Tanggal</span>
        <span class="detail-value">${formatDateLong(a.date)}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Waktu</span>
        <span class="detail-value">${a.fullDay ? 'Penuh Hari' : `${escapeHTML(a.startTime)} – ${escapeHTML(a.endTime)}`}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Tujuan</span>
        <span class="detail-value">${escapeHTML(a.destination)}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Keperluan</span>
        <span class="detail-value">${escapeHTML(a.purpose)}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">PIC</span>
        <span class="detail-value">${escapeHTML(a.pic || '-')}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Penumpang</span>
        <span class="detail-value">${escapeHTML(String(a.pax))} pax</span>
      </div>
      ${a.notes ? `
      <div class="detail-row">
        <span class="detail-label">Catatan</span>
        <span class="detail-value">${escapeHTML(a.notes)}</span>
      </div>` : ''}
      <div class="detail-row">
        <span class="detail-label">Status</span>
        <span class="detail-value">
          <span class="badge-status badge-status--${status}">${escapeHTML(statusLabel)}</span>
        </span>
      </div>
      ${buildLifecycleRows(a)}
    `;
  }

  const waText = document.getElementById('waPreviewText');
  if (waText) waText.textContent = generateWAText(a);

  updateDetailActionButtons();

  const modal = document.getElementById('modalDetail');
  if (modal) modal.style.display = 'flex';
}

/** Render audit rows for lifecycle events that have occurred. */
function buildLifecycleRows(a) {
  const rows = [];

  if (a.assignedAt) {
    rows.push(`
      <div class="detail-row">
        <span class="detail-label">Ditugaskan oleh</span>
        <span class="detail-value">${escapeHTML(a.assignedBy || '-')} <span class="detail-ts">${formatDateTime(a.assignedAt)}</span></span>
      </div>`);
  } else if (a.approvedBy) {
    rows.push(`
      <div class="detail-row">
        <span class="detail-label">Dibuat oleh</span>
        <span class="detail-value">${escapeHTML(a.approvedBy)}</span>
      </div>`);
  }

  if (a.startedAt) {
    rows.push(`
      <div class="detail-row">
        <span class="detail-label">Dimulai oleh</span>
        <span class="detail-value">${escapeHTML(a.startedBy || '-')} <span class="detail-ts">${formatDateTime(a.startedAt)}</span></span>
      </div>`);
  }

  if (a.completedAt) {
    rows.push(`
      <div class="detail-row">
        <span class="detail-label">Diselesaikan oleh</span>
        <span class="detail-value">${escapeHTML(a.completedBy || '-')} <span class="detail-ts">${formatDateTime(a.completedAt)}</span></span>
      </div>`);
  }

  return rows.join('');
}

export function closeDetailModal() {
  const modal = document.getElementById('modalDetail');
  if (modal) modal.style.display = 'none';

  document.getElementById('copyFeedback')?.style &&
    (document.getElementById('copyFeedback').style.display = 'none');

  viewingId = null;
}

export function updateDetailActionButtons() {
  const btnEdit     = document.getElementById('btnEditAssignment');
  const btnDelete   = document.getElementById('btnDeleteAssignment');
  const btnStart    = document.getElementById('btnStartAssignment');
  const btnComplete = document.getElementById('btnCompleteAssignment');

  const a = viewingId ? assignments.find(x => x.id === viewingId) : null;
  const status = normalizeStatus(a?.status);

  const btnComment = document.getElementById('btnCommentThread');
  if (btnComment) {
    btnComment.style.display = (a?.requestId) ? '' : 'none';
  }

  if (btnEdit) {
    btnEdit.disabled = !hasPermission('edit');
    btnEdit.title = hasPermission('edit') ? 'Edit jadwal' : 'Hanya admin yang bisa edit';
  }

  if (btnDelete) {
    btnDelete.disabled = !hasPermission('delete');
    btnDelete.title = hasPermission('delete') ? 'Hapus jadwal' : 'Hanya admin yang bisa hapus';
  }

  if (btnStart) {
    const canStart = canActOnAssignment('start', a);
    // Show Start only when the assignment hasn't been started or completed yet
    const showStart = canStart && (status === 'assigned');
    btnStart.style.display = showStart ? '' : 'none';
    btnStart.disabled = false;
    btnStart.title = 'Mulai penugasan';
  }

  if (btnComplete) {
    const canComplete = canActOnAssignment('complete', a);
    const alreadyDone = status === 'completed';
    btnComplete.style.display = canComplete ? '' : 'none';
    btnComplete.disabled = alreadyDone;
    btnComplete.title = alreadyDone
      ? 'Penugasan sudah selesai'
      : 'Tandai penugasan sebagai selesai';
  }
}

export function generateWAText(a) {
  const dateObj  = parseLocalDate(a.date);
  const dateStr  = dateObj.toLocaleDateString('id-ID', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });

  const [h, m]    = (a.startTime || '00:00').split(':').map(Number);
  const timeLabel = getTimePeriod(h);
  const timeStr   = a.fullDay
    ? 'Penuh Hari'
    : `Jam ${String(h).padStart(2,'0')}.${String(m).padStart(2,'0')} (${timeLabel})`;
  const picStr    = a.pic ? `${a.pax} Pax (${a.pic})` : `${a.pax} Pax`;
  const header    = a.pic ? `*${a.purpose}* (${a.pic})` : `*${a.purpose}*`;

  return `${header}

${dateStr}
${timeStr}
📍: ${a.destination}
🚗: ${a.vehicle}
${picStr}
Driver: ${a.vehicle} @${a.driver} PBSI${a.notes ? `\nCatatan: ${a.notes}` : ''}`;
}

function copyWAText() {
  const text = document.getElementById('waPreviewText');
  if (!text) return;

  const textToCopy = text.textContent;

  navigator.clipboard.writeText(textToCopy).then(() => {
    const feedback = document.getElementById('copyFeedback');
    if (feedback) {
      feedback.style.display = 'inline';
      setTimeout(() => { feedback.style.display = 'none'; }, 2000);
    }
  }).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = textToCopy;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showToast('📋 Tersalin ke clipboard!');
  });
}

function escapeHTML(value) {
  const div = document.createElement('div');
  div.textContent = value || '';
  return div.innerHTML;
}

export function getViewingId() {
  return viewingId;
}

console.info('Modal module loaded');
