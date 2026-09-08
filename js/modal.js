/* ============================================================
   MODAL.JS — Assignment Detail (now on the canonical drawer) & WhatsApp Preview

   Open/close detail drawer, render assignment details, generate WhatsApp
   text, delete/edit/start/complete actions.

   Design System Program Phase 2 — Assignment Detail migrated off the legacy
   #modalDetail (.modal-overlay/.modal-box + a desktop-only CSS costume) onto
   js/components/drawer.js, the canonical drawer primitive. All permission
   logic (hasPermission/canActOnAssignment/canCancelAssignment), all
   Firebase-touching callbacks (registered by js/app.js), and every exported
   function's name/signature are unchanged — openDetailModal(id)/
   closeDetailModal() are called from 8+ entry points across the app and
   none of them needed to change. Only the render target changed: content
   that used to write into pre-existing static DOM nodes now builds one HTML
   string handed to the drawer's open() call, and per-button listeners that
   used to bind once at boot (into permanent DOM) now bind once per drawer
   open (into freshly-created DOM, torn down on close — same lifecycle the
   drawer primitive already uses for every other consumer).

   The 4 satellite modals (Odometer/Cancel/OvertimeOverride, all
   confirmation-with-required-input dialogs; CommentThread) are UNCHANGED —
   still legacy centered modals, per the Phase 2 migration map's own
   classification (short, single-purpose, blocking confirmations may stay
   dialogs). Their "Option A" contract (detail closes first, no stacking;
   reopens the same assignment after) is preserved exactly, just with the
   new drawer on the detail side of it instead of the old modal.
   ============================================================ */

'use strict';

import { formatDateLong, formatDateTime, getTimePeriod, parseLocalDate, showToast, vehicleLabel, computeWorkTime } from './utils.js';
import { getVehicleColor } from './drivers.js';
import { getVehicleByName } from './vehicles-store.js';
import { hasPermission, getCurrentUser, assignmentBelongsToDriver } from './auth.js';
import { validateOdometer } from './validation.js';
import { printReimbursementForm } from './reimbursement.js';
import { getSetting } from './settings-store.js';
import { openDrawer, closeDrawer } from './components/drawer.js';
import { anIcon } from './analytics/analytics-shell.js';

/** Live office-hours window (09:00–17:00 default) for overtime detection. */
function getOfficeHours() {
  return {
    workStartMins: getSetting('operations.workStartMins'),
    workEndMins:   getSetting('operations.workEndMins'),
  };
}

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
/** Minimum characters required for an overtime-override reason (v1.16.4.9). */
const OT_OVERRIDE_REASON_MIN = 10;

/* ── Module State ── */
let viewingId = null;
let assignments = [];
let onEditCallback = null;
let onDeleteCallback = null;
let onStartCallback = null;
let onCompleteCallback = null;
let onCommentCallback = null;
let onCancelCallback = null;
let onOvertimeOverrideCallback = null;

/** Normalize legacy status values to canonical lifecycle codes. */
function normalizeStatus(status) {
  if (!status || status === 'aktif') return 'assigned';
  if (status === 'selesai') return 'completed';
  return status;
}

/**
 * Whether `assignment` is a request-derived assignment owned by Bidang `user`
 * (same requestId + createdBy match rule used by cancellation eligibility and,
 * as of v1.27.0, Self-Drive Start/Complete ownership).
 */
function _isOwnBidangAssignment(assignment, user) {
  if (!assignment || !assignment.requestId) return false;
  const owner = String(assignment.createdBy || '').trim().toLowerCase();
  const me = [user.name, user.username]
    .filter(Boolean)
    .map(v => String(v).trim().toLowerCase());
  return owner !== '' && me.includes(owner);
}

/**
 * Check if current user can perform a lifecycle action on a specific assignment.
 * Admin: always allowed. Driver: only their own assignment. Bidang (v1.27.0):
 * only their own SELF-DRIVE assignment (no driver) — someone has to be able to
 * Start/Complete a trip with no driver, and it's the requester who drives it.
 */
function canActOnAssignment(permission, assignment) {
  if (!hasPermission(permission)) return false;
  const user = getCurrentUser();
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (user.role === 'driver' && assignment) {
    // Same shared ownership predicate the dashboard visibility filter uses, so a
    // driver can act on every assignment they can see. Previously this gate used
    // a NARROWER identity set than visibility (username+name only), so renaming
    // the display name left assignments visible-but-not-actionable (v1.20.7 Obj 9).
    return assignmentBelongsToDriver(assignment, user);
  }
  if (user.role === 'bidang' && assignment) {
    return !assignment.driver && _isOwnBidangAssignment(assignment, user);
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
    return _isOwnBidangAssignment(assignment, user);
  }

  return false;
}

export function registerEditCallback(callback) { onEditCallback = callback; }
export function registerDeleteCallback(callback) { onDeleteCallback = callback; }
export function registerStartCallback(callback) { onStartCallback = callback; }
export function registerCompleteCallback(callback) { onCompleteCallback = callback; }
export function registerCommentCallback(callback) { onCommentCallback = callback; }
export function registerCancelCallback(callback) { onCancelCallback = callback; }
export function registerOvertimeOverrideCallback(callback) { onOvertimeOverrideCallback = callback; }

export function setAssignments(newAssignments) {
  assignments = newAssignments;
}

/**
 * Delete an assignment after a confirmation prompt — the single delete entry
 * point shared by the detail drawer's Delete button AND the Timeline's
 * "Delete Assignment" context-menu action (js/timeline-interactions.js), so
 * the permission gate and confirmation UX never diverge between the two.
 * @param {string} id
 * @returns {boolean} true when the assignment was actually deleted
 */
export function requestDeleteAssignment(id) {
  if (!hasPermission('delete')) {
    showToast('Anda tidak punya akses untuk menghapus jadwal');
    return false;
  }
  if (!id || !assignments.some(a => a.id === id)) return false;
  if (!confirm('Yakin ingin menghapus jadwal ini?')) return false;
  if (onDeleteCallback) onDeleteCallback(id);
  return true;
}

/* ── Odometer Modal ─────────────────────────────────────────────
   Shown before Start / Complete to capture KM Awal / KM Akhir.
   Uses Option A: detail drawer closes before odometer opens (no stacking).
   Unchanged legacy centered modal — still static DOM in index.html.
   ────────────────────────────────────────────────────────────── */

let _odoType       = null;  // 'start' | 'complete'
let _odoId         = null;  // assignmentId
let _odoAssignment = null;  // assignment object (for context + prev odometer)
let _odoVehicle    = null;  // v1.27.0: resolved vehicle record (for odometer autofill/reference)
let _odoCallback   = null;  // (assignmentId, odoData) => void

// v1.30.14.3 — Start Assignment: KM Awal is LOCKED to the authoritative vehicle
// odometer. `_odoStartAuthoritative` is that value (null ⇒ the vehicle has no
// recorded odometer yet, so the field is editable as a first reading);
// `_odoStartCorrected` flips true only via the explicit "Koreksi odometer"
// override, which then requires a reason (written to the audit trail).
let _odoStartAuthoritative = null;
let _odoStartCorrected     = false;
const ODO_CORRECT_REASON_MIN = 6;

// SS2 hotfix (v1.27.1): vehicles/{id}/odometer is the existing Vehicle
// Registration field (stored as a trimmed string — see ASSET_STRING_FIELDS in
// vehicles-store.js) and is the single source of truth for autofill/reference,
// not the v1.27.0 `lastOdometer` field. '' (never set) must read as "no value",
// not as 0.
function _vehicleOdometerValue(vehicle) {
  const raw = vehicle?.odometer;
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** Exported for unit testing (scripts/odometer-completion-guard-check.mjs);
 *  the detail-drawer Start/Complete buttons call it internally, unchanged. */
export { _openOdometerModal as openOdometerModalForTest };

function _openOdometerModal(type, assignmentId, assignment, callback) {
  _odoType       = type;
  _odoId         = assignmentId;
  _odoAssignment = assignment;
  _odoVehicle    = assignment?.vehicle ? getVehicleByName(assignment.vehicle) : null;
  _odoCallback   = callback;

  const isStart = type === 'start';

  // Close detail drawer first (Option A — no stacked modals)
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
  // V1 fix: the confirm button is the ONE decisive action of this dialog —
  // label it "Konfirmasi …", not a second "Mulai Assignment" that reads as
  // re-pressing the drawer's own "Mulai Tugas" CTA.
  if (confirmEl) confirmEl.textContent = isStart ? 'Konfirmasi & Mulai' : 'Konfirmasi & Selesai';
  if (hintEl)    { hintEl.textContent = ''; }
  if (previewEl) { previewEl.style.display = 'none'; }

  // ── KM Awal / KM Akhir field state ──────────────────────────────────
  const lockEl        = document.getElementById('odoLock');
  const correctBtn    = document.getElementById('btnOdoCorrect');
  const correctBox    = document.getElementById('odoCorrectBox');
  const correctReason = document.getElementById('odoCorrectReason');
  const sanityWrap    = document.getElementById('odoSanityWrap');
  const sanityAck     = document.getElementById('odoSanityAck');

  _odoStartAuthoritative = isStart ? _vehicleOdometerValue(_odoVehicle) : null;
  _odoStartCorrected     = false;
  if (correctReason) correctReason.value = '';
  if (correctBox)    correctBox.hidden = true;
  if (sanityWrap)    sanityWrap.hidden = true;
  if (sanityAck)     sanityAck.checked = false;

  if (isStart && _odoStartAuthoritative != null) {
    // Locked to the vehicle's authoritative odometer; "Koreksi odometer" is the
    // only way to change it, and it costs a reason + an audit entry.
    if (input) { input.value = String(_odoStartAuthoritative); input.setAttribute('readonly', 'readonly'); }
    if (lockEl)     lockEl.hidden = false;
    if (correctBtn) correctBtn.hidden = false;
    if (hintEl)     hintEl.textContent = 'KM Awal diambil dari catatan odometer kendaraan.';
  } else {
    // Complete mode (KM Akhir), or Start with no recorded vehicle odometer yet.
    if (input) { input.value = ''; input.removeAttribute('readonly'); }
    if (lockEl)     lockEl.hidden = true;
    if (correctBtn) correctBtn.hidden = true;
    if (isStart && hintEl) hintEl.textContent = 'Kendaraan ini belum punya catatan odometer — masukkan pembacaan saat ini.';
  }

  if (metaEl) {
    const parts = [
      `${escapeHTML(assignment.driver)} · ${escapeHTML(vehicleLabel(assignment.vehicle))}`,
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
 * @param {boolean} reopenDetail - If true, re-open the detail drawer for the same assignment.
 */
function _closeOdometerModal(reopenDetail = false) {
  const modal = document.getElementById('modalOdometer');
  if (modal) modal.style.display = 'none';

  if (reopenDetail && _odoId) {
    openDetailModal(_odoId);
  }

  _odoType = _odoId = _odoAssignment = _odoVehicle = _odoCallback = null;
  _odoStartAuthoritative = null;
  _odoStartCorrected = false;
}

/**
 * "Koreksi odometer" (Start only) — the explicit override of the locked KM Awal.
 * Unlocks the input, reveals the mandatory reason field, and re-gates Confirm.
 */
function _onOdoCorrectClick() {
  if (_odoType !== 'start') return;
  _odoStartCorrected = true;
  const input      = document.getElementById('odoInput');
  const correctBtn = document.getElementById('btnOdoCorrect');
  const correctBox = document.getElementById('odoCorrectBox');
  const lockEl     = document.getElementById('odoLock');
  const reason     = document.getElementById('odoCorrectReason');
  if (input)      { input.removeAttribute('readonly'); input.focus(); input.select(); }
  if (lockEl)     lockEl.hidden = true;
  if (correctBtn) correctBtn.hidden = true;
  if (correctBox) correctBox.hidden = false;
  setTimeout(() => reason && reason.focus(), 60);
  _syncOdoConfirmState();
}

/** Suspicious-distance threshold on the DERIVED completion distance. */
function _odoSuspiciousDistance(dist) {
  return Number.isFinite(dist) && dist > getSetting('operations.odometerWarnJumpKm');
}

/**
 * Gate #btnConfirmOdometer:
 *  - Complete + a suspicious derived distance ⇒ requires the sanity checkbox.
 *  - Start + "Koreksi odometer" ⇒ requires a reason of at least the minimum.
 */
function _syncOdoConfirmState() {
  const btn = document.getElementById('btnConfirmOdometer');
  if (!btn) return;
  let disabled = false;

  if (_odoType === 'complete') {
    const wrap = document.getElementById('odoSanityWrap');
    const ack  = document.getElementById('odoSanityAck');
    if (wrap && !wrap.hidden && ack && !ack.checked) disabled = true;
  } else if (_odoType === 'start' && _odoStartCorrected) {
    const reason = document.getElementById('odoCorrectReason');
    const len = reason ? String(reason.value).trim().length : 0;
    if (len < ODO_CORRECT_REASON_MIN) disabled = true;
  }
  btn.disabled = disabled;
}

function _updateOdometerPreview() {
  if (_odoType === 'start') { _syncOdoConfirmState(); return; }
  if (_odoType !== 'complete' || _odoAssignment?.startOdometer == null) { _syncOdoConfirmState(); return; }

  const previewEl = document.getElementById('odoPreview');
  const endEl     = document.getElementById('odoPreviewEnd');
  const distEl    = document.getElementById('odoPreviewDistance');
  const sanityWrap = document.getElementById('odoSanityWrap');
  const sanityAck  = document.getElementById('odoSanityAck');
  if (!previewEl) return;

  const input = document.getElementById('odoInput');
  const raw = input ? String(input.value).trim() : '';
  const endOdo   = Number(raw);
  const startOdo = Number(_odoAssignment.startOdometer);

  const clearSanity = () => { if (sanityWrap) sanityWrap.hidden = true; if (sanityAck) sanityAck.checked = false; };

  if (!raw || !Number.isFinite(endOdo)) {
    if (endEl)  endEl.textContent  = '—';
    if (distEl) distEl.textContent = '—';
    clearSanity();
    _syncOdoConfirmState();
    return;
  }

  if (endEl) endEl.textContent = `${endOdo.toLocaleString()} km`;

  if (endOdo >= startOdo) {
    const dist = endOdo - startOdo;
    if (distEl) distEl.textContent = `${dist.toLocaleString()} km`;
    // Suspicious (but legitimate long trips exist) ⇒ ask for an explicit check,
    // never a hard block.
    if (_odoSuspiciousDistance(dist)) {
      if (sanityWrap && sanityWrap.hidden) { sanityWrap.hidden = false; if (sanityAck) sanityAck.checked = false; }
    } else {
      clearSanity();
    }
  } else {
    if (distEl) distEl.innerHTML = `${anIcon('alert', { size: 13 })} Lebih kecil dari KM Awal`;
    clearSanity();
  }
  _syncOdoConfirmState();
}

function _handleOdometerConfirm() {
  const input  = document.getElementById('odoInput');
  const hintEl = document.getElementById('odoHint');
  const raw    = input ? String(input.value).trim() : '';

  const isStart    = _odoType === 'start';
  const prevOdoVal = (!isStart && _odoAssignment?.startOdometer != null)
    ? _odoAssignment.startOdometer
    : undefined;
  // v1.27.0/SS2: warn-only comparison against vehicle.odometer, Start only.
  const refOdoVal = isStart ? (_vehicleOdometerValue(_odoVehicle) ?? undefined) : undefined;

  const result = validateOdometer({ currentOdometer: raw, previousOdometer: prevOdoVal, referenceOdometer: refOdoVal });

  if (hintEl) {
    const msgs = [...result.errors, ...result.warnings];
    hintEl.textContent = msgs.join(' ');
  }

  if (!result.valid) return; // hard block — e.g. "Odometer mundur" (end < start)

  // Start override: a corrected KM Awal needs a reason (also gates the button).
  const reasonEl = document.getElementById('odoCorrectReason');
  const correctionReason = reasonEl ? String(reasonEl.value).trim() : '';
  if (isStart && _odoStartCorrected && correctionReason.length < ODO_CORRECT_REASON_MIN) {
    if (hintEl) hintEl.textContent = `Alasan koreksi minimal ${ODO_CORRECT_REASON_MIN} karakter.`;
    return;
  }
  // Complete: a suspicious derived distance needs the explicit acknowledgement.
  if (!isStart) {
    const wrap = document.getElementById('odoSanityWrap');
    const ack  = document.getElementById('odoSanityAck');
    if (wrap && !wrap.hidden && ack && !ack.checked) {
      if (hintEl) hintEl.textContent = 'Centang kotak konfirmasi untuk melanjutkan.';
      return;
    }
  }

  const odoValue = Number(raw);
  const payload = isStart
    ? {
        startOdometer: odoValue,
        // Only present when the operator explicitly overrode the locked value —
        // js/app.js writes an `odometer_corrected` audit entry for it.
        ...(_odoStartCorrected
          ? { odometerCorrected: true, correctionReason, previousStartOdometer: _odoStartAuthoritative }
          : {}),
      }
    : { endOdometer: odoValue };

  if (_odoCallback) {
    // Pass the already-resolved assignment object through as a 3rd arg so
    // the lifecycle handler (js/app.js) can act on THIS trip even if its
    // own `assignments` array is momentarily out of sync — the root cause
    // of "Mulai Tugas does nothing on the first try" (a silent
    // findIndex === -1 bail).
    _odoCallback(_odoId, payload, _odoAssignment);
  }
  _closeOdometerModal(false); // confirm → don't reopen detail
}

/* ── Cancellation Modal ─────────────────────────────────────────
   Confirmation dialog shown before cancelling an assignment.
   Captures a mandatory reason (min 10 chars). Mirrors the odometer
   modal pattern: detail drawer closes first; "Kembali" reopens it.
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
 * @param {boolean} reopenDetail - reopen the detail drawer for the same assignment.
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

/* ── Overtime Override Modal (v1.16.4.9) ────────────────────────
   Admin-only dialog to force a completed assignment's overtime final
   status (Paksa Normal / Paksa Lembur). Reason is mandatory. Mirrors
   the cancellation modal: detail closes first; "Kembali" reopens it.
   ────────────────────────────────────────────────────────────── */

let _otOverrideId = null; // assignment id pending override

function _selectedOtChoice() {
  const el = document.querySelector('input[name="otOverrideChoice"]:checked');
  return el ? el.value : '';
}

function _syncOtOverrideState() {
  const input   = document.getElementById('otOverrideReason');
  const counter = document.getElementById('otOverrideCounter');
  const confirm = document.getElementById('btnConfirmOtOverride');
  const len = input ? String(input.value).trim().length : 0;
  const hasChoice = _selectedOtChoice() === 'NORMAL' || _selectedOtChoice() === 'LEMBUR';

  if (counter) {
    counter.textContent = len < OT_OVERRIDE_REASON_MIN
      ? `Minimal ${OT_OVERRIDE_REASON_MIN} karakter (${len}/${OT_OVERRIDE_REASON_MIN})`
      : `${len} karakter`;
    counter.classList.toggle('cancel-reason-counter--ok', len >= OT_OVERRIDE_REASON_MIN);
  }
  if (confirm) confirm.disabled = !(hasChoice && len >= OT_OVERRIDE_REASON_MIN);
}

function _openOtOverrideModal(assignmentId) {
  _otOverrideId = assignmentId;
  closeDetailModal(); // Option A — no stacked modals

  const a = assignments.find(x => x.id === assignmentId);
  const wt = a ? computeWorkTime(a, getOfficeHours()) : null;
  const ctx = document.getElementById('otOverrideContext');
  if (ctx) {
    const det = wt && wt.detectionStatus === 'AUTO_LEMBUR' ? 'Lembur' : 'Normal';
    const fin = wt && wt.finalStatus === 'LEMBUR' ? 'Lembur' : 'Normal';
    ctx.textContent = `Deteksi Sistem: ${det}. Status Akhir saat ini: ${fin}. `
      + 'Override mengubah hasil administratif (analitik & form reimbursement mengikuti status akhir). Deteksi sistem tetap tersimpan untuk audit.';
  }
  // Reset form, preselect the current final status to make the change explicit.
  document.querySelectorAll('input[name="otOverrideChoice"]').forEach(r => {
    r.checked = wt && wt.finalStatus === r.value;
  });
  const input = document.getElementById('otOverrideReason');
  if (input) input.value = '';
  _syncOtOverrideState();

  const modal = document.getElementById('modalOvertimeOverride');
  if (modal) modal.style.display = 'flex';
  setTimeout(() => { if (input) input.focus(); }, 80);
}

function _closeOtOverrideModal(reopenDetail = false) {
  const modal = document.getElementById('modalOvertimeOverride');
  if (modal) modal.style.display = 'none';
  const reopenId = _otOverrideId;
  _otOverrideId = null;
  if (reopenDetail && reopenId) openDetailModal(reopenId);
}

function _handleOtOverrideConfirm() {
  const input  = document.getElementById('otOverrideReason');
  const reason = input ? String(input.value).trim() : '';
  const choice = _selectedOtChoice();
  if (reason.length < OT_OVERRIDE_REASON_MIN || (choice !== 'NORMAL' && choice !== 'LEMBUR')) {
    _syncOtOverrideState();
    return;
  }
  const id = _otOverrideId;
  _closeOtOverrideModal(false);
  if (id && onOvertimeOverrideCallback) onOvertimeOverrideCallback(id, choice, reason);
}

/** Boot-time wiring for the 4 satellite legacy modals only — unchanged,
 *  static DOM, bound once. Assignment Detail's own interactive elements are
 *  wired per-open by _wireDetailHandlers(), since that DOM is now created
 *  fresh on every openDetailModal() call (same lifecycle every other drawer
 *  consumer already uses) rather than existing permanently from boot. */
export function initModalHandlers() {
  // Odometer modal handlers
  // Close/Cancel → reopen detail drawer so user doesn't lose context
  document.getElementById('btnCloseOdometer')?.addEventListener('click',  () => _closeOdometerModal(true));
  document.getElementById('btnCancelOdometer')?.addEventListener('click', () => _closeOdometerModal(true));
  document.getElementById('btnConfirmOdometer')?.addEventListener('click', _handleOdometerConfirm);
  document.getElementById('odoInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter')  _handleOdometerConfirm();
    if (e.key === 'Escape') _closeOdometerModal(true);
  });
  // Live preview while typing (Complete mode); confirm-state gate (both modes)
  document.getElementById('odoInput')?.addEventListener('input', _updateOdometerPreview);
  // v1.30.14.3 — Start "Koreksi odometer" override + its mandatory reason; and
  // the Complete suspicious-distance acknowledgement.
  document.getElementById('btnOdoCorrect')?.addEventListener('click', _onOdoCorrectClick);
  document.getElementById('odoCorrectReason')?.addEventListener('input', _syncOdoConfirmState);
  document.getElementById('odoSanityAck')?.addEventListener('change', _syncOdoConfirmState);
  document.getElementById('modalOdometer')?.addEventListener('click', (e) => {
    if (e.target === document.getElementById('modalOdometer')) _closeOdometerModal(true);
  });

  // Cancellation modal: Kembali reopens detail; Konfirmasi performs the cancel
  document.getElementById('btnCloseCancel')?.addEventListener('click',  () => _closeCancelModal(true));
  document.getElementById('btnBackCancel')?.addEventListener('click',   () => _closeCancelModal(true));
  document.getElementById('btnConfirmCancel')?.addEventListener('click', _handleCancelConfirm);
  document.getElementById('cancelReasonInput')?.addEventListener('input', _syncCancelConfirmState);
  document.getElementById('modalCancel')?.addEventListener('click', (e) => {
    if (e.target === document.getElementById('modalCancel')) _closeCancelModal(true);
  });

  // Overtime override (v1.16.4.9) — admin opens the force-status dialog.
  document.getElementById('btnCloseOtOverride')?.addEventListener('click', () => _closeOtOverrideModal(true));
  document.getElementById('btnBackOtOverride')?.addEventListener('click',  () => _closeOtOverrideModal(true));
  document.getElementById('btnConfirmOtOverride')?.addEventListener('click', _handleOtOverrideConfirm);
  document.getElementById('otOverrideReason')?.addEventListener('input', _syncOtOverrideState);
  document.getElementById('otOverrideChoices')?.addEventListener('change', _syncOtOverrideState);
  document.getElementById('modalOvertimeOverride')?.addEventListener('click', (e) => {
    if (e.target === document.getElementById('modalOvertimeOverride')) _closeOtOverrideModal(true);
  });
}

/** Assignment Detail's own body content — one combined HTML string covering
 *  all 6 accordion sections + primary/secondary action bars, a direct port
 *  of the former static index.html markup (same ids/classes throughout, so
 *  updateDetailActionButtons() below needs zero logic changes). */
function _buildDetailBodyHtml(a, status, statusLabel) {
  const odoRows = buildOdoRows(a);
  return `
    <div class="accord-section accord-section--open" id="accordSummary">
      <button class="accord-header" type="button" aria-expanded="true">
        <span class="accord-title">Ringkasan Jadwal</span>
        <span class="accord-chevron">${anIcon('chevR', { size: 12 })}</span>
      </button>
      <div class="accord-body">
        <div class="accord-body-inner" id="detailSummary">
          <div class="detail-row">
            <span class="detail-label">Status</span>
            <span class="detail-value"><span class="badge-status badge-status--${status}">${escapeHTML(statusLabel)}</span></span>
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
            <span class="detail-value"><span class="vehicle-badge" style="background:${getVehicleColor(a.vehicle)}">${escapeHTML(vehicleLabel(a.vehicle))}</span></span>
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
        </div>
      </div>
    </div>

    <div class="detail-actions-primary" id="detailActionsPrimary">
      <button class="btn-primary" id="btnStartAssignment" data-drawer-action="start">${anIcon('chevR', { size: 14 })} Mulai Tugas</button>
      <button class="btn-success" id="btnCompleteAssignment" data-drawer-action="complete">${anIcon('check', { size: 14 })} Selesaikan</button>
      <button class="btn-secondary" id="btnCommentThread" data-drawer-action="comment" style="display:none;">${anIcon('comment', { size: 14 })} Komentar</button>
      <button class="btn-danger" id="btnCancelAssignment" data-drawer-action="cancel" style="display:none;">${anIcon('x', { size: 14 })} Batalkan</button>
      <button class="btn-secondary" id="btnOverrideOvertime" data-drawer-action="override" style="display:none;">${anIcon('history', { size: 14 })} Override Lembur</button>
    </div>

    <div class="accord-section" id="accordExtra">
      <button class="accord-header" type="button" aria-expanded="false">
        <span class="accord-title">Detail Tambahan</span>
        <span class="accord-chevron">${anIcon('chevR', { size: 12 })}</span>
      </button>
      <div class="accord-body">
        <div class="accord-body-inner" id="detailExtra">
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
        </div>
      </div>
    </div>

    <div class="accord-section" id="accordOps">
      <button class="accord-header" type="button" aria-expanded="false">
        <span class="accord-title">Informasi Operasional</span>
        <span class="accord-chevron">${anIcon('chevR', { size: 12 })}</span>
      </button>
      <div class="accord-body">
        <div class="accord-body-inner" id="detailOps">${buildOpsRows(a) || '<p class="detail-empty">Belum ada informasi operasional.</p>'}</div>
      </div>
    </div>

    <div class="accord-section${odoRows ? '' : ' accord-section--hidden'}" id="accordOdo">
      <button class="accord-header" type="button" aria-expanded="false">
        <span class="accord-title">Odometer</span>
        <span class="accord-chevron">${anIcon('chevR', { size: 12 })}</span>
      </button>
      <div class="accord-body">
        <div class="accord-body-inner" id="detailOdo">${odoRows}</div>
      </div>
    </div>

    <div class="accord-section" id="accordWA">
      <button class="accord-header" type="button" aria-expanded="false">
        <span class="accord-title">${anIcon('comment', { size: 14 })} Ringkasan WhatsApp</span>
        <span class="accord-chevron">${anIcon('chevR', { size: 12 })}</span>
      </button>
      <div class="accord-body">
        <div class="accord-body-inner">
          <pre id="waPreviewText" class="wa-preview-text">${escapeHTML(generateWAText(a))}</pre>
          <button class="btn-wa-copy" id="btnCopyWA" data-drawer-action="copyWA">${anIcon('copy', { size: 14 })} Copy Ringkasan WhatsApp</button>
          <span class="copy-feedback" id="copyFeedback" style="display:none;">${anIcon('check', { size: 13 })} Tersalin!</span>
        </div>
      </div>
    </div>

    <div class="accord-section" id="accordReimbursement">
      <button class="accord-header" type="button" aria-expanded="false">
        <span class="accord-title">${anIcon('file', { size: 14 })} Form Reimbursement</span>
        <span class="accord-chevron">${anIcon('chevR', { size: 12 })}</span>
      </button>
      <div class="accord-body">
        <div class="accord-body-inner">
          <p class="reimbursement-hint">Buka Form Reimbursement dalam viewer terintegrasi. Mendukung Preview, Download PDF, Print, dan Share langsung dari aplikasi — tanpa popup.</p>
          <button class="btn-reimbursement" id="btnPrintReimbursement" data-drawer-action="reimbursement">${anIcon('file', { size: 14 })} Generate Form Reimbursement</button>
        </div>
      </div>
    </div>

    <div class="detail-actions">
      <button class="btn-danger" id="btnDeleteAssignment" data-drawer-action="delete">${anIcon('trash', { size: 14 })} Hapus</button>
      <button class="btn-secondary" id="btnEditAssignment" data-drawer-action="edit">${anIcon('edit', { size: 14 })} Edit</button>
      <button class="btn-secondary" id="btnCloseDetail2" data-drawer-action="close">Tutup</button>
    </div>`;
}

/** Wires every interactive element inside the just-opened drawer. Bound
 *  fresh per open() call (the whole subtree is destroyed on close, same
 *  lifecycle every other drawer consumer already uses) — mirrors exactly
 *  the button-by-button logic that used to live in initModalHandlers(),
 *  relocated rather than rewritten. */
function _wireDetailHandlers(root) {
  root.querySelectorAll('.accord-header').forEach(btn => {
    btn.addEventListener('click', () => {
      const section = btn.closest('.accord-section');
      if (!section) return;
      const isOpen = section.classList.contains('accord-section--open');
      section.classList.toggle('accord-section--open', !isOpen);
      btn.setAttribute('aria-expanded', String(!isOpen));
    });
  });

  root.querySelector('[data-drawer-action="close"]')?.addEventListener('click', closeDetailModal);

  root.querySelector('[data-drawer-action="edit"]')?.addEventListener('click', () => {
    if (!hasPermission('edit')) { showToast('Anda tidak punya akses untuk mengedit jadwal'); return; }
    const editId = viewingId;
    closeDetailModal();
    setTimeout(() => { if (onEditCallback) onEditCallback(editId); }, 50);
  });

  root.querySelector('[data-drawer-action="delete"]')?.addEventListener('click', () => {
    if (requestDeleteAssignment(viewingId)) closeDetailModal();
  });

  root.querySelector('[data-drawer-action="start"]')?.addEventListener('click', () => {
    const a = assignments.find(x => x.id === viewingId);
    if (!canActOnAssignment('start', a)) { showToast('Hanya Admin atau Driver yang ditugaskan yang bisa memulai'); return; }
    const status = normalizeStatus(a?.status);
    if (status === 'started')   { showToast('Penugasan sudah dimulai'); return; }
    if (status === 'completed') { showToast('Penugasan sudah selesai'); return; }
    // v1.15.6: "Tanpa Kendaraan" (vehicle === '') has no odometer — start
    // directly (Scheduled → In Progress), leaving startOdometer null.
    if (!a || !a.vehicle) {
      if (onStartCallback) onStartCallback(viewingId, {}, a);
      closeDetailModal();
      return;
    }
    _openOdometerModal('start', viewingId, a, (assignmentId, odoData, assignment) => {
      if (onStartCallback) onStartCallback(assignmentId, odoData, assignment);
      closeDetailModal();
    });
  });

  root.querySelector('[data-drawer-action="complete"]')?.addEventListener('click', () => {
    const a = assignments.find(x => x.id === viewingId);
    if (!canActOnAssignment('complete', a)) { showToast('Hanya Admin atau Driver yang ditugaskan yang bisa menyelesaikan'); return; }
    const status = normalizeStatus(a?.status);
    if (status === 'completed') { showToast('Penugasan sudah selesai'); return; }
    // v1.15.6: "Tanpa Kendaraan" (vehicle === '') has no odometer — complete
    // directly (In Progress → Completed), leaving endOdometer/distance null.
    if (!a || !a.vehicle) {
      if (onCompleteCallback) onCompleteCallback(viewingId, {}, a);
      closeDetailModal();
      return;
    }
    _openOdometerModal('complete', viewingId, a, (assignmentId, odoData, assignment) => {
      if (onCompleteCallback) onCompleteCallback(assignmentId, odoData, assignment);
      closeDetailModal();
    });
  });

  root.querySelector('[data-drawer-action="cancel"]')?.addEventListener('click', () => {
    const a = assignments.find(x => x.id === viewingId);
    if (!canCancelAssignment(a)) { showToast('Anda tidak dapat membatalkan assignment ini'); return; }
    _openCancelModal(viewingId);
  });

  root.querySelector('[data-drawer-action="override"]')?.addEventListener('click', () => {
    if (!hasPermission('override_overtime')) { showToast('Hanya admin yang bisa override status lembur'); return; }
    const a = assignments.find(x => x.id === viewingId);
    if (normalizeStatus(a?.status) !== 'completed') { showToast('Override hanya untuk penugasan yang sudah selesai'); return; }
    _openOtOverrideModal(viewingId);
  });

  root.querySelector('[data-drawer-action="comment"]')?.addEventListener('click', () => {
    const a = assignments.find(x => x.id === viewingId);
    if (a?.requestId && onCommentCallback) {
      closeDetailModal();
      setTimeout(() => onCommentCallback(a.requestId), 50);
    }
  });

  root.querySelector('[data-drawer-action="copyWA"]')?.addEventListener('click', copyWAText);

  // Print Reimbursement Form — async: acquires sequential doc number before opening window
  root.querySelector('[data-drawer-action="reimbursement"]')?.addEventListener('click', async () => {
    const a = assignments.find(x => x.id === viewingId);
    if (!a) return;
    // Hotfix: this handler previously only checked `if (!a) return` — the
    // accordion's visibility already gated role (print_reimbursement:
    // admin/driver), but the handler itself never checked OWNERSHIP, and
    // `assignments` here is the full unfiltered list (every driver's trips),
    // not the driver-scoped one the dashboard renders. Any driver who could
    // reach a different assignment's id (a different list view, or editing
    // client-side state) could generate ANY driver's reimbursement. Mirrors
    // canActOnAssignment's existing admin-bypass/driver-owns-it pattern
    // already used for Start/Complete/Cancel on this same assignment.
    const user = getCurrentUser();
    const ownsIt = !!user && (user.role === 'admin' || (user.role === 'driver' && assignmentBelongsToDriver(a, user)));
    if (!hasPermission('print_reimbursement') || !ownsIt) {
      showToast('Anda tidak memiliki akses ke reimbursement penugasan ini');
      return;
    }
    const btn = root.querySelector('[data-drawer-action="reimbursement"]');
    if (btn) { btn.disabled = true; btn.textContent = 'Memproses...'; }
    try {
      await printReimbursementForm(a);
    } catch (err) {
      // Server-side rejection (functions/reimbursement/counter.js) — the
      // authoritative boundary behind the client-side ownsIt check above.
      // Reachable if that check is ever bypassed (a stale/modified client),
      // so it needs its own real message, not a silent unhandled rejection.
      if (err && (err.code === 'functions/permission-denied' || err.code === 'functions/not-found')) {
        showToast('Anda tidak memiliki akses ke reimbursement penugasan ini');
      } else {
        throw err;
      }
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = `${anIcon('file', { size: 14 })} Generate Form Reimbursement`; }
    }
  });
}

export function openDetailModal(id, { sourceEl = null } = {}) {
  const a = assignments.find(x => x.id === id);
  if (!a) return;

  viewingId = id;
  const status = normalizeStatus(a.status);
  const statusLabel = STATUS_LABELS[status] || status;

  const overlay = openDrawer({
    title: 'Detail Jadwal',
    icon: 'car',
    body: _buildDetailBodyHtml(a, status, statusLabel),
    sourceEl,
    onClose: () => { viewingId = null; },
  });
  if (!overlay) return;

  _wireDetailHandlers(overlay);
  updateDetailActionButtons();
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

  // Overtime status (v1.16.4.9) — system detection vs. administrative final.
  rows.push(buildOvertimeRows(a));

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

/**
 * Overtime status rows (v1.16.4.9 — Overtime Administration). Shown only once
 * the assignment is completed (detection needs actual start/end). Surfaces the
 * SYSTEM detection ("Deteksi Sistem") and the administrative FINAL status
 * ("Status Akhir") side by side, plus the override audit (who/when/why) when the
 * final status was set manually. Returns '' for non-completed/legacy records.
 */
function buildOvertimeRows(a) {
  const wt = computeWorkTime(a, getOfficeHours());
  if (!wt.hasCompleted || !wt.finalStatus) return '';

  const lbl = (s) => (s === 'LEMBUR' ? 'Lembur' : 'Normal');
  const badge = (s) => {
    const lembur = s === 'LEMBUR';
    const bg = lembur ? '#a9781a' : '#2f7d5b';
    return `<span style="display:inline-block;padding:2px 9px;border-radius:999px;font-size:11.5px;font-weight:800;color:#fff;background:${bg}">${lbl(s)}</span>`;
  };

  const detection = wt.detectionStatus === 'AUTO_LEMBUR' ? 'LEMBUR' : 'NORMAL';
  const isManual = wt.overtimeSource === 'MANUAL';
  const rows = [`
    <div class="detail-row">
      <span class="detail-label">Deteksi Sistem</span>
      <span class="detail-value">${badge(detection)}</span>
    </div>
    <div class="detail-row">
      <span class="detail-label">Status Akhir</span>
      <span class="detail-value">${badge(wt.finalStatus)}${isManual ? ' <span class="detail-ts">(Override Admin)</span>' : ''}</span>
    </div>`];

  if (isManual) {
    const byName = a.overtimeOverriddenBy?.name || a.overtimeOverriddenBy || '-';
    rows.push(`
      <div class="detail-row">
        <span class="detail-label">Override oleh</span>
        <span class="detail-value">${escapeHTML(String(byName))}${a.overtimeOverriddenAt ? ` <span class="detail-ts">${formatDateTime(a.overtimeOverriddenAt)}</span>` : ''}</span>
      </div>`);
    if (a.overtimeOverrideReason) {
      rows.push(`
      <div class="detail-row">
        <span class="detail-label">Alasan Override</span>
        <span class="detail-value">${escapeHTML(a.overtimeOverrideReason)}</span>
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

export function closeDetailModal() {
  closeDrawer();
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

  // Overtime override (v1.16.4.9) — admin only, and only once the assignment is
  // completed (the detection that gets overridden needs actual start/end).
  const btnOverride = document.getElementById('btnOverrideOvertime');
  if (btnOverride) {
    const showOverride = hasPermission('override_overtime') && status === 'completed';
    btnOverride.style.display = showOverride ? '' : 'none';
    btnOverride.disabled = false;
    btnOverride.title = 'Override status lembur (Paksa Normal / Paksa Lembur)';
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
🚗: ${vehicleLabel(a.vehicle)}
${picStr}
Driver: ${vehicleLabel(a.vehicle)} @${a.driver} PBSI${a.notes ? `\nCatatan: ${a.notes}` : ''}`;
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
