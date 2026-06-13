/* ============================================================
   MODAL.JS — Detail Modal & WhatsApp Preview

   Open/close detail modal, render assignment details,
   generate WhatsApp text, delete/edit/start/complete actions.
   ============================================================ */

'use strict';

import { formatDateLong, formatDateTime, getTimePeriod, parseLocalDate, showToast } from './utils.js';
import { getVehicleColor } from './drivers.js';
import { hasPermission, getCurrentUser } from './auth.js';
import { validateOdometer } from './validation.js';
import { printReimbursementForm } from './reimbursement.js';

/* ── Status Constants ── */
const STATUS_LABELS = {
  pending:   'Menunggu',
  approved:  'Disetujui',
  assigned:  'Ditugaskan',
  started:   'Berlangsung',
  completed: 'Selesai',
  cancelled: 'Dibatalkan',
};

/** Minimum characters required for a cancellation reason. */
const CANCEL_REASON_MIN = 10;

/* ── Module State ── */
let viewingId = null;
let assignments = [];
let onEditCallback = null;
let onDeleteCallback = null;
let onStartCallback = null;
let onCompleteCallback = null;
let onCommentCallback = null;
let onCancelCallback = null;

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

/**
 * Cancellation eligibility (v1.10.7 — Assignment Cancellation Workflow).
 *
 * Admin   — may cancel any active assignment: 'assigned' (≈approved) or
 *           'started' (≈in_progress).
 * Bidang  — may cancel only their OWN request-derived assignment, and only
 *           before the driver starts it ('assigned'). Once started,
 *           operational control belongs to Admin.
 * Completed / already-cancelled assignments are terminal → never cancellable.
 */
function canCancelAssignment(assignment) {
  if (!hasPermission('cancel') || !assignment) return false;
  const user = getCurrentUser();
  if (!user) return false;

  const status = normalizeStatus(assignment.status);
  if (status === 'completed' || status === 'cancelled') return false;

  if (user.role === 'admin') {
    return status === 'assigned' || status === 'started';
  }

  if (user.role === 'bidang') {
    if (status !== 'assigned') return false;       // not after driver starts
    if (!assignment.requestId) return false;        // only request-derived
    const owner = String(assignment.createdBy || '').trim().toLowerCase();
    const me = [user.name, user.username]
      .filter(Boolean)
      .map(v => String(v).trim().toLowerCase());
    return owner !== '' && me.includes(owner);
  }

  return false;
}

export function registerEditCallback(callback) { onEditCallback = callback; }
export function registerDeleteCallback(callback) { onDeleteCallback = callback; }
export function registerStartCallback(callback) { onStartCallback = callback; }
export function registerCompleteCallback(callback) { onCompleteCallback = callback; }
export function registerCommentCallback(callback) { onCommentCallback = callback; }
export function registerCancelCallback(callback) { onCancelCallback = callback; }

export function setAssignments(newAssignments) {
  assignments = newAssignments;
}

/* ── Odometer Modal ─────────────────────────────────────────────
   Shown before Start / Complete to capture KM Awal / KM Akhir.
   Uses Option A: detail modal closes before odometer opens (no stacking).
   ────────────────────────────────────────────────────────────── */

let _odoType       = null;  // 'start' | 'complete'
let _odoId         = null;  // assignmentId
let _odoAssignment = null;  // assignment object (for context + prev odometer)
let _odoCallback   = null;  // (assignmentId, odoData) => void

function _openOdometerModal(type, assignmentId, assignment, callback) {
  _odoType       = type;
  _odoId         = assignmentId;
  _odoAssignment = assignment;
  _odoCallback   = callback;

  const isStart = type === 'start';

  // Close detail modal first (Option A — no stacked modals)
  closeDetailModal();

  // Populate header
  const titleEl   = document.getElementById('odoModalTitle');
  const metaEl    = document.getElementById('odoModalMeta');
  const labelEl   = document.getElementById('odoInputLabel');
  const confirmEl = document.getElementById('btnConfirmOdometer');
  const hintEl    = document.getElementById('odoHint');
  const input     = document.getElementById('odoInput');
  const previewEl = document.getElementById('odoPreview');

  if (titleEl)   titleEl.textContent = isStart ? 'Mulai Assignment' : 'Selesaikan Assignment';
  if (labelEl)   labelEl.textContent = isStart ? 'KM AWAL' : 'KM AKHIR';
  if (confirmEl) confirmEl.textContent = isStart ? 'Mulai Assignment' : 'Selesaikan Assignment';
  if (hintEl)    { hintEl.textContent = ''; }
  if (input)     { input.value = ''; }
  if (previewEl) { previewEl.style.display = 'none'; }

  if (metaEl) {
    const parts = [
      `${escapeHTML(assignment.driver)} · ${escapeHTML(assignment.vehicle || '')}`,
      escapeHTML(formatDateLong(assignment.date)),
      escapeHTML(assignment.destination || ''),
    ].filter(Boolean);
    metaEl.textContent = parts.join('\n');
  }

  // Show preview section only for Complete when KM Awal is available
  if (!isStart && assignment.startOdometer != null) {
    const startEl = document.getElementById('odoPreviewStart');
    if (startEl) startEl.textContent = `${Number(assignment.startOdometer).toLocaleString()} km`;
    const endEl = document.getElementById('odoPreviewEnd');
    if (endEl)   endEl.textContent = '—';
    const distEl = document.getElementById('odoPreviewDistance');
    if (distEl)  distEl.textContent = '—';
    if (previewEl) previewEl.style.display = 'block';
  }

  const modal = document.getElementById('modalOdometer');
  if (modal) modal.style.display = 'flex';

  setTimeout(() => { if (input) input.focus(); }, 80);
}

/**
 * Close odometer modal.
 * @param {boolean} reopenDetail - If true, re-open the detail modal for the same assignment.
 */
function _closeOdometerModal(reopenDetail = false) {
  const modal = document.getElementById('modalOdometer');
  if (modal) modal.style.display = 'none';

  if (reopenDetail && _odoId) {
    openDetailModal(_odoId);
  }

  _odoType = _odoId = _odoAssignment = _odoCallback = null;
}

function _updateOdometerPreview() {
  if (_odoType !== 'complete' || _odoAssignment?.startOdometer == null) return;

  const previewEl = document.getElementById('odoPreview');
  const endEl     = document.getElementById('odoPreviewEnd');
  const distEl    = document.getElementById('odoPreviewDistance');
  if (!previewEl) return;

  const input = document.getElementById('odoInput');
  const raw = input ? String(input.value).trim() : '';
  const endOdo   = Number(raw);
  const startOdo = Number(_odoAssignment.startOdometer);

  if (!raw || !Number.isFinite(endOdo)) {
    if (endEl)  endEl.textContent  = '—';
    if (distEl) distEl.textContent = '—';
    return;
  }

  if (endEl) endEl.textContent = `${endOdo.toLocaleString()} km`;

  if (endOdo >= startOdo) {
    if (distEl) distEl.textContent = `${(endOdo - startOdo).toLocaleString()} km`;
  } else {
    if (distEl) distEl.textContent = '⚠️ Lebih kecil dari KM Awal';
  }
}

function _handleOdometerConfirm() {
  const input  = document.getElementById('odoInput');
  const hintEl = document.getElementById('odoHint');
  const raw    = input ? String(input.value).trim() : '';

  const isStart    = _odoType === 'start';
  const prevOdoVal = (!isStart && _odoAssignment?.startOdometer != null)
    ? _odoAssignment.startOdometer
    : undefined;

  const result = validateOdometer({ currentOdometer: raw, previousOdometer: prevOdoVal });

  if (hintEl) {
    const msgs = [...result.errors, ...result.warnings];
    hintEl.textContent = msgs.join(' ');
  }

  if (!result.valid) return;

  const odoValue = Number(raw);
  if (_odoCallback) {
    _odoCallback(_odoId, isStart ? { startOdometer: odoValue } : { endOdometer: odoValue });
  }
  _closeOdometerModal(false); // confirm → don't reopen detail
}

/* ── Cancellation Modal ─────────────────────────────────────────
   Confirmation dialog shown before cancelling an assignment.
   Captures a mandatory reason (min 10 chars). Mirrors the odometer
   modal pattern: detail modal closes first; "Kembali" reopens it.
   ────────────────────────────────────────────────────────────── */

let _cancelId = null; // assignment id pending cancellation

function _syncCancelConfirmState() {
  const input   = document.getElementById('cancelReasonInput');
  const counter = document.getElementById('cancelReasonCounter');
  const confirm = document.getElementById('btnConfirmCancel');
  const len = input ? String(input.value).trim().length : 0;

  if (counter) {
    counter.textContent = len < CANCEL_REASON_MIN
      ? `Minimal ${CANCEL_REASON_MIN} karakter (${len}/${CANCEL_REASON_MIN})`
      : `${len} karakter`;
    counter.classList.toggle('cancel-reason-counter--ok', len >= CANCEL_REASON_MIN);
  }
  if (confirm) confirm.disabled = len < CANCEL_REASON_MIN;
}

function _openCancelModal(assignmentId) {
  _cancelId = assignmentId;
  closeDetailModal(); // Option A — no stacked modals

  const input = document.getElementById('cancelReasonInput');
  if (input) input.value = '';
  _syncCancelConfirmState();

  const modal = document.getElementById('modalCancel');
  if (modal) modal.style.display = 'flex';
  setTimeout(() => { if (input) input.focus(); }, 80);
}

/**
 * @param {boolean} reopenDetail - reopen the detail modal for the same assignment.
 */
function _closeCancelModal(reopenDetail = false) {
  const modal = document.getElementById('modalCancel');
  if (modal) modal.style.display = 'none';

  const reopenId = _cancelId;
  _cancelId = null;
  if (reopenDetail && reopenId) openDetailModal(reopenId);
}

function _handleCancelConfirm() {
  const input  = document.getElementById('cancelReasonInput');
  const reason = input ? String(input.value).trim() : '';
  if (reason.length < CANCEL_REASON_MIN) {
    _syncCancelConfirmState();
    return;
  }
  const id = _cancelId;
  _closeCancelModal(false);
  if (id && onCancelCallback) onCancelCallback(id, reason);
}

export function initModalHandlers() {
  initAccordionListeners();

  document.getElementById('btnCloseDetail')?.addEventListener('click', closeDetailModal);
  document.getElementById('btnCloseDetail2')?.addEventListener('click', closeDetailModal);

  // Odometer modal handlers
  // Close/Cancel → reopen detail modal so user doesn't lose context
  document.getElementById('btnCloseOdometer')?.addEventListener('click',  () => _closeOdometerModal(true));
  document.getElementById('btnCancelOdometer')?.addEventListener('click', () => _closeOdometerModal(true));
  document.getElementById('btnConfirmOdometer')?.addEventListener('click', _handleOdometerConfirm);
  document.getElementById('odoInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter')  _handleOdometerConfirm();
    if (e.key === 'Escape') _closeOdometerModal(true);
  });
  // Live preview while typing (Complete mode)
  document.getElementById('odoInput')?.addEventListener('input', _updateOdometerPreview);
  document.getElementById('modalOdometer')?.addEventListener('click', (e) => {
    if (e.target === document.getElementById('modalOdometer')) _closeOdometerModal(true);
  });

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

  // Start — open odometer modal to capture KM Awal before confirming
  document.getElementById('btnStartAssignment')?.addEventListener('click', () => {
    const a = assignments.find(x => x.id === viewingId);
    if (!canActOnAssignment('start', a)) {
      showToast('Hanya Admin atau Driver yang ditugaskan yang bisa memulai');
      return;
    }
    const status = normalizeStatus(a?.status);
    if (status === 'started')   { showToast('Penugasan sudah dimulai'); return; }
    if (status === 'completed') { showToast('Penugasan sudah selesai'); return; }
    _openOdometerModal('start', viewingId, a, (assignmentId, odoData) => {
      if (onStartCallback) onStartCallback(assignmentId, odoData);
      closeDetailModal();
    });
  });

  // Complete — open odometer modal to capture KM Akhir before confirming
  document.getElementById('btnCompleteAssignment')?.addEventListener('click', () => {
    const a = assignments.find(x => x.id === viewingId);
    if (!canActOnAssignment('complete', a)) {
      showToast('Hanya Admin atau Driver yang ditugaskan yang bisa menyelesaikan');
      return;
    }
    const status = normalizeStatus(a?.status);
    if (status === 'completed') { showToast('Penugasan sudah selesai'); return; }
    _openOdometerModal('complete', viewingId, a, (assignmentId, odoData) => {
      if (onCompleteCallback) onCompleteCallback(assignmentId, odoData);
      closeDetailModal();
    });
  });

  // Cancel (Batalkan) — open confirmation dialog to capture a reason
  document.getElementById('btnCancelAssignment')?.addEventListener('click', () => {
    const a = assignments.find(x => x.id === viewingId);
    if (!canCancelAssignment(a)) {
      showToast('Anda tidak dapat membatalkan assignment ini');
      return;
    }
    _openCancelModal(viewingId);
  });

  // Cancellation modal: Kembali reopens detail; Konfirmasi performs the cancel
  document.getElementById('btnCloseCancel')?.addEventListener('click',  () => _closeCancelModal(true));
  document.getElementById('btnBackCancel')?.addEventListener('click',   () => _closeCancelModal(true));
  document.getElementById('btnConfirmCancel')?.addEventListener('click', _handleCancelConfirm);
  document.getElementById('cancelReasonInput')?.addEventListener('input', _syncCancelConfirmState);
  document.getElementById('modalCancel')?.addEventListener('click', (e) => {
    if (e.target === document.getElementById('modalCancel')) _closeCancelModal(true);
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

  // Print Reimbursement Form — async: acquires sequential doc number before opening window
  document.getElementById('btnPrintReimbursement')?.addEventListener('click', async () => {
    const a = assignments.find(x => x.id === viewingId);
    if (!a) return;
    const btn = document.getElementById('btnPrintReimbursement');
    if (btn) { btn.disabled = true; btn.textContent = 'Memproses...'; }
    try {
      await printReimbursementForm(a);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '📄 Generate Form Reimbursement'; }
    }
  });

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

  // Section 1: Ringkasan Jadwal
  const summaryEl = document.getElementById('detailSummary');
  if (summaryEl) {
    summaryEl.innerHTML = `
      <div class="detail-row">
        <span class="detail-label">Status</span>
        <span class="detail-value">
          <span class="badge-status badge-status--${status}">${escapeHTML(statusLabel)}</span>
        </span>
      </div>
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
          <span class="vehicle-badge" style="background:${getVehicleColor(a.vehicle)}">${escapeHTML(a.vehicle)}</span>
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
    `;
  }

  // Section 2: Detail Tambahan
  const extraEl = document.getElementById('detailExtra');
  if (extraEl) {
    extraEl.innerHTML = `
      <div class="detail-row">
        <span class="detail-label">PIC</span>
        <span class="detail-value">${escapeHTML(a.pic || '-')}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Penumpang</span>
        <span class="detail-value">${escapeHTML(String(a.pax ?? 0))} pax</span>
      </div>
      ${a.notes ? `
      <div class="detail-row">
        <span class="detail-label">Catatan</span>
        <span class="detail-value">${escapeHTML(a.notes)}</span>
      </div>` : ''}
    `;
  }

  // Section 3: Informasi Operasional
  const opsEl = document.getElementById('detailOps');
  if (opsEl) {
    opsEl.innerHTML = buildOpsRows(a) || '<p class="detail-empty">Belum ada informasi operasional.</p>';
  }

  // Section 4: Odometer — show only when odometer data exists
  const odoEl = document.getElementById('detailOdo');
  const accordOdo = document.getElementById('accordOdo');
  if (odoEl && accordOdo) {
    const odoRows = buildOdoRows(a);
    if (odoRows) {
      odoEl.innerHTML = odoRows;
      accordOdo.classList.remove('accord-section--hidden');
    } else {
      accordOdo.classList.add('accord-section--hidden');
    }
  }

  // Section 5: Ringkasan WhatsApp
  const waText = document.getElementById('waPreviewText');
  if (waText) waText.textContent = generateWAText(a);

  // Reset accordion state: collapse all except Section 1
  _resetAccordions();

  updateDetailActionButtons();

  const modal = document.getElementById('modalDetail');
  if (modal) modal.style.display = 'flex';
}

/** Operational audit rows (who requested/assigned/started/completed). */
function buildOpsRows(a) {
  const rows = [];

  // Show requester only for request-based assignments when different from assigner.
  if (a.createdBy && a.requestId && a.createdBy !== a.assignedBy) {
    rows.push(`
      <div class="detail-row">
        <span class="detail-label">Diminta oleh</span>
        <span class="detail-value">${escapeHTML(a.createdBy)} <span class="detail-ts">${a.createdAt ? formatDateTime(a.createdAt) : ''}</span></span>
      </div>`);
  }

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

  // Cancellation audit (v1.10.7) — permanently visible once cancelled.
  if (a.cancelledAt || a.cancellationReason) {
    const cancelledByName = a.cancelledBy?.name || a.cancelledBy || '-';
    rows.push(`
      <div class="detail-row detail-row--cancelled">
        <span class="detail-label">Dibatalkan oleh</span>
        <span class="detail-value">${escapeHTML(cancelledByName)}${a.cancelledAt ? ` <span class="detail-ts">${formatDateTime(a.cancelledAt)}</span>` : ''}</span>
      </div>`);
    if (a.cancellationReason) {
      rows.push(`
      <div class="detail-row detail-row--cancelled">
        <span class="detail-label">Alasan Pembatalan</span>
        <span class="detail-value">${escapeHTML(a.cancellationReason)}</span>
      </div>`);
    }
  }

  return rows.join('');
}

/** Odometer rows (KM Awal / KM Akhir / Jarak Tempuh). Returns empty string if no data. */
function buildOdoRows(a) {
  const rows = [];

  if (a.startOdometer != null) {
    rows.push(`
      <div class="detail-row">
        <span class="detail-label">KM Awal</span>
        <span class="detail-value">${Number(a.startOdometer).toLocaleString()} km</span>
      </div>`);
  }

  if (a.endOdometer != null) {
    rows.push(`
      <div class="detail-row">
        <span class="detail-label">KM Akhir</span>
        <span class="detail-value">${Number(a.endOdometer).toLocaleString()} km</span>
      </div>`);
  }

  if (a.distanceTravelled != null) {
    rows.push(`
      <div class="detail-row">
        <span class="detail-label">Jarak Tempuh</span>
        <span class="detail-value">${Number(a.distanceTravelled).toLocaleString()} km</span>
      </div>`);
  }

  return rows.join('');
}

/** Collapse all accordion sections back to default state (Section 1 stays open). */
function _resetAccordions() {
  document.querySelectorAll('#modalDetail .accord-section').forEach(section => {
    const header = section.querySelector('.accord-header');
    if (section.id === 'accordSummary') {
      section.classList.add('accord-section--open');
      header?.setAttribute('aria-expanded', 'true');
    } else {
      section.classList.remove('accord-section--open');
      header?.setAttribute('aria-expanded', 'false');
    }
  });
}

/** Wire up accordion toggle behaviour (called once from initModalHandlers). */
function initAccordionListeners() {
  document.querySelectorAll('#modalDetail .accord-header').forEach(btn => {
    btn.addEventListener('click', () => {
      const section = btn.closest('.accord-section');
      if (!section) return;
      const isOpen = section.classList.contains('accord-section--open');
      section.classList.toggle('accord-section--open', !isOpen);
      btn.setAttribute('aria-expanded', String(!isOpen));
    });
  });
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
  const btnCancel   = document.getElementById('btnCancelAssignment');

  const a = viewingId ? assignments.find(x => x.id === viewingId) : null;
  const status = normalizeStatus(a?.status);
  // Terminal states can't be edited, started, completed, or re-cancelled.
  const isTerminal = status === 'completed' || status === 'cancelled';

  const btnComment = document.getElementById('btnCommentThread');
  if (btnComment) {
    btnComment.style.display = (a?.requestId) ? '' : 'none';
  }

  // Reimbursement section — only for Admin and Driver roles
  const accordRmb = document.getElementById('accordReimbursement');
  if (accordRmb) {
    accordRmb.style.display = hasPermission('print_reimbursement') ? '' : 'none';
  }

  if (btnEdit) {
    // Cancelled/completed assignments are terminal — editing is blocked.
    const canEdit = hasPermission('edit') && status !== 'cancelled';
    btnEdit.disabled = !canEdit;
    btnEdit.title = status === 'cancelled'
      ? 'Assignment yang dibatalkan tidak dapat diedit'
      : (hasPermission('edit') ? 'Edit jadwal' : 'Hanya admin yang bisa edit');
  }

  if (btnCancel) {
    const showCancel = canCancelAssignment(a);
    btnCancel.style.display = showCancel ? '' : 'none';
    btnCancel.disabled = false;
    btnCancel.title = 'Batalkan assignment';
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
    // Hide for terminal states (completed already disabled it; cancelled removes it).
    btnComplete.style.display = (canComplete && status !== 'cancelled') ? '' : 'none';
    btnComplete.disabled = alreadyDone;
    btnComplete.title = alreadyDone
      ? 'Penugasan sudah selesai'
      : 'Tandai penugasan sebagai selesai';
  }

  // Show/hide the primary actions container based on whether any button is visible
  const primaryArea = document.getElementById('detailActionsPrimary');
  if (primaryArea) {
    const hasVisible = [...primaryArea.querySelectorAll('button')]
      .some(b => b.style.display !== 'none');
    primaryArea.style.display = hasVisible ? 'flex' : 'none';
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
  const picStr    = a.pic ? `${a.pax ?? 0} Pax (${a.pic})` : `${a.pax ?? 0} Pax`;
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
