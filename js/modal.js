/* ============================================================
   MODAL.JS — Detail Modal & WhatsApp Preview
   
   Open/close detail modal, render assignment details,
   generate WhatsApp text, delete/edit actions.
   ============================================================ */

'use strict';

import { formatDateLong, formatDateTime, getTimePeriod, parseLocalDate, showToast } from './utils.js';
import { VEHICLES } from './drivers.js';
import { hasPermission } from './auth.js';

/* ── Module State ── */
let viewingId = null; // ID assignment yang sedang dilihat
let assignments = [];
let onEditCallback = null;
let onDeleteCallback = null;
let onCompleteCallback = null;

/**
 * Register callback untuk event Edit
 * @param {Function} callback - callback(assignmentId)
 */
export function registerEditCallback(callback) {
  onEditCallback = callback;
}

/**
 * Register callback untuk event Delete
 * @param {Function} callback - callback(assignmentId)
 */
export function registerDeleteCallback(callback) {
  onDeleteCallback = callback;
}

/**
 * Register callback untuk event tandai Selesai
 * @param {Function} callback - callback(assignmentId)
 */
export function registerCompleteCallback(callback) {
  onCompleteCallback = callback;
}

/**
 * Set assignments array (untuk referensi saat render detail)
 * @param {Array} newAssignments
 */
export function setAssignments(newAssignments) {
  assignments = newAssignments;
}

/**
 * Initialize modal handlers (close, edit, delete buttons)
 */
export function initModalHandlers() {
  // Close detail modal
  const btnCloseDetail = document.getElementById('btnCloseDetail');
  if (btnCloseDetail) {
    btnCloseDetail.addEventListener('click', closeDetailModal);
  }

  // Close detail modal (backup selector)
  const btnCloseDetail2 = document.getElementById('btnCloseDetail2');
  if (btnCloseDetail2) {
    btnCloseDetail2.addEventListener('click', closeDetailModal);
  }

  // Edit button di detail modal
  const btnEdit = document.getElementById('btnEditAssignment');
  if (btnEdit) {
    btnEdit.addEventListener('click', () => {
      if (!hasPermission('edit')) {
        showToast('Anda tidak punya akses untuk mengedit jadwal');
        return;
      }

      const editId = viewingId;
      closeDetailModal();
      // Delay untuk memastikan modal tutup dulu
      setTimeout(() => {
        if (onEditCallback) {
          onEditCallback(editId);
        }
      }, 50);
    });
  }

  // Delete button di detail modal
  const btnDelete = document.getElementById('btnDeleteAssignment');
  if (btnDelete) {
    btnDelete.addEventListener('click', () => {
      if (!hasPermission('delete')) {
        showToast('Anda tidak punya akses untuk menghapus jadwal');
        return;
      }

      if (confirm('Yakin ingin menghapus jadwal ini?')) {
        if (onDeleteCallback) {
          onDeleteCallback(viewingId);
        }
        closeDetailModal();
      }
    });
  }

  // Tombol Selesai di detail modal
  const btnComplete = document.getElementById('btnCompleteAssignment');
  if (btnComplete) {
    btnComplete.addEventListener('click', () => {
      if (!hasPermission('complete')) {
        showToast('Hanya Admin atau Driver yang bisa menandai selesai');
        return;
      }

      const a = assignments.find(x => x.id === viewingId);
      if (a && (a.status ?? 'aktif') === 'selesai') {
        showToast('Penugasan ini sudah selesai');
        return;
      }

      if (confirm('Apakah penugasan ini sudah selesai?')) {
        if (onCompleteCallback) onCompleteCallback(viewingId);
        closeDetailModal();
      }
    });
  }

  // Copy WhatsApp button
  const btnCopyWA = document.getElementById('btnCopyWA');
  if (btnCopyWA) {
    btnCopyWA.addEventListener('click', copyWAText);
  }

  // Click di luar modal untuk tutup
  const modalDetail = document.getElementById('modalDetail');
  if (modalDetail) {
    modalDetail.addEventListener('click', (e) => {
      if (e.target === modalDetail) closeDetailModal();
    });
  }
}

/**
 * Open detail modal untuk assignment tertentu
 * @param {string} id - Assignment ID
 */
export function openDetailModal(id) {
  const a = assignments.find(x => x.id === id);
  if (!a) return;

  viewingId = id;

  // Render detail content
  const content = document.getElementById('detailContent');
  if (content) {
    content.innerHTML = `
      <div class="detail-row">
        <span class="detail-label">Driver</span>
        <span class="detail-value">${a.driver}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">No. HP</span>
        <span class="detail-value">${a.phone || '-'}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Kendaraan</span>
        <span class="detail-value">
          <span class="vehicle-badge" style="background:${VEHICLES[a.vehicle]||'#555'}">${a.vehicle}</span>
        </span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Tanggal</span>
        <span class="detail-value">${formatDateLong(a.date)}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Waktu</span>
        <span class="detail-value">${a.startTime} – ${a.endTime}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Tujuan</span>
        <span class="detail-value">${a.destination}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Keperluan</span>
        <span class="detail-value">${a.purpose}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">PIC</span>
        <span class="detail-value">${a.pic || '-'}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Penumpang</span>
        <span class="detail-value">${a.pax} pax</span>
      </div>
      ${a.notes ? `
      <div class="detail-row">
        <span class="detail-label">Catatan</span>
        <span class="detail-value">${a.notes}</span>
      </div>` : ''}
      <div class="detail-row">
        <span class="detail-label">Status</span>
        <span class="detail-value">
          ${(a.status ?? 'aktif') === 'selesai'
            ? '<span class="badge-selesai">Selesai</span>'
            : '<span class="badge-aktif">Aktif</span>'}
        </span>
      </div>
      ${(a.status ?? 'aktif') === 'selesai' ? `
      <div class="detail-row">
        <span class="detail-label">Selesai oleh</span>
        <span class="detail-value">${a.completedBy || '-'}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Waktu selesai</span>
        <span class="detail-value">${formatDateTime(a.completedAt)}</span>
      </div>` : ''}
    `;
  }

  // Generate dan tampilkan format WhatsApp
  const waText = document.getElementById('waPreviewText');
  if (waText) {
    waText.textContent = generateWAText(a);
  }

  updateDetailActionButtons();

  // Tampilkan modal
  const modal = document.getElementById('modalDetail');
  if (modal) {
    modal.style.display = 'flex';
  }
}

/**
 * Close detail modal
 */
export function closeDetailModal() {
  const modal = document.getElementById('modalDetail');
  if (modal) {
    modal.style.display = 'none';
  }

  const feedback = document.getElementById('copyFeedback');
  if (feedback) {
    feedback.style.display = 'none';
  }

  viewingId = null;
}

/**
 * Update tombol edit/hapus/selesai sesuai role dan status assignment.
 */
export function updateDetailActionButtons() {
  const btnEdit     = document.getElementById('btnEditAssignment');
  const btnDelete   = document.getElementById('btnDeleteAssignment');
  const btnComplete = document.getElementById('btnCompleteAssignment');

  if (btnEdit) {
    btnEdit.disabled = !hasPermission('edit');
    btnEdit.title = hasPermission('edit') ? 'Edit jadwal' : 'Hanya admin yang bisa edit';
  }

  if (btnDelete) {
    btnDelete.disabled = !hasPermission('delete');
    btnDelete.title = hasPermission('delete') ? 'Hapus jadwal' : 'Hanya admin yang bisa hapus';
  }

  if (btnComplete) {
    const canComplete = hasPermission('complete');
    const a = assignments.find(x => x.id === viewingId);
    const isAlreadyDone = a && (a.status ?? 'aktif') === 'selesai';

    btnComplete.style.display = canComplete ? '' : 'none';
    btnComplete.disabled = isAlreadyDone;
    btnComplete.title = isAlreadyDone
      ? 'Penugasan ini sudah selesai'
      : canComplete
        ? 'Tandai penugasan sebagai selesai'
        : 'Hanya Admin atau Driver yang bisa menandai selesai';
  }
}

/**
 * Generate format ringkasan WhatsApp dari assignment
 * @param {Object} a - Assignment object
 * @returns {string} - Formatted text untuk WhatsApp
 */
export function generateWAText(a) {
  const dateObj  = parseLocalDate(a.date);
  const dateStr  = dateObj.toLocaleDateString('id-ID', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });

  // Format jam + label waktu (Pagi/Siang/Sore/Malam)
  const [h, m]    = a.startTime.split(':').map(Number);
  const timeLabel = getTimePeriod(h);
  const timeStr   = `${String(h).padStart(2,'0')}.${String(m).padStart(2,'0')} (${timeLabel})`;

  const picStr  = a.pic ? `${a.pax} Pax (${a.pic})` : `${a.pax} Pax`;

  return `${a.purpose}

${dateStr}
Jam ${timeStr}
📍: ${a.destination}
🚗: ${a.vehicle}
${picStr}
Driver: ${a.vehicle} @${a.driver} PBSI${a.notes ? `\nCatatan: ${a.notes}` : ''}`;
}

/**
 * Copy WhatsApp text ke clipboard dengan feedback visual
 */
function copyWAText() {
  const text = document.getElementById('waPreviewText');
  if (!text) return;

  const textToCopy = text.textContent;

  navigator.clipboard.writeText(textToCopy).then(() => {
    // Feedback visual
    const feedback = document.getElementById('copyFeedback');
    if (feedback) {
      feedback.style.display = 'inline';
      setTimeout(() => { feedback.style.display = 'none'; }, 2000);
    }
  }).catch(() => {
    // Fallback untuk browser lama yang tidak support clipboard API
    const ta = document.createElement('textarea');
    ta.value = textToCopy;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showToast('📋 Tersalin ke clipboard!');
  });
}

/**
 * Get ID assignment yang sedang dilihat (untuk testing)
 * @returns {string|null}
 */
export function getViewingId() {
  return viewingId;
}

console.info('Modal module loaded');
