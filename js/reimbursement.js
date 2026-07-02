/* ============================================================
   REIMBURSEMENT.JS — Form Reimbursement Generator  (v2.0)

   Now the first production consumer of the Document Generation
   Framework (js/docs/*). This module owns only DOMAIN LOGIC:
   overtime calculation, requester resolution, plate lookup,
   sequential doc-number acquisition, and building a presentation-
   agnostic view model. Rendering, preview, print, download, and
   share are delegated to DocumentEngine.

   The PDF is computed in pure JS (pdfmake) from a declarative
   template — deterministic across Desktop, Android, iPhone, PWA.

   Removed in v2.0 (replaced by the framework):
   - html2canvas raster path
   - jsPDF assembly path
   - iframe + window.print() path
   - viewport zoom-scaling path
   - self-contained HTML string generator
   ============================================================ */

'use strict';

import { getVehicles }                    from './vehicles-store.js';
import { parseLocalDate, vehicleLabel, computeWorkTime } from './utils.js';
import { acquireReimbursementDocNumber }  from './firebase.js';
import { getSetting }                     from './settings-store.js';
import * as DocumentEngine                from './docs/doc-engine.js';
import './docs/templates/reimbursement.js';   // side-effect: registers 'reimbursement'

/* ── Overtime Boundaries (schedule-based fallback only) ── */
const WORK_START_MINS = 9  * 60;   // 09:00
const WORK_END_MINS   = 17 * 60;   // 17:00

/** Live office-hours window for the actual-based overtime final status. */
function getOfficeHours() {
  return {
    workStartMins: getSetting('operations.workStartMins'),
    workEndMins:   getSetting('operations.workEndMins'),
  };
}

/* ────────────────────────────────────────────────────────────
   DOMAIN HELPERS
   ──────────────────────────────────────────────────────────── */

/**
 * Determine overtime status from assignment time fields.
 * OVERTIME when: fullDay flag set, departure before 09:00,
 * or arrival after 17:00.  Returns 'NORMAL' or 'OVERTIME'.
 */
export function calculateOvertimeStatus(startTime, endTime, fullDay) {
  if (fullDay) return 'OVERTIME';
  if (!startTime || !endTime) return 'NORMAL';

  const [sh = 0, sm = 0] = startTime.split(':').map(Number);
  const [eh = 0, em = 0] = endTime.split(':').map(Number);
  const startMins = sh * 60 + sm;
  const endMins   = eh * 60 + em;

  return (startMins < WORK_START_MINS || endMins > WORK_END_MINS)
    ? 'OVERTIME'
    : 'NORMAL';
}

/** Returns { label, value } for the requester / PIC row. */
function getRequesterInfo(a) {
  if (a.requestId && a.createdBy) return { label: 'Bidang Requester', value: a.createdBy };
  if (a.pic)                      return { label: 'PIC',              value: a.pic       };
  if (a.createdBy)                return { label: 'Dibuat Oleh',      value: a.createdBy };
  return { label: 'PIC / Requester', value: '—' };
}

/**
 * Format an operational-timestamp ISO string as local HH:MM, or null when it
 * is absent/unparseable. Actuals are stored as `startedAt`/`completedAt`
 * (ISO) — the same ground-truth fields the timeline renders (timeline.js) and
 * computeWorkTime consumes; this mirrors their local-time reading.
 */
function isoToClock(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** License plate for a vehicle, or '-' when not yet configured. */
function getVehiclePlate(vehicleName) {
  const v = getVehicles().find(veh => veh.name === vehicleName);
  return v?.plateNumber || '-';
}

/** Format assignment ID as a human-readable reference (ASG-YYYYMMDD-XXXXXX). */
function formatAssignmentRef(a) {
  const dateStr = (a.date || '').replace(/-/g, '');
  const suffix  = String(a.id || '').slice(-6).toUpperCase();
  return dateStr ? `ASG-${dateStr}-${suffix}` : (a.id || '—');
}

/**
 * Build the presentation-agnostic view model consumed by the
 * reimbursement template. No layout decisions here — just data.
 */
function buildViewModel(a, docNumber) {
  const dateObj = parseLocalDate(a.date);
  const dateStr = dateObj.toLocaleDateString('id-ID', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
  const printDate = new Date().toLocaleDateString('id-ID', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  // Overtime status (v1.16.4.9): once the assignment is completed, the form
  // follows the ADMINISTRATIVE FINAL status (system detection + any admin
  // override) — so a "Paksa Normal" override disables the Lembur claim and a
  // "Paksa Lembur" override enables it, with no manual re-entry. For not-yet-
  // completed assignments (no actuals) it falls back to the legacy schedule-
  // based estimate so the form still prints sensibly. Backward compatible.
  const wt = computeWorkTime(a, getOfficeHours());
  const isOT = (wt.hasCompleted && wt.finalStatus)
    ? wt.finalStatus === 'LEMBUR'
    : calculateOvertimeStatus(a.startTime, a.endTime, a.fullDay) === 'OVERTIME';
  const isOverride = wt.hasCompleted && wt.overtimeSource === 'MANUAL';

  const fmtOdo = v => (v != null ? `${Number(v).toLocaleString('id-ID')} km` : '—');
  const requester = getRequesterInfo(a);

  // Operational times (v1.18.8.5): a reimbursement is an operational document,
  // so departure/return must show what ACTUALLY happened, not the plan.
  // Resolution mirrors the timeline (timeline.js): prefer the actual
  // ground-truth timestamps (startedAt/completedAt → local HH:MM), fall back to
  // the planned window (fullDay sentinel or startTime/endTime) when a trip has
  // no actuals yet. Fully backward compatible — records without actuals print
  // exactly as before.
  const actualStart = isoToClock(a.startedAt);
  const actualEnd   = isoToClock(a.completedAt);
  const plannedStart = a.fullDay ? '00:00' : (a.startTime || null);
  const plannedEnd   = a.fullDay ? '23:59' : (a.endTime   || null);
  const startT = actualStart || plannedStart || '—';
  const endT   = actualEnd   || plannedEnd   || '—';
  // The "(Penuh Hari)" annotation describes a PLANNED full-day booking; once a
  // concrete actual window is shown it no longer applies, so suppress it as
  // soon as either side resolves to an actual time.
  const fullDayLabel = !!a.fullDay && !actualStart && !actualEnd;

  return {
    docNumber,
    assignmentRef: formatAssignmentRef(a),
    printDate,
    rawDate: a.date || '',

    driver:         a.driver || '—',
    requesterLabel: requester.label,
    requesterValue: requester.value,
    purpose:        a.purpose || '—',
    destination:    a.destination || '',
    dateStr,
    vehicle:        vehicleLabel(a.vehicle),   // v1.15.6: '' → "Tanpa Kendaraan"
    vehiclePlate:   getVehiclePlate(a.vehicle),

    startT,
    endT,
    fullDay: fullDayLabel,
    pax:     a.pax ?? 0,

    startOdo: fmtOdo(a.startOdometer),
    endOdo:   fmtOdo(a.endOdometer),
    distance: fmtOdo(a.distanceTravelled),

    isOT,
    otLabel: isOT ? 'LEMBUR' : 'NORMAL',
    otDesc:  isOverride
      ? `Ditetapkan administratif (override admin)${wt.overtimeOverrideReason ? ` — ${wt.overtimeOverrideReason}` : ''}`
      : (isOT
          ? 'Di luar jam operasional (09:00 – 17:00)'
          : 'Dalam jam operasional (09:00 – 17:00)'),
  };
}

/* ────────────────────────────────────────────────────────────
   PUBLIC API  (unchanged signatures)
   ──────────────────────────────────────────────────────────── */

/**
 * Generate and open the reimbursement form for an assignment.
 * Acquires a sequential document number, builds the view model,
 * then hands off to the Document Engine (preview + print + PDF).
 *
 * @param {Object} assignment
 * @returns {Promise<void>}
 */
export async function printReimbursementForm(assignment) {
  const docNumber = await acquireReimbursementDocNumber(assignment.date);
  const vm = buildViewModel(assignment, docNumber);
  await DocumentEngine.generateAndOpen('reimbursement', vm, {
    viewer: {
      title: `Form Reimbursement — ${vm.driver}`,
      shareText: `Form Reimbursement – ${vm.driver} – ${assignment.date || ''}`,
    },
  });
}

/** Close the document viewer (delegates to the framework). */
export function closePdfViewer() {
  DocumentEngine.closeViewer();
}
